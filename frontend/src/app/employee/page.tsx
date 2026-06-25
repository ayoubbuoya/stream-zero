import type { Metadata } from "next";
import RoleTabs from "@/components/RoleTabs";
import EmployeeDashboard from "@/components/EmployeeDashboard";

export const metadata: Metadata = {
  title: "Employee — StreamZero",
  description: "Withdraw vested pay with a zero-knowledge proof generated in your browser.",
};

export default function EmployeePage() {
  return (
    <main className="animate-rise">
      <div className="pb-1.5 pt-[26px]">
        <span className="inline-flex rounded-full border border-border bg-violet/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-violet">
          Employee console
        </span>
        <h2 className="mt-4 font-display text-[clamp(26px,4.5vw,36px)] tracking-[-0.02em]">
          Claim your vested pay
        </h2>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">
          Open your secret link, watch your balance vest by the second, and withdraw with a
          zero-knowledge proof generated entirely in your browser.
        </p>
      </div>
      <RoleTabs />
      <EmployeeDashboard />
    </main>
  );
}
