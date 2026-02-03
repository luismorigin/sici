import { useState } from 'react'
import { UnidadReal } from '@/lib/supabase'
import { formatDorms } from '@/lib/format-utils'

interface PropertyCardPremiumProps {
  propiedad: UnidadReal
  rank?: number
  datosContexto?: {
    diasMedianaZona: number | null
    diasPromedioZona: number | null
  }
  innegociablesUsuario?: string[]
  usuarioNecesitaParqueo?: boolean
  usuarioNecesitaBaulera?: boolean
  isSelected?: boolean
  onToggleSelected?: (id: number) => void
  onOpenLightbox?: (propiedad: UnidadReal, index: number) => void
}

// Constantes para costos estimados (de estimados-mercado.ts)
const COSTOS_PARQUEO = { min: 10000, max: 18000 }
const COSTOS_BAULERA = { min: 2500, max: 4500 }
const EXPENSAS_POR_DORMS: Record<number, { min: number; max: number }> = {
  0: { min: 43, max: 100 },
  1: { min: 55, max: 115 },
  2: { min: 70, max: 150 },
  3: { min: 86, max: 243 },
}

// Helper para formatear numeros sin decimales
const formatNum = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(num)) return '0'
  return Math.round(num).toLocaleString('es-BO')
}

// Amenities de edificio (separar de equipamiento de unidad)
const AMENITIES_EDIFICIO = [
  'Piscina', 'Piscina infinita', 'Gimnasio', 'Cowork', 'Sala TV/Cine',
  'Jacuzzi', 'Sauna', 'Seguridad 24h', 'Camaras seguridad', 'Sala de juegos',
  'BBQ', 'Parrillero', 'Area verde', 'Jardin', 'Terraza comun', 'Rooftop',
  'Pet friendly', 'Ascensor', 'Salon de eventos'
]

// Tipos para sintesis fiduciaria
type TipoSintesis = 'oportunidad' | 'premium' | 'justo' | 'sospechoso'

interface SintesisFiduciaria {
  headline: string
  detalles: string
  accion: string
  tipo: TipoSintesis
}

// Badge tiempo en mercado
function getBadgeTiempo(diasEnMercado: number, diasMedianaZona: number): {
  label: string
  color: string
  accion: string | null
} {
  if (diasEnMercado < 7) return {
    label: 'Nueva',
    color: 'bg-[#c9a959]/20 text-[#0a0a0a]',
    accion: 'Si te interesa, no esperes'
  }

  const ratio = diasEnMercado / diasMedianaZona

  if (ratio < 0.5) return {
    label: 'Poco tiempo',
    color: 'bg-[#f8f6f3] text-[#666666]',
    accion: null
  }

  if (ratio < 1.0) return {
    label: 'Tiempo promedio',
    color: 'bg-[#f8f6f3] text-[#666666]',
    accion: null
  }

  if (ratio < 1.5) return {
    label: 'Mas tiempo publicada',
    color: 'bg-[#c9a959]/10 text-[#0a0a0a]',
    accion: 'Consulta si hay flexibilidad'
  }

  return {
    label: 'Oportunidad de negociar',
    color: 'bg-[#c9a959]/20 text-[#0a0a0a]',
    accion: 'Buen momento para ofertar'
  }
}

// Extrae escasez de la razon fiduciaria
function parseEscasezDeRazon(razon: string | null | undefined): number | null {
  if (!razon) return null
  const match1 = razon.match(/de solo (\d+) deptos?/i)
  if (match1) return parseInt(match1[1])
  const match2 = razon.match(/Solo (\d+) opciones?/i)
  if (match2) return parseInt(match2[1])
  if (/Único/i.test(razon)) return 1
  return null
}

// Genera sintesis fiduciaria
function generarSintesisFiduciaria(datos: {
  diferenciaPct: number | null
  diasEnMercado: number | null
  diasMedianaZona: number | null
  diasPromedioZona: number | null
  escasez: number | null
  estadoConstruccion: string
}): SintesisFiduciaria {
  const { diferenciaPct, diasEnMercado, diasMedianaZona, diasPromedioZona, escasez, estadoConstruccion } = datos

  const umbralReciente = 30
  const umbralMedio = diasMedianaZona ?? 74
  const umbralLargo = diasPromedioZona ?? 104

  const dias = diasEnMercado ?? 0
  const diffPct = Math.round(diferenciaPct ?? 0)
  const sinDatosComparacion = diferenciaPct === null

  let tipo: TipoSintesis = 'justo'
  if (diffPct <= -10) {
    tipo = 'oportunidad'
    if ((diffPct <= -20 && dias >= umbralMedio) || dias >= umbralLargo) {
      tipo = 'sospechoso'
    }
  } else if (diffPct >= 10) {
    tipo = 'premium'
  }

  let headline: string
  const tiempoTexto = dias <= umbralReciente ? 'reciente'
    : dias < umbralMedio ? `${Math.round(dias / 30)} mes${Math.round(dias / 30) > 1 ? 'es' : ''}`
    : `${Math.round(dias / 30)} meses`

  if (sinDatosComparacion) {
    headline = dias > 0 ? `${tiempoTexto} publicado` : 'Sin datos para comparar'
  } else if (tipo === 'sospechoso') {
    headline = `${Math.abs(diffPct)}% bajo mercado + ${tiempoTexto}`
  } else if (tipo === 'oportunidad') {
    headline = `${Math.abs(diffPct)}% bajo mercado + ${tiempoTexto}`
  } else if (tipo === 'premium') {
    headline = `${diffPct}% sobre mercado + ${tiempoTexto}`
  } else {
    headline = `Precio de mercado + ${tiempoTexto}`
  }

  const lineas: string[] = []
  if (escasez && escasez <= 3) {
    lineas.push(`Solo ${escasez} similar${escasez > 1 ? 'es' : ''} disponible${escasez > 1 ? 's' : ''}`)
  }
  if (estadoConstruccion === 'preventa') {
    lineas.push(`Preventa - verificar fecha entrega`)
  }

  let accion: string
  if (sinDatosComparacion) {
    accion = 'Pedi info de otras unidades para comparar'
  } else if (tipo === 'sospechoso') {
    accion = 'Pregunta por que lleva tanto tiempo'
  } else if (tipo === 'oportunidad') {
    accion = estadoConstruccion === 'preventa'
      ? 'Verifica fecha entrega y que incluye'
      : 'Verifica estado real y por que el precio'
  } else if (tipo === 'premium') {
    accion = dias >= umbralMedio ? 'Podes tantear con una oferta' : 'Si te gusta, no demores'
  } else {
    accion = 'Toma tu tiempo para comparar'
  }

  return { headline, detalles: lineas.join('\n'), accion, tipo }
}

// Calcular poder de negociación basado en datos objetivos
function calcularPoderNegociacion(
  propiedad: UnidadReal,
  medianaZona: number
): { poder: 'alto' | 'moderado' | 'bajo'; score: number; factores: string[] } {
  let score = 0
  const factores: string[] = []

  // Factor 1: Tiempo en mercado (peso: 2)
  if (propiedad.dias_en_mercado != null) {
    if (propiedad.dias_en_mercado > medianaZona * 1.5) {
      score += 2
      factores.push(`${propiedad.dias_en_mercado} días publicada (promedio: ${medianaZona}d)`)
    } else if (propiedad.dias_en_mercado > medianaZona) {
      score += 1
      factores.push(`Sobre promedio de tiempo en mercado`)
    }
  }

  // Factor 2: Precio vs promedio zona (peso: 2)
  const diffPct = propiedad.posicion_mercado?.diferencia_pct
  if (diffPct && diffPct > 5) {
    score += 2
    factores.push(`${Math.round(diffPct)}% sobre promedio de zona`)
  } else if (diffPct && diffPct > 0) {
    score += 1
    factores.push(`Ligeramente sobre promedio de zona`)
  }

  // Factor 3: Posición en tipología (peso: 1) - solo si hay comparables de misma tipología
  const tipologia = propiedad.dormitorios === 0 ? 'monoambientes' : `${propiedad.dormitorios}D`
  if (propiedad.posicion_en_tipologia && propiedad.posicion_en_tipologia > 1 &&
      propiedad.unidades_misma_tipologia && propiedad.unidades_misma_tipologia >= 2) {
    score += 1
    factores.push(`${propiedad.posicion_en_tipologia - 1} opción(es) más barata(s) de ${tipologia} en edificio`)
  }

  // Factor 4: Alto inventario (peso: 1)
  if (propiedad.unidades_en_edificio && propiedad.unidades_en_edificio >= 5) {
    score += 1
    factores.push(`${propiedad.unidades_en_edificio} unidades disponibles`)
  }

  // Factor 5: Entrega inmediata con tiempo (peso: 1)
  if (propiedad.estado_construccion !== 'preventa' &&
      propiedad.dias_en_mercado != null &&
      propiedad.dias_en_mercado > 60) {
    score += 1
    factores.push(`Entrega inmediata con tiempo en mercado`)
  }

  return {
    poder: score >= 4 ? 'alto' : score >= 2 ? 'moderado' : 'bajo',
    score: Math.min(score, 5), // Max 5
    factores
  }
}

// Iconos SVG premium
const IconBed = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2V7" />
    <path d="M21 10H3" />
    <path d="M7 10V7a2 2 0 012-2h6a2 2 0 012 2v3" />
  </svg>
)

const IconBath = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z" />
    <path d="M6 12V5a2 2 0 012-2h1" />
    <circle cx="9" cy="6" r="2" />
  </svg>
)

const IconArea = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </svg>
)

const IconCar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
    <path d="M5 11l2-5h10l2 5" />
  </svg>
)

const IconStorage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const IconBuilding = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M9 22V12h6v10" />
    <path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01" />
  </svg>
)

const IconHome = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const IconChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const IconChevronUp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M18 15l-6-6-6 6" />
  </svg>
)

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const IconQuestion = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const IconX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

export default function PropertyCardPremium({
  propiedad,
  rank,
  datosContexto,
  innegociablesUsuario = [],
  usuarioNecesitaParqueo = false,
  usuarioNecesitaBaulera = false,
  isSelected = false,
  onToggleSelected,
  onOpenLightbox
}: PropertyCardPremiumProps) {
  const [fotoIndex, setFotoIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [expandedAmenities, setExpandedAmenities] = useState(false)
  const [expandedEquipamiento, setExpandedEquipamiento] = useState(false)

  const fotos = propiedad.fotos_urls || []
  const hasFotos = fotos.length > 0

  const nextFoto = () => {
    if (fotos.length > 1) setFotoIndex((prev) => (prev + 1) % fotos.length)
  }

  const prevFoto = () => {
    if (fotos.length > 1) setFotoIndex((prev) => (prev - 1 + fotos.length) % fotos.length)
  }

  // Separar amenities de edificio y equipamiento de unidad
  const equipamientoRaw = propiedad.equipamiento_detectado || []
  const amenitiesFromEquip = equipamientoRaw.filter(item => AMENITIES_EDIFICIO.includes(item))
  const equipamientoReal = equipamientoRaw.filter(item => !AMENITIES_EDIFICIO.includes(item))
  const amenitiesConfirmados = propiedad.amenities_confirmados || propiedad.amenities_lista || []
  const allAmenities = [...new Set([...amenitiesConfirmados, ...amenitiesFromEquip])]

  const hasAmenities = allAmenities.length > 0
  const hasEquipamiento = equipamientoReal.length > 0

  // Estado parqueo/baulera
  const tieneParqueo = propiedad.estacionamientos != null && propiedad.estacionamientos > 0
  const tieneBaulera = propiedad.baulera === true
  const parqueoDesconocido = propiedad.estacionamientos == null
  const bauleraDesconocida = propiedad.baulera == null

  // Generar sintesis fiduciaria
  const diferenciaPctValida = propiedad.posicion_mercado?.success ? propiedad.posicion_mercado.diferencia_pct : null

  const sintesis = generarSintesisFiduciaria({
    diferenciaPct: diferenciaPctValida,
    diasEnMercado: propiedad.dias_en_mercado,
    diasMedianaZona: datosContexto?.diasMedianaZona ?? 74,
    diasPromedioZona: datosContexto?.diasPromedioZona ?? 104,
    escasez: parseEscasezDeRazon(propiedad.razon_fiduciaria),
    estadoConstruccion: propiedad.estado_construccion || ''
  })

  // Colores sintesis premium
  const coloresSintesis = {
    oportunidad: 'bg-[#0a0a0a]/5 border-[#c9a959] text-[#0a0a0a]',
    premium: 'bg-[#c9a959]/10 border-[#c9a959]/50 text-[#0a0a0a]',
    justo: 'bg-[#f8f6f3] border-[#0a0a0a]/10 text-[#666666]',
    sospechoso: 'bg-red-50/50 border-red-200/50 text-red-900'
  }

  const iconosSintesis = { oportunidad: '◆', premium: '△', justo: '○', sospechoso: '!' }

  // Calcular precio real
  const calcularPrecioReal = () => {
    let adicionalMin = 0
    let adicionalMax = 0
    const items: string[] = []

    if (usuarioNecesitaParqueo && !tieneParqueo) {
      adicionalMin += COSTOS_PARQUEO.min
      adicionalMax += COSTOS_PARQUEO.max
      items.push('parqueo')
    }
    if (usuarioNecesitaBaulera && !tieneBaulera) {
      adicionalMin += COSTOS_BAULERA.min
      adicionalMax += COSTOS_BAULERA.max
      items.push('baulera')
    }

    return { adicionalMin, adicionalMax, items }
  }

  // Expensas
  const expensas = EXPENSAS_POR_DORMS[propiedad.dormitorios] || EXPENSAS_POR_DORMS[2]
  const expensasPromedio = Math.round((expensas.min + expensas.max) / 2)

  // Ranking edificio
  const tieneRanking = propiedad.unidades_en_edificio != null && propiedad.unidades_en_edificio > 1
  const tieneComparables = propiedad.unidades_misma_tipologia != null && propiedad.unidades_misma_tipologia >= 2
  const tipologia = propiedad.dormitorios === 0 ? 'Mono' : `${propiedad.dormitorios}D`
  const posicion = propiedad.posicion_en_tipologia || 1
  const total = propiedad.unidades_misma_tipologia || 1
  const precioMin = propiedad.precio_min_tipologia || propiedad.precio_usd
  const precioMax = propiedad.precio_max_tipologia || propiedad.precio_usd
  const esMasBarata = posicion === 1 && total > 1
  const esMasCara = posicion === total && total > 1

  // Badge negociacion
  const medianaZona = datosContexto?.diasMedianaZona || 74
  const badgeTiempo = propiedad.dias_en_mercado != null
    ? getBadgeTiempo(propiedad.dias_en_mercado, medianaZona)
    : null

  return (
    <div className={`bg-white border transition-all duration-300 ${
      isSelected
        ? 'border-[#c9a959] ring-2 ring-[#c9a959] shadow-[0_0_20px_rgba(201,169,89,0.4)]'
        : 'border-[#0a0a0a]/10 hover:border-[#c9a959]/30'
    }`}>
      {/* Image Section */}
      <div className="relative aspect-[16/10] bg-[#f8f6f3] overflow-hidden">
        {/* Heart button for favorites */}
        {onToggleSelected && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelected(propiedad.id) }}
            className="absolute top-3 right-3 z-10 p-2 transition-all"
            aria-label={isSelected ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          >
            <svg
              className={`w-7 h-7 transition-all drop-shadow-md ${
                isSelected
                  ? 'fill-[#c9a959] stroke-[#c9a959]'
                  : 'fill-transparent stroke-white hover:stroke-[#c9a959]'
              }`}
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        )}
        {hasFotos ? (
          <>
            <img
              src={fotos[fotoIndex]}
              alt={propiedad.proyecto}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => onOpenLightbox?.(propiedad, fotoIndex)}
            />
            {fotos.length > 1 && (
              <>
                <button onClick={prevFoto} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <button onClick={nextFoto} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18l6-6-6-6" /></svg>
                </button>
              </>
            )}
            <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1">{fotoIndex + 1} / {fotos.length}</div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#999999]">Sin fotos</div>
        )}
        {rank && (
          <div className="absolute top-3 left-3 bg-[#c9a959] text-[#0a0a0a] px-4 py-2 text-xs tracking-[2px] uppercase font-medium">TOP {rank}</div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-6">
        {/* Header */}
        <div className="mb-4">
          <h3 className="font-display text-2xl text-[#0a0a0a] font-light">
            {propiedad.proyecto}
            <span className="ml-2 text-sm text-[#999999] font-normal">#{propiedad.id}</span>
          </h3>
          {propiedad.desarrollador && <p className="text-[#999999] text-sm mt-1">por {propiedad.desarrollador}</p>}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-4 mb-4">
          <span className="font-display text-3xl text-[#0a0a0a]">${formatNum(propiedad.precio_usd)}</span>
          <span className="text-[#c9a959] text-sm">${formatNum(propiedad.precio_m2)}/m2</span>
        </div>

        {/* Specs */}
        <div className="flex items-center gap-4 text-[#666666] text-sm mb-4">
          <span className="flex items-center gap-1.5"><IconBed /> {formatDorms(propiedad.dormitorios)}</span>
          {propiedad.banos && <span className="flex items-center gap-1.5"><IconBath /> {Math.floor(Number(propiedad.banos))}</span>}
          <span className="flex items-center gap-1.5"><IconArea /> {propiedad.area_m2}m2</span>
          {tieneParqueo && <span className="flex items-center gap-1.5"><IconCar /> {propiedad.estacionamientos}</span>}
          {tieneBaulera && <span className="flex items-center gap-1.5"><IconStorage /></span>}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {propiedad.solo_tc_paralelo && <span className="bg-[#0a0a0a] text-[#c9a959] px-3 py-1 text-xs tracking-wide">TC Paralelo</span>}
          {propiedad.precio_negociable && <span className="bg-[#0a0a0a] text-white px-3 py-1 text-xs tracking-wide">Negociable</span>}
          {propiedad.plan_pagos_desarrollador && <span className="bg-[#c9a959]/20 text-[#0a0a0a] px-3 py-1 text-xs tracking-wide">Plan de pagos</span>}
          {propiedad.descuento_contado_pct && propiedad.descuento_contado_pct > 0 && (
            <span className="bg-[#0a0a0a]/5 text-[#0a0a0a] border border-[#0a0a0a]/10 px-3 py-1 text-xs tracking-wide">-{propiedad.descuento_contado_pct}% contado</span>
          )}
        </div>

        {/* Amenities */}
        {hasAmenities && (
          <div className="mb-3">
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="text-[#999999] mr-1"><IconBuilding /></span>
              {(() => {
                const visibleCount = 3
                const hasMore = allAmenities.length > visibleCount
                const displayItems = expandedAmenities ? allAmenities : allAmenities.slice(0, visibleCount)
                return (
                  <>
                    {displayItems.map((item, i) => <span key={i} className="text-xs text-[#666666] bg-[#f8f6f3] px-2 py-1">{item}</span>)}
                    {hasMore && <button onClick={() => setExpandedAmenities(!expandedAmenities)} className="text-xs text-[#c9a959] hover:underline">{expandedAmenities ? '−' : `+${allAmenities.length - visibleCount}`}</button>}
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* Equipamiento */}
        {hasEquipamiento && (
          <div className="mb-4">
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="text-[#999999] mr-1"><IconHome /></span>
              {(() => {
                const visibleCount = 3
                const hasMore = equipamientoReal.length > visibleCount
                const displayItems = expandedEquipamiento ? equipamientoReal : equipamientoReal.slice(0, visibleCount)
                return (
                  <>
                    {displayItems.map((item, i) => <span key={i} className="text-xs text-[#666666] bg-[#f8f6f3] px-2 py-1">{item}</span>)}
                    {hasMore && <button onClick={() => setExpandedEquipamiento(!expandedEquipamiento)} className="text-xs text-[#c9a959] hover:underline">{expandedEquipamiento ? '−' : `+${equipamientoReal.length - visibleCount}`}</button>}
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* Sintesis Fiduciaria */}
        <div className={`px-4 py-3 border ${coloresSintesis[sintesis.tipo]}`}>
          <p className="text-sm font-medium tracking-wide">
            <span className="text-[#c9a959] mr-2">{iconosSintesis[sintesis.tipo]}</span>
            {sintesis.headline}
          </p>
          {sintesis.detalles && (
            <div className="text-xs mt-1.5 opacity-70 space-y-0.5">
              {sintesis.detalles.split('\n').map((linea, i) => <p key={i}>{linea}</p>)}
            </div>
          )}
          <p className="text-xs mt-2 font-medium border-t border-current/10 pt-2 tracking-wide">{sintesis.accion}</p>
        </div>

        {/* === SECCION EXPANDIDA === */}
        {expanded && (
          <div className="mt-6 space-y-4">

            {/* 1. PRECIO REAL DE COMPRA */}
            {(usuarioNecesitaParqueo || usuarioNecesitaBaulera) && (() => {
              const { adicionalMin, adicionalMax, items } = calcularPrecioReal()
              const todoIncluido = items.length === 0

              return (
                <div className={`p-4 border ${todoIncluido ? 'border-[#c9a959]/30 bg-[#c9a959]/5' : 'border-[#0a0a0a]/10 bg-[#f8f6f3]'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs tracking-[2px] uppercase text-[#999999]">Precio real de compra</span>
                    {todoIncluido && <span className="text-xs text-[#c9a959] font-medium">Todo incluido</span>}
                  </div>

                  <div className="space-y-2 text-sm">
                    {usuarioNecesitaParqueo && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[#666666]">
                          <IconCar /> Parqueo
                        </span>
                        {tieneParqueo ? (
                          <span className="text-[#c9a959] flex items-center gap-1"><IconCheck /> Incluido ({propiedad.estacionamientos})</span>
                        ) : (
                          <span className="text-[#666666]">${formatNum(COSTOS_PARQUEO.min)}-{formatNum(COSTOS_PARQUEO.max)}</span>
                        )}
                      </div>
                    )}
                    {usuarioNecesitaBaulera && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[#666666]">
                          <IconStorage /> Baulera
                        </span>
                        {tieneBaulera ? (
                          <span className="text-[#c9a959] flex items-center gap-1"><IconCheck /> Incluida</span>
                        ) : (
                          <span className="text-[#666666]">${formatNum(COSTOS_BAULERA.min)}-{formatNum(COSTOS_BAULERA.max)}</span>
                        )}
                      </div>
                    )}
                    {items.length > 0 && (
                      <div className="pt-2 mt-2 border-t border-[#0a0a0a]/10">
                        <p className="text-xs text-[#999999]">
                          Precio real: <span className="text-[#0a0a0a] font-medium">${formatNum(propiedad.precio_usd + adicionalMin)}-{formatNum(propiedad.precio_usd + adicionalMax)}</span>
                          {' '}si no incluye {items.join(' ni ')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* 2. COSTO MENSUAL */}
            <div className="p-4 border border-[#0a0a0a]/10 bg-[#f8f6f3]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs tracking-[2px] uppercase text-[#999999]">Costo mensual de vivir</span>
                <span className="text-xs text-[#666666]">recurrente</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Expensas estimadas</span>
                  <span className="text-[#0a0a0a] font-medium">${expensas.min}-{expensas.max}/mes</span>
                </div>
                <div className="pt-2 mt-2 border-t border-[#0a0a0a]/10 text-xs text-[#999999]">
                  <p>Impacto: ~${formatNum(expensasPromedio * 12)}/ano | ~${formatNum(expensasPromedio * 60)} en 5 anos</p>
                </div>
              </div>
            </div>

            {/* 3. PUEDO NEGOCIAR? - Con análisis de factores */}
            {(() => {
              const negociacion = calcularPoderNegociacion(propiedad, medianaZona)
              const estrellas = '★'.repeat(negociacion.score) + '☆'.repeat(5 - negociacion.score)
              const colorPoder = negociacion.poder === 'alto' ? 'bg-[#c9a959]/20 text-[#0a0a0a]' :
                                 negociacion.poder === 'moderado' ? 'bg-[#f8f6f3] text-[#666666]' :
                                 'bg-[#0a0a0a]/5 text-[#999999]'

              return (
                <div className="p-4 border border-[#0a0a0a]/10 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs tracking-[2px] uppercase text-[#999999]">Puedo negociar?</span>
                    <span className={`text-xs px-3 py-1 ${colorPoder}`}>
                      {negociacion.poder.toUpperCase()} {estrellas}
                    </span>
                  </div>

                  {negociacion.factores.length > 0 ? (
                    <div className="mb-3">
                      <p className="text-xs text-[#999999] mb-2">Factores a tu favor:</p>
                      <ul className="space-y-1">
                        {negociacion.factores.map((factor, i) => (
                          <li key={i} className="text-sm text-[#666666] flex items-start gap-2">
                            <span className="text-[#c9a959]">•</span>
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-[#666666] mb-3">
                      Pocos factores de negociación detectados. El vendedor tiene posición fuerte.
                    </p>
                  )}

                  {/* Disclaimer obligatorio */}
                  <div className="p-2 bg-[#f8f6f3] rounded text-xs text-[#999999] mt-3">
                    <span className="font-medium">ℹ️</span> Orientación basada en datos públicos.
                    No constituye asesoría financiera.
                  </div>
                </div>
              )
            })()}

            {/* 4. RANKING EDIFICIO */}
            {tieneRanking && tieneComparables && (
              <div className="p-4 border border-[#0a0a0a]/10 bg-[#f8f6f3]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs tracking-[2px] uppercase text-[#999999]">Ranking {tipologia} en edificio</span>
                  <span className={`text-xs px-3 py-1 ${
                    esMasBarata ? 'bg-[#c9a959]/20 text-[#0a0a0a]' : esMasCara ? 'bg-[#0a0a0a] text-white' : 'bg-[#f8f6f3] border border-[#0a0a0a]/10 text-[#666666]'
                  }`}>
                    {esMasBarata ? 'Mas economica' : esMasCara ? 'Premium' : 'Balanceada'}
                  </span>
                </div>

                {/* Barra visual */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-[#999999] mb-1">
                    <span>${formatNum(precioMin)}</span>
                    <span>${formatNum(precioMax)}</span>
                  </div>
                  <div className="relative h-2 bg-[#0a0a0a]/10 rounded-full">
                    {(() => {
                      const rango = precioMax - precioMin
                      const posicionBarra = rango > 0 ? ((propiedad.precio_usd - precioMin) / rango) * 100 : 50
                      return (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#c9a959] border-2 border-white shadow"
                          style={{ left: `calc(${Math.min(Math.max(posicionBarra, 5), 95)}% - 6px)` }}
                        />
                      )
                    })()}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#666666]">Posicion <span className="text-[#0a0a0a] font-medium">{posicion}</span> de {total}</span>
                </div>
                <p className="text-xs text-[#999999] mt-2">
                  {esMasBarata ? 'Pregunta que la diferencia (piso, vista, orientacion)' :
                   esMasCara ? 'Verifica que la hace especial' : 'Opcion equilibrada'}
                </p>
              </div>
            )}

            {/* 5. AMENIDADES PEDIDAS */}
            {innegociablesUsuario.length > 0 && (
              <div className="p-4 border border-[#0a0a0a]/10 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs tracking-[2px] uppercase text-[#999999]">Tus innegociables</span>
                  {(() => {
                    const confirmadas = innegociablesUsuario.filter(a =>
                      amenitiesConfirmados.some(c => c.toLowerCase().includes(a.toLowerCase()))
                    ).length
                    return (
                      <span className={`text-xs px-3 py-1 ${
                        confirmadas === innegociablesUsuario.length ? 'bg-[#c9a959]/20 text-[#0a0a0a]' : 'bg-[#f8f6f3] text-[#666666]'
                      }`}>
                        {confirmadas}/{innegociablesUsuario.length}
                      </span>
                    )
                  })()}
                </div>

                <div className="flex flex-wrap gap-2">
                  {innegociablesUsuario.map((amenidad, i) => {
                    const confirmada = amenitiesConfirmados.some(c => c.toLowerCase().includes(amenidad.toLowerCase()))
                    const porVerificar = (propiedad.amenities_por_verificar || []).some(c => c.toLowerCase().includes(amenidad.toLowerCase()))

                    return (
                      <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${
                        confirmada ? 'bg-[#c9a959]/20 text-[#0a0a0a]' :
                        porVerificar ? 'bg-[#f8f6f3] text-[#666666] border border-[#0a0a0a]/10' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {confirmada ? <IconCheck /> : porVerificar ? <IconQuestion /> : <IconX />}
                        {amenidad}
                      </span>
                    )
                  })}
                </div>

                {innegociablesUsuario.some(a =>
                  (propiedad.amenities_por_verificar || []).some(c => c.toLowerCase().includes(a.toLowerCase()))
                ) && (
                  <p className="text-xs text-[#999999] mt-3">
                    Pregunta por: {innegociablesUsuario.filter(a =>
                      (propiedad.amenities_por_verificar || []).some(c => c.toLowerCase().includes(a.toLowerCase()))
                    ).join(', ')}
                  </p>
                )}
              </div>
            )}

            {/* Ubicacion */}
            {(propiedad.microzona || propiedad.zona) && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#666666]">{propiedad.microzona || propiedad.zona}</span>
                {propiedad.latitud && propiedad.longitud && (
                  <a
                    href={`https://maps.google.com/?q=${propiedad.latitud},${propiedad.longitud}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#c9a959] hover:underline text-xs"
                  >
                    Ver en Maps
                  </a>
                )}
              </div>
            )}

          </div>
        )}

        {/* Ver detalles button */}
        <div className="flex justify-center pt-4 mt-4 border-t border-[#0a0a0a]/10">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-[#666666] hover:text-[#c9a959] text-sm transition-colors"
          >
            {expanded ? 'Ver menos' : 'Ver mas detalles'}
            {expanded ? <IconChevronUp /> : <IconChevronDown />}
          </button>
        </div>
      </div>
    </div>
  )
}
