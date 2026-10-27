import { describe, expect, it } from 'vitest'
import { openDb } from '@/server/db/client'
import { seedDatabase } from '@/server/db/seed'
import { freshDb } from './helpers'

const count = (db: ReturnType<typeof openDb>, sql: string) => (db.prepare(sql).get() as { n: number }).n

describe('seed data', () => {
  const db = freshDb()

  it('matches the demo story', () => {
    expect(count(db, "SELECT COUNT(*) n FROM drives WHERE status = 'OPEN'")).toBe(6)
    expect(count(db, "SELECT COUNT(*) n FROM drives WHERE status = 'PENDING_APPROVAL'")).toBe(3)
    expect(count(db, "SELECT COUNT(*) n FROM drives WHERE status = 'DRAFT'")).toBe(1)
    expect(count(db, "SELECT COUNT(*) n FROM students WHERE graduation_year = 2027")).toBe(30)
    expect(count(db, "SELECT COUNT(*) n FROM students WHERE graduation_year = 2027 AND verification_status = 'VERIFIED'")).toBe(27)
    expect(count(db, "SELECT COUNT(*) n FROM students WHERE placement_status = 'PLACED'")).toBe(12)
    expect(count(db, "SELECT COUNT(*) n FROM offers WHERE status = 'ACCEPTED'")).toBe(12)
    expect(count(db, "SELECT COUNT(*) n FROM users WHERE is_active = 0")).toBe(1)
  })

  it('only marks students PLACED when they hold an accepted offer', () => {
    expect(
      count(db, `SELECT COUNT(*) n FROM students s WHERE s.placement_status = 'PLACED' AND NOT EXISTS (
        SELECT 1 FROM applications a JOIN offers o ON o.application_id = a.id
        WHERE a.student_id = s.user_id AND o.status = 'ACCEPTED')`),
    ).toBe(0)
  })

  it('stores every timestamp as a UTC ISO string so text sorting is chronological', () => {
    const columns: [string, string][] = [
      ['users', 'created_at'], ['drives', 'created_at'], ['drives', 'updated_at'], ['drives', 'submitted_at'],
      ['drives', 'approved_at'], ['applications', 'applied_at'], ['offers', 'issued_at'], ['offers', 'responded_at'],
      ['notifications', 'created_at'], ['audit_log', 'created_at'], ['students', 'verified_at'],
    ]
    for (const [table, column] of columns) {
      const bad = count(db, `SELECT COUNT(*) n FROM ${table} WHERE ${column} IS NOT NULL AND ${column} NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'`)
      expect(bad, `${table}.${column}`).toBe(0)
    }
  })

  it('is deterministic: seeding twice gives identical rows (apart from the bcrypt salt)', () => {
    const dump = (d: ReturnType<typeof openDb>) =>
      JSON.stringify(
        ['users', 'students', 'drives', 'eligibility_criteria', 'applications', 'offers', 'notifications', 'audit_log'].map((t) =>
          (d.prepare(`SELECT * FROM ${t} ORDER BY 1`).all() as Record<string, unknown>[]).map(({ password_hash, ...rest }) => rest),
        ),
      )
    const other = openDb(':memory:')
    seedDatabase(other)
    expect(dump(other)).toBe(dump(db))
  })
})
