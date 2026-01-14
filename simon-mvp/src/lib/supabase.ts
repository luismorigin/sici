import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseAnonKey) : null

// Tipos para las respuestas (match con RPC buscar_unidades_reales v2.2)
export interface UnidadReal {
  id: number
  proyecto: string
  desarrollador: string | null
  zona: string
  microzona: string | null
  dormitorios: number
  banos: number | null  // v2.11
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
  razon_fiduciaria: string | null
  es_multiproyecto: boolean
  estado_construccion: string  // v2.2: entrega_inmediata, nuevo_a_estrenar, usado, preventa, no_especificado
  dias_en_mercado: number | null  // v2.6: días desde fecha_publicacion
  // v2.7: Comparación dentro del edificio
  unidades_en_edificio: number | null
  posicion_precio_edificio: number | null  // 1 = más barata
  precio_min_edificio: number | null
  precio_max_edificio: number | null
  // v2.8: Comparación por tipología (mismos dormitorios)
  unidades_misma_tipologia: number | null
  posicion_en_tipologia: number | null  // 1 = más barata de X dorms
  precio_min_tipologia: number | null
  precio_max_tipologia: number | null
  // v2.9: Amenidades con interpretación fiduciaria
  amenities_confirmados: string[]    // Confianza alta/media
  amenities_por_verificar: string[]  // Confianza baja o por_confirmar
  // v2.10: Equipamiento detectado en descripción
  equipamiento_detectado: string[]   // Items mencionados en publicación (A/C, Cocina equipada, etc.)
  // v2.12: Descripción del anunciante
  descripcion: string | null
  // v2.13: Posición de mercado (comparación vs promedio zona)
  posicion_mercado: {
    success: boolean
    categoria: 'oportunidad' | 'bajo_promedio' | 'precio_justo' | 'sobre_promedio' | 'premium'
    diferencia_pct: number
    posicion_texto: string
    contexto: {
      promedio_zona: number
      stock_disponible: number
      precio_consultado: number
    }
  } | null
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
  // v2.4: Filtro estado entrega (3 opciones MOAT)
  estado_entrega?: 'entrega_inmediata' | 'solo_preventa' | 'no_importa'
}

// Mapeo de IDs de microzona del formulario a nombres en BD
// Algunos IDs expanden a múltiples zonas (ej: equipetrol_norte → ambas subzonas)
const microzonaToZona: Record<string, string | string[]> = {
  'equipetrol': 'Equipetrol',
  'sirari': 'Sirari',
  'villa_brigida': 'Villa Brigida',
  'faremafu': 'Faremafu',
  'equipetrol_norte': ['Equipetrol Norte/Norte', 'Equipetrol Norte/Sur'],  // Agrupa ambas sub-zonas
  'equipetrol_norte_norte': 'Equipetrol Norte/Norte',
  'equipetrol_norte_sur': 'Equipetrol Norte/Sur',
  'flexible': '' // vacío = no filtra
}

export async function buscarUnidadesReales(filtros: FiltrosBusqueda): Promise<UnidadReal[]> {
  if (!supabase) {
    console.warn('Supabase no configurado')
    return []
  }

  try {
    // Construir filtros para RPC (v2.3 ya incluye filtros de venta, área>=20m², estado_entrega, etc.)
    const rpcFiltros: Record<string, any> = {
      limite: filtros.limite || 10,
      solo_con_fotos: true  // MVP siempre quiere fotos (fix 033 aplicado)
    }

    if (filtros.precio_max) rpcFiltros.precio_max = filtros.precio_max
    if (filtros.precio_min) rpcFiltros.precio_min = filtros.precio_min
    if (filtros.dormitorios !== undefined) rpcFiltros.dormitorios = filtros.dormitorios
    if (filtros.area_min) rpcFiltros.area_min = filtros.area_min
    if (filtros.zona) rpcFiltros.zona = filtros.zona
    if (filtros.estado_entrega) rpcFiltros.estado_entrega = filtros.estado_entrega

    // Llamar RPC buscar_unidades_reales v2.2
    const { data, error } = await supabase.rpc('buscar_unidades_reales', {
      p_filtros: rpcFiltros
    })

    if (error) {
      console.error('Error en RPC buscar_unidades_reales:', error)
      return []
    }

    // Mapear respuesta RPC a interfaz UnidadReal (v2.2)
    const resultados: UnidadReal[] = (data || []).map((p: any) => ({
      id: p.id,
      proyecto: p.proyecto || 'Sin proyecto',
      desarrollador: p.desarrollador,
      zona: p.zona || 'Sin zona',
      microzona: p.microzona,
      dormitorios: p.dormitorios,
      banos: p.banos ? parseFloat(p.banos) : null,  // v2.11
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
      razon_fiduciaria: p.razon_fiduciaria,
      es_multiproyecto: p.es_multiproyecto || false,
      estado_construccion: p.estado_construccion || 'no_especificado',
      dias_en_mercado: p.dias_en_mercado,
      // v2.7: Comparación edificio
      unidades_en_edificio: p.unidades_en_edificio,
      posicion_precio_edificio: p.posicion_precio_edificio,
      precio_min_edificio: p.precio_min_edificio ? parseFloat(p.precio_min_edificio) : null,
      precio_max_edificio: p.precio_max_edificio ? parseFloat(p.precio_max_edificio) : null,
      // v2.8: Comparación por tipología
      unidades_misma_tipologia: p.unidades_misma_tipologia,
      posicion_en_tipologia: p.posicion_en_tipologia,
      precio_min_tipologia: p.precio_min_tipologia ? parseFloat(p.precio_min_tipologia) : null,
      precio_max_tipologia: p.precio_max_tipologia ? parseFloat(p.precio_max_tipologia) : null,
      // v2.9: Amenidades fiduciarias
      amenities_confirmados: p.amenities_confirmados || [],
      amenities_por_verificar: p.amenities_por_verificar || [],
      // v2.10: Equipamiento detectado
      equipamiento_detectado: p.equipamiento_detectado || [],
      // v2.12: Descripción del anunciante
      descripcion: p.descripcion || null,
      // v2.13: Posición de mercado
      posicion_mercado: p.posicion_mercado || null
    }))

    // Filtrar por zonas permitidas si se especificaron
    if (filtros.zonas_permitidas && filtros.zonas_permitidas.length > 0) {
      // Convertir IDs del formulario a nombres de BD usando el mapeo
      // También acepta nombres directos (por compatibilidad)
      // Nota: algunos IDs expanden a múltiples zonas (ej: equipetrol_norte → array)
      const nombresValidos = Object.values(microzonaToZona).flat().filter(Boolean)
      const zonasNombres: string[] = []

      for (const z of filtros.zonas_permitidas) {
        // Si es un ID conocido, convertir a nombre(s)
        if (microzonaToZona[z] !== undefined) {
          const valor = microzonaToZona[z]
          if (Array.isArray(valor)) {
            zonasNombres.push(...valor)
          } else if (valor) {
            zonasNombres.push(valor)
          }
        } else if (nombresValidos.some(n => typeof n === 'string' && n.toLowerCase() === z.toLowerCase())) {
          // Si ya es un nombre válido, usarlo directamente
          zonasNombres.push(z)
        }
      }

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
  tc_sell: number
  tc_buy: number
  timestamp: string
}

export async function obtenerTCBinance(): Promise<TCData | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('tc_binance_historial')
      .select('tc_sell, tc_buy, timestamp')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null

    return {
      tc_sell: parseFloat(data.tc_sell),
      tc_buy: parseFloat(data.tc_buy),
      timestamp: data.timestamp
    }
  } catch {
    return null
  }
}

// Snapshot 24h para Market Lens
export interface Snapshot24h {
  nuevos: number
  retirados: number
  bajadas_precio: number
  tc_actual: number
  tc_variacion: number
  precio_m2_promedio: number
  // MOAT: datos para alertas fiduciarias
  score_bajo: number
  props_tc_paralelo: number
  dias_mediana_equipetrol: number
  unidades_equipetrol_2d: number
  total_activas: number
  proyectos_monitoreados: number
}

export async function obtenerSnapshot24h(): Promise<Snapshot24h | null> {
  if (!supabase) return null

  try {
    // 1. Obtener últimos 2 snapshots de auditoría para calcular diferencias
    const { data: snapshots, error: errSnap } = await supabase
      .from('auditoria_snapshots')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(2)

    // 2. TC actual y anterior
    const { data: tcs, error: errTc } = await supabase
      .from('tc_binance_historial')
      .select('tc_sell, timestamp')
      .order('timestamp', { ascending: false })
      .limit(2)

    // 3. Propiedades con TC paralelo
    const { data: tcParalelo, error: errTcPar } = await supabase
      .from('propiedades_v2')
      .select('id')
      .eq('status', 'completado')
      .eq('tipo_cambio_detectado', 'paralelo')

    // 4. Días en mercado Equipetrol 2D (desde v_metricas_mercado)
    const { data: metricasEqui, error: errMetricas } = await supabase
      .from('v_metricas_mercado')
      .select('dias_mediana, stock')
      .eq('zona', 'Equipetrol')
      .eq('dormitorios', 2)
      .single()

    // 5. Proyectos monitoreados
    const { data: proyectos, error: errProy } = await supabase
      .from('proyectos_master')
      .select('id')
      .eq('activo', true)

    if (errSnap || errTc) {
      console.warn('Error obteniendo snapshot:', errSnap?.message, errTc?.message)
      return null
    }

    const snapHoy = snapshots?.[0]
    const snapAyer = snapshots?.[1]

    const tcActual = tcs?.[0]?.tc_sell ? parseFloat(tcs[0].tc_sell) : 9.72
    const tcAnterior = tcs?.[1]?.tc_sell ? parseFloat(tcs[1].tc_sell) : tcActual
    const variacion = tcAnterior > 0 ? ((tcActual - tcAnterior) / tcAnterior) * 100 : 0

    // Calcular retirados = diferencia de inactivas
    const retirados = snapHoy && snapAyer
      ? Math.max(0, (snapHoy.props_inactivas || 0) - (snapAyer.props_inactivas || 0))
      : 0

    // Precio promedio m² desde métricas
    const metricas = await obtenerMetricasMercado()

    return {
      nuevos: snapHoy?.props_creadas_24h || 0,
      retirados,
      bajadas_precio: 0, // TODO: calcular desde precios_historial cuando haya data
      tc_actual: tcActual,
      tc_variacion: Math.round(variacion * 100) / 100,
      precio_m2_promedio: metricas?.precio_promedio_m2 || 2022,
      // MOAT data
      score_bajo: snapHoy?.score_bajo || 0,
      props_tc_paralelo: tcParalelo?.length || 0,
      dias_mediana_equipetrol: metricasEqui?.dias_mediana || 51,
      unidades_equipetrol_2d: metricasEqui?.stock || 31,
      total_activas: snapHoy?.props_completadas || 302,
      proyectos_monitoreados: proyectos?.length || 189
    }
  } catch (err) {
    console.warn('Error en obtenerSnapshot24h:', err)
    return null
  }
}

// ========== SCORE CONFIANZA ==========

export interface ScoreConfianza {
  propiedad_id: number
  score: number
  max_score: number
  porcentaje: number
  categoria: 'excelente' | 'bueno' | 'aceptable' | 'bajo'
  resumen: string
  detalles: {
    componente: string
    puntos: number
    maximo: number
    nota: string
  }[]
}

export async function obtenerScoreConfianza(propiedadId: number): Promise<ScoreConfianza | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.rpc('calcular_confianza_datos', {
      p_id: propiedadId
    })

    if (error) {
      console.warn('Error obteniendo score confianza:', error.message)
      return null
    }

    return data as ScoreConfianza
  } catch (err) {
    console.warn('Error en obtenerScoreConfianza:', err)
    return null
  }
}

// Obtener scores para múltiples propiedades en paralelo
export async function obtenerScoresConfianza(propiedadIds: number[]): Promise<Map<number, number>> {
  const scores = new Map<number, number>()

  if (!supabase || propiedadIds.length === 0) return scores

  try {
    // Llamar en paralelo para cada ID
    const promises = propiedadIds.map(id => obtenerScoreConfianza(id))
    const results = await Promise.all(promises)

    results.forEach((result, index) => {
      if (result) {
        scores.set(propiedadIds[index], result.porcentaje)
      }
    })
  } catch (err) {
    console.warn('Error obteniendo scores múltiples:', err)
  }

  return scores
}

// ========== SLACK NOTIFICATIONS ==========

export type SlackEvent = 'lead_created' | 'form_completed' | 'property_interest'

export async function notificarSlack(
  event: SlackEvent,
  leadId: number,
  data: { nombre?: string; whatsapp?: string; proyecto?: string; propiedad_id?: number }
): Promise<boolean> {
  try {
    const response = await fetch('/api/notify-slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, leadId, data })
    })

    const result = await response.json()
    // Nota: No actualizamos slack_notificado porque anon no tiene UPDATE permission
    return result.ok
  } catch (err) {
    // Slack es secundario, no fallar por esto
    console.warn('Error notificando a Slack:', err)
    return false
  }
}

// ========== GUARDAR LEAD ==========

export interface LeadData {
  nombre: string
  email: string
  whatsapp: string
  presupuesto?: number
  dormitorios?: number
  zona?: string
  prioridades?: string[]
  dispositivo?: string
}

export interface LeadResult {
  success: boolean
  leadId?: number
  error?: string
}

export async function guardarLead(lead: LeadData): Promise<LeadResult> {
  if (!supabase) {
    console.warn('Supabase no configurado - lead no guardado')
    return { success: false, error: 'Supabase no configurado' }
  }

  try {
    // Detectar dispositivo
    const dispositivo = typeof window !== 'undefined'
      ? (window.innerWidth < 768 ? 'mobile' : 'desktop')
      : 'unknown'

    // Construir formulario_raw con todos los datos
    const formularioRaw = {
      nombre: lead.nombre,
      email: lead.email,
      whatsapp: lead.whatsapp,
      presupuesto: lead.presupuesto,
      dormitorios: lead.dormitorios,
      zona: lead.zona,
      prioridades: lead.prioridades,
      fuente: 'landing_mvp',
      timestamp: new Date().toISOString(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
    }

    const { error } = await supabase
      .from('leads_mvp')
      .insert([{
        nombre: lead.nombre,
        whatsapp: lead.whatsapp,
        email: lead.email || null,
        formulario_raw: formularioRaw,
        estado: 'nuevo',
        dispositivo
      }])

    if (error) {
      console.error('Error guardando lead:', error)
      return { success: false, error: error.message }
    }

    // No podemos obtener el ID sin SELECT permission, pero el lead se guardó
    const leadId = Date.now() // ID temporal para notificación
    console.log('Lead guardado exitosamente:', leadId)

    // Notificar a Slack (async, no bloqueante)
    if (leadId) {
      notificarSlack('lead_created', leadId, {
        nombre: lead.nombre,
        whatsapp: lead.whatsapp
      })
    }

    return { success: true, leadId }
  } catch (err) {
    console.error('Error inesperado guardando lead:', err)
    return { success: false, error: 'Error inesperado' }
  }
}

// Actualizar progreso del lead (para formulario multi-step)
export async function actualizarProgresoLead(
  leadId: number,
  seccion: string,
  datos: Record<string, any>
): Promise<boolean> {
  if (!supabase) return false

  try {
    // Obtener progreso actual
    const { data: leadActual, error: errFetch } = await supabase
      .from('leads_mvp')
      .select('formulario_raw, progreso_secciones')
      .eq('id', leadId)
      .single()

    if (errFetch) return false

    // Merge datos
    const formularioActualizado = {
      ...(leadActual?.formulario_raw || {}),
      ...datos,
      ultima_seccion: seccion,
      updated_at: new Date().toISOString()
    }

    const progresoActualizado = {
      ...(leadActual?.progreso_secciones || {}),
      [seccion]: {
        completado: true,
        timestamp: new Date().toISOString()
      }
    }

    const { error } = await supabase
      .from('leads_mvp')
      .update({
        formulario_raw: formularioActualizado,
        progreso_secciones: progresoActualizado,
        seccion_actual: seccion,
        estado: 'en_progreso',
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)

    return !error
  } catch {
    return false
  }
}

// Marcar lead como confirmado
export async function confirmarLead(leadId: number): Promise<boolean> {
  if (!supabase) return false

  try {
    const { error } = await supabase
      .from('leads_mvp')
      .update({
        estado: 'confirmado',
        confirmado_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)

    return !error
  } catch {
    return false
  }
}

// ========== ANÁLISIS MERCADO FIDUCIARIO ==========

// Tipos para analisis_mercado_fiduciario()
export interface PosicionMercado {
  success: boolean
  categoria: 'oportunidad' | 'precio_justo' | 'premium'
  diferencia_pct: number
  posicion_texto: string
  contexto: {
    promedio_zona: number
    stock_disponible: number
    precio_consultado: number
  }
}

export interface ExplicacionPrecio {
  propiedad_id: number
  precio_usd: number
  precio_m2: number
  zona: string
  promedio_zona: number
  diferencia_pct: number
  resumen: string
  explicaciones: {
    factor: string
    texto: string
    impacto: string
  }[]
}

export interface OpcionValida {
  id: number
  proyecto: string
  desarrollador: string | null
  zona: string
  dormitorios: number
  precio_usd: number
  precio_m2: number
  area_m2: number
  ranking: number
  total_opciones: number
  fotos: number
  amenities: string[]
  asesor_wsp: string | null
  posicion_mercado: PosicionMercado
  explicacion_precio: ExplicacionPrecio
  resumen_fiduciario: string
}

export interface RazonExclusion {
  filtro: string
  razon: string
  severidad: 'hard' | 'medium' | 'soft' | 'alert'
  valor_actual: any
  valor_requerido: any
  sugerencia?: string
}

export interface OpcionExcluida {
  id: number
  proyecto: string
  zona: string
  precio_usd: number
  dormitorios: number | null
  area_m2: number
  analisis_exclusion: {
    propiedad_id: number
    es_excluida: boolean
    cantidad_razones: number
    razon_principal: string
    razones: RazonExclusion[]
  }
}

export interface MetricasZona {
  precio_promedio: number
  precio_mediana: number
  precio_min: number
  precio_max: number
  precio_m2_promedio: number
  area_promedio: number
  // v2: Días en mercado para umbrales dinámicos
  dias_promedio: number | null
  dias_mediana: number | null
}

export interface ContextoMercado {
  stock_total: number
  stock_cumple_filtros: number
  stock_excluido_mas_barato: number
  porcentaje_mercado: number
  diagnostico: string
  metricas_zona: MetricasZona | null
}

export interface AlertaFiduciaria {
  tipo: string
  mensaje: string
  severidad: 'warning' | 'info' | 'danger'
  propiedad_id?: number
  precio_usd?: number
  precio_m2?: number
}

export interface AnalisisMercadoFiduciario {
  filtros_aplicados: {
    dormitorios?: number
    precio_max?: number
    zona?: string
    solo_con_fotos?: boolean
    limite?: number
  }
  timestamp: string
  bloque_1_opciones_validas: {
    total: number
    opciones: OpcionValida[]
  }
  bloque_2_opciones_excluidas: {
    total: number
    nota: string
    opciones: OpcionExcluida[]
  }
  bloque_3_contexto_mercado: ContextoMercado
  bloque_4_alertas: {
    total: number
    alertas: AlertaFiduciaria[]
  }
}

export interface ContextoUsuario {
  estado_emocional?: string
  meses_buscando?: number
  mascota?: string
  quienes_viven?: string
}

export interface FiltrosAnalisis {
  dormitorios?: number
  precio_max?: number
  zona?: string
  solo_con_fotos?: boolean
  limite?: number
  innegociables?: string[]
  contexto?: ContextoUsuario
}

export async function obtenerAnalisisFiduciario(filtros: FiltrosAnalisis): Promise<AnalisisMercadoFiduciario | null> {
  if (!supabase) {
    console.warn('Supabase no configurado')
    return null
  }

  try {
    const { data, error } = await supabase.rpc('analisis_mercado_fiduciario', {
      p_filtros: filtros
    })

    if (error) {
      console.error('Error en RPC analisis_mercado_fiduciario:', error)
      return null
    }

    return data as AnalisisMercadoFiduciario
  } catch (err) {
    console.error('Error obteniendo análisis fiduciario:', err)
    return null
  }
}

// Función helper para generar distribución de precios
export function generarDistribucionPrecios(
  opciones: OpcionValida[],
  contexto: ContextoMercado
): { label: string; value: number; highlight?: boolean }[] {
  if (!contexto.metricas_zona) {
    return [
      { label: '60k-80k', value: 0 },
      { label: '80k-100k', value: 0 },
      { label: '100k-120k', value: 0 },
      { label: '120k+', value: 0 }
    ]
  }

  // Crear rangos basados en las métricas reales
  const min = contexto.metricas_zona.precio_min
  const max = contexto.metricas_zona.precio_max
  const rango = max - min
  const step = rango / 4

  const rangos = [
    { min: min, max: min + step, label: `${Math.round(min/1000)}k-${Math.round((min+step)/1000)}k`, count: 0 },
    { min: min + step, max: min + step*2, label: `${Math.round((min+step)/1000)}k-${Math.round((min+step*2)/1000)}k`, count: 0 },
    { min: min + step*2, max: min + step*3, label: `${Math.round((min+step*2)/1000)}k-${Math.round((min+step*3)/1000)}k`, count: 0 },
    { min: min + step*3, max: max + 1, label: `${Math.round((min+step*3)/1000)}k+`, count: 0 }
  ]

  // Contar opciones en cada rango
  opciones.forEach(op => {
    for (const r of rangos) {
      if (op.precio_usd >= r.min && op.precio_usd < r.max) {
        r.count++
        break
      }
    }
  })

  // Encontrar el rango con más opciones para highlight
  const maxCount = Math.max(...rangos.map(r => r.count))

  return rangos.map(r => ({
    label: r.label,
    value: r.count,
    highlight: r.count === maxCount && r.count > 0
  }))
}

// Función helper para generar comparaciones de precio/m²
export function generarComparacionesProyecto(
  opciones: OpcionValida[],
  mediaMercado: number
): { proyecto: string; precio: number; diferencia: number }[] {
  return opciones.slice(0, 3).map(op => ({
    proyecto: op.proyecto,
    precio: op.precio_m2,
    diferencia: Math.round(((op.precio_m2 - mediaMercado) / mediaMercado) * 100)
  }))
}

// ========== MICROZONAS ==========

export interface MicrozonaData {
  zona: string
  total: number
  precio_promedio: number
  precio_m2: number
  proyectos: number
  lat?: number
  lng?: number
  categoria: 'premium' | 'standard' | 'value'
}

export async function obtenerMicrozonas(): Promise<MicrozonaData[]> {
  // Fallback con datos REALES de Enero 2026
  const demoData: MicrozonaData[] = [
    { zona: 'Eq. Centro', total: 98, precio_promedio: 156709, precio_m2: 2098, proyectos: 41, categoria: 'standard' },
    { zona: 'Villa Brigida', total: 67, precio_promedio: 71838, precio_m2: 1495, proyectos: 16, categoria: 'value' },
    { zona: 'Sirari', total: 47, precio_promedio: 199536, precio_m2: 2258, proyectos: 13, categoria: 'premium' },
    { zona: 'Eq. Norte/Norte', total: 19, precio_promedio: 153354, precio_m2: 2340, proyectos: 11, categoria: 'premium' },
    { zona: 'Eq. Oeste (Busch)', total: 16, precio_promedio: 277350, precio_m2: 2122, proyectos: 9, categoria: 'premium' },
    { zona: 'Eq. Norte/Sur', total: 3, precio_promedio: 128006, precio_m2: 2145, proyectos: 3, categoria: 'standard' }
  ]

  if (!supabase) {
    return demoData
  }

  try {
    // Direct query usando MICROZONA (no zona)
    const { data, error } = await supabase
      .from('propiedades_v2')
      .select('microzona, precio_usd, area_total_m2, id_proyecto_master')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gt('precio_usd', 30000)
      .gt('area_total_m2', 20)
      .not('microzona', 'is', null)

    if (error || !data || data.length === 0) {
      console.warn('Error o sin datos en microzonas, usando demo:', error?.message)
      return demoData
    }

    // Aggregate manually
    const zonaMap: Record<string, { total: number; precios: number[]; m2: number[]; proyectos: Set<number> }> = {}

    data.forEach((p: any) => {
      const zona = p.microzona
      if (!zona) return // Skip si no tiene microzona

      // Acortar/renombrar nombres
      let zonaDisplay = zona
      if (zona === 'Equipetrol') zonaDisplay = 'Eq. Centro'
      else if (zona === 'Equipetrol Norte/Norte') zonaDisplay = 'Eq. Norte/Norte'
      else if (zona === 'Equipetrol Norte/Sur') zonaDisplay = 'Eq. Norte/Sur'
      else if (zona === 'Faremafu') zonaDisplay = 'Eq. Oeste (Busch)'

      if (!zonaMap[zonaDisplay]) {
        zonaMap[zonaDisplay] = { total: 0, precios: [], m2: [], proyectos: new Set() }
      }
      zonaMap[zonaDisplay].total++
      if (p.precio_usd) zonaMap[zonaDisplay].precios.push(p.precio_usd)
      if (p.area_total_m2 > 0 && p.precio_usd) {
        zonaMap[zonaDisplay].m2.push(p.precio_usd / p.area_total_m2)
      }
      if (p.id_proyecto_master) {
        zonaMap[zonaDisplay].proyectos.add(p.id_proyecto_master)
      }
    })

    const result = Object.entries(zonaMap)
      .filter(([zona, v]) => v.total >= 3 && zona !== 'Sin zona')
      .map(([zona, v]) => {
        const precioM2 = v.m2.length > 0
          ? Math.round(v.m2.reduce((a, b) => a + b, 0) / v.m2.length)
          : 1500
        return {
          zona,
          total: v.total,
          precio_promedio: v.precios.length > 0
            ? Math.round(v.precios.reduce((a, b) => a + b, 0) / v.precios.length)
            : 100000,
          precio_m2: precioM2,
          proyectos: v.proyectos.size,
          categoria: categorizarZona(precioM2)
        }
      })
      .sort((a, b) => b.total - a.total)

    return result.length > 0 ? result : demoData

  } catch (err) {
    console.error('Error obteniendo microzonas:', err)
    return demoData
  }
}

function categorizarZona(precioM2: number): 'premium' | 'standard' | 'value' {
  if (precioM2 >= 2200) return 'premium'
  if (precioM2 >= 1800) return 'standard'
  return 'value'
}

// ========== ESCENARIO FINANCIERO ==========

export interface EscenarioFinanciero {
  propiedad_id: number
  proyecto: string
  precio_usd: number
  precio_m2: number
  // Estimaciones de renta
  renta_estimada_mes: number
  yield_anual: number
  // Liquidez
  tiempo_venta_estimado: string
  liquidez_categoria: 'alta' | 'media' | 'baja'
  // Riesgo
  riesgo_depreciacion: 'bajo' | 'medio' | 'alto'
  factores_riesgo: string[]
}

export function calcularEscenarioFinanciero(opcion: OpcionValida): EscenarioFinanciero {
  // Estimaciones basadas en datos del mercado boliviano
  const YIELD_BASE = 0.045 // 4.5% yield típico en Bolivia
  const RENTA_M2_BASE = 8 // $8/m² base de renta mensual

  // Ajustar yield por categoría de precio
  let yieldAjustado = YIELD_BASE
  if (opcion.posicion_mercado.categoria === 'oportunidad') {
    yieldAjustado = 0.055 // Mejor yield por precio bajo
  } else if (opcion.posicion_mercado.categoria === 'premium') {
    yieldAjustado = 0.035 // Menor yield pero más estable
  }

  const rentaEstimada = Math.round(opcion.area_m2 * RENTA_M2_BASE * (opcion.dormitorios >= 2 ? 1.2 : 1))

  // Liquidez basada en precio y ubicación
  let liquidez: 'alta' | 'media' | 'baja' = 'media'
  let tiempoVenta = '3-6 meses'

  if (opcion.precio_usd < 100000 && opcion.dormitorios === 2) {
    liquidez = 'alta'
    tiempoVenta = '1-3 meses'
  } else if (opcion.precio_usd > 200000) {
    liquidez = 'baja'
    tiempoVenta = '6-12 meses'
  }

  // Factores de riesgo
  const factoresRiesgo: string[] = []
  if (!opcion.desarrollador) {
    factoresRiesgo.push('Desarrollador no identificado')
  }
  if (opcion.precio_m2 < 1000) {
    factoresRiesgo.push('Precio/m² muy bajo - verificar')
  }
  if (opcion.fotos < 5) {
    factoresRiesgo.push('Pocas fotos disponibles')
  }

  const riesgoDepreciacion: 'bajo' | 'medio' | 'alto' =
    factoresRiesgo.length === 0 ? 'bajo' :
    factoresRiesgo.length <= 1 ? 'medio' : 'alto'

  return {
    propiedad_id: opcion.id,
    proyecto: opcion.proyecto,
    precio_usd: opcion.precio_usd,
    precio_m2: opcion.precio_m2,
    renta_estimada_mes: rentaEstimada,
    yield_anual: Math.round(yieldAjustado * 1000) / 10,
    tiempo_venta_estimado: tiempoVenta,
    liquidez_categoria: liquidez,
    riesgo_depreciacion: riesgoDepreciacion,
    factores_riesgo: factoresRiesgo
  }
}
