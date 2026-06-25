import type { Metadata } from "next";
import RoleTabs from "@/components/RoleTabs";
import EmployeeDashboard from "@/components/EmployeeDashboard";

export const metadata: Metadata = {
  title: "Employee — StreamZero",
  description: "Withdraw vested pay with a zero-knowledge proof generated in your browser.",
};

export default function EmployeePage() {
  return (
    <main className="page">
      <div className="page-intro">
        <span className="eyebrow">Employee console</span>
        <h2>Claim your vested pay</h2>
        <p>Open your secret link, watch your balance vest by the second, and withdraw with a zero-knowledge proof generated entirely in your browser.</p>
      </div>
      <RoleTabs />
      <EmployeeDashboard />
    </main>
  );
}
