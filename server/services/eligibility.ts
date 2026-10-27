// The single source of truth for "can this student apply to this drive?".
// Used by the live preview, the student drive list, the details dialog, the apply endpoint and the seed.
// Rule order (and therefore reason order): verified profile, department, graduation year, CGPA,
// active backlogs, dead backlogs, 10th %, 12th %, already placed. A NULL criterion means "no constraint".

import type { DB } from '../db/client'

export interface Criteria {
  min_cgpa: number | null
  max_active_backlogs: number | null
  max_dead_backlogs: number | null
  min_tenth_pct: number | null
  min_twelfth_pct: number | null
  allowed_graduation_year: number | null
  allow_already_placed: boolean
  /** Eligible department names. Empty means every department. */
  departments: string[]
}

export interface StudentFacts {
  verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED'
  department_name: string
  graduation_year: number
  cgpa: number
  active_backlogs: number
  dead_backlogs: number
  tenth_pct: number
  twelfth_pct: number
  placement_status: 'UNPLACED' | 'PLACED'
}

export type RuleId =
  | 'verified' | 'department' | 'graduation_year' | 'cgpa'
  | 'active_backlogs' | 'dead_backlogs' | 'tenth_pct' | 'twelfth_pct' | 'placed'

export interface Check {
  rule: RuleId
  label: string
  required: string
  actual: string
  passed: boolean
  /** Reason text shown to the student when this rule fails; null when it passed. */
  reason: string | null
}

export interface EligibilityResult {
  eligible: boolean
  checks: Check[]
  reasons: string[]
}

export const NO_CRITERIA: Criteria = {
  min_cgpa: null,
  max_active_backlogs: null,
  max_dead_backlogs: null,
  min_tenth_pct: null,
  min_twelfth_pct: null,
  allowed_graduation_year: null,
  allow_already_placed: false,
  departments: [],
}

const num = (n: number) => String(Math.round(n * 100) / 100)

export const verificationReason = (status: StudentFacts['verification_status']) =>
  `Your profile is ${status.toLowerCase()}. It must be verified before you can apply`
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

export function evaluateEligibility(student: StudentFacts, c: Criteria): EligibilityResult {
  const checks: Check[] = []
  const add = (rule: RuleId, label: string, required: string, actual: string, passed: boolean, reason: string) =>
    checks.push({ rule, label, required, actual, passed, reason: passed ? null : reason })

  const verified = student.verification_status === 'VERIFIED'
  add(
    'verified', 'Verified profile', 'Verified by TPO', title(student.verification_status), verified,
    verificationReason(student.verification_status),
  )

  if (c.departments.length > 0) {
    add(
      'department', 'Department', c.departments.join(', '), student.department_name,
      c.departments.includes(student.department_name),
      `Department ${student.department_name} is not eligible (${c.departments.join(', ')} only)`,
    )
  }
  if (c.allowed_graduation_year !== null) {
    add(
      'graduation_year', 'Graduation year', String(c.allowed_graduation_year), String(student.graduation_year),
      student.graduation_year === c.allowed_graduation_year,
      `Graduation year ${student.graduation_year} does not match ${c.allowed_graduation_year}`,
    )
  }
  if (c.min_cgpa !== null) {
    add(
      'cgpa', 'CGPA', `${num(c.min_cgpa)} or higher`, num(student.cgpa), student.cgpa >= c.min_cgpa,
      `CGPA ${num(student.cgpa)} is below the required ${num(c.min_cgpa)}`,
    )
  }
  if (c.max_active_backlogs !== null) {
    add(
      'active_backlogs', 'Active backlogs', `${c.max_active_backlogs} or fewer`, String(student.active_backlogs),
      student.active_backlogs <= c.max_active_backlogs,
      `Active backlogs ${student.active_backlogs} exceed the maximum of ${c.max_active_backlogs}`,
    )
  }
  if (c.max_dead_backlogs !== null) {
    add(
      'dead_backlogs', 'Dead backlogs', `${c.max_dead_backlogs} or fewer`, String(student.dead_backlogs),
      student.dead_backlogs <= c.max_dead_backlogs,
      `Dead backlogs ${student.dead_backlogs} exceed the maximum of ${c.max_dead_backlogs}`,
    )
  }
  if (c.min_tenth_pct !== null) {
    add(
      'tenth_pct', '10th percentage', `${num(c.min_tenth_pct)}% or higher`, `${num(student.tenth_pct)}%`,
      student.tenth_pct >= c.min_tenth_pct,
      `10th percentage ${num(student.tenth_pct)} is below the required ${num(c.min_tenth_pct)}`,
    )
  }
  if (c.min_twelfth_pct !== null) {
    add(
      'twelfth_pct', '12th percentage', `${num(c.min_twelfth_pct)}% or higher`, `${num(student.twelfth_pct)}%`,
      student.twelfth_pct >= c.min_twelfth_pct,
      `12th percentage ${num(student.twelfth_pct)} is below the required ${num(c.min_twelfth_pct)}`,
    )
  }
  if (!c.allow_already_placed) {
    add(
      'placed', 'Not already placed', 'Unplaced', title(student.placement_status),
      student.placement_status !== 'PLACED',
      'Already placed students cannot apply to this drive',
    )
  }

  const reasons = checks.filter((k) => !k.passed).map((k) => k.reason as string)
  return { eligible: reasons.length === 0, checks, reasons }
}

// ---------- database helpers ----------

interface CriteriaRow {
  min_cgpa: number | null
  max_active_backlogs: number | null
  max_dead_backlogs: number | null
  min_tenth_pct: number | null
  min_twelfth_pct: number | null
  allowed_graduation_year: number | null
  allow_already_placed: number
}

export function loadCriteria(db: DB, driveId: number): Criteria {
  const row = db.prepare('SELECT * FROM eligibility_criteria WHERE drive_id = ?').get(driveId) as CriteriaRow | undefined
  const departments = db
    .prepare('SELECT d.name FROM drive_departments dd JOIN departments d ON d.id = dd.department_id WHERE dd.drive_id = ? ORDER BY d.id')
    .all(driveId) as { name: string }[]
  if (!row) return { ...NO_CRITERIA, departments: departments.map((d) => d.name) }
  return {
    min_cgpa: row.min_cgpa,
    max_active_backlogs: row.max_active_backlogs,
    max_dead_backlogs: row.max_dead_backlogs,
    min_tenth_pct: row.min_tenth_pct,
    min_twelfth_pct: row.min_twelfth_pct,
    allowed_graduation_year: row.allowed_graduation_year,
    allow_already_placed: row.allow_already_placed === 1,
    departments: departments.map((d) => d.name),
  }
}

const STUDENT_SELECT = `
  SELECT s.verification_status, d.name AS department_name, s.graduation_year, s.cgpa,
         s.active_backlogs, s.dead_backlogs, s.tenth_pct, s.twelfth_pct, s.placement_status
  FROM students s JOIN departments d ON d.id = s.department_id`

export function loadStudentFacts(db: DB, userId: number): StudentFacts | null {
  return (db.prepare(`${STUDENT_SELECT} WHERE s.user_id = ?`).get(userId) as StudentFacts | undefined) ?? null
}

/** Of the VERIFIED students in the chosen graduation year, how many qualify? */
export function estimatePool(db: DB, criteria: Criteria) {
  const where = criteria.allowed_graduation_year === null ? '' : 'AND s.graduation_year = ?'
  const params = criteria.allowed_graduation_year === null ? [] : [criteria.allowed_graduation_year]
  const pool = db
    .prepare(`${STUDENT_SELECT} WHERE s.verification_status = 'VERIFIED' ${where}`)
    .all(...params) as StudentFacts[]
  const qualifying = pool.filter((s) => evaluateEligibility(s, criteria).eligible).length
  return {
    pool_size: pool.length,
    qualifying,
    percent: pool.length === 0 ? 0 : Math.round((qualifying / pool.length) * 100),
  }
}
