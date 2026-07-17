import { getState, setState } from '@/lib/kv'
import type { Participant } from '@/lib/types'
import { v4 as uuid } from 'uuid'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = (body as Record<string, unknown>).name
  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }

  const trimmed = name.trim()
  if (trimmed.length === 0) {
    return Response.json({ error: 'Name cannot be empty' }, { status: 400 })
  }
  if (trimmed.length > 50) {
    return Response.json({ error: 'Name is too long' }, { status: 400 })
  }

  const state = await getState()
  const participant: Participant = {
    id: uuid(),
    name: trimmed,
  }
  state.participants.push(participant)
  await setState(state)

  return Response.json({ id: participant.id, name: participant.name })
}
