import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
let pass = 0;
let fail = 0;

function assert(cond, label) {
  if (cond) { pass++; console.log('  PASS:', label); }
  else { fail++; console.log('  FAIL:', label); }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // TEST 1: Wrong password rejected
  console.log('=== TEST 1: Wrong password ===');
  await page.goto(BASE + '/organizer', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.locator('input#secret').fill('wrong_password');
  await page.locator('button:has-text("Authenticate")').click();
  await page.waitForTimeout(2000);
  let body = await page.locator('body').innerText();
  assert(body.includes('Invalid admin secret'), 'Wrong password shows error');
  assert(!body.includes('Organizer Dashboard'), 'Dashboard not shown');

  // TEST 2: Correct password succeeds
  console.log('\n=== TEST 2: Correct password ===');
  await page.locator('input#secret').fill('8_HOUR');
  await page.locator('button:has-text("Authenticate")').click();
  await page.waitForTimeout(2000);
  body = await page.locator('body').innerText();
  assert(body.includes('Organizer Dashboard'), 'Dashboard shown');

  // TEST 3: Backend still returns 401
  console.log('\n=== TEST 3: Backend authorization ===');
  let r = await page.evaluate(async () => {
    const res = await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    return res.status;
  });
  assert(r === 401, 'No header -> 401');

  r = await page.evaluate(async () => {
    const res = await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'wrong' } });
    return res.status;
  });
  assert(r === 401, 'Wrong secret -> 401');

  // TEST 4: Admin actions work (after correct login)
  console.log('\n=== TEST 4: Admin actions ===');
  let btn = page.locator('button:has-text("Start")');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(1500);
    body = await page.locator('body').innerText();
    assert(body.includes('End'), 'Start opens question');
  }

  btn = page.locator('button:has-text("End")');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(1500);
    body = await page.locator('body').innerText();
    assert(body.includes('Start'), 'End closes question');
  }

  btn = page.locator('button:has-text("Next")');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(1500);
    body = await page.locator('body').innerText();
    assert(body.includes('Start'), 'Next advances');
  }

  // TEST 5: Refresh persists valid session
  console.log('\n=== TEST 5: Refresh persists ===');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  body = await page.locator('body').innerText();
  assert(body.includes('Organizer Dashboard'), 'Session persists');

  // TEST 6: Invalid stored secret on refresh
  console.log('\n=== TEST 6: Invalid stored secret cleaned up ===');
  // Manually set a bad secret and refresh
  await page.evaluate(() => sessionStorage.setItem('admin_secret', 'bad_secret'));
  // Kill the existing session by doing a hard re-navigate
  await page.goto(BASE + '/organizer', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  body = await page.locator('body').innerText();
  assert(!body.includes('Organizer Dashboard'), 'Bad stored secret not accepted');
  assert(body.includes('Enter admin secret') || body.includes('Authenticate'), 'Login form shown instead');

  console.log('\n============================');
  console.log('  PASSED:', pass);
  console.log('  FAILED:', fail);
  console.log('============================');

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
