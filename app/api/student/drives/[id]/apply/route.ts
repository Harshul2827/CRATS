import { requirePermission } from '@/server/auth/guard'
import { json, route } from '@/server/lib/http'
import { idParam, type IdContext } from '@/server/lib/params'
import { applyToDrive } from '@/server/services/student-drives'

export const POST = route(async (request: Request, { params }: IdContext) => {
  const { user, db } = await requirePermission(request, 'drives.apply')
  return json(applyToDrive(db, user, await idParam(params)), 201)
})
