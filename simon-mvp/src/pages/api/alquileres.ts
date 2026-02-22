// API: Server-side proxy for buscar_unidades_alquiler
// POST /api/alquileres { filtros: { ... } }
// - Rate limit: 10 requests/min per IP (in-memory)
// - Max 50 results per request
// - Returns { data: UnidadAlquiler[], total: number }

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseServiceKey) : null

// ===== Rate Limiter (in-memory) =====
const RATE_LIMIT = 10
const RATE_WINDOW = 60_000 // 1 minute
const rateMap = new Map<string, number[]>()

// Cleanup stale entries every 5 minutes
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Rate limit check
  const ip = getClientIP(req)
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' })
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' })
  }

  try {
    const { filtros = {} } = req.body || {}

    // Build RPC params — clamp limite to 50 max
    const rpcFiltros: Record<string, any> = {
      limite: Math.min(filtros.limite || 50, 50),
      solo_con_fotos: filtros.solo_con_fotos ?? true,
    }

    if (filtros.offset !== undefined && filtros.offset !== null) rpcFiltros.offset = Math.max(0, parseInt(filtros.offset, 10) || 0)
    if (filtros.precio_mensual_max) rpcFiltros.precio_mensual_max = filtros.precio_mensual_max
    if (filtros.precio_mensual_min) rpcFiltros.precio_mensual_min = filtros.precio_mensual_min
    if (filtros.dormitorios_lista?.length) rpcFiltros.dormitorios_lista = filtros.dormitorios_lista
    else if (filtros.dormitorios !== undefined) rpcFiltros.dormitorios = filtros.dormitorios
    if (filtros.dormitorios_min !== undefined && !filtros.dormitorios_lista?.length) rpcFiltros.dormitorios_min = filtros.dormitorios_min
    if (filtros.amoblado) rpcFiltros.amoblado = true
    if (filtros.acepta_mascotas) rpcFiltros.acepta_mascotas = true
    if (filtros.con_parqueo) rpcFiltros.con_parqueo = true
    if (filtros.orden) rpcFiltros.orden = filtros.orden
    if (filtros.zonas_permitidas?.length) rpcFiltros.zonas_permitidas = filtros.zonas_permitidas

    // Fetch data
    const dataResult = await supabase.rpc('buscar_unidades_alquiler', { p_filtros: rpcFiltros })

    if (dataResult.error) {
      console.error('RPC error:', dataResult.error)
      return res.status(500).json({ error: 'Database query failed' })
    }

    const data = dataResult.data || []
    const offset = rpcFiltros.offset || 0
    const limite = rpcFiltros.limite || 50

    // If first page returned fewer than limit, we know the total without extra query
    let total: number
    if (data.length < limite) {
      total = offset + data.length
    } else {
      // Need count query — only when results are full page (may have more)
      const countFiltros = { ...rpcFiltros, limite: 9999, offset: 0 }
      const countResult = await supabase.rpc('buscar_unidades_alquiler', { p_filtros: countFiltros })
      total = countResult.data?.length || data.length
    }

    // Cache control: no caching of dynamic data
    res.setHeader('Cache-Control', 'no-store')

    return res.status(200).json({ data, total })
  } catch (err) {
    console.error('API /alquileres error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
