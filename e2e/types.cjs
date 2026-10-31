// Playwright e2e for ClauseGuard type-detection checks.
// Run: node e2e/types.cjs   (needs playwright installed; CHROME env for executablePath)
const { chromium } = require('playwright');

const base = process.env.CG || '/sandbox/clauseguard';
const url = 'file://' + base + '/index.html';

let passed = 0;
let failed = 0;
const pageErrors = [];

function ok(cond, label) {
  if (cond) {
    console.log('PASS ' + label);
    passed++;
  } else {
    console.log('FAIL ' + label);
    failed++;
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(url, { waitUntil: 'load' });

  // --- #ctype select structure ---
  const ctypeExists = await page.$('#ctype');
  ok(!!ctypeExists, '#ctype select exists');

  const opts = await page.$$eval('#ctype option', els => els.map(o => o.textContent.trim()));
  ok(opts.includes('Auto-detect'), '#ctype has Auto-detect option');
  ok(opts.length >= 8, '#ctype has at least 7 options besides Auto-detect (total ' + opts.length + ')');

  // --- Sample -> summary mapping ---
  const samples = [
    ['Risky apartment lease', 'Apartment / residential rental'],
    ['Risky freelance contract', 'Freelance / service agreement'],
    ['Subscription terms', 'Subscription / SaaS terms'],
    ['Consumer loan', 'Consumer loan / credit'],
    ['Risky rooftop PPA', 'Solar power purchase agreement'],
  ];

  for (const [btnText, expected] of samples) {
    await page.evaluate(()=>{location.hash='#home'}); await page.evaluate(()=>{location.hash='#analyze'}); await page.waitForTimeout(300); await page.click('button:has-text("' + btnText + '")');
    await page.waitForTimeout(800);
    const summary = (await page.textContent('#summary')) || '';
    ok(summary.includes(expected), btnText + ' -> summary contains "' + expected + '"');
  }

  // --- Risky apartment lease: findings + disclaimer ---
  await page.evaluate(()=>{location.hash='#home'}); await page.evaluate(()=>{location.hash='#analyze'}); await page.waitForTimeout(300); await page.click('button:has-text("Risky apartment lease")');
  await page.waitForTimeout(800);
  const findingsText = (await page.textContent('#findings')) || '';
  ok(findingsText.includes('Jurisdiction:'), 'apartment: #findings contains "Jurisdiction:"');
  ok(findingsText.includes('Landlord entry'), 'apartment: #findings contains "Landlord entry"');
  const discText = (await page.textContent('#disc')) || '';
  ok(discText.includes('not legal advice'), 'apartment: #disc contains "not legal advice"');

  // --- Balanced freelance contract: no high findings ---
  await page.evaluate(()=>{location.hash='#home'}); await page.evaluate(()=>{location.hash='#analyze'}); await page.waitForTimeout(300); await page.click('button:has-text("Balanced freelance contract")');
  await page.waitForTimeout(800);
  const highCount = await page.$$eval('#findings .f.high', els => els.length);
  ok(highCount === 0, 'balanced freelance: no .f.high elements in #findings');

  // --- Forced type: loan + freelance text -> APR finding ---
  await page.evaluate(()=>{location.hash='#home'}); await page.evaluate(()=>{location.hash='#analyze'}); await page.waitForTimeout(300); await page.selectOption('#ctype', 'loan');
  const freelanceText = await page.evaluate(() => (typeof SAMPLES !== 'undefined' && SAMPLES && SAMPLES.freelance) ? SAMPLES.freelance : '');
  ok(!!freelanceText, 'SAMPLES.freelance available');
  await page.fill('#t', freelanceText);
  await page.click('#go');
  await page.waitForTimeout(800);
  const loanFindings = (await page.textContent('#findings')) || '';
  ok(loanFindings.includes('Total cost (APR)'), 'forced loan: #findings contains "Total cost (APR)"');

  // --- #gate still visible after a run ---
  const gateVisible = await page.isVisible('#gate');
  ok(gateVisible, '#gate still visible after a run');

  // --- No page errors ---
  ok(pageErrors.length === 0, 'no pageerror events' + (pageErrors.length ? ' (' + pageErrors.join('; ') + ')' : ''));

  await browser.close();

  console.log(passed + ' passed');
  if (failed > 0) process.exit(1);
})().catch(e => {
  console.error('E2E error:', e && e.stack || e);
  process.exit(1);
});
