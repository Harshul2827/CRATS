import { beforeEach, describe, expect, it } from 'vitest'
import type { DB } from '@/server/db/client'
import { GET as draftGet, PUT as draftPut } from '@/app/api/draft/route'
import { POST as submitRoute } from '@/app/api/draft/submit/route'
import { POST as previewRoute } from '@/app/api/eligibility/preview/route'
import { POST as reviewRoute } from '@/app/api/drives/[id]/review/route'
import { GET as studentDrives } from '@/app/api/student/drives/route'
import { driveId, EMAILS, freshDb, idCtx, jsonRequest, login, userId } from './helpers'

let db: DB
beforeEach(() => {
  db = freshDb()
})

const get = (url: string, cookie?: string) => jsonRequest(url, 'GET', undefined, cookie)
const body = async (res: Response) => (await res.json()) as any

describe('Module A — Drive Creation, Approval & Eligibility', () => {
  it('A-1: student role is blocked from the recruiter-only draft endpoint (SEC-2)', async () => {
    const cookie = await login(EMAILS.aarav)
    const res = await draftGet(get('/api/draft', cookie))
    expect(res.status).toBe(403)
    expect((await body(res)).error.code).toBe('FORBIDDEN')
  })

  it('A-2: student role is blocked from the eligibility preview endpoint (SEC-2)', async () => {
    const cookie = await login(EMAILS.aarav)
    const criteria = { min_cgpa: 7.5, min_twelfth_pct: 75, allowed_graduation_year: 2027 }
    const res = await previewRoute(jsonRequest('/api/eligibility/preview', 'POST', { criteria }, cookie))
    expect(res.status).toBe(403)
    expect((await body(res)).error.code).toBe('FORBIDDEN')
  })

  it('A-3: a rejection reason shorter than 10 characters is rejected with a field error (FR-4.6)', async () => {
    const id = driveId(db, 'DevOps Engineer')
    const tpo = await login(EMAILS.tpo)
    // "Too short" is 9 characters — below the 10-character minimum
    const res = await reviewRoute(
      jsonRequest(`/api/drives/${id}/review`, 'POST', { action: 'reject', reason: 'Too short' }, tpo),
      idCtx(id),
    )
    expect(res.status).toBe(422)
    expect((await body(res)).error.fields.reason).toBeTruthy()
    // Drive must remain PENDING_APPROVAL — the rejection did not go through
    expect((db.prepare('SELECT status FROM drives WHERE id = ?').get(id) as any).status).toBe('PENDING_APPROVAL')
  })

  it('A-4: submitting a draft sends a "Drive awaiting approval" notification to the TPO (FR-10.1)', async () => {
    const tpoId = userId(db, EMAILS.tpo)
    const cookie = await login(EMAILS.priya)
    // Load Priya's draft and fix the missing 12th percentage so it can be submitted
    const draft = await body(await draftGet(get('/api/draft', cookie)))
    await draftPut(
      jsonRequest('/api/draft', 'PUT', { criteria: { ...draft.draft.drive.criteria, min_twelfth_pct: 75 } }, cookie),
    )
    const before = (db
      .prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND title = 'Drive awaiting approval'")
      .get(tpoId) as any).n
    await submitRoute(jsonRequest('/api/draft/submit', 'POST', undefined, cookie))
    const after = (db
      .prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND title = 'Drive awaiting approval'")
      .get(tpoId) as any).n
    expect(after).toBe(before + 1)
  })

  it('A-5: approving a pending drive immediately adds it to the student-visible open drives list (FR-4.7)', async () => {
    const student = await login(EMAILS.aarav)
    const countBefore = (await body(await studentDrives(get('/api/student/drives', student)))).counts.all
    const id = driveId(db, 'DevOps Engineer')
    const tpo = await login(EMAILS.tpo)
    await reviewRoute(
      jsonRequest(`/api/drives/${id}/review`, 'POST', { action: 'approve' }, tpo),
      idCtx(id),
    )
    const countAfter = (await body(await studentDrives(get('/api/student/drives', student)))).counts.all
    expect(countAfter).toBe(countBefore + 1)
  })
})
