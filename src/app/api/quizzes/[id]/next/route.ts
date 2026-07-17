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
  if (!state || state.status !== 'CLOSED') {
    return Response.json({ error: 'End the current question first' }, { status: 400 })
  }

  const nextQuestion = state.currentQuestion + 1

  if (nextQuestion > quiz.totalQuestions) {
    state.status = 'CLOSED'
    await setQuizState(id, state)
    await updateQuiz(id, {
      status: 'FINISHED',
      questionStatus: 'CLOSED',
      currentQuestion: state.currentQuestion,
      statistics: {
        totalParticipants: state.participants.length,
        totalQuestions: quiz.totalQuestions,
        winner: state.buzzQueue[0]?.participantName || '',
        completionTime: Date.now() - (quiz.lastPlayedAt || Date.now()),
        fastestBuzz: 0,
      },
    })
    return Response.json({ status: 'FINISHED', currentQuestion: state.currentQuestion, totalQuestions: quiz.totalQuestions })
  }

  state.currentQuestion = nextQuestion
  state.status = 'CLOSED'
  state.buzzQueue = []
  await setQuizState(id, state)
  await updateQuiz(id, {
    currentQuestion: nextQuestion,
    questionStatus: 'CLOSED',
    buzzQueue: [],
  })

  const isLast = nextQuestion >= quiz.totalQuestions
  return Response.json({
    currentQuestion: nextQuestion,
    totalQuestions: quiz.totalQuestions,
    status: 'CLOSED',
    isLastQuestion: isLast,
  })
}
