import { isAdmin } from '@/lib/admin'
import { getQuiz, updateQuiz, getState, setState, syncQuizFromState } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const quiz = await getQuiz(id)
  if (!quiz) return Response.json({ error: 'Quiz not found' }, { status: 404 })
  if (quiz.status !== 'RUNNING') {
    return Response.json({ error: 'Quiz is not running' }, { status: 400 })
  }

  const state = await getState()
  if (state.status !== 'OPEN') {
    return Response.json({ error: 'Question is not open' }, { status: 400 })
  }

  state.status = 'CLOSED'
  await setState(state)
  await updateQuiz(id, { questionStatus: 'CLOSED', currentQuestion: state.currentQuestion })
  await syncQuizFromState()

  return Response.json({ currentQuestion: state.currentQuestion, status: 'CLOSED' })
}
