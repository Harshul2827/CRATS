import { requirePermission } from '@/server/auth/guard'
import { json, route } from '@/server/lib/http'
import { listStudentDrives } from '@/server/services/student-drives'

export const GET = route(async (request: Request) => {
  const { user, db } = await requirePermission(request, 'drives.read')
  return json(listStudentDrives(db, user, Object.fromEntries(new URL(request.url).searchParams)))
})
