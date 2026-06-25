"use client";

import { useState } from "react";
import { connect } from "@/lib/wallet";
import { shortAddr } from "@/lib/stellar";
import EmployerDashboard from "@/components/EmployerDashboard";
import EmployeeDashboard from "@/components/EmployeeDashboard";

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
    <div className="wrap">
      <div className="header">
        <div className="brand">
          <h1>
            Stream<span className="zero">Zero</span>
          </h1>
          <span className="badge">Testnet · Protocol 27</span>
        </div>
        <button className="connect" onClick={onConnect} disabled={busy}>
          {address ? shortAddr(address) : busy ? "Connecting…" : "Connect wallet"}
        </button>
      </div>
      <p className="tagline">
        Private payroll streaming on Stellar. Salaries vest by the second; amounts
        and identities never touch the public ledger — verified by zero-knowledge
        proofs.
      </p>

      <div className="tabs">
        <button
          className={`tab ${tab === "employer" ? "active" : ""}`}
          onClick={() => setTab("employer")}
        >
          Employer
        </button>
        <button
          className={`tab ${tab === "employee" ? "active" : ""}`}
          onClick={() => setTab("employee")}
        >
          Employee
        </button>
      </div>

      {tab === "employer" ? (
        <EmployerDashboard address={address} onConnect={onConnect} />
      ) : (
        <EmployeeDashboard address={address} onConnect={onConnect} />
      )}
    </div>
  );
}
