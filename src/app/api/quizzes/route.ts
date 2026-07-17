import { isAdmin } from '@/lib/admin'
import { listQuizzes, createQuiz } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const quizzes = await listQuizzes()
  return Response.json(quizzes)
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const name = body.name?.trim()
  const totalQuestions = Number(body.totalQuestions)
  const description = body.description?.trim() || ''

  if (!name || name.length === 0) {
    return Response.json({ error: 'Quiz name is required' }, { status: 400 })
  }
  if (!Number.isInteger(totalQuestions) || totalQuestions < 1 || totalQuestions > 200) {
    return Response.json({ error: 'Total questions must be between 1 and 200' }, { status: 400 })
  }

  const quiz = await createQuiz({ name, description, totalQuestions })
  return Response.json(quiz, { status: 201 })
}
