import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { normalizarPrecio } from '@/lib/precio-utils'
import { ZONAS_ADMIN_FILTER, getZonaLabel } from '@/lib/zonas'

// Supabase RPC/query results — no codegen, typed at usage boundaries
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseRow = Record<string, any>

interface Propiedad {
  id: number
  proyecto: string
  desarrollador: string | null
  zona: string
  microzona: string | null
  dormitorios: number
  banos: number
  precio_usd: number
  precio_m2: number
  area_m2: number
  score_calidad: number
  asesor_nombre: string | null
  asesor_wsp: string | null
  asesor_inmobiliaria: string | null
  fotos_urls: string[]
  cantidad_fotos: number
  url: string
  amenities_confirmados: string[] | null
  amenities_por_verificar: string[] | null
  equipamiento_detectado: string[] | null
  estado_construccion: string
  latitud: number | null
  longitud: number | null
  estacionamientos: number | null
  baulera: boolean | null
  dias_en_mercado: number | null
  // Forma de pago
  piso: number | null
  plan_pagos_desarrollador: boolean | null
  acepta_permuta: boolean | null
  solo_tc_paralelo: boolean | null
  precio_negociable: boolean | null
  descuento_contado_pct: number | null
  // Parqueo/baulera con precios
  parqueo_incluido: boolean | null
  parqueo_precio_adicional: number | null
  baulera_incluido: boolean | null
  baulera_precio_adicional: number | null
  // Alquileres
  precio_mensual_bob: number | null
}

interface CamposBloqueados {
  [key: string]: {
    bloqueado: boolean
    por: string
    usuario_nombre: string
    fecha: string
  } | boolean
}

interface PropiedadConCandados extends Propiedad {
  campos_bloqueados?: CamposBloqueados
  fuente?: string
  id_proyecto_master?: number | null
  fecha_publicacion?: string | null
  // Campos de normalización
  precio_usd_original?: number | null
  moneda_original?: string | null
  tipo_cambio_detectado?: string | null
  tipo_cambio_usado?: number | null
}

// IDs = valores exactos de proyectos_master.zona (para filtrar en RPC)
// Labels = nombres amigables para mostrar al usuario
const ZONAS = ZONAS_ADMIN_FILTER

interface ProyectoOption {
  id: number
  nombre: string
  desarrollador: string | null
}

interface BrokerOption {
  nombre: string
  inmobiliaria: string | null
  cantidad: number
}

const FILTROS_STORAGE_KEY = 'admin_propiedades_filtros'

function getSavedFilters() {
  if (typeof window === 'undefined') return null
  try {
    const saved = sessionStorage.getItem(FILTROS_STORAGE_KEY)
    if (!saved) return null
    const parsed = JSON.parse(saved)
    // Migrar formato viejo: zona string → zonas array, dormitorios 'todos' → ''
    if (typeof parsed.zona === 'string' && !parsed.zonas) {
      parsed.zonas = parsed.zona ? [parsed.zona] : []
      delete parsed.zona
    }
    if (parsed.dormitorios === 'todos') parsed.dormitorios = ''
    return parsed
  } catch { return null }
}

export default function AdminPropiedades() {
  const { admin, loading: authLoading, error: authError } = useAdminAuth(['super_admin'])
  const router = useRouter()
  const [propiedades, setPropiedades] = useState<PropiedadConCandados[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tcParalelo, setTcParalelo] = useState(0)

  // Restaurar filtros de sessionStorage
  const saved = typeof window !== 'undefined' ? getSavedFilters() : null

  // Tab Venta/Alquiler
  const [tipoOperacion, setTipoOperacion] = useState<'venta' | 'alquiler'>(saved?.tipoOperacion ?? 'venta')

  // Filtros
  const [zonas, setZonas] = useState<string[]>(saved?.zonas ?? [])
  const [dormitorios, setDormitorios] = useState(saved?.dormitorios ?? '')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaId, setBusquedaId] = useState('')
  const [limite, setLimite] = useState(saved?.limite ?? 50)
  const [soloConCandados, setSoloConCandados] = useState(saved?.soloConCandados ?? false)
  const [soloPreciosSospechosos, setSoloPreciosSospechosos] = useState(saved?.soloPreciosSospechosos ?? false)
  const [soloHuerfanas, setSoloHuerfanas] = useState(saved?.soloHuerfanas ?? false)
  const [ordenarPor, setOrdenarPor] = useState(saved?.ordenarPor ?? '')
  const [maxDias, setMaxDias] = useState<number>(saved?.maxDias ?? 0)
  const [filtroEstado, setFiltroEstado] = useState(saved?.filtroEstado ?? '')

  // Persistir filtros en sessionStorage
  useEffect(() => {
    sessionStorage.setItem(FILTROS_STORAGE_KEY, JSON.stringify({
      tipoOperacion, zonas, dormitorios, limite,
      soloConCandados, soloPreciosSospechosos, soloHuerfanas, ordenarPor, maxDias, filtroEstado
    }))
  }, [tipoOperacion, zonas, dormitorios, limite, soloConCandados, soloPreciosSospechosos, soloHuerfanas, ordenarPor, maxDias, filtroEstado])

  // Helper: ciclar ordenamiento (off → desc → asc → off)
  const ciclarOrden = (campo: string) => {
    const descKey = `${campo}_desc`
    const ascKey = `${campo}_asc`
    if (ordenarPor === descKey) setOrdenarPor(ascKey)
    else if (ordenarPor === ascKey) setOrdenarPor('')
    else setOrdenarPor(descKey)
  }

  const getOrdenEstado = (campo: string): '' | 'desc' | 'asc' => {
    if (ordenarPor === `${campo}_desc`) return 'desc'
    if (ordenarPor === `${campo}_asc`) return 'asc'
    return ''
  }

  // Autocompletado de proyectos
  const [proyectosList, setProyectosList] = useState<ProyectoOption[]>([])
  const [showProyectoSuggestions, setShowProyectoSuggestions] = useState(false)
  const [tipoBusqueda, setTipoBusqueda] = useState<'proyecto' | 'broker'>('proyecto')
  const [proyectoSeleccionadoId, setProyectoSeleccionadoId] = useState<number | null>(null)

  // Autocompletado de brokers
  const [brokersList, setBrokersList] = useState<BrokerOption[]>([])
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false)
  const [brokerSeleccionado, setBrokerSeleccionado] = useState<string | null>(null)

  // Toggle para expandir amenities/equipamiento por propiedad
  const [amenitiesExpandidos, setAmenitiesExpandidos] = useState<Set<number>>(new Set())
  const [equipamientoExpandido, setEquipamientoExpandido] = useState<Set<number>>(new Set())

  // Refrescar datos cuando se navega de vuelta a esta página
  useEffect(() => {
    if (authLoading || !admin) return
    const handleRouteChange = (url: string) => {
      // Si navegamos a esta página (propiedades index), refrescar datos
      if (url === '/admin/propiedades' || url.startsWith('/admin/propiedades?')) {
        fetchPropiedades()
      }
    }

    router.events.on('routeChangeComplete', handleRouteChange)
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [authLoading, router.events, zonas, dormitorios, limite, soloConCandados, soloPreciosSospechosos, soloHuerfanas, proyectoSeleccionadoId, brokerSeleccionado, tipoOperacion, maxDias, filtroEstado])

  // Fetch inicial y cuando cambian filtros (no incluir busquedaId - solo busca on Enter/click)
  useEffect(() => {
    if (authLoading || !admin) return
    fetchPropiedades()
  }, [authLoading, zonas, dormitorios, limite, soloConCandados, soloPreciosSospechosos, soloHuerfanas, proyectoSeleccionadoId, brokerSeleccionado, tipoOperacion, maxDias, filtroEstado])

  // Cargar lista de proyectos para autocompletado
  useEffect(() => {
    const fetchProyectos = async () => {
      if (!supabase) return
      const { data, error } = await supabase
        .from('proyectos_master')
        .select('id_proyecto_master, nombre_oficial, desarrollador')
        .eq('activo', true)
        .order('nombre_oficial')

      if (!error && data) {
        setProyectosList(data.map(p => ({
          id: p.id_proyecto_master,
          nombre: p.nombre_oficial,
          desarrollador: p.desarrollador
        })))
      }
    }
    fetchProyectos()
  }, [])

  // Cargar lista de brokers para autocompletado
  useEffect(() => {
    const fetchBrokers = async () => {
      if (!supabase) return
      // Query para obtener brokers únicos con cantidad de propiedades
      const { data, error } = await supabase
        .rpc('buscar_unidades_reales', {
          p_filtros: {
            limite: 500,
            incluir_outliers: true,
            incluir_multiproyecto: true,
            incluir_datos_viejos: true
          }
        })

      if (!error && data) {
        // Agrupar por asesor_nombre y contar
        const brokersMap = new Map<string, { inmobiliaria: string | null, cantidad: number }>()
        data.forEach((p: SupabaseRow) => {
          if (p.asesor_nombre) {
            const existing = brokersMap.get(p.asesor_nombre)
            if (existing) {
              existing.cantidad++
            } else {
              brokersMap.set(p.asesor_nombre, {
                inmobiliaria: p.asesor_inmobiliaria || null,
                cantidad: 1
              })
            }
          }
        })

        // Convertir a array y ordenar por cantidad
        const brokers: BrokerOption[] = Array.from(brokersMap.entries())
          .map(([nombre, info]) => ({
            nombre,
            inmobiliaria: info.inmobiliaria,
            cantidad: info.cantidad
          }))
          .sort((a, b) => b.cantidad - a.cantidad)

        setBrokersList(brokers)
      }
    }
    fetchBrokers()
  }, [])

  // Cerrar sugerencias al hacer click afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.busqueda-container')) {
        setShowProyectoSuggestions(false)
        setShowBrokerSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

  async function fetchPropiedades() {
    if (!supabase) return

    setLoading(true)
    setError(null)

    // Fetch TC paralelo for price normalization
    const { data: tcData } = await supabase
      .from('config_global')
      .select('valor')
      .eq('clave', 'tipo_cambio_paralelo')
      .single()
    const tcPar = parseFloat(tcData?.valor) || 0
    setTcParalelo(tcPar)

    try {
      // Búsqueda por ID directo
      if (busquedaId.trim()) {
        const ids = busquedaId.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
        if (ids.length > 0) {
          const { data: propsData, error: propsErr } = await supabase
            .from('propiedades_v2')
            .select('id, nombre_edificio, zona, dormitorios, banos, precio_usd, precio_mensual_bob, precio_mensual_usd, tipo_operacion, area_total_m2, datos_json, url, fuente, campos_bloqueados, id_proyecto_master, fecha_publicacion, estado_construccion, estacionamientos, baulera, precio_usd_original, moneda_original, tipo_cambio_detectado, tipo_cambio_usado, piso, plan_pagos_desarrollador, acepta_permuta, solo_tc_paralelo, precio_negociable, descuento_contado_pct, parqueo_incluido, parqueo_precio_adicional, baulera_incluido, baulera_precio_adicional')
            .in('id', ids)

          if (propsErr) throw new Error(propsErr.message)

          // También traer info de proyectos_master para nombre y desarrollador
          const projIds = (propsData || []).map((p: SupabaseRow) => p.id_proyecto_master).filter(Boolean)
          let projMap = new Map<number, SupabaseRow>()
          if (projIds.length > 0) {
            const { data: projData } = await supabase
              .from('proyectos_master')
              .select('id_proyecto_master, nombre_oficial, desarrollador')
              .in('id_proyecto_master', projIds)
            if (projData) {
              projMap = new Map(projData.map((p: SupabaseRow) => [p.id_proyecto_master as number, p]))
            }
          }

          const resultado = (propsData || []).map((p: SupabaseRow) => {
            const proj = projMap.get(p.id_proyecto_master)
            const fotosUrls = p.datos_json?.contenido?.fotos_urls || []
            const esAlquiler = p.tipo_operacion === 'alquiler'
            const precioRaw = esAlquiler ? (Number(p.precio_mensual_usd) || 0) : (p.precio_usd || 0)
            const precioDisplay = esAlquiler ? precioRaw : normalizarPrecio(precioRaw, p.tipo_cambio_detectado, tcPar)
            return {
              ...p,
              proyecto: proj?.nombre_oficial || p.nombre_edificio || 'Sin nombre',
              desarrollador: proj?.desarrollador || null,
              precio_usd: precioDisplay,
              precio_m2: p.area_total_m2 > 0 ? Math.round(precioDisplay / p.area_total_m2) : 0,
              precio_mensual_bob: p.precio_mensual_bob ? Number(p.precio_mensual_bob) : null,
              area_m2: p.area_total_m2,
              score_calidad: 0,
              asesor_nombre: p.datos_json?.agente?.nombre || null,
              asesor_wsp: p.datos_json?.agente?.whatsapp || null,
              asesor_inmobiliaria: p.datos_json?.agente?.inmobiliaria || null,
              fotos_urls: fotosUrls,
              cantidad_fotos: fotosUrls.length,
              amenities_confirmados: null,
              amenities_por_verificar: null,
              equipamiento_detectado: null,
              dias_en_mercado: null,
              microzona: null,
            } as PropiedadConCandados
          })

          setPropiedades(resultado)
          setLoading(false)
          return
        }
      }

      // Path directo para alquileres sin proyecto (bypass RPC que usa INNER JOIN)
      if (tipoOperacion === 'alquiler' && soloHuerfanas) {
        let query = supabase
          .from('propiedades_v2')
          .select('id, nombre_edificio, zona, microzona, dormitorios, banos, precio_usd, precio_mensual_usd, precio_mensual_bob, area_total_m2, datos_json, datos_json_enrichment, datos_json_discovery, url, fuente, campos_bloqueados, id_proyecto_master, fecha_publicacion, estado_construccion, estacionamientos, baulera, score_calidad_dato, latitud, longitud, es_multiproyecto, tipo_propiedad_original')
          .eq('tipo_operacion', 'alquiler')
          .eq('status', 'completado')
          .eq('es_activa', true)
          .is('id_proyecto_master', null)
          .is('duplicado_de', null)
          .gte('area_total_m2', 20)
          .order('id', { ascending: false })
          .limit(limite)

        if (zonas.length === 1) {
          query = query.ilike('zona', `%${zonas[0]}%`)
        }
        if (dormitorios && dormitorios !== 'todos') {
          query = query.eq('dormitorios', parseInt(dormitorios))
        }

        const { data: huerfanasData, error: huerfanasErr } = await query

        if (huerfanasErr) throw new Error(huerfanasErr.message)

        const resultado = (huerfanasData || []).map((p: SupabaseRow) => {
          const fotosUrls = p.datos_json?.contenido?.fotos_urls || []
          const precioMensual = p.precio_mensual_usd ? Number(p.precio_mensual_usd) : (p.precio_usd ? Number(p.precio_usd) : 0)
          return {
            id: p.id,
            proyecto: p.nombre_edificio || 'Sin nombre',
            desarrollador: null,
            zona: p.zona || 'Sin zona',
            microzona: p.microzona,
            dormitorios: p.dormitorios,
            banos: p.banos,
            precio_usd: precioMensual,
            precio_m2: p.area_total_m2 > 0 ? Math.round(precioMensual / p.area_total_m2 * 100) / 100 : 0,
            area_m2: p.area_total_m2,
            score_calidad: p.score_calidad_dato || 0,
            asesor_nombre: p.datos_json?.agente?.nombre || null,
            asesor_wsp: p.datos_json?.agente?.telefono || null,
            asesor_inmobiliaria: p.datos_json?.agente?.oficina_nombre || null,
            fotos_urls: fotosUrls,
            cantidad_fotos: fotosUrls.length,
            url: p.url,
            amenities_confirmados: null,
            amenities_por_verificar: null,
            equipamiento_detectado: null,
            estado_construccion: p.estado_construccion || 'no_especificado',
            latitud: p.latitud,
            longitud: p.longitud,
            estacionamientos: p.estacionamientos,
            baulera: p.baulera,
            dias_en_mercado: p.fecha_publicacion
              ? Math.floor((Date.now() - new Date(p.fecha_publicacion).getTime()) / 86400000)
              : null,
            piso: null,
            plan_pagos_desarrollador: null,
            acepta_permuta: null,
            solo_tc_paralelo: null,
            precio_negociable: null,
            descuento_contado_pct: null,
            parqueo_incluido: null,
            parqueo_precio_adicional: null,
            baulera_incluido: null,
            baulera_precio_adicional: null,
            precio_mensual_bob: p.precio_mensual_bob ? Number(p.precio_mensual_bob) : null,
            // Extra fields
            campos_bloqueados: p.campos_bloqueados || {},
            fuente: p.fuente || '',
            id_proyecto_master: null,
            fecha_publicacion: p.fecha_publicacion,
          } as PropiedadConCandados
        })

        setPropiedades(resultado)
        setLoading(false)
        return
      }

      // Construir filtros para buscar_unidades_reales
      // Si hay filtros client-side activos, traer más datos del RPC para no perder resultados
      const tieneFiltroCl = filtroEstado || maxDias > 0 || zonas.length > 1
      const filtros: Record<string, string | number | boolean> = {
        limite: tieneFiltroCl ? Math.max(limite, 200) : limite,
        incluir_outliers: true,
        incluir_multiproyecto: true,
        incluir_datos_viejos: true,
        tipo_operacion: tipoOperacion
      }

      if (zonas.length === 1) {
        filtros.zona = zonas[0]
      }
      if (dormitorios && dormitorios !== 'todos') {
        filtros.dormitorios = parseInt(dormitorios)
      }
      // Búsqueda por texto (broker o proyecto)
      if (busqueda && tipoBusqueda === 'broker') {
        // Para broker buscamos en asesor_nombre (se filtra después en frontend)
      } else if (tipoBusqueda === 'proyecto' && proyectoSeleccionadoId) {
        // Proyecto específico seleccionado: buscar por nombre exacto en RPC
        const proyectoSeleccionado = proyectosList.find(p => p.id === proyectoSeleccionadoId)
        if (proyectoSeleccionado) {
          filtros.proyecto = proyectoSeleccionado.nombre
        }
      } else if (busqueda && tipoBusqueda === 'proyecto') {
        // Búsqueda por texto libre en nombre proyecto
        filtros.proyecto = busqueda
      }

      // Llamar al RPC correcto según tipo de operación
      const rpcName = tipoOperacion === 'alquiler' ? 'buscar_unidades_alquiler' : 'buscar_unidades_reales'
      const { data: unidades, error: rpcError } = await supabase
        .rpc(rpcName, { p_filtros: filtros })

      if (rpcError) {
        throw new Error(rpcError.message)
      }

      // Si necesitamos info de candados, hacemos otra consulta
      const ids = (unidades || []).map((u: SupabaseRow) => u.id)

      if (ids.length > 0) {
        const { data: propiedadesData, error: propsError } = await supabase
          .from('propiedades_v2')
          .select('id, campos_bloqueados, fuente, precio_usd_original, moneda_original, tipo_cambio_detectado, tipo_cambio_usado, id_proyecto_master, fecha_publicacion')
          .in('id', ids)

        if (propsError) {
          console.error('Error obteniendo candados:', propsError)
        }

        // Combinar datos
        const candadosMap = new Map(
          (propiedadesData || []).map((p: SupabaseRow) => [p.id, p])
        )

        let resultado = (unidades || []).map((u: SupabaseRow) => {
          const extra = candadosMap.get(u.id)
          // Para alquileres, usar precio_mensual_usd como precio_usd para display unificado
          const precioUsd = tipoOperacion === 'alquiler'
            ? (u.precio_mensual_usd ? Number(u.precio_mensual_usd) : 0)
            : (u.precio_usd || 0)
          return {
            ...u,
            proyecto: u.nombre_proyecto || u.nombre_edificio || 'Sin nombre',
            precio_usd: precioUsd,
            precio_m2: u.area_m2 > 0 ? Math.round(precioUsd / Number(u.area_m2)) : 0,
            precio_mensual_bob: u.precio_mensual_bob ? Number(u.precio_mensual_bob) : null,
            campos_bloqueados: extra?.campos_bloqueados || {},
            fuente: extra?.fuente || u.fuente || '',
            id_proyecto_master: extra?.id_proyecto_master ?? null,
            fecha_publicacion: extra?.fecha_publicacion ?? null,
            precio_usd_original: extra?.precio_usd_original,
            moneda_original: extra?.moneda_original,
            tipo_cambio_detectado: extra?.tipo_cambio_detectado,
            tipo_cambio_usado: extra?.tipo_cambio_usado,
          }
        })

        // Filtrar por zonas (client-side cuando hay más de 1 zona seleccionada)
        if (zonas.length > 1) {
          resultado = resultado.filter((p: PropiedadConCandados) =>
            zonas.some(z => p.zona?.includes(z))
          )
        }

        // Filtrar por días en mercado
        if (maxDias > 0) {
          resultado = resultado.filter((p: PropiedadConCandados) =>
            (p.dias_en_mercado ?? 0) <= maxDias
          )
        }

        // Filtrar por estado de construcción
        if (filtroEstado === 'entrega') {
          resultado = resultado.filter((p: PropiedadConCandados) =>
            p.estado_construccion === 'entrega_inmediata' || p.estado_construccion === 'nuevo_a_estrenar'
          )
        } else if (filtroEstado === 'preventa') {
          resultado = resultado.filter((p: PropiedadConCandados) =>
            p.estado_construccion === 'preventa'
          )
        } else if (filtroEstado === 'sin_dato') {
          resultado = resultado.filter((p: PropiedadConCandados) =>
            !p.estado_construccion || p.estado_construccion === 'no_especificado'
          )
        }

        // Filtrar por candados si está activo
        if (soloConCandados) {
          resultado = resultado.filter((p: PropiedadConCandados) => {
            const candados = p.campos_bloqueados || {}
            return Object.keys(candados).length > 0 &&
              JSON.stringify(candados) !== '{}' &&
              JSON.stringify(candados) !== 'null'
          })
        }

        // Filtrar por precios sospechosos si está activo
        if (soloPreciosSospechosos) {
          resultado = resultado.filter((p: PropiedadConCandados) => {
            const precioM2 = p.precio_m2 || 0
            return precioM2 < 1200 || precioM2 > 3200
          })
        }

        // Filtrar por huérfanas (sin proyecto asignado)
        if (soloHuerfanas) {
          resultado = resultado.filter((p: PropiedadConCandados) => !p.id_proyecto_master)
        }

        // Filtrar por proyecto específico seleccionado
        if (tipoBusqueda === 'proyecto' && proyectoSeleccionadoId) {
          resultado = resultado.filter((p: PropiedadConCandados) =>
            p.id_proyecto_master === proyectoSeleccionadoId
          )
        }
        // Filtrar por broker específico seleccionado (exacto)
        else if (tipoBusqueda === 'broker' && brokerSeleccionado) {
          resultado = resultado.filter((p: PropiedadConCandados) =>
            p.asesor_nombre === brokerSeleccionado
          )
        }
        // Filtrar por broker (texto parcial en asesor_nombre o inmobiliaria)
        else if (tipoBusqueda === 'broker' && busqueda.trim()) {
          const termino = busqueda.toLowerCase()
          resultado = resultado.filter((p: PropiedadConCandados) =>
            p.asesor_nombre?.toLowerCase().includes(termino) ||
            p.asesor_inmobiliaria?.toLowerCase().includes(termino)
          )
        }

        setPropiedades(resultado)
      } else {
        setPropiedades([])
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error cargando propiedades')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const contarCandados = (campos: CamposBloqueados | undefined): number => {
    if (!campos || typeof campos !== 'object') return 0
    return Object.keys(campos).filter(k => {
      const v = campos[k]
      return v === true || (typeof v === 'object' && v?.bloqueado === true)
    }).length
  }

  const formatPrecio = (precio: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(precio)
  }

  const formatFechaCorta = (fecha: string | null | undefined): string => {
    if (!fecha) return '-'
    const date = new Date(fecha)
    return date.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Detectar precio sospechoso basado en precio/m²
  const getPrecioAlerta = (precioM2: number): { tipo: 'error' | 'warning' | null; mensaje: string } => {
    if (precioM2 < 800) {
      return { tipo: 'error', mensaje: `$${precioM2}/m² muy bajo` }
    }
    if (precioM2 < 1200) {
      return { tipo: 'warning', mensaje: `$${precioM2}/m² bajo` }
    }
    if (precioM2 > 4000) {
      return { tipo: 'error', mensaje: `$${precioM2}/m² muy alto` }
    }
    if (precioM2 > 3200) {
      return { tipo: 'warning', mensaje: `$${precioM2}/m² alto` }
    }
    return { tipo: null, mensaje: '' }
  }

  const contarSospechosos = (): number => {
    return propiedades.filter(p => getPrecioAlerta(p.precio_m2).tipo !== null).length
  }

  const contarHuerfanas = (): number => {
    return propiedades.filter(p => !p.id_proyecto_master).length
  }

  const getFuenteBadge = (fuente: string | undefined) => {
    if (fuente === 'century21') {
      return <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded">C21</span>
    }
    if (fuente === 'remax') {
      return <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded">RE/MAX</span>
    }
    return null
  }

  return (
    <>
      <Head>
        <title>Admin - Propiedades | SICI</title>
      </Head>

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Panel Admin</h1>
              <p className="text-slate-400 text-sm">Editor de Propiedades v2</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/admin/alquileres" className="text-emerald-400 hover:text-emerald-300 text-sm font-medium">
                Alquileres HITL
              </Link>
              <Link href="/admin/proyectos" className="text-slate-300 hover:text-white text-sm">
                Proyectos
              </Link>
              <Link href="/admin/brokers" className="text-slate-300 hover:text-white text-sm">
                Brokers
              </Link>
              <Link href="/admin/supervisor" className="text-amber-400 hover:text-amber-300 text-sm font-medium">
                Supervisor HITL
              </Link>
              <Link href="/admin/salud" className="text-teal-400 hover:text-teal-300 text-sm font-medium">
                Salud
              </Link>
              <Link href="/admin/market" className="text-purple-400 hover:text-purple-300 text-sm font-medium">
                Market
              </Link>
              <Link href="/" className="text-slate-300 hover:text-white text-sm">
                Ir a Buscar
              </Link>
            </div>
          </div>
        </header>

        {/* Tabs Venta / Alquiler */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex gap-0">
              <button
                onClick={() => setTipoOperacion('venta')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tipoOperacion === 'venta'
                    ? 'border-amber-500 text-amber-700 bg-amber-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                Venta
              </button>
              <button
                onClick={() => setTipoOperacion('alquiler')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tipoOperacion === 'alquiler'
                    ? 'border-blue-500 text-blue-700 bg-blue-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                Alquiler
              </button>
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto py-8 px-6">
          {/* Dashboard de mercado */}
          {(() => {
            const n = propiedades.length
            if (n === 0) return null

            const isAlq = tipoOperacion === 'alquiler'

            // Precios ticket
            const tickets = propiedades
              .map(p => isAlq ? (p.precio_mensual_bob ?? 0) : (p.precio_usd ?? 0))
              .filter(v => v > 0)
              .sort((a, b) => a - b)
            const avgTicket = tickets.length > 0 ? tickets.reduce((a, b) => a + b, 0) / tickets.length : 0
            const medTicket = tickets.length > 0
              ? tickets.length % 2 === 0
                ? (tickets[tickets.length / 2 - 1] + tickets[tickets.length / 2]) / 2
                : tickets[Math.floor(tickets.length / 2)]
              : 0

            // Precios /m2
            const preciosM2 = propiedades
              .map(p => {
                if (isAlq) return p.precio_mensual_bob && p.area_m2 > 0 ? p.precio_mensual_bob / p.area_m2 : 0
                return p.precio_m2 ?? 0
              })
              .filter(v => v > 0)
              .sort((a, b) => a - b)
            const avgM2 = preciosM2.length > 0 ? preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length : 0
            const medM2 = preciosM2.length > 0
              ? preciosM2.length % 2 === 0
                ? (preciosM2[preciosM2.length / 2 - 1] + preciosM2[preciosM2.length / 2]) / 2
                : preciosM2[Math.floor(preciosM2.length / 2)]
              : 0

            // Dias en mercado
            const dias = propiedades
              .map(p => p.dias_en_mercado ?? 0)
              .filter(v => v > 0)
              .sort((a, b) => a - b)
            const avgDias = dias.length > 0 ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : 0
            const medDias = dias.length > 0
              ? dias.length % 2 === 0
                ? Math.round((dias[dias.length / 2 - 1] + dias[dias.length / 2]) / 2)
                : dias[Math.floor(dias.length / 2)]
              : 0

            // Proyectos distintos
            const proyectosUnicos = new Set(propiedades.filter(p => p.id_proyecto_master).map(p => p.id_proyecto_master)).size

            const moneda = isAlq ? 'Bs' : '$'
            const fmtNum = (v: number) => Math.round(v).toLocaleString('es-BO')

            return (
              <div className="mb-8">
                {/* Mercado */}
                <div className="grid grid-cols-5 gap-4 mb-3">
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Unidades</p>
                    <p className="text-2xl font-bold text-slate-900">{n}</p>
                    <p className="text-xs text-slate-400 mt-1">{proyectosUnicos} proyecto{proyectosUnicos !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">
                      {isAlq ? 'Ticket Bs/mes' : 'Ticket USD'}
                    </p>
                    <p className="text-2xl font-bold text-slate-900">{moneda} {fmtNum(avgTicket)}</p>
                    <p className="text-xs text-slate-400 mt-1">med: {moneda} {fmtNum(medTicket)}</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">
                      {isAlq ? 'Bs/m²' : '$/m²'}
                    </p>
                    <p className="text-2xl font-bold text-slate-900">{moneda} {fmtNum(avgM2)}</p>
                    <p className="text-xs text-slate-400 mt-1">med: {moneda} {fmtNum(medM2)}</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Dias en mercado</p>
                    <p className="text-2xl font-bold text-slate-900">{avgDias}d</p>
                    <p className="text-xs text-slate-400 mt-1">med: {medDias}d</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">
                      {isAlq ? 'Rango Bs/mes' : 'Rango USD'}
                    </p>
                    <p className="text-lg font-bold text-slate-900">
                      {tickets.length > 0
                        ? `${moneda} ${fmtNum(tickets[0])} - ${fmtNum(tickets[tickets.length - 1])}`
                        : '-'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {isAlq ? 'Bs/m²' : '$/m²'}: {preciosM2.length > 0 ? `${fmtNum(preciosM2[0])} - ${fmtNum(preciosM2[preciosM2.length - 1])}` : '-'}
                    </p>
                  </div>
                </div>
                {/* Salud del segmento */}
                <div className="flex items-center gap-3 text-xs text-slate-500 px-1">
                  <span className="text-slate-400 font-medium uppercase tracking-wide">Salud:</span>
                  <span>
                    {propiedades.filter(p => contarCandados(p.campos_bloqueados) > 0).length} con candados
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>
                    {propiedades.filter(p => p.cantidad_fotos > 0).length} con fotos
                  </span>
                  {!isAlq && (
                    <>
                      <span className="text-slate-300">|</span>
                      <span className={contarSospechosos() > 0 ? 'text-red-500 font-medium' : ''}>
                        {contarSospechosos()} precio sospechoso
                      </span>
                    </>
                  )}
                  <span className="text-slate-300">|</span>
                  <span className={contarHuerfanas() > 0 ? 'text-orange-500 font-medium' : ''}>
                    {contarHuerfanas()} sin proyecto
                  </span>
                </div>
              </div>
            )
          })()}

          {/* Filtros */}
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6 space-y-4">
            {/* FILA 1: Búsqueda */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-[140px]">
                <label className="text-xs text-slate-500 mb-1 block">Buscar por ID</label>
                <input
                  type="text"
                  placeholder="338, 480..."
                  value={busquedaId}
                  onChange={(e) => setBusquedaId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchPropiedades()}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                />
              </div>

              <div className="flex-1 min-w-[280px] busqueda-container">
                <div className="flex mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTipoBusqueda('proyecto')
                      setBusqueda('')
                      setProyectoSeleccionadoId(null)
                      setBrokerSeleccionado(null)
                      setShowBrokerSuggestions(false)
                    }}
                    className={`text-xs px-3 py-1 rounded-t ${
                      tipoBusqueda === 'proyecto'
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    Proyecto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTipoBusqueda('broker')
                      setBusqueda('')
                      setShowProyectoSuggestions(false)
                      setProyectoSeleccionadoId(null)
                      setBrokerSeleccionado(null)
                    }}
                    className={`text-xs px-3 py-1 rounded-t ${
                      tipoBusqueda === 'broker'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    Broker
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    placeholder={tipoBusqueda === 'proyecto' ? 'Buscar proyecto...' : 'Buscar broker...'}
                    value={busqueda}
                    onChange={(e) => {
                      setBusqueda(e.target.value)
                      if (tipoBusqueda === 'proyecto') {
                        setShowProyectoSuggestions(e.target.value.length > 0)
                        setShowBrokerSuggestions(false)
                        const proyectoActual = proyectosList.find(p => p.id === proyectoSeleccionadoId)
                        if (proyectoActual && e.target.value !== proyectoActual.nombre) {
                          setProyectoSeleccionadoId(null)
                        }
                      } else {
                        setShowBrokerSuggestions(e.target.value.length > 0)
                        setShowProyectoSuggestions(false)
                        if (brokerSeleccionado && e.target.value !== brokerSeleccionado) {
                          setBrokerSeleccionado(null)
                        }
                      }
                    }}
                    onFocus={() => {
                      if (tipoBusqueda === 'proyecto' && busqueda.length > 0) {
                        setShowProyectoSuggestions(true)
                      } else if (tipoBusqueda === 'broker' && busqueda.length > 0) {
                        setShowBrokerSuggestions(true)
                      }
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && fetchPropiedades()}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 outline-none ${
                      tipoBusqueda === 'proyecto' && proyectoSeleccionadoId
                        ? 'border-green-400 bg-green-50 focus:ring-green-500'
                        : tipoBusqueda === 'broker' && brokerSeleccionado
                          ? 'border-green-400 bg-green-50 focus:ring-green-500'
                          : tipoBusqueda === 'proyecto'
                            ? 'border-amber-300 focus:ring-amber-500'
                            : 'border-blue-300 focus:ring-blue-500'
                    }`}
                  />
                  {tipoBusqueda === 'proyecto' && proyectoSeleccionadoId && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 text-sm flex items-center gap-1">
                      ✓
                      <button type="button" onClick={() => { setProyectoSeleccionadoId(null); setBusqueda('') }} className="text-red-400 hover:text-red-600 ml-1" title="Limpiar">✕</button>
                    </span>
                  )}
                  {tipoBusqueda === 'broker' && brokerSeleccionado && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 text-sm flex items-center gap-1">
                      ✓
                      <button type="button" onClick={() => { setBrokerSeleccionado(null); setBusqueda('') }} className="text-red-400 hover:text-red-600 ml-1" title="Limpiar">✕</button>
                    </span>
                  )}

                  {tipoBusqueda === 'proyecto' && showProyectoSuggestions && busqueda.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {proyectosList
                        .filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
                        .slice(0, 8)
                        .map(p => (
                          <button key={p.id} type="button" onClick={() => { setBusqueda(p.nombre); setProyectoSeleccionadoId(p.id); setShowProyectoSuggestions(false) }} className="w-full px-4 py-2 text-left hover:bg-amber-50 border-b border-slate-100 last:border-0">
                            <span className="font-medium text-slate-900">{p.nombre}</span>
                            {p.desarrollador && <span className="block text-xs text-slate-500">{p.desarrollador}</span>}
                          </button>
                        ))
                      }
                      {proyectosList.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase())).length === 0 && (
                        <div className="px-4 py-3 text-sm text-slate-500">No se encontro &quot;{busqueda}&quot;</div>
                      )}
                    </div>
                  )}

                  {tipoBusqueda === 'broker' && showBrokerSuggestions && busqueda.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {brokersList
                        .filter(b => b.nombre.toLowerCase().includes(busqueda.toLowerCase()))
                        .slice(0, 8)
                        .map(b => (
                          <button key={b.nombre} type="button" onClick={() => { setBusqueda(b.nombre); setBrokerSeleccionado(b.nombre); setShowBrokerSuggestions(false) }} className="w-full px-4 py-2 text-left hover:bg-blue-50 border-b border-slate-100 last:border-0">
                            <span className="font-medium text-slate-900">{b.nombre}</span>
                            <span className="block text-xs text-slate-500">
                              {b.cantidad} {b.cantidad === 1 ? 'propiedad' : 'propiedades'}
                              {b.inmobiliaria && ` \u2022 ${b.inmobiliaria}`}
                            </span>
                          </button>
                        ))
                      }
                      {brokersList.filter(b => b.nombre.toLowerCase().includes(busqueda.toLowerCase())).length === 0 && (
                        <div className="px-4 py-3 text-sm text-slate-500">No se encontro broker &quot;{busqueda}&quot;</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={fetchPropiedades}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
              >
                Buscar
              </button>

              <select
                value={limite.toString()}
                onChange={(e) => setLimite(parseInt(e.target.value))}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>

            {/* FILA 2: Zonas + Dormitorios */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Zonas:</span>
              <button
                type="button"
                onClick={() => setZonas([])}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  zonas.length === 0
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todas
              </button>
              {ZONAS.filter(z => z.id !== '').map(z => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => {
                    if (zonas.includes(z.id)) {
                      setZonas(zonas.filter(x => x !== z.id))
                    } else {
                      setZonas([...zonas, z.id])
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    zonas.includes(z.id)
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {z.label}
                </button>
              ))}

              <span className="text-slate-300 mx-1">|</span>

              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Dorms:</span>
              {[
                { value: '', label: 'Todos' },
                { value: '0', label: '0' },
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4+' },
              ].map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDormitorios(d.value === dormitorios ? '' : d.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    dormitorios === d.value || (d.value === '' && dormitorios === '')
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}

              <span className="text-slate-300 mx-1">|</span>

              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Estado:</span>
              {[
                { value: '', label: 'Todos' },
                { value: 'preventa', label: 'Preventa' },
                { value: 'entrega', label: 'Entrega inmediata' },
                { value: 'sin_dato', label: 'Sin dato' },
              ].map(e => (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => setFiltroEstado(filtroEstado === e.value ? '' : e.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    filtroEstado === e.value || (e.value === '' && filtroEstado === '')
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>

            {/* FILA 3: Días + Ordenar + Toggles */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Dias:</span>
              {[
                { value: 0, label: 'Todos' },
                { value: 30, label: '\u226430d' },
                { value: 90, label: '\u226490d' },
                { value: 180, label: '\u2264180d' },
              ].map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setMaxDias(d.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    maxDias === d.value
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}

              <span className="text-slate-300 mx-1">|</span>

              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Ordenar:</span>
              {[
                { campo: 'dias', label: 'Dias' },
                { campo: 'precio', label: 'Precio' },
                { campo: 'precio_m2', label: '$/m\u00B2' },
              ].map(o => {
                const estado = getOrdenEstado(o.campo)
                return (
                  <button
                    key={o.campo}
                    type="button"
                    onClick={() => ciclarOrden(o.campo)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                      estado
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {o.label}
                    {estado === 'desc' && <span>{'\u2193'}</span>}
                    {estado === 'asc' && <span>{'\u2191'}</span>}
                    {!estado && <span className="text-slate-400">{'\u2195'}</span>}
                  </button>
                )
              })}

              <span className="text-slate-300 mx-1">|</span>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={soloConCandados} onChange={(e) => setSoloConCandados(e.target.checked)} className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-500" />
                <span className="text-xs text-slate-600">Editadas</span>
              </label>

              {tipoOperacion === 'venta' && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={soloPreciosSospechosos} onChange={(e) => setSoloPreciosSospechosos(e.target.checked)} className="w-3.5 h-3.5 rounded text-red-500 focus:ring-red-500" />
                  <span className="text-xs text-red-600">Precio sosp.</span>
                </label>
              )}

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={soloHuerfanas} onChange={(e) => setSoloHuerfanas(e.target.checked)} className="w-3.5 h-3.5 rounded text-orange-500 focus:ring-orange-500" />
                <span className="text-xs text-orange-600">Sin proyecto</span>
              </label>

              {(zonas.length > 0 || dormitorios || soloConCandados || soloPreciosSospechosos || soloHuerfanas || ordenarPor || maxDias > 0 || filtroEstado || busqueda || busquedaId) && (
                <button
                  onClick={() => {
                    setZonas([])
                    setDormitorios('')
                    setLimite(50)
                    setSoloConCandados(false)
                    setSoloPreciosSospechosos(false)
                    setSoloHuerfanas(false)
                    setOrdenarPor('')
                    setMaxDias(0)
                    setFiltroEstado('')
                    setBusqueda('')
                    setBusquedaId('')
                    setProyectoSeleccionadoId(null)
                    setBrokerSeleccionado(null)
                    sessionStorage.removeItem(FILTROS_STORAGE_KEY)
                  }}
                  className="ml-auto px-3 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* Lista de propiedades */}
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-xl p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
                <p className="mt-4 text-slate-500">Cargando propiedades...</p>
              </div>
            ) : propiedades.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center">
                <p className="text-slate-500">No se encontraron propiedades</p>
              </div>
            ) : (
              [...propiedades].sort((a, b) => {
                if (!ordenarPor) return 0
                switch (ordenarPor) {
                  case 'dias_desc': return (b.dias_en_mercado ?? 0) - (a.dias_en_mercado ?? 0)
                  case 'dias_asc': return (a.dias_en_mercado ?? 0) - (b.dias_en_mercado ?? 0)
                  case 'precio_desc': {
                    const pa = tipoOperacion === 'alquiler' ? (a.precio_mensual_bob ?? 0) : (a.precio_usd ?? 0)
                    const pb = tipoOperacion === 'alquiler' ? (b.precio_mensual_bob ?? 0) : (b.precio_usd ?? 0)
                    return pb - pa
                  }
                  case 'precio_asc': {
                    const pa = tipoOperacion === 'alquiler' ? (a.precio_mensual_bob ?? 0) : (a.precio_usd ?? 0)
                    const pb = tipoOperacion === 'alquiler' ? (b.precio_mensual_bob ?? 0) : (b.precio_usd ?? 0)
                    return pa - pb
                  }
                  case 'precio_m2_desc': {
                    const pa = tipoOperacion === 'alquiler' && a.precio_mensual_bob && a.area_m2 > 0
                      ? a.precio_mensual_bob / a.area_m2 : (a.precio_m2 ?? 0)
                    const pb = tipoOperacion === 'alquiler' && b.precio_mensual_bob && b.area_m2 > 0
                      ? b.precio_mensual_bob / b.area_m2 : (b.precio_m2 ?? 0)
                    return pb - pa
                  }
                  case 'precio_m2_asc': {
                    const pa = tipoOperacion === 'alquiler' && a.precio_mensual_bob && a.area_m2 > 0
                      ? a.precio_mensual_bob / a.area_m2 : (a.precio_m2 ?? 0)
                    const pb = tipoOperacion === 'alquiler' && b.precio_mensual_bob && b.area_m2 > 0
                      ? b.precio_mensual_bob / b.area_m2 : (b.precio_m2 ?? 0)
                    return pa - pb
                  }
                  default: return 0
                }
              }).map((prop) => (
                <div
                  key={prop.id}
                  className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="flex">
                    {/* Foto */}
                    <div className="w-48 h-36 bg-slate-200 flex-shrink-0 relative">
                      {prop.fotos_urls && prop.fotos_urls.length > 0 ? (
                        <img
                          src={prop.fotos_urls[0]}
                          alt={prop.proyecto}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {prop.cantidad_fotos > 1 && (
                        <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                          {prop.cantidad_fotos} fotos
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-slate-900">{prop.proyecto}</h3>
                            {getFuenteBadge(prop.fuente)}
                            {!prop.id_proyecto_master && (
                              <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded">
                                Sin proyecto
                              </span>
                            )}
                            <span className="text-xs text-slate-400">ID: {prop.id}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <span>{getZonaLabel(prop.zona)}</span>
                            {prop.desarrollador && <span>• {prop.desarrollador}</span>}
                            {prop.piso && <span>• Piso {prop.piso}</span>}
                            {/* Estado construcción */}
                            {prop.estado_construccion && prop.estado_construccion !== 'no_especificado' && (
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                prop.estado_construccion === 'entrega_inmediata' ? 'bg-green-100 text-green-700' :
                                prop.estado_construccion === 'preventa' ? 'bg-blue-100 text-blue-700' :
                                prop.estado_construccion === 'en_construccion' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {prop.estado_construccion === 'entrega_inmediata' ? '✓ Entrega inmediata' :
                                 prop.estado_construccion === 'preventa' ? '📋 Preventa' :
                                 prop.estado_construccion === 'en_construccion' ? '🏗️ En construcción' :
                                 prop.estado_construccion === 'nuevo_a_estrenar' ? '✨ A estrenar' :
                                 prop.estado_construccion}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {tipoOperacion === 'alquiler' ? (
                            <>
                              <p className="font-bold text-lg text-blue-700">
                                {prop.precio_mensual_bob
                                  ? `Bs ${Math.round(prop.precio_mensual_bob).toLocaleString()}/mes`
                                  : formatPrecio(prop.precio_usd) + '/mes'}
                              </p>
                              {prop.precio_mensual_bob && prop.area_m2 > 0 && (
                                <p className="text-sm text-slate-500">Bs {Math.round(prop.precio_mensual_bob / prop.area_m2)}/m²</p>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="font-bold text-lg text-slate-900">{formatPrecio(prop.precio_usd)}</p>
                              <div className="flex items-center justify-end gap-2">
                                <p className="text-sm text-slate-500">${prop.precio_m2}/m²</p>
                                {getPrecioAlerta(prop.precio_m2).tipo === 'error' && (
                                  <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded" title={getPrecioAlerta(prop.precio_m2).mensaje}>
                                    ⚠️ {getPrecioAlerta(prop.precio_m2).mensaje}
                                  </span>
                                )}
                                {getPrecioAlerta(prop.precio_m2).tipo === 'warning' && (
                                  <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded" title={getPrecioAlerta(prop.precio_m2).mensaje}>
                                    ⚠️ {getPrecioAlerta(prop.precio_m2).mensaje}
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                          {/* Solo mostrar normalización si hay certeza (paralelo/oficial detectado) */}
                          {prop.moneda_original === 'BOB' &&
                           prop.tipo_cambio_usado &&
                           prop.tipo_cambio_detectado &&
                           prop.tipo_cambio_detectado !== 'no_especificado' && (
                            <p className="text-xs text-green-600 mt-0.5">
                              {prop.tipo_cambio_detectado === 'paralelo' ? (
                                <>✓ USD paralelo → oficial</>
                              ) : (
                                <>✓ Bs.{Number(prop.precio_usd_original).toLocaleString()} ÷ TC {prop.tipo_cambio_usado}</>
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Características */}
                      <div className="flex items-center gap-4 mt-3 text-sm">
                        <span className="text-slate-700">
                          <strong>{prop.area_m2}</strong>m²
                        </span>
                        <span className="text-slate-700">
                          {prop.dormitorios === 0 ? (
                            <strong>Monoambiente</strong>
                          ) : (
                            <><strong>{prop.dormitorios}</strong> dorm</>
                          )}
                        </span>
                        <span className="text-slate-700">
                          <strong>{prop.banos}</strong> baños
                        </span>
                        {prop.estacionamientos && prop.estacionamientos > 0 && (
                          <span className="text-slate-700">
                            <strong>{prop.estacionamientos}</strong> parqueo
                          </span>
                        )}
                        {prop.baulera && (
                          <span className="text-green-600">+ Baulera</span>
                        )}
                      </div>

                      {/* Broker */}
                      {prop.asesor_nombre && (
                        <p className="text-sm text-slate-500 mt-2">
                          Broker: <span className="text-slate-700">{prop.asesor_nombre}</span>
                          {prop.asesor_wsp && ` - ${prop.asesor_wsp}`}
                          {prop.asesor_inmobiliaria && ` - ${prop.asesor_inmobiliaria}`}
                        </p>
                      )}

                      {/* Forma de pago (solo venta) */}
                      {tipoOperacion === 'venta' && (prop.plan_pagos_desarrollador || prop.solo_tc_paralelo || prop.descuento_contado_pct || prop.precio_negociable || prop.acepta_permuta) && (
                        <div className="flex flex-wrap gap-2 mt-2 text-xs">
                          {prop.plan_pagos_desarrollador && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded" title="Acepta plan de pagos con desarrollador">
                              📅 Plan pagos
                            </span>
                          )}
                          {prop.solo_tc_paralelo && (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded" title="Solo acepta USD a tipo de cambio paralelo">
                              💱 TC Paralelo
                            </span>
                          )}
                          {prop.descuento_contado_pct && prop.descuento_contado_pct > 0 && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded" title="Descuento por pago al contado">
                              📉 {prop.descuento_contado_pct}% desc. contado
                            </span>
                          )}
                          {prop.precio_negociable && (
                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded" title="Precio negociable">
                              🤝 Negociable
                            </span>
                          )}
                          {prop.acepta_permuta && (
                            <span className="px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded" title="Acepta permuta">
                              🔄 Permuta
                            </span>
                          )}
                        </div>
                      )}

                      {/* Parqueo/Baulera con precios (solo venta) */}
                      {tipoOperacion === 'venta' && (prop.parqueo_incluido !== null || prop.baulera_incluido !== null) && (
                        <div className="flex flex-wrap gap-2 mt-2 text-xs">
                          {prop.parqueo_incluido === true && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded">
                              🚗 Parqueo incluido
                            </span>
                          )}
                          {prop.parqueo_incluido === false && prop.parqueo_precio_adicional && (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded">
                              🚗 +${prop.parqueo_precio_adicional.toLocaleString()}
                            </span>
                          )}
                          {prop.baulera_incluido === true && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded">
                              📦 Baulera incluida
                            </span>
                          )}
                          {prop.baulera_incluido === false && prop.baulera_precio_adicional && (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded">
                              📦 +${prop.baulera_precio_adicional.toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Amenities del Edificio (de proyectos_master) */}
                      {((prop.amenities_confirmados && prop.amenities_confirmados.length > 0) ||
                        (prop.amenities_por_verificar && prop.amenities_por_verificar.length > 0)) && (
                        <div className="mt-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-500 font-medium">Edificio:</span>
                            {/* Confirmados */}
                            {prop.amenities_confirmados?.slice(0, amenitiesExpandidos.has(prop.id) ? undefined : 3).map(a => (
                              <span key={`c-${a}`} className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded">
                                ✓ {a}
                              </span>
                            ))}
                            {/* Por verificar (solo si expandido) */}
                            {amenitiesExpandidos.has(prop.id) && prop.amenities_por_verificar?.map(a => (
                              <span key={`v-${a}`} className="bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded" title="Amenity del proyecto, pendiente verificar en esta unidad">
                                ? {a}
                              </span>
                            ))}
                            {/* Toggle */}
                            {(() => {
                              const totalAmenities = (prop.amenities_confirmados?.length || 0) + (prop.amenities_por_verificar?.length || 0)
                              const visible = Math.min(3, prop.amenities_confirmados?.length || 0)
                              const restantes = totalAmenities - visible
                              if (restantes > 0) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => setAmenitiesExpandidos(prev => {
                                      const next = new Set(prev)
                                      next.has(prop.id) ? next.delete(prop.id) : next.add(prop.id)
                                      return next
                                    })}
                                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                                  >
                                    {amenitiesExpandidos.has(prop.id) ? '− Menos' : `+${restantes} más`}
                                  </button>
                                )
                              }
                              return null
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Equipamiento de la Unidad (detectado en descripción) */}
                      {prop.equipamiento_detectado && prop.equipamiento_detectado.length > 0 && (
                        <div className="mt-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-500 font-medium">Unidad:</span>
                            {prop.equipamiento_detectado.slice(0, equipamientoExpandido.has(prop.id) ? undefined : 3).map(e => (
                              <span key={`e-${e}`} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">
                                {e}
                              </span>
                            ))}
                            {/* Toggle */}
                            {prop.equipamiento_detectado.length > 3 && (
                              <button
                                type="button"
                                onClick={() => setEquipamientoExpandido(prev => {
                                  const next = new Set(prev)
                                  next.has(prop.id) ? next.delete(prop.id) : next.add(prop.id)
                                  return next
                                })}
                                className="text-xs text-slate-500 hover:text-slate-700 underline"
                              >
                                {equipamientoExpandido.has(prop.id) ? '− Menos' : `+${prop.equipamiento_detectado.length - 3} más`}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Fecha publicación y días en mercado */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                        <span title="Fecha de publicación">
                          📅 {formatFechaCorta(prop.fecha_publicacion)}
                        </span>
                        {prop.dias_en_mercado !== null && prop.dias_en_mercado !== undefined && (
                          <span className={`${prop.dias_en_mercado > 180 ? 'text-red-500' : prop.dias_en_mercado > 90 ? 'text-amber-500' : 'text-slate-500'}`}>
                            ⏱️ {prop.dias_en_mercado} días en mercado
                          </span>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-3">
                          {contarCandados(prop.campos_bloqueados) > 0 && (
                            <span className="bg-purple-50 text-purple-700 text-xs px-2 py-1 rounded flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                              {contarCandados(prop.campos_bloqueados)} bloqueados
                            </span>
                          )}
                          {prop.url && (
                            <a
                              href={prop.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Ver fuente original
                            </a>
                          )}
                        </div>
                        <Link
                          href={`/admin/propiedades/${prop.id}`}
                          className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                          Editar
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </>
  )
}
