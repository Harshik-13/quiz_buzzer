'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Quiz, LiveState } from '@/lib/types'
import { loadStoredSecret, SECRET_KEY, adminHeaders as makeHeaders } from '@/lib/auth-client'
import Link from 'next/link'

const POLL_INTERVAL = 300

export default function LiveQuizPage() {
  const { publicId } = useParams<{ publicId: string }>()
  const router = useRouter()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [liveState, setLiveState] = useState<LiveState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState('')
  const [finished, setFinished] = useState(false)
  const secretRef = useRef(loadStoredSecret())

  const adminHeaders = useCallback(() => makeHeaders(secretRef.current), [])

  useEffect(() => {
    const stored = loadStoredSecret()
    if (!stored) { router.replace('/organizer'); return }
  }, [router])

  useEffect(() => {
    const load = async () => {
      try {
        const listRes = await fetch('/api/quizzes', { headers: adminHeaders() })
        if (listRes.status === 401) { router.replace('/organizer'); return }
        const quizzes: Quiz[] = await listRes.json()
        const found = quizzes.find(q => q.publicId === publicId)
        if (!found) { setError('Quiz not found'); return }
        setQuiz(found)
        if (found.status === 'FINISHED') setFinished(true)
      } catch { setError('Failed to load quiz') }
      finally { setLoading(false) }
    }
    load()
  }, [publicId, adminHeaders, router])

  const isFirstPoll = useRef(true)
  useEffect(() => {
    if (finished) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/quiz/${publicId}/state`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setLiveState(data)
            if (data.finished) setFinished(true)
          }
        }
      } catch { /* ignore */ }
    }
    if (isFirstPoll.current) { tick(); isFirstPoll.current = false }
    const interval = setInterval(tick, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(interval) }
  }, [publicId, finished])

  useEffect(() => {
    if (!quiz || finished) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/quizzes', { headers: adminHeaders() })
        if (res.ok) {
          const quizzes: Quiz[] = await res.json()
          const found = quizzes.find(q => q.publicId === publicId)
          if (found && found.status === 'FINISHED') {
            setQuiz(found)
            setFinished(true)
          }
        }
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [quiz?.id, publicId, adminHeaders, finished])

  const callApi = useCallback(async (path: string, onSuccess?: (data: Record<string, unknown>) => void) => {
    setError('')
    setSending(path)
    try {
      const res = await fetch(path, { method: 'POST', headers: adminHeaders() })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Request failed') }
      else {
        const data = await res.json()
        if (onSuccess) onSuccess(data)
      }
    } catch { setError('Network error') }
    finally { setSending('') }
  }, [adminHeaders])

  const handleStart = () => {
    if (!quiz) return
    const isStarting = quiz.status === 'DRAFT' || quiz.status === 'WAITING_ROOM'
    callApi(`/api/quizzes/${quiz.id}/start`, (data: Record<string, unknown>) => {
      if (isStarting) {
        setQuiz(prev => prev ? { ...prev, status: 'LIVE' as const } : null)
        setLiveState(prev => prev ? {
          ...prev,
          currentQuestion: (data.currentQuestion as number) ?? 1,
          status: (data.questionStatus as string) ?? 'WAITING',
        } : null)
      } else {
        setLiveState(prev => prev ? {
          ...prev,
          status: (data.status as string) ?? 'OPEN',
          buzzQueue: [],
        } : null)
      }
    })
  }

  const handleEndQuestion = () => {
    if (!quiz) return
    callApi(`/api/quizzes/${quiz.id}/close`, (data: Record<string, unknown>) => {
      setLiveState(prev => prev ? {
        ...prev,
        status: (data.status as string) ?? 'CLOSED',
      } : null)
    })
  }

  const handleNext = () => {
    if (!quiz) return
    callApi(`/api/quizzes/${quiz.id}/next`, (data: Record<string, unknown>) => {
      setLiveState(prev => prev ? {
        ...prev,
        currentQuestion: (data.currentQuestion as number) ?? prev.currentQuestion,
        status: (data.status as string) ?? 'WAITING',
        buzzQueue: [],
      } : null)
    })
  }

  const handlePrevious = () => {
    if (!quiz) return
    callApi(`/api/quizzes/${quiz.id}/previous`, (data: Record<string, unknown>) => {
      setLiveState(prev => prev ? {
        ...prev,
        currentQuestion: (data.currentQuestion as number) ?? prev.currentQuestion,
        status: (data.status as string) ?? 'WAITING',
        buzzQueue: [],
      } : null)
    })
  }

  const handleEndQuiz = () => {
    if (!quiz) return
    callApi(`/api/quizzes/${quiz.id}/end-quiz`, () => setFinished(true))
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8"><p className="text-sm text-zinc-400">Loading...</p></div>
  }

  if (finished) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center p-8 text-center space-y-6">
        <h1 className="text-3xl font-bold">{quiz?.name || 'Quiz'}</h1>
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-8">
          <p className="text-2xl font-bold text-purple-800">Quiz Finished</p>
          {quiz?.statistics && (
            <div className="mt-4 grid grid-cols-3 gap-6 text-sm">
              <div><span className="block text-lg font-semibold">{quiz.statistics.totalParticipants}</span><span className="text-zinc-500">Participants</span></div>
              <div><span className="block text-lg font-semibold">{quiz.statistics.totalQuestions}</span><span className="text-zinc-500">Questions</span></div>
              <div><span className="block text-lg font-semibold">{quiz.statistics.winner || '\u2014'}</span><span className="text-zinc-500">Winner</span></div>
            </div>
          )}
        </div>
        <Link href="/dashboard" className="rounded-lg border px-5 py-2 text-sm font-semibold hover:bg-zinc-50">&larr; Dashboard</Link>
      </div>
    )
  }

  if (!quiz || (quiz.status !== 'LIVE' && quiz.status !== 'WAITING_ROOM' && quiz.status !== 'DRAFT')) {
    return <div className="flex flex-1 items-center justify-center p-8"><p className="text-sm text-red-600">{error || 'Quiz not available'}</p></div>
  }

  if (quiz.status === 'WAITING_ROOM' || quiz.status === 'DRAFT') {
    const waitingParticipants = liveState?.participants ?? []
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-8 space-y-6">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">{quiz.name}</h1>
          <p className="text-lg text-zinc-500">Question 1 of {quiz.totalQuestions}</p>
          <div className="rounded-xl border p-6">
            <h2 className="text-base font-semibold text-zinc-800 mb-3">Participants Ready ({waitingParticipants.length})</h2>
            {waitingParticipants.length === 0 ? (
              <p className="text-sm text-zinc-400">Waiting for participants to join...</p>
            ) : (
              <ul className="space-y-1">
                {waitingParticipants.map(p => (
                  <li key={p.id} className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2 text-sm">
                    <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <span className="text-black">{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex justify-center">
          <button onClick={handleStart} disabled={sending !== ''} className="rounded-lg bg-green-600 px-6 py-3 text-lg font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {sending === `/api/quizzes/${quiz.id}/start` ? 'Starting...' : 'Start Quiz'}
          </button>
        </div>
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700 text-center">{error}</p>}
        <Link href={`/quiz/${publicId}/manage`} className="text-center text-sm text-blue-600 hover:underline">Back to Manage</Link>
      </div>
    )
  }

  const q = liveState?.currentQuestion ?? 0
  const questionStatus = liveState?.status ?? 'CLOSED'
  const participants = liveState?.participants ?? []
  const buzzQueue = liveState?.buzzQueue ?? []
  const totalQ = quiz.totalQuestions
  const isFirstQuestion = q <= 1
  const isLastQuestion = q >= totalQ

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-6 p-8">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-800">&larr; Dashboard</Link>
        <Link href={`/quiz/${publicId}/manage`} className="hover:text-zinc-800">Settings</Link>
      </div>

      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">{quiz.name}</h1>
        <span className="inline-block rounded-full bg-green-100 px-4 py-1 text-sm font-semibold text-green-700">LIVE</span>
        {questionStatus === 'WAITING' && <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">Waiting</span>}
        <p className="text-lg font-semibold text-zinc-700">Question {q} / {totalQ}</p>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700 text-center">{error}</p>}

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={handlePrevious}
          disabled={sending !== '' || isFirstQuestion}
          className="rounded-xl border px-6 py-4 text-base font-semibold hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ◀ Previous
        </button>

        {questionStatus === 'WAITING' || questionStatus === 'CLOSED' ? (
          <button
            onClick={handleStart}
            disabled={sending !== ''}
            className="rounded-xl bg-green-600 px-8 py-4 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            🟢 Start Question
          </button>
        ) : (
          <button
            onClick={handleEndQuestion}
            disabled={sending !== ''}
            className="rounded-xl bg-red-600 px-8 py-4 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            🔴 End Question
          </button>
        )}

        <button
          onClick={handleNext}
          disabled={sending !== '' || isLastQuestion}
          className="rounded-xl border px-6 py-4 text-base font-semibold hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ▶ Next Question
        </button>
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleEndQuiz}
          disabled={sending !== ''}
          className="rounded-lg border border-red-300 px-6 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          🔴 End Quiz
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-zinc-800">Buzz Rankings</h2>
          {buzzQueue.length === 0 ? (
            <p className="text-sm text-black">No buzzes yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {buzzQueue.map((b) => {
                const medal = b.rank === 1 ? '\uD83E\uDD47' : b.rank === 2 ? '\uD83E\uDD48' : b.rank === 3 ? '\uD83E\uDD49' : null
                return (
                  <li key={b.participantId} className="flex items-center gap-3 rounded-md bg-zinc-50 px-4 py-2 text-sm">
                    {medal ? (
                      <span className="text-xl">{medal}</span>
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-300 text-xs font-bold text-black">{b.rank}</span>
                    )}
                    <span className="font-medium text-black">{b.participantName}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <div className="rounded-xl border p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-zinc-800">Participants <span className="text-sm font-normal text-zinc-500">({participants.length})</span></h2>
          {participants.length === 0 ? (
            <p className="text-sm text-black">No participants yet.</p>
          ) : (
            <ul className="space-y-1">
              {participants.map(p => (
                <li key={p.id} className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-black">{p.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
