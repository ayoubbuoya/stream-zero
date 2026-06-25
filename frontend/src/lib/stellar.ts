"use client";

import { rpc } from "@stellar/stellar-sdk";
import { RPC_URL } from "./config";

export const server = new rpc.Server(RPC_URL);

/**
 * Seconds the proof timestamp lags wall-clock. Absorbs clock skew so the
 * proof's `current_time` never exceeds the ledger clock at execution (the
 * contract rejects future timestamps). Used for both the proof and the
 * "claimable" figure shown in the UI, so the two always agree.
 */
export const PROOF_TIME_BUFFER = 20;

/**
 * A safe `current_time` for proofs: slightly behind wall-clock so it never
 * exceeds the ledger timestamp at execution. Ledger time ≈ real time, so a
 * small buffer absorbs clock skew.
 */
export function safeCurrentTime(bufferSecs = PROOF_TIME_BUFFER): bigint {
  return BigInt(Math.floor(Date.now() / 1000) - bufferSecs);
}

export function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a;
}
