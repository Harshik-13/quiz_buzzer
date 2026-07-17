import { getQuizByPublicId } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params
  const quiz = await getQuizByPublicId(publicId)
  if (!quiz) {
    return Response.json({ error: 'Quiz not found' }, { status: 404 })
  }
  if (quiz.status === 'ARCHIVED') {
    return Response.json({ error: 'This quiz is no longer available' }, { status: 410 })
  }
  return Response.json({
    publicId: quiz.publicId,
    name: quiz.name,
    description: quiz.description,
    totalQuestions: quiz.totalQuestions,
    status: quiz.status,
    participantCount: quiz.participants.length,
  })
}
