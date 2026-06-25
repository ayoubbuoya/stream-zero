"use client";

import { useCallback, useEffect, useState } from "react";
import { hexToBuffer, vault } from "@/lib/contracts";
import { computeCommitment, generateProof } from "@/lib/prover";
import { decodeLink, StreamSecret, vestedBase } from "@/lib/stream";
import { fromBaseUnits, toBaseUnits } from "@/lib/config";
import { nowSecs, safeCurrentTime } from "@/lib/stellar";
import {
  UserIcon,
  KeyIcon,
  ShieldIcon,
  CheckIcon,
  AlertIcon,
  EyeOffIcon,
  BoltIcon,
} from "@/components/icons";

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

  // Vesting progress (0–100) of the whole deposit.
  const vestedPct =
    loaded && loaded.depositBase > 0n
      ? Math.min(100, Number((vested * 10000n) / loaded.depositBase) / 100)
      : 0;

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

  const claimableNow = claimableBase < 0n ? 0n : claimableBase;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <span className="card-icon">
            <KeyIcon size={20} />
          </span>
          <div>
            <div className="eyebrow-sm">Employee</div>
            <h2>Access your stream</h2>
          </div>
        </div>
        <p className="hint">
          Paste the secret link your employer sent (or open it directly). Your secret never leaves
          this browser.
        </p>
        <label>Secret link</label>
        <textarea
          value={linkText}
          onChange={(e) => setLinkText(e.target.value)}
          placeholder="https://…/?s=…"
        />
        <button className="btn full" onClick={() => load(linkText)} disabled={busy}>
          <UserIcon size={16} /> Load stream
        </button>
        {err && !loaded && (
          <div className="status err">
            <AlertIcon size={16} /> {err}
          </div>
        )}
      </div>

      {loaded && (
        <div className="card">
          <div className="card-head">
            <span className="card-icon">
              <BoltIcon size={20} />
            </span>
            <div>
              <div className="eyebrow-sm">Live stream</div>
              <h2>{loaded.secret.label || "Your stream"}</h2>
            </div>
          </div>

          <div className="hero-stat">
            <span className="cap">
              <span className="live-dot" /> Claimable right now
            </span>
            <div className="big">
              {fromBaseUnits(claimableNow).toLocaleString(undefined, {
                maximumFractionDigits: 7,
              })}
              <span className="unit">USDC available to withdraw</span>
            </div>
          </div>

          <div className="progress">
            <div className="track">
              <div className="fill" style={{ width: `${vestedPct}%` }} />
            </div>
            <div className="legend">
              <span>{vestedPct.toFixed(2)}% vested</span>
              <span>
                {fromBaseUnits(vested).toLocaleString()} /{" "}
                {fromBaseUnits(loaded.depositBase).toLocaleString()} USDC
              </span>
            </div>
          </div>

          <div className="metric-grid">
            <div className="cell">
              <div className="k">Total vested</div>
              <div className="v">{fromBaseUnits(vested).toLocaleString()} USDC</div>
            </div>
            <div className="cell">
              <div className="k">Already withdrawn</div>
              <div className="v">
                {fromBaseUnits(loaded.withdrawnBase).toLocaleString()} USDC
              </div>
            </div>
            <div className="cell">
              <div className="k">Stream total</div>
              <div className="v">
                {fromBaseUnits(loaded.depositBase).toLocaleString()} USDC
              </div>
            </div>
            <div className="cell">
              <div className="k">Remaining</div>
              <div className="v">
                {fromBaseUnits(loaded.depositBase - vested).toLocaleString()} USDC
              </div>
            </div>
          </div>

          <label>Amount to withdraw (blank = all claimable)</label>
          <input
            type="number"
            value={withdrawWhole}
            placeholder={fromBaseUnits(claimableNow).toString()}
            onChange={(e) =>
              setWithdrawWhole(e.target.value === "" ? "" : Number(e.target.value))
            }
          />

          <button className="btn full" onClick={withdraw} disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" /> Working…
              </>
            ) : address ? (
              <>
                <ShieldIcon size={16} /> Generate proof &amp; withdraw
              </>
            ) : (
              "Connect wallet to withdraw"
            )}
          </button>

          {steps.length > 0 && (
            <div className="steps">
              {steps.map((s, i) => {
                const text = s.replace(/^✓ /, "");
                const isDone = s.startsWith("✓");
                const isActive = !isDone && busy && i === steps.length - 1;
                return (
                  <div
                    key={i}
                    className={`step ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}
                  >
                    <span className="ico">
                      {isDone ? (
                        <CheckIcon size={16} />
                      ) : isActive ? (
                        <span className="spinner" />
                      ) : (
                        <span style={{ opacity: 0.4 }}>○</span>
                      )}
                    </span>
                    {text}
                  </div>
                );
              })}
            </div>
          )}
          {done && (
            <div className="status ok">
              <CheckIcon size={16} /> {done}
            </div>
          )}
          {err && (
            <div className="status err">
              <AlertIcon size={16} /> {err}
            </div>
          )}

          <div className="observer">
            <EyeOffIcon size={16} />
            <span>
              The proof reveals nothing but its own validity. The ledger records that a valid
              withdrawal occurred — not your rate, your total, or that this payment is linked to the
              employer&apos;s stream.
            </span>
          </div>
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
