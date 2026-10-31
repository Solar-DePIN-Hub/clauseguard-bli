const cg = require('./rules.js'); const S = require('./samples.js'); const a = require('assert');
const risky = cg.check(S.risky), fair = cg.check(S.fair), tok = cg.check(S.token);
console.log('risky', risky.score, risky.grade, risky.findings.map(f => f.id).join(','));
console.log('fair ', fair.score, fair.grade, fair.findings.map(f => f.id).join(','));
console.log('token', tok.score, tok.grade, tok.findings.map(f => f.id).join(','));
a(risky.score < 40, 'risky PPA must score low');
a(risky.contractType === 'ppa', 'risky PPA type');
a(fair.score >= 85 && fair.counts.high === 0, 'fair PPA must score A with no high findings');
a(tok.findings.some(f => f.id === 'token') && tok.findings.some(f => f.id === 'kyc'), 'token terms need securities + KYC findings');
const uni = risky.findings.find(f => f.id === 'unilateral'); a(uni && /sole discretion/.test(uni.evidence), 'evidence sentence quoted');
a(risky.findings.find(f => f.id === 'onesided').evidence.includes('shall not be liable'));
a(risky.findings.find(f => f.id === 'termfee'));

const rental = cg.check(S.rental);
console.log('rental', rental.score, rental.grade, rental.findings.map(f => f.id).join(','));
a(rental.contractType === 'rental', 'rental type');
a(rental.score < 50, 'rental low score');
['rentry','rforfeit','unilateral','rrepair'].forEach(id => a(rental.findings.some(f => f.id === id), 'rental has ' + id));

const freelance = cg.check(S.freelance);
console.log('freelance', freelance.score, freelance.grade, freelance.findings.map(f => f.id).join(','));
a(freelance.contractType === 'freelance', 'freelance type');
a(freelance.score < 50, 'freelance low score');
['flatepay','fip','fnoncomp','faccept'].forEach(id => a(freelance.findings.some(f => f.id === id), 'freelance has ' + id));

const ffair = cg.check(S.freelanceFair);
console.log('freelanceFair', ffair.score, ffair.grade, ffair.findings.map(f => f.id).join(','));
a(ffair.contractType === 'freelance', 'freelanceFair type');
a(ffair.score >= 85, 'freelanceFair high score');
a(ffair.counts.high === 0, 'freelanceFair no high');

const saas = cg.check(S.saas);
console.log('saas', saas.score, saas.grade, saas.findings.map(f => f.id).join(','));
a(saas.contractType === 'saas', 'saas type');
['scancel','sautorenew','unilateral','carb'].forEach(id => a(saas.findings.some(f => f.id === id), 'saas has ' + id));

const loan = cg.check(S.loan);
console.log('loan', loan.score, loan.grade, loan.findings.map(f => f.id).join(','));
a(loan.contractType === 'loan', 'loan type');
['lapr','ldefault','learly','swithdraw'].forEach(id => a(loan.findings.some(f => f.id === id), 'loan has ' + id));

const forced = cg.check(S.freelance, { type: 'loan' });
a(forced.contractType === 'loan', 'forced type');
a(forced.findings.some(f => f.id === 'lapr'), 'forced lapr');

[rental, freelance, saas, loan].forEach(r => {
  r.findings.forEach(f => a(typeof f.jurisdiction === 'string' && f.jurisdiction.length > 0, 'jurisdiction non-empty'));
  a(r.disclaimer.includes('not legal advice'), 'disclaimer');
});

['meter','curtail','insure'].forEach(id => {
  [rental, freelance, saas, loan].forEach(r => a(!r.findings.some(f => f.id === id), 'no energy rule ' + id));
});

const payload = cg.reportPayload('hash', risky);
a(payload.contractType === 'ppa', 'payload contractType');
a.deepStrictEqual(cg.check(S.risky), cg.check(S.risky), 'deterministic');
a.equal(cg.canonical({ b: 1, a: [2, { d: 1, c: 0 }] }), '{"a":[2,{"c":0,"d":1}],"b":1}');
a(cg.check('').findings.length > 0);
console.log('all tests passed');
