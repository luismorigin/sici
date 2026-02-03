/**
 * API: Crear propiedad broker
 * POST /api/broker/create-propiedad
 * Usa service role para bypass RLS
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Cliente con service role para bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface CreatePropiedadResponse {
  success: boolean
  data?: any
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreatePropiedadResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // Obtener broker_id de cookie o header (para impersonación admin)
  const brokerId = req.cookies['broker_id'] || req.headers['x-broker-id'] as string

  if (!brokerId) {
    return res.status(401).json({ success: false, error: 'No autorizado' })
  }

  try {
    const propiedadData = req.body

    // Verificar que el broker existe
    const { data: broker, error: brokerError } = await supabase
      .from('brokers')
      .select('id')
      .eq('id', brokerId)
      .single()

    if (brokerError || !broker) {
      return res.status(401).json({ success: false, error: 'Broker no encontrado' })
    }

    // Crear la propiedad con el broker_id correcto
    const { data, error } = await supabase
      .from('propiedades_broker')
      .insert({
        ...propiedadData,
        broker_id: brokerId // Asegurar que usa el broker de la sesión
      })
      .select()
      .single()

    if (error) {
      console.error('Error creando propiedad:', error)
      return res.status(500).json({ success: false, error: error.message })
    }

    return res.status(200).json({ success: true, data })
  } catch (err) {
    console.error('Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error interno'
    })
  }
}
