import { z } from 'zod'
import { requirePermission } from '@/server/auth/guard'
import { json, route } from '@/server/lib/http'
import { listNotifications, markRead } from '@/server/services/notifications'

// Body: { ids: [1, 2] } marks those; {} marks every notification of the signed-in user.
const readSchema = z.object({ ids: z.array(z.number().int().positive()).max(200).optional() })

export const POST = route(async (request: Request) => {
  const { user, db } = await requirePermission(request, 'notifications.read')
  const body: unknown = await request.json().catch(() => ({}))
  const { ids } = readSchema.parse(body ?? {})
  markRead(db, user.id, ids)
  return json(listNotifications(db, user.id))
})
