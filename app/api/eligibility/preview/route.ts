import { z } from 'zod'
import { requirePermission } from '@/server/auth/guard'
import { json, parseBody, route } from '@/server/lib/http'
import { previewEligibility } from '@/server/services/drives'

export const POST = route(async (request: Request) => {
  const { user, db } = await requirePermission(request, 'eligibility.preview')
  const { criteria } = await parseBody(request, z.object({ criteria: z.unknown() }))
  return json(previewEligibility(db, user, criteria))
})
