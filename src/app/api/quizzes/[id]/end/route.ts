import { requireAdmin } from '@/lib/admin'
import { getQuiz, updateQuiz, getQuizState, setQuizState } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let organizerId: string
  try {
    organizerId = requireAdmin(request)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const quiz = await getQuiz(id)
  if (!quiz) return Response.json({ error: 'Quiz not found' }, { status: 404 })
  if (quiz.organizerId !== organizerId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (quiz.status !== 'RUNNING') {
    return Response.json({ error: 'Quiz is not running' }, { status: 400 })
  }

  const state = await getQuizState(id)
  if (!state || state.status !== 'OPEN') {
    return Response.json({ error: 'Question is not open' }, { status: 400 })
  }

  state.status = 'CLOSED'
  await setQuizState(id, state)
  await updateQuiz(id, { questionStatus: 'CLOSED', currentQuestion: state.currentQuestion })

  return Response.json({ currentQuestion: state.currentQuestion, status: 'CLOSED' })
}
