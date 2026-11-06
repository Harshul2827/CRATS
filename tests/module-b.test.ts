import { beforeEach, describe, expect, it } from 'vitest'
import type { DB } from '@/server/db/client'
import { GET as studentDrivesRoute } from '@/app/api/student/drives/route'
import { GET as studentDriveDetailRoute } from '@/app/api/student/drives/[id]/route'
import { POST as applyRoute } from '@/app/api/student/drives/[id]/apply/route'
import { driveId, EMAILS, freshDb, idCtx, jsonRequest, login, userId } from './helpers'

let db: DB
beforeEach(() => {
  db = freshDb()
})

const get = (url: string, cookie?: string) => jsonRequest(url, 'GET', undefined, cookie)
const body = async (res: Response) => (await res.json()) as any

describe('Module B — Drive Discovery, Eligibility & Application Tracking', () => {
  it('B-1: drive detail endpoint returns the full eligibility checklist for an eligible drive (FR-5.2)', async () => {
    const cookie = await login(EMAILS.aarav)
    const id = driveId(db, 'Backend Software Engineer')
    const res = await studentDriveDetailRoute(get(`/api/student/drives/${id}`, cookie), idCtx(id))
    expect(res.status).toBe(200)
    const data = await body(res)
    expect(data.status).toBe('eligible')
    expect(data.checks.length).toBeGreaterThan(0)
    expect(data.checks.every((c: any) => c.passed)).toBe(true)
  })

  it('B-2: keyword search filters the drive list to matching titles and companies (FR-5.1)', async () => {
    const cookie = await login(EMAILS.aarav)
    const res = await studentDrivesRoute(get('/api/student/drives?q=quant', cookie))
    expect(res.status).toBe(200)
    const data = await body(res)
    expect(data.items).toHaveLength(1)
    expect(data.items[0].title).toBe('Quant Developer')
  })

  it('B-3: sort by CTC places the highest-paying drive first (FR-5.1)', async () => {
    const cookie = await login(EMAILS.aarav)
    const res = await studentDrivesRoute(get('/api/student/drives?sort=ctc', cookie))
    expect(res.status).toBe(200)
    const items = (await body(res)).items
    // Quant Developer has ctc_value = 20 LPA — the highest of all 6 open drives
    expect(items[0].title).toBe('Quant Developer')
  })

  it('B-4: an already-placed student is refused by a drive that does not allow placed applicants (BR-5)', async () => {
    db.prepare("UPDATE students SET placement_status = 'PLACED' WHERE user_id = ?").run(userId(db, EMAILS.aarav))
    const cookie = await login(EMAILS.aarav)
    const id = driveId(db, 'Backend Software Engineer')
    const res = await applyRoute(
      jsonRequest(`/api/student/drives/${id}/apply`, 'POST', undefined, cookie),
      idCtx(id),
    )
    expect(res.status).toBe(403)
    const error = (await body(res)).error
    expect(error.code).toBe('NOT_ELIGIBLE')
    expect(error.reasons).toContain('Already placed students cannot apply to this drive')
  })

  it('B-5: a student cannot view or apply to a drive that is not yet OPEN (FR-4.7, BR-2)', async () => {
    const cookie = await login(EMAILS.aarav)
    const id = driveId(db, 'DevOps Engineer') // status = PENDING_APPROVAL
    // Detail endpoint returns 404 — existence of non-open drives is not revealed
    const detail = await studentDriveDetailRoute(get(`/api/student/drives/${id}`, cookie), idCtx(id))
    expect(detail.status).toBe(404)
    // Apply endpoint also returns 404 for the same reason
    const apply = await applyRoute(
      jsonRequest(`/api/student/drives/${id}/apply`, 'POST', undefined, cookie),
      idCtx(id),
    )
    expect(apply.status).toBe(404)
  })
})
