import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Supabase JS v2 almacena sesiones en localStorage (no cookies),
// así que el middleware no puede verificar el token real.
// Usamos una cookie simple como gate: 'sici_admin' se setea en
// useAdminAuth tras verificar sesión + rol, y se borra en logout.
// La seguridad real está en useAdminAuth (verifica sesión Supabase +
// email en admin_users + rol + activo).

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const adminCookie = request.cookies.get('sici_admin')?.value

    if (!adminCookie) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*']
}
