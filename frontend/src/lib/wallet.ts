"use client";

import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
} from "@creit.tech/stellar-wallets-kit";
import { NETWORK_PASSPHRASE } from "./config";

let kit: StellarWalletsKit | null = null;

export function getKit(): StellarWalletsKit {
  if (!kit) {
    kit = new StellarWalletsKit({
      network: NETWORK_PASSPHRASE as WalletNetwork,
      selectedWalletId: FREIGHTER_ID,
      modules: allowAllModules(),
    });
  }
  return kit;
}

/** Opens the wallet picker and returns the chosen address. */
export async function connect(): Promise<string> {
  const k = getKit();
  return new Promise<string>((resolve, reject) => {
    k.openModal({
      onWalletSelected: async (option) => {
        try {
          k.setWallet(option.id);
          const { address } = await k.getAddress();
          resolve(address);
        } catch (e) {
          reject(e);
        }
      },
      onClosed: (err) => reject(err ?? new Error("wallet selection cancelled")),
    });
  });
}

/** Sign callback in the shape the contract bindings expect. */
export async function signTransaction(
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  const k = getKit();
  const { signedTxXdr, signerAddress } = await k.signTransaction(xdr, {
    networkPassphrase: (opts?.networkPassphrase as WalletNetwork) ?? (NETWORK_PASSPHRASE as WalletNetwork),
    address: opts?.address,
  });
  return { signedTxXdr, signerAddress };
}
