'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ParticipantPage() {
  const router = useRouter()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

  const handleJoin = () => {
    const trimmed = link.trim()
    if (!trimmed) {
      setError('Please enter a quiz link')
      return
    }
    let publicId = trimmed
    const match = trimmed.match(/\/quiz\/([a-z0-9]+)$/)
    if (match) {
      publicId = match[1]
    }
    if (!/^[a-z0-9]{8}$/.test(publicId)) {
      setError('Invalid quiz link. Enter the full link or quiz code.')
      return
    }
    router.push(`/quiz/${publicId}`)
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6 rounded-xl border p-8 shadow-sm">
        <h1 className="text-center text-2xl font-bold">Join Quiz</h1>
        <p className="text-center text-sm text-zinc-500">
          Enter the quiz link shared by your organizer
        </p>
        {error && (
          <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
        <div className="space-y-2">
          <label htmlFor="link" className="text-sm font-medium">
            Quiz Link
          </label>
          <input
            id="link"
            type="text"
            value={link}
            onChange={(e) => { setLink(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="https://example.com/quiz/abc12345"
            className="w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <button
          onClick={handleJoin}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Join Quiz
        </button>
      </div>
    </div>
  )
}
