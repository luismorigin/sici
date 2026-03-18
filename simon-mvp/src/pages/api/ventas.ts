// API: Server-side proxy for buscar_unidades_simple
// POST /api/ventas { filtros: { ... }, spotlightId?: number }
// - Rate limit: 10 requests/min per IP (in-memory)
// - Returns { data: UnidadVenta[], total: number, spotlight?: UnidadVenta | null }

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { RawUnidadSimpleRow } from '@/types/db-responses'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseServiceKey) : null

// ===== Rate Limiter (in-memory) =====
const RATE_LIMIT = 10
const RATE_WINDOW = 60_000
const rateMap = new Map<string, number[]>()

setInterval(() => {
  const now = Date.now()
  for (const [ip, hits] of rateMap.entries()) {
    const recent = hits.filter(t => now - t < RATE_WINDOW)
    if (recent.length === 0) rateMap.delete(ip)
    else rateMap.set(ip, recent)
  }
}, 5 * 60_000)

function checkRate(ip: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) || []).filter(t => now - t < RATE_WINDOW)
  if (hits.length >= RATE_LIMIT) return false
  hits.push(now)
  rateMap.set(ip, hits)
  return true
}

function getClientIP(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  if (Array.isArray(forwarded)) return forwarded[0]
  return req.socket?.remoteAddress || 'unknown'
}

function mapRow(p: RawUnidadSimpleRow) {
  return {
    id: p.id,
    proyecto: p.nombre_proyecto || 'Sin proyecto',
    desarrollador: p.desarrollador || null,
    zona: p.zona || 'Sin zona',
    microzona: p.microzona || null,
    dormitorios: p.dormitorios ?? 0,
    banos: p.banos ? parseFloat(String(p.banos)) : null,
    precio_usd: parseFloat(String(p.precio_usd)) || 0,
    precio_m2: parseFloat(String(p.precio_m2)) || 0,
    area_m2: parseFloat(String(p.area_m2)) || 0,
    score_calidad: p.score_calidad ?? null,
    agente_nombre: p.agente_nombre || null,
    agente_telefono: p.agente_telefono || null,
    agente_oficina: p.agente_oficina || null,
    fotos_urls: p.fotos_urls || [],
    fotos_count: p.fotos_count || 0,
    url: p.url || '',
    amenities_lista: p.amenities_lista || [],
    es_multiproyecto: p.es_multiproyecto || false,
    estado_construccion: p.estado_construccion || 'no_especificado',
    dias_en_mercado: p.dias_en_mercado ?? null,
    amenities_confirmados: p.amenities_confirmados || [],
    amenities_por_verificar: p.amenities_por_verificar || [],
    equipamiento_detectado: p.equipamiento_detectado || [],
    descripcion: p.descripcion || null,
    latitud: p.latitud ? parseFloat(String(p.latitud)) : null,
    longitud: p.longitud ? parseFloat(String(p.longitud)) : null,
    estacionamientos: p.estacionamientos ?? null,
    baulera: p.baulera ?? null,
    fecha_entrega: p.fecha_entrega || null,
    piso: p.piso || null,
    plan_pagos_desarrollador: p.plan_pagos_desarrollador ?? null,
    acepta_permuta: p.acepta_permuta ?? null,
    solo_tc_paralelo: p.solo_tc_paralelo ?? null,
    precio_negociable: p.precio_negociable ?? null,
    descuento_contado_pct: p.descuento_contado_pct ?? null,
    parqueo_incluido: p.parqueo_incluido ?? null,
    parqueo_precio_adicional: p.parqueo_precio_adicional ?? null,
    baulera_incluido: p.baulera_incluido ?? null,
    baulera_precio_adicional: p.baulera_precio_adicional ?? null,
    plan_pagos_cuotas: p.plan_pagos_cuotas ?? null,
    plan_pagos_texto: p.plan_pagos_texto || null,
    fuente: p.fuente || '',
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = getClientIP(req)
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' })
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' })
  }

  try {
    const { filtros = {}, spotlightId } = req.body || {}

    // Build RPC params
    const rpcFiltros: Record<string, any> = {
      limite: 500, // All active props (~297), no artificial limit
      solo_con_fotos: filtros.solo_con_fotos ?? true,
    }

    if (filtros.precio_max) rpcFiltros.precio_max = filtros.precio_max
    if (filtros.precio_min) rpcFiltros.precio_min = filtros.precio_min
    if (filtros.dormitorios_lista?.length) rpcFiltros.dormitorios_lista = filtros.dormitorios_lista
    else if (filtros.dormitorios !== undefined) rpcFiltros.dormitorios = filtros.dormitorios
    if (filtros.orden) rpcFiltros.orden = filtros.orden
    if (filtros.zonas_permitidas?.length) rpcFiltros.zonas_permitidas = filtros.zonas_permitidas
    if (filtros.estado_entrega) rpcFiltros.estado_entrega = filtros.estado_entrega

    const dataResult = await supabase.rpc('buscar_unidades_simple', { p_filtros: rpcFiltros })

    if (dataResult.error) {
      console.error('RPC error:', dataResult.error)
      return res.status(500).json({ error: 'Database query failed' })
    }

    const data = (dataResult.data || []).map((r: RawUnidadSimpleRow) => mapRow(r))

    // Spotlight: fetch a specific property by ID if not in current results
    let spotlight = null
    if (spotlightId && typeof spotlightId === 'number' && !data.find((d: any) => d.id === spotlightId)) {
      try {
        const spotResult = await supabase.rpc('buscar_unidades_simple', {
          p_filtros: { limite: 500, solo_con_fotos: false }
        })
        const found = spotResult.data?.find((d: any) => d.id === spotlightId)
        spotlight = found ? mapRow(found) : null
      } catch { /* spotlight is best-effort */ }
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ data, total: data.length, spotlight })
  } catch (err) {
    console.error('API /ventas error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
