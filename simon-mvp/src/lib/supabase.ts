import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseAnonKey) : null

// Tipos para las respuestas
export interface UnidadReal {
  id: number
  proyecto: string
  zona: string
  dormitorios: number
  precio_usd: number
  area_m2: number
  precio_m2: number
  asesor_nombre: string | null
  asesor_wsp: string | null
  asesor_inmobiliaria: string | null
  cantidad_fotos: number
  url: string
  amenities_lista: string[]
  es_multiproyecto: boolean
}

// Filtros para búsqueda
export interface FiltrosBusqueda {
  dormitorios?: number
  precio_max?: number
  precio_min?: number
  area_min?: number
  zona?: string
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
    // Query directo con filtro tipo_operacion = 'venta' (la función RPC no lo tiene)
    let query = supabase
      .from('propiedades_v2')
      .select(`
        id,
        dormitorios,
        precio_usd,
        area_total_m2,
        url,
        es_multiproyecto,
        datos_json,
        proyectos_master!inner (
          nombre_oficial,
          zona
        )
      `)
      .eq('es_activa', true)
      .eq('tipo_operacion', 'venta')  // CRÍTICO: Solo ventas
      .gte('precio_usd', 30000)       // Excluir datos corruptos (precios irreales)

    // Filtro: precio máximo
    if (filtros.precio_max) {
      query = query.lte('precio_usd', filtros.precio_max)
    }

    // Filtro: precio mínimo
    if (filtros.precio_min) {
      query = query.gte('precio_usd', filtros.precio_min)
    }

    // Filtro: dormitorios
    if (filtros.dormitorios) {
      query = query.eq('dormitorios', filtros.dormitorios)
    }

    // Filtro: área mínima
    if (filtros.area_min) {
      query = query.gte('area_total_m2', filtros.area_min)
    }

    // Filtro: zona (en proyectos_master)
    if (filtros.zona && filtros.zona !== '') {
      query = query.ilike('proyectos_master.zona', `%${filtros.zona}%`)
    }

    // Ordenar por precio ascendente
    query = query.order('precio_usd', { ascending: true })

    // Límite
    query = query.limit(filtros.limite || 10)

    const { data, error } = await query

    if (error) {
      console.error('Error buscando unidades:', error)
      return []
    }

    // Mapear a formato esperado y filtrar por precio/m² >= $800 (guardrail Equipetrol)
    return (data || [])
      .map((p: any) => ({
        id: p.id,
        proyecto: p.proyectos_master?.nombre_oficial || 'Sin proyecto',
        zona: p.proyectos_master?.zona || 'Sin zona',
        dormitorios: p.dormitorios,
        precio_usd: p.precio_usd,
        area_m2: p.area_total_m2,
        precio_m2: p.area_total_m2 > 0 ? p.precio_usd / p.area_total_m2 : 0,
        asesor_nombre: p.datos_json?.agente?.nombre || null,
        asesor_wsp: p.datos_json?.agente?.telefono || null,
        asesor_inmobiliaria: p.datos_json?.agente?.oficina_nombre || null,
        cantidad_fotos: Array.isArray(p.datos_json?.contenido?.fotos_urls)
          ? p.datos_json.contenido.fotos_urls.length
          : 0,
        url: p.url,
        amenities_lista: p.datos_json?.amenities?.lista || [],
        es_multiproyecto: p.es_multiproyecto || false
      }))
      .filter((p: any) => p.precio_m2 >= 800) // Excluir datos corruptos ($/m² < $800)
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
