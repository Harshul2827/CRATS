import { SignJWT, jwtVerify } from 'jose'
import type { Role } from '../../lib/demo-accounts'

export const SESSION_COOKIE = 'crats_session'
export const SESSION_HOURS = 8

// Only used when SESSION_SECRET is not set (local demo). Set SESSION_SECRET in .env.local to override.
const DEV_SECRET = 'crats-dev-secret-change-me-before-sharing-this-app'

function key() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || DEV_SECRET)
}

export interface SessionClaims {
  userId: number
  role: Role
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(claims.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key())
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    const userId = Number(payload.sub)
    if (!Number.isInteger(userId) || typeof payload.role !== 'string') return null
    return { userId, role: payload.role as Role }
  } catch {
    return null
  }
}

/**
 * Cookie settings. `Secure` is only set when the request really arrived over HTTPS (directly or via a proxy),
 * so the demo also works over plain http on a LAN address, while a real HTTPS deployment is protected.
 */
export function sessionCookieOptions(request: Request) {
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '')
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: proto === 'https',
    maxAge: SESSION_HOURS * 60 * 60,
  }
}

/** Reads one cookie from a raw Cookie header (works for any Request, including in tests). */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}
