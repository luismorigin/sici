/**
 * Helper functions for Informe Fiduciario Premium v2
 * Extracted from api/informe.ts
 */

import type { Propiedad, DatosUsuario } from './types'

export const fmt = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(n)) return '0'
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Helper para construir URL de contacto broker (redirect-based, funciona desde blob URLs)
// Usa URL absoluta porque el informe se abre en blob: URL donde relativas no funcionan
export const buildContactarUrl = (baseHost: string, params: {
  leadId?: number | null
  nombre?: string
  whatsapp?: string
  propId: number
  posicion: number
  proyecto: string
  precio: number
  dormitorios: number
  broker: string
  brokerWsp: string
  inmobiliaria?: string
  codigoRef?: string
  preguntas?: string[] // Preguntas personalizadas del checklist
}): string => {
  const queryParams = new URLSearchParams()

  if (params.leadId) queryParams.set('leadId', String(params.leadId))
  if (params.nombre) queryParams.set('nombre', params.nombre)
  if (params.whatsapp) queryParams.set('whatsapp', params.whatsapp)
  queryParams.set('propId', String(params.propId))
  queryParams.set('posicion', String(params.posicion))
  queryParams.set('proyecto', params.proyecto)
  queryParams.set('precio', String(params.precio))
  queryParams.set('dormitorios', String(params.dormitorios))
  queryParams.set('broker', params.broker)
  queryParams.set('brokerWsp', params.brokerWsp)
  if (params.inmobiliaria) queryParams.set('inmobiliaria', params.inmobiliaria)
  if (params.codigoRef) queryParams.set('codigoRef', params.codigoRef)
  if (params.preguntas && params.preguntas.length > 0) {
    queryParams.set('preguntas', JSON.stringify(params.preguntas))
  }

  return `${baseHost}/api/abrir-whatsapp?${queryParams.toString()}`
}

// Helper para generar preguntas personalizadas basadas en preferencias del usuario y datos de la propiedad
// Estas preguntas deben coincidir con el checklist del informe (Sección 6)
export const generarPreguntasPersonalizadas = (
  prop: Propiedad,
  datosUsuario: DatosUsuario,
  necesitaParqueo: boolean,
  necesitaBaulera: boolean
): string[] => {
  const preguntas: string[] = []

  // === SOBRE EL PRECIO ===
  // Parqueo
  const tieneParqueo = (prop.estacionamientos || 0) > 0
  if (necesitaParqueo && !tieneParqueo) {
    preguntas.push('¿El parqueo está incluido en el precio?')
  }

  // Baulera
  if (necesitaBaulera && !prop.baulera) {
    preguntas.push('¿La baulera está incluida en el precio?')
  }

  // === SOBRE LA PREVENTA ===
  if (prop.estado_construccion === 'preventa') {
    preguntas.push('¿Cuál es la fecha de entrega?')
    preguntas.push('¿Cuál es el plan de pagos?')
  }

  // === SOBRE LA PROPIEDAD ===
  // Piso (siempre útil saber)
  preguntas.push('¿En qué piso está el departamento?')

  // Expensas (siempre importante)
  preguntas.push('¿Cuánto es el pago de expensas mensuales?')

  // Pet-friendly (si tiene mascotas o está en innegociables)
  const petFriendlyConfirmado = (prop.amenities_confirmados || []).some((a: string) =>
    a.toLowerCase().includes('pet') || a.toLowerCase().includes('mascota')
  )
  const tieneMascotas = datosUsuario.mascotas === true
  const petEnInnegociables = (datosUsuario.innegociables || []).some(a =>
    a.toLowerCase().includes('pet') || a.toLowerCase().includes('mascota')
  )
  if ((tieneMascotas || petEnInnegociables) && !petFriendlyConfirmado) {
    preguntas.push('¿El edificio acepta mascotas?')
  }

  // === INNEGOCIABLES DEL USUARIO ===
  const innegociables = datosUsuario.innegociables || []
  if (innegociables.length > 0) {
    // Filtrar pet-friendly (ya lo preguntamos arriba si aplica)
    const amenitiesParaPreguntar = innegociables.filter(a =>
      !a.toLowerCase().includes('pet') && !a.toLowerCase().includes('mascota')
    )
    if (amenitiesParaPreguntar.length > 0) {
      // Formatear nombres bonitos
      const nombresFormateados = amenitiesParaPreguntar.map(a =>
        a.replace(/_/g, ' ').toLowerCase()
      )
      preguntas.push(`¿Tiene ${nombresFormateados.join(' y ')} funcionando?`)
    }
  }

  return preguntas
}

export const getCategoria = (p: Propiedad): { clase: string; texto: string; pct: number; badgeClass: string } => {
  // Usar posicion_mercado pre-calculado de BD (compara vs promedio de SU zona específica)
  const diff = p.posicion_mercado?.diferencia_pct || 0

  if (diff <= -10) {
    return { clase: 'good', texto: `${Math.abs(Math.round(diff))}% bajo su zona`, pct: diff, badgeClass: 'oportunidad' }
  } else if (diff >= 10) {
    return { clase: 'high', texto: `${Math.round(diff)}% sobre su zona`, pct: diff, badgeClass: 'premium' }
  }
  return { clase: 'fair', texto: 'Precio de mercado', pct: diff, badgeClass: 'justo' }
}

export const getNegociacion = (dias: number | null): { texto: string; clase: string } => {
  if (!dias) return { texto: 'Media', clase: '' }
  if (dias > 90) return { texto: 'ALTA', clase: 'high' }
  if (dias > 60) return { texto: 'Media-Alta', clase: '' }
  return { texto: 'Media', clase: '' }
}

export const getDescuento = (dias: number | null): string => {
  if (!dias || dias < 30) return '2-4%'
  if (dias < 60) return '4-6%'
  if (dias < 90) return '5-8%'
  if (dias < 180) return '8-12%'
  return '10-15%'
}

// Icono universal para todas las amenidades - checkmark dorado simple
export const amenityIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2.5" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>'

export const getAmenityEmoji = (): string => amenityIcon

export const getTradeOffLabel = (value: number, left: string, right: string): string => {
  if (value <= 2) return `Priorizás ${left} (${value * 20}%)`
  if (value >= 4) return `Priorizás ${right} (${value * 20}%)`
  return `Balance equilibrado (50%)`
}

export const zonaDisplay = (zona: string): string => {
  const mapeo: Record<string, string> = {
    'equipetrol': 'Equipetrol Centro',
    'equipetrol_centro': 'Equipetrol Centro',
    'equipetrol_norte': 'Equipetrol Norte',
    'sirari': 'Sirari',
    'villa_brigida': 'Villa Brígida',
    'equipetrol_oeste': 'Equipetrol Oeste',
    'faremafu': 'Equipetrol Oeste',
    'equipetrol_3er_anillo': 'Equipetrol Franja',
  }
  return mapeo[zona?.toLowerCase()] || zona || 'Sin zona'
}

// Formatear dormitorios: 0 = Monoambiente, 1 = 1 Dormitorio, 2+ = X Dormitorios
export const formatDormitorios = (dorms: number | null | undefined, capitalize = true): string => {
  const num = Number(dorms) || 0
  if (num === 0) return capitalize ? 'Monoambiente' : 'monoambiente'
  if (num === 1) return capitalize ? '1 Dormitorio' : '1 dormitorio'
  return `${num} ${capitalize ? 'Dormitorios' : 'dormitorios'}`
}

// Formatear fecha de entrega: '2026-03' → 'Mar 2026'
export const formatFechaEntrega = (fecha: string | null | undefined): string => {
  if (!fecha) return 'Inmediata'
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const [anio, mes] = fecha.split('-')
  const mesNum = parseInt(mes, 10)
  if (isNaN(mesNum) || mesNum < 1 || mesNum > 12) return fecha
  return `${meses[mesNum - 1]} ${anio}`
}

// Costos estimados por dormitorios
export const getCostosEstimados = (dormitorios: number) => {
  const costos: Record<number, { expensasMin: number; expensasMax: number; parqueoMin: number; parqueoMax: number; bauleraMin: number; bauleraMax: number }> = {
    0: { expensasMin: 50, expensasMax: 80, parqueoMin: 10000, parqueoMax: 14000, bauleraMin: 3000, bauleraMax: 5000 },
    1: { expensasMin: 60, expensasMax: 100, parqueoMin: 12000, parqueoMax: 16000, bauleraMin: 4000, bauleraMax: 6000 },
    2: { expensasMin: 80, expensasMax: 130, parqueoMin: 14000, parqueoMax: 18000, bauleraMin: 5000, bauleraMax: 8000 },
    3: { expensasMin: 100, expensasMax: 160, parqueoMin: 15000, parqueoMax: 20000, bauleraMin: 6000, bauleraMax: 10000 }
  }
  const key = dormitorios > 3 ? 3 : dormitorios
  return costos[key] || costos[2]
}

// Valor estimado del equipamiento detectado
export const VALOR_EQUIPAMIENTO: Record<string, number> = {
  'Heladera': 550, 'Encimera': 300, 'Microondas': 100, 'Horno empotrado': 400,
  'Campana extractora': 150, 'Muebles cocina': 700, 'Cocina equipada': 1200,
  'Calefón': 220, 'Termotanque': 280, 'Box ducha': 300, 'Closets': 400,
  'Cortinas': 120, 'Aire acondicionado': 550, 'Lavadora': 400, 'Amoblado': 2500
}

export const calcularValorEquipamiento = (items: string[]): number => {
  return items.reduce((total, item) => {
    for (const [key, valor] of Object.entries(VALOR_EQUIPAMIENTO)) {
      if (item.toLowerCase().includes(key.toLowerCase())) return total + valor
    }
    return total
  }, 0)
}

// Calcular precio real incluyendo extras faltantes
export const calcularPrecioReal = (
  p: Propiedad,
  necesitaParqueo: boolean,
  necesitaBaulera: boolean
): { precioReal: number; extras: string[]; costoExtras: number } => {
  const costos = getCostosEstimados(p.dormitorios)
  const tieneParqueo = p.estacionamientos != null && p.estacionamientos > 0
  const tieneBaulera = p.baulera === true

  let costoExtras = 0
  const extras: string[] = []

  if (necesitaParqueo && !tieneParqueo) {
    costoExtras += Math.round((costos.parqueoMin + costos.parqueoMax) / 2)
    extras.push('parqueo')
  }
  if (necesitaBaulera && !tieneBaulera) {
    costoExtras += Math.round((costos.bauleraMin + costos.bauleraMax) / 2)
    extras.push('baulera')
  }

  return {
    precioReal: p.precio_usd + costoExtras,
    extras,
    costoExtras
  }
}
