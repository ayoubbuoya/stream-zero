"use client";

// Browser proving: loads the wasm module (with the embedded proving key) and
// exposes the StreamZero crypto. Same code that produced the on-chain-verified
// proofs, so commitments and proofs match the deployed verifying key.

import init, {
  compute_commitment,
  compute_nullifier,
  prove as wasmProve,
} from "@/wasm/streamzero_wasm.js";

let ready: Promise<unknown> | null = null;
function ensure(): Promise<unknown> {
  if (!ready) ready = init();
  return ready;
}

/** 32-byte random secret as lowercase hex. Kept entirely off-chain. */
export function randomSecretHex(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function computeCommitment(
  secretHex: string,
  salaryRateBase: bigint,
  startTime: bigint,
): Promise<string> {
  await ensure();
  return compute_commitment(secretHex, salaryRateBase, startTime);
}

export async function computeNullifier(
  secretHex: string,
  currentTime: bigint,
): Promise<string> {
  await ensure();
  return compute_nullifier(secretHex, currentTime);
}

export interface ProofResult {
  commitment: string;
  nullifier: string;
  proof_a: string;
  proof_b: string;
  proof_c: string;
}

export async function generateProof(args: {
  secretHex: string;
  salaryRateBase: bigint;
  startTime: bigint;
  currentTime: bigint;
  withdrawAmountBase: bigint;
  alreadyWithdrawnBase: bigint;
  recipientStrkey: string;
}): Promise<ProofResult> {
  await ensure();
  return wasmProve(
    args.secretHex,
    args.salaryRateBase,
    args.startTime,
    args.currentTime,
    args.withdrawAmountBase,
    args.alreadyWithdrawnBase,
    args.recipientStrkey,
  ) as ProofResult;
}
