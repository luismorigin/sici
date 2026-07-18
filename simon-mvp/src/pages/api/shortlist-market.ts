// API read-only: contexto de MERCADO para una tipología (dorms) + zona.
// Alimenta la sección "Contexto de mercado" del bottom sheet en /b/[hash].
// A diferencia del resumen de la selección (que describe la lista), esto compara
// contra el mercado ACTIVO (v_mercado_venta / v_mercado_alquiler — ya filtran
// ≤150d + calidad, regla 10 CLAUDE.md).
//
// El cliente pasa zona + dorms (los tiene la card); el endpoint sólo calcula el
// cohort del mercado, sin lookup de la propiedad. Cohort por zona+dorms; si es
// fino (<5) cae a todo Equipetrol misma tipología (ampliado).
//
// Seguridad (SEGURIDAD_SUPABASE.md regla 1): service_role server-side.
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { ZONAS_EQUIPETROL_DB } from '@/lib/zonas'

const MIN_COHORT = 5

export interface ShortlistMarketData {
  op: 'venta' | 'alquiler'
  dormitorios: number
  zona: string
  enough: boolean
  ampliado: boolean
  count: number
  mediana: number
  p25: number
  p75: number
}

function pctl(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : Math.round(sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return res.status(500).json({ error: 'Database not configured' })

  const op = String(req.query.op) === 'alquiler' ? 'alquiler' : 'venta'
  const dorms = parseInt(String(req.query.dorms), 10)
  const zona = typeof req.query.zona === 'string' ? req.query.zona : ''
  if (Number.isNaN(dorms)) return res.status(400).json({ error: 'Missing or invalid dorms' })

  const view = op === 'alquiler' ? 'v_mercado_alquiler' : 'v_mercado_venta'
  const priceCol = op === 'alquiler' ? 'precio_mensual_bob' : 'precio_m2'

  try {
    const supabase = createClient(url, serviceKey)

    const { data, error } = await supabase
      .from(view)
      .select(`${priceCol}, zona, dormitorios`)
      .eq('dormitorios', dorms)

    if (error) {
      console.error('shortlist-market query error:', error)
      return res.status(500).json({ error: 'Database query failed' })
    }

    const rows = (data || []) as Array<Record<string, unknown>>
    const priceOf = (r: Record<string, unknown>) => {
      const v = r[priceCol]
      return typeof v === 'number' ? v : parseFloat(String(v))
    }
    const valid = (n: number) => Number.isFinite(n) && n > 0

    // Cohort zona-específico
    let pool = rows.filter((r) => r.zona === zona).map(priceOf).filter(valid)
    let ampliado = false

    // Fallback: todo Equipetrol misma tipología
    if (pool.length < MIN_COHORT) {
      pool = rows
        .filter((r) => typeof r.zona === 'string' && ZONAS_EQUIPETROL_DB.includes(r.zona as string))
        .map(priceOf)
        .filter(valid)
      ampliado = true
    }

    const sorted = pool.sort((a, b) => a - b)
    const payload: ShortlistMarketData = {
      op,
      dormitorios: dorms,
      zona,
      enough: sorted.length >= MIN_COHORT,
      ampliado,
      count: sorted.length,
      mediana: pctl(sorted, 0.5),
      p25: pctl(sorted, 0.25),
      p75: pctl(sorted, 0.75),
    }

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
    return res.status(200).json({ data: payload })
  } catch (err) {
    console.error('API /shortlist-market error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
