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

export default function ResultadosV2() {
  const router = useRouter()
  const [propiedades, setPropiedades] = useState<UnidadReal[]>([])
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

  // Datos del formulario nivel 2
  const [datosFormulario, setDatosFormulario] = useState<{
    innegociables: string[]
    necesitaParqueo: boolean
    necesitaBaulera: boolean
  }>({
    innegociables: [],
    necesitaParqueo: true,
    necesitaBaulera: false,
  })

  // Estado de favoritos
  const [selectedProps, setSelectedProps] = useState<Set<number>>(new Set())
  const MAX_SELECTED = 3

  // Estados de modales
  const [showMapa, setShowMapa] = useState(false)
  const [lightboxProp, setLightboxProp] = useState<{ prop: UnidadReal; index: number } | null>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [propsParaInforme, setPropsParaInforme] = useState<UnidadReal[]>([])
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

  const getSelectedProperties = (): UnidadReal[] => {
    return propiedades.filter(p => selectedProps.has(p.id))
  }

  const clearSelection = () => setSelectedProps(new Set())

  // Funcion para abrir lightbox
  const openLightbox = (prop: UnidadReal, index: number) => {
    setLightboxProp({ prop, index })
  }

  // Funcion para manejar ordenamiento completado
  const handleOrderComplete = (orderedIds: number[], reason: string) => {
    const ordenadas = orderedIds
      .map(id => propiedades.find(p => p.id === id))
      .filter((p): p is UnidadReal => p !== undefined)
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
    props: UnidadReal[],
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
        necesita_parqueo,
        necesita_baulera,
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

      try {
        // 3. Buscar con los filtros de la URL
        const resultados = await buscarUnidadesReales(filtros)
        setPropiedades(resultados)

        // 4. Calcular mediana y promedio de días desde los resultados
        const diasValidos = resultados
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

      // 5. Parsear datos del formulario nivel 2
      const innegociablesIds = innegociables ? (innegociables as string).split(',').filter(Boolean) : []
      const innegociablesNombres = innegociablesIds.map(id => INNEGOCIABLE_TO_AMENIDAD[id] || id)

      setDatosFormulario({
        innegociables: innegociablesNombres,
        necesitaParqueo: necesita_parqueo === 'true',
        necesitaBaulera: necesita_baulera === 'true',
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
            <div className="flex items-center gap-6">
              <button
                onClick={() => editingFilter ? setEditingFilter(null) : startEditing('presupuesto')}
                className="text-white/50 hover:text-white text-sm transition-colors"
              >
                {editingFilter ? 'Cerrar filtros' : 'Editar filtros'}
              </button>
              <Link
                href="/landing-v2"
                className="bg-white text-[#0a0a0a] px-6 py-2 text-xs tracking-[2px] uppercase hover:bg-[#c9a959] hover:text-white transition-all"
              >
                Nueva busqueda
              </Link>
            </div>
          </div>
        </nav>

        {/* Panel de edición inline de filtros */}
        {editingFilter && (
          <div className="fixed top-[73px] left-0 right-0 z-40 bg-[#0a0a0a] border-b border-[#c9a959]/30 py-6">
            <div className="max-w-4xl mx-auto px-8">
              {/* Tabs de filtros */}
              <div className="flex gap-2 mb-6 flex-wrap">
                {(['presupuesto', 'dormitorios', 'zonas', 'estado_entrega'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => startEditing(f)}
                    className={`px-4 py-2 text-sm transition-all ${
                      editingFilter === f
                        ? 'bg-[#c9a959]/20 border-[#c9a959] text-white'
                        : 'border-white/10 text-white/50 hover:text-white'
                    } border`}
                  >
                    {f === 'presupuesto' && '💰 Presupuesto'}
                    {f === 'dormitorios' && '🛏️ Dormitorios'}
                    {f === 'zonas' && '📍 Zonas'}
                    {f === 'estado_entrega' && '🏗️ Entrega'}
                  </button>
                ))}
              </div>

              {/* Contenido según filtro activo */}
              {editingFilter === 'presupuesto' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-white/40 text-sm mb-2">
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
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer
                               [&::-webkit-slider-thumb]:appearance-none
                               [&::-webkit-slider-thumb]:w-4
                               [&::-webkit-slider-thumb]:h-4
                               [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-white
                               [&::-webkit-slider-thumb]:cursor-pointer
                               [&::-webkit-slider-thumb]:border-2
                               [&::-webkit-slider-thumb]:border-[#c9a959]"
                  />
                  <div className="text-center">
                    <span className="font-display text-4xl text-white">
                      Hasta ${(tempPresupuesto/1000).toFixed(0)}k
                    </span>
                  </div>
                </div>
              )}

              {editingFilter === 'dormitorios' && (
                <div className="flex justify-center gap-3 flex-wrap">
                  {DORMITORIOS_PREMIUM.map(d => (
                    <button
                      key={d.value ?? 'todos'}
                      onClick={() => setTempDormitorios(d.value)}
                      className={`px-6 py-3 border transition-all ${
                        tempDormitorios === d.value
                          ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                          : 'border-white/10 text-white/60 hover:border-[#c9a959]/50'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}

              {editingFilter === 'zonas' && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {ZONAS_PREMIUM.map(z => (
                    <button
                      key={z.id}
                      onClick={() => setTempZonas(prev =>
                        prev.includes(z.id)
                          ? prev.filter(x => x !== z.id)
                          : [...prev, z.id]
                      )}
                      className={`p-3 border transition-all ${
                        tempZonas.includes(z.id)
                          ? 'border-[#c9a959] bg-[#c9a959]/10'
                          : 'border-white/10 hover:border-[#c9a959]/50'
                      }`}
                    >
                      <span className="text-white text-sm">{z.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {editingFilter === 'estado_entrega' && (
                <div className="flex justify-center gap-3 flex-wrap">
                  {ESTADO_ENTREGA_PREMIUM.map(e => (
                    <button
                      key={e.value}
                      onClick={() => setTempEstadoEntrega(e.value)}
                      className={`px-6 py-3 border transition-all ${
                        tempEstadoEntrega === e.value
                          ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                          : 'border-white/10 text-white/60 hover:border-[#c9a959]/50'
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Impacto MOAT + Botón Aplicar */}
              <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
                <div className="text-white/60 text-sm">
                  {calculandoImpacto ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
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
                  className="bg-white text-[#0a0a0a] px-8 py-3 text-xs tracking-[2px] uppercase hover:bg-[#c9a959] hover:text-white transition-all disabled:opacity-50"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results Header */}
        <div className={editingFilter ? 'pt-64' : 'pt-20'}>
          <ResultsHeaderPremium
            count={propiedades.length}
            filtros={buildFilterChips()}
            onEditarFiltros={() => startEditing('presupuesto')}
          />
        </div>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-8 py-12">
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
