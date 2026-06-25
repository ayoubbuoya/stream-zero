"use client";

import { useCallback, useEffect, useState } from "react";
import { token, vault, hexToBuffer } from "@/lib/contracts";
import { computeCommitment, randomSecretHex } from "@/lib/prover";
import { encodeLink } from "@/lib/stream";
import { fromBaseUnits, toBaseUnits } from "@/lib/config";
import { nowSecs } from "@/lib/stellar";

export default function EmployerDashboard({
  address,
  onConnect,
}: {
  address: string | null;
  onConnect: () => void;
}) {
  const [label, setLabel] = useState("Engineering — Alice");
  const [allocation, setAllocation] = useState(5000);
  const [days, setDays] = useState(30);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    try {
      const tx = await token(address).balance({ id: address });
      setBalance(tx.result);
    } catch {
      /* ignore */
    }
  }, [address]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  async function faucet() {
    if (!address) return onConnect();
    setErr(null);
    setBusy("Requesting test USDC…");
    try {
      const tx = await token(address).faucet({
        to: address,
        amount: toBaseUnits(10000),
      });
      await tx.signAndSend();
      await refreshBalance();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function createStream() {
    if (!address) return onConnect();
    setErr(null);
    setLink(null);

    const startTime = BigInt(nowSecs());
    const durationSecs = BigInt(Math.max(1, Math.round(days * 86400)));
    const allocationBase = toBaseUnits(allocation);
    const rateBase = allocationBase / durationSecs;
    if (rateBase <= 0n) {
      setErr("Allocation too small for this duration (rate rounds to 0).");
      return;
    }

    try {
      setBusy("Generating secret & commitment…");
      const secretHex = randomSecretHex();
      const commitment = await computeCommitment(secretHex, rateBase, startTime);

      setBusy("Posting commitment & locking funds…");
      const tx = await vault(address).create_stream({
        employer: address,
        commitment: hexToBuffer(commitment),
        amount: allocationBase,
      });
      await tx.signAndSend();

      const token0 = encodeLink({
        secretHex,
        salaryRateBase: rateBase.toString(),
        startTime: startTime.toString(),
        label,
      });
      const url = `${window.location.origin}/?s=${token0}`;
      setLink(url);
      await refreshBalance();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Fund a private stream</h2>
        <p className="hint">
          Lock test USDC and post only a Poseidon commitment. The employee&apos;s
          identity, salary rate, and total never appear on-chain.
        </p>

        <div className="metric">
          <span className="k">Your test USDC balance</span>
          <span className="v">
            {balance === null ? "—" : fromBaseUnits(balance).toLocaleString()} USDC
          </span>
        </div>
        <button className="btn secondary" onClick={faucet} disabled={!!busy}>
          {address ? "Get 10,000 test USDC" : "Connect wallet"}
        </button>

        <label>Employee label (private, stays in your browser)</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} />

        <div className="row">
          <div>
            <label>Total allocation (USDC)</label>
            <input
              type="number"
              value={allocation}
              onChange={(e) => setAllocation(Number(e.target.value))}
            />
          </div>
          <div>
            <label>Duration (days)</label>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </div>
        </div>

        <button className="btn full" onClick={createStream} disabled={!!busy}>
          {busy ?? (address ? "Create stream" : "Connect wallet to create")}
        </button>

        {err && <div className="status err">{err}</div>}
      </div>

      {link && (
        <div className="card">
          <h2>✅ Stream funded</h2>
          <p className="hint">
            Send this secret link to the employee over a private channel. It holds
            their secret — anyone with it can claim the vested funds.
          </p>
          <div className="mono">{link}</div>
          <button
            className="btn secondary"
            onClick={() => navigator.clipboard.writeText(link)}
          >
            Copy link
          </button>
          <p className="observer">
            On the public ledger an observer sees only that funds were locked
            under an opaque commitment — not who is being paid, the rate, or the
            total.
          </p>
        </div>
      )}
    </>
  );
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 240 ? m.slice(0, 240) + "…" : m;
}
