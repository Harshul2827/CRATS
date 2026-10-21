import { requirePermission } from '@/server/auth/guard'
import { json, route } from '@/server/lib/http'
import { idParam, type IdContext } from '@/server/lib/params'
import { reviewDrive } from '@/server/services/drives'

export const POST = route(async (request: Request, { params }: IdContext) => {
  const { user, db } = await requirePermission(request, 'drive.review')
  const body: unknown = await request.json().catch(() => ({}))
  return json(reviewDrive(db, user, await idParam(params), body))
})
