import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCEHDMIQKARR7S7LYELDXNTFMBFUY2JHC6R4DXUZW2LACPULS44OKQFF",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidAmount"},
  4: {message:"StreamExists"},
  5: {message:"StreamNotFound"},
  6: {message:"NullifierAlreadyUsed"},
  7: {message:"InvalidProof"},
  /**
   * `current_time` public input is in the future relative to the ledger
   */
  8: {message:"TimestampInFuture"},
  /**
   * cumulative withdrawals would exceed the deposited amount
   */
  9: {message:"InsufficientStreamBalance"}
}


/**
 * Public, privacy-preserving record of a funded stream. Note what is *absent*:
 * no employee address, no rate, no duration.
 */
export interface Stream {
  deposit: i128;
  employer: string;
  withdrawn: i128;
}

export type DataKey = {tag: "Admin", values: void} | {tag: "Token", values: void} | {tag: "Vk", values: void} | {tag: "Stream", values: readonly [Buffer]} | {tag: "Nullifier", values: readonly [Buffer]};




/**
 * A Groth16 proof `(A, B, C)`.
 */
export interface Proof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}


/**
 * Groth16 verifying key. Produced once per circuit at trusted-setup time and
 * stored in contract instance storage. `ic` has length `n_public_inputs + 1`.
 */
export interface VerifyingKey {
  alpha: Buffer;
  beta: Buffer;
  delta: Buffer;
  gamma: Buffer;
  ic: Array<Buffer>;
}

export interface Client {
  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Employee claims `withdraw_amount` by submitting a ZK proof.
   * 
   * The circuit's six public inputs are reconstructed here, in this exact
   * order:
   * `[commitment, current_time, withdraw_amount, nullifier_hash,
   * already_withdrawn, recipient]`
   * 
   * Two of them are derived on-chain rather than trusted from the caller,
   * which is what makes them safe:
   * * `already_withdrawn` = the stream's current `withdrawn` total, binding
   * the proof to the live state (a replayed/stale proof carries an old
   * value and fails verification), and enforcing cumulative vesting.
   * * `recipient` = `sha256(recipient_strkey)`, binding the proof to exactly
   * one payout address so a pending claim can't be front-run to another.
   */
  claim: ({recipient, commitment, current_time, withdraw_amount, nullifier, proof}: {recipient: string, commitment: Buffer, current_time: u64, withdraw_amount: u64, nullifier: Buffer, proof: Proof}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_vk transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin-only: rotate the verifying key (e.g. after a circuit revision).
   */
  set_vk: ({vk}: {vk: VerifyingKey}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a get_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_token: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a get_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_stream: ({commitment}: {commitment: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Stream>>>

  /**
   * Construct and simulate a create_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Employer deposits `amount` and registers `commitment`.
   * 
   * The commitment is the Poseidon2 hash the employer computed off-chain;
   * the contract treats it as an opaque 32-byte field element.
   */
  create_stream: ({employer, commitment, amount}: {employer: string, commitment: Buffer, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_nullifier_used transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_nullifier_used: ({nullifier}: {nullifier: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, token, vk}: {admin: string, token: string, vk: VerifyingKey},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, token, vk}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAMAAAAAAAAADFN0cmVhbUV4aXN0cwAAAAQAAAAAAAAADlN0cmVhbU5vdEZvdW5kAAAAAAAFAAAAAAAAABROdWxsaWZpZXJBbHJlYWR5VXNlZAAAAAYAAAAAAAAADEludmFsaWRQcm9vZgAAAAcAAABDYGN1cnJlbnRfdGltZWAgcHVibGljIGlucHV0IGlzIGluIHRoZSBmdXR1cmUgcmVsYXRpdmUgdG8gdGhlIGxlZGdlcgAAAAARVGltZXN0YW1wSW5GdXR1cmUAAAAAAAAIAAAAOGN1bXVsYXRpdmUgd2l0aGRyYXdhbHMgd291bGQgZXhjZWVkIHRoZSBkZXBvc2l0ZWQgYW1vdW50AAAAGUluc3VmZmljaWVudFN0cmVhbUJhbGFuY2UAAAAAAAAJ",
        "AAAAAQAAAHdQdWJsaWMsIHByaXZhY3ktcHJlc2VydmluZyByZWNvcmQgb2YgYSBmdW5kZWQgc3RyZWFtLiBOb3RlIHdoYXQgaXMgKmFic2VudCo6Cm5vIGVtcGxveWVlIGFkZHJlc3MsIG5vIHJhdGUsIG5vIGR1cmF0aW9uLgAAAAAAAAAABlN0cmVhbQAAAAAAAwAAAAAAAAAHZGVwb3NpdAAAAAALAAAAAAAAAAhlbXBsb3llcgAAABMAAAAAAAAACXdpdGhkcmF3bgAAAAAAAAs=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAFVG9rZW4AAAAAAAAAAAAAAAAAAAJWawAAAAAAAQAAAEZrZXllZCBieSB0aGUgUG9zZWlkb24yIGNvbW1pdG1lbnQgKGEgQk4yNTQgZmllbGQgZWxlbWVudCwgMzIgYnl0ZXMgQkUpAAAAAAAGU3RyZWFtAAAAAAABAAAD7gAAACAAAAABAAAAOWtleWVkIGJ5IGEgc3BlbnQgbnVsbGlmaWVyIGhhc2g7IHByZXNlbmNlID09IGFscmVhZHkgdXNlZAAAAAAAAAlOdWxsaWZpZXIAAAAAAAABAAAD7gAAACA=",
        "AAAABQAAAAAAAAAAAAAAB0NsYWltZWQAAAAAAQAAAAdjbGFpbWVkAAAAAAMAAAAAAAAACmNvbW1pdG1lbnQAAAAAA+4AAAAgAAAAAQAAAAAAAAAJbnVsbGlmaWVyAAAAAAAD7gAAACAAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAqVFbXBsb3llZSBjbGFpbXMgYHdpdGhkcmF3X2Ftb3VudGAgYnkgc3VibWl0dGluZyBhIFpLIHByb29mLgoKVGhlIGNpcmN1aXQncyBzaXggcHVibGljIGlucHV0cyBhcmUgcmVjb25zdHJ1Y3RlZCBoZXJlLCBpbiB0aGlzIGV4YWN0Cm9yZGVyOgpgW2NvbW1pdG1lbnQsIGN1cnJlbnRfdGltZSwgd2l0aGRyYXdfYW1vdW50LCBudWxsaWZpZXJfaGFzaCwKYWxyZWFkeV93aXRoZHJhd24sIHJlY2lwaWVudF1gCgpUd28gb2YgdGhlbSBhcmUgZGVyaXZlZCBvbi1jaGFpbiByYXRoZXIgdGhhbiB0cnVzdGVkIGZyb20gdGhlIGNhbGxlciwKd2hpY2ggaXMgd2hhdCBtYWtlcyB0aGVtIHNhZmU6CiogYGFscmVhZHlfd2l0aGRyYXduYCA9IHRoZSBzdHJlYW0ncyBjdXJyZW50IGB3aXRoZHJhd25gIHRvdGFsLCBiaW5kaW5nCnRoZSBwcm9vZiB0byB0aGUgbGl2ZSBzdGF0ZSAoYSByZXBsYXllZC9zdGFsZSBwcm9vZiBjYXJyaWVzIGFuIG9sZAp2YWx1ZSBhbmQgZmFpbHMgdmVyaWZpY2F0aW9uKSwgYW5kIGVuZm9yY2luZyBjdW11bGF0aXZlIHZlc3RpbmcuCiogYHJlY2lwaWVudGAgPSBgc2hhMjU2KHJlY2lwaWVudF9zdHJrZXkpYCwgYmluZGluZyB0aGUgcHJvb2YgdG8gZXhhY3RseQpvbmUgcGF5b3V0IGFkZHJlc3Mgc28gYSBwZW5kaW5nIGNsYWltIGNhbid0IGJlIGZyb250LXJ1biB0byBhbm90aGVyLgAAAAAAAAVjbGFpbQAAAAAAAAYAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACmNvbW1pdG1lbnQAAAAAA+4AAAAgAAAAAAAAAAxjdXJyZW50X3RpbWUAAAAGAAAAAAAAAA93aXRoZHJhd19hbW91bnQAAAAABgAAAAAAAAAJbnVsbGlmaWVyAAAAAAAD7gAAACAAAAAAAAAABXByb29mAAAAAAAH0AAAAAVQcm9vZgAAAAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAEVBZG1pbi1vbmx5OiByb3RhdGUgdGhlIHZlcmlmeWluZyBrZXkgKGUuZy4gYWZ0ZXIgYSBjaXJjdWl0IHJldmlzaW9uKS4AAAAAAAAGc2V0X3ZrAAAAAAABAAAAAAAAAAJ2awAAAAAH0AAAAAxWZXJpZnlpbmdLZXkAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPoAAAAEw==",
        "AAAAAAAAAAAAAAAJZ2V0X3Rva2VuAAAAAAAAAAAAAAEAAAPoAAAAEw==",
        "AAAABQAAAAAAAAAAAAAADVN0cmVhbUNyZWF0ZWQAAAAAAAABAAAADnN0cmVhbV9jcmVhdGVkAAAAAAADAAAAAAAAAApjb21taXRtZW50AAAAAAPuAAAAIAAAAAEAAAAAAAAACGVtcGxveWVyAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAAAAAAAAAAAAAKZ2V0X3N0cmVhbQAAAAAAAQAAAAAAAAAKY29tbWl0bWVudAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAAGU3RyZWFtAAA=",
        "AAAAAAAAAPZBdG9taWMgaW5pdGlhbGl6YXRpb24gKFByb3RvY29sIDIyKyBjb25zdHJ1Y3RvcikuCgoqIGBhZG1pbmAgICDigJQgbWF5IHJvdGF0ZSB0aGUgdmVyaWZ5aW5nIGtleS4KKiBgdG9rZW5gICAg4oCUIFNFUC00MSAvIFNBQyBhZGRyZXNzIG9mIHRoZSBzdHJlYW1pbmcgYXNzZXQgKG1vY2sgbm93LCBVU0RDIGxhdGVyKS4KKiBgdmtgICAgICAg4oCUIEdyb3RoMTYgdmVyaWZ5aW5nIGtleSBmb3IgdGhlIFN0cmVhbVplcm8gY2lyY3VpdC4AAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAAnZrAAAAAAfQAAAADFZlcmlmeWluZ0tleQAAAAA=",
        "AAAAAAAAALhFbXBsb3llciBkZXBvc2l0cyBgYW1vdW50YCBhbmQgcmVnaXN0ZXJzIGBjb21taXRtZW50YC4KClRoZSBjb21taXRtZW50IGlzIHRoZSBQb3NlaWRvbjIgaGFzaCB0aGUgZW1wbG95ZXIgY29tcHV0ZWQgb2ZmLWNoYWluOwp0aGUgY29udHJhY3QgdHJlYXRzIGl0IGFzIGFuIG9wYXF1ZSAzMi1ieXRlIGZpZWxkIGVsZW1lbnQuAAAADWNyZWF0ZV9zdHJlYW0AAAAAAAADAAAAAAAAAAhlbXBsb3llcgAAABMAAAAAAAAACmNvbW1pdG1lbnQAAAAAA+4AAAAgAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAARaXNfbnVsbGlmaWVyX3VzZWQAAAAAAAABAAAAAAAAAAludWxsaWZpZXIAAAAAAAPuAAAAIAAAAAEAAAAB",
        "AAAAAQAAABxBIEdyb3RoMTYgcHJvb2YgYChBLCBCLCBDKWAuAAAAAAAAAAVQcm9vZgAAAAAAAAMAAAAAAAAAAWEAAAAAAAPuAAAAQAAAAAAAAAABYgAAAAAAA+4AAACAAAAAAAAAAAFjAAAAAAAD7gAAAEA=",
        "AAAAAQAAAJZHcm90aDE2IHZlcmlmeWluZyBrZXkuIFByb2R1Y2VkIG9uY2UgcGVyIGNpcmN1aXQgYXQgdHJ1c3RlZC1zZXR1cCB0aW1lIGFuZApzdG9yZWQgaW4gY29udHJhY3QgaW5zdGFuY2Ugc3RvcmFnZS4gYGljYCBoYXMgbGVuZ3RoIGBuX3B1YmxpY19pbnB1dHMgKyAxYC4AAAAAAAAAAAAMVmVyaWZ5aW5nS2V5AAAABQAAAAAAAAAFYWxwaGEAAAAAAAPuAAAAQAAAAAAAAAAEYmV0YQAAA+4AAACAAAAAAAAAAAVkZWx0YQAAAAAAA+4AAACAAAAAAAAAAAVnYW1tYQAAAAAAA+4AAACAAAAAAAAAAAJpYwAAAAAD6gAAA+4AAABA" ]),
      options
    )
  }
  public readonly fromJSON = {
    claim: this.txFromJSON<Result<void>>,
        set_vk: this.txFromJSON<Result<void>>,
        get_admin: this.txFromJSON<Option<string>>,
        get_token: this.txFromJSON<Option<string>>,
        get_stream: this.txFromJSON<Option<Stream>>,
        create_stream: this.txFromJSON<Result<void>>,
        is_nullifier_used: this.txFromJSON<boolean>
  }
}