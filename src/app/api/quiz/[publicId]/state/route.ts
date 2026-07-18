import { getQuizByPublicId, getQuizState } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await params
    const quiz = await getQuizByPublicId(publicId)
    if (!quiz) {
      return Response.json({ error: 'Quiz not found' }, { status: 404 })
    }

    const state = await getQuizState(quiz.id)
    if (!state) {
      return Response.json({
        currentQuestion: 0,
        totalQuestions: quiz.totalQuestions,
        status: 'CLOSED',
        participants: [],
        buzzQueue: [],
      })
    }

    return Response.json(state, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Unhandled error in quiz state:', e)
    return Response.json({ error: `Unexpected error: ${message}` }, { status: 500 })
  }
}
