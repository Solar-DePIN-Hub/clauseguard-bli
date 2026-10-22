const RULES=[
{id:'law',title:'Governing law',need:/governed by|governing law/i,level:'med',msg:'No governing-law clause found.'},
{id:'dispute',title:'Dispute resolution',need:/arbitration|dispute|jurisdiction of the courts/i,level:'high',msg:'No dispute-resolution mechanism.'},
{id:'term',title:'Term & termination',need:/terminat/i,level:'high',msg:'No termination rights defined.'},
{id:'force',title:'Force majeure',need:/force majeure/i,level:'med',msg:'No force-majeure clause (grid outages, war, weather).'},
{id:'meter',title:'Metering & measurement',need:/meter|measurement/i,level:'high',msg:'Energy quantity not tied to metering; billing disputes likely.'},
{id:'liab',title:'Limitation of liability',need:/limitation of liability|liable/i,level:'med',msg:'No liability cap.'},
{id:'data',title:'Data protection',need:/personal data|gdpr|privacy/i,level:'med',msg:'No data-protection clause for consumption data.'},
{id:'unilateral',title:'Unilateral price change',bad:/sole discretion|at any time/i,level:'high',msg:'One party can change terms unilaterally — likely unfair term.'},
{id:'token',title:'Token / securities disclosure',when:/token|revenue share|investor/i,need:/securities|risk disclosure|kyc|aml/i,level:'high',msg:'Tokenized revenue share without securities/KYC/risk disclosure.'}];
function check(txt){const f=[];for(const r of RULES){if(r.when&&!r.when.test(txt))continue;if(r.need&&!r.need.test(txt))f.push(r);if(r.bad&&r.bad.test(txt))f.push(r)}
const pen=f.reduce((s,r)=>s+(r.level==='high'?15:8),0);const findings=f.map(r=>({title:r.title,msg:r.msg,level:r.level}));
if(!findings.length)findings.push({title:'No issues found',msg:'All checklist items present.',level:'ok'});return{score:Math.max(0,100-pen),findings}}
if(typeof module!=='undefined')module.exports={check};
