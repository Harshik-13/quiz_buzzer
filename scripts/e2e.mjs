// E2E test for end-quiz API and error handling
// Usage: node scripts/e2e.mjs [baseUrl] [adminSecret]
// Defaults: http://localhost:3000 8_HOUR

const BASE = process.argv[2] || 'http://localhost:3000'
const SECRET = process.argv[3] || '8_HOUR'
const HEADERS = { 'Content-Type': 'application/json', 'x-admin-secret': SECRET }

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (e) {
    console.log(`  FAIL  ${name}`)
    console.log(`        ${e.message}`)
    failed++
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function api(method, path, body, headers = HEADERS) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = res.headers.get('content-type')?.includes('json')
    ? await res.json()
    : await res.text()
  return { status: res.status, data }
}

console.log(`\nE2E Tests — ${BASE}\n`)

let quizId, publicId, participantId

// ── End-Quiz Success Flow ──
await test('create quiz', async () => {
  const { status, data } = await api('POST', '/api/quizzes', { name: 'E2E Test', totalQuestions: 3 })
  assert(status === 201, `Expected 201, got ${status}`)
  assert(data.id, 'No quiz id')
  assert(data.publicId, 'No publicId')
  assert(data.status === 'DRAFT', `Expected DRAFT, got ${data.status}`)
  quizId = data.id
  publicId = data.publicId
})

await test('publish quiz', async () => {
  const { status } = await api('PUT', `/api/quizzes/${quizId}`, { status: 'PUBLISHED' })
  assert(status === 200, `Expected 200, got ${status}`)
})

await test('join participant', async () => {
  const { status, data } = await api('POST', `/api/quiz/${publicId}/join`, { name: 'Alice' })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.id, 'No participant id')
  participantId = data.id
})

await test('start quiz (DRAFT→RUNNING)', async () => {
  const { status, data } = await api('POST', `/api/quizzes/${quizId}/start`)
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.status === 'RUNNING', `Expected RUNNING, got ${data.status}`)
})

await test('buzz', async () => {
  const { status, data } = await api('POST', `/api/quiz/${publicId}/buzz`, { participantId })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.rank === 1, `Expected rank 1, got ${data.rank}`)
})

await test('end quiz', async () => {
  const { status, data } = await api('POST', `/api/quizzes/${quizId}/end-quiz`)
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.status === 'FINISHED', `Expected FINISHED, got ${data.status}`)
  assert(typeof data.currentQuestion === 'number', 'No currentQuestion')
  assert(typeof data.totalQuestions === 'number', 'No totalQuestions')
})

// ── Error Cases ──
await test('end-quiz on already finished quiz returns 409', async () => {
  const { status, data } = await api('POST', `/api/quizzes/${quizId}/end-quiz`)
  assert(status === 409, `Expected 409, got ${status}`)
  assert(data.error, 'No error message')
})

await test('end-quiz with invalid ID returns 404', async () => {
  const { status } = await api('POST', '/api/quizzes/nonexistent-id/end-quiz')
  assert(status === 404, `Expected 404, got ${status}`)
})

await test('end-quiz with no auth returns 401', async () => {
  const { status } = await api('POST', `/api/quizzes/${quizId}/end-quiz`, null, { 'Content-Type': 'application/json' })
  assert(status === 401, `Expected 401, got ${status}`)
})

await test('end-quiz on draft quiz returns 400', async () => {
  const { status, data } = await api('POST', '/api/quizzes', { name: 'Draft Only', totalQuestions: 1 })
  assert(status === 201, `Failed to create draft quiz`)
  const draftId = data.id
  const { status: endStatus } = await api('POST', `/api/quizzes/${draftId}/end-quiz`)
  assert(endStatus === 400, `Expected 400, got ${endStatus}`)
})

// ── Backwards Compatibility: duplicate preserves statistics ──
await test('duplicate of finished quiz creates DRAFT copy', async () => {
  const { status, data } = await api('POST', `/api/quizzes/${quizId}/duplicate`)
  assert(status === 201, `Expected 201, got ${status}`)
  assert(data.status === 'DRAFT', `Expected DRAFT copy, got ${data.status}`)
  assert(data.name.includes('(Copy)'), 'Copy name missing suffix')
  assert(data.totalQuestions === 3, `Expected 3 questions, got ${data.totalQuestions}`)
})

// ── Other endpoint error handling ──
await test('start on finished quiz returns 409', async () => {
  const { status } = await api('POST', `/api/quizzes/${quizId}/start`)
  assert(status === 409, `Expected 409, got ${status}`)
})

await test('archive on running quiz returns 409', async () => {
  const { status, data } = await api('POST', '/api/quizzes', { name: 'To Archive', totalQuestions: 2 })
  assert(status === 201, `Failed to create quiz`)
  const aid = data.id
  await api('PUT', `/api/quizzes/${aid}`, { status: 'PUBLISHED' })
  await api('POST', `/api/quizzes/${aid}/start`)
  const { status: archStatus } = await api('POST', `/api/quizzes/${aid}/archive`)
  assert(archStatus === 409, `Expected 409, got ${archStatus}`)
})

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total\n`)
process.exit(failed > 0 ? 1 : 0)
