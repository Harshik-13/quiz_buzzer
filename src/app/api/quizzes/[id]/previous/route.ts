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
  if (!state) {
    return Response.json({ error: 'No game state' }, { status: 400 })
  }

  const prevQuestion = state.currentQuestion - 1
  if (prevQuestion < 1) {
    return Response.json({ error: 'Already at the first question' }, { status: 400 })
  }

  state.currentQuestion = prevQuestion
  state.status = 'CLOSED'
  state.buzzQueue = []
  await setQuizState(id, state)
  await updateQuiz(id, {
    currentQuestion: prevQuestion,
    questionStatus: 'CLOSED',
    buzzQueue: [],
  })

  return Response.json({
    currentQuestion: prevQuestion,
    totalQuestions: quiz.totalQuestions,
    status: 'CLOSED',
  })
}
