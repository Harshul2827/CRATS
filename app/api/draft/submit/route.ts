import { requirePermission } from '@/server/auth/guard'
import { json, route } from '@/server/lib/http'
import { submitDraft } from '@/server/services/drives'

export const POST = route(async (request: Request) => {
  const { user, db } = await requirePermission(request, 'draft.submit')
  return json({ draft: submitDraft(db, user) })
})
