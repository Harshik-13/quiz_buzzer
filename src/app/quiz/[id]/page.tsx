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

export default function QuizDashboard() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [state, setState] = useState<{ currentQuestion: number; status: string; participants: { id: string; name: string }[]; buzzQueue: { participantId: string; participantName: string; rank: number }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState('')
  const secretRef = useRef(loadStoredSecret())

  const adminHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-secret': secretRef.current,
  }), [])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/quizzes/${id}`, { headers: adminHeaders() })
        if (res.status === 401) { router.push('/organizer'); return }
        if (!res.ok) { setError('Quiz not found'); return }
        setQuiz(await res.json())
      } catch { setError('Failed to load quiz') }
      finally { setLoading(false) }
    }
    load()
  }, [id, adminHeaders, router])

  useEffect(() => {
    if (!quiz || quiz.status !== 'RUNNING') return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch('/api/state')
        if (!cancelled && res.ok) setState(await res.json())
      } catch { /* ignore */ }
    }
    tick()
    const interval = setInterval(tick, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(interval) }
  }, [quiz?.status, quiz?.id])

  const callApi = useCallback(async (path: string) => {
    setError('')
    setSending(path)
    try {
      const res = await fetch(path, { method: 'POST', headers: adminHeaders() })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Request failed') }
      else {
        const data = await res.json()
        if (data.status === 'FINISHED') {
          const q = await (await fetch(`/api/quizzes/${id}`, { headers: adminHeaders() })).json()
          setQuiz(q)
          setState(null)
        }
      }
    } catch { setError('Network error') }
    finally { setSending('') }
  }, [id, adminHeaders])

  if (loading) return <div className="flex flex-1 items-center justify-center p-8"><p className="text-sm text-zinc-400">Loading...</p></div>
  if (!quiz) return <div className="flex flex-1 items-center justify-center p-8"><p className="text-sm text-red-600">{error || 'Quiz not found'}</p></div>

  const q = state?.currentQuestion ?? quiz.currentQuestion
  const questionStatus = state?.status ?? (quiz.status === 'RUNNING' ? quiz.questionStatus : 'CLOSED')
  const participants = state?.participants ?? quiz.participants
  const buzzQueue = state?.buzzQueue ?? quiz.buzzQueue
  const isLastQuestion = q >= quiz.totalQuestions

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-4 p-8">
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <Link href="/my-quizzes" className="hover:text-zinc-800">&larr; My Quizzes</Link>
      </div>

      <h1 className="text-2xl font-bold">{quiz.name}</h1>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {quiz.status === 'FINISHED' && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-6 text-center">
          <p className="text-lg font-bold text-purple-800">Quiz Finished</p>
          {quiz.statistics && (
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
              <div><span className="font-semibold">{quiz.statistics.totalParticipants}</span><p className="text-zinc-500">Participants</p></div>
              <div><span className="font-semibold">{quiz.statistics.totalQuestions}</span><p className="text-zinc-500">Questions</p></div>
              <div><span className="font-semibold">{quiz.statistics.winner}</span><p className="text-zinc-500">Winner</p></div>
            </div>
          )}
        </div>
      )}

      {quiz.status === 'DRAFT' && (
        <div className="rounded-xl border p-6 text-center">
          <p className="text-zinc-500">Ready to start when you are.</p>
          <button onClick={() => callApi(`/api/quizzes/${id}/start`)} disabled={sending !== ''} className="mt-4 rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">{sending === `/api/quizzes/${id}/start` ? 'Starting...' : 'Start Quiz'}</button>
        </div>
      )}

      {(quiz.status === 'RUNNING') && (
        <>
          <div className="rounded-xl border p-6 shadow-sm">
            <div className="mb-4 flex items-baseline justify-between">
              <div className="flex items-baseline gap-3">
                <span className="text-lg font-semibold">
                  Question {q > 0 ? `${q} of ${quiz.totalQuestions}` : '\u2014'}
                </span>
                {questionStatus === 'OPEN' ? (
                  <span className="rounded-full bg-green-100 px-3 py-0.5 text-sm font-medium text-green-700">Open</span>
                ) : (
                  <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-sm font-medium text-zinc-500">Closed</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {questionStatus === 'CLOSED' && (
                <button onClick={() => callApi(`/api/quizzes/${id}/start`)} disabled={sending !== ''} className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                  {sending === `/api/quizzes/${id}/start` ? 'Opening...' : 'Start'}
                </button>
              )}
              {questionStatus === 'OPEN' && (
                <button onClick={() => callApi(`/api/quizzes/${id}/end`)} disabled={sending !== ''} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                  {sending === `/api/quizzes/${id}/end` ? 'Ending...' : 'End'}
                </button>
              )}
              {questionStatus === 'CLOSED' && q > 0 && (
                <button onClick={() => callApi(`/api/quizzes/${id}/next`)} disabled={sending !== ''} className={`rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50 ${isLastQuestion ? 'bg-purple-600 text-white hover:bg-purple-700' : 'border hover:bg-zinc-50'}`}>
                  {sending === `/api/quizzes/${id}/next` ? 'Advancing...' : isLastQuestion ? 'Finish Quiz' : 'Next'}
                </button>
              )}
            </div>
          </div>

          {buzzQueue.length > 0 && (
            <div className="rounded-xl border p-6 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Buzz Ranking</h2>
              <ol className="space-y-1">
                {buzzQueue.map((b) => {
                  const medal = b.rank === 1 ? '\uD83E\uDD47' : b.rank === 2 ? '\uD83E\uDD48' : b.rank === 3 ? '\uD83E\uDD49' : null
                  return (
                    <li key={b.participantId} className="flex items-center gap-3 rounded-md bg-zinc-50 px-4 py-2 text-sm">
                      {medal ? <span className="text-lg">{medal}</span> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-300 text-xs font-bold text-zinc-700">{b.rank}</span>}
                      <span>{b.participantName}</span>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          <div className="rounded-xl border p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Participants <span className="text-sm font-normal text-zinc-400">({participants.length})</span></h2>
            {participants.length === 0 ? <p className="text-sm text-zinc-400">No participants yet.</p> : (
              <ul className="space-y-1">
                {participants.map((p) => (
                  <li key={p.id} className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-black">{p.name}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {quiz.status === 'ARCHIVED' && (
        <div className="rounded-xl border p-6 text-center">
          <p className="text-zinc-500">This quiz is archived.</p>
        </div>
      )}
    </div>
  )
}
