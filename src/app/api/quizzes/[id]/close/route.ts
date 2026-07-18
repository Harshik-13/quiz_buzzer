import { requireAdmin } from '@/lib/admin'
import { getQuiz, updateQuiz, atomicCloseQuestion } from '@/lib/kv'

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
    if (quiz.status !== 'RUNNING') {
      return Response.json({ error: 'Quiz is not running' }, { status: 400 })
    }

    const result = await atomicCloseQuestion(id)
    if (result.error) {
      return Response.json({ error: result.error }, { status: 400 })
    }

    await updateQuiz(id, { questionStatus: 'CLOSED' })

    return Response.json({
      currentQuestion: result.currentQuestion,
      status: 'CLOSED',
      totalQuestions: quiz.totalQuestions,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Unhandled error in close:', e)
    return Response.json({ error: `Unexpected error: ${message}` }, { status: 500 })
  }
}
