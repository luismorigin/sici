// API read-only: contexto de MERCADO para una tipología (dorms) + zona.
// Alimenta la sección "Cómo está el precio" del bottom sheet en /b/[hash].
// A diferencia del resumen de la selección (que describe la lista), esto compara
// contra el mercado ACTIVO (v_mercado_venta / v_mercado_alquiler — ya filtran
// ≤150d + calidad, regla 10 CLAUDE.md).
//
// Devuelve DOS rangos sobre el mismo cohort:
//  - venta:    principal = precio_m2 ; secundario = precio_norm (total normalizado)
//  - alquiler: principal = precio_mensual_bob ; secundario = Bs/m² (bob/area)
// El cliente arma el mismo objeto `marketData` que usa el feed y renderiza la
// sección nativa (mismo medidor accesible↔premium + comparador total y por m²).
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
  // Métrica principal (precio_m2 venta | precio_mensual_bob alquiler)
  mediana: number
  p25: number
  p75: number
  // Métrica secundaria (precio total normalizado venta | Bs/m² alquiler)
  secP25: number
  secP75: number
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

  // Cohort en la MISMA base de normalización que la propiedad de la shortlist
  // (que ahora lee shadow): se lee de la vista SHADOW por defecto. CUTOVER-SAFE:
  // si la vista _shadow deja de existir, cae a la vista prod (que para entonces
  // ya es igual a shadow).
  const shadowView = op === 'alquiler' ? 'v_mercado_alquiler_shadow' : 'v_mercado_venta_shadow'
  const prodView = op === 'alquiler' ? 'v_mercado_alquiler' : 'v_mercado_venta'
  const cols = op === 'alquiler'
    ? 'precio_mensual_bob, area_total_m2, zona, dormitorios'
    : 'precio_m2, precio_norm, zona, dormitorios'

  const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)))
  const valid = (n: number) => Number.isFinite(n) && n > 0

  try {
    const supabase = createClient(url, serviceKey)

    let { data, error } = await supabase.from(shadowView).select(cols).eq('dormitorios', dorms)
    if (error) {
      ;({ data, error } = await supabase.from(prodView).select(cols).eq('dormitorios', dorms))
    }
    if (error) {
      console.error('shortlist-market query error:', error)
      return res.status(500).json({ error: 'Database query failed' })
    }

    type Row = Record<string, unknown>
    const rows = (data || []) as Row[]
    const mainOf = (r: Row) => num(op === 'alquiler' ? r.precio_mensual_bob : r.precio_m2)
    const secOf = (r: Row) => {
      if (op === 'alquiler') {
        const bob = num(r.precio_mensual_bob)
        const area = num(r.area_total_m2)
        return valid(area) ? bob / area : NaN
      }
      return num(r.precio_norm)
    }

    // Cohort zona-específico → fallback a todo Equipetrol si es fino (<5).
    let cohort = rows.filter((r) => r.zona === zona)
    let ampliado = false
    if (cohort.filter((r) => valid(mainOf(r))).length < MIN_COHORT) {
      cohort = rows.filter((r) => typeof r.zona === 'string' && ZONAS_EQUIPETROL_DB.includes(r.zona as string))
      ampliado = true
    }

    const main = cohort.map(mainOf).filter(valid).sort((a, b) => a - b)
    const sec = cohort.map(secOf).filter(valid).sort((a, b) => a - b)

    const payload: ShortlistMarketData = {
      op,
      dormitorios: dorms,
      zona,
      enough: main.length >= MIN_COHORT,
      ampliado,
      count: main.length,
      mediana: Math.round(pctl(main, 0.5)),
      p25: Math.round(pctl(main, 0.25)),
      p75: Math.round(pctl(main, 0.75)),
      secP25: Math.round(pctl(sec, 0.25)),
      secP75: Math.round(pctl(sec, 0.75)),
    }

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
    return res.status(200).json({ data: payload })
  } catch (err) {
    console.error('API /shortlist-market error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
