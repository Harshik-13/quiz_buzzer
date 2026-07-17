export function isAdmin(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  const header = request.headers.get('x-admin-secret')
  return header === secret
}
