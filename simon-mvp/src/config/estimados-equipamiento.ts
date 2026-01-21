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
 * Valor estimado promedio por item detectado (USD)
 * Usado para calcular valor aproximado del equipamiento incluido
 */
export const VALOR_ITEM_DETECTADO: Record<string, number> = {
  // Cocina
  'Heladera': 550,
  'Encimera': 300,
  'Microondas': 100,
  'Horno empotrado': 400,
  'Campana extractora': 150,
  'Muebles cocina': 700,
  'Cocina equipada': 1200,
  'Lavavajillas': 500,
  'Grifería': 80,
  'Mesada piedra natural': 400,

  // Agua caliente
  'Calefón': 220,
  'Termotanque': 280,

  // Baño
  'Box ducha': 300,
  'Tina/Bañera': 400,
  'Muebles de baño': 200,
  'Espejo': 60,
  'Ducha española': 250,

  // Dormitorio
  'Closets': 400,
  'Roperos empotrados': 450,
  'Vestidor': 600,
  'Cortinas': 120,
  'Blackout': 150,

  // Lavandería
  'Área de lavado': 50,
  'Lavadora': 400,
  'Secadora': 350,
  'Tendedero': 30,

  // Tecnología
  'Aire acondicionado': 550,
  'Iluminación LED': 100,
  'Cerradura inteligente': 150,
  'Internet/WiFi': 50,
  'Intercomunicador': 80,
  'Domótica': 300,
  'Alarma de seguridad': 200,

  // Servicios/Extras
  'Gas domiciliario': 100,
  'Balcón': 0, // no tiene costo de equipamiento
  'Terraza privada': 0,
  'Vista panorámica': 0,
  'Amoblado': 2500,

  // Acabados
  'Acabados premium': 500,
  'Piso porcelanato': 300,
  'Vidrio doble': 200,
  'Aislamiento acústico': 150,
  'Construcción antisísmica': 0,
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
 * Genera mensaje fiduciario MOAT sobre equipamiento
 *
 * IMPORTANTE - Restricciones fiduciarias:
 * - SI detectamos → Calcular valor aproximado de lo detectado
 * - SI NO detectamos → Mostrar costo total de equipar
 * - SIEMPRE disclaimer de valores orientativos
 * - SIEMPRE pedir que pregunte/verifique
 */
export function getMensajeEquipamiento(
  dormitorios: number,
  itemsDetectados: string[]
): {
  tipo: 'equipado' | 'basico' | 'sin_info'
  valorDetectado: number
  costoFaltante: { min: number; max: number }
  mensaje: string
  accion: string
  hayDeteccion: boolean
} {
  const costos = getCostoEquipamiento(dormitorios)
  const costoTotalMin = costos.gamaBasica.min
  const costoTotalMax = costos.gamaMedia.max

  // Calcular valor de items detectados
  let valorDetectado = 0
  for (const item of itemsDetectados) {
    valorDetectado += VALOR_ITEM_DETECTADO[item] || 0
  }

  // Calcular faltante estimado
  const faltanteMin = Math.max(0, costoTotalMin - valorDetectado)
  const faltanteMax = Math.max(0, costoTotalMax - valorDetectado)

  if (itemsDetectados.length === 0) {
    return {
      tipo: 'sin_info',
      valorDetectado: 0,
      costoFaltante: { min: costoTotalMin, max: costoTotalMax },
      mensaje: `Sin equipamiento confirmado`,
      accion: 'Preguntá qué incluye el precio',
      hayDeteccion: false
    }
  }

  // Determinar nivel de equipamiento
  const porcentajeEquipado = (valorDetectado / costoTotalMin) * 100

  if (porcentajeEquipado >= 70) {
    return {
      tipo: 'equipado',
      valorDetectado,
      costoFaltante: { min: faltanteMin, max: faltanteMax },
      mensaje: `Bien equipado (~$${valorDetectado.toLocaleString()} detectado)`,
      accion: 'Verificá estado del equipamiento',
      hayDeteccion: true
    }
  }

  return {
    tipo: 'basico',
    valorDetectado,
    costoFaltante: { min: faltanteMin, max: faltanteMax },
    mensaje: `Equipamiento parcial (~$${valorDetectado.toLocaleString()} detectado)`,
    accion: 'Preguntá qué más incluye',
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
