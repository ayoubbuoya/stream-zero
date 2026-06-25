//! StreamZero browser proving (wasm-bindgen).
//!
//! The single crypto module shared by both dashboards:
//!   - `compute_commitment` — employer derives the on-chain commitment.
//!   - `compute_nullifier`   — employee derives the spend nullifier.
//!   - `prove`               — employee generates the Groth16 proof, returned
//!                             already encoded in the Soroban host byte layout.
//!
//! The fixed proving key (from the deterministic setup) is embedded, so proofs
//! always match the deployed verifying key. All byte values cross the JS
//! boundary as lowercase hex strings.

use ark_bn254::Fr;
use serde::Serialize;
use streamzero_prover as sz;
use wasm_bindgen::prelude::*;

/// Proving key produced by `streamzero-prover`'s deterministic setup.
const PROVING_KEY: &[u8] = include_bytes!("../../streamzero-prover/artifacts/proving_key.bin");

fn secret_from_hex(secret_hex: &str) -> Result<Fr, JsError> {
    let bytes = hex::decode(secret_hex.trim_start_matches("0x"))
        .map_err(|e| JsError::new(&format!("bad secret hex: {e}")))?;
    Ok(sz::fr_from_be_bytes(&bytes))
}

#[derive(Serialize)]
pub struct ProveOutput {
    /// 32-byte commitment (hex) — must equal the stream's stored commitment.
    pub commitment: String,
    /// 32-byte nullifier (hex) — passed to `claim`.
    pub nullifier: String,
    /// Proof point A (64-byte G1, hex).
    pub proof_a: String,
    /// Proof point B (128-byte G2, hex).
    pub proof_b: String,
    /// Proof point C (64-byte G1, hex).
    pub proof_c: String,
}

/// commitment = Poseidon(secret, salary_rate, start_time), as 32-byte hex.
#[wasm_bindgen]
pub fn compute_commitment(
    secret_hex: &str,
    salary_rate: u64,
    start_time: u64,
) -> Result<String, JsError> {
    let cfg = sz::poseidon_config();
    let secret = secret_from_hex(secret_hex)?;
    let c = sz::commitment(&cfg, secret, salary_rate, start_time);
    Ok(hex::encode(sz::fr_be(&c)))
}

/// nullifier = Poseidon(secret, current_time), as 32-byte hex.
#[wasm_bindgen]
pub fn compute_nullifier(secret_hex: &str, current_time: u64) -> Result<String, JsError> {
    let cfg = sz::poseidon_config();
    let secret = secret_from_hex(secret_hex)?;
    let n = sz::nullifier(&cfg, secret, current_time);
    Ok(hex::encode(sz::fr_be(&n)))
}

/// Generate a withdrawal proof. Returns the commitment + nullifier + the proof
/// points, all encoded for direct submission to the contract's `claim`.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn prove(
    secret_hex: &str,
    salary_rate: u64,
    start_time: u64,
    current_time: u64,
    withdraw_amount: u64,
    already_withdrawn: u64,
    recipient_strkey: &str,
) -> Result<JsValue, JsError> {
    let cfg = sz::poseidon_config();
    let secret = secret_from_hex(secret_hex)?;
    let w = sz::Witness {
        secret,
        salary_rate,
        start_time,
        current_time,
        withdraw_amount,
        already_withdrawn,
        recipient: sz::recipient_field(recipient_strkey),
    };

    let pk = sz::deserialize_pk(PROVING_KEY);
    let proof = sz::prove(&pk, &w);
    let ep = sz::encode_proof(&proof);
    let pubs = w.public_inputs(&cfg);

    let out = ProveOutput {
        commitment: hex::encode(sz::fr_be(&pubs[0])),
        nullifier: hex::encode(sz::fr_be(&pubs[3])),
        proof_a: hex::encode(ep.a),
        proof_b: hex::encode(ep.b),
        proof_c: hex::encode(ep.c),
    };
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsError::new(&format!("serialize: {e}")))
}
