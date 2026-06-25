<div align="center">

# 🌊 StreamZero

### Private payroll streaming on Stellar — salaries that vest by the second, with identities, rates, and totals hidden behind zero-knowledge proofs.

**Submission for [Stellar Hacks: Real-World ZK](https://dorahacks.io/hackathon/stellar-hacks-zk)**

`Soroban` · `Protocol 25/26 BN254 host functions` · `Groth16` · `Noir` · `Next.js` · **Live on Testnet**

</div>

---

## The problem

Companies want on-chain payroll: instant, global, low-fee settlement. But public ledgers expose everything. Pay employees with normal Stellar transactions and **anyone can read the chain and reverse-engineer every salary** — who you pay, how much, and at what rate. Existing streaming protocols (Sablier, etc.) leak the exact same data. No serious company will put its cap table on a public blockchain.

**StreamZero fixes the privacy paradox.** An employer locks USDC and posts only a cryptographic *commitment*. As time passes, the employee generates a zero-knowledge proof that they’ve vested `X` and withdraws — **without revealing their identity, salary rate, or total allocation.** The ledger only ever records: *a deposit happened, a valid proof was submitted, funds moved.*

---

## ⚡ It’s real — verified on-chain, today

This is not a mock. A **genuine Groth16 proof is verified on-chain** by Stellar’s native BN254 host functions (the headline feature of Protocol 25 “X-Ray”). Deployed and claimed on **public testnet (Protocol 27)**:

| Contract | Address |
|---|---|
| **StreamZero vault** (verifier) | [`CCEHDMIQ…KQFF`](https://stellar.expert/explorer/testnet/contract/CCEHDMIQKARR7S7LYELDXNTFMBFUY2JHC6R4DXUZW2LACPULS44OKQFF) |
| **Mock USDC** (SEP-41 token) | [`CCYX5NLU…LMYYW`](https://stellar.expert/explorer/testnet/contract/CCYX5NLUZ7ROI2KRAC4FNQR3JYCXX6YXU2ZL3STKJO5C4ZZ2WCDLMYYW) |

The vault’s **`Claimed` events** on the explorer are real ZK-verified withdrawals. The ZK is load-bearing: remove it and the contract cannot release a single token.

---

## How it works

```
 Employer                          StreamZero vault                     Employee
 --------                          (Soroban, BN254)                     --------
 secret  = random
 H = Poseidon(secret, rate, start)
 ───── create_stream(H, deposit) ─────▶  stores commitment H
                                         locks USDC                      (off-chain, in browser)
 ── shares secret link privately ──────────────────────────────────▶    prove in zero-knowledge:
                                                                          • I know the preimage of H
                                                                          • elapsed × rate ≥ amount
                                                                          • bound to MY address
                                          claim(amount, proof) ◀──────── submit Groth16 proof
                                          ├ verify pairing (BN254 host fns)
                                          ├ check nullifier unused
                                          ├ check timestamp ≤ ledger
                                          └ transfer USDC, emit Claimed
```

### What’s public vs. hidden

| On the public ledger | Hidden inside the proof |
|---|---|
| an opaque 32-byte commitment | employee identity |
| that *a* valid proof was submitted | salary rate |
| the withdrawal amount + that funds moved | total allocation / duration |

### The cryptography (genuinely doing work)

- **Commitment:** `Poseidon(secret, salary_rate, start_time)` — binds the salary terms without revealing them.
- **The proof** is a Groth16 zk-SNARK over **BN254** attesting six public inputs in a fixed order:
  `[ commitment, current_time, withdraw_amount, nullifier_hash, already_withdrawn, recipient ]`
  and the private statement: knowledge of the commitment preimage **and** `(current_time − start_time) × rate ≥ already_withdrawn + withdraw_amount`.
- **On-chain verification** uses Stellar’s native `bn254` host functions (`g1_msm`, `g1_add`, `g1_mul`, `pairing_check`) — a single pairing check, cheap and fast, exactly what Protocol 25/26 added BN254 for.

---

## What makes it technically real (not hand-waving)

- **🔗 On-chain Groth16/BN254 verification** via Protocol 25 host functions — a hand-written verifier in [`groth16.rs`](streamzero-contract/contracts/streamzero/src/groth16.rs) (~10 KB Wasm).
- **🧮 Browser proving in WebAssembly** — the prover (arkworks, compiled with `wasm-pack`) runs **in the employee’s browser**. We proved it byte-for-byte: WASM output is *identical* to native fixtures the contract verifies on-chain (see the consistency gate, [`test-wasm.mjs`](proving/test-wasm.mjs)).
- **🛡️ Front-running resistance** — the `recipient` is bound into the proof as `sha256(address)`, recomputed on-chain. A pending proof in the mempool **cannot be redirected** to a thief’s wallet.
- **🔁 Cumulative-vesting + replay safety** — the contract feeds its own `withdrawn` total into the proof as a public input, so a stale/replayed proof fails verification and total withdrawals can never exceed what truly vested.
- **🧬 Exact host byte-layout** — we read `soroban-env-host` to match its Ethereum-style BN254 encoding precisely (G1 `X‖Y` big-endian, G2 `c1‖c0`), so off-chain proofs deserialize correctly on-chain.

---

## Repository layout

| Path | What it is |
|---|---|
| [`noir_circuit/`](noir_circuit) | The ZK statement as a **Noir** circuit (Poseidon2) — the human-readable spec, unit-tested with `nargo test`. |
| [`streamzero-contract/`](streamzero-contract) | **Soroban** contracts: the vault + BN254 Groth16 verifier, and a mock SEP-41 USDC. |
| [`proving/`](proving) | The **Groth16/BN254 prover**: an arkworks library, a deterministic setup, and a `wasm-pack` module for the browser. |
| [`bindings/`](bindings) | Generated **TypeScript** contract clients. |
| [`frontend/`](frontend) | **Next.js + Stellar Wallets Kit** dApp — employer & employee dashboards with in-browser proving. |
| [`deployments/`](deployments) | Live testnet contract addresses. |

> **A note on Noir vs. Groth16.** Stellar’s BN254 host functions implement the **Groth16** verification equation (EIP-196/197 parity). The Noir circuit is the canonical statement spec; the deployed proof is a Groth16 SNARK over the same statement, since Noir’s `bb` backend emits UltraHonk (a different proving system) rather than Groth16. This keeps on-chain verification to a single cheap pairing check.

---

## Quickstart

**Prerequisites:** Rust + `wasm32` targets, [`stellar-cli`](https://developers.stellar.org/docs/tools/cli), Node 18+, `nargo`, and the [Freighter](https://freighter.app) wallet (set to **Testnet**).

```bash
# 1. ZK circuit — verify the statement
cd noir_circuit && nargo test            # 6 tests

# 2. Contracts — unit + real-proof e2e tests, then build Wasm
cd streamzero-contract && cargo test     # 15 + 4 tests
stellar contract build

# 3. Prover — deterministic setup + WASM module
cd proving/streamzero-prover && cargo run --release   # writes keys + fixtures
cd ../streamzero-wasm && wasm-pack build --target web # browser prover
cd .. && node test-wasm.mjs              # WASM == on-chain-verified proof ✓

# 4. Frontend
cd frontend && npm install && npm run dev   # http://localhost:3000
```

**Demo flow:** Connect Freighter → *Employer*: get test USDC, create a stream (use a short duration for fast vesting), copy the secret link → *Employee*: paste the link, watch the balance tick up, **Prove & withdraw** (the SNARK is generated in your browser) → funds land, privately.

---

## What’s verified

| Layer | Status |
|---|---|
| Noir circuit constraints | ✅ `nargo test` (6) |
| Contract logic + **real-proof on-chain verification** | ✅ `cargo test` (15) incl. `test_e2e_real_proof_claim_succeeds`, plus negative tests for wrong-amount and wrong-recipient |
| Mock SEP-41 token | ✅ `cargo test` (4) |
| Browser (WASM) ↔ on-chain consistency | ✅ byte-identical to verified fixtures |
| End-to-end on **public testnet** | ✅ deposit → prove → claim, funds moved |

---

## Security model

- **Replay protection:** one-time nullifiers in persistent storage **and** state-bound `already_withdrawn` — a proof is valid for exactly one withdrawn-state.
- **Time binding:** the contract rejects any proof whose `current_time` exceeds the ledger clock, so funds can’t vest early.
- **Front-running:** the payout address is bound into the proof; it can’t be swapped after generation.
- **Deposit cap:** an independent on-chain backstop — cumulative withdrawals never exceed the deposit.
- **Honest caveats:** the Groth16 trusted setup here is a single-contributor demo setup (a real deployment needs a proper ceremony); the “USDC” is a mock SEP-41 token on testnet (swap in the real USDC SAC for production — no vault changes needed).

---

## Tech stack

**ZK:** Noir (spec) · Groth16 over BN254 · Poseidon · arkworks · `wasm-pack`
**Chain:** Stellar Soroban · Protocol 25/26 BN254 + Poseidon host functions · `soroban-sdk` 26
**App:** Next.js (App Router) · React · Stellar Wallets Kit (Freighter) · `@stellar/stellar-sdk`

---

<div align="center">

Built for **[Stellar Hacks: Real-World ZK](https://dorahacks.io/hackathon/stellar-hacks-zk)** — where the zero-knowledge has to actually do the work.

</div>
