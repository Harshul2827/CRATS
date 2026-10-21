import { SESSION_COOKIE, sessionCookieOptions } from '@/server/auth/session'
import { json, route } from '@/server/lib/http'

export const POST = route(async () => {
  const response = json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 })
  return response
})
