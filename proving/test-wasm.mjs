// Consistency gate: the browser (wasm) prover must produce exactly what the
// native prover produced for the demo scenario — and those native outputs are
// what the contract's e2e test verifies on-chain. Byte-equality here ⇒ a
// wasm-generated proof verifies against the deployed verifying key.

import { readFile } from "node:fs/promises";
import init, {
  compute_commitment,
  compute_nullifier,
  prove,
} from "./streamzero-wasm/pkg/streamzero_wasm.js";

const ref = JSON.parse(
  await readFile("./streamzero-prover/artifacts/demo_proof.json", "utf8"),
);

function check(label, got, want) {
  const ok = got === want;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) {
    console.log(`   wasm: ${got}`);
    console.log(`   ref : ${want}`);
    process.exitCode = 1;
  }
}

async function main() {
  await init(await readFile("./streamzero-wasm/pkg/streamzero_wasm_bg.wasm"));

  const salaryRate = BigInt(ref.salary_rate);
  const startTime = BigInt(ref.start_time);
  const currentTime = BigInt(ref.current_time);

  const commitment = compute_commitment(ref.secret_hex, salaryRate, startTime);
  const nullifier = compute_nullifier(ref.secret_hex, currentTime);
  const p = prove(
    ref.secret_hex,
    salaryRate,
    startTime,
    currentTime,
    BigInt(ref.withdraw_amount),
    BigInt(ref.already_withdrawn),
    ref.recipient_strkey,
  );

  check("compute_commitment", commitment, ref.commitment);
  check("compute_nullifier", nullifier, ref.nullifier);
  check("prove() commitment", p.commitment, ref.commitment);
  check("prove() nullifier", p.nullifier, ref.nullifier);
  check("proof A", p.proof_a, ref.proof_a);
  check("proof B", p.proof_b, ref.proof_b);
  check("proof C", p.proof_c, ref.proof_c);

  console.log(
    process.exitCode
      ? "\nFAILED: wasm/native mismatch"
      : "\nAll consistent ✓  (wasm proof == native fixtures verified on-chain)",
  );
}

main();
