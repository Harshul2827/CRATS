import { z } from 'zod'
import { requirePermission } from '@/server/auth/guard'
import { json, parseBody, route } from '@/server/lib/http'
import { requireDemoMode, setDemoVerification } from '@/server/services/users'

// Demo only: flips the signed-in student's verification so the "Unverified" variant is real.
export const POST = route(async (request: Request) => {
  requireDemoMode()
  const { user, db } = await requirePermission(request, 'drives.read')
  const { status } = await parseBody(request, z.object({ status: z.enum(['PENDING', 'VERIFIED']) }))
  return json(setDemoVerification(db, user, status))
})
