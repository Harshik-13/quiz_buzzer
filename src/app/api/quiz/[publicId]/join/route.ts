import { getQuizByPublicId, getQuizState, setQuizState, updateQuiz } from '@/lib/kv'
import type { Participant } from '@/lib/types'
import { v4 as uuid } from 'uuid'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params
  const quiz = await getQuizByPublicId(publicId)
  if (!quiz) {
    return Response.json({ error: 'Quiz not found' }, { status: 404 })
  }
  if (quiz.status !== 'PUBLISHED' && quiz.status !== 'RUNNING') {
    return Response.json({ error: 'This quiz is not accepting participants' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = (body as Record<string, unknown>).name
  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }

  const trimmed = name.trim()
  if (trimmed.length === 0) {
    return Response.json({ error: 'Name cannot be empty' }, { status: 400 })
  }
  if (trimmed.length > 50) {
    return Response.json({ error: 'Name is too long' }, { status: 400 })
  }

  const state = await getQuizState(quiz.id) || {
    currentQuestion: 0,
    totalQuestions: quiz.totalQuestions,
    status: 'CLOSED' as const,
    participants: [],
    buzzQueue: [],
  }

  const participant: Participant = {
    id: uuid(),
    name: trimmed,
  }
  state.participants.push(participant)
  await setQuizState(quiz.id, state)
  await updateQuiz(quiz.id, { participants: state.participants })

  return Response.json({ id: participant.id, name: participant.name })
}
