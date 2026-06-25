/* tslint:disable */
/* eslint-disable */

/**
 * commitment = Poseidon(secret, salary_rate, start_time), as 32-byte hex.
 */
export function compute_commitment(secret_hex: string, salary_rate: bigint, start_time: bigint): string;

/**
 * nullifier = Poseidon(secret, current_time), as 32-byte hex.
 */
export function compute_nullifier(secret_hex: string, current_time: bigint): string;

/**
 * Generate a withdrawal proof. Returns the commitment + nullifier + the proof
 * points, all encoded for direct submission to the contract's `claim`.
 */
export function prove(secret_hex: string, salary_rate: bigint, start_time: bigint, current_time: bigint, withdraw_amount: bigint, already_withdrawn: bigint, recipient_strkey: string): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly compute_commitment: (a: number, b: number, c: bigint, d: bigint) => [number, number, number, number];
    readonly compute_nullifier: (a: number, b: number, c: bigint) => [number, number, number, number];
    readonly prove: (a: number, b: number, c: bigint, d: bigint, e: bigint, f: bigint, g: bigint, h: number, i: number) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
