'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Quiz } from '@/lib/types'
import Link from 'next/link'

const POLL_INTERVAL = 300
const SECRET_KEY = 'admin_secret'

function loadStoredSecret(): string {
  if (typeof window === 'undefined') return ''
  try { return sessionStorage.getItem(SECRET_KEY) || '' } catch { return '' }
}

export default function LiveQuizPage() {
  const { publicId } = useParams<{ publicId: string }>()
  const router = useRouter()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [liveState, setLiveState] = useState<{ currentQuestion: number; status: string; participants: { id: string; name: string }[]; buzzQueue: { participantId: string; participantName: string; rank: number }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState('')
  const [finished, setFinished] = useState(false)
  const secretRef = useRef(loadStoredSecret())

  const adminHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-secret': secretRef.current,
  }), [])

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

  useEffect(() => {
    if (!quiz || quiz.status === 'FINISHED') return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/quiz/${publicId}/state`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          if (!cancelled) setLiveState(data)
        }
      } catch { /* ignore */ }
    }
    tick()
    const interval = setInterval(tick, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(interval) }
  }, [quiz?.status, quiz?.id, publicId])

  useEffect(() => {
    if (!quiz) return
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
  }, [quiz?.id, publicId, adminHeaders])

  const callApi = useCallback(async (path: string, onSuccess?: () => void) => {
    setError('')
    setSending(path)
    try {
      const res = await fetch(path, { method: 'POST', headers: adminHeaders() })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Request failed') }
      else {
        if (onSuccess) onSuccess()
      }
    } catch { setError('Network error') }
    finally { setSending('') }
  }, [adminHeaders])

  const handleStartQuestion = () => {
    if (!quiz) return
    const path = `/api/quizzes/${quiz.id}/start`
    callApi(path)
  }

  const handleEndQuestion = () => {
    if (!quiz) return
    const path = `/api/quizzes/${quiz.id}/end`
    callApi(path)
  }

  const handleNext = () => {
    if (!quiz) return
    const path = `/api/quizzes/${quiz.id}/next`
    callApi(path)
  }

  const handlePrevious = () => {
    if (!quiz) return
    const path = `/api/quizzes/${quiz.id}/previous`
    callApi(path)
  }

  const handleEndQuiz = () => {
    if (!quiz) return
    const path = `/api/quizzes/${quiz.id}/end-quiz`
    callApi(path, () => setFinished(true))
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

  if (!quiz || (quiz.status !== 'RUNNING' && quiz.status !== 'PUBLISHED' && quiz.status !== 'DRAFT')) {
    return <div className="flex flex-1 items-center justify-center p-8"><p className="text-sm text-red-600">{error || 'Quiz not available'}</p></div>
  }

  if (quiz.status !== 'RUNNING') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center p-8 text-center space-y-6">
        <h1 className="text-3xl font-bold">{quiz.name}</h1>
        <p className="text-zinc-500">Quiz is not running yet.</p>
        <button onClick={handleStartQuestion} disabled={sending !== ''} className="rounded-lg bg-green-600 px-6 py-3 text-lg font-semibold text-white hover:bg-green-700 disabled:opacity-50">
          {sending === `/api/quizzes/${quiz.id}/start` ? 'Starting...' : 'Start Quiz'}
        </button>
        <Link href={`/quiz/${publicId}/manage`} className="text-sm text-blue-600 hover:underline">Back to Manage</Link>
      </div>
    )
  }

  const q = liveState?.currentQuestion ?? quiz.currentQuestion
  const questionStatus = liveState?.status ?? quiz.questionStatus
  const participants = liveState?.participants ?? quiz.participants
  const buzzQueue = liveState?.buzzQueue ?? quiz.buzzQueue
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

        {questionStatus === 'CLOSED' ? (
          <button
            onClick={handleStartQuestion}
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
          <h2 className="mb-3 text-base font-semibold text-white">Buzz Rankings</h2>
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
          <h2 className="mb-3 text-base font-semibold text-white">Participants <span className="text-sm font-normal text-white">({participants.length})</span></h2>
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
