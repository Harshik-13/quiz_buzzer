export async function POST(request: Request) {
  const { secret } = await request.json()

  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || secret !== adminSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return Response.json({ ok: true })
}
