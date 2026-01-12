/**
 * Costos de equipamiento para departamentos en Santa Cruz
 * Fuente: Investigación SICI - Enero 2026
 *
 * Equipar un depto desde cero cuesta $2,700-$10,500 dependiendo
 * de dormitorios y gama elegida. Este es el ahorro real al
 * comprar un departamento ya equipado vs uno vacío.
 */

export interface CostoEquipamiento {
  dormitorios: number
  gamaBasica: { min: number; max: number }
  gamaMedia: { min: number; max: number }
  itemsIncluidos: string[]
}

export const COSTOS_EQUIPAMIENTO: Record<number, CostoEquipamiento> = {
  // Monoambiente
  0: {
    dormitorios: 0,
    gamaBasica: { min: 2200, max: 2800 },
    gamaMedia: { min: 3800, max: 4500 },
    itemsIncluidos: [
      '1 A/C 12,000 BTU',
      'Calefón',
      'Cocina + campana + microondas',
      'Refrigerador compacto',
      'Lavadora 7kg',
      'Closet 2m + muebles cocina',
      'Cortinas'
    ]
  },
  // 1 dormitorio
  1: {
    dormitorios: 1,
    gamaBasica: { min: 3200, max: 3800 },
    gamaMedia: { min: 5500, max: 6500 },
    itemsIncluidos: [
      '1 A/C sala + 1 A/C dormitorio',
      'Calefón',
      'Cocina + campana + microondas',
      'Refrigerador estándar',
      'Lavadora 8kg',
      '1 closet + muebles cocina',
      'Cortinas'
    ]
  },
  // 2 dormitorios
  2: {
    dormitorios: 2,
    gamaBasica: { min: 4500, max: 5200 },
    gamaMedia: { min: 7500, max: 8800 },
    itemsIncluidos: [
      '1 A/C sala + 2 A/C dormitorios',
      'Calefón',
      'Cocina + campana + microondas',
      'Refrigerador estándar',
      'Lavadora 10-12kg',
      '2 closets + muebles cocina',
      'Cortinas'
    ]
  },
  // 3+ dormitorios
  3: {
    dormitorios: 3,
    gamaBasica: { min: 5600, max: 6500 },
    gamaMedia: { min: 9500, max: 11000 },
    itemsIncluidos: [
      '1 A/C sala + 3 A/C dormitorios',
      'Calefón',
      'Cocina + campana + microondas',
      'Refrigerador grande',
      'Lavadora 12kg',
      '3 closets + muebles cocina',
      'Cortinas'
    ]
  }
}

/**
 * Items de equipamiento que buscamos en descripciones
 */
export const ITEMS_EQUIPAMIENTO = {
  aire_acondicionado: {
    label: 'Aire acondicionado',
    labelCorto: 'A/C',
    costoUnitario: { min: 400, max: 700 }, // por unidad instalada
    icono: '❄️'
  },
  cocina_equipada: {
    label: 'Cocina equipada',
    labelCorto: 'Cocina equipada',
    costoUnitario: { min: 800, max: 1500 },
    icono: '🍳'
  },
  closets: {
    label: 'Closets empotrados',
    labelCorto: 'Closets',
    costoUnitario: { min: 350, max: 600 }, // por closet
    icono: '🚪'
  },
  amoblado: {
    label: 'Completamente amoblado',
    labelCorto: 'Amoblado',
    costoUnitario: { min: 2000, max: 5000 }, // adicional sobre equipado
    icono: '🛋️'
  }
}

/**
 * Obtiene el costo de equipamiento según dormitorios
 */
export function getCostoEquipamiento(dormitorios: number): CostoEquipamiento {
  // Para 4+ dormitorios, usar estimados de 3D
  const key = dormitorios > 3 ? 3 : dormitorios
  return COSTOS_EQUIPAMIENTO[key] || COSTOS_EQUIPAMIENTO[2]
}

/**
 * Calcula el ahorro estimado de comprar equipado vs vacío
 */
export function calcularAhorroEquipamiento(
  dormitorios: number,
  tieneAC: boolean,
  tieneCocinaEquipada: boolean,
  tieneClosets: boolean,
  esAmoblado: boolean
): {
  ahorroMin: number
  ahorroMax: number
  itemsDetectados: string[]
  esEquipadoCompleto: boolean
} {
  const items = ITEMS_EQUIPAMIENTO
  let ahorroMin = 0
  let ahorroMax = 0
  const itemsDetectados: string[] = []

  // Aire acondicionado (multiplicar por # ambientes)
  if (tieneAC) {
    const numAC = dormitorios === 0 ? 1 : dormitorios + 1 // sala + dormitorios
    ahorroMin += items.aire_acondicionado.costoUnitario.min * numAC
    ahorroMax += items.aire_acondicionado.costoUnitario.max * numAC
    itemsDetectados.push(items.aire_acondicionado.label)
  }

  // Cocina equipada
  if (tieneCocinaEquipada) {
    ahorroMin += items.cocina_equipada.costoUnitario.min
    ahorroMax += items.cocina_equipada.costoUnitario.max
    itemsDetectados.push(items.cocina_equipada.label)
  }

  // Closets (multiplicar por dormitorios)
  if (tieneClosets) {
    const numClosets = dormitorios === 0 ? 1 : dormitorios
    ahorroMin += items.closets.costoUnitario.min * numClosets
    ahorroMax += items.closets.costoUnitario.max * numClosets
    itemsDetectados.push(items.closets.label)
  }

  // Amoblado (adicional)
  if (esAmoblado) {
    ahorroMin += items.amoblado.costoUnitario.min
    ahorroMax += items.amoblado.costoUnitario.max
    itemsDetectados.push(items.amoblado.label)
  }

  // Determinar si es equipado completo (tiene AC + cocina como mínimo)
  const esEquipadoCompleto = tieneAC && tieneCocinaEquipada

  return {
    ahorroMin,
    ahorroMax,
    itemsDetectados,
    esEquipadoCompleto
  }
}

/**
 * Genera mensaje fiduciario sobre equipamiento
 *
 * IMPORTANTE - Restricciones fiduciarias:
 * - SI detectamos → "La publicación menciona X" (no "incluye" - no sabemos si es todo)
 * - SI NO detectamos → "No especificado" (no "no tiene" - puede tener pero broker no lo puso)
 * - SIEMPRE mostrar costo de referencia (educativo)
 * - SIEMPRE pedir que pregunte/verifique
 */
export function getMensajeEquipamiento(
  dormitorios: number,
  itemsDetectados: string[]
): {
  dato: string
  costoReferencia: string
  accion: string
  hayDeteccion: boolean
} {
  const costos = getCostoEquipamiento(dormitorios)
  const costoRef = `Equipar un ${dormitorios}D desde cero cuesta $${costos.gamaBasica.min.toLocaleString()}-${costos.gamaMedia.max.toLocaleString()}`

  if (itemsDetectados.length === 0) {
    return {
      dato: 'Equipamiento no especificado en publicación',
      costoReferencia: costoRef,
      accion: 'Preguntá qué incluye el precio',
      hayDeteccion: false
    }
  }

  const itemsTexto = itemsDetectados.slice(0, 3).join(', ')

  return {
    dato: `Publicación menciona: ${itemsTexto}`,
    costoReferencia: costoRef,
    accion: 'Preguntá qué más incluye y su estado',
    hayDeteccion: true
  }
}

/**
 * Metadata de investigación para transparencia
 */
export const METADATA_EQUIPAMIENTO = {
  fuente: 'Investigación precios Santa Cruz',
  fecha: '2026-01',
  nota: 'Precios gama básica-media. Marcas: Kernig, Dako, Samsung, LG',
  tipoCambio: 'Oficial Bs 6.96/USD'
}
