import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Auth is now handled by AdminAuthProvider in _app.tsx which verifies
// Supabase session + admin_users + rol ONCE and shares via context.
//
// The old cookie-gate middleware was causing flash-to-login on client-side
// navigation because Next.js runs middleware on internal /_next/data requests
// and the cookie (path=/admin, SameSite=Strict) wasn't always sent.
//
// Security: AdminAuthProvider redirects unauthenticated users to /admin/login.
// Pages show "Verificando acceso..." during the check — no admin UI is exposed.

export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*']
}
