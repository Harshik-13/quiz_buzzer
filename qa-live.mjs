import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE = 'http://localhost:3000';
const dir = 'qa-screenshots';
mkdirSync(dir, { recursive: true });

async function snap(page, name) {
  await page.screenshot({ path: join(dir, name + '.png'), fullPage: true });
  console.log('  Screenshot -> ' + name + '.png');
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--window-size=1280,800'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // 1. HOME PAGE
  console.log('\n=== HOME PAGE ===');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await snap(page, '01-home');

  // 2. PARTICIPANT - JOIN
  console.log('\n=== PARTICIPANT JOIN ===');
  await page.goto(BASE + '/participant', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await snap(page, '02-join-form');
  console.log('  Form visible, typing name...');
  await page.locator('input#name').fill('Alice');
  await page.waitForTimeout(300);
  await snap(page, '03-name-filled');
  await page.locator('button:has-text("Join")').click();
  await page.waitForTimeout(2000);
  await snap(page, '04-joined');
  console.log('  After join:', (await page.locator('body').innerText()).substring(0, 300));

  // 3. ORGANIZER - LOGIN & DASHBOARD
  console.log('\n=== ORGANIZER ===');
  const orgPage = await ctx.newPage();
  await orgPage.goto(BASE + '/organizer', { waitUntil: 'networkidle' });
  await orgPage.waitForTimeout(1500);
  await snap(page, '05-organizer');

  const pwInput = orgPage.locator('input[type="password"]');
  if (await pwInput.isVisible()) {
    await pwInput.fill('8_HOUR');
    await page.waitForTimeout(300);
    const authBtn = orgPage.locator('button').filter({ hasText: /Authenticate/i });
    if (await authBtn.isVisible()) {
      await authBtn.click();
      await orgPage.waitForTimeout(2000);
    }
    await snap(page, '06-dashboard');
  }
  console.log('  Org text:', (await orgPage.locator('body').innerText()).substring(0, 500));

  // 4. QUESTION LIFECYCLE
  console.log('\n=== QUESTION LIFECYCLE ===');

  // START
  let btn = orgPage.locator('button').filter({ hasText: /Start/i });
  if (await btn.isVisible()) {
    console.log('  Clicking Start...');
    await btn.click();
    await orgPage.waitForTimeout(1500);
    await snap(page, '07-started');
  }

  // Alice buzzes
  let buzzBtn = page.locator('button').filter({ hasText: /BUZZ/i });
  if (await buzzBtn.isVisible()) {
    console.log('  Alice clicking BUZZ...');
    await buzzBtn.click();
    await page.waitForTimeout(1500);
    await snap(page, '08-buzzed');
    console.log('  Buzz result:', (await page.locator('body').innerText()).substring(0, 300));
  }

  // END
  btn = orgPage.locator('button').filter({ hasText: /End/i });
  if (await btn.isVisible()) {
    console.log('  Clicking End...');
    await btn.click();
    await orgPage.waitForTimeout(1500);
    await snap(page, '09-ended');
  }

  // NEXT
  btn = orgPage.locator('button').filter({ hasText: /Next/i });
  if (await btn.isVisible()) {
    console.log('  Clicking Next...');
    await btn.click();
    await orgPage.waitForTimeout(1500);
    await snap(page, '10-nexted');
  }

  console.log('\n=== DONE - screenshots in qa-screenshots/ ===');
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
