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

// ========== LANDING PAGE FUNCTIONS ==========

// Métricas de mercado para la landing
export interface MetricasMercado {
  precio_promedio_m2: number
  total_propiedades: number
  por_dormitorios: { dormitorios: number; cantidad: number }[]
  rango_min: number
  rango_max: number
}

export async function obtenerMetricasMercado(): Promise<MetricasMercado | null> {
  if (!supabase) return null

  try {
    // Usar la vista v_metricas_mercado si existe, o query directo
    const { data, error } = await supabase
      .from('propiedades_v2')
      .select('precio_usd, area_total_m2, dormitorios')
      .eq('es_activa', true)
      .eq('tipo_operacion', 'venta')
      .gte('precio_usd', 30000)

    if (error || !data) return null

    // Calcular métricas
    const propiedadesValidas = data.filter((p: any) =>
      p.area_total_m2 > 20 && p.precio_usd / p.area_total_m2 >= 800
    )

    if (propiedadesValidas.length === 0) return null

    const precios = propiedadesValidas.map((p: any) => p.precio_usd)
    const preciosM2 = propiedadesValidas.map((p: any) => p.precio_usd / p.area_total_m2)

    // Agrupar por dormitorios
    const porDorms: Record<number, number> = {}
    propiedadesValidas.forEach((p: any) => {
      const d = p.dormitorios || 0
      porDorms[d] = (porDorms[d] || 0) + 1
    })

    return {
      precio_promedio_m2: Math.round(preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length),
      total_propiedades: propiedadesValidas.length,
      por_dormitorios: Object.entries(porDorms)
        .map(([d, c]) => ({ dormitorios: parseInt(d), cantidad: c }))
        .sort((a, b) => a.dormitorios - b.dormitorios),
      rango_min: Math.min(...precios),
      rango_max: Math.max(...precios)
    }
  } catch (err) {
    console.error('Error obteniendo métricas:', err)
    return null
  }
}

// TC Binance para Market Lens
export interface TCData {
  precio_venta: number
  precio_compra: number
  fecha: string
}

export async function obtenerTCBinance(): Promise<TCData | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('tc_binance_historial')
      .select('precio_venta, precio_compra, fecha')
      .order('fecha', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null

    return {
      precio_venta: parseFloat(data.precio_venta),
      precio_compra: parseFloat(data.precio_compra),
      fecha: data.fecha
    }
  } catch {
    return null
  }
}

// Snapshot 24h para Market Lens
export interface Snapshot24h {
  nuevos: number
  tc_actual: number
  tc_variacion: number
  precio_real_m2: number
}

export async function obtenerSnapshot24h(): Promise<Snapshot24h | null> {
  if (!supabase) return null

  try {
    // Propiedades nuevas en últimas 24h
    const hace24h = new Date()
    hace24h.setHours(hace24h.getHours() - 24)

    const { data: nuevas, error: errNuevas } = await supabase
      .from('propiedades_v2')
      .select('id')
      .gte('fecha_descubierto', hace24h.toISOString())

    // TC actual y anterior
    const { data: tcs, error: errTc } = await supabase
      .from('tc_binance_historial')
      .select('precio_venta, fecha')
      .order('fecha', { ascending: false })
      .limit(2)

    if (errNuevas || errTc) return null

    const tcActual = tcs?.[0]?.precio_venta || 10.95
    const tcAnterior = tcs?.[1]?.precio_venta || tcActual
    const variacion = ((tcActual - tcAnterior) / tcAnterior) * 100

    // Precio real ajustado
    const metricas = await obtenerMetricasMercado()
    const precioRealM2 = metricas ? Math.round(metricas.precio_promedio_m2 * (6.96 / tcActual)) : 1186

    return {
      nuevos: nuevas?.length || 0,
      tc_actual: tcActual,
      tc_variacion: Math.round(variacion * 10) / 10,
      precio_real_m2: precioRealM2
    }
  } catch {
    return null
  }
}

// Guardar lead
export interface LeadData {
  nombre: string
  email: string
  whatsapp: string
  presupuesto?: number
  dormitorios?: number
}

export async function guardarLead(lead: LeadData): Promise<boolean> {
  if (!supabase) return false

  try {
    const { error } = await supabase
      .from('leads')
      .insert([{
        nombre: lead.nombre,
        email: lead.email,
        whatsapp: lead.whatsapp,
        presupuesto_usd: lead.presupuesto,
        dormitorios: lead.dormitorios,
        fuente: 'landing_mvp',
        created_at: new Date().toISOString()
      }])

    return !error
  } catch {
    return false
  }
}
