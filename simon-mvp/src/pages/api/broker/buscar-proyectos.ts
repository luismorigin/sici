/**
 * API: Buscar proyectos para autocomplete en formulario broker
 *
 * GET /api/broker/buscar-proyectos?q=santa&limit=5
 *
 * Busca en proyectos_master usando fuzzy matching (pg_trgm)
 * Retorna datos para herencia: amenidades, GPS, estado construcción
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface ProyectoSugerencia {
  id_proyecto_master: number
  nombre_oficial: string
  desarrollador: string | null
  zona: string | null
  estado_construccion: string | null
  fecha_entrega_estimada: string | null
  latitud: number | null
  longitud: number | null
  amenidades_edificio: string[]
  total_unidades: number
  verificado: boolean
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { q, limit = '8' } = req.query
  const searchTerm = (q as string || '').trim()
  const maxResults = Math.min(parseInt(limit as string) || 8, 20)

  if (searchTerm.length < 2) {
    return res.status(200).json([])
  }

  try {
    // Usar RPC para búsqueda fuzzy si existe, sino ILIKE
    const { data: proyectos, error } = await supabase
      .from('proyectos_master')
      .select(`
        id_proyecto_master,
        nombre_oficial,
        desarrollador,
        zona,
        estado_construccion,
        fecha_entrega_estimada,
        latitud,
        longitud,
        amenidades_edificio,
        pisos,
        unidades_totales
      `)
      .eq('activo', true)
      .or(`nombre_oficial.ilike.%${searchTerm}%,desarrollador.ilike.%${searchTerm}%`)
      .order('nombre_oficial')
      .limit(maxResults)

    if (error) {
      console.error('Error buscando proyectos:', error)
      return res.status(500).json({ error: 'Error en búsqueda' })
    }

    // Contar unidades por proyecto
    const proyectosConUnidades: ProyectoSugerencia[] = await Promise.all(
      (proyectos || []).map(async (pm) => {
        // Contar unidades de propiedades_v2 vinculadas
        const { count } = await supabase
          .from('propiedades_v2')
          .select('id', { count: 'exact', head: true })
          .eq('id_proyecto_master', pm.id_proyecto_master)
          .eq('status', 'completado')

        // Extraer amenidades del edificio (puede ser JSON o array)
        let amenidades: string[] = []
        if (pm.amenidades_edificio) {
          if (Array.isArray(pm.amenidades_edificio)) {
            amenidades = pm.amenidades_edificio
          } else if (typeof pm.amenidades_edificio === 'object') {
            // Si es objeto con estructura {frecuentes: [], opcionales: []}
            const ae = pm.amenidades_edificio as any
            amenidades = [
              ...(ae.frecuentes || []),
              ...(ae.opcionales || [])
            ]
          }
        }

        return {
          id_proyecto_master: pm.id_proyecto_master,
          nombre_oficial: pm.nombre_oficial,
          desarrollador: pm.desarrollador,
          zona: pm.zona,
          estado_construccion: pm.estado_construccion,
          fecha_entrega_estimada: pm.fecha_entrega_estimada,
          latitud: pm.latitud,
          longitud: pm.longitud,
          amenidades_edificio: amenidades,
          total_unidades: count || pm.unidades_totales || 0,
          verificado: !!(pm.latitud && pm.longitud) // Tiene GPS = verificado
        }
      })
    )

    return res.status(200).json(proyectosConUnidades)

  } catch (err) {
    console.error('Error en buscar-proyectos:', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
