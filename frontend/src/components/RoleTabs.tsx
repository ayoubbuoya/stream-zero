"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BuildingIcon, UserIcon } from "@/components/icons";

export default function RoleTabs() {
  const pathname = usePathname();
  const isEmployer = pathname.startsWith("/employer");

  return (
    <nav className="tabs">
      <Link href="/employer" className={`tab ${isEmployer ? "active" : ""}`}>
        <BuildingIcon size={17} /> Employer
      </Link>
      <Link href="/employee" className={`tab ${!isEmployer ? "active" : ""}`}>
        <UserIcon size={17} /> Employee
      </Link>
    </nav>
  );
}
