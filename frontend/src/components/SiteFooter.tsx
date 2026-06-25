import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-[22px] text-[12.5px] text-faint">
      <span>StreamZero · privacy-preserving payroll on Stellar</span>
      <div className="flex gap-[18px]">
        <Link href="/employer" className="text-muted hover:underline">
          Employer
        </Link>
        <Link href="/employee" className="text-muted hover:underline">
          Employee
        </Link>
        <a
          href="https://github.com/ayoubbuoya/stream-zero"
          target="_blank"
          rel="noreferrer"
          className="text-muted hover:underline"
        >
          GitHub
        </a>
        <a
          href="https://stellar.org"
          target="_blank"
          rel="noreferrer"
          className="text-muted hover:underline"
        >
          Stellar
        </a>
      </div>
    </footer>
  );
}
