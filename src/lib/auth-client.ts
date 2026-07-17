'use client'

export const SECRET_KEY = 'admin_secret'

export function loadStoredSecret(): string {
  if (typeof window === 'undefined') return ''
  try { return sessionStorage.getItem(SECRET_KEY) || '' } catch { return '' }
}

export function adminHeaders(secret: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-admin-secret': secret }
}
