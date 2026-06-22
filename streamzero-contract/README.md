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
[ commitment, current_time, withdraw_amount, nullifier_hash, already_withdrawn, recipient ]
```

| Input | Source | Encoding |
|-------|--------|----------|
| `commitment` | stored at `create_stream` | field element (32B) |
| `current_time` | caller, checked ≤ ledger time | u64 → 32B big-endian |
| `withdraw_amount` | caller | u64 → 32B big-endian |
| `nullifier_hash` | caller, checked unused | field element (32B) |
| `already_withdrawn` | **derived on-chain** from `stream.withdrawn` | u64 → 32B big-endian |
| `recipient` | **derived on-chain** as `sha256(recipient_strkey)` | 32B, reduced mod r |

The last two are computed by the contract, not trusted from the caller — that is
what makes them safe (see Security). If you change the circuit's input order or
count, update the circuit, the `public_inputs` vector in
[`lib.rs`](contracts/streamzero/src/lib.rs), **and** the `VerifyingKey.ic` length
(must equal `n_public + 1` = 7).

**Recipient binding — off-chain side:** when generating a proof, the prover must
set the `recipient` input to `sha256(utf8(strkey)) mod r`, where `strkey` is the
payout address (`G...`/`C...`). The contract computes the identical value from
the `recipient: Address` argument, so the proof only verifies for that one
address.

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

- **Replay protection** — two independent mechanisms. (1) Each
  `nullifier_hash = H(secret, current_time)` may be spent once; spent nullifiers
  live in persistent storage. (2) `already_withdrawn` is bound to live state, so
  a stale proof carries an outdated value and fails verification.
- **Time binding** — the circuit *trusts* `current_time`; the vault rejects any
  `current_time` greater than the ledger timestamp so funds can't vest early.
- **Cumulative vesting (in-circuit)** — the circuit proves
  `total_vested ≥ already_withdrawn + withdraw_amount`, where `already_withdrawn`
  is supplied by the contract from `stream.withdrawn`. Total claims over the
  stream's life can never exceed what has actually vested — not just any single
  claim. The deposit cap (`withdrawn + amount ≤ deposit`) remains as an
  independent on-chain backstop.
- **Recipient binding (anti-front-running)** — `recipient` is a circuit public
  input set to `sha256(strkey)`. The contract recomputes it from the actual
  payout address, so a pending proof in the mempool cannot be redirected to a
  different recipient: changing the address changes the public inputs and the
  pairing check fails.

> Both gaps present in the original reference circuit (unbound recipient,
> no cross-time tracking) are now fixed in [`main.nr`](../noir_circuit/src/main.nr)
> and enforced on-chain in [`lib.rs`](contracts/streamzero/src/lib.rs).
