import { createClient } from '@vercel/kv'
import type { Buzz, GameState, Quiz } from './types'
import { v4 as uuid } from 'uuid'

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
const META_KEY = 'app:meta'

const DEFAULT_STATE: GameState = {
  currentQuestion: 0,
  totalQuestions: 0,
  status: 'CLOSED',
  participants: [],
  buzzQueue: [],
}

let memoryState: GameState = structuredClone(DEFAULT_STATE)
let memoryQuizzes: Quiz[] = []
let memoryActiveQuizId: string | null = null

// ── Game State (existing) ──

export async function getState(): Promise<GameState> {
  if (kv) {
    try {
      const state = await kv.get<GameState>(STATE_KEY)
      if (state) return state
      await kv.set(STATE_KEY, DEFAULT_STATE)
      return { ...DEFAULT_STATE }
    } catch {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Vercel KV is unavailable.')
      }
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
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Vercel KV is unavailable.')
      }
      memoryState = structuredClone(state)
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Vercel KV is not configured.')
    }
    memoryState = structuredClone(state)
  }
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
  const quiz: Quiz = {
    id: uuid(),
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
      const ids = (await kv.get<string[]>(INDEX_KEY)) || []
      ids.push(quiz.id)
      await kv.set(INDEX_KEY, ids)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  } else {
    memoryQuizzes.push(quiz)
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
  if (kv) {
    try {
      await kv.del(`quiz:${id}`)
      const ids = (await kv.get<string[]>(INDEX_KEY)) || []
      const filtered = ids.filter(i => i !== id)
      await kv.set(INDEX_KEY, filtered)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  } else {
    memoryQuizzes = memoryQuizzes.filter(q => q.id !== id)
  }
  return true
}

export async function duplicateQuiz(id: string): Promise<Quiz | null> {
  const original = await getQuiz(id)
  if (!original) return null
  const now = Date.now()
  const quiz: Quiz = {
    id: uuid(),
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
      const ids = (await kv.get<string[]>(INDEX_KEY)) || []
      ids.push(quiz.id)
      await kv.set(INDEX_KEY, ids)
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  } else {
    memoryQuizzes.push(quiz)
  }
  return quiz
}

// ── Active Quiz ──

export async function getActiveQuizId(): Promise<string | null> {
  if (kv) {
    try {
      const meta = await kv.get<{ activeQuizId: string | null }>(META_KEY)
      return meta?.activeQuizId ?? null
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  }
  return memoryActiveQuizId
}

export async function setActiveQuizId(id: string | null): Promise<void> {
  if (kv) {
    try {
      await kv.set(META_KEY, { activeQuizId: id })
    } catch {
      if (process.env.NODE_ENV === 'production') throw new Error('Vercel KV unavailable.')
    }
  }
  memoryActiveQuizId = id
}

// ── Sync quiz state to active game ──

export async function activateQuiz(id: string): Promise<Quiz | null> {
  const quiz = await getQuiz(id)
  if (!quiz) return null

  const gameState: GameState = {
    currentQuestion: quiz.currentQuestion,
    totalQuestions: quiz.totalQuestions,
    status: quiz.questionStatus,
    participants: [...quiz.participants],
    buzzQueue: [...quiz.buzzQueue],
  }
  await setState(gameState)
  await setActiveQuizId(id)
  return quiz
}

export async function syncQuizFromState(): Promise<void> {
  const activeId = await getActiveQuizId()
  if (!activeId) return
  const quiz = await getQuiz(activeId)
  if (!quiz) return
  const state = await getState()
  await updateQuiz(activeId, {
    currentQuestion: state.currentQuestion,
    questionStatus: state.status,
    participants: state.participants,
    buzzQueue: state.buzzQueue,
  })
}

// ── Atomic Buzz (uses STATE_KEY directly) ──

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
