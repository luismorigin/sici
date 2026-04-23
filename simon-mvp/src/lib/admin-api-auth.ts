// lib/admin-api-auth.ts — protección server-side de API routes admin.
//
// Patrón: el browser del admin ya tiene una Supabase session (login en /admin/login).
// El access_token viaja via cookie httpOnly o en Authorization header (Bearer).
// Esta función:
//  1. Lee el access_token de la request
//  2. Verifica con Supabase que es válido
//  3. Consulta tabla `admin_users` (misma que usa AdminAuthProvider)
//  4. Verifica activo=true + rol en lista permitida
//  5. Si todo OK → retorna admin. Si falla → responde 401/403 y retorna null.
//
// Uso en API routes:
//   const admin = await requireAdmin(req, res, ['super_admin'])
//   if (!admin) return  // ya respondió 401/403
//   // ...proceder con operación
//
// Esto es sencillo (~30 líneas de protección), reusa infra existente
// (supabase session + admin_users), y es seguro porque no depende de
// cookies frontend-controlled.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export type AdminRole = 'super_admin' | 'supervisor' | 'viewer'

export interface AdminUser {
  id: string
  email: string
  nombre: string
  rol: AdminRole
  activo: boolean
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('admin-api-auth: faltan env vars Supabase')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function extractAccessToken(req: NextApiRequest): string | null {
  const auth = req.headers.authorization
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  // Fallback: cookie supabase (sb-<ref>-auth-token). Supabase SSR guarda como array JSON.
  const cookies = req.cookies || {}
  for (const [name, value] of Object.entries(cookies)) {
    if (name.startsWith('sb-') && name.endsWith('-auth-token') && value) {
      try {
        // Formato Supabase: ["<access_token>","<refresh_token>",...]
        const raw = value.startsWith('base64-') ? Buffer.from(value.slice(7), 'base64').toString('utf8') : value
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
        if (typeof parsed === 'object' && parsed?.access_token) return parsed.access_token as string
      } catch {
        // no parseable, ignorar
      }
    }
  }
  return null
}

/**
 * Valida que la request viene de un admin autorizado.
 * Si falla → responde con status apropiado y retorna null (caller debe `return`).
 */
export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
  allowedRoles: AdminRole[] = ['super_admin'],
): Promise<AdminUser | null> {
  // Bypass de dev: mismo patrón que AdminAuthContext (localhost testing sin login).
  // NUNCA debe aplicar en producción (NODE_ENV=development solo en `npm run dev`).
  if (process.env.NODE_ENV === 'development') {
    return { id: 'dev', email: 'dev@localhost', nombre: 'Dev Preview', rol: 'super_admin', activo: true }
  }

  const token = extractAccessToken(req)
  if (!token) {
    res.status(401).json({ error: 'no_session' })
    return null
  }

  const supa = getSupabaseAdmin()
  const { data: userData, error: userErr } = await supa.auth.getUser(token)
  if (userErr || !userData?.user?.email) {
    res.status(401).json({ error: 'invalid_session' })
    return null
  }

  const email = userData.user.email
  const { data: admin, error: adminErr } = await supa
    .from('admin_users')
    .select('id, email, nombre, rol, activo')
    .eq('email', email)
    .eq('activo', true)
    .maybeSingle()

  if (adminErr || !admin) {
    res.status(403).json({ error: 'not_admin' })
    return null
  }

  const adminTyped = admin as AdminUser
  if (!allowedRoles.includes(adminTyped.rol)) {
    res.status(403).json({ error: 'insufficient_role' })
    return null
  }

  return adminTyped
}
