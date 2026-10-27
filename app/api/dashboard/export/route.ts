import { requirePermission } from '@/server/auth/guard'
import { route } from '@/server/lib/http'
import { dashboardCsv, getDashboard } from '@/server/services/dashboard'

export const GET = route(async (request: Request) => {
  const { user, db } = await requirePermission(request, 'dashboard.read')
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const csv = dashboardCsv(getDashboard(db, user, params))
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="crats-placement-report.csv"',
      'Cache-Control': 'no-store',
    },
  })
})
