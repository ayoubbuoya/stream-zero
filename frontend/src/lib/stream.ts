"use client";

// Off-chain stream descriptor: everything the employee needs to reconstruct the
// commitment and prove. Shared via a link; never touches the ledger.

export interface StreamSecret {
  secretHex: string;
  salaryRateBase: string; // bigint as string (base units / second)
  startTime: string; // bigint as string (unix seconds)
  label?: string;
}

export function encodeLink(s: StreamSecret): string {
  const json = JSON.stringify(s);
  const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64;
}

export function decodeLink(token: string): StreamSecret {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(b64);
  return JSON.parse(json) as StreamSecret;
}

/** Linearly vested base units at time `now`, capped at the deposit. */
export function vestedBase(
  now: number,
  startTime: bigint,
  salaryRateBase: bigint,
  depositBase: bigint,
): bigint {
  const elapsed = BigInt(Math.max(0, now - Number(startTime)));
  const vested = elapsed * salaryRateBase;
  return vested > depositBase ? depositBase : vested;
}
