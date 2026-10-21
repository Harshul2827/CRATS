import { getDb } from '@/server/db/client'
import { getSessionUser } from '@/server/auth/guard'
import { json, route, unauthorized } from '@/server/lib/http'
import { describeUser } from '@/server/services/users'

export const GET = route(async (request: Request) => {
  const db = getDb()
  const user = await getSessionUser(request, db)
  if (!user) throw unauthorized()
  return json(describeUser(db, user))
})
