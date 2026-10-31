# ClauseGuard

**ClauseGuard: explainable legal check for everyday contracts — cited, private (only hashes on-chain), and enforced via Chainlink CRE.**

Paste an apartment rental, freelance agreement, SaaS subscription, consumer loan, solar PPA, energy-sharing deal, or tokenized revenue-share terms. ClauseGuard auto-detects the contract type, runs a type-specific ruleset, and returns a report with:
- A score and grade.
- Findings with the **exact quoted sentence** that triggered them.
- **Why it matters**, with the specific legal source (EU Directives, GDPR, MiCA, etc.).
- A **question to ask a lawyer**.
- A **fairer wording** suggestion.
- A **jurisdiction note**.
- SHA-256 hashes of the document and the report for verifiable integrity.

> **Not legal advice.** ClauseGuard is a checklist that helps people prepare for a lawyer. It does not replace one.

## Supported Contract Types
The engine auto-detects the contract type and applies the relevant rules:
- Apartment/residential rental
- Freelance/service agreement
- Subscription/SaaS terms
- Consumer loan/credit
- Solar PPA (Power Purchase Agreement)
- Energy-sharing
- Tokenized revenue share

*Origin story: Solar PPA support started with Solar DePIN Hub (Ukraine), where households sign long-term energy contracts without legal counsel.*

## Key Features
- **Explainable & Deterministic:** 35 rules in `clauseguard-rules-3.0.0`. No black-box AI. Every finding cites the exact sentence and legal basis.
- **Live Legal Context:** Integrates with EUR-Lex to verify the in-force status of cited laws (e.g., Directive 93/13/EEC, GDPR, MiCA).
- **Privacy-First:** Contract text never leaves the browser. Only SHA-256 hashes and metadata are written on-chain.
- **On-Chain Enforcement:** A Chainlink CRE workflow writes a signed report to ClauseGuardRegistry (Sepolia deployment pending). A smart contract (`ClauseGuardGate.sol`) blocks signing or escrow release until a lawyer approves the specific report hash.

## How It Works

| Layer | What it does |
|---|---|
| `rules.js` | 35 deterministic rules across 7 categories. Each rule checks for missing clauses or risky wording. Runs only when relevant to the detected contract type. |
| Score | Share of applicable checks passed, weighted by severity (high/medium/low) → grade A–F. |
| Proof | `docHash = sha256(text)`. `reportHash = sha256(canonical JSON {docHash, ruleset, score, grade, findings})`. Deterministic across machines. |
| `index.html` | Runs entirely in the browser. Highlights risky sentences. Exports Markdown/JSON. Simulates on-chain enforcement logic locally. |
| `api/review.js` | Stateless serverless API for AI agents and CRE workflows. Nothing is stored. |
| `cre/` | Chainlink CRE workflow. DON nodes call the API with consensus, re-hash the text, check external legal data (EUR-Lex, GLEIF), and write a signed report to `ClauseGuardRegistry` (Sepolia deployment pending). |

## Architecture

```mermaid
flowchart LR
  User/HTTP trigger --> CRE DON nodes
  CRE DON nodes --> ClauseGuard API consensus
  ClauseGuard API consensus --> EUR-Lex Cellar consensus
  ClauseGuard API consensus --> GLEIF consensus
  EUR-Lex Cellar consensus --> workflow recomputes doc hash
  GLEIF consensus --> workflow recomputes doc hash
  workflow recomputes doc hash --> decision needsLawyer
  decision needsLawyer --> signed report
  signed report --> ClauseGuardRegistry Sepolia
  ClauseGuardRegistry Sepolia --> ClauseGuardGate
  ClauseGuardGate --> sign / escrow release blocked or allowed
  Lawyer approve --> ClauseGuardGate
```

### On-Chain Enforcement (`ClauseGuardGate.sol`)
- **Action Contract:** Reads the latest review from `ClauseGuardRegistry`.
- **Blocking:** `sign()` and `release()` revert with `NeedsLawyer(docHash)` if the latest review has `needsLawyer = true`.
- **Approval:** A lawyer (owner-approved address) must call `approve(reportHash)` with the **exact** latest report hash.
- **Stale Protection:** `approve()` reverts with `StaleReport` if the hash doesn't match the latest review. A newer review automatically invalidates old approvals.
- **Fair Contracts:** If `needsLawyer = false`, signing/release proceeds without lawyer approval.
- **Refund:** Offtaker can refund before both parties sign.

## How ClauseGuard Compares

| Feature | ClauseGuard | Generic AI Contract Review | RWA Compliance Gates |
|---|---|---|---|
| **Focus** | Everyday consumer/SME contracts with type-specific rule sets | Any contract | Tokens |
| **Explainability** | Deterministic rules with quoted evidence | Black-box LLM output | Compliance flags |
| **Legal Context** | Live law status from EUR-Lex | Static training data | Static rules |
| **On-Chain Action** | Blocks signing/escrow until lawyer approves exact hash | None | Token minting/burning |
| **Lawyer Loop** | Approves specific report hash | General advice | N/A |
| **Privacy** | Contract text stays private (hashes only) | Text sent to LLM | Metadata only |

## What is different from LexProof and Legal Notary-style tools
As far as their public pages show, tools like LexProof or Legal Notary typically stamp/notarize a document or provide a broad AI review. ClauseGuard provides:
1. **Deterministic, explainable findings** with quoted evidence and citations.
2. **Type-specific rules** (e.g., rental vs. SaaS vs. loan).
3. **On-chain ACTION:** Signing/escrow is blocked until a lawyer approves the exact report hash.
4. **Privacy:** The contract text never leaves the browser; only hashes are on-chain.

## Run & Test

### Engine & Web
```bash
node test.js                                           # 8 sample contracts, evidence, determinism
npx serve .                                            # or any static server, then open index.html
```

### CRE Workflow
```bash
cd cre/clauseguard-attest
npm install
bun test                                               # 13 workflow tests with CRE SDK test runtime
```

### Contracts
```bash
cd cre/contracts
npm install
npm run build
node gate-test.mjs                                     # 27 assertions on local chain (ganache)
node local-test.mjs                                    # Registry tests
```

### E2E
```bash
node e2e/gate.cjs                                      # 10 checks
node e2e/types.cjs                                     # 16 checks
```

## Cited Sources
- Directive 93/13/EEC (Unfair Contract Terms; CJEU C-488/11 for tenancies)
- Consumer Rights Directive 2011/83/EU Art. 9 and Art. 11a (added by Directive (EU) 2023/2673)
- Consumer Credit Directive 2008/48/EC Art. 10/14/16 (replaced by (EU) 2023/2225 from 20 Nov 2026)
- Late Payment Directive 2011/7/EU
- GDPR Art. 20/28
- Data Act (EU) 2023/2854
- ECHR Art. 8
- Electricity Directive (EU) 2019/944
- MiCA (Regulation (EU) 2023/1114)
- SEC v. W.J. Howey (US)

## Limits (honest)
- Rules are keyword and pattern-based. They can miss clauses written in unusual words.
- English only for now. Ukrainian and Polish rule packs are next.
- **Sepolia deployment and CRE CLI simulation: pending.**

Author: Vadym, Solar DePIN Hub (Ukraine). License: MIT.
