/**
 * ESTIMADOS DE MERCADO - EQUIPETROL
 * Santa Cruz de la Sierra, Bolivia
 *
 * IMPORTANTE: Esta data es ESTIMADA basada en investigacion real de mercado.
 * NO proviene de la base de datos de propiedades.
 *
 * Fuentes: InfoCasas, UltraCasas, BienesOnline, RE/MAX, Century21, El Deber
 *          Grupo SKY, SMART Constructora, Constructora Mediterraneo
 * Periodo: Julio 2025 - Enero 2026
 * Muestra: 17+ edificios nuevos en Equipetrol
 *
 * ACTUALIZAR: Cuando tengamos mas data o cambie el mercado
 * ULTIMA ACTUALIZACION: 12 Enero 2026
 */

// =====================================================
// METADATA DE INVESTIGACION
// =====================================================

export const METADATA_INVESTIGACION = {
  periodo_inicio: '2025-07-01',
  periodo_fin: '2026-01-12',
  fuentes: [
    'InfoCasas Bolivia',
    'UltraCasas',
    'BienesOnline',
    'RE/MAX Bolivia',
    'Century21',
    'El Deber',
    'Grupo SKY',
    'SMART Constructora',
    'Constructora Mediterraneo'
  ],
  zona: 'Equipetrol',
  version: '2.0.0',
  ultima_actualizacion: '2026-01-12',
  nota_tc: 'TC usado: ~7 Bs/USD (oficial). Mercado paralelo 8-10 Bs/USD.',
  muestra: '17+ edificios nuevos Equipetrol'
} as const

// =====================================================
// TIPOS
// =====================================================

export type CategoriaEdificio = 'estandar' | 'premium'
export type ProbabilidadInclusion = 'no' | 'rara_vez' | 'a_veces' | 'variable' | 'frecuente'

interface RangoNumerico {
  min: number
  max: number
}

interface InclusionInfo {
  probabilidad: ProbabilidadInclusion
  texto: string
}

// =====================================================
// EXPENSAS MENSUALES
// =====================================================

/**
 * Rangos de expensas por cantidad de dormitorios y categoria de edificio.
 *
 * ESTANDAR: Edificios con piscina + churrasquera + seguridad 24h
 * PREMIUM: + gimnasio + areas sociales completas + amenidades extras
 *
 * Verificado en: Macororo 9/12, Stanza, Smart Studio, UpTown, Sky Aqualina,
 *                La Riviera, La Boutique, Torre Platinum, etc.
 */
export const EXPENSAS: Record<number, {
  estandar: RangoNumerico
  premium: RangoNumerico
  superficie_tipica: string
}> = {
  0: { // Monoambiente (30-45 m2)
    estandar: { min: 43, max: 65 },
    premium: { min: 70, max: 100 },
    superficie_tipica: '30-45 m2'
  },
  1: { // 1 Dormitorio (45-65 m2)
    estandar: { min: 55, max: 80 },
    premium: { min: 80, max: 115 },
    superficie_tipica: '45-65 m2'
  },
  2: { // 2 Dormitorios (70-100 m2)
    estandar: { min: 70, max: 120 },
    premium: { min: 115, max: 150 },
    superficie_tipica: '70-100 m2'
  },
  3: { // 3 Dormitorios (100-140 m2)
    estandar: { min: 86, max: 143 },
    premium: { min: 143, max: 243 },
    superficie_tipica: '100-140+ m2'
  }
}

/**
 * Que incluyen las expensas tipicamente:
 *
 * GENERALMENTE INCLUIDO:
 * - Seguridad 24 horas
 * - Mantenimiento y limpieza areas comunes
 * - Iluminacion pasillos y espacios compartidos
 * - Mantenimiento ascensores
 * - Uso de piscina, churrasqueras y gimnasio
 * - Agua potable (~50% edificios nuevos)
 * - Fondo de reserva
 * - Administracion
 *
 * GENERALMENTE NO INCLUIDO:
 * - Electricidad del departamento
 * - Gas individual
 * - Internet/cable
 */

// =====================================================
// ESTACIONAMIENTO
// =====================================================

/**
 * Costos de estacionamiento adicional.
 *
 * TENDENCIA: Los parqueos SE VENDEN POR SEPARADO del precio base,
 * especialmente en monoambientes y 1 dormitorio.
 *
 * Verificado en: Sky Level, Macororo 12, Sky Tulip, Omnia Lux,
 *                Torre Platinum, Le Grand, Spazios Eden, Cadaques
 */
export const ESTACIONAMIENTO = {
  compra: {
    por_dormitorios: {
      0: { min: 10000, max: 12000 } as RangoNumerico,  // Monoambiente
      1: { min: 10000, max: 13000 } as RangoNumerico,  // 1 dorm
      2: { min: 12000, max: 14000 } as RangoNumerico,  // 2 dorm
      3: { min: 13000, max: 15000 } as RangoNumerico,  // 3 dorm
    },
    promedio: 12500,
    nota: 'Mayoria de edificios nuevos vende parqueo por separado, especialmente monoambientes y 1 dorm'
  },
  alquiler: {
    min: 25,
    max: 57,
    promedio: 40,
    nota: 'Bs 170-400/mes segun zona y edificio'
  },
  inclusion: {
    0: { probabilidad: 'rara_vez', texto: 'Rara vez incluido' } as InclusionInfo,
    1: { probabilidad: 'a_veces', texto: 'A veces incluido' } as InclusionInfo,
    2: { probabilidad: 'variable', texto: 'Variable (50/50)' } as InclusionInfo,
    3: { probabilidad: 'frecuente', texto: 'Frecuentemente incluido' } as InclusionInfo,
  }
} as const

// =====================================================
// BAULERA
// =====================================================

/**
 * Costos de baulera adicional.
 *
 * Verificado en: SMART Studio, Sky Level, Spazios Eden, Cadaques
 */
export const BAULERA = {
  compra: {
    por_dormitorios: {
      0: { min: 2000, max: 2500 } as RangoNumerico,
      1: { min: 2500, max: 3000 } as RangoNumerico,
      2: { min: 3000, max: 3500 } as RangoNumerico,
      3: { min: 3500, max: 4000 } as RangoNumerico,
    },
    promedio: 3250
  },
  tamano_m2: {
    0: { min: 1.5, max: 3, desc: 'Basica' },
    1: { min: 3, max: 5, desc: 'Estandar' },
    2: { min: 3, max: 5, desc: 'Estandar' },
    3: { min: 5, max: 8, desc: 'Premium' },
  },
  inclusion: {
    0: { probabilidad: 'no', texto: 'No incluida' } as InclusionInfo,
    1: { probabilidad: 'rara_vez', texto: 'Rara vez incluida' } as InclusionInfo,
    2: { probabilidad: 'a_veces', texto: 'A veces incluida (50/50)' } as InclusionInfo,
    3: { probabilidad: 'frecuente', texto: 'Frecuentemente incluida' } as InclusionInfo,
  }
} as const

// =====================================================
// FUNCIONES HELPER
// =====================================================

export interface EstimadoExpensas {
  rango: RangoNumerico
  rango_completo: RangoNumerico  // min estándar → max premium
  impacto_anual: RangoNumerico
  impacto_anual_completo: RangoNumerico
  categoria_asumida: CategoriaEdificio
  confianza: 'alta' | 'media'
  es_estimado: true
}

/**
 * Obtiene el rango estimado de expensas para un departamento.
 *
 * @param dormitorios - Cantidad de dormitorios (0 = monoambiente)
 * @param categoria - 'estandar' o 'premium' (default: estandar)
 */
export function getExpensasEstimadas(
  dormitorios: number,
  categoria: CategoriaEdificio = 'estandar'
): EstimadoExpensas {
  const dorms = Math.min(Math.max(dormitorios, 0), 3)
  const rango = EXPENSAS[dorms]?.[categoria] || EXPENSAS[2].estandar
  const rangoEstandar = EXPENSAS[dorms]?.estandar || EXPENSAS[2].estandar
  const rangoPremium = EXPENSAS[dorms]?.premium || EXPENSAS[2].premium

  // Rango completo: min de estándar → max de premium
  const rango_completo = {
    min: rangoEstandar.min,
    max: rangoPremium.max
  }

  return {
    rango,
    rango_completo,
    impacto_anual: {
      min: rango.min * 12,
      max: rango.max * 12
    },
    impacto_anual_completo: {
      min: rango_completo.min * 12,
      max: rango_completo.max * 12
    },
    categoria_asumida: categoria,
    confianza: dorms <= 2 ? 'alta' : 'media',
    es_estimado: true
  }
}

export interface EstimadoEstacionamiento {
  compra: RangoNumerico
  alquiler: RangoNumerico
  probabilidad_incluido: ProbabilidadInclusion
  texto_inclusion: string
  alerta: string
  es_estimado: true
}

/**
 * Obtiene el costo estimado de estacionamiento adicional.
 */
export function getEstacionamientoEstimado(dormitorios: number): EstimadoEstacionamiento {
  const dorms = Math.min(Math.max(dormitorios, 0), 3) as 0 | 1 | 2 | 3
  const inclusion = ESTACIONAMIENTO.inclusion[dorms]

  return {
    compra: ESTACIONAMIENTO.compra.por_dormitorios[dorms],
    alquiler: { min: ESTACIONAMIENTO.alquiler.min, max: ESTACIONAMIENTO.alquiler.max },
    probabilidad_incluido: inclusion.probabilidad,
    texto_inclusion: inclusion.texto,
    alerta: ESTACIONAMIENTO.compra.nota,
    es_estimado: true
  }
}

export interface EstimadoBaulera {
  compra: RangoNumerico
  tamano: { min: number; max: number; desc: string }
  probabilidad_incluida: ProbabilidadInclusion
  texto_inclusion: string
  es_estimado: true
}

/**
 * Obtiene el costo estimado de baulera adicional.
 */
export function getBauleraEstimada(dormitorios: number): EstimadoBaulera {
  const dorms = Math.min(Math.max(dormitorios, 0), 3) as 0 | 1 | 2 | 3
  const inclusion = BAULERA.inclusion[dorms]

  return {
    compra: BAULERA.compra.por_dormitorios[dorms],
    tamano: BAULERA.tamano_m2[dorms],
    probabilidad_incluida: inclusion.probabilidad,
    texto_inclusion: inclusion.texto,
    es_estimado: true
  }
}

// =====================================================
// FUNCION PRINCIPAL: COSTOS OCULTOS
// =====================================================

export interface CostosOcultos {
  expensas: EstimadoExpensas
  estacionamiento: EstimadoEstacionamiento
  baulera: EstimadoBaulera
  costo_adicional_potencial: {
    min: number
    max: number
    incluye_parqueo: boolean
    incluye_baulera: boolean
    descripcion: string
  }
  metadata: typeof METADATA_INVESTIGACION
}

/**
 * Calcula todos los costos ocultos potenciales de una propiedad.
 *
 * @param dormitorios - Cantidad de dormitorios
 * @param incluyeParqueo - true/false/null (null = no sabemos)
 * @param incluyeBaulera - true/false/null (null = no sabemos)
 */
export function getCostosOcultosEstimados(
  dormitorios: number,
  incluyeParqueo: boolean | null,
  incluyeBaulera: boolean | null
): CostosOcultos {
  const expensas = getExpensasEstimadas(dormitorios)
  const estacionamiento = getEstacionamientoEstimado(dormitorios)
  const baulera = getBauleraEstimada(dormitorios)

  // Calcular costo adicional potencial (one-time purchases)
  let adicionalMin = 0
  let adicionalMax = 0
  const partes: string[] = []

  // Si no sabemos o sabemos que no incluye parqueo
  const necesitaParqueo = incluyeParqueo === false || incluyeParqueo === null
  if (necesitaParqueo) {
    adicionalMin += estacionamiento.compra.min
    adicionalMax += estacionamiento.compra.max
    partes.push('parqueo')
  }

  // Si no sabemos o sabemos que no incluye baulera (y es tipologia que no suele incluir)
  const necesitaBaulera = incluyeBaulera === false ||
    (incluyeBaulera === null && dormitorios < 2)
  if (necesitaBaulera) {
    adicionalMin += baulera.compra.min
    adicionalMax += baulera.compra.max
    partes.push('baulera')
  }

  return {
    expensas,
    estacionamiento,
    baulera,
    costo_adicional_potencial: {
      min: adicionalMin,
      max: adicionalMax,
      incluye_parqueo: necesitaParqueo,
      incluye_baulera: necesitaBaulera,
      descripcion: partes.length > 0
        ? `Si no incluye ${partes.join(' ni ')}`
        : 'Sin costos adicionales detectados'
    },
    metadata: METADATA_INVESTIGACION
  }
}

// =====================================================
// HELPERS PARA UI
// =====================================================

/**
 * Formatea un rango de precios para mostrar en UI.
 */
export function formatRango(rango: RangoNumerico, prefix = '$'): string {
  return `${prefix}${rango.min.toLocaleString()}-${rango.max.toLocaleString()}`
}

/**
 * Obtiene el icono segun probabilidad de inclusion.
 */
export function getIconoInclusion(probabilidad: ProbabilidadInclusion): string {
  switch (probabilidad) {
    case 'no':
    case 'rara_vez':
      return '❌'
    case 'a_veces':
    case 'variable':
      return '⚠️'
    case 'frecuente':
      return '✅'
    default:
      return '❓'
  }
}
