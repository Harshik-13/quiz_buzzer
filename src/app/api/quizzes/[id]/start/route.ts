import { isAdmin } from '@/lib/admin'
import { getQuiz, updateQuiz, activateQuiz, getState, setState } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const quiz = await getQuiz(id)
  if (!quiz) return Response.json({ error: 'Quiz not found' }, { status: 404 })
  if (quiz.status === 'FINISHED') {
    return Response.json({ error: 'Quiz is already finished' }, { status: 400 })
  }
  if (quiz.status === 'ARCHIVED') {
    return Response.json({ error: 'Cannot start an archived quiz' }, { status: 400 })
  }

  if (quiz.status === 'DRAFT' || quiz.status === 'READY') {
    const firstQuestion = 1
    await setState({
      currentQuestion: firstQuestion,
      totalQuestions: quiz.totalQuestions,
      status: 'OPEN',
      participants: [],
      buzzQueue: [],
    })
    await updateQuiz(id, {
      status: 'RUNNING',
      currentQuestion: firstQuestion,
      questionStatus: 'OPEN',
      participants: [],
      buzzQueue: [],
      lastPlayedAt: Date.now(),
    })
    await activateQuiz(id)

    return Response.json({ status: 'RUNNING', currentQuestion: firstQuestion, totalQuestions: quiz.totalQuestions, questionStatus: 'OPEN' })
  }

  const state = await getState()
  if (state.status !== 'CLOSED') {
    return Response.json({ error: 'Question is already open' }, { status: 400 })
  }

  state.status = 'OPEN'
  state.buzzQueue = []
  await setState(state)
  await updateQuiz(id, { questionStatus: 'OPEN', buzzQueue: [] })

  return Response.json({ currentQuestion: state.currentQuestion, status: 'OPEN', totalQuestions: quiz.totalQuestions })
}
