/* ClauseGuard rules engine v3 — deterministic, explainable, runs in browser and Node.
 * Each rule: detection (missing clause = `need`, risky wording = `bad`), the sentence that triggered it,
 * why it matters (with the legal source it is based on), a question to ask a lawyer and a fairer wording.
 * Not legal advice: a first-pass checklist so non-lawyers know what to ask. */
(function (root) {
const RULESET_VERSION = 'clauseguard-rules-3.0.0';

const DISCLAIMER = 'ClauseGuard is an automated first-pass checklist, not legal advice and not a lawyer. Laws differ by country; the cited sources are EU/US references unless stated. Ask a qualified lawyer in your jurisdiction before signing.';

const TYPES = {
  ppa:   { label: 'Solar power purchase agreement (PPA)', re: /power purchase|\bppa\b|per kwh|energy (?:will be|shall be) (?:sold|delivered)|offtake/i },
  share: { label: 'Energy-sharing / net-metering agreement', re: /energy (?:community|sharing)|net[- ]metering|feed-in|surplus (?:energy|electricity)/i },
  token: { label: 'Tokenized revenue share (RWA)', re: /token|revenue share|investor|nft|smart contract|on-chain/i },
  rental: { label: 'Apartment / residential rental', re: /\btenant|landlord|security deposit|monthly rent|lease of the (?:apartment|flat|premises)/i },
  freelance: { label: 'Freelance / service agreement', re: /freelanc|\bcontractor\b|statement of work|deliverables|the client (?:shall|will) pay/i },
  saas: { label: 'Subscription / SaaS terms', re: /subscription|\bsaas\b|software as a service|auto-?renew|automatically renew/i },
  loan: { label: 'Consumer loan / credit', re: /\bloan\b|\bborrower|\blender\b|annual percentage rate/i },
};

// sev: high = could cost you the project or money; med = dispute risk; low = good practice
const RULES = [
 {id:'law', cat:'Basics', title:'Governing law', sev:'med', need:/governed by|governing law|laws of/i,
  msg:'No governing-law clause.', why:'Without it, a cross-border dispute starts with a fight about which country\'s law applies.',
  ask:'Which country\'s law applies, and is that practical for me?', fix:'"This Agreement is governed by the laws of [country]."'},
 {id:'dispute', cat:'Basics', title:'Dispute resolution', sev:'high', need:/arbitrat|dispute|mediat|jurisdiction of the courts|courts of/i,
  msg:'No way to resolve disputes is defined.', why:'Without a named forum or mediation step, an ordinary person or small business cannot predict the cost of a dispute.',
  ask:'Where and how do we resolve a dispute, and who pays the costs?', fix:'"Disputes go first to mediation for 30 days, then to [court/arbitration] in [city]."'},
 {id:'term', cat:'Basics', title:'Term & termination', sev:'high', need:/terminat/i,
  msg:'No termination rights.', why:'A contract with no exit can trap you if the other side stops performing or your situation changes.',
  ask:'How can each side exit early, with what notice, and what happens to money already paid?', fix:'"Either party may terminate on 60 days\' notice after a material breach that is not cured within 30 days."'},
 {id:'termfee', cat:'Money', title:'Early-termination penalty', sev:'med', bad:/termination (?:fee|penalty)|liquidated damages|pay (?:all|the) remaining/i,
  msg:'Early-termination fee or liquidated damages present.', why:'Fees equal to "all remaining payments" can exceed the value you actually received. They should decline over time.',
  ask:'How is the fee calculated, and does it go down each year?', fix:'"The early-termination fee declines linearly to zero by the end of the term and never exceeds the actual loss."'},
 {id:'unilateral', cat:'Fairness', title:'Unilateral changes', sev:'high', bad:/sole discretion|reserves the right to (?:change|amend|modify|increase)|(?:change|amend|modify|alter|increase)[^.]*(?:at any time|without (?:prior )?notice)/i,
  msg:'One party can change terms or price on its own.', why:'Terms letting a business alter the contract or price unilaterally without a valid reason are listed as potentially unfair in EU Directive 93/13/EEC (Annex, points 1(j) and 1(l)).',
  ask:'Can the price change only by a published formula, with notice and a right to exit?', fix:'"Price changes follow [index] only, with 30 days\' written notice; the Buyer may terminate without fee."',
  law:'EU: Directive 93/13/EEC (Annex 1(j),(l)); energy: Directive (EU) 2019/944 Art. 10. Outside the EU, check local consumer law.'},
 {id:'price', cat:'Money', title:'Price formula / indexation', sev:'med', when:/price|tariff|per kwh|payment/i, need:/index|escalat|fixed (?:price|rate)|formula|cpi|inflation/i,
  msg:'Price is mentioned but there is no fixed rate or formula.', why:'A clear formula (fixed, or tied to a public index) lets you budget and compare offers.',
  ask:'Is the price fixed or indexed, and to what?', fix:'"The price is [X], adjusted once a year by [CPI], with 30 days\' notice."'},
 {id:'meter', cat:'Energy', title:'Metering & measurement', sev:'high', when:/kwh|energy|electricity|power/i, need:/meter|measurement|measured/i, types:['ppa','share'],
  msg:'Energy quantity is not tied to a meter.', why:'If nobody defines which meter counts the kWh, billing disputes are almost guaranteed.',
  ask:'Which meter is the source of truth, who reads it, and how are faulty readings corrected?', fix:'"Energy is measured by a certified meter at [point]; either party may request a calibration test."'},
 {id:'curtail', cat:'Energy', title:'Curtailment & grid outages', sev:'med', when:/kwh|energy|electricity|grid/i, need:/curtail|grid (?:outage|failure|operator)|deemed energy/i, types:['ppa','share'],
  msg:'No rule for curtailment or grid outages.', why:'If the grid operator limits export, who carries the lost revenue? Unclear allocation is a common PPA dispute.',
  ask:'Do I get paid for energy I could not deliver because of the grid?', fix:'"Energy curtailed by the Buyer is paid as deemed energy; grid-operator curtailment is shared [50/50]."'},
 {id:'force', cat:'Risk', title:'Force majeure', sev:'med', need:/force majeure/i,
  msg:'No force-majeure clause.', why:'War, blackouts, pandemics and natural disasters can make performance impossible (very real in Ukraine). Without a clause, non-performance may be a breach.',
  ask:'Which events excuse performance, and for how long before we can exit?', fix:'"Force majeure includes war, epidemics, utility or grid failure and natural disasters; after 90 days either party may terminate."'},
 {id:'insure', cat:'Risk', title:'Insurance & damage', sev:'low', when:/panel|system|equipment|installation/i, need:/insur/i, types:['ppa','share'],
  msg:'No insurance clause for the equipment.', why:'Panels on a roof can be damaged by storms, fire or war; the contract should say who insures them.',
  ask:'Who insures the system and the roof, and who is the beneficiary?', fix:'"The Owner keeps property and liability insurance for the System and names the Host as additional insured."'},
 {id:'liab', cat:'Risk', title:'Limitation of liability', sev:'med', need:/limitation of liability|liability (?:is|shall be) (?:limited|capped)|aggregate liability/i,
  msg:'No liability cap.', why:'Uncapped liability can exceed the value of the whole contract for a consumer, freelancer or small business.',
  ask:'What is the maximum each side can owe, and what is excluded from the cap?', fix:'"Each party\'s aggregate liability is capped at the fees paid in the previous 12 months, except for fraud or gross negligence."'},
 {id:'onesided', cat:'Fairness', title:'One-sided liability', sev:'high', bad:/(?:seller|buyer|company|issuer|platform) (?:shall|will) not be liable (?:for any|under any)|no liability whatsoever/i,
  msg:'One party excludes all of its liability.', why:'A blanket exclusion for one side only shifts every risk onto you; in consumer contracts such exclusions may be unfair (Directive 93/13/EEC, Annex point 1(b)).',
  ask:'Why is the other side not liable for anything, even its own fault?', fix:'Make the cap mutual, and exclude fraud and gross negligence from it.',
  law:'EU consumer contracts: Directive 93/13/EEC Annex 1(b). In B2B contracts exclusions are usually allowed but limited by national law (e.g. fraud).'},
 {id:'data', cat:'Privacy', title:'Data protection (meter data)', sev:'med', when:/meter|consumption|personal|customer|kyc/i, need:/personal data|gdpr|privacy|data protection/i,
  msg:'Personal or customer data is used but there is no data-protection clause.', why:'Personal data (e.g. tenant IDs, customer records, smart-meter readings) must be processed lawfully under the GDPR (Regulation (EU) 2016/679).',
  ask:'What data is collected, for what purpose, who receives it and for how long?', fix:'"Meter data is processed only for billing under the GDPR, kept for [N] years, and never sold."',
  law:'EU/EEA: GDPR (Regulation (EU) 2016/679). Ukraine: Law No. 2297-VI on Personal Data Protection.'},
 {id:'assign', cat:'Basics', title:'Assignment / change of owner', sev:'low', need:/assign|transfer (?:of|this) agreement|successor/i,
  msg:'Nothing about selling the property or transferring the contract.', why:'If the property, business or account changes hands, the contract must say whether it moves to the new owner.',
  ask:'What happens if I sell, move, or the other side is acquired?', fix:'"Either party may assign this Agreement to a successor with written notice; consent is not unreasonably withheld."'},
 {id:'token', cat:'Tokenization', title:'Securities / risk disclosure', sev:'high', when:/token|revenue share|investor/i, need:/securities|risk (?:factors|disclosure)|prospectus|white ?paper|not (?:a )?guarantee/i, types:['token'],
  msg:'Tokens give a share of revenue but there is no securities or risk disclosure.', why:'A token sold with an expectation of profit from others\' efforts can be a security (US: SEC v. W.J. Howey Co., 1946). In the EU, MiCA (Regulation (EU) 2023/1114) does not cover tokens that are financial instruments; those fall under securities law.',
  ask:'Has a lawyer classified this token, and which prospectus or exemption applies?', fix:'Add a risk-factor section and state the legal classification of the token and the exemption relied on.',
  law:'US: Howey test (SEC v. W.J. Howey Co., 1946). EU: MiCA (Regulation (EU) 2023/1114) and securities law.'},
 {id:'kyc', cat:'Tokenization', title:'KYC / AML', sev:'med', when:/token|investor|wallet/i, need:/kyc|aml|know your customer|anti-money/i, types:['token'],
  msg:'Investors are onboarded without KYC/AML.', why:'Issuers of investment tokens are usually expected to identify investors and screen sanctions lists.',
  ask:'Who runs KYC and sanctions screening on token holders?', fix:'"Only wallets that pass KYC/AML checks by [provider] may hold or receive Tokens."',
  law:'US: Howey test (SEC v. W.J. Howey Co., 1946). EU: MiCA (Regulation (EU) 2023/1114) and securities law.'},
 {id:'oracle', cat:'Tokenization', title:'Data source for payouts', sev:'med', when:/token|smart contract|on-chain|payout/i, need:/oracle|meter data (?:is|will be) (?:published|reported)|data source|audited/i, types:['token'],
  msg:'Payouts depend on energy data, but the data source is not defined.', why:'If a smart contract pays investors from production, everyone must agree which data feed is the truth and what happens when it is wrong.',
  ask:'Which data source triggers payouts, and how are errors corrected?', fix:'"Payouts use meter data delivered by [oracle]; disputed readings are corrected in the next period."',
  law:'US: Howey test (SEC v. W.J. Howey Co., 1946). EU: MiCA (Regulation (EU) 2023/1114) and securities law.'},
 {id:'rdeposit', cat:'Money', title:'Deposit return', sev:'med', types:['rental'], need:/deposit[^.]*(?:return|refund)|(?:return|refund)[^.]*deposit/i,
  msg:'No rule for returning the security deposit.', why:'Without a deadline and conditions, deposits are a top source of tenant disputes.',
  ask:'When and how is the deposit returned, and which deductions are allowed?', fix:'"The deposit is returned within 30 days after handover, minus documented damage beyond normal wear and tear."',
  law:'Deposit caps and return deadlines are national law (e.g. Germany: BGB section 551 caps the deposit at 3 months\' net rent). EU Directive 93/13/EEC covers tenancies with a professional landlord (CJEU C-488/11 Asbeek Brusse).'},
 {id:'rforfeit', cat:'Fairness', title:'Deposit forfeit / penalty', sev:'high', types:['rental','freelance','saas','loan'], bad:/forfeit[^.]*deposit|penalty (?:equal to|of) (?:\d+|three|six|twelve) months/i,
  msg:'A disproportionate penalty or full deposit forfeit.', why:'Requiring a consumer who breaches the contract to pay a disproportionately high sum is listed as potentially unfair.',
  ask:'Can the penalty be limited to the actual, documented loss?', fix:'"Only documented, actual losses may be deducted."',
  law:'EU: Directive 93/13/EEC Annex 1(e). Outside the EU, check local consumer law.'},
 {id:'rentry', cat:'Privacy', title:'Landlord entry', sev:'high', types:['rental'], bad:/(?:landlord|owner) (?:may|can) enter[^.]*(?:at any time|without (?:prior )?notice)/i,
  msg:'The landlord may enter the home at any time or without notice.', why:'Respect for the home is a fundamental right; entry normally needs notice and a reason except emergencies.',
  ask:'With how much notice and for which reasons may the landlord enter?', fix:'"The Landlord may enter with 24 hours\' notice for inspections or repairs, or without notice only in an emergency."',
  law:'European Convention on Human Rights Art. 8 (respect for home); notice periods are national law.'},
 {id:'rrepair', cat:'Basics', title:'Repairs & maintenance', sev:'med', types:['rental'], need:/repair|maintenan/i,
  msg:'Nobody is responsible for repairs.', why:'If the boiler breaks, the contract should say who pays and how fast it is fixed.',
  ask:'Who pays for which repairs, and how quickly must urgent ones be done?', fix:'"The Landlord carries out structural and urgent repairs within [7] days; the Tenant handles minor upkeep."'},
 {id:'fpayterm', cat:'Money', title:'Payment deadline', sev:'med', types:['freelance'], need:/within \d+ days|net[ -]?\d+|payment terms/i,
  msg:'No payment deadline.', why:'Without a deadline you cannot claim late-payment interest.',
  ask:'Within how many days after the invoice am I paid?', fix:'"Invoices are payable within 30 days."',
  law:'EU B2B: Late Payment Directive 2011/7/EU Art. 3 (max 60 days unless expressly agreed and not grossly unfair) and Art. 6 (EUR 40 minimum compensation).'},
 {id:'flatepay', cat:'Money', title:'Very long payment term', sev:'high', types:['freelance'], bad:/(?:pay|paid|payable|payment|invoice)[^.]*(?:within|after) (?:9\d|1\d\d|[2-9]\d\d) days|(?:within|after) (?:9\d|1\d\d|[2-9]\d\d) days[^.]*invoice|net[ -]?(?:9\d|1\d\d)/i,
  msg:'Payment term of 90+ days.', why:'Long payment terms shift the client\'s cash-flow risk onto the freelancer.',
  ask:'Can we agree on 30 days, with interest for late payment?', fix:'"Invoices are payable within 30 days; late payments bear statutory interest."',
  law:'EU B2B: Late Payment Directive 2011/7/EU Art. 3 (terms over 60 days only if expressly agreed and not grossly unfair to the creditor).'},
 {id:'fip', cat:'Rights', title:'IP grab incl. pre-existing work', sev:'high', types:['freelance'], bad:/(?:all|any) (?:intellectual property|rights)[^.]*(?:pre-existing|prior|background|including (?:any|all) (?:tools|code|work) created before)/i,
  msg:'The client takes rights in your pre-existing tools or past work.', why:'Assigning your background IP means you may not reuse your own code or templates for other clients.',
  ask:'Can the transfer cover only the paid deliverables, with a licence for my pre-existing tools?', fix:'"Client owns the paid Deliverables; Contractor keeps pre-existing materials and grants a non-exclusive licence to use them in the Deliverables."',
  law:'Copyright transfer rules are national law (in the EU, moral rights generally cannot be assigned). Check local copyright law.'},
 {id:'faccept', cat:'Basics', title:'Acceptance of work', sev:'med', types:['freelance'], need:/accept(?:ance|ed)|approv/i,
  msg:'No acceptance procedure.', why:'Without a deadline for feedback, the client can delay sign-off (and payment) forever.',
  ask:'How long does the client have to accept or reject, and what happens if they stay silent?', fix:'"Deliverables are deemed accepted if no written, specific objection is received within 10 days."'},
 {id:'fnoncomp', cat:'Fairness', title:'Broad non-compete', sev:'med', types:['freelance'], bad:/non-compet|shall not (?:work|provide services) for any (?:other )?(?:client|company|competitor)/i,
  msg:'A broad non-compete limits who else you may work for.', why:'For a freelancer, a wide non-compete can block your income.',
  ask:'Can it be limited to named direct competitors and a short period, with compensation?', fix:'"For 6 months, Contractor will not work for [named competitors] on the same product."',
  law:'Non-compete enforceability is national law and often needs limits in time, scope and compensation.'},
 {id:'scancel', cat:'Basics', title:'Easy cancellation', sev:'high', types:['saas'], need:/cancel/i,
  msg:'No way to cancel the subscription is described.', why:'Consumers must be able to end a contract as easily as they entered it.',
  ask:'How do I cancel, and does it stop the next charge?', fix:'"You can cancel online at any time in Account settings; cancellation takes effect at the end of the paid period."',
  law:'EU: Consumer Rights Directive 2011/83/EU Art. 11a (withdrawal function, added by Directive (EU) 2023/2673, applies from 19 June 2026). Outside the EU, check local consumer law.'},
 {id:'sautorenew', cat:'Fairness', title:'Auto-renewal trap', sev:'med', types:['saas'], bad:/automatic(?:ally)? renew[^.]*(?:\d{2,3}) days|renews? automatically[^.]*(?:\d{2,3}) days/i,
  msg:'Automatic renewal with a long notice period to stop it.', why:'Automatic extension with an unreasonably early deadline to object is listed as potentially unfair.',
  ask:'Can renewal be monthly, with a reminder before each charge?', fix:'"The subscription renews monthly; we email a reminder 7 days before each renewal."',
  law:'EU: Directive 93/13/EEC Annex 1(h). Outside the EU, check local consumer law.'},
 {id:'swithdraw', cat:'Basics', title:'14-day withdrawal', sev:'med', types:['saas','loan'], need:/withdraw|14 days|fourteen days|cooling[- ]off/i,
  msg:'No withdrawal (cooling-off) right is mentioned.', why:'Online consumer contracts usually come with a 14-day right to withdraw.',
  ask:'Can I withdraw within 14 days and get my money back?', fix:'"You may withdraw within 14 days without giving a reason."',
  law:'EU: Consumer Rights Directive 2011/83/EU Art. 9 (distance contracts); for consumer credit, Directive 2008/48/EC Art. 14 (replaced by Directive (EU) 2023/2225 from 20 Nov 2026).'},
 {id:'sdpa', cat:'Privacy', title:'Processor terms (DPA)', sev:'med', types:['saas'], when:/personal data|customer data|user data/i, need:/data processing agreement|\bdpa\b|article 28|processor/i,
  msg:'The service handles personal data but there are no processor terms.', why:'A business that lets a SaaS provider process personal data must have a processor contract.',
  ask:'Is there a data processing agreement, and where is the data stored?', fix:'"Provider processes personal data only on Customer\'s instructions under the attached DPA (GDPR Art. 28)."',
  law:'EU/EEA: GDPR (Regulation (EU) 2016/679) Art. 28.'},
 {id:'sexport', cat:'Rights', title:'Data export on exit', sev:'low', types:['saas'], need:/export|portab|return (?:of )?(?:your |customer )?data/i,
  msg:'No way to get your data out when you leave.', why:'Without export you are locked in to the provider.',
  ask:'Can I export all my data in a standard format when I leave?', fix:'"On termination, Customer can export all data in CSV/JSON for 30 days."',
  law:'EU: GDPR Art. 20 (portability, personal data); Data Act (Regulation (EU) 2023/2854) switching rules for cloud services.'},
 {id:'lapr', cat:'Money', title:'Total cost (APR)', sev:'high', types:['loan'], need:/annual percentage rate|\bapr\b|total cost of credit/i,
  msg:'The annual percentage rate (total cost) is not stated.', why:'The APR is the only number that lets you compare loans; fees hidden outside the interest rate can double the cost.',
  ask:'What is the APR and the total amount I will repay?', fix:'"APR: [X]%. Total amount payable: [EUR Y]."',
  law:'EU: Consumer Credit Directive 2008/48/EC Art. 10 (replaced by Directive (EU) 2023/2225 from 20 Nov 2026). Outside the EU, check local lending law.'},
 {id:'learly', cat:'Money', title:'Early repayment', sev:'med', types:['loan'], need:/early repayment|repay[^.]*(?:early|in full|before)|prepay/i,
  msg:'No right to repay early.', why:'Repaying early should reduce the total cost, with a capped fee at most.',
  ask:'Can I repay early, and what fee applies?', fix:'"The Borrower may repay early at any time; interest and costs are reduced accordingly."',
  law:'EU: Consumer Credit Directive 2008/48/EC Art. 16 (replaced by Directive (EU) 2023/2225 from 20 Nov 2026).'},
 {id:'ldefault', cat:'Fairness', title:'Harsh default terms', sev:'high', types:['loan'], bad:/default interest|penalty interest|\d+(?:\.\d+)? ?% per (?:day|week)|all (?:amounts|sums)[^.]*(?:immediately )?due/i,
  msg:'Harsh default interest or immediate full repayment on any default.', why:'Disproportionate charges on default are a classic unfair term in consumer credit.',
  ask:'What exactly counts as default, and how much extra do I pay?', fix:'"Default interest is the statutory rate; acceleration only after 2 missed payments and 15 days\' written notice."',
  law:'EU: Directive 93/13/EEC Annex 1(e); many countries also cap interest rates. Outside the EU, check local consumer law.'},
 {id:'carb', cat:'Fairness', title:'Waiver of court / class action', sev:'high', types:['rental','saas','loan'], bad:/waive[^.]*(?:right|class action|jury)|exclusively by (?:binding )?arbitration/i,
  msg:'You give up the right to go to court.', why:'Terms excluding a consumer\'s right to take legal action are listed as potentially unfair.',
  ask:'Can I still use a local court or a consumer ADR body?', fix:'"Either party may bring a claim in the courts of the consumer\'s residence."',
  law:'EU: Directive 93/13/EEC Annex 1(q). In the US, arbitration clauses are generally enforceable (Federal Arbitration Act).'},
];

const SEV_PENALTY = { high: 15, med: 8, low: 3 };

function splitSentences(txt) {
  return txt.replace(/\r/g, '').split(/(?<=[.;:!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}
function detectTypes(txt) {
  return Object.entries(TYPES).filter(([, t]) => t.re.test(txt)).map(([k, t]) => ({ id: k, label: t.label }));
}
function check(txt, opts = {}) {
  txt = String(txt || '');
  const sentences = splitSentences(txt);
  const detected = detectTypes(txt);
  const activeTypes = (opts.type && TYPES[opts.type]) ? [opts.type] : detected.map(d => d.id);
  const contractType = (opts.type && TYPES[opts.type]) ? opts.type : (detected.length ? detected[0].id : 'general');
  const findings = [], passed = [];
  for (const r of RULES) {
    if (r.types && !r.types.some(t => activeTypes.includes(t))) continue;
    if (r.when && !r.when.test(txt)) continue;
    let hit = false, evidence = null;
    if (r.need && !r.need.test(txt)) hit = true;
    if (r.bad) {
      const s = sentences.find(x => r.bad.test(x));
      if (s) { hit = true; evidence = s; }
    }
    const base = { id: r.id, category: r.cat, title: r.title };
    const jurisdiction = r.law || 'General drafting good practice; not tied to one jurisdiction.';
    if (hit) findings.push({ ...base, level: r.sev, msg: r.msg, why: r.why, ask: r.ask, fix: r.fix, evidence, kind: r.bad && evidence ? 'risky wording' : 'missing clause', jurisdiction });
    else { const s = r.need && sentences.find(x => r.need.test(x)); passed.push({ ...base, evidence: s || null, jurisdiction }); }
  }
  const order = { high: 0, med: 1, low: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  // Score = share of applicable checks passed, weighted by severity (high 15, med 8, low 3).
  const lost = findings.reduce((s, f) => s + SEV_PENALTY[f.level], 0);
  const total = lost + passed.reduce((s, p) => s + SEV_PENALTY[RULES.find(r => r.id === p.id).sev], 0);
  const score = total ? Math.round(100 * (1 - lost / total)) : 0;
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 30 ? 'D' : 'F';
  return { ruleset: RULESET_VERSION, types: detected, contractType, activeTypes, score, grade,
    counts: { high: findings.filter(f => f.level === 'high').length, med: findings.filter(f => f.level === 'med').length, low: findings.filter(f => f.level === 'low').length, passed: passed.length },
    findings, passed, words: txt.split(/\s+/).filter(Boolean).length, disclaimer: DISCLAIMER };
}
// Canonical JSON (sorted keys) so the same review always gives the same report hash.
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function reportPayload(docHash, r) {
  return { docHash, ruleset: r.ruleset, contractType: r.contractType, score: r.score, grade: r.grade, findings: r.findings.map(f => ({ id: f.id, level: f.level, evidence: f.evidence })) };
}
const api = { check, canonical, reportPayload, RULES, TYPES, RULESET_VERSION, splitSentences, DISCLAIMER };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ClauseGuard = api;
})(typeof self !== 'undefined' ? self : this);
