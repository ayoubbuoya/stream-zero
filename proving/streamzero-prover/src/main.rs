//! StreamZero Groth16 prover (host tool).
//!
//! Builds the StreamZero withdrawal statement as a BN254 R1CS circuit, runs a
//! Groth16 setup + prove, self-verifies, and emits a Rust fixtures file encoding
//! the verifying key + proof in the **exact** byte layout the Soroban BN254 host
//! functions expect:
//!   - G1 (64B): X_be || Y_be
//!   - G2 (128B): X.c1_be || X.c0_be || Y.c1_be || Y.c0_be   (Ethereum order)
//!   - Fr (32B): big-endian
//!
//! The public inputs are emitted in the same order the contract reconstructs
//! them: [commitment, current_time, withdraw_amount, nullifier, already_withdrawn, recipient].
//!
//! NOTE: this proves the same *statement* as the Noir circuit, but uses an
//! arkworks Poseidon sponge for the commitment/nullifier (Noir uses Poseidon2).
//! The on-chain verifier is hash-agnostic — it only checks the Groth16 pairing —
//! so this is a faithful end-to-end exercise of the contract's verifier path.

use ark_bn254::{Bn254, Fq, Fq2, Fr, G1Affine, G2Affine};
use ark_crypto_primitives::sponge::{
    constraints::CryptographicSpongeVar,
    poseidon::{
        constraints::PoseidonSpongeVar, find_poseidon_ark_and_mds, PoseidonConfig, PoseidonSponge,
    },
    CryptographicSponge,
};
use ark_ff::{BigInteger, Field, PrimeField};
use ark_groth16::Groth16;
use ark_r1cs_std::{
    alloc::AllocVar,
    eq::EqGadget,
    fields::{fp::FpVar, FieldVar},
};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use ark_snark::SNARK;
use core::cmp::Ordering;
use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::fs;

const RECIPIENT_STRKEY: &str = "GDBB5HXDWOJVTZEKYXRCQIKKPMCWSO73RMTOZMRVRQ55T7AEEREFREI3";

// Streaming scenario (matches the contract's e2e test).
const SECRET: u64 = 42;
const SALARY_RATE: u64 = 10; // tokens / second
const START_TIME: u64 = 1000;
const CURRENT_TIME: u64 = 1100; // 100s elapsed -> 1000 vested
const WITHDRAW_AMOUNT: u64 = 400;
const ALREADY_WITHDRAWN: u64 = 0;

fn poseidon_config() -> PoseidonConfig<Fr> {
    // t = rate + capacity = 3; standard BN254 Poseidon round numbers.
    let (ark, mds) = find_poseidon_ark_and_mds::<Fr>(254, 2, 8, 57, 0);
    PoseidonConfig::new(8, 57, 5, mds, ark, 2, 1)
}

fn poseidon_hash(cfg: &PoseidonConfig<Fr>, inputs: &[Fr]) -> Fr {
    let mut sponge = PoseidonSponge::new(cfg);
    for x in inputs {
        sponge.absorb(x);
    }
    sponge.squeeze_field_elements(1)[0]
}

#[derive(Clone)]
struct StreamZeroCircuit {
    cfg: PoseidonConfig<Fr>,
    // public
    commitment: Fr,
    current_time: Fr,
    withdraw_amount: Fr,
    nullifier: Fr,
    already_withdrawn: Fr,
    recipient: Fr,
    // private
    secret: Fr,
    salary_rate: Fr,
    start_time: Fr,
}

impl ConstraintSynthesizer<Fr> for StreamZeroCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        // Public inputs — ORDER MUST MATCH the contract's `public_inputs` vec.
        let commitment = FpVar::new_input(cs.clone(), || Ok(self.commitment))?;
        let current_time = FpVar::new_input(cs.clone(), || Ok(self.current_time))?;
        let withdraw_amount = FpVar::new_input(cs.clone(), || Ok(self.withdraw_amount))?;
        let nullifier = FpVar::new_input(cs.clone(), || Ok(self.nullifier))?;
        let already_withdrawn = FpVar::new_input(cs.clone(), || Ok(self.already_withdrawn))?;
        let recipient = FpVar::new_input(cs.clone(), || Ok(self.recipient))?;

        // Private witnesses.
        let secret = FpVar::new_witness(cs.clone(), || Ok(self.secret))?;
        let salary_rate = FpVar::new_witness(cs.clone(), || Ok(self.salary_rate))?;
        let start_time = FpVar::new_witness(cs.clone(), || Ok(self.start_time))?;

        // 1. Identity: commitment == Poseidon(secret, rate, start).
        let mut s1 = PoseidonSpongeVar::new(cs.clone(), &self.cfg);
        s1.absorb(&secret)?;
        s1.absorb(&salary_rate)?;
        s1.absorb(&start_time)?;
        let c = s1.squeeze_field_elements(1)?;
        c[0].enforce_equal(&commitment)?;

        // 2. Nullifier: nullifier == Poseidon(secret, current_time).
        let mut s2 = PoseidonSpongeVar::new(cs.clone(), &self.cfg);
        s2.absorb(&secret)?;
        s2.absorb(&current_time)?;
        let n = s2.squeeze_field_elements(1)?;
        n[0].enforce_equal(&nullifier)?;

        // 3. Anti-front-running: recipient != 0 (prove it is invertible).
        let recipient_inv =
            FpVar::new_witness(cs.clone(), || Ok(self.recipient.inverse().unwrap()))?;
        (&recipient * &recipient_inv).enforce_equal(&FpVar::one())?;

        // 4. Streaming math with cumulative tracking.
        current_time.enforce_cmp(&start_time, Ordering::Greater, true)?; // current_time >= start_time
        let elapsed = &current_time - &start_time;
        let total_vested = &elapsed * &salary_rate;
        let requested = &already_withdrawn + &withdraw_amount;
        total_vested.enforce_cmp(&requested, Ordering::Greater, true)?; // vested >= already + withdraw
        Ok(())
    }
}

// --- serialization to the host byte layout ---------------------------------

fn fq_be(x: &Fq) -> [u8; 32] {
    let v = x.into_bigint().to_bytes_be();
    let mut out = [0u8; 32];
    out[32 - v.len()..].copy_from_slice(&v);
    out
}

fn fr_be(x: &Fr) -> [u8; 32] {
    let v = x.into_bigint().to_bytes_be();
    let mut out = [0u8; 32];
    out[32 - v.len()..].copy_from_slice(&v);
    out
}

fn g1_bytes(p: &G1Affine) -> [u8; 64] {
    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&fq_be(&p.x));
    out[32..].copy_from_slice(&fq_be(&p.y));
    out
}

fn g2_bytes(p: &G2Affine) -> [u8; 128] {
    // host expects: X.c1 || X.c0 || Y.c1 || Y.c0, each big-endian
    let x: &Fq2 = &p.x;
    let y: &Fq2 = &p.y;
    let mut out = [0u8; 128];
    out[0..32].copy_from_slice(&fq_be(&x.c1));
    out[32..64].copy_from_slice(&fq_be(&x.c0));
    out[64..96].copy_from_slice(&fq_be(&y.c1));
    out[96..128].copy_from_slice(&fq_be(&y.c0));
    out
}

fn arr_lit(bytes: &[u8]) -> String {
    let mut s = String::from("[");
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 {
            s.push_str(", ");
        }
        write!(s, "0x{:02x}", b).unwrap();
    }
    s.push(']');
    s
}

fn main() {
    let cfg = poseidon_config();

    let secret = Fr::from(SECRET);
    let salary_rate = Fr::from(SALARY_RATE);
    let start_time = Fr::from(START_TIME);
    let current_time = Fr::from(CURRENT_TIME);
    let withdraw_amount = Fr::from(WITHDRAW_AMOUNT);
    let already_withdrawn = Fr::from(ALREADY_WITHDRAWN);

    let commitment = poseidon_hash(&cfg, &[secret, salary_rate, start_time]);
    let nullifier = poseidon_hash(&cfg, &[secret, current_time]);

    // recipient field = Fr(sha256(strkey)), matching the contract exactly.
    let digest = Sha256::digest(RECIPIENT_STRKEY.as_bytes());
    let recipient = Fr::from_be_bytes_mod_order(&digest);

    let circuit = StreamZeroCircuit {
        cfg: cfg.clone(),
        commitment,
        current_time,
        withdraw_amount,
        nullifier,
        already_withdrawn,
        recipient,
        secret,
        salary_rate,
        start_time,
    };

    let mut rng = <rand::rngs::StdRng as rand::SeedableRng>::seed_from_u64(20260622);
    let (pk, vk) =
        Groth16::<Bn254>::circuit_specific_setup(circuit.clone(), &mut rng).expect("setup");
    let proof = Groth16::<Bn254>::prove(&pk, circuit, &mut rng).expect("prove");

    let public_inputs = vec![
        commitment,
        current_time,
        withdraw_amount,
        nullifier,
        already_withdrawn,
        recipient,
    ];

    // Sanity: the proof must verify natively before we trust the encoding.
    let ok = Groth16::<Bn254>::verify(&vk, &public_inputs, &proof).expect("verify");
    assert!(ok, "native Groth16 verification failed");
    println!("native Groth16 verify: OK ({} public inputs)", public_inputs.len());

    // Emit fixtures.
    let mut out = String::new();
    out.push_str("// @generated by streamzero-prover — DO NOT EDIT.\n");
    out.push_str("// Real Groth16/BN254 proof for the StreamZero statement, encoded in the\n");
    out.push_str("// Soroban host byte layout. Regenerate via `cargo run` in proving/streamzero-prover.\n\n");

    writeln!(out, "pub const RECIPIENT_STRKEY: &str = \"{RECIPIENT_STRKEY}\";").unwrap();
    writeln!(out, "pub const CURRENT_TIME: u64 = {CURRENT_TIME};").unwrap();
    writeln!(out, "pub const WITHDRAW_AMOUNT: u64 = {WITHDRAW_AMOUNT};").unwrap();
    writeln!(out, "pub const ALREADY_WITHDRAWN: u64 = {ALREADY_WITHDRAWN};\n").unwrap();

    writeln!(out, "pub const COMMITMENT: [u8; 32] = {};", arr_lit(&fr_be(&commitment))).unwrap();
    writeln!(out, "pub const NULLIFIER: [u8; 32] = {};\n", arr_lit(&fr_be(&nullifier))).unwrap();

    writeln!(out, "pub const VK_ALPHA: [u8; 64] = {};", arr_lit(&g1_bytes(&vk.alpha_g1))).unwrap();
    writeln!(out, "pub const VK_BETA: [u8; 128] = {};", arr_lit(&g2_bytes(&vk.beta_g2))).unwrap();
    writeln!(out, "pub const VK_GAMMA: [u8; 128] = {};", arr_lit(&g2_bytes(&vk.gamma_g2))).unwrap();
    writeln!(out, "pub const VK_DELTA: [u8; 128] = {};", arr_lit(&g2_bytes(&vk.delta_g2))).unwrap();

    writeln!(out, "pub const VK_IC: [[u8; 64]; {}] = [", vk.gamma_abc_g1.len()).unwrap();
    for p in &vk.gamma_abc_g1 {
        writeln!(out, "    {},", arr_lit(&g1_bytes(p))).unwrap();
    }
    out.push_str("];\n\n");

    writeln!(out, "pub const PROOF_A: [u8; 64] = {};", arr_lit(&g1_bytes(&proof.a))).unwrap();
    writeln!(out, "pub const PROOF_B: [u8; 128] = {};", arr_lit(&g2_bytes(&proof.b))).unwrap();
    writeln!(out, "pub const PROOF_C: [u8; 64] = {};", arr_lit(&g1_bytes(&proof.c))).unwrap();

    let dest = "../../streamzero-contract/contracts/streamzero/src/e2e_fixtures.rs";
    fs::write(dest, out).expect("write fixtures");
    println!("wrote fixtures -> {dest}");
    println!("IC length = {} (expected n_public+1 = 7)", vk.gamma_abc_g1.len());
}
