import { requireAdmin } from '@/lib/admin'
import { getQuiz, updateQuiz, getQuizState, atomicEndQuiz } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let organizerId: string
  try {
    organizerId = requireAdmin(request)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const quiz = await getQuiz(id)
    if (!quiz) return Response.json({ error: 'Quiz not found' }, { status: 404 })
    if (quiz.organizerId !== organizerId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    if (quiz.status === 'FINISHED') {
      return Response.json({ error: 'Quiz is already finished' }, { status: 409 })
    }
    if (quiz.status === 'ARCHIVED') {
      return Response.json({ error: 'Cannot end an archived quiz' }, { status: 409 })
    }
    if (quiz.status !== 'RUNNING') {
      return Response.json({ error: 'Quiz is not running' }, { status: 400 })
    }

    const result = await atomicEndQuiz(id)
    if (result.error) {
      return Response.json({ error: result.error }, { status: 409 })
    }

    const state = await getQuizState(id)

    await updateQuiz(id, {
      status: 'FINISHED',
      statistics: {
        totalParticipants: result.totalParticipants ?? 0,
        totalQuestions: quiz.totalQuestions,
        winner: result.winner || '',
        completionTime: Date.now() - (quiz.lastPlayedAt || Date.now()),
        fastestBuzz: 0,
      },
    })

    return Response.json({
      status: 'FINISHED',
      currentQuestion: state?.currentQuestion ?? 0,
      totalQuestions: quiz.totalQuestions,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Unhandled error in end-quiz:', e)
    return Response.json({ error: `Unexpected error: ${message}` }, { status: 500 })
  }
}
