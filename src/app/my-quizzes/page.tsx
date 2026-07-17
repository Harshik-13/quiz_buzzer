'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Quiz } from '@/lib/types'

const SECRET_KEY = 'admin_secret'

function loadStoredSecret(): string {
  if (typeof window === 'undefined') return ''
  try { return sessionStorage.getItem(SECRET_KEY) || '' } catch { return '' }
}

export default function MyQuizzesPage() {
  const router = useRouter()
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createQuestions, setCreateQuestions] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const secretRef = useRef(loadStoredSecret())

  const adminHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-secret': secretRef.current,
  }), [])

  const loadQuizzes = useCallback(async () => {
    try {
      const res = await fetch('/api/quizzes', { headers: adminHeaders() })
      if (res.status === 401) { router.push('/organizer'); return }
      if (res.ok) setQuizzes(await res.json())
    } catch { setError('Failed to load quizzes') }
    finally { setLoading(false) }
  }, [adminHeaders, router])

  useEffect(() => { loadQuizzes() }, [loadQuizzes])

  const handleCreate = async () => {
    const name = createName.trim()
    const tq = Number(createQuestions)
    if (!name) { setError('Enter a quiz name'); return }
    if (!Number.isInteger(tq) || tq < 1) { setError('Questions must be at least 1'); return }
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ name, totalQuestions: tq, description: createDesc.trim() }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to create'); return }
      setShowCreate(false)
      setCreateName('')
      setCreateQuestions('')
      setCreateDesc('')
      await loadQuizzes()
    } catch { setError('Network error') }
    finally { setCreating(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/quizzes/${id}`, { method: 'DELETE', headers: adminHeaders() })
      if (res.ok) { setDeleteConfirm(null); await loadQuizzes() }
      else setError('Failed to delete')
    } catch { setError('Network error') }
  }

  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/quizzes/${id}/duplicate`, { method: 'POST', headers: adminHeaders() })
      if (res.ok) await loadQuizzes()
      else setError('Failed to duplicate')
    } catch { setError('Network error') }
  }

  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/quizzes/${id}/archive`, { method: 'POST', headers: adminHeaders() })
      if (res.ok) await loadQuizzes()
      else { const d = await res.json(); setError(d.error || 'Failed to archive') }
    } catch { setError('Network error') }
  }

  const statusBadge = (q: Quiz) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-zinc-100 text-zinc-600',
      READY: 'bg-blue-100 text-blue-700',
      RUNNING: 'bg-green-100 text-green-700',
      FINISHED: 'bg-purple-100 text-purple-700',
      ARCHIVED: 'bg-amber-100 text-amber-700',
    }
    return <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${colors[q.status] || 'bg-zinc-100 text-zinc-500'}`}>{q.status}</span>
  }

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Quizzes</h1>
        <button onClick={() => setShowCreate(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">+ Create Quiz</button>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {showCreate && (
        <div className="rounded-xl border p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold">Create New Quiz</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Quiz Name</label>
              <input value={createName} onChange={e => setCreateName(e.target.value)} className="w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter quiz name" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium">Total Questions</label>
              <input type="number" min="1" max="200" value={createQuestions} onChange={e => setCreateQuestions(e.target.value)} className="w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="20" />
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <input value={createDesc} onChange={e => setCreateDesc(e.target.value)} className="w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Brief description" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleCreate} disabled={creating} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">{creating ? 'Creating...' : 'Create'}</button>
            <button onClick={() => { setShowCreate(false); setError('') }} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-zinc-50">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Loading quizzes...</p>
      ) : quizzes.length === 0 ? (
        <div className="rounded-xl border p-12 text-center">
          <p className="text-zinc-400">No quizzes yet. Create your first quiz!</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {quizzes.map(q => (
            <div key={q.id} className="rounded-xl border p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{q.name}</h3>
                  <p className="text-xs text-zinc-400">{q.totalQuestions} questions</p>
                </div>
                {statusBadge(q)}
              </div>
              {q.description && <p className="text-sm text-zinc-500 line-clamp-2">{q.description}</p>}
              <div className="flex flex-wrap gap-1.5 text-xs text-zinc-400">
                <span>Created {formatDate(q.createdAt)}</span>
                {q.lastPlayedAt && <span>· Last played {formatDate(q.lastPlayedAt)}</span>}
                <span>· {q.participants.length} participants</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {q.status === 'RUNNING' ? (
                  <button onClick={() => router.push(`/quiz/${q.id}`)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">Open</button>
                ) : q.status === 'FINISHED' || q.status === 'ARCHIVED' ? (
                  <button onClick={() => router.push(`/quiz/${q.id}`)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50">View</button>
                ) : (
                  <button onClick={() => router.push(`/quiz/${q.id}`)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Open</button>
                )}
                {(q.status === 'DRAFT' || q.status === 'READY') && (
                  <button onClick={() => router.push(`/quiz/${q.id}`)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50">Edit</button>
                )}
                {q.status !== 'RUNNING' && (
                  <button onClick={() => handleDuplicate(q.id)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50">Duplicate</button>
                )}
                {q.status !== 'ARCHIVED' && q.status !== 'RUNNING' && (
                  <button onClick={() => handleArchive(q.id)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50">Archive</button>
                )}
                {q.status === 'ARCHIVED' && (
                  <button onClick={async () => {
                    await fetch(`/api/quizzes/${q.id}`, { method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ status: 'DRAFT' }) });
                    await loadQuizzes();
                  }} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50">Restore</button>
                )}
                {deleteConfirm === q.id ? (
                  <div className="flex gap-1">
                    <button onClick={() => handleDelete(q.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Confirm</button>
                    <button onClick={() => setDeleteConfirm(null)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirm(q.id)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
