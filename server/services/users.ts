import type { DB } from '../db/client'
import { seedDatabase } from '../db/seed'
import type { SessionUser } from '../auth/guard'
import { clearLoginAttempts } from '../auth/login'
import { ROLE_HOME } from '../../lib/demo-accounts'
import { ApiError } from '../lib/http'
import { nowIso } from '../lib/clock'
import { writeAudit } from './audit'
import { notify } from './notifications'
import { shortDepartment } from './drives'
import { isDemoMode } from '../lib/env'

export function requireDemoMode() {
  if (!isDemoMode()) throw new ApiError(404, 'NOT_FOUND', 'Not found')
}

const initialsOf = (name: string) =>
  name.replace(/^(Dr\.|Prof\.)\s+/, '').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()

export function describeUser(db: DB, user: SessionUser) {
  const base = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: initialsOf(user.name),
    header_subtitle: 'SPIT Mumbai',
    sidebar_subtitle: '',
  }
  let student: {
    department: string; graduation_year: number; cgpa: number; verification_status: string
  } | null = null
  let company: { id: number; name: string } | null = null

  if (user.role === 'student') {
    const row = db
      .prepare(
        `SELECT d.name AS department, s.graduation_year, s.cgpa, s.verification_status
         FROM students s JOIN departments d ON d.id = s.department_id WHERE s.user_id = ?`,
      )
      .get(user.id) as { department: string; graduation_year: number; cgpa: number; verification_status: string } | undefined
    if (row) {
      student = row
      base.header_subtitle = 'Student • SPIT'
      base.sidebar_subtitle = `${shortDepartment(row.department)} • ${row.graduation_year}`
    }
  } else if (user.role === 'recruiter') {
    const row = db
      .prepare('SELECT c.id, c.name, r.designation FROM recruiters r JOIN companies c ON c.id = r.company_id WHERE r.user_id = ?')
      .get(user.id) as { id: number; name: string; designation: string } | undefined
    if (row) {
      company = { id: row.id, name: row.name }
      base.header_subtitle = `Recruiter • ${row.name}`
      base.sidebar_subtitle = `${row.designation}, ${row.name}`
    }
  } else {
    base.header_subtitle = 'TPO • SPIT'
    base.sidebar_subtitle = 'Training & Placement Officer'
  }

  return { user: base, student, company, home: ROLE_HOME[user.role], demo_mode: isDemoMode() }
}

// ---------- demo helpers (DEMO_MODE only) ----------

/** Drops everything and loads the seed again. Sessions stay valid because seeded user ids are fixed. */
export function resetDemoData(db: DB) {
  seedDatabase(db)
  clearLoginAttempts()
}

export function setDemoVerification(db: DB, student: SessionUser, status: 'PENDING' | 'VERIFIED') {
  return db.transaction(() => {
    const row = db.prepare('SELECT verification_status FROM students WHERE user_id = ?').get(student.id) as
      | { verification_status: string }
      | undefined
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'This account has no student profile')
    const at = nowIso()
    if (status === 'VERIFIED') {
      const faculty = db.prepare("SELECT id FROM users WHERE role = 'faculty' ORDER BY id LIMIT 1").get() as { id: number } | undefined
      db.prepare("UPDATE students SET verification_status = 'VERIFIED', verified_by = ?, verified_at = ? WHERE user_id = ?")
        .run(faculty?.id ?? null, at, student.id)
    } else {
      db.prepare("UPDATE students SET verification_status = 'PENDING', verified_by = NULL, verified_at = NULL WHERE user_id = ?").run(student.id)
    }
    writeAudit(db, {
      actorId: student.id, action: 'VERIFICATION_CHANGED', entityType: 'student', entityId: student.id,
      oldValue: { status: row.verification_status }, newValue: { status }, at,
    })
    notify(
      db, student.id, status === 'VERIFIED' ? 'Profile verified' : 'Verification pending',
      status === 'VERIFIED' ? 'Your profile is verified. You can apply to eligible drives.' : 'Your profile is awaiting verification. Applications are paused until it is verified.',
    )
    return { verification_status: status }
  })()
}
