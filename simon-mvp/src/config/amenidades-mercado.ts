/**
 * Estadísticas de amenidades del mercado Equipetrol
 * Fuente: Análisis SICI - Enero 2026
 * Base: 468 propiedades activas
 */

export const AMENIDADES_MERCADO: Record<string, {
  porcentaje: number      // % de propiedades que tienen esta amenidad (según publicaciones)
  esDestacado: boolean    // Si tenerla es un diferenciador (<40%)
  esEstandar: boolean     // Si es estándar en Equipetrol (no mostrar %)
  label: string           // Nombre para mostrar
}> = {
  // Diferenciadoras - mostrar %
  'Piscina': { porcentaje: 63, esDestacado: false, esEstandar: false, label: 'Piscina' },
  'Seguridad 24/7': { porcentaje: 55, esDestacado: false, esEstandar: true, label: 'Seguridad 24/7' },
  'Churrasquera': { porcentaje: 48, esDestacado: false, esEstandar: false, label: 'Churrasquera' },
  'Sauna/Jacuzzi': { porcentaje: 35, esDestacado: true, esEstandar: false, label: 'Sauna/Jacuzzi' },
  'Gimnasio': { porcentaje: 29, esDestacado: true, esEstandar: false, label: 'Gimnasio' },
  'Estacionamiento para Visitas': { porcentaje: 21, esDestacado: true, esEstandar: false, label: 'Parqueo visitas' },
  'Pet Friendly': { porcentaje: 19, esDestacado: true, esEstandar: false, label: 'Pet Friendly' },
  'Salón de Eventos': { porcentaje: 17, esDestacado: true, esEstandar: false, label: 'Salón de Eventos' },
  'Co-working': { porcentaje: 11, esDestacado: true, esEstandar: false, label: 'Co-working' },
  'Parque Infantil': { porcentaje: 4, esDestacado: true, esEstandar: false, label: 'Parque Infantil' },
  'Jardín': { porcentaje: 1, esDestacado: true, esEstandar: false, label: 'Jardín' },
  // Estándar en Equipetrol - NO mostrar % (brokers no siempre lo mencionan)
  'Terraza/Balcón': { porcentaje: 43, esDestacado: false, esEstandar: true, label: 'Terraza' },
  'Área Social': { porcentaje: 27, esDestacado: false, esEstandar: true, label: 'Área Social' },
  'Ascensor': { porcentaje: 26, esDestacado: false, esEstandar: true, label: 'Ascensor' },
  'Recepción': { porcentaje: 17, esDestacado: false, esEstandar: true, label: 'Recepción' },
  'Lavadero': { porcentaje: 1, esDestacado: false, esEstandar: true, label: 'Lavadero' },
}

// Mapeo de innegociables del formulario a nombres de amenidades
export const INNEGOCIABLES_A_AMENIDAD: Record<string, string> = {
  'piscina': 'Piscina',
  'gimnasio': 'Gimnasio',
  'seguridad': 'Seguridad 24/7',
  'estacionamiento': 'Estacionamiento para Visitas',
  'areas_verdes': 'Jardín',
  'pet_friendly': 'Pet Friendly',
  'salon_eventos': 'Salón de Eventos',
  'coworking': 'Co-working',
}

/**
 * Obtiene el % de mercado para una amenidad
 */
export function getPorcentajeMercado(amenidad: string): number | null {
  return AMENIDADES_MERCADO[amenidad]?.porcentaje || null
}

/**
 * Verifica si una amenidad es un diferenciador (< 40% del mercado la tiene)
 */
export function esAmenidadDestacada(amenidad: string): boolean {
  return AMENIDADES_MERCADO[amenidad]?.esDestacado || false
}

/**
 * Verifica si una amenidad es estándar en Equipetrol (no mostrar %)
 */
export function esAmenidadEstandar(amenidad: string): boolean {
  return AMENIDADES_MERCADO[amenidad]?.esEstandar || false
}

/**
 * Convierte innegociables del formulario a nombres de amenidades
 */
export function innegociablesToAmenidades(innegociables: string[]): string[] {
  return innegociables
    .map(i => INNEGOCIABLES_A_AMENIDAD[i])
    .filter(Boolean)
}
