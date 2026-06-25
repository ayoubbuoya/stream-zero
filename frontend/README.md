# StreamZero frontend

Next.js dApp for private payroll streaming on Stellar. Employers fund streams
under a Poseidon commitment; employees prove vested balances **in the browser**
(WebAssembly) and withdraw with an on-chain Groth16/BN254 verification.

## Stack
- **Next.js 14** (App Router) + React 18
- **Stellar Wallets Kit** (Freighter, etc.)
- **WASM prover** — `proving/streamzero-wasm` compiled with `wasm-pack`, embedded
  proving key; the single source of truth for the Poseidon commitment + proof
- **Contract bindings** — generated TypeScript clients in `../bindings`
- Talks to the contracts deployed on **testnet** (see `../deployments/testnet.json`)

## Prerequisites
- Node 18+ and the **Freighter** browser extension set to **Testnet**.
- The local bindings must be built once (already done if you followed the repo):
  ```bash
  (cd ../bindings/streamzero && npm install && npm run build)
  (cd ../bindings/mock-stablecoin && npm install && npm run build)
  ```

## Run
```bash
npm install
npm run dev      # http://localhost:3000
```

## Demo flow
1. **Employer tab** → Connect wallet → "Get 10,000 test USDC" (faucet) → set an
   allocation + duration → **Create stream**. Copy the generated secret link.
2. **Employee tab** → paste the link (or open it directly) → watch the balance
   vest by the second → **Generate proof & withdraw**. The proof is built in your
   browser; Stellar verifies it on-chain and releases the funds.
3. **Observer** → open the transactions on
   [stellar.expert (testnet)](https://stellar.expert/explorer/testnet): you see
   funds move under an opaque commitment, but never the rate, total, or who is
   paid.

## Regenerating after a contract change
- Redeploy, then refresh `../deployments/testnet.json` and re-run
  `stellar contract bindings typescript …` for both contracts.
- If the circuit/keys change, rerun `proving/streamzero-prover` and rebuild the
  WASM (`wasm-pack build --target web` in `proving/streamzero-wasm`), then copy
  `pkg/*` into `src/wasm/`.

## How the pieces line up
- `src/lib/prover.ts` — loads the WASM, exposes `computeCommitment` / `generateProof`.
- `src/lib/contracts.ts` — typed vault + token clients, wired to the wallet signer.
- `src/lib/wallet.ts` — Stellar Wallets Kit connect + sign.
- `src/components/EmployerDashboard.tsx` / `EmployeeDashboard.tsx` — the two flows.

The same WASM proof bytes are byte-identical to the ones verified on-chain in the
contract's `test_e2e_real_proof_claim_succeeds` and in the live testnet round-trip.
