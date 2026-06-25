import deployments from "./deployments.testnet.json";

export const NETWORK_PASSPHRASE = deployments.networkPassphrase;
export const RPC_URL = deployments.rpcUrl;
export const VAULT_ID = deployments.contracts.streamzeroVault;
export const TOKEN_ID = deployments.contracts.mockStablecoin;

// The mock stablecoin uses 7 decimals (like USDC). Amounts in the contracts are
// raw base units; the UI works in whole tokens and scales by this.
export const DECIMALS = 7;
export const UNIT = 10 ** DECIMALS;

export function toBaseUnits(whole: number): bigint {
  return BigInt(Math.round(whole * UNIT));
}

export function fromBaseUnits(base: bigint | number): number {
  return Number(base) / UNIT;
}
