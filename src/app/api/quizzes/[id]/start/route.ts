import { requireAdmin } from '@/lib/admin'
import { getQuiz, updateQuiz, activateQuiz, atomicToggleQuestion } from '@/lib/kv'

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
      return Response.json({ error: 'Cannot start an archived quiz' }, { status: 409 })
    }

    if (quiz.status === 'DRAFT' || quiz.status === 'WAITING_ROOM') {
      const firstQuestion = 1
      await updateQuiz(id, {
        status: 'LIVE',
        lastPlayedAt: Date.now(),
      })
      await activateQuiz(id, firstQuestion, 'WAITING')

      return Response.json({ status: 'LIVE', currentQuestion: firstQuestion, totalQuestions: quiz.totalQuestions, questionStatus: 'WAITING' })
    }

    if (quiz.status === 'LIVE') {
      const result = await atomicToggleQuestion(id)
      if (result.error) {
        return Response.json({ error: result.error }, { status: 400 })
      }
      return Response.json({ currentQuestion: result.currentQuestion, status: 'OPEN', totalQuestions: quiz.totalQuestions })
    }

    return Response.json({ error: 'Quiz cannot be started' }, { status: 400 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Unhandled error in start:', e)
    return Response.json({ error: `Unexpected error: ${message}` }, { status: 500 })
  }
}
