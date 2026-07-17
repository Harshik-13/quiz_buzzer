import { getState, setState, atomicBuzz } from '@/lib/kv'
import type { Buzz } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { participantId }: { participantId: string } = await request.json()

  if (!participantId || typeof participantId !== 'string') {
    return Response.json({ error: 'Invalid participantId' }, { status: 400 })
  }

  try {
    const result = await atomicBuzz(participantId)
    if ('error' in result) {
      return Response.json(result, { status: 400 })
    }
    return Response.json(result)
  } catch {
    // KV not available, fall back to read-modify-write
  }

  const state = await getState()

  if (state.status !== 'OPEN') {
    return Response.json({ error: 'Question is not open' }, { status: 400 })
  }

  const participant = state.participants.find((p) => p.id === participantId)
  if (!participant) {
    return Response.json({ error: 'Unknown participant' }, { status: 400 })
  }

  if (state.buzzQueue.find((b) => b.participantId === participantId)) {
    return Response.json({ error: 'Already buzzed' }, { status: 400 })
  }

  const buzz: Buzz = {
    participantId: participant.id,
    participantName: participant.name,
    serverTimestamp: Date.now(),
    rank: state.buzzQueue.length + 1,
  }

  state.buzzQueue.push(buzz)
  await setState(state)

  return Response.json(buzz)
}
