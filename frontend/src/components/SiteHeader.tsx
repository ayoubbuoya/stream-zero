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
    <header className="sticky top-0 z-40 mb-2 flex items-center justify-between gap-4 py-4 backdrop-blur-[14px]">
      <Link href="/" className="flex items-center gap-3 no-underline">
        <span className="bg-grad-violet grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] text-bg shadow-glow">
          <StreamIcon size={22} />
        </span>
        <div className="flex flex-col leading-none">
          <h1 className="m-0 font-display text-xl font-bold tracking-[-0.02em]">
            Stream<span className="text-grad">Zero</span>
          </h1>
          <span className="mt-1 hidden text-[11px] uppercase tracking-[0.04em] text-faint sm:block">
            Private payroll · Stellar
          </span>
        </div>
      </Link>

      <nav className="hidden items-center gap-1 rounded-full border border-border bg-[var(--panel)] p-1 backdrop-blur-[10px] min-[760px]:flex">
        {navItems.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3.5 py-[7px] text-[13px] font-semibold transition-colors ${
                active
                  ? "bg-grad-violet text-bg shadow-[0_8px_22px_-12px_rgba(182,255,92,0.7)]"
                  : "text-muted hover:text-text"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2.5">
        <span className="hidden items-center gap-[7px] rounded-full border border-border bg-cyan/[0.06] px-[11px] py-[5px] text-[11.5px] font-semibold text-cyan sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_8px_var(--cyan)]" />
          Testnet · P27
        </span>
        <button
          onClick={connect}
          disabled={busy}
          className={`inline-flex items-center gap-2 rounded-sm border border-border-strong bg-[var(--panel)] px-[15px] py-[9px] font-semibold text-text transition-colors hover:border-violet disabled:opacity-55 ${
            address ? "font-mono text-[12.5px]" : "text-[13px]"
          }`}
        >
          {address ? (
            <>
              <span className="h-[7px] w-[7px] animate-blink rounded-full bg-ok shadow-[0_0_8px_var(--ok)]" />
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
