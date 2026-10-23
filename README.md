# ⚖️ ClauseGuard

**First-pass contract check for small solar producers.** Paste a rooftop-solar PPA, an energy-sharing agreement or tokenized revenue-share terms. ClauseGuard finds missing and one-sided clauses and quotes the sentence that triggered each finding. For every finding it explains why it matters, with the legal source, and gives the question to ask a lawyer and a fairer wording. Every review produces a SHA-256 fingerprint of the document and of the report. A Chainlink CRE workflow can write that fingerprint on-chain.

- Live app: https://clauseguard-bli.vercel.app
- API: `POST https://clauseguard-bli.vercel.app/api/review` with `{"text": "..."}`. `GET` lists the rules.
- Chainlink CRE workflow + registry contract: [`cre/`](cre/README.md)

> Not legal advice. ClauseGuard is a checklist that helps people prepare for a lawyer. It does not replace one.

## Why
Households, farms and small businesses sign 10–25 year solar PPAs, energy-sharing deals and now tokenized revenue-share terms, usually without a lawyer. The expensive problems are predictable. A seller can change the price at its sole discretion. A termination fee can equal all remaining payments. One side can exclude its own liability. Contracts often say nothing about metering, curtailment or force majeure (war and blackouts are real risks in Ukraine), and tokens get sold to investors without any securities or KYC disclosure.

## How it works
| Layer | What it does |
|---|---|
| `rules.js` | 17 deterministic rules in 7 categories. Each rule is either a *missing clause* check or a *risky wording* check, and it only runs when relevant (token rules only when tokens or investors are mentioned). A finding gives the evidence sentence, why it matters, the source (EU Directive 93/13/EEC on unfair terms, Directive (EU) 2019/944 Art. 10, GDPR, MiCA, SEC v. W.J. Howey), a question for the lawyer and a fairer wording. |
| Score | Share of applicable checks passed, weighted by severity (high 15 / medium 8 / low 3) → grade A–F. |
| Proof | `docHash = sha256(text)`. `reportHash = sha256(canonical JSON {docHash, ruleset, score, grade, findings})`. The same text and ruleset give the same hashes on any machine. The UI can verify a hash you received and can anchor the report hash with an EVM wallet. |
| `index.html` | Runs entirely in the browser (nothing is uploaded). It shows the document with risky sentences highlighted and exports the report as Markdown/JSON plus a list of lawyer questions. |
| `api/review.js` | The same engine as a stateless serverless API for AI agents and the CRE workflow. Nothing is stored. |
| `cre/` | A Chainlink CRE workflow. An HTTP trigger sends the text, DON nodes call the API with consensus, the workflow re-hashes the text and decides whether to flag `needsLawyer`, then writes a signed report to `ClauseGuardRegistry` on Sepolia. |

## Run & test
```bash
node test.js                                           # engine tests (3 sample contracts, evidence, determinism)
npx serve .                                            # or any static server, then open index.html
cd cre/clauseguard-attest && bun install && bun test   # CRE workflow tests (SDK test runtime + mocks)
cd cre/contracts && npm i && npm run build && npm test # registry contract on a local chain
```
Sample contracts in `samples.js` were written for the demo and are fictional.

## Limits (honest)
- The rules are keyword and pattern based. They can miss a clause written in unusual words, or credit a clause that exists but is bad. That is why every finding shows its evidence, and the app tells the user to consult a lawyer.
- English only for now. Ukrainian and Polish rule packs are next.
- The CRE simulation and Sepolia deployment need a CRE account login. See `cre/README.md` for what is verified today.

Author: Vadym, Solar DePIN Hub (Ukraine). License: MIT.
