import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StreamZero — private payroll on Stellar",
  description:
    "Stream salaries privately on Stellar with zero-knowledge proofs. Amounts and identities stay off the public ledger.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
