import { requirePermission } from '@/server/auth/guard'
import { json, route } from '@/server/lib/http'
import { getDashboard } from '@/server/services/dashboard'

export const GET = route(async (request: Request) => {
  const { user, db } = await requirePermission(request, 'dashboard.read')
  const params = Object.fromEntries(new URL(request.url).searchParams)
  return json(getDashboard(db, user, params))
})
