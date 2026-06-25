import type { Metadata } from "next";
import RoleTabs from "@/components/RoleTabs";
import EmployerDashboard from "@/components/EmployerDashboard";

export const metadata: Metadata = {
  title: "Employer — StreamZero",
  description: "Lock USDC under a commitment and fund a private salary stream.",
};

export default function EmployerPage() {
  return (
    <main className="page">
      <div className="page-intro">
        <span className="eyebrow">Employer console</span>
        <h2>Fund a private stream</h2>
        <p>Lock USDC, post a commitment, and share one secret link. Nothing about the payee, the rate, or the total ever hits the public ledger.</p>
      </div>
      <RoleTabs />
      <EmployerDashboard />
    </main>
  );
}
