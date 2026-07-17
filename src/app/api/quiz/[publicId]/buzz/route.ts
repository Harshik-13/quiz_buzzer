import { getQuizByPublicId, atomicBuzzForQuiz } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params
  const quiz = await getQuizByPublicId(publicId)
  if (!quiz) {
    return Response.json({ error: 'Quiz not found' }, { status: 404 })
  }

  const { participantId }: { participantId: string } = await request.json()
  if (!participantId || typeof participantId !== 'string') {
    return Response.json({ error: 'Invalid participantId' }, { status: 400 })
  }

  try {
    const result = await atomicBuzzForQuiz(quiz.id, participantId)
    if ('error' in result) {
      return Response.json(result, { status: 400 })
    }
    return Response.json(result)
  } catch {
    return Response.json({ error: 'Buzz failed' }, { status: 500 })
  }
}
