'use client'

import { useEffect, useState } from 'react'
import type { GameState, Participant } from '@/lib/types'

const POLL_INTERVAL = 500
const STORAGE_KEY = 'buzz_participant'

function loadStoredParticipant(): Participant | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const p = JSON.parse(stored) as Participant
      if (p.id && p.name) return p
    }
  } catch {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
  }
  return null
}

export default function ParticipantPage() {
  const [name, setName] = useState('')
  const [participant, setParticipant] = useState<Participant | null>(loadStoredParticipant)
  const [state, setState] = useState<GameState | null>(null)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [buzzing, setBuzzing] = useState(false)
  const [buzzError, setBuzzError] = useState('')
  const [initDone, setInitDone] = useState(() => !loadStoredParticipant())

  useEffect(() => {
    if (!participant) return
    let cancelled = false

    const tick = async () => {
      try {
        const res = await fetch('/api/state')
        if (!cancelled && res.ok) {
          const gameState = (await res.json()) as GameState
          if (!cancelled) {
            setState(gameState)
            setBuzzError('')
          }
        }
      } catch {
        // ignore
      }
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [participant])

  useEffect(() => {
    if (!participant || initDone) return
    let cancelled = false

    const verify = async () => {
      try {
        const res = await fetch('/api/state')
        if (!cancelled && res.ok) {
          const gameState = (await res.json()) as GameState
          if (!cancelled) {
            const found = gameState.participants.some((p) => p.id === participant.id)
            if (!found) {
              localStorage.removeItem(STORAGE_KEY)
              setParticipant(null)
            }
            setInitDone(true)
          }
        }
      } catch {
        if (!cancelled) setInitDone(true)
      }
    }

    verify()
    return () => { cancelled = true }
  }, [participant, initDone])

  const handleJoin = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter your name.')
      return
    }
    if (trimmed.length > 50) {
      setError('Name is too long.')
      return
    }
    setError('')
    setJoining(true)
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to join.')
        return
      }
      const p: Participant = { id: data.id, name: data.name }
      setInitDone(true)
      setParticipant(p)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
    } catch {
      setError('Network error. Try again.')
    } finally {
      setJoining(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin()
  }

  if (!initDone && participant) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-zinc-400">Verifying session...</p>
      </div>
    )
  }

  if (!participant) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6 rounded-xl border p-8 shadow-sm">
          <h1 className="text-center text-2xl font-bold">Join Quiz</h1>
          {error && (
            <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Your Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your name"
              maxLength={50}
              className="w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {joining ? 'Joining...' : 'Join'}
          </button>
        </div>
      </div>
    )
  }

  const q = state?.currentQuestion ?? 0
  const status = state?.status ?? 'CLOSED'
  const myBuzz = state?.buzzQueue?.find((b) => b.participantId === participant.id)
  const hasBuzzed = !!myBuzz
  const buzzDisabled = buzzing || hasBuzzed || status !== 'OPEN'

  const handleBuzz = async () => {
    if (buzzDisabled) return
    setBuzzError('')
    setBuzzing(true)
    try {
      const res = await fetch('/api/buzz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: participant.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        setBuzzError(data.error || 'Buzz failed.')
      }
    } catch {
      setBuzzError('Network error.')
    } finally {
      setBuzzing(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6 rounded-xl border p-8 text-center shadow-sm">
        <p className="text-sm text-zinc-500">Joined as <span className="font-semibold text-zinc-800">{participant.name}</span></p>
        {q > 0 ? (
          <p className="text-lg font-semibold">Question {q}</p>
        ) : (
          <p className="text-lg font-semibold text-zinc-400">No question yet</p>
        )}
        {status === 'OPEN' && !hasBuzzed && (
          <button
            onClick={handleBuzz}
            disabled={buzzing}
            className="w-full rounded-xl bg-red-600 px-6 py-4 text-lg font-bold text-white shadow-lg hover:bg-red-700 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buzzing ? 'Sending...' : 'BUZZ!'}
          </button>
        )}
        {status === 'OPEN' && hasBuzzed && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-green-700">Buzz Recorded</p>
            <p className="text-2xl font-bold">Rank #{myBuzz.rank}</p>
          </div>
        )}
        {status === 'CLOSED' && (
          <>
            <p className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500">
              Closed
            </p>
            <p className="text-sm text-zinc-400">Waiting for organizer...</p>
          </>
        )}
        {buzzError && (
          <p className="rounded bg-red-50 p-3 text-sm text-red-700">{buzzError}</p>
        )}
      </div>
    </div>
  )
}
