import { requirePermission } from '@/server/auth/guard'
import { json, route } from '@/server/lib/http'
import { idParam, type IdContext } from '@/server/lib/params'
import { getStudentDriveDetail } from '@/server/services/student-drives'

export const GET = route(async (request: Request, { params }: IdContext) => {
  const { user, db } = await requirePermission(request, 'drives.read')
  return json(getStudentDriveDetail(db, user, await idParam(params)))
})
