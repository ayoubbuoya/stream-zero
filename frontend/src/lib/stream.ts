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
  // UTF-8 encode before base64 so labels with non-Latin1 chars (emoji, accents)
  // don't break btoa.
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeLink(token: string): StreamSecret {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
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
