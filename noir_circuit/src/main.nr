use std::hash::poseidon2_permutation;

// StreamZero withdrawal circuit.
//
// Public inputs (order is load-bearing — the Soroban `claim` entrypoint builds
// its public-input vector in exactly this order):
//   [ commitment, current_time, withdraw_amount, nullifier_hash,
//     already_withdrawn, recipient ]
fn main(
    // === PUBLIC INPUTS ===
    commitment: pub Field,
    current_time: pub u64,
    withdraw_amount: pub u64,
    nullifier_hash: pub Field,
    // Amount already withdrawn from this stream so far. The contract supplies
    // its on-chain `stream.withdrawn`, binding the proof to the current state:
    // a stale/replayed proof carries an old value and fails verification.
    already_withdrawn: pub u64,
    // Hash of the payout address (see contract: sha256(strkey) reduced mod r).
    // Binding it prevents a pending proof from being front-run to a different
    // recipient.
    recipient: pub Field,
    // === PRIVATE INPUTS ===
    secret: Field,
    salary_rate: u64,
    start_time: u64,
) {
    // 1. Identity Check
    // We pad the input array with a 0 to reach the required length of 4
    let state_commitment =
        poseidon2_permutation([secret, salary_rate as Field, start_time as Field, 0]);
    let computed_commitment = state_commitment[0];
    assert(computed_commitment == commitment);

    // 2. Anti-Replay Mechanism (Nullifier)
    // Same here: pad with two zeros to reach the required length of 4
    let state_nullifier = poseidon2_permutation([secret, current_time as Field, 0, 0]);
    let computed_nullifier = state_nullifier[0];
    assert(computed_nullifier == nullifier_hash);

    // 3. Anti-front-running: bind the recipient.
    // `!= 0` is a genuine constraint on the signal, so the compiler keeps it in
    // the constraint system (an unconstrained public input could be optimised
    // out, breaking the binding). A real recipient hash is never zero.
    assert(recipient != 0);

    // 4. Streaming Math Logic with cumulative tracking.
    assert(current_time >= start_time);
    let elapsed_time = current_time - start_time;
    let total_vested = elapsed_time * salary_rate;

    // Prove the total claimed across the stream's lifetime never exceeds what
    // has vested: already-withdrawn plus this withdrawal.
    assert(total_vested >= already_withdrawn + withdraw_amount);
}

// --- Tests ---

#[test]
fn test_valid_streaming_claim() {
    let secret = 42;
    let salary_rate = 10; // 10 USDC per second
    let start_time = 1000;

    let state_commitment =
        poseidon2_permutation([secret, salary_rate as Field, start_time as Field, 0]);
    let commitment = state_commitment[0];

    let current_time = 1100; // 100 seconds elapsed
    let withdraw_amount = 1000; // 100 * 10 = 1000 vested exactly
    let already_withdrawn = 0;
    let recipient = 0x1234abcd;

    let state_nullifier = poseidon2_permutation([secret, current_time as Field, 0, 0]);
    let nullifier_hash = state_nullifier[0];

    main(
        commitment,
        current_time,
        withdraw_amount,
        nullifier_hash,
        already_withdrawn,
        recipient,
        secret,
        salary_rate,
        start_time,
    );
}

#[test]
fn test_valid_partial_after_prior_withdrawal() {
    // 600 already withdrawn, claiming 400 more of 1000 vested -> exactly at cap.
    let secret = 42;
    let salary_rate = 10;
    let start_time = 1000;

    let state_commitment =
        poseidon2_permutation([secret, salary_rate as Field, start_time as Field, 0]);
    let commitment = state_commitment[0];

    let current_time = 1100; // 1000 vested
    let withdraw_amount = 400;
    let already_withdrawn = 600;
    let recipient = 0x1234abcd;

    let state_nullifier = poseidon2_permutation([secret, current_time as Field, 0, 0]);
    let nullifier_hash = state_nullifier[0];

    main(
        commitment,
        current_time,
        withdraw_amount,
        nullifier_hash,
        already_withdrawn,
        recipient,
        secret,
        salary_rate,
        start_time,
    );
}

#[test(should_fail)]
fn test_fail_over_withdraw() {
    let secret = 42;
    let salary_rate = 10;
    let start_time = 1000;

    let state_commitment =
        poseidon2_permutation([secret, salary_rate as Field, start_time as Field, 0]);
    let commitment = state_commitment[0];

    let current_time = 1100; // 1000 vested
    let withdraw_amount = 1001; // attempting to steal 1 extra
    let already_withdrawn = 0;
    let recipient = 0x1234abcd;

    let state_nullifier = poseidon2_permutation([secret, current_time as Field, 0, 0]);
    let nullifier_hash = state_nullifier[0];

    main(
        commitment,
        current_time,
        withdraw_amount,
        nullifier_hash,
        already_withdrawn,
        recipient,
        secret,
        salary_rate,
        start_time,
    );
}

#[test(should_fail)]
fn test_fail_cumulative_over_withdraw() {
    // 600 already withdrawn, trying to take 500 more of only 1000 vested.
    let secret = 42;
    let salary_rate = 10;
    let start_time = 1000;

    let state_commitment =
        poseidon2_permutation([secret, salary_rate as Field, start_time as Field, 0]);
    let commitment = state_commitment[0];

    let current_time = 1100; // 1000 vested
    let withdraw_amount = 500; // 600 + 500 > 1000
    let already_withdrawn = 600;
    let recipient = 0x1234abcd;

    let state_nullifier = poseidon2_permutation([secret, current_time as Field, 0, 0]);
    let nullifier_hash = state_nullifier[0];

    main(
        commitment,
        current_time,
        withdraw_amount,
        nullifier_hash,
        already_withdrawn,
        recipient,
        secret,
        salary_rate,
        start_time,
    );
}

#[test(should_fail)]
fn test_fail_invalid_secret() {
    let secret = 42;
    let malicious_secret = 666;
    let salary_rate = 10;
    let start_time = 1000;

    let state_commitment =
        poseidon2_permutation([secret, salary_rate as Field, start_time as Field, 0]);
    let commitment = state_commitment[0];

    let current_time = 1100;
    let withdraw_amount = 500;
    let already_withdrawn = 0;
    let recipient = 0x1234abcd;

    let state_nullifier = poseidon2_permutation([malicious_secret, current_time as Field, 0, 0]);
    let nullifier_hash = state_nullifier[0];

    main(
        commitment,
        current_time,
        withdraw_amount,
        nullifier_hash,
        already_withdrawn,
        recipient,
        malicious_secret,
        salary_rate,
        start_time,
    );
}

#[test(should_fail)]
fn test_fail_zero_recipient() {
    // A zero recipient hash is rejected (and never produced by sha256 of a real
    // address); this also documents that `recipient` is a hard constraint.
    let secret = 42;
    let salary_rate = 10;
    let start_time = 1000;

    let state_commitment =
        poseidon2_permutation([secret, salary_rate as Field, start_time as Field, 0]);
    let commitment = state_commitment[0];

    let current_time = 1100;
    let withdraw_amount = 1000;
    let already_withdrawn = 0;
    let recipient = 0;

    let state_nullifier = poseidon2_permutation([secret, current_time as Field, 0, 0]);
    let nullifier_hash = state_nullifier[0];

    main(
        commitment,
        current_time,
        withdraw_amount,
        nullifier_hash,
        already_withdrawn,
        recipient,
        secret,
        salary_rate,
        start_time,
    );
}
