import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { buscarUnidadesReales, UnidadReal, FiltrosBusqueda } from '@/lib/supabase'
import {
  PropertyCardPremium,
  ResultsHeaderPremium,
  FavoritesProgressBarPremium,
  LightboxPremium,
  OrderFavoritesPremium
} from '@/components/results-premium'
import { premiumFonts } from '@/styles/premium-theme'
import { formatDorms } from '@/lib/format-utils'
import FeedbackPremiumModal from '@/components/FeedbackPremiumModal'
import { innegociablesToAmenidades } from '@/config/amenidades-mercado'

// Dynamic import para mapa (sin SSR)
const MapaResultados = dynamic(() => import('@/components/MapaResultados'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
    </div>
  )
})

// Mapeo de IDs de innegociables a nombres de amenidades
const INNEGOCIABLE_TO_AMENIDAD: Record<string, string> = {
  'pet_friendly': 'Pet friendly',
  'piscina': 'Piscina',
  'gimnasio': 'Gimnasio',
  'terraza_comun': 'Terraza comun',
  'sauna_jacuzzi': 'Sauna',
  'cowork': 'Cowork',
  'sum': 'Salon de eventos',
  'churrasquera': 'Churrasquera',
  'area_ninos': 'Area ninos',
}

// Interfaz extendida con campos de precio real
interface UnidadRealConPrecioReal extends UnidadReal {
  precioReal: number
  ajusteParqueo: number
  ajusteBaulera: number
  scoreTotal: number
  cumpleInnegociables: boolean
}

// Constantes para edición inline
const ZONAS_PREMIUM = [
  { id: 'equipetrol', label: 'Eq. Centro' },
  { id: 'sirari', label: 'Sirari' },
  { id: 'equipetrol_norte', label: 'Eq. Norte' },
  { id: 'villa_brigida', label: 'Villa Brigida' },
  { id: 'faremafu', label: 'Eq. Oeste' },
]

const DORMITORIOS_PREMIUM = [
  { value: null, label: 'Todos' },
  { value: 0, label: 'Mono' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3+' },
]

const ESTADO_ENTREGA_PREMIUM = [
  { value: 'no_importa', label: 'Todo' },
  { value: 'entrega_inmediata', label: 'Entrega inmediata' },
  { value: 'solo_preventa', label: 'Solo preventa' },
]

// Iconos SVG minimalistas premium
const IconDollar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#c9a959]">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
)

const IconBed = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#c9a959]">
    <path d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6M3 18v2M21 18v2M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3" />
  </svg>
)

const IconPin = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#c9a959]">
    <path d="M12 21c-4-4-8-7.5-8-12a8 8 0 1116 0c0 4.5-4 8-8 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
)

const IconBuilding = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#c9a959]">
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 9h.01M15 9h.01M9 13h.01M15 13h.01" />
  </svg>
)

const IconEdit = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#c9a959]">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40 hover:text-white">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

// ============================================================================
// SCORE MOAT - Ranking inteligente basado en preferencias del usuario
// Fórmula: INNEGOCIABLES (0-100) + OPORTUNIDAD (0-40) + TRADE_OFFS (0-35) + DESEABLES (0-15)
// Máximo: ~175 puntos
// ============================================================================

// Medianas por tipología (Enero 2026)
const MEDIANA_AREA_POR_DORMS: Record<number, number> = {
  0: 36, 1: 52, 2: 88, 3: 165, 4: 200, 5: 250
}

// Medianas precio/m² por zona (Enero 2026)
const MEDIANA_PRECIO_M2_POR_ZONA: Record<string, number> = {
  'Equipetrol Norte/Norte': 2362,
  'Equipetrol Norte/Sur': 2362,
  'Faremafu': 2299,
  'Equipetrol': 2055,
  'Sirari': 2002,
  'Villa Brigida': 1538,
  'default': 2000
}

interface DatosUsuarioMOAT {
  innegociables: string[]
  deseables: string[]
  calidad_vs_precio: number   // 1-5 (amenidades vs precio)
  amenidades_vs_metros: number // 1-5 (amenidades vs metros)
}

function calcularScoreMOAT(
  prop: UnidadReal,
  datosUsuario: DatosUsuarioMOAT
): number {
  let score = 0

  // 1. INNEGOCIABLES (0 a 100) - Score gradual
  // Confirmado = 100%, Por verificar = 50%, No tiene = 0%
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
  // IMPORTANTE: La escala se INVIERTE según preferencia calidad_vs_precio
  const posicionMercado = prop.posicion_mercado as { diferencia_pct?: number } | null
  const difPct = posicionMercado?.diferencia_pct ?? 0

  let oportunidadScore = 0

  if (datosUsuario.calidad_vs_precio <= 2) {
    // PRIORIZA CALIDAD: Premium/caro = más puntos
    if (difPct >= 15) oportunidadScore = 40
    else if (difPct >= 5) oportunidadScore = 30
    else if (difPct >= -10) oportunidadScore = 20
    else if (difPct >= -20) oportunidadScore = 10
  } else if (datosUsuario.calidad_vs_precio >= 4) {
    // PRIORIZA PRECIO: Barato = más puntos
    if (difPct <= -20) oportunidadScore = 40
    else if (difPct <= -10) oportunidadScore = 30
    else if (difPct <= 5) oportunidadScore = 20
    else if (difPct <= 15) oportunidadScore = 10
  } else {
    // NEUTRAL (slider=3): Escala balanceada
    if (difPct <= -20) oportunidadScore = 35
    else if (difPct <= -10) oportunidadScore = 30
    else if (difPct <= 10) oportunidadScore = 25
    else if (difPct <= 20) oportunidadScore = 15
    else oportunidadScore = 10
  }

  score += oportunidadScore

  // 3. TRADE-OFFS (0 a 35)
  const medianaArea = MEDIANA_AREA_POR_DORMS[prop.dormitorios || 1] || 52
  const totalAmenidades = (prop.amenities_confirmados?.length || 0)

  // Trade-off 1: amenidades + precio
  let amenidadesPrecioBoost = 0
  if (datosUsuario.calidad_vs_precio <= 2 && totalAmenidades >= 5) {
    amenidadesPrecioBoost = 10
  }
  score += amenidadesPrecioBoost

  // Trade-off 2: amenidades vs metros
  let amenidadesMetrosBoost = 0
  if (datosUsuario.amenidades_vs_metros <= 2) {
    // Prioriza amenidades
    if (totalAmenidades >= 5) amenidadesMetrosBoost = 15
    else if (totalAmenidades >= 3) amenidadesMetrosBoost = 7
  } else if (datosUsuario.amenidades_vs_metros >= 4) {
    // Prioriza metros
    if ((prop.area_m2 || 0) > medianaArea) amenidadesMetrosBoost = 15
    else if ((prop.area_m2 || 0) > medianaArea * 0.9) amenidadesMetrosBoost = 7
  } else {
    // Balance (slider = 3)
    if (totalAmenidades >= 5) amenidadesMetrosBoost += 7
    if ((prop.area_m2 || 0) > medianaArea) amenidadesMetrosBoost += 7
  }
  score += amenidadesMetrosBoost

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
  }

  return score
}

export default function ResultadosV2() {
  const router = useRouter()
  const [propiedades, setPropiedades] = useState<UnidadRealConPrecioReal[]>([])
  const [loading, setLoading] = useState(true)
  const [datosContexto, setDatosContexto] = useState<{
    diasMedianaZona: number | null
    diasPromedioZona: number | null
  }>({ diasMedianaZona: null, diasPromedioZona: null })
  const [filtrosActivos, setFiltrosActivos] = useState<{
    presupuesto: number
    zonas: string[]
    dormitorios: number | null
    estado_entrega: string
  }>({
    presupuesto: 150000,
    zonas: [],
    dormitorios: null,
    estado_entrega: 'no_importa',
  })

  // Datos del formulario nivel 2 (completo)
  const [datosFormulario, setDatosFormulario] = useState<{
    innegociables: string[]
    innegociablesIds: string[]  // IDs originales para matching
    deseables: string[]
    necesitaParqueo: boolean
    necesitaBaulera: boolean
    calidadVsPrecio: number
    amenidadesVsMetros: number
    cantidadResultados: number | 'todas'
  }>({
    innegociables: [],
    innegociablesIds: [],
    deseables: [],
    necesitaParqueo: true,
    necesitaBaulera: false,
    calidadVsPrecio: 3,
    amenidadesVsMetros: 3,
    cantidadResultados: 'todas',
  })

  // Estado de favoritos
  const [selectedProps, setSelectedProps] = useState<Set<number>>(new Set())
  const MAX_SELECTED = 3

  // Estados de modales
  const [showMapa, setShowMapa] = useState(false)
  const [lightboxProp, setLightboxProp] = useState<{ prop: UnidadRealConPrecioReal; index: number } | null>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [propsParaInforme, setPropsParaInforme] = useState<UnidadRealConPrecioReal[]>([])
  const [showInformeModal, setShowInformeModal] = useState(false)
  const [informeHtml, setInformeHtml] = useState<string>('')
  const [loadingInforme, setLoadingInforme] = useState(false)
  const [leadData, setLeadData] = useState<{
    leadId: number
    codigoRef: string
    nombre: string
    whatsapp: string
  } | null>(null)

  // Estados para edición inline de filtros
  const [editingFilter, setEditingFilter] = useState<'presupuesto' | 'dormitorios' | 'zonas' | 'estado_entrega' | null>(null)
  const [tempPresupuesto, setTempPresupuesto] = useState<number>(150000)
  const [tempDormitorios, setTempDormitorios] = useState<number | null>(null)
  const [tempZonas, setTempZonas] = useState<string[]>([])
  const [tempEstadoEntrega, setTempEstadoEntrega] = useState<string>('no_importa')

  // Para cálculo de impacto MOAT
  const [impactoMOAT, setImpactoMOAT] = useState<{
    totalNuevo: number
    diferencia: number
    interpretacion: string
  } | null>(null)
  const [calculandoImpacto, setCalculandoImpacto] = useState(false)

  // Funciones de favoritos
  const toggleSelected = (propId: number) => {
    setSelectedProps(prev => {
      const next = new Set(prev)
      if (next.has(propId)) {
        next.delete(propId)
      } else if (next.size < MAX_SELECTED) {
        next.add(propId)
      }
      return next
    })
  }

  const isSelected = (propId: number) => selectedProps.has(propId)

  const getSelectedProperties = (): UnidadRealConPrecioReal[] => {
    return propiedades.filter(p => selectedProps.has(p.id))
  }

  const clearSelection = () => setSelectedProps(new Set())

  // Funcion para abrir lightbox
  const openLightbox = (prop: UnidadReal, index: number) => {
    // Buscar en propiedades para obtener la versión con precio real
    const propExtendida = propiedades.find(p => p.id === prop.id)
    if (propExtendida) {
      setLightboxProp({ prop: propExtendida, index })
    }
  }

  // Funcion para manejar ordenamiento completado
  const handleOrderComplete = (orderedIds: number[], reason: string) => {
    const ordenadas = orderedIds
      .map(id => propiedades.find(p => p.id === id))
      .filter((p): p is UnidadRealConPrecioReal => p !== undefined)
    setPropsParaInforme(ordenadas)
    setShowOrderModal(false)
    setShowFeedbackModal(true)
  }

  // Callback de exito del feedback
  const handleFeedbackSuccess = (newLeadId: number, newCodigoRef: string, nombre: string, whatsapp: string) => {
    setLeadData({ leadId: newLeadId, codigoRef: newCodigoRef, nombre, whatsapp })
    setShowFeedbackModal(false)
    verInforme(propsParaInforme, { leadId: newLeadId, codigoRef: newCodigoRef, nombre, whatsapp })
  }

  // Generar y mostrar informe
  const verInforme = async (
    props: UnidadRealConPrecioReal[],
    lead?: { leadId: number; codigoRef: string; nombre: string; whatsapp: string }
  ) => {
    setLoadingInforme(true)
    try {
      const response = await fetch('/api/informe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propiedades: props.map(p => ({
            id: p.id,
            proyecto: p.proyecto,
            precio_usd: p.precio_usd,
            precio_m2: p.precio_m2,
            area_m2: p.area_m2,
            dormitorios: p.dormitorios,
            banos: p.banos,
            desarrollador: p.desarrollador,
            zona: p.zona,
            fotos_urls: p.fotos_urls,
            posicion_mercado: p.posicion_mercado,
            dias_en_mercado: p.dias_en_mercado,
            estado_construccion: p.estado_construccion,
            estacionamientos: p.estacionamientos,
            baulera: p.baulera,
            amenities_lista: p.amenities_lista,
            razon_fiduciaria: p.razon_fiduciaria,
            // Datos del asesor para contacto
            asesor_nombre: p.asesor_nombre,
            asesor_wsp: p.asesor_wsp,
            asesor_inmobiliaria: p.asesor_inmobiliaria,
          })),
          datosUsuario: {
            presupuesto: filtrosActivos.presupuesto,
            dormitorios: filtrosActivos.dormitorios,
            zonas: filtrosActivos.zonas,
            innegociables: datosFormulario.innegociables,
            necesitaParqueo: datosFormulario.necesitaParqueo,
            necesitaBaulera: datosFormulario.necesitaBaulera,
          },
          lead: lead || leadData,
        }),
      })

      if (response.ok) {
        const html = await response.text()
        setInformeHtml(html)
        setShowInformeModal(true)
      } else {
        console.error('Error generando informe:', response.statusText)
      }
    } catch (err) {
      console.error('Error generando informe:', err)
    } finally {
      setLoadingInforme(false)
    }
  }

  // FIX: Unificar búsqueda y parseo en UN SOLO useEffect
  // Esto evita la condición de carrera donde fetchPropiedades usaba el estado inicial
  // antes de que se actualizara con los valores de la URL
  useEffect(() => {
    const cargarYBuscar = async () => {
      if (!router.isReady) return
      setLoading(true)

      // 1. Leer DIRECTAMENTE de router.query (no del estado)
      const {
        presupuesto,
        zonas,
        dormitorios,
        estado_entrega,
        innegociables,
        deseables,
        necesita_parqueo,
        necesita_baulera,
        calidad_vs_precio,
        amenidades_vs_metros,
        cantidad_resultados,
      } = router.query

      // 2. Construir filtros desde query params
      const filtros: FiltrosBusqueda = {
        precio_max: presupuesto ? parseInt(presupuesto as string) : 150000,
        limite: 50,
      }

      // Leer dormitorios DIRECTAMENTE de la URL (fix del bug)
      if (dormitorios) {
        filtros.dormitorios = parseInt(dormitorios as string)
      }

      const zonasArray = zonas ? (zonas as string).split(',').filter(Boolean) : []
      if (zonasArray.length > 0) {
        filtros.zonas_permitidas = zonasArray
      }

      const estadoEntregaValue = (estado_entrega as string) || 'no_importa'
      if (estadoEntregaValue !== 'no_importa') {
        filtros.estado_entrega = estadoEntregaValue as 'entrega_inmediata' | 'solo_preventa'
      }

      // Parsear preferencias del formulario nivel 2
      const innegociablesIds = innegociables ? (innegociables as string).split(',').filter(Boolean) : []
      const deseablesIds = deseables ? (deseables as string).split(',').filter(Boolean) : []
      const necesitaParqueoVal = necesita_parqueo === 'true'
      const necesitaBauleraVal = necesita_baulera === 'true'
      const calidadVsPrecioVal = calidad_vs_precio ? parseInt(calidad_vs_precio as string) : 3
      const amenidadesVsMetrosVal = amenidades_vs_metros ? parseInt(amenidades_vs_metros as string) : 3
      const cantidadResultadosVal = cantidad_resultados === 'todas' ? 'todas' : (cantidad_resultados ? parseInt(cantidad_resultados as string) : 'todas')

      // Costos estimados si no incluidos
      const COSTO_PARQUEO_ESTIMADO = 6000
      const COSTO_BAULERA_ESTIMADO = 3000

      try {
        // 3. Buscar con los filtros de la URL
        const resultados = await buscarUnidadesReales(filtros)

        // 4. Procesar resultados: calcular precio real y score
        const resultadosProcesados = resultados.map(prop => {
          // Calcular precio real ajustado por parqueo/baulera
          let precioReal = prop.precio_usd
          let ajusteParqueo = 0
          let ajusteBaulera = 0

          if (necesitaParqueoVal && prop.parqueo_incluido === false) {
            ajusteParqueo = prop.parqueo_precio_adicional || COSTO_PARQUEO_ESTIMADO
            precioReal += ajusteParqueo
          }
          if (necesitaBauleraVal && prop.baulera_incluido === false) {
            ajusteBaulera = prop.baulera_precio_adicional || COSTO_BAULERA_ESTIMADO
            precioReal += ajusteBaulera
          }

          // Calcular score MOAT completo (4 componentes)
          const datosUsuarioMOAT: DatosUsuarioMOAT = {
            innegociables: innegociablesIds,
            deseables: deseablesIds,
            calidad_vs_precio: calidadVsPrecioVal,
            amenidades_vs_metros: amenidadesVsMetrosVal,
          }

          const scoreMOAT = calcularScoreMOAT(prop, datosUsuarioMOAT)

          // Determinar si cumple innegociables (para ordenamiento)
          let cumpleInnegociables = true
          if (innegociablesIds.length > 0) {
            const amenidadesRequeridas = innegociablesToAmenidades(innegociablesIds)
            const confirmados = prop.amenities_confirmados || []
            const porVerificar = prop.amenities_por_verificar || []
            // Cumple si al menos tiene todos "por verificar" o confirmados
            cumpleInnegociables = amenidadesRequeridas.every(
              a => confirmados.includes(a) || porVerificar.includes(a)
            )
          }

          return {
            ...prop,
            precioReal,
            ajusteParqueo,
            ajusteBaulera,
            scoreTotal: scoreMOAT,
            cumpleInnegociables,
          }
        })

        // 5. Ordenar: primero los que cumplen innegociables, luego por score
        resultadosProcesados.sort((a, b) => {
          // Primero: los que cumplen innegociables
          if (a.cumpleInnegociables && !b.cumpleInnegociables) return -1
          if (!a.cumpleInnegociables && b.cumpleInnegociables) return 1
          // Segundo: por score total
          return b.scoreTotal - a.scoreTotal
        })

        // 6. Limitar por cantidad_resultados
        const limite = cantidadResultadosVal === 'todas' ? resultadosProcesados.length : cantidadResultadosVal
        const resultadosLimitados = resultadosProcesados.slice(0, limite)

        setPropiedades(resultadosLimitados)

        // 7. Calcular mediana y promedio de días desde los resultados
        const diasValidos = resultadosLimitados
          .map(r => r.dias_en_mercado)
          .filter((d): d is number => d !== null && d !== undefined)

        if (diasValidos.length > 0) {
          const diasPromedio = Math.round(diasValidos.reduce((a, b) => a + b, 0) / diasValidos.length)
          const diasOrdenados = [...diasValidos].sort((a, b) => a - b)
          const diasMediana = Math.round(diasOrdenados[Math.floor(diasOrdenados.length / 2)])
          setDatosContexto({ diasMedianaZona: diasMediana, diasPromedioZona: diasPromedio })
        }
      } catch (err) {
        console.error('Error fetching propiedades:', err)
      } finally {
        setLoading(false)
      }

      // 4. DESPUÉS de buscar, actualizar el estado para la UI (chips, etc.)
      setFiltrosActivos({
        presupuesto: presupuesto ? parseInt(presupuesto as string) : 150000,
        zonas: zonasArray,
        dormitorios: dormitorios ? parseInt(dormitorios as string) : null,
        estado_entrega: estadoEntregaValue,
      })

      // 8. Actualizar estado de datosFormulario para la UI
      const innegociablesNombres = innegociablesIds.map(id => INNEGOCIABLE_TO_AMENIDAD[id] || id)
      const deseablesNombres = deseablesIds.map(id => INNEGOCIABLE_TO_AMENIDAD[id] || id)

      setDatosFormulario({
        innegociables: innegociablesNombres,
        innegociablesIds,
        deseables: deseablesNombres,
        necesitaParqueo: necesitaParqueoVal,
        necesitaBaulera: necesitaBauleraVal,
        calidadVsPrecio: calidadVsPrecioVal,
        amenidadesVsMetros: amenidadesVsMetrosVal,
        cantidadResultados: cantidadResultadosVal,
      })
    }

    cargarYBuscar()
  }, [router.isReady, router.query])

  // Build filter chips
  const buildFilterChips = () => {
    const chips: { label: string; value: string; onRemove: () => void }[] = []

    if (filtrosActivos.presupuesto !== 150000) {
      chips.push({
        label: `Hasta $${(filtrosActivos.presupuesto / 1000).toFixed(0)}k`,
        value: 'presupuesto',
        onRemove: () => updateFiltro('presupuesto', 150000),
      })
    }

    if (filtrosActivos.dormitorios !== null) {
      chips.push({
        label: formatDorms(filtrosActivos.dormitorios),
        value: 'dormitorios',
        onRemove: () => updateFiltro('dormitorios', null),
      })
    }

    filtrosActivos.zonas.forEach((zona) => {
      const zonaLabel = {
        equipetrol: 'Eq. Centro',
        sirari: 'Sirari',
        equipetrol_norte: 'Eq. Norte',
        villa_brigida: 'Villa Brigida',
        faremafu: 'Eq. Oeste',
      }[zona] || zona

      chips.push({
        label: zonaLabel,
        value: zona,
        onRemove: () => {
          const newZonas = filtrosActivos.zonas.filter((z) => z !== zona)
          updateFiltro('zonas', newZonas)
        },
      })
    })

    if (filtrosActivos.estado_entrega !== 'no_importa') {
      const label = filtrosActivos.estado_entrega === 'entrega_inmediata' ? 'Entrega inmediata' : 'Solo preventa'
      chips.push({
        label,
        value: 'estado_entrega',
        onRemove: () => updateFiltro('estado_entrega', 'no_importa'),
      })
    }

    return chips
  }

  // Update filtro and URL
  const updateFiltro = (key: string, value: any) => {
    const newFiltros = { ...filtrosActivos, [key]: value }
    setFiltrosActivos(newFiltros)

    // Update URL preservando params del formulario
    const params = new URLSearchParams({
      presupuesto: newFiltros.presupuesto.toString(),
      zonas: Array.isArray(newFiltros.zonas) ? newFiltros.zonas.join(',') : '',
      dormitorios: newFiltros.dormitorios?.toString() || '',
      estado_entrega: newFiltros.estado_entrega,
    })

    router.replace(`/resultados-v2?${params.toString()}`, undefined, { shallow: true })
  }

  // Iniciar edición de un filtro
  const startEditing = (filter: 'presupuesto' | 'dormitorios' | 'zonas' | 'estado_entrega') => {
    // Copiar valores actuales a temporales
    if (filter === 'presupuesto') {
      setTempPresupuesto(filtrosActivos.presupuesto)
    } else if (filter === 'dormitorios') {
      setTempDormitorios(filtrosActivos.dormitorios)
    } else if (filter === 'zonas') {
      setTempZonas([...filtrosActivos.zonas])
    } else if (filter === 'estado_entrega') {
      setTempEstadoEntrega(filtrosActivos.estado_entrega)
    }
    setEditingFilter(filter)
    setImpactoMOAT(null)
  }

  // Aplicar filtros editados
  const aplicarFiltros = () => {
    const params = new URLSearchParams()

    // Usar temporal si editando, sino valor actual
    params.set('presupuesto', editingFilter === 'presupuesto'
      ? tempPresupuesto.toString()
      : filtrosActivos.presupuesto.toString())

    const newDorms = editingFilter === 'dormitorios' ? tempDormitorios : filtrosActivos.dormitorios
    if (newDorms !== null) params.set('dormitorios', newDorms.toString())

    const newZonas = editingFilter === 'zonas' ? tempZonas : filtrosActivos.zonas
    if (newZonas.length > 0) params.set('zonas', newZonas.join(','))

    const newEstado = editingFilter === 'estado_entrega' ? tempEstadoEntrega : filtrosActivos.estado_entrega
    if (newEstado !== 'no_importa') params.set('estado_entrega', newEstado)

    // CRÍTICO: Preservar params del formulario nivel 2
    const { innegociables, necesita_parqueo, necesita_baulera } = router.query
    if (innegociables) params.set('innegociables', innegociables as string)
    if (necesita_parqueo) params.set('necesita_parqueo', necesita_parqueo as string)
    if (necesita_baulera) params.set('necesita_baulera', necesita_baulera as string)

    setEditingFilter(null)
    router.push(`/resultados-v2?${params.toString()}`)
  }

  // Calcular impacto MOAT cuando cambian valores temporales
  useEffect(() => {
    if (!editingFilter) return

    const calcular = async () => {
      setCalculandoImpacto(true)
      try {
        const filtros: FiltrosBusqueda = {
          precio_max: editingFilter === 'presupuesto' ? tempPresupuesto : filtrosActivos.presupuesto,
          limite: 50,
        }

        const dorms = editingFilter === 'dormitorios' ? tempDormitorios : filtrosActivos.dormitorios
        if (dorms !== null) filtros.dormitorios = dorms

        const zonas = editingFilter === 'zonas' ? tempZonas : filtrosActivos.zonas
        if (zonas.length > 0) filtros.zonas_permitidas = zonas

        const estado = editingFilter === 'estado_entrega' ? tempEstadoEntrega : filtrosActivos.estado_entrega
        if (estado !== 'no_importa') filtros.estado_entrega = estado as 'entrega_inmediata' | 'solo_preventa'

        const resultado = await buscarUnidadesReales(filtros)

        // Interpretación según filtro
        let interpretacion = ''
        if (editingFilter === 'presupuesto') {
          if (resultado.length >= 30) interpretacion = 'Accedes a buena parte del mercado'
          else if (resultado.length >= 15) interpretacion = 'Rango competitivo'
          else interpretacion = 'Opciones limitadas'
        } else if (editingFilter === 'dormitorios') {
          if (resultado.length >= 15) interpretacion = 'Buena oferta'
          else if (resultado.length >= 5) interpretacion = 'Stock moderado'
          else interpretacion = 'Pocas opciones'
        } else if (editingFilter === 'zonas') {
          interpretacion = tempZonas.length === 0 ? 'Todas las zonas' : `${tempZonas.length} zona(s)`
        } else if (editingFilter === 'estado_entrega') {
          if (tempEstadoEntrega === 'no_importa') interpretacion = 'Todo el mercado'
          else if (tempEstadoEntrega === 'solo_preventa') interpretacion = 'Mejores precios, esperar entrega'
          else interpretacion = 'Listo para mudarte'
        }

        setImpactoMOAT({
          totalNuevo: resultado.length,
          diferencia: resultado.length - propiedades.length,
          interpretacion
        })
      } catch (e) {
        setImpactoMOAT(null)
      }
      setCalculandoImpacto(false)
    }

    const timer = setTimeout(calcular, 300)
    return () => clearTimeout(timer)
  }, [editingFilter, tempPresupuesto, tempDormitorios, tempZonas, tempEstadoEntrega, filtrosActivos, propiedades.length])

  // TOP 3 and rest
  const top3 = propiedades.slice(0, 3)
  const alternativas = propiedades.slice(3)

  return (
    <>
      <Head>
        <title>Resultados | Simon - Inteligencia Inmobiliaria</title>
        <meta name="description" content="Resultados de busqueda de departamentos en Equipetrol" />
      </Head>

      <style jsx global>{premiumFonts}</style>

      <div className="min-h-screen bg-[#f8f6f3]">
        {/* Navbar */}
        <nav className="fixed top-0 w-full z-50 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-white/10">
          <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
            <Link href="/landing-v2" className="font-display text-2xl text-white tracking-tight">
              Simon
            </Link>
            <Link
              href="/landing-v2"
              className="bg-white text-[#0a0a0a] px-6 py-2 text-xs tracking-[2px] uppercase hover:bg-[#c9a959] hover:text-white transition-all"
            >
              Nueva busqueda
            </Link>
          </div>
        </nav>

        {/* Results Header */}
        <div className="pt-20">
          <ResultsHeaderPremium
            count={propiedades.length}
            filtros={buildFilterChips()}
            onEditarFiltros={() => startEditing('presupuesto')}
          />
        </div>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-8 py-12">
          {/* Sección Tu Búsqueda - Edición Inline */}
          <div className="bg-[#0a0a0a] rounded-lg border border-white/10 p-4 mb-8">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#c9a959] text-sm tracking-[2px] uppercase">Tu Busqueda</span>
              <Link
                href={`/filtros-v2?presupuesto=${filtrosActivos.presupuesto}&zonas=${filtrosActivos.zonas.join(',')}&dormitorios=${filtrosActivos.dormitorios ?? ''}&estado_entrega=${filtrosActivos.estado_entrega}&innegociables=${datosFormulario.innegociablesIds.join(',')}&deseables=${datosFormulario.deseables.join(',')}&necesita_parqueo=${datosFormulario.necesitaParqueo}&necesita_baulera=${datosFormulario.necesitaBaulera}&calidad_vs_precio=${datosFormulario.calidadVsPrecio}&amenidades_vs_metros=${datosFormulario.amenidadesVsMetros}&cantidad_resultados=${datosFormulario.cantidadResultados}`}
                className="text-white/40 hover:text-[#c9a959] text-sm transition-colors"
              >
                Editar todo →
              </Link>
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Chip PRESUPUESTO */}
              {editingFilter === 'presupuesto' ? (
                <div className="w-full bg-[#1a1a1a] border border-[#c9a959] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white font-medium flex items-center gap-2"><IconDollar /> Presupuesto</span>
                    <button onClick={() => setEditingFilter(null)}><IconClose /></button>
                  </div>
                  <div className="flex items-center justify-between text-white/40 text-xs mb-2">
                    <span>$50k</span>
                    <span>$500k</span>
                  </div>
                  <input
                    type="range"
                    min={50000}
                    max={500000}
                    step={10000}
                    value={tempPresupuesto}
                    onChange={(e) => setTempPresupuesto(Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer mb-3
                               [&::-webkit-slider-thumb]:appearance-none
                               [&::-webkit-slider-thumb]:w-4
                               [&::-webkit-slider-thumb]:h-4
                               [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-white
                               [&::-webkit-slider-thumb]:cursor-pointer
                               [&::-webkit-slider-thumb]:border-2
                               [&::-webkit-slider-thumb]:border-[#c9a959]"
                  />
                  <div className="text-center mb-4">
                    <span className="font-display text-2xl text-white">Hasta ${(tempPresupuesto/1000).toFixed(0)}k</span>
                  </div>
                  {/* Impacto MOAT */}
                  <div className="text-white/60 text-sm mb-4">
                    {calculandoImpacto ? (
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
                        Calculando...
                      </span>
                    ) : impactoMOAT ? (
                      <span>
                        <span className="text-[#c9a959] font-semibold">{impactoMOAT.totalNuevo}</span> propiedades
                        {impactoMOAT.diferencia !== 0 && (
                          <span className={impactoMOAT.diferencia > 0 ? 'text-green-400' : 'text-amber-400'}>
                            {' '}({impactoMOAT.diferencia > 0 ? '+' : ''}{impactoMOAT.diferencia})
                          </span>
                        )}
                        <span className="ml-2 text-white/40">· {impactoMOAT.interpretacion}</span>
                      </span>
                    ) : null}
                  </div>
                  <button
                    onClick={aplicarFiltros}
                    disabled={calculandoImpacto}
                    className="w-full py-2 bg-white text-[#0a0a0a] text-sm tracking-[1px] uppercase hover:bg-[#c9a959] hover:text-white transition-all disabled:opacity-50"
                  >
                    Aplicar cambio
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEditing('presupuesto')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-[#c9a959]/20 border border-white/10 hover:border-[#c9a959] rounded-full transition-all"
                >
                  <IconDollar />
                  <span className="text-white">Hasta ${(filtrosActivos.presupuesto/1000).toFixed(0)}k</span>
                  <IconEdit />
                </button>
              )}

              {/* Chip DORMITORIOS */}
              {editingFilter === 'dormitorios' ? (
                <div className="w-full bg-[#1a1a1a] border border-[#c9a959] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white font-medium flex items-center gap-2"><IconBed /> Dormitorios</span>
                    <button onClick={() => setEditingFilter(null)}><IconClose /></button>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {DORMITORIOS_PREMIUM.map(d => (
                      <button
                        key={d.value ?? 'todos'}
                        onClick={() => setTempDormitorios(d.value)}
                        className={`px-4 py-2 border transition-all ${
                          tempDormitorios === d.value
                            ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                            : 'border-white/10 text-white/60 hover:border-[#c9a959]/50'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  {/* Impacto MOAT */}
                  <div className="text-white/60 text-sm mb-4">
                    {calculandoImpacto ? (
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
                        Calculando...
                      </span>
                    ) : impactoMOAT ? (
                      <span>
                        <span className="text-[#c9a959] font-semibold">{impactoMOAT.totalNuevo}</span> propiedades · {impactoMOAT.interpretacion}
                      </span>
                    ) : null}
                  </div>
                  <button
                    onClick={aplicarFiltros}
                    disabled={calculandoImpacto}
                    className="w-full py-2 bg-white text-[#0a0a0a] text-sm tracking-[1px] uppercase hover:bg-[#c9a959] hover:text-white transition-all disabled:opacity-50"
                  >
                    Aplicar cambio
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEditing('dormitorios')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-[#c9a959]/20 border border-white/10 hover:border-[#c9a959] rounded-full transition-all"
                >
                  <IconBed />
                  <span className="text-white">{formatDorms(filtrosActivos.dormitorios)}</span>
                  <IconEdit />
                </button>
              )}

              {/* Chip ZONAS */}
              {editingFilter === 'zonas' ? (
                <div className="w-full bg-[#1a1a1a] border border-[#c9a959] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white font-medium flex items-center gap-2"><IconPin /> Zonas</span>
                    <button onClick={() => setEditingFilter(null)}><IconClose /></button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                    {ZONAS_PREMIUM.map(z => (
                      <button
                        key={z.id}
                        onClick={() => setTempZonas(prev =>
                          prev.includes(z.id)
                            ? prev.filter(x => x !== z.id)
                            : [...prev, z.id]
                        )}
                        className={`p-2 border transition-all text-sm ${
                          tempZonas.includes(z.id)
                            ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                            : 'border-white/10 text-white/60 hover:border-[#c9a959]/50'
                        }`}
                      >
                        {z.label}
                      </button>
                    ))}
                  </div>
                  {tempZonas.length === 0 && (
                    <p className="text-white/30 text-xs mb-4">Sin seleccion = todas las zonas</p>
                  )}
                  {/* Impacto MOAT */}
                  <div className="text-white/60 text-sm mb-4">
                    {calculandoImpacto ? (
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
                        Calculando...
                      </span>
                    ) : impactoMOAT ? (
                      <span>
                        <span className="text-[#c9a959] font-semibold">{impactoMOAT.totalNuevo}</span> propiedades · {impactoMOAT.interpretacion}
                      </span>
                    ) : null}
                  </div>
                  <button
                    onClick={aplicarFiltros}
                    disabled={calculandoImpacto}
                    className="w-full py-2 bg-white text-[#0a0a0a] text-sm tracking-[1px] uppercase hover:bg-[#c9a959] hover:text-white transition-all disabled:opacity-50"
                  >
                    Aplicar cambio
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEditing('zonas')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-[#c9a959]/20 border border-white/10 hover:border-[#c9a959] rounded-full transition-all"
                >
                  <IconPin />
                  <span className="text-white">
                    {filtrosActivos.zonas.length === 0
                      ? 'Todas las zonas'
                      : filtrosActivos.zonas.length === 1
                        ? ZONAS_PREMIUM.find(z => z.id === filtrosActivos.zonas[0])?.label || filtrosActivos.zonas[0]
                        : `${filtrosActivos.zonas.length} zonas`}
                  </span>
                  <IconEdit />
                </button>
              )}

              {/* Chip ESTADO ENTREGA */}
              {editingFilter === 'estado_entrega' ? (
                <div className="w-full bg-[#1a1a1a] border border-[#c9a959] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white font-medium flex items-center gap-2"><IconBuilding /> Entrega</span>
                    <button onClick={() => setEditingFilter(null)}><IconClose /></button>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {ESTADO_ENTREGA_PREMIUM.map(e => (
                      <button
                        key={e.value}
                        onClick={() => setTempEstadoEntrega(e.value)}
                        className={`px-4 py-2 border transition-all ${
                          tempEstadoEntrega === e.value
                            ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                            : 'border-white/10 text-white/60 hover:border-[#c9a959]/50'
                        }`}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                  {/* Impacto MOAT */}
                  <div className="text-white/60 text-sm mb-4">
                    {calculandoImpacto ? (
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
                        Calculando...
                      </span>
                    ) : impactoMOAT ? (
                      <span>
                        <span className="text-[#c9a959] font-semibold">{impactoMOAT.totalNuevo}</span> propiedades · {impactoMOAT.interpretacion}
                      </span>
                    ) : null}
                  </div>
                  <button
                    onClick={aplicarFiltros}
                    disabled={calculandoImpacto}
                    className="w-full py-2 bg-white text-[#0a0a0a] text-sm tracking-[1px] uppercase hover:bg-[#c9a959] hover:text-white transition-all disabled:opacity-50"
                  >
                    Aplicar cambio
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEditing('estado_entrega')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-[#c9a959]/20 border border-white/10 hover:border-[#c9a959] rounded-full transition-all"
                >
                  <IconBuilding />
                  <span className="text-white">
                    {filtrosActivos.estado_entrega === 'entrega_inmediata' ? 'Entrega inmediata' :
                     filtrosActivos.estado_entrega === 'solo_preventa' ? 'Solo preventa' :
                     'Todo el mercado'}
                  </span>
                  <IconEdit />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : propiedades.length === 0 ? (
            <div className="text-center py-20">
              <p className="font-display text-3xl text-[#0a0a0a] mb-4">Sin resultados</p>
              <p className="text-[#666666] mb-8">Intenta ampliar tus filtros para ver mas opciones</p>
              <button
                onClick={() => startEditing('presupuesto')}
                className="inline-block bg-[#0a0a0a] text-white px-8 py-4 text-xs tracking-[2px] uppercase hover:bg-[#c9a959] transition-colors"
              >
                Editar filtros
              </button>
            </div>
          ) : (
            <>
              {/* TOP 3 */}
              {top3.length > 0 && (
                <section className="mb-16">
                  <div className="flex items-center gap-4 mb-8">
                    <span className="w-8 h-px bg-[#c9a959]" />
                    <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">
                      Top {Math.min(3, top3.length)} recomendados
                    </span>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {top3.map((prop, i) => (
                      <PropertyCardPremium
                        key={prop.id}
                        propiedad={prop}
                        rank={i + 1}
                        datosContexto={datosContexto}
                        innegociablesUsuario={datosFormulario.innegociables}
                        deseablesUsuario={datosFormulario.deseables}
                        usuarioNecesitaParqueo={datosFormulario.necesitaParqueo}
                        usuarioNecesitaBaulera={datosFormulario.necesitaBaulera}
                        isSelected={isSelected(prop.id)}
                        onToggleSelected={toggleSelected}
                        onOpenLightbox={openLightbox}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Alternativas */}
              {alternativas.length > 0 && (
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <span className="w-8 h-px bg-[#0a0a0a]/30" />
                    <span className="text-[#666666] text-[0.7rem] tracking-[3px] uppercase">
                      {alternativas.length} alternativas
                    </span>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {alternativas.map((prop) => (
                      <PropertyCardPremium
                        key={prop.id}
                        propiedad={prop}
                        datosContexto={datosContexto}
                        innegociablesUsuario={datosFormulario.innegociables}
                        deseablesUsuario={datosFormulario.deseables}
                        usuarioNecesitaParqueo={datosFormulario.necesitaParqueo}
                        usuarioNecesitaBaulera={datosFormulario.necesitaBaulera}
                        isSelected={isSelected(prop.id)}
                        onToggleSelected={toggleSelected}
                        onOpenLightbox={openLightbox}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer className={`bg-[#0a0a0a] border-t border-white/10 py-12 mt-20 ${selectedProps.size > 0 ? 'pb-32' : ''}`}>
          <div className="max-w-6xl mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/landing-v2" className="font-display text-2xl text-white tracking-tight">
              Simon
            </Link>
            <p className="text-white/40 text-sm">
              {new Date().getFullYear()} Simon. Inteligencia Inmobiliaria.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-white/40 hover:text-white text-sm transition-colors">
                Terminos
              </a>
              <a href="#" className="text-white/40 hover:text-white text-sm transition-colors">
                Privacidad
              </a>
            </div>
          </div>
        </footer>

        {/* Map floating button */}
        {propiedades.some(p => p.latitud && p.longitud) && !showMapa && !lightboxProp && !showOrderModal && (
          <button
            onClick={() => setShowMapa(true)}
            className="fixed bottom-24 right-8 z-40 bg-[#0a0a0a] border border-white/20 px-6 py-3 flex items-center gap-3 hover:border-[#c9a959] transition-colors shadow-lg"
          >
            <svg className="w-5 h-5 text-[#c9a959]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span className="text-white text-sm tracking-[1px] uppercase">Ver mapa</span>
          </button>
        )}

        {/* Favorites progress bar */}
        <FavoritesProgressBarPremium
          selectedCount={selectedProps.size}
          maxSelected={MAX_SELECTED}
          selectedProperties={getSelectedProperties()}
          onViewAnalysis={() => setShowOrderModal(true)}
          onClearSelection={clearSelection}
        />
      </div>

      {/* Mapa fullscreen */}
      {showMapa && (
        <MapaResultados
          propiedades={propiedades.map(p => ({
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
            sintesisFiduciaria: null
          }))}
          selectedIds={selectedProps}
          maxSelected={MAX_SELECTED}
          onClose={() => setShowMapa(false)}
          onToggleSelected={toggleSelected}
        />
      )}

      {/* Lightbox fotos */}
      {lightboxProp && (
        <LightboxPremium
          propiedad={lightboxProp.prop}
          initialIndex={lightboxProp.index}
          onClose={() => setLightboxProp(null)}
        />
      )}

      {/* Modal ordenar favoritas */}
      {showOrderModal && selectedProps.size >= MAX_SELECTED && (
        <OrderFavoritesPremium
          properties={getSelectedProperties()}
          onComplete={handleOrderComplete}
          onClose={() => setShowOrderModal(false)}
        />
      )}

      {/* Modal feedback premium */}
      <FeedbackPremiumModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        onSuccess={handleFeedbackSuccess}
        formularioRaw={{
          presupuesto: filtrosActivos.presupuesto,
          dormitorios: filtrosActivos.dormitorios,
          zonas: filtrosActivos.zonas,
          estado_entrega: filtrosActivos.estado_entrega,
          innegociables: datosFormulario.innegociables,
          necesitaParqueo: datosFormulario.necesitaParqueo,
          necesitaBaulera: datosFormulario.necesitaBaulera,
          propiedadesSeleccionadas: propsParaInforme.map(p => p.id),
        }}
      />

      {/* Modal informe premium */}
      {showInformeModal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0a0a0a] to-[#1a1a1a] border-b border-[#c9a959]/30 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-display text-2xl text-white">Simon</span>
              <span className="text-[#c9a959] text-sm tracking-[2px] uppercase">Tu Informe Premium</span>
            </div>
            <div className="flex items-center gap-4">
              {leadData && (
                <span className="text-white/60 text-sm">
                  Codigo: <span className="text-[#c9a959]">#{leadData.codigoRef}</span>
                </span>
              )}
              <button
                onClick={() => setShowInformeModal(false)}
                className="w-10 h-10 border border-white/20 hover:border-[#c9a959] text-white hover:text-[#c9a959] flex items-center justify-center transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Iframe con el informe */}
          <div className="flex-1 overflow-hidden">
            {loadingInforme ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <iframe
                srcDoc={informeHtml}
                className="w-full h-full border-0 bg-white"
                title="Informe Premium"
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
