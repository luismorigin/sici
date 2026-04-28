// API: TC paralelo actual desde BD (función SQL obtener_tc_actuales).
// Usado en banner broker para que el broker vea el TC del día y haga
// el cálculo mental USD oficial → USD billete con sus clientes.
//
// Devuelve además la última verificación del workflow tc_dinamico_binance
// para distinguir "verificación" (corre cada noche) de "actualización
// efectiva" (solo cuando cambio >= 0.5% — threshold por design).

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseServiceKey) : null

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' })
  }
  try {
    const { data, error } = await supabase.rpc('obtener_tc_actuales')
    if (error || !data) {
      console.error('TC RPC error:', error)
      return res.status(500).json({ error: 'No TC data' })
    }
    const paraleloValor = (data as { paralelo?: { valor?: number; fecha_actualizacion?: string } })?.paralelo?.valor
    const paraleloFecha = (data as { paralelo?: { valor?: number; fecha_actualizacion?: string } })?.paralelo?.fecha_actualizacion
    if (typeof paraleloValor !== 'number') {
      return res.status(500).json({ error: 'Invalid TC value' })
    }

    // Última verificación del workflow nocturno (corre cada día, actualice o no).
    let ultimaVerificacion: string | null = null
    try {
      const { data: wfRow } = await supabase
        .from('workflow_executions')
        .select('finished_at')
        .eq('workflow_name', 'tc_dinamico_binance')
        .eq('status', 'success')
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      ultimaVerificacion = (wfRow as { finished_at?: string } | null)?.finished_at ?? null
    } catch { /* best-effort */ }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900')
    return res.status(200).json({
      tcParalelo: paraleloValor,
      fechaActualizacion: paraleloFecha || null,
      ultimaVerificacion,
    })
  } catch (err) {
    console.error('API /tc-actual error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
