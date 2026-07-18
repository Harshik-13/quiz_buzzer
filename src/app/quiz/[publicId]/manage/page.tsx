'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Quiz, LiveState } from '@/lib/types'
import { loadStoredSecret, SECRET_KEY, adminHeaders as makeHeaders } from '@/lib/auth-client'
import Link from 'next/link'

const POLL_INTERVAL = 300

export default function QuizManagePage() {
  const { publicId } = useParams<{ publicId: string }>()
  const router = useRouter()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [state, setState] = useState<LiveState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [copied, setCopied] = useState(false)
  const secretRef = useRef(loadStoredSecret())

  const adminHeaders = useCallback(() => makeHeaders(secretRef.current), [])

  useEffect(() => {
    const stored = loadStoredSecret()
    if (!stored) { router.replace('/organizer'); return }
    setShareLink(`${window.location.origin}/quiz/${publicId}`)
  }, [publicId, router])

  useEffect(() => {
    const load = async () => {
      try {
        const listRes = await fetch('/api/quizzes', { headers: adminHeaders() })
        if (listRes.status === 401) { router.replace('/organizer'); return }
        const quizzes: Quiz[] = await listRes.json()
        const found = quizzes.find(q => q.publicId === publicId)
        if (!found) { setError('Quiz not found'); return }
        setQuiz(found)

        const res = await fetch(`/api/quizzes/${found.id}`, { headers: adminHeaders() })
        if (!res.ok) { setError('Quiz not found'); return }
        setQuiz(await res.json())
      } catch { setError('Failed to load quiz') }
      finally { setLoading(false) }
    }
    load()
  }, [publicId, adminHeaders, router])

  useEffect(() => {
    if (!quiz || quiz.status !== 'RUNNING') return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/quiz/${publicId}/state`)
        if (!cancelled && res.ok) setState(await res.json())
      } catch { /* ignore */ }
    }
    tick()
    const interval = setInterval(tick, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(interval) }
  }, [quiz?.status, quiz?.id, publicId])

  const callApi = useCallback(async (path: string) => {
    setError('')
    setSending(path)
    try {
      const res = await fetch(path, { method: 'POST', headers: adminHeaders() })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Request failed') }
      else {
        const data = await res.json()
        if (data.status === 'RUNNING') {
          router.push(`/quiz/${publicId}/live`)
          return
        }
        if (data.status === 'FINISHED') {
          const listRes = await fetch('/api/quizzes', { headers: adminHeaders() })
          if (listRes.ok) {
            const quizzes: Quiz[] = await listRes.json()
            const found = quizzes.find(q => q.publicId === publicId)
            if (found) setQuiz(found)
          }
          setState(null)
        }
      }
    } catch { setError('Network error') }
    finally { setSending('') }
  }, [publicId, adminHeaders, router])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { setError('Failed to copy') }
  }

  if (loading) return <div className="flex flex-1 items-center justify-center p-8"><p className="text-sm text-zinc-400">Loading...</p></div>
  if (!quiz) return <div className="flex flex-1 items-center justify-center p-8"><p className="text-sm text-red-600">{error || 'Quiz not found'}</p></div>

  const q = state?.currentQuestion ?? 0
  const questionStatus = state?.status ?? 'CLOSED'
  const participants = state?.participants ?? []
  const buzzQueue = state?.buzzQueue ?? []
  const isLastQuestion = q >= quiz.totalQuestions

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col space-y-4 p-8">
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-800">&larr; Dashboard</Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{quiz.name}</h1>
      </div>

      {(quiz.status === 'PUBLISHED' || quiz.status === 'RUNNING') && (
        <div className="flex items-center gap-2 rounded-lg border bg-zinc-50 px-4 py-2">
          <span className="text-sm text-zinc-500 truncate flex-1">{shareLink}</span>
          <button onClick={copyLink} className="text-sm font-medium text-blue-600 hover:text-blue-700 shrink-0">
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}

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
        <div className="rounded-xl border p-6 text-center space-y-4">
          <p className="text-zinc-500">This quiz is in draft mode.</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => callApi(`/api/quizzes/${quiz.id}/start`)} disabled={sending !== ''} className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {sending === `/api/quizzes/${quiz.id}/start` ? 'Starting...' : 'Start Quiz'}
            </button>
          </div>
        </div>
      )}

      {quiz.status === 'PUBLISHED' && (
        <div className="rounded-xl border p-6 text-center space-y-4">
          <p className="text-zinc-500">Quiz is published. Share the link with participants.</p>
          <p className="text-sm text-zinc-400">{participants.length} participant{participants.length !== 1 ? 's' : ''} joined</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => callApi(`/api/quizzes/${quiz.id}/start`)} disabled={sending !== ''} className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {sending === `/api/quizzes/${quiz.id}/start` ? 'Starting...' : 'Start Quiz'}
            </button>
          </div>
        </div>
      )}

      {(quiz.status === 'RUNNING') && (
        <div className="rounded-xl border p-8 text-center space-y-4">
          <p className="text-lg font-semibold text-green-700">Quiz is Live</p>
          <p className="text-sm text-zinc-500">Question {q} of {quiz.totalQuestions} · {participants.length} participant{participants.length !== 1 ? 's' : ''}</p>
          <Link href={`/quiz/${publicId}/live`} className="inline-block rounded-lg bg-green-600 px-6 py-3 text-base font-semibold text-white hover:bg-green-700">
            Open Live Control Panel
          </Link>
        </div>
      )}

      {quiz.status === 'ARCHIVED' && (
        <div className="rounded-xl border p-6 text-center">
          <p className="text-zinc-500">This quiz is archived.</p>
        </div>
      )}
    </div>
  )
}
