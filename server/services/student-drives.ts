import { z } from 'zod'
import type { DB } from '../db/client'
import type { SessionUser } from '../auth/guard'
import { ApiError, notFound } from '../lib/http'
import { daysLeftLabel, daysUntil, formatDate, isPastDeadline, nowIso } from '../lib/clock'
import { writeAudit } from './audit'
import { notify } from './notifications'
import { evaluateEligibility, loadCriteria, loadStudentFacts, verificationReason, type Check, type StudentFacts } from './eligibility'
import { getDriveForUser, toDetail, type DriveDetail, type DriveRow } from './drives'

/** The one placement cycle currently listed on the student page. */
export const ACTIVE_CYCLE = 'Autumn Cycle 2026'

const blank = (v: unknown) => (v === '' || v === null ? undefined : v)

export const driveQuerySchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(100).optional()),
  type: z.preprocess(blank, z.enum(['all', 'FTE', 'INTERNSHIP', 'INTERN_FTE']).default('all')),
  filter: z.preprocess(blank, z.enum(['all', 'eligible', 'not_eligible', 'applied']).default('all')),
  sort: z.preprocess(blank, z.enum(['deadline', 'deadline_desc', 'ctc', 'company']).default('deadline')),
})
export type DriveQuery = z.infer<typeof driveQuerySchema>

export type CardStatus = 'eligible' | 'not_eligible' | 'applied'

export interface DriveCard {
  id: number
  title: string
  company: string
  company_initials: string
  job_type: string
  job_type_label: string
  is_stipend: boolean
  ctc_text: string
  location_label: string
  openings: number
  deadline: string
  deadline_label: string
  days_left: number
  days_left_label: string
  status: CardStatus
  reasons: string[]
  applied_label: string | null
}

interface StudentContext {
  facts: StudentFacts
  applications: Map<number, { applied_at: string; status: string }>
}

function studentContext(db: DB, student: SessionUser): StudentContext {
  const facts = loadStudentFacts(db, student.id)
  if (!facts) throw new ApiError(403, 'FORBIDDEN', 'This account has no student profile')
  const rows = db
    .prepare('SELECT drive_id, applied_at, status FROM applications WHERE student_id = ?')
    .all(student.id) as { drive_id: number; applied_at: string; status: string }[]
  return { facts, applications: new Map(rows.map((r) => [r.drive_id, r])) }
}

function evaluateFor(db: DB, ctx: StudentContext, drive: DriveRow) {
  const result = evaluateEligibility(ctx.facts, loadCriteria(db, drive.id))
  const application = ctx.applications.get(drive.id)
  const status: CardStatus = application ? 'applied' : result.eligible ? 'eligible' : 'not_eligible'
  // An unverified student cannot apply to anything, so the verification message is the only one that matters.
  const reasons =
    status !== 'not_eligible' ? [] : ctx.facts.verification_status !== 'VERIFIED' ? [verificationReason(ctx.facts.verification_status)] : result.reasons
  return { result, application, status, reasons }
}

function toCard(db: DB, ctx: StudentContext, drive: DriveRow): DriveCard {
  const detail = toDetail(db, drive)
  const { application, status, reasons } = evaluateFor(db, ctx, drive)
  return {
    id: drive.id,
    title: detail.title,
    company: detail.company,
    company_initials: detail.company_initials,
    job_type: detail.job_type,
    job_type_label: detail.job_type_label,
    is_stipend: detail.job_type === 'INTERNSHIP',
    ctc_text: detail.ctc_text,
    location_label: detail.location_label,
    openings: detail.openings,
    deadline: detail.deadline,
    deadline_label: detail.deadline_label,
    days_left: daysUntil(detail.deadline),
    days_left_label: daysLeftLabel(detail.deadline),
    status,
    reasons,
    applied_label: application ? `Applied on ${formatDate(application.applied_at)}` : null,
  }
}

export function listStudentDrives(db: DB, student: SessionUser, rawQuery: unknown) {
  const query = driveQuerySchema.parse(rawQuery)
  const ctx = studentContext(db, student)
  const open = db
    .prepare("SELECT d.*, c.name AS company FROM drives d JOIN companies c ON c.id = d.company_id WHERE d.status = 'OPEN'")
    .all() as DriveRow[]

  const needle = query.q?.toLowerCase()
  const matching = open.filter((d) => {
    if (query.type !== 'all' && d.job_type !== query.type) return false
    if (needle && !`${d.title} ${d.company} ${d.location}`.toLowerCase().includes(needle)) return false
    return true
  })
  const cards = matching.map((d) => ({ card: toCard(db, ctx, d), ctc: d.ctc_value }))

  const counts = {
    all: cards.length,
    eligible: cards.filter((c) => c.card.status === 'eligible').length,
    not_eligible: cards.filter((c) => c.card.status === 'not_eligible').length,
    applied: cards.filter((c) => c.card.status === 'applied').length,
  }

  const visible = cards.filter((c) => query.filter === 'all' || c.card.status === query.filter)
  visible.sort((a, b) => {
    switch (query.sort) {
      case 'deadline_desc': return b.card.deadline.localeCompare(a.card.deadline) || a.card.id - b.card.id
      case 'ctc': return b.ctc - a.ctc || a.card.id - b.card.id
      case 'company': return a.card.company.localeCompare(b.card.company) || a.card.title.localeCompare(b.card.title)
      default: return a.card.deadline.localeCompare(b.card.deadline) || a.card.id - b.card.id
    }
  })

  return {
    cycle: ACTIVE_CYCLE,
    verification_status: ctx.facts.verification_status,
    counts,
    items: visible.map((c) => c.card),
  }
}

export interface StudentDriveDetail {
  drive: DriveDetail
  status: CardStatus
  reasons: string[]
  checks: Check[]
  applied_label: string | null
  days_left_label: string
}

export function getStudentDriveDetail(db: DB, student: SessionUser, driveId: number): StudentDriveDetail {
  const drive = getDriveForUser(db, student, driveId)
  if (!drive) throw notFound('Drive not found')
  const ctx = studentContext(db, student)
  const { result, application, status, reasons } = evaluateFor(db, ctx, drive)
  return {
    drive: toDetail(db, drive),
    status,
    reasons,
    checks: result.checks,
    applied_label: application ? `Applied on ${formatDate(application.applied_at)}` : null,
    days_left_label: daysLeftLabel(drive.deadline),
  }
}

export function applyToDrive(db: DB, student: SessionUser, driveId: number) {
  return db.transaction(() => {
    const drive = getDriveForUser(db, student, driveId)
    if (!drive) throw notFound('Drive not found')
    const ctx = studentContext(db, student)

    if (ctx.applications.has(drive.id)) {
      throw new ApiError(409, 'ALREADY_APPLIED', 'You have already applied')
    }
    if (ctx.facts.verification_status !== 'VERIFIED') {
      throw new ApiError(403, 'NOT_VERIFIED', verificationReason(ctx.facts.verification_status), {
        reasons: [verificationReason(ctx.facts.verification_status)],
      })
    }
    if (isPastDeadline(drive.deadline)) {
      throw new ApiError(422, 'DEADLINE_PASSED', `The deadline for this drive was ${formatDate(drive.deadline)}`)
    }
    const eligibility = evaluateEligibility(ctx.facts, loadCriteria(db, drive.id))
    if (!eligibility.eligible) {
      throw new ApiError(403, 'NOT_ELIGIBLE', 'You do not meet the eligibility criteria for this drive', {
        reasons: eligibility.reasons,
      })
    }

    const resume = (db.prepare('SELECT resume_url FROM students WHERE user_id = ?').get(student.id) as { resume_url: string | null }).resume_url
    const at = nowIso()
    let applicationId: number
    try {
      applicationId = Number(
        db
          .prepare("INSERT INTO applications (drive_id, student_id, status, applied_at, resume_snapshot_url) VALUES (?, ?, 'APPLIED', ?, ?)")
          .run(drive.id, student.id, at, resume).lastInsertRowid,
      )
    } catch (e) {
      // Two simultaneous clicks: the UNIQUE (drive_id, student_id) constraint decides the winner.
      if (e instanceof Error && 'code' in e && String(e.code).startsWith('SQLITE_CONSTRAINT')) {
        throw new ApiError(409, 'ALREADY_APPLIED', 'You have already applied')
      }
      throw e
    }
    writeAudit(db, {
      actorId: student.id, action: 'APPLICATION_CREATED', entityType: 'application', entityId: applicationId,
      newValue: { drive_id: drive.id, status: 'APPLIED' }, at,
    })
    notify(db, student.id, 'Application submitted', `Your application for ${drive.title} (${drive.company}) was received.`)
    if (drive.created_by) {
      notify(db, drive.created_by, 'New application', `${student.name} applied to ${drive.title}.`)
    }
    return { application_id: applicationId, drive_id: drive.id, status: 'applied' as const, applied_label: `Applied on ${formatDate(at)}` }
  })()
}
