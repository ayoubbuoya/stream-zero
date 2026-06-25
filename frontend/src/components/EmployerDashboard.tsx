"use client";

import { useCallback, useEffect, useState } from "react";
import { token, vault, hexToBuffer } from "@/lib/contracts";
import { computeCommitment, randomSecretHex } from "@/lib/prover";
import { encodeLink } from "@/lib/stream";
import { fromBaseUnits, toBaseUnits } from "@/lib/config";
import { nowSecs } from "@/lib/stellar";
import { useWallet } from "@/components/WalletProvider";
import {
  BuildingIcon,
  LockIcon,
  CheckIcon,
  CopyIcon,
  EyeOffIcon,
  AlertIcon,
  WalletIcon,
} from "@/components/icons";

// Shared atoms — Tailwind utilities composed into named pieces.
const card = "surface animate-rise rounded-lg p-5 sm:p-[26px]";
const cardIcon =
  "grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-border bg-violet/[0.12] text-violet";
const cardEyebrow = "mb-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint";
const cardTitle = "m-0 font-display text-[19px] font-semibold tracking-[-0.01em]";
const fieldLabel = "mb-[7px] mt-4 block text-[12.5px] font-medium text-muted";
const cellKey = "text-[11.5px] font-semibold uppercase tracking-[0.02em] text-faint";
const cellVal = "mt-[5px] font-mono text-[15px] font-medium tabular-nums";

export default function EmployerDashboard() {
  const { address, connect: onConnect } = useWallet();
  const [label, setLabel] = useState("Engineering — Alice");
  const [allocation, setAllocation] = useState(5000);
  const [days, setDays] = useState(30);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  // Live preview of the per-day / per-second drip the employee will see.
  const perDay = days > 0 ? allocation / days : 0;
  const perSec = days > 0 ? allocation / (days * 86400) : 0;

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
    setCopied(false);

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
      const url = `${window.location.origin}/employee?s=${token0}`;
      setLink(url);
      await refreshBalance();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 2 });

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] min-[880px]:grid-cols-2">
      <div>
        <div className={card}>
          <div className="mb-1.5 flex items-center gap-[13px]">
            <span className={cardIcon}>
              <BuildingIcon size={20} />
            </span>
            <div>
              <div className={cardEyebrow}>Employer</div>
              <h2 className={cardTitle}>Fund a private stream</h2>
            </div>
          </div>
          <p className="mb-5 mt-1 text-[13.5px] leading-relaxed text-muted">
            Lock test USDC and post only a Poseidon commitment. The employee&apos;s identity, salary
            rate, and total never appear on-chain.
          </p>

          <div className="mb-4 flex items-center justify-between gap-3 rounded-[14px] border border-border bg-[rgba(8,5,18,0.4)] px-4 py-3.5">
            <span className="text-[12.5px] text-muted">Your test USDC balance</span>
            <span className="font-mono text-[15px] font-semibold tabular-nums">
              {balance === null ? "—" : fromBaseUnits(balance).toLocaleString()} USDC
            </span>
          </div>
          <button className="btn btn-secondary mt-[18px] w-full" onClick={faucet} disabled={!!busy}>
            {address ? (
              <>
                <WalletIcon size={16} /> Get 10,000 test USDC
              </>
            ) : (
              "Connect wallet"
            )}
          </button>

          <label className={fieldLabel}>Employee label (private — stays in your browser)</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />

          <div className="flex flex-col gap-0 sm:flex-row sm:gap-3.5">
            <div className="flex-1">
              <label className={fieldLabel}>Total allocation (USDC)</label>
              <input
                type="number"
                value={allocation}
                onChange={(e) => setAllocation(Number(e.target.value))}
              />
            </div>
            <div className="flex-1">
              <label className={fieldLabel}>Duration (days)</label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </div>
          </div>

          {allocation > 0 && days > 0 && (
            <div className="my-[18px] mb-1 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-border bg-border">
              <div className="bg-[rgba(8,5,18,0.35)] px-4 py-3.5">
                <div className={cellKey}>Vests per day</div>
                <div className={cellVal}>{fmt(perDay)} USDC</div>
              </div>
              <div className="bg-[rgba(8,5,18,0.35)] px-4 py-3.5">
                <div className={cellKey}>Vests per second</div>
                <div className={cellVal}>{fmt(perSec)} USDC</div>
              </div>
            </div>
          )}

          <button className="btn mt-[18px] w-full" onClick={createStream} disabled={!!busy}>
            {busy ? (
              <>
                <span className="spinner" /> {busy}
              </>
            ) : address ? (
              <>
                <LockIcon size={16} /> Create stream &amp; lock funds
              </>
            ) : (
              "Connect wallet to create"
            )}
          </button>

          {err && (
            <div className="mt-4 flex items-start gap-[9px] rounded-sm border border-danger/40 bg-danger/[0.07] px-3.5 py-3 text-[13px] leading-[1.5] text-danger [&>svg]:mt-px [&>svg]:shrink-0">
              <AlertIcon size={16} /> {err}
            </div>
          )}
        </div>
      </div>

      <div className="min-[880px]:sticky min-[880px]:top-[84px]">
        {!link ? (
          <div className="relative rounded-lg border border-dashed border-border-strong bg-[rgba(8,5,18,0.25)] px-[26px] py-[34px] text-center">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-violet/10 text-violet">
              <LockIcon size={24} />
            </span>
            <h3 className="mb-2 mt-0 font-display text-base tracking-[-0.01em]">
              Your secret link lands here
            </h3>
            <p className="m-0 mx-auto max-w-[34ch] text-[13px] leading-relaxed text-muted">
              Once you lock funds, we mint a one-time link that carries the employee&apos;s secret —
              the only thing they need to start claiming.
            </p>
            <ul className="mx-auto mt-5 max-w-[30ch] list-none p-0 text-left">
              {[
                "Set the allocation & duration",
                "Lock USDC under a Poseidon commitment",
                "Share the link over a private channel",
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
              <span className={`${cardIcon} text-ok`}>
                <CheckIcon size={20} />
              </span>
              <div>
                <div className={cardEyebrow}>Funded</div>
                <h2 className={cardTitle}>Stream is live</h2>
              </div>
            </div>
            <p className="mb-5 mt-1 text-[13.5px] leading-relaxed text-muted">
              Send this secret link to the employee over a private channel. It holds their secret —
              anyone with it can claim the vested funds.
            </p>
            <div className="break-all rounded-sm border border-border bg-[rgba(8,5,18,0.7)] p-[13px] font-mono text-xs leading-[1.5] text-cyan">
              {link}
            </div>
            <button className="btn btn-secondary mt-[18px] w-full" onClick={copyLink}>
              {copied ? (
                <>
                  <CheckIcon size={16} /> Copied to clipboard
                </>
              ) : (
                <>
                  <CopyIcon size={16} /> Copy secret link
                </>
              )}
            </button>
            <div className="mt-[18px] flex gap-[11px] rounded-[14px] border border-border bg-cyan/[0.04] px-4 py-3.5 text-[12.5px] leading-relaxed text-muted [&>svg]:mt-px [&>svg]:shrink-0 [&>svg]:text-cyan">
              <EyeOffIcon size={16} />
              <span>
                On the public ledger an observer sees only that funds were locked under an opaque
                commitment — not who is being paid, the rate, or the total.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 240 ? m.slice(0, 240) + "…" : m;
}
