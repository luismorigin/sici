// lib/simon-brokers.ts — MVP Simon Broker: lectura de tabla `simon_brokers`.
//
// OJO: no confundir con tabla `brokers` (legacy, captación B2B). Ver
// docs/canonical/ o CLAUDE.md sección "Brokers — dos tablas distintas".
//
// Uso: SOLO server-side (API routes + getStaticProps). Usa SERVICE_ROLE_KEY
// porque la tabla tiene RLS deny-all. No importar desde components client.
//
// Reemplaza al archivo hardcodeado `brokers-demo.ts` (S1 MVP).

import { createClient } from '@supabase/supabase-js'

export interface Broker {
  slug: string
  nombre: string
  telefono: string
  foto_url: string | null
  inmobiliaria?: string | null
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('simon-brokers: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Busca broker por slug. Solo retorna si status='activo'.
 * Para admin (ver todos los status) usar `getBrokerBySlugAny`.
 */
export async function getBrokerBySlug(slug: string | null | undefined): Promise<Broker | null> {
  if (!slug) return null
  const supa = getSupabaseAdmin()
  const { data, error } = await supa
    .from('simon_brokers')
    .select('slug, nombre, telefono, foto_url, inmobiliaria, status')
    .eq('slug', slug)
    .eq('status', 'activo')
    .maybeSingle()
  if (error) {
    console.error('[simon-brokers] getBrokerBySlug error:', error)
    return null
  }
  if (!data) return null
  return {
    slug: data.slug,
    nombre: data.nombre,
    telefono: data.telefono,
    foto_url: data.foto_url ?? null,
    inmobiliaria: data.inmobiliaria ?? null,
  }
}

/**
 * Lista slugs activos. Usado por getStaticPaths de /broker/[slug].tsx.
 */
export async function listActiveSlugs(): Promise<string[]> {
  const supa = getSupabaseAdmin()
  const { data, error } = await supa
    .from('simon_brokers')
    .select('slug')
    .eq('status', 'activo')
  if (error) {
    console.error('[simon-brokers] listActiveSlugs error:', error)
    return []
  }
  return (data || []).map((r) => r.slug as string)
}

/**
 * Valida que un slug corresponde a broker activo. Usado en API routes (POST).
 */
export async function isValidBrokerSlug(slug: string | null | undefined): Promise<boolean> {
  if (!slug) return false
  const b = await getBrokerBySlug(slug)
  return b !== null
}

// ============================================================
// Admin-only (retornan también pausado/inactivo + campos extra)
// ============================================================

export interface BrokerAdmin extends Broker {
  id: string
  status: 'activo' | 'pausado' | 'inactivo'
  fecha_alta: string
  fecha_proximo_cobro: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export async function listAllBrokersAdmin(): Promise<BrokerAdmin[]> {
  const supa = getSupabaseAdmin()
  const { data, error } = await supa
    .from('simon_brokers')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[simon-brokers] listAllBrokersAdmin error:', error)
    return []
  }
  return (data || []) as BrokerAdmin[]
}

export async function getBrokerBySlugAny(slug: string): Promise<BrokerAdmin | null> {
  const supa = getSupabaseAdmin()
  const { data, error } = await supa
    .from('simon_brokers')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    console.error('[simon-brokers] getBrokerBySlugAny error:', error)
    return null
  }
  return (data as BrokerAdmin) ?? null
}

export interface CreateBrokerInput {
  slug: string
  nombre: string
  telefono: string
  foto_url?: string | null
  inmobiliaria?: string | null
  fecha_proximo_cobro?: string | null
  notas?: string | null
}

export async function createBroker(input: CreateBrokerInput): Promise<BrokerAdmin> {
  const supa = getSupabaseAdmin()
  const { data, error } = await supa
    .from('simon_brokers')
    .insert({
      slug: input.slug.trim().toLowerCase(),
      nombre: input.nombre.trim(),
      telefono: input.telefono.trim(),
      foto_url: input.foto_url?.trim() || null,
      inmobiliaria: input.inmobiliaria?.trim() || null,
      fecha_proximo_cobro: input.fecha_proximo_cobro || null,
      notas: input.notas?.trim() || null,
      status: 'activo',
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`createBroker failed: ${error?.message || 'no data'}`)
  }
  return data as BrokerAdmin
}

export interface UpdateBrokerInput {
  nombre?: string
  telefono?: string
  foto_url?: string | null
  inmobiliaria?: string | null
  status?: 'activo' | 'pausado' | 'inactivo'
  fecha_proximo_cobro?: string | null
  notas?: string | null
}

export async function deleteBroker(id: string): Promise<void> {
  const supa = getSupabaseAdmin()
  const { error } = await supa.from('simon_brokers').delete().eq('id', id)
  if (error) {
    throw new Error(`deleteBroker failed: ${error.message}`)
  }
}

export async function updateBroker(id: string, input: UpdateBrokerInput): Promise<BrokerAdmin> {
  const supa = getSupabaseAdmin()
  const payload: Record<string, unknown> = {}
  if (input.nombre !== undefined) payload.nombre = input.nombre.trim()
  if (input.telefono !== undefined) payload.telefono = input.telefono.trim()
  if (input.foto_url !== undefined) payload.foto_url = input.foto_url?.trim() || null
  if (input.inmobiliaria !== undefined) payload.inmobiliaria = input.inmobiliaria?.trim() || null
  if (input.status !== undefined) payload.status = input.status
  if (input.fecha_proximo_cobro !== undefined) payload.fecha_proximo_cobro = input.fecha_proximo_cobro
  if (input.notas !== undefined) payload.notas = input.notas?.trim() || null

  const { data, error } = await supa
    .from('simon_brokers')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`updateBroker failed: ${error?.message || 'no data'}`)
  }
  return data as BrokerAdmin
}

export function isValidSlugFormat(slug: string): boolean {
  // URL-safe: lowercase, digits, hyphens. 2-40 chars.
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)
}

/**
 * Valida formato E.164 básico: debe empezar con `+`, luego 8-15 dígitos.
 * Acepta espacios/guiones intermedios que se strippean antes del check.
 * Rechaza teléfonos sin código país, con letras o con dígitos insuficientes.
 */
export function isValidPhoneFormat(phone: string): boolean {
  const stripped = phone.trim().replace(/[\s-]/g, '')
  return /^\+[0-9]{8,15}$/.test(stripped)
}
