// lib/broker-shortlists-server.ts — queries server-side de protección de shortlists
//
// USO: SOLO server-side (getServerSideProps + API routes admin).
// Usa SUPABASE_SERVICE_ROLE_KEY porque broker_shortlists/views tienen RLS deny-all.
// NO importar desde components client.
//
// Ver docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md.
// Patrón espeja a lib/simon-brokers.ts.

import { createClient } from '@supabase/supabase-js'
import type { BrokerShortlistProtected } from '@/types/broker-shortlist'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('broker-shortlists-server: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const SHORTLIST_PROTECTED_COLS =
  'id, broker_slug, hash, cliente_nombre, cliente_telefono, mensaje_whatsapp, ' +
  'is_published, archived_at, view_count, last_viewed_at, created_at, updated_at, ' +
  'max_views, current_views, expires_at, status, first_viewed_at'

/**
 * Lookup por hash para SSR de /b/[hash]. Solo retorna shortlists "vivas":
 *  - is_published = TRUE (broker no la pausó)
 *  - archived_at IS NULL (no borrada lógicamente)
 *
 * El gate de status (expired/view_limit/suspended) se hace en el caller — esta
 * función solo dice "existe y está publicada", el caller decide si el cliente
 * la puede ver según `status`/`expires_at`/`current_views`.
 *
 * Aprovecha idx_broker_shortlists_hash (parcial WHERE is_published AND archived_at IS NULL).
 */
export async function getShortlistByHashWithStatus(
  hash: string
): Promise<BrokerShortlistProtected | null> {
  if (!hash) return null
  const supa = getSupabaseAdmin()
  const { data, error } = await supa
    .from('broker_shortlists')
    .select(SHORTLIST_PROTECTED_COLS)
    .eq('hash', hash)
    .eq('is_published', true)
    .is('archived_at', null)
    .maybeSingle()
  if (error) {
    console.error('[broker-shortlists-server] getShortlistByHashWithStatus error:', error)
    return null
  }
  return (data as unknown as BrokerShortlistProtected) ?? null
}

/**
 * ¿Este fingerprint ya visitó esta shortlist? (hot path SSR — ~1ms con índice).
 * Usa idx_broker_shortlist_views_fingerprint (compuesto shortlist_id + fingerprint).
 */
export async function fingerprintExists(
  shortlistId: string,
  fingerprint: string
): Promise<boolean> {
  const supa = getSupabaseAdmin()
  const { data, error } = await supa
    .from('broker_shortlist_views')
    .select('id')
    .eq('shortlist_id', shortlistId)
    .eq('fingerprint', fingerprint)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[broker-shortlists-server] fingerprintExists error:', error)
    return false
  }
  return data !== null
}

interface VisitMeta {
  ipHash: string | null
  userAgent: string | null
  referrer: string | null
}

/**
 * Registra primera visita de un fingerprint a una shortlist.
 * 2 escrituras secuenciales (sin TX):
 *   1. INSERT en broker_shortlist_views (is_unique=TRUE).
 *   2. UPDATE broker_shortlists: current_views += 1, view_count += 1,
 *      first_viewed_at = COALESCE(first_viewed_at, NOW()), last_viewed_at = NOW().
 *
 * Source of truth = broker_shortlist_views. El counter `current_views` es un
 * cache para el hot path SSR (evita COUNT(*) por cada lookup). Si el UPDATE
 * falla post-INSERT, el counter queda desincronizado pero recoverable:
 *
 *   UPDATE broker_shortlists s SET current_views = (
 *     SELECT COUNT(*) FROM broker_shortlist_views v
 *      WHERE v.shortlist_id = s.id AND v.is_unique = TRUE
 *   );
 *
 * Si esta inconsistencia aparece en producción, migrar a una RPC en SQL para
 * garantizar atomicidad. YAGNI hasta que el problema se vea.
 *
 * Race condition conocida: 2 visitantes nuevos simultáneos en el límite del cap
 * pueden ambos pasar el check `current_views < max_views` y registrarse, dejando
 * `current_views = max_views + 1`. Overshoot mínimo en caso extremo, aceptable.
 */
export async function registerNewVisit(
  shortlistId: string,
  fingerprint: string,
  meta: VisitMeta
): Promise<void> {
  const supa = getSupabaseAdmin()
  const { error: insertErr } = await supa.from('broker_shortlist_views').insert({
    shortlist_id: shortlistId,
    fingerprint,
    ip_hash: meta.ipHash,
    user_agent: meta.userAgent,
    referrer: meta.referrer,
    is_unique: true,
  })
  if (insertErr) {
    console.error('[broker-shortlists-server] registerNewVisit insert error:', insertErr)
    throw new Error(`registerNewVisit failed: ${insertErr.message}`)
  }

  // Counter bump: Supabase JS no expone increment atómico, hacemos SELECT + UPDATE.
  // Race aceptado (ver docstring). Si aparece desincronización en prod, migrar a RPC.
  const { data: current } = await supa
    .from('broker_shortlists')
    .select('current_views, view_count, first_viewed_at')
    .eq('id', shortlistId)
    .maybeSingle()
  if (!current) return

  const { error: updateErr } = await supa
    .from('broker_shortlists')
    .update({
      current_views: (current.current_views ?? 0) + 1,
      view_count: (current.view_count ?? 0) + 1,
      first_viewed_at: current.first_viewed_at ?? new Date().toISOString(),
      last_viewed_at: new Date().toISOString(),
    })
    .eq('id', shortlistId)
  if (updateErr) {
    console.error('[broker-shortlists-server] registerNewVisit update error:', updateErr)
  }
}

/**
 * Registra visita recurrente (mismo fingerprint que ya visitó antes).
 * INSERT con is_unique=FALSE + UPDATE solo last_viewed_at + view_count.
 * NO toca current_views (ya contó este dispositivo).
 */
export async function registerReturnVisit(
  shortlistId: string,
  fingerprint: string,
  meta: VisitMeta
): Promise<void> {
  const supa = getSupabaseAdmin()
  await supa.from('broker_shortlist_views').insert({
    shortlist_id: shortlistId,
    fingerprint,
    ip_hash: meta.ipHash,
    user_agent: meta.userAgent,
    referrer: meta.referrer,
    is_unique: false,
  })
  const { data: current } = await supa
    .from('broker_shortlists')
    .select('view_count')
    .eq('id', shortlistId)
    .maybeSingle()
  if (!current) return
  await supa
    .from('broker_shortlists')
    .update({
      view_count: (current.view_count ?? 0) + 1,
      last_viewed_at: new Date().toISOString(),
    })
    .eq('id', shortlistId)
}

/**
 * Marca la shortlist como expirada. Idempotente: solo cambia si está active
 * (evita pisar suspended/view_limit_reached que tienen prioridad de expresión).
 */
export async function markAsExpired(id: string): Promise<void> {
  const supa = getSupabaseAdmin()
  const { error } = await supa
    .from('broker_shortlists')
    .update({ status: 'expired' })
    .eq('id', id)
    .eq('status', 'active')
  if (error) {
    console.error('[broker-shortlists-server] markAsExpired error:', error)
  }
}

/**
 * Marca la shortlist como cap alcanzado. Idempotente: solo si está active.
 */
export async function markAsViewLimitReached(id: string): Promise<void> {
  const supa = getSupabaseAdmin()
  const { error } = await supa
    .from('broker_shortlists')
    .update({ status: 'view_limit_reached' })
    .eq('id', id)
    .eq('status', 'active')
  if (error) {
    console.error('[broker-shortlists-server] markAsViewLimitReached error:', error)
  }
}

/**
 * Suspende manualmente desde admin. Pisa cualquier status (incluyendo expired).
 */
export async function suspendShortlist(id: string): Promise<void> {
  const supa = getSupabaseAdmin()
  const { error } = await supa
    .from('broker_shortlists')
    .update({ status: 'suspended' })
    .eq('id', id)
  if (error) {
    throw new Error(`suspendShortlist failed: ${error.message}`)
  }
}

/**
 * Reactiva una shortlist suspendida (admin). La devuelve a 'active' incluso si
 * pasó expires_at — el SSR la va a re-marcar expired al primer hit. El admin
 * puede usarlo para "darle una segunda oportunidad" temporal.
 */
export async function unsuspendShortlist(id: string): Promise<void> {
  const supa = getSupabaseAdmin()
  const { error } = await supa
    .from('broker_shortlists')
    .update({ status: 'active' })
    .eq('id', id)
  if (error) {
    throw new Error(`unsuspendShortlist failed: ${error.message}`)
  }
}

/**
 * Lista shortlists del broker para panel admin (/admin/simon-brokers/[slug]).
 * Incluye archivadas y todos los status para que el admin las gestione.
 * Ordenadas por created_at desc.
 */
export async function listShortlistsForBrokerAdmin(
  brokerSlug: string
): Promise<BrokerShortlistProtected[]> {
  const supa = getSupabaseAdmin()
  const { data, error } = await supa
    .from('broker_shortlists')
    .select(SHORTLIST_PROTECTED_COLS)
    .eq('broker_slug', brokerSlug)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[broker-shortlists-server] listShortlistsForBrokerAdmin error:', error)
    return []
  }
  return (data || []) as unknown as BrokerShortlistProtected[]
}
