import type { Criteria } from '@/server/services/eligibility'

const num = (n: number) => String(Math.round(n * 100) / 100)

/** Human-readable rows for a drive's eligibility criteria. A NULL criterion reads "No limit". */
export function criteriaRows(c: Criteria): { label: string; value: string }[] {
  return [
    { label: 'Minimum CGPA', value: c.min_cgpa === null ? 'No limit' : num(c.min_cgpa) },
    { label: 'Graduation year', value: c.allowed_graduation_year === null ? 'Any batch' : String(c.allowed_graduation_year) },
    { label: 'Maximum active backlogs', value: c.max_active_backlogs === null ? 'No limit' : String(c.max_active_backlogs) },
    { label: 'Maximum dead backlogs', value: c.max_dead_backlogs === null ? 'No limit' : String(c.max_dead_backlogs) },
    { label: 'Minimum 10th percentage', value: c.min_tenth_pct === null ? 'No limit' : `${num(c.min_tenth_pct)}%` },
    { label: 'Minimum 12th percentage', value: c.min_twelfth_pct === null ? 'No limit' : `${num(c.min_twelfth_pct)}%` },
    { label: 'Departments', value: c.departments.length === 0 ? 'All departments' : c.departments.join(', ') },
    { label: 'Already-placed students', value: c.allow_already_placed ? 'May apply' : 'Cannot apply' },
  ]
}
