// API: wrapper server-side para la funcion SQL buscar_acm().
// Consumido por el componente ACMInline en el BottomSheet modo broker.
// Ver docs/broker/PRD.md F1.1

import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'

export interface ACMData {
  propiedad_id: number
  precio_usd: number
  precio_m2: number
  area_m2: number
  dormitorios: number
  zona: string
  estado_construccion: string
  dias_en_mercado: number
  cohort_size: number
  cohort_precio_m2_mediana: number
  cohort_precio_m2_p25: number
  cohort_precio_m2_p75: number
  percentil_en_cohort: number
  cohort_mediana_dias: number
  ranking_torre_pos: number | null
  ranking_torre_total: number | null
  yield_cohort_size: number
  yield_low: number | null
  yield_high: number | null
  rango_valor_low: number
  rango_valor_high: number
  historico_precios: Array<{ fecha: string; precio_usd: number }>
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' })
  }

  const id = parseInt(String(req.query.id), 10)
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: 'Missing or invalid id parameter' })
  }

  try {
    const { data, error } = await supabase.rpc('buscar_acm', { p_propiedad_id: id })

    if (error) {
      console.error('buscar_acm RPC error:', error)
      return res.status(500).json({ error: 'Database query failed', details: error.message })
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Property not found' })
    }

    res.setHeader('Cache-Control', 'private, max-age=60')
    return res.status(200).json({ data: data[0] as ACMData })
  } catch (err) {
    console.error('API /acm error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
