import { z } from 'zod'
import { getDb } from '@/server/db/client'
import { authenticate } from '@/server/auth/login'
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/server/auth/session'
import { json, parseBody, route } from '@/server/lib/http'
import { describeUser } from '@/server/services/users'

const loginSchema = z.object({
  email: z.email({ error: 'Enter a valid email address' }),
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password'),
})

export const POST = route(async (request: Request) => {
  const { email, password } = await parseBody(request, loginSchema)
  const db = getDb()
  const user = authenticate(db, email, password)
  const response = json(describeUser(db, user))
  response.cookies.set(SESSION_COOKIE, await signSession({ userId: user.id, role: user.role }), sessionCookieOptions(request))
  return response
})
