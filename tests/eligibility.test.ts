import { beforeAll, describe, expect, it } from 'vitest'
import type { DB } from '@/server/db/client'
import {
  estimatePool, evaluateEligibility, loadCriteria, loadStudentFacts, NO_CRITERIA,
} from '@/server/services/eligibility'
import { driveId, EMAILS, freshDb, userId } from './helpers'

let db: DB
beforeAll(() => {
  db = freshDb()
})

const aarav = () => loadStudentFacts(db, userId(db, EMAILS.aarav))!

describe('shared eligibility function', () => {
  it('passes Aarav for the drives he can apply to', () => {
    for (const title of ['Backend Software Engineer', 'Cloud Engineer Trainee', 'Product Analyst']) {
      expect(evaluateEligibility(aarav(), loadCriteria(db, driveId(db, title))).eligible, title).toBe(true)
    }
  })

  it('gives the exact reason text for a CGPA miss', () => {
    const result = evaluateEligibility(aarav(), loadCriteria(db, driveId(db, 'Quant Developer')))
    expect(result.eligible).toBe(false)
    expect(result.reasons).toEqual(['CGPA 8.2 is below the required 8.5'])
  })

  it('lists every unmet rule, in rule order, with the exact wording', () => {
    const result = evaluateEligibility(aarav(), loadCriteria(db, driveId(db, 'Embedded Systems Engineer')))
    expect(result.reasons).toEqual([
      'Department Computer Engineering is not eligible (Electronics & Telecom, Electronics Engineering only)',
      'Graduation year 2027 does not match 2026',
      'Dead backlogs 1 exceed the maximum of 0',
    ])
  })

  it('skips NULL criteria entirely', () => {
    const result = evaluateEligibility(aarav(), { ...NO_CRITERIA, allow_already_placed: true })
    expect(result.eligible).toBe(true)
    expect(result.checks.map((c) => c.rule)).toEqual(['verified'])
  })

  it('requires a verified profile first', () => {
    const result = evaluateEligibility({ ...aarav(), verification_status: 'PENDING' }, { ...NO_CRITERIA, min_cgpa: 7 })
    expect(result.eligible).toBe(false)
    expect(result.reasons[0]).toMatch(/^Your profile is pending/)
  })

  it('rejects already-placed students unless the drive allows them', () => {
    const placed = { ...aarav(), placement_status: 'PLACED' as const }
    expect(evaluateEligibility(placed, NO_CRITERIA).reasons).toEqual(['Already placed students cannot apply to this drive'])
    expect(evaluateEligibility(placed, { ...NO_CRITERIA, allow_already_placed: true }).eligible).toBe(true)
  })

  it('estimates the qualifying share of verified students in the chosen batch', () => {
    const criteria = {
      ...NO_CRITERIA, min_cgpa: 7.5, max_active_backlogs: 0, max_dead_backlogs: 1,
      min_tenth_pct: 75, min_twelfth_pct: 75, allowed_graduation_year: 2027,
    }
    const pool = estimatePool(db, criteria)
    expect(pool.pool_size).toBe(27) // 30 in the 2027 batch, 3 still PENDING verification
    expect(pool.qualifying).toBe(16)
    expect(pool.percent).toBe(59)
  })
})
