export async function POST(request: Request) {
  try {
    const body = await request.json()
    const secret = body?.secret

    const adminSecret = process.env.ADMIN_SECRET
    if (!adminSecret || secret !== adminSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return Response.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Unhandled error in auth:', e)
    return Response.json({ error: `Unexpected error: ${message}` }, { status: 500 })
  }
}
