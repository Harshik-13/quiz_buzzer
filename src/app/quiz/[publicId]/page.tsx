'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { GameState, Participant } from '@/lib/types'

const POLL_INTERVAL = 500
const STORAGE_KEY_PREFIX = 'buzz_participant_'

export default function QuizParticipantPage() {
  const { publicId } = useParams<{ publicId: string }>()
  const storageKey = `${STORAGE_KEY_PREFIX}${publicId}`

  const [quizInfo, setQuizInfo] = useState<{ name: string; description: string; totalQuestions: number; status: string; participantCount: number } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState('')
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [joining, setJoining] = useState(false)
  const [state, setState] = useState<GameState | null>(null)
  const [buzzing, setBuzzing] = useState(false)
  const [buzzError, setBuzzError] = useState('')
  const [error, setError] = useState('')
  const [initDone, setInitDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/quiz/${publicId}`)
      .then(res => {
        if (!cancelled) {
          if (res.status === 404 || res.status === 410) {
            setLoadError('Quiz not found or no longer available')
          } else if (res.ok) {
            return res.json().then(data => {
              if (!cancelled) setQuizInfo(data)
            })
          } else {
            setLoadError('Failed to load quiz')
          }
        }
      })
      .catch(() => { if (!cancelled) setLoadError('Network error') })
    return () => { cancelled = true }
  }, [publicId])

  useEffect(() => {
    if (!participant) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/quiz/${publicId}/state`)
        if (!cancelled && res.ok) {
          const gameState = await res.json() as GameState
          if (!cancelled) {
            setState(gameState)
            setBuzzError('')
          }
        }
      } catch { /* ignore */ }
    }
    tick()
    const id = setInterval(tick, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(id) }
  }, [participant, publicId])

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const p = JSON.parse(saved) as Participant
        if (p.id && p.name) setParticipant(p)
      } catch { /* ignore */ }
    }
  }, [storageKey])

  useEffect(() => {
    if (!participant || initDone) return
    let cancelled = false
    const verify = async () => {
      try {
        const res = await fetch(`/api/quiz/${publicId}/state`)
        if (!cancelled && res.ok) {
          const gameState = await res.json() as GameState
          if (!cancelled) {
            const found = gameState.participants.some(p => p.id === participant.id)
            if (!found) {
              localStorage.removeItem(storageKey)
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
  }, [participant, initDone, publicId, storageKey])

  const handleJoin = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Please enter your name'); return }
    if (trimmed.length > 50) { setError('Name is too long'); return }
    setError('')
    setJoining(true)
    try {
      const res = await fetch(`/api/quiz/${publicId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to join'); return }
      const p: Participant = { id: data.id, name: data.name }
      setParticipant(p)
      setInitDone(true)
      localStorage.setItem(storageKey, JSON.stringify(p))
    } catch { setError('Network error.') }
    finally { setJoining(false) }
  }

  const handleBuzz = async () => {
    if (!participant) return
    setBuzzError('')
    setBuzzing(true)
    try {
      const res = await fetch(`/api/quiz/${publicId}/buzz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: participant.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        setBuzzError(data.error || 'Buzz failed.')
      }
    } catch { setBuzzError('Network error.') }
    finally { setBuzzing(false) }
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm text-center space-y-4 rounded-xl border p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-red-600">Quiz Unavailable</h1>
          <p className="text-zinc-500">{loadError}</p>
          <a href="/" className="inline-block rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-zinc-50">Go Home</a>
        </div>
      </div>
    )
  }

  if (!quizInfo) {
    return <div className="flex flex-1 items-center justify-center p-8"><p className="text-sm text-zinc-400">Loading quiz...</p></div>
  }

  if (quizInfo.status !== 'WAITING_ROOM' && quizInfo.status !== 'LIVE' && quizInfo.status !== 'DRAFT') {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm text-center space-y-4 rounded-xl border p-8 shadow-sm">
          <h1 className="text-2xl font-bold">{quizInfo.name}</h1>
          <p className="text-zinc-500">This quiz is not currently accepting participants.</p>
          <a href="/" className="inline-block rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-zinc-50">Go Home</a>
        </div>
      </div>
    )
  }

  if (!participant) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6 rounded-xl border p-8 shadow-sm">
          <div className="text-center">
            <h1 className="text-2xl font-bold">{quizInfo.name}</h1>
            {quizInfo.description && <p className="mt-1 text-sm text-zinc-500">{quizInfo.description}</p>}
            <p className="mt-2 text-xs text-zinc-400">{quizInfo.totalQuestions} questions</p>
          </div>
          {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">Your Name</label>
            <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJoin()} placeholder="Enter your name" maxLength={50} className="w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          </div>
          <button onClick={handleJoin} disabled={joining} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {joining ? 'Joining...' : 'Join Quiz'}
          </button>
        </div>
      </div>
    )
  }

  if (!initDone) {
    return <div className="flex flex-1 items-center justify-center p-8"><p className="text-sm text-zinc-400">Verifying session...</p></div>
  }

  const q = state?.currentQuestion ?? 0
  const totalQuestions = state?.totalQuestions ?? quizInfo.totalQuestions
  const status = state?.status ?? 'CLOSED'
  const myBuzz = state?.buzzQueue.find(b => b.participantId === participant.id)
  const hasBuzzed = !!myBuzz
  const buzzDisabled = buzzing || hasBuzzed || status !== 'OPEN'

  if (state?.finished) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6 rounded-xl border border-purple-200 bg-purple-50 p-8 text-center shadow-sm">
          <h1 className="text-3xl font-bold text-purple-800">Quiz Finished</h1>
          <p className="text-xl font-semibold text-zinc-800">{quizInfo.name}</p>
          {hasBuzzed && (
            <div className="space-y-1">
              <p className="text-sm text-zinc-500">Your rank</p>
              <p className="text-4xl font-bold text-purple-700">#{myBuzz!.rank}</p>
            </div>
          )}
          <p className="text-sm text-zinc-500">Thank you for participating!</p>
          <a href="/" className="inline-block rounded-lg border bg-white px-5 py-2 text-sm font-semibold hover:bg-zinc-50">Go Home</a>
        </div>
      </div>
    )
  }

  const isLive = quizInfo.status === 'LIVE'

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6 rounded-xl border p-8 text-center shadow-sm">
        <p className="text-sm text-zinc-500">Joined as <span className="font-semibold text-zinc-800">{participant.name}</span></p>
        {!isLive && q === 0 && (
          <p className="text-lg font-semibold text-zinc-400">Waiting for organizer to start the quiz...</p>
        )}
        {isLive && q === 0 && (
          <p className="text-lg font-semibold text-zinc-400">Quiz Started — waiting for first question...</p>
        )}
        {q > 0 && (
          <p className="text-lg font-semibold">Question {q}{totalQuestions ? ` of ${totalQuestions}` : ''}</p>
        )}
        {q > 0 && status === 'WAITING' && (
          <p className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500">Waiting for organizer to open the question...</p>
        )}
        {status === 'OPEN' && !hasBuzzed && (
          <button onClick={handleBuzz} disabled={buzzing} className="w-full rounded-xl bg-red-600 px-6 py-4 text-lg font-bold text-white shadow-lg hover:bg-red-700 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
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
            <p className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500">Closed</p>
            <p className="text-sm text-zinc-400">Waiting for organizer...</p>
          </>
        )}
        {buzzError && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{buzzError}</p>}
      </div>
    </div>
  )
}
