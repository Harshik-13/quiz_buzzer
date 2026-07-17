import { createClient } from '@vercel/kv'
import type { Buzz, GameState, Quiz } from './types'
import { v4 as uuid } from 'uuid'
import { getOrganizerId } from './admin'

function getKv() {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (url && token) {
    return createClient({ url, token })
  }
  return null
}

const kv = getKv()

const STATE_KEY = 'game:state'
const INDEX_KEY = 'quiz:index'
const PUBLIC_ID_PREFIX = 'publicId:'

const DEFAULT_STATE: GameState = {
  currentQuestion: 0,
  totalQuestions: 0,
  status: 'CLOSED',
  participants: [],
  buzzQueue: [],
}

let memoryState: GameState = structuredClone(DEFAULT_STATE)
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

// ── Game State (legacy global, kept for backward compat) ──

export async function getState(): Promise<GameState> {
  if (kv) {
    try {
      const state = await kv.get<GameState>(STATE_KEY)
      if (state) return state
      await kv.set(STATE_KEY, DEFAULT_STATE)
      return { ...DEFAULT_STATE }
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV is unavailable.')
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('Vercel KV is not configured.')
  }
  return structuredClone(memoryState)
}

export async function setState(state: GameState): Promise<void> {
  if (kv) {
    try {
      await kv.set(STATE_KEY, state)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV is unavailable.')
      memoryState = structuredClone(state)
    }
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV is not configured.')
    memoryState = structuredClone(state)
  }
}

// ── Per-Quiz Game State ──

export async function getQuizState(quizId: string): Promise<GameState | null> {
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
  return quizState ? structuredClone(quizState) : structuredClone(memoryState)
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
  memoryQuizStates.set(quizId, structuredClone(state))
  await setState(state)
}

// ── Public ID Resolution ──

export async function getQuizByPublicId(publicId: string): Promise<Quiz | null> {
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
    currentQuestion: 0,
    questionStatus: 'CLOSED',
    participants: [],
    buzzQueue: [],
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
    currentQuestion: 0,
    questionStatus: 'CLOSED',
    participants: [],
    buzzQueue: [],
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

// ── Active Quiz (kept for legacy compatibility) ──

export async function getActiveQuizId(): Promise<string | null> {
  return null
}

export async function setActiveQuizId(_id: string | null): Promise<void> {
  // no-op; each quiz manages its own state now
}

export async function activateQuiz(id: string): Promise<Quiz | null> {
  const quiz = await getQuiz(id)
  if (!quiz) return null

  const gameState: GameState = {
    currentQuestion: quiz.currentQuestion,
    totalQuestions: quiz.totalQuestions,
    status: quiz.questionStatus,
    participants: [...(quiz.participants || [])],
    buzzQueue: [...(quiz.buzzQueue || [])],
  }
  await setQuizState(id, gameState)
  return quiz
}

export async function syncQuizFromState(): Promise<void> {
  // no-op; quiz state is managed per-quiz now
}

// ── Atomic Buzz (uses STATE_KEY directly, kept for backward compat) ──

const BUZZ_LUA_SCRIPT = `
local key = KEYS[1]
local pid = ARGV[1]

local raw = redis.call("JSON.GET", key)
if not raw then
  return '{"error":"No game state"}'
end

local ok, state = pcall(cjson.decode, raw)
if not ok then
  return '{"error":"Failed to parse state"}'
end

if state.status ~= "OPEN" then
  return '{"error":"Question is not open"}'
end

local found = false
local pname = ""
for i, p in ipairs(state.participants) do
  if p.id == pid then
    found = true
    pname = p.name
    break
  end
end
if not found then
  return '{"error":"Unknown participant"}'
end

for i, b in ipairs(state.buzzQueue) do
  if b.participantId == pid then
    return '{"error":"Already buzzed"}'
  end
end

local t = redis.call("TIME")
local ts = t[1] * 1000
local rank = #state.buzzQueue + 1

local buzz = {participantId=pid, participantName=pname, serverTimestamp=ts, rank=rank}
table.insert(state.buzzQueue, buzz)

redis.call("JSON.SET", key, ".", cjson.encode(state))

return cjson.encode(buzz)
`

export async function atomicBuzz(participantId: string): Promise<Buzz | { error: string }> {
  if (!kv) {
    throw new Error('atomicBuzz requires Vercel KV to be configured')
  }
  const result = await kv.eval<string[], string>(BUZZ_LUA_SCRIPT, [STATE_KEY], [participantId])
  return JSON.parse(result)
}

export async function atomicBuzzForQuiz(quizId: string, participantId: string): Promise<Buzz | { error: string }> {
  const stateKey = `quiz:${quizId}:state`
  if (kv) {
    const result = await kv.eval<string[], string>(BUZZ_LUA_SCRIPT, [stateKey], [participantId])
    return JSON.parse(result)
  }

  const state = await getQuizState(quizId)
  if (!state) return { error: 'No game state' }
  if (state.status !== 'OPEN') return { error: 'Question is not open' }

  const participant = state.participants.find(p => p.id === participantId)
  if (!participant) return { error: 'Unknown participant' }
  if (state.buzzQueue.find(b => b.participantId === participantId)) return { error: 'Already buzzed' }

  const buzz: Buzz = {
    participantId: participant.id,
    participantName: participant.name,
    serverTimestamp: Date.now(),
    rank: state.buzzQueue.length + 1,
  }
  state.buzzQueue.push(buzz)
  await setQuizState(quizId, state)
  return buzz
}
