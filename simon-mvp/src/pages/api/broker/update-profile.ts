/**
 * API: Actualizar perfil broker
 * POST /api/broker/update-profile
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Cliente con service role para bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface UpdateProfileResponse {
  success: boolean
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateProfileResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // Obtener broker_id de la cookie o header
  const brokerId = req.cookies['broker_id'] || req.headers['x-broker-id'] as string

  if (!brokerId) {
    return res.status(401).json({ success: false, error: 'No autorizado' })
  }

  const { nombre, telefono, whatsapp, inmobiliaria, empresa, foto_url, logo_url } = req.body

  if (!nombre || !telefono) {
    return res.status(400).json({ success: false, error: 'Nombre y teléfono son requeridos' })
  }

  try {
    const { error } = await supabase
      .from('brokers')
      .update({
        nombre,
        telefono,
        whatsapp: whatsapp || null,
        inmobiliaria: inmobiliaria || null,
        empresa: empresa || null,
        foto_url: foto_url || null,
        logo_url: logo_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', brokerId)

    if (error) {
      console.error('Error updating broker profile:', error)
      return res.status(500).json({ success: false, error: 'Error al actualizar perfil' })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Error:', err)
    return res.status(500).json({ success: false, error: 'Error interno' })
  }
}
