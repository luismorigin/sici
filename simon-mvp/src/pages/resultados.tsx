import { useRouter } from 'next/router'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  buscarUnidadesReales,
  UnidadReal,
  FiltrosBusqueda,
  obtenerAnalisisFiduciario,
  AnalisisMercadoFiduciario,
  OpcionExcluida
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
  // Equipamiento
  equipamiento: string[]
  // Estado
  estadoConstruccion: string
  // Amenidades
  amenidadesConfirmadas: string[]
  amenidadesPorVerificar: string[]
  // Costos
  parqueoTexto: string  // "A veces incluido", "Rara vez incluido", etc.
  baulераTexto: string
  costoExtraPotencial: number | null  // monto si no incluyen parqueo+baulera
}

function generarSintesisFiduciaria(datos: DatosSintesis): SintesisFiduciaria {
  const {
    diferenciaPct,
    diasEnMercado,
    diasMedianaZona,
    diasPromedioZona,
    escasez,
    equipamiento,
    estadoConstruccion,
    amenidadesConfirmadas,
    amenidadesPorVerificar,
    parqueoTexto,
    baulераTexto,
    costoExtraPotencial
  } = datos

  // Umbrales dinámicos (fallback a valores conocidos si no hay datos)
  const umbralSospecha = diasMedianaZona ?? 74
  const umbralFuerte = diasPromedioZona ?? 104

  const dias = diasEnMercado ?? 0
  const diffPct = Math.round(diferenciaPct ?? 0)

  // 1. DETERMINAR TIPO BASE
  let tipo: TipoSintesis = 'justo'
  if (diffPct <= -10) {
    tipo = 'oportunidad'
  } else if (diffPct >= 10) {
    tipo = 'premium'
  }

  // 2. DETECTAR CONTRADICCIONES (oportunidad + mucho tiempo = sospechoso)
  // Si está MUY bajo (>20%) y lleva más que la mediana, es sospechoso
  // Si está moderadamente bajo (10-20%) y lleva más que el promedio, es sospechoso
  if (tipo === 'oportunidad') {
    if (diffPct <= -20 && dias >= umbralSospecha) {
      tipo = 'sospechoso'  // Muy bajo + sobre mediana = sospechoso
    } else if (dias >= umbralFuerte) {
      tipo = 'sospechoso'  // Cualquier oportunidad + sobre promedio = sospechoso
    }
  }

  // 3. CONSTRUIR HEADLINE - Precio + Tiempo integrado
  let headline: string
  const meses = dias > 0 ? Math.round(dias / 30) : 0
  const tiempoCorto = dias <= 30 ? 'publicado reciente' : dias < umbralSospecha ? `${meses} mes${meses > 1 ? 'es' : ''} publicado` : null
  const tiempoLargo = dias >= umbralSospecha ? `${meses} meses publicado` : null

  // Si no tenemos datos de comparación (diferenciaPct era null), mostrar mensaje neutro
  const sinDatosComparacion = diferenciaPct === null

  if (sinDatosComparacion) {
    // No podemos comparar vs mercado - mostrar lo que sabemos
    if (tiempoLargo) {
      headline = `${tiempoLargo} - sin datos de zona para comparar precio`
    } else {
      headline = 'Sin datos de zona para comparar precio'
    }
  } else if (tipo === 'sospechoso') {
    headline = `${Math.abs(diffPct)}% bajo mercado - ${tiempoLargo}`
  } else if (diffPct <= -10) {
    headline = `Oportunidad: ${Math.abs(diffPct)}% bajo mercado`
  } else if (diffPct >= 10) {
    headline = `Premium: ${diffPct}% sobre mercado`
  } else if (diffPct >= -5 && diffPct <= 5) {
    headline = 'Precio de mercado'
  } else if (diffPct < 0) {
    headline = `${Math.abs(diffPct)}% bajo promedio`
  } else {
    headline = `${diffPct}% sobre promedio`
  }

  // 4. CONSTRUIR LÍNEAS DE DETALLE - Cada una toca un aspecto
  const lineas: string[] = []

  // Línea 1: Tiempo + Escasez
  const parteTiempo = tiempoCorto ? `${tiempoCorto}` : (tiempoLargo && tipo !== 'sospechoso') ? tiempoLargo : null
  const parteEscasez = escasez && escasez <= 5
    ? (escasez === 1 ? 'única opción similar' : `solo ${escasez} similares`)
    : null

  if (parteTiempo || parteEscasez) {
    const partes = [parteTiempo, parteEscasez].filter(Boolean)
    lineas.push(partes.join(' • '))
  }

  // Línea 2: Amenidades | Equipamiento - con contexto MOAT
  const tieneAmenConfirmadas = amenidadesConfirmadas.length > 0
  const tieneAmenPorVerificar = amenidadesPorVerificar.length > 0
  const tieneEquipamiento = equipamiento.length > 0

  let lineaAmenEquip = ''

  if (tieneAmenConfirmadas) {
    // Caso A: Hay amenidades confirmadas
    const amenTop = amenidadesConfirmadas.slice(0, 2).map(a => `${a} ✓`).join(', ')
    lineaAmenEquip = amenTop
  } else if (tieneAmenPorVerificar) {
    // Caso B: Solo hay por verificar - dar contexto
    lineaAmenEquip = `Sin amenidades confirmadas (verificar: ${amenidadesPorVerificar.slice(0, 2).join(', ')})`
  } else {
    // Caso C: No hay ninguna amenidad
    lineaAmenEquip = 'Amenidades no especificadas'
  }

  // Agregar equipamiento si hay
  if (tieneEquipamiento) {
    const equipTop = equipamiento.slice(0, 2).join(', ')
    lineaAmenEquip = `${lineaAmenEquip} | ${equipTop}`
  } else if (!tieneAmenConfirmadas && !tieneAmenPorVerificar) {
    // Solo si tampoco hay amenidades, mencionar que no hay equip
    lineaAmenEquip = 'Sin amenidades ni equipamiento especificados'
  }

  lineas.push(lineaAmenEquip)

  // Línea 3: Costos (parqueo + baulera)
  const parqueoCorto = parqueoTexto.toLowerCase().includes('rara') ? 'parqueo rara vez incluido'
    : parqueoTexto.toLowerCase().includes('veces') ? 'parqueo a veces incluido'
    : parqueoTexto.toLowerCase().includes('frecuente') ? 'parqueo frecuente incluido'
    : null
  const baulераCorto = baulераTexto.toLowerCase().includes('rara') ? 'baulera rara vez'
    : baulераTexto.toLowerCase().includes('veces') ? 'baulera a veces'
    : null

  if (parqueoCorto || baulераCorto) {
    const costos = [parqueoCorto, baulераCorto].filter(Boolean).join(', ')
    lineas.push(costos)
  }

  // Línea 4: Costo extra potencial (siempre mostrar si hay)
  if (costoExtraPotencial && costoExtraPotencial > 0) {
    lineas.push(`Costo real: hasta +$${formatNum(costoExtraPotencial)} si no incluyen parqueo/baulera`)
  }

  // Línea 5: Estado construcción
  if (estadoConstruccion === 'preventa') {
    lineas.push('⚠️ Preventa - verificar fecha entrega')
  }

  // 5. GENERAR ACCIÓN según tipo
  let accion: string

  // Caso especial: sin datos de comparación
  if (sinDatosComparacion) {
    accion = 'Pedí datos de otras unidades en la zona para comparar'
  } else {
    switch (tipo) {
      case 'oportunidad':
        if (estadoConstruccion === 'preventa') {
          accion = 'Buen precio - verificá fecha entrega y qué incluye'
        } else if (escasez && escasez <= 2) {
          accion = 'Pocas opciones a este precio - verificá estado real'
        } else {
          accion = 'Buen precio - verificá por qué y el estado real'
        }
        break
      case 'premium':
        accion = '¿Justifica el precio extra vs alternativas?'
        break
      case 'sospechoso':
        accion = 'Precio atractivo pero investigá por qué no se vendió'
        break
      default: // justo
        accion = 'Sin urgencia - tomá tu tiempo para comparar'
    }
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
  const MAX_LENGTH = 150

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
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gray-500">📝</span>
        <span className="text-sm font-medium text-gray-700">Descripción del anunciante</span>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">
        {textoMostrar}
      </p>
      {necesitaTruncado && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 hover:text-blue-800 mt-1 font-medium"
        >
          {expanded ? 'ver menos' : 'ver más'}
        </button>
      )}
    </div>
  )
}

// Helper para formatear números (evita error de hidratación con toLocaleString)
const formatNum = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(num)) return '0'
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
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
  ubicacion_vs_metros: number // 1-5
  calidad_vs_precio: number   // 1-5
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

  // 3. TRADE-OFFS (0 a 20)
  const medianaArea = MEDIANA_AREA_POR_DORMS[prop.dormitorios || 1] || 52
  const medianaPrecioM2 = MEDIANA_PRECIO_M2_POR_ZONA[prop.zona || ''] || MEDIANA_PRECIO_M2_POR_ZONA['default']
  const precioM2 = prop.precio_m2 || (prop.precio_usd / (prop.area_m2 || 1))

  // Trade-off: ubicacion_vs_metros
  // 1-2 = prioriza ubicación (sin boost en MVP)
  // 4-5 = prioriza metros: boost si área > mediana
  if (datosUsuario.ubicacion_vs_metros >= 4) {
    if ((prop.area_m2 || 0) > medianaArea) {
      score += 10
    }
  }

  // Trade-off: calidad_vs_precio (SOLO AMENIDADES - precio ya está en OPORTUNIDAD)
  // 1-2 = prioriza calidad: boost si muchas amenidades
  // 4-5 = prioriza precio: sin boost adicional (ya cubierto en OPORTUNIDAD)
  let calidadBoost = 0
  const totalAmenidades = (prop.amenities_confirmados?.length || 0)
  debugScores.calidad_vs_precio_slider = datosUsuario.calidad_vs_precio
  debugScores.precioM2 = precioM2
  debugScores.medianaPrecioM2 = medianaPrecioM2
  debugScores.totalAmenidades = totalAmenidades

  if (datosUsuario.calidad_vs_precio <= 2 && totalAmenidades >= 5) {
    // Prioriza calidad: bonus por muchas amenidades
    calidadBoost = 10
  }
  score += calidadBoost
  debugScores.calidadBoost = calidadBoost

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
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())
  const [photoIndexes, setPhotoIndexes] = useState<Record<number, number>>({})
  // Contador para forzar refresh del modal cuando cambian filtros
  const [filterRefreshKey, setFilterRefreshKey] = useState(0)

  // Estados para edición inline de filtros
  const [editingFilter, setEditingFilter] = useState<'presupuesto' | 'dormitorios' | 'zonas' | 'estado_entrega' | null>(null)
  const [tempPresupuesto, setTempPresupuesto] = useState<number>(150000)
  const [tempDormitorios, setTempDormitorios] = useState<number | null>(null)
  const [tempZonas, setTempZonas] = useState<string[]>([])
  const [tempEstadoEntrega, setTempEstadoEntrega] = useState<string>('no_importa')

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
    tamano_perro,
    tiempo_buscando,
    estado_emocional,
    quien_decide,
    pareja_alineados,
    ubicacion_vs_metros,
    calidad_vs_precio,
  } = router.query

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
      const data = await buscarUnidadesReales(filtros)
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
          estado_emocional: estado_emocional as string || undefined,
          meses_buscando: tiempo_buscando === 'mas_1_ano' ? 18
            : tiempo_buscando === '6_12_meses' ? 9
            : tiempo_buscando === '3_6_meses' ? 5
            : tiempo_buscando === '1_3_meses' ? 2
            : undefined,
          mascota: mascotas as string || undefined,
          quienes_viven: quienes_viven as string || undefined,
        }
      })

      setAnalisisFiduciario(analisis)
      setLoading(false)
    }

    cargar()
  }, [router.isReady, presupuesto, zonas, dormitorios, estado_entrega, innegociables, tiempo_buscando, estado_emocional, mascotas, quienes_viven])

  // Iniciar edición de un filtro
  const startEditing = (filter: 'presupuesto' | 'dormitorios' | 'zonas' | 'estado_entrega') => {
    if (filter === 'presupuesto') {
      setTempPresupuesto(parseInt(presupuesto as string) || 150000)
    } else if (filter === 'dormitorios') {
      setTempDormitorios(dormitorios ? parseInt(dormitorios as string) : null)
    } else if (filter === 'zonas') {
      setTempZonas(zonas ? (zonas as string).split(',').filter(Boolean) : [])
    } else if (filter === 'estado_entrega') {
      setTempEstadoEntrega((estado_entrega as string) || 'no_importa')
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

    // Preservar innegociables y otros params
    if (innegociables) params.set('innegociables', innegociables as string)

    // estado_entrega: usar temporal si estamos editando, sino preservar actual
    const newEstadoEntrega = editingFilter === 'estado_entrega' ? tempEstadoEntrega : (estado_entrega as string)
    if (newEstadoEntrega && newEstadoEntrega !== 'no_importa') {
      params.set('estado_entrega', newEstadoEntrega)
    }
    if (forma_pago) params.set('forma_pago', forma_pago as string)
    if (deseables) params.set('deseables', deseables as string)
    if (quienes_viven) params.set('quienes_viven', quienes_viven as string)
    if (mascotas) params.set('mascotas', mascotas as string)
    if (tamano_perro) params.set('tamano_perro', tamano_perro as string)
    if (tiempo_buscando) params.set('tiempo_buscando', tiempo_buscando as string)
    if (estado_emocional) params.set('estado_emocional', estado_emocional as string)
    if (quien_decide) params.set('quien_decide', quien_decide as string)
    if (pareja_alineados) params.set('pareja_alineados', pareja_alineados as string)
    if (ubicacion_vs_metros) params.set('ubicacion_vs_metros', ubicacion_vs_metros as string)
    if (calidad_vs_precio) params.set('calidad_vs_precio', calidad_vs_precio as string)

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
  }), [innegociables, deseables, ubicacion_vs_metros, calidad_vs_precio])

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
  const top3 = propiedadesOrdenadas.slice(0, 3)
  const alternativas = propiedadesOrdenadas.slice(3, 13)

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
              href={`/filtros?presupuesto=${presupuesto || 150000}&dormitorios=${dormitorios || ''}&zonas=${zonas || ''}&estado_entrega=${estado_entrega || ''}&forma_pago=${forma_pago || ''}&innegociables=${innegociables || ''}&deseables=${deseables || ''}&quienes_viven=${quienes_viven || ''}&mascotas=${mascotas || ''}&tamano_perro=${tamano_perro || ''}&tiempo_buscando=${tiempo_buscando || ''}&estado_emocional=${estado_emocional || ''}&quien_decide=${quien_decide || ''}&pareja_alineados=${pareja_alineados || ''}&ubicacion_vs_metros=${ubicacion_vs_metros || ''}&calidad_vs_precio=${calidad_vs_precio || ''}`}
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
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Analizando opciones...</p>
          </div>
        ) : (
          <>
            {/* TOP 3 */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🏆</span>
                <h2 className="text-xl font-bold text-gray-900">TUS 3 MEJORES OPCIONES</h2>
              </div>

              <div className="space-y-4">
                {top3.map((prop, idx) => (
                  <div key={prop.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="flex">
                      {/* Carrusel de fotos */}
                      <div className="w-48 h-40 bg-gray-200 flex-shrink-0 relative group">
                        {prop.fotos_urls && prop.fotos_urls.length > 0 ? (
                          <>
                            <img
                              src={prop.fotos_urls[getPhotoIndex(prop.id)]}
                              alt={`${prop.proyecto} - Foto ${getPhotoIndex(prop.id) + 1}`}
                              className="w-full h-full object-cover"
                            />

                            {/* Navegación - solo si hay más de 1 foto */}
                            {prop.fotos_urls.length > 1 && (
                              <>
                                {/* Flecha izquierda */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); prevPhoto(prop.id, prop.fotos_urls!.length) }}
                                  className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ‹
                                </button>

                                {/* Flecha derecha */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); nextPhoto(prop.id, prop.fotos_urls!.length) }}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ›
                                </button>

                                {/* Indicador de fotos */}
                                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                                  {getPhotoIndex(prop.id) + 1} / {prop.fotos_urls.length}
                                </div>
                              </>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            Sin foto
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                              #{idx + 1} Match
                            </span>
                            <h3 className="font-bold text-gray-900 mt-1">{prop.proyecto}</h3>
                            <p className="text-sm text-gray-500">{zonaDisplay(prop.zona)}</p>
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

                        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-3 text-sm text-gray-600">
                          <span className="font-semibold text-gray-800">Departamento</span>
                          <span>·</span>
                          <span>{formatDorms(prop.dormitorios, 'largo')}</span>
                          <span>·</span>
                          {prop.banos != null && (
                            <>
                              <span>{Math.floor(Number(prop.banos))} {Math.floor(Number(prop.banos)) === 1 ? 'baño' : 'baños'}</span>
                              <span>·</span>
                            </>
                          )}
                          <span>{prop.area_m2} m²</span>
                          {prop.estado_construccion && prop.estado_construccion !== 'no_especificado' && (
                            <>
                              <span>·</span>
                              <span className="capitalize">{prop.estado_construccion.replace(/_/g, ' ')}</span>
                            </>
                          )}
                        </div>

                        {/* SÍNTESIS FIDUCIARIA - Resumen MOAT integrado */}
                        {(() => {
                          // v2.13: Usar posicion_mercado directamente de la propiedad
                          const posicion = prop.posicion_mercado
                          const metricas = contextoMercado?.metricas_zona
                          const costos = getCostosOcultosEstimados(prop.dormitorios, null, null)

                          // Calcular costo extra potencial (parqueo + baulera si no incluidos)
                          // Usar promedio de min-max para cada componente
                          const costoParqueo = Math.round((costos.estacionamiento.compra.min + costos.estacionamiento.compra.max) / 2)
                          const costoBaulera = Math.round((costos.baulera.compra.min + costos.baulera.compra.max) / 2)
                          const costoExtra = costoParqueo + costoBaulera

                          // IMPORTANTE: Solo usar diferencia_pct si posicion_mercado fue exitosa
                          // (tiene datos de la zona + tipología para comparar)
                          const tieneComparacionValida = posicion?.success === true
                          const diferenciaPctValida = tieneComparacionValida ? posicion.diferencia_pct : null

                          const sintesis = generarSintesisFiduciaria({
                            diferenciaPct: diferenciaPctValida,
                            diasEnMercado: prop.dias_en_mercado,
                            diasMedianaZona: metricas?.dias_mediana ?? null,
                            diasPromedioZona: metricas?.dias_promedio ?? null,
                            escasez: parseEscasezDeRazon(prop.razon_fiduciaria),
                            equipamiento: prop.equipamiento_detectado || [],
                            estadoConstruccion: prop.estado_construccion || '',
                            amenidadesConfirmadas: prop.amenities_confirmados || [],
                            amenidadesPorVerificar: prop.amenities_por_verificar || [],
                            parqueoTexto: costos.estacionamiento.texto_inclusion || '',
                            baulераTexto: costos.baulera.texto_inclusion || '',
                            costoExtraPotencial: costoExtra
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

                        {/* Sección colapsable de detalles - Orden MOAT */}
                        {expandedCards.has(prop.id) && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">

                        {/* 1. DÍAS EN MERCADO - ¿Puedo negociar? */}
                        {prop.dias_en_mercado != null && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-gray-500">📅</span>
                            <div>
                              <span className="text-gray-700">
                                {prop.dias_en_mercado} días publicado
                                <span className="text-gray-500 text-xs ml-1">(promedio zona: 74)</span>
                              </span>
                              {prop.dias_en_mercado > 60 ? (
                                <>
                                  <p className="text-xs text-gray-600">
                                    Hay margen de negociación
                                  </p>
                                  <p className="text-xs text-amber-700">
                                    Consultá si aceptan ofertas
                                  </p>
                                </>
                              ) : prop.dias_en_mercado > 30 ? (
                                <p className="text-xs text-gray-600">
                                  Tiempo normal en el mercado
                                </p>
                              ) : (
                                <p className="text-xs text-gray-600">
                                  Publicación reciente - precio firme probable
                                </p>
                              )}
                              <p className="text-xs text-gray-400 mt-1">
                                Nota: Promedio Equipetrol 104 días, mediana 74 días.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* 2. COMPARACIÓN EDIFICIO - ¿El precio es justo? */}
                        {prop.unidades_en_edificio != null && prop.unidades_en_edificio > 1 && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-gray-500">🏢</span>
                            <div>
                              {prop.unidades_misma_tipologia != null && prop.unidades_misma_tipologia >= 2 ? (
                                <>
                                  <span className="text-gray-700">
                                    {prop.posicion_en_tipologia === 1
                                      ? `La más barata de ${prop.unidades_misma_tipologia} unidades ${prop.dormitorios === 0 ? 'mono' : `de ${prop.dormitorios}D`}`
                                      : prop.posicion_en_tipologia === prop.unidades_misma_tipologia
                                      ? `La más cara de ${prop.unidades_misma_tipologia} unidades ${prop.dormitorios === 0 ? 'mono' : `de ${prop.dormitorios}D`}`
                                      : `${prop.posicion_en_tipologia}° de ${prop.unidades_misma_tipologia} unidades ${prop.dormitorios === 0 ? 'mono' : `de ${prop.dormitorios}D`}`}
                                  </span>
                                  <p className="text-xs text-gray-500">
                                    Rango {prop.dormitorios === 0 ? 'Mono' : `${prop.dormitorios}D`}: ${formatNum(prop.precio_min_tipologia)} - ${formatNum(prop.precio_max_tipologia)}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    {prop.posicion_en_tipologia === 1
                                      ? '¿Ganga o compromiso? Puede tener algo diferente (piso bajo, sin vista)'
                                      : prop.posicion_en_tipologia === prop.unidades_misma_tipologia
                                      ? '¿Premium real o sobreprecio? Verificá qué la hace especial'
                                      : 'Opción balanceada, menor riesgo'}
                                  </p>
                                  {prop.posicion_en_tipologia === 1 && (
                                    <p className="text-xs text-amber-700">
                                      Preguntá qué la hace más barata
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="text-gray-700">
                                    Única {prop.dormitorios === 0 ? 'mono' : `de ${prop.dormitorios}D`} en este edificio
                                  </span>
                                  <p className="text-xs text-gray-500">
                                    Rango edificio (todas): ${formatNum(prop.precio_min_edificio)} - ${formatNum(prop.precio_max_edificio)}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    No hay otras unidades {prop.dormitorios === 0 ? 'mono' : `de ${prop.dormitorios}D`} para comparar precio
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 3. AMENIDADES - ¿Tiene lo que pedí? */}
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

                          return (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-gray-500">🏊</span>
                              <div>
                                {usuarioEligioAmenidades && (
                                  <>
                                    <p className="text-xs text-gray-500 mb-1">Lo que pediste:</p>
                                    <div className="flex flex-wrap gap-1.5 mb-1">
                                      {amenidadesPedidas.map((amenidad, i) => {
                                        const confirmada = prop.amenities_confirmados?.includes(amenidad)
                                        const porVerificar = prop.amenities_por_verificar?.includes(amenidad)
                                        const estado = confirmada ? 'confirmada' : porVerificar ? 'verificar' : 'no_detectado'
                                        return (
                                          <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                                            estado === 'confirmada'
                                              ? 'bg-green-50 text-green-700 border-green-200'
                                              : estado === 'verificar'
                                              ? 'bg-gray-100 text-gray-600 border-gray-200'
                                              : 'bg-red-50 text-red-600 border-red-200'
                                          }`}>
                                            {estado === 'confirmada' ? '✓' : estado === 'verificar' ? '?' : '✗'} {amenidad}
                                          </span>
                                        )
                                      })}
                                    </div>
                                    {amenidadesPedidas.some(a => prop.amenities_por_verificar?.includes(a)) && (
                                      <p className="text-xs text-amber-700 mb-2">
                                        Preguntá por {amenidadesPedidas.filter(a => prop.amenities_por_verificar?.includes(a)).join(' y ')} antes de visitar
                                      </p>
                                    )}
                                    {amenidadesPedidas.some(a => !prop.amenities_confirmados?.includes(a) && !prop.amenities_por_verificar?.includes(a)) && (
                                      <p className="text-xs text-red-600 mb-2">
                                        No tiene {amenidadesPedidas.filter(a => !prop.amenities_confirmados?.includes(a) && !prop.amenities_por_verificar?.includes(a)).join(' ni ')} confirmado
                                      </p>
                                    )}
                                  </>
                                )}

                                {(otrasAmenidades.length > 0 || (!usuarioEligioAmenidades && amenidadesDiferenciadoras.length > 0)) && (
                                  <>
                                    <p className="text-xs text-gray-500 mb-1">
                                      {usuarioEligioAmenidades ? 'También tiene:' : 'Amenidades destacadas:'}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mb-1">
                                      {(usuarioEligioAmenidades ? otrasAmenidades : amenidadesDiferenciadoras.slice(0, 4)).map((a, i) => {
                                        const pct = getPorcentajeMercado(a)
                                        const destacado = esAmenidadDestacada(a)
                                        return (
                                          <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                                            destacado
                                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                                              : 'bg-green-50 text-green-700 border-green-200'
                                          }`}>
                                            ✓ {a} {pct && <span className="text-gray-400">({pct}%)</span>}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  </>
                                )}

                                <p className="text-xs text-gray-400 mt-1">
                                  % = propiedades del mercado que lo tienen. <span className="text-purple-500">Morado</span> = poco común (&lt;40%).
                                </p>
                              </div>
                            </div>
                          )
                        })()}

                        {/* 4. EQUIPAMIENTO - ¿Qué viene incluido? */}
                        {(() => {
                          const mensaje = getMensajeEquipamiento(
                            prop.dormitorios,
                            prop.equipamiento_detectado || []
                          )

                          return (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-gray-500">🏠</span>
                              <div>
                                <span className={`text-gray-700 ${mensaje.hayDeteccion ? 'font-medium' : ''}`}>
                                  {mensaje.dato}
                                </span>
                                {mensaje.hayDeteccion && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {(prop.equipamiento_detectado || []).map((item, i) => (
                                      <span key={i} className="inline-flex items-center px-2 py-0.5
                                        bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                  {mensaje.costoReferencia}
                                </p>
                                <p className="text-xs text-amber-700">
                                  {mensaje.accion}
                                </p>
                              </div>
                            </div>
                          )
                        })()}

                        {/* 5. COSTOS OCULTOS - ¿Cuál es el costo real? */}
                        {(() => {
                          const costos = getCostosOcultosEstimados(prop.dormitorios, null, null)
                          return (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-semibold text-amber-800">💰 Costos a verificar</span>
                                <span className="text-xs bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded">estimado zona</span>
                              </div>

                              <div className="space-y-1.5 text-sm">
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 w-4">📋</span>
                                  <div>
                                    <span className="text-gray-700">
                                      Expensas: ${costos.expensas.rango_completo.min}-{costos.expensas.rango_completo.max}/mes
                                    </span>
                                    <span className="text-xs text-gray-500 ml-1">
                                      (+${formatNum(costos.expensas.impacto_anual_completo.min)}-{formatNum(costos.expensas.impacto_anual_completo.max)}/año)
                                    </span>
                                    <p className="text-xs text-amber-700">
                                      Preguntá qué incluyen y el monto exacto
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 w-4">🚗</span>
                                  <div>
                                    <span className="text-gray-700">
                                      Parqueo: ${formatNum(costos.estacionamiento.compra.min)}-{formatNum(costos.estacionamiento.compra.max)}
                                    </span>
                                    <span className="text-xs text-gray-500 ml-1">
                                      ({costos.estacionamiento.texto_inclusion})
                                    </span>
                                    <p className="text-xs text-amber-700">
                                      Preguntá si está incluido en el precio
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 w-4">📦</span>
                                  <div>
                                    <span className="text-gray-700">
                                      Baulera: ${formatNum(costos.baulera.compra.min)}-{formatNum(costos.baulera.compra.max)}
                                    </span>
                                    <span className="text-xs text-gray-500 ml-1">
                                      ({costos.baulera.texto_inclusion})
                                    </span>
                                    <p className="text-xs text-amber-700">
                                      Preguntá si está incluida en el precio
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-2 pt-1.5 mt-1 border-t border-amber-200">
                                  <span className="text-amber-600 w-4">💡</span>
                                  <span className="text-amber-700 text-xs font-medium">
                                    Costo real puede ser ${formatNum(prop.precio_usd + costos.estacionamiento.compra.min + costos.baulera.compra.min)}-{formatNum(prop.precio_usd + costos.estacionamiento.compra.max + costos.baulera.compra.max)} si no incluyen parqueo ni baulera
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })()}

                        {/* 6. DESCRIPCIÓN DEL ANUNCIANTE - Info cruda (menos MOAT) */}
                        {prop.descripcion && (
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

                    const tieneComparacionValida = posicion?.success === true
                    const diferenciaPctValida = tieneComparacionValida ? posicion.diferencia_pct : null

                    const sintesisAlt = generarSintesisFiduciaria({
                      diferenciaPct: diferenciaPctValida,
                      diasEnMercado: prop.dias_en_mercado,
                      diasMedianaZona: metricas?.dias_mediana ?? null,
                      diasPromedioZona: metricas?.dias_promedio ?? null,
                      escasez: parseEscasezDeRazon(prop.razon_fiduciaria),
                      equipamiento: prop.equipamiento_detectado || [],
                      estadoConstruccion: prop.estado_construccion || '',
                      amenidadesConfirmadas: prop.amenities_confirmados || [],
                      amenidadesPorVerificar: prop.amenities_por_verificar || [],
                      parqueoTexto: '',
                      baulераTexto: '',
                      costoExtraPotencial: null
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
                      <div key={prop.id} className="bg-white rounded-lg shadow p-4">
                        <div className="flex items-start gap-4">
                          {/* Carrusel de fotos - alternativas */}
                          <div className="w-24 h-20 bg-gray-200 rounded flex-shrink-0 relative group">
                            {prop.fotos_urls && prop.fotos_urls.length > 0 ? (
                              <>
                                <img
                                  src={prop.fotos_urls[getPhotoIndex(prop.id)]}
                                  alt={`${prop.proyecto} - Foto ${getPhotoIndex(prop.id) + 1}`}
                                  className="w-full h-full object-cover rounded"
                                />

                                {/* Navegación - solo si hay más de 1 foto */}
                                {prop.fotos_urls.length > 1 && (
                                  <>
                                    {/* Flechas */}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); prevPhoto(prop.id, prop.fotos_urls!.length) }}
                                      className="absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      ‹
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); nextPhoto(prop.id, prop.fotos_urls!.length) }}
                                      className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      ›
                                    </button>

                                    {/* Contador compacto */}
                                    <div className="absolute bottom-0.5 right-0.5 bg-black/50 text-white text-[10px] px-1 rounded">
                                      {getPhotoIndex(prop.id) + 1}/{prop.fotos_urls.length}
                                    </div>
                                  </>
                                )}
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                Sin foto
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-medium text-gray-900">{prop.proyecto}</h3>
                                <p className="text-xs text-gray-500">{zonaDisplay(prop.zona)}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-bold text-gray-900">${formatNum(prop.precio_usd)}</p>
                                <p className="text-xs text-gray-500">${formatNum(prop.precio_m2)}/m²</p>
                              </div>
                            </div>

                            {/* Info línea: Departamento · dorms · baños · área · estado */}
                            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-2 text-xs text-gray-600">
                              <span className="font-semibold text-gray-700">Departamento</span>
                              <span>·</span>
                              <span>{formatDorms(prop.dormitorios)}</span>
                              {prop.banos != null && (
                                <>
                                  <span>·</span>
                                  <span>{Math.floor(Number(prop.banos))} {Math.floor(Number(prop.banos)) === 1 ? 'baño' : 'baños'}</span>
                                </>
                              )}
                              <span>·</span>
                              <span>{prop.area_m2} m²</span>
                              {prop.estado_construccion && prop.estado_construccion !== 'no_especificado' && (
                                <>
                                  <span>·</span>
                                  <span className="capitalize">{prop.estado_construccion.replace(/_/g, ' ')}</span>
                                </>
                              )}
                            </div>

                            {/* Badge síntesis clickeable - Click para expandir */}
                            <div className="mt-2 space-y-1">
                              {/* Línea 1: Badge clickeable + posición edificio */}
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
                              {/* Línea 2: Tiempo + acción si aplica */}
                              {prop.dias_en_mercado != null && (
                                <p className="text-xs text-gray-500">
                                  {prop.dias_en_mercado > 60 ? (
                                    <>
                                      {Math.round(prop.dias_en_mercado / 30)} meses publicado · <span className="text-amber-600">consultá si aceptan ofertas</span>
                                    </>
                                  ) : prop.dias_en_mercado > 30 ? (
                                    <>{Math.round(prop.dias_en_mercado / 30)} mes publicado</>
                                  ) : (
                                    <>{prop.dias_en_mercado} días publicado · precio firme probable</>
                                  )}
                                </p>
                              )}

                              {/* Síntesis fiduciaria expandida - aparece al click en badge */}
                              {expandedCards.has(prop.id) && (() => {
                                // Generar síntesis completa con costos
                                const costosAlt = getCostosOcultosEstimados(prop.dormitorios, null, null)
                                const costoParqueoAlt = Math.round((costosAlt.estacionamiento.compra.min + costosAlt.estacionamiento.compra.max) / 2)
                                const costoBauleraAlt = Math.round((costosAlt.baulera.compra.min + costosAlt.baulera.compra.max) / 2)
                                const costoExtraAlt = costoParqueoAlt + costoBauleraAlt

                                const sintesisCompleta = generarSintesisFiduciaria({
                                  diferenciaPct: posicion?.success ? posicion.diferencia_pct : null,
                                  diasEnMercado: prop.dias_en_mercado,
                                  diasMedianaZona: contextoMercado?.metricas_zona?.dias_mediana ?? null,
                                  diasPromedioZona: contextoMercado?.metricas_zona?.dias_promedio ?? null,
                                  escasez: parseEscasezDeRazon(prop.razon_fiduciaria),
                                  equipamiento: prop.equipamiento_detectado || [],
                                  estadoConstruccion: prop.estado_construccion || '',
                                  amenidadesConfirmadas: prop.amenities_confirmados || [],
                                  amenidadesPorVerificar: prop.amenities_por_verificar || [],
                                  parqueoTexto: costosAlt.estacionamiento.texto_inclusion || '',
                                  baulераTexto: costosAlt.baulera.texto_inclusion || '',
                                  costoExtraPotencial: costoExtraAlt
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

            {/* Upsell Premium - después de contexto */}
            <section className="mb-8">
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <span className="text-3xl">📋</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 mb-1">
                      ¿Necesitás decidir con más datos?
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">
                      El Informe Premium incluye comparador lado a lado, márgenes de negociación estimados, y checklist de preguntas para cada propiedad.
                    </p>
                    <button
                      onClick={() => setShowPremiumModal(true)}
                      className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors text-sm"
                    >
                      Ver Informe Premium
                    </button>
                  </div>
                </div>
              </div>
            </section>

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

            {/* Ver ejemplo */}
            <button
              onClick={() => setShowPremiumExample(true)}
              className="w-full py-3 px-6 border border-purple-300 text-purple-700 font-medium rounded-lg hover:bg-purple-50 transition-colors text-sm"
            >
              Ver Ejemplo Real
            </button>

            <p className="text-center text-xs text-gray-400 mt-3">
              🔒 Sin compromiso · Te avisamos por email
            </p>
          </div>
        </div>
      )}

      {/* Modal Ejemplo Premium (PremiumModal real) - con filtros del usuario */}
      {/* Key incluye filterRefreshKey para forzar re-mount cuando cambian filtros */}
      {showPremiumExample && (
        <PremiumModal
          key={`premium-${filterRefreshKey}-${presupuesto}-${dormitorios}-${zonas}-${estado_entrega}-${innegociables}`}
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
            calidad_vs_precio: calidad_vs_precio ? parseInt(calidad_vs_precio as string) : undefined
          }}
        />
      )}
    </div>
  )
}
