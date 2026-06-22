//! Minimal Groth16 verifier over the BN254 (alt_bn128) curve.
//!
//! This uses the native BN254 host functions introduced in **Protocol 25
//! ("X-Ray", CAP-0074)** and exposed by `soroban-sdk` >= 26 via
//! `env.crypto().bn254()`. It is the on-chain counterpart of a Noir/Barretenberg
//! Groth16 proof generated off-chain.
//!
//! ## Verification equation
//!
//! Groth16 verifies a proof `(A, B, C)` against a verifying key
//! `(alpha, beta, gamma, delta, IC[])` and public inputs `x` by checking:
//!
//! ```text
//!   e(A, B) == e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
//!   where vk_x = IC[0] + Σ x_i * IC[i+1]
//! ```
//!
//! The host only exposes a *product-equals-one* multi-pairing check, so we move
//! everything to one side and negate `A`:
//!
//! ```text
//!   e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
//! ```
//!
//! ## Encoding (must match the off-chain prover)
//! - G1 point  : 64 bytes, uncompressed big-endian `X || Y`
//! - G2 point  : 128 bytes, uncompressed big-endian `X.c1 X.c0 || Y.c1 Y.c0`
//!   (this is the order Barretenberg / snarkjs emit; the encoder script in
//!   `frontend/` handles the conversion — see README)
//! - Scalar Fr : 32 bytes, big-endian, reduced mod r
//!
//! Public inputs are passed as `Vec<BytesN<32>>`, one big-endian field element
//! each, in the **same order the circuit declares them**.

use soroban_sdk::{
    contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    BytesN, Env, Vec,
};

/// `r - 1` in the BN254 scalar field, big-endian. Multiplying a G1 point by this
/// scalar negates it (`(r-1) * P == -P`), which is how we flip the sign of `A`
/// without a dedicated negation host function.
const NEG_ONE_FR_BE: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x00,
];

/// Groth16 verifying key. Produced once per circuit at trusted-setup time and
/// stored in contract instance storage. `ic` has length `n_public_inputs + 1`.
#[contracttype]
#[derive(Clone)]
pub struct VerifyingKey {
    pub alpha: BytesN<64>,      // G1
    pub beta: BytesN<128>,      // G2
    pub gamma: BytesN<128>,     // G2
    pub delta: BytesN<128>,     // G2
    pub ic: Vec<BytesN<64>>,    // G1[], len == n_public + 1
}

/// A Groth16 proof `(A, B, C)`.
#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub a: BytesN<64>,   // G1
    pub b: BytesN<128>,  // G2
    pub c: BytesN<64>,   // G1
}

/// Verify a Groth16 proof. Returns `true` iff the proof is valid for the given
/// public inputs. Panics (via the host) only on structurally invalid points
/// (off-curve / out-of-field), which a well-formed prover never produces.
pub fn verify(
    env: &Env,
    vk: &VerifyingKey,
    proof: &Proof,
    public_inputs: &Vec<BytesN<32>>,
) -> bool {
    let bn = env.crypto().bn254();

    // IC length must be exactly n_public + 1, otherwise the VK and the circuit
    // disagree and any result would be meaningless.
    if vk.ic.len() != public_inputs.len() + 1 {
        return false;
    }

    // vk_x = IC[0] + Σ x_i * IC[i+1], computed with a single multi-scalar mult
    // over IC[1..] then one addition of the constant term IC[0].
    let mut points: Vec<Bn254G1Affine> = Vec::new(env);
    let mut scalars: Vec<Bn254Fr> = Vec::new(env);
    for i in 0..public_inputs.len() {
        points.push_back(Bn254G1Affine::from_bytes(vk.ic.get_unchecked(i + 1)));
        scalars.push_back(Bn254Fr::from_bytes(public_inputs.get_unchecked(i)));
    }
    let summed = bn.g1_msm(points, scalars);
    let ic0 = Bn254G1Affine::from_bytes(vk.ic.get_unchecked(0));
    let vk_x = bn.g1_add(&ic0, &summed);

    // -A = (r-1) * A
    let a = Bn254G1Affine::from_bytes(proof.a.clone());
    let neg_one = Bn254Fr::from_bytes(BytesN::from_array(env, &NEG_ONE_FR_BE));
    let neg_a = bn.g1_mul(&a, &neg_one);

    let alpha = Bn254G1Affine::from_bytes(vk.alpha.clone());
    let c = Bn254G1Affine::from_bytes(proof.c.clone());

    let b = Bn254G2Affine::from_bytes(proof.b.clone());
    let beta = Bn254G2Affine::from_bytes(vk.beta.clone());
    let gamma = Bn254G2Affine::from_bytes(vk.gamma.clone());
    let delta = Bn254G2Affine::from_bytes(vk.delta.clone());

    // e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
    let mut g1: Vec<Bn254G1Affine> = Vec::new(env);
    g1.push_back(neg_a);
    g1.push_back(alpha);
    g1.push_back(vk_x);
    g1.push_back(c);

    let mut g2: Vec<Bn254G2Affine> = Vec::new(env);
    g2.push_back(b);
    g2.push_back(beta);
    g2.push_back(gamma);
    g2.push_back(delta);

    bn.pairing_check(g1, g2)
}
