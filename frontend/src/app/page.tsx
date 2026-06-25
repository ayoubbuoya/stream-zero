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

// Shared atoms — keeps the markup readable without a component library.
const eyebrow =
  "inline-flex items-center gap-2 rounded-full border border-border bg-violet/[0.07] px-3 py-1.5 text-xs font-semibold tracking-[0.03em] text-violet";
const cardIcon =
  "grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-border bg-violet/[0.12] text-violet";
const cardEyebrow = "mb-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint";
const cardTitle = "m-0 font-display text-[19px] font-semibold tracking-[-0.01em]";
const cardHint = "mb-5 mt-1 text-[13.5px] leading-relaxed text-muted";
const sectionEyebrow = "block text-[11px] font-bold uppercase tracking-[0.08em] text-violet";
const sectionTitle = "m-0 font-display text-[clamp(24px,4vw,32px)] tracking-[-0.02em]";

export default function Home() {
  return (
    <main className="animate-rise">
      <SecretLinkRedirect />

      {/* ---------- Hero ---------- */}
      <section className="animate-rise pb-7 pt-[30px]">
        <div className="grid grid-cols-1 items-center gap-[clamp(28px,5vw,64px)] min-[940px]:grid-cols-[1.08fr_0.92fr]">
          <div className="min-w-0">
            <span className={eyebrow}>
              <ShieldIcon size={14} /> Zero-knowledge payroll on Stellar
            </span>
            <h2 className="mt-[18px] max-w-[16ch] font-display text-[clamp(34px,6vw,56px)] font-bold leading-[1.04] tracking-[-0.03em]">
              Stream salaries that vest by the second,{" "}
              <span className="text-grad">verified privately</span> on-chain.
            </h2>
            <p className="mt-[18px] max-w-[56ch] text-[clamp(15px,2.4vw,17px)] leading-relaxed text-muted">
              StreamZero escrows USDC under a cryptographic commitment. Employees withdraw vested pay
              by submitting a zero-knowledge proof the vault checks on Stellar — so amounts, salary
              rates, and identities stay off the public ledger entirely.
            </p>
            <div className="mt-[26px] flex flex-wrap gap-3">
              <Link href="/employer" className="btn">
                <BuildingIcon size={16} /> I&apos;m an employer
              </Link>
              <Link href="/employee" className="btn btn-secondary">
                <UserIcon size={16} /> I have a payout link
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {[
                { icon: <EyeOffIcon size={15} />, text: "Amounts stay off-ledger" },
                { icon: <ShieldIcon size={15} />, text: "Groth16 proof verified on-chain" },
                { icon: <BoltIcon size={15} />, text: "Vests every second" },
              ].map((c) => (
                <span
                  key={c.text}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-[var(--panel)] px-[13px] py-2 text-[12.5px] text-text backdrop-blur-[8px] [&_svg]:shrink-0 [&_svg]:text-cyan"
                >
                  {c.icon} {c.text}
                </span>
              ))}
            </div>
          </div>

          {/* A glance at what the employee actually sees — built from the same
              vocabulary as the live dashboard, so the promise feels concrete. */}
          <div
            className="relative min-w-0 animate-rise [animation-delay:0.1s] max-[940px]:max-w-[460px]"
            aria-hidden="true"
          >
            <div className="surface group relative rounded-lg p-[22px] [transform:rotate(-1.1deg)] transition-transform duration-300 hover:[transform:rotate(0deg)_translateY(-2px)]">
              <div className="mb-[18px] flex items-center justify-between">
                <div className="flex items-center gap-[11px]">
                  <span className="bg-grad-violet grid h-[38px] w-[38px] place-items-center rounded-[11px] font-display text-sm font-bold text-bg shadow-glow">
                    AK
                  </span>
                  <div>
                    <div className="text-sm font-semibold tracking-[-0.01em]">Engineering — Alice</div>
                    <div className="mt-0.5 text-[11.5px] text-faint">Stream #0c4f…91a2</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/[0.08] px-2.5 py-1 text-[11px] font-semibold text-ok">
                  <BoltIcon size={12} /> Live
                </span>
              </div>

              <div className="font-display text-[clamp(30px,4.4vw,40px)] font-bold leading-none tracking-[-0.03em] tabular-nums text-grad">
                1,284.06
                <span className="ml-2 text-[0.42em] tracking-normal [-webkit-text-fill-color:var(--muted)]">
                  USDC
                </span>
              </div>
              <div className="mb-2 mt-[14px] flex items-center gap-[7px] text-[11.5px] text-muted">
                <ClockIcon size={13} /> Claimable right now · vesting every second
              </div>
              <div className="h-2 overflow-hidden rounded-full border border-border bg-[rgba(8,5,18,0.6)]">
                <span className="shimmer-fill block h-full w-[64%] rounded-full" />
              </div>

              <div className="mt-[18px] border-t border-border">
                {[
                  { icon: <ShieldIcon size={13} />, lbl: "Proof", val: "Groth16 · verified ✓", masked: false },
                  { icon: <EyeOffIcon size={13} />, lbl: "Salary rate", val: "•••••• /sec", masked: true },
                  { icon: <EyeOffIcon size={13} />, lbl: "Total comp", val: "•••••••", masked: true },
                ].map((r) => (
                  <div
                    key={r.lbl}
                    className="flex items-center justify-between border-b border-border py-[11px] text-[12.5px] last:border-b-0"
                  >
                    <span className="inline-flex items-center gap-2 text-muted [&_svg]:text-cyan">
                      {r.icon} {r.lbl}
                    </span>
                    <span
                      className={`font-mono tabular-nums ${r.masked ? "tracking-[1px] text-faint" : "text-text"}`}
                    >
                      {r.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <span className="absolute -bottom-4 -right-3.5 inline-flex items-center gap-2 rounded-full border border-border-strong bg-panel px-3.5 py-2 text-[11.5px] font-semibold text-text shadow-panel [&_svg]:text-ok">
              <CheckIcon size={13} /> Verified on Stellar
            </span>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mt-14">
        <div className="mb-6">
          <span className={sectionEyebrow}>How it works</span>
          <h3 className={`mt-2.5 ${sectionTitle}`}>Three steps, zero leakage</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="surface relative rounded-lg p-6 transition-transform hover:-translate-y-[3px]"
            >
              <span className="absolute right-5 top-[18px] font-display text-[34px] font-bold leading-none text-grad opacity-50">
                {i + 1}
              </span>
              <span className={`mb-4 ${cardIcon}`}>{s.icon}</span>
              <h4 className="mb-2 mt-0 font-display text-base tracking-[-0.01em]">{s.title}</h4>
              <p className="m-0 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Architecture ---------- */}
      <section className="mt-14">
        <div className="mb-6">
          <span className={sectionEyebrow}>Under the hood</span>
          <h3 className={`mt-2.5 ${sectionTitle}`}>How the proof becomes trust</h3>
          <p className="mt-3.5 max-w-[62ch] text-[15px] leading-relaxed text-muted">
            Two halves work together: a Stellar smart contract that verifies math, and a
            zero-knowledge proof that hides everything but its own validity.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-[18px] min-[760px]:grid-cols-2">
          <div className="surface rounded-lg p-5 sm:p-[26px]">
            <div className="mb-1.5 flex items-center gap-[13px]">
              <span className={cardIcon}>
                <NetworkIcon size={20} />
              </span>
              <div>
                <div className={cardEyebrow}>On Stellar</div>
                <h2 className={cardTitle}>The Soroban vault</h2>
              </div>
            </div>
            <p className={cardHint}>
              A Rust smart contract escrows USDC and stores only a Poseidon commitment per stream.
              When a claim arrives it runs the Groth16 verification equation using Stellar&apos;s
              BN254 pairing host functions (Protocol 25/26) — a single pairing check, on-chain.
            </p>
            <ul className="m-0 mt-[18px] list-none p-0">
              {[
                "Commitment-only state — no rate, total, or payee stored",
                "Replay & front-running protection via on-chain nullifier and recipient binding",
                "Standard SEP-41 USDC transfers — swap in the real asset with no vault change",
              ].map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-2.5 border-t border-border py-[9px] text-[13.5px] leading-[1.55] text-text [&>svg]:mt-0.5 [&>svg]:shrink-0 [&>svg]:text-ok"
                >
                  <CheckIcon size={15} /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="surface rounded-lg p-5 sm:p-[26px]">
            <div className="mb-1.5 flex items-center gap-[13px]">
              <span className={cardIcon}>
                <CpuIcon size={20} />
              </span>
              <div>
                <div className={cardEyebrow}>Zero-knowledge</div>
                <h2 className={cardTitle}>The proof, in your browser</h2>
              </div>
            </div>
            <p className={cardHint}>
              The circuit is specified in Noir for a human-readable statement, while the production
              prover is an arkworks Groth16 circuit over BN254, compiled to WebAssembly. Proofs are
              generated client-side — the secret never leaves the device.
            </p>
            <ul className="m-0 mt-[18px] list-none p-0">
              <li className="flex items-start gap-2.5 border-t border-border py-[9px] text-[13.5px] leading-[1.55] text-text [&>svg]:mt-0.5 [&>svg]:shrink-0 [&>svg]:text-ok">
                <CheckIcon size={15} /> Proves{" "}
                <em className="font-mono text-[12.5px] not-italic text-cyan">
                  vested ≥ withdrawn + amount
                </em>{" "}
                without revealing any of them
              </li>
              <li className="flex items-start gap-2.5 border-t border-border py-[9px] text-[13.5px] leading-[1.55] text-text [&>svg]:mt-0.5 [&>svg]:shrink-0 [&>svg]:text-ok">
                <CheckIcon size={15} /> Six public inputs bind the proof to time, amount, and recipient
              </li>
              <li className="flex items-start gap-2.5 border-t border-border py-[9px] text-[13.5px] leading-[1.55] text-text [&>svg]:mt-0.5 [&>svg]:shrink-0 [&>svg]:text-ok">
                <CheckIcon size={15} /> Poseidon commitment links the proof to the funded stream
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- What an observer sees ---------- */}
      <section className="mt-14">
        <div className="surface rounded-lg p-5 sm:p-[26px]">
          <div className="mb-1.5 flex items-center gap-[13px]">
            <span className={cardIcon}>
              <EyeOffIcon size={20} />
            </span>
            <div>
              <div className={cardEyebrow}>The privacy guarantee</div>
              <h2 className={cardTitle}>What a chain observer sees</h2>
            </div>
          </div>
          <div className="mt-[18px] grid grid-cols-1 gap-3.5 min-[760px]:grid-cols-2">
            <div className="rounded-[14px] border border-border bg-[rgba(8,5,18,0.35)] p-[18px]">
              <span className="mb-3.5 inline-flex rounded-full border border-magenta/30 bg-magenta/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-magenta">
                Hidden
              </span>
              <ul className="m-0 list-none p-0">
                {["Salary rate", "Total compensation", "Employee identity", "That a withdrawal links to a given stream"].map(
                  (t) => (
                    <li
                      key={t}
                      className="relative py-[7px] pl-[18px] text-[13.5px] leading-[1.5] text-muted before:absolute before:left-0 before:top-[14px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-magenta before:content-['']"
                    >
                      {t}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <div className="rounded-[14px] border border-border bg-[rgba(8,5,18,0.35)] p-[18px]">
              <span className="mb-3.5 inline-flex rounded-full border border-ok/30 bg-ok/[0.08] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ok">
                Public
              </span>
              <ul className="m-0 list-none p-0">
                {["An opaque commitment was funded", "A valid withdrawal occurred", "The vault's aggregate balance"].map(
                  (t) => (
                    <li
                      key={t}
                      className="relative py-[7px] pl-[18px] text-[13.5px] leading-[1.5] text-muted before:absolute before:left-0 before:top-[14px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-ok before:content-['']"
                    >
                      {t}
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Tech stack ---------- */}
      <section className="mt-14">
        <div className="mb-6">
          <span className={sectionEyebrow}>Built with</span>
          <h3 className={`mt-2.5 ${sectionTitle}`}>The stack</h3>
        </div>
        <div className="grid grid-cols-1 gap-3.5 min-[760px]:grid-cols-2 min-[940px]:grid-cols-3">
          {STACK.map((t) => (
            <div
              key={t.name}
              className="bg-grad-panel flex items-start gap-[13px] rounded-[14px] border border-border p-[18px] backdrop-blur-[10px] transition-transform hover:-translate-y-0.5 hover:border-border-strong"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-border bg-violet/[0.12] text-violet">
                {t.icon}
              </span>
              <div>
                <strong className="mb-1 block text-sm font-semibold">{t.name}</strong>
                <span className="text-[12.5px] leading-[1.5] text-muted">{t.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mt-[60px] rounded-xl border border-border-strong p-[44px_28px] text-center shadow-panel backdrop-blur-[16px] [background:radial-gradient(600px_200px_at_50%_0%,rgba(160,107,255,0.18),transparent_70%),var(--grad-panel)]">
        <h3 className="m-0 font-display text-[clamp(24px,4vw,34px)] tracking-[-0.02em]">
          Pay privately. Prove publicly.
        </h3>
        <p className="mt-3 text-[15px] text-muted">
          Fund a stream or claim one — both run on Stellar testnet right now.
        </p>
        <div className="mt-[26px] flex flex-wrap justify-center gap-3">
          <Link href="/employer" className="btn">
            <BuildingIcon size={16} /> Fund a stream <ArrowRightIcon size={15} />
          </Link>
          <Link href="/employee" className="btn btn-secondary">
            <UserIcon size={16} /> Claim a stream
          </Link>
        </div>
      </section>
    </main>
  );
}
