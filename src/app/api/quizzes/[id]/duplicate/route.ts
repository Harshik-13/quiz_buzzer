import { isAdmin } from '@/lib/admin'
import { duplicateQuiz } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const quiz = await duplicateQuiz(id)
  if (!quiz) return Response.json({ error: 'Quiz not found' }, { status: 404 })
  return Response.json(quiz, { status: 201 })
}
