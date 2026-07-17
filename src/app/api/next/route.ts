import { getState, setState } from '@/lib/kv'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = await getState()

  if (state.status !== 'CLOSED') {
    return Response.json({ error: 'End the current question before proceeding to the next' }, { status: 400 })
  }

  state.currentQuestion++
  state.status = 'CLOSED'
  state.buzzQueue = []
  await setState(state)

  return Response.json({ currentQuestion: state.currentQuestion, status: state.status })
}
