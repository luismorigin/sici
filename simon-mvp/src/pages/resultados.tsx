import { useRouter } from 'next/router'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  buscarUnidadesReales,
  buscarUnidadesUnificadas,
  UnidadReal,
  FiltrosBusqueda,
  obtenerAnalisisFiduciario,
  AnalisisMercadoFiduciario,
  OpcionExcluida,
  CuotaPago
} from '@/lib/supabase'
import {
  getCostosOcultosEstimados,
  getIconoInclusion,
  METADATA_INVESTIGACION
} from '@/config/estimados-mercado'
import {
  innegociablesToAmenidades,
  getPorcentajeMercado,
  esAmenidadDestacada,
  esAmenidadEstandar
} from '@/config/amenidades-mercado'
import {
  getMensajeEquipamiento,
  getCostoEquipamiento
} from '@/config/estimados-equipamiento'
import PremiumModal from '@/components/landing/PremiumModal'
import InternalHeader from '@/components/InternalHeader'
import ContactarBrokerModal from '@/components/ContactarBrokerModal'
import FeedbackPremiumModal from '@/components/FeedbackPremiumModal'
import dynamic from 'next/dynamic'

// Cargar mapa dinámicamente para evitar SSR issues con Leaflet
const MapaResultados = dynamic(() => import('@/components/MapaResultados'), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-50 bg-black flex items-center justify-center text-white">Cargando mapa...</div>
})

/**
 * SÍNTESIS FIDUCIARIA - Resumen inteligente que combina TODOS los datos
 * Patrón MOAT: DATO → CONTEXTO → ACCIÓN
 *
 * Tipos:
 * - oportunidad: Precio bajo + tiempo razonable
 * - premium: Precio alto (puede justificarse)
 * - justo: Precio de mercado
 * - sospechoso: Contradicción (muy bajo + mucho tiempo)
 */
type TipoSintesis = 'oportunidad' | 'premium' | 'justo' | 'sospechoso'

interface SintesisFiduciaria {
  headline: string
  detalles: string
  accion: string
  tipo: TipoSintesis
}

interface DatosSintesis {
  // Precio
  diferenciaPct: number | null  // vs mercado
  // Tiempo
  diasEnMercado: number | null
  diasMedianaZona: number | null  // umbral dinámico
  diasPromedioZona: number | null
  // Escasez (parseado de razon_fiduciaria)
  escasez: number | null
  // Estado
  estadoConstruccion: string
  // Innegociables del usuario vs lo que tiene la propiedad
  innegociablesUsuario: string[]
  amenidadesPropiedad: string[]  // confirmadas + detectadas
  // Parqueo/baulera - personalizado
  usuarioNecesitaParqueo: boolean
  usuarioNecesitaBaulera: boolean
  tieneParqueoConfirmado: boolean | null  // true=sí, false=no, null=sin info
  tieneBauleraConfirmada: boolean | null
  costoExtraParqueo: number  // costo estimado si no incluye
  costoExtraBaulera: number
}

/**
 * BADGE TIEMPO EN MERCADO - Sistema de badges inteligentes
 * Compara días publicado vs mediana de la zona
 * MOAT honesto: solo afirmamos lo que SABEMOS del tiempo publicado
 */
function getBadgeTiempo(diasEnMercado: number, diasMedianaZona: number): {
  label: string
  color: string
  emoji: string
  tooltip: string
  accion: string | null  // null = sin acción (solo badge)
} {
  // Nueva (< 7 días)
  if (diasEnMercado < 7) return {
    label: 'Nueva',
    color: 'bg-green-100 text-green-700',
    emoji: '🆕',
    tooltip: `${diasEnMercado} días (mediana zona: ${diasMedianaZona}d)`,
    accion: 'Si te interesa, no esperes'
  }

  const ratio = diasEnMercado / diasMedianaZona

  // Poco tiempo publicada (< 50% mediana)
  if (ratio < 0.5) return {
    label: 'Poco tiempo publicada',
    color: 'bg-blue-100 text-blue-700',
    emoji: '📅',
    tooltip: `${diasEnMercado} días (mediana zona: ${diasMedianaZona}d)`,
    accion: null
  }

  // Tiempo promedio publicada (50-100% mediana)
  if (ratio < 1.0) return {
    label: 'Tiempo promedio publicada',
    color: 'bg-gray-100 text-gray-600',
    emoji: '📊',
    tooltip: `${diasEnMercado} días (mediana zona: ${diasMedianaZona}d)`,
    accion: null
  }

  // Más tiempo publicada (100-150% mediana)
  if (ratio < 1.5) return {
    label: 'Más tiempo publicada',
    color: 'bg-amber-50 text-amber-700',
    emoji: '💰',
    tooltip: `${diasEnMercado} días (mediana zona: ${diasMedianaZona}d)`,
    accion: 'Consultá si hay flexibilidad'
  }

  // Oportunidad (> 150% mediana)
  return {
    label: 'Oportunidad',
    color: 'bg-amber-50 text-amber-700',
    emoji: '👍',
    tooltip: `${diasEnMercado} días (mediana zona: ${diasMedianaZona}d)`,
    accion: 'Buen momento para ofertar'
  }
}

/**
 * Calcula poder de negociación basado en datos objetivos
 * Score de 0-7 puntos que se mapea a ALTO/MODERADO/BAJO
 */
interface DatosNegociacion {
  dias_en_mercado: number | null
  unidades_en_edificio: number | null
  unidades_misma_tipologia: number | null
  posicion_en_tipologia: number | null
  estado_construccion: string
  dormitorios: number
  posicion_mercado?: {
    diferencia_pct: number
  } | null
}

interface ResultadoNegociacion {
  poder: 'alto' | 'moderado' | 'bajo'
  score: number
  estrellas: string
  factores: string[]
  sinComparablesTipologia: boolean
  tipologia: string
}

function calcularPoderNegociacion(
  prop: DatosNegociacion,
  medianaZona: number
): ResultadoNegociacion {
  let score = 0
  const factores: string[] = []
  const tipologia = prop.dormitorios === 0 ? 'monoambiente' : `${prop.dormitorios}D`

  // Factor 1: Tiempo en mercado (peso: 2)
  if (prop.dias_en_mercado != null) {
    if (prop.dias_en_mercado > medianaZona * 1.5) {
      score += 2
      factores.push(`${prop.dias_en_mercado} días publicada (promedio: ${medianaZona}d)`)
    } else if (prop.dias_en_mercado > medianaZona) {
      score += 1
      factores.push(`Sobre promedio de tiempo en mercado`)
    }
  }

  // Factor 2: Precio vs promedio zona (peso: 2)
  const diffPct = prop.posicion_mercado?.diferencia_pct
  if (diffPct && diffPct > 5) {
    score += 2
    factores.push(`${Math.round(diffPct)}% sobre promedio de zona`)
  } else if (diffPct && diffPct > 0) {
    score += 1
    factores.push(`Ligeramente sobre promedio de zona`)
  }

  // Factor 3: Posición en tipología (peso: 1) - solo si hay comparables
  if (prop.posicion_en_tipologia && prop.posicion_en_tipologia > 1 &&
      prop.unidades_misma_tipologia && prop.unidades_misma_tipologia >= 2) {
    score += 1
    const opcionesMasBaratas = prop.posicion_en_tipologia - 1
    factores.push(opcionesMasBaratas === 1
      ? `1 opción más barata de ${tipologia} en edificio`
      : `${opcionesMasBaratas} opciones más baratas de ${tipologia} en edificio`)
  }

  // Factor 4: Alto inventario de misma tipología (peso: 1)
  if (prop.unidades_misma_tipologia && prop.unidades_misma_tipologia >= 3) {
    score += 1
    factores.push(`${prop.unidades_misma_tipologia} unidades de ${tipologia} disponibles`)
  }

  // Factor 5: Entrega inmediata con tiempo (peso: 1)
  if (prop.estado_construccion !== 'preventa' &&
      prop.dias_en_mercado != null &&
      prop.dias_en_mercado > 60) {
    score += 1
    factores.push(`Entrega inmediata con tiempo en mercado`)
  }

  // Determinar si hay comparables de la misma tipología
  const sinComparablesTipologia = !prop.unidades_misma_tipologia || prop.unidades_misma_tipologia < 2

  // Calcular estrellas (1-5)
  const estrellasNum = Math.max(1, Math.min(5, score))
  const estrellas = '★'.repeat(estrellasNum) + '☆'.repeat(5 - estrellasNum)

  return {
    poder: score >= 4 ? 'alto' : score >= 2 ? 'moderado' : 'bajo',
    score: Math.min(score, 5),
    estrellas,
    factores,
    sinComparablesTipologia,
    tipologia
  }
}

function generarSintesisFiduciaria(datos: DatosSintesis): SintesisFiduciaria {
  const {
    diferenciaPct,
    diasEnMercado,
    diasMedianaZona,
    diasPromedioZona,
    escasez,
    estadoConstruccion,
    innegociablesUsuario,
    amenidadesPropiedad,
    usuarioNecesitaParqueo,
    usuarioNecesitaBaulera,
    tieneParqueoConfirmado,
    tieneBauleraConfirmada,
    costoExtraParqueo,
    costoExtraBaulera
  } = datos

  // Umbrales dinámicos
  const umbralReciente = 30
  const umbralMedio = diasMedianaZona ?? 74
  const umbralLargo = diasPromedioZona ?? 104

  const dias = diasEnMercado ?? 0
  const diffPct = Math.round(diferenciaPct ?? 0)
  const sinDatosComparacion = diferenciaPct === null

  // 1. DETERMINAR TIPO
  let tipo: TipoSintesis = 'justo'
  if (diffPct <= -10) {
    tipo = 'oportunidad'
    // Detectar sospechoso: muy barato + mucho tiempo
    if ((diffPct <= -20 && dias >= umbralMedio) || dias >= umbralLargo) {
      tipo = 'sospechoso'
    }
  } else if (diffPct >= 10) {
    tipo = 'premium'
  }

  // 2. HEADLINE: Precio + Tiempo → Conclusión
  let headline: string
  const tiempoTexto = dias <= umbralReciente ? 'reciente'
    : dias < umbralMedio ? `${Math.round(dias / 30)} mes${Math.round(dias / 30) > 1 ? 'es' : ''}`
    : `${Math.round(dias / 30)} meses`

  if (sinDatosComparacion) {
    headline = dias > 0 ? `${tiempoTexto} publicado • Sin datos de zona para comparar` : 'Sin datos para comparar precio'
  } else if (tipo === 'sospechoso') {
    headline = `${Math.abs(diffPct)}% bajo mercado + ${tiempoTexto} → ¿Por qué no se vendió?`
  } else if (tipo === 'oportunidad') {
    const conclusion = dias <= umbralReciente ? 'Precio bajo promedio, reciente' : 'Precio bajo promedio'
    headline = `${Math.abs(diffPct)}% bajo mercado + ${tiempoTexto} → ${conclusion}`
  } else if (tipo === 'premium') {
    const conclusion = dias <= umbralReciente ? 'Precio probablemente firme' : dias >= umbralMedio ? 'Consultá por flexibilidad' : ''
    headline = `${diffPct}% sobre mercado + ${tiempoTexto}${conclusion ? ` → ${conclusion}` : ''}`
  } else {
    headline = `Precio de mercado + ${tiempoTexto}`
  }

  // 3. DETALLE: Solo info que agrega valor (no repetir listas)
  const lineas: string[] = []

  // Filtrar valores nulos/vacíos para evitar errores
  const innegociablesLimpios = (innegociablesUsuario || []).filter(x => x && typeof x === 'string')
  const amenidadesLimpias = (amenidadesPropiedad || []).filter(x => x && typeof x === 'string')

  // Línea 1: Innegociables del usuario - cuántos tiene
  if (innegociablesLimpios.length > 0) {
    const tieneInnegociables = innegociablesLimpios.filter(inn =>
      amenidadesLimpias.some(a => a.toLowerCase().includes(inn.toLowerCase()))
    )
    if (tieneInnegociables.length === innegociablesLimpios.length) {
      lineas.push(`✓ Tiene tus ${innegociablesLimpios.length} innegociables`)
    } else if (tieneInnegociables.length > 0) {
      const faltan = innegociablesLimpios.filter(inn =>
        !amenidadesLimpias.some(a => a.toLowerCase().includes(inn.toLowerCase()))
      )
      lineas.push(`${tieneInnegociables.length}/${innegociablesLimpios.length} innegociables • Falta: ${faltan.slice(0, 2).join(', ')}`)
    } else {
      lineas.push(`⚠️ No tiene tus innegociables confirmados`)
    }
  }

  // Línea 2: Parqueo/Baulera - solo si el usuario lo necesita
  const costosExtra: string[] = []
  if (usuarioNecesitaParqueo) {
    if (tieneParqueoConfirmado === true) {
      // No mostrar nada, está OK
    } else if (tieneParqueoConfirmado === false) {
      costosExtra.push(`Parqueo no incluido (+$${formatNum(costoExtraParqueo)})`)
    } else {
      costosExtra.push(`Parqueo sin confirmar → preguntá`)
    }
  }
  if (usuarioNecesitaBaulera) {
    if (tieneBauleraConfirmada === true) {
      // OK
    } else if (tieneBauleraConfirmada === false) {
      costosExtra.push(`Baulera no incluida (+$${formatNum(costoExtraBaulera)})`)
    } else {
      costosExtra.push(`Baulera sin confirmar`)
    }
  }
  if (costosExtra.length > 0) {
    lineas.push(`💰 ${costosExtra.join(' • ')}`)
  }

  // Línea 3: Escasez si es relevante
  if (escasez && escasez <= 3) {
    lineas.push(`📊 Solo ${escasez} similar${escasez > 1 ? 'es' : ''} disponible${escasez > 1 ? 's' : ''}`)
  }

  // Línea 4: Preventa
  if (estadoConstruccion === 'preventa') {
    lineas.push(`🏗️ Preventa → Verificá fecha entrega`)
  }

  // 4. ACCIÓN fiduciaria (verificar, preguntar - nunca decidir)
  let accion: string
  if (sinDatosComparacion) {
    accion = 'Pedí info de otras unidades para comparar'
  } else if (tipo === 'sospechoso') {
    accion = 'Preguntá por qué lleva tanto tiempo publicado'
  } else if (tipo === 'oportunidad') {
    accion = estadoConstruccion === 'preventa'
      ? 'Verificá fecha entrega y qué incluye el precio'
      : 'Verificá estado real y por qué el precio'
  } else if (tipo === 'premium') {
    if (dias >= umbralMedio) {
      accion = 'Lleva tiempo publicada, podés tantear con una oferta'
    } else if (costosExtra.length > 0) {
      accion = 'Confirmá qué incluye antes de comparar'
    } else {
      accion = 'Si te gusta, no demores'
    }
  } else {
    accion = 'Tomá tu tiempo para comparar opciones'
  }

  return {
    headline,
    detalles: lineas.join('\n'),
    accion,
    tipo
  }
}

/**
 * Extrae escasez de la razón fiduciaria del SQL
 */
function parseEscasezDeRazon(razon: string | null | undefined): number | null {
  if (!razon) return null

  // "1 de solo X deptos"
  const match1 = razon.match(/de solo (\d+) deptos?/i)
  if (match1) return parseInt(match1[1])

  // "Solo X opciones"
  const match2 = razon.match(/Solo (\d+) opciones?/i)
  if (match2) return parseInt(match2[1])

  // "Único"
  if (/Único/i.test(razon)) return 1

  return null
}

/**
 * Componente para mostrar descripción del anunciante con truncado
 */
function DescripcionAnunciante({ descripcion }: { descripcion: string }) {
  const [expanded, setExpanded] = useState(false)
  const MAX_LENGTH = 120

  // Limpiar emojis excesivos y formatear
  const textoLimpio = descripcion
    .replace(/[\r\n]+/g, ' ')  // Reemplazar saltos de línea por espacios
    .replace(/\s+/g, ' ')       // Múltiples espacios a uno
    .trim()

  const necesitaTruncado = textoLimpio.length > MAX_LENGTH
  const textoMostrar = expanded || !necesitaTruncado
    ? textoLimpio
    : textoLimpio.slice(0, MAX_LENGTH) + '...'

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">📝 Del anunciante</span>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">portal inmobiliario</span>
      </div>
      <div className="relative pl-3 border-l-2 border-gray-300">
        <p className="text-sm text-gray-600 leading-relaxed italic">
          "{textoMostrar}"
        </p>
      </div>
      {necesitaTruncado && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-500 hover:text-gray-700 mt-2 font-medium flex items-center gap-1"
        >
          {expanded ? '↑ ver menos' : '↓ ver más'}
        </button>
      )}
    </div>
  )
}

// Helper para formatear números (evita error de hidratación con toLocaleString)
const formatNum = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(num)) return '0'
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Helper para formatear dormitorios (0 = Monoambiente)
const formatDorms = (dorms: number | string | null | undefined, formato: 'largo' | 'corto' = 'corto'): string => {
  const num = typeof dorms === 'string' ? parseInt(dorms) : dorms
  if (num === null || num === undefined || isNaN(num)) return 'Todos'
  if (num === 0) return formato === 'largo' ? 'Monoambiente' : 'Mono'
  if (formato === 'largo') return num === 1 ? '1 dormitorio' : `${num} dormitorios`
  return num === 1 ? '1 dorm' : `${num} dorms`
}

// Microzonas disponibles (mismas que FilterBar)
const ZONAS_DISPONIBLES = [
  { value: 'equipetrol', label: 'Equipetrol Centro' },
  { value: 'sirari', label: 'Sirari' },
  { value: 'villa_brigida', label: 'Villa Brígida' },
  { value: 'faremafu', label: 'Equipetrol Oeste (Busch)' },
  { value: 'equipetrol_norte', label: 'Equipetrol Norte' },
]

// Convertir nombre de zona de BD a nombre de display
function zonaDisplay(zonaBD: string | undefined): string {
  if (!zonaBD) return 'Sin zona'
  const mapeo: Record<string, string> = {
    'Equipetrol': 'Equipetrol Centro',
    'Faremafu': 'Eq. Oeste (Busch)',
    'Equipetrol Norte/Norte': 'Eq. Norte',
    'Equipetrol Norte/Sur': 'Eq. Norte',
    'Villa Brigida': 'Villa Brígida',
    'Sirari': 'Sirari',
  }
  return mapeo[zonaBD] || zonaBD
}

// ============================================================================
// SCORE MOAT - Ranking inteligente basado en preferencias del usuario
// Fórmula: INNEGOCIABLES (0-100) + OPORTUNIDAD (0-40) + TRADE_OFFS (0-20) + DESEABLES (0-15)
// Máximo: 175 puntos
// ============================================================================

// Medianas por tipología (Enero 2026, actualizar mensualmente)
const MEDIANA_AREA_POR_DORMS: Record<number, number> = {
  0: 36, 1: 52, 2: 88, 3: 165, 4: 200, 5: 250
}

// Medianas precio/m² por zona (Enero 2026, actualizar mensualmente)
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
  ubicacion_vs_metros: number // 1-5 (legacy, no se usa)
  calidad_vs_precio: number   // 1-5 (amenidades vs precio)
  amenidades_vs_metros: number // 1-5 (amenidades vs metros)
}

function calcularScoreMOAT(
  prop: UnidadReal,
  datosUsuario: DatosUsuarioMOAT
): number {
  let score = 0
  const debugScores: Record<string, number> = {}

  // 1. INNEGOCIABLES (0 a 100) - Score gradual
  // Confirmado = 100%, Por verificar = 50%, No tiene = 0%
  if (datosUsuario.innegociables.length === 0) {
    score += 100
    debugScores.innegociables = 100
  } else {
    const amenidadesRequeridas = innegociablesToAmenidades(datosUsuario.innegociables)
    const confirmados = prop.amenities_confirmados || []
    const porVerificar = prop.amenities_por_verificar || []

    let puntosInnegociables = 0
    const maxPuntosPorInnegociable = 100 / amenidadesRequeridas.length

    for (const amenidad of amenidadesRequeridas) {
      if (confirmados.includes(amenidad)) {
        // Confirmado = 100% de los puntos para este innegociable
        puntosInnegociables += maxPuntosPorInnegociable
        debugScores[`inneg_${amenidad}`] = maxPuntosPorInnegociable
      } else if (porVerificar.includes(amenidad)) {
        // Por verificar = 50% de los puntos (G4: Indeterminado ≠ Cumple, pero tampoco = Falla)
        puntosInnegociables += maxPuntosPorInnegociable * 0.5
        debugScores[`inneg_${amenidad}`] = maxPuntosPorInnegociable * 0.5
      } else {
        // No tiene = 0 puntos
        debugScores[`inneg_${amenidad}`] = 0
      }
    }

    score += Math.round(puntosInnegociables)
    debugScores.innegociables = Math.round(puntosInnegociables)
  }

  // 2. OPORTUNIDAD (0 a 40) - basado en posicion_mercado
  // IMPORTANTE: La escala se INVIERTE según preferencia calidad_vs_precio
  const posicionMercado = prop.posicion_mercado as { diferencia_pct?: number } | null
  const difPct = posicionMercado?.diferencia_pct ?? 0

  let oportunidadScore = 0

  if (datosUsuario.calidad_vs_precio <= 2) {
    // PRIORIZA CALIDAD: Premium/caro = más puntos
    if (difPct >= 15) oportunidadScore = 40       // Premium (usuario acepta pagar más)
    else if (difPct >= 5) oportunidadScore = 30   // Sobre promedio
    else if (difPct >= -10) oportunidadScore = 20 // Precio justo
    else if (difPct >= -20) oportunidadScore = 10 // Bajo promedio
    // < -20%: sin puntos (muy barato, sospechoso para quien busca calidad)
  } else if (datosUsuario.calidad_vs_precio >= 4) {
    // PRIORIZA PRECIO: Barato = más puntos (escala original)
    if (difPct <= -20) oportunidadScore = 40      // Oportunidad clara
    else if (difPct <= -10) oportunidadScore = 30 // Buena oportunidad
    else if (difPct <= 5) oportunidadScore = 20   // Precio justo
    else if (difPct <= 15) oportunidadScore = 10  // Ligeramente caro
    // > 15%: sin puntos (premium/caro)
  } else {
    // NEUTRAL (slider=3): Escala balanceada, leve preferencia por oportunidades
    if (difPct <= -20) oportunidadScore = 35
    else if (difPct <= -10) oportunidadScore = 30
    else if (difPct <= 10) oportunidadScore = 25  // Rango amplio "justo"
    else if (difPct <= 20) oportunidadScore = 15
    else oportunidadScore = 10                    // Premium todavía suma algo
  }

  score += oportunidadScore
  debugScores.oportunidad = oportunidadScore
  debugScores.difPct = difPct
  // modoOportunidad: 1=CALIDAD, 2=NEUTRAL, 3=PRECIO
  debugScores.modoOportunidad = datosUsuario.calidad_vs_precio <= 2 ? 1 :
                                 datosUsuario.calidad_vs_precio >= 4 ? 3 : 2

  // 3. TRADE-OFFS (0 a 35)
  const medianaArea = MEDIANA_AREA_POR_DORMS[prop.dormitorios || 1] || 52
  const medianaPrecioM2 = MEDIANA_PRECIO_M2_POR_ZONA[prop.zona || ''] || MEDIANA_PRECIO_M2_POR_ZONA['default']
  const precioM2 = prop.precio_m2 || (prop.precio_usd / (prop.area_m2 || 1))
  const totalAmenidades = (prop.amenities_confirmados?.length || 0)

  debugScores.calidad_vs_precio_slider = datosUsuario.calidad_vs_precio
  debugScores.amenidades_vs_metros_slider = datosUsuario.amenidades_vs_metros
  debugScores.precioM2 = precioM2
  debugScores.medianaPrecioM2 = medianaPrecioM2
  debugScores.totalAmenidades = totalAmenidades
  debugScores.area_m2 = prop.area_m2 || 0
  debugScores.medianaArea = medianaArea

  // Trade-off 1: amenidades_vs_precio (SOLO en sección OPORTUNIDAD - ya cubierto arriba)
  // El slider calidad_vs_precio ya afecta la sección OPORTUNIDAD (0-40 pts)
  // Aquí solo agregamos boost extra por muchas amenidades si prioriza amenidades
  let amenidadesPrecioBoost = 0
  if (datosUsuario.calidad_vs_precio <= 2 && totalAmenidades >= 5) {
    // Prioriza amenidades sobre precio: bonus por muchas amenidades
    amenidadesPrecioBoost = 10
  }
  score += amenidadesPrecioBoost
  debugScores.amenidadesPrecioBoost = amenidadesPrecioBoost

  // Trade-off 2: amenidades_vs_metros (NUEVO)
  // 1-2 = prioriza amenidades: boost si tiene >= 5 amenidades
  // 3   = balance: boost parcial para ambos
  // 4-5 = prioriza metros: boost si área > mediana
  let amenidadesMetrosBoost = 0
  if (datosUsuario.amenidades_vs_metros <= 2) {
    // Prioriza amenidades sobre metros
    if (totalAmenidades >= 5) {
      amenidadesMetrosBoost = 15
    } else if (totalAmenidades >= 3) {
      amenidadesMetrosBoost = 7
    }
  } else if (datosUsuario.amenidades_vs_metros >= 4) {
    // Prioriza metros sobre amenidades
    if ((prop.area_m2 || 0) > medianaArea) {
      amenidadesMetrosBoost = 15
    } else if ((prop.area_m2 || 0) > medianaArea * 0.9) {
      amenidadesMetrosBoost = 7
    }
  } else {
    // Balance (slider = 3): boost parcial para ambos
    if (totalAmenidades >= 5) amenidadesMetrosBoost += 7
    if ((prop.area_m2 || 0) > medianaArea) amenidadesMetrosBoost += 7
  }
  score += amenidadesMetrosBoost
  debugScores.amenidadesMetrosBoost = amenidadesMetrosBoost

  // 4. DESEABLES (0 a 15) - max 3 deseables, 5 pts cada uno
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
    debugScores.deseables = deseablesScore
  }

  // DEBUG: Log para TOP 5 propiedades
  debugScores.total = score
  console.log(`[MOAT] ${prop.proyecto} | Score: ${score} | Desglose:`, debugScores)

  return score
}

// Constantes para momentos de pago
const MOMENTOS_PAGO_LABELS: Record<string, string> = {
  'reserva': '🔒 Reserva',
  'firma_contrato': '📝 Firma',
  'durante_obra': '🏗️ Obra',
  'cuotas_mensuales': '📅 Cuotas',
  'entrega': '🔑 Entrega',
  'personalizado': '📋 Otro'
}

export default function ResultadosPage() {
  const router = useRouter()
  const [propiedades, setPropiedades] = useState<UnidadReal[]>([])
  const [analisisFiduciario, setAnalisisFiduciario] = useState<AnalisisMercadoFiduciario | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [showPremiumExample, setShowPremiumExample] = useState(false)
  const [premiumEmail, setPremiumEmail] = useState('')
  const [premiumSubmitted, setPremiumSubmitted] = useState(false)
  const [premiumLoading, setPremiumLoading] = useState(false)
  const [generandoInforme, setGenerandoInforme] = useState(false)

  // Estado para feedback modal beta y datos del lead
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [leadData, setLeadData] = useState<{
    leadId: number
    codigoRef: string
    nombre: string
    whatsapp: string
  } | null>(null)
  const [propsParaInformeTemp, setPropsParaInformeTemp] = useState<UnidadReal[] | undefined>(undefined)
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())
  const [photoIndexes, setPhotoIndexes] = useState<Record<number, number>>({})

  // Estado para amenities/equipamiento expandidos inline (por propiedad y tipo)
  const [expandedAmenities, setExpandedAmenities] = useState<Set<string>>(new Set())
  const toggleAmenityExpand = (propId: number, type: string) => {
    const key = `${propId}-${type}`
    setExpandedAmenities(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Lightbox fullscreen para fotos
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxProp, setLightboxProp] = useState<UnidadReal | null>(null)
  const [touchStart, setTouchStart] = useState<number | null>(null)

  // Propiedades seleccionadas para informe premium personalizado
  const [selectedProps, setSelectedProps] = useState<Set<number>>(new Set())
  const [showLimitToast, setShowLimitToast] = useState(false)
  const [showMapa, setShowMapa] = useState(false)
  const [showLeyenda, setShowLeyenda] = useState(false)
  const MAX_SELECTED = 3

  // Modal de ordenar favoritas (paso previo al premium)
  const [showOrdenarModal, setShowOrdenarModal] = useState(false)
  const [orderedProps, setOrderedProps] = useState<number[]>([]) // IDs en orden del usuario
  const [razonFavorita, setRazonFavorita] = useState<string | null>(null) // Por qué eligió la #1
  const [ordenPaso, setOrdenPaso] = useState<1 | 2 | 3>(1) // Paso actual de selección
  const [propsDisponibles, setPropsDisponibles] = useState<number[]>([]) // Props aún no elegidas

  const toggleSelected = (propId: number) => {
    setSelectedProps(prev => {
      const next = new Set(prev)
      if (next.has(propId)) {
        next.delete(propId)
      } else if (next.size < MAX_SELECTED) {
        next.add(propId)
      } else {
        // Mostrar toast MOAT cuando intenta agregar más de 3
        setShowLimitToast(true)
      }
      return next
    })
  }

  const isSelected = (propId: number) => selectedProps.has(propId)

  // Obtener propiedades seleccionadas completas (en orden MOAT)
  // Nota: Se usa propiedadesOrdenadas para mantener el orden de recomendación
  const getSelectedProperties = (): UnidadReal[] => {
    return propiedadesOrdenadas.filter(p => selectedProps.has(p.id))
  }

  // Obtener propiedades en el orden definido por el usuario
  const getOrderedSelectedProperties = (): UnidadReal[] => {
    if (orderedProps.length === 0) return getSelectedProperties()
    return orderedProps
      .map(id => propiedades.find(p => p.id === id))
      .filter((p): p is UnidadReal => p !== undefined)
  }

  // Iniciar flujo de ordenar favoritas (selección secuencial)
  const iniciarOrdenar = () => {
    const selected = getSelectedProperties()
    setPropsDisponibles(selected.map(p => p.id))
    setOrderedProps([])
    setRazonFavorita(null)
    setOrdenPaso(1)
    setShowOrdenarModal(true)
  }

  // Seleccionar una propiedad en el paso actual
  const seleccionarEnOrden = (propId: number) => {
    const nuevasOrdenadas = [...orderedProps, propId]
    const nuevasDisponibles = propsDisponibles.filter(id => id !== propId)

    setOrderedProps(nuevasOrdenadas)
    setPropsDisponibles(nuevasDisponibles)

    if (nuevasDisponibles.length === 1) {
      // Solo queda una, es automáticamente la #3
      setOrderedProps([...nuevasOrdenadas, nuevasDisponibles[0]])
      setPropsDisponibles([])
      setOrdenPaso(3)
    } else if (nuevasDisponibles.length === 0) {
      // Ya están todas ordenadas
      setOrdenPaso(3)
    } else {
      setOrdenPaso(2)
    }
  }

  // Reiniciar selección
  const reiniciarOrden = () => {
    const selected = getSelectedProperties()
    setPropsDisponibles(selected.map(p => p.id))
    setOrderedProps([])
    setRazonFavorita(null)
    setOrdenPaso(1)
  }

  // Continuar al feedback modal después de ordenar (flujo unificado)
  const continuarAPremium = () => {
    setShowOrdenarModal(false)
    // Usar las propiedades ordenadas por el usuario
    const propsOrdenadas = getOrderedSelectedProperties()
    setPropsParaInformeTemp(propsOrdenadas)
    setShowFeedbackModal(true)
  }

  // Abrir feedback modal para beta testers (antes de ver informe)
  const solicitarInformePremium = (propsParaInforme?: UnidadReal[]) => {
    setPropsParaInformeTemp(propsParaInforme)
    setShowFeedbackModal(true)
  }

  // Callback cuando el feedback se completa exitosamente
  const handleFeedbackSuccess = (newLeadId: number, newCodigoRef: string, nombre: string, whatsapp: string) => {
    // Guardar datos del lead para uso posterior
    const newLeadData = {
      leadId: newLeadId,
      codigoRef: newCodigoRef,
      nombre,
      whatsapp
    }
    setLeadData(newLeadData)
    setShowFeedbackModal(false)
    // Generar informe con los datos del lead
    verInforme(propsParaInformeTemp, newLeadData)
  }

  // Función para ver informe (abre en nueva pestaña)
  const verInforme = async (propsParaInforme?: UnidadReal[], leadDataParam?: { leadId: number; codigoRef: string; nombre: string; whatsapp: string }) => {
    // Usar props pasadas, o seleccionadas, o las primeras 3 como ejemplo
    const elegidas = propsParaInforme || getOrderedSelectedProperties()
    const elegidasFinales = elegidas.length > 0 ? elegidas : propiedadesOrdenadas.slice(0, 3)

    if (elegidasFinales.length === 0) {
      alert('No hay propiedades para mostrar en el informe')
      return
    }

    // IDs de las elegidas para no duplicarlas
    const idsElegidas = new Set(elegidasFinales.map(p => p.id))

    // Combinar: elegidas primero + máximo 10 alternativas (13 total)
    const todasLasPropiedades = [
      ...elegidasFinales,
      ...propiedadesOrdenadas.filter(p => !idsElegidas.has(p.id)).slice(0, 10)
    ]

    setGenerandoInforme(true)
    try {
      // Mapear TODAS las propiedades al formato del API (elegidas primero + mercado)
      const propiedadesData = todasLasPropiedades.map(p => ({
        id: p.id,
        proyecto: p.proyecto || 'Sin nombre',
        desarrollador: p.desarrollador || null,
        zona: p.zona || 'Sin zona',
        dormitorios: p.dormitorios,
        banos: p.banos || null,
        precio_usd: p.precio_usd || 0,
        precio_m2: p.precio_m2 || 0,
        area_m2: p.area_m2 || 0,
        dias_en_mercado: p.dias_en_mercado || null,
        fotos_urls: p.fotos_urls || [],
        amenities_confirmados: p.amenities_confirmados || p.amenities_lista || [],
        amenities_por_verificar: p.amenities_por_verificar || [],
        razon_fiduciaria: p.razon_fiduciaria || null,
        posicion_mercado: p.posicion_mercado || null,
        posicion_precio_edificio: p.posicion_precio_edificio || null,
        unidades_en_edificio: p.unidades_en_edificio || null,
        estado_construccion: p.estado_construccion || 'no_especificado',
        // Nuevos campos para informe premium
        estacionamientos: p.estacionamientos,
        baulera: p.baulera,
        equipamiento_detectado: p.equipamiento_detectado || [],
        // Datos del asesor para contacto
        asesor_nombre: p.asesor_nombre,
        asesor_wsp: p.asesor_wsp,
        asesor_inmobiliaria: p.asesor_inmobiliaria
      }))

      const datosUsuario = {
        presupuesto: presupuesto ? parseInt(presupuesto as string) : 150000,
        dormitorios: dormitorios ? parseInt(dormitorios as string) : null,
        zonas: zonas ? (zonas as string).split(',').filter(Boolean) : [],
        estado_entrega: (estado_entrega as string) || 'no_importa',
        innegociables: innegociables ? (innegociables as string).split(',').filter(Boolean) : [],
        deseables: deseables ? (deseables as string).split(',').filter(Boolean) : [],
        ubicacion_vs_metros: ubicacion_vs_metros ? parseInt(ubicacion_vs_metros as string) : 3,
        calidad_vs_precio: calidad_vs_precio ? parseInt(calidad_vs_precio as string) : 3,
        amenidades_vs_metros: amenidades_vs_metros ? parseInt(amenidades_vs_metros as string) : 3,
        quienes_viven: 'No especificado',
        // Nuevos campos Level 2 para personalización
        necesita_parqueo: usuarioNecesitaParqueo,
        necesita_baulera: usuarioNecesitaBaulera,
        mascotas: mascotas === 'true' || mascotas === 'si'
      }

      // Calcular promedio real del mercado filtrado (no hardcodeado)
      const promedioRealM2 = propiedadesOrdenadas.length > 0
        ? Math.round(propiedadesOrdenadas.reduce((s, p) => s + (p.precio_m2 || 0), 0) / propiedadesOrdenadas.length)
        : 1500

      const analisisData = {
        precio_m2_promedio: analisisFiduciario?.bloque_3_contexto_mercado?.metricas_zona?.precio_m2_promedio || promedioRealM2,
        dias_mediana: analisisFiduciario?.bloque_3_contexto_mercado?.metricas_zona?.dias_mediana || 45,
        total_analizadas: analisisFiduciario?.bloque_3_contexto_mercado?.stock_total || propiedadesOrdenadas.length
      }

      const response = await fetch('/api/informe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propiedades: propiedadesData,
          datosUsuario,
          analisis: analisisData,
          leadData: leadDataParam || leadData || undefined
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Error response:', errorData)
        throw new Error(errorData.details || 'Error generando informe')
      }

      const html = await response.text()
      // Guardar HTML y mostrar modal fullscreen (funciona en mobile sin popups)
      setInformeHtml(html)
      setShowInformeModal(true)
    } catch (error) {
      console.error('Error generando informe:', error)
      alert(`Error generando el informe: ${(error as Error).message}`)
    } finally {
      setGenerandoInforme(false)
    }
  }

  // Contador para forzar refresh del modal cuando cambian filtros
  const [filterRefreshKey, setFilterRefreshKey] = useState(0)

  // Estados para edición inline de filtros
  const [editingFilter, setEditingFilter] = useState<'presupuesto' | 'dormitorios' | 'zonas' | 'estado_entrega' | 'cantidad_resultados' | 'innegociables' | null>(null)
  const [tempPresupuesto, setTempPresupuesto] = useState<number>(150000)
  const [tempDormitorios, setTempDormitorios] = useState<number | null>(null)
  const [tempZonas, setTempZonas] = useState<string[]>([])
  const [tempEstadoEntrega, setTempEstadoEntrega] = useState<string>('no_importa')
  const [tempCantidadResultados, setTempCantidadResultados] = useState<number>(5)
  const [tempInnegociables, setTempInnegociables] = useState<string[]>([])

  // Estado MOAT para impacto con contexto
  interface ImpactoMOAT {
    totalActual: number
    totalNuevo: number
    diferencia: number
    porcentajeMercado: number
    rangoPrecios?: { min: number; max: number }
    precioPromedio?: number
    interpretacion: string
  }
  const [impactoMOAT, setImpactoMOAT] = useState<ImpactoMOAT | null>(null)
  const [calculandoImpacto, setCalculandoImpacto] = useState(false)

  // Estado para modal de contactar broker
  const [showContactarBrokerModal, setShowContactarBrokerModal] = useState(false)
  const [contactarBrokerData, setContactarBrokerData] = useState<{
    propiedadId: number
    posicionTop3: number
    proyectoNombre: string
    precioUsd: number
    estadoConstruccion: string
    diasEnMercado: number | null
    brokerNombre: string
    brokerWhatsapp: string
    brokerInmobiliaria: string
    tieneParqueo: boolean
    tieneBaulera: boolean
    petFriendlyConfirmado: boolean
    // Nuevos campos del lead (beta feedback)
    leadId?: number | null
    codigoRef?: string
    usuarioNombre?: string
    usuarioWhatsapp?: string
  } | null>(null)

  // Función para contactar broker directamente (cuando ya tenemos leadData)
  // Estado para el modal de WhatsApp listo
  const [whatsappReady, setWhatsappReady] = useState<{
    url: string
    codigoRef: string
    brokerNombre: string
    proyectoNombre: string
  } | null>(null)

  // Estado para mostrar informe en modal fullscreen (evita bloqueo de popups en mobile)
  const [informeHtml, setInformeHtml] = useState<string | null>(null)
  const [showInformeModal, setShowInformeModal] = useState(false)

  const contactarBrokerDirecto = async (data: typeof contactarBrokerData) => {
    if (!data || !data.leadId || !data.usuarioNombre || !data.usuarioWhatsapp) {
      // Sin leadData, mostrar el modal para capturar datos
      setContactarBrokerData(data)
      setShowContactarBrokerModal(true)
      return
    }

    // Obtener valores desde router.query
    const { necesita_parqueo: np, necesita_baulera: nb, mascotas: m, innegociables: inn } = router.query

    try {
      const response = await fetch('/api/contactar-broker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: data.leadId,
          usuarioNombre: data.usuarioNombre,
          usuarioWhatsapp: data.usuarioWhatsapp,
          propiedadId: data.propiedadId,
          posicionTop3: data.posicionTop3,
          proyectoNombre: data.proyectoNombre,
          precioUsd: data.precioUsd,
          estadoConstruccion: data.estadoConstruccion,
          diasEnMercado: data.diasEnMercado,
          brokerNombre: data.brokerNombre,
          brokerWhatsapp: data.brokerWhatsapp,
          brokerInmobiliaria: data.brokerInmobiliaria,
          necesitaParqueo: np !== 'false',
          necesitaBaulera: nb === 'true',
          tieneMascotas: m === 'si' || m === 'true',
          innegociables: inn ? (inn as string).split(',').filter(Boolean) : [],
          tieneParqueo: data.tieneParqueo,
          tieneBaulera: data.tieneBaulera,
          petFriendlyConfirmado: data.petFriendlyConfirmado
        })
      })

      const result = await response.json()
      if (result.success && result.whatsappUrl) {
        // Mostrar modal con botón de WhatsApp (evita bloqueo de popup)
        setWhatsappReady({
          url: result.whatsappUrl,
          codigoRef: result.codigoRef,
          brokerNombre: data.brokerNombre,
          proyectoNombre: data.proyectoNombre
        })
      } else {
        console.error('Error contactar-broker:', result.error)
        setContactarBrokerData(data)
        setShowContactarBrokerModal(true)
      }
    } catch (error) {
      console.error('Error contactando broker:', error)
      setContactarBrokerData(data)
      setShowContactarBrokerModal(true)
    }
  }

  // Escuchar localStorage del informe para abrir modal de contacto
  // (postMessage no funciona con blob URLs, usamos localStorage como puente)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'CONTACTAR_BROKER' && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue)
          if (parsed.data) {
            localStorage.removeItem('CONTACTAR_BROKER')
            // Si tiene leadData, contactar directamente; si no, mostrar modal
            contactarBrokerDirecto(parsed.data)
          }
        } catch (e) {
          console.error('Error parsing CONTACTAR_BROKER:', e)
        }
      }
    }

    // También revisar al montar por si ya hay datos (misma pestaña)
    const checkExisting = () => {
      const existing = localStorage.getItem('CONTACTAR_BROKER')
      if (existing) {
        try {
          const parsed = JSON.parse(existing)
          if (parsed.data) {
            localStorage.removeItem('CONTACTAR_BROKER')
            // Si tiene leadData, contactar directamente; si no, mostrar modal
            contactarBrokerDirecto(parsed.data)
          }
        } catch (e) {
          console.error('Error parsing existing CONTACTAR_BROKER:', e)
        }
      }
    }

    // Revisar cada 500ms por si el storage cambió en otra pestaña
    const interval = setInterval(checkExisting, 500)

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getPhotoIndex = (propId: number) => photoIndexes[propId] || 0

  const nextPhoto = (propId: number, totalPhotos: number) => {
    setPhotoIndexes(prev => ({
      ...prev,
      [propId]: ((prev[propId] || 0) + 1) % totalPhotos
    }))
  }

  const prevPhoto = (propId: number, totalPhotos: number) => {
    setPhotoIndexes(prev => ({
      ...prev,
      [propId]: ((prev[propId] || 0) - 1 + totalPhotos) % totalPhotos
    }))
  }

  const toggleCardExpanded = (propId: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(propId)) {
        next.delete(propId)
      } else {
        next.add(propId)
      }
      return next
    })
  }

  // Lightbox functions
  const openLightbox = (prop: UnidadReal) => {
    setLightboxProp(prop)
    setLightboxOpen(true)
    document.body.style.overflow = 'hidden' // Prevenir scroll del body
  }

  const closeLightbox = () => {
    setLightboxOpen(false)
    setLightboxProp(null)
    document.body.style.overflow = '' // Restaurar scroll
  }

  // Touch handlers para swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchEnd = (e: React.TouchEvent, propId: number, totalPhotos: number) => {
    if (touchStart === null) return
    const touchEnd = e.changedTouches[0].clientX
    const diff = touchStart - touchEnd

    // Swipe threshold de 50px
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        // Swipe left -> next photo
        nextPhoto(propId, totalPhotos)
      } else {
        // Swipe right -> prev photo
        prevPhoto(propId, totalPhotos)
      }
    }
    setTouchStart(null)
  }

  // Parsear filtros de URL
  const {
    // Nivel 1
    presupuesto,
    zonas,
    dormitorios,
    estado_entrega,
    forma_pago,
    // Nivel 2
    innegociables,
    deseables,
    quienes_viven,
    mascotas,
    quien_decide,
    cantidad_resultados,
    pareja_alineados,
    ubicacion_vs_metros,
    calidad_vs_precio,
    amenidades_vs_metros,
    necesita_parqueo,
    necesita_baulera,
  } = router.query

  // Parsear preferencias de parqueo/baulera (default: true para parqueo, false para baulera)
  const usuarioNecesitaParqueo = necesita_parqueo !== 'false'
  const usuarioNecesitaBaulera = necesita_baulera === 'true'

  useEffect(() => {
    const cargar = async () => {
      if (!router.isReady) return

      setLoading(true)

      const filtros: FiltrosBusqueda = {
        precio_max: parseInt(presupuesto as string) || 300000,
        limite: 50,
      }

      if (dormitorios) {
        filtros.dormitorios = parseInt(dormitorios as string)
      }

      if (zonas && (zonas as string).length > 0) {
        filtros.zonas_permitidas = (zonas as string).split(',').filter(Boolean)
      }

      if (estado_entrega && estado_entrega !== 'no_importa') {
        filtros.estado_entrega = estado_entrega as any
      }

      // Buscar propiedades que cumplen filtros (con fotos)
      // v2.24: Usa busqueda unificada (scraping + broker)
      const data = await buscarUnidadesUnificadas(filtros)
      setPropiedades(data)

      // Llamar análisis fiduciario con contexto del usuario
      const innegociablesArray = innegociables
        ? (innegociables as string).split(',').filter(Boolean)
        : []

      const analisis = await obtenerAnalisisFiduciario({
        dormitorios: dormitorios ? parseInt(dormitorios as string) : undefined,
        precio_max: parseInt(presupuesto as string) || 300000,
        zona: zonas ? (zonas as string).split(',')[0] : undefined,
        solo_con_fotos: true,
        limite: 50,
        // Contexto fiduciario para alertas
        innegociables: innegociablesArray,
        contexto: {
          mascota: mascotas as string || undefined,
          quienes_viven: quienes_viven as string || undefined,
        }
      })

      setAnalisisFiduciario(analisis)
      setLoading(false)
    }

    cargar()
  }, [router.isReady, presupuesto, zonas, dormitorios, estado_entrega, innegociables, mascotas, quienes_viven])

  // Iniciar edición de un filtro
  const startEditing = (filter: 'presupuesto' | 'dormitorios' | 'zonas' | 'estado_entrega' | 'cantidad_resultados' | 'innegociables') => {
    if (filter === 'presupuesto') {
      setTempPresupuesto(parseInt(presupuesto as string) || 150000)
    } else if (filter === 'dormitorios') {
      setTempDormitorios(dormitorios ? parseInt(dormitorios as string) : null)
    } else if (filter === 'zonas') {
      setTempZonas(zonas ? (zonas as string).split(',').filter(Boolean) : [])
    } else if (filter === 'estado_entrega') {
      setTempEstadoEntrega((estado_entrega as string) || 'no_importa')
    } else if (filter === 'cantidad_resultados') {
      setTempCantidadResultados(parseInt(cantidad_resultados as string) || 5)
    } else if (filter === 'innegociables') {
      setTempInnegociables(innegociables ? (innegociables as string).split(',').filter(Boolean) : [])
    }
    setEditingFilter(filter)
    setImpactoMOAT(null)
  }

  // Calcular impacto MOAT automáticamente (con debounce via useEffect)
  useEffect(() => {
    if (!editingFilter) return

    const calcular = async () => {
      setCalculandoImpacto(true)
      try {
        // Filtros con valores temporales - DEBEN coincidir con carga principal
        const nuevosFiltros: FiltrosBusqueda = {
          precio_max: editingFilter === 'presupuesto' ? tempPresupuesto : (parseInt(presupuesto as string) || 300000),
          limite: 50, // Mismo límite que carga principal
        }
        if (editingFilter === 'dormitorios') {
          if (tempDormitorios !== null) nuevosFiltros.dormitorios = tempDormitorios
        } else if (dormitorios) {
          nuevosFiltros.dormitorios = parseInt(dormitorios as string)
        }
        if (editingFilter === 'zonas') {
          if (tempZonas.length > 0) nuevosFiltros.zonas_permitidas = tempZonas
        } else if (zonas && (zonas as string).length > 0) {
          nuevosFiltros.zonas_permitidas = (zonas as string).split(',').filter(Boolean)
        }
        // Incluir estado_entrega - usar temporal si estamos editando, sino el actual
        if (editingFilter === 'estado_entrega') {
          if (tempEstadoEntrega && tempEstadoEntrega !== 'no_importa') {
            nuevosFiltros.estado_entrega = tempEstadoEntrega as any
          }
        } else if (estado_entrega && estado_entrega !== 'no_importa') {
          nuevosFiltros.estado_entrega = estado_entrega as any
        }

        console.log('🔍 Cálculo impacto - filtros:', JSON.stringify(nuevosFiltros))
        const resultado = await buscarUnidadesReales(nuevosFiltros)
        console.log('🔍 Cálculo impacto - resultados:', resultado.length)
        const totalNuevo = resultado.length

        // Calcular métricas
        const precios = resultado.map(r => r.precio_usd).filter(p => p > 0)
        const precioMin = precios.length ? Math.min(...precios) : 0
        const precioMax = precios.length ? Math.max(...precios) : 0
        const precioPromedio = precios.length ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length) : 0

        // Stock total de la zona (aproximado - usamos 50 como base)
        const stockTotal = 50
        const porcentaje = Math.round((totalNuevo / stockTotal) * 100)

        // Interpretación MOAT
        let interpretacion = ''
        if (editingFilter === 'presupuesto') {
          if (porcentaje >= 60) interpretacion = 'Accedés a la mayoría del mercado'
          else if (porcentaje >= 30) interpretacion = 'Rango competitivo'
          else if (porcentaje >= 10) interpretacion = 'Opciones limitadas'
          else interpretacion = 'Muy pocas opciones'
        } else if (editingFilter === 'dormitorios') {
          if (totalNuevo >= 15) interpretacion = 'Buena oferta en esta tipología'
          else if (totalNuevo >= 5) interpretacion = 'Stock moderado'
          else interpretacion = 'Pocas opciones - considerá flexibilizar'
        } else if (editingFilter === 'zonas') {
          if (tempZonas.length === 0) interpretacion = 'Todas las zonas = máximas opciones'
          else if (tempZonas.length === 1) interpretacion = 'Zona específica - stock limitado'
          else interpretacion = `${tempZonas.length} zonas seleccionadas`
        } else if (editingFilter === 'estado_entrega') {
          if (tempEstadoEntrega === 'no_importa') {
            interpretacion = 'Todo el mercado - máximas opciones'
          } else if (tempEstadoEntrega === 'solo_preventa') {
            if (totalNuevo === 0) interpretacion = 'Sin preventas disponibles ahora'
            else if (totalNuevo < 10) interpretacion = 'Pocas preventas, pero con mejores precios'
            else interpretacion = 'Buenas opciones en preventa - precios más bajos'
          } else {
            // entrega_inmediata
            if (totalNuevo < 10) interpretacion = 'Pocas opciones listas - considerá preventa'
            else interpretacion = 'Buen stock listo para mudarte ya'
          }
        }

        setImpactoMOAT({
          totalActual: propiedades.length,
          totalNuevo,
          diferencia: totalNuevo - propiedades.length,
          porcentajeMercado: porcentaje,
          rangoPrecios: { min: precioMin, max: precioMax },
          precioPromedio,
          interpretacion
        })
      } catch (e) {
        setImpactoMOAT(null)
      }
      setCalculandoImpacto(false)
    }

    // Debounce de 300ms
    const timer = setTimeout(calcular, 300)
    return () => clearTimeout(timer)
  }, [editingFilter, tempPresupuesto, tempDormitorios, tempZonas, tempEstadoEntrega, propiedades.length, presupuesto, zonas, dormitorios, estado_entrega])

  // Aplicar filtros editados
  const aplicarFiltros = () => {
    const params = new URLSearchParams()

    // Aplicar valores según qué filtro estamos editando
    params.set('presupuesto', editingFilter === 'presupuesto'
      ? tempPresupuesto.toString()
      : (presupuesto as string || '150000'))

    const newDorms = editingFilter === 'dormitorios' ? tempDormitorios : (dormitorios ? parseInt(dormitorios as string) : null)
    if (newDorms !== null) params.set('dormitorios', newDorms.toString())

    const newZonas = editingFilter === 'zonas' ? tempZonas : (zonas ? (zonas as string).split(',').filter(Boolean) : [])
    if (newZonas.length > 0) params.set('zonas', newZonas.join(','))

    // innegociables: usar temporal si estamos editando, sino preservar actual
    const newInnegociables = editingFilter === 'innegociables' ? tempInnegociables : (innegociables ? (innegociables as string).split(',').filter(Boolean) : [])
    if (newInnegociables.length > 0) params.set('innegociables', newInnegociables.join(','))

    // estado_entrega: usar temporal si estamos editando, sino preservar actual
    const newEstadoEntrega = editingFilter === 'estado_entrega' ? tempEstadoEntrega : (estado_entrega as string)
    if (newEstadoEntrega && newEstadoEntrega !== 'no_importa') {
      params.set('estado_entrega', newEstadoEntrega)
    }
    if (forma_pago) params.set('forma_pago', forma_pago as string)
    if (deseables) params.set('deseables', deseables as string)
    if (quienes_viven) params.set('quienes_viven', quienes_viven as string)
    if (mascotas) params.set('mascotas', mascotas as string)

    // cantidad_resultados: usar temporal si estamos editando, sino preservar actual
    const newCantidadResultados = editingFilter === 'cantidad_resultados' ? tempCantidadResultados : (cantidad_resultados ? parseInt(cantidad_resultados as string) : 5)
    params.set('cantidad_resultados', newCantidadResultados.toString())
    if (quien_decide) params.set('quien_decide', quien_decide as string)
    if (pareja_alineados) params.set('pareja_alineados', pareja_alineados as string)
    if (ubicacion_vs_metros) params.set('ubicacion_vs_metros', ubicacion_vs_metros as string)
    if (calidad_vs_precio) params.set('calidad_vs_precio', calidad_vs_precio as string)
    if (amenidades_vs_metros) params.set('amenidades_vs_metros', amenidades_vs_metros as string)

    setEditingFilter(null)
    // Cerrar modal premium si está abierto (para que muestre datos frescos al reabrir)
    setShowPremiumExample(false)
    // Incrementar key para forzar refresh del modal
    setFilterRefreshKey(prev => prev + 1)
    router.push(`/resultados?${params.toString()}`)
  }

  // Datos del usuario para MOAT score (de URL params)
  const datosUsuarioMOAT: DatosUsuarioMOAT = useMemo(() => ({
    innegociables: innegociables ? (innegociables as string).split(',').filter(Boolean) : [],
    deseables: deseables ? (deseables as string).split(',').filter(Boolean) : [],
    ubicacion_vs_metros: parseInt(ubicacion_vs_metros as string) || 3,
    calidad_vs_precio: parseInt(calidad_vs_precio as string) || 3,
    amenidades_vs_metros: parseInt(amenidades_vs_metros as string) || 3,
  }), [innegociables, deseables, ubicacion_vs_metros, calidad_vs_precio, amenidades_vs_metros])

  // Ordenar propiedades por MOAT score
  const propiedadesOrdenadas = useMemo(() => {
    if (propiedades.length === 0) return []

    // Calcular score para cada propiedad
    const conScore = propiedades.map(p => ({
      ...p,
      score_moat: calcularScoreMOAT(p, datosUsuarioMOAT)
    }))

    // Ordenar por score MOAT descendente
    // Desempate: mejor oportunidad de precio (diferencia_pct más negativa)
    conScore.sort((a, b) => {
      if (b.score_moat !== a.score_moat) {
        return b.score_moat - a.score_moat
      }
      // Desempate por posición de mercado
      const difA = (a.posicion_mercado as { diferencia_pct?: number } | null)?.diferencia_pct ?? 0
      const difB = (b.posicion_mercado as { diferencia_pct?: number } | null)?.diferencia_pct ?? 0
      return difA - difB  // Menor diferencia (más negativa = mejor) primero
    })

    return conScore
  }, [propiedades, datosUsuarioMOAT])

  // Separar en TOP 3 y alternativas (ahora ordenados por MOAT score)
  // cantidad_resultados controla cuántas alternativas mostrar
  const top3 = propiedadesOrdenadas.slice(0, 3)
  const cantidadTotal = cantidad_resultados === '3' ? 3
    : cantidad_resultados === '5' ? 5
    : cantidad_resultados === '10' ? 10
    : cantidad_resultados === 'todas' ? propiedadesOrdenadas.length // Modo exploración: todas
    : 10 // Default: top 10
  const alternativas = cantidadTotal <= 3 ? [] : propiedadesOrdenadas.slice(3, cantidadTotal)

  // Excluidas del SQL (bloque_2_opciones_excluidas)
  const excluidasFiduciarias = analisisFiduciario?.bloque_2_opciones_excluidas?.opciones || []

  // Contexto de mercado del SQL (bloque_3_contexto_mercado)
  const contextoMercado = analisisFiduciario?.bloque_3_contexto_mercado

  // Opciones válidas con posición de mercado (bloque_1_opciones_validas)
  const opcionesValidas = analisisFiduciario?.bloque_1_opciones_validas?.opciones || []

  // Helper: obtener posición de mercado para una propiedad
  const getPosicionMercado = (propId: number) => {
    const opcion = opcionesValidas.find(o => o.id === propId)
    return opcion?.posicion_mercado || null
  }

  // Helper: generar síntesis fiduciaria para una propiedad
  const getSintesisFiduciaria = (prop: UnidadReal) => {
    const costos = getCostosOcultosEstimados(prop.dormitorios, null, null)
    const costoParqueo = Math.round((costos.estacionamiento.compra.min + costos.estacionamiento.compra.max) / 2)
    const costoBaulera = Math.round((costos.baulera.compra.min + costos.baulera.compra.max) / 2)

    // Parsear innegociables del usuario
    const innegociablesArray = innegociables
      ? (innegociables as string).split(',').filter(Boolean)
      : []

    // Combinar amenidades (confirmadas + detectadas)
    const amenidadesPropiedad = [
      ...(prop.amenities_confirmados || []),
      ...(prop.equipamiento_detectado || [])
    ]

    // Estado parqueo/baulera: true=tiene, false=no tiene, null=desconocido
    const tieneParqueoConfirmado = prop.estacionamientos == null
      ? null
      : prop.estacionamientos > 0
    const tieneBauleraConfirmada = prop.baulera == null
      ? null
      : prop.baulera === true

    return generarSintesisFiduciaria({
      diferenciaPct: prop.posicion_mercado?.success ? prop.posicion_mercado.diferencia_pct : null,
      diasEnMercado: prop.dias_en_mercado,
      diasMedianaZona: contextoMercado?.metricas_zona?.dias_mediana ?? null,
      diasPromedioZona: contextoMercado?.metricas_zona?.dias_promedio ?? null,
      escasez: parseEscasezDeRazon(prop.razon_fiduciaria),
      estadoConstruccion: prop.estado_construccion || '',
      innegociablesUsuario: innegociablesArray,
      amenidadesPropiedad,
      usuarioNecesitaParqueo,
      usuarioNecesitaBaulera,
      tieneParqueoConfirmado,
      tieneBauleraConfirmada,
      costoExtraParqueo: costoParqueo,
      costoExtraBaulera: costoBaulera
    })
  }

  // Detectar compromisos/tradeoffs de una propiedad
  const getCompromisos = (prop: UnidadReal): { texto: string, tipo: 'warning' | 'info' }[] => {
    const compromisos: { texto: string, tipo: 'warning' | 'info' }[] = []

    // Estado construcción
    if (prop.estado_construccion === 'preventa') {
      compromisos.push({ texto: 'Preventa - esperar entrega', tipo: 'warning' })
    }
    if (prop.estado_construccion === 'usado') {
      compromisos.push({ texto: 'Usado', tipo: 'info' })
    }

    // Área pequeña
    if (prop.area_m2 < 50) {
      compromisos.push({ texto: 'Área compacta', tipo: 'info' })
    }

    // Precio por m² alto vs promedio (>$1800 es caro para Equipetrol)
    if (prop.precio_m2 > 1800) {
      compromisos.push({ texto: 'Precio/m² elevado', tipo: 'warning' })
    }

    // Sin amenities (detectar por nombre de proyecto genérico)
    // Esto es una heurística - en producción tendríamos datos de amenities
    if (prop.precio_m2 < 1200) {
      compromisos.push({ texto: 'Edificio básico', tipo: 'info' })
    }

    return compromisos
  }

  // Generar mensaje WhatsApp
  const generarMensajeWhatsApp = () => {
    const zonasTexto = (zonas as string)?.split(',').filter(Boolean).join(', ') || 'Equipetrol'
    const paraQueTexto = router.query.para_que_es === 'vivienda' ? 'Vivienda'
      : router.query.para_que_es === 'inversion_renta' ? 'Inversión renta'
      : router.query.para_que_es === 'inversion_plusvalia' ? 'Inversión plusvalía'
      : 'Vivienda'

    const top3Texto = top3.map((p, i) =>
      `${i + 1}. ${p.proyecto} - $${formatNum(p.precio_usd)}`
    ).join('\n')

    const mensaje = `Hola! Usé Simón y encontré opciones que me interesan.

🔍 Mi búsqueda:
- Presupuesto: hasta $${formatNum(parseInt(presupuesto as string)) || '150,000'}
- Zona: ${zonasTexto}
- Dormitorios: ${dormitorios === '0' ? 'Monoambiente' : dormitorios || 'Todos'}
- Para: ${paraQueTexto}

🏆 TOP 3 que me gustaron:
${top3Texto}

¿Me pueden dar más info?`

    return mensaje
  }

  const abrirWhatsApp = () => {
    const mensaje = generarMensajeWhatsApp()
    const url = `https://wa.me/59176308808?text=${encodeURIComponent(mensaje)}`
    window.open(url, '_blank')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <InternalHeader backLink={{ href: '/filtros', label: '← Nueva búsqueda' }} />
      <div className="max-w-4xl mx-auto px-4 pb-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Tus resultados personalizados
          </h1>
          <p className="text-gray-600 mt-1">
            {propiedades.length} propiedades encontradas
          </p>
        </div>

        {/* Tu Búsqueda - Edición Inline MOAT */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Tu Búsqueda</h2>
            <Link
              href={`/filtros?presupuesto=${presupuesto || 150000}&dormitorios=${dormitorios || ''}&zonas=${zonas || ''}&estado_entrega=${estado_entrega || ''}&forma_pago=${forma_pago || ''}&innegociables=${innegociables || ''}&deseables=${deseables || ''}&quienes_viven=${quienes_viven || ''}&mascotas=${mascotas || ''}&quien_decide=${quien_decide || ''}&pareja_alineados=${pareja_alineados || ''}&ubicacion_vs_metros=${ubicacion_vs_metros || ''}&calidad_vs_precio=${calidad_vs_precio || ''}&cantidad_resultados=${cantidad_resultados || ''}`}
              className="text-xs text-blue-600 hover:underline"
            >
              Editar todo
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* PRESUPUESTO - MOAT */}
            {editingFilter === 'presupuesto' ? (
              <div className="bg-gradient-to-b from-blue-50 to-white border border-blue-200 rounded-xl p-4 w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-800">💰 Presupuesto</span>
                  <button onClick={() => setEditingFilter(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>

                {/* Slider + Valor */}
                <div className="mb-4">
                  <input
                    type="range"
                    min={50000}
                    max={500000}
                    step={5000}
                    value={tempPresupuesto}
                    onChange={(e) => setTempPresupuesto(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>$50k</span>
                    <span className="text-lg font-bold text-blue-700">${formatNum(tempPresupuesto)}</span>
                    <span>$500k</span>
                  </div>
                </div>

                {/* Contexto MOAT */}
                <div className="bg-white rounded-lg border border-gray-100 p-3 mb-3">
                  {calculandoImpacto ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Calculando...
                    </div>
                  ) : impactoMOAT ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Con ${formatNum(tempPresupuesto)}:</span>
                        <span className="text-lg font-bold text-gray-900">{impactoMOAT.totalNuevo} opciones</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {impactoMOAT.porcentajeMercado}% del mercado · Rango ${formatNum(impactoMOAT.rangoPrecios?.min || 0)} - ${formatNum(impactoMOAT.rangoPrecios?.max || 0)}
                      </div>
                      <div className={`text-sm font-medium ${impactoMOAT.diferencia > 0 ? 'text-green-600' : impactoMOAT.diferencia < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        → {impactoMOAT.interpretacion}
                        {impactoMOAT.diferencia !== 0 && (
                          <span className="ml-1">({impactoMOAT.diferencia > 0 ? '+' : ''}{impactoMOAT.diferencia} vs actual)</span>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Aplicar */}
                <button
                  onClick={aplicarFiltros}
                  disabled={calculandoImpacto}
                  className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Aplicar cambio
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEditing('presupuesto')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-full text-sm transition-all"
              >
                <span>💰</span>
                <span className="text-gray-700 font-medium">Hasta ${formatNum(parseInt(presupuesto as string) || 150000)}</span>
                <span className="text-blue-500 text-xs">✎</span>
              </button>
            )}

            {/* DORMITORIOS - MOAT */}
            {editingFilter === 'dormitorios' ? (
              <div className="bg-gradient-to-b from-blue-50 to-white border border-blue-200 rounded-xl p-4 w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-800">🛏️ Dormitorios</span>
                  <button onClick={() => setEditingFilter(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>

                {/* Botones */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {[{ val: null, label: 'Todos' }, { val: 0, label: 'Mono' }, { val: 1, label: '1' }, { val: 2, label: '2' }, { val: 3, label: '3' }, { val: 4, label: '4+' }].map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => setTempDormitorios(opt.val)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        tempDormitorios === opt.val
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Contexto MOAT */}
                <div className="bg-white rounded-lg border border-gray-100 p-3 mb-3">
                  {calculandoImpacto ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Calculando...
                    </div>
                  ) : impactoMOAT ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {tempDormitorios === null ? 'Todos los dormitorios' : tempDormitorios === 0 ? 'Monoambientes' : `${tempDormitorios} dormitorio${tempDormitorios > 1 ? 's' : ''}`}:
                        </span>
                        <span className="text-lg font-bold text-gray-900">{impactoMOAT.totalNuevo} opciones</span>
                      </div>
                      {impactoMOAT.rangoPrecios && impactoMOAT.rangoPrecios.min > 0 && (
                        <div className="text-xs text-gray-500">
                          Rango: ${formatNum(impactoMOAT.rangoPrecios.min)} - ${formatNum(impactoMOAT.rangoPrecios.max)} · Prom: ${formatNum(impactoMOAT.precioPromedio || 0)}
                        </div>
                      )}
                      <div className={`text-sm font-medium ${impactoMOAT.diferencia > 0 ? 'text-green-600' : impactoMOAT.diferencia < 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                        → {impactoMOAT.interpretacion}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Aplicar */}
                <button
                  onClick={aplicarFiltros}
                  disabled={calculandoImpacto}
                  className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Aplicar cambio
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEditing('dormitorios')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-full text-sm transition-all"
              >
                <span>🛏️</span>
                <span className="text-gray-700 font-medium">
                  {formatDorms(dormitorios as string, 'largo')}
                </span>
                <span className="text-blue-500 text-xs">✎</span>
              </button>
            )}

            {/* ZONAS - MOAT */}
            {editingFilter === 'zonas' ? (
              <div className="bg-gradient-to-b from-blue-50 to-white border border-blue-200 rounded-xl p-4 w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-800">📍 Zonas</span>
                  <button onClick={() => setEditingFilter(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>

                {/* Botones zonas */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {ZONAS_DISPONIBLES.map(zona => (
                    <button
                      key={zona.value}
                      onClick={() => {
                        if (tempZonas.includes(zona.value)) {
                          setTempZonas(tempZonas.filter(z => z !== zona.value))
                        } else {
                          setTempZonas([...tempZonas, zona.value])
                        }
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        tempZonas.includes(zona.value)
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      {zona.label}
                    </button>
                  ))}
                </div>

                {/* Contexto MOAT */}
                <div className="bg-white rounded-lg border border-gray-100 p-3 mb-3">
                  {calculandoImpacto ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Calculando...
                    </div>
                  ) : impactoMOAT ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {tempZonas.length === 0 ? 'Todas las zonas' : tempZonas.length === 1 ? tempZonas[0] : `${tempZonas.length} zonas`}:
                        </span>
                        <span className="text-lg font-bold text-gray-900">{impactoMOAT.totalNuevo} opciones</span>
                      </div>
                      {impactoMOAT.precioPromedio && impactoMOAT.precioPromedio > 0 && (
                        <div className="text-xs text-gray-500">
                          Precio promedio: ${formatNum(impactoMOAT.precioPromedio)}
                        </div>
                      )}
                      <div className={`text-sm font-medium ${impactoMOAT.diferencia > 0 ? 'text-green-600' : impactoMOAT.diferencia < 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                        → {impactoMOAT.interpretacion}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Aplicar */}
                <button
                  onClick={aplicarFiltros}
                  disabled={calculandoImpacto}
                  className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Aplicar cambio
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEditing('zonas')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-full text-sm transition-all"
              >
                <span>📍</span>
                <span className="text-gray-700 font-medium">
                  {zonas ? (zonas as string).split(',').filter(Boolean).slice(0, 2).join(', ') + ((zonas as string).split(',').filter(Boolean).length > 2 ? '...' : '') : 'Todas las zonas'}
                </span>
                <span className="text-blue-500 text-xs">✎</span>
              </button>
            )}

            {/* ESTADO ENTREGA - MOAT */}
            {editingFilter === 'estado_entrega' ? (
              <div className="bg-gradient-to-b from-blue-50 to-white border border-blue-200 rounded-xl p-4 w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-800">🏠 Estado de entrega</span>
                  <button onClick={() => setEditingFilter(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>

                {/* Opciones */}
                <div className="space-y-2 mb-4">
                  {[
                    { val: 'entrega_inmediata', label: 'Ya lista para entregar', desc: 'Puedo mudarme inmediatamente' },
                    { val: 'solo_preventa', label: 'Solo preventa', desc: 'Precios más bajos, esperar 6-24 meses' },
                    { val: 'no_importa', label: 'Todo el mercado', desc: 'Ver todas las opciones disponibles' }
                  ].map(opt => (
                    <label
                      key={opt.val}
                      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                        tempEstadoEntrega === opt.val
                          ? 'bg-blue-100 border border-blue-300'
                          : 'bg-white border border-gray-200 hover:border-blue-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="estado_entrega"
                        checked={tempEstadoEntrega === opt.val}
                        onChange={() => setTempEstadoEntrega(opt.val)}
                        className="mt-1"
                      />
                      <div>
                        <span className="font-medium text-gray-800">{opt.label}</span>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Contexto MOAT */}
                <div className="bg-white rounded-lg border border-gray-100 p-3 mb-3">
                  {calculandoImpacto ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Calculando...
                    </div>
                  ) : impactoMOAT ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {tempEstadoEntrega === 'entrega_inmediata' ? 'Solo listas' :
                           tempEstadoEntrega === 'solo_preventa' ? 'Solo preventa' : 'Todo'}:
                        </span>
                        <span className="text-lg font-bold text-gray-900">{impactoMOAT.totalNuevo} opciones</span>
                      </div>
                      <div className={`text-sm font-medium ${impactoMOAT.diferencia > 0 ? 'text-green-600' : impactoMOAT.diferencia < 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                        → {impactoMOAT.interpretacion}
                        {impactoMOAT.diferencia !== 0 && (
                          <span className="ml-1">({impactoMOAT.diferencia > 0 ? '+' : ''}{impactoMOAT.diferencia} vs actual)</span>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Aplicar */}
                <button
                  onClick={aplicarFiltros}
                  disabled={calculandoImpacto}
                  className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Aplicar cambio
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEditing('estado_entrega')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-full text-sm transition-all"
              >
                <span>🏠</span>
                <span className="text-gray-700 font-medium">
                  {estado_entrega === 'entrega_inmediata' ? 'Ya lista' :
                   estado_entrega === 'solo_preventa' ? 'Solo preventa' :
                   'Todo el mercado'}
                </span>
                <span className="text-blue-500 text-xs">✎</span>
              </button>
            )}

            {/* CANTIDAD RESULTADOS - Inline */}
            {editingFilter === 'cantidad_resultados' ? (
              <div className="bg-gradient-to-b from-blue-50 to-white border border-blue-200 rounded-xl p-4 w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-800">📊 Cantidad de resultados</span>
                  <button onClick={() => setEditingFilter(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    { val: 3, label: 'Top 3' },
                    { val: 5, label: 'Top 5' },
                    { val: 10, label: 'Top 10' },
                    { val: 0, label: 'Todas' }
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setTempCantidadResultados(opt.val)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        tempCantidadResultados === opt.val
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-gray-500 mb-3">
                  {tempCantidadResultados === 0
                    ? `Mostrando las ${propiedades.length} propiedades encontradas`
                    : `Mostrando las ${Math.min(tempCantidadResultados, propiedades.length)} mejores opciones de ${propiedades.length}`}
                </p>

                <button
                  onClick={aplicarFiltros}
                  className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Aplicar cambio
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEditing('cantidad_resultados')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-full text-sm transition-all"
              >
                <span>📊</span>
                <span className="text-gray-700 font-medium">
                  {!cantidad_resultados || cantidad_resultados === '0' ? 'Todas' : `Top ${cantidad_resultados}`}
                </span>
                <span className="text-blue-500 text-xs">✎</span>
              </button>
            )}

            {/* INNEGOCIABLES - Inline */}
            {editingFilter === 'innegociables' ? (
              <div className="bg-gradient-to-b from-blue-50 to-white border border-blue-200 rounded-xl p-4 w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-800">⭐ Requisitos mínimos</span>
                  <button onClick={() => setEditingFilter(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>

                <p className="text-xs text-gray-500 mb-3">
                  Las propiedades que NO cumplan estos requisitos quedarán como alternativas
                </p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { val: 'piscina', label: '🏊 Piscina', emoji: '🏊' },
                    { val: 'gimnasio', label: '💪 Gimnasio', emoji: '💪' },
                    { val: 'quincho', label: '🔥 Quincho/BBQ', emoji: '🔥' },
                    { val: 'porteria_24h', label: '🔒 Portería 24h', emoji: '🔒' },
                    { val: 'salon_eventos', label: '🎉 Salón eventos', emoji: '🎉' },
                    { val: 'area_juegos', label: '🎮 Área juegos', emoji: '🎮' }
                  ].map(opt => (
                    <label
                      key={opt.val}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                        tempInnegociables.includes(opt.val)
                          ? 'bg-blue-100 border border-blue-300'
                          : 'bg-white border border-gray-200 hover:border-blue-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={tempInnegociables.includes(opt.val)}
                        onChange={() => {
                          if (tempInnegociables.includes(opt.val)) {
                            setTempInnegociables(tempInnegociables.filter(i => i !== opt.val))
                          } else {
                            setTempInnegociables([...tempInnegociables, opt.val])
                          }
                        }}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>

                <button
                  onClick={aplicarFiltros}
                  className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Aplicar cambio
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEditing('innegociables')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-full text-sm transition-all"
              >
                <span>⭐</span>
                <span className="text-gray-700 font-medium">
                  {innegociables && (innegociables as string).split(',').filter(Boolean).length > 0
                    ? `${(innegociables as string).split(',').filter(Boolean).length} innegociables`
                    : 'Sin mínimos'}
                </span>
                <span className="text-blue-500 text-xs">✎</span>
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Analizando opciones...</p>
          </div>
        ) : (
          <>
            {/* CTA Informe Premium - PROMINENTE arriba */}
            <section className="mb-6">
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-5 text-white shadow-lg">
                <div className="flex items-start gap-4">
                  <div className="bg-white/20 rounded-full p-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-1">
                      Tu Análisis Fiduciario Personalizado
                    </h3>
                    <p className="text-purple-100 text-sm mb-3">
                      Elegí 3 propiedades y te decimos cuál te conviene más, con datos reales de mercado.
                    </p>

                    {/* Progress bar */}
                    <div className="bg-white/20 rounded-full h-2 mb-2">
                      <div
                        className="bg-white rounded-full h-2 transition-all duration-300"
                        style={{ width: `${Math.min((selectedProps.size / 3) * 100, 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm">
                        {selectedProps.size === 0 && '❤️ Tocá el corazón en las que te gusten'}
                        {selectedProps.size === 1 && '❤️ ¡Bien! Elegí 2 más'}
                        {selectedProps.size === 2 && '❤️ ¡Una más y listo!'}
                        {selectedProps.size >= 3 && '✓ ¡Listo para tu análisis!'}
                      </span>
                      <span className="font-bold text-lg">{selectedProps.size}/3</span>
                    </div>

                    {selectedProps.size >= 3 && (
                      <button
                        onClick={iniciarOrdenar}
                        className="mt-3 w-full py-2.5 bg-white text-purple-700 font-semibold rounded-lg hover:bg-purple-50 transition-colors"
                      >
                        Ver mi Análisis Premium →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Leyenda de símbolos colapsable */}
            <div className="mb-4">
              <button
                onClick={() => setShowLeyenda(!showLeyenda)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
              >
                <span>{showLeyenda ? '▼' : '▶'}</span>
                <span>ℹ️ Leyenda de símbolos</span>
              </button>
              {showLeyenda && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <span>🛏️ = Dormitorios</span>
                  <span>🚿 = Baños</span>
                  <span>📐 = Área m²</span>
                  <span>🚗 = Parqueos (✓=incluido, ?=sin confirmar)</span>
                  <span>📦 = Baulera (✓=incluido, ?=sin confirmar)</span>
                  <span>🏢 = Amenidades edificio</span>
                  <span>📅 = Plan de pagos con desarrollador</span>
                  <span>💱 = Solo TC paralelo</span>
                  <span>🤝 = Precio negociable</span>
                  <span>📉 = Descuento por contado</span>
                </div>
              )}
            </div>

            {/* TOP 3 */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🏆</span>
                <h2 className="text-xl font-bold text-gray-900">TUS MEJORES OPCIONES</h2>
              </div>

              <div className="space-y-4">
                {top3.map((prop, idx) => (
                  <div
                    key={prop.id}
                    id={`propiedad-${prop.id}`}
                    className={`bg-white rounded-xl overflow-hidden transition-all duration-300 ${
                      isSelected(prop.id)
                        ? 'ring-2 ring-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                        : 'shadow-lg'
                    }`}
                  >
                    {/* Layout vertical - Mobile first */}
                    <div className="flex flex-col">
                      {/* Galería de fotos - Grande en mobile, click para fullscreen */}
                      <div
                        className="w-full h-56 md:h-64 bg-gray-200 relative cursor-pointer"
                        onClick={() => openLightbox(prop)}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={(e) => handleTouchEnd(e, prop.id, prop.fotos_urls?.length || 0)}
                      >
                        {prop.fotos_urls && prop.fotos_urls.length > 0 ? (
                          <>
                            <img
                              src={prop.fotos_urls[getPhotoIndex(prop.id)]}
                              alt={`${prop.proyecto} - Foto ${getPhotoIndex(prop.id) + 1}`}
                              className="w-full h-full object-cover"
                            />

                            {/* Badge Match - sobre la foto */}
                            <span className="absolute top-3 right-3 text-sm font-bold bg-blue-600 text-white px-3 py-1 rounded-full shadow">
                              #{idx + 1} Match
                            </span>

                            {/* Badge Broker - si es propiedad de broker */}
                            {prop.fuente_tipo === 'broker' && prop.codigo_sim && (
                              <span className="absolute top-12 right-3 text-xs font-medium bg-amber-500 text-white px-2 py-1 rounded-full shadow flex items-center gap-1">
                                <span>🏷️</span>
                                <span>{prop.codigo_sim}</span>
                              </span>
                            )}

                            {/* Botón guardar - sobre la foto */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleSelected(prop.id) }}
                              className="absolute top-3 left-3 p-2 transition-all"
                            >
                              <svg
                                className={`w-6 h-6 transition-all ${
                                  isSelected(prop.id)
                                    ? 'fill-red-500 stroke-red-500'
                                    : 'fill-transparent stroke-white drop-shadow-md hover:stroke-red-400'
                                }`}
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                              >
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                              </svg>
                            </button>

                            {/* Navegación fotos - Siempre visible en mobile */}
                            {prop.fotos_urls.length > 1 && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); prevPhoto(prop.id, prop.fotos_urls!.length) }}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-lg"
                                >
                                  ‹
                                </button>

                                <button
                                  onClick={(e) => { e.stopPropagation(); nextPhoto(prop.id, prop.fotos_urls!.length) }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-lg"
                                >
                                  ›
                                </button>

                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                                  {getPhotoIndex(prop.id) + 1} / {prop.fotos_urls.length}
                                </div>
                              </>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg">
                            📷 Sin foto
                          </div>
                        )}
                      </div>

                      {/* Info - Nombre + Precio */}
                      <div className="flex-1 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-bold text-lg text-gray-900">
                              {prop.proyecto}
                              <span className="ml-2 text-xs text-gray-400 font-normal">#{prop.id}</span>
                            </h3>
                            {prop.desarrollador && (
                              <p className="text-sm text-gray-500">{prop.desarrollador}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-gray-900">
                              ${formatNum(prop.precio_usd)}
                            </p>
                            <p className="text-sm text-gray-500">
                              ${prop.precio_m2}/m²
                            </p>
                          </div>
                        </div>

                        {/* Info línea unificada - mismo formato que alternativas */}
                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-3 text-sm text-gray-600">
                          <span className="font-semibold text-gray-700">Departamento</span>
                          <span>·</span>
                          <span>🛏️ {formatDorms(prop.dormitorios)}</span>
                          {prop.banos != null && (
                            <>
                              <span>·</span>
                              <span>🚿 {Math.floor(Number(prop.banos))}b</span>
                            </>
                          )}
                          <span>·</span>
                          <span>📐 {prop.area_m2}m²</span>
                          <span>·</span>
                          {prop.estacionamientos != null && prop.estacionamientos > 0 ? (
                            <span>🚗 {prop.estacionamientos}p</span>
                          ) : (
                            <span className="text-amber-600">🚗 ?</span>
                          )}
                          <span>·</span>
                          {prop.baulera === true ? (
                            <span>📦 ✓</span>
                          ) : (
                            <span className="text-amber-600">📦 ?</span>
                          )}
                          {prop.estado_construccion && prop.estado_construccion !== 'no_especificado' && (
                            <>
                              <span>·</span>
                              <span className="text-blue-600 capitalize">{prop.estado_construccion.replace(/_/g, ' ')}</span>
                            </>
                          )}
                        </div>

                        {/* Badges Forma de Pago */}
                        {(prop.plan_pagos_desarrollador || prop.solo_tc_paralelo || prop.precio_negociable || prop.descuento_contado_pct) && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {prop.plan_pagos_desarrollador && (
                              <div className="relative group">
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs cursor-help">
                                  📅 Plan pagos
                                </span>
                                {prop.plan_pagos_cuotas && prop.plan_pagos_cuotas.length > 0 && (
                                  <div className="absolute hidden group-hover:block z-20 bg-white border shadow-lg rounded-lg p-3 w-56 -left-2 top-6">
                                    <p className="text-xs font-semibold text-blue-800 mb-2">📋 Detalle del plan:</p>
                                    {(prop.plan_pagos_cuotas as CuotaPago[]).map((cuota, i) => (
                                      <p key={i} className="text-xs text-slate-600 mb-1">
                                        • {cuota.porcentaje}% {MOMENTOS_PAGO_LABELS[cuota.momento] || cuota.momento}
                                        {cuota.descripcion && <span className="text-slate-400"> ({cuota.descripcion})</span>}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {prop.solo_tc_paralelo && (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs" title="Solo acepta pago en dólares paralelo">
                                💱 TC Paralelo
                              </span>
                            )}
                            {prop.precio_negociable && (
                              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs" title="Precio negociable">
                                🤝 Negociable
                              </span>
                            )}
                            {prop.descuento_contado_pct && prop.descuento_contado_pct > 0 && (
                              <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs" title={`${prop.descuento_contado_pct}% descuento pago contado`}>
                                📉 -{prop.descuento_contado_pct}% contado
                              </span>
                            )}
                          </div>
                        )}

                        {/* Amenities y Equipamiento - Chips colapsables inline */}
                        {(() => {
                          // Amenities de edificio que deben separarse del equipamiento
                          const AMENITIES_EDIFICIO = [
                            'Piscina', 'Piscina infinita', 'Gimnasio', 'Cowork', 'Sala TV/Cine',
                            'Jacuzzi', 'Sauna', 'Seguridad 24h', 'Cámaras seguridad', 'Sala de juegos',
                            'Billar', 'Bar/Lounge', 'Churrasquera', 'Roof garden', 'Lobby/Recepción',
                            'Jardín', 'Parque infantil', 'Canchas deportivas', 'Sala yoga',
                            'Pet friendly', 'Ascensor', 'Salón de eventos'
                          ]

                          // Separar: equipamiento_detectado puede tener amenities mezclados
                          const equipamientoRaw = prop.equipamiento_detectado || []
                          const amenitiesFromEquip = equipamientoRaw.filter(item => AMENITIES_EDIFICIO.includes(item))
                          const equipamientoReal = equipamientoRaw.filter(item => !AMENITIES_EDIFICIO.includes(item))

                          // Combinar amenities confirmados + detectados (sin duplicados)
                          const amenitiesConfirmados = prop.amenities_confirmados || []
                          const allAmenities = [...new Set([...amenitiesConfirmados, ...amenitiesFromEquip])]

                          const hasAmenities = allAmenities.length > 0
                          const hasEquipamiento = equipamientoReal.length > 0

                          if (!hasAmenities && !hasEquipamiento) return null

                          return (
                            <div className="mt-2 space-y-1.5 text-sm">
                              {/* Amenities del edificio */}
                              {hasAmenities && (
                                <div className="flex items-center flex-wrap gap-1">
                                  <span className="text-gray-500 mr-1">🏢</span>
                                  {(() => {
                                    const isExpanded = expandedAmenities.has(`${prop.id}-amenities`)
                                    const visibleCount = 2
                                    const hasMore = allAmenities.length > visibleCount
                                    const displayItems = isExpanded ? allAmenities : allAmenities.slice(0, visibleCount)

                                    return (
                                      <>
                                        {displayItems.map((a, i) => (
                                          <span key={i} className="inline-flex items-center px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs">
                                            {a} ✓
                                          </span>
                                        ))}
                                        {hasMore && (
                                          <button
                                            onClick={() => toggleAmenityExpand(prop.id, 'amenities')}
                                            className="inline-flex items-center px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full text-xs transition-colors"
                                          >
                                            {isExpanded ? '▲' : `+${allAmenities.length - visibleCount} ▼`}
                                          </button>
                                        )}
                                      </>
                                    )
                                  })()}
                                </div>
                              )}
                              {/* Equipamiento del departamento */}
                              {hasEquipamiento && (
                                <div className="flex items-center flex-wrap gap-1">
                                  <span className="text-gray-500 mr-1">🏠</span>
                                  {(() => {
                                    const isExpanded = expandedAmenities.has(`${prop.id}-equipamiento`)
                                    const visibleCount = 2
                                    const hasMore = equipamientoReal.length > visibleCount
                                    const displayItems = isExpanded ? equipamientoReal : equipamientoReal.slice(0, visibleCount)

                                    return (
                                      <>
                                        {displayItems.map((item, i) => (
                                          <span key={i} className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs">
                                            {item}
                                          </span>
                                        ))}
                                        {hasMore && (
                                          <button
                                            onClick={() => toggleAmenityExpand(prop.id, 'equipamiento')}
                                            className="inline-flex items-center px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full text-xs transition-colors"
                                          >
                                            {isExpanded ? '▲' : `+${equipamientoReal.length - visibleCount} ▼`}
                                          </button>
                                        )}
                                      </>
                                    )
                                  })()}
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        {/* Ubicación con link a Maps */}
                        <div className="flex items-center justify-between mt-3 py-2 border-t border-gray-100">
                          <span className="text-sm text-gray-600">
                            📍 {zonaDisplay(prop.microzona || prop.zona)}
                          </span>
                          {prop.latitud && prop.longitud && (
                            <a
                              href={`https://maps.google.com/?q=${prop.latitud},${prop.longitud}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline"
                            >
                              Ver en Maps →
                            </a>
                          )}
                        </div>

                        {/* Badge tiempo inteligente - antes de síntesis */}
                        {prop.dias_en_mercado != null && (() => {
                          const medianaZona = contextoMercado?.metricas_zona?.dias_mediana || 74
                          const badge = getBadgeTiempo(prop.dias_en_mercado, medianaZona)

                          return (
                            <div className="mt-2">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-sm ${badge.color}`}
                                title={badge.tooltip}
                              >
                                {badge.emoji} {badge.label}
                                {badge.accion && (
                                  <span className="ml-1 opacity-80">· {badge.accion}</span>
                                )}
                              </span>
                            </div>
                          )
                        })()}

                        {/* SÍNTESIS FIDUCIARIA - Resumen MOAT integrado */}
                        {(() => {
                          // v2.13: Usar posicion_mercado directamente de la propiedad
                          const posicion = prop.posicion_mercado
                          const metricas = contextoMercado?.metricas_zona
                          const costos = getCostosOcultosEstimados(prop.dormitorios, null, null)

                          // Calcular costo extra potencial (parqueo + baulera si no incluidos)
                          const costoParqueo = Math.round((costos.estacionamiento.compra.min + costos.estacionamiento.compra.max) / 2)
                          const costoBaulera = Math.round((costos.baulera.compra.min + costos.baulera.compra.max) / 2)

                          // IMPORTANTE: Solo usar diferencia_pct si posicion_mercado fue exitosa
                          const tieneComparacionValida = posicion?.success === true
                          const diferenciaPctValida = tieneComparacionValida ? posicion.diferencia_pct : null

                          // Parsear innegociables del usuario
                          const innegociablesArray = innegociables
                            ? (innegociables as string).split(',').filter(Boolean)
                            : []

                          // Combinar amenidades (confirmadas + detectadas)
                          const amenidadesProp = [
                            ...(prop.amenities_confirmados || []),
                            ...(prop.equipamiento_detectado || [])
                          ]

                          // Estado parqueo/baulera: true=tiene, false=no tiene, null=desconocido
                          const tieneParqueoConf = prop.estacionamientos == null
                            ? null
                            : prop.estacionamientos > 0
                          const tieneBauleraConf = prop.baulera == null
                            ? null
                            : prop.baulera === true

                          const sintesis = generarSintesisFiduciaria({
                            diferenciaPct: diferenciaPctValida,
                            diasEnMercado: prop.dias_en_mercado,
                            diasMedianaZona: metricas?.dias_mediana ?? null,
                            diasPromedioZona: metricas?.dias_promedio ?? null,
                            escasez: parseEscasezDeRazon(prop.razon_fiduciaria),
                            estadoConstruccion: prop.estado_construccion || '',
                            innegociablesUsuario: innegociablesArray,
                            amenidadesPropiedad: amenidadesProp,
                            usuarioNecesitaParqueo,
                            usuarioNecesitaBaulera,
                            tieneParqueoConfirmado: tieneParqueoConf,
                            tieneBauleraConfirmada: tieneBauleraConf,
                            costoExtraParqueo: costoParqueo,
                            costoExtraBaulera: costoBaulera
                          })

                          // Colores según tipo
                          const colores = {
                            oportunidad: 'bg-green-50 border-green-200 text-green-800',
                            premium: 'bg-purple-50 border-purple-200 text-purple-800',
                            justo: 'bg-blue-50 border-blue-200 text-blue-800',
                            sospechoso: 'bg-orange-50 border-orange-200 text-orange-800'
                          }

                          const iconos = {
                            oportunidad: '🎯',
                            premium: '⭐',
                            justo: '✓',
                            sospechoso: '⚠️'
                          }

                          return (
                            <div className={`mt-3 px-3 py-2 rounded-lg border ${colores[sintesis.tipo]}`}>
                              <p className="text-sm font-medium">
                                {iconos[sintesis.tipo]} {sintesis.headline}
                              </p>
                              {sintesis.detalles && (
                                <div className="text-xs mt-1 opacity-80 space-y-0.5">
                                  {sintesis.detalles.split('\n').map((linea, i) => (
                                    <p key={i}>{linea}</p>
                                  ))}
                                </div>
                              )}
                              <p className="text-xs mt-2 font-medium border-t border-current/20 pt-1">
                                → {sintesis.accion}
                              </p>
                            </div>
                          )
                        })()}

                        {/* Botón toggle detalles */}
                        <button
                          onClick={() => toggleCardExpanded(prop.id)}
                          className="mt-3 w-full py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center gap-2 transition-colors"
                        >
                          {expandedCards.has(prop.id) ? (
                            <>
                              <span>Ocultar detalles</span>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </>
                          ) : (
                            <>
                              <span>Ver detalles</span>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </>
                          )}
                        </button>

                        {/* Sección colapsable de detalles - Orden MOAT: dinero primero, descripción al final */}
                        {expandedCards.has(prop.id) && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">

                        {/* 1. PRECIO REAL DE COMPRA - Lo más importante */}
                        {(() => {
                          const costos = getCostosOcultosEstimados(prop.dormitorios, null, null)
                          const tieneParqueo = prop.estacionamientos != null && prop.estacionamientos > 0
                          const tieneBaulera = prop.baulera === true
                          const parqueoDesconocido = prop.estacionamientos == null
                          const bauleraDesconocida = prop.baulera == null
                          let costoAdicionalMin = 0
                          let costoAdicionalMax = 0
                          const itemsPendientes: string[] = []

                          // Solo calcular costos para items que el usuario necesita
                          if (usuarioNecesitaParqueo && !tieneParqueo && parqueoDesconocido) {
                            costoAdicionalMin += costos.estacionamiento.compra.min
                            costoAdicionalMax += costos.estacionamiento.compra.max
                            itemsPendientes.push('parqueo')
                          }
                          if (usuarioNecesitaBaulera && !tieneBaulera && bauleraDesconocida) {
                            costoAdicionalMin += costos.baulera.compra.min
                            costoAdicionalMax += costos.baulera.compra.max
                            itemsPendientes.push('baulera')
                          }

                          // "Todo confirmado" solo considera lo que el usuario necesita
                          const parqueoOk = !usuarioNecesitaParqueo || tieneParqueo
                          const bauleraOk = !usuarioNecesitaBaulera || tieneBaulera
                          const todoConfirmado = parqueoOk && bauleraOk

                          // Si no necesita ni parqueo ni baulera, no mostrar esta sección
                          if (!usuarioNecesitaParqueo && !usuarioNecesitaBaulera) {
                            return (
                              <div className="rounded-lg border p-3 bg-green-50 border-green-200">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-semibold text-green-800">✅ Precio completo</span>
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-200 text-green-700">costo único</span>
                                </div>
                                <div className="flex items-start gap-2 text-sm">
                                  <span className="text-green-600 w-4">✓</span>
                                  <span className="text-green-700 font-medium">${formatNum(prop.precio_usd)} = Precio final (no necesitás parqueo ni baulera)</span>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div className={`rounded-lg border p-3 ${todoConfirmado ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-sm font-semibold ${todoConfirmado ? 'text-green-800' : 'text-amber-800'}`}>
                                  {todoConfirmado ? '✅ Precio completo' : '💰 Precio real de compra'}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${todoConfirmado ? 'bg-green-200 text-green-700' : 'bg-amber-200 text-amber-700'}`}>
                                  costo único
                                </span>
                              </div>
                              <div className="space-y-1.5 text-sm">
                                {/* Solo mostrar parqueo si el usuario lo necesita */}
                                {usuarioNecesitaParqueo && (
                                  <div className="flex items-start gap-2">
                                    <span className={`w-4 ${tieneParqueo ? 'text-green-500' : 'text-amber-500'}`}>🚗</span>
                                    <div>
                                      {tieneParqueo ? (
                                        <span className="text-green-700 font-medium">Parqueo: ✓ Incluido ({prop.estacionamientos}p)</span>
                                      ) : (
                                        <>
                                          <span className="text-gray-700">Parqueo: ${formatNum(costos.estacionamiento.compra.min)}-{formatNum(costos.estacionamiento.compra.max)}</span>
                                          <p className="text-xs text-amber-700">{parqueoDesconocido ? 'Preguntá si está incluido' : 'No incluido - costo adicional'}</p>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {/* Solo mostrar baulera si el usuario la necesita */}
                                {usuarioNecesitaBaulera && (
                                  <div className="flex items-start gap-2">
                                    <span className={`w-4 ${tieneBaulera ? 'text-green-500' : 'text-amber-500'}`}>📦</span>
                                    <div>
                                      {tieneBaulera ? (
                                        <span className="text-green-700 font-medium">Baulera: ✓ Incluida</span>
                                      ) : (
                                        <>
                                          <span className="text-gray-700">Baulera: ${formatNum(costos.baulera.compra.min)}-{formatNum(costos.baulera.compra.max)}</span>
                                          <p className="text-xs text-amber-700">{bauleraDesconocida ? 'Preguntá si está incluida' : 'No incluida - costo adicional'}</p>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {itemsPendientes.length > 0 ? (
                                  <div className="flex items-start gap-2 pt-1.5 mt-1 border-t border-amber-200">
                                    <span className="text-amber-600 w-4">💡</span>
                                    <span className="text-amber-700 text-xs font-medium">
                                      Precio real: ${formatNum(prop.precio_usd + costoAdicionalMin)}-{formatNum(prop.precio_usd + costoAdicionalMax)} si no incluye {itemsPendientes.join(' ni ')}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2 pt-1.5 mt-1 border-t border-green-200">
                                    <span className="text-green-600 w-4">✓</span>
                                    <span className="text-green-700 text-xs font-medium">${formatNum(prop.precio_usd)} = Precio real (todo lo que necesitás incluido)</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })()}

                        {/* 2. COSTO MENSUAL DE VIVIR */}
                        {(() => {
                          const costos = getCostosOcultosEstimados(prop.dormitorios, null, null)
                          const expensasMin = costos.expensas.rango_completo.min
                          const expensasMax = costos.expensas.rango_completo.max
                          const expensasPromedio = Math.round((expensasMin + expensasMax) / 2)
                          const impactoAnual = expensasPromedio * 12
                          const impacto5Anos = impactoAnual * 5
                          return (
                            <div className="rounded-lg border p-3 bg-blue-50 border-blue-200">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-semibold text-blue-800">📋 Costo mensual de vivir</span>
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-200 text-blue-700">recurrente</span>
                              </div>
                              <div className="space-y-1.5 text-sm">
                                <div className="flex items-start gap-2">
                                  <span className="text-blue-500 w-4">💵</span>
                                  <div>
                                    <span className="text-gray-700 font-medium">Expensas: ${expensasMin}-{expensasMax}/mes</span>
                                    <p className="text-xs text-blue-700">Preguntá monto exacto al vendedor</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2 pt-1.5 mt-1 border-t border-blue-200">
                                  <span className="text-blue-600 w-4">📊</span>
                                  <div className="text-xs text-blue-700">
                                    <p className="font-medium">Impacto financiero estimado:</p>
                                    <p>~${formatNum(impactoAnual)}/año • ~${formatNum(impacto5Anos)} en 5 años</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })()}

                        {/* 3. ¿PUEDO NEGOCIAR? - Análisis multi-factor */}
                        {(() => {
                          const medianaZona = contextoMercado?.metricas_zona?.dias_mediana || 74
                          const negociacion = calcularPoderNegociacion(prop, medianaZona)
                          const badgeTiempo = prop.dias_en_mercado != null
                            ? getBadgeTiempo(prop.dias_en_mercado, medianaZona)
                            : null

                          const colorPoder = negociacion.poder === 'alto'
                            ? 'bg-green-100 text-green-700'
                            : negociacion.poder === 'moderado'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'

                          return (
                            <div className="bg-white rounded-lg border p-3 shadow-sm">
                              {/* Header con score */}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-gray-500 uppercase">
                                  ¿Puedo negociar?
                                </span>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorPoder}`}>
                                  {negociacion.poder.toUpperCase()} {negociacion.estrellas}
                                </span>
                              </div>

                              {/* Badge tiempo en mercado */}
                              {badgeTiempo && (
                                <div className={`flex items-center justify-between rounded-lg p-2 mb-2 ${badgeTiempo.color}`}>
                                  <span className="text-sm">
                                    {badgeTiempo.emoji} {badgeTiempo.label} ({prop.dias_en_mercado} días)
                                  </span>
                                  {badgeTiempo.accion && (
                                    <span className="text-xs opacity-75">→ {badgeTiempo.accion}</span>
                                  )}
                                </div>
                              )}

                              {/* Factores a favor */}
                              {negociacion.factores.length > 0 ? (
                                <div className="mb-2">
                                  <p className="text-xs text-gray-500 mb-1">Factores a tu favor:</p>
                                  <ul className="space-y-0.5">
                                    {negociacion.factores.map((factor, i) => (
                                      <li key={i} className="text-sm text-gray-700 flex items-start gap-1">
                                        <span className="text-green-600">•</span>
                                        {factor}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500 mb-2">
                                  Sin factores detectados a tu favor.
                                </p>
                              )}

                              {/* Disclaimer si no hay comparables de tipología */}
                              {negociacion.sinComparablesTipologia && (
                                <div className="text-xs text-amber-600 bg-amber-50 rounded p-2 mb-2">
                                  ⚠️ Único {negociacion.tipologia} en edificio. No se puede comparar precio con otras de la misma tipología.
                                </div>
                              )}

                              {/* Disclaimer legal */}
                              <p className="text-xs text-gray-400 italic">
                                ℹ️ Orientación basada en datos públicos. No constituye asesoría financiera.
                              </p>
                            </div>
                          )
                        })()}

                        {/* 4. AMENIDADES - ¿Tiene lo que pedí? */}
                        {(() => {
                          const innegociablesArray = innegociables
                            ? (innegociables as string).split(',').filter(Boolean)
                            : []
                          const amenidadesPedidas = innegociablesToAmenidades(innegociablesArray)
                          const usuarioEligioAmenidades = amenidadesPedidas.length > 0

                          const amenidadesDiferenciadoras = (prop.amenities_confirmados || [])
                            .filter(a => !esAmenidadEstandar(a))
                          const otrasAmenidades = amenidadesDiferenciadoras
                            .filter(a => !amenidadesPedidas.includes(a))
                            .slice(0, 4)

                          if (!amenidadesDiferenciadoras.length && !amenidadesPedidas.length) {
                            return null
                          }

                          // Contar matches
                          const totalPedidas = amenidadesPedidas.length
                          const confirmadas = amenidadesPedidas.filter(a => prop.amenities_confirmados?.includes(a)).length
                          const matchPct = totalPedidas > 0 ? Math.round((confirmadas / totalPedidas) * 100) : 0

                          // Mini barra visual para porcentaje de mercado
                          const MiniBarraPct = ({ pct }: { pct: number }) => {
                            const esRaro = pct < 20
                            const esPocoCom = pct < 40
                            return (
                              <div className="inline-flex items-center gap-1 ml-1">
                                <div className="w-8 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${esPocoCom ? 'bg-purple-400' : 'bg-gray-400'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className={`text-[10px] ${esPocoCom ? 'text-purple-500' : 'text-gray-400'}`}>
                                  {pct}%{esRaro && ' ⭐'}
                                </span>
                              </div>
                            )
                          }

                          return (
                            <div className="rounded-lg border p-3 bg-gray-50 border-gray-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700">✨ Amenidades</span>
                                {usuarioEligioAmenidades && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    matchPct === 100
                                      ? 'bg-green-200 text-green-700'
                                      : matchPct >= 50
                                      ? 'bg-blue-200 text-blue-700'
                                      : 'bg-amber-200 text-amber-700'
                                  }`}>
                                    {confirmadas}/{totalPedidas} pedidas
                                  </span>
                                )}
                              </div>

                              {usuarioEligioAmenidades && (
                                <div className="mb-3">
                                  <p className="text-xs text-gray-500 mb-1.5">Lo que pediste:</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {amenidadesPedidas.map((amenidad, i) => {
                                      const confirmada = prop.amenities_confirmados?.includes(amenidad)
                                      const porVerificar = prop.amenities_por_verificar?.includes(amenidad)
                                      const estado = confirmada ? 'confirmada' : porVerificar ? 'verificar' : 'no_detectado'
                                      return (
                                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                                          estado === 'confirmada'
                                            ? 'bg-green-100 text-green-700'
                                            : estado === 'verificar'
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-red-100 text-red-600'
                                        }`}>
                                          {estado === 'confirmada' ? '✓' : estado === 'verificar' ? '?' : '✗'} {amenidad}
                                        </span>
                                      )
                                    })}
                                  </div>
                                  {amenidadesPedidas.some(a => prop.amenities_por_verificar?.includes(a)) && (
                                    <p className="text-xs text-amber-700 mt-1.5">
                                      💡 Preguntá por {amenidadesPedidas.filter(a => prop.amenities_por_verificar?.includes(a)).join(' y ')}
                                    </p>
                                  )}
                                </div>
                              )}

                              {(otrasAmenidades.length > 0 || (!usuarioEligioAmenidades && amenidadesDiferenciadoras.length > 0)) && (
                                <div>
                                  <p className="text-xs text-gray-500 mb-1.5">
                                    {usuarioEligioAmenidades ? 'Bonus que tiene:' : 'Amenidades destacadas:'}
                                  </p>
                                  <div className="space-y-1">
                                    {(usuarioEligioAmenidades ? otrasAmenidades : amenidadesDiferenciadoras.slice(0, 4)).map((a, i) => {
                                      const pct = getPorcentajeMercado(a)
                                      const esPocoCom = pct && pct < 40
                                      return (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                          <span className={`${esPocoCom ? 'text-purple-700 font-medium' : 'text-gray-700'}`}>
                                            ✓ {a}
                                          </span>
                                          {pct && <MiniBarraPct pct={pct} />}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        {/* 6. EQUIPAMIENTO - ¿Qué incluye el precio? */}
                        {(() => {
                          const mensaje = getMensajeEquipamiento(
                            prop.dormitorios,
                            prop.equipamiento_detectado || []
                          )

                          const colorFondo = {
                            'equipado': 'bg-green-50 border-green-200',
                            'basico': 'bg-amber-50 border-amber-200',
                            'sin_info': 'bg-gray-50 border-gray-200'
                          }[mensaje.tipo]

                          const colorTexto = {
                            'equipado': 'text-green-800',
                            'basico': 'text-amber-800',
                            'sin_info': 'text-gray-700'
                          }[mensaje.tipo]

                          const icono = {
                            'equipado': '✅',
                            'basico': '⚠️',
                            'sin_info': '❓'
                          }[mensaje.tipo]

                          return (
                            <div className={`rounded-lg border p-3 ${colorFondo}`}>
                              <div className="flex items-start gap-2">
                                <span>{icono}</span>
                                <div className="flex-1">
                                  <p className={`font-medium ${colorTexto}`}>
                                    {mensaje.mensaje}
                                  </p>
                                  {mensaje.costoFaltante.max > 0 && (
                                    <p className="text-sm text-gray-600 mt-1">
                                      💰 Equipar faltante: ~${mensaje.costoFaltante.min.toLocaleString()}-{mensaje.costoFaltante.max.toLocaleString()}
                                    </p>
                                  )}
                                  <p className="text-xs text-amber-700 mt-1">
                                    → {mensaje.accion}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-2 italic">
                                    * Valores orientativos basados en precios Santa Cruz 2026
                                  </p>
                                </div>
                              </div>
                            </div>
                          )
                        })()}

                        {/* 7. DESCRIPCIÓN DEL ANUNCIANTE - Solo visible en desarrollo */}
                        {process.env.NODE_ENV !== 'production' && prop.descripcion && (
                          <DescripcionAnunciante descripcion={prop.descripcion} />
                        )}

                        </div>
                        )}
                        {/* Fin sección colapsable */}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Alternativas */}
            {alternativas.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {alternativas.length} ALTERNATIVAS
                </h2>

                <div className="grid gap-3">
                  {alternativas.map(prop => {
                    // Calcular síntesis para badge - v2.13: usar posicion_mercado directamente
                    const posicion = prop.posicion_mercado
                    const metricas = contextoMercado?.metricas_zona
                    const costosAltBadge = getCostosOcultosEstimados(prop.dormitorios, null, null)

                    const tieneComparacionValida = posicion?.success === true
                    const diferenciaPctValida = tieneComparacionValida ? posicion.diferencia_pct : null

                    // Parsear innegociables del usuario
                    const innegociablesAltBadge = innegociables
                      ? (innegociables as string).split(',').filter(Boolean)
                      : []

                    // Combinar amenidades
                    const amenidadesAltBadge = [
                      ...(prop.amenities_confirmados || []),
                      ...(prop.equipamiento_detectado || [])
                    ]

                    // Estado parqueo/baulera
                    const tieneParqueoAltBadge = prop.estacionamientos == null
                      ? null
                      : prop.estacionamientos > 0
                    const tieneBauleraAltBadge = prop.baulera == null
                      ? null
                      : prop.baulera === true

                    const sintesisAlt = generarSintesisFiduciaria({
                      diferenciaPct: diferenciaPctValida,
                      diasEnMercado: prop.dias_en_mercado,
                      diasMedianaZona: metricas?.dias_mediana ?? null,
                      diasPromedioZona: metricas?.dias_promedio ?? null,
                      escasez: parseEscasezDeRazon(prop.razon_fiduciaria),
                      estadoConstruccion: prop.estado_construccion || '',
                      innegociablesUsuario: innegociablesAltBadge,
                      amenidadesPropiedad: amenidadesAltBadge,
                      usuarioNecesitaParqueo,
                      usuarioNecesitaBaulera,
                      tieneParqueoConfirmado: tieneParqueoAltBadge,
                      tieneBauleraConfirmada: tieneBauleraAltBadge,
                      costoExtraParqueo: Math.round((costosAltBadge.estacionamiento.compra.min + costosAltBadge.estacionamiento.compra.max) / 2),
                      costoExtraBaulera: Math.round((costosAltBadge.baulera.compra.min + costosAltBadge.baulera.compra.max) / 2)
                    })

                    // Colores y iconos para badge compacto
                    const badgeColores = {
                      oportunidad: 'bg-green-100 text-green-700 border-green-200',
                      premium: 'bg-purple-100 text-purple-700 border-purple-200',
                      justo: 'bg-blue-100 text-blue-700 border-blue-200',
                      sospechoso: 'bg-orange-100 text-orange-700 border-orange-200'
                    }
                    const badgeIconos = {
                      oportunidad: '🎯',
                      premium: '⭐',
                      justo: '✓',
                      sospechoso: '⚠️'
                    }
                    const badgeTextos = {
                      oportunidad: 'Oportunidad',
                      premium: 'Premium',
                      justo: 'Precio justo',
                      sospechoso: 'Verificar'
                    }

                    return (
                      <div
                        key={prop.id}
                        id={`propiedad-${prop.id}`}
                        className={`bg-white rounded-xl overflow-hidden transition-all duration-300 ${
                          isSelected(prop.id)
                            ? 'ring-2 ring-red-400 shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                            : 'shadow'
                        }`}
                      >
                        {/* Layout vertical - Mobile first */}
                        <div className="flex flex-col">
                          {/* Galería de fotos - Amplia en mobile */}
                          <div
                            className="w-full h-44 bg-gray-200 relative cursor-pointer"
                            onClick={() => openLightbox(prop)}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={(e) => handleTouchEnd(e, prop.id, prop.fotos_urls?.length || 0)}
                          >
                            {prop.fotos_urls && prop.fotos_urls.length > 0 ? (
                              <>
                                <img
                                  src={prop.fotos_urls[getPhotoIndex(prop.id)]}
                                  alt={`${prop.proyecto} - Foto ${getPhotoIndex(prop.id) + 1}`}
                                  className="w-full h-full object-cover"
                                />

                                {/* Botón guardar - sobre la foto */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleSelected(prop.id) }}
                                  className="absolute top-3 left-3 p-2 transition-all"
                                >
                                  <svg
                                    className={`w-6 h-6 transition-all ${
                                      isSelected(prop.id)
                                        ? 'fill-red-500 stroke-red-500'
                                        : 'fill-transparent stroke-white drop-shadow-md hover:stroke-red-400'
                                    }`}
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                  >
                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                  </svg>
                                </button>

                                {/* Navegación fotos - Siempre visible */}
                                {prop.fotos_urls.length > 1 && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); prevPhoto(prop.id, prop.fotos_urls!.length) }}
                                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-base"
                                    >
                                      ‹
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); nextPhoto(prop.id, prop.fotos_urls!.length) }}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-base"
                                    >
                                      ›
                                    </button>
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                                      {getPhotoIndex(prop.id) + 1} / {prop.fotos_urls.length}
                                    </div>
                                  </>
                                )}
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                                📷 Sin foto
                              </div>
                            )}
                          </div>

                          {/* Info - debajo de la foto */}
                          <div className="flex-1 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-bold text-gray-900">
                                  {prop.proyecto}
                                  <span className="ml-2 text-xs text-gray-400 font-normal">#{prop.id}</span>
                                </h3>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-lg font-bold text-gray-900">${formatNum(prop.precio_usd)}</p>
                                <p className="text-sm text-gray-500">${formatNum(prop.precio_m2)}/m²</p>
                              </div>
                            </div>

                            {/* Info línea unificada - mismo formato que TOP 3 */}
                            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-3 text-sm text-gray-600">
                              <span className="font-semibold text-gray-700">Departamento</span>
                              <span>·</span>
                              <span>🛏️ {formatDorms(prop.dormitorios)}</span>
                              {prop.banos != null && (
                                <>
                                  <span>·</span>
                                  <span>🚿 {Math.floor(Number(prop.banos))}b</span>
                                </>
                              )}
                              <span>·</span>
                              <span>📐 {prop.area_m2}m²</span>
                              <span>·</span>
                              {prop.estacionamientos != null && prop.estacionamientos > 0 ? (
                                <span>🚗 {prop.estacionamientos}p</span>
                              ) : (
                                <span className="text-amber-600">🚗 ?</span>
                              )}
                              <span>·</span>
                              {prop.baulera === true ? (
                                <span>📦 ✓</span>
                              ) : (
                                <span className="text-amber-600">📦 ?</span>
                              )}
                              {prop.estado_construccion && prop.estado_construccion !== 'no_especificado' && (
                                <>
                                  <span>·</span>
                                  <span className="text-blue-600 capitalize">{prop.estado_construccion.replace(/_/g, ' ')}</span>
                                </>
                              )}
                            </div>

                            {/* Badges Forma de Pago */}
                            {(prop.plan_pagos_desarrollador || prop.solo_tc_paralelo || prop.precio_negociable || prop.descuento_contado_pct) && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {prop.plan_pagos_desarrollador && (
                                  <div className="relative group">
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs cursor-help">
                                      📅 Plan pagos
                                    </span>
                                    {prop.plan_pagos_cuotas && prop.plan_pagos_cuotas.length > 0 && (
                                      <div className="absolute hidden group-hover:block z-20 bg-white border shadow-lg rounded-lg p-3 w-56 -left-2 top-6">
                                        <p className="text-xs font-semibold text-blue-800 mb-2">📋 Detalle del plan:</p>
                                        {(prop.plan_pagos_cuotas as CuotaPago[]).map((cuota, i) => (
                                          <p key={i} className="text-xs text-slate-600 mb-1">
                                            • {cuota.porcentaje}% {MOMENTOS_PAGO_LABELS[cuota.momento] || cuota.momento}
                                            {cuota.descripcion && <span className="text-slate-400"> ({cuota.descripcion})</span>}
                                          </p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {prop.solo_tc_paralelo && (
                                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs" title="Solo acepta pago en dólares paralelo">
                                    💱 TC Paralelo
                                  </span>
                                )}
                                {prop.precio_negociable && (
                                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs" title="Precio negociable">
                                    🤝 Negociable
                                  </span>
                                )}
                                {prop.descuento_contado_pct && prop.descuento_contado_pct > 0 && (
                                  <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs" title={`${prop.descuento_contado_pct}% descuento pago contado`}>
                                    📉 -{prop.descuento_contado_pct}% contado
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Amenities y Equipamiento compacto - igual que TOP 3 */}
                            {(() => {
                              const AMENITIES_EDIFICIO = [
                                'Piscina', 'Piscina infinita', 'Gimnasio', 'Cowork', 'Sala TV/Cine',
                                'Jacuzzi', 'Sauna', 'Seguridad 24h', 'Cámaras seguridad', 'Sala de juegos',
                                'Billar', 'Bar/Lounge', 'Churrasquera', 'Roof garden', 'Lobby/Recepción',
                                'Jardín', 'Parque infantil', 'Canchas deportivas', 'Sala yoga',
                                'Pet friendly', 'Ascensor', 'Salón de eventos'
                              ]

                              const equipamientoRaw = prop.equipamiento_detectado || []
                              const amenitiesFromEquip = equipamientoRaw.filter(item => AMENITIES_EDIFICIO.includes(item))
                              const equipamientoReal = equipamientoRaw.filter(item => !AMENITIES_EDIFICIO.includes(item))

                              const amenitiesConfirmados = prop.amenities_confirmados || []
                              const allAmenities = [...new Set([...amenitiesConfirmados, ...amenitiesFromEquip])]

                              const hasAmenities = allAmenities.length > 0
                              const hasEquipamiento = equipamientoReal.length > 0

                              if (!hasAmenities && !hasEquipamiento) return null

                              return (
                                <div className="mt-2 space-y-1.5 text-sm">
                                  {hasAmenities && (
                                    <div className="flex items-center flex-wrap gap-1">
                                      <span className="text-gray-500">🏢</span>
                                      {(() => {
                                        const isExpanded = expandedAmenities.has(`${prop.id}-alt-amenities`)
                                        const visibleCount = 2
                                        const hasMore = allAmenities.length > visibleCount
                                        const displayItems = isExpanded ? allAmenities : allAmenities.slice(0, visibleCount)

                                        return (
                                          <>
                                            {displayItems.map((a, i) => (
                                              <span key={i} className="inline-flex items-center px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded text-xs">
                                                {a} ✓
                                              </span>
                                            ))}
                                            {hasMore && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); toggleAmenityExpand(prop.id, 'alt-amenities') }}
                                                className="inline-flex items-center px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs transition-colors"
                                              >
                                                {isExpanded ? '▲' : `+${allAmenities.length - visibleCount} ▼`}
                                              </button>
                                            )}
                                          </>
                                        )
                                      })()}
                                    </div>
                                  )}
                                  {hasEquipamiento && (
                                    <div className="flex items-center flex-wrap gap-1">
                                      <span className="text-gray-500">🏠</span>
                                      {(() => {
                                        const isExpanded = expandedAmenities.has(`${prop.id}-alt-equipamiento`)
                                        const visibleCount = 2
                                        const hasMore = equipamientoReal.length > visibleCount
                                        const displayItems = isExpanded ? equipamientoReal : equipamientoReal.slice(0, visibleCount)

                                        return (
                                          <>
                                            {displayItems.map((item, i) => (
                                              <span key={i} className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs">
                                                {item}
                                              </span>
                                            ))}
                                            {hasMore && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); toggleAmenityExpand(prop.id, 'alt-equipamiento') }}
                                                className="inline-flex items-center px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs transition-colors"
                                              >
                                                {isExpanded ? '▲' : `+${equipamientoReal.length - visibleCount} ▼`}
                                              </button>
                                            )}
                                          </>
                                        )
                                      })()}
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                            {/* Badges en orden: tiempo primero, síntesis al final */}
                            <div className="mt-3 space-y-1.5">
                              {/* Línea 1: Badge tiempo inteligente */}
                              {prop.dias_en_mercado != null && (() => {
                                const medianaZona = metricas?.dias_mediana || 74
                                const badge = getBadgeTiempo(prop.dias_en_mercado, medianaZona)

                                return (
                                  <p className="text-xs text-gray-500">
                                    <span
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${badge.color}`}
                                      title={badge.tooltip}
                                    >
                                      {badge.emoji} {badge.label}
                                    </span>
                                    {badge.accion && (
                                      <span className="ml-1 text-gray-600">· {badge.accion}</span>
                                    )}
                                  </p>
                                )
                              })()}

                              {/* Línea 2: Badge síntesis clickeable + posición edificio */}
                              <div className="flex items-center flex-wrap gap-1.5">
                                <button
                                  onClick={() => toggleCardExpanded(prop.id)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border cursor-pointer hover:opacity-80 transition-opacity ${badgeColores[sintesisAlt.tipo]}`}
                                >
                                  {badgeIconos[sintesisAlt.tipo]} {badgeTextos[sintesisAlt.tipo]}
                                  {posicion?.success && posicion.diferencia_pct != null && (
                                    <span className="opacity-80">
                                      ({posicion.diferencia_pct > 0 ? '+' : ''}{Math.round(posicion.diferencia_pct)}%)
                                    </span>
                                  )}
                                  <svg className={`w-3 h-3 ml-0.5 transition-transform ${expandedCards.has(prop.id) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                {prop.unidades_en_edificio != null && prop.unidades_en_edificio > 1 && prop.posicion_precio_edificio != null && (
                                  <span className="text-xs text-gray-500">
                                    · #{prop.posicion_precio_edificio} de {prop.unidades_en_edificio} en edificio
                                  </span>
                                )}
                              </div>

                              {/* Síntesis fiduciaria expandida - aparece al click en badge */}
                              {expandedCards.has(prop.id) && (() => {
                                // Generar síntesis completa con costos
                                const costosAltExp = getCostosOcultosEstimados(prop.dormitorios, null, null)
                                const costoParqueoAltExp = Math.round((costosAltExp.estacionamiento.compra.min + costosAltExp.estacionamiento.compra.max) / 2)
                                const costoBauleraAltExp = Math.round((costosAltExp.baulera.compra.min + costosAltExp.baulera.compra.max) / 2)

                                // Parsear innegociables del usuario
                                const innegociablesAltExp = innegociables
                                  ? (innegociables as string).split(',').filter(Boolean)
                                  : []

                                // Combinar amenidades
                                const amenidadesAltExp = [
                                  ...(prop.amenities_confirmados || []),
                                  ...(prop.equipamiento_detectado || [])
                                ]

                                // Estado parqueo/baulera
                                const tieneParqueoAltExp = prop.estacionamientos == null
                                  ? null
                                  : prop.estacionamientos > 0
                                const tieneBauleraAltExp = prop.baulera == null
                                  ? null
                                  : prop.baulera === true

                                const sintesisCompleta = generarSintesisFiduciaria({
                                  diferenciaPct: posicion?.success ? posicion.diferencia_pct : null,
                                  diasEnMercado: prop.dias_en_mercado,
                                  diasMedianaZona: contextoMercado?.metricas_zona?.dias_mediana ?? null,
                                  diasPromedioZona: contextoMercado?.metricas_zona?.dias_promedio ?? null,
                                  escasez: parseEscasezDeRazon(prop.razon_fiduciaria),
                                  estadoConstruccion: prop.estado_construccion || '',
                                  innegociablesUsuario: innegociablesAltExp,
                                  amenidadesPropiedad: amenidadesAltExp,
                                  usuarioNecesitaParqueo,
                                  usuarioNecesitaBaulera,
                                  tieneParqueoConfirmado: tieneParqueoAltExp,
                                  tieneBauleraConfirmada: tieneBauleraAltExp,
                                  costoExtraParqueo: costoParqueoAltExp,
                                  costoExtraBaulera: costoBauleraAltExp
                                })

                                const coloresSintesis = {
                                  oportunidad: 'bg-green-50 border-green-200 text-green-800',
                                  premium: 'bg-purple-50 border-purple-200 text-purple-800',
                                  justo: 'bg-blue-50 border-blue-200 text-blue-800',
                                  sospechoso: 'bg-orange-50 border-orange-200 text-orange-800'
                                }

                                const iconosSintesis = {
                                  oportunidad: '🎯',
                                  premium: '⭐',
                                  justo: '✓',
                                  sospechoso: '⚠️'
                                }

                                return (
                                  <div className={`mt-2 px-3 py-2 rounded-lg border ${coloresSintesis[sintesisCompleta.tipo]}`}>
                                    <p className="text-sm font-medium">
                                      {iconosSintesis[sintesisCompleta.tipo]} {sintesisCompleta.headline}
                                    </p>
                                    {sintesisCompleta.detalles && (
                                      <div className="text-xs mt-1 opacity-80 space-y-0.5">
                                        {sintesisCompleta.detalles.split('\n').map((linea, i) => (
                                          <p key={i}>{linea}</p>
                                        ))}
                                      </div>
                                    )}
                                    <p className="text-xs mt-2 font-medium border-t border-current/20 pt-1">
                                      → {sintesisCompleta.accion}
                                    </p>
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Excluidas - resumen simple */}
            {excluidasFiduciarias.length > 0 && (
              <div className="mb-6 px-4 py-3 bg-gray-100 rounded-lg flex items-center gap-3">
                <span className="text-gray-500">ℹ️</span>
                <p className="text-sm text-gray-600">
                  {excluidasFiduciarias.length} propiedades más baratas excluidas (sin fotos, dormitorios incorrectos, datos incompletos)
                </p>
              </div>
            )}

            {/* Contexto de Mercado - MOAT con cards visuales */}
            {contextoMercado && (
              <section className="mb-8">
                <div className="bg-gray-50 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">📊</span>
                    <h2 className="text-lg font-semibold text-gray-900">
                      TU BÚSQUEDA EN CONTEXTO
                    </h2>
                  </div>

                  {(() => {
                    // Calcular métricas MOAT
                    const stockTotal = contextoMercado.stock_total || 0
                    const stockFiltros = contextoMercado.stock_cumple_filtros || 0
                    const coberturaPct = stockTotal > 0 ? Math.round((stockFiltros / stockTotal) * 100) : 0

                    const precioPromedio = contextoMercado.metricas_zona?.precio_promedio || 0
                    const presupuestoUsuario = parseInt(presupuesto as string) || 0
                    const diferenciaPrecio = precioPromedio > 0 && presupuestoUsuario > 0
                      ? Math.round(((presupuestoUsuario - precioPromedio) / precioPromedio) * 100)
                      : null

                    const diasPromedio = contextoMercado.metricas_zona?.dias_promedio || 0

                    // Colores según valores
                    const coberturaColor = coberturaPct >= 50
                      ? 'bg-green-50 border-green-200'
                      : coberturaPct >= 20
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-red-50 border-red-200'
                    const coberturaTextColor = coberturaPct >= 50
                      ? 'text-green-700'
                      : coberturaPct >= 20
                      ? 'text-yellow-700'
                      : 'text-red-700'
                    const coberturaDot = coberturaPct >= 50 ? '🟢' : coberturaPct >= 20 ? '🟡' : '🔴'

                    const velocidadColor = diasPromedio > 180
                      ? 'bg-gray-100 border-gray-300'
                      : diasPromedio >= 60
                      ? 'bg-green-50 border-green-200'
                      : diasPromedio >= 30
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-red-50 border-red-200'
                    const velocidadTextColor = diasPromedio > 180
                      ? 'text-gray-500'
                      : diasPromedio >= 60
                      ? 'text-green-700'
                      : diasPromedio >= 30
                      ? 'text-yellow-700'
                      : 'text-red-700'
                    const velocidadDot = diasPromedio > 180 ? '⚠️' : diasPromedio >= 60 ? '🟢' : diasPromedio >= 30 ? '🟡' : '🔴'

                    // Interpretaciones
                    const coberturaInterpretacion = coberturaPct >= 50
                      ? 'Filtros razonables'
                      : coberturaPct >= 20
                      ? 'Filtros específicos'
                      : 'Filtros muy estrictos'

                    const presupuestoInterpretacion = diferenciaPrecio !== null
                      ? diferenciaPrecio <= -20
                        ? 'Accedés al tercio económico'
                        : diferenciaPrecio <= 0
                        ? 'Rango competitivo'
                        : diferenciaPrecio <= 20
                        ? 'Accedés a opciones premium'
                        : 'Presupuesto amplio'
                      : null

                    const velocidadInterpretacion = diasPromedio > 180
                      ? 'Datos no confiables'
                      : diasPromedio >= 60
                      ? 'Props tardan, hay margen'
                      : diasPromedio >= 30
                      ? 'Velocidad normal'
                      : 'Se venden rápido'

                    // Conclusión final
                    const conclusion = stockFiltros <= 3
                      ? 'Stock limitado. Si algo te gusta, actuá rápido.'
                      : stockFiltros <= 10
                      ? 'Stock moderado. Podés tomarte tiempo para comparar.'
                      : 'Stock amplio. Sé selectivo y negociá.'

                    return (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                          {/* Card Cobertura */}
                          <div className={`rounded-lg border p-4 ${coberturaColor}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span>{coberturaDot}</span>
                              <span className="text-xs font-semibold text-gray-600 uppercase">Cobertura</span>
                            </div>
                            <p className={`text-3xl font-bold ${coberturaTextColor}`}>{coberturaPct}%</p>
                            <p className="text-sm text-gray-600">{stockFiltros} de {stockTotal} props</p>
                            <p className={`text-xs mt-2 ${coberturaTextColor}`}>→ {coberturaInterpretacion}</p>
                          </div>

                          {/* Card Presupuesto */}
                          {diferenciaPrecio !== null && (
                            <div className="rounded-lg border p-4 bg-blue-50 border-blue-200">
                              <div className="flex items-center gap-2 mb-2">
                                <span>💰</span>
                                <span className="text-xs font-semibold text-gray-600 uppercase">Tu Presupuesto</span>
                              </div>
                              <p className="text-3xl font-bold text-blue-700">
                                {diferenciaPrecio > 0 ? '+' : ''}{diferenciaPrecio}%
                              </p>
                              <p className="text-sm text-gray-600">vs ${Math.round(precioPromedio/1000)}k prom</p>
                              <p className="text-xs mt-2 text-blue-700">→ {presupuestoInterpretacion}</p>
                            </div>
                          )}

                          {/* Card Velocidad */}
                          {diasPromedio > 0 && diasPromedio <= 180 && (
                            <div className={`rounded-lg border p-4 ${velocidadColor}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <span>{velocidadDot}</span>
                                <span className="text-xs font-semibold text-gray-600 uppercase">Velocidad</span>
                              </div>
                              <p className={`text-3xl font-bold ${velocidadTextColor}`}>{diasPromedio} días</p>
                              <p className="text-sm text-gray-600">promedio en mercado</p>
                              <p className={`text-xs mt-2 ${velocidadTextColor}`}>→ {velocidadInterpretacion}</p>
                            </div>
                          )}
                          {/* Card Velocidad - datos no confiables */}
                          {diasPromedio > 180 && (
                            <div className="rounded-lg border p-4 bg-gray-100 border-gray-300">
                              <div className="flex items-center gap-2 mb-2">
                                <span>⚠️</span>
                                <span className="text-xs font-semibold text-gray-600 uppercase">Velocidad</span>
                              </div>
                              <p className="text-xl font-bold text-gray-500">+6 meses</p>
                              <p className="text-sm text-gray-500">promedio publicado</p>
                              <p className="text-xs mt-2 text-gray-500">→ Hay props muy antiguas</p>
                            </div>
                          )}
                        </div>

                        {/* Conclusión MOAT */}
                        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">💡 Conclusión:</span> {conclusion}
                          </p>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </section>
            )}

            {/* CTA WhatsApp */}
            <div className="bg-green-600 rounded-xl p-6 text-white text-center">
              <h3 className="text-xl font-bold mb-2">
                ¿Te interesa alguna opcion?
              </h3>
              <p className="text-green-100 mb-4">
                Escribinos por WhatsApp y te ayudamos a coordinar visitas.
              </p>
              <button
                onClick={abrirWhatsApp}
                className="bg-white text-green-600 font-semibold px-6 py-3 rounded-lg hover:bg-green-50 transition-colors inline-flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Quiero que me contacten
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal Ordenar Favoritas - SELECCIÓN SECUENCIAL */}
      {showOrdenarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={() => setShowOrdenarModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Paso 1: ¿Cuál es tu favorita? */}
            {ordenPaso === 1 && propsDisponibles.length > 0 && (
              <>
                <div className="text-center mb-6">
                  <span className="text-4xl mb-3 block">🥇</span>
                  <h2 className="text-xl font-bold text-gray-900">
                    ¿Cuál es tu FAVORITA?
                  </h2>
                  <p className="text-gray-500 mt-2 text-sm">
                    Tocá la que más te interesa
                  </p>
                </div>

                <div className="space-y-3">
                  {propsDisponibles.map(propId => {
                    const prop = propiedades.find(p => p.id === propId)
                    if (!prop) return null
                    return (
                      <button
                        key={propId}
                        onClick={() => seleccionarEnOrden(propId)}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
                      >
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          {prop.fotos_urls && prop.fotos_urls[0] ? (
                            <img src={prop.fotos_urls[0]} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">📷</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 truncate">{prop.proyecto}</p>
                          <p className="text-sm text-gray-500">${formatNum(prop.precio_usd)}</p>
                          <p className="text-xs text-gray-400">{prop.area_m2}m² · {prop.dormitorios} dorm</p>
                        </div>
                        <div className="text-purple-500">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Paso 2: ¿Y entre estas dos? */}
            {ordenPaso === 2 && propsDisponibles.length > 0 && (
              <>
                <div className="text-center mb-6">
                  <span className="text-4xl mb-3 block">🥈</span>
                  <h2 className="text-xl font-bold text-gray-900">
                    ¿Y entre estas dos?
                  </h2>
                  <p className="text-gray-500 mt-2 text-sm">
                    Tocá tu segunda opción
                  </p>
                </div>

                {/* Mostrar #1 elegida */}
                <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-xl">
                  <p className="text-xs text-purple-600 font-medium mb-1">Tu #1:</p>
                  <p className="font-bold text-purple-800">{propiedades.find(p => p.id === orderedProps[0])?.proyecto}</p>
                </div>

                <div className="space-y-3">
                  {propsDisponibles.map(propId => {
                    const prop = propiedades.find(p => p.id === propId)
                    if (!prop) return null
                    return (
                      <button
                        key={propId}
                        onClick={() => seleccionarEnOrden(propId)}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
                      >
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          {prop.fotos_urls && prop.fotos_urls[0] ? (
                            <img src={prop.fotos_urls[0]} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">📷</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 truncate">{prop.proyecto}</p>
                          <p className="text-sm text-gray-500">${formatNum(prop.precio_usd)}</p>
                          <p className="text-xs text-gray-400">{prop.area_m2}m² · {prop.dormitorios} dorm</p>
                        </div>
                        <div className="text-purple-500">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Botón volver */}
                <button
                  onClick={reiniciarOrden}
                  className="w-full mt-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Empezar de nuevo
                </button>
              </>
            )}

            {/* Paso 3: Resumen + ¿Por qué tu #1? */}
            {ordenPaso === 3 && orderedProps.length === 3 && (
              <>
                <div className="text-center mb-6">
                  <span className="text-4xl mb-3 block">✅</span>
                  <h2 className="text-xl font-bold text-gray-900">
                    ¡Listo! Tu orden:
                  </h2>
                </div>

                {/* Resumen visual */}
                <div className="space-y-2 mb-6">
                  {orderedProps.map((propId, index) => {
                    const prop = propiedades.find(p => p.id === propId)
                    if (!prop) return null
                    const medals = ['🥇', '🥈', '🥉']
                    return (
                      <div
                        key={propId}
                        className={`flex items-center gap-3 p-3 rounded-xl ${
                          index === 0 ? 'bg-purple-50 border-2 border-purple-300' : 'bg-gray-50'
                        }`}
                      >
                        <span className="text-2xl">{medals[index]}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold truncate ${index === 0 ? 'text-purple-900' : 'text-gray-700'}`}>
                            {prop.proyecto}
                          </p>
                          <p className="text-xs text-gray-500">${formatNum(prop.precio_usd)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Pregunta: ¿Por qué es tu #1? */}
                <div className="mb-6">
                  <p className="font-medium text-gray-900 mb-3 text-sm">
                    ¿Por qué <span className="text-purple-600">{propiedades.find(p => p.id === orderedProps[0])?.proyecto}</span> es tu #1?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'precio', label: '💰 Precio' },
                      { value: 'ubicacion', label: '📍 Ubicación' },
                      { value: 'amenidades', label: '🏊 Amenidades' },
                      { value: 'intuicion', label: '✨ Intuición' },
                    ].map(option => (
                      <button
                        key={option.value}
                        onClick={() => setRazonFavorita(option.value)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          razonFavorita === option.value
                            ? 'border-purple-500 bg-purple-100 text-purple-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-purple-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Botones */}
                <div className="space-y-2">
                  <button
                    onClick={continuarAPremium}
                    disabled={!razonFavorita}
                    className="w-full py-3 px-6 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Ver Informe Premium →
                  </button>
                  <button
                    onClick={reiniciarOrden}
                    className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cambiar orden
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Premium - Waitlist */}
      {showPremiumModal && !showPremiumExample && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative">
            {/* Close button */}
            <button
              onClick={() => setShowPremiumModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="text-center mb-6">
              <span className="text-4xl mb-2 block">📋</span>
              <h2 className="text-2xl font-bold text-gray-900">
                Informe Fiduciario Premium
              </h2>
              <p className="text-gray-500 mt-2">Próximamente disponible</p>
            </div>

            {/* Benefits */}
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-purple-500 text-lg">✓</span>
                <span className="text-gray-700">Comparador TOP 3 lado a lado</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-purple-500 text-lg">✓</span>
                <span className="text-gray-700">Precio/m² vs promedio de zona</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-purple-500 text-lg">✓</span>
                <span className="text-gray-700">Lo que NO sabemos (transparencia total)</span>
              </div>
            </div>

            {/* Price preview */}
            <div className="text-center mb-6 bg-gray-50 rounded-lg p-4">
              <p className="text-gray-500 text-sm line-through">$49.99 USD</p>
              <p className="text-2xl font-bold text-gray-900">$29.99 <span className="text-sm font-normal text-gray-500">USD</span></p>
              <p className="text-sm text-purple-600 font-medium">Precio de lanzamiento</p>
            </div>

            {/* Waitlist Form */}
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
              <div className="text-purple-600 text-xl mb-2">🎁</div>
              <h4 className="font-bold text-gray-900 mb-1">
                Los primeros 50 lo reciben gratis
              </h4>
              <p className="text-gray-600 text-sm mb-3">
                Dejá tu email y te avisamos cuando esté listo.
              </p>

              {premiumSubmitted ? (
                <div className="text-green-600 text-sm font-medium">
                  ✓ ¡Listo! Te avisamos cuando esté disponible.
                </div>
              ) : (
                <form onSubmit={(e) => {
                  e.preventDefault()
                  if (!premiumEmail) return
                  setPremiumLoading(true)
                  // Guardar en localStorage
                  const waitlist = JSON.parse(localStorage.getItem('premium_waitlist') || '[]')
                  waitlist.push({ email: premiumEmail, timestamp: new Date().toISOString(), desde: 'resultados' })
                  localStorage.setItem('premium_waitlist', JSON.stringify(waitlist))
                  setPremiumSubmitted(true)
                  setPremiumLoading(false)
                }} className="flex gap-2">
                  <input
                    type="email"
                    placeholder="tu@email.com"
                    value={premiumEmail}
                    onChange={(e) => setPremiumEmail(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-purple-500"
                    required
                  />
                  <button
                    type="submit"
                    disabled={premiumLoading}
                    className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors text-sm"
                  >
                    {premiumLoading ? '...' : 'Unirme'}
                  </button>
                </form>
              )}
            </div>

            {/* Ver ejemplo - abre HTML generado por API (con feedback primero para beta) */}
            <button
              onClick={() => {
                setShowPremiumModal(false)
                solicitarInformePremium()
              }}
              disabled={generandoInforme}
              className="w-full py-3 px-6 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {generandoInforme ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generando...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Ver mi Informe
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-400 mt-3">
              🔒 Sin compromiso · Te avisamos por email
            </p>
          </div>
        </div>
      )}

      {/* Barra flotante inferior - SIEMPRE VISIBLE con progreso */}
      {!loading && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg safe-area-pb">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              {/* Lado izquierdo - Progreso */}
              <div className="flex items-center gap-3 flex-1">
                {selectedProps.size > 0 ? (
                  <>
                    {/* Thumbnails de propiedades seleccionadas */}
                    <div className="flex -space-x-2">
                      {getSelectedProperties().slice(0, 3).map((prop, i) => (
                        <div
                          key={prop.id}
                          className="w-10 h-10 rounded-full border-2 border-white bg-gray-200 overflow-hidden"
                          style={{ zIndex: 3 - i }}
                        >
                          {prop.fotos_urls && prop.fotos_urls[0] ? (
                            <img src={prop.fotos_urls[0]} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">📷</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {selectedProps.size}/3 seleccionadas
                      </p>
                      <p className="text-xs text-gray-500">
                        {selectedProps.size < 3 ? `Elegí ${3 - selectedProps.size} más` : '✓ Listo para análisis'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Estado vacío - incentivo */}
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="text-xl">❤️</span>
                      <div>
                        <p className="font-medium text-sm">Elegí 3 propiedades</p>
                        <p className="text-xs text-gray-500">para tu análisis fiduciario gratis</p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Lado derecho - Acción */}
              <div className="flex items-center gap-2">
                {selectedProps.size > 0 && (
                  <button
                    onClick={() => setSelectedProps(new Set())}
                    className="text-sm text-gray-400 hover:text-gray-600 px-2"
                  >
                    ✕
                  </button>
                )}
                <button
                  onClick={selectedProps.size >= 3 ? iniciarOrdenar : undefined}
                  disabled={selectedProps.size < 3}
                  className={`font-semibold px-4 py-2 rounded-lg text-sm transition-colors ${
                    selectedProps.size >= 3
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {selectedProps.size >= 3 ? 'Ver Análisis →' : `${selectedProps.size}/3`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast MOAT - Límite de selección alcanzado */}
      {showLimitToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-gray-900 text-white px-5 py-4 rounded-xl shadow-xl max-w-sm relative">
            <button
              onClick={() => setShowLimitToast(false)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <p className="font-semibold text-sm mb-1 pr-6">¿Por qué solo 3?</p>
            <p className="text-xs text-gray-300 leading-relaxed">
              Más opciones = peores decisiones. Con 3 propiedades analizamos cada detalle a fondo: costos ocultos, historial de precios, y riesgos reales.
              <span className="block mt-2 text-purple-300">El premium ya incluye +10 alternativas como contexto comparativo.</span>
            </p>
            <p className="text-xs text-gray-400 mt-2">Quitá una para agregar esta →</p>
          </div>
        </div>
      )}

      {/* Modal Ejemplo Premium (PremiumModal real) - con filtros del usuario */}
      {/* Key incluye filterRefreshKey + orden del usuario para forzar re-mount */}
      {showPremiumExample && (
        <PremiumModal
          key={`premium-${filterRefreshKey}-${presupuesto}-${dormitorios}-${zonas}-${estado_entrega}-${innegociables}-${orderedProps.join(',')}-${razonFavorita}`}
          onClose={() => {
            setShowPremiumExample(false)
            setShowPremiumModal(false)
          }}
          filtros={{
            presupuesto: presupuesto ? parseInt(presupuesto as string) : undefined,
            dormitorios: dormitorios ? parseInt(dormitorios as string) : undefined,
            zonas: zonas ? (zonas as string).split(',').filter(Boolean) : undefined,
            estado_entrega: (estado_entrega as string) || undefined,
            // Filtros MOAT para ordenamiento consistente
            innegociables: innegociables ? (innegociables as string).split(',').filter(Boolean) : undefined,
            deseables: deseables ? (deseables as string).split(',').filter(Boolean) : undefined,
            ubicacion_vs_metros: ubicacion_vs_metros ? parseInt(ubicacion_vs_metros as string) : undefined,
            calidad_vs_precio: calidad_vs_precio ? parseInt(calidad_vs_precio as string) : undefined,
            amenidades_vs_metros: amenidades_vs_metros ? parseInt(amenidades_vs_metros as string) : undefined
          }}
          propiedadesSeleccionadas={orderedProps.length > 0 ? getOrderedSelectedProperties().map(p => ({
            id: p.id,
            proyecto: p.proyecto,
            desarrollador: p.desarrollador,
            zona: p.zona,
            dormitorios: p.dormitorios,
            precio_usd: p.precio_usd,
            precio_m2: p.precio_m2,
            area_m2: p.area_m2,
            fotos_urls: p.fotos_urls || [],
            amenities_lista: p.amenities_lista || [],
            razon_fiduciaria: p.razon_fiduciaria,
            posicion_mercado: p.posicion_mercado ? {
              diferencia_pct: p.posicion_mercado.diferencia_pct,
              categoria: p.posicion_mercado.categoria
            } : null,
            sintesisFiduciaria: getSintesisFiduciaria(p)
          })) : undefined}
          razonFavorita={razonFavorita}
        />
      )}

      {/* Lightbox fullscreen para fotos */}
      {lightboxOpen && lightboxProp && lightboxProp.fotos_urls && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Botón cerrar */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center text-2xl"
          >
            ✕
          </button>

          {/* Contador de fotos */}
          <div className="absolute top-4 left-4 z-10 bg-black/50 text-white text-sm px-3 py-1 rounded-full">
            {getPhotoIndex(lightboxProp.id) + 1} / {lightboxProp.fotos_urls.length}
          </div>

          {/* Nombre del proyecto */}
          <div className="absolute bottom-4 left-4 right-4 z-10 text-center">
            <p className="text-white font-semibold text-lg">{lightboxProp.proyecto}</p>
            <p className="text-white/70 text-sm">${formatNum(lightboxProp.precio_usd)} · {lightboxProp.area_m2}m²</p>
          </div>

          {/* Imagen principal */}
          <div
            className="w-full h-full flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={(e) => handleTouchEnd(e, lightboxProp.id, lightboxProp.fotos_urls!.length)}
          >
            <img
              src={lightboxProp.fotos_urls[getPhotoIndex(lightboxProp.id)]}
              alt={`${lightboxProp.proyecto} - Foto ${getPhotoIndex(lightboxProp.id) + 1}`}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Navegación */}
          {lightboxProp.fotos_urls.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevPhoto(lightboxProp.id, lightboxProp.fotos_urls!.length) }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center text-2xl"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextPhoto(lightboxProp.id, lightboxProp.fotos_urls!.length) }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center text-2xl"
              >
                ›
              </button>
            </>
          )}

          {/* Instrucción swipe (solo mobile) */}
          <p className="absolute bottom-20 left-0 right-0 text-center text-white/50 text-xs md:hidden">
            ← Deslizá para ver más fotos →
          </p>
        </div>
      )}

      {/* Botón flotante Mapa - bottom-24 para no sobrelapar barra de seleccionadas */}
      {propiedadesOrdenadas.some(p => p.latitud && p.longitud) && !showMapa && !lightboxOpen && !showPremiumExample && (
        <button
          onClick={() => setShowMapa(true)}
          className="fixed bottom-24 right-4 z-40 bg-white shadow-lg rounded-full px-4 py-3 flex items-center gap-2 border border-gray-200 hover:shadow-xl transition-shadow"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span className="text-sm font-medium text-gray-700">Ver mapa</span>
        </button>
      )}

      {/* Mapa de resultados fullscreen */}
      {showMapa && (
        <MapaResultados
          propiedades={propiedadesOrdenadas.map(p => ({
            id: p.id,
            proyecto: p.proyecto,
            precio_usd: p.precio_usd,
            dormitorios: p.dormitorios,
            area_m2: p.area_m2,
            latitud: p.latitud,
            longitud: p.longitud,
            fotos_urls: p.fotos_urls || [],
            diferencia_pct: p.posicion_mercado?.diferencia_pct ?? null,
            categoria_precio: p.posicion_mercado?.categoria ?? null,
            sintesisFiduciaria: (() => {
              try {
                return getSintesisFiduciaria(p)
              } catch (e) {
                console.error('Error en síntesis para prop', p.id, p.proyecto, e)
                return null
              }
            })()
          }))}
          selectedIds={selectedProps}
          maxSelected={MAX_SELECTED}
          onClose={() => setShowMapa(false)}
          onToggleSelected={toggleSelected}
          cantidadDestacadas={cantidadTotal}
          modoExploracion={cantidad_resultados === 'todas'}
        />
      )}

      {/* Modal WhatsApp Listo (después de registrar contacto) */}
      {whatsappReady && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Mensaje listo
            </h3>
            <p className="text-gray-600 mb-1">
              Para <span className="font-medium">{whatsappReady.brokerNombre}</span>
            </p>
            <p className="text-sm text-gray-500 mb-4">
              {whatsappReady.proyectoNombre}
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-600">Tu codigo de referencia</p>
              <p className="text-xl font-bold text-blue-700">#{whatsappReady.codigoRef}</p>
            </div>
            <a
              href={whatsappReady.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setWhatsappReady(null)}
              className="block w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors mb-3"
            >
              Abrir WhatsApp
            </a>
            <button
              onClick={() => setWhatsappReady(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Modal Feedback Beta (antes de ver informe premium) */}
      <FeedbackPremiumModal
        isOpen={showFeedbackModal}
        onClose={() => {
          setShowFeedbackModal(false)
          setPropsParaInformeTemp(undefined)
        }}
        onSuccess={handleFeedbackSuccess}
        formularioRaw={{
          presupuesto: presupuesto ? parseInt(presupuesto as string) : 150000,
          dormitorios: dormitorios ? parseInt(dormitorios as string) : null,
          zonas: zonas ? (zonas as string).split(',').filter(Boolean) : [],
          estado_entrega: estado_entrega as string,
          innegociables: innegociables ? (innegociables as string).split(',').filter(Boolean) : [],
          necesita_parqueo: usuarioNecesitaParqueo,
          necesita_baulera: usuarioNecesitaBaulera,
          mascotas: mascotas === 'si' || mascotas === 'true'
        }}
      />

      {/* Modal Contactar Broker desde Informe Premium */}
      {showContactarBrokerModal && contactarBrokerData && (
        <ContactarBrokerModal
          isOpen={showContactarBrokerModal}
          onClose={() => {
            setShowContactarBrokerModal(false)
            setContactarBrokerData(null)
          }}
          propiedadId={contactarBrokerData.propiedadId}
          posicionTop3={contactarBrokerData.posicionTop3}
          proyectoNombre={contactarBrokerData.proyectoNombre}
          precioUsd={contactarBrokerData.precioUsd}
          estadoConstruccion={contactarBrokerData.estadoConstruccion}
          diasEnMercado={contactarBrokerData.diasEnMercado}
          brokerNombre={contactarBrokerData.brokerNombre}
          brokerWhatsapp={contactarBrokerData.brokerWhatsapp}
          brokerInmobiliaria={contactarBrokerData.brokerInmobiliaria}
          necesitaParqueo={usuarioNecesitaParqueo}
          necesitaBaulera={usuarioNecesitaBaulera}
          tieneMascotas={mascotas === 'si' || mascotas === 'true'}
          innegociables={innegociables ? (innegociables as string).split(',').filter(Boolean) : []}
          tieneParqueo={contactarBrokerData.tieneParqueo}
          tieneBaulera={contactarBrokerData.tieneBaulera}
          petFriendlyConfirmado={contactarBrokerData.petFriendlyConfirmado}
        />
      )}

      {/* Modal Fullscreen para Informe Premium (evita bloqueo de popups en mobile) */}
      {showInformeModal && informeHtml && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          {/* Header del modal */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold">Simon<span className="text-yellow-300">.</span></span>
              <span className="text-sm opacity-90">Tu Informe Premium</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Botón Descargar PDF - usa la función del informe */}
              <button
                onClick={() => {
                  // Trigger download desde el iframe
                  const iframe = document.getElementById('informe-iframe') as HTMLIFrameElement
                  if (iframe?.contentWindow) {
                    const btn = iframe.contentDocument?.getElementById('btn-descargar-pdf')
                    if (btn) btn.click()
                  }
                }}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                PDF
              </button>
              {/* Botón Cerrar */}
              <button
                onClick={() => {
                  setShowInformeModal(false)
                  setInformeHtml(null)
                }}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
          {/* Iframe con el informe */}
          <iframe
            id="informe-iframe"
            srcDoc={informeHtml}
            className="flex-1 w-full border-0"
            title="Informe Premium"
          />
        </div>
      )}
    </div>
  )
}
