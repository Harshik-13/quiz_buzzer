'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()
  const [secret, setSecret] = useState(loadStoredSecret)
  const [authenticated, setAuthenticated] = useState(false)
  const [verifying, setVerifying] = useState(!!loadStoredSecret())
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
    if (authenticated) router.push('/my-quizzes')
  }, [authenticated, router])

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

  return null
}
