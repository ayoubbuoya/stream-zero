import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

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
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        {/* Ambient aurora field — purely decorative, sits behind everything. */}
        <div className="aurora" aria-hidden="true">
          <span className="aurora-blob a" />
          <span className="aurora-blob b" />
          <span className="aurora-blob c" />
          <div className="grid-veil" />
        </div>
        {children}
      </body>
    </html>
  );
}
