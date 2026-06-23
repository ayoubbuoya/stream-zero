Product Requirements Document (PRD)

Project Name: StreamZero (Temporary Name)
Target Event: Stellar Hacks: Real-World ZK Hackathon

1. Executive Summary

StreamZero is a privacy-preserving payroll protocol built on the Stellar network using Soroban smart contracts and Zero-Knowledge (ZK) proofs. It allows employers to stream salary payments (USDC) to employees by the second. Employees can claim their vested funds at any time, but crucially, the employee's identity, total salary, and streaming rate remain completely hidden from the public ledger.

2. Problem Statement (The Privacy Paradox)

Companies want to use blockchain for payroll because it offers instant, global, low-fee settlement. However, public blockchains expose transaction histories. If a company pays its employees via standard Stellar transactions, anyone can view the ledger and deduce exactly how much every employee makes. Traditional streaming protocols (like Sablier on Ethereum) suffer from this exact same flaw. Companies cannot adopt on-chain payroll without absolute financial privacy.

3. Solution Concept

StreamZero solves this by combining Stellar's fast settlement with ZK cryptography (utilizing Protocol 25/26 X-Ray primitives).

The employer deposits a lump sum of USDC into a Soroban "Vault" contract and registers a cryptographic Commitment (a hash of the employee's details and salary rate).

As time passes, the employee generates a ZK Proof off-chain demonstrating they possess the pre-image of the commitment and are entitled to withdraw $X based on the current timestamp.

The Soroban contract verifies the proof and releases the funds.
Result: The blockchain only records that a valid proof was submitted and funds were withdrawn. The salary rate and employee identity remain invisible.

4. Target Audience

Web3 Companies/DAOs: Looking for a way to pay contributors globally without doxxing their cap table.

Employees/Contractors: Who want to access their earned wages in real-time without compromising their financial privacy.

5. Technical Architecture

Blockchain: Stellar Testnet (upgraded with Protocol 25/26 X-Ray primitives).

Smart Contracts: Soroban (Rust).

Vault Contract: Holds USDC, stores commitments, tracks nullifiers (to prevent double-spending).

Verifier Contract: Validates the ZK proofs submitted by employees.

ZK Framework: Noir (recommended for ease of use in Rust/Soroban) or Circom.

Frontend: Next.js / React (minimal, clean UI).

Wallet Integration: Freighter Wallet.

6. Core Features (Hackathon MVP Scope)

6.1. Smart Contract Capabilities

Deposit & Commit: Function to accept USDC deposits and store a Poseidon hash commitment H(Employee_Secret, Salary_Rate, Start_Time).

Verify & Disburse: Function that takes a ZK proof, a nullifier, and a requested withdrawal amount. It verifies the proof against the stored commitment and the current ledger timestamp, then transfers the USDC to the caller.

6.2. Employer Dashboard (The Funder)

Connect Wallet: Connect via Freighter.

Create Stream: Input an employee identifier, a total allocation (e.g., 5,000 USDC), and a duration (e.g., 30 days).

Generate Secret: The app generates a unique Employee_Secret (kept entirely off-chain) and gives the employer a link/key to securely send to the employee.

Fund Transaction: Employer signs the Soroban transaction to lock the funds and post the commitment.

6.3. Employee Dashboard (The Claimer)

Access Stream: Employee enters the Employee_Secret provided by the employer.

Real-Time Balance: UI calculates and displays the currently vested amount in real-time (ticking up by the second).

Generate Proof & Claim: Employee clicks "Withdraw". The frontend generates the ZK Proof locally in the browser (proving (Current_Time - Start_Time) * Salary_Rate >= Withdrawal_Amount).

Submit Transaction: Employee submits the proof to the Soroban contract to receive their funds.

7. User Stories

Employer: As an employer, I want to lock 10,000 USDC into a streaming contract so that my employee gets paid by the second without the public knowing their salary.

Employee: As an employee, I want to securely prove my vested balance and withdraw 500 USDC to my wallet without linking my personal wallet address to my company's payroll ledger.

Public Observer (Auditor/Snooper): As someone looking at the Stellar block explorer, I can see USDC leaving the employer's vault, but I cannot reverse-engineer who it went to, what their hourly rate is, or how much is left in their stream.

8. Strictly Out of Scope (Do NOT build these)

To ensure the ZK cryptography works perfectly for the judges, the following features are banned from the hackathon scope:

Project management boards, ticket trackers, or sprint planning tools.

Employee performance metrics or HR reviews.

Fiat on/off ramps (assume the employer already has USDC on Stellar Testnet).

Complex multi-signature employer approval flows.

9. Hackathon Success Metrics (What Judges Want)

Meaningful ZK: The zero-knowledge circuit must actually do the math (calculating time * rate) and output a valid proof. It cannot be faked.

Stellar Integration: The proof must be verified on-chain via a Soroban smart contract using the latest protocol features.

Clear Documentation: A pristine README.md explaining the cryptography, how to build the circuits, and how to run the frontend.

Demo Video: A 2-3 minute video showcasing the Employer depositing funds, the Employee's balance ticking up, and the successful private withdrawal, with a voiceover explaining the ZK magic happening under the hood.