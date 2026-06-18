use std::hash::poseidon2_permutation;

fn main(
    // === PUBLIC INPUTS ===
    commitment: pub Field,
    current_time: pub u64,
    withdraw_amount: pub u64,
    nullifier_hash: pub Field,
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

    // 3. Streaming Math Logic
    assert(current_time >= start_time);
    let elapsed_time = current_time - start_time;
    let total_vested = elapsed_time * salary_rate;

    // Prove sufficient vested funds
    assert(total_vested >= withdraw_amount);
}

// --- Your main function stays here ---

#[test]
fn test_valid_streaming_claim() {
    // 1. Setup mock secret and parameters
    let secret = 42;
    let salary_rate = 10; // 10 USDC per second
    let start_time = 1000;

    // Calculate expected commitment off-chain/in-test using the same function
    // Match the BN254 state alignment constraint [secret, rate, start, 0]
    let state_commitment =
        poseidon2_permutation([secret, salary_rate as Field, start_time as Field, 0]);
    let commitment = state_commitment[0];

    // 2. Simulate forward time
    let current_time = 1100; // 100 seconds have elapsed
    let withdraw_amount = 1000; // 100 * 10 = 1000 vested exactly

    // Pre-calculate anti-replay nullifier
    let state_nullifier = poseidon2_permutation([secret, current_time as Field, 0, 0]);
    let nullifier_hash = state_nullifier[0];

    // 3. Execute circuit
    main(
        commitment,
        current_time,
        withdraw_amount,
        nullifier_hash,
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

    let current_time = 1100; // 100 seconds elapsed -> 1000 vested
    let withdraw_amount = 1001; // Attempting to steal 1 extra USDC

    let state_nullifier = poseidon2_permutation([secret, current_time as Field, 0, 0]);
    let nullifier_hash = state_nullifier[0];

    // This should fail streaming logic: assert(total_vested >= withdraw_amount)
    main(
        commitment,
        current_time,
        withdraw_amount,
        nullifier_hash,
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

    // Commitment generated with real secret
    let state_commitment =
        poseidon2_permutation([secret, salary_rate as Field, start_time as Field, 0]);
    let commitment = state_commitment[0];

    let current_time = 1100;
    let withdraw_amount = 500;

    let state_nullifier = poseidon2_permutation([malicious_secret, current_time as Field, 0, 0]);
    let nullifier_hash = state_nullifier[0];

    // This should fail identity constraint: assert(state_commitment[0] == commitment)
    main(
        commitment,
        current_time,
        withdraw_amount,
        nullifier_hash,
        malicious_secret,
        salary_rate,
        start_time,
    );
}
