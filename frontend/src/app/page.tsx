"use client";

import { useState } from "react";
import { connect } from "@/lib/wallet";
import { shortAddr } from "@/lib/stellar";
import EmployerDashboard from "@/components/EmployerDashboard";
import EmployeeDashboard from "@/components/EmployeeDashboard";
import {
  ShieldIcon,
  EyeOffIcon,
  BoltIcon,
  WalletIcon,
  BuildingIcon,
  UserIcon,
  StreamIcon,
} from "@/components/icons";

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const [tab, setTab] = useState<"employer" | "employee">("employer");
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    setBusy(true);
    try {
      setAddress(await connect());
    } catch {
      /* cancelled */
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <header className="header">
        <div className="brand">
          <span className="logo-mark">
            <StreamIcon size={22} />
          </span>
          <div className="brand-text">
            <h1>
              Stream<span className="zero">Zero</span>
            </h1>
            <span className="sub">Private payroll · Stellar</span>
          </div>
        </div>
        <div className="header-actions">
          <span className="net-badge">
            <span className="dot" />
            Testnet · Protocol 27
          </span>
          <button
            className={`connect ${address ? "connected" : ""}`}
            onClick={onConnect}
            disabled={busy}
          >
            {address ? (
              <>
                <span className="pulse" />
                {shortAddr(address)}
              </>
            ) : (
              <>
                <WalletIcon size={15} />
                {busy ? "Connecting…" : "Connect wallet"}
              </>
            )}
          </button>
        </div>
      </header>

      <section className="hero">
        <span className="eyebrow">
          <ShieldIcon size={14} /> Zero-knowledge payroll
        </span>
        <h2>
          Salaries that vest by the second, <span className="grad">verified privately</span> on Stellar.
        </h2>
        <p className="lede">
          An employer locks USDC under a cryptographic commitment. The employee withdraws vested
          pay by submitting a zero-knowledge proof the vault verifies on-chain. Amounts and
          identities never touch the public ledger.
        </p>
        <div className="trust">
          <span className="chip">
            <EyeOffIcon size={15} /> Amounts stay off-ledger
          </span>
          <span className="chip">
            <ShieldIcon size={15} /> Groth16 proof, verified on-chain
          </span>
          <span className="chip">
            <BoltIcon size={15} /> Vests every second
          </span>
        </div>
      </section>

      <nav className="tabs">
        <button
          className={`tab ${tab === "employer" ? "active" : ""}`}
          onClick={() => setTab("employer")}
        >
          <BuildingIcon size={17} /> Employer
        </button>
        <button
          className={`tab ${tab === "employee" ? "active" : ""}`}
          onClick={() => setTab("employee")}
        >
          <UserIcon size={17} /> Employee
        </button>
      </nav>

      {tab === "employer" ? (
        <EmployerDashboard address={address} onConnect={onConnect} />
      ) : (
        <EmployeeDashboard address={address} onConnect={onConnect} />
      )}

      <footer className="footer">
        <span>StreamZero · privacy-preserving payroll on Stellar</span>
        <div className="links">
          <a
            href="https://github.com/ayoubbuoya/stream-zero"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a href="https://stellar.org" target="_blank" rel="noreferrer">
            Stellar
          </a>
        </div>
      </footer>
    </main>
  );
}
