import { createClient } from '@vercel/kv'
import type { Buzz, GameState, GameStatus, Participant, Quiz } from './types'
import { v4 as uuid } from 'uuid'
import { getOrganizerId } from './admin'

function getKv() {
  const url = process.env.KV_REST_API_URL || process.env.KV_URL
  const token = process.env.KV_REST_API_TOKEN
  if (url && token) {
    return createClient({ url, token })
  }
  return null
}

const kv = getKv()

function requireKv(): void {
  if (process.env.NODE_ENV === 'production' && !kv) {
    throw new Error(
      'Vercel KV is not configured. Link KV storage in the Vercel dashboard, ' +
      'or set KV_REST_API_URL (or KV_URL) and KV_REST_API_TOKEN in your environment.'
    )
  }
}

// ── Per-Quiz Mutex (memory-mode serialization) ──

class Mutex {
  private queue: (() => void)[] = []
  private locked = false
  acquire(): Promise<void> {
    if (!this.locked) { this.locked = true; return Promise.resolve() }
    return new Promise(resolve => this.queue.push(resolve))
  }
  release(): void {
    if (this.queue.length > 0) this.queue.shift()!()
    else this.locked = false
  }
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try { return await fn() }
    finally { this.release() }
  }
}

const quizMutexes = new Map<string, Mutex>()
function getMutex(quizId: string): Mutex {
  let m = quizMutexes.get(quizId)
  if (!m) { m = new Mutex(); quizMutexes.set(quizId, m) }
  return m
}

function clone<T>(v: T): T {
  try { return structuredClone(v) } catch { return JSON.parse(JSON.stringify(v)) }
}

const INDEX_KEY = 'quiz:index'
const PUBLIC_ID_PREFIX = 'publicId:'

const DEFAULT_STATE: GameState = {
  currentQuestion: 0,
  totalQuestions: 0,
  status: 'CLOSED',
  participants: [],
  buzzQueue: [],
}

let memoryQuizStates: Map<string, GameState> = new Map()
let memoryQuizzes: Quiz[] = []
let memoryPublicIds: Map<string, string> = new Map()

function generatePublicId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// ── Per-Quiz Game State ──

export async function getQuizState(quizId: string): Promise<GameState | null> {
  requireKv()
  const key = `quiz:${quizId}:state`
  if (kv) {
    try {
      const state = await kv.get<GameState>(key)
      return state ?? null
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV is unavailable.')
    }
  }
  const quizState = memoryQuizStates.get(quizId)
  return quizState ? clone(quizState) : null
}

export async function setQuizState(quizId: string, state: GameState): Promise<void> {
  const key = `quiz:${quizId}:state`
  if (kv) {
    try {
      await kv.set(key, state)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV is unavailable.')
    }
  }
  memoryQuizStates.set(quizId, clone(state))
}

// ── Public ID Resolution ──

export async function getQuizByPublicId(publicId: string): Promise<Quiz | null> {
  requireKv()
  if (kv) {
    try {
      const quizId = await kv.get<string>(`${PUBLIC_ID_PREFIX}${publicId}`)
      if (!quizId) return null
      return await getQuiz(quizId)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV is unavailable.')
    }
  }
  const id = memoryPublicIds.get(publicId)
  if (!id) return null
  return memoryQuizzes.find(q => q.id === id) ?? null
}

async function setPublicIdIndex(publicId: string, quizId: string): Promise<void> {
  if (kv) {
    try {
      await kv.set(`${PUBLIC_ID_PREFIX}${publicId}`, quizId)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV is unavailable.')
    }
  }
  memoryPublicIds.set(publicId, quizId)
}

async function removePublicIdIndex(publicId: string): Promise<void> {
  if (kv) {
    try {
      await kv.del(`${PUBLIC_ID_PREFIX}${publicId}`)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV is unavailable.')
    }
  }
  memoryPublicIds.delete(publicId)
}

// ── Quiz CRUD ──

export async function listQuizzes(): Promise<Quiz[]> {
  requireKv()
  if (kv) {
    try {
      const ids = await kv.get<string[]>(INDEX_KEY)
      if (!ids || ids.length === 0) return []
      const pipeline = kv.pipeline()
      for (const id of ids) {
        pipeline.get(`quiz:${id}`)
      }
      const results = await pipeline.exec<Quiz[]>()
      return results.filter((q: Quiz | null): q is Quiz => q !== null)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  }
  return [...memoryQuizzes]
}

export async function listQuizzesByOrganizer(organizerId: string): Promise<Quiz[]> {
  const all = await listQuizzes()
  return all.filter(q => q.organizerId === organizerId)
}

export async function getQuiz(id: string): Promise<Quiz | null> {
  requireKv()
  if (kv) {
    try {
      return await kv.get<Quiz>(`quiz:${id}`)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  }
  return memoryQuizzes.find(q => q.id === id) ?? null
}

export async function createQuiz(data: { name: string; description?: string; totalQuestions: number }): Promise<Quiz> {
  requireKv()
  const now = Date.now()
  let publicId = generatePublicId()
  while (await getQuizByPublicId(publicId)) {
    publicId = generatePublicId()
  }

  const quiz: Quiz = {
    id: uuid(),
    publicId,
    organizerId: getOrganizerId(),
    name: data.name,
    description: data.description || '',
    totalQuestions: data.totalQuestions,
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
  }

  if (kv) {
    try {
      await kv.set(`quiz:${quiz.id}`, quiz)
      await setPublicIdIndex(publicId, quiz.id)
      const ids = (await kv.get<string[]>(INDEX_KEY)) || []
      ids.push(quiz.id)
      await kv.set(INDEX_KEY, ids)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  } else {
    memoryQuizzes.push(quiz)
    memoryPublicIds.set(publicId, quiz.id)
  }
  return quiz
}

export async function updateQuiz(id: string, data: Partial<Quiz>): Promise<Quiz | null> {
  requireKv()
  const quiz = await getQuiz(id)
  if (!quiz) return null
  const updated = { ...quiz, ...data, id: quiz.id, updatedAt: Date.now() }
  if (kv) {
    try {
      await kv.set(`quiz:${id}`, updated)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  } else {
    const idx = memoryQuizzes.findIndex(q => q.id === id)
    if (idx !== -1) memoryQuizzes[idx] = updated
  }
  return updated
}

export async function deleteQuiz(id: string): Promise<boolean> {
  requireKv()
  const quiz = await getQuiz(id)
  if (!quiz) return false

  if (kv) {
    try {
      await kv.del(`quiz:${id}`)
      await removePublicIdIndex(quiz.publicId)
      const ids = (await kv.get<string[]>(INDEX_KEY)) || []
      const filtered = ids.filter(i => i !== id)
      await kv.set(INDEX_KEY, filtered)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  } else {
    memoryQuizzes = memoryQuizzes.filter(q => q.id !== id)
    memoryPublicIds.delete(quiz.publicId)
  }
  return true
}

export async function duplicateQuiz(id: string): Promise<Quiz | null> {
  requireKv()
  const original = await getQuiz(id)
  if (!original) return null
  const now = Date.now()
  let publicId = generatePublicId()
  while (await getQuizByPublicId(publicId)) {
    publicId = generatePublicId()
  }

  const quiz: Quiz = {
    id: uuid(),
    publicId,
    organizerId: getOrganizerId(),
    name: `${original.name} (Copy)`,
    description: original.description,
    totalQuestions: original.totalQuestions,
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
  }

  if (kv) {
    try {
      await kv.set(`quiz:${quiz.id}`, quiz)
      await setPublicIdIndex(publicId, quiz.id)
      const ids = (await kv.get<string[]>(INDEX_KEY)) || []
      ids.push(quiz.id)
      await kv.set(INDEX_KEY, ids)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  } else {
    memoryQuizzes.push(quiz)
    memoryPublicIds.set(publicId, quiz.id)
  }
  return quiz
}

export async function activateQuiz(id: string, currentQuestion: number, status: GameStatus): Promise<void> {
  requireKv()
  const existing = await getQuizState(id)
  if (existing) {
    existing.currentQuestion = currentQuestion
    existing.status = status
    existing.buzzQueue = []
    await setQuizState(id, existing)
    return
  }

  const quiz = await getQuiz(id)
  if (!quiz) throw new Error('Quiz not found')

  const gameState: GameState = {
    currentQuestion,
    totalQuestions: quiz.totalQuestions,
    status,
    participants: [],
    buzzQueue: [],
  }
  await setQuizState(id, gameState)
}

// ── Lua Scripts ──

const BUZZ_LUA = `
local key = KEYS[1]
local pid = ARGV[1]
local raw = redis.call("GET", key)
if not raw then return '{"error":"No game state"}' end
local ok, state = pcall(cjson.decode, raw)
if not ok then return '{"error":"Failed to parse state"}' end
if state.status ~= "OPEN" then return '{"error":"Question is not open"}' end
local found = false
local pname = ""
for i, p in ipairs(state.participants) do
  if p.id == pid then found = true; pname = p.name; break end
end
if not found then return '{"error":"Unknown participant"}' end
for i, b in ipairs(state.buzzQueue) do
  if b.participantId == pid then return '{"error":"Already buzzed"}' end
end
local t = redis.call("TIME")
local buzz = {participantId=pid, participantName=pname, serverTimestamp=t[1]*1000, rank=#state.buzzQueue+1}
table.insert(state.buzzQueue, buzz)
redis.call("SET", key, cjson.encode(state))
return cjson.encode(buzz)
`

const JOIN_LUA = `
local raw = redis.call("GET", KEYS[1])
local state
if not raw then
  state = {currentQuestion=0, totalQuestions=0, status="PUBLISHED", participants={}, buzzQueue={}}
else
  local ok, decoded = pcall(cjson.decode, raw)
  if not ok then return '{"error":"Failed to parse state"}' end
  state = decoded
  if state.status ~= "PUBLISHED" and state.status ~= "RUNNING" then
    return '{"error":"Quiz not accepting participants"}'
  end
end
local pid = ARGV[1]
local pname = ARGV[2]
for i, p in ipairs(state.participants) do
  if p.id == pid then return cjson.encode({id=pid, name=pname}) end
end
local participant = {id=pid, name=pname}
table.insert(state.participants, participant)
redis.call("SET", KEYS[1], cjson.encode(state))
return cjson.encode(participant)
`

const TOGGLE_QUESTION_LUA = `
local raw = redis.call("GET", KEYS[1])
if not raw then return '{"error":"No game state"}' end
local ok, state = pcall(cjson.decode, raw)
if not ok then return '{"error":"Failed to parse state"}' end
if state.status == "OPEN" then return '{"error":"Question already open"}' end
state.status = "OPEN"
state.buzzQueue = {}
redis.call("SET", KEYS[1], cjson.encode(state))
return cjson.encode({status="OPEN", currentQuestion=state.currentQuestion})
`

const NEXT_QUESTION_LUA = `
local raw = redis.call("GET", KEYS[1])
if not raw then return '{"error":"No game state"}' end
local ok, state = pcall(cjson.decode, raw)
if not ok then return '{"error":"Failed to parse state"}' end
if state.status == "OPEN" then return '{"error":"Close question first"}' end
local total = tonumber(ARGV[1])
local nextQ = state.currentQuestion + 1
if nextQ > total then
  state.status = "CLOSED"
  state.finished = true
  redis.call("SET", KEYS[1], cjson.encode(state))
  return cjson.encode({action="FINISH", currentQuestion=state.currentQuestion,
    totalParticipants=#state.participants, winner=(state.buzzQueue[1] and state.buzzQueue[1].participantName or ""), finished=true})
end
state.currentQuestion = nextQ
state.status = "CLOSED"
state.buzzQueue = {}
redis.call("SET", KEYS[1], cjson.encode(state))
return cjson.encode({action="NEXT", currentQuestion=nextQ, totalQuestions=total})
`

const PREVIOUS_QUESTION_LUA = `
local raw = redis.call("GET", KEYS[1])
if not raw then return '{"error":"No game state"}' end
local ok, state = pcall(cjson.decode, raw)
if not ok then return '{"error":"Failed to parse state"}' end
local prevQ = state.currentQuestion - 1
if prevQ < 1 then return '{"error":"Already at first question"}' end
state.currentQuestion = prevQ
state.status = "CLOSED"
state.buzzQueue = {}
redis.call("SET", KEYS[1], cjson.encode(state))
return cjson.encode({currentQuestion=prevQ, status="CLOSED", totalQuestions=state.totalQuestions})
`

const END_QUIZ_LUA = `
local raw = redis.call("GET", KEYS[1])
if not raw then return '{"error":"No game state"}' end
local ok, state = pcall(cjson.decode, raw)
if not ok then return '{"error":"Failed to parse state"}' end
local winner = ""
if state.buzzQueue and #state.buzzQueue > 0 then winner = state.buzzQueue[1].participantName end
state.status = "CLOSED"
state.finished = true
redis.call("SET", KEYS[1], cjson.encode(state))
return cjson.encode({status="CLOSED", totalParticipants=#state.participants, winner=winner, finished=true})
`

const CLOSE_QUESTION_LUA = `
local raw = redis.call("GET", KEYS[1])
if not raw then return '{"error":"No game state"}' end
local ok, state = pcall(cjson.decode, raw)
if not ok then return '{"error":"Failed to parse state"}' end
if state.status ~= "OPEN" then return '{"error":"Question is not open"}' end
state.status = "CLOSED"
redis.call("SET", KEYS[1], cjson.encode(state))
return cjson.encode({status="CLOSED", currentQuestion=state.currentQuestion})
`

// ── Atomic Operations ──

export async function atomicBuzzForQuiz(quizId: string, participantId: string): Promise<Buzz | { error: string }> {
  const key = `quiz:${quizId}:state`
  if (kv) {
    const result = await kv.eval(BUZZ_LUA, [key], [participantId])
    return result as Buzz | { error: string }
  }
  return getMutex(quizId).exec(async () => {
    const state = await getQuizState(quizId)
    if (!state) return { error: 'No game state' }
    if (state.status !== 'OPEN') return { error: 'Question is not open' }
    const p = state.participants.find(p => p.id === participantId)
    if (!p) return { error: 'Unknown participant' }
    if (state.buzzQueue.find(b => b.participantId === participantId)) return { error: 'Already buzzed' }
    const buzz: Buzz = {
      participantId: p.id, participantName: p.name,
      serverTimestamp: Date.now(), rank: state.buzzQueue.length + 1,
    }
    state.buzzQueue.push(buzz)
    await setQuizState(quizId, state)
    return buzz
  })
}

export async function atomicJoinQuiz(quizId: string, participant: Participant): Promise<Participant | { error: string }> {
  if (kv) {
    const result = await kv.eval(JOIN_LUA, [`quiz:${quizId}:state`], [participant.id, participant.name])
    return result as Participant | { error: string }
  }
  return getMutex(quizId).exec(async () => {
    let state = await getQuizState(quizId)
    if (!state) {
      state = clone(DEFAULT_STATE)
    }
    for (const p of state.participants) {
      if (p.id === participant.id) return participant
    }
    state.participants.push(participant)
    await setQuizState(quizId, state)
    return participant
  })
}

export async function atomicToggleQuestion(quizId: string): Promise<{ status?: string; currentQuestion?: number; error?: string }> {
  if (kv) {
    const result = await kv.eval(TOGGLE_QUESTION_LUA, [`quiz:${quizId}:state`], [])
    return result as { status?: string; currentQuestion?: number; error?: string }
  }
  return getMutex(quizId).exec(async () => {
    const state = await getQuizState(quizId)
    if (!state) return { error: 'No game state' }
    if (state.status === 'OPEN') return { error: 'Question already open' }
    state.status = 'OPEN'
    state.buzzQueue = []
    await setQuizState(quizId, state)
    return { status: 'OPEN', currentQuestion: state.currentQuestion }
  })
}

export async function atomicNextQuestion(quizId: string, totalQuestions: number): Promise<{
  action?: string; currentQuestion?: number; error?: string; totalParticipants?: number; winner?: string
}> {
  if (kv) {
    const result = await kv.eval(NEXT_QUESTION_LUA, [`quiz:${quizId}:state`], [String(totalQuestions)])
    return result as { action?: string; currentQuestion?: number; error?: string; totalParticipants?: number; winner?: string }
  }
  return getMutex(quizId).exec(async () => {
    const state = await getQuizState(quizId)
    if (!state) return { error: 'No game state' }
    if (state.status === 'OPEN') return { error: 'Close question first' }
    const nextQ = state.currentQuestion + 1
    if (nextQ > totalQuestions) {
      state.status = 'CLOSED'
      state.finished = true
      await setQuizState(quizId, state)
      return {
        action: 'FINISH', currentQuestion: state.currentQuestion,
        totalParticipants: state.participants.length,
        winner: state.buzzQueue[0]?.participantName ?? '',
      }
    }
    state.currentQuestion = nextQ
    state.status = 'CLOSED'
    state.buzzQueue = []
    await setQuizState(quizId, state)
    return { action: 'NEXT', currentQuestion: nextQ, totalQuestions }
  })
}

export async function atomicPreviousQuestion(quizId: string): Promise<{ currentQuestion?: number; status?: string; error?: string }> {
  if (kv) {
    const result = await kv.eval(PREVIOUS_QUESTION_LUA, [`quiz:${quizId}:state`], [])
    return result as { currentQuestion?: number; status?: string; error?: string }
  }
  return getMutex(quizId).exec(async () => {
    const state = await getQuizState(quizId)
    if (!state) return { error: 'No game state' }
    const prevQ = state.currentQuestion - 1
    if (prevQ < 1) return { error: 'Already at first question' }
    state.currentQuestion = prevQ
    state.status = 'CLOSED'
    state.buzzQueue = []
    await setQuizState(quizId, state)
    return { currentQuestion: prevQ, status: 'CLOSED' }
  })
}

export async function atomicCloseQuestion(quizId: string): Promise<{ status?: string; currentQuestion?: number; error?: string }> {
  if (kv) {
    const result = await kv.eval(CLOSE_QUESTION_LUA, [`quiz:${quizId}:state`], [])
    return result as { status?: string; currentQuestion?: number; error?: string }
  }
  return getMutex(quizId).exec(async () => {
    const state = await getQuizState(quizId)
    if (!state) return { error: 'No game state' }
    if (state.status !== 'OPEN') return { error: 'Question is not open' }
    state.status = 'CLOSED'
    await setQuizState(quizId, state)
    return { status: 'CLOSED', currentQuestion: state.currentQuestion }
  })
}

export async function atomicEndQuiz(quizId: string): Promise<{ status?: string; error?: string; totalParticipants?: number; winner?: string }> {
  if (kv) {
    const result = await kv.eval(END_QUIZ_LUA, [`quiz:${quizId}:state`], [])
    return result as { status?: string; error?: string; totalParticipants?: number; winner?: string }
  }
  return getMutex(quizId).exec(async () => {
    const state = await getQuizState(quizId)
    if (!state) return { error: 'No game state' }
    state.status = 'CLOSED'
    state.finished = true
    await setQuizState(quizId, state)
    return {
      totalParticipants: state.participants.length,
      winner: state.buzzQueue[0]?.participantName ?? '',
    }
  })
}
