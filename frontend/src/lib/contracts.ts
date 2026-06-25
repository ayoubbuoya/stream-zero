"use client";

import { Buffer } from "buffer";
import { Client as VaultClient } from "streamzero";
import { Client as TokenClient } from "mock-stablecoin";
import { NETWORK_PASSPHRASE, RPC_URL, TOKEN_ID, VAULT_ID } from "./config";
import { signTransaction } from "./wallet";

export function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function base(publicKey?: string) {
  return {
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    allowHttp: RPC_URL.startsWith("http://"),
    publicKey,
    signTransaction: publicKey ? signTransaction : undefined,
  };
}

export function vault(publicKey?: string): VaultClient {
  return new VaultClient({ contractId: VAULT_ID, ...base(publicKey) });
}

export function token(publicKey?: string): TokenClient {
  return new TokenClient({ contractId: TOKEN_ID, ...base(publicKey) });
}

/** Build → sign → send a state-changing call and wait for the result. */
export async function send<T>(
  tx: { signAndSend: () => Promise<{ result: T }> },
): Promise<T> {
  const res = await tx.signAndSend();
  return res.result;
}
