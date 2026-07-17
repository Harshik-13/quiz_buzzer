import { createClient } from '@vercel/kv'
import type { Buzz, GameState } from './types'

function getKv() {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (url && token) {
    return createClient({ url, token })
  }

  return null
}

const kv = getKv()

const KEY = 'game:state'

const DEFAULT_STATE: GameState = {
  currentQuestion: 0,
  status: 'CLOSED',
  participants: [],
  buzzQueue: [],
}

let memoryState: GameState = structuredClone(DEFAULT_STATE)

export async function getState(): Promise<GameState> {
  if (kv) {
    try {
      const state = await kv.get<GameState>(KEY)
      if (state) return state
      await kv.set(KEY, DEFAULT_STATE)
      return { ...DEFAULT_STATE }
    } catch {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'Vercel KV is unavailable. Check KV_REST_API_URL and KV_REST_API_TOKEN environment variables.'
        )
      }
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Vercel KV is not configured. Set the KV_REST_API_URL and KV_REST_API_TOKEN environment variables.'
    )
  }
  return structuredClone(memoryState)
}

export async function setState(state: GameState): Promise<void> {
  if (kv) {
    try {
      await kv.set(KEY, state)
    } catch {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'Vercel KV is unavailable. Check KV_REST_API_URL and KV_REST_API_TOKEN environment variables.'
        )
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
  const result = await kv.eval<string[], string>(BUZZ_LUA_SCRIPT, [KEY], [participantId])
  return JSON.parse(result)
}
