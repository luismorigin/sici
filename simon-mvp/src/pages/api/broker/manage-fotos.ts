/**
 * API: Gestionar fotos de propiedad broker
 * POST /api/broker/manage-fotos
 * Actions: add, delete, reorder
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface ManageFotosResponse {
  success: boolean
  data?: any
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ManageFotosResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // Cookie o header para impersonación admin
  const brokerId = req.cookies['broker_id'] || req.headers['x-broker-id'] as string
  if (!brokerId) {
    return res.status(401).json({ success: false, error: 'No autorizado' })
  }

  const { action, propiedad_id, foto_id, fotos, url, orden, hash } = req.body

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

    switch (action) {
      case 'add': {
        // Agregar una foto
        const { data, error } = await supabase
          .from('propiedad_fotos')
          .insert({
            propiedad_id,
            url,
            orden: orden || 0,
            hash: hash || `hash_${Date.now()}`
          })
          .select()
          .single()

        if (error) {
          return res.status(500).json({ success: false, error: error.message })
        }

        // Actualizar cantidad_fotos en la propiedad
        const { data: countData } = await supabase
          .from('propiedad_fotos')
          .select('id', { count: 'exact' })
          .eq('propiedad_id', propiedad_id)

        await supabase
          .from('propiedades_broker')
          .update({ cantidad_fotos: countData?.length || 0 })
          .eq('id', propiedad_id)

        return res.status(200).json({ success: true, data })
      }

      case 'delete': {
        // Eliminar una foto
        if (!foto_id) {
          return res.status(400).json({ success: false, error: 'foto_id es requerido' })
        }

        const { error } = await supabase
          .from('propiedad_fotos')
          .delete()
          .eq('id', foto_id)
          .eq('propiedad_id', propiedad_id)

        if (error) {
          return res.status(500).json({ success: false, error: error.message })
        }

        // Actualizar cantidad_fotos
        const { data: countData } = await supabase
          .from('propiedad_fotos')
          .select('id', { count: 'exact' })
          .eq('propiedad_id', propiedad_id)

        await supabase
          .from('propiedades_broker')
          .update({ cantidad_fotos: countData?.length || 0 })
          .eq('id', propiedad_id)

        return res.status(200).json({ success: true })
      }

      case 'reorder': {
        // Reordenar fotos
        if (!fotos || !Array.isArray(fotos)) {
          return res.status(400).json({ success: false, error: 'fotos array es requerido' })
        }

        // Actualizar orden de cada foto
        for (const foto of fotos) {
          await supabase
            .from('propiedad_fotos')
            .update({ orden: foto.orden })
            .eq('id', foto.id)
            .eq('propiedad_id', propiedad_id)
        }

        return res.status(200).json({ success: true })
      }

      case 'get': {
        // Obtener fotos de la propiedad
        const { data, error } = await supabase
          .from('propiedad_fotos')
          .select('*')
          .eq('propiedad_id', propiedad_id)
          .order('orden', { ascending: true })

        if (error) {
          return res.status(500).json({ success: false, error: error.message })
        }

        return res.status(200).json({ success: true, data })
      }

      default:
        return res.status(400).json({ success: false, error: 'Acción no válida' })
    }
  } catch (err) {
    console.error('Error:', err)
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Error interno'
    })
  }
}
