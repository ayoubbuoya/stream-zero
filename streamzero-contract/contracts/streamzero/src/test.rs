#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::StellarAssetClient,
    Address, BytesN, Env, Vec as SVec,
};

// --- helpers ---------------------------------------------------------------

/// A structurally-sized but cryptographically meaningless verifying key. Fine
/// for tests that never reach pairing verification (the guard-path tests and
/// `create_stream`). Real proofs use the VK emitted by the trusted setup.
fn dummy_vk(env: &Env) -> VerifyingKey {
    let g1 = BytesN::from_array(env, &[0u8; 64]);
    let g2 = BytesN::from_array(env, &[0u8; 128]);
    // IC length == number of circuit public inputs (6) + 1.
    let mut ic: SVec<BytesN<64>> = SVec::new(env);
    for _ in 0..7 {
        ic.push_back(g1.clone());
    }
    VerifyingKey {
        alpha: g1.clone(),
        beta: g2.clone(),
        gamma: g2.clone(),
        delta: g2.clone(),
        ic,
    }
}

fn dummy_proof(env: &Env) -> Proof {
    Proof {
        a: BytesN::from_array(env, &[0u8; 64]),
        b: BytesN::from_array(env, &[0u8; 128]),
        c: BytesN::from_array(env, &[0u8; 64]),
    }
}

fn b32(env: &Env, tag: u8) -> BytesN<32> {
    let mut a = [0u8; 32];
    a[31] = tag;
    BytesN::from_array(env, &a)
}

struct Harness {
    env: Env,
    client: StreamZeroClient<'static>,
    token: StellarAssetClient<'static>,
    token_addr: Address,
    employer: Address,
}

fn setup() -> Harness {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let employer = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_addr = sac.address();
    let token = StellarAssetClient::new(&env, &token_addr);

    let contract_id = env.register(
        StreamZero,
        (admin.clone(), token_addr.clone(), dummy_vk(&env)),
    );
    let client = StreamZeroClient::new(&env, &contract_id);

    Harness {
        env,
        client,
        token,
        token_addr,
        employer,
    }
}

// --- tests -----------------------------------------------------------------

#[test]
fn test_constructor_sets_state() {
    let h = setup();
    assert_eq!(h.client.get_token(), Some(h.token_addr.clone()));
    assert!(h.client.get_admin().is_some());
}

#[test]
fn test_create_stream_moves_funds_and_records() {
    let h = setup();
    h.token.mint(&h.employer, &10_000);

    let commitment = b32(&h.env, 1);
    h.client.create_stream(&h.employer, &commitment, &5_000);

    // funds left the employer and entered the vault
    let vault = h.client.address.clone();
    let token_ro = soroban_sdk::token::TokenClient::new(&h.env, &h.token_addr);
    assert_eq!(token_ro.balance(&h.employer), 5_000);
    assert_eq!(token_ro.balance(&vault), 5_000);

    let stream = h.client.get_stream(&commitment).unwrap();
    assert_eq!(stream.deposit, 5_000);
    assert_eq!(stream.withdrawn, 0);
    assert_eq!(stream.employer, h.employer);
}

#[test]
fn test_create_stream_duplicate_commitment_fails() {
    let h = setup();
    h.token.mint(&h.employer, &10_000);
    let commitment = b32(&h.env, 7);

    h.client.create_stream(&h.employer, &commitment, &1_000);
    let err = h
        .client
        .try_create_stream(&h.employer, &commitment, &1_000)
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::StreamExists);
}

#[test]
fn test_create_stream_rejects_non_positive_amount() {
    let h = setup();
    let commitment = b32(&h.env, 3);
    let err = h
        .client
        .try_create_stream(&h.employer, &commitment, &0)
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::InvalidAmount);
}

#[test]
fn test_claim_unknown_stream_fails() {
    let h = setup();
    let commitment = b32(&h.env, 9);
    let nullifier = b32(&h.env, 99);
    let err = h
        .client
        .try_claim(
            &h.employer,
            &commitment,
            &1_000,
            &500,
            &nullifier,
            &dummy_proof(&h.env),
        )
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::StreamNotFound);
}

#[test]
fn test_claim_future_timestamp_fails_before_verification() {
    let h = setup();
    h.token.mint(&h.employer, &10_000);
    let commitment = b32(&h.env, 5);
    h.client.create_stream(&h.employer, &commitment, &5_000);

    h.env.ledger().set_timestamp(1_000);
    let nullifier = b32(&h.env, 55);

    // current_time (2_000) is in the future relative to ledger time (1_000):
    // this guard fires before the proof is ever checked, so the dummy proof
    // never reaches the pairing engine.
    let err = h
        .client
        .try_claim(
            &h.employer,
            &commitment,
            &2_000,
            &500,
            &nullifier,
            &dummy_proof(&h.env),
        )
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::TimestampInFuture);
}

#[test]
fn test_u64_to_fr_be_encoding() {
    let env = Env::default();
    let encoded = crate::u64_to_fr_be(&env, 0x0102_0304_0506_0708u64);
    let arr = encoded.to_array();
    // right-aligned big-endian, high 24 bytes zero
    assert_eq!(&arr[0..24], &[0u8; 24]);
    assert_eq!(
        &arr[24..32],
        &[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]
    );
}

// --- end-to-end: real Groth16/BN254 proof through the host functions --------

use crate::e2e_fixtures as fx;
use soroban_sdk::String as SString;

fn real_vk(env: &Env) -> VerifyingKey {
    let mut ic: SVec<BytesN<64>> = SVec::new(env);
    for entry in fx::VK_IC.iter() {
        ic.push_back(BytesN::from_array(env, entry));
    }
    VerifyingKey {
        alpha: BytesN::from_array(env, &fx::VK_ALPHA),
        beta: BytesN::from_array(env, &fx::VK_BETA),
        gamma: BytesN::from_array(env, &fx::VK_GAMMA),
        delta: BytesN::from_array(env, &fx::VK_DELTA),
        ic,
    }
}

fn real_proof(env: &Env) -> Proof {
    Proof {
        a: BytesN::from_array(env, &fx::PROOF_A),
        b: BytesN::from_array(env, &fx::PROOF_B),
        c: BytesN::from_array(env, &fx::PROOF_C),
    }
}

struct E2e {
    env: Env,
    client: StreamZeroClient<'static>,
    token: mock_stablecoin::MockStablecoinClient<'static>,
    recipient: Address,
}

/// Stands up a vault wired with the REAL verifying key + a funded stream whose
/// commitment matches the fixture proof. Uses the mock stablecoin (balance-map,
/// no trustline) so payout to the fixture's classic G-address works in-test.
fn setup_e2e() -> E2e {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let employer = Address::generate(&env);

    let token_id = env.register(mock_stablecoin::MockStablecoin, (admin.clone(),));
    let token = mock_stablecoin::MockStablecoinClient::new(&env, &token_id);

    let contract_id = env.register(StreamZero, (admin, token_id.clone(), real_vk(&env)));
    let client = StreamZeroClient::new(&env, &contract_id);

    // Fund the stream with the fixture commitment.
    token.mint(&employer, &10_000);
    let commitment = BytesN::from_array(&env, &fx::COMMITMENT);
    client.create_stream(&employer, &commitment, &1_000);

    // Bind ledger time so `current_time` is valid (<= now).
    env.ledger().set_timestamp(fx::CURRENT_TIME);

    let recipient = Address::from_string(&SString::from_str(&env, fx::RECIPIENT_STRKEY));
    E2e {
        env,
        client,
        token,
        recipient,
    }
}

#[test]
fn test_e2e_real_proof_claim_succeeds() {
    let e = setup_e2e();
    let commitment = BytesN::from_array(&e.env, &fx::COMMITMENT);
    let nullifier = BytesN::from_array(&e.env, &fx::NULLIFIER);

    // The real Groth16 proof is verified by the BN254 host functions in-process.
    e.client.claim(
        &e.recipient,
        &commitment,
        &fx::CURRENT_TIME,
        &fx::WITHDRAW_AMOUNT,
        &nullifier,
        &real_proof(&e.env),
    );

    assert_eq!(e.token.balance(&e.recipient), fx::WITHDRAW_AMOUNT as i128);
    let stream = e.client.get_stream(&commitment).unwrap();
    assert_eq!(stream.withdrawn, fx::WITHDRAW_AMOUNT as i128);
    assert!(e.client.is_nullifier_used(&nullifier));
}

#[test]
fn test_e2e_wrong_public_input_rejected() {
    // Same valid proof, but claim a different amount than was proven: the public
    // inputs no longer match, so the pairing check fails -> InvalidProof.
    let e = setup_e2e();
    let commitment = BytesN::from_array(&e.env, &fx::COMMITMENT);
    let nullifier = BytesN::from_array(&e.env, &fx::NULLIFIER);

    let err = e
        .client
        .try_claim(
            &e.recipient,
            &commitment,
            &fx::CURRENT_TIME,
            &(fx::WITHDRAW_AMOUNT + 1),
            &nullifier,
            &real_proof(&e.env),
        )
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::InvalidProof);
}

#[test]
fn test_e2e_wrong_recipient_rejected() {
    // Front-running attempt: a different recipient changes the bound `recipient`
    // public input, so the proof fails to verify.
    let e = setup_e2e();
    let commitment = BytesN::from_array(&e.env, &fx::COMMITMENT);
    let nullifier = BytesN::from_array(&e.env, &fx::NULLIFIER);
    let attacker = Address::generate(&e.env);

    let err = e
        .client
        .try_claim(
            &attacker,
            &commitment,
            &fx::CURRENT_TIME,
            &fx::WITHDRAW_AMOUNT,
            &nullifier,
            &real_proof(&e.env),
        )
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::InvalidProof);
}

#[test]
fn test_set_vk_requires_admin_auth_path() {
    // With mock_all_auths the admin-gated rotation simply succeeds; this checks
    // the entrypoint is wired and accepts a fresh key.
    let h = setup();
    h.client.set_vk(&dummy_vk(&h.env));
}
