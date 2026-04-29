// lib/broker-prospection.ts — queries server-side de la tabla broker_prospection.
//
// USO: SOLO server-side (API routes admin). RLS deny-all → service_role.
// Patrón espeja a lib/simon-brokers.ts y lib/broker-shortlists-server.ts.

import { createClient } from '@supabase/supabase-js'

export type ProspectionStatus = 'pending' | 'msg1_sent' | 'msg2_sent' | 'msg3_sent'

export interface ProspectionBroker {
  telefono: string
  nombre: string
  agencia: string | null
  tier: 1 | 2 | 3
  props_activas: number
  props_recientes_90d: number
  /** Días en mercado de la propiedad más reciente del broker. NULL si no calculado todavía. */
  dias_pub_min: number | null
  /** Días en mercado de la propiedad más antigua del broker. NULL si no calculado todavía. */
  dias_pub_max: number | null
  status: ProspectionStatus
  fecha_msg1: string | null
  fecha_msg2: string | null
  fecha_msg3: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export interface ProspectionFilters {
  tier?: 1 | 2 | 3 | null
  status?: ProspectionStatus | null
  agencia?: string | null
  search?: string | null
  /** Orden por cantidad de propiedades. Default 'asc' (menos a más). */
  sortProps?: 'asc' | 'desc'
  /** Orden por antigüedad de publicación más reciente. Default 'asc' (más nuevos primero). */
  sortDias?: 'asc' | 'desc'
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('broker-prospection: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const COLS =
  'telefono, nombre, agencia, tier, props_activas, props_recientes_90d, ' +
  'dias_pub_min, dias_pub_max, ' +
  'status, fecha_msg1, fecha_msg2, fecha_msg3, notas, created_at, updated_at'

/**
 * Lista brokers de prospección con filtros opcionales.
 * Orden: tier ASC, props_recientes_90d DESC (los más activos arriba),
 * fallback a props_activas DESC.
 */
export async function listProspectionBrokers(
  filters: ProspectionFilters = {}
): Promise<ProspectionBroker[]> {
  const supa = getSupabaseAdmin()
  let q = supa.from('broker_prospection').select(COLS)

  if (filters.tier != null) q = q.eq('tier', filters.tier)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.agencia) q = q.eq('agencia', filters.agencia)
  if (filters.search && filters.search.trim()) {
    const term = filters.search.trim()
    q = q.or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%`)
  }

  // Orden: tier siempre ASC (T1, T2, T3 — estrategia de prospección).
  // Después, orden configurable por props_activas y dias_pub_min.
  // Defaults: ambos ASC (menos props primero, publicación más reciente
  // arriba — los leads más manejables y activos primero).
  const propsAsc = filters.sortProps !== 'desc'
  const diasAsc = filters.sortDias !== 'desc'
  q = q.order('tier', { ascending: true })
       .order('props_activas', { ascending: propsAsc })
       .order('dias_pub_min', { ascending: diasAsc, nullsFirst: false })

  const { data, error } = await q
  if (error) {
    console.error('[broker-prospection] listProspectionBrokers error:', error)
    return []
  }
  return (data || []) as unknown as ProspectionBroker[]
}

/**
 * Llama a la RPC populate_broker_prospection() para refrescar los datos
 * derivados (nombre/agencia/tier/conteos) desde v_mercado_venta.
 * Preserva status, fechas de envío y notas existentes.
 */
export async function refreshProspectionData(): Promise<{
  inserted: number
  updated: number
  total: number
}> {
  const supa = getSupabaseAdmin()
  const { data, error } = await supa.rpc('populate_broker_prospection')
  if (error) {
    console.error('[broker-prospection] refreshProspectionData error:', error)
    throw new Error(`Refresh failed: ${error.message}`)
  }
  // RPC devuelve TABLE → array con 1 row { inserted, updated, total }
  const row = Array.isArray(data) ? data[0] : data
  return {
    inserted: Number(row?.inserted ?? 0),
    updated: Number(row?.updated ?? 0),
    total: Number(row?.total ?? 0),
  }
}

export interface UpdateProspectionInput {
  status?: ProspectionStatus
  notas?: string | null
  /**
   * Si true, setea fecha_msg1/2/3 según el status target. Útil cuando
   * el caller marca un mensaje como enviado (status='msg2_sent' →
   * setea fecha_msg2 = NOW(), y también fecha_msg1 si era null).
   */
  stamp_dates?: boolean
}

export async function updateProspection(
  telefono: string,
  input: UpdateProspectionInput
): Promise<ProspectionBroker | null> {
  const supa = getSupabaseAdmin()
  const payload: Record<string, unknown> = {}

  if (input.status !== undefined) {
    payload.status = input.status
    if (input.stamp_dates) {
      // Stampea la fecha del último mensaje + cualquier anterior que
      // estuviera vacía. Permite "saltar" estados (ej. marcar msg3_sent
      // directo) y aún así dejar consistentes las fechas anteriores.
      const now = new Date().toISOString()
      const order: ProspectionStatus[] = ['msg1_sent', 'msg2_sent', 'msg3_sent']
      const idx = order.indexOf(input.status)
      if (idx >= 0) {
        // Para cada nivel ≤ target, asegurar fecha. Solo seteamos si NULL
        // (no pisar fechas históricas más antiguas).
        // Como el SET de Supabase no soporta COALESCE inline, traemos el
        // row primero y calculamos en JS. Trade-off: 1 query extra por update.
        const { data: existing } = await supa
          .from('broker_prospection')
          .select('fecha_msg1, fecha_msg2, fecha_msg3')
          .eq('telefono', telefono)
          .maybeSingle<{ fecha_msg1: string | null; fecha_msg2: string | null; fecha_msg3: string | null }>()
        if (idx >= 0 && (!existing?.fecha_msg1)) payload.fecha_msg1 = now
        if (idx >= 1 && (!existing?.fecha_msg2)) payload.fecha_msg2 = now
        if (idx >= 2 && (!existing?.fecha_msg3)) payload.fecha_msg3 = now
      }
    }
  }
  if (input.notas !== undefined) payload.notas = input.notas

  if (Object.keys(payload).length === 0) {
    // Nada que actualizar — devolver row actual
    const { data } = await supa.from('broker_prospection').select(COLS).eq('telefono', telefono).maybeSingle()
    return (data as unknown as ProspectionBroker) ?? null
  }

  const { data, error } = await supa
    .from('broker_prospection')
    .update(payload)
    .eq('telefono', telefono)
    .select(COLS)
    .single()
  if (error) {
    console.error('[broker-prospection] updateProspection error:', error)
    throw new Error(`Update failed: ${error.message}`)
  }
  return data as unknown as ProspectionBroker
}

/**
 * Conteos para el header del panel: total brokers + breakdown por status.
 */
export async function getProspectionStats(): Promise<{
  total: number
  pending: number
  msg1_sent: number
  msg2_sent: number
  msg3_sent: number
  by_tier: { tier: 1 | 2 | 3; count: number }[]
}> {
  const supa = getSupabaseAdmin()
  const { data, error } = await supa
    .from('broker_prospection')
    .select('tier, status')
  if (error) {
    console.error('[broker-prospection] getProspectionStats error:', error)
    return { total: 0, pending: 0, msg1_sent: 0, msg2_sent: 0, msg3_sent: 0, by_tier: [] }
  }
  const rows = (data || []) as Array<{ tier: number; status: ProspectionStatus }>
  const stats = {
    total: rows.length,
    pending: rows.filter(r => r.status === 'pending').length,
    msg1_sent: rows.filter(r => r.status === 'msg1_sent').length,
    msg2_sent: rows.filter(r => r.status === 'msg2_sent').length,
    msg3_sent: rows.filter(r => r.status === 'msg3_sent').length,
    by_tier: [1, 2, 3].map(t => ({
      tier: t as 1 | 2 | 3,
      count: rows.filter(r => r.tier === t).length,
    })),
  }
  return stats
}
