import { requireAdmin } from '@/lib/admin'
import { getQuiz, updateQuiz, deleteQuiz } from '@/lib/kv'

export const dynamic = 'force-dynamic'

async function withErrorHandling<T>(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Unhandled error:', e)
    return Response.json({ error: `Unexpected error: ${message}` }, { status: 500 })
  }
}

function getOrganizerFromRequest(request: Request): string {
  try {
    return requireAdmin(request)
  } catch {
    throw new Error('Unauthorized')
  }
}

function unauthorizedResponse(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

function notFoundResponse(): Response {
  return Response.json({ error: 'Quiz not found' }, { status: 404 })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let organizerId: string
  try {
    organizerId = requireAdmin(request)
  } catch {
    return unauthorizedResponse()
  }

  return withErrorHandling(async () => {
    const { id } = await params
    const quiz = await getQuiz(id)
    if (!quiz) return notFoundResponse()
    if (quiz.organizerId !== organizerId) return unauthorizedResponse()
    return Response.json(quiz)
  })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let organizerId: string
  try {
    organizerId = requireAdmin(request)
  } catch {
    return unauthorizedResponse()
  }

  return withErrorHandling(async () => {
    const { id } = await params
    const quiz = await getQuiz(id)
    if (!quiz) return notFoundResponse()
    if (quiz.organizerId !== organizerId) return unauthorizedResponse()

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
    if (body.status !== undefined) {
      updates.status = body.status
    }

    const updated = await updateQuiz(id, updates)
    return Response.json(updated)
  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let organizerId: string
  try {
    organizerId = requireAdmin(request)
  } catch {
    return unauthorizedResponse()
  }

  return withErrorHandling(async () => {
    const { id } = await params
    const quiz = await getQuiz(id)
    if (!quiz) return notFoundResponse()
    if (quiz.organizerId !== organizerId) return unauthorizedResponse()

    await deleteQuiz(id)
    return Response.json({ ok: true })
  })
}
