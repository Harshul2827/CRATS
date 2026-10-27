import { z } from 'zod'
import type { DB } from '../db/client'
import type { SessionUser } from '../auth/guard'
import { ApiError, notFound } from '../lib/http'
import { formatDate, nowIso, relativeTime } from '../lib/clock'
import { writeAudit } from './audit'
import { notify, notifyRole } from './notifications'
import {
  estimatePool, evaluateEligibility, loadCriteria, loadStudentFacts, NO_CRITERIA, type Criteria,
} from './eligibility'

// ---------- labels shared by every drive view ----------

export const JOB_TYPE_LABELS = { FTE: 'Full-time', INTERNSHIP: 'Internship', INTERN_FTE: 'Intern + FTE' } as const
export type JobType = keyof typeof JOB_TYPE_LABELS

export const locationLabel = (location: string, mode: string) => (mode === 'Remote' ? 'Remote' : `${location} (${mode})`)

export const companyInitials = (name: string) =>
  name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export const shortDepartment = (name: string) => name.replace('Engineering', 'Engg')

export interface DriveRow {
  id: number
  company_id: number
  company: string
  created_by: number | null
  title: string
  description: string
  job_type: JobType
  ctc_text: string
  ctc_value: number
  location: string
  work_mode: string
  openings: number
  deadline: string
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'OPEN' | 'CLOSED' | 'COMPLETED'
  rejection_reason: string | null
  reference_id: string | null
  updated_at: string
  submitted_at: string | null
}

const DRIVE_SELECT = 'SELECT d.*, c.name AS company FROM drives d JOIN companies c ON c.id = d.company_id'

export interface DriveDetail {
  id: number
  reference_id: string | null
  title: string
  description: string
  company: string
  company_initials: string
  job_type: JobType
  job_type_label: string
  ctc_text: string
  location_label: string
  openings: number
  deadline: string
  deadline_label: string
  status: DriveRow['status']
  rejection_reason: string | null
  submitted_label: string | null
  criteria: Criteria
}

export function toDetail(db: DB, d: DriveRow): DriveDetail {
  return {
    id: d.id,
    reference_id: d.reference_id,
    title: d.title,
    description: d.description,
    company: d.company,
    company_initials: companyInitials(d.company),
    job_type: d.job_type,
    job_type_label: JOB_TYPE_LABELS[d.job_type],
    ctc_text: d.ctc_text,
    location_label: locationLabel(d.location, d.work_mode),
    openings: d.openings,
    deadline: d.deadline,
    deadline_label: formatDate(d.deadline),
    status: d.status,
    rejection_reason: d.rejection_reason,
    submitted_label: d.submitted_at ? relativeTime(d.submitted_at) : null,
    criteria: loadCriteria(db, d.id),
  }
}

/**
 * Row-level scoping for single drives: the TPO sees everything, a recruiter only their own company's
 * drives, a student only OPEN drives. Anything else is "not found" so existence is not revealed.
 */
export function getDriveForUser(db: DB, user: SessionUser, driveId: number): DriveRow | null {
  const d = db.prepare(`${DRIVE_SELECT} WHERE d.id = ?`).get(driveId) as DriveRow | undefined
  if (!d) return null
  if (user.role === 'tpo') return d
  if (user.role === 'recruiter') {
    const r = db.prepare('SELECT company_id FROM recruiters WHERE user_id = ?').get(user.id) as { company_id: number } | undefined
    return r && r.company_id === d.company_id ? d : null
  }
  if (user.role === 'student') return d.status === 'OPEN' ? d : null
  return null
}

// ---------- criteria validation ----------

const pct = (msg: string) => z.number({ error: msg }).min(0, 'Must be between 0 and 100').max(100, 'Must be between 0 and 100')
const backlog = z.number({ error: 'Enter a number' }).int('Must be a whole number').min(0, 'Must be 0 or more')

const looseShape = {
  min_cgpa: z.number({ error: 'Enter a number' }).min(0, 'CGPA must be between 0 and 10').max(10, 'CGPA must be between 0 and 10').nullish().transform((v) => v ?? null),
  max_active_backlogs: backlog.nullish().transform((v) => v ?? null),
  max_dead_backlogs: backlog.nullish().transform((v) => v ?? null),
  min_tenth_pct: pct('Enter a number').nullish().transform((v) => v ?? null),
  min_twelfth_pct: pct('Enter a number').nullish().transform((v) => v ?? null),
  allowed_graduation_year: z.number({ error: 'Select a graduation year' }).int().min(2000).max(2100).nullish().transform((v) => v ?? null),
  allow_already_placed: z.boolean({ error: 'Choose on or off' }).default(false),
}
/** For the live preview: every threshold may be empty. */
export const looseCriteriaSchema = z.object(looseShape)
/** For save and submit: the 12th percentage and the graduation year are mandatory. */
export const criteriaSchema = z.object({
  ...looseShape,
  min_twelfth_pct: pct('Minimum 12th percentage is required'),
  allowed_graduation_year: z.number({ error: 'Allowed graduation year is required' }).int().min(2000).max(2100),
})
export type CriteriaInput = z.infer<typeof looseCriteriaSchema>

// ---------- recruiter: the current draft ----------

export interface DraftView {
  drive: DriveDetail
  updated_label: string
  read_only: boolean
}

function recruiterCompany(db: DB, user: SessionUser): number {
  const r = db.prepare('SELECT company_id FROM recruiters WHERE user_id = ?').get(user.id) as { company_id: number } | undefined
  if (!r) throw new ApiError(403, 'FORBIDDEN', 'This account is not linked to a company')
  return r.company_id
}

function currentDraftRow(db: DB, user: SessionUser): DriveRow | null {
  const company = recruiterCompany(db, user)
  return (
    (db
      .prepare(`${DRIVE_SELECT} WHERE d.company_id = ? AND d.status IN ('DRAFT', 'PENDING_APPROVAL') ORDER BY d.updated_at DESC, d.id DESC LIMIT 1`)
      .get(company) as DriveRow | undefined) ?? null
  )
}

function draftView(db: DB, row: DriveRow): DraftView {
  return { drive: toDetail(db, row), updated_label: relativeTime(row.updated_at), read_only: row.status !== 'DRAFT' }
}

/** The recruiter's most recently touched DRAFT or PENDING_APPROVAL drive, scoped to their company. */
export function getCurrentDraft(db: DB, user: SessionUser): DraftView | null {
  const row = currentDraftRow(db, user)
  return row ? draftView(db, row) : null
}

function requireEditableDraft(db: DB, user: SessionUser): DriveRow {
  const row = currentDraftRow(db, user)
  if (!row) throw notFound('There is no draft to edit')
  if (row.status !== 'DRAFT') {
    throw new ApiError(409, 'NOT_EDITABLE', 'This drive is awaiting TPO approval and can no longer be edited')
  }
  return row
}

export function saveDraftCriteria(db: DB, user: SessionUser, input: unknown): DraftView {
  const criteria = criteriaSchema.parse(input)
  return db.transaction(() => {
    const row = requireEditableDraft(db, user)
    const before = loadCriteria(db, row.id)
    db.prepare(
      `UPDATE eligibility_criteria SET min_cgpa = ?, max_active_backlogs = ?, max_dead_backlogs = ?, min_tenth_pct = ?,
         min_twelfth_pct = ?, allowed_graduation_year = ?, allow_already_placed = ? WHERE drive_id = ?`,
    ).run(
      criteria.min_cgpa, criteria.max_active_backlogs, criteria.max_dead_backlogs, criteria.min_tenth_pct,
      criteria.min_twelfth_pct, criteria.allowed_graduation_year, criteria.allow_already_placed ? 1 : 0, row.id,
    )
    const at = nowIso()
    db.prepare('UPDATE drives SET updated_at = ? WHERE id = ?').run(at, row.id)
    writeAudit(db, {
      actorId: user.id, action: 'ELIGIBILITY_UPDATED', entityType: 'drive', entityId: row.id,
      oldValue: { ...before, departments: undefined }, newValue: criteria,
    })
    return draftView(db, { ...row, updated_at: at })
  })()
}

export function submitDraft(db: DB, user: SessionUser): DraftView {
  return db.transaction(() => {
    const row = requireEditableDraft(db, user)
    const stored = loadCriteria(db, row.id)
    const checked = criteriaSchema.safeParse(stored)
    if (!checked.success) {
      const fields: Record<string, string> = {}
      for (const issue of checked.error.issues) fields[String(issue.path[0])] ??= issue.message
      throw new ApiError(422, 'VALIDATION_ERROR', 'Complete the eligibility criteria before submitting', { fields })
    }
    const at = nowIso()
    const reference = row.reference_id ?? nextReferenceId(db)
    db.prepare(
      `UPDATE drives SET status = 'PENDING_APPROVAL', submitted_at = ?, updated_at = ?, rejection_reason = NULL, reference_id = ? WHERE id = ?`,
    ).run(at, at, reference, row.id)
    writeAudit(db, {
      actorId: user.id, action: 'DRIVE_SUBMITTED', entityType: 'drive', entityId: row.id,
      oldValue: { status: 'DRAFT' }, newValue: { status: 'PENDING_APPROVAL', reference_id: reference },
    })
    notifyRole(db, 'tpo', 'Drive awaiting approval', `${row.title} (${row.company}) was submitted for approval as ${reference}.`)
    return draftView(db, { ...row, status: 'PENDING_APPROVAL', reference_id: reference, rejection_reason: null, submitted_at: at, updated_at: at })
  })()
}

function nextReferenceId(db: DB): string {
  const rows = db.prepare("SELECT reference_id FROM drives WHERE reference_id LIKE 'DRV-%'").all() as { reference_id: string }[]
  const max = rows.reduce((m, r) => Math.max(m, Number(r.reference_id.split('-')[2]) || 0), 0)
  return `DRV-2026-${String(max + 1).padStart(4, '0')}`
}

// ---------- live eligibility preview ----------

const SAMPLE_EMAILS = ['aarav.patel@spit.edu', 'neha.joshi@spit.edu', 'rohan.shah@spit.edu']

export function previewEligibility(db: DB, user: SessionUser, input: unknown) {
  const parsed = looseCriteriaSchema.parse(input)
  const draft = currentDraftRow(db, user)
  // Departments are chosen in a later wizard step, so the preview borrows the draft's saved departments.
  const departments = draft ? loadCriteria(db, draft.id).departments : []
  const criteria: Criteria = { ...NO_CRITERIA, ...parsed, departments }

  const samples = SAMPLE_EMAILS.map((email) => {
    const row = db
      .prepare('SELECT u.id, u.name FROM users u WHERE u.email = ?')
      .get(email) as { id: number; name: string } | undefined
    const facts = row ? loadStudentFacts(db, row.id) : null
    if (!row || !facts) return null
    const result = evaluateEligibility(facts, criteria)
    return {
      id: row.id,
      name: row.name,
      department: shortDepartment(facts.department_name),
      cgpa: facts.cgpa,
      eligible: result.eligible,
      reasons: result.reasons,
    }
  }).filter((s): s is NonNullable<typeof s> => s !== null)

  return { samples, pool: estimatePool(db, criteria) }
}

// ---------- TPO: pending list and review ----------

export interface PendingDrive extends DriveDetail {
  company_id: number
}

/** Drives open to a department (no department rows means every department). */
export const DEPT_FILTER_SQL = `(:dept IS NULL
  OR NOT EXISTS (SELECT 1 FROM drive_departments x WHERE x.drive_id = d.id)
  OR EXISTS (SELECT 1 FROM drive_departments x WHERE x.drive_id = d.id AND x.department_id = :dept))`

export function listPendingDrives(db: DB, departmentId: number | null): PendingDrive[] {
  const rows = db
    .prepare(`${DRIVE_SELECT} WHERE d.status = 'PENDING_APPROVAL' AND ${DEPT_FILTER_SQL} ORDER BY d.submitted_at ASC, d.id ASC`)
    .all({ dept: departmentId }) as DriveRow[]
  return rows.map((r) => ({ ...toDetail(db, r), company_id: r.company_id }))
}

export const reviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('reject'),
    reason: z.string({ error: 'A reason is required' }).trim().min(10, 'Give a reason of at least 10 characters'),
  }),
])

export function reviewDrive(db: DB, tpo: SessionUser, driveId: number, input: unknown) {
  const review = reviewSchema.parse(input)
  return db.transaction(() => {
    const drive = db.prepare(`${DRIVE_SELECT} WHERE d.id = ?`).get(driveId) as DriveRow | undefined
    if (!drive) throw notFound('Drive not found')
    if (drive.status !== 'PENDING_APPROVAL') {
      throw new ApiError(409, 'NOT_PENDING', 'This drive is not awaiting approval')
    }
    const at = nowIso()
    if (review.action === 'approve') {
      db.prepare(`UPDATE drives SET status = 'OPEN', approved_by = ?, approved_at = ?, updated_at = ?, rejection_reason = NULL WHERE id = ?`)
        .run(tpo.id, at, at, drive.id)
      writeAudit(db, {
        actorId: tpo.id, action: 'DRIVE_APPROVED', entityType: 'drive', entityId: drive.id,
        oldValue: { status: 'PENDING_APPROVAL' }, newValue: { status: 'OPEN' },
      })
      if (drive.created_by) {
        notify(db, drive.created_by, 'Drive approved', `${drive.title} was approved and is now open to eligible students.`)
      }
      return { id: drive.id, status: 'OPEN' as const }
    }
    db.prepare(`UPDATE drives SET status = 'DRAFT', rejection_reason = ?, updated_at = ? WHERE id = ?`).run(review.reason, at, drive.id)
    writeAudit(db, {
      actorId: tpo.id, action: 'DRIVE_REJECTED', entityType: 'drive', entityId: drive.id,
      oldValue: { status: 'PENDING_APPROVAL' }, newValue: { status: 'DRAFT', reason: review.reason },
    })
    if (drive.created_by) {
      notify(db, drive.created_by, 'Drive returned', `${drive.title} was returned by the TPO: ${review.reason}`)
    }
    return { id: drive.id, status: 'DRAFT' as const }
  })()
}
