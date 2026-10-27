// The one place that knows what "now" is. Seeded timestamps, deadlines, "days left" and
// "2 hours ago" all derive from DEMO_NOW (14 Oct 2026, 10:00 IST) so the demo reads the same every run.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

export const DEMO_NOW = new Date('2026-10-14T10:00:00+05:30')

const bootedAt = Date.now()
let frozen = process.env.CRATS_FREEZE_CLOCK === '1'

/** Tests call this so timestamps are fully deterministic. */
export function freezeClock(value = true) {
  frozen = value
}

/**
 * Demo "now": DEMO_NOW plus the real time this server process has been running, so actions taken
 * during the demo get distinct, increasing timestamps (and sort after the seeded data).
 */
export function now(): Date {
  return new Date(DEMO_NOW.getTime() + (frozen ? 0 : Date.now() - bootedAt))
}

export const nowIso = () => now().toISOString()

/** An ISO timestamp `days` days and `hours` hours before DEMO_NOW (used by the seed). */
export function ago(days: number, hours = 0): string {
  return new Date(DEMO_NOW.getTime() - days * DAY_MS - hours * HOUR_MS).toISOString()
}

/** IST calendar date (YYYY-MM-DD) of an instant. */
export function istDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

export const todayIst = () => istDate(now())

/** A date `days` from today (IST), as YYYY-MM-DD. Negative values go into the past. */
export function dateFromDemoToday(days: number): string {
  return istDate(new Date(DEMO_NOW.getTime() + days * DAY_MS))
}

function dayNumber(date: string) {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS)
}

/** Whole IST calendar days from today until `date` (0 = today, negative = past). */
export function daysUntil(date: string): number {
  return dayNumber(date) - dayNumber(todayIst())
}

export function isPastDeadline(deadline: string): boolean {
  return daysUntil(deadline) < 0
}

export function daysLeftLabel(deadline: string): string {
  const d = daysUntil(deadline)
  if (d < 0) return 'Closed'
  if (d === 0) return 'Last day'
  return d === 1 ? '1 day left' : `${d} days left`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "28 Oct 2026" from either a YYYY-MM-DD date or an instant (rendered in IST). */
export function formatDate(value: string): string {
  const date = value.length === 10 ? value : istDate(value)
  const [y, m, d] = date.split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`
}

/** "2 hours ago", "yesterday", "2 days ago" relative to the demo clock, by IST calendar day. */
export function relativeTime(iso: string): string {
  const diff = now().getTime() - new Date(iso).getTime()
  if (diff < 60 * 1000) return 'just now'
  if (diff < HOUR_MS) {
    const m = Math.floor(diff / 60000)
    return m === 1 ? '1 minute ago' : `${m} minutes ago`
  }
  const dayGap = dayNumber(todayIst()) - dayNumber(istDate(iso))
  if (dayGap === 0) {
    const h = Math.floor(diff / HOUR_MS)
    return h === 1 ? '1 hour ago' : `${h} hours ago`
  }
  if (dayGap === 1) return 'yesterday'
  if (dayGap < 14) return `${dayGap} days ago`
  return formatDate(iso)
}
