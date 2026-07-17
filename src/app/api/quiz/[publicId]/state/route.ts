import { getQuizByPublicId, getQuizState } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }) {
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
}
