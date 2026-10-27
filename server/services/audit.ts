import type { DB } from '../db/client'
import { nowIso, relativeTime } from '../lib/clock'

export interface AuditInput {
  actorId: number | null
  action: string
  entityType: 'drive' | 'application' | 'company' | 'student' | 'user'
  entityId: number | null
  oldValue?: unknown
  newValue?: unknown
  at?: string
}

/** Append one row to the audit log. Call it inside the same transaction as the change it records. */
export function writeAudit(db: DB, a: AuditInput) {
  db.prepare(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    a.actorId,
    a.action,
    a.entityType,
    a.entityId,
    a.oldValue === undefined ? null : JSON.stringify(a.oldValue),
    a.newValue === undefined ? null : JSON.stringify(a.newValue),
    a.at ?? nowIso(),
  )
}

interface AuditRow {
  id: number
  actor_id: number | null
  actor_name: string | null
  action: string
  entity_type: string
  entity_id: number | null
  new_value: string | null
  created_at: string
}

export interface ActivityItem {
  id: number
  text: string
  tone: 'ok' | 'reject'
  time: string
  at: string
}

function driveLabel(db: DB, id: number | null): string {
  if (id === null) return 'a drive'
  const d = db
    .prepare('SELECT d.title, c.name AS company FROM drives d JOIN companies c ON c.id = d.company_id WHERE d.id = ?')
    .get(id) as { title: string; company: string } | undefined
  return d ? `${d.title} (${d.company})` : 'a drive'
}

function driveTitle(db: DB, id: number | null): string {
  const d = id === null ? undefined : (db.prepare('SELECT title FROM drives WHERE id = ?').get(id) as { title: string } | undefined)
  return d?.title ?? 'a drive'
}

function shorten(text: string, max = 60) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function describe(db: DB, row: AuditRow, viewerId: number): string {
  const actor = row.actor_id === viewerId ? 'You' : (row.actor_name ?? 'Someone')
  const value = row.new_value ? (JSON.parse(row.new_value) as Record<string, unknown>) : {}
  switch (row.action) {
    case 'DRIVE_APPROVED':
      return `${actor} approved ${driveLabel(db, row.entity_id)}`
    case 'DRIVE_REJECTED': {
      const summary = typeof value.summary === 'string' ? value.summary : shorten(String(value.reason ?? 'no reason given'))
      return `${actor} rejected ${driveTitle(db, row.entity_id)}: ${summary}`
    }
    case 'DRIVE_SUBMITTED':
      return `${actor} submitted ${driveLabel(db, row.entity_id)} for approval`
    case 'ELIGIBILITY_UPDATED':
      return `${actor} updated the eligibility criteria of ${driveLabel(db, row.entity_id)}`
    case 'ROUND_RESULTS_PUBLISHED':
      return `Round ${value.round ?? 1} results published for ${driveTitle(db, row.entity_id)}`
    case 'COMPANY_REGISTERED': {
      const c = db.prepare('SELECT name FROM companies WHERE id = ?').get(row.entity_id) as { name: string } | undefined
      return `${c?.name ?? 'A company'} registered as a company`
    }
    case 'PROFILES_VERIFIED':
      return `${actor} verified ${value.count} student profiles`
    case 'APPLICATION_CREATED':
      return `${actor} applied to ${driveLabel(db, typeof value.drive_id === 'number' ? value.drive_id : null)}`
    case 'VERIFICATION_CHANGED':
      return `${actor}'s profile verification was set to ${String(value.status ?? '').toLowerCase()} (demo)`
    default:
      return `${actor} performed ${row.action.toLowerCase().replaceAll('_', ' ')}`
  }
}

/** Latest audit entries as human-readable sentences. "You" means the viewing user. */
export function latestActivity(db: DB, viewerId: number, limit = 5): ActivityItem[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.actor_id, u.name AS actor_name, a.action, a.entity_type, a.entity_id, a.new_value, a.created_at
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
    )
    .all(limit) as AuditRow[]
  return rows.map((r) => ({
    id: r.id,
    text: describe(db, r, viewerId),
    tone: r.action === 'DRIVE_REJECTED' ? 'reject' : 'ok',
    time: relativeTime(r.created_at),
    at: r.created_at,
  }))
}
