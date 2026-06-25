"use client";

import { useCallback, useEffect, useState } from "react";
import { hexToBuffer, vault } from "@/lib/contracts";
import { computeCommitment, generateProof } from "@/lib/prover";
import { decodeLink, StreamSecret, vestedBase } from "@/lib/stream";
import { fromBaseUnits, toBaseUnits } from "@/lib/config";
import { nowSecs, safeCurrentTime } from "@/lib/stellar";

interface Loaded {
  secret: StreamSecret;
  commitment: string;
  depositBase: bigint;
  withdrawnBase: bigint;
}

export default function EmployeeDashboard({
  address,
  onConnect,
}: {
  address: string | null;
  onConnect: () => void;
}) {
  const [linkText, setLinkText] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tick, setTick] = useState(0);
  const [withdrawWhole, setWithdrawWhole] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Live vesting ticker.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-load from ?s= on first render.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (s) setLinkText(`${window.location.origin}/?s=${s}`);
  }, []);

  const load = useCallback(async (raw: string) => {
    setErr(null);
    setDone(null);
    try {
      const token = raw.includes("s=") ? raw.split("s=")[1] : raw.trim();
      const secret = decodeLink(token);
      const commitment = await computeCommitment(
        secret.secretHex,
        BigInt(secret.salaryRateBase),
        BigInt(secret.startTime),
      );
      const res = await vault().get_stream({ commitment: hexToBuffer(commitment) });
      const stream = res.result;
      if (!stream) {
        setErr("No stream found for this link on-chain yet.");
        setLoaded(null);
        return;
      }
      setLoaded({
        secret,
        commitment,
        depositBase: stream.deposit,
        withdrawnBase: stream.withdrawn,
      });
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);

  const vested = loaded
    ? vestedBase(
        nowSecs(),
        BigInt(loaded.secret.startTime),
        BigInt(loaded.secret.salaryRateBase),
        loaded.depositBase,
      )
    : 0n;
  const claimableBase = loaded ? vested - loaded.withdrawnBase : 0n;
  // `tick` is read so the ticker re-renders each second.
  void tick;

  async function withdraw() {
    if (!address) return onConnect();
    if (!loaded) return;
    setErr(null);
    setDone(null);
    setBusy(true);
    setSteps([]);

    try {
      const startTime = BigInt(loaded.secret.startTime);
      const rateBase = BigInt(loaded.secret.salaryRateBase);
      const currentTime = safeCurrentTime();

      // Cap to what is provably vested at `currentTime` minus prior withdrawals.
      const vestedAtProof = vestedBase(
        Number(currentTime),
        startTime,
        rateBase,
        loaded.depositBase,
      );
      const maxBase = vestedAtProof - loaded.withdrawnBase;
      let amountBase =
        withdrawWhole === "" ? maxBase : toBaseUnits(Number(withdrawWhole));
      if (amountBase > maxBase) amountBase = maxBase;
      if (amountBase <= 0n) {
        setErr("Nothing vested to withdraw yet.");
        setBusy(false);
        return;
      }

      setSteps(["Generating zero-knowledge proof in your browser…"]);
      const proof = await generateProof({
        secretHex: loaded.secret.secretHex,
        salaryRateBase: rateBase,
        startTime,
        currentTime,
        withdrawAmountBase: amountBase,
        alreadyWithdrawnBase: loaded.withdrawnBase,
        recipientStrkey: address,
      });

      setSteps((s) => [
        ...mark(s),
        "Submitting proof to Stellar (verified on-chain)…",
      ]);
      const tx = await vault(address).claim({
        recipient: address,
        commitment: hexToBuffer(loaded.commitment),
        current_time: currentTime,
        withdraw_amount: amountBase,
        nullifier: hexToBuffer(proof.nullifier),
        proof: {
          a: hexToBuffer(proof.proof_a),
          b: hexToBuffer(proof.proof_b),
          c: hexToBuffer(proof.proof_c),
        },
      });
      await tx.signAndSend();

      setSteps((s) => mark(s));
      setDone(`Withdrew ${fromBaseUnits(amountBase).toLocaleString()} USDC to your wallet.`);
      setLoaded({ ...loaded, withdrawnBase: loaded.withdrawnBase + amountBase });
      setWithdrawWhole("");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Access your stream</h2>
        <p className="hint">
          Paste the secret link your employer sent (or open it directly). Your
          secret never leaves this browser.
        </p>
        <label>Secret link</label>
        <textarea
          value={linkText}
          onChange={(e) => setLinkText(e.target.value)}
          placeholder="https://…/?s=…"
        />
        <button className="btn secondary" onClick={() => load(linkText)} disabled={busy}>
          Load stream
        </button>
        {err && <div className="status err">{err}</div>}
      </div>

      {loaded && (
        <div className="card">
          <h2>{loaded.secret.label || "Your stream"}</h2>
          <div className="big">
            {fromBaseUnits(claimableBase < 0n ? 0n : claimableBase).toLocaleString(
              undefined,
              { maximumFractionDigits: 7 },
            )}
            <span className="unit">USDC claimable now</span>
          </div>
          <div className="metric">
            <span className="k">Total vested</span>
            <span className="v">{fromBaseUnits(vested).toLocaleString()} USDC</span>
          </div>
          <div className="metric">
            <span className="k">Already withdrawn</span>
            <span className="v">
              {fromBaseUnits(loaded.withdrawnBase).toLocaleString()} USDC
            </span>
          </div>
          <div className="metric">
            <span className="k">Stream total (deposit)</span>
            <span className="v">
              {fromBaseUnits(loaded.depositBase).toLocaleString()} USDC
            </span>
          </div>

          <label>Amount to withdraw (blank = all claimable)</label>
          <input
            type="number"
            value={withdrawWhole}
            placeholder={fromBaseUnits(claimableBase < 0n ? 0n : claimableBase).toString()}
            onChange={(e) =>
              setWithdrawWhole(e.target.value === "" ? "" : Number(e.target.value))
            }
          />

          <button className="btn full" onClick={withdraw} disabled={busy}>
            {busy
              ? "Working…"
              : address
                ? "Generate proof & withdraw"
                : "Connect wallet to withdraw"}
          </button>

          {steps.length > 0 && (
            <div className="steps">
              {steps.map((s, i) => (
                <div key={i} className={s.startsWith("✓") ? "done" : ""}>
                  {s}
                </div>
              ))}
            </div>
          )}
          {done && <div className="status ok">{done}</div>}
          {err && <div className="status err">{err}</div>}

          <p className="observer">
            The proof reveals nothing but its own validity. The ledger records that
            a valid withdrawal occurred — not your rate, your total, or that this
            payment is linked to the employer&apos;s stream.
          </p>
        </div>
      )}
    </>
  );
}

function mark(steps: string[]): string[] {
  return steps.map((s) => (s.startsWith("✓") ? s : `✓ ${s}`));
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 240 ? m.slice(0, 240) + "…" : m;
}
