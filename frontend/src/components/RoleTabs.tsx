"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BuildingIcon, UserIcon } from "@/components/icons";

export default function RoleTabs() {
  const pathname = usePathname();
  const isEmployer = pathname.startsWith("/employer");

  const tab = (active: boolean) =>
    `flex items-center justify-center gap-[9px] rounded-[10px] px-[14px] py-3 text-sm font-semibold transition-colors ${
      active ? "bg-grad-violet text-bg shadow-[0_10px_30px_-12px_rgba(182,255,92,0.6)]" : "text-muted hover:text-text"
    }`;

  return (
    <nav className="mb-[22px] mt-[30px] grid max-w-[380px] grid-cols-2 gap-1 rounded-[14px] border border-border bg-[var(--panel)] p-[5px] backdrop-blur-[10px]">
      <Link href="/employer" className={tab(isEmployer)}>
        <BuildingIcon size={17} /> Employer
      </Link>
      <Link href="/employee" className={tab(!isEmployer)}>
        <UserIcon size={17} /> Employee
      </Link>
    </nav>
  );
}
