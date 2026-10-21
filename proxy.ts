// Next 16 renamed middleware.ts to proxy.ts. It keeps the app at exactly three pages:
//   "/" and any unknown path  -> the signed-in user's own page (or /dashboard when signed out)
//   a page that belongs to another role -> the signed-in user's own page
// Signed-out visitors may open any of the three pages; the page itself shows the sign-in dialog.
// This is only navigation. Authorization is enforced again by every API route.
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/server/auth/session'
import { ROLE_HOME } from '@/lib/demo-accounts'

const PAGE_ROLE: Record<string, string> = {
  '/dashboard': 'tpo',
  '/create-drive': 'recruiter',
  '/open-drives': 'student',
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const claims = await verifySession(request.cookies.get(SESSION_COOKIE)?.value)
  const home = claims ? ROLE_HOME[claims.role] : '/dashboard'

  const owner = PAGE_ROLE[pathname]
  if (owner && (!claims || claims.role === owner)) return NextResponse.next()
  return NextResponse.redirect(new URL(home, request.url))
}

export const config = {
  // Everything except the API, Next internals and files with an extension (icons, images).
  matcher: ['/((?!api|_next|__nextjs|.*\\..*).*)'],
}
