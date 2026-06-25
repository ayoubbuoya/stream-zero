import Link from "next/link";
import SecretLinkRedirect from "@/components/SecretLinkRedirect";
import {
  ShieldIcon,
  EyeOffIcon,
  BoltIcon,
  LockIcon,
  ClockIcon,
  KeyIcon,
  ArrowRightIcon,
  BuildingIcon,
  UserIcon,
  NetworkIcon,
  CodeIcon,
  CpuIcon,
  LayersIcon,
  CheckIcon,
} from "@/components/icons";

const STEPS = [
  {
    icon: <LockIcon size={20} />,
    title: "Employer locks & commits",
    body: "USDC is escrowed in the Soroban vault under a Poseidon commitment to the salary rate and start time. The amount, the rate, and who's being paid never appear on-chain.",
  },
  {
    icon: <ClockIcon size={20} />,
    title: "Pay vests every second",
    body: "From the start time, funds vest linearly. The employee can see exactly how much is claimable in real time — the ledger sees only an opaque commitment.",
  },
  {
    icon: <KeyIcon size={20} />,
    title: "Employee proves & withdraws",
    body: "The browser builds a Groth16 zero-knowledge proof that the requested amount is genuinely vested. The vault verifies the proof on-chain and releases funds — revealing nothing else.",
  },
];

const STACK = [
  { icon: <NetworkIcon size={18} />, name: "Soroban", detail: "Rust smart-contract vault on Stellar" },
  { icon: <ShieldIcon size={18} />, name: "Groth16 / BN254", detail: "On-chain pairing verification via Protocol 25/26 host functions" },
  { icon: <CpuIcon size={18} />, name: "arkworks → WASM", detail: "Prover compiled to WebAssembly, runs in the browser" },
  { icon: <CodeIcon size={18} />, name: "Noir", detail: "Human-readable statement spec for the circuit" },
  { icon: <LayersIcon size={18} />, name: "Poseidon", detail: "ZK-friendly hash for the stream commitment" },
  { icon: <BoltIcon size={18} />, name: "Next.js 16", detail: "App-router frontend with the Stellar SDK + Wallets Kit" },
];

export default function Home() {
  return (
    <main className="page">
      <SecretLinkRedirect />

      {/* ---------- Hero ---------- */}
      <section className="hero">
        <div className="hero-layout">
          <div className="hero-copy">
            <span className="eyebrow">
              <ShieldIcon size={14} /> Zero-knowledge payroll on Stellar
            </span>
            <h2>
              Stream salaries that vest by the second,{" "}
              <span className="grad">verified privately</span> on-chain.
            </h2>
            <p className="lede">
              StreamZero escrows USDC under a cryptographic commitment. Employees withdraw vested pay
              by submitting a zero-knowledge proof the vault checks on Stellar — so amounts, salary
              rates, and identities stay off the public ledger entirely.
            </p>
            <div className="cta-row">
              <Link href="/employer" className="btn">
                <BuildingIcon size={16} /> I&apos;m an employer
              </Link>
              <Link href="/employee" className="btn secondary">
                <UserIcon size={16} /> I have a payout link
              </Link>
            </div>
            <div className="trust">
              <span className="chip">
                <EyeOffIcon size={15} /> Amounts stay off-ledger
              </span>
              <span className="chip">
                <ShieldIcon size={15} /> Groth16 proof verified on-chain
              </span>
              <span className="chip">
                <BoltIcon size={15} /> Vests every second
              </span>
            </div>
          </div>

          {/* A glance at what the employee actually sees — built from the same
              vocabulary as the live dashboard, so the promise feels concrete. */}
          <div className="hero-visual" aria-hidden="true">
            <div className="preview-card">
              <div className="preview-top">
                <div className="preview-who">
                  <span className="preview-avatar">AK</span>
                  <div>
                    <div className="nm">Engineering — Alice</div>
                    <div className="sub">Stream #0c4f…91a2</div>
                  </div>
                </div>
                <span className="preview-pill">
                  <BoltIcon size={12} /> Live
                </span>
              </div>

              <div className="preview-amount">
                1,284.06<span className="ccy">USDC</span>
              </div>
              <div className="preview-cap">
                <ClockIcon size={13} /> Claimable right now · vesting every second
              </div>
              <div className="preview-bar">
                <span />
              </div>

              <div className="preview-rows">
                <div className="pr">
                  <span className="lbl">
                    <ShieldIcon size={13} /> Proof
                  </span>
                  <span className="val">Groth16 · verified ✓</span>
                </div>
                <div className="pr">
                  <span className="lbl">
                    <EyeOffIcon size={13} /> Salary rate
                  </span>
                  <span className="val masked">•••••• /sec</span>
                </div>
                <div className="pr">
                  <span className="lbl">
                    <EyeOffIcon size={13} /> Total comp
                  </span>
                  <span className="val masked">•••••••</span>
                </div>
              </div>
            </div>
            <span className="proof-chip">
              <CheckIcon size={13} /> Verified on Stellar
            </span>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="section">
        <div className="section-head">
          <span className="eyebrow-sm">How it works</span>
          <h3>Three steps, zero leakage</h3>
        </div>
        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <div className="step-card" key={s.title}>
              <span className="step-num">{i + 1}</span>
              <span className="card-icon">{s.icon}</span>
              <h4>{s.title}</h4>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Architecture ---------- */}
      <section className="section">
        <div className="section-head">
          <span className="eyebrow-sm">Under the hood</span>
          <h3>How the proof becomes trust</h3>
          <p className="section-sub">
            Two halves work together: a Stellar smart contract that verifies math, and a
            zero-knowledge proof that hides everything but its own validity.
          </p>
        </div>

        <div className="arch-grid">
          <div className="card arch-card">
            <div className="card-head">
              <span className="card-icon">
                <NetworkIcon size={20} />
              </span>
              <div>
                <div className="eyebrow-sm">On Stellar</div>
                <h2>The Soroban vault</h2>
              </div>
            </div>
            <p className="hint">
              A Rust smart contract escrows USDC and stores only a Poseidon commitment per stream.
              When a claim arrives it runs the Groth16 verification equation using Stellar&apos;s
              BN254 pairing host functions (Protocol 25/26) — a single pairing check, on-chain.
            </p>
            <ul className="feature-list">
              <li>
                <CheckIcon size={15} /> Commitment-only state — no rate, total, or payee stored
              </li>
              <li>
                <CheckIcon size={15} /> Replay &amp; front-running protection via on-chain nullifier
                and recipient binding
              </li>
              <li>
                <CheckIcon size={15} /> Standard SEP-41 USDC transfers — swap in the real asset with
                no vault change
              </li>
            </ul>
          </div>

          <div className="card arch-card">
            <div className="card-head">
              <span className="card-icon">
                <CpuIcon size={20} />
              </span>
              <div>
                <div className="eyebrow-sm">Zero-knowledge</div>
                <h2>The proof, in your browser</h2>
              </div>
            </div>
            <p className="hint">
              The circuit is specified in Noir for a human-readable statement, while the production
              prover is an arkworks Groth16 circuit over BN254, compiled to WebAssembly. Proofs are
              generated client-side — the secret never leaves the device.
            </p>
            <ul className="feature-list">
              <li>
                <CheckIcon size={15} /> Proves <em>vested ≥ withdrawn + amount</em> without revealing
                any of them
              </li>
              <li>
                <CheckIcon size={15} /> Six public inputs bind the proof to time, amount, and
                recipient
              </li>
              <li>
                <CheckIcon size={15} /> Poseidon commitment links the proof to the funded stream
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- What an observer sees ---------- */}
      <section className="section">
        <div className="card observer-card">
          <div className="card-head">
            <span className="card-icon">
              <EyeOffIcon size={20} />
            </span>
            <div>
              <div className="eyebrow-sm">The privacy guarantee</div>
              <h2>What a chain observer sees</h2>
            </div>
          </div>
          <div className="reveal-grid">
            <div className="reveal hidden-col">
              <span className="reveal-label">Hidden</span>
              <ul>
                <li>Salary rate</li>
                <li>Total compensation</li>
                <li>Employee identity</li>
                <li>That a withdrawal links to a given stream</li>
              </ul>
            </div>
            <div className="reveal public-col">
              <span className="reveal-label">Public</span>
              <ul>
                <li>An opaque commitment was funded</li>
                <li>A valid withdrawal occurred</li>
                <li>The vault&apos;s aggregate balance</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Tech stack ---------- */}
      <section className="section">
        <div className="section-head">
          <span className="eyebrow-sm">Built with</span>
          <h3>The stack</h3>
        </div>
        <div className="stack-grid">
          {STACK.map((t) => (
            <div className="stack-item" key={t.name}>
              <span className="stack-icon">{t.icon}</span>
              <div>
                <strong>{t.name}</strong>
                <span>{t.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="cta-banner">
        <h3>Pay privately. Prove publicly.</h3>
        <p>Fund a stream or claim one — both run on Stellar testnet right now.</p>
        <div className="cta-row">
          <Link href="/employer" className="btn">
            <BuildingIcon size={16} /> Fund a stream <ArrowRightIcon size={15} />
          </Link>
          <Link href="/employee" className="btn secondary">
            <UserIcon size={16} /> Claim a stream
          </Link>
        </div>
      </section>
    </main>
  );
}
