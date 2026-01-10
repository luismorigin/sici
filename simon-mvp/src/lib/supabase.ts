import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseAnonKey) : null

// Tipos para las respuestas (match con RPC buscar_unidades_reales v2.1)
export interface UnidadReal {
  id: number
  proyecto: string
  desarrollador: string | null
  zona: string
  microzona: string | null
  dormitorios: number
  precio_usd: number
  precio_m2: number
  area_m2: number
  score_calidad: number | null
  asesor_nombre: string | null
  asesor_wsp: string | null
  asesor_inmobiliaria: string | null
  fotos_urls: string[]
  cantidad_fotos: number
  url: string
  amenities_lista: string[]
  razon_fiduciaria: string | null  // NEW: razón del SQL
  es_multiproyecto: boolean
}

// Filtros para búsqueda
export interface FiltrosBusqueda {
  dormitorios?: number
  precio_max?: number
  precio_min?: number
  area_min?: number
  zona?: string           // Una zona específica
  zonas_permitidas?: string[]  // Lista de zonas permitidas (para excluir las no seleccionadas)
  proyecto?: string
  solo_con_telefono?: boolean
  orden?: 'precio_asc' | 'precio_desc'
  limite?: number
}

// Mapeo de IDs de microzona del formulario a nombres en BD
const microzonaToZona: Record<string, string> = {
  'equipetrol': 'Equipetrol',
  'sirari': 'Sirari',
  'equipetrol_norte_norte': 'Equipetrol Norte',
  'equipetrol_norte_sur': 'Equipetrol Norte',
  'villa_brigida': 'Villa Brigida',
  'faremafu': 'Faremafu',
  'flexible': '' // vacío = no filtra
}

export async function buscarUnidadesReales(filtros: FiltrosBusqueda): Promise<UnidadReal[]> {
  if (!supabase) {
    console.warn('Supabase no configurado')
    return []
  }

  try {
    // Construir filtros para RPC (v2.1 ya incluye filtros de venta, área>=20m², etc.)
    const rpcFiltros: Record<string, any> = {
      limite: filtros.limite || 10,
      solo_con_fotos: true  // MVP siempre quiere fotos
    }

    if (filtros.precio_max) rpcFiltros.precio_max = filtros.precio_max
    if (filtros.precio_min) rpcFiltros.precio_min = filtros.precio_min
    if (filtros.dormitorios) rpcFiltros.dormitorios = filtros.dormitorios
    if (filtros.area_min) rpcFiltros.area_min = filtros.area_min
    if (filtros.zona) rpcFiltros.zona = filtros.zona

    // Llamar RPC buscar_unidades_reales v2.1
    const { data, error } = await supabase.rpc('buscar_unidades_reales', {
      p_filtros: rpcFiltros
    })

    if (error) {
      console.error('Error en RPC buscar_unidades_reales:', error)
      return []
    }

    // Mapear respuesta RPC a interfaz UnidadReal
    const resultados: UnidadReal[] = (data || []).map((p: any) => ({
      id: p.id,
      proyecto: p.proyecto || 'Sin proyecto',
      desarrollador: p.desarrollador,
      zona: p.zona || 'Sin zona',
      microzona: p.microzona,
      dormitorios: p.dormitorios,
      precio_usd: parseFloat(p.precio_usd) || 0,
      precio_m2: parseFloat(p.precio_m2) || 0,
      area_m2: parseFloat(p.area_m2) || 0,
      score_calidad: p.score_calidad,
      asesor_nombre: p.asesor_nombre,
      asesor_wsp: p.asesor_wsp,
      asesor_inmobiliaria: p.asesor_inmobiliaria,
      fotos_urls: p.fotos_urls || [],
      cantidad_fotos: p.cantidad_fotos || 0,
      url: p.url || '',
      amenities_lista: p.amenities_lista || [],
      razon_fiduciaria: p.razon_fiduciaria,  // Ya viene del SQL
      es_multiproyecto: p.es_multiproyecto || false
    }))

    // Filtrar por zonas permitidas si se especificaron
    if (filtros.zonas_permitidas && filtros.zonas_permitidas.length > 0) {
      // Convertir IDs del formulario a nombres de BD usando el mapeo
      // También acepta nombres directos (por compatibilidad)
      const nombresValidos = Object.values(microzonaToZona).filter(Boolean)
      const zonasNombres = filtros.zonas_permitidas
        .map(z => {
          // Si es un ID conocido, convertir a nombre
          if (microzonaToZona[z] !== undefined) {
            return microzonaToZona[z]
          }
          // Si ya es un nombre válido, usarlo directamente
          if (nombresValidos.some(n => n.toLowerCase() === z.toLowerCase())) {
            return z
          }
          return '' // Desconocido, ignorar
        })
        .filter(Boolean) // Eliminar vacíos

      // Si no hay zonas específicas (solo 'flexible'), no filtrar
      if (zonasNombres.length === 0) {
        return resultados
      }

      // Filtrar por coincidencia exacta de zona
      return resultados.filter(p =>
        zonasNombres.some(zonaNombre =>
          p.zona.toLowerCase() === zonaNombre.toLowerCase()
        )
      )
    }

    return resultados
  } catch (err) {
    console.error('Error en buscarUnidadesReales:', err)
    return []
  }
}

// Convertir zona del formulario a nombre de BD
export function convertirZona(zonaForm: string): string {
  return microzonaToZona[zonaForm] || ''
}

// Buscar cuántas opciones hay en el siguiente rango de precio
export interface SiguienteRangoInfo {
  precio_sugerido: number
  cantidad_adicional: number
}

export async function buscarSiguienteRango(
  presupuestoActual: number,
  dormitorios?: number,
  zona?: string
): Promise<SiguienteRangoInfo | null> {
  if (!supabase) return null

  try {
    // Buscar el precio mínimo de la siguiente opción disponible
    let query = supabase
      .from('propiedades_v2')
      .select(`
        precio_usd,
        area_total_m2,
        proyectos_master!inner (zona)
      `)
      .eq('es_activa', true)
      .eq('tipo_operacion', 'venta')
      .gt('precio_usd', presupuestoActual)
      .gte('precio_usd', 30000)
      .order('precio_usd', { ascending: true })

    if (dormitorios) {
      query = query.eq('dormitorios', dormitorios)
    }
    if (zona && zona !== '') {
      query = query.ilike('proyectos_master.zona', `%${zona}%`)
    }

    const { data, error } = await query.limit(20)

    if (error || !data || data.length === 0) return null

    // Filtrar por precio/m² >= 800 y encontrar opciones válidas
    const opcionesValidas = data.filter((p: any) => {
      const precioM2 = p.area_total_m2 > 0 ? p.precio_usd / p.area_total_m2 : 0
      return precioM2 >= 800
    })

    if (opcionesValidas.length === 0) return null

    // Sugerir precio redondeado al siguiente $10k
    const precioMinimo = opcionesValidas[0].precio_usd
    const precioSugerido = Math.ceil(precioMinimo / 10000) * 10000

    return {
      precio_sugerido: precioSugerido,
      cantidad_adicional: opcionesValidas.length
    }
  } catch (err) {
    console.error('Error buscando siguiente rango:', err)
    return null
  }
}

// Verificar conexión
export async function verificarConexion(): Promise<boolean> {
  if (!supabase) return false

  try {
    const { error } = await supabase.from('proyectos_master').select('id_proyecto_master').limit(1)
    return !error
  } catch {
    return false
  }
}
