import { z } from 'zod'
import { requirePermission } from '@/server/auth/guard'
import { json, parseBody, route } from '@/server/lib/http'
import { getCurrentDraft, saveDraftCriteria } from '@/server/services/drives'

export const GET = route(async (request: Request) => {
  const { user, db } = await requirePermission(request, 'draft.read')
  return json({ draft: getCurrentDraft(db, user) })
})

// Body: { criteria: {...} }. Field errors come back as 422 { error: { fields } }.
export const PUT = route(async (request: Request) => {
  const { user, db } = await requirePermission(request, 'draft.write')
  const { criteria } = await parseBody(request, z.object({ criteria: z.unknown() }))
  return json({ draft: saveDraftCriteria(db, user, criteria) })
})
