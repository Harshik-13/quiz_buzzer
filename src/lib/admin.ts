let cachedOrganizerId: string | null = null

export function getOrganizerId(): string {
  if (cachedOrganizerId) return cachedOrganizerId
  const secret = process.env.ADMIN_SECRET
  if (!secret) throw new Error('ADMIN_SECRET not configured')
  let hash = 0
  for (let i = 0; i < secret.length; i++) {
    const char = secret.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  cachedOrganizerId = 'org_' + Math.abs(hash).toString(36)
  return cachedOrganizerId
}

export function isAdmin(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  const header = request.headers.get('x-admin-secret')
  return header === secret
}

export function requireAdmin(request: Request): string {
  if (!isAdmin(request)) {
    throw new Error('Unauthorized')
  }
  return getOrganizerId()
}
