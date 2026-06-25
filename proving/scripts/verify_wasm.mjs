// Consistency gate: prove with the *browser* WASM module and confirm the bytes
// are identical to the Rust-generated fixture that the contract already verified
// on-chain (test_e2e_real_proof_claim_succeeds). Same library + deterministic
// seed => byte-identical proof, which means the browser path is verified too.
//
// Run: node proving/scripts/verify_wasm.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..", "streamzero-wasm", "pkg");

const wasm = await import(join(pkgDir, "streamzero_wasm.js"));
// --target web: initialise by handing it the .wasm bytes directly.
const bytes = readFileSync(join(pkgDir, "streamzero_wasm_bg.wasm"));
await wasm.default({ module_or_path: bytes });

const expected = JSON.parse(
  readFileSync(join(here, "..", "streamzero-prover", "artifacts", "demo_proof.json"), "utf8"),
);

const u = (n) => BigInt(n);

const commitment = wasm.compute_commitment(
  expected.secret_hex,
  u(expected.salary_rate),
  u(expected.start_time),
);
const nullifier = wasm.compute_nullifier(expected.secret_hex, u(expected.current_time));
const out = wasm.prove(
  expected.secret_hex,
  u(expected.salary_rate),
  u(expected.start_time),
  u(expected.current_time),
  u(expected.withdraw_amount),
  u(expected.already_withdrawn),
  expected.recipient_strkey,
);

const checks = [
  ["commitment (compute)", commitment, expected.commitment],
  ["commitment (prove)", out.commitment, expected.commitment],
  ["nullifier (compute)", nullifier, expected.nullifier],
  ["nullifier (prove)", out.nullifier, expected.nullifier],
  ["proof_a", out.proof_a, expected.proof_a],
  ["proof_b", out.proof_b, expected.proof_b],
  ["proof_c", out.proof_c, expected.proof_c],
];

let ok = true;
for (const [name, got, want] of checks) {
  const pass = got === want;
  ok &&= pass;
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  if (!pass) {
    console.log(`    got:  ${got}`);
    console.log(`    want: ${want}`);
  }
}

if (!ok) {
  console.error("\nWASM output does NOT match the contract-verified fixture.");
  process.exit(1);
}
console.log("\n✅ WASM proof is byte-identical to the on-chain-verified fixture.");
