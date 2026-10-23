/* ClauseGuard rules engine v2 — deterministic, explainable, runs in browser and Node.
 * Each rule: detection (missing clause = `need`, risky wording = `bad`), the sentence that triggered it,
 * why it matters (with the legal source it is based on), a question to ask a lawyer and a fairer wording.
 * Not legal advice: a first-pass checklist so non-lawyers know what to ask. */
(function (root) {
const RULESET_VERSION = 'clauseguard-rules-2.0.0';

const TYPES = {
  ppa:   { label: 'Solar power purchase agreement (PPA)', re: /power purchase|\bppa\b|per kwh|energy (?:will be|shall be) (?:sold|delivered)|offtake/i },
  share: { label: 'Energy-sharing / net-metering agreement', re: /energy (?:community|sharing)|net[- ]metering|feed-in|surplus (?:energy|electricity)/i },
  token: { label: 'Tokenized revenue share (RWA)', re: /token|revenue share|investor|nft|smart contract|on-chain/i },
};

// sev: high = could cost you the project or money; med = dispute risk; low = good practice
const RULES = [
 {id:'law', cat:'Basics', title:'Governing law', sev:'med', need:/governed by|governing law|laws of/i,
  msg:'No governing-law clause.', why:'Without it, a cross-border dispute starts with a fight about which country\'s law applies.',
  ask:'Which country\'s law applies, and is that practical for me?', fix:'"This Agreement is governed by the laws of [country]."'},
 {id:'dispute', cat:'Basics', title:'Dispute resolution', sev:'high', need:/arbitrat|dispute|mediat|jurisdiction of the courts|courts of/i,
  msg:'No way to resolve disputes is defined.', why:'Small producers cannot afford open-ended litigation; a named forum or mediation step keeps costs predictable.',
  ask:'Where and how do we resolve a dispute, and who pays the costs?', fix:'"Disputes go first to mediation for 30 days, then to [court/arbitration] in [city]."'},
 {id:'term', cat:'Basics', title:'Term & termination', sev:'high', need:/terminat/i,
  msg:'No termination rights.', why:'A 10–25 year energy contract with no exit can trap you if the buyer stops paying or the site is sold.',
  ask:'How can each side exit early, with what notice, and what happens to the equipment?', fix:'"Either party may terminate on 60 days\' notice after a material breach that is not cured within 30 days."'},
 {id:'termfee', cat:'Money', title:'Early-termination penalty', sev:'med', bad:/termination (?:fee|penalty)|liquidated damages|pay (?:all|the) remaining/i,
  msg:'Early-termination fee or liquidated damages present.', why:'Fees equal to "all remaining payments" can exceed the value of the system. They should decline over time.',
  ask:'How is the fee calculated, and does it go down each year?', fix:'"The termination fee declines linearly to zero by year [N] and never exceeds the system\'s depreciated value."'},
 {id:'unilateral', cat:'Fairness', title:'Unilateral changes', sev:'high', bad:/sole discretion|at any time(?! by mutual)|without (?:prior )?notice|reserves the right to (?:change|amend|modify)/i,
  msg:'One party can change terms or price on its own.', why:'Terms letting a seller alter the contract or price unilaterally without a valid reason are listed as potentially unfair in EU Directive 93/13/EEC (Annex, points 1(j) and 1(l)). EU energy consumers must be told about price changes and may then leave (Directive (EU) 2019/944, Art. 10).',
  ask:'Can the price change only by a published formula, with notice and a right to exit?', fix:'"Price changes follow [index] only, with 30 days\' written notice; the Buyer may terminate without fee."'},
 {id:'price', cat:'Money', title:'Price formula / indexation', sev:'med', when:/price|tariff|per kwh|payment/i, need:/index|escalat|fixed (?:price|rate)|formula|cpi|inflation/i,
  msg:'Price is mentioned but there is no fixed rate or formula.', why:'A clear formula (fixed, or tied to a public index) is what makes a long-term PPA bankable.',
  ask:'Is the price fixed or indexed, and to what?', fix:'"The price is [X] per kWh, escalating by [2]% per year."'},
 {id:'meter', cat:'Energy', title:'Metering & measurement', sev:'high', when:/kwh|energy|electricity|power/i, need:/meter|measurement|measured/i,
  msg:'Energy quantity is not tied to a meter.', why:'If nobody defines which meter counts the kWh, billing disputes are almost guaranteed.',
  ask:'Which meter is the source of truth, who reads it, and how are faulty readings corrected?', fix:'"Energy is measured by a certified meter at [point]; either party may request a calibration test."'},
 {id:'curtail', cat:'Energy', title:'Curtailment & grid outages', sev:'med', when:/kwh|energy|electricity|grid/i, need:/curtail|grid (?:outage|failure|operator)|deemed energy/i,
  msg:'No rule for curtailment or grid outages.', why:'If the grid operator limits export, who carries the lost revenue? Unclear allocation is a common PPA dispute.',
  ask:'Do I get paid for energy I could not deliver because of the grid?', fix:'"Energy curtailed by the Buyer is paid as deemed energy; grid-operator curtailment is shared [50/50]."'},
 {id:'force', cat:'Risk', title:'Force majeure', sev:'med', need:/force majeure/i,
  msg:'No force-majeure clause.', why:'War, blackouts and extreme weather are real risks for energy assets (very real in Ukraine). Without a clause, non-delivery may be a breach.',
  ask:'Which events excuse performance, and for how long before we can exit?', fix:'"Force majeure includes war, grid failure and natural disasters; after 90 days either party may terminate."'},
 {id:'insure', cat:'Risk', title:'Insurance & damage', sev:'low', when:/panel|system|equipment|installation/i, need:/insur/i,
  msg:'No insurance clause for the equipment.', why:'Panels on a roof can be damaged by storms, fire or war; the contract should say who insures them.',
  ask:'Who insures the system and the roof, and who is the beneficiary?', fix:'"The Owner keeps property and liability insurance for the System and names the Host as additional insured."'},
 {id:'liab', cat:'Risk', title:'Limitation of liability', sev:'med', need:/limitation of liability|liability (?:is|shall be) (?:limited|capped)|aggregate liability/i,
  msg:'No liability cap.', why:'Uncapped liability can exceed the value of the whole contract for a small producer.',
  ask:'What is the maximum each side can owe, and what is excluded from the cap?', fix:'"Each party\'s aggregate liability is capped at the fees paid in the previous 12 months, except for fraud or gross negligence."'},
 {id:'onesided', cat:'Fairness', title:'One-sided liability', sev:'high', bad:/(?:seller|buyer|company|issuer|platform) (?:shall|will) not be liable (?:for any|under any)|no liability whatsoever/i,
  msg:'One party excludes all of its liability.', why:'A blanket exclusion for one side only shifts every risk onto you; in consumer contracts such exclusions may be unfair (Directive 93/13/EEC, Annex point 1(b)).',
  ask:'Why is the other side not liable for anything, even its own fault?', fix:'Make the cap mutual, and exclude fraud and gross negligence from it.'},
 {id:'data', cat:'Privacy', title:'Data protection (meter data)', sev:'med', when:/meter|consumption|personal|customer|kyc/i, need:/personal data|gdpr|privacy|data protection/i,
  msg:'Consumption or customer data is used but there is no data-protection clause.', why:'Smart-meter readings of a household can reveal daily life and are personal data under the GDPR (Regulation (EU) 2016/679).',
  ask:'What data is collected, for what purpose, who receives it and for how long?', fix:'"Meter data is processed only for billing under the GDPR, kept for [N] years, and never sold."'},
 {id:'assign', cat:'Basics', title:'Assignment / change of owner', sev:'low', need:/assign|transfer (?:of|this) agreement|successor/i,
  msg:'Nothing about selling the property or transferring the contract.', why:'If the house or the solar company is sold, the contract must say whether it moves to the new owner.',
  ask:'What happens if I sell the building or the other side is acquired?', fix:'"Either party may assign this Agreement to a successor with written notice; consent is not unreasonably withheld."'},
 {id:'token', cat:'Tokenization', title:'Securities / risk disclosure', sev:'high', when:/token|revenue share|investor/i, need:/securities|risk (?:factors|disclosure)|prospectus|white ?paper|not (?:a )?guarantee/i,
  msg:'Tokens give a share of revenue but there is no securities or risk disclosure.', why:'A token sold with an expectation of profit from others\' efforts can be a security (US: SEC v. W.J. Howey Co., 1946). In the EU, MiCA (Regulation (EU) 2023/1114) does not cover tokens that are financial instruments; those fall under securities law.',
  ask:'Has a lawyer classified this token, and which prospectus or exemption applies?', fix:'Add a risk-factor section and state the legal classification of the token and the exemption relied on.'},
 {id:'kyc', cat:'Tokenization', title:'KYC / AML', sev:'med', when:/token|investor|wallet/i, need:/kyc|aml|know your customer|anti-money/i,
  msg:'Investors are onboarded without KYC/AML.', why:'Issuers of investment tokens are usually expected to identify investors and screen sanctions lists.',
  ask:'Who runs KYC and sanctions screening on token holders?', fix:'"Only wallets that pass KYC/AML checks by [provider] may hold or receive Tokens."'},
 {id:'oracle', cat:'Tokenization', title:'Data source for payouts', sev:'med', when:/token|smart contract|on-chain|payout/i, need:/oracle|meter data (?:is|will be) (?:published|reported)|data source|audited/i,
  msg:'Payouts depend on energy data, but the data source is not defined.', why:'If a smart contract pays investors from production, everyone must agree which data feed is the truth and what happens when it is wrong.',
  ask:'Which data source triggers payouts, and how are errors corrected?', fix:'"Payouts use meter data delivered by [oracle]; disputed readings are corrected in the next period."'},
];

const SEV_PENALTY = { high: 15, med: 8, low: 3 };

function splitSentences(txt) {
  return txt.replace(/\r/g, '').split(/(?<=[.;:!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}
function detectTypes(txt) {
  return Object.entries(TYPES).filter(([, t]) => t.re.test(txt)).map(([k, t]) => ({ id: k, label: t.label }));
}
function check(txt) {
  txt = String(txt || '');
  const sentences = splitSentences(txt);
  const findings = [], passed = [];
  for (const r of RULES) {
    if (r.when && !r.when.test(txt)) continue;
    let hit = false, evidence = null;
    if (r.need && !r.need.test(txt)) hit = true;
    if (r.bad) {
      const s = sentences.find(x => r.bad.test(x));
      if (s) { hit = true; evidence = s; }
    }
    const base = { id: r.id, category: r.cat, title: r.title };
    if (hit) findings.push({ ...base, level: r.sev, msg: r.msg, why: r.why, ask: r.ask, fix: r.fix, evidence, kind: r.bad && evidence ? 'risky wording' : 'missing clause' });
    else { const s = r.need && sentences.find(x => r.need.test(x)); passed.push({ ...base, evidence: s || null }); }
  }
  const order = { high: 0, med: 1, low: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  // Score = share of applicable checks passed, weighted by severity (high 15, med 8, low 3).
  const lost = findings.reduce((s, f) => s + SEV_PENALTY[f.level], 0);
  const total = lost + passed.reduce((s, p) => s + SEV_PENALTY[RULES.find(r => r.id === p.id).sev], 0);
  const score = total ? Math.round(100 * (1 - lost / total)) : 0;
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 30 ? 'D' : 'F';
  return { ruleset: RULESET_VERSION, types: detectTypes(txt), score, grade,
    counts: { high: findings.filter(f => f.level === 'high').length, med: findings.filter(f => f.level === 'med').length, low: findings.filter(f => f.level === 'low').length, passed: passed.length },
    findings, passed, words: txt.split(/\s+/).filter(Boolean).length };
}
// Canonical JSON (sorted keys) so the same review always gives the same report hash.
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function reportPayload(docHash, r) {
  return { docHash, ruleset: r.ruleset, score: r.score, grade: r.grade, findings: r.findings.map(f => ({ id: f.id, level: f.level, evidence: f.evidence })) };
}
const api = { check, canonical, reportPayload, RULES, TYPES, RULESET_VERSION, splitSentences };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ClauseGuard = api;
})(typeof self !== 'undefined' ? self : this);
