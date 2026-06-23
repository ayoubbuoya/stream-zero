#![no_std]
//! # StreamZero — private payroll streaming on Soroban
//!
//! An employer locks stablecoin (mocked now, USDC later) into this vault and
//! posts only a **Poseidon2 commitment** `H(secret, salary_rate, start_time)`.
//! Nothing about the employee — identity, rate, or total — touches the ledger.
//!
//! An employee later proves, in zero knowledge (Noir → Groth16/BN254), that:
//!   1. they know the pre-image of the commitment, and
//!   2. `(current_time - start_time) * salary_rate >= withdraw_amount`.
//!
//! The contract verifies that proof natively using the **Protocol 25 (X-Ray)
//! BN254 host functions** and releases exactly `withdraw_amount`. The ledger
//! only ever records "a valid proof was submitted and funds moved".
//!
//! Circuit public inputs (order is load-bearing — it must match `noir_circuit`):
//!   `[ commitment, current_time, withdraw_amount, nullifier_hash ]`

mod groth16;
#[cfg(test)]
#[allow(dead_code)]
mod e2e_fixtures;
#[cfg(test)]
mod test;

pub use groth16::{Proof, VerifyingKey};

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN,
    Env, Vec,
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Vk,
    /// keyed by the Poseidon2 commitment (a BN254 field element, 32 bytes BE)
    Stream(BytesN<32>),
    /// keyed by a spent nullifier hash; presence == already used
    Nullifier(BytesN<32>),
}

/// Public, privacy-preserving record of a funded stream. Note what is *absent*:
/// no employee address, no rate, no duration.
#[contracttype]
#[derive(Clone)]
pub struct Stream {
    pub employer: Address,
    pub deposit: i128,
    pub withdrawn: i128,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    StreamExists = 4,
    StreamNotFound = 5,
    NullifierAlreadyUsed = 6,
    InvalidProof = 7,
    /// `current_time` public input is in the future relative to the ledger
    TimestampInFuture = 8,
    /// cumulative withdrawals would exceed the deposited amount
    InsufficientStreamBalance = 9,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[contractevent(topics = ["stream_created"])]
pub struct StreamCreated {
    #[topic]
    pub commitment: BytesN<32>,
    pub employer: Address,
    pub amount: i128,
}

#[contractevent(topics = ["claimed"])]
pub struct Claimed {
    #[topic]
    pub commitment: BytesN<32>,
    #[topic]
    pub nullifier: BytesN<32>,
    pub amount: i128,
}

// ---------------------------------------------------------------------------
// TTL constants (~ values assume 5s ledgers)
// ---------------------------------------------------------------------------

const DAY: u32 = 17_280;
const INSTANCE_BUMP_THRESHOLD: u32 = DAY;
const INSTANCE_BUMP_TO: u32 = 30 * DAY;
const ENTRY_BUMP_THRESHOLD: u32 = 7 * DAY;
const ENTRY_BUMP_TO: u32 = 90 * DAY;

#[contract]
pub struct StreamZero;

#[contractimpl]
impl StreamZero {
    /// Atomic initialization (Protocol 22+ constructor).
    ///
    /// * `admin`   — may rotate the verifying key.
    /// * `token`   — SEP-41 / SAC address of the streaming asset (mock now, USDC later).
    /// * `vk`      — Groth16 verifying key for the StreamZero circuit.
    pub fn __constructor(env: Env, admin: Address, token: Address, vk: VerifyingKey) {
        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Token, &token);
        storage.set(&DataKey::Vk, &vk);
        storage.extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_TO);
    }

    /// Admin-only: rotate the verifying key (e.g. after a circuit revision).
    pub fn set_vk(env: Env, vk: VerifyingKey) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Vk, &vk);
        Ok(())
    }

    /// Employer deposits `amount` and registers `commitment`.
    ///
    /// The commitment is the Poseidon2 hash the employer computed off-chain;
    /// the contract treats it as an opaque 32-byte field element.
    pub fn create_stream(
        env: Env,
        employer: Address,
        commitment: BytesN<32>,
        amount: i128,
    ) -> Result<(), Error> {
        employer.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let storage = env.storage().persistent();
        let key = DataKey::Stream(commitment.clone());
        if storage.has(&key) {
            return Err(Error::StreamExists);
        }

        // Pull the funds into the vault.
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        token::TokenClient::new(&env, &token).transfer(
            &employer,
            &env.current_contract_address(),
            &amount,
        );

        let stream = Stream {
            employer: employer.clone(),
            deposit: amount,
            withdrawn: 0,
        };
        storage.set(&key, &stream);
        storage.extend_ttl(&key, ENTRY_BUMP_THRESHOLD, ENTRY_BUMP_TO);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_TO);

        StreamCreated {
            commitment,
            employer,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Employee claims `withdraw_amount` by submitting a ZK proof.
    ///
    /// The circuit's six public inputs are reconstructed here, in this exact
    /// order:
    ///   `[commitment, current_time, withdraw_amount, nullifier_hash,
    ///     already_withdrawn, recipient]`
    ///
    /// Two of them are derived on-chain rather than trusted from the caller,
    /// which is what makes them safe:
    /// * `already_withdrawn` = the stream's current `withdrawn` total, binding
    ///   the proof to the live state (a replayed/stale proof carries an old
    ///   value and fails verification), and enforcing cumulative vesting.
    /// * `recipient` = `sha256(recipient_strkey)`, binding the proof to exactly
    ///   one payout address so a pending claim can't be front-run to another.
    #[allow(clippy::too_many_arguments)]
    pub fn claim(
        env: Env,
        recipient: Address,
        commitment: BytesN<32>,
        current_time: u64,
        withdraw_amount: u64,
        nullifier: BytesN<32>,
        proof: Proof,
    ) -> Result<(), Error> {
        // 1. Stream must exist.
        let stream_key = DataKey::Stream(commitment.clone());
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&stream_key)
            .ok_or(Error::StreamNotFound)?;

        // 2. Anti-replay: each nullifier may be spent once.
        let null_key = DataKey::Nullifier(nullifier.clone());
        if env.storage().persistent().has(&null_key) {
            return Err(Error::NullifierAlreadyUsed);
        }

        // 3. Bind the proof's claimed time to real ledger time. The circuit
        //    trusts `current_time`; the chain must ensure it is not in the
        //    future, otherwise an employee could vest funds early.
        if current_time > env.ledger().timestamp() {
            return Err(Error::TimestampInFuture);
        }

        // 4. Verify the Groth16 proof. Public inputs MUST match circuit order:
        //    [commitment, current_time, withdraw_amount, nullifier_hash].
        let vk: VerifyingKey = env
            .storage()
            .instance()
            .get(&DataKey::Vk)
            .ok_or(Error::NotInitialized)?;
        // `already_withdrawn` is taken from on-chain state, never from the
        // caller — this both enforces cumulative vesting and binds the proof to
        // the current stream state (replay protection).
        let already_withdrawn = stream.withdrawn as u64;
        // `recipient` is bound as sha256(strkey); the prover computes the same
        // value off-chain, so the proof only verifies for this exact address.
        let recipient_field = env
            .crypto()
            .sha256(&recipient.to_string().to_bytes())
            .to_bytes();

        let mut public_inputs: Vec<BytesN<32>> = Vec::new(&env);
        public_inputs.push_back(commitment.clone());
        public_inputs.push_back(u64_to_fr_be(&env, current_time));
        public_inputs.push_back(u64_to_fr_be(&env, withdraw_amount));
        public_inputs.push_back(nullifier.clone());
        public_inputs.push_back(u64_to_fr_be(&env, already_withdrawn));
        public_inputs.push_back(recipient_field);

        if !groth16::verify(&env, &vk, &proof, &public_inputs) {
            return Err(Error::InvalidProof);
        }

        // 5. On-chain safety net: cumulative withdrawals can never exceed the
        //    deposit, even though true vesting is enforced privately in-circuit.
        let amount = withdraw_amount as i128;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let new_withdrawn = stream
            .withdrawn
            .checked_add(amount)
            .ok_or(Error::InvalidAmount)?;
        if new_withdrawn > stream.deposit {
            return Err(Error::InsufficientStreamBalance);
        }

        // 6. Commit state, then pay out.
        env.storage().persistent().set(&null_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&null_key, ENTRY_BUMP_THRESHOLD, ENTRY_BUMP_TO);
        stream.withdrawn = new_withdrawn;
        env.storage().persistent().set(&stream_key, &stream);
        env.storage().persistent().extend_ttl(
            &stream_key,
            ENTRY_BUMP_THRESHOLD,
            ENTRY_BUMP_TO,
        );

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        token::TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &recipient,
            &amount,
        );

        Claimed {
            commitment,
            nullifier,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    // --- read-only views ---------------------------------------------------

    pub fn get_stream(env: Env, commitment: BytesN<32>) -> Option<Stream> {
        env.storage().persistent().get(&DataKey::Stream(commitment))
    }

    pub fn is_nullifier_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier))
    }

    pub fn get_token(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Token)
    }

    pub fn get_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }
}

/// Encode a `u64` as a 32-byte big-endian BN254 field element (right-aligned).
fn u64_to_fr_be(env: &Env, value: u64) -> BytesN<32> {
    let mut buf = [0u8; 32];
    buf[24..32].copy_from_slice(&value.to_be_bytes());
    BytesN::from_array(env, &buf)
}
