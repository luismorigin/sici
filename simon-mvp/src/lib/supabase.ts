import { createClient } from '@supabase/supabase-js'
import { innegociablesToAmenidades } from '@/config/amenidades-mercado'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseAnonKey) : null

// Obtener tipos de cambio actuales de config_global
export interface TCActuales {
  paralelo: number
  oficial: number
}

// v2.27: Plan de pagos detallado
export interface CuotaPago {
  id: string
  porcentaje: string
  momento: 'reserva' | 'firma_contrato' | 'durante_obra' | 'cuotas_mensuales' | 'entrega' | 'personalizado'
  descripcion: string
}

export async function obtenerTCActuales(): Promise<TCActuales> {
  if (!supabase) {
    return { paralelo: 9.09, oficial: 6.96 } // Fallback
  }

  const { data, error } = await supabase
    .from('config_global')
    .select('clave, valor')
    .in('clave', ['tipo_cambio_paralelo', 'tipo_cambio_oficial'])

  if (error || !data) {
    console.error('Error obteniendo TC:', error)
    return { paralelo: 9.09, oficial: 6.96 } // Fallback
  }

  const tcParalelo = data.find(d => d.clave === 'tipo_cambio_paralelo')?.valor || 9.09
  const tcOficial = data.find(d => d.clave === 'tipo_cambio_oficial')?.valor || 6.96

  return {
    paralelo: Number(tcParalelo),
    oficial: Number(tcOficial)
  }
}

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
  // v2.22: GPS y estacionamientos para mobile-first UI
  latitud: number | null
  longitud: number | null
  estacionamientos: number | null
  // v2.23: Baulera
  baulera: boolean | null
  // v2.24: Campos para propiedades de broker
  fuente_tipo?: 'scraping' | 'broker'
  codigo_sim?: string  // Solo para broker (SIM-XXXXX)
  // v2.25: Piso y forma de pago
  piso: number | null
  plan_pagos_desarrollador: boolean | null
  acepta_permuta: boolean | null
  solo_tc_paralelo: boolean | null
  precio_negociable: boolean | null
  descuento_contado_pct: number | null
  // v2.26: Parqueo y baulera con precios
  parqueo_incluido: boolean | null
  parqueo_precio_adicional: number | null
  baulera_incluido: boolean | null
  baulera_precio_adicional: number | null
  // v2.27: Plan de pagos detallado
  plan_pagos_cuotas: CuotaPago[] | null
  plan_pagos_texto: string | null
  // v2.28: Fecha de entrega para preventa
  fecha_entrega: string | null  // formato 'YYYY-MM' o null
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
    // v2.28: Pasar zonas_permitidas al RPC para filtrar ANTES del límite
    // Convertir IDs del formulario a nombres de BD
    if (filtros.zonas_permitidas && filtros.zonas_permitidas.length > 0) {
      const zonasConvertidas: string[] = []
      for (const z of filtros.zonas_permitidas) {
        if (microzonaToZona[z] !== undefined) {
          const valor = microzonaToZona[z]
          if (Array.isArray(valor)) {
            zonasConvertidas.push(...valor)
          } else if (valor) {
            zonasConvertidas.push(valor)
          }
        } else {
          // Si no está en el mapeo, asumir que ya es nombre de BD
          zonasConvertidas.push(z)
        }
      }
      if (zonasConvertidas.length > 0) {
        rpcFiltros.zonas_permitidas = zonasConvertidas
      }
    }

    // Llamar RPC buscar_unidades_reales v2.27
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
      proyecto: p.nombre_proyecto || p.proyecto || 'Sin proyecto',
      desarrollador: p.desarrollador,
      zona: p.zona || 'Sin zona',
      microzona: p.microzona,
      dormitorios: p.dormitorios,
      banos: p.banos ? parseFloat(p.banos) : null,  // v2.11
      precio_usd: parseFloat(p.precio_usd) || 0,
      precio_m2: parseFloat(p.precio_m2) || 0,
      area_m2: parseFloat(p.area_m2) || 0,
      score_calidad: p.score_calidad,
      asesor_nombre: p.agente_nombre || p.asesor_nombre,
      asesor_wsp: p.agente_telefono || p.asesor_wsp,
      asesor_inmobiliaria: p.agente_oficina || p.asesor_inmobiliaria,
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
      posicion_mercado: p.posicion_mercado || null,
      // v2.22: GPS y estacionamientos
      latitud: p.latitud ? parseFloat(p.latitud) : null,
      longitud: p.longitud ? parseFloat(p.longitud) : null,
      estacionamientos: p.estacionamientos || null,
      // v2.23: Baulera
      baulera: p.baulera ?? null,
      // v2.25: Piso y forma de pago
      piso: p.piso || null,
      plan_pagos_desarrollador: p.plan_pagos_desarrollador ?? null,
      acepta_permuta: p.acepta_permuta ?? null,
      solo_tc_paralelo: p.solo_tc_paralelo ?? null,
      precio_negociable: p.precio_negociable ?? null,
      descuento_contado_pct: p.descuento_contado_pct || null,
      // v2.26: Parqueo y baulera con precios
      parqueo_incluido: p.parqueo_incluido ?? null,
      parqueo_precio_adicional: p.parqueo_precio_adicional || null,
      baulera_incluido: p.baulera_incluido ?? null,
      baulera_precio_adicional: p.baulera_precio_adicional || null,
      // v2.27: Plan de pagos detallado
      plan_pagos_cuotas: p.plan_pagos_cuotas || null,
      plan_pagos_texto: p.plan_pagos_texto || null,
      // v2.28: Fecha de entrega para preventa
      fecha_entrega: p.fecha_entrega || null
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

// ========== BUSQUEDA PROPIEDADES BROKER ==========

// Buscar propiedades cargadas por brokers (tabla separada)
export async function buscarUnidadesBroker(filtros: FiltrosBusqueda): Promise<UnidadReal[]> {
  if (!supabase) {
    console.warn('Supabase no configurado')
    return []
  }

  try {
    // Construir filtros para RPC
    const rpcFiltros: Record<string, any> = {
      limite: filtros.limite || 10,
      solo_con_fotos: true
    }

    if (filtros.precio_max) rpcFiltros.precio_max = filtros.precio_max
    if (filtros.precio_min) rpcFiltros.precio_min = filtros.precio_min
    if (filtros.dormitorios !== undefined) rpcFiltros.dormitorios = filtros.dormitorios
    if (filtros.area_min) rpcFiltros.area_min = filtros.area_min
    if (filtros.zona) rpcFiltros.zona = filtros.zona
    if (filtros.estado_entrega) rpcFiltros.estado_entrega = filtros.estado_entrega

    // Llamar RPC buscar_unidades_broker
    const { data, error } = await supabase.rpc('buscar_unidades_broker', {
      p_filtros: rpcFiltros
    })

    if (error) {
      // No es error critico si la tabla no existe todavia
      console.warn('buscar_unidades_broker no disponible:', error.message)
      return []
    }

    // Mapear respuesta RPC a interfaz UnidadReal
    return (data || []).map((p: any) => ({
      id: p.id,
      proyecto: p.nombre_proyecto || p.proyecto || 'Sin proyecto',
      desarrollador: p.desarrollador,
      zona: p.zona || 'Sin zona',
      microzona: p.microzona,
      dormitorios: p.dormitorios,
      banos: p.banos ? parseFloat(p.banos) : null,
      precio_usd: parseFloat(p.precio_usd) || 0,
      precio_m2: parseFloat(p.precio_m2) || 0,
      area_m2: parseFloat(p.area_m2) || 0,
      score_calidad: p.score_calidad,
      asesor_nombre: p.agente_nombre || p.asesor_nombre,
      asesor_wsp: p.agente_telefono || p.asesor_wsp,
      asesor_inmobiliaria: p.agente_oficina || p.asesor_inmobiliaria,
      fotos_urls: p.fotos_urls || [],
      cantidad_fotos: p.cantidad_fotos || 0,
      url: p.url || '',
      amenities_lista: p.amenities_lista || [],
      razon_fiduciaria: p.razon_fiduciaria,
      es_multiproyecto: false,
      estado_construccion: p.estado_construccion || 'no_especificado',
      dias_en_mercado: p.dias_en_mercado,
      // Stats edificio (null para broker)
      unidades_en_edificio: null,
      posicion_precio_edificio: null,
      precio_min_edificio: null,
      precio_max_edificio: null,
      unidades_misma_tipologia: null,
      posicion_en_tipologia: null,
      precio_min_tipologia: null,
      precio_max_tipologia: null,
      // Amenities
      amenities_confirmados: p.amenities_confirmados || [],
      amenities_por_verificar: [],
      equipamiento_detectado: p.equipamiento_detectado || [],
      descripcion: p.descripcion || null,
      posicion_mercado: p.posicion_mercado || null,
      latitud: p.latitud ? parseFloat(p.latitud) : null,
      longitud: p.longitud ? parseFloat(p.longitud) : null,
      estacionamientos: p.estacionamientos || null,
      baulera: p.baulera ?? null,
      // v2.25: Piso y forma de pago
      piso: p.piso || null,
      plan_pagos_desarrollador: p.acepta_plan_pagos ?? null,  // Broker usa acepta_plan_pagos
      acepta_permuta: p.acepta_permuta ?? null,
      solo_tc_paralelo: p.solo_contado_paralelo ?? null,  // Broker usa solo_contado_paralelo
      precio_negociable: p.precio_negociable ?? null,
      descuento_contado_pct: p.descuento_contado ?? null,  // Broker usa descuento_contado
      // v2.26: Parqueo y baulera con precios
      parqueo_incluido: p.parqueo_incluido ?? null,
      parqueo_precio_adicional: p.parqueo_precio_adicional || null,
      baulera_incluido: p.baulera_incluido ?? null,
      baulera_precio_adicional: p.baulera_precio_adicional || null,
      // v2.27: Plan de pagos detallado
      plan_pagos_cuotas: p.plan_pagos_cuotas || null,
      plan_pagos_texto: p.plan_pagos || null,  // Broker usa plan_pagos (texto)
      // v2.28: Fecha de entrega para preventa
      fecha_entrega: p.fecha_entrega || null,
      // Campos broker
      fuente_tipo: 'broker' as const,
      codigo_sim: p.codigo_sim
    }))
  } catch (err) {
    console.warn('Error en buscarUnidadesBroker:', err)
    return []
  }
}

// Busqueda unificada: combina scraping + broker
export async function buscarUnidadesUnificadas(filtros: FiltrosBusqueda): Promise<UnidadReal[]> {
  // Ejecutar ambas busquedas en paralelo
  const [resultadosScraping, resultadosBroker] = await Promise.all([
    buscarUnidadesReales(filtros),
    buscarUnidadesBroker(filtros)
  ])

  // Agregar fuente_tipo a resultados de scraping (si no tienen)
  const scrapingConFuente = resultadosScraping.map(r => ({
    ...r,
    fuente_tipo: r.fuente_tipo || 'scraping' as const
  }))

  // Combinar y ordenar por precio (o segun filtro orden)
  const combinados = [...scrapingConFuente, ...resultadosBroker]

  // Ordenar segun criterio
  if (filtros.orden === 'precio_desc') {
    combinados.sort((a, b) => b.precio_usd - a.precio_usd)
  } else {
    // Default: precio ascendente
    combinados.sort((a, b) => a.precio_usd - b.precio_usd)
  }

  // Respetar limite total
  const limite = filtros.limite || 50
  return combinados.slice(0, limite)
}

// Convertir zona del formulario a nombre de BD
export function convertirZona(zonaForm: string): string {
  const resultado = microzonaToZona[zonaForm]
  if (!resultado) return ''
  // Si es array, devolver el primero
  return Array.isArray(resultado) ? resultado[0] : resultado
}

// ========== BUSQUEDA ALQUILERES ==========

export interface UnidadAlquiler {
  id: number
  nombre_edificio: string | null
  nombre_proyecto: string | null
  desarrollador: string | null
  zona: string
  dormitorios: number
  banos: number | null
  area_m2: number
  precio_mensual_bob: number
  precio_mensual_usd: number | null
  amoblado: string | null        // 'si' | 'semi' | 'no' | null
  acepta_mascotas: boolean | null
  deposito_meses: number | null
  servicios_incluidos: string[] | null
  contrato_minimo_meses: number | null
  monto_expensas_bob: number | null
  piso: number | null
  estacionamientos: number | null
  baulera: boolean | null
  latitud: number | null
  longitud: number | null
  fotos_urls: string[]
  fotos_count: number
  url: string
  fuente: string
  agente_nombre: string | null
  agente_telefono: string | null
  agente_whatsapp: string | null
  dias_en_mercado: number | null
  estado_construccion: string
  id_proyecto_master: number | null
  amenities_lista: string[] | null
  equipamiento_lista: string[] | null
  descripcion: string | null
}

export interface FiltrosAlquiler {
  precio_mensual_min?: number
  precio_mensual_max?: number
  dormitorios?: number
  dormitorios_min?: number       // Para "3+": >= N dormitorios
  dormitorios_lista?: number[]   // Multi-select: [0,1], [1,3], etc. 3 = "3+"
  amoblado?: boolean
  acepta_mascotas?: boolean
  con_parqueo?: boolean
  zonas_permitidas?: string[]   // IDs UI: 'equipetrol_centro', 'sirari', etc.
  solo_con_fotos?: boolean
  orden?: 'precio_asc' | 'precio_desc' | 'recientes'
  limite?: number
}

export async function buscarUnidadesAlquiler(filtros: FiltrosAlquiler): Promise<UnidadAlquiler[]> {
  if (!supabase) {
    console.warn('Supabase no configurado')
    return []
  }

  try {
    const rpcFiltros: Record<string, any> = {
      limite: filtros.limite || 50,
      solo_con_fotos: filtros.solo_con_fotos ?? true
    }

    if (filtros.precio_mensual_max) rpcFiltros.precio_mensual_max = filtros.precio_mensual_max
    if (filtros.precio_mensual_min) rpcFiltros.precio_mensual_min = filtros.precio_mensual_min
    if (filtros.dormitorios_lista?.length) rpcFiltros.dormitorios_lista = filtros.dormitorios_lista
    else if (filtros.dormitorios !== undefined) rpcFiltros.dormitorios = filtros.dormitorios
    if (filtros.dormitorios_min !== undefined && !filtros.dormitorios_lista?.length) rpcFiltros.dormitorios_min = filtros.dormitorios_min
    if (filtros.amoblado) rpcFiltros.amoblado = true
    if (filtros.acepta_mascotas) rpcFiltros.acepta_mascotas = true
    if (filtros.con_parqueo) rpcFiltros.con_parqueo = true
    if (filtros.orden) rpcFiltros.orden = filtros.orden

    // Pasar zonas_permitidas como IDs UI — el RPC hace la expansión internamente
    if (filtros.zonas_permitidas && filtros.zonas_permitidas.length > 0) {
      rpcFiltros.zonas_permitidas = filtros.zonas_permitidas
    }

    const { data, error } = await supabase.rpc('buscar_unidades_alquiler', {
      p_filtros: rpcFiltros
    })

    if (error) {
      console.error('Error en RPC buscar_unidades_alquiler:', error)
      return []
    }

    return (data || []).map((p: any) => ({
      id: p.id,
      nombre_edificio: p.nombre_edificio || null,
      nombre_proyecto: p.nombre_proyecto || null,
      desarrollador: p.desarrollador || null,
      zona: p.zona || 'Sin zona',
      dormitorios: p.dormitorios ?? 0,
      banos: p.banos ? parseFloat(p.banos) : null,
      area_m2: parseFloat(p.area_m2) || 0,
      precio_mensual_bob: parseFloat(p.precio_mensual_bob) || 0,
      precio_mensual_usd: p.precio_mensual_usd ? parseFloat(p.precio_mensual_usd) : null,
      amoblado: p.amoblado || null,
      acepta_mascotas: p.acepta_mascotas ?? null,
      deposito_meses: p.deposito_meses ? parseFloat(p.deposito_meses) : null,
      servicios_incluidos: p.servicios_incluidos || null,
      contrato_minimo_meses: p.contrato_minimo_meses || null,
      monto_expensas_bob: p.monto_expensas_bob ? parseFloat(p.monto_expensas_bob) : null,
      piso: p.piso || null,
      estacionamientos: p.estacionamientos || null,
      baulera: p.baulera ?? null,
      latitud: p.latitud ? parseFloat(p.latitud) : null,
      longitud: p.longitud ? parseFloat(p.longitud) : null,
      fotos_urls: p.fotos_urls || [],
      fotos_count: p.fotos_count || 0,
      url: p.url || '',
      fuente: p.fuente || '',
      agente_nombre: p.agente_nombre || null,
      agente_telefono: p.agente_telefono || null,
      agente_whatsapp: p.agente_whatsapp || null,
      dias_en_mercado: p.dias_en_mercado || null,
      estado_construccion: p.estado_construccion || 'no_especificado',
      id_proyecto_master: p.id_proyecto_master || null,
      amenities_lista: p.amenities_lista || null,
      equipamiento_lista: p.equipamiento_lista || null,
      descripcion: p.descripcion || null
    }))
  } catch (err) {
    console.error('Error en buscarUnidadesAlquiler:', err)
    return []
  }
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
    // v2.29: Consistente con buscar_unidades_reales() - mismos filtros
    // Incluye: status=completado, duplicado_de IS NULL, filtro días en mercado
    const { data, error } = await supabase
      .from('propiedades_v2')
      .select('precio_usd, area_total_m2, dormitorios, estado_construccion, fecha_publicacion, fecha_discovery')
      .eq('es_activa', true)
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .is('duplicado_de', null)
      .gte('precio_usd', 30000)

    if (error || !data) return null

    // Calcular días en mercado y filtrar datos viejos
    // v2.30: Límite unificado 300 días para TODOS los estados
    const hoy = new Date()
    const propiedadesValidas = data.filter((p: any) => {
      // Filtros básicos
      if (p.area_total_m2 <= 20) return false
      if (p.precio_usd / p.area_total_m2 < 800) return false

      // Filtro días en mercado: 300 días para todos
      const fechaRef = p.fecha_publicacion || p.fecha_discovery
      if (fechaRef) {
        const fechaPub = new Date(fechaRef)
        const diasEnMercado = Math.floor((hoy.getTime() - fechaPub.getTime()) / (1000 * 60 * 60 * 24))
        if (diasEnMercado > 300) return false
      }

      return true
    })

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

    // 6. Bajadas de precio (comparar últimas 2 fechas en precios_historial)
    let bajadasPrecio = 0
    const { data: fechasHistorial } = await supabase
      .from('precios_historial')
      .select('fecha')
      .order('fecha', { ascending: false })
      .limit(1)

    if (fechasHistorial?.[0]?.fecha) {
      const fechaHoy = fechasHistorial[0].fecha
      // Buscar fecha anterior
      const { data: fechaAnteriorData } = await supabase
        .from('precios_historial')
        .select('fecha')
        .lt('fecha', fechaHoy)
        .order('fecha', { ascending: false })
        .limit(1)

      if (fechaAnteriorData?.[0]?.fecha) {
        const fechaAyer = fechaAnteriorData[0].fecha
        // Contar bajadas (excluir cambios >50% que son datos corruptos)
        const { data: bajadas } = await supabase.rpc('contar_bajadas_precio', {
          p_fecha_hoy: fechaHoy,
          p_fecha_ayer: fechaAyer
        })
        bajadasPrecio = bajadas || 0
      }
    }

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
      bajadas_precio: bajadasPrecio,
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
  categoria: 'oportunidad' | 'bajo_promedio' | 'precio_justo' | 'sobre_promedio' | 'premium'
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
  fotos_urls?: string[]  // Enriquecido desde cliente
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

// ========== ANÁLISIS FIDUCIARIO DESDE BÚSQUEDA REAL ==========
// Esta función construye el análisis usando los mismos filtros que buscarUnidadesReales
// para garantizar que PremiumModal muestre exactamente los mismos datos que /resultados

// Constantes MOAT (Enero 2026, actualizar mensualmente)
const MEDIANA_AREA_POR_DORMS: Record<number, number> = {
  0: 36, 1: 52, 2: 88, 3: 165, 4: 200, 5: 250
}

const MEDIANA_PRECIO_M2_POR_ZONA: Record<string, number> = {
  'Equipetrol Norte/Norte': 2362,
  'Faremafu': 2299,
  'Equipetrol': 2055,
  'Sirari': 2002,
  'Villa Brigida': 1538,
  'default': 2000
}

interface DatosUsuarioMOAT {
  innegociables: string[]
  deseables: string[]
  ubicacion_vs_metros: number
  calidad_vs_precio: number
}

// Función de score MOAT (copia de resultados.tsx para consistencia)
function calcularScoreMOATInterno(
  prop: UnidadReal,
  datosUsuario: DatosUsuarioMOAT
): number {
  let score = 0

  // 1. INNEGOCIABLES (0 a 100)
  if (datosUsuario.innegociables.length === 0) {
    score += 100
  } else {
    const amenidadesRequeridas = innegociablesToAmenidades(datosUsuario.innegociables)
    const confirmados = prop.amenities_confirmados || []
    const porVerificar = prop.amenities_por_verificar || []

    let puntosInnegociables = 0
    const maxPuntosPorInnegociable = 100 / amenidadesRequeridas.length

    for (const amenidad of amenidadesRequeridas) {
      if (confirmados.includes(amenidad)) {
        puntosInnegociables += maxPuntosPorInnegociable
      } else if (porVerificar.includes(amenidad)) {
        puntosInnegociables += maxPuntosPorInnegociable * 0.5
      }
    }
    score += Math.round(puntosInnegociables)
  }

  // 2. OPORTUNIDAD (0 a 40) - basado en posicion_mercado
  const posicionMercado = prop.posicion_mercado as { diferencia_pct?: number } | null
  const difPct = posicionMercado?.diferencia_pct ?? 0

  let oportunidadScore = 0
  if (datosUsuario.calidad_vs_precio <= 2) {
    // PRIORIZA CALIDAD
    if (difPct >= 15) oportunidadScore = 40
    else if (difPct >= 5) oportunidadScore = 30
    else if (difPct >= -10) oportunidadScore = 20
    else if (difPct >= -20) oportunidadScore = 10
  } else if (datosUsuario.calidad_vs_precio >= 4) {
    // PRIORIZA PRECIO
    if (difPct <= -20) oportunidadScore = 40
    else if (difPct <= -10) oportunidadScore = 30
    else if (difPct <= 5) oportunidadScore = 20
    else if (difPct <= 15) oportunidadScore = 10
  } else {
    // NEUTRAL
    if (difPct <= -20) oportunidadScore = 35
    else if (difPct <= -10) oportunidadScore = 30
    else if (difPct <= 10) oportunidadScore = 25
    else if (difPct <= 20) oportunidadScore = 15
    else oportunidadScore = 10
  }
  score += oportunidadScore

  // 3. TRADE-OFFS (0 a 20)
  const medianaArea = MEDIANA_AREA_POR_DORMS[prop.dormitorios || 1] || 52

  if (datosUsuario.ubicacion_vs_metros >= 4) {
    if ((prop.area_m2 || 0) > medianaArea) {
      score += 10
    }
  }

  const totalAmenidades = (prop.amenities_confirmados?.length || 0)
  if (datosUsuario.calidad_vs_precio <= 2 && totalAmenidades >= 5) {
    score += 10
  }

  // 4. DESEABLES (0 a 15)
  if (datosUsuario.deseables.length > 0) {
    const amenidadesDeseadas = innegociablesToAmenidades(datosUsuario.deseables)
    let deseablesScore = 0
    const confirmados = prop.amenities_confirmados || []

    for (const amenidad of amenidadesDeseadas.slice(0, 3)) {
      if (confirmados.includes(amenidad)) {
        deseablesScore += 5
      }
    }
    score += deseablesScore
  }

  return score
}

// Interfaz extendida para filtros con MOAT
export interface FiltrosBusquedaMOAT extends FiltrosBusqueda {
  innegociables?: string[]
  deseables?: string[]
  ubicacion_vs_metros?: number
  calidad_vs_precio?: number
}

export async function construirAnalisisDesdeBusqueda(
  filtros: FiltrosBusquedaMOAT
): Promise<AnalisisMercadoFiduciario | null> {
  try {
    // Usar la misma función de búsqueda que /resultados
    const resultados = await buscarUnidadesReales({
      ...filtros,
      limite: filtros.limite || 10
    })

    if (resultados.length === 0) {
      return null
    }

    // Aplicar ordenamiento MOAT si hay datos de usuario
    const datosUsuarioMOAT: DatosUsuarioMOAT = {
      innegociables: filtros.innegociables || [],
      deseables: filtros.deseables || [],
      ubicacion_vs_metros: filtros.ubicacion_vs_metros || 3,
      calidad_vs_precio: filtros.calidad_vs_precio || 3
    }

    // Calcular score y ordenar
    const resultadosConScore = resultados.map(r => ({
      ...r,
      score_moat: calcularScoreMOATInterno(r, datosUsuarioMOAT)
    }))

    resultadosConScore.sort((a, b) => {
      if (b.score_moat !== a.score_moat) {
        return b.score_moat - a.score_moat
      }
      const difA = (a.posicion_mercado as { diferencia_pct?: number } | null)?.diferencia_pct ?? 0
      const difB = (b.posicion_mercado as { diferencia_pct?: number } | null)?.diferencia_pct ?? 0
      return difA - difB
    })

    // Calcular métricas desde los resultados ordenados
    const precios = resultadosConScore.map(r => r.precio_usd)
    const preciosM2 = resultadosConScore.map(r => r.precio_m2)
    const areas = resultadosConScore.map(r => r.area_m2)
    const diasEnMercado = resultadosConScore
      .map(r => r.dias_en_mercado)
      .filter((d): d is number => d !== null && d !== undefined)

    const precioPromedio = precios.reduce((a, b) => a + b, 0) / precios.length
    const precioM2Promedio = preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length
    const areaPromedio = areas.reduce((a, b) => a + b, 0) / areas.length
    const diasPromedio = diasEnMercado.length > 0
      ? Math.round(diasEnMercado.reduce((a, b) => a + b, 0) / diasEnMercado.length)
      : null
    const diasMediana = diasEnMercado.length > 0
      ? Math.round(diasEnMercado.sort((a, b) => a - b)[Math.floor(diasEnMercado.length / 2)])
      : null

    // Convertir UnidadReal[] a OpcionValida[] (YA ORDENADOS POR MOAT)
    const opciones: OpcionValida[] = resultadosConScore.map((r, idx) => ({
      id: r.id,
      proyecto: r.proyecto,
      desarrollador: r.desarrollador || null,
      zona: r.zona,
      dormitorios: r.dormitorios || 0,
      precio_usd: r.precio_usd,
      precio_m2: r.precio_m2,
      area_m2: r.area_m2,
      ranking: idx + 1,
      total_opciones: resultadosConScore.length,
      fotos: r.cantidad_fotos || 0,
      fotos_urls: r.fotos_urls || [],
      amenities: r.amenities_confirmados || r.amenities_lista || [],
      asesor_wsp: r.asesor_wsp || null,
      posicion_mercado: r.posicion_mercado || {
        success: true,
        categoria: 'precio_justo' as const,
        diferencia_pct: 0,
        posicion_texto: 'Precio de mercado',
        contexto: {
          promedio_zona: precioM2Promedio,
          stock_disponible: resultadosConScore.length,
          precio_consultado: r.precio_m2
        }
      },
      explicacion_precio: {
        propiedad_id: r.id,
        precio_usd: r.precio_usd,
        precio_m2: r.precio_m2,
        zona: r.zona,
        promedio_zona: precioM2Promedio,
        diferencia_pct: r.posicion_mercado?.diferencia_pct || 0,
        resumen: r.posicion_mercado?.posicion_texto || 'Precio de mercado',
        explicaciones: []
      },
      resumen_fiduciario: r.razon_fiduciaria || `${r.proyecto} en ${r.zona} - ${r.dormitorios} dorm, ${Math.round(r.area_m2)}m²`
    }))

    // Construir respuesta en formato AnalisisMercadoFiduciario
    const analisis: AnalisisMercadoFiduciario = {
      filtros_aplicados: {
        dormitorios: filtros.dormitorios,
        precio_max: filtros.precio_max,
        zona: filtros.zona || filtros.zonas_permitidas?.[0],
        solo_con_fotos: true,
        limite: filtros.limite || 10
      },
      timestamp: new Date().toISOString(),
      bloque_1_opciones_validas: {
        total: resultadosConScore.length,
        opciones
      },
      bloque_2_opciones_excluidas: {
        total: 0,
        nota: 'Opciones excluidas no disponibles en búsqueda directa',
        opciones: []
      },
      bloque_3_contexto_mercado: {
        stock_total: resultadosConScore.length,
        stock_cumple_filtros: resultadosConScore.length,
        stock_excluido_mas_barato: 0,
        porcentaje_mercado: 100,
        diagnostico: `Encontramos ${resultadosConScore.length} opciones que cumplen tus criterios.`,
        metricas_zona: {
          precio_promedio: Math.round(precioPromedio),
          precio_mediana: Math.round(precios.sort((a, b) => a - b)[Math.floor(precios.length / 2)]),
          precio_min: Math.min(...precios),
          precio_max: Math.max(...precios),
          precio_m2_promedio: Math.round(precioM2Promedio),
          area_promedio: Math.round(areaPromedio),
          dias_promedio: diasPromedio,
          dias_mediana: diasMediana
        }
      },
      bloque_4_alertas: {
        total: 0,
        alertas: []
      }
    }

    return analisis
  } catch (err) {
    console.error('Error construyendo análisis desde búsqueda:', err)
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
  // Fallback con datos de Feb 2026 (filtros limpios)
  const demoData: MicrozonaData[] = [
    { zona: 'Eq. Centro', total: 83, precio_promedio: 152000, precio_m2: 2199, proyectos: 38, categoria: 'standard' },
    { zona: 'Sirari', total: 31, precio_promedio: 175000, precio_m2: 2062, proyectos: 13, categoria: 'standard' },
    { zona: 'Eq. Oeste', total: 18, precio_promedio: 160000, precio_m2: 1943, proyectos: 9, categoria: 'standard' },
    { zona: 'Eq. Norte', total: 15, precio_promedio: 153000, precio_m2: 2333, proyectos: 10, categoria: 'premium' },
    { zona: 'Villa Brigida', total: 13, precio_promedio: 115000, precio_m2: 1828, proyectos: 9, categoria: 'standard' }
  ]

  if (!supabase) {
    return demoData
  }

  try {
    // Query con filtros limpios (mismos que admin dashboard)
    const { data, error } = await supabase
      .from('propiedades_v2')
      .select('microzona, precio_usd, area_total_m2, id_proyecto_master')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gt('precio_usd', 30000)
      .gte('area_total_m2', 20)
      .not('microzona', 'is', null)
      .is('duplicado_de', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')

    if (error || !data || data.length === 0) {
      console.warn('Error o sin datos en microzonas, usando demo:', error?.message)
      return demoData
    }

    // Mapeo canónico: microzona BD → display (5 zonas, alineado con FilterBarPremium)
    const microzonaDisplay: Record<string, string> = {
      'Equipetrol': 'Eq. Centro',
      'Sirari': 'Sirari',
      'Faremafu': 'Eq. Oeste',
      'Equipetrol Norte/Norte': 'Eq. Norte',
      'Equipetrol Norte/Sur': 'Eq. Norte',
      'Villa Brigida': 'Villa Brigida'
    }

    // Aggregate manually
    const zonaMap: Record<string, { total: number; precios: number[]; m2: number[]; proyectos: Set<number> }> = {}

    data.forEach((p: any) => {
      const zona = p.microzona
      if (!zona) return

      const zonaDisplay = microzonaDisplay[zona]
      if (!zonaDisplay) return // Skip zonas no canónicas

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
      .filter(([_, v]) => v.total >= 1)
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

// ========== FOTOS POR ID ==========

export async function obtenerFotosPorIds(ids: number[]): Promise<Record<number, string[]>> {
  if (!supabase || ids.length === 0) {
    return {}
  }

  try {
    const { data, error } = await supabase
      .from('propiedades_v2')
      .select('id, datos_json')
      .in('id', ids)

    if (error) {
      console.error('Error obteniendo fotos:', error)
      return {}
    }

    const result: Record<number, string[]> = {}
    for (const row of data || []) {
      // Fotos están en datos_json.contenido.fotos_urls
      const fotos = row.datos_json?.contenido?.fotos_urls || []
      result[row.id] = Array.isArray(fotos) ? fotos : []
    }
    return result
  } catch (err) {
    console.error('Error obteniendo fotos por IDs:', err)
    return {}
  }
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
