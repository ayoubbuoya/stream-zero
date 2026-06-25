import type { Metadata } from "next";
import RoleTabs from "@/components/RoleTabs";
import EmployerDashboard from "@/components/EmployerDashboard";

export const metadata: Metadata = {
  title: "Employer — StreamZero",
  description: "Lock USDC under a commitment and fund a private salary stream.",
};

export default function EmployerPage() {
  return (
    <main className="animate-rise">
      <div className="pb-1.5 pt-[26px]">
        <span className="inline-flex rounded-full border border-border bg-violet/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-violet">
          Employer console
        </span>
        <h2 className="mt-4 font-display text-[clamp(26px,4.5vw,36px)] tracking-[-0.02em]">
          Fund a private stream
        </h2>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">
          Lock USDC, post a commitment, and share one secret link. Nothing about the payee, the
          rate, or the total ever hits the public ledger.
        </p>
      </div>
      <RoleTabs />
      <EmployerDashboard />
    </main>
  );
}
