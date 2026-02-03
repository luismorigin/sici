/**
 * API: Eliminar propiedad broker
 * POST /api/broker/delete-propiedad
 * Usa service role para bypass RLS
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface DeletePropiedadResponse {
  success: boolean
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DeletePropiedadResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // Cookie o header para impersonación admin
  const brokerId = req.cookies['broker_id'] || req.headers['x-broker-id'] as string
  if (!brokerId) {
    return res.status(401).json({ success: false, error: 'No autorizado' })
  }

  const { propiedad_id } = req.body

  if (!propiedad_id) {
    return res.status(400).json({ success: false, error: 'propiedad_id es requerido' })
  }

  try {
    // Verificar que la propiedad pertenece al broker
    const { data: prop, error: propError } = await supabase
      .from('propiedades_broker')
      .select('id, broker_id')
      .eq('id', propiedad_id)
      .single()

    if (propError || !prop) {
      return res.status(404).json({ success: false, error: 'Propiedad no encontrada' })
    }

    if (prop.broker_id !== brokerId) {
      return res.status(403).json({ success: false, error: 'No tienes permiso' })
    }

    // Primero borrar fotos asociadas
    await supabase
      .from('propiedad_fotos')
      .delete()
      .eq('propiedad_id', propiedad_id)

    // Luego borrar la propiedad
    const { error } = await supabase
      .from('propiedades_broker')
      .delete()
      .eq('id', propiedad_id)

    if (error) {
      console.error('Error eliminando propiedad:', error)
      return res.status(500).json({ success: false, error: error.message })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error interno'
    })
  }
}
