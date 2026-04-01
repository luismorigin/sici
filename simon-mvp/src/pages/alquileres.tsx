import React, { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { GetStaticProps } from 'next'
import { type UnidadAlquiler, type FiltrosAlquiler } from '@/lib/supabase'
import { ZONAS_ALQUILER_UI, displayZona } from '@/lib/zonas'
import { dormLabel, formatPriceBob } from '@/lib/format-utils'
import { fbqTrack } from '@/lib/meta-pixel'
import { fetchMercadoAlquilerData, type MercadoAlquilerData } from '@/lib/mercado-alquiler-data'

// --- SEO types ---
interface AlquileresSEO {
  totalUnidades: number
  rentaMedianaBs: number
  bsM2Promedio: number
  fechaActualizacion: string
  generatedAt: string
  tipologias: Array<{ dormitorios: number; unidades: number; rentaMedianaBs: number; rentaP25Bs: number; rentaP75Bs: number }>
  zonas: Array<{ zonaDisplay: string; unidades: number; bsM2Promedio: number; rentaMedianaBs: number }>
}

const DORM_LABELS_SEO: Record<number, string> = { 0: 'Studio', 1: '1 dormitorio', 2: '2 dormitorios', 3: '3 dormitorios' }

function fmtBsSEO(n: number): string {
  return 'Bs ' + n.toLocaleString('es-BO')
}

function formatMesAnioSEO(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const mes = d.toLocaleDateString('es-BO', { month: 'long' })
  return mes.charAt(0).toUpperCase() + mes.slice(1) + ' ' + d.getFullYear()
}

function formatFechaCortaSEO(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Leaflet: dynamic import SSR-safe
const MapComponent = dynamic(() => import('@/components/alquiler/AlquilerMap'), { ssr: false })
const MapMultiComponent = dynamic(() => import('@/components/alquiler/AlquilerMapMulti'), { ssr: false })
const PhotoViewer = dynamic(() => import('@/components/alquiler/PhotoViewer'), { ssr: false })
const CompareSheet = dynamic(() => import('@/components/alquiler/CompareSheet'), { ssr: false })

// ===== CONSTANTS =====

const ORDEN_OPTIONS: Array<{ value: FiltrosAlquiler['orden']; label: string }> = [
  { value: 'recientes', label: 'Recientes' },
  { value: 'precio_asc', label: 'Precio ↑' },
  { value: 'precio_desc', label: 'Precio ↓' },
]

const MAX_SLIDER_PRICE = 18000

const MAX_FAVORITES = 3
const FILTER_CARD_POSITION = 3

const formatPrice = formatPriceBob

function buildEmptyMessage(f: FiltrosAlquiler): string {
  const parts: string[] = []
  if (f.dormitorios_lista?.length) {
    const labels = f.dormitorios_lista.map(d => d === 0 ? 'mono' : d === 3 ? '3+ dorm' : `${d} dorm`)
    parts.push(labels.join(' o '))
  }
  if (f.amoblado) parts.push('amoblado')
  if (f.acepta_mascotas) parts.push('con mascotas')
  if (f.con_parqueo) parts.push('con parqueo')
  if (f.zonas_permitidas?.length) {
    const zonas = f.zonas_permitidas.map(z => {
      const found = ZONAS_ALQUILER_UI.find(zu => zu.id === z)
      return found ? found.label : z
    })
    parts.push('en ' + zonas.join(' o '))
  }
  if (f.precio_mensual_max) parts.push(`bajo ${formatPrice(f.precio_mensual_max)}`)
  if (parts.length === 0) return 'No hay alquileres disponibles en este momento.'
  return `No hay ${parts.join(', ')}. Probá quitando un filtro.`
}

// Server-side API proxy (anti-scraping: no direct Supabase calls from browser)
function mapRawToUnidad(p: any): UnidadAlquiler {
  return {
    id: p.id,
    nombre_edificio: p.nombre_edificio || null,
    nombre_proyecto: p.nombre_proyecto || null,
    desarrollador: p.desarrollador || null,
    zona: p.zona || 'Sin zona',
    dormitorios: p.dormitorios ?? 0,
    banos: p.banos ? parseFloat(p.banos) : null,
    area_m2: parseFloat(p.area_m2) || 0,
    precio_mensual_bob: parseFloat(p.precio_mensual_bob) || 0,
    precio_mensual_usd: p.precio_mensual_usd ? parseFloat(p.precio_mensual_usd) : null,
    amoblado: p.amoblado || null,
    acepta_mascotas: p.acepta_mascotas ?? null,
    deposito_meses: p.deposito_meses ? parseFloat(p.deposito_meses) : null,
    servicios_incluidos: p.servicios_incluidos || null,
    contrato_minimo_meses: p.contrato_minimo_meses || null,
    monto_expensas_bob: p.monto_expensas_bob ? parseFloat(p.monto_expensas_bob) : null,
    piso: p.piso || null,
    estacionamientos: p.estacionamientos || null,
    baulera: p.baulera ?? null,
    latitud: p.latitud ? parseFloat(p.latitud) : null,
    longitud: p.longitud ? parseFloat(p.longitud) : null,
    fotos_urls: p.fotos_urls || [],
    fotos_count: p.fotos_count || 0,
    url: p.url || '',
    fuente: p.fuente || '',
    agente_nombre: p.agente_nombre || null,
    agente_telefono: p.agente_telefono || null,
    agente_whatsapp: p.agente_whatsapp || null,
    dias_en_mercado: p.dias_en_mercado || null,
    estado_construccion: p.estado_construccion || 'no_especificado',
    id_proyecto_master: p.id_proyecto_master || null,
    amenities_lista: p.amenities_lista || null,
    equipamiento_lista: p.equipamiento_lista || null,
    descripcion: p.descripcion || null,
  }
}

async function fetchFromAPI(filtros: FiltrosAlquiler & { offset?: number }, spotlightId?: number): Promise<{ data: UnidadAlquiler[]; total: number; spotlight?: UnidadAlquiler | null }> {
  try {
    const body: Record<string, any> = { filtros }
    if (spotlightId) body.spotlightId = spotlightId
    const res = await fetch('/api/alquileres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) return { data: [], total: 0 }
    const json = await res.json()
    return {
      data: (json.data || []).map(mapRawToUnidad),
      total: json.total || 0,
      spotlight: json.spotlight ? mapRawToUnidad(json.spotlight) : null
    }
  } catch {
    return { data: [], total: 0 }
  }
}

// Track WhatsApp click — call only from onClick handlers, not from render
// 30s cooldown per property to prevent duplicate events from double-clicks
const _waCooldown = new Map<number, number>()
function trackWhatsAppClick(p: UnidadAlquiler, fuente: string) {
  const now = Date.now()
  const last = _waCooldown.get(p.id) || 0
  if (now - last < 30_000) return // skip duplicate within 30s
  _waCooldown.set(p.id, now)
  trackEvent('click_whatsapp', {
    property_id: p.id,
    property_name: p.nombre_edificio || p.nombre_proyecto || 'Departamento',
    zone: p.zona || '',
    price: p.precio_mensual_bob,
    dorms: p.dormitorios,
    broker_phone: p.agente_whatsapp?.replace(/\D/g, '') || '',
    fuente,
  })
  fbqTrack('Lead', {
    content_name: p.nombre_edificio || p.nombre_proyecto || 'Departamento',
    content_category: 'alquiler',
    value: p.precio_mensual_bob,
    currency: 'BOB',
    fuente,
  })
}

// Anonymous session ID — one per browser session, not PII
function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let sid = sessionStorage.getItem('simon_sid')
  if (!sid) {
    sid = crypto.randomUUID()
    sessionStorage.setItem('simon_sid', sid)
  }
  return sid
}

// Build lead-tracked WhatsApp URL (goes through /api/lead-alquiler for tracking)
function buildLeadWhatsAppUrl(p: UnidadAlquiler, msg: string, fuente: string, preguntas?: string[]) {
  const phone = p.agente_whatsapp?.replace(/\D/g, '') || ''
  const name = p.nombre_edificio || p.nombre_proyecto || 'Departamento'
  const params = new URLSearchParams({
    phone,
    msg,
    prop_id: String(p.id),
    nombre: name,
    zona: p.zona || '',
    precio: String(p.precio_mensual_bob),
    dorms: String(p.dormitorios),
    broker_nombre: p.agente_nombre || '',
    fuente,
    sid: getSessionId(),
  })
  if (preguntas && preguntas.length > 0) {
    params.set('preguntas', JSON.stringify(preguntas))
  }
  if (typeof window !== 'undefined' && localStorage.getItem('simon_debug') === '1') {
    params.set('debug', '1')
  }
  return `/api/lead-alquiler?${params.toString()}`
}

// Build WhatsApp share URL for sharing a property with friends (NOT lead tracking)
function buildShareWhatsAppUrl(p: UnidadAlquiler) {
  const name = p.nombre_edificio || p.nombre_proyecto || 'Departamento'
  const zone = displayZona(p.zona)
  const specs = `${dormLabel(p.dormitorios)} · ${p.area_m2}m² · ${formatPrice(p.precio_mensual_bob)}/mes`
  const url = `https://simonbo.com/alquileres?id=${p.id}`
  const text = `Mira este depto en alquiler:\n\n${name} — ${zone}\n${specs}\n\n${url}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

// Track share separately — call from onClick, not from URL builder
function trackShareClick(p: UnidadAlquiler) {
  const name = p.nombre_edificio || p.nombre_proyecto || 'Departamento'
  trackEvent('share_alquiler', { property_id: p.id, property_name: name, zone: displayZona(p.zona), price: p.precio_mensual_bob, dorms: p.dormitorios })
}

// GA event helper — fire and forget, never throws
function trackEvent(name: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', name, params)
  }
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

// ===== MAIN PAGE =====
export default function AlquileresPage({ seo }: { seo: AlquileresSEO }) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const [properties, setProperties] = useState<UnidadAlquiler[]>([])
  const [loading, setLoading] = useState(true)
  const [spotlightId, setSpotlightId] = useState<number | null>(null)
  const [fetchedSpotlight, setFetchedSpotlight] = useState<UnidadAlquiler | null>(null)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())

  // Restore favorites from localStorage after hydration
  useEffect(() => {
    try {
      const saved = localStorage.getItem('alq_favorites')
      if (saved) setFavorites(new Set(JSON.parse(saved) as number[]))
    } catch {}
  }, [])
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetProperty, setSheetProperty] = useState<UnidadAlquiler | null>(null)
  const [gateCompleted, setGateCompleted] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid')
  const [mapSelectedId, setMapSelectedId] = useState<number | null>(null)
  const [mobileMapOpen, setMobileMapOpen] = useState(false)
  const [chipsExpanded, setChipsExpanded] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)
  const [viewerName, setViewerName] = useState('')
  const [viewerSubtitle, setViewerSubtitle] = useState('')

  const [filters, setFilters] = useState<FiltrosAlquiler>({
    orden: 'recientes',
    limite: 200,
    solo_con_fotos: true,
  })
  const [isFiltered, setIsFiltered] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [loadError, setLoadError] = useState(false)

  // Analytics: session-level metrics
  const analyticsRef = useRef({ startTime: Date.now(), maxCardIdx: 0, hasInteracted: false, viewedIds: new Set<number>() })
  const fetchGenRef = useRef(0) // increments on each fetchProperties call to cancel stale background loads

  // Persist favorites to localStorage
  useEffect(() => {
    try { localStorage.setItem('alq_favorites', JSON.stringify(Array.from(favorites))) } catch {}
  }, [favorites])

  const feedRef = useRef<HTMLDivElement>(null)

  // Track active card via scroll position (single listener, not per-card IntersectionObserver)
  useEffect(() => {
    const el = feedRef.current
    if (!el || isDesktop) return
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        if (!el) { ticking = false; return }
        const idx = Math.round(el.scrollTop / el.clientHeight)
        setActiveCardIndex(idx)
        // Level 1+3: track view_property + scroll_depth
        if (idx > analyticsRef.current.maxCardIdx) analyticsRef.current.maxCardIdx = idx
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isDesktop, loading])

  // Level 1: track view_property when mobile card snaps into view
  useEffect(() => {
    if (isDesktop || !mobileProperties.length) return
    const item = feedItems[activeCardIndex]
    if (item?.type === 'property' && !analyticsRef.current.viewedIds.has(item.data.id)) {
      analyticsRef.current.viewedIds.add(item.data.id)
      analyticsRef.current.hasInteracted = true
      trackEvent('view_property', { property_id: item.data.id, property_name: item.data.nombre_edificio || item.data.nombre_proyecto || '', position: activeCardIndex })
      fbqTrack('ViewContent', {
        content_type: 'product',
        content_ids: [String(item.data.id)],
        content_name: item.data.nombre_edificio || item.data.nombre_proyecto || 'Departamento',
        content_category: 'alquiler',
        value: item.data.precio_mensual_bob,
        currency: 'BOB',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCardIndex, isDesktop])

  const fetchProperties = useCallback(async (f: FiltrosAlquiler, retry = true): Promise<number> => {
    const gen = ++fetchGenRef.current
    setLoading(true)
    setLoadError(false)
    try {
      // Single fetch — 185 properties, ~80KB gzipped, ~250ms total
      const { data, total } = await fetchFromAPI({ ...f, limite: 200 })
      if (gen !== fetchGenRef.current) { setLoading(false); return 0 }
      if (data.length === 0 && retry) {
        await new Promise(r => setTimeout(r, 1500))
        if (gen !== fetchGenRef.current) { setLoading(false); return 0 }
        const r2 = await fetchFromAPI({ ...f, limite: 200 })
        if (gen !== fetchGenRef.current) { setLoading(false); return 0 }
        setProperties(r2.data)
        setLoading(false)
        setTotalCount(r2.total)
        return r2.total
      }
      setProperties(data)
      setLoading(false)
      setTotalCount(total)
      return total
    } catch {
      if (gen !== fetchGenRef.current) { setLoading(false); return 0 }
      if (retry) {
        await new Promise(r => setTimeout(r, 1500))
        return fetchProperties(f, false)
      }
      setLoading(false)
      setLoadError(true)
      return 0
    }
  }, [])

  useEffect(() => {
    async function init() {
      await fetchProperties(filters)
    }
    init()
    trackEvent('page_enter_alquiler', {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Level 3: session metrics on page hide/unload
  useEffect(() => {
    function sendSessionMetrics() {
      const a = analyticsRef.current
      const duration = Math.round((Date.now() - a.startTime) / 1000)
      trackEvent('session_alquiler', {
        duration_seconds: duration,
        max_scroll_depth: a.maxCardIdx,
        cards_viewed: a.viewedIds.size,
        total_cards: properties.length,
        had_interaction: a.hasInteracted,
      })
      if (!a.hasInteracted && duration > 3) {
        trackEvent('bounce_no_action', { duration_seconds: duration })
      }
    }
    function onVisChange() { if (document.visibilityState === 'hidden') sendSessionMetrics() }
    document.addEventListener('visibilitychange', onVisChange)
    return () => document.removeEventListener('visibilitychange', onVisChange)
  }, [properties.length])

  function showToast(msg: string) {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2500)
  }

  async function applyFilters(newFilters: FiltrosAlquiler) {
    setFilters(newFilters)
    setIsFiltered(true)
    const count = await fetchProperties(newFilters)
    showToast(`${count} alquileres encontrados`)
    feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    analyticsRef.current.hasInteracted = true
    trackEvent('apply_filters', {
      zonas: newFilters.zonas_permitidas?.join(',') || '',
      precio_max: newFilters.precio_mensual_max || null,
      dormitorios: newFilters.dormitorios_lista?.join(',') || '',
      amoblado: newFilters.amoblado || false,
      mascotas: newFilters.acepta_mascotas || false,
      parqueo: newFilters.con_parqueo || false,
      results_count: count,
    })
    fbqTrack('Search', {
      search_string: [
        newFilters.zonas_permitidas?.join(','),
        newFilters.dormitorios_lista?.map(d => `${d}d`).join(','),
        newFilters.precio_mensual_max ? `<${newFilters.precio_mensual_max}` : '',
      ].filter(Boolean).join(' | '),
      content_category: 'alquiler',
    })
    if (count === 0) {
      trackEvent('no_results', {
        zonas: newFilters.zonas_permitidas?.join(',') || '',
        precio_max: newFilters.precio_mensual_max || null,
        dormitorios: newFilters.dormitorios_lista?.join(',') || '',
      })
    }
  }

  async function resetFilters() {
    const defaultFilters: FiltrosAlquiler = {
      orden: 'recientes',
      limite: 200,
      solo_con_fotos: true,
    }
    setFilters(defaultFilters)
    setIsFiltered(false)
    const count = await fetchProperties(defaultFilters)
    showToast(`${count} alquileres · sin filtros`)
    feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleMapSelect = useCallback((id: number) => {
    setMapSelectedId(prev => prev === id ? null : id)
    trackEvent('select_map_pin', { property_id: id })
    analyticsRef.current.hasInteracted = true
  }, [])

  function toggleFavorite(id: number) {
    const isFav = favorites.has(id)
    if (!isFav && favorites.size >= MAX_FAVORITES) {
      showToast(`Maximo ${MAX_FAVORITES} favoritos`)
      return
    }
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    analyticsRef.current.hasInteracted = true
    trackEvent('toggle_favorite', { property_id: id, action: isFav ? 'remove' : 'add', total_favs: isFav ? favorites.size - 1 : favorites.size + 1 })
    if (isFav) {
      showToast('Eliminado de favoritos')
    } else {
      const newCount = favorites.size + 1
      if (newCount >= 2) {
        showToast(`${newCount}/${MAX_FAVORITES} · Podes comparar abajo`)
      } else {
        showToast(`Guardado · ${newCount}/${MAX_FAVORITES} favoritos`)
      }
    }
  }

  function openCompare() {
    setCompareOpen(true)
    analyticsRef.current.hasInteracted = true
    trackEvent('open_compare', { property_ids: Array.from(favorites).join(','), count: favorites.size })
  }

  // Gate: check localStorage on mount
  useEffect(() => {
    try { if (localStorage.getItem('alquileres_gate_v1')) setGateCompleted(true) } catch {}
  }, [])

  function handleGate(nombre: string, telefono: string, correo: string, url: string) {
    try { localStorage.setItem('alquileres_gate_v1', JSON.stringify({ nombre, telefono, correo, ts: new Date().toISOString() })) } catch {}
    setGateCompleted(true)
    window.open(url, '_blank')
    // Fire and forget — save lead to DB
    const prop = sheetProperty
    fetch('/api/lead-gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre, telefono, correo, origen: 'alquileres',
        propiedad_id: prop?.id, propiedad_nombre: prop?.nombre_edificio || prop?.nombre_proyecto, zona: prop?.zona,
      }),
    }).catch(() => {})
  }

  function openDetail(p: UnidadAlquiler) {
    setSheetProperty(p)
    setSheetOpen(true)
    analyticsRef.current.hasInteracted = true
    trackEvent('open_detail', { property_id: p.id, property_name: p.nombre_edificio || p.nombre_proyecto || '' })
    fbqTrack('ViewContent', {
      content_type: 'product',
      content_ids: [String(p.id)],
      content_name: p.nombre_edificio || p.nombre_proyecto || 'Departamento',
      content_category: 'alquiler',
      value: p.precio_mensual_bob,
      currency: 'BOB',
    })
  }

  function openViewer(p: UnidadAlquiler, photoIndex: number) {
    if (!p.fotos_urls?.length) return
    setViewerPhotos(p.fotos_urls)
    setViewerIndex(photoIndex)
    setViewerName(p.nombre_edificio || p.nombre_proyecto || 'Departamento')
    setViewerSubtitle(`${displayZona(p.zona)} · ${p.area_m2}m² · ${dormLabel(p.dormitorios)}`)
    setViewerOpen(true)
    analyticsRef.current.hasInteracted = true
    trackEvent('view_photos', { property_id: p.id, property_name: p.nombre_edificio || p.nombre_proyecto || '', fotos_count: p.fotos_urls.length })
  }

  const activeFilterCount = useMemo(() => {
    let c = 0
    if (filters.zonas_permitidas?.length) c += filters.zonas_permitidas.length
    if (filters.precio_mensual_max) c++
    if (filters.dormitorios_lista?.length) c += filters.dormitorios_lista.length
    else if (filters.dormitorios !== undefined) c++
    if (filters.dormitorios_min !== undefined && !filters.dormitorios_lista?.length) c++
    if (filters.amoblado) c++
    if (filters.acepta_mascotas) c++
    if (filters.con_parqueo) c++
    return c
  }, [filters])

  // Resolve favorite properties from current data
  const favoriteProperties = useMemo(() => {
    return properties.filter(p => favorites.has(p.id))
  }, [properties, favorites])

  // Auto-close chips on scroll
  useEffect(() => {
    const el = feedRef.current
    if (!el || !chipsExpanded) return
    const close = () => setChipsExpanded(false)
    el.addEventListener('scroll', close, { passive: true, once: true })
    return () => el.removeEventListener('scroll', close)
  }, [chipsExpanded])

  // Parse ?id= query param for spotlight (shared property)
  useEffect(() => {
    const idParam = router.query.id
    if (idParam && typeof idParam === 'string') {
      const parsed = parseInt(idParam, 10)
      if (!isNaN(parsed)) {
        setSpotlightId(parsed)
        trackEvent('open_shared_alquiler', { property_id: parsed })
      }
    }
  }, [router.query.id])

  // Resolve spotlight property — check loaded data, then fetched spotlight
  const spotlightProperty = useMemo(() => {
    if (!spotlightId) return null
    return properties.find(p => p.id === spotlightId) || fetchedSpotlight || null
  }, [spotlightId, properties, fetchedSpotlight])

  // If spotlight not found in loaded data, fetch it via API
  useEffect(() => {
    if (!spotlightId) { setFetchedSpotlight(null); return }
    if (properties.find(p => p.id === spotlightId)) return
    let cancelled = false
    async function doFetch() {
      try {
        const { spotlight } = await fetchFromAPI({ solo_con_fotos: false, limite: 50 }, spotlightId ?? undefined)
        if (!cancelled && spotlight) setFetchedSpotlight(spotlight)
      } catch { /* best-effort */ }
    }
    doFetch()
    return () => { cancelled = true }
  }, [spotlightId, properties.length])

  function clearSpotlight() {
    setSpotlightId(null)
    setFetchedSpotlight(null)
    router.replace('/alquileres', undefined, { shallow: true })
  }

  // Desktop grid: exclude spotlight property to avoid duplication
  const gridProperties = useMemo(() => {
    if (!spotlightProperty) return properties
    return properties.filter(p => p.id !== spotlightId)
  }, [properties, spotlightProperty, spotlightId])

  // Mobile: feed items with filter card at position 3, spotlight first
  const feedItems: Array<{ type: 'property'; data: UnidadAlquiler; isSpotlight?: boolean } | { type: 'filter' }> = []
  let filterInserted = false
  // If spotlight, put it first and exclude from normal list
  const mobileProperties = spotlightProperty
    ? [spotlightProperty, ...properties.filter(p => p.id !== spotlightId)]
    : properties
  mobileProperties.forEach((p, i) => {
    feedItems.push({ type: 'property', data: p, isSpotlight: i === 0 && !!spotlightProperty })
    if (i === FILTER_CARD_POSITION - 1 && !filterInserted) { feedItems.push({ type: 'filter' }); filterInserted = true }
  })
  if (mobileProperties.length > 0 && !filterInserted) {
    feedItems.push({ type: 'filter' })
  }

  return (
    <>
      <AlquileresHead seo={seo} />
      {/* Preload first photo for faster LCP */}
      {!loading && properties.length > 0 && properties[0].fotos_urls?.[0] && (
        <Head>
          <link rel="preload" as="image" href={properties[0].fotos_urls[0]} fetchPriority="high" />
        </Head>
      )}

      <style jsx global>{`
        body { background: #EDE8DC; }
        @media (max-width: 767px) { body { overflow: hidden; } }
      `}</style>

      {/* Toast */}
      <div className={`alq-toast ${toastVisible ? 'show' : ''}`}>{toastMessage}</div>

      {/* Compare sheet */}
      <CompareSheet
        open={compareOpen}
        properties={favoriteProperties}
        onClose={() => setCompareOpen(false)}
      />

      {/* Photo viewer */}
      {viewerOpen && (
        <PhotoViewer
          photos={viewerPhotos}
          initialIndex={viewerIndex}
          buildingName={viewerName}
          subtitle={viewerSubtitle}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {/* Bottom sheet overlay */}
      {sheetOpen && <div className="alq-sheet-overlay" onClick={() => setSheetOpen(false)} />}
      <BottomSheet
        open={sheetOpen}
        property={sheetProperty}
        onClose={() => setSheetOpen(false)}
        isDesktop={isDesktop}
        gateCompleted={gateCompleted}
        onGate={handleGate}
        petFilterActive={filters.acepta_mascotas}
      />

      {isDesktop ? (
        /* ==================== DESKTOP LAYOUT ==================== */
        <div className="desktop-layout">
          {/* Left sidebar - filters */}
          <aside className="desktop-sidebar" style={{ overscrollBehavior: 'contain' }}>
            <div className="desktop-sidebar-header">
              <Link href="/landing-v2" className="desktop-logo">
                <svg width={22} height={22} viewBox="0 0 64 64" fill="none" style={{display:'inline-block',verticalAlign:'middle',marginRight:8}}>
                  <circle cx="32" cy="34" r="28" fill="#141414"/>
                  <circle cx="32" cy="15" r="6" fill="#3A6A48"/>
                  <circle cx="32" cy="15" r="3" fill="#EDE8DC"/>
                </svg>
                Simon
              </Link>
              <div className="desktop-label">Alquileres</div>
            </div>
            <div className="desktop-sidebar-count">
              <span className="desktop-count-num">{properties.length}</span>
              <span className="desktop-count-label">{isFiltered ? `de ${totalCount} alquileres` : 'alquileres en Equipetrol'}</span>
            </div>
            <DesktopFilters
              currentFilters={filters}
              isFiltered={isFiltered}
              onApply={applyFilters}
              onReset={resetFilters}
            />
            {/* Favorites summary */}
            {favorites.size > 0 && (
              <div className="desktop-fav-summary">
                <div className="desktop-fav-info">
                  <svg viewBox="0 0 24 24" fill="#E05555" stroke="#E05555" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                  {favorites.size} favorito{favorites.size > 1 ? 's' : ''}
                  <button className="desktop-fav-clear" onClick={() => { setFavorites(new Set()); showToast('Favoritos limpiados') }} title="Limpiar favoritos">&times;</button>
                </div>
                {favorites.size >= 2 && (
                  <button className="desktop-compare-btn" onClick={() => openCompare()}>
                    Comparar {favorites.size === MAX_FAVORITES ? '' : `(${favorites.size})`}
                  </button>
                )}
              </div>
            )}
          </aside>

          {/* Right content */}
          <main className="desktop-main" ref={viewMode === 'grid' ? feedRef : undefined}
            style={viewMode === 'map' ? { overflow: 'hidden', display: 'flex', flexDirection: 'column' } : undefined}>
            {/* View toggle bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #D8D0BC', flexShrink: 0, position: 'sticky', top: 0, background: '#EDE8DC', zIndex: 10, paddingTop: 4 }}>
              <div style={{ fontSize: 13, color: '#7A7060', display: 'flex', alignItems: 'center', gap: 12 }}>
                {properties.length} resultado{properties.length !== 1 ? 's' : ''}
                {favorites.size >= 2 && (
                  <button onClick={() => openCompare()} style={{ padding: '6px 16px', background: '#141414', color: '#EDE8DC', border: 'none', borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.5 }}>
                    Comparar {favorites.size} favoritos
                  </button>
                )}
                {favorites.size === 1 && (
                  <span style={{ fontSize: 12, color: '#7A7060' }}>1 favorito — elegí otro para comparar</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 2, background: 'rgba(58,53,48,0.06)', borderRadius: 10, padding: 3 }}>
                <button
                  onClick={() => { setViewMode('grid'); trackEvent('switch_view', { view_mode: 'grid' }) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
                    background: viewMode === 'grid' ? '#141414' : 'transparent',
                    color: viewMode === 'grid' ? '#EDE8DC' : '#3A3530',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', borderRadius: 8, letterSpacing: 0.5,
                    border: viewMode === 'grid' ? '2px solid #141414' : '2px solid #D8D0BC',
                  }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:15,height:15}}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  Grid
                </button>
                <button
                  onClick={() => { setViewMode('map'); trackEvent('switch_view', { view_mode: 'map' }) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
                    background: viewMode === 'map' ? '#141414' : 'transparent',
                    color: viewMode === 'map' ? '#EDE8DC' : '#3A3530',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', borderRadius: 8, letterSpacing: 0.5,
                    border: viewMode === 'map' ? '2px solid #141414' : '2px solid #D8D0BC',
                  }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:15,height:15}}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                  Mapa
                </button>
              </div>
            </div>

            {loadError ? (
              <div className="desktop-loading">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ marginBottom: 12, color: 'rgba(255,255,255,0.6)' }}>No se pudo cargar. Verifica tu conexion.</div>
                  <button onClick={() => fetchProperties(filters)} style={{ background: '#141414', color: '#EDE8DC', border: 'none', padding: '10px 24px', borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Reintentar</button>
                </div>
              </div>
            ) : loading && properties.length === 0 ? (
              <div className="desktop-loading">Cargando alquileres...</div>
            ) : properties.length === 0 ? (
              <div className="desktop-loading">{buildEmptyMessage(filters)}</div>
            ) : viewMode === 'grid' ? (
              <>
                {/* Spotlight: shared property */}
                {spotlightProperty && (
                  <div className="alq-spotlight">
                    <div className="alq-spotlight-banner">
                      <span>Te compartieron este departamento</span>
                      <button onClick={clearSpotlight}>&times;</button>
                    </div>
                    <div className="alq-spotlight-content">
                      <div className="alq-spotlight-card">
                        <DesktopCard
                          property={spotlightProperty}
                          isFavorite={favorites.has(spotlightProperty.id)}
                          favoritesCount={favorites.size}
                          onToggleFavorite={() => toggleFavorite(spotlightProperty.id)}
                          onOpenInfo={() => openDetail(spotlightProperty)}
                          onPhotoTap={(photoIdx) => openViewer(spotlightProperty, photoIdx)}
                          onShare={() => { trackShareClick(spotlightProperty); window.open(buildShareWhatsAppUrl(spotlightProperty), '_blank') }}
                        />
                      </div>
                      {spotlightProperty.latitud && spotlightProperty.longitud && (
                        <div className="alq-spotlight-map">
                          <MapComponent lat={spotlightProperty.latitud} lng={spotlightProperty.longitud} />
                        </div>
                      )}
                    </div>
                    <div className="alq-spotlight-separator">
                      <span className="alq-spotlight-line" />
                      <span className="alq-spotlight-text">Explorar mas alquileres</span>
                      <span className="alq-spotlight-line" />
                    </div>
                  </div>
                )}
                <div className="desktop-grid">
                  {gridProperties.map((p, idx) => {
                    const showDivider = filters.acepta_mascotas && idx > 0 && gridProperties[idx - 1]?.acepta_mascotas === true && p.acepta_mascotas !== true
                    return (
                      <Fragment key={p.id}>
                        {showDivider && (
                          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px 0', margin: '8px 0', color: '#7c3aed', fontSize: 13, fontWeight: 600, letterSpacing: 0.3, border: '1px solid rgba(168,85,247,0.2)', fontFamily: "'DM Sans', sans-serif", background: 'rgba(168,85,247,0.08)', borderRadius: 8 }}>
                            🐾 También podrían aceptar mascotas · consultar con el anunciante
                          </div>
                        )}
                        <DesktopCard
                          property={p}
                          isFavorite={favorites.has(p.id)}
                          favoritesCount={favorites.size}
                          petFilterActive={filters.acepta_mascotas}
                          isFirst={idx === 0}
                          onToggleFavorite={() => toggleFavorite(p.id)}
                          onOpenInfo={() => openDetail(p)}
                          onPhotoTap={(photoIdx) => openViewer(p, photoIdx)}
                          onShare={() => { trackShareClick(p); window.open(buildShareWhatsAppUrl(p), '_blank') }}
                        />
                      </Fragment>
                    )
                  })}
                </div>
              </>
            ) : (
              /* Map view: full map + floating card on selection */
              <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', zIndex: 0 }}>
                  <MapMultiComponent
                    properties={properties}
                    onSelectProperty={handleMapSelect}
                    selectedId={mapSelectedId}
                  />
                </div>
                {/* Floating card when a pin is selected */}
                {mapSelectedId && (() => {
                  const sp = properties.find(x => x.id === mapSelectedId)
                  if (!sp) return null
                  return (
                    <MapFloatCard
                      key={sp.id}
                      property={sp}
                      isFavorite={favorites.has(sp.id)}
                      onClose={() => setMapSelectedId(null)}
                      onToggleFavorite={() => toggleFavorite(sp.id)}
                      onOpenDetail={() => openDetail(sp)}
                    />
                  )
                })()}
                {/* Favorites strip at bottom of map */}
                {favorites.size > 0 && (() => {
                  const favProps = properties.filter(p => favorites.has(p.id))
                  if (favProps.length === 0) return null
                  return (
                    <div className="map-fav-strip">
                      <div className="map-fav-label">
                        <svg viewBox="0 0 24 24" fill="#E05555" stroke="#E05555" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                        {favProps.length}
                      </div>
                      {favProps.map(fp => {
                        const fpName = fp.nombre_edificio || fp.nombre_proyecto || 'Depto'
                        return (
                          <div key={fp.id} className={`map-fav-chip ${fp.id === mapSelectedId ? 'selected' : ''}`}
                            onClick={() => handleMapSelect(fp.id)}>
                            {fp.fotos_urls?.[0] && <div className="map-fav-chip-img" style={{ backgroundImage: `url('${fp.fotos_urls[0]}')` }} />}
                            <div className="map-fav-chip-info">
                              <div className="map-fav-chip-name">{fpName}</div>
                              <div className="map-fav-chip-price">{formatPrice(fp.precio_mensual_bob)}</div>
                            </div>
                            <button className="map-fav-chip-remove" onClick={(e) => { e.stopPropagation(); toggleFavorite(fp.id) }}>&times;</button>
                          </div>
                        )
                      })}
                      {favProps.length >= 2 && (
                        <button className="map-fav-compare" onClick={() => openCompare()}>Comparar</button>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
          </main>
        </div>
      ) : (
        /* ==================== MOBILE LAYOUT (TikTok feed) ==================== */
        <>
          {/* Top bar */}
          <div className="alq-top-bar">
            <a href="/landing-v2" className="alq-top-bar-left alq-home-link" onClick={(e) => { e.stopPropagation() }}>
              <svg width={18} height={18} viewBox="0 0 64 64" fill="none" style={{flexShrink:0}}>
                <circle cx="32" cy="34" r="28" fill="#141414"/>
                <circle cx="32" cy="15" r="6" fill="#3A6A48"/>
                <circle cx="32" cy="15" r="3" fill="#EDE8DC"/>
              </svg>
              <span className="alq-logo">Simon</span>
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isFiltered && (
                <button className="alq-filter-pill" onClick={() => setChipsExpanded(!chipsExpanded)}>
                  {chipsExpanded ? 'Ocultar' : `${activeFilterCount} filtros`}
                </button>
              )}
              <button className="alq-filter-btn" aria-label="Abrir filtros" onClick={() => {
                const filterIdx = Math.min(FILTER_CARD_POSITION, feedItems.length - 1)
                setActiveCardIndex(filterIdx)
                setTimeout(() => {
                  if (feedRef.current) {
                    feedRef.current.scrollTo({ top: filterIdx * feedRef.current.clientHeight, behavior: 'smooth' })
                  }
                }, 50)
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18M7 12h10M10 18h4"/></svg>
                {isFiltered && <div className="alq-filter-dot" />}
              </button>
            </div>
          </div>

          {/* Expandable filter chips panel */}
          <div className={`alq-chips-panel ${chipsExpanded ? 'open' : ''}`}>
            {filters.zonas_permitidas?.map(z => {
              const zona = ZONAS_ALQUILER_UI.find(zu => zu.id === z)
              return zona ? <span key={z} className="alq-chip">{zona.label} <button onClick={() => {
                const newZonas = filters.zonas_permitidas!.filter(x => x !== z)
                applyFilters({ ...filters, zonas_permitidas: newZonas.length > 0 ? newZonas : undefined })
              }}>&times;</button></span> : null
            })}
            {filters.precio_mensual_max && <span className="alq-chip">&le; {formatPrice(filters.precio_mensual_max)}</span>}
            {filters.dormitorios_lista?.map(d => (
              <span key={`dorm-${d}`} className="alq-chip">{d === 0 ? 'Estudio' : d === 3 ? '3+ dorm' : `${d} dorm`}</span>
            ))}
            {!filters.dormitorios_lista?.length && filters.dormitorios !== undefined && <span className="alq-chip">{filters.dormitorios === 0 ? 'Estudio' : `${filters.dormitorios} dorm`}</span>}
            {!filters.dormitorios_lista?.length && filters.dormitorios_min !== undefined && <span className="alq-chip">{filters.dormitorios_min}+ dorm</span>}
            {filters.amoblado && <span className="alq-chip">Amoblado</span>}
            {filters.acepta_mascotas && <span className="alq-chip">Mascotas</span>}
            {filters.con_parqueo && <span className="alq-chip">Parqueo</span>}
            <button className="alq-chip alq-chip-clear" onClick={() => { resetFilters(); setChipsExpanded(false) }}>&times; Todo</button>
          </div>

          {/* Compare banner — only shows with 1+ favorites */}
          {favorites.size >= 1 && (
            <div className="alq-compare-banner-wrap">
              <button className="alq-compare-banner" onClick={() => favorites.size >= 2 ? openCompare() : showToast('Elegí al menos 2 para comparar')} style={{ flex: 1 }}>
                <span className="alq-compare-banner-text">{favorites.size} favorito{favorites.size > 1 ? 's' : ''}{favorites.size >= 2 ? ' · Comparar' : ''}</span>
                {favorites.size >= 2 && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16}}><path d="M9 18l6-6-6-6"/></svg>}
              </button>
              <button className="alq-compare-banner-clear" onClick={(e) => { e.stopPropagation(); setFavorites(new Set()); showToast('Favoritos limpiados') }}>&times;</button>
            </div>
          )}

          {/* Floating map button */}
          <button className="alq-map-floating" aria-label="Ver mapa" onClick={() => { setMobileMapOpen(true); trackEvent('open_map_mobile') }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#141414" strokeWidth="1.5" style={{width:22,height:22}}>
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
          </button>

          {/* Full-screen mobile map */}
          {mobileMapOpen && (
            <div className="alq-mobile-map-overlay">
              <div className="alq-mobile-map-header">
                <span className="alq-mobile-map-title">Mapa de Alquileres</span>
                <button className="alq-mobile-map-close" onClick={() => setMobileMapOpen(false)}>&times;</button>
              </div>
              <div className="alq-mobile-map-body">
                <MapMultiComponent
                  properties={properties}
                  onSelectProperty={handleMapSelect}
                  selectedId={mapSelectedId}
                />
                {mapSelectedId && (() => {
                  const sp = properties.find(x => x.id === mapSelectedId)
                  if (!sp) return null
                  return (
                    <MapFloatCard
                      key={sp.id}
                      property={sp}
                      isFavorite={favorites.has(sp.id)}
                      mobile
                      onClose={() => setMapSelectedId(null)}
                      onToggleFavorite={() => toggleFavorite(sp.id)}
                      onOpenDetail={() => { setMobileMapOpen(false); openDetail(sp) }}
                    />
                  )
                })()}
              </div>
            </div>
          )}

          <CardCounter total={feedItems.length} active={activeCardIndex} />

          {/* Feed — windowed: only render cards near viewport */}
          <div className="alq-feed" ref={feedRef}>
            {loadError ? (
              <div className="alq-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', padding: '0 32px' }}>
                  <div className="alq-logo" style={{ fontSize: 44, marginBottom: 8 }}>Simon</div>
                  <div style={{ color: '#7A7060', fontSize: 14, marginBottom: 20 }}>No se pudo cargar. Verifica tu conexion.</div>
                  <button onClick={() => fetchProperties(filters)} style={{ padding: '12px 28px', background: '#141414', border: 'none', color: '#EDE8DC', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: 0.5, cursor: 'pointer', borderRadius: 10 }}>REINTENTAR</button>
                </div>
              </div>
            ) : loading && properties.length === 0 ? (
              <div className="alq-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="alq-logo" style={{ fontSize: 44, marginBottom: 8 }}>Simon</div>
                  <div style={{ color: '#7A7060', fontSize: 14 }}>Cargando alquileres...</div>
                </div>
              </div>
            ) : !loading && properties.length === 0 ? (
              <div className="alq-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', padding: '0 32px' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontFamily: "'Figtree', sans-serif", fontSize: 24, fontWeight: 500, color: '#141414', marginBottom: 8 }}>Sin resultados</div>
                  <div style={{ color: '#7A7060', fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>{buildEmptyMessage(filters)}</div>
                  <button onClick={resetFilters} style={{ padding: '12px 28px', background: '#141414', border: 'none', color: '#EDE8DC', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: 0.5, cursor: 'pointer', borderRadius: 10 }}>QUITAR FILTROS</button>
                </div>
              </div>
            ) : (
              feedItems.map((item, idx) => {
                // Virtualization: only render cards within ±3 of active
                const WINDOW = 3
                const isNearby = Math.abs(idx - activeCardIndex) <= WINDOW
                if (!isNearby) {
                  // Placeholder preserves scroll position (must match card height + snap)
                  return <div key={item.type === 'filter' ? 'filter' : item.data.id} style={{ height: '100dvh', scrollSnapAlign: 'start', background: '#EDE8DC' }} />
                }
                if (item.type === 'filter') {
                  return (
                    <MobileFilterCard
                      key="filter"
                      totalCount={totalCount}
                      filteredCount={properties.length}
                      currentFilters={filters}
                      isFiltered={isFiltered}
                      onApply={applyFilters}
                      onReset={resetFilters}
                    />
                  )
                }
                return (
                  <MobilePropertyCard
                    key={item.data.id}
                    property={item.data}
                    isFirst={idx === 0}
                    showHint={idx < 3}
                    isFavorite={favorites.has(item.data.id)}
                    favoritesCount={favorites.size}
                    isSpotlight={item.isSpotlight || false}
                    petFilterActive={filters.acepta_mascotas}
                    onToggleFavorite={() => toggleFavorite(item.data.id)}
                    onOpenInfo={() => openDetail(item.data)}
                    onPhotoTap={() => openDetail(item.data)}
                    onShare={() => { trackShareClick(item.data); window.open(buildShareWhatsAppUrl(item.data), '_blank') }}
                  />
                )
              })
            )}
          </div>
        </>
      )}

      <style jsx>{`
        /* ========== TOAST ========== */
        .alq-toast {
          position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 600;
          background: #141414; color: #EDE8DC; padding: 10px 24px; border-radius: 100px;
          font-size: 13px; font-weight: 600; font-family: 'DM Sans', sans-serif;
          opacity: 0; transition: opacity 0.3s; pointer-events: none;
        }
        .alq-toast.show { opacity: 1; }
        .alq-sheet-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 500; }

        /* ========== DESKTOP ========== */
        .desktop-layout {
          display: flex; height: 100vh; overflow: hidden;
          font-family: 'DM Sans', sans-serif;
        }
        .desktop-sidebar {
          width: 320px; min-width: 320px; height: 100vh;
          background: #EDE8DC; border-right: 1px solid #D8D0BC;
          padding: 32px 28px; overflow-y: auto;
          display: flex; flex-direction: column;
        }
        .desktop-sidebar-header { margin-bottom: 32px; }
        .desktop-logo {
          font-family: 'Figtree', sans-serif; font-size: 32px; font-weight: 500;
          color: #141414; text-decoration: none; display: block;
        }
        .desktop-label { font-size: 12px; color: #7A7060; letter-spacing: 0.5px; margin-top: 2px; text-transform: uppercase; font-family: 'DM Sans', sans-serif; }
        .desktop-sidebar-count { margin-bottom: 28px; }
        .desktop-count-num {
          font-family: 'Figtree', sans-serif; font-size: 48px; font-weight: 500;
          color: #141414; line-height: 1; display: block; font-variant-numeric: tabular-nums;
        }
        .desktop-count-label { font-size: 13px; color: #7A7060; }
        .desktop-fav-summary {
          margin-top: auto; padding-top: 20px; border-top: 1px solid #D8D0BC;
          display: flex; align-items: center; justify-content: space-between;
          color: #3A6A48; font-size: 13px;
        }
        .desktop-fav-info { display: flex; align-items: center; gap: 8px; }
        .desktop-fav-clear {
          background: none; border: none; color: #7A7060; font-size: 16px;
          cursor: pointer; padding: 0 4px; line-height: 1; transition: color 0.2s;
        }
        .desktop-fav-clear:hover { color: #141414; }
        .desktop-compare-btn {
          padding: 6px 14px; border-radius: 10px; border: 1px solid #D8D0BC;
          background: rgba(58,106,72,0.08); color: #3A6A48; font-size: 12px; font-weight: 600;
          cursor: pointer; font-family: 'DM Sans', sans-serif; letter-spacing: 0.5px;
          transition: background 0.2s;
        }
        .desktop-compare-btn:hover { background: rgba(58,106,72,0.15); }

        .desktop-main {
          flex: 1; height: 100vh; overflow-y: auto; padding: 32px; background: #EDE8DC;
          scrollbar-width: thin; scrollbar-color: #D8D0BC transparent;
        }
        .desktop-main::-webkit-scrollbar { width: 6px; }
        .desktop-main::-webkit-scrollbar-track { background: transparent; }
        .desktop-main::-webkit-scrollbar-thumb { background: #D8D0BC; border-radius: 3px; }
        .desktop-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 24px; max-width: 1200px;
        }
        .alq-pet-divider {
          grid-column: 1 / -1; text-align: center; padding: 20px 0 8px;
          color: #7A7060; font-size: 12px; letter-spacing: 0.5px;
          border-top: 1px solid #D8D0BC; font-family: 'DM Sans', sans-serif;
        }
        .desktop-loading {
          display: flex; align-items: center; justify-content: center; height: 300px;
          color: #7A7060; font-size: 15px;
        }

        /* ========== SPOTLIGHT (shared property) ========== */
        .alq-spotlight { margin-bottom: 32px; }
        .alq-spotlight-banner {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; margin-bottom: 16px;
          background: #FAFAF8; border-left: 3px solid #3A6A48;
          border-radius: 0 14px 14px 0;
          font-family: 'DM Sans', sans-serif; font-size: 14px; color: #3A3530;
        }
        .alq-spotlight-banner button {
          background: none; border: none; color: #7A7060;
          font-size: 20px; cursor: pointer; padding: 4px 8px; line-height: 1;
        }
        .alq-spotlight-banner button:hover { color: #141414; }
        .alq-spotlight-content { display: flex; gap: 24px; margin-bottom: 24px; }
        .alq-spotlight-card { width: 400px; flex-shrink: 0; }
        .alq-spotlight-map {
          flex: 1; min-height: 280px; border-radius: 14px; overflow: hidden;
          border: 1px solid #D8D0BC;
        }
        .alq-spotlight-separator { display: flex; align-items: center; gap: 16px; }
        .alq-spotlight-line { flex: 1; height: 1px; background: #D8D0BC; }
        .alq-spotlight-text {
          font-family: 'DM Sans', sans-serif; font-size: 12px;
          color: #7A7060; letter-spacing: 0.5px; text-transform: uppercase;
          white-space: nowrap;
        }

        /* ========== MAP FLOATING CARD ========== */
        /* ========== MAP FAVORITES STRIP ========== */
        .map-fav-strip {
          position: absolute; bottom: 12px; right: 12px; z-index: 1000;
          display: flex; align-items: center; gap: 8px;
          background: rgba(250,250,248,0.92); backdrop-filter: blur(8px);
          padding: 8px 12px; border-radius: 14px;
          border: 1px solid #D8D0BC;
          max-width: calc(100% - 340px - 24px);
        }
        .map-fav-label {
          display: flex; align-items: center; gap: 4px;
          font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; color: #3A6A48;
          flex-shrink: 0;
        }
        .map-fav-chip {
          display: flex; align-items: center; gap: 8px;
          background: #FAFAF8; border: 1px solid #D8D0BC;
          border-radius: 10px; padding: 4px 8px 4px 4px; cursor: pointer;
          transition: border-color 0.2s; flex-shrink: 0;
        }
        .map-fav-chip:hover { border-color: #3A6A48; }
        .map-fav-chip.selected { border-color: #3A6A48; }
        .map-fav-chip-img {
          width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0;
          background-size: cover; background-position: center; background-color: #D8D0BC;
        }
        .map-fav-chip-info { min-width: 0; }
        .map-fav-chip-name {
          font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 500; color: #141414;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;
        }
        .map-fav-chip-price {
          font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; color: #141414;
          font-variant-numeric: tabular-nums;
        }
        .map-fav-chip-remove {
          flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%;
          background: rgba(58,53,48,0.06); border: none; color: #7A7060;
          font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .map-fav-chip-remove:hover { background: rgba(58,53,48,0.12); color: #141414; }
        .map-fav-compare {
          flex-shrink: 0; padding: 6px 14px; background: #141414; border: none; border-radius: 10px;
          color: #EDE8DC; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: opacity 0.2s;
        }
        .map-fav-compare:hover { opacity: 0.85; }

        /* ========== MOBILE ========== */
        .alq-feed {
          height: 100vh; height: 100dvh;
          overflow-y: scroll; scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch; scrollbar-width: none;
        }
        .alq-feed::-webkit-scrollbar { display: none; }
        .alq-top-bar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 50;
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px; padding-top: max(10px, env(safe-area-inset-top));
          pointer-events: none;
        }
        .alq-top-bar > * { pointer-events: auto; }
        .alq-top-bar-left {
          display: flex; align-items: center; gap: 10px;
          background: rgba(237,232,220,0.92); backdrop-filter: blur(8px);
          padding: 8px 16px; border-radius: 100px;
          border: 1px solid rgba(216,208,188,0.6);
        }
        .alq-home-link { display: flex; align-items: center; gap: 8px; text-decoration: none; }
        .alq-logo { font-family: 'Figtree', sans-serif; font-size: 18px; font-weight: 500; color: #141414; }
        .alq-label { font-size: 12px; color: #7A7060; letter-spacing: 0.5px; text-transform: uppercase; font-family: 'DM Sans', sans-serif; }
        .alq-filter-btn {
          width: 44px; height: 44px; border-radius: 50%;
          border: 1px solid rgba(216,208,188,0.6); background: rgba(237,232,220,0.92); backdrop-filter: blur(8px); color: #141414;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .alq-filter-pill {
          padding: 6px 14px; border-radius: 100px;
          background: rgba(237,232,220,0.92); backdrop-filter: blur(8px);
          border: 1px solid rgba(216,208,188,0.6);
          color: #3A6A48; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600;
          letter-spacing: 0.5px; cursor: pointer;
        }
        .alq-filter-dot {
          position: absolute; top: 6px; right: 6px; width: 8px; height: 8px;
          border-radius: 50%; background: #3A6A48;
        }
        .alq-filter-btn { position: relative; }
        .alq-chips-panel {
          position: fixed; top: max(56px, calc(env(safe-area-inset-top) + 48px)); left: 0; right: 0; z-index: 49;
          display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px;
          background: rgba(237,232,220,0.97);
          transform: translateY(-100%); opacity: 0; transition: transform 0.25s ease-out, opacity 0.2s;
          pointer-events: none;
        }
        .alq-chips-panel.open { transform: translateY(0); opacity: 1; pointer-events: auto; }
        .alq-chip {
          flex-shrink: 0; display: flex; align-items: center; gap: 4px;
          padding: 6px 12px; border-radius: 100px; font-size: 12px;
          background: rgba(58,106,72,0.08); border: 1px solid rgba(58,106,72,0.2);
          color: #3A6A48; font-family: 'DM Sans', sans-serif; white-space: nowrap;
        }
        .alq-chip button { background: none; border: none; color: #3A6A48; font-size: 14px; cursor: pointer; padding: 0; line-height: 1; }
        .alq-chip-clear { background: rgba(58,53,48,0.04); border-color: #D8D0BC; color: #7A7060; cursor: pointer; }
        .alq-compare-banner-wrap {
          position: fixed; top: max(64px, calc(env(safe-area-inset-top) + 56px)); left: 50%; transform: translateX(-50%);
          z-index: 100; display: flex; align-items: center; gap: 0;
          border-radius: 100px; box-shadow: 0 4px 16px rgba(0,0,0,0.1);
          animation: alqBannerIn 0.3s ease-out;
        }
        .alq-compare-banner {
          display: flex; align-items: center; gap: 8px;
          background: #141414; color: #EDE8DC; border: none; border-radius: 100px 0 0 100px;
          padding: 12px 16px 12px 24px; cursor: pointer;
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.5px;
        }
        .alq-compare-banner-clear {
          background: #3A3530; color: #EDE8DC; border: none; border-radius: 0 100px 100px 0;
          padding: 12px 16px 12px 12px; cursor: pointer; font-size: 18px; font-weight: 700; line-height: 1;
          font-family: 'DM Sans', sans-serif; border-left: 1px solid rgba(237,232,220,0.15);
        }
        @keyframes alqBannerIn { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .alq-compare-banner-text { white-space: nowrap; }
        .alq-fav-count {
          position: absolute; top: -4px; right: -4px;
          width: 18px; height: 18px; border-radius: 50%;
          background: #3A6A48; color: #EDE8DC; font-size: 12px; font-weight: 600;
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transform: scale(0); transition: all 0.3s;
        }
        .alq-fav-count.show { opacity: 1; transform: scale(1); }

        /* Mobile map button */
        .alq-map-floating {
          position: fixed; bottom: max(140px, calc(env(safe-area-inset-bottom) + 130px)); right: 20px;
          z-index: 100; width: 48px; height: 48px; border-radius: 50%;
          background: #FAFAF8; border: 1px solid #D8D0BC;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .alq-mobile-map-overlay {
          position: fixed; inset: 0; z-index: 300; background: #EDE8DC;
          display: flex; flex-direction: column;
        }
        .alq-mobile-map-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 20px; padding-top: max(12px, env(safe-area-inset-top));
          background: #EDE8DC; border-bottom: 1px solid #D8D0BC;
        }
        .alq-mobile-map-title { font-family: 'Figtree', sans-serif; font-size: 20px; font-weight: 500; color: #141414; }
        .alq-mobile-map-close {
          width: 36px; height: 36px; border-radius: 50%;
          border: 1px solid #D8D0BC; background: transparent;
          color: #7A7060; font-size: 20px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .alq-mobile-map-body { flex: 1; position: relative; }
        @media (prefers-reduced-motion: reduce) {
          .alq-toast { transition: none; }
          .alq-fav-count { transition: none; }
          .cc-pip { transition: none; }
        }
      `}</style>
    </>
  )
}

// ===== DESKTOP FILTERS (sidebar, auto-apply) =====
function DesktopFilters({ currentFilters, isFiltered, onApply, onReset }: {
  currentFilters: FiltrosAlquiler; isFiltered: boolean
  onApply: (f: FiltrosAlquiler) => void; onReset: () => void
}) {
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_mensual_max || MAX_SLIDER_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set())
  const [amoblado, setAmoblado] = useState(currentFilters.amoblado || false)
  const [mascotas, setMascotas] = useState(currentFilters.acepta_mascotas || false)
  const [conParqueo, setConParqueo] = useState(currentFilters.con_parqueo || false)
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set(currentFilters.zonas_permitidas || []))
  const [orden, setOrden] = useState<FiltrosAlquiler['orden']>(currentFilters.orden || 'recientes')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Build filters object from current state
  const buildFilters = useCallback((price: number, dorms: Set<number>, amob: boolean, masc: boolean, parq: boolean, zonas: Set<string>, ord: FiltrosAlquiler['orden']) => {
    const f: FiltrosAlquiler = { orden: ord || 'recientes', limite: 200, solo_con_fotos: true }
    // Issue 1: only send precio_mensual_max when slider is NOT at maximum
    if (price < MAX_SLIDER_PRICE) f.precio_mensual_max = price
    if (dorms.size > 0) f.dormitorios_lista = Array.from(dorms)
    if (amob) f.amoblado = true
    if (masc) f.acepta_mascotas = true
    if (parq) f.con_parqueo = true
    if (zonas.size > 0) f.zonas_permitidas = Array.from(zonas)
    return f
  }, [])

  // Auto-apply with debounce
  const autoApply = useCallback((price: number, dorms: Set<number>, amob: boolean, masc: boolean, parq: boolean, zonas: Set<string>, ord: FiltrosAlquiler['orden']) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onApply(buildFilters(price, dorms, amob, masc, parq, zonas, ord))
    }, 400)
  }, [onApply, buildFilters])

  function toggleDorm(d: number) {
    setSelectedDorms(prev => {
      const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d)
      autoApply(maxPrice, n, amoblado, mascotas, conParqueo, selectedZonas, orden)
      return n
    })
  }
  function toggleZona(id: string) {
    setSelectedZonas(prev => {
      const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id)
      autoApply(maxPrice, selectedDorms, amoblado, mascotas, conParqueo, n, orden)
      return n
    })
  }
  function handlePriceChange(price: number) {
    setMaxPrice(price)
    autoApply(price, selectedDorms, amoblado, mascotas, conParqueo, selectedZonas, orden)
  }
  function handleAmoblado() {
    const next = !amoblado
    setAmoblado(next)
    autoApply(maxPrice, selectedDorms, next, mascotas, conParqueo, selectedZonas, orden)
  }
  function handleMascotas() {
    const next = !mascotas
    setMascotas(next)
    autoApply(maxPrice, selectedDorms, amoblado, next, conParqueo, selectedZonas, orden)
  }
  function handleParqueo() {
    const next = !conParqueo
    setConParqueo(next)
    autoApply(maxPrice, selectedDorms, amoblado, mascotas, next, selectedZonas, orden)
  }
  function handleOrden(o: FiltrosAlquiler['orden']) {
    setOrden(o)
    autoApply(maxPrice, selectedDorms, amoblado, mascotas, conParqueo, selectedZonas, o)
  }

  return (
    <div className="df-wrap">
      {/* Microzonas */}
      <div className="df-group">
        <div className="df-label"><span className="df-dot" />MICROZONA</div>
        <div className="df-zona-btns">
          {ZONAS_ALQUILER_UI.filter(z => z.id !== 'sin_zona').map(z => (
            <button key={z.id} className={`df-zona-btn ${selectedZonas.has(z.id) ? 'active' : ''}`}
              onClick={() => toggleZona(z.id)}>{z.label}</button>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div className="df-group">
        <div className="df-label"><span className="df-dot" />PRESUPUESTO MAXIMO</div>
        <input type="range" className="df-slider" min={2000} max={18000} step={500} value={maxPrice}
          onChange={e => handlePriceChange(parseInt(e.target.value))} />
        <div className="df-slider-val">{formatPrice(maxPrice)}/mes</div>
      </div>

      {/* Dorms */}
      <div className="df-group">
        <div className="df-label"><span className="df-dot" />DORMITORIOS</div>
        <div className="df-dorm-btns">
          {[0, 1, 2, 3].map(d => (
            <button key={d} className={`df-dorm-btn ${selectedDorms.has(d) ? 'active' : ''}`}
              onClick={() => toggleDorm(d)}>{d === 0 ? 'Mono' : d === 3 ? '3+' : d}</button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="df-group">
        <div className="df-dorm-btns">
          <button className={`df-dorm-btn df-amoblado ${amoblado ? 'active' : ''}`} onClick={handleAmoblado}>Amoblado</button>
          <button className={`df-dorm-btn df-mascotas ${mascotas ? 'active' : ''}`} onClick={handleMascotas}>Mascotas</button>
          <button className={`df-dorm-btn ${conParqueo ? 'active' : ''}`} onClick={handleParqueo}>Parqueo</button>
        </div>
      </div>

      {/* Orden */}
      <div className="df-group">
        <div className="df-label"><span className="df-dot" />ORDENAR POR</div>
        <div className="df-dorm-btns">
          {ORDEN_OPTIONS.map(o => (
            <button key={o.value} className={`df-dorm-btn ${orden === o.value ? 'active' : ''}`}
              onClick={() => handleOrden(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>

      {isFiltered && <button className="df-reset" onClick={onReset}>Quitar filtros</button>}

      <style jsx>{`
        .df-wrap { flex: 1; }
        .df-group { margin-bottom: 18px; }
        .df-label { font-size: 12px; font-weight: 600; color: #3A3530; letter-spacing: 0.5px; margin-bottom: 8px; font-family: 'DM Sans', sans-serif; text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
        .df-dot { width: 6px; height: 6px; border-radius: 50%; background: #3A6A48; flex-shrink: 0; }
        .df-zona-btns { display: flex; flex-wrap: wrap; gap: 6px; }
        .df-zona-btn { padding: 6px 12px; border: 1px solid #D8D0BC; background: #FAFAF8; color: #3A3530; font-family: 'DM Sans', sans-serif; font-size: 12px; cursor: pointer; border-radius: 100px; transition: all 0.2s; }
        .df-zona-btn.active { border-color: #3A6A48; border-width: 2px; color: #141414; background: #FAFAF8; font-weight: 600; box-shadow: 0 2px 8px rgba(58,106,72,0.12); }
        .df-dorm-btns { display: flex; gap: 8px; }
        .df-dorm-btn { flex: 1; padding: 9px; border: 1px solid #D8D0BC; background: #FAFAF8; color: #3A3530; font-family: 'DM Sans', sans-serif; font-size: 12px; cursor: pointer; border-radius: 10px; transition: all 0.2s; }
        .df-dorm-btn.active { border-color: #3A6A48; border-width: 2px; color: #141414; background: #FAFAF8; font-weight: 600; box-shadow: 0 2px 8px rgba(58,106,72,0.12); }
        .df-mascotas.active { background: #3A6A48; color: #EDE8DC; border-color: #3A6A48; box-shadow: none; }
        .df-amoblado.active { background: #141414; color: #EDE8DC; border-color: #141414; box-shadow: none; }
        .df-slider { width: 100%; -webkit-appearance: none; appearance: none; height: 2px; background: #D8D0BC; border-radius: 2px; outline: none; }
        .df-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #FAFAF8; border: 2px solid #141414; cursor: pointer; }
        .df-slider-val { text-align: right; font-size: 13px; color: #141414; margin-top: 6px; font-weight: 500; font-variant-numeric: tabular-nums; }
        .df-cta { display: block; width: 100%; padding: 12px; background: #141414; border: none; color: #EDE8DC; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; cursor: pointer; margin-bottom: 10px; border-radius: 10px; transition: opacity 0.2s; }
        .df-cta:hover { opacity: 0.9; }
        .df-reset { display: block; width: 100%; padding: 10px; background: transparent; border: 1px solid #D8D0BC; color: #7A7060; font-family: 'DM Sans', sans-serif; font-size: 12px; cursor: pointer; border-radius: 10px; }
      `}</style>
    </div>
  )
}

// ===== MAP FLOATING CARD (own state to avoid re-rendering the map) =====
function MapFloatCard({ property: sp, isFavorite, onClose, onToggleFavorite, onOpenDetail, mobile }: {
  property: UnidadAlquiler; isFavorite: boolean; mobile?: boolean
  onClose: () => void; onToggleFavorite: () => void; onOpenDetail: () => void
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const spName = sp.nombre_edificio || sp.nombre_proyecto || 'Departamento'
  const photos = sp.fotos_urls ?? []
  const spBadges: string[] = []
  if (sp.amoblado === 'si' || sp.amoblado === 'semi') spBadges.push(sp.amoblado === 'si' ? 'Amoblado' : 'Semi')
  if (sp.acepta_mascotas) spBadges.push('Mascotas')
  if (sp.estacionamientos && sp.estacionamientos > 0) spBadges.push(`${sp.estacionamientos} parqueo`)

  if (mobile) {
    return (
      <div className="mfc-mobile">
        <button className="mfc-m-close" onClick={onClose}>&times;</button>
        <div className="mfc-m-photo" style={{ ...(photos[photoIdx] ? { backgroundImage: `url('${photos[photoIdx]}')` } : {}) }}>
          {photos.length > 1 && (
            <>
              {photoIdx > 0 && (
                <button className="mfp-nav mfp-prev" onClick={(e) => { e.stopPropagation(); setPhotoIdx(photoIdx - 1) }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 14, height: 14 }}><path d="M15 18l-6-6 6-6"/></svg>
                </button>
              )}
              {photoIdx < photos.length - 1 && (
                <button className="mfp-nav mfp-next" onClick={(e) => { e.stopPropagation(); setPhotoIdx(photoIdx + 1) }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 14, height: 14 }}><path d="M9 18l6-6-6-6"/></svg>
                </button>
              )}
              <div className="map-float-photo-count">{photoIdx + 1}/{photos.length}</div>
            </>
          )}
          <button className={`mfc-m-fav ${isFavorite ? 'active' : ''}`} onClick={onToggleFavorite}>
            <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : '#7A7060'} strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        </div>
        <div className="mfc-m-body">
          <div className="mfc-m-name">{spName}</div>
          <div className="mfc-m-specs">{displayZona(sp.zona)} · {sp.area_m2}m² · {dormLabel(sp.dormitorios)}</div>
          <div className="mfc-m-price">{formatPrice(sp.precio_mensual_bob)}<span>/mes</span></div>
          {spBadges.length > 0 && (
            <div className="mfc-m-badges">{spBadges.map((b, i) => <span key={i} className="mfc-m-badge">{b}</span>)}</div>
          )}
          <div className="mfc-m-actions">
            <button className="mfc-m-btn-detail" onClick={onOpenDetail}>Ver detalles</button>
            {sp.agente_whatsapp && (
              <a href={buildLeadWhatsAppUrl(sp, `Hola, vi ${spName} en Simon y me interesa${sp.url ? '\n' + sp.url : ''}`, 'map_card_mobile')} onClick={() => trackWhatsAppClick(sp, 'map_card_mobile')} target="_blank" rel="noopener noreferrer" className="mfc-m-btn-wsp">WhatsApp</a>
            )}
          </div>
        </div>
        <style jsx>{`
          .mfc-mobile {
            position: absolute; bottom: 12px; left: 12px; right: 12px; z-index: 1000;
            background: #FAFAF8; border: 1px solid #D8D0BC;
            border-radius: 14px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
            display: flex; flex-direction: row;
            animation: mfcSlideUp 0.25s ease-out;
          }
          @keyframes mfcSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
          .mfc-m-close {
            position: absolute; top: 6px; right: 6px; z-index: 2;
            width: 24px; height: 24px; border-radius: 50%; background: rgba(20,20,20,0.7);
            border: none; color: rgba(255,255,255,0.8); font-size: 14px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
          }
          .mfc-m-photo {
            width: 140px; min-height: 150px; flex-shrink: 0;
            background-size: cover; background-position: center; background-color: #D8D0BC;
            position: relative;
          }
          .mfc-m-fav {
            position: absolute; top: 6px; left: 6px; z-index: 2;
            width: 30px; height: 30px; border-radius: 50%; background: rgba(20,20,20,0.6);
            border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
          }
          .mfc-m-fav.active { background: rgba(224,85,85,0.15); }
          .map-float-photo-count {
            position: absolute; bottom: 6px; right: 6px;
            display: flex; align-items: center; gap: 3px;
            background: rgba(20,20,20,0.7); padding: 2px 8px; border-radius: 100px;
            font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.85);
            font-family: 'DM Sans', sans-serif;
          }
          .mfp-nav {
            position: absolute; top: 50%; transform: translateY(-50%);
            width: 26px; height: 26px; border-radius: 50%; background: rgba(20,20,20,0.6);
            border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
            z-index: 2;
          }
          .mfp-prev { left: 4px; }
          .mfp-next { right: 4px; }
          .mfc-m-body {
            flex: 1; padding: 12px 14px; display: flex; flex-direction: column; justify-content: center;
            min-width: 0;
          }
          .mfc-m-name {
            font-family: 'Figtree', sans-serif; font-size: 18px; font-weight: 500;
            color: #141414; line-height: 1.2; margin-bottom: 3px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .mfc-m-specs {
            font-size: 12px; color: #7A7060; letter-spacing: 0.3px;
            margin-bottom: 4px; font-family: 'DM Sans', sans-serif;
          }
          .mfc-m-price {
            font-family: 'DM Sans', sans-serif; font-size: 24px; font-weight: 500;
            color: #141414; line-height: 1; margin-bottom: 6px; font-variant-numeric: tabular-nums;
          }
          .mfc-m-price span { font-size: 13px; color: #7A7060; }
          .mfc-m-badges { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
          .mfc-m-badge {
            font-size: 12px; padding: 2px 6px; border-radius: 100px;
            border: 1px solid #D8D0BC; color: #3A3530;
            font-family: 'DM Sans', sans-serif;
          }
          .mfc-m-actions { display: flex; gap: 6px; }
          .mfc-m-btn-detail {
            flex: 1; padding: 7px; background: transparent; border: 1px solid #D8D0BC;
            color: #3A3530; font-family: 'DM Sans', sans-serif; font-size: 12px;
            font-weight: 500; cursor: pointer; border-radius: 10px;
          }
          .mfc-m-btn-wsp {
            flex: 1; padding: 7px; background: #1EA952; border: none; border-radius: 10px;
            color: #fff; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600;
            text-decoration: none; text-align: center;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="map-float-card">
      <button className="map-float-close" onClick={onClose}>&times;</button>
      <button className={`map-float-fav ${isFavorite ? 'active' : ''}`} onClick={onToggleFavorite}>
        <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : '#7A7060'} strokeWidth="1.5" style={{ width: 18, height: 18 }}>
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </button>
      <div className="map-float-photo" style={{ ...(photos[photoIdx] ? { backgroundImage: `url('${photos[photoIdx]}')` } : {}) }}>
        {photos.length > 1 && (
          <>
            {photoIdx > 0 && (
              <button className="mfp-nav mfp-prev" onClick={(e) => { e.stopPropagation(); setPhotoIdx(photoIdx - 1) }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 14, height: 14 }}><path d="M15 18l-6-6 6-6"/></svg>
              </button>
            )}
            {photoIdx < photos.length - 1 && (
              <button className="mfp-nav mfp-next" onClick={(e) => { e.stopPropagation(); setPhotoIdx(photoIdx + 1) }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 14, height: 14 }}><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )}
            <div className="map-float-photo-count">{photoIdx + 1}/{photos.length}</div>
          </>
        )}
      </div>
      <div className="map-float-body">
        <div className="map-float-name">{spName}</div>
        <div className="map-float-zona">{displayZona(sp.zona)} · {sp.area_m2}m² · {dormLabel(sp.dormitorios)}</div>
        <div className="map-float-price">{formatPrice(sp.precio_mensual_bob)}<span>/mes</span></div>
        {spBadges.length > 0 && (
          <div className="map-float-badges">{spBadges.map((b, i) => <span key={i} className="map-float-badge">{b}</span>)}</div>
        )}
        <div className="map-float-actions">
          <button className="map-float-btn-detail" onClick={onOpenDetail}>Ver detalles</button>
          {sp.agente_whatsapp && (
            <a href={buildLeadWhatsAppUrl(sp, `Hola, vi ${spName} en Simon y me interesa${sp.url ? '\n' + sp.url : ''}`, 'map_card')} onClick={() => trackWhatsAppClick(sp, 'map_card')} target="_blank" rel="noopener noreferrer" className="map-float-btn-wsp">WhatsApp</a>
          )}
        </div>
      </div>
      <style jsx>{`
        .map-float-card {
          position: absolute; bottom: 20px; left: 20px; z-index: 1000;
          width: 320px; background: #FAFAF8; border: 1px solid #D8D0BC;
          border-radius: 14px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
          animation: mapFloatIn 0.25s ease-out;
        }
        @keyframes mapFloatIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .map-float-close {
          position: absolute; top: 8px; right: 8px; z-index: 2;
          width: 28px; height: 28px; border-radius: 50%; background: rgba(20,20,20,0.7);
          border: none; color: rgba(255,255,255,0.8); font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .map-float-fav {
          position: absolute; top: 8px; left: 8px; z-index: 2;
          width: 36px; height: 36px; border-radius: 50%; background: rgba(20,20,20,0.6);
          border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: transform 0.15s;
        }
        .map-float-fav:hover { transform: scale(1.1); }
        .map-float-fav.active { background: rgba(224,85,85,0.15); }
        .map-float-photo {
          height: 140px; background-size: cover; background-position: center; background-color: #D8D0BC;
          position: relative;
        }
        .map-float-photo-count {
          position: absolute; bottom: 8px; right: 8px;
          display: flex; align-items: center; gap: 4px;
          background: rgba(20,20,20,0.7); padding: 4px 10px; border-radius: 100px;
          font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.85);
          font-family: 'DM Sans', sans-serif;
        }
        .mfp-nav {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 32px; height: 32px; border-radius: 50%; background: rgba(20,20,20,0.6);
          border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
          z-index: 2; transition: background 0.15s;
        }
        .mfp-nav:hover { background: rgba(20,20,20,0.85); }
        .mfp-prev { left: 6px; }
        .mfp-next { right: 6px; }
        .map-float-body { padding: 14px 16px; }
        .map-float-name {
          font-family: 'Figtree', sans-serif; font-size: 19px; font-weight: 500;
          color: #141414; line-height: 1.2; margin-bottom: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .map-float-zona {
          font-size: 12px; color: #7A7060; letter-spacing: 0.5px;
          margin-bottom: 8px; font-family: 'DM Sans', sans-serif;
        }
        .map-float-price {
          font-family: 'DM Sans', sans-serif; font-size: 26px; font-weight: 500;
          color: #141414; line-height: 1; margin-bottom: 8px; font-variant-numeric: tabular-nums;
        }
        .map-float-price span { font-size: 14px; color: #7A7060; }
        .map-float-badges { display: flex; gap: 5px; margin-bottom: 10px; }
        .map-float-badge {
          font-size: 12px; padding: 3px 8px; border-radius: 100px;
          border: 1px solid #D8D0BC; color: #3A3530;
          font-family: 'DM Sans', sans-serif;
        }
        .map-float-actions { display: flex; gap: 8px; }
        .map-float-btn-detail {
          flex: 1; padding: 9px; background: transparent; border: 1px solid #D8D0BC;
          color: #3A3530; font-family: 'DM Sans', sans-serif; font-size: 12px;
          font-weight: 500; cursor: pointer; border-radius: 10px; transition: all 0.2s;
        }
        .map-float-btn-detail:hover { border-color: #7A7060; color: #141414; }
        .map-float-btn-wsp {
          flex: 1; padding: 9px; background: #1EA952; border: none; border-radius: 10px;
          color: #fff; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600;
          text-decoration: none; text-align: center; transition: opacity 0.2s;
        }
        .map-float-btn-wsp:hover { opacity: 0.9; }
      `}</style>
    </div>
  )
}

// ===== DESKTOP CARD =====
function DesktopCard({ property: p, isFavorite, favoritesCount, petFilterActive, onToggleFavorite, onOpenInfo, onPhotoTap, onShare, isFirst }: {
  property: UnidadAlquiler; isFavorite: boolean; favoritesCount: number; petFilterActive?: boolean
  onToggleFavorite: () => void; onOpenInfo: () => void; onPhotoTap?: (photoIdx: number) => void; onShare?: () => void; isFirst?: boolean
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = (p.fotos_urls?.length ?? 0) > 0 ? p.fotos_urls : ['']
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!!isFirst)

  // Lazy load: only render image when card enters viewport
  useEffect(() => {
    if (isFirst) return
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        obs.disconnect()
      }
    }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [isFirst])
  const displayName = p.nombre_edificio || p.nombre_proyecto || 'Departamento'

  const badges: Array<{ text: string; color: string }> = []
  if (p.dias_en_mercado !== null && p.dias_en_mercado <= 7) badges.push({ text: 'Nuevo', color: 'green' })
  if (p.amoblado === 'si') badges.push({ text: 'Amoblado', color: 'gold' })
  if (p.amoblado === 'semi') badges.push({ text: 'Semi-amoblado', color: 'gold' })
  if (p.acepta_mascotas) badges.push({ text: petFilterActive ? 'Acepta mascotas' : 'Mascotas', color: 'purple' })
  else if (p.acepta_mascotas === null && petFilterActive) badges.push({ text: '🐾 Mascotas: consultar', color: 'warn' })
  if (p.monto_expensas_bob && p.monto_expensas_bob > 0) badges.push({ text: 'Expensas incl.', color: 'gold' })
  if (p.estacionamientos && p.estacionamientos > 0) badges.push({ text: `${p.estacionamientos} parqueo`, color: '' })
  if (p.baulera) badges.push({ text: 'Baulera', color: '' })

  function handleFav() {
    if (!isFavorite && favoritesCount >= MAX_FAVORITES) return
    onToggleFavorite()
  }

  return (
    <div className={`dc-card${petFilterActive && p.acepta_mascotas === true ? ' pet-confirmed' : ''}`} ref={cardRef}>
      {/* Photo */}
      <div className="dc-photo" style={{ ...(visible && photos[photoIdx] ? { backgroundImage: `url('${photos[photoIdx]}')` } : { background: '#D8D0BC' }), cursor: photos[photoIdx] ? 'pointer' : undefined }} onClick={() => { if (photos[photoIdx] && onPhotoTap) onPhotoTap(photoIdx) }}>
        {photos.length > 1 && (
          <>
            {photoIdx > 0 && (
              <button className="dc-nav dc-prev" aria-label="Foto anterior" onClick={() => setPhotoIdx(photoIdx - 1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M15 18l-6-6 6-6"/></svg>
              </button>
            )}
            {photoIdx < photos.length - 1 && (
              <button className="dc-nav dc-next" aria-label="Foto siguiente" onClick={() => setPhotoIdx(photoIdx + 1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )}
            <div className="dc-photo-count">{photoIdx + 1}/{photos.length}</div>
          </>
        )}
        {/* Fav + Share buttons on photo */}
        <button className={`dc-fav-btn ${isFavorite ? 'active' : ''}`} aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'} onClick={(e) => { e.stopPropagation(); handleFav() }}>
          <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : '#7A7060'} strokeWidth="1.5" style={{ width: 20, height: 20 }}>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
        {onShare && (
          <button className="dc-share-btn" aria-label="Compartir por WhatsApp" onClick={(e) => { e.stopPropagation(); onShare() }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ width: 18, height: 18 }}>
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="dc-content">
        <div className="dc-name">{displayName}</div>
        <div className="dc-zona">{displayZona(p.zona)} <span className="dc-id">#{p.id}</span></div>
        <div className="dc-price">{formatPrice(p.precio_mensual_bob)}<span>/mes</span></div>
        <div className="dc-specs">
          {p.area_m2}m² · {dormLabel(p.dormitorios)} · {p.banos ? `${p.banos} baño${p.banos > 1 ? 's' : ''}` : '—'}{p.piso ? ` · ${p.piso}° piso` : ''}
        </div>
        <div className="dc-badges">
          {badges.slice(0, 4).map((b, i) => (
            <span key={i} className={`dc-badge ${b.color}`}>{b.text}</span>
          ))}
        </div>
        <div className="dc-actions">
          <button className="dc-info-btn" onClick={onOpenInfo}>Ver detalles</button>
        </div>
        {p.agente_whatsapp && (
          <a href={buildLeadWhatsAppUrl(p, `Hola, vi este alquiler en Simon y me interesa: ${displayName} - ${formatPrice(p.precio_mensual_bob)}/mes${p.url ? '\n' + p.url : ''}`, 'card_desktop')} onClick={() => trackWhatsAppClick(p, 'card_desktop')} target="_blank" rel="noopener noreferrer" className="dc-wsp-cta">
            <svg viewBox="0 0 24 24" fill="#fff" style={{ width: 16, height: 16 }}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </a>
        )}
      </div>

      <style jsx>{`
        .dc-card { background: #FAFAF8; border: 1px solid #D8D0BC; border-radius: 14px; overflow: hidden; transition: transform 0.25s, box-shadow 0.25s; }
        .dc-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(58,53,48,0.08); }
        .dc-photo { height: 220px; background-size: cover; background-position: center; background-color: #D8D0BC; position: relative; animation: dcShimmer 1.5s ease-in-out infinite; }
        @keyframes dcShimmer { 0%,100%{background-color:#D8D0BC} 50%{background-color:#EDE8DC} }
        .dc-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 50%; background: rgba(20,20,20,0.6); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .dc-prev { left: 8px; }
        .dc-next { right: 8px; }
        .dc-photo-count { position: absolute; top: 10px; right: 10px; background: rgba(20,20,20,0.6); padding: 3px 10px; border-radius: 100px; font-size: 12px; color: rgba(255,255,255,0.8); font-family: 'DM Sans', sans-serif; }
        .dc-fav-btn { position: absolute; top: 10px; left: 10px; width: 44px; height: 44px; border-radius: 50%; background: rgba(20,20,20,0.5); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.15s; }
        .dc-fav-btn:hover { transform: scale(1.1); }
        .dc-fav-btn.active { background: rgba(224,85,85,0.15); }
        .dc-share-btn { position: absolute; top: 10px; left: 62px; width: 44px; height: 44px; border-radius: 50%; background: rgba(20,20,20,0.5); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.15s; }
        .dc-share-btn:hover { transform: scale(1.1); background: rgba(20,20,20,0.7); }
        .dc-content { padding: 16px; }
        .dc-name { font-family: 'Figtree', sans-serif; font-size: 20px; font-weight: 500; color: #141414; line-height: 1.2; margin-bottom: 2px; }
        .dc-zona { font-size: 12px; color: #7A7060; letter-spacing: 0.5px; margin-bottom: 10px; font-family: 'DM Sans', sans-serif; }
        .dc-id { color: #7A7060; font-size: 12px; margin-left: 4px; letter-spacing: 0; }
        .dc-price { font-family: 'DM Sans', sans-serif; font-size: 28px; font-weight: 500; color: #141414; line-height: 1; margin-bottom: 4px; font-variant-numeric: tabular-nums; }
        .dc-price span { font-size: 16px; color: #7A7060; }
        .dc-specs { font-size: 12px; color: #3A3530; margin-bottom: 10px; font-family: 'DM Sans', sans-serif; }
        .dc-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
        .dc-badge { font-size: 12px; font-weight: 500; padding: 3px 8px; border-radius: 100px; border: 1px solid #D8D0BC; color: #3A3530; font-family: 'DM Sans', sans-serif; }
        .dc-badge.gold { background: #141414; color: #EDE8DC; border-color: #141414; }
        .dc-badge.purple { background: #3A6A48; color: #EDE8DC; border-color: #3A6A48; }
        .dc-badge.green { background: #3A6A48; color: #EDE8DC; border-color: #3A6A48; }
        .dc-badge.warn { border-color: #3A3530; color: #3A3530; background: rgba(58,53,48,0.04); }
        .dc-card.pet-confirmed { border-left: 3px solid rgba(168,85,247,0.4); }
        .dc-actions { display: flex; gap: 8px; border-top: 1px solid #D8D0BC; padding-top: 12px; }
        .dc-info-btn { flex: 1; padding: 8px; background: transparent; border: 1px solid #D8D0BC; color: #3A3530; font-family: 'DM Sans', sans-serif; font-size: 12px; cursor: pointer; border-radius: 10px; transition: all 0.2s; }
        .dc-info-btn:hover { border-color: #7A7060; color: #141414; }
        .dc-wsp-cta { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 10px; background: #1EA952; border: none; border-radius: 10px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; text-decoration: none; margin-top: 8px; transition: opacity 0.2s; }
        .dc-wsp-cta:hover { opacity: 0.9; }
        @media (prefers-reduced-motion: reduce) {
          .dc-photo { animation: none; }
          .dc-card { transition: none; }
          .dc-fav-btn { transition: none; }
        }
      `}</style>
    </div>
  )
}

// ===== MOBILE PROPERTY CARD (full-screen) =====
function MobilePropertyCard({
  property: p, isFirst, showHint, isFavorite, favoritesCount, isSpotlight, petFilterActive, onToggleFavorite, onOpenInfo, onPhotoTap, onShare,
}: {
  property: UnidadAlquiler; isFirst: boolean; showHint?: boolean; isFavorite: boolean; favoritesCount: number; isSpotlight: boolean; petFilterActive?: boolean
  onToggleFavorite: () => void; onOpenInfo: () => void; onPhotoTap?: (photoIdx: number) => void; onShare?: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [shakeBtn, setShakeBtn] = useState(false)

  function handleFavorite() {
    if (!isFavorite && favoritesCount >= MAX_FAVORITES) {
      setShakeBtn(true); setTimeout(() => setShakeBtn(false), 300); return
    }
    onToggleFavorite()
  }

  const badges: Array<{ text: string; color: string }> = []
  if (p.dias_en_mercado !== null && p.dias_en_mercado <= 7) badges.push({ text: 'Nuevo', color: 'green' })
  if (p.amoblado === 'si') badges.push({ text: 'Amoblado', color: 'gold' })
  if (p.amoblado === 'semi') badges.push({ text: 'Semi-amoblado', color: 'gold' })
  if (p.acepta_mascotas) badges.push({ text: petFilterActive ? 'Acepta mascotas' : 'Mascotas', color: 'purple' })
  else if (p.acepta_mascotas === null && petFilterActive) badges.push({ text: '🐾 Mascotas: consultar', color: 'warn' })
  if (p.monto_expensas_bob && p.monto_expensas_bob > 0) badges.push({ text: 'Expensas incl.', color: 'gold' })
  if (p.estacionamientos && p.estacionamientos > 0) badges.push({ text: `${p.estacionamientos} parqueo`, color: '' })
  if (p.baulera) badges.push({ text: 'Baulera', color: '' })
  if (p.deposito_meses) badges.push({ text: `Deposito ${p.deposito_meses}m`, color: '' })

  const displayName = p.nombre_edificio || p.nombre_proyecto || 'Departamento'

  return (
    <div className={`alq-card${petFilterActive && p.acepta_mascotas === true ? ' pet-confirmed' : ''}`} ref={cardRef}>
      <PhotoCarousel photos={p.fotos_urls || []} isFirst={isFirst} showHint={showHint} onPhotoTap={onPhotoTap} />
      {isSpotlight && (
        <div className="mc-spotlight-badge">Te compartieron este depto</div>
      )}
      <div className="mc-content">
        <div className="mc-name">{displayName}</div>
        <div className="mc-zona">{displayZona(p.zona)} <span className="mc-id">#{p.id}</span></div>
        <div className="mc-price">{formatPrice(p.precio_mensual_bob)}/mes</div>
        <div className="mc-specs">{p.area_m2}m² · {dormLabel(p.dormitorios)} · {p.banos ? `${p.banos} baño${p.banos > 1 ? 's' : ''}` : '—'}{p.piso ? ` · ${p.piso}°` : ''}</div>
        <div className="mc-badges">
          {badges.slice(0, 4).map((b, i) => <span key={i} className={`mc-badge ${b.color}`}>{b.text}</span>)}
        </div>
        {p.descripcion && (
          <div className="mc-razon">&ldquo;{p.descripcion.slice(0, 120)}{p.descripcion.length > 120 ? '...' : ''}&rdquo;</div>
        )}
        <div className="mc-actions">
          <button className={`mc-btn mc-fav ${isFavorite ? 'active' : ''} ${shakeBtn ? 'shake' : ''}`} aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'} onClick={handleFavorite}>
            <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : '#7A7060'} strokeWidth="1.5" style={{ width: 22, height: 22 }}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          {onShare && (
            <button className="mc-btn mc-share" aria-label="Compartir por WhatsApp" onClick={onShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 18, height: 18 }}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg> Compartir
            </button>
          )}
          <button className="mc-btn mc-info" onClick={onOpenInfo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg> Ver mas
          </button>
        </div>
        {p.agente_whatsapp && (
          <a href={buildLeadWhatsAppUrl(p, `Hola, vi este alquiler en Simon y me interesa: ${p.nombre_edificio || p.nombre_proyecto || 'Departamento'} - ${formatPrice(p.precio_mensual_bob)}/mes${p.url ? '\n' + p.url : ''}`, 'card_mobile')} onClick={() => trackWhatsAppClick(p, 'card_mobile')} target="_blank" rel="noopener noreferrer" className="mc-wsp-cta">
            <svg viewBox="0 0 24 24" fill="#fff" style={{ width: 18, height: 18 }}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Consultar por WhatsApp
          </a>
        )}
      </div>
      {isFirst && <div className="mc-scroll-hint"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{width:18,height:18}}><path d="M12 5v14M19 12l-7 7-7-7"/></svg></div>}

      <style jsx>{`
        .alq-card { height: 100vh; height: 100dvh; scroll-snap-align: start; scroll-snap-stop: always; position: relative; overflow: hidden; display: flex; flex-direction: column; background: #EDE8DC; }
        .mc-content { flex: 1; padding: 0 24px 20px; padding-bottom: max(20px, calc(env(safe-area-inset-bottom) + 8px)); display: flex; flex-direction: column; overflow: hidden; }
        .mc-name { font-family: 'Figtree', sans-serif; font-size: 22px; font-weight: 500; color: #141414; line-height: 1.1; margin-bottom: 3px; padding-top: 16px; }
        .mc-zona { font-size: 12px; color: #7A7060; letter-spacing: 0.5px; margin-bottom: 8px; font-family: 'DM Sans', sans-serif; }
        .mc-id { color: #7A7060; font-size: 12px; margin-left: 4px; letter-spacing: 0; }
        .mc-price { font-family: 'DM Sans', sans-serif; font-size: 28px; font-weight: 500; color: #141414; line-height: 1; margin-bottom: 8px; font-variant-numeric: tabular-nums; }
        .mc-specs { font-size: 13px; font-weight: 300; color: #3A3530; margin-bottom: 12px; font-family: 'DM Sans', sans-serif; }
        .mc-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .mc-badge { font-size: 12px; font-weight: 500; letter-spacing: 0.5px; padding: 4px 10px; border-radius: 100px; border: 1px solid #D8D0BC; color: #3A3530; background: #FAFAF8; font-family: 'DM Sans', sans-serif; box-shadow: 0 1px 4px rgba(58,53,48,0.06); }
        .mc-badge.gold { background: #141414; color: #EDE8DC; border-color: #141414; box-shadow: none; }
        .mc-badge.purple { background: #3A6A48; color: #EDE8DC; border-color: #3A6A48; box-shadow: none; }
        .mc-badge.green { background: #3A6A48; color: #EDE8DC; border-color: #3A6A48; box-shadow: none; }
        .mc-badge.warn { border-color: #3A3530; color: #3A3530; background: rgba(58,53,48,0.04); font-weight: 600; box-shadow: none; }
        .alq-card.pet-confirmed { border-left: 3px solid rgba(168,85,247,0.4); }
        .mc-razon { font-size: 12px; font-weight: 300; color: #7A7060; line-height: 1.5; margin-bottom: auto; font-style: italic; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .mc-actions { display: flex; align-items: center; gap: 12px; padding-top: 10px; border-top: 1px solid #D8D0BC; margin-top: 8px; }
        .mc-btn { display: flex; align-items: center; justify-content: center; gap: 5px; background: none; border: none; color: #7A7060; font-size: 12px; font-family: 'DM Sans', sans-serif; cursor: pointer; padding: 8px; min-width: 44px; min-height: 44px; }
        .mc-btn.mc-fav.active svg { filter: drop-shadow(0 2px 4px rgba(224,85,85,0.4)); }
        .mc-btn.mc-share { color: #7A7060; }
        .mc-btn.mc-info { color: #4A4438; font-size: 12px; letter-spacing: 0.5px; background: rgba(216,208,188,0.45); border-radius: 20px; padding: 8px 14px; font-weight: 500; }
        .mc-wsp-cta { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 12px; background: #1EA952; border: none; border-radius: 10px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; text-decoration: none; margin-top: 8px; min-height: 44px; transition: opacity 0.2s; }
        .mc-wsp-cta:active { opacity: 0.85; }
        .mc-btn.shake { animation: mcShake 0.3s ease; }
        @keyframes mcShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
        .mc-spotlight-badge { position: absolute; top: max(56px, calc(env(safe-area-inset-top) + 50px)); left: 16px; z-index: 10; background: rgba(250,250,248,0.92); border-left: 3px solid #3A6A48; padding: 8px 14px; border-radius: 0 14px 14px 0; font-family: 'DM Sans', sans-serif; font-size: 12px; color: #3A3530; letter-spacing: 0.3px; }
        .mc-scroll-hint { position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%); z-index: 10; animation: mcBounce 2s infinite; opacity: 0.25; }
        @keyframes mcBounce { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-5px)} }
        @media (prefers-reduced-motion: reduce) {
          .mc-btn.shake { animation: none; }
          .mc-scroll-hint { animation: none; }
          .mc-wsp-cta { transition: none; }
        }
      `}</style>
    </div>
  )
}

// ===== PHOTO CAROUSEL (native scroll-snap) =====
function PhotoCarousel({ photos, isFirst, showHint, onPhotoTap }: { photos: string[]; isFirst: boolean; showHint?: boolean; onPhotoTap?: (index: number) => void }) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const total = photos.length || 1
  // Only load current slide + 1 neighbor to save bandwidth
  const [maxLoaded, setMaxLoaded] = useState(isFirst ? 2 : 0)
  const zoneRef = useRef<HTMLDivElement>(null)

  // Lazy: only start loading when card enters viewport
  useEffect(() => {
    if (isFirst) return // first card loads immediately
    const el = zoneRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setMaxLoaded(2)
        obs.disconnect()
      }
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [isFirst])

  // Detect current slide via scroll position
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        if (!el) return
        const idx = Math.round(el.scrollLeft / el.offsetWidth)
        setCurrentIdx(idx)
        // Preload next slide
        setMaxLoaded(prev => Math.max(prev, idx + 2))
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="pc-zone" ref={zoneRef}>
      <div className="pc-scroll" ref={scrollRef}>
        {(photos.length > 0 ? photos : ['']).map((url, i) => {
          const shouldLoad = i < maxLoaded
          const useRealImg = isFirst && i === 0 && url
          return (
          <div key={i} className="pc-slide" style={!useRealImg ? (shouldLoad && url ? { backgroundImage: `url('${url}')` } : { background: '#D8D0BC' }) : { background: '#D8D0BC' }}
            onTouchStart={() => { isDragging.current = false }}
            onTouchMove={() => { isDragging.current = true }}
            onClick={() => { if (!isDragging.current && onPhotoTap && url) onPhotoTap(currentIdx) }}
          >
            {/* First photo of first card uses real <img> for LCP priority */}
            {useRealImg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt=""
                fetchPriority="high"
                draggable={false}
                className="pc-slide-img"
              />
            )}
          </div>
          )
        })}
      </div>
      <div className="pc-counter">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:14,height:14,opacity:0.7}}>
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
        </svg>
        {currentIdx + 1}/{total}
      </div>
      {total > 1 && (
        <div className="pc-dots">
          {Array.from({ length: Math.min(total, 8) }).map((_, i) => (
            <div key={i} className={`pc-dot ${i === currentIdx ? 'active' : ''}`} />
          ))}
        </div>
      )}
      {(showHint ?? isFirst) && total > 1 && (
        <div className="pc-swipe-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:20,height:20}}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Desliza para mas fotos
        </div>
      )}
      <style jsx>{`
        .pc-zone { flex: 0 0 55%; position: relative; overflow: hidden; }
        .pc-zone::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 24px; background: linear-gradient(transparent, #EDE8DC); pointer-events: none; z-index: 2; }
        .pc-scroll { display: flex; height: 100%; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .pc-scroll::-webkit-scrollbar { display: none; }
        .pc-slide { flex: 0 0 100%; height: 100%; background-size: cover; background-position: center; background-color: #D8D0BC; scroll-snap-align: start; animation: imgShimmer 1.5s ease-in-out infinite; position: relative; overflow: hidden; }
        .pc-slide-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; pointer-events: none; }
        @keyframes imgShimmer { 0%,100%{background-color:#D8D0BC} 50%{background-color:#EDE8DC} }
        .pc-counter { position: absolute; bottom: 36px; right: 16px; z-index: 5; background: rgba(20,20,20,0.75); padding: 5px 12px; border-radius: 100px; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.8); display: flex; align-items: center; gap: 5px; font-family: 'DM Sans', sans-serif; }
        .pc-dots { position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 5; }
        .pc-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(20,20,20,0.25); transition: all 0.25s; }
        .pc-dot.active { background: #141414; width: 20px; border-radius: 3px; }
        .pc-swipe-hint { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 10; display: flex; align-items: center; gap: 8px; background: rgba(20,20,20,0.65); padding: 10px 20px; border-radius: 100px; color: rgba(255,255,255,0.8); font-size: 13px; font-family: 'DM Sans', sans-serif; pointer-events: none; animation: pcFade 3s ease-in-out forwards; }
        @keyframes pcFade { 0%{opacity:0} 15%{opacity:1} 70%{opacity:1} 100%{opacity:0} }
        @media (prefers-reduced-motion: reduce) {
          .pc-slide { animation: none; }
          .pc-swipe-hint { animation: none; opacity: 0.7; }
          .pc-dot { transition: none; }
        }
      `}</style>
    </div>
  )
}

// ===== MOBILE FILTER CARD =====
function MobileFilterCard({ totalCount, filteredCount, currentFilters, isFiltered, onApply, onReset }: {
  totalCount: number; filteredCount: number; currentFilters: FiltrosAlquiler; isFiltered: boolean
  onApply: (f: FiltrosAlquiler) => void; onReset: () => void
}) {
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_mensual_max || MAX_SLIDER_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set())
  const [amoblado, setAmoblado] = useState(currentFilters.amoblado || false)
  const [mascotas, setMascotas] = useState(currentFilters.acepta_mascotas || false)
  const [conParqueo, setConParqueo] = useState(currentFilters.con_parqueo || false)
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set(currentFilters.zonas_permitidas || []))
  const [orden, setOrden] = useState<FiltrosAlquiler['orden']>(currentFilters.orden || 'recientes')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const previewRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)
  const [isDirty, setIsDirty] = useState(false)

  // Build filters from current local state
  const buildFilters = useCallback((): FiltrosAlquiler => {
    const f: FiltrosAlquiler = { orden: orden || 'recientes', limite: 200, solo_con_fotos: true }
    if (maxPrice < MAX_SLIDER_PRICE) f.precio_mensual_max = maxPrice
    if (selectedDorms.size > 0) f.dormitorios_lista = Array.from(selectedDorms)
    if (amoblado) f.amoblado = true
    if (mascotas) f.acepta_mascotas = true
    if (conParqueo) f.con_parqueo = true
    if (selectedZonas.size > 0) f.zonas_permitidas = Array.from(selectedZonas)
    return f
  }, [maxPrice, selectedDorms, amoblado, mascotas, conParqueo, selectedZonas, orden])

  // Preview count: debounced RPC call as filters change
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setIsDirty(true)
    if (previewRef.current) clearTimeout(previewRef.current)
    previewRef.current = setTimeout(async () => {
      const f = buildFilters()
      const { data } = await fetchFromAPI({ ...f, limite: 200 })
      const total = data.length
      setPreviewCount(total)
    }, 400)
    return () => { if (previewRef.current) clearTimeout(previewRef.current) }
  }, [buildFilters])

  function toggleDorm(d: number) { setSelectedDorms(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n }) }
  function toggleZona(id: string) { setSelectedZonas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  function handleApply() {
    setIsDirty(false)
    onApply(buildFilters())
  }

  return (
    <div className="alq-card mfc" id="filterCard">
      {/* Compact header: count + label */}
      <div className="mfc-header">
        <span className="mfc-count">{previewCount !== null ? previewCount : (isFiltered ? filteredCount : totalCount)}</span>
        <span className="mfc-sub">{previewCount !== null || isFiltered ? `de ${totalCount} alquileres` : 'alquileres en Equipetrol'}</span>
      </div>
      <div className="mfc-divider"><span className="mfc-line"/><span className="mfc-divider-text">Filtra</span><span className="mfc-line"/></div>

      <div className="mfc-filters">
        <div className="mfc-group"><div className="mfc-gl"><span className="mfc-dot"/>MICROZONA</div>
          <div className="mfc-zonas">{ZONAS_ALQUILER_UI.filter(z => z.id !== 'sin_zona').map(z => <button key={z.id} className={`mfc-zb ${selectedZonas.has(z.id)?'active':''}`} onClick={()=>toggleZona(z.id)}>{z.label}</button>)}</div>
        </div>
        <div className="mfc-group"><div className="mfc-gl"><span className="mfc-dot"/>PRESUPUESTO MAXIMO</div>
          <input type="range" className="mfc-slider" min={2000} max={MAX_SLIDER_PRICE} step={500} value={maxPrice} onChange={e=>setMaxPrice(parseInt(e.target.value))}/>
          <div className="mfc-sv">{formatPrice(maxPrice)}/mes</div>
        </div>
        <div className="mfc-group"><div className="mfc-gl"><span className="mfc-dot"/>DORMITORIOS</div>
          <div className="mfc-dorms">{[0,1,2,3].map(d=><button key={d} className={`mfc-db ${selectedDorms.has(d)?'active':''}`} onClick={()=>toggleDorm(d)}>{d===0?'Mono':d===3?'3+':d}</button>)}</div>
        </div>
        <div className="mfc-group"><div className="mfc-dorms">
          <button className={`mfc-db mfc-amoblado ${amoblado?'active':''}`} onClick={()=>setAmoblado(!amoblado)}>Amoblado</button>
          <button className={`mfc-db mfc-mascotas ${mascotas?'active':''}`} onClick={()=>setMascotas(!mascotas)}>Mascotas</button>
          <button className={`mfc-db ${conParqueo?'active':''}`} onClick={()=>setConParqueo(!conParqueo)}>Parqueo</button>
        </div></div>
        <div className="mfc-group"><div className="mfc-gl"><span className="mfc-dot"/>ORDENAR POR</div>
          <div className="mfc-dorms">{ORDEN_OPTIONS.map(o=><button key={o.value} className={`mfc-db ${orden===o.value?'active':''}`} onClick={()=>setOrden(o.value)}>{o.label}</button>)}</div>
        </div>
      </div>
      <button className={`mfc-cta ${isDirty ? 'mfc-cta-dirty' : ''}`} onClick={handleApply}>
        {isDirty
          ? `APLICAR FILTROS${previewCount !== null ? ` · ${previewCount}` : ''}`
          : `FILTRAR${previewCount !== null ? ` · ${previewCount}` : ''}`
        }
      </button>
      {isFiltered && <button className="mfc-reset" onClick={onReset}>Quitar filtros · ver todas</button>}
      <div className="mfc-skip">segui explorando &darr;</div>
      <style jsx>{`
        .mfc { display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;padding:60px 28px 20px;padding-bottom:max(20px,calc(env(safe-area-inset-bottom) + 8px));height:100vh;height:100dvh;scroll-snap-align:start;background:#EDE8DC; }
        .mfc-header { display:flex;align-items:baseline;gap:8px;margin-bottom:6px; }
        .mfc-count { font-family:'Figtree',sans-serif;font-size:40px;font-weight:500;color:#141414;line-height:1;font-variant-numeric:tabular-nums; }
        .mfc-sub { font-size:15px;font-weight:400;color:#7A7060;font-family:'DM Sans',sans-serif; }
        .mfc-divider { display:flex;align-items:center;gap:12px;margin-bottom:20px; }
        .mfc-line { flex:1;height:1px;background:#D8D0BC; }
        .mfc-divider-text { font-size:12px;color:#3A3530;letter-spacing:0.5px;font-family:'DM Sans',sans-serif;text-transform:uppercase; }
        .mfc-filters { width:100%;max-width:320px;margin-bottom:16px; }
        .mfc-group { margin-bottom:14px;text-align:left; }
        .mfc-gl { font-size:12px;font-weight:600;color:#3A3530;letter-spacing:0.5px;margin-bottom:7px;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:6px; }
        .mfc-dot { width:6px;height:6px;border-radius:50%;background:#3A6A48;flex-shrink:0; }
        .mfc-zonas { display:flex;flex-wrap:wrap;gap:7px; }
        .mfc-zb { padding:7px 14px;border:1px solid #D8D0BC;background:#FAFAF8;color:#3A3530;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;border-radius:100px;transition:all 0.2s; }
        .mfc-zb.active { border-color:#3A6A48;border-width:2px;color:#141414;background:#FAFAF8;font-weight:600;box-shadow:0 2px 8px rgba(58,106,72,0.12); }
        .mfc-dorms { display:flex;gap:8px; }
        .mfc-db { flex:1;padding:10px;border:1px solid #D8D0BC;background:#FAFAF8;color:#3A3530;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;border-radius:10px;transition:all 0.2s; }
        .mfc-db.active { border-color:#3A6A48;border-width:2px;color:#141414;background:#FAFAF8;font-weight:600;box-shadow:0 2px 8px rgba(58,106,72,0.12); }
        .mfc-mascotas.active { background:#3A6A48;color:#EDE8DC;border-color:#3A6A48; }
        .mfc-amoblado.active { background:#141414;color:#EDE8DC;border-color:#141414; }
        .mfc-slider { width:100%;-webkit-appearance:none;appearance:none;height:3px;background:#D8D0BC;border-radius:2px;outline:none; }
        .mfc-slider::-webkit-slider-thumb { -webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#FAFAF8;border:2px solid #141414;cursor:pointer; }
        .mfc-sv { text-align:right;font-size:15px;color:#141414;margin-top:4px;font-weight:600;font-family:'DM Sans',sans-serif;font-variant-numeric:tabular-nums; }
        .mfc-cta { display:block;width:100%;max-width:320px;padding:15px;background:rgba(20,20,20,0.08);border:1px solid #D8D0BC;color:#7A7060;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;cursor:pointer;margin-bottom:10px;border-radius:10px;transition:all 0.3s; }
        .mfc-cta:active { transform:scale(0.97); }
        .mfc-cta-dirty { background:#141414;border-color:#141414;color:#EDE8DC;animation:mfc-pulse 1.5s ease-in-out infinite; }
        @keyframes mfc-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(20,20,20,0.3)} 50%{box-shadow:0 0 16px 4px rgba(20,20,20,0.2)} }
        .mfc-reset { display:block;width:100%;max-width:320px;padding:11px;background:transparent;border:1px solid #D8D0BC;color:#7A7060;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;margin-bottom:8px;border-radius:10px; }
        .mfc-skip { font-size:13px;color:#7A7060;font-weight:300;font-family:'DM Sans',sans-serif; }
      `}</style>
    </div>
  )
}

// ===== BOTTOM SHEET GALLERY =====
function BottomSheetGallery({ photos }: { photos: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const total = photos.length

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth)
      setCurrentIdx(Math.min(idx, total - 1))
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [total])

  return (
    <div className="bsg-wrap">
      <div className="bsg-scroll" ref={scrollRef}>
        {photos.map((url, i) => (
          <div key={i} className="bsg-slide">
            <img src={url} alt={`Foto ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'} draggable={false} />
          </div>
        ))}
      </div>
      {total > 1 && (
        <div className="bsg-counter">{currentIdx + 1} / {total}</div>
      )}
      {total > 1 && (
        <div className="bsg-dots">
          {photos.slice(0, 8).map((_, i) => (
            <span key={i} className={`bsg-dot ${i === currentIdx ? 'active' : ''}`} />
          ))}
          {total > 8 && <span className="bsg-dot-more">+{total - 8}</span>}
        </div>
      )}
      <style jsx>{`
        .bsg-wrap{position:relative;background:#141414;}
        .bsg-scroll{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
        .bsg-scroll::-webkit-scrollbar{display:none;}
        .bsg-slide{flex:0 0 100%;scroll-snap-align:start;aspect-ratio:4/3;overflow:hidden;}
        .bsg-slide img{width:100%;height:100%;object-fit:cover;display:block;-webkit-user-drag:none;}
        .bsg-counter{position:absolute;bottom:12px;right:12px;background:rgba(20,20,20,0.75);color:#EDE8DC;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;padding:4px 10px;border-radius:100px;}
        .bsg-dots{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:5px;align-items:center;}
        .bsg-dot{width:6px;height:6px;border-radius:50%;background:rgba(237,232,220,0.35);transition:background 0.2s;}
        .bsg-dot.active{background:#EDE8DC;}
        .bsg-dot-more{font-size:10px;color:rgba(237,232,220,0.6);font-family:'DM Sans',sans-serif;}
      `}</style>
    </div>
  )
}

// ===== BOTTOM SHEET =====
function BottomSheet({ open, property, onClose, isDesktop, gateCompleted, onGate, petFilterActive }: {
  open: boolean; property: UnidadAlquiler | null; onClose: () => void; isDesktop: boolean
  gateCompleted: boolean; onGate: (n: string, t: string, c: string, url: string) => void; petFilterActive?: boolean
}) {
  const [showGate, setShowGate] = useState(false)
  const [gateName, setGateName] = useState('')
  const [gateTel, setGateTel] = useState('')
  const [gateEmail, setGateEmail] = useState('')

  // Gesture dismiss (swipe down)
  const sheetRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const touchDeltaY = useRef(0)
  const isDragging = useRef(false)

  function handleTouchStart(e: React.TouchEvent) {
    const el = sheetRef.current
    if (!el || isDesktop) return
    // Only activate if scrolled to top
    if (el.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY
      isDragging.current = true
      touchDeltaY.current = 0
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging.current || !sheetRef.current) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta < 0) { touchDeltaY.current = 0; sheetRef.current.style.transform = ''; return }
    touchDeltaY.current = delta
    sheetRef.current.style.transform = `translateY(${delta * 0.6}px)`
    sheetRef.current.style.transition = 'none'
  }

  function handleTouchEnd() {
    if (!isDragging.current || !sheetRef.current) return
    isDragging.current = false
    sheetRef.current.style.transition = ''
    if (touchDeltaY.current > 120) {
      sheetRef.current.style.transform = ''
      onClose()
    } else {
      sheetRef.current.style.transform = ''
    }
  }

  // Reset gate form when property changes
  const propId = property?.id
  useEffect(() => { setShowGate(false) }, [propId])

  if (!property) return null
  const p = property

  // SVG icons (inline, Lucide-style line icons)
  const icons: Record<string, string> = {
    area: '<path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M3 14h7v7H3z"/><path d="M14 14h7v7h-7z"/>',
    bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v3"/>',
    bath: '<path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h3v2.25"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/>',
    car: '<path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 002 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    box: '<path d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/>',
    sofa: '<path d="M20 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v3"/><path d="M2 11v5a2 2 0 002 2h16a2 2 0 002-2v-5a2 2 0 00-4 0v2H6v-2a2 2 0 00-4 0z"/><path d="M4 18v2"/><path d="M20 18v2"/>',
    paw: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 015 5v3.5a3.5 3.5 0 01-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 015.5 10Z"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1110.34 18"/><path d="M7 6h1v4"/><path d="M16.71 13.88l.7.71-2.82 2.82"/>',
    home: '<path d="M15 21v-8a1 1 0 00-1-1h-4a1 1 0 00-1 1v8"/><path d="M3 10a2 2 0 01.709-1.528l7-5.999a2 2 0 012.582 0l7 5.999A2 2 0 0121 10v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    file: '<path d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z"/><path d="M14 2v4a2 2 0 002 2h4"/>',
  }

  const features: Array<{ icon: string; label: string; value: string; highlight?: boolean }> = []
  features.push({ icon: 'area', label: 'Area', value: `${p.area_m2}m²` })
  features.push({ icon: 'bed', label: 'Tipo', value: dormLabel(p.dormitorios) })
  features.push({ icon: 'bath', label: 'Banos', value: p.banos ? `${p.banos} bano${p.banos > 1 ? 's' : ''}` : '—' })
  if (p.piso !== null) features.push({ icon: 'building', label: 'Piso', value: p.piso === 0 ? 'PB' : `Piso ${p.piso}` })
  if (p.estacionamientos !== null) features.push({ icon: 'car', label: 'Parqueo', value: p.estacionamientos > 0 ? `${p.estacionamientos} incl.` : 'No incl.' })
  if (p.baulera) features.push({ icon: 'box', label: 'Baulera', value: 'Incluida', highlight: true })
  if (p.amoblado === 'si' || p.amoblado === 'semi') features.push({ icon: 'sofa', label: p.amoblado === 'si' ? 'Amoblado' : 'Semi-amoblado', value: '✓', highlight: true })
  if (p.acepta_mascotas !== null) features.push({ icon: 'paw', label: 'Mascotas', value: p.acepta_mascotas ? 'Acepta ✓' : 'No acepta', highlight: p.acepta_mascotas })
  else if (petFilterActive) features.push({ icon: 'paw', label: 'Mascotas', value: 'Consultar', highlight: false })
  if (p.deposito_meses) features.push({ icon: 'coins', label: 'Deposito', value: `${p.deposito_meses} mes${p.deposito_meses > 1 ? 'es' : ''}` })
  if (p.monto_expensas_bob) features.push({ icon: 'home', label: 'Expensas', value: `Bs ${p.monto_expensas_bob}`, highlight: true })
  if (p.contrato_minimo_meses) features.push({ icon: 'file', label: 'Contrato', value: `${p.contrato_minimo_meses} meses` })

  const displayName = p.nombre_edificio || p.nombre_proyecto || 'Detalles'
  const hasGPS = p.latitud && p.longitud

  return (
    <div className={`bs ${open ? 'open' : ''} ${isDesktop ? 'bs-desktop' : ''}`} ref={sheetRef}
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div className="bs-handle" />
      {/* Header negro — nombre, precio, zona, fecha, WhatsApp */}
      <div className="bs-dark-header">
        <div className="bs-dh-top">
          <div>
            <div className="bs-title">{displayName}</div>
            <div className="bs-price">{formatPrice(p.precio_mensual_bob)}<span>/mes</span></div>
            <div className="bs-published">
              {displayZona(p.zona)}
              {p.dias_en_mercado !== null && p.dias_en_mercado >= 0 && (
                <> · {p.dias_en_mercado === 0 ? 'Publicado hoy' : p.dias_en_mercado === 1 ? 'Hace 1 día' : `Hace ${p.dias_en_mercado} días`}</>
              )}
            </div>
          </div>
          <button className="bs-close" aria-label="Cerrar detalle" onClick={onClose}>&times;</button>
        </div>
        {p.agente_whatsapp && (
          <a href={buildLeadWhatsAppUrl(p, `Hola, vi ${p.nombre_edificio || p.nombre_proyecto || 'el departamento'} en Simon y me gustaria mas informacion${p.url ? '\n' + p.url : ''}`, 'bottom_sheet')} onClick={() => trackWhatsAppClick(p, 'bottom_sheet')} target="_blank" rel="noopener noreferrer" className="bs-wsp-cta">
            <svg viewBox="0 0 24 24" fill="#fff" style={{ width: 18, height: 18 }}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Consultar por WhatsApp
          </a>
        )}
      </div>
      {/* Galería de fotos horizontal */}
      {p.fotos_urls && p.fotos_urls.length > 0 && (
        <BottomSheetGallery photos={p.fotos_urls} />
      )}
      {/* Body blanco — características, amenidades, ubicación, anuncio */}
      <div className="bs-section">
        <div className="bs-sl"><span className="bs-sl-dot" />Caracteristicas</div>
        <div className="bs-grid">
          {features.map((f, i) => (
            <div key={i} className={`bs-feat ${f.highlight ? 'hl' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi" dangerouslySetInnerHTML={{ __html: icons[f.icon] || '' }} />
              <div className="bs-fv">{f.value}</div>
              <div className="bs-fl">{f.label}</div>
            </div>
          ))}
        </div>
      </div>
      {p.amenities_lista && p.amenities_lista.length > 0 && (
        <div className="bs-section">
          <div className="bs-sl"><span className="bs-sl-dot" />Amenidades</div>
          <div className="bs-aw">{p.amenities_lista.map((a, i) => <span key={i} className="bs-at">{a}</span>)}</div>
        </div>
      )}
      {hasGPS && (
        <div className="bs-section">
          <a
            href={`https://www.google.com/maps?q=${p.latitud},${p.longitud}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bs-gmaps-link"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 18, height: 18, flexShrink: 0 }}>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Ver ubicacion en Google Maps
          </a>
        </div>
      )}
      {p.url && (
        <div className="bs-section">
          {!showGate ? (
            <button className="bs-ver-anuncio" onClick={() => {
              if (gateCompleted) { window.open(p.url, '_blank') }
              else { setShowGate(true) }
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Ver anuncio original
            </button>
          ) : (
            <div className="bs-gate">
              <div className="bs-gate-title">Para ver el anuncio original, dejanos tus datos</div>
              <input className="bs-gate-input" placeholder="Tu nombre" value={gateName} onChange={e => setGateName(e.target.value)} />
              <input className="bs-gate-input" placeholder="Tu teléfono" value={gateTel} onChange={e => setGateTel(e.target.value)} type="tel" />
              <input className="bs-gate-input" placeholder="Tu correo" value={gateEmail} onChange={e => setGateEmail(e.target.value)} type="email" />
              <button className="bs-gate-submit" onClick={() => {
                if (!gateName.trim() || !gateTel.trim() || !gateEmail.trim()) return
                onGate(gateName.trim(), gateTel.trim(), gateEmail.trim(), p.url || '')
                setShowGate(false)
              }} disabled={!gateName.trim() || !gateTel.trim() || !gateEmail.trim()}>Ver anuncio &#8599;</button>
            </div>
          )}
        </div>
      )}
      <style jsx>{`
        .bs { position:fixed;bottom:0;left:0;right:0;z-index:501;background:#EDE8DC;border-radius:20px 20px 0 0;max-height:80vh;transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.32,0.72,0,1);overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:max(20px,env(safe-area-inset-bottom)); }
        .bs::-webkit-scrollbar{display:none;}
        .bs.open{transform:translateY(0);}
        .bs-desktop{max-width:480px;left:auto;right:0;border-radius:20px 0 0 0;height:100vh;max-height:100vh;}
        .bs-desktop.open{transform:translateY(0);}
        .bs-handle{width:48px;height:4px;background:rgba(154,142,122,0.5);border-radius:2px;margin:12px auto 0;}
        .bs-dark-header{background:#141414;padding:0 24px 20px;border-radius:20px 20px 14px 14px;}
        .bs-dh-top{display:flex;align-items:flex-start;justify-content:space-between;padding-top:16px;}
        .bs-title{font-family:'Figtree',sans-serif;font-size:22px;font-weight:500;color:#EDE8DC;}
        .bs-price{font-family:'DM Sans',sans-serif;font-size:28px;font-weight:500;color:#EDE8DC;margin-top:4px;font-variant-numeric:tabular-nums;}
        .bs-price span{font-size:14px;color:#9A8E7A;font-weight:400;}
        .bs-close{width:44px;height:44px;border-radius:50%;border:none;background:transparent;color:#9A8E7A;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;}
        .bs-published{font-size:13px;color:#9A8E7A;font-family:'DM Sans',sans-serif;margin-top:6px;}
        .bs-section{padding:16px 24px;}
        .bs-sl{font-size:12px;font-weight:600;color:#7A7060;letter-spacing:0.5px;margin-bottom:12px;font-family:'DM Sans',sans-serif;text-transform:uppercase;display:flex;align-items:center;gap:8px;}
        .bs-sl-dot{width:6px;height:6px;border-radius:50%;background:#3A6A48;flex-shrink:0;}
        .bs-wsp-cta{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px;background:#1EA952;border:none;border-radius:10px;color:#fff;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;text-decoration:none;min-height:44px;transition:opacity 0.2s;margin-top:16px;}
        .bs-wsp-cta:active{opacity:0.85;}
        .bs-wsp-agent{font-weight:400;opacity:0.8;}
        .bs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
        .bs-feat{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border-radius:14px;background:#FAFAF8;border:1px solid #D8D0BC;box-shadow:0 2px 8px rgba(58,53,48,0.06);}
        .bs-fi{width:20px;height:20px;color:#7A7060;}
        .bs-fl{font-size:13px;font-weight:300;color:#7A7060;text-align:center;font-family:'DM Sans',sans-serif;}
        .bs-fv{font-size:15px;font-weight:300;color:#141414;font-family:'DM Sans',sans-serif;}
        .bs-feat.hl{border-color:#D8D0BC;background:rgba(58,53,48,0.03);}
        .bs-feat.hl .bs-fl{color:#141414;}
        .bs-feat.hl .bs-fv{color:#141414;font-weight:600;}
        .bs-aw{display:flex;flex-wrap:wrap;gap:6px;}
        .bs-at{font-size:15px;font-weight:300;padding:4px 10px;border-radius:100px;background:#FAFAF8;border:1px solid #D8D0BC;color:#3A3530;font-family:'DM Sans',sans-serif;}
        .bs-ver-anuncio{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;background:transparent;border:1px solid #D8D0BC;color:#3A3530;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;text-decoration:none;border-radius:10px;transition:background 0.2s;cursor:pointer;}
        .bs-ver-anuncio:hover{background:rgba(58,106,72,0.12);}
        .bs-gate{display:flex;flex-direction:column;gap:12px}
        .bs-gate-title{font-size:14px;color:#7A7060;margin-bottom:4px}
        .bs-gate-input{width:100%;padding:12px 14px;background:#EDE8DC;border:1px solid #D8D0BC;border-radius:10px;color:#141414;font-family:'DM Sans',sans-serif;font-size:15px;box-sizing:border-box}
        .bs-gate-input::placeholder{color:#7A7060}
        .bs-gate-submit{width:100%;padding:14px;background:#141414;color:#EDE8DC;border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;cursor:pointer}
        .bs-gate-submit:disabled{opacity:0.4;cursor:default}
        .bs-gmaps-link{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px;background:#D8D0BC;border-radius:10px;color:#141414;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;text-decoration:none;transition:opacity 0.2s;}
        .bs-gmaps-link:active{opacity:0.85;}
      `}</style>
    </div>
  )
}

// ===== CARD COUNTER (mobile only) =====
function CardCounter({ total, active }: { total: number; active: number }) {
  if (total <= 1) return null
  const maxPips = Math.min(total, 12)
  return (
    <div className="cc">
      {Array.from({ length: maxPips }).map((_, i) => (
        <div key={i} className={`cc-pip ${i === active ? 'active' : ''}`} />
      ))}
      <style jsx>{`
        .cc{position:fixed;top:50%;right:10px;transform:translateY(-50%);z-index:40;display:flex;flex-direction:column;align-items:center;gap:3px;}
        .cc-pip{width:3px;height:10px;border-radius:2px;background:rgba(58,53,48,0.12);transition:all 0.3s;}
        .cc-pip.active{background:#3A6A48;height:22px;}
      `}</style>
    </div>
  )
}

// ===== SEO Head Component =====
function AlquileresHead({ seo }: { seo: AlquileresSEO }) {
  const mesAnio = formatMesAnioSEO(seo.fechaActualizacion)
  const fechaCorta = formatFechaCortaSEO(seo.fechaActualizacion)
  const url = 'https://simonbo.com/alquileres'

  const title = `${seo.totalUnidades} Alquileres en Equipetrol — Desde ${fmtBsSEO(seo.tipologias[0]?.rentaMedianaBs || 2500)}/mes | Simon`
  const description = `Departamentos en alquiler en Equipetrol, Santa Cruz, Bolivia. ${seo.totalUnidades} unidades disponibles. Renta mediana: ${fmtBsSEO(seo.rentaMedianaBs)}/mes. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`

  const schemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://simonbo.com/#organization',
        name: 'Simon — Inteligencia Inmobiliaria',
        url: 'https://simonbo.com',
        description: 'Plataforma de inteligencia de mercado inmobiliario en Equipetrol, Santa Cruz de la Sierra, Bolivia.',
      },
      {
        '@type': 'WebSite',
        '@id': 'https://simonbo.com/#website',
        name: 'Simon',
        url: 'https://simonbo.com',
        publisher: { '@id': 'https://simonbo.com/#organization' },
      },
      {
        '@type': 'RealEstateListing',
        '@id': url,
        url,
        name: title,
        description,
        isPartOf: { '@id': 'https://simonbo.com/#website' },
        provider: { '@id': 'https://simonbo.com/#organization' },
        dateModified: seo.generatedAt,
        inLanguage: 'es',
        about: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoCoordinates', latitude: -17.764, longitude: -63.197 },
        },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Simon', item: 'https://simonbo.com' },
          { '@type': 'ListItem', position: 2, name: 'Alquileres', item: url },
        ],
      },
      {
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: `Alquileres de departamentos en Equipetrol — ${mesAnio}`,
        description: `${seo.totalUnidades} departamentos en alquiler en Equipetrol. Renta mediana: ${fmtBsSEO(seo.rentaMedianaBs)}/mes. Cobertura: 5 zonas. Fuentes: Century 21, Remax, Bien Inmuebles.`,
        url,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': 'https://simonbo.com/#organization' },
        dateModified: seo.generatedAt,
        temporalCoverage: seo.fechaActualizacion,
        spatialCoverage: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoShape', box: '-17.78 -63.22 -17.75 -63.17' },
        },
        variableMeasured: [
          { '@type': 'PropertyValue', name: 'Renta mediana mensual', value: seo.rentaMedianaBs, unitText: 'BOB/mes' },
          { '@type': 'PropertyValue', name: 'Departamentos en alquiler', value: seo.totalUnidades, unitText: 'unidades' },
          { '@type': 'PropertyValue', name: 'Renta promedio por metro cuadrado', value: seo.bsM2Promedio, unitText: 'BOB/m2/mes' },
          ...seo.tipologias.map(t => ({
            '@type': 'PropertyValue',
            name: `Alquiler mediano ${DORM_LABELS_SEO[t.dormitorios] || t.dormitorios + 'D'}`,
            value: t.rentaMedianaBs,
            unitText: 'BOB/mes',
          })),
          ...seo.zonas.map(z => ({
            '@type': 'PropertyValue',
            name: `Renta por m² en ${z.zonaDisplay}`,
            value: z.bsM2Promedio,
            unitText: 'BOB/m2/mes',
          })),
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Cuanto cuesta alquilar un departamento en Equipetrol, Santa Cruz?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El alquiler mediano en Equipetrol es ${fmtBsSEO(seo.rentaMedianaBs)}/mes (${mesAnio}). Hay ${seo.totalUnidades} departamentos disponibles. Fuente: Simon Inteligencia Inmobiliaria (simonbo.com/alquileres).`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cuanto cuesta el alquiler por tipo de departamento en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: seo.tipologias.map(t =>
                `${DORM_LABELS_SEO[t.dormitorios] || t.dormitorios + 'D'}: ${fmtBsSEO(t.rentaMedianaBs)}/mes mediano (rango ${fmtBsSEO(t.rentaP25Bs)}–${fmtBsSEO(t.rentaP75Bs)}), ${t.unidades} unidades.`
              ).join(' ') + ` Datos de ${mesAnio}. Fuente: simonbo.com/alquileres.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cual es la zona mas barata para alquilar en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: (() => {
                const sorted = [...seo.zonas].sort((a, b) => a.bsM2Promedio - b.bsM2Promedio)
                return sorted.map((z, i) =>
                  `${i + 1}. ${z.zonaDisplay}: ${fmtBsSEO(Math.round(z.bsM2Promedio))}/m², renta mediana ${fmtBsSEO(z.rentaMedianaBs)}`
                ).join('. ') + `. Datos de ${mesAnio}. Fuente: simonbo.com/alquileres.`
              })(),
            },
          },
          {
            '@type': 'Question',
            name: 'Donde puedo ver alquileres verificados en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Simon (simonbo.com/alquileres) muestra ${seo.totalUnidades} departamentos en alquiler en Equipetrol con datos verificados de Century 21, Remax y Bien Inmuebles. Incluye filtros por zona, dormitorios y precio, con contacto directo por WhatsApp.`,
            },
          },
        ],
      },
    ],
  }

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="theme-color" content="#EDE8DC" />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content="Simon — Inteligencia Inmobiliaria" />
      <meta property="og:locale" content="es_BO" />

      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph) }}
      />
    </Head>
  )
}

// ===== getStaticProps — SEO data =====
export const getStaticProps: GetStaticProps<{ seo: AlquileresSEO }> = async () => {
  const data = await fetchMercadoAlquilerData()
  return {
    props: {
      seo: {
        totalUnidades: data.kpis.totalUnidades,
        rentaMedianaBs: data.kpis.rentaMedianaBs,
        bsM2Promedio: data.kpis.bsM2Promedio,
        fechaActualizacion: data.kpis.fechaActualizacion,
        generatedAt: data.generatedAt,
        tipologias: data.tipologias.map(t => ({
          dormitorios: t.dormitorios,
          unidades: t.unidades,
          rentaMedianaBs: t.rentaMedianaBs,
          rentaP25Bs: t.rentaP25Bs,
          rentaP75Bs: t.rentaP75Bs,
        })),
        zonas: data.zonas.map(z => ({
          zonaDisplay: z.zonaDisplay,
          unidades: z.unidades,
          bsM2Promedio: z.bsM2Promedio,
          rentaMedianaBs: z.rentaMedianaBs,
        })),
      },
    },
    revalidate: 21600, // 6 hours
  }
}
