const BASE = 'http://localhost:3000';
const ADMIN = '8_HOUR';

async function api(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    method: opts.method || 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}

async function main() {
  console.log('=== STRESS TEST: 20 CONCURRENT BUZZES ===\n');

  // Step 1: Join 20 participants
  console.log('Joining 20 participants...');
  const participants = [];
  for (let i = 1; i <= 20; i++) {
    const res = await api('/api/join', {
      method: 'POST',
      body: { name: `Player${i}` },
    });
    if (!res.body.id) {
      console.error(`  FAIL: Player${i} join failed:`, res.body);
      process.exit(1);
    }
    participants.push({ id: res.body.id, name: res.body.name });
    if (i % 5 === 0) console.log(`  Joined ${i}/20`);
  }
  console.log(`  All ${participants.length} joined OK\n`);

  // Step 2: Verify state
  let state = await api('/api/state');
  console.log(`  Participants in state: ${state.body.participants.length}`);
  if (state.body.participants.length !== 20) {
    console.error('  FAIL: Not all participants persisted');
    process.exit(1);
  }

  // Step 3: Organizer START
  console.log('\nOrganizer START...');
  const start = await api('/api/start', {
    method: 'POST',
    headers: { 'x-admin-secret': ADMIN },
  });
  if (start.status !== 200) {
    console.error('  FAIL: START failed:', start.body);
    process.exit(1);
  }
  console.log(`  Status: ${start.body.status}\n`);

  // Step 4: All 20 buzz simultaneously
  console.log('Firing 20 concurrent buzzes...');
  const startTime = Date.now();
  const results = await Promise.all(
    participants.map(p =>
      api('/api/buzz', {
        method: 'POST',
        body: { participantId: p.id },
      })
    )
  );
  const elapsed = Date.now() - startTime;
  console.log(`  All responses received in ${elapsed}ms\n`);

  // Step 5: Verify results
  const successes = results.filter(r => r.status === 200);
  const errors = results.filter(r => r.status !== 200);
  console.log(`  Success: ${successes.length}, Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('  Errors:', errors.map(e => JSON.stringify(e.body)).join(', '));
  }

  // Step 6: Check state
  state = await api('/api/state');
  const queue = state.body.buzzQueue;
  console.log(`\n  Buzz queue length: ${queue.length}`);

  const ranks = queue.map(b => b.rank).sort((a, b) => a - b);
  const uniqueRanks = new Set(ranks);
  const names = queue.map(b => b.participantName);

  console.log(`  Ranks: ${ranks.join(', ')}`);
  console.log(`  Unique ranks: ${uniqueRanks.size}`);
  console.log(`  Missing ranks: ${findMissing(ranks)}`);
  console.log(`  Duplicate names: ${findDuplicates(names)}`);

  const allGood =
    queue.length === 20 &&
    uniqueRanks.size === 20 &&
    ranks[0] === 1 &&
    ranks[19] === 20 &&
    findMissing(ranks).length === 0 &&
    findDuplicates(names).length === 0;

  console.log(`\n============================`);
  console.log(`  RESULT: ${allGood ? 'PASS' : 'FAIL'}`);
  if (allGood) {
    console.log('  All 20 buzzes recorded correctly!');
    console.log('  Ranks 1-20, no duplicates, no gaps.');
  } else {
    console.log(`  Queue: ${queue.length}/20`);
    console.log(`  Unique ranks: ${uniqueRanks.size}/20`);
    console.log(`  Missing ranks: ${findMissing(ranks).join(',')}`);
    console.log(`  Duplicate names: ${findDuplicates(names).join(',')}`);
  }
  console.log('============================');
}

function findMissing(ranks) {
  const missing = [];
  for (let i = 1; i <= 20; i++) {
    if (!ranks.includes(i)) missing.push(i);
  }
  return missing;
}

function findDuplicates(arr) {
  const seen = new Set();
  const dups = new Set();
  for (const x of arr) {
    if (seen.has(x)) dups.add(x);
    seen.add(x);
  }
  return [...dups];
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
