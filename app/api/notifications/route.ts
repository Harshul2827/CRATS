import { requirePermission } from '@/server/auth/guard'
import { json, route } from '@/server/lib/http'
import { listNotifications } from '@/server/services/notifications'

export const GET = route(async (request: Request) => {
  const { user, db } = await requirePermission(request, 'notifications.read')
  return json(listNotifications(db, user.id))
})
