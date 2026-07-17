import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const ADMIN_SECRET = 'test-secret-123';

let pass = 0;
let fail = 0;
let errors = [];

function assert(condition, msg) {
  if (condition) { pass++; }
  else { fail++; errors.push(msg); console.error('  FAIL:', msg); }
}

async function getState(page) {
  return await page.evaluate(async () => {
    const r = await fetch('/api/state');
    return await r.json();
  });
}

async function adminAction(page, action) {
  return await page.evaluate(async (a) => {
    const r = await fetch(`/api/${a}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'test-secret-123' }
    });
    return await r.json();
  }, action);
}

async function buzzApi(page, pid) {
  return await page.evaluate(async (p) => {
    const r = await fetch('/api/buzz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: p })
    });
    return await r.json();
  }, pid);
}

async function getStoredParticipant(page) {
  return await page.evaluate(() => {
    const raw = localStorage.getItem('buzz_participant');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  });
}

async function joinParticipant(page, name) {
  await page.goto(`${BASE}/participant`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const nameInput = page.locator('input#name');
  await nameInput.waitFor({ state: 'visible', timeout: 5000 });
  await nameInput.fill(name);
  await page.waitForTimeout(200);
  const joinButton = page.locator('button:has-text("Join")');
  await joinButton.click();
  await page.waitForTimeout(2000);
  return await getStoredParticipant(page);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('=== QUIZ BUZZER QA REPORT ===\n');

  // =============================================
  // 1. PARTICIPANT FLOW
  // =============================================
  console.log('--- 1. Participant Flow ---');

  const alice = await joinParticipant(page, 'Alice');
  assert(!!alice, `Joined as Alice, got participant object`);
  assert(alice.id && alice.name === 'Alice', `Participant has id and name "${alice?.name}"`);

  // Refresh and verify session persists
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const stored = await getStoredParticipant(page);
  assert(stored && stored.id === alice.id, `Session persists after refresh`);

  // Verify UI shows question/status
  const body1 = await page.locator('body').innerText();
  assert(body1.length > 0, 'Page renders content after join');

  // =============================================
  // 2. ORGANIZER FLOW
  // =============================================
  console.log('\n--- 2. Organizer Flow ---');

  const orgPage = await context.newPage();
  await orgPage.goto(`${BASE}/organizer`, { waitUntil: 'domcontentloaded' });
  await orgPage.waitForTimeout(1500);
  const orgBody = await orgPage.locator('body').innerText();
  assert(orgBody.length > 0, 'Organizer page loaded');

  // =============================================
  // 3. QUESTION LIFECYCLE
  // =============================================
  console.log('\n--- 3. Question Lifecycle ---');

  // #1 CLOSED at question 0
  let state = await getState(page);
  assert(state.status === 'CLOSED', `Initial status CLOSED (got: ${state.status})`);
  assert(state.currentQuestion === 0, `Initial question 0 (got: ${state.currentQuestion})`);

  // #2 START → OPEN (still Q0)
  let result = await adminAction(orgPage, 'start');
  state = await getState(page);
  assert(state.status === 'OPEN', `After START: OPEN (got: ${state.status})`);
  assert(state.currentQuestion === 0, `Question stays 0 (got: ${state.currentQuestion})`);

  // Alice buzzes
  const buzz1 = await buzzApi(page, alice.id);
  assert(!buzz1.error, `Alice buzzes successfully`);

  // #3 END → CLOSED
  result = await adminAction(orgPage, 'end');
  state = await getState(page);
  assert(state.status === 'CLOSED', `After END: CLOSED (got: ${state.status})`);
  assert(state.buzzQueue.length === 1, `Buzz queue has 1 entry`);

  const b = state.buzzQueue[0];
  assert(b.participantName === 'Alice', `Buzz from Alice`);
  assert(b.participantId === alice.id, `Buzz matches participant ID`);
  assert(b.rank === 1, `Alice rank 1 (got: ${b.rank})`);
  assert(typeof b.serverTimestamp === 'number' && b.serverTimestamp > 0, `Buzz has server timestamp`);

  // #4 NEXT → Q1, CLOSED, queue cleared
  result = await adminAction(orgPage, 'next');
  state = await getState(page);
  assert(state.currentQuestion === 1, `After NEXT: question 1 (got: ${state.currentQuestion})`);
  assert(state.status === 'CLOSED', `After NEXT: CLOSED (got: ${state.status})`);
  assert(state.buzzQueue.length === 0, `Buzz queue cleared`);

  // #5 START → OPEN (Q1)
  result = await adminAction(orgPage, 'start');
  state = await getState(page);
  assert(state.status === 'OPEN', `2nd START: OPEN (got: ${state.status})`);
  assert(state.currentQuestion === 1, `Question still 1 (got: ${state.currentQuestion})`);

  // END to clean up
  await adminAction(orgPage, 'end');
  state = await getState(page);
  assert(state.status === 'CLOSED', `END from OPEN works`);

  // =============================================
  // 4. INVALID TRANSITIONS
  // =============================================
  console.log('\n--- 4. Invalid Transitions ---');

  // START while already OPEN
  await adminAction(orgPage, 'start');
  result = await adminAction(orgPage, 'start');
  assert(result && result.error, `START while OPEN rejected`);

  // END while already CLOSED
  await adminAction(orgPage, 'end');
  result = await adminAction(orgPage, 'end');
  assert(result && result.error, `END while CLOSED rejected`);

  // =============================================
  // 5. UNAUTHORIZED ACCESS
  // =============================================
  console.log('\n--- 5. Unauthorized Access ---');

  const unauth = await page.evaluate(async () => {
    const r = await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    return { status: r.status, body: await r.json() };
  });
  assert(unauth.status === 401, `Unauthorized gets 401 (got: ${unauth.status})`);
  assert(unauth.body && unauth.body.error, `Error message returned`);

  // =============================================
  // 6. DUPLICATE BUZZ
  // =============================================
  console.log('\n--- 6. Duplicate Buzz Rejection ---');

  await adminAction(orgPage, 'start');
  await page.waitForTimeout(300);

  const first = await buzzApi(page, alice.id);
  assert(!first.error, `First buzz accepted`);

  const second = await buzzApi(page, alice.id);
  assert(second && second.error === 'Already buzzed', `Duplicate buzz rejected`);

  await adminAction(orgPage, 'end');

  // =============================================
  // 7. MULTIPLE PARTICIPANTS & ORDER
  // =============================================
  console.log('\n--- 7. Multiple Participants ---');

  // Bob joins (separate context for isolated localStorage)
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  const bob = await joinParticipant(page2, 'Bob');
  assert(!!bob && bob.name === 'Bob', `Bob joined`);

  // Both buzz: Alice first, then Bob
  await adminAction(orgPage, 'start');
  await page.waitForTimeout(300);

  const aliceB = await buzzApi(page, alice.id);
  assert(!aliceB.error, `Alice buzzes Q2`);

  const bobB = await buzzApi(page2, bob.id);
  assert(!bobB.error, `Bob buzzes Q2`);

  await adminAction(orgPage, 'end');
  state = await getState(page);
  assert(state.buzzQueue.length === 2, `Both in queue (got: ${state.buzzQueue.length})`);

  const names = state.buzzQueue.map(x => x.participantName);
  const ranks = state.buzzQueue.map(x => x.rank);
  assert(names.includes('Alice'), 'Alice in queue');
  assert(names.includes('Bob'), 'Bob in queue');
  assert(Math.min(...ranks) === 1 && Math.max(...ranks) === 2, `Ranks 1 and 2 (got: ${ranks})`);
  assert(state.buzzQueue[0].participantName === 'Alice' && state.buzzQueue[1].participantName === 'Bob',
    `FIFO order: Alice then Bob (got: ${names})`);

  // =============================================
  // SUMMARY
  // =============================================
  await ctx2.close();
  await browser.close();

  console.log('\n============================');
  console.log(`  PASSED: ${pass}`);
  console.log(`  FAILED: ${fail}`);
  if (errors.length > 0) {
    console.log('\n  FAILURES:');
    errors.forEach(e => console.log(`    • ${e}`));
  }
  console.log('============================');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('TEST ERROR:', e.message);
  process.exit(1);
});
