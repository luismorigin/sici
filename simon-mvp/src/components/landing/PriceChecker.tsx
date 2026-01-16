'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { buscarUnidadesReales, convertirZona, type UnidadReal } from '@/lib/supabase'
import {
  getEstacionamientoEstimado,
  getBauleraEstimada,
  getCostosOcultosEstimados,
  getExpensasEstimadas,
  EXPENSAS
} from '@/config/estimados-mercado'
import Link from 'next/link'

// Opciones de zona (simplificado de FilterBar)
const ZONAS = [
  { id: 'equipetrol', label: 'Equipetrol Centro' },
  { id: 'sirari', label: 'Sirari' },
  { id: 'equipetrol_norte', label: 'Equipetrol Norte' },
  { id: 'villa_brigida', label: 'Villa Brigida' },
  { id: 'faremafu', label: 'Equipetrol Oeste' },
]

const DORMITORIOS = [
  { value: 0, label: 'Mono' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3+' },
]

// ========== PREGUNTAS CALIFICADORAS v2 ==========

const TIPO_EDIFICIO = [
  {
    value: 'premium' as const,
    label: 'Premium',
    desc: 'Piscina, gym, seguridad 24h, lobby con recepcion',
    minAmenities: 3
  },
  {
    value: 'standard' as const,
    label: 'Standard',
    desc: 'Ascensor, areas comunes, estacionamiento',
    minAmenities: 1
  },
  {
    value: 'basico' as const,
    label: 'Basico / No se',
    desc: 'Sin amenities o no conozco el edificio',
    minAmenities: 0
  }
]

const ESTADO_ENTREGA = [
  { value: 'inmediata' as const, label: 'Lista para entregar', filtros: ['entrega_inmediata', 'nuevo_a_estrenar', 'usado'] },
  { value: 'preventa' as const, label: 'Preventa (6-24 meses)', filtros: ['preventa', 'construccion', 'planos'] }
]

const AMENITIES_CLAVE = [
  { id: 'piscina', label: 'Piscina' },
  { id: 'gym', label: 'Gimnasio' },
  { id: 'salon_eventos', label: 'Salon de eventos' },
  { id: 'seguridad', label: 'Seguridad 24h' },
  { id: 'estacionamiento', label: 'Estacionamiento' },
  { id: 'areas_verdes', label: 'Areas verdes' }
]

const PREFERENCIA_USUARIO = [
  { value: 'calidad' as const, label: 'Calidad aunque cueste mas', desc: 'Tolero pagar un poco mas por amenities premium' },
  { value: 'balance' as const, label: 'Balance calidad/precio', desc: 'Quiero lo mejor posible por mi presupuesto' },
  { value: 'precio' as const, label: 'Mejor precio posible', desc: 'Busco la opcion mas economica' }
]

// Umbrales dinamicos segun preferencia del usuario
const UMBRALES = {
  calidad: {
    oportunidad: -10,
    buen_precio: 0,
    justo_max: 15,
    sobre_max: 25
  },
  balance: {
    oportunidad: -15,
    buen_precio: -5,
    justo_max: 5,
    sobre_max: 15
  },
  precio: {
    oportunidad: -20,
    buen_precio: -10,
    justo_max: 0,
    sobre_max: 10
  }
}

// Tipos
type Modo = 'verificar' | 'estimar'
type TipoEdificio = 'premium' | 'standard' | 'basico'
type EstadoEntrega = 'inmediata' | 'preventa'
type PreferenciaUsuario = 'calidad' | 'balance' | 'precio'
type TipoSintesis = 'oportunidad' | 'premium' | 'justo' | 'atractivo'

interface VeredictoProfundo {
  categoria: 'oportunidad' | 'buen_precio' | 'precio_justo' | 'sobre_promedio' | 'premium'
  diferenciaPct: number
  precioM2Usuario: number
  precioM2Promedio: number
  stockDisponible: number
  stockTotal: number
  promedioDiasMercado: number | null
  poderNegociacion: 'alto' | 'medio' | 'bajo'
  alternativasMasBaratas: number
  ahorroEstimado: number
  conclusionAccionable: string
  topAlternativas: UnidadReal[]
  tipoEdificioLabel: string
  estadoEntregaLabel: string
}

interface SintesisFiduciaria {
  headline: string
  detalles: string[]
  accion: string
  tipo: TipoSintesis
}

interface Estimacion {
  // Rango total (con extras)
  rangoMin: number
  rangoMax: number
  precioTipico: number
  precioM2Tipico: number
  // Desglose
  precioBaseMin: number
  precioBaseMax: number
  valorParqueos: number
  valorBaulera: number
  cantParqueos: number
  incluyeBaulera: boolean
  // Contexto
  stockDisponible: number
  stockTotal: number
  tipoEdificioLabel: string
  estadoEntregaLabel: string
  // Sintesis
  sintesis: SintesisFiduciaria
  // Costos estimados (de config)
  costoParqueoUnit: number
  costoBauleraUnit: number
  textoParqueo: string
  textoBaulera: string
  // Expensas
  expensasMin: number
  expensasMax: number
  expensasAnualMin: number
  expensasAnualMax: number
}

// Colores por categoria
const colorCategoria: Record<string, string> = {
  oportunidad: 'text-emerald-600',
  buen_precio: 'text-green-600',
  precio_justo: 'text-amber-600',
  sobre_promedio: 'text-orange-600',
  premium: 'text-red-600',
}

const bgCategoria: Record<string, string> = {
  oportunidad: 'bg-emerald-50 border-emerald-200',
  buen_precio: 'bg-green-50 border-green-200',
  precio_justo: 'bg-amber-50 border-amber-200',
  sobre_promedio: 'bg-orange-50 border-orange-200',
  premium: 'bg-red-50 border-red-200',
}

// Colores sintesis
const coloresSintesis: Record<TipoSintesis, string> = {
  oportunidad: 'bg-green-50 border-green-200 text-green-800',
  atractivo: 'bg-blue-50 border-blue-200 text-blue-800',
  justo: 'bg-slate-50 border-slate-200 text-slate-800',
  premium: 'bg-purple-50 border-purple-200 text-purple-800'
}

const iconosSintesis: Record<TipoSintesis, string> = {
  oportunidad: '🎯',
  atractivo: '✓',
  justo: '📊',
  premium: '⭐'
}

// ========== FUNCIONES DE FILTRADO ==========

function contarAmenitiesClave(amenities: string[]): number {
  const claves = ['piscina', 'gym', 'gimnasio', 'salon', 'seguridad', 'vigilancia', 'porteria']
  return amenities.filter(a =>
    claves.some(k => a.toLowerCase().includes(k))
  ).length
}

function filtrarSimilares(
  todas: UnidadReal[],
  tipoEdificio: TipoEdificio,
  estadoEntrega: EstadoEntrega
): UnidadReal[] {
  const estadoConfig = ESTADO_ENTREGA.find(e => e.value === estadoEntrega)!
  const tipoConfig = TIPO_EDIFICIO.find(t => t.value === tipoEdificio)!

  return todas.filter(prop => {
    const estadoOk = estadoConfig.filtros.some(f =>
      prop.estado_construccion?.toLowerCase().includes(f.toLowerCase())
    )
    const estadoFinal = prop.estado_construccion ? estadoOk : estadoEntrega === 'inmediata'

    const amenities = prop.amenities_confirmados || []
    const countAmenities = contarAmenitiesClave(amenities)

    let tipoOk = true
    if (tipoEdificio === 'premium') {
      tipoOk = countAmenities >= tipoConfig.minAmenities
    } else if (tipoEdificio === 'standard') {
      tipoOk = countAmenities >= 1 && countAmenities < 3
    }

    return estadoFinal && tipoOk
  })
}

function categorizarOferta(
  diferenciaPct: number,
  preferencia: PreferenciaUsuario
): VeredictoProfundo['categoria'] {
  const u = UMBRALES[preferencia]
  if (diferenciaPct <= u.oportunidad) return 'oportunidad'
  if (diferenciaPct <= u.buen_precio) return 'buen_precio'
  if (diferenciaPct <= u.justo_max) return 'precio_justo'
  if (diferenciaPct <= u.sobre_max) return 'sobre_promedio'
  return 'premium'
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

// Helper para obtener superficie típica por dormitorios
function getSuperficieTipica(dorms: number): { min: number; max: number; texto: string; promedio: number } {
  const tipicas: Record<number, { min: number; max: number; texto: string }> = {
    0: { min: 30, max: 45, texto: '30-45 m²' },
    1: { min: 45, max: 65, texto: '45-65 m²' },
    2: { min: 70, max: 100, texto: '70-100 m²' },
    3: { min: 100, max: 180, texto: '100-180 m²' }
  }
  const d = Math.min(Math.max(dorms, 0), 3)
  const data = tipicas[d]
  return { ...data, promedio: Math.round((data.min + data.max) / 2) }
}

// ========== GENERADOR DE SINTESIS FIDUCIARIA ==========

function generarSintesisEstimador(params: {
  tipoEdificio: TipoEdificio
  stockDisponible: number
  cantParqueos: number
  incluyeBaulera: boolean
  textoParqueo: string
  textoBaulera: string
  precioTipico: number
  rangoMin: number
  dormitorios: number
  area: number
  expensasMin: number
  expensasMax: number
  expensasAnualMax: number
}): SintesisFiduciaria {
  const {
    tipoEdificio,
    stockDisponible,
    cantParqueos,
    incluyeBaulera,
    textoParqueo,
    textoBaulera,
    precioTipico,
    rangoMin,
    dormitorios,
    area,
    expensasMin,
    expensasMax,
    expensasAnualMax
  } = params

  const detalles: string[] = []
  let tipo: TipoSintesis = 'justo'
  let headline = ''
  let accion = ''

  // Determinar tipo segun contexto
  const esGrande = area >= 150
  const escasez = stockDisponible <= 5
  const tieneExtras = cantParqueos > 0 || incluyeBaulera

  if (tipoEdificio === 'premium') {
    tipo = 'premium'
    headline = `Premium ${esGrande ? 'de gran metraje' : ''} en Equipetrol`
  } else if (escasez) {
    tipo = 'atractivo'
    headline = `Pocas opciones similares disponibles`
  } else {
    tipo = 'justo'
    headline = `Precio de mercado para ${dormitorios === 3 ? '3+ dorms' : dormitorios + ' dorm'}`
  }

  // Linea 1: Stock/escasez
  if (escasez) {
    detalles.push(`Solo ${stockDisponible} deptos similares (${dormitorios}d, ${esGrande ? '>150m²' : area + 'm²'}) disponibles`)
  } else {
    detalles.push(`${stockDisponible} opciones similares en zona`)
  }

  // Linea 2: Parqueo
  const parqueoLower = textoParqueo.toLowerCase()
  if (parqueoLower.includes('frecuente')) {
    detalles.push(`Parqueo frecuentemente incluido en ${dormitorios}+ dorms`)
  } else if (parqueoLower.includes('veces')) {
    detalles.push(`Parqueo a veces incluido - verificar`)
  } else if (parqueoLower.includes('rara')) {
    detalles.push(`Parqueo rara vez incluido - presupuestar aparte`)
  }

  // Linea 3: Baulera
  const bauleraLower = textoBaulera.toLowerCase()
  if (incluyeBaulera) {
    if (bauleraLower.includes('frecuente')) {
      detalles.push(`Baulera frecuente en esta tipologia`)
    } else {
      detalles.push(`Baulera incluida - no siempre viene`)
    }
  }

  // Linea 4: Expensas estimadas
  detalles.push(`Expensas estimadas: $${expensasMin}-${expensasMax}/mes (~$${expensasAnualMax.toLocaleString()}/año)`)

  // Accion
  const umbralAtractivo = Math.round(rangoMin * 0.95 / 1000) * 1000
  if (tieneExtras) {
    accion = `Si ofrecen <$${umbralAtractivo.toLocaleString()} con parqueo${incluyeBaulera ? '/baulera' : ''} incluido, es atractivo`
  } else {
    accion = `Precio tipico ~$${precioTipico.toLocaleString()} - negociable 5-10%`
  }

  return { headline, detalles, accion, tipo }
}

export default function PriceChecker() {
  // ========== ESTADO DEL WIZARD ==========
  const [modo, setModo] = useState<Modo>('verificar')
  const [paso, setPaso] = useState<0 | 1 | 2 | 3>(0)

  // Paso 1: Datos basicos
  const [zona, setZona] = useState('')
  const [dormitorios, setDormitorios] = useState<number | null>(null)
  const [areaM2, setAreaM2] = useState('')
  const [noSeMetraje, setNoSeMetraje] = useState(false)
  const [precioOferta, setPrecioOferta] = useState('')

  // Paso 1 (modo estimar): Extras incluidos
  const [cantParqueos, setCantParqueos] = useState<number>(0)
  const [incluyeBaulera, setIncluyeBaulera] = useState<boolean | null>(null)

  // Paso 2: Preguntas calificadoras
  const [tipoEdificio, setTipoEdificio] = useState<TipoEdificio | null>(null)
  const [estadoEntrega, setEstadoEntrega] = useState<EstadoEntrega | null>(null)
  const [amenitiesEdificio, setAmenitiesEdificio] = useState<string[]>([])
  const [preferenciaUsuario, setPreferenciaUsuario] = useState<PreferenciaUsuario>('balance')

  // Resultado
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [veredicto, setVeredicto] = useState<VeredictoProfundo | null>(null)
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null)
  const [mostrarAnalisisFiduciario, setMostrarAnalisisFiduciario] = useState(false)

  // Validaciones - permitir noSeMetraje como alternativa a areaM2
  const tieneMetraje = (areaM2 && parseFloat(areaM2) > 0) || (noSeMetraje && dormitorios !== null)

  const formBasicoValidoVerificar = zona && dormitorios !== null && tieneMetraje && precioOferta &&
    parseFloat(precioOferta) > 0

  const formBasicoValidoEstimar = zona && dormitorios !== null && tieneMetraje

  const formBasicoValido = modo === 'verificar' ? formBasicoValidoVerificar : formBasicoValidoEstimar

  // Obtener área efectiva (input o típico)
  const getAreaEfectiva = (): number => {
    if (areaM2 && parseFloat(areaM2) > 0) return parseFloat(areaM2)
    if (noSeMetraje && dormitorios !== null) {
      return getSuperficieTipica(dormitorios).promedio
    }
    return 0
  }
  const formCalificadorasValido = tipoEdificio !== null && estadoEntrega !== null

  const toggleAmenity = (id: string) => {
    setAmenitiesEdificio(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  const handleSeleccionarModo = (m: Modo) => {
    setModo(m)
    setPaso(1)
  }

  // ========== BUSQUEDA CON FALLBACK MEJORADO ==========
  const buscarConFallback = async () => {
    setWarning(null)

    let todas = await buscarUnidadesReales({
      zonas_permitidas: [convertirZona(zona)],
      dormitorios: dormitorios!,
      limite: 100
    })

    if (todas.length < 3) {
      todas = await buscarUnidadesReales({
        zonas_permitidas: [convertirZona(zona)],
        limite: 100
      })
      if (todas.length >= 3) {
        setWarning('Pocos datos exactos. Comparando con edificios similares en la zona.')
      }
    }

    if (todas.length < 3) {
      todas = await buscarUnidadesReales({
        zonas_permitidas: ['equipetrol', 'sirari', 'equipetrol_norte'],
        dormitorios: dormitorios!,
        limite: 100
      })
      if (todas.length >= 3) {
        setWarning('Pocos datos en tu zona. Comparando con todo Equipetrol.')
      }
    }

    return todas
  }

  // ========== HANDLER VERIFICAR ==========
  const handleVerificar = async () => {
    if (!formBasicoValido || !formCalificadorasValido) return

    setLoading(true)
    setError(null)
    setWarning(null)
    setVeredicto(null)
    setEstimacion(null)
    setMostrarAnalisisFiduciario(false)

    try {
      const area = getAreaEfectiva()
      const precio = parseFloat(precioOferta)

      const todas = await buscarConFallback()

      if (todas.length < 3) {
        setError('No hay suficientes datos para esta busqueda. Proba con otra zona.')
        setLoading(false)
        return
      }

      let similares = filtrarSimilares(todas, tipoEdificio!, estadoEntrega!)

      let usandoFallback = false
      if (similares.length < 3) {
        usandoFallback = true
        similares = todas
        setWarning(prev => prev || 'Pocos edificios del tipo seleccionado. Comparando con todos.')
      }

      const precioM2Usuario = precio / area
      const preciosM2 = similares.map(r => r.precio_m2)
      const precioM2Promedio = preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length
      const diferenciaPct = ((precioM2Usuario - precioM2Promedio) / precioM2Promedio) * 100

      const stockDisponible = similares.length
      const stockTotal = todas.length

      const diasValidos = similares.filter(r => r.dias_en_mercado != null)
      const promedioDiasMercado = diasValidos.length > 0
        ? Math.round(diasValidos.reduce((sum, r) => sum + r.dias_en_mercado!, 0) / diasValidos.length)
        : null

      const poderNegociacion: 'alto' | 'medio' | 'bajo' =
        promedioDiasMercado && promedioDiasMercado > 60 ? 'alto'
          : promedioDiasMercado && promedioDiasMercado > 30 ? 'medio' : 'bajo'

      const masBaratas = similares.filter(r => r.precio_usd < precio)
      const alternativasMasBaratas = masBaratas.length

      const masBarataComparable = masBaratas[0]
      const ahorroEstimado = masBarataComparable
        ? precio - masBarataComparable.precio_usd
        : 0

      const categoria = categorizarOferta(diferenciaPct, preferenciaUsuario)

      const tipoLabel = tipoEdificio === 'premium' ? 'edificios premium'
        : tipoEdificio === 'standard' ? 'edificios standard' : 'todos los edificios'
      const estadoLabel = estadoEntrega === 'inmediata' ? 'listos para entregar' : 'en preventa'

      let conclusionAccionable: string
      if (usandoFallback) {
        conclusionAccionable = `Hay pocos ${tipoLabel} ${estadoLabel}. Comparamos con todo el mercado.`
      } else if (diferenciaPct <= -10) {
        conclusionAccionable = `Buen precio para un ${tipoEdificio}. Cerra antes de que lo haga otro.`
      } else if (diferenciaPct <= 5) {
        const negociacion = preferenciaUsuario === 'precio' ? '10-15%' : '5-8%'
        conclusionAccionable = `Precio de mercado para ${tipoLabel}. Podes intentar negociar ${negociacion}.`
      } else if (alternativasMasBaratas > 0) {
        const descuento = Math.round(ahorroEstimado / 1000) * 1000
        conclusionAccionable = `Pedi $${descuento.toLocaleString()} menos. Hay ${alternativasMasBaratas} ${tipoLabel} mas baratos.`
      } else {
        conclusionAccionable = `Precio alto para ${tipoLabel}. Considera edificios standard o negocia fuerte.`
      }

      setPaso(3)
      setVeredicto({
        categoria,
        diferenciaPct,
        precioM2Usuario,
        precioM2Promedio,
        stockDisponible,
        stockTotal,
        promedioDiasMercado,
        poderNegociacion,
        alternativasMasBaratas,
        ahorroEstimado,
        conclusionAccionable,
        topAlternativas: masBaratas.slice(0, 3),
        tipoEdificioLabel: tipoLabel,
        estadoEntregaLabel: estadoLabel
      })

    } catch (err) {
      console.error('Error verificando precio:', err)
      setError('Error al verificar. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  // ========== HANDLER ESTIMAR ==========
  const handleEstimar = async () => {
    if (!formBasicoValido || !formCalificadorasValido) return

    setLoading(true)
    setError(null)
    setWarning(null)
    setVeredicto(null)
    setEstimacion(null)

    try {
      const area = getAreaEfectiva()

      const todas = await buscarConFallback()

      if (todas.length < 3) {
        setError('No hay suficientes datos para estimar. Proba con otra zona.')
        setLoading(false)
        return
      }

      let similares = filtrarSimilares(todas, tipoEdificio!, estadoEntrega!)

      if (similares.length < 3) {
        similares = todas
        setWarning(prev => prev || 'Pocos edificios del tipo seleccionado. Estimando con todos.')
      }

      // Calcular precios escalados
      const preciosEscalados = similares.map(s => s.precio_m2 * area)

      const p25 = percentile(preciosEscalados, 25)
      const p50 = percentile(preciosEscalados, 50)
      const p75 = percentile(preciosEscalados, 75)

      // Obtener costos de extras y expensas
      const costosEstimados = getCostosOcultosEstimados(dormitorios!, cantParqueos === 0 ? null : true, incluyeBaulera)
      const estacionamiento = getEstacionamientoEstimado(dormitorios!)
      const baulera = getBauleraEstimada(dormitorios!)

      // Expensas estimadas según categoría de edificio
      const categoriaExpensas = tipoEdificio === 'premium' ? 'premium' : 'estandar'
      const expensasData = getExpensasEstimadas(dormitorios!, categoriaExpensas)

      const costoParqueoUnit = Math.round((estacionamiento.compra.min + estacionamiento.compra.max) / 2)
      const costoBauleraUnit = Math.round((baulera.compra.min + baulera.compra.max) / 2)

      const valorParqueos = cantParqueos * costoParqueoUnit
      const valorBaulera = incluyeBaulera ? costoBauleraUnit : 0

      // Precio base = precio total - extras
      const precioBaseMin = Math.round((p25 - valorParqueos - valorBaulera) / 1000) * 1000
      const precioBaseMax = Math.round((p75 - valorParqueos - valorBaulera) / 1000) * 1000

      // Rango total
      const rangoMin = Math.round(p25 / 1000) * 1000
      const rangoMax = Math.round(p75 / 1000) * 1000
      const precioTipico = Math.round(p50 / 1000) * 1000

      // Labels
      const tipoLabel = tipoEdificio === 'premium' ? 'edificios premium'
        : tipoEdificio === 'standard' ? 'edificios standard' : 'todos los edificios'
      const estadoLabel = estadoEntrega === 'inmediata' ? 'listos para entregar' : 'en preventa'

      // Generar sintesis
      const sintesis = generarSintesisEstimador({
        tipoEdificio: tipoEdificio!,
        stockDisponible: similares.length,
        cantParqueos,
        incluyeBaulera: incluyeBaulera || false,
        textoParqueo: estacionamiento.texto_inclusion,
        textoBaulera: baulera.texto_inclusion,
        precioTipico,
        rangoMin,
        dormitorios: dormitorios!,
        area,
        expensasMin: expensasData.rango.min,
        expensasMax: expensasData.rango.max,
        expensasAnualMax: expensasData.impacto_anual.max
      })

      setPaso(3)
      setEstimacion({
        rangoMin,
        rangoMax,
        precioTipico,
        precioM2Tipico: Math.round(p50 / area),
        precioBaseMin,
        precioBaseMax,
        valorParqueos,
        valorBaulera,
        cantParqueos,
        incluyeBaulera: incluyeBaulera || false,
        stockDisponible: similares.length,
        stockTotal: todas.length,
        tipoEdificioLabel: tipoLabel,
        estadoEntregaLabel: estadoLabel,
        sintesis,
        costoParqueoUnit,
        costoBauleraUnit,
        textoParqueo: estacionamiento.texto_inclusion,
        textoBaulera: baulera.texto_inclusion,
        expensasMin: expensasData.rango.min,
        expensasMax: expensasData.rango.max,
        expensasAnualMin: expensasData.impacto_anual.min,
        expensasAnualMax: expensasData.impacto_anual.max
      })

    } catch (err) {
      console.error('Error estimando precio:', err)
      setError('Error al estimar. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const handleAnalizar = () => {
    if (modo === 'verificar') {
      handleVerificar()
    } else {
      handleEstimar()
    }
  }

  const handleReset = () => {
    setPaso(0)
    setModo('verificar')
    setVeredicto(null)
    setEstimacion(null)
    setMostrarAnalisisFiduciario(false)
    setError(null)
    setWarning(null)
    setCantParqueos(0)
    setIncluyeBaulera(null)
    setNoSeMetraje(false)
  }

  return (
    <section className="py-16 md:py-24 bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-brand-dark mb-3">
            Verificador de Precios
          </h2>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Toma decisiones informadas con datos reales del mercado
          </p>
        </motion.div>

        {/* Form / Result Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
        >
          {/* ========== PASO 0: Selector de modo ========== */}
          {paso === 0 && (
            <div className="p-6 md:p-8">
              <h3 className="text-lg font-bold text-slate-800 mb-2 text-center">¿Que queres saber?</h3>
              <p className="text-sm text-slate-500 mb-6 text-center">Elegi segun tu situacion</p>

              <div className="grid md:grid-cols-2 gap-4">
                <button
                  onClick={() => handleSeleccionarModo('verificar')}
                  className="p-5 border-2 border-slate-200 rounded-xl hover:border-brand-primary hover:bg-blue-50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-brand-primary/10 rounded-lg flex items-center justify-center group-hover:bg-brand-primary/20 transition">
                      <svg className="w-5 h-5 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="font-bold text-slate-800">Ya tengo un precio</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    Me ofrecieron un depa y quiero saber si el precio es justo
                  </p>
                </button>

                <button
                  onClick={() => handleSeleccionarModo('estimar')}
                  className="p-5 border-2 border-slate-200 rounded-xl hover:border-brand-primary hover:bg-blue-50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-brand-primary/10 rounded-lg flex items-center justify-center group-hover:bg-brand-primary/20 transition">
                      <svg className="w-5 h-5 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="font-bold text-slate-800">¿Cuanto deberia valer?</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    Quiero saber el rango de precios antes de negociar
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* ========== PASO 1: Datos basicos ========== */}
          {paso === 1 && (
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="flex-1 h-1.5 bg-brand-primary rounded-full" />
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full" />
              </div>

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-800">
                  {modo === 'verificar' ? 'Datos de la oferta' : 'Datos del departamento'}
                </h3>
                <button
                  onClick={() => setPaso(0)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Cambiar modo
                </button>
              </div>

              <div className={`grid grid-cols-2 ${modo === 'verificar' ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-6`}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Zona</label>
                  <select
                    value={zona}
                    onChange={(e) => setZona(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
                  >
                    <option value="">Seleccionar...</option>
                    {ZONAS.map((z) => (
                      <option key={z.id} value={z.id}>{z.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Dormitorios</label>
                  <select
                    value={dormitorios ?? ''}
                    onChange={(e) => setDormitorios(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
                  >
                    <option value="">Seleccionar...</option>
                    {DORMITORIOS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Area (m²)</label>
                  {!noSeMetraje ? (
                    <input
                      type="number"
                      value={areaM2}
                      onChange={(e) => setAreaM2(e.target.value)}
                      placeholder={dormitorios !== null ? `ej: ${getSuperficieTipica(dormitorios).promedio}` : 'ej: 85'}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
                    />
                  ) : (
                    <div className="w-full border border-brand-primary bg-brand-primary/5 rounded-lg px-3 py-2.5 text-sm text-slate-600">
                      ~{dormitorios !== null ? getSuperficieTipica(dormitorios).promedio : 85}m² (típico)
                    </div>
                  )}
                </div>

                {modo === 'verificar' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio ofertado (USD)</label>
                    <input
                      type="number"
                      value={precioOferta}
                      onChange={(e) => setPrecioOferta(e.target.value)}
                      placeholder="ej: 165000"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
                    />
                  </div>
                )}
              </div>

              {/* Hint tipología + Toggle no sé metraje */}
              {dormitorios !== null && (
                <div className="mb-4">
                  {/* Hint de típico */}
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-blue-700">
                      <strong>{dormitorios === 0 ? 'Monoambiente' : dormitorios + ' dorm'} tipico:</strong>{' '}
                      {getSuperficieTipica(dormitorios).texto}
                    </span>
                  </div>

                  {/* Toggle no sé metraje */}
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={noSeMetraje}
                      onChange={(e) => {
                        setNoSeMetraje(e.target.checked)
                        if (e.target.checked) setAreaM2('')
                      }}
                      className="w-4 h-4 text-brand-primary rounded border-slate-300 focus:ring-brand-primary"
                    />
                    <span className="text-sm text-slate-600 group-hover:text-slate-800">
                      No se el metraje exacto (usar ~{getSuperficieTipica(dormitorios).promedio}m²)
                    </span>
                  </label>
                </div>
              )}

              {/* Extras incluidos - Solo en modo estimar */}
              {modo === 'estimar' && (
                <div className="bg-slate-50 rounded-xl p-4 mb-6">
                  <h4 className="text-sm font-medium text-slate-700 mb-3">¿Que incluye la oferta?</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1.5">Parqueos incluidos</label>
                      <div className="flex gap-2">
                        {[0, 1, 2].map(n => (
                          <button
                            key={n}
                            onClick={() => setCantParqueos(n)}
                            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                              cantParqueos === n
                                ? 'border-brand-primary bg-brand-primary text-white'
                                : 'border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {n === 2 ? '2+' : n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1.5">Baulera incluida</label>
                      <div className="flex gap-2">
                        {[
                          { value: true, label: 'Si' },
                          { value: false, label: 'No' },
                          { value: null, label: 'No se' }
                        ].map(opt => (
                          <button
                            key={String(opt.value)}
                            onClick={() => setIncluyeBaulera(opt.value)}
                            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                              incluyeBaulera === opt.value
                                ? 'border-brand-primary bg-brand-primary text-white'
                                : 'border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                onClick={() => setPaso(2)}
                disabled={!formBasicoValido}
                className={`w-full py-3.5 rounded-xl font-semibold text-white transition-all ${
                  formBasicoValido
                    ? 'bg-brand-primary hover:bg-brand-primary/90 shadow-lg shadow-brand-primary/25'
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                Siguiente →
              </button>
            </div>
          )}

          {/* ========== PASO 2: Preguntas calificadoras ========== */}
          {paso === 2 && (
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="flex-1 h-1.5 bg-brand-primary rounded-full" />
                <div className="flex-1 h-1.5 bg-brand-primary rounded-full" />
              </div>

              <h3 className="text-lg font-bold text-slate-800 mb-1">Contanos mas sobre el edificio</h3>
              <p className="text-sm text-slate-500 mb-6">Para comparar manzanas con manzanas</p>

              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">¿Que tipo de edificio es?</label>
                <div className="space-y-2">
                  {TIPO_EDIFICIO.map(t => (
                    <label
                      key={t.value}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                        tipoEdificio === t.value ? 'border-brand-primary bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tipoEdificio"
                        checked={tipoEdificio === t.value}
                        onChange={() => setTipoEdificio(t.value)}
                        className="mt-0.5 text-brand-primary focus:ring-brand-primary"
                      />
                      <div>
                        <span className="font-medium text-slate-800">{t.label}</span>
                        <p className="text-xs text-slate-500">{t.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">¿Estado de entrega?</label>
                <div className="flex gap-3">
                  {ESTADO_ENTREGA.map(e => (
                    <button
                      key={e.value}
                      onClick={() => setEstadoEntrega(e.value)}
                      className={`flex-1 py-3 px-4 rounded-lg border font-medium text-sm transition-all ${
                        estadoEntrega === e.value ? 'border-brand-primary bg-blue-50 text-brand-primary' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ¿Que amenities tiene? <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {AMENITIES_CLAVE.map(a => (
                    <button
                      key={a.id}
                      onClick={() => toggleAmenity(a.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                        amenitiesEdificio.includes(a.id)
                          ? 'border-brand-primary bg-brand-primary text-white'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {modo === 'verificar' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">¿Que priorizas vos?</label>
                  <div className="space-y-2">
                    {PREFERENCIA_USUARIO.map(p => (
                      <label
                        key={p.value}
                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                          preferenciaUsuario === p.value ? 'border-brand-primary bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="preferencia"
                          checked={preferenciaUsuario === p.value}
                          onChange={() => setPreferenciaUsuario(p.value)}
                          className="mt-0.5 text-brand-primary focus:ring-brand-primary"
                        />
                        <div>
                          <span className="font-medium text-slate-800">{p.label}</span>
                          <p className="text-xs text-slate-500">{p.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setPaso(1)}
                  className="flex-1 py-3 rounded-xl font-semibold border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                >
                  ← Volver
                </button>
                <button
                  onClick={handleAnalizar}
                  disabled={!formCalificadorasValido || loading}
                  className={`flex-1 py-3 rounded-xl font-semibold text-white transition-all ${
                    formCalificadorasValido && !loading
                      ? 'bg-brand-primary hover:bg-brand-primary/90 shadow-lg shadow-brand-primary/25'
                      : 'bg-slate-300 cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Analizando...
                    </span>
                  ) : (
                    modo === 'verificar' ? 'Analizar Oferta →' : 'Estimar Valor →'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========== PASO 3: Resultados ========== */}
          <AnimatePresence mode="wait">
            {paso === 3 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-6 md:p-8"
              >
                {warning && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-700 flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {warning}
                  </div>
                )}

                {/* ========== RESULTADO MODO VERIFICAR ========== */}
                {modo === 'verificar' && veredicto && (
                  <>
                    <div className="bg-slate-100 text-sm text-slate-600 rounded-lg px-4 py-2.5 mb-5 flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        Comparando con <strong>{veredicto.stockDisponible} {veredicto.tipoEdificioLabel}</strong> {veredicto.estadoEntregaLabel}
                      </span>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-700">Analisis Basico</h3>
                        <button onClick={handleReset} className="text-sm text-slate-500 hover:text-slate-700 underline">
                          Nueva consulta
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-slate-50 p-4 rounded-lg text-center">
                          <div className="text-sm text-slate-500 mb-1">Tu oferta</div>
                          <div className="text-2xl font-bold text-slate-800">
                            ${Math.round(veredicto.precioM2Usuario).toLocaleString()}/m²
                          </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-lg text-center">
                          <div className="text-sm text-slate-500 mb-1">Promedio similares</div>
                          <div className="text-2xl font-bold text-slate-800">
                            ${Math.round(veredicto.precioM2Promedio).toLocaleString()}/m²
                          </div>
                        </div>
                      </div>

                      <div className={`text-center py-3 rounded-lg border ${bgCategoria[veredicto.categoria]}`}>
                        <span className={`text-xl font-bold ${colorCategoria[veredicto.categoria]}`}>
                          {veredicto.diferenciaPct > 0 ? '+' : ''}{Math.round(veredicto.diferenciaPct)}%
                          {veredicto.diferenciaPct > 0 ? ' sobre' : ' bajo'} promedio
                        </span>
                      </div>
                    </div>

                    {!mostrarAnalisisFiduciario && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-t pt-6">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
                          <div className="flex items-start gap-3">
                            <span className="text-amber-500 text-xl">⚠️</span>
                            <div className="text-sm text-amber-800">
                              <strong>Esto es lo que te diria cualquier portal.</strong><br />
                              Los numeros solos no cuentan toda la historia.
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setMostrarAnalisisFiduciario(true)}
                          className="w-full bg-brand-primary text-white py-3.5 rounded-xl font-semibold hover:bg-brand-primary/90 transition shadow-lg shadow-brand-primary/25"
                        >
                          Ver Analisis Fiduciario →
                        </button>
                      </motion.div>
                    )}

                    {mostrarAnalisisFiduciario && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-t pt-6">
                        <h3 className="text-lg font-bold text-brand-primary mb-4">Analisis Fiduciario</h3>
                        <div className="bg-blue-50 rounded-lg p-4 mb-5 text-sm space-y-2">
                          <div className="font-semibold text-blue-900 mb-2">Contexto de mercado:</div>
                          <div className="text-blue-800">• {veredicto.stockDisponible} unidades sin vender</div>
                          {veredicto.promedioDiasMercado && (
                            <div className="text-blue-800">
                              • Promedio en mercado: {veredicto.promedioDiasMercado} dias
                              {veredicto.poderNegociacion === 'alto' && <span className="ml-2 text-emerald-600 font-semibold">→ Poder de negociacion ALTO</span>}
                              {veredicto.poderNegociacion === 'medio' && <span className="ml-2 text-amber-600 font-semibold">→ Poder de negociacion MEDIO</span>}
                            </div>
                          )}
                          {veredicto.alternativasMasBaratas > 0 && (
                            <div className="text-blue-800">• {veredicto.alternativasMasBaratas} opciones mas baratas</div>
                          )}
                          {veredicto.ahorroEstimado > 0 && (
                            <div className="text-blue-800">• Ahorro potencial: ~${veredicto.ahorroEstimado.toLocaleString()}</div>
                          )}
                          {dormitorios !== null && (
                            <div className="text-blue-800">
                              • Expensas estimadas: ${getExpensasEstimadas(dormitorios, tipoEdificio === 'premium' ? 'premium' : 'estandar').rango.min}-${getExpensasEstimadas(dormitorios, tipoEdificio === 'premium' ? 'premium' : 'estandar').rango.max}/mes
                            </div>
                          )}
                        </div>
                        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 mb-6">
                          <div className="font-bold text-emerald-900 mb-1 text-sm">Lo que te diria un asesor:</div>
                          <div className="text-emerald-800 text-lg font-medium">"{veredicto.conclusionAccionable}"</div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Link href={`/filtros?zona=${zona}&dormitorios=${dormitorios}`} className="flex-1 bg-brand-primary text-white py-3 rounded-xl font-semibold text-center hover:bg-brand-primary/90 transition">
                            Ver alternativas
                          </Link>
                          <Link href="/filtros" className="flex-1 border-2 border-brand-primary text-brand-primary py-3 rounded-xl font-semibold text-center hover:bg-brand-primary/5 transition">
                            Busqueda completa
                          </Link>
                        </div>
                      </motion.div>
                    )}
                  </>
                )}

                {/* ========== RESULTADO MODO ESTIMAR ========== */}
                {modo === 'estimar' && estimacion && (
                  <>
                    <div className="bg-slate-100 text-sm text-slate-600 rounded-lg px-4 py-2.5 mb-5 flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        Basado en <strong>{estimacion.stockDisponible} {estimacion.tipoEdificioLabel}</strong> {estimacion.estadoEntregaLabel}
                      </span>
                    </div>

                    {/* PASO 3a: Resultado basico "Portal" */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-700">Estimacion Basica</h3>
                        <button onClick={handleReset} className="text-sm text-slate-500 hover:text-slate-700 underline">
                          Nueva consulta
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-slate-50 p-4 rounded-lg text-center">
                          <div className="text-sm text-slate-500 mb-1">Rango de mercado</div>
                          <div className="text-xl font-bold text-slate-800">
                            ${(estimacion.rangoMin / 1000).toFixed(0)}k - ${(estimacion.rangoMax / 1000).toFixed(0)}k
                          </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-lg text-center">
                          <div className="text-sm text-slate-500 mb-1">Precio/m² tipico</div>
                          <div className="text-xl font-bold text-slate-800">
                            ${estimacion.precioM2Tipico.toLocaleString()}/m²
                          </div>
                        </div>
                      </div>

                      <div className="text-center py-3 rounded-lg border bg-slate-50 border-slate-200">
                        <span className="text-lg font-bold text-slate-700">
                          Precio tipico: ~${estimacion.precioTipico.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Warning + CTA para analisis fiduciario */}
                    {!mostrarAnalisisFiduciario && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-t pt-6">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
                          <div className="flex items-start gap-3">
                            <span className="text-amber-500 text-xl">⚠️</span>
                            <div className="text-sm text-amber-800">
                              <strong>Esto es lo que te diria cualquier portal.</strong><br />
                              Los numeros solos no cuentan toda la historia.
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setMostrarAnalisisFiduciario(true)}
                          className="w-full bg-brand-primary text-white py-3.5 rounded-xl font-semibold hover:bg-brand-primary/90 transition shadow-lg shadow-brand-primary/25"
                        >
                          Ver Analisis Fiduciario →
                        </button>
                      </motion.div>
                    )}

                    {/* PASO 3b: Analisis Fiduciario completo */}
                    {mostrarAnalisisFiduciario && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-t pt-6">
                        {/* SINTESIS FIDUCIARIA */}
                        <div className={`rounded-xl p-4 border mb-5 ${coloresSintesis[estimacion.sintesis.tipo]}`}>
                          <div className="flex items-start gap-2 mb-2">
                            <span className="text-lg">{iconosSintesis[estimacion.sintesis.tipo]}</span>
                            <div>
                              <h4 className="font-bold text-sm">Sintesis Fiduciaria</h4>
                              <p className="font-medium">{estimacion.sintesis.headline}</p>
                            </div>
                          </div>

                          <div className="text-sm space-y-1 mt-3 opacity-90">
                            {estimacion.sintesis.detalles.map((linea, i) => (
                              <p key={i}>• {linea}</p>
                            ))}
                          </div>

                          <div className="mt-3 pt-3 border-t border-current/20 text-sm font-medium">
                            → {estimacion.sintesis.accion}
                          </div>
                        </div>

                        {/* DESGLOSE DE VALOR */}
                        <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-5 mb-5">
                          <h4 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            Desglose de Valor
                          </h4>

                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center py-2 border-b border-slate-200">
                              <span className="text-slate-600">
                                Departamento base (~{Math.round(getAreaEfectiva())}m²{noSeMetraje ? ' tipico' : ''})
                              </span>
                              <span className="font-medium text-slate-800">
                                ${estimacion.precioBaseMin.toLocaleString()} - ${estimacion.precioBaseMax.toLocaleString()}
                              </span>
                            </div>

                            {estimacion.cantParqueos > 0 && (
                              <div className="flex justify-between items-center py-2 border-b border-slate-200">
                                <span className="text-slate-600">
                                  + {estimacion.cantParqueos} parqueo{estimacion.cantParqueos > 1 ? 's' : ''} (~${estimacion.costoParqueoUnit.toLocaleString()} c/u)
                                </span>
                                <span className="font-medium text-emerald-600">+${estimacion.valorParqueos.toLocaleString()}</span>
                              </div>
                            )}

                            {estimacion.incluyeBaulera && (
                              <div className="flex justify-between items-center py-2 border-b border-slate-200">
                                <span className="text-slate-600">+ 1 baulera</span>
                                <span className="font-medium text-emerald-600">+${estimacion.valorBaulera.toLocaleString()}</span>
                              </div>
                            )}

                            <div className="flex justify-between items-center py-3 bg-white rounded-lg px-3 mt-3">
                              <span className="font-bold text-slate-800">TOTAL ESTIMADO</span>
                              <span className="font-bold text-xl text-brand-primary">
                                ${estimacion.rangoMin.toLocaleString()} - ${estimacion.rangoMax.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Info costos si no incluye extras */}
                        {(estimacion.cantParqueos === 0 || !estimacion.incluyeBaulera) && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm mb-5">
                            <div className="flex items-start gap-2">
                              <span className="text-amber-500">💡</span>
                              <div className="text-amber-800">
                                <strong>Si no incluyen extras:</strong>
                                <ul className="mt-1 space-y-0.5">
                                  {estimacion.cantParqueos === 0 && (
                                    <li>Parqueo: ${estimacion.costoParqueoUnit.toLocaleString()} ({estimacion.textoParqueo})</li>
                                  )}
                                  {!estimacion.incluyeBaulera && (
                                    <li>Baulera: ${estimacion.costoBauleraUnit.toLocaleString()} ({estimacion.textoBaulera})</li>
                                  )}
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* CTAs */}
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Link href={`/filtros?zona=${zona}&dormitorios=${dormitorios}`} className="flex-1 bg-brand-primary text-white py-3 rounded-xl font-semibold text-center hover:bg-brand-primary/90 transition">
                            Ver opciones disponibles
                          </Link>
                          <button
                            onClick={handleReset}
                            className="flex-1 border-2 border-brand-primary text-brand-primary py-3 rounded-xl font-semibold text-center hover:bg-brand-primary/5 transition"
                          >
                            Nueva estimacion
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-center text-slate-500 text-sm mt-6"
        >
          Basado en {'>'}350 propiedades activas en Equipetrol • Actualizado diariamente
        </motion.p>
      </div>
    </section>
  )
}
