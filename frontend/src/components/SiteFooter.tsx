import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="footer">
      <span>StreamZero · privacy-preserving payroll on Stellar</span>
      <div className="links">
        <Link href="/employer">Employer</Link>
        <Link href="/employee">Employee</Link>
        <a
          href="https://github.com/ayoubbuoya/stream-zero"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        <a href="https://stellar.org" target="_blank" rel="noreferrer">
          Stellar
        </a>
      </div>
    </footer>
  );
}
