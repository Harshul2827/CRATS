import { SESSION_COOKIE, sessionCookieOptions } from '@/server/auth/session'
import { json, route } from '@/server/lib/http'

export const POST = route(async (request: Request) => {
  const response = json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(request), maxAge: 0 })
  return response
})
