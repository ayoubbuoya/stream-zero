//! StreamZero Groth16 proving library (host + wasm).
//!
//! Single source of truth for the StreamZero cryptography:
//!   - the Poseidon commitment / nullifier (so employer and employee agree),
//!   - the BN254 Groth16 circuit (same statement as the Noir spec),
//!   - the trusted setup (deterministic, so the deployed VK is reproducible),
//!   - proving, and
//!   - encoding into the exact byte layout the Soroban BN254 host expects.
//!
//! Both the `gen` binary (artifacts + e2e fixtures) and the wasm bindings build
//! on this so the browser proofs match the deployed verifying key exactly.

use ark_bn254::{Bn254, Fq, Fq2, Fr, G1Affine, G2Affine};
use ark_crypto_primitives::sponge::{
    constraints::CryptographicSpongeVar,
    poseidon::{
        constraints::PoseidonSpongeVar, find_poseidon_ark_and_mds, PoseidonConfig, PoseidonSponge,
    },
    CryptographicSponge,
};
use ark_ff::{BigInteger, Field, PrimeField};
use ark_groth16::{Groth16, Proof, ProvingKey, VerifyingKey};
use ark_r1cs_std::{
    alloc::AllocVar,
    eq::EqGadget,
    fields::{fp::FpVar, FieldVar},
};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use ark_serialize::CanonicalDeserialize;
use ark_snark::SNARK;
use core::cmp::Ordering;
use sha2::{Digest, Sha256};

/// Deterministic setup seed — keep stable so the verifying key (and therefore
/// the deployed contract) is reproducible across machines.
pub const SETUP_SEED: u64 = 20260622;

/// BN254 Poseidon sponge config (t = rate + capacity = 3).
pub fn poseidon_config() -> PoseidonConfig<Fr> {
    let (ark, mds) = find_poseidon_ark_and_mds::<Fr>(254, 2, 8, 57, 0);
    PoseidonConfig::new(8, 57, 5, mds, ark, 2, 1)
}

fn hash(cfg: &PoseidonConfig<Fr>, inputs: &[Fr]) -> Fr {
    let mut sponge = PoseidonSponge::new(cfg);
    for x in inputs {
        sponge.absorb(x);
    }
    sponge.squeeze_field_elements(1)[0]
}

// --- field / address helpers -----------------------------------------------

/// Interpret 32 big-endian bytes as a field element (reduced mod r).
pub fn fr_from_be_bytes(bytes: &[u8]) -> Fr {
    Fr::from_be_bytes_mod_order(bytes)
}

/// Serialize a field element as 32 big-endian bytes.
pub fn fr_be(x: &Fr) -> [u8; 32] {
    let v = x.into_bigint().to_bytes_be();
    let mut out = [0u8; 32];
    out[32 - v.len()..].copy_from_slice(&v);
    out
}

/// Recipient binding value used as a public input: Fr(sha256(strkey)).
/// Mirrors the contract's `sha256(recipient.to_string())`.
pub fn recipient_field(strkey: &str) -> Fr {
    Fr::from_be_bytes_mod_order(&Sha256::digest(strkey.as_bytes()))
}

/// commitment = Poseidon(secret, salary_rate, start_time).
pub fn commitment(cfg: &PoseidonConfig<Fr>, secret: Fr, salary_rate: u64, start_time: u64) -> Fr {
    hash(cfg, &[secret, Fr::from(salary_rate), Fr::from(start_time)])
}

/// nullifier = Poseidon(secret, current_time).
pub fn nullifier(cfg: &PoseidonConfig<Fr>, secret: Fr, current_time: u64) -> Fr {
    hash(cfg, &[secret, Fr::from(current_time)])
}

// --- circuit ---------------------------------------------------------------

/// All values needed to build/prove one withdrawal statement.
#[derive(Clone)]
pub struct Witness {
    pub secret: Fr,
    pub salary_rate: u64,
    pub start_time: u64,
    pub current_time: u64,
    pub withdraw_amount: u64,
    pub already_withdrawn: u64,
    pub recipient: Fr,
}

impl Witness {
    /// The six public inputs, in the order the contract reconstructs them.
    pub fn public_inputs(&self, cfg: &PoseidonConfig<Fr>) -> Vec<Fr> {
        vec![
            commitment(cfg, self.secret, self.salary_rate, self.start_time),
            Fr::from(self.current_time),
            Fr::from(self.withdraw_amount),
            nullifier(cfg, self.secret, self.current_time),
            Fr::from(self.already_withdrawn),
            self.recipient,
        ]
    }
}

#[derive(Clone)]
struct StreamZeroCircuit {
    cfg: PoseidonConfig<Fr>,
    w: Witness,
}

impl ConstraintSynthesizer<Fr> for StreamZeroCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        let pubs = self.w.public_inputs(&self.cfg);
        // Public inputs — ORDER MUST MATCH the contract.
        let commitment = FpVar::new_input(cs.clone(), || Ok(pubs[0]))?;
        let current_time = FpVar::new_input(cs.clone(), || Ok(pubs[1]))?;
        let withdraw_amount = FpVar::new_input(cs.clone(), || Ok(pubs[2]))?;
        let nullifier = FpVar::new_input(cs.clone(), || Ok(pubs[3]))?;
        let already_withdrawn = FpVar::new_input(cs.clone(), || Ok(pubs[4]))?;
        let recipient = FpVar::new_input(cs.clone(), || Ok(pubs[5]))?;

        // Private witnesses.
        let secret = FpVar::new_witness(cs.clone(), || Ok(self.w.secret))?;
        let salary_rate = FpVar::new_witness(cs.clone(), || Ok(Fr::from(self.w.salary_rate)))?;
        let start_time = FpVar::new_witness(cs.clone(), || Ok(Fr::from(self.w.start_time)))?;

        // 1. Identity: commitment == Poseidon(secret, rate, start).
        let mut s1 = PoseidonSpongeVar::new(cs.clone(), &self.cfg);
        s1.absorb(&secret)?;
        s1.absorb(&salary_rate)?;
        s1.absorb(&start_time)?;
        s1.squeeze_field_elements(1)?[0].enforce_equal(&commitment)?;

        // 2. Nullifier: nullifier == Poseidon(secret, current_time).
        let mut s2 = PoseidonSpongeVar::new(cs.clone(), &self.cfg);
        s2.absorb(&secret)?;
        s2.absorb(&current_time)?;
        s2.squeeze_field_elements(1)?[0].enforce_equal(&nullifier)?;

        // 3. Anti-front-running: recipient != 0 (prove invertible).
        let inv = FpVar::new_witness(cs.clone(), || Ok(self.w.recipient.inverse().unwrap()))?;
        (&recipient * &inv).enforce_equal(&FpVar::one())?;

        // 4. Streaming math with cumulative tracking.
        current_time.enforce_cmp(&start_time, Ordering::Greater, true)?;
        let elapsed = &current_time - &start_time;
        let total_vested = &elapsed * &salary_rate;
        let requested = &already_withdrawn + &withdraw_amount;
        total_vested.enforce_cmp(&requested, Ordering::Greater, true)?;
        Ok(())
    }
}

// --- setup / prove ---------------------------------------------------------

/// Deterministic Groth16 trusted setup. Returns (proving key, verifying key).
/// The circuit shape is fixed, so the seed alone pins the keys.
pub fn setup() -> (ProvingKey<Bn254>, VerifyingKey<Bn254>) {
    let cfg = poseidon_config();
    // A satisfiable dummy assignment defines the circuit shape for setup.
    let circuit = StreamZeroCircuit {
        cfg,
        w: Witness {
            secret: Fr::from(1u64),
            salary_rate: 1,
            start_time: 0,
            current_time: 1,
            withdraw_amount: 0,
            already_withdrawn: 0,
            recipient: Fr::from(1u64),
        },
    };
    let mut rng = <rand::rngs::StdRng as rand::SeedableRng>::seed_from_u64(SETUP_SEED);
    Groth16::<Bn254>::circuit_specific_setup(circuit, &mut rng).expect("setup")
}

/// Deserialize a proving key previously written with `serialize_compressed`.
pub fn deserialize_pk(bytes: &[u8]) -> ProvingKey<Bn254> {
    ProvingKey::<Bn254>::deserialize_compressed_unchecked(bytes).expect("deserialize proving key")
}

/// Generate a proof for `w` using `pk`.
pub fn prove(pk: &ProvingKey<Bn254>, w: &Witness) -> Proof<Bn254> {
    let cfg = poseidon_config();
    let circuit = StreamZeroCircuit { cfg, w: w.clone() };
    let mut rng = <rand::rngs::StdRng as rand::SeedableRng>::seed_from_u64(rand_seed_from(w));
    Groth16::<Bn254>::prove(pk, circuit, &mut rng).expect("prove")
}

/// Verify natively (used by the generator's self-check).
pub fn verify(vk: &VerifyingKey<Bn254>, public_inputs: &[Fr], proof: &Proof<Bn254>) -> bool {
    Groth16::<Bn254>::verify(vk, public_inputs, proof).expect("verify")
}

// Proof randomness must be unpredictable in production; for reproducible
// artifacts we derive it from the witness. The wasm path reseeds from JS entropy.
fn rand_seed_from(w: &Witness) -> u64 {
    let b = fr_be(&w.secret);
    u64::from_le_bytes([b[24], b[25], b[26], b[27], b[28], b[29], b[30], b[31]])
        ^ w.current_time
        ^ (w.withdraw_amount.rotate_left(17))
}

// --- host byte-layout encoding ---------------------------------------------

fn fq_be(x: &Fq) -> [u8; 32] {
    let v = x.into_bigint().to_bytes_be();
    let mut out = [0u8; 32];
    out[32 - v.len()..].copy_from_slice(&v);
    out
}

/// G1: X_be || Y_be (64 bytes).
pub fn g1_bytes(p: &G1Affine) -> [u8; 64] {
    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&fq_be(&p.x));
    out[32..].copy_from_slice(&fq_be(&p.y));
    out
}

/// G2: X.c1 || X.c0 || Y.c1 || Y.c0, each big-endian (128 bytes, Ethereum order).
pub fn g2_bytes(p: &G2Affine) -> [u8; 128] {
    let x: &Fq2 = &p.x;
    let y: &Fq2 = &p.y;
    let mut out = [0u8; 128];
    out[0..32].copy_from_slice(&fq_be(&x.c1));
    out[32..64].copy_from_slice(&fq_be(&x.c0));
    out[64..96].copy_from_slice(&fq_be(&y.c1));
    out[96..128].copy_from_slice(&fq_be(&y.c0));
    out
}

/// Proof in Soroban host byte layout.
pub struct EncodedProof {
    pub a: [u8; 64],
    pub b: [u8; 128],
    pub c: [u8; 64],
}

pub fn encode_proof(proof: &Proof<Bn254>) -> EncodedProof {
    EncodedProof {
        a: g1_bytes(&proof.a),
        b: g2_bytes(&proof.b),
        c: g1_bytes(&proof.c),
    }
}

/// Verifying key in Soroban host byte layout.
pub struct EncodedVk {
    pub alpha: [u8; 64],
    pub beta: [u8; 128],
    pub gamma: [u8; 128],
    pub delta: [u8; 128],
    pub ic: Vec<[u8; 64]>,
}

pub fn encode_vk(vk: &VerifyingKey<Bn254>) -> EncodedVk {
    EncodedVk {
        alpha: g1_bytes(&vk.alpha_g1),
        beta: g2_bytes(&vk.beta_g2),
        gamma: g2_bytes(&vk.gamma_g2),
        delta: g2_bytes(&vk.delta_g2),
        ic: vk.gamma_abc_g1.iter().map(g1_bytes).collect(),
    }
}
