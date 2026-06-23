# StreamZero proving

Generates a **real Groth16/BN254 proof** for the StreamZero withdrawal statement
and encodes it in the exact byte layout the Soroban BN254 host functions expect,
so the on-chain verifier can be exercised end-to-end.

## Why arkworks (and not bb)

`bb` (Barretenberg, the Noir backend) only produces **UltraHonk** proofs, which a
Groth16 verifier cannot check. The Protocol 25 BN254 host functions are built for
**Groth16** (EIP-196/197 parity). So we generate the Groth16 proof with a pure-Rust
[arkworks](https://arkworks.rs) prover ([`streamzero-prover`](streamzero-prover)),
which also gives exact control over the on-chain byte encoding.

The Noir circuit in [`../noir_circuit`](../noir_circuit) remains the canonical
spec of the statement (and is unit-tested with `nargo test`); the arkworks prover
implements the same statement with an arkworks Poseidon sponge for the
commitment/nullifier. The on-chain verifier is hash-agnostic — it only checks the
pairing — so this is a faithful end-to-end exercise of the contract.

## Run it

```bash
cd streamzero-prover
cargo run --release
```

This:
1. builds the StreamZero R1CS circuit (Poseidon commitment + nullifier, recipient
   binding, cumulative vesting inequality),
2. runs a Groth16 setup + prove over BN254,
3. self-verifies with `ark-groth16`,
4. writes [`../../streamzero-contract/contracts/streamzero/src/e2e_fixtures.rs`](../streamzero-contract/contracts/streamzero/src/e2e_fixtures.rs)
   — the VK + proof + public inputs as Rust byte constants.

Then the contract's e2e tests consume those fixtures and verify the proof through
the **real BN254 host functions**:

```bash
cd ../../streamzero-contract
cargo test -p streamzero            # includes test_e2e_real_proof_claim_succeeds
```

## Host byte layout (what the encoder emits)

| Object | Size | Layout |
|--------|------|--------|
| G1 (`A`, `C`, `IC[i]`, `alpha`) | 64 B | `X_be ‖ Y_be` |
| G2 (`B`, `beta`, `gamma`, `delta`) | 128 B | `X.c1_be ‖ X.c0_be ‖ Y.c1_be ‖ Y.c0_be` (Ethereum order) |
| Fr (public inputs) | 32 B | big-endian, reduced mod r |

Flag bits (MSB of the first byte) must be unset; valid BN254 field elements
(< 2²⁵⁴) satisfy this automatically. This matches `soroban-env-host`'s
`bn254_g1_affine_deserialize` / `bn254_g2_affine_deserialize`.

## For the browser/frontend (production)

The PRD wants in-browser proving. The same statement can be proved with
snarkjs (circom) — the only requirement is that the public inputs come out in the
order `[commitment, current_time, withdraw_amount, nullifier, already_withdrawn, recipient]`
and are encoded into the layout above before calling `claim`. Swap this Rust
prover for a snarkjs pipeline there; the contract is unchanged.
