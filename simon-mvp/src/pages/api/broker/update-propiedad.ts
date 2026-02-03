/**
 * API: Actualizar propiedad broker
 * POST /api/broker/update-propiedad
 * Usa service role para bypass RLS
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface UpdatePropiedadResponse {
  success: boolean
  data?: any
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdatePropiedadResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // Cookie o header para impersonación admin
  const brokerId = req.cookies['broker_id'] || req.headers['x-broker-id'] as string
  if (!brokerId) {
    return res.status(401).json({ success: false, error: 'No autorizado' })
  }

  const { propiedad_id, ...updateData } = req.body

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
      return res.status(403).json({ success: false, error: 'No tienes permiso para editar esta propiedad' })
    }

    // Columnas conocidas que existen en la tabla
    const columnasConocidas = [
      'proyecto_nombre', 'desarrollador', 'zona', 'direccion', 'piso',
      'precio_usd', 'precio_usd_original', 'tipo_cambio_usado', 'tipo_cambio',
      'depende_de_tc', 'area_m2', 'dormitorios', 'banos',
      'estado_construccion', 'fecha_entrega', 'descripcion',
      'parqueo_incluido', 'cantidad_parqueos', 'precio_parqueo_extra',
      'baulera_incluida', 'precio_baulera_extra',
      'acepta_permuta', 'precio_negociable', 'descuento_contado',
      'expensas_usd', 'amenidades', 'campos_bloqueados', 'historial_cambios',
      'id_proyecto_master', 'latitud', 'longitud', 'plan_pagos',
      // Nuevas columnas (migración 100) - se usarán si existen
      'moneda_publicacion', 'acepta_plan_pagos', 'plan_pagos_cuotas',
      'solo_contado_paralelo', 'parqueo_estado', 'baulera_estado',
      'parqueo_precio_adicional', 'baulera_precio_adicional'
    ]

    // Filtrar solo columnas conocidas para evitar errores si faltan columnas nuevas
    const updateDataFiltrado: Record<string, any> = {}
    for (const col of columnasConocidas) {
      if (col in updateData) {
        updateDataFiltrado[col] = updateData[col]
      }
    }

    // Actualizar
    const { data, error } = await supabase
      .from('propiedades_broker')
      .update({
        ...updateDataFiltrado,
        updated_at: new Date().toISOString()
      })
      .eq('id', propiedad_id)
      .select()
      .single()

    if (error) {
      // Si el error es por columna inexistente, intentar sin las nuevas columnas
      if (error.message?.includes('column') && error.message?.includes('does not exist')) {
        console.warn('Columna no existe, reintentando sin columnas nuevas:', error.message)

        // Quitar columnas que pueden no existir
        const columnasLegacy = columnasConocidas.filter(c =>
          !['moneda_publicacion', 'acepta_plan_pagos', 'plan_pagos_cuotas',
            'solo_contado_paralelo', 'parqueo_estado', 'baulera_estado',
            'parqueo_precio_adicional', 'baulera_precio_adicional'].includes(c)
        )

        const updateDataLegacy: Record<string, any> = {}
        for (const col of columnasLegacy) {
          if (col in updateData) {
            updateDataLegacy[col] = updateData[col]
          }
        }

        const { data: dataRetry, error: errorRetry } = await supabase
          .from('propiedades_broker')
          .update({
            ...updateDataLegacy,
            updated_at: new Date().toISOString()
          })
          .eq('id', propiedad_id)
          .select()
          .single()

        if (errorRetry) {
          console.error('Error actualizando propiedad (retry):', errorRetry)
          return res.status(500).json({ success: false, error: errorRetry.message })
        }

        return res.status(200).json({ success: true, data: dataRetry })
      }

      console.error('Error actualizando propiedad:', error)
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
