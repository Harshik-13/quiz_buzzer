import { isAdmin } from '@/lib/admin'
import { getQuiz, updateQuiz, deleteQuiz } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const quiz = await getQuiz(id)
  if (!quiz) return Response.json({ error: 'Quiz not found' }, { status: 404 })
  return Response.json(quiz)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return Response.json({ error: 'Quiz name cannot be empty' }, { status: 400 })
    updates.name = name
  }
  if (body.description !== undefined) {
    updates.description = String(body.description).trim()
  }
  if (body.totalQuestions !== undefined) {
    const tq = Number(body.totalQuestions)
    if (!Number.isInteger(tq) || tq < 1 || tq > 200) {
      return Response.json({ error: 'Total questions must be between 1 and 200' }, { status: 400 })
    }
    updates.totalQuestions = tq
  }

  const quiz = await updateQuiz(id, updates)
  if (!quiz) return Response.json({ error: 'Quiz not found' }, { status: 404 })
  return Response.json(quiz)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await deleteQuiz(id)
  return Response.json({ ok: true })
}
