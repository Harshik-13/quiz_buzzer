import { requireAdmin } from '@/lib/admin'
import { getQuiz, updateQuiz } from '@/lib/kv'

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
    if (quiz.status === 'RUNNING') {
      return Response.json({ error: 'Cannot archive a running quiz' }, { status: 409 })
    }
    if (quiz.status === 'ARCHIVED') {
      return Response.json({ error: 'Quiz is already archived' }, { status: 409 })
    }

    const updated = await updateQuiz(id, {
      status: 'ARCHIVED',
      questionStatus: 'CLOSED',
    })
    return Response.json(updated)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Unhandled error in archive:', e)
    return Response.json({ error: `Unexpected error: ${message}` }, { status: 500 })
  }
}
