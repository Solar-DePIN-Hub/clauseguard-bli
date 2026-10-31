// Playwright e2e for the ClauseGuardGate simulation.
// Run: node e2e/gate.cjs   (needs playwright installed; CHROME env for executablePath)
const path = require('path');
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

  // --- Risky sample ---
  await page.click('text=Risky rooftop PPA');
  await page.waitForSelector('#gate', { state: 'visible' });
  ok(true, 'risky: #gate visible');

  await page.click('#gsign');
  let log = await page.textContent('#glog');
  ok(log.includes('NeedsLawyer'), 'risky: sign refused with NeedsLawyer');

  await page.click('#grel');
  log = await page.textContent('#glog');
  ok(log.includes('NotSigned') || log.includes('NeedsLawyer'), 'risky: release refused before sign');

  await page.click('#gappr');
  await page.click('#gsign');
  await page.click('#grel');
  log = await page.textContent('#glog');
  ok(log.includes('released'), 'risky: after approve+sign, release ok');

  const g4cls = await page.getAttribute('#g4', 'class');
  ok(g4cls && g4cls.includes('ok'), 'risky: #g4 has ok state');

  // --- Balanced sample ---
  await page.click('text=Balanced PPA');
  await page.waitForSelector('#gate', { state: 'visible' });
  log = await page.textContent('#glog');
  ok(log.trim() === '', 'balanced: log reset on new run');

  await page.click('#gsign');
  log = await page.textContent('#glog');
  ok(log.includes('sign() ok'), 'balanced: sign works without lawyer');

  await page.click('#grel');
  log = await page.textContent('#glog');
  ok(log.includes('released'), 'balanced: release ok');

  // --- Laws fallback (file:// -> fetch fails -> 4 fallback rows) ---
  const lawRows = await page.$$eval('#laws .lawrow', els => els.length);
  ok(lawRows === 7, 'laws: 7 rows rendered (fallback)');

  // --- No page errors ---
  ok(pageErrors.length === 0, 'no pageerror events' + (pageErrors.length ? ' (' + pageErrors.join('; ') + ')' : ''));

  await browser.close();

  console.log(passed + ' passed');
  if (failed > 0) process.exit(1);
})().catch(e => {
  console.error('E2E error:', e && e.stack || e);
  process.exit(1);
});
