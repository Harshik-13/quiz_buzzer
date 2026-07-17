import { getState, setState } from '@/lib/kv'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = await getState()

  if (state.status !== 'OPEN') {
    return Response.json({ error: 'Question is not open' }, { status: 400 })
  }

  state.status = 'CLOSED'
  await setState(state)

  return Response.json({ currentQuestion: state.currentQuestion, status: state.status })
}
