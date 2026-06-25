"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { shortAddr } from "@/lib/stellar";
import { StreamIcon, WalletIcon } from "@/components/icons";

export default function SiteHeader() {
  const { address, busy, connect } = useWallet();
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Overview" },
    { href: "/employer", label: "Employer" },
    { href: "/employee", label: "Employee" },
  ];

  return (
    <header className="header">
      <Link href="/" className="brand" style={{ textDecoration: "none" }}>
        <span className="logo-mark">
          <StreamIcon size={22} />
        </span>
        <div className="brand-text">
          <h1>
            Stream<span className="zero">Zero</span>
          </h1>
          <span className="sub">Private payroll · Stellar</span>
        </div>
      </Link>

      <nav className="nav-links">
        {navItems.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${active ? "active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="header-actions">
        <span className="net-badge">
          <span className="dot" />
          Testnet · P27
        </span>
        <button
          className={`connect ${address ? "connected" : ""}`}
          onClick={connect}
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
              {busy ? "Connecting…" : "Connect"}
            </>
          )}
        </button>
      </div>
    </header>
  );
}
