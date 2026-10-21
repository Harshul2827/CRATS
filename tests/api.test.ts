import { beforeEach, describe, expect, it } from 'vitest'
import type { DB } from '@/server/db/client'
import { DEMO_PASSWORD } from '@/lib/demo-accounts'
import { POST as loginRoute } from '@/app/api/auth/login/route'
import { GET as dashboardRoute } from '@/app/api/dashboard/route'
import { GET as driveRoute } from '@/app/api/drives/[id]/route'
import { POST as reviewRoute } from '@/app/api/drives/[id]/review/route'
import { GET as draftGet, PUT as draftPut } from '@/app/api/draft/route'
import { POST as submitRoute } from '@/app/api/draft/submit/route'
import { POST as previewRoute } from '@/app/api/eligibility/preview/route'
import { GET as studentDrives } from '@/app/api/student/drives/route'
import { POST as applyRoute } from '@/app/api/student/drives/[id]/apply/route'
import { GET as notificationsGet } from '@/app/api/notifications/route'
import { POST as notificationsRead } from '@/app/api/notifications/read/route'
import { driveId, EMAILS, freshDb, idCtx, jsonRequest, login, userId } from './helpers'

let db: DB
beforeEach(() => {
  db = freshDb()
})

const get = (url: string, cookie?: string) => jsonRequest(url, 'GET', undefined, cookie)
const body = async (res: Response) => (await res.json()) as any

describe('authentication', () => {
  it('signs in with the right password and sets an httpOnly session cookie', async () => {
    const res = await loginRoute(jsonRequest('/api/auth/login', 'POST', { email: EMAILS.aarav, password: DEMO_PASSWORD }))
    expect(res.status).toBe(200)
    expect((await body(res)).home).toBe('/open-drives')
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/crats_session=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=lax/i)
  })

  it('gives one generic message for a wrong password and for an unknown email', async () => {
    const wrong = await loginRoute(jsonRequest('/api/auth/login', 'POST', { email: EMAILS.aarav, password: 'nope-nope' }))
    const unknown = await loginRoute(jsonRequest('/api/auth/login', 'POST', { email: 'nobody@spit.edu', password: 'nope-nope' }))
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect((await body(wrong)).error.message).toBe('Email or password is incorrect')
    expect((await body(unknown)).error.message).toBe('Email or password is incorrect')
  })

  it('blocks a deactivated user, but only after the right password', async () => {
    const res = await loginRoute(jsonRequest('/api/auth/login', 'POST', { email: EMAILS.deactivated, password: DEMO_PASSWORD }))
    expect(res.status).toBe(403)
    expect((await body(res)).error.message).toBe('This account is not active')
    const wrongPassword = await loginRoute(jsonRequest('/api/auth/login', 'POST', { email: EMAILS.deactivated, password: 'wrong-pass' }))
    expect((await body(wrongPassword)).error.message).toBe('Email or password is incorrect')
  })

  it('locks an email for 5 minutes after 5 failures', async () => {
    for (let i = 0; i < 5; i++) {
      await loginRoute(jsonRequest('/api/auth/login', 'POST', { email: EMAILS.aarav, password: 'wrong-pass' }))
    }
    const locked = await loginRoute(jsonRequest('/api/auth/login', 'POST', { email: EMAILS.aarav, password: DEMO_PASSWORD }))
    expect(locked.status).toBe(429)
  })

  it('treats a user who is deactivated after signing in as signed out', async () => {
    const cookie = await login(EMAILS.aarav)
    expect((await studentDrives(get('/api/student/drives', cookie))).status).toBe(200)
    db.prepare('UPDATE users SET is_active = 0 WHERE email = ?').run(EMAILS.aarav)
    expect((await studentDrives(get('/api/student/drives', cookie))).status).toBe(401)
  })
})

describe('access control', () => {
  it('returns 401 without a session and 403 when the role lacks the permission', async () => {
    expect((await dashboardRoute(get('/api/dashboard'))).status).toBe(401)
    const student = await login(EMAILS.aarav)
    const res = await dashboardRoute(get('/api/dashboard', student))
    expect(res.status).toBe(403)
    expect((await body(res)).error.code).toBe('FORBIDDEN')
  })

  it('lets a student see only OPEN drives', async () => {
    const cookie = await login(EMAILS.aarav)
    const list = await body(await studentDrives(get('/api/student/drives', cookie)))
    expect(list.counts.all).toBe(6)
    const open = db.prepare("SELECT id FROM drives WHERE status = 'OPEN'").all() as { id: number }[]
    expect(list.items.map((i: { id: number }) => i.id).sort()).toEqual(open.map((d) => d.id).sort())

    for (const status of ['DRAFT', 'PENDING_APPROVAL', 'COMPLETED', 'CLOSED']) {
      const hidden = db.prepare('SELECT id FROM drives WHERE status = ? LIMIT 1').get(status) as { id: number }
      const res = await driveRoute(get(`/api/drives/${hidden.id}`, cookie), idCtx(hidden.id))
      expect(res.status, status).toBe(404)
    }
  })

  it("does not let a recruiter read another company's draft or drives", async () => {
    const productEngineer = driveId(db, 'Product Engineer') // TechNova's draft
    const priya = await login(EMAILS.priya)
    const own = await body(await draftGet(get('/api/draft', priya)))
    expect(own.draft.drive.title).toBe('Product Engineer')

    const rahul = await login(EMAILS.rahul) // CloudWave
    const theirs = await body(await draftGet(get('/api/draft', rahul)))
    expect(theirs.draft).toBeNull()
    expect((await driveRoute(get(`/api/drives/${productEngineer}`, rahul), idCtx(productEngineer))).status).toBe(404)
    const save = await draftPut(jsonRequest('/api/draft', 'PUT', { criteria: { min_twelfth_pct: 70, allowed_graduation_year: 2027 } }, rahul))
    expect(save.status).toBe(404)
  })
})

describe('applying', () => {
  it('applies once, freezes the resume, audits and notifies; a second click is a 409', async () => {
    const cookie = await login(EMAILS.aarav)
    const backend = driveId(db, 'Backend Software Engineer')
    const aarav = userId(db, EMAILS.aarav)

    const first = await applyRoute(jsonRequest(`/api/student/drives/${backend}/apply`, 'POST', undefined, cookie), idCtx(backend))
    expect(first.status).toBe(201)
    const app = db.prepare('SELECT status, resume_snapshot_url FROM applications WHERE drive_id = ? AND student_id = ?').get(backend, aarav) as any
    expect(app.status).toBe('APPLIED')
    expect(app.resume_snapshot_url).toBe('/resumes/aarav-patel.pdf')
    expect(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'APPLICATION_CREATED' AND actor_id = ?").get(aarav)).toEqual({ n: 1 })
    expect(db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND title = 'Application submitted'").get(aarav)).toEqual({ n: 2 }) // seeded + new

    const second = await applyRoute(jsonRequest(`/api/student/drives/${backend}/apply`, 'POST', undefined, cookie), idCtx(backend))
    expect(second.status).toBe(409)
    expect((await body(second)).error.message).toBe('You have already applied')
    expect(db.prepare('SELECT COUNT(*) n FROM applications WHERE drive_id = ? AND student_id = ?').get(backend, aarav)).toEqual({ n: 1 })
  })

  it('refuses an ineligible student with the exact reasons', async () => {
    const cookie = await login(EMAILS.aarav)
    const quant = driveId(db, 'Quant Developer')
    const res = await applyRoute(jsonRequest(`/api/student/drives/${quant}/apply`, 'POST', undefined, cookie), idCtx(quant))
    expect(res.status).toBe(403)
    const error = (await body(res)).error
    expect(error.code).toBe('NOT_ELIGIBLE')
    expect(error.reasons).toEqual(['CGPA 8.2 is below the required 8.5'])
  })

  it('refuses an unverified student', async () => {
    db.prepare("UPDATE students SET verification_status = 'PENDING' WHERE user_id = ?").run(userId(db, EMAILS.aarav))
    const cookie = await login(EMAILS.aarav)
    const backend = driveId(db, 'Backend Software Engineer')
    const res = await applyRoute(jsonRequest(`/api/student/drives/${backend}/apply`, 'POST', undefined, cookie), idCtx(backend))
    expect(res.status).toBe(403)
    expect((await body(res)).error.code).toBe('NOT_VERIFIED')
  })

  it('refuses an application after the deadline', async () => {
    const cookie = await login(EMAILS.aarav)
    const backend = driveId(db, 'Backend Software Engineer')
    db.prepare("UPDATE drives SET deadline = '2026-10-10' WHERE id = ?").run(backend)
    const res = await applyRoute(jsonRequest(`/api/student/drives/${backend}/apply`, 'POST', undefined, cookie), idCtx(backend))
    expect(res.status).toBe(422)
    expect((await body(res)).error.code).toBe('DEADLINE_PASSED')
  })

  it('marks a drive as applied and filters by status', async () => {
    const cookie = await login(EMAILS.aarav)
    const list = await body(await studentDrives(get('/api/student/drives?filter=applied', cookie)))
    expect(list.items.map((i: { title: string }) => i.title)).toEqual(['Frontend Developer Intern'])
    expect(list.items[0].applied_label).toBe('Applied on 12 Oct 2026')
    const all = await body(await studentDrives(get('/api/student/drives', cookie)))
    expect(all.counts).toEqual({ all: 6, eligible: 3, not_eligible: 2, applied: 1 })
  })
})

describe('TPO review', () => {
  const pendingId = () => driveId(db, 'DevOps Engineer')
  const review = async (payload: unknown, id = pendingId()) =>
    reviewRoute(jsonRequest(`/api/drives/${id}/review`, 'POST', payload, await login(EMAILS.tpo)), idCtx(id))

  it('requires a reason to reject', async () => {
    const res = await review({ action: 'reject', reason: '   ' })
    expect(res.status).toBe(422)
    expect((await body(res)).error.fields.reason).toBeTruthy()
    expect((db.prepare('SELECT status FROM drives WHERE id = ?').get(pendingId()) as any).status).toBe('PENDING_APPROVAL')
  })

  it('approves: the drive opens, an audit row is written and the recruiter is notified', async () => {
    const id = pendingId()
    const before = (db.prepare('SELECT COUNT(*) n FROM audit_log').get() as any).n
    const res = await review({ action: 'approve' })
    expect(res.status).toBe(200)
    const drive = db.prepare('SELECT status, approved_by, approved_at FROM drives WHERE id = ?').get(id) as any
    expect(drive.status).toBe('OPEN')
    expect(drive.approved_by).toBe(userId(db, EMAILS.tpo))
    expect((db.prepare('SELECT COUNT(*) n FROM audit_log').get() as any).n).toBe(before + 1)
    const audit = db.prepare('SELECT action, entity_id FROM audit_log ORDER BY id DESC LIMIT 1').get() as any
    expect(audit).toEqual({ action: 'DRIVE_APPROVED', entity_id: id })
    const karan = userId(db, 'karan.malhotra@nimbussoft.com')
    expect(db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND title = 'Drive approved'").get(karan)).toEqual({ n: 1 })
  })

  it('rejects: back to DRAFT with the reason, audited and notified', async () => {
    const id = pendingId()
    const res = await review({ action: 'reject', reason: 'Please add the 12th percentage requirement' })
    expect(res.status).toBe(200)
    const drive = db.prepare('SELECT status, rejection_reason FROM drives WHERE id = ?').get(id) as any
    expect(drive).toEqual({ status: 'DRAFT', rejection_reason: 'Please add the 12th percentage requirement' })
    expect((db.prepare('SELECT action FROM audit_log ORDER BY id DESC LIMIT 1').get() as any).action).toBe('DRIVE_REJECTED')
    const karan = userId(db, 'karan.malhotra@nimbussoft.com')
    expect(db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND title = 'Drive returned'").get(karan)).toEqual({ n: 1 })
  })

  it('only reviews drives that are pending', async () => {
    const open = driveId(db, 'Quant Developer')
    expect((await review({ action: 'approve' }, open)).status).toBe(409)
  })

  it('stops a recruiter from reviewing', async () => {
    const id = pendingId()
    const res = await reviewRoute(jsonRequest(`/api/drives/${id}/review`, 'POST', { action: 'approve' }, await login(EMAILS.priya)), idCtx(id))
    expect(res.status).toBe(403)
  })
})

describe('recruiter draft', () => {
  it('returns field errors for the missing 12th percentage, then saves and submits', async () => {
    const cookie = await login(EMAILS.priya)
    const draft = await body(await draftGet(get('/api/draft', cookie)))
    expect(draft.draft.drive.rejection_reason).toMatch(/12th percentage is missing/)
    expect(draft.draft.drive.criteria.min_twelfth_pct).toBeNull()

    const bad = await draftPut(jsonRequest('/api/draft', 'PUT', { criteria: { ...draft.draft.drive.criteria, min_cgpa: 11, min_twelfth_pct: null } }, cookie))
    expect(bad.status).toBe(422)
    const fields = (await body(bad)).error.fields
    expect(fields.min_twelfth_pct).toBe('Minimum 12th percentage is required')
    expect(fields.min_cgpa).toBe('CGPA must be between 0 and 10')

    const ok = await draftPut(jsonRequest('/api/draft', 'PUT', { criteria: { ...draft.draft.drive.criteria, min_twelfth_pct: 75 } }, cookie))
    expect(ok.status).toBe(200)

    const submitted = await body(await submitRoute(jsonRequest('/api/draft/submit', 'POST', undefined, cookie)))
    expect(submitted.draft.drive.status).toBe('PENDING_APPROVAL')
    expect(submitted.draft.drive.reference_id).toMatch(/^DRV-2026-\d{4}$/)
    expect(submitted.draft.read_only).toBe(true)
    const again = await draftPut(jsonRequest('/api/draft', 'PUT', { criteria: { ...draft.draft.drive.criteria, min_twelfth_pct: 80 } }, cookie))
    expect(again.status).toBe(409)
    const tpo = userId(db, EMAILS.tpo)
    expect(db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND is_read = 0").get(tpo)).toEqual({ n: 4 })
  })

  it('previews the sample students and the real pool percentage', async () => {
    const cookie = await login(EMAILS.priya)
    const criteria = { min_cgpa: 7.5, max_active_backlogs: 0, max_dead_backlogs: 1, min_tenth_pct: 75, min_twelfth_pct: 75, allowed_graduation_year: 2027, allow_already_placed: false }
    const preview = await body(await previewRoute(jsonRequest('/api/eligibility/preview', 'POST', { criteria }, cookie)))
    expect(preview.samples.map((s: any) => [s.name, s.eligible])).toEqual([
      ['Aarav Patel', true], ['Neha Joshi', false], ['Rohan Shah', false],
    ])
    expect(preview.samples[1].reasons).toEqual(['CGPA 7.1 is below the required 7.5'])
    expect(preview.pool).toEqual({ pool_size: 27, qualifying: 16, percent: 59 })
  })
})

describe('dashboard', () => {
  it('computes every figure from the rows and honours the department filter', async () => {
    const cookie = await login(EMAILS.tpo)
    const all = await body(await dashboardRoute(get('/api/dashboard', cookie)))
    expect(all.kpis.registered.value).toBe(50)
    expect(all.kpis.placed.value).toBe(12)
    expect(all.kpis.open_drives.value).toBe(6)
    expect(all.kpis.pending.value).toBe(3)
    expect(all.kpis.avg_ctc.value).toBe(10.1)
    expect(all.funnel.map((f: any) => f.count)).toEqual([105, 28, 15, 12])
    expect(all.top_companies[0]).toEqual({ name: 'TechNova Solutions', offers: 4 })
    expect(all.trend.weeks).toHaveLength(12)
    expect(all.trend.weeks[11].cumulative).toBe(12)
    expect(all.activity.map((a: any) => a.text)).toEqual([
      'You approved Backend Software Engineer (TechNova Solutions)',
      'You rejected Product Engineer: 12th percentage missing',
      'Round 1 results published for Cloud Engineer Trainee',
      'Finserve Analytics registered as a company',
      'Prof. Sunita Rao verified 14 student profiles',
    ])
    expect(all.activity.map((a: any) => a.time)).toEqual(['2 hours ago', 'yesterday', 'yesterday', '2 days ago', '2 days ago'])

    const mech = (db.prepare("SELECT id FROM departments WHERE name = 'Mechanical Engineering'").get() as any).id
    const filtered = await body(await dashboardRoute(get(`/api/dashboard?department=${mech}`, cookie)))
    expect(filtered.kpis.registered.value).toBe(8)
    expect(filtered.kpis.placed.value).toBe(2)
    expect(filtered.departments_chart.items).toHaveLength(1)

    const week = await body(await dashboardRoute(get('/api/dashboard?range=7d', cookie)))
    expect(week.funnel[0].count).toBeLessThan(all.funnel[0].count)
  })

  it('changes after an approval', async () => {
    const tpo = await login(EMAILS.tpo)
    const id = driveId(db, 'DevOps Engineer')
    await reviewRoute(jsonRequest(`/api/drives/${id}/review`, 'POST', { action: 'approve' }, tpo), idCtx(id))
    const after = await body(await dashboardRoute(get('/api/dashboard', tpo)))
    expect(after.kpis.open_drives.value).toBe(7)
    expect(after.kpis.pending.value).toBe(2)
    expect(after.activity[0].text).toBe('You approved DevOps Engineer (NimbusSoft)')
  })
})

describe('notifications and audit', () => {
  it("marks only the signed-in user's notifications as read", async () => {
    const aarav = await login(EMAILS.aarav)
    const before = await body(await notificationsGet(get('/api/notifications', aarav)))
    expect(before.unread).toBe(1)
    const priyaNote = db.prepare('SELECT id FROM notifications WHERE user_id = ? LIMIT 1').get(userId(db, EMAILS.priya)) as { id: number }
    await notificationsRead(jsonRequest('/api/notifications/read', 'POST', { ids: [priyaNote.id] }, aarav))
    expect((db.prepare('SELECT is_read FROM notifications WHERE id = ?').get(priyaNote.id) as any).is_read).toBe(0)
    const after = await body(await notificationsRead(jsonRequest('/api/notifications/read', 'POST', {}, aarav)))
    expect(after.unread).toBe(0)
  })

  it('keeps the audit log append-only', () => {
    expect(() => db.prepare("UPDATE audit_log SET action = 'X'").run()).toThrow(/append-only/)
    expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/)
  })
})
