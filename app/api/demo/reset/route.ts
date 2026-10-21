import { getDb } from '@/server/db/client'
import { getSessionUser } from '@/server/auth/guard'
import { json, route, unauthorized } from '@/server/lib/http'
import { requireDemoMode, resetDemoData } from '@/server/services/users'

// Demo only: drops every table and loads the seed again.
export const POST = route(async (request: Request) => {
  requireDemoMode()
  const db = getDb()
  if (!(await getSessionUser(request, db))) throw unauthorized()
  resetDemoData(db)
  return json({ ok: true })
})
