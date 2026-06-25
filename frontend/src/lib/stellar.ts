"use client";

import { rpc } from "@stellar/stellar-sdk";
import { RPC_URL } from "./config";

export const server = new rpc.Server(RPC_URL);

/**
 * A safe `current_time` for proofs: slightly behind wall-clock so it never
 * exceeds the ledger timestamp at execution (the contract rejects future
 * timestamps). Ledger time ≈ real time, so a small buffer absorbs clock skew.
 */
export function safeCurrentTime(bufferSecs = 60): bigint {
  return BigInt(Math.floor(Date.now() / 1000) - bufferSecs);
}

export function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a;
}
