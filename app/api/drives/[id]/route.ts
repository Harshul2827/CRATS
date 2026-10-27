import { getDb } from '@/server/db/client'
import { getSessionUser } from '@/server/auth/guard'
import { json, notFound, route, unauthorized } from '@/server/lib/http'
import { idParam, type IdContext } from '@/server/lib/params'
import { getDriveForUser, toDetail } from '@/server/services/drives'

// Row-level scoping lives in getDriveForUser: TPO sees all, a recruiter only their company, a student only OPEN drives.
export const GET = route(async (request: Request, { params }: IdContext) => {
  const db = getDb()
  const user = await getSessionUser(request, db)
  if (!user) throw unauthorized()
  const drive = getDriveForUser(db, user, await idParam(params))
  if (!drive) throw notFound('Drive not found')
  return json(toDetail(db, drive))
})
