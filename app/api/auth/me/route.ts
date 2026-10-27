import { getDb } from '@/server/db/client'
import { getSessionUser } from '@/server/auth/guard'
import { json, route } from '@/server/lib/http'
import { isDemoMode } from '@/server/lib/env'
import { describeUser } from '@/server/services/users'

// Signed out is a normal answer here (200 with user: null) so the browser console stays free of 401 noise on first load.
// Every other endpoint answers 401 without a session.
export const GET = route(async (request: Request) => {
  const db = getDb()
  const user = await getSessionUser(request, db)
  if (!user) return json({ user: null, student: null, company: null, home: '/dashboard', demo_mode: isDemoMode() })
  return json(describeUser(db, user))
})
