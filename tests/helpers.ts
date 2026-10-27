import { openDb, setDb, type DB } from '@/server/db/client'
import { seedDatabase } from '@/server/db/seed'
import { clearLoginAttempts } from '@/server/auth/login'
import { DEMO_PASSWORD } from '@/lib/demo-accounts'
import { POST as loginRoute } from '@/app/api/auth/login/route'

export const EMAILS = {
  tpo: 'tpo@spit.edu',
  priya: 'priya.mehta@technova.com',
  rahul: 'rahul.verma@cloudwave.io', // a recruiter at a different company
  aarav: 'aarav.patel@spit.edu',
  neha: 'neha.joshi@spit.edu',
  rohan: 'rohan.shah@spit.edu',
  deactivated: 'deepak.nair@nimbussoft.com',
}

/** A fresh in-memory database with the full seed, wired in as the app's shared connection. */
export function freshDb(): DB {
  const db = openDb(':memory:')
  seedDatabase(db)
  setDb(db)
  clearLoginAttempts()
  return db
}

export function jsonRequest(url: string, method: string, body?: unknown, cookie?: string) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** Signs in through the real login route and returns the Cookie header to send on later requests. */
export async function login(email: string, password = DEMO_PASSWORD): Promise<string> {
  const res = await loginRoute(jsonRequest('/api/auth/login', 'POST', { email, password }))
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`)
  const setCookie = res.headers.get('set-cookie') ?? ''
  return setCookie.split(';')[0]
}

export const idCtx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

export function userId(db: DB, email: string): number {
  return (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number }).id
}

export function driveId(db: DB, title: string): number {
  return (db.prepare('SELECT id FROM drives WHERE title = ?').get(title) as { id: number }).id
}
