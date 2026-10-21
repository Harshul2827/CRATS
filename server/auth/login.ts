import bcrypt from 'bcryptjs'
import type { DB } from '../db/client'
import { ApiError } from '../lib/http'
import type { Role } from '../../lib/demo-accounts'

const MAX_FAILURES = 5
const LOCK_MS = 5 * 60 * 1000

interface Attempts {
  failures: number
  lockedUntil: number
}
// Kept on globalThis so every route bundle shares one counter. In memory is enough for a demo.
const holder = globalThis as typeof globalThis & { __cratsLogins?: Map<string, Attempts> }
const attempts = (holder.__cratsLogins ??= new Map<string, Attempts>())

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

export const clearLoginAttempts = () => attempts.clear()

function recordFailure(email: string) {
  const entry = attempts.get(email) ?? { failures: 0, lockedUntil: 0 }
  entry.failures += 1
  if (entry.failures >= MAX_FAILURES) {
    entry.failures = 0
    entry.lockedUntil = Date.now() + LOCK_MS
  }
  attempts.set(email, entry)
}

export interface LoggedInUser {
  id: number
  name: string
  email: string
  role: Role
}

export function authenticate(db: DB, rawEmail: string, password: string): LoggedInUser {
  const email = rawEmail.trim().toLowerCase()
  const entry = attempts.get(email)
  if (entry && entry.lockedUntil > Date.now()) {
    const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000)
    throw new ApiError(429, 'TOO_MANY_ATTEMPTS', `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}`)
  }

  const user = db
    .prepare('SELECT id, name, email, role, password_hash, is_active FROM users WHERE email = ?')
    .get(email) as (LoggedInUser & { password_hash: string; is_active: number }) | undefined

  const matches = bcrypt.compareSync(password, user?.password_hash ?? DUMMY_HASH)
  if (!user || !matches) {
    recordFailure(email)
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
  }
  // Only reveal the account state once the password is right, so this cannot be used to probe emails.
  if (!user.is_active) throw new ApiError(403, 'ACCOUNT_INACTIVE', 'This account is not active')
  if (user.role === 'faculty') {
    throw new ApiError(403, 'NO_ACCESS', 'This account type has no screen in the demo. Sign in as TPO, Recruiter or Student')
  }

  attempts.delete(email)
  return { id: user.id, name: user.name, email: user.email, role: user.role }
}
