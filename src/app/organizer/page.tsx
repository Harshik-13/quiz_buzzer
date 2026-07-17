'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState } from '@/lib/types'

const POLL_INTERVAL = 300
const SECRET_KEY = 'admin_secret'

function loadStoredSecret(): string {
  if (typeof window === 'undefined') return ''
  try {
    return sessionStorage.getItem(SECRET_KEY) || ''
  } catch {
    return ''
  }
}

export default function OrganizerPage() {
  const [secret, setSecret] = useState(loadStoredSecret)
  const [authenticated, setAuthenticated] = useState(false)
  const [verifying, setVerifying] = useState(!!loadStoredSecret())
  const [state, setState] = useState<GameState | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState('')
  const secretRef = useRef(secret)

  useEffect(() => {
    const stored = loadStoredSecret()
    if (!stored) {
      setVerifying(false)
      return
    }

    let cancelled = false
    const verify = async () => {
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: stored }),
        })
        if (!cancelled) {
          if (res.status !== 401) {
            secretRef.current = stored
            setAuthenticated(true)
          } else {
            sessionStorage.removeItem(SECRET_KEY)
            setSecret('')
          }
        }
      } catch {
        if (!cancelled) {
          sessionStorage.removeItem(SECRET_KEY)
          setSecret('')
        }
      } finally {
        if (!cancelled) setVerifying(false)
      }
    }

    verify()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!authenticated) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch('/api/state')
        if (!cancelled && res.ok) {
          const data = (await res.json()) as GameState
          if (!cancelled) setState(data)
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
  }, [authenticated])

  const callAdmin = useCallback(async (endpoint: string) => {
    setError('')
    setSending(endpoint)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secretRef.current,
        },
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Request failed.')
      }
    } catch {
      setError('Network error.')
    } finally {
      setSending('')
    }
  }, [])

  const handleAuth = async () => {
    const trimmed = secret.trim()
    if (!trimmed) {
      setError('Enter admin secret.')
      return
    }

    setError('')
    setSending('auth')

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: trimmed }),
      })

      if (res.status === 401) {
        setError('Invalid admin secret.')
        return
      }

      secretRef.current = trimmed
      setAuthenticated(true)
      sessionStorage.setItem(SECRET_KEY, trimmed)
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSending('')
    }
  }

  if (verifying) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-zinc-400">Verifying session...</p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6 rounded-xl border p-8 shadow-sm">
          <h1 className="text-center text-2xl font-bold">Organizer</h1>
          {error && (
            <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}
          <div className="space-y-2">
            <label htmlFor="secret" className="text-sm font-medium">
              Admin Secret
            </label>
            <input
              id="secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              placeholder="Enter admin secret"
              className="w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <button
            onClick={handleAuth}
            disabled={sending === 'auth'}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending === 'auth' ? 'Verifying...' : 'Authenticate'}
          </button>
        </div>
      </div>
    )
  }

  const q = state?.currentQuestion ?? 0
  const status = state?.status ?? 'CLOSED'
  const participants = state?.participants ?? []
  const buzzQueue = state?.buzzQueue ?? []

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col space-y-6 p-8">
      <h1 className="text-2xl font-bold">Organizer Dashboard</h1>
      {error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <div className="rounded-xl border p-6 shadow-sm">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-lg font-semibold">
            Question {q > 0 ? q : '\u2014'}
          </span>
          {status === 'OPEN' ? (
            <span className="rounded-full bg-green-100 px-3 py-0.5 text-sm font-medium text-green-700">
              Open
            </span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-sm font-medium text-zinc-500">
              Closed
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {status === 'CLOSED' && (
            <button
              onClick={() => callAdmin('/api/start')}
              disabled={sending !== ''}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {sending === '/api/start' ? 'Starting...' : 'Start'}
            </button>
          )}
          {status === 'OPEN' && (
            <button
              onClick={() => callAdmin('/api/end')}
              disabled={sending !== ''}
              className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {sending === '/api/end' ? 'Ending...' : 'End'}
            </button>
          )}
          <button
            onClick={() => callAdmin('/api/next')}
            disabled={sending !== ''}
            className="rounded-lg border px-5 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
          >
            {sending === '/api/next' ? 'Advancing...' : 'Next'}
          </button>
        </div>
      </div>

      {buzzQueue.length > 0 && (
        <div className="rounded-xl border p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">
            Buzz Ranking
          </h2>
          <ol className="space-y-1">
            {buzzQueue.map((b) => {
              const medal = b.rank === 1 ? '\uD83E\uDD47' : b.rank === 2 ? '\uD83E\uDD48' : b.rank === 3 ? '\uD83E\uDD49' : null
              return (
                <li
                  key={b.participantId}
                  className="flex items-center gap-3 rounded-md bg-zinc-50 px-4 py-2 text-sm"
                >
                  {medal ? (
                    <span className="text-lg">{medal}</span>
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-300 text-xs font-bold text-zinc-700">
                      {b.rank}
                    </span>
                  )}
                  <span>{b.participantName}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <div className="rounded-xl border p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">
          Participants{' '}
          <span className="text-sm font-normal text-zinc-400">
            ({participants.length})
          </span>
        </h2>
        {participants.length === 0 ? (
          <p className="text-sm text-zinc-400">No participants yet.</p>
        ) : (
          <ul className="space-y-1">
            {participants.map((p) => (
              <li key={p.id} className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-black">
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
