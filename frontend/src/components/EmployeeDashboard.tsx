"use client";

import { useCallback, useEffect, useState } from "react";
import { hexToBuffer, vault } from "@/lib/contracts";
import { computeCommitment, generateProof } from "@/lib/prover";
import { decodeLink, StreamSecret, vestedBase } from "@/lib/stream";
import { fromBaseUnits, toBaseUnits } from "@/lib/config";
import { nowSecs, safeCurrentTime, PROOF_TIME_BUFFER } from "@/lib/stellar";
import { useWallet } from "@/components/WalletProvider";
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

// Shared atoms — Tailwind utilities composed into named pieces.
const card = "surface animate-rise rounded-lg p-5 sm:p-[26px]";
const cardIcon =
  "grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-border bg-violet/[0.12] text-violet";
const cardEyebrow = "mb-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint";
const cardTitle = "m-0 font-display text-[19px] font-semibold tracking-[-0.01em]";
const fieldLabel = "mb-[7px] mt-4 block text-[12.5px] font-medium text-muted";
const cellKey = "text-[11.5px] font-semibold uppercase tracking-[0.02em] text-faint";
const cellVal = "mt-[5px] font-mono text-[15px] font-medium tabular-nums";

export default function EmployeeDashboard() {
  const { address, connect: onConnect } = useWallet();
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
    if (s) setLinkText(`${window.location.origin}/employee?s=${s}`);
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

  // Every figure is measured at the SAME timestamp the proof will use
  // (wall-clock minus the proof buffer), so the numbers stay internally
  // consistent for the viewer: Total vested − Already withdrawn = Claimable.
  // The ticker still updates each second; it just trails real-time by the
  // buffer, which is imperceptible but keeps "claimable" honest.
  const vested = loaded
    ? vestedBase(
        nowSecs() - PROOF_TIME_BUFFER,
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
      if (maxBase <= 0n) {
        setErr("Nothing vested to withdraw yet.");
        setBusy(false);
        return;
      }

      let amountBase: bigint;
      if (withdrawWhole === "") {
        // Blank = withdraw everything currently claimable.
        amountBase = maxBase;
      } else {
        amountBase = toBaseUnits(Number(withdrawWhole));
        if (amountBase <= 0n) {
          setErr("Enter an amount greater than zero.");
          setBusy(false);
          return;
        }
        // Don't silently send less than the user asked for — tell them.
        if (amountBase > maxBase) {
          const maxWhole = fromBaseUnits(maxBase).toLocaleString(undefined, {
            maximumFractionDigits: 7,
          });
          setErr(
            `Only ${maxWhole} USDC is provably claimable right now. Lower the amount, or wait a few seconds for more to vest.`,
          );
          setBusy(false);
          return;
        }
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
    <div className="grid grid-cols-1 items-start gap-[18px] min-[880px]:grid-cols-2">
      <div>
        <div className={card}>
          <div className="mb-1.5 flex items-center gap-[13px]">
            <span className={cardIcon}>
              <KeyIcon size={20} />
            </span>
            <div>
              <div className={cardEyebrow}>Employee</div>
              <h2 className={cardTitle}>Access your stream</h2>
            </div>
          </div>
          <p className="mb-5 mt-1 text-[13.5px] leading-relaxed text-muted">
            Paste the secret link your employer sent (or open it directly). Your secret never leaves
            this browser.
          </p>
          <label className={fieldLabel}>Secret link</label>
          <textarea
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="https://…/?s=…"
          />
          <button className="btn mt-[18px] w-full" onClick={() => load(linkText)} disabled={busy}>
            <UserIcon size={16} /> Load stream
          </button>
          {err && !loaded && (
            <div className="mt-4 flex items-start gap-[9px] rounded-sm border border-danger/40 bg-danger/[0.07] px-3.5 py-3 text-[13px] leading-[1.5] text-danger [&>svg]:mt-px [&>svg]:shrink-0">
              <AlertIcon size={16} /> {err}
            </div>
          )}
        </div>
      </div>

      <div className="min-[880px]:sticky min-[880px]:top-[84px]">
        {!loaded ? (
          <div className="relative rounded-lg border border-dashed border-border-strong bg-[rgba(8,5,18,0.25)] px-[26px] py-[34px] text-center">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-violet/10 text-violet">
              <BoltIcon size={24} />
            </span>
            <h3 className="mb-2 mt-0 font-display text-base tracking-[-0.01em]">
              Your stream appears here
            </h3>
            <p className="m-0 mx-auto max-w-[34ch] text-[13px] leading-relaxed text-muted">
              Load a secret link and you&apos;ll watch your balance vest live — then withdraw with a
              proof built right here in your browser.
            </p>
            <ul className="mx-auto mt-5 max-w-[30ch] list-none p-0 text-left">
              {[
                "Paste the link your employer sent you",
                "Watch it vest, second by second",
                "Prove & withdraw — nothing else leaks",
              ].map((t, i) => (
                <li
                  key={t}
                  className="flex items-center gap-[11px] border-t border-border py-[9px] text-[12.5px] text-muted"
                >
                  <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] border border-border bg-violet/[0.12] text-[11px] font-bold text-violet">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className={card}>
            <div className="mb-1.5 flex items-center gap-[13px]">
              <span className={cardIcon}>
                <BoltIcon size={20} />
              </span>
              <div>
                <div className={cardEyebrow}>Live stream</div>
                <h2 className={cardTitle}>{loaded.secret.label || "Your stream"}</h2>
              </div>
            </div>

            <div className="mb-[18px] mt-1.5">
              <span className="mb-2 inline-flex items-center gap-2 text-xs text-muted">
                <span className="live-dot" /> Claimable right now
              </span>
              <div className="font-display text-[clamp(40px,9vw,56px)] font-bold leading-none tracking-[-0.03em] tabular-nums text-grad">
                {fromBaseUnits(claimableNow).toLocaleString(undefined, {
                  maximumFractionDigits: 7,
                })}
                <span className="mt-2.5 block font-sans text-[13px] font-medium tracking-normal text-muted [-webkit-text-fill-color:var(--muted)]">
                  USDC available to withdraw
                </span>
              </div>
            </div>

            <div className="mb-0.5 mt-[18px]">
              <div className="h-[9px] overflow-hidden rounded-full border border-border bg-[rgba(8,5,18,0.6)]">
                <div
                  className="shimmer-fill h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${vestedPct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11.5px] tabular-nums text-faint">
                <span>{vestedPct.toFixed(2)}% vested</span>
                <span>
                  {fromBaseUnits(vested).toLocaleString()} /{" "}
                  {fromBaseUnits(loaded.depositBase).toLocaleString()} USDC
                </span>
              </div>
            </div>

            <div className="my-[18px] mb-1 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-border bg-border">
              <div className="bg-[rgba(8,5,18,0.35)] px-4 py-3.5">
                <div className={cellKey}>Total vested</div>
                <div className={cellVal}>{fromBaseUnits(vested).toLocaleString()} USDC</div>
              </div>
              <div className="bg-[rgba(8,5,18,0.35)] px-4 py-3.5">
                <div className={cellKey}>Already withdrawn</div>
                <div className={cellVal}>
                  {fromBaseUnits(loaded.withdrawnBase).toLocaleString()} USDC
                </div>
              </div>
              <div className="bg-[rgba(8,5,18,0.35)] px-4 py-3.5">
                <div className={cellKey}>Stream total</div>
                <div className={cellVal}>
                  {fromBaseUnits(loaded.depositBase).toLocaleString()} USDC
                </div>
              </div>
              <div className="bg-[rgba(8,5,18,0.35)] px-4 py-3.5">
                <div className={cellKey}>Remaining</div>
                <div className={cellVal}>
                  {fromBaseUnits(loaded.depositBase - vested).toLocaleString()} USDC
                </div>
              </div>
            </div>

            <label className={fieldLabel}>Amount to withdraw (blank = all claimable)</label>
            <input
              type="number"
              value={withdrawWhole}
              placeholder={fromBaseUnits(claimableNow).toString()}
              onChange={(e) =>
                setWithdrawWhole(e.target.value === "" ? "" : Number(e.target.value))
              }
            />

            <button className="btn mt-[18px] w-full" onClick={withdraw} disabled={busy}>
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
              <div className="mt-4 overflow-hidden rounded-[14px] border border-border bg-[rgba(8,5,18,0.35)]">
                {steps.map((s, i) => {
                  const text = s.replace(/^✓ /, "");
                  const isDone = s.startsWith("✓");
                  const isActive = !isDone && busy && i === steps.length - 1;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-[11px] border-b border-border px-4 py-[13px] text-[13px] last:border-b-0 ${
                        isDone ? "text-text" : isActive ? "bg-violet/[0.06] text-text" : "text-muted"
                      }`}
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center ${isDone ? "text-ok" : ""}`}
                      >
                        {isDone ? (
                          <CheckIcon size={16} />
                        ) : isActive ? (
                          <span className="spinner" />
                        ) : (
                          <span className="opacity-40">○</span>
                        )}
                      </span>
                      {text}
                    </div>
                  );
                })}
              </div>
            )}
            {done && (
              <div className="mt-4 flex items-start gap-[9px] rounded-sm border border-ok/40 bg-ok/[0.07] px-3.5 py-3 text-[13px] leading-[1.5] text-ok [&>svg]:mt-px [&>svg]:shrink-0">
                <CheckIcon size={16} /> {done}
              </div>
            )}
            {err && (
              <div className="mt-4 flex items-start gap-[9px] rounded-sm border border-danger/40 bg-danger/[0.07] px-3.5 py-3 text-[13px] leading-[1.5] text-danger [&>svg]:mt-px [&>svg]:shrink-0">
                <AlertIcon size={16} /> {err}
              </div>
            )}

            <div className="mt-[18px] flex gap-[11px] rounded-[14px] border border-border bg-cyan/[0.04] px-4 py-3.5 text-[12.5px] leading-relaxed text-muted [&>svg]:mt-px [&>svg]:shrink-0 [&>svg]:text-cyan">
              <EyeOffIcon size={16} />
              <span>
                The proof reveals nothing but its own validity. The ledger records that a valid
                withdrawal occurred — not your rate, your total, or that this payment is linked to
                the employer&apos;s stream.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function mark(steps: string[]): string[] {
  return steps.map((s) => (s.startsWith("✓") ? s : `✓ ${s}`));
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 240 ? m.slice(0, 240) + "…" : m;
}
