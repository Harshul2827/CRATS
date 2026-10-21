// TPO dashboard. Every number is computed from rows; nothing here is hard-coded.
// The department filter applies to everything. The range filter applies to the "flow" figures:
// the funnel, top companies and average CTC. Registered/placed/open-drive counts are current totals.

import { z } from 'zod'
import type { DB } from '../db/client'
import type { SessionUser } from '../auth/guard'
import { daysUntil, formatDate, now } from '../lib/clock'
import { ApiError } from '../lib/http'
import { latestActivity } from './audit'
import { listPendingDrives, DEPT_FILTER_SQL } from './drives'

const DAY_MS = 24 * 60 * 60 * 1000
const ACADEMIC_YEAR_START = new Date('2026-06-01T00:00:00+05:30')

export const RANGES = [
  { value: 'all', label: 'Academic year 2026-27' },
  { value: '30d', label: 'Last 30 days' },
  { value: '7d', label: 'Last 7 days' },
] as const

export const dashboardQuerySchema = z.object({
  department: z.preprocess(
    (v) => (v === '' || v === 'all' || v === null ? undefined : v),
    z.coerce.number({ error: 'Unknown department' }).int().positive().optional(),
  ),
  range: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.enum(['all', '30d', '7d']).default('all')),
})
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>

const SHORT_NAMES: Record<string, string> = {
  'Computer Engineering': 'Computer',
  'Information Technology': 'Info Tech',
  'Electronics & Telecom': 'EXTC',
  'Electronics Engineering': 'Electronics',
  'Mechanical Engineering': 'Mechanical',
}

const STATUS_SEGMENTS = [
  { status: 'OPEN', label: 'Open', color: '#10b981' },
  { status: 'PENDING_APPROVAL', label: 'Pending approval', color: '#f59e0b' },
  { status: 'COMPLETED', label: 'Completed', color: '#8b5cf6' },
  { status: 'CLOSED', label: 'Closed', color: '#a8a29e' },
  { status: 'DRAFT', label: 'Draft', color: '#6366f1' },
] as const

interface OfferRow {
  ctc: number
  responded_at: string
  company: string
}

const average = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length)
const round1 = (n: number) => Math.round(n * 10) / 10
const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100))

export function getDashboard(db: DB, viewer: SessionUser, rawQuery: unknown) {
  const query = dashboardQuerySchema.parse(rawQuery)
  const dept = query.department ?? null
  const today = now()

  const departments = db.prepare('SELECT id, name FROM departments ORDER BY id').all() as { id: number; name: string }[]
  if (dept !== null && !departments.some((d) => d.id === dept)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Unknown department', { fields: { department: 'Unknown department' } })
  }

  const rangeStart =
    query.range === 'all' ? ACADEMIC_YEAR_START : new Date(today.getTime() - (query.range === '7d' ? 7 : 30) * DAY_MS)
  const windowDays = query.range === '7d' ? 7 : 30
  const inRange = (iso: string) => new Date(iso) >= rangeStart

  // ---- students ----
  const studentWhere = '(:dept IS NULL OR s.department_id = :dept)'
  const count = (sql: string, params: Record<string, unknown> = {}) =>
    (db.prepare(sql).get({ dept, ...params }) as { n: number }).n
  const registered = count(`SELECT COUNT(*) n FROM students s WHERE ${studentWhere}`)
  const placed = count(`SELECT COUNT(*) n FROM students s WHERE ${studentWhere} AND s.placement_status = 'PLACED'`)
  const newThisMonth = count(
    `SELECT COUNT(*) n FROM students s JOIN users u ON u.id = s.user_id WHERE ${studentWhere} AND u.created_at > :since`,
    { since: new Date(today.getTime() - 30 * DAY_MS).toISOString() },
  )

  // ---- offers ----
  const acceptedOffers = db
    .prepare(
      `SELECT o.ctc, o.responded_at, c.name AS company
       FROM offers o
       JOIN applications a ON a.id = o.application_id
       JOIN students s ON s.user_id = a.student_id
       JOIN drives d ON d.id = a.drive_id
       JOIN companies c ON c.id = d.company_id
       WHERE o.status = 'ACCEPTED' AND o.responded_at IS NOT NULL AND ${studentWhere}`,
    )
    .all({ dept }) as OfferRow[]

  const offersInRange = acceptedOffers.filter((o) => inRange(o.responded_at))
  const avgCtc = average(offersInRange.map((o) => o.ctc))
  const within = (o: OfferRow, fromDays: number, toDays: number) => {
    const age = (today.getTime() - new Date(o.responded_at).getTime()) / DAY_MS
    return age >= fromDays && age < toDays
  }
  const currentWindow = acceptedOffers.filter((o) => within(o, 0, windowDays))
  const previousWindow = acceptedOffers.filter((o) => within(o, windowDays, windowDays * 2))
  const currentAvg = average(currentWindow.map((o) => o.ctc))
  const previousAvg = average(previousWindow.map((o) => o.ctc))
  const ctcDelta = currentAvg !== null && previousAvg !== null ? round1(currentAvg - previousAvg) : null
  const previousLabel = `previous ${windowDays} days`

  // ---- drives ----
  const drives = db
    .prepare(`SELECT d.status, d.deadline FROM drives d WHERE ${DEPT_FILTER_SQL}`)
    .all({ dept }) as { status: string; deadline: string }[]
  const openDrives = drives.filter((d) => d.status === 'OPEN')
  const closingSoon = openDrives.filter((d) => {
    const left = daysUntil(d.deadline)
    return left >= 0 && left <= 7
  }).length
  const pendingCount = drives.filter((d) => d.status === 'PENDING_APPROVAL').length

  const statusMix = {
    total: drives.length,
    segments: STATUS_SEGMENTS.map((s) => {
      const n = drives.filter((d) => d.status === s.status).length
      return { status: s.status, label: s.label, color: s.color, count: n, percent: percent(n, drives.length) }
    }).filter((s) => s.count > 0),
  }

  // ---- department chart ----
  const byDepartment = departments
    .filter((d) => dept === null || d.id === dept)
    .map((d) => {
      const row = db
        .prepare("SELECT COUNT(*) AS registered, COALESCE(SUM(placement_status = 'PLACED'), 0) AS placed FROM students WHERE department_id = ?")
        .get(d.id) as { registered: number; placed: number }
      return {
        id: d.id, name: d.name, short_name: SHORT_NAMES[d.name] ?? d.name.split(' ')[0],
        registered: row.registered, placed: row.placed, percent: percent(row.placed, row.registered),
      }
    })
  const top = [...byDepartment].sort((a, b) => b.percent - a.percent)[0]

  // ---- funnel ----
  const applications = db
    .prepare(
      `SELECT a.status, a.applied_at, o.status AS offer_status
       FROM applications a
       JOIN students s ON s.user_id = a.student_id
       LEFT JOIN offers o ON o.application_id = a.id
       WHERE ${studentWhere}`,
    )
    .all({ dept }) as { status: string; applied_at: string; offer_status: string | null }[]
  const inWindow = applications.filter((a) => inRange(a.applied_at))
  const stages = [
    { key: 'applied', label: 'Applied', count: inWindow.length },
    { key: 'shortlisted', label: 'Shortlisted', count: inWindow.filter((a) => a.status === 'SHORTLISTED' || a.status === 'SELECTED').length },
    { key: 'selected', label: 'Selected', count: inWindow.filter((a) => a.status === 'SELECTED').length },
    { key: 'accepted', label: 'Offers accepted', count: inWindow.filter((a) => a.offer_status === 'ACCEPTED').length },
  ]
  const funnel = stages.map((s, i) => ({
    ...s,
    percent_of_applied: percent(s.count, stages[0].count),
    from_previous: i === 0 ? null : percent(s.count, stages[i - 1].count),
  }))

  // ---- top companies ----
  const perCompany = new Map<string, number>()
  for (const o of offersInRange) perCompany.set(o.company, (perCompany.get(o.company) ?? 0) + 1)
  const topCompanies = [...perCompany.entries()]
    .map(([name, n]) => ({ name, offers: n }))
    .sort((a, b) => b.offers - a.offers || a.name.localeCompare(b.name))
    .slice(0, 5)

  // ---- 12-week cumulative placements ----
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const weekEnd = new Date(today.getTime() - (11 - i) * 7 * DAY_MS)
    const weekStart = new Date(weekEnd.getTime() - 7 * DAY_MS)
    const inWeek = acceptedOffers.filter((o) => {
      const t = new Date(o.responded_at)
      return t > weekStart && t <= weekEnd
    }).length
    const cumulative = acceptedOffers.filter((o) => new Date(o.responded_at) <= weekEnd).length
    return { label: formatDate(weekStart.toISOString()).slice(0, 6), count: inWeek, cumulative }
  })
  const recent = acceptedOffers.filter((o) => within(o, 0, 28)).length / 4
  const earlier = acceptedOffers.filter((o) => within(o, 28, 56)).length / 4

  return {
    filters: {
      department: dept,
      range: query.range,
      departments,
      ranges: RANGES,
    },
    subtitle: `${RANGES.find((r) => r.value === query.range)!.label} • ${
      dept === null ? 'Campus-wide overview' : departments.find((d) => d.id === dept)!.name
    }`,
    kpis: {
      registered: { value: registered, delta: newThisMonth, note: `+${newThisMonth} this month` },
      placed: { value: placed, percent: percent(placed, registered), note: `${percent(placed, registered)}% of registered` },
      avg_ctc: {
        value: avgCtc === null ? null : round1(avgCtc),
        label: avgCtc === null ? '—' : `Rs ${round1(avgCtc)} LPA`,
        delta: ctcDelta,
        note:
          ctcDelta === null
            ? `No offers to compare with the ${previousLabel}`
            : `${ctcDelta >= 0 ? '+' : '−'}${Math.abs(ctcDelta)} vs ${previousLabel}`,
      },
      open_drives: {
        value: openDrives.length,
        closing_soon: closingSoon,
        note: `${closingSoon} closing this week`,
      },
      pending: { value: pendingCount, note: 'Review now →' },
    },
    departments_chart: {
      items: byDepartment,
      top_conversion: top ? { name: top.name, percent: top.percent } : null,
      overall_percent: percent(placed, registered),
    },
    funnel,
    trend: {
      weeks,
      recent_per_week: round1(recent),
      earlier_per_week: round1(earlier),
      delta_per_week: round1(recent - earlier),
    },
    top_companies: topCompanies,
    status_mix: statusMix,
    pending_approvals: listPendingDrives(db, dept),
    activity: latestActivity(db, viewer.id, 5),
  }
}

export type DashboardData = ReturnType<typeof getDashboard>

function csvCell(value: unknown) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** The dashboard as a CSV document: one titled section per table. */
export function dashboardCsv(data: DashboardData): string {
  const rows: unknown[][] = []
  const section = (title: string, header: string[], body: unknown[][]) => {
    rows.push([title], header, ...body, [])
  }
  rows.push(['CRATS placement report', data.subtitle], [])
  section('Key figures', ['Measure', 'Value', 'Note'], [
    ['Registered students', data.kpis.registered.value, data.kpis.registered.note],
    ['Placed students', data.kpis.placed.value, data.kpis.placed.note],
    ['Average CTC (LPA)', data.kpis.avg_ctc.value ?? '', data.kpis.avg_ctc.note],
    ['Open drives', data.kpis.open_drives.value, data.kpis.open_drives.note],
    ['Pending approvals', data.kpis.pending.value, ''],
  ])
  section('Department-wise placement', ['Department', 'Registered', 'Placed', 'Placed %'],
    data.departments_chart.items.map((d) => [d.name, d.registered, d.placed, d.percent]))
  section('Application funnel', ['Stage', 'Count', '% of applied', '% of previous stage'],
    data.funnel.map((f) => [f.label, f.count, f.percent_of_applied, f.from_previous ?? '']))
  section('Top recruiting companies', ['Company', 'Accepted offers'], data.top_companies.map((c) => [c.name, c.offers]))
  section('Cumulative placements by week', ['Week starting', 'Accepted that week', 'Cumulative'],
    data.trend.weeks.map((w) => [w.label, w.count, w.cumulative]))
  section('Drive status mix', ['Status', 'Drives', '%'], data.status_mix.segments.map((s) => [s.label, s.count, s.percent]))
  section('Pending approvals', ['Reference', 'Title', 'Company', 'Submitted'],
    data.pending_approvals.map((p) => [p.reference_id ?? '', p.title, p.company, p.submitted_label ?? '']))
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}
