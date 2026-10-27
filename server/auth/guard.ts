import type { DB } from '../db/client'
import { getDb } from '../db/client'
import { forbidden, unauthorized } from '../lib/http'
import { can, type Permission } from './permissions'
import { SESSION_COOKIE, readCookie, verifySession } from './session'
import type { Role } from '../../lib/demo-accounts'

export interface SessionUser {
  id: number
  name: string
  email: string
  role: Role
}

/** Resolves the signed-in user from the session cookie. Deactivated users count as signed out. */
export async function getSessionUser(request: Request, db: DB = getDb()): Promise<SessionUser | null> {
  const claims = await verifySession(readCookie(request, SESSION_COOKIE))
  if (!claims) return null
  const row = db
    .prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?')
    .get(claims.userId) as (SessionUser & { is_active: number }) | undefined
  if (!row || !row.is_active) return null
  return { id: row.id, name: row.name, email: row.email, role: row.role }
}

/** 401 when signed out, 403 when the role lacks the permission. Returns the user and the database. */
export async function requirePermission(request: Request, permission: Permission, db: DB = getDb()) {
  const user = await getSessionUser(request, db)
  if (!user) throw unauthorized()
  if (!can(user.role, permission)) throw forbidden()
  return { user, db }
}
