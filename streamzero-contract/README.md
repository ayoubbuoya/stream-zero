# StreamZero — Soroban contracts

Privacy-preserving payroll streaming on Stellar. An employer locks stablecoin and
posts only a Poseidon2 commitment; an employee withdraws vested funds by proving,
in zero knowledge, that the math checks out — without ever revealing their
identity, salary rate, or total allocation on-chain.

This workspace contains the on-chain half:

| Crate | What it is |
|-------|------------|
| [`contracts/streamzero`](contracts/streamzero) | The vault: deposit + commit, and verify + disburse with a native BN254 Groth16 verifier and nullifier-based replay protection. |
| [`contracts/mock-stablecoin`](contracts/mock-stablecoin) | A minimal SEP-41 token standing in for USDC on testnet. Swap for the real USDC SAC in production. |

The matching ZK circuit lives in [`../noir_circuit`](../noir_circuit).

## Why this works now (Protocol 25 "X-Ray")

The circuit hashes with **Poseidon2** over the **BN254** curve, and the proof is a
**Groth16** SNARK over BN254. On-chain verification became possible with the
**Protocol 25 "X-Ray" upgrade (January 2026)**, which shipped:

- **CAP-0074** — native BN254 elliptic-curve host functions (`g1_add`, `g1_mul`,
  `g1_msm`, `pairing_check`), the EIP-196/197 equivalent.
- **CAP-0075** — Poseidon / Poseidon2 host functions.

`soroban-sdk` 26.1 exposes the BN254 functions via `env.crypto().bn254()`, which is
exactly what [`groth16.rs`](contracts/streamzero/src/groth16.rs) calls.

> **Key insight:** Poseidon2 is only used *inside the circuit* to bind the
> commitment and nullifier. The contract never recomputes a hash — it only runs
> the Groth16 pairing check. So the vault depends solely on the BN254 host
> functions, not on the Poseidon host function.

## Architecture

```
 Employer                         StreamZero vault                    Employee
 --------                         ----------------                    --------
 H(secret,rate,start) ──create_stream(commitment, amount)──▶ store Stream{deposit}
 + deposit USDC                                              hold USDC in vault

                                                            (off-chain) generate
                                                            Groth16 proof π that
                                                            elapsed*rate ≥ amount
                                                            and commitment matches
 claim(recipient, commitment, current_time,
       withdraw_amount, nullifier, π) ◀───────────────────── submit π
        │
        ├─ stream exists?            (StreamNotFound)
        ├─ nullifier unused?         (NullifierAlreadyUsed)
        ├─ current_time ≤ ledger?    (TimestampInFuture)
        ├─ bn254 Groth16 verify π    (InvalidProof)
        ├─ withdrawn+amt ≤ deposit?  (InsufficientStreamBalance)
        └─ mark nullifier, pay recipient, emit Claimed
```

### Public inputs — order is load-bearing

The vault builds the Groth16 public-input vector in **exactly** the order the
circuit declares them in [`noir_circuit/src/main.nr`](../noir_circuit/src/main.nr):

```
[ commitment, current_time, withdraw_amount, nullifier_hash ]
```

`current_time` and `withdraw_amount` are encoded as 32-byte big-endian field
elements (right-aligned); `commitment` and `nullifier_hash` are already field
elements. If you change the circuit's input order or count, update both the
circuit and the `public_inputs` vector in [`lib.rs`](contracts/streamzero/src/lib.rs)
and the `VerifyingKey.ic` length.

### Byte encoding (contract ⇄ prover)

| Object | Size | Layout |
|--------|------|--------|
| G1 point (`A`, `C`, `IC[i]`, `alpha`) | 64 bytes | uncompressed big-endian `X ‖ Y` |
| G2 point (`B`, `beta`, `gamma`, `delta`) | 128 bytes | uncompressed big-endian `X.c1 X.c0 ‖ Y.c1 Y.c0` |
| Scalar `Fr` (public inputs) | 32 bytes | big-endian, reduced mod `r` |

Barretenberg / snarkjs do not emit this layout directly — the encoder in the
proving pipeline below converts them. Any mismatch in endianness, coordinate
order, or length will fail the pairing check.

## Build, test, deploy

```bash
# Unit tests (native, fast — runs the real BN254 host in-process)
cargo test

# Optimized WASM artifacts → target/wasm32v1-none/release/
stellar contract build
```

Deploy to testnet (Protocol 25+):

```bash
stellar keys generate --global deployer --network testnet --fund

# 1. Mock stablecoin
TOKEN=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/mock_stablecoin.wasm \
  --source deployer --network testnet \
  -- --admin deployer)

# 2. StreamZero vault (pass the circuit's verifying key as JSON — see proving pipeline)
VAULT=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/streamzero.wasm \
  --source deployer --network testnet \
  -- --admin deployer --token $TOKEN --vk "$(cat verifying_key.soroban.json)")
```

## Proving pipeline (off-chain)

The contract is the verifier; proofs are produced by the employee's browser/CLI.

1. **Compile the circuit** and run the trusted setup:
   ```bash
   cd noir_circuit
   nargo compile
   # Groth16 backend (e.g. via bb / snarkjs) → proving key + verifying key
   ```
2. **Generate a witness** from the employee's secret + the current ledger time,
   then **prove** to get `(A, B, C)`.
3. **Encode** the proof and verifying key into the Soroban byte layout above
   (the `encode_bn254_for_soroban` step). The VK becomes the `--vk` JSON; the
   proof becomes the `proof` argument to `claim`.
4. **Submit** `claim(...)`.

> `bb` (Barretenberg) is not bundled in this repo; install it with `noirup` /
> `bbup` to run the full pipeline. `nargo test` already exercises the circuit
> logic itself.

## Security notes

- **Replay protection** — each `nullifier_hash = H(secret, current_time)` may be
  spent once. The vault stores spent nullifiers in persistent storage.
- **Time binding** — the circuit *trusts* `current_time`; the vault rejects any
  `current_time` greater than the ledger timestamp so funds can't vest early.
- **Deposit cap** — cumulative withdrawals can never exceed the deposit, an
  on-chain backstop independent of the (private) vesting math.
- **⚠️ Recipient is not bound in the reference circuit.** A pending `claim` in the
  mempool could be front-run by resubmitting the same proof with a different
  `recipient`. **Recommended fix:** add `recipient` as a public input to the
  circuit and append it to the `public_inputs` vector in `claim`. Until then,
  treat claims as front-runnable.
- **⚠️ Cross-time over-withdrawal.** The reference circuit proves
  `total_vested ≥ withdraw_amount` but does not subtract prior withdrawals, so in
  principle multiple claims at different timestamps could each draw the full
  vested amount. The deposit cap bounds the loss to the deposited total; for true
  streaming semantics, track `withdrawn` inside the circuit (or bind it as a
  public input).

These are circuit-level concerns flagged for the team — the contract enforces
every guarantee it can given the current public-input set.
