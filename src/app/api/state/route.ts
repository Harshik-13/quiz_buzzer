import { getState } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function GET() {
  const state = await getState()
  return new Response(JSON.stringify(state), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
