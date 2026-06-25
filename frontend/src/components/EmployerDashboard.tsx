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
    <div className="dash">
      <div className="dash-main">
      <div className="card">
        <div className="card-head">
          <span className="card-icon">
            <BuildingIcon size={20} />
          </span>
          <div>
            <div className="eyebrow-sm">Employer</div>
            <h2>Fund a private stream</h2>
          </div>
        </div>
        <p className="hint">
          Lock test USDC and post only a Poseidon commitment. The employee&apos;s identity, salary
          rate, and total never appear on-chain.
        </p>

        <div className="stat">
          <span className="label">Your test USDC balance</span>
          <span className="value">
            {balance === null ? "—" : fromBaseUnits(balance).toLocaleString()} USDC
          </span>
        </div>
        <button className="btn secondary full" onClick={faucet} disabled={!!busy}>
          {address ? (
            <>
              <WalletIcon size={16} /> Get 10,000 test USDC
            </>
          ) : (
            "Connect wallet"
          )}
        </button>

        <label>Employee label (private — stays in your browser)</label>
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

        {allocation > 0 && days > 0 && (
          <div className="metric-grid">
            <div className="cell">
              <div className="k">Vests per day</div>
              <div className="v">{fmt(perDay)} USDC</div>
            </div>
            <div className="cell">
              <div className="k">Vests per second</div>
              <div className="v">{fmt(perSec)} USDC</div>
            </div>
          </div>
        )}

        <button className="btn full" onClick={createStream} disabled={!!busy}>
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
          <div className="status err">
            <AlertIcon size={16} /> {err}
          </div>
        )}
      </div>
      </div>

      <div className="dash-aside">
      {!link ? (
        <div className="aside-empty">
          <span className="orb">
            <LockIcon size={24} />
          </span>
          <h3>Your secret link lands here</h3>
          <p>
            Once you lock funds, we mint a one-time link that carries the employee&apos;s secret —
            the only thing they need to start claiming.
          </p>
          <ul className="mini-steps">
            <li>
              <span>1</span> Set the allocation &amp; duration
            </li>
            <li>
              <span>2</span> Lock USDC under a Poseidon commitment
            </li>
            <li>
              <span>3</span> Share the link over a private channel
            </li>
          </ul>
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <span className="card-icon" style={{ color: "var(--ok)" }}>
              <CheckIcon size={20} />
            </span>
            <div>
              <div className="eyebrow-sm">Funded</div>
              <h2>Stream is live</h2>
            </div>
          </div>
          <p className="hint">
            Send this secret link to the employee over a private channel. It holds their secret —
            anyone with it can claim the vested funds.
          </p>
          <div className="mono">{link}</div>
          <button className="btn secondary full" onClick={copyLink}>
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
          <div className="observer">
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
