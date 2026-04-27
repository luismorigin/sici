import React, { useState, useEffect, useRef, useCallback, useMemo, memo, Fragment } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { GetStaticProps } from 'next'
import { type UnidadAlquiler, type FiltrosAlquiler, buscarUnidadesAlquiler } from '@/lib/supabase'
import { ZONAS_ALQUILER_UI, displayZona } from '@/lib/zonas'
import { dormLabel, formatPriceBob } from '@/lib/format-utils'
import { fbqTrack } from '@/lib/meta-pixel'
import { fetchMercadoAlquilerData, type MercadoAlquilerData } from '@/lib/mercado-alquiler-data'
import { useWhatsAppCapture, triggerWhatsAppCapture } from '@/hooks/useWhatsAppCapture'
import { buildAlquilerWaMessage } from '@/lib/wa-message'
import { useBrokerShortlists } from '@/hooks/useBrokerShortlists'
import ShortlistSendModal from '@/components/broker/ShortlistSendModal'
import ShortlistsPanel from '@/components/broker/ShortlistsPanel'
import type { Broker } from '@/lib/simon-brokers'

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
const CompareSheet = dynamic(() => import('@/components/alquiler/CompareSheet'), { ssr: false })
const SimonChatWidget = dynamic(() => import('@/components/simon-chat/SimonChatWidget'), { ssr: false })

// ===== CONSTANTS =====

const ORDEN_OPTIONS: Array<{ value: FiltrosAlquiler['orden']; label: string }> = [
  { value: 'recientes', label: 'Recientes' },
  { value: 'precio_asc', label: 'Precio ↑' },
  { value: 'precio_desc', label: 'Precio ↓' },
]

const MAX_SLIDER_PRICE = 18000

const MAX_FAVORITES = 3

// Filtro de fuentes (modo broker). Permite al broker mostrar solo el inventario
// de las franquicias con las que opera. Aplica solo en /broker/[slug]/alquileres.
const FUENTES_BROKER = ['century21', 'remax', 'bien_inmuebles'] as const
type FuenteBroker = typeof FUENTES_BROKER[number]
const FUENTES_BROKER_LABELS: Record<FuenteBroker, string> = {
  century21: 'Century 21',
  remax: 'RE/MAX',
  bien_inmuebles: 'Bien Inmuebles',
}
const FUENTES_BROKER_BADGE: Record<FuenteBroker, { color: string; bg: string }> = {
  century21: { color: '#000', bg: '#BEAF87' },
  remax: { color: '#fff', bg: '#DC1C2E' },
  bien_inmuebles: { color: '#fff', bg: '#37BEAA' },
}

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

// Alias para retrocompatibilidad interna — delega al hook vía dispatcher module-level.
// Preserva el tracking legacy (click_whatsapp + Meta Pixel Lead) dentro del hook.
const handleWhatsAppLead = triggerWhatsAppCapture

// Build WhatsApp share URL for sharing a property with friends (NOT lead tracking)
function buildShareWhatsAppUrl(p: UnidadAlquiler) {
  const name = p.nombre_edificio || p.nombre_proyecto || 'Departamento'
  const zone = displayZona(p.zona)
  const specs = `${dormLabel(p.dormitorios)} · ${p.area_m2}m² · ${formatPrice(p.precio_mensual_bob)}/mes`
  const url = `https://simonbo.com/alquileres?id=${p.id}`
  const text = `Mira este depto en alquiler:\n\n${name} — ${zone}\n${specs}\n\n${url}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

// Mensaje del cliente al broker (publicShareMode en /b/[hash]).
function buildClientToBrokerAlquilerMessage(p: UnidadAlquiler, brokerName: string): string {
  const name = p.nombre_edificio || p.nombre_proyecto || 'Departamento'
  const dorms = dormLabel(p.dormitorios)
  return `Hola ${brokerName}, me interesa este alquiler:\n\n${name} (${dorms} · ${Math.round(p.area_m2)}m² · ${formatPrice(p.precio_mensual_bob)}/mes)\n\n¿Podemos coordinar?`
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

// ===== PUBLIC SHARE DATA (links /b/[hash] con items de alquiler) =====
// Analogo a PublicShareData de ventas.tsx, adaptado a alquiler:
//  - items son UnidadAlquiler
//  - priceSnapshots guarda precio_mensual_bob (fuente de verdad regla 10/12)
//    y precio_mensual_bob_actual para detectar cambio del agente.
export interface PublicShareDataAlquiler {
  hash: string
  broker: { slug: string; nombre: string; telefono: string; foto_url: string | null; inmobiliaria?: string | null }
  items: UnidadAlquiler[]
  itemComments?: Record<number, string | null>
  priceSnapshots?: Record<number, { bobSnapshot: number | null; bobActual: number | null }>
  // IDs de propiedades que el cliente ya marcó con corazón (persistidos en BD).
  // El cliente hidrata favorites con esto en lugar de localStorage.
  initialHearts?: number[]
}

// ===== MAIN PAGE =====
export default function AlquileresPage({
  seo,
  initialProperties,
  brokerSlug: brokerSlugProp = null,
  broker: brokerProp = null,
  publicShare = null,
}: {
  seo: AlquileresSEO
  initialProperties: UnidadAlquiler[]
  brokerSlug?: string | null
  broker?: Broker | null
  publicShare?: PublicShareDataAlquiler | null
}) {
  const router = useRouter()
  const { modalElement: waModalElement } = useWhatsAppCapture()
  const isDesktop = useIsDesktop()

  // Modo broker + publicShare (Fase 2 Simon Broker)
  const publicShareMode = publicShare !== null
  const publicShareBrokerProp: { nombre: string; telefono: string; foto_url: string | null; slug: string } | null = publicShare ? publicShare.broker : null
  const priceSnapshotsMap: Record<number, { bobSnapshot: number | null; bobActual: number | null }> | null = publicShare && publicShare.priceSnapshots ? publicShare.priceSnapshots : null
  const initialProps = publicShareMode ? publicShare!.items : initialProperties
  const brokerSlug = brokerSlugProp
  const broker = brokerProp
  const brokerMode = broker !== null
  const brokerInfoProp: { nombre: string; inmobiliaria?: string | null } | null = broker ? { nombre: broker.nombre, inmobiliaria: broker.inmobiliaria } : null

  const [properties, setProperties] = useState<UnidadAlquiler[]>(initialProps)
  const [loading, setLoading] = useState(false)
  const [spotlightId, setSpotlightId] = useState<number | null>(null)
  const [fetchedSpotlight, setFetchedSpotlight] = useState<UnidadAlquiler | null>(null)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())

  // Shortlists del broker — selección actual = favoritos, persistencia y envío via hook
  const brokerShortlists = useBrokerShortlists(broker)
  const [shortlistModalOpen, setShortlistModalOpen] = useState(false)
  const [shortlistsPanelOpen, setShortlistsPanelOpen] = useState(false)
  const [onlySelectedFilter, setOnlySelectedFilter] = useState(false)
  // Filtro broker: fuentes/franquicias permitidas. Default: todas. Persistido por slug.
  const [fuentesPermitidas, setFuentesPermitidas] = useState<Set<FuenteBroker>>(() => new Set(FUENTES_BROKER))
  useEffect(() => {
    if (!brokerMode || !brokerSlug) return
    try {
      const raw = localStorage.getItem(`broker_fuentes_${brokerSlug}`)
      if (!raw) return
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        const valid = arr.filter((x): x is FuenteBroker => (FUENTES_BROKER as readonly string[]).includes(x))
        setFuentesPermitidas(new Set(valid))
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerSlug])
  function toggleFuente(f: FuenteBroker) {
    setFuentesPermitidas(prev => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f); else next.add(f)
      if (brokerSlug) {
        try { localStorage.setItem(`broker_fuentes_${brokerSlug}`, JSON.stringify([...next])) } catch {}
      }
      return next
    })
  }

  // Body styles — scoped to this page (cleanup on unmount).
  // overflow:hidden solo en TikTok feed mobile (feed público sin broker/share):
  // ahí el scroll vive en .alq-feed interno con scroll-snap. En grid (publicShare/broker
  // mobile), el scroll natural del body es necesario.
  useEffect(() => {
    document.body.style.background = '#EDE8DC'
    const mq = window.matchMedia('(max-width: 767px)')
    const isTikTokFeed = !publicShareMode && !brokerMode
    function applyOverflow() { document.body.style.overflow = (mq.matches && isTikTokFeed) ? 'hidden' : '' }
    applyOverflow()
    mq.addEventListener('change', applyOverflow)
    return () => {
      document.body.style.background = ''
      document.body.style.overflow = ''
      mq.removeEventListener('change', applyOverflow)
    }
  }, [publicShareMode, brokerMode])

  // Restore favorites: publicShareMode hidrata desde BD (initialHearts),
  // los demás desde localStorage.
  useEffect(() => {
    if (publicShareMode) {
      const hearts = publicShare?.initialHearts
      if (hearts && hearts.length > 0) setFavorites(new Set(hearts))
      return
    }
    try {
      const saved = localStorage.getItem('alq_favorites')
      if (saved) setFavorites(new Set(JSON.parse(saved) as number[]))
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const activeCardIdxRef = useRef(0)
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
  const [filterOverlayOpen, setFilterOverlayOpen] = useState(false)

  const [filters, setFilters] = useState<FiltrosAlquiler>({
    orden: 'recientes',
    limite: 200,
    solo_con_fotos: true,
  })
  const [isFiltered, setIsFiltered] = useState(false)
  // Incrementa solo cuando deep-link aplica filtros via URL, para forzar remount de DesktopFilters/FilterOverlay con sus initializers leyendo currentFilters. Interacciones manuales del user NO incrementan esto.
  const [filterComponentVersion, setFilterComponentVersion] = useState(0)
  const [totalCount, setTotalCount] = useState(seo.totalUnidades || initialProperties.length)
  const [loadError, setLoadError] = useState(false)
  const [proyectoNames, setProyectoNames] = useState<string[]>([])

  // Defer heavy widgets until after hydration to reduce TBT
  const [widgetsReady, setWidgetsReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setWidgetsReady(true), 2000)
    return () => clearTimeout(t)
  }, [])

  // UTM contextual banner
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const bannerDismissedRef = useRef(false)

  // Search pill pulse (4-7s: draws attention to filters after swipe hint fades)
  const [pillPulse, setPillPulse] = useState(false)

  // Bot nudge pill (show once after 8s of inactivity — no scroll, no detail, no filter)
  const [nudgeVisible, setNudgeVisible] = useState(false)
  const nudgeDismissedRef = useRef(false)
  const hasOpenedDetailRef = useRef(false)
  const hasScrolledRef = useRef(false)
  const programmaticScrollRef = useRef(false)
  const isFilteredRef = useRef(false)
  const utmContent = router.query.utm_content as string | undefined
  const showZonaBanner = utmContent === 'pieza03' && !bannerDismissed && !isFiltered

  // Analytics: session-level metrics
  const analyticsRef = useRef({ startTime: Date.now(), maxCardIdx: 0, hasInteracted: false, sessionSent: false, viewedIds: new Set<number>() })
  const fetchGenRef = useRef(0) // increments on each fetchProperties call to cancel stale background loads

  // Persist favorites to localStorage (skip en publicShareMode — se persiste
  // en BD por cada toggle, ver toggleFavorite).
  useEffect(() => {
    if (publicShareMode) return
    try { localStorage.setItem('alq_favorites', JSON.stringify(Array.from(favorites))) } catch {}
  }, [favorites, publicShareMode])

  // Keep isFilteredRef in sync for scroll handler (avoids stale closure)
  useEffect(() => { isFilteredRef.current = isFiltered }, [isFiltered])

  // Search pill pulse: 4-6.5s after load if user hasn't interacted
  useEffect(() => {
    if (isDesktop || loading) return
    const onTimer = setTimeout(() => {
      if (!hasScrolledRef.current && !isFilteredRef.current) setPillPulse(true)
    }, 4000)
    const offTimer = setTimeout(() => setPillPulse(false), 6500)
    return () => { clearTimeout(onTimer); clearTimeout(offTimer) }
  }, [isDesktop, loading])

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
        // Level 1+3: track view_property + scroll_depth
        if (idx > analyticsRef.current.maxCardIdx) analyticsRef.current.maxCardIdx = idx
        // Auto-dismiss UTM banner on first scroll (once)
        if (idx >= 1 && !bannerDismissedRef.current) {
          bannerDismissedRef.current = true
          setBannerDismissed(true)
        }
        // Mark that user has scrolled (ignore programmatic scrolls)
        if (!programmaticScrollRef.current) hasScrolledRef.current = true
        // Bot nudge: show once after 3+ cards without detail/filter interaction
        if (idx >= 3 && !nudgeDismissedRef.current && !hasOpenedDetailRef.current && !isFilteredRef.current) {
          nudgeDismissedRef.current = true
          setNudgeVisible(true)
          trackEvent('nudge_bot_shown', { card_index: idx })
          setTimeout(() => setNudgeVisible(false), 3000)
        }
        // Only trigger re-render when card actually changes
        if (idx !== activeCardIdxRef.current) {
          activeCardIdxRef.current = idx
          setActiveCardIndex(idx)
        }
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isDesktop, loading])

  // Level 1: track view_property when mobile card snaps into view
  useEffect(() => {
    if (isDesktop || !properties.length) return
    const item = feedItems[activeCardIndex]
    if (item?.type === 'property' && !analyticsRef.current.viewedIds.has(item.data.id)) {
      analyticsRef.current.viewedIds.add(item.data.id)
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
    // En publicShareMode (/b/[hash]) el feed lo define la shortlist del broker,
    // NO debe ser sobrescrito por fetches al feed público global.
    if (publicShareMode) return properties.length
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

  // Extract unique building names from initial (unfiltered) load for datalist
  const proyectoNamesRef = useRef(false)
  useEffect(() => {
    if (proyectoNamesRef.current || properties.length === 0 || isFiltered) return
    proyectoNamesRef.current = true
    setProyectoNames([...new Set(properties.map(p => p.nombre_edificio || p.nombre_proyecto).filter(Boolean))].sort() as string[])
  }, [properties, isFiltered])

  // Defer full fetch — ISR gives us 8 properties for instant LCP,
  // then load all 200 after the page becomes interactive (avoids competing with LCP image)
  useEffect(() => {
    trackEvent('page_enter_alquiler', {})
    // En publicShareMode (/b/[hash]) las propiedades ya vienen curadas por el
    // broker via props.publicShare.items. NUNCA traer el feed completo — pisaría
    // la shortlist con las 200 props globales.
    if (publicShareMode) return
    const doFetch = async () => {
      // Skip if a URL-driven filter (?edificio, ?zonas=..., etc.) already fetched — avoids overwriting filtered results with a stale-closure baseline fetch.
      if (isFilteredRef.current) return
      await fetchProperties(filters)
      programmaticScrollRef.current = true
      requestAnimationFrame(() => {
        feedRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
        setTimeout(() => { programmaticScrollRef.current = false }, 100)
      })
    }
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(doFetch, { timeout: 3000 })
      return () => cancelIdleCallback(id)
    } else {
      const t = setTimeout(doFetch, 1500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Level 3: session metrics on page hide/unload
  useEffect(() => {
    function sendSessionMetrics() {
      const a = analyticsRef.current
      if (a.sessionSent) return
      a.sessionSent = true
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
    trackEvent('reset_filters', { results_count: count })
  }

  function handleBannerZona(slug: string) {
    applyFilters({ ...filters, zonas_permitidas: [slug] })
    bannerDismissedRef.current = true
    setBannerDismissed(true)
    trackEvent('banner_zona_click', { zona: slug, utm_content: utmContent })
  }

  const handleMapSelect = useCallback((id: number) => {
    setMapSelectedId(prev => prev === id ? null : id)
    trackEvent('select_map_pin', { property_id: id })
    analyticsRef.current.hasInteracted = true
  }, [])

  function toggleFavorite(id: number) {
    const isFav = favorites.has(id)
    // Limite de 3 aplica en feed público y en publicShareMode (cliente final ve shortlist).
    // Forced choice: 3 favoritos obligan a curar/comparar, no a explorar. El comparativo
    // de 3 es legible, el de 7 no. Para el broker armando shortlist NO aplica.
    if (!brokerMode && !isFav && favorites.size >= MAX_FAVORITES) {
      showToast(`Máximo ${MAX_FAVORITES} — destildá uno para agregar otro`)
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
    // En publicShareMode persistir en BD (feedback al broker). Optimistic UI:
    // el state ya se actualizó arriba, el fetch corre en background. Si falla
    // loggeamos pero no revertimos (el cliente quiere que funcione; el broker
    // va a ver el heart siguiente o puede preguntarle).
    if (publicShareMode && publicShare?.hash) {
      const hash = publicShare.hash
      const method = isFav ? 'DELETE' : 'POST'
      fetch('/api/public/shortlist-hearts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, propiedad_id: id }),
      }).catch(err => console.warn('[hearts] toggle failed', err))
    }
    if (isFav) {
      showToast(brokerMode ? 'Quitado de la seleccion' : 'Eliminado de favoritos')
    } else {
      const newCount = favorites.size + 1
      if (brokerMode) {
        showToast(`${newCount} ${newCount === 1 ? 'propiedad seleccionada' : 'propiedades seleccionadas'}`)
      } else if (newCount >= 2) {
        showToast(`${newCount}/${MAX_FAVORITES} · Podes comparar abajo`)
      } else {
        showToast(`Guardado · ${newCount}/${MAX_FAVORITES} favoritos`)
      }
    }
  }

  function addToShortlist(p: UnidadAlquiler) {
    trackEvent('broker_add_to_shortlist', { property_id: p.id, broker_slug: broker?.slug, tipo_operacion: 'alquiler' })
    toggleFavorite(p.id)
  }

  async function handleSendShortlist(data: { cliente_nombre: string; cliente_telefono: string; mensaje_whatsapp?: string }) {
    if (!broker) throw new Error('Broker no resuelto')
    const propiedad_ids = Array.from(favorites)
    if (propiedad_ids.length === 0) throw new Error('No hay propiedades seleccionadas')
    trackEvent('broker_send_shortlist', { broker_slug: broker.slug, count: propiedad_ids.length, tipo_operacion: 'alquiler' })
    const { whatsappUrl } = await brokerShortlists.createAndSend({ ...data, propiedad_ids, tipo_operacion: 'alquiler' })
    setFavorites(new Set())
    showToast('Shortlist enviada')
    return { whatsappUrl }
  }

  function openCompare() {
    setCompareOpen(true)
    analyticsRef.current.hasInteracted = true
    trackEvent('open_compare', { property_ids: Array.from(favorites).join(','), count: favorites.size })
  }

  const displayedProperties = useMemo(() => {
    let list: UnidadAlquiler[] = properties
    if (brokerMode && fuentesPermitidas.size < FUENTES_BROKER.length) {
      list = list.filter(p => fuentesPermitidas.has(((p.fuente || '').toLowerCase()) as FuenteBroker))
    }
    if (brokerMode && onlySelectedFilter) {
      list = list.filter(p => favorites.has(p.id))
    }
    return list
  }, [brokerMode, onlySelectedFilter, properties, favorites, fuentesPermitidas])
  const visibleNotMarked = useMemo(() => {
    if (!brokerMode) return []
    let list: UnidadAlquiler[] = properties
    if (fuentesPermitidas.size < FUENTES_BROKER.length) {
      list = list.filter(p => fuentesPermitidas.has(((p.fuente || '').toLowerCase()) as FuenteBroker))
    }
    return list.filter(p => !favorites.has(p.id))
  }, [brokerMode, properties, favorites, fuentesPermitidas])
  function markAllVisible() {
    if (visibleNotMarked.length === 0) return
    trackEvent('broker_mark_all_visible', { count: visibleNotMarked.length, broker_slug: broker?.slug, tipo_operacion: 'alquiler' })
    setFavorites(prev => {
      const n = new Set(prev)
      for (const p of properties) n.add(p.id)
      return n
    })
    showToast(`${visibleNotMarked.length} propiedad${visibleNotMarked.length === 1 ? '' : 'es'} agregada${visibleNotMarked.length === 1 ? '' : 's'}`)
  }

  // Gate: check localStorage on mount
  useEffect(() => {
    try { if (localStorage.getItem('alquileres_gate_v1')) setGateCompleted(true) } catch {}
  }, [])

  function handleGate(nombre: string, telefono: string, correo: string, url: string) {
    try { localStorage.setItem('alquileres_gate_v1', JSON.stringify({ nombre, telefono, correo, ts: new Date().toISOString() })) } catch {}
    setGateCompleted(true)
    window.open(url, '_blank')
    trackEvent('lead_gate', { property_id: sheetProperty?.id, property_name: sheetProperty?.nombre_edificio || sheetProperty?.nombre_proyecto, zona: sheetProperty?.zona })
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
    hasOpenedDetailRef.current = true
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

  function dismissNudge() {
    setNudgeVisible(false)
    trackEvent('nudge_bot_dismiss')
  }

  function tapNudge() {
    setNudgeVisible(false)
    trackEvent('nudge_bot_tap')
    window.dispatchEvent(new Event('simon-open-chat'))
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

  // Search pill summary text
  const searchPillText = useMemo(() => {
    if (!isFiltered) return 'Comienza tu búsqueda'
    const parts: string[] = []
    if (filters.zonas_permitidas?.length) {
      const zonas = filters.zonas_permitidas.map(z => {
        const found = ZONAS_ALQUILER_UI.find(zu => zu.id === z)
        return found ? found.label : z
      })
      parts.push(zonas.join(', '))
    }
    if (filters.dormitorios_lista?.length) {
      const d = filters.dormitorios_lista
      parts.push(d.map(x => x === 0 ? 'Mono' : x === 3 ? '3+' : `${x}d`).join(','))
    }
    if (filters.precio_mensual_max) parts.push(`<${formatPrice(filters.precio_mensual_max)}`)
    return parts.length > 0 ? parts.join(' · ') : `${activeFilterCount} filtros`
  }, [isFiltered, filters, activeFilterCount])

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

  // Deep-link: parse ?edificio= from URL → pre-apply building filter
  useEffect(() => {
    const edificioParam = router.query.edificio
    if (edificioParam && typeof edificioParam === 'string') {
      const f: FiltrosAlquiler = { orden: 'recientes', limite: 200, solo_con_fotos: true, proyecto: edificioParam }
      setFilters(f)
      setIsFiltered(true)
      fetchProperties(f)
    }
  }, [router.query.edificio]) // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: parse filter query params → pre-apply filters on first URL with params.
  // Supported: zonas, precio_min_bob, precio_max_bob, dormitorios, amoblado,
  // mascotas, parqueo, area_min, area_max. Invalid values are silently ignored.
  // Skips if ?edificio is present (handled by the effect above).
  const deepLinkAppliedRef = useRef(false)
  useEffect(() => {
    if (deepLinkAppliedRef.current) return
    if (!router.isReady) return
    if (router.query.edificio) { deepLinkAppliedRef.current = true; return }

    const q = router.query
    const overrides: Partial<FiltrosAlquiler> = {}

    const parsePositiveNum = (v: unknown): number | undefined => {
      if (typeof v !== 'string') return undefined
      const n = Number(v)
      return Number.isFinite(n) && n > 0 ? n : undefined
    }

    if (typeof q.zonas === 'string') {
      const validIds = new Set(ZONAS_ALQUILER_UI.map(z => z.id))
      const zonas = q.zonas.split(',')
        .map(s => s.trim().toLowerCase().replace(/-/g, '_'))
        .filter(z => validIds.has(z))
      if (zonas.length) overrides.zonas_permitidas = zonas
    }

    const pmin = parsePositiveNum(q.precio_min_bob)
    if (pmin !== undefined) overrides.precio_mensual_min = pmin
    const pmax = parsePositiveNum(q.precio_max_bob)
    if (pmax !== undefined) overrides.precio_mensual_max = pmax

    if (typeof q.dormitorios === 'string') {
      const dorms = q.dormitorios.split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isInteger(n) && n >= 0 && n <= 10)
      if (dorms.length) overrides.dormitorios_lista = dorms
    }

    if (q.amoblado === 'si') overrides.amoblado = true
    if (q.mascotas === 'true') overrides.acepta_mascotas = true
    if (q.parqueo === 'true') overrides.con_parqueo = true

    const amin = parsePositiveNum(q.area_min)
    if (amin !== undefined) overrides.area_min = amin
    const amax = parsePositiveNum(q.area_max)
    if (amax !== undefined) overrides.area_max = amax

    deepLinkAppliedRef.current = true
    if (Object.keys(overrides).length === 0) return

    const f: FiltrosAlquiler = {
      orden: 'recientes',
      limite: 200,
      solo_con_fotos: true,
      ...overrides,
    }
    setFilters(f)
    setIsFiltered(true)
    isFilteredRef.current = true
    setFilterComponentVersion(v => v + 1)
    fetchProperties(f)
  }, [router.isReady, router.query]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Desktop grid: exclude spotlight property to avoid duplication.
  // En modo broker aplica también filtro de fuentes y "solo seleccionadas".
  const gridProperties = useMemo(() => {
    let list = properties
    if (brokerMode && fuentesPermitidas.size < FUENTES_BROKER.length) {
      list = list.filter(p => fuentesPermitidas.has(((p.fuente || '').toLowerCase()) as FuenteBroker))
    }
    if (brokerMode && onlySelectedFilter) {
      list = list.filter(p => favorites.has(p.id))
    }
    if (spotlightProperty) list = list.filter(p => p.id !== spotlightId)
    return list
  }, [properties, spotlightProperty, spotlightId, brokerMode, fuentesPermitidas, onlySelectedFilter, favorites])

  // Pinned first card: first available ID wins, rest stay in natural order
  const PINNED_FIRST_IDS = [1350, 1349, 1333]

  // Mobile: feed items — spotlight first, then pin, then natural order
  const feedItems = useMemo(() => {
    const items: Array<{ type: 'property'; data: UnidadAlquiler; isSpotlight?: boolean }> = []
    let mobileProps: UnidadAlquiler[]
    if (spotlightProperty) {
      mobileProps = [spotlightProperty, ...properties.filter(p => p.id !== spotlightId)]
    } else if (!isFiltered) {
      const pinIdx = PINNED_FIRST_IDS.reduce<number>((found, id) => {
        if (found >= 0) return found
        return properties.findIndex(p => Number(p.id) === id)
      }, -1)
      if (pinIdx > 0) {
        mobileProps = [properties[pinIdx], ...properties.slice(0, pinIdx), ...properties.slice(pinIdx + 1)]
      } else {
        mobileProps = properties
      }
    } else {
      mobileProps = properties
    }
    mobileProps.forEach((p, i) => {
      items.push({ type: 'property', data: p, isSpotlight: i === 0 && !!spotlightProperty })
    })
    return items
  }, [properties, spotlightProperty, spotlightId, isFiltered])

  return (
    <>
      <AlquileresHead
        seo={seo}
        brokerSlug={brokerSlug}
        publicShareHash={publicShare?.hash ?? null}
      />


      {/* Toast */}
      <div className={`alq-toast ${toastVisible ? 'show' : ''}`}>{toastMessage}</div>

      {/* Compare sheet */}
      <CompareSheet
        open={compareOpen}
        properties={favoriteProperties}
        onClose={() => setCompareOpen(false)}
        publicShareBroker={publicShareBrokerProp}
      />

      {/* Simon Chat Bot — deferred to avoid TBT during initial load.
          Oculto en publicShareMode: el cliente viene en contexto curado por el
          broker, no queremos que el chat global sugiera props fuera de la
          shortlist (leakage del flujo del broker). */}
      {widgetsReady && !publicShareMode && <SimonChatWidget
        properties={properties}
        sheetOpen={sheetOpen}
        onOpenDetail={(id) => {
          const prop = properties.find(p => p.id === id)
          if (prop) openDetail(prop)
        }}
        onApplyFilters={(chatFilters) => {
          if (!chatFilters) return
          const newFilters: FiltrosAlquiler = {
            ...filters,
            dormitorios: chatFilters.dormitorios ?? filters.dormitorios,
            precio_mensual_max: chatFilters.precio_mensual_max ?? filters.precio_mensual_max,
            precio_mensual_min: chatFilters.precio_mensual_min ?? filters.precio_mensual_min,
            amoblado: chatFilters.amoblado ?? filters.amoblado,
            acepta_mascotas: chatFilters.acepta_mascotas ?? filters.acepta_mascotas,
            con_parqueo: chatFilters.con_parqueo ?? filters.con_parqueo,
            zonas_permitidas: chatFilters.zonas_permitidas ?? filters.zonas_permitidas,
          }
          applyFilters(newFilters)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />}

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
        isFavorite={sheetProperty ? favorites.has(sheetProperty.id) : false}
        onToggleFavorite={sheetProperty ? () => toggleFavorite(sheetProperty.id) : undefined}
        onShare={sheetProperty ? () => { trackShareClick(sheetProperty); window.open(buildShareWhatsAppUrl(sheetProperty), '_blank') } : undefined}
        properties={properties}
        onSwapProperty={(p) => setSheetProperty(p)}
        brokerMode={brokerMode}
        publicShareBroker={publicShareBrokerProp}
        priceSnapshot={sheetProperty && priceSnapshotsMap ? priceSnapshotsMap[sheetProperty.id] || null : null}
      />

      {/* Banner inferior flotante brokerMode — visible en mobile Y desktop,
          el broker siempre tiene CTA "Enviar shortlist" + × para limpiar
          la selección sin depender del sidebar. */}
      {brokerMode && broker && favorites.size >= 1 && (
        <div className="alq-compare-banner-wrap alq-shortlist-banner-wrap">
          <button className="alq-compare-banner alq-shortlist-banner" onClick={() => setShortlistModalOpen(true)} style={{ flex: 1 }}>
            <span className="alq-compare-banner-text">Enviar shortlist · {favorites.size} {favorites.size === 1 ? 'propiedad' : 'propiedades'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16}}><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
          <button className="alq-compare-banner-clear" aria-label="Limpiar selección" onClick={(e) => { e.stopPropagation(); setFavorites(new Set()); showToast('Selección limpiada') }}>&times;</button>
        </div>
      )}

      {(isDesktop || publicShareMode || brokerMode) ? (
        /* ==================== DESKTOP LAYOUT (también publicShareMode + brokerMode mobile) ==================== */
        /* publicShareMode = shortlist curada del cliente final → grid para comparar, no TikTok feed.
           brokerMode = broker armando shortlist en /broker/[slug]/alquileres → mismo patrón que venta
           (paridad con /broker/[slug] que ya forzaba desktop layout en mobile via brokerMode).
           Patrón espejo de ventas.tsx (regla CLAUDE.md: paridad UX entre venta/alquiler). */
        <div className={`desktop-layout ${publicShareMode ? 'desktop-layout-public' : ''} ${brokerMode ? 'desktop-layout-broker' : ''}`}>
          {/* Left sidebar - filters. Oculto en:
              - publicShareMode: el cliente recibe una shortlist curada, no debe ver filtros globales.
              - brokerMode mobile: 320px de sidebar no caben en mobile; el broker usa el chip
                ⚙ Filtros del banner (que abre el FilterOverlay full-screen). */}
          {!publicShareMode && !(brokerMode && !isDesktop) && (
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
              key={`df-${filterComponentVersion}`}
              currentFilters={filters}
              isFiltered={isFiltered}
              onApply={applyFilters}
              onReset={resetFilters}
              proyectoNames={proyectoNames}
            />
            {/* Selección del broker / Favoritos del público */}
            {favorites.size > 0 && (
              <div className="desktop-fav-summary">
                <div className="desktop-fav-info">
                  {brokerMode ? (
                    <svg viewBox="0 0 24 24" fill="#F2B441" stroke="#F2B441" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="#E05555" stroke="#E05555" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                  )}
                  {brokerMode
                    ? `${favorites.size} ${favorites.size === 1 ? 'seleccionada' : 'seleccionadas'}`
                    : `${favorites.size} favorito${favorites.size > 1 ? 's' : ''}`}
                  <button
                    className="desktop-fav-clear"
                    onClick={() => { setFavorites(new Set()); showToast(brokerMode ? 'Selección limpiada' : 'Favoritos limpiados') }}
                    title={brokerMode ? 'Limpiar selección' : 'Limpiar favoritos'}
                  >&times;</button>
                </div>
                {brokerMode ? (
                  <button className="desktop-compare-btn" onClick={() => setShortlistModalOpen(true)}>
                    Enviar shortlist ({favorites.size})
                  </button>
                ) : favorites.size >= 2 ? (
                  <button className="desktop-compare-btn" onClick={() => openCompare()}>
                    Comparar {favorites.size === MAX_FAVORITES ? '' : `(${favorites.size})`}
                  </button>
                ) : null}
              </div>
            )}
          </aside>
          )}

          {/* Right content */}
          <main className="desktop-main" ref={viewMode === 'grid' ? feedRef : undefined}
            style={viewMode === 'map' ? { overflow: 'hidden', display: 'flex', flexDirection: 'column' } : undefined}>
            {/* View toggle bar — oculto en mobile publicShareMode (FAB negro cubre el mapa) y
                en mobile brokerMode (toggle Grid|Mapa del banner broker ya cumple esa función). */}
            {!((publicShareMode || brokerMode) && !isDesktop) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(216,208,188,0.3)', flexShrink: 0, position: 'sticky', top: 0, background: 'transparent', zIndex: 10, paddingTop: 8 }}>
              <div style={{ fontSize: 13, color: '#7A7060', display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Comparar es feature del público, no tiene sentido en brokerMode
                    (el broker está armando shortlist — comparar sus propias
                    selecciones no ayuda a decidir). */}
                {!brokerMode && favorites.size >= 2 && (
                  <button onClick={() => openCompare()} style={{ padding: '6px 16px', background: '#141414', color: '#EDE8DC', border: 'none', borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.5 }}>
                    Comparar {favorites.size} favoritos
                  </button>
                )}
                {!brokerMode && favorites.size === 1 && (
                  <span style={{ fontSize: 12, color: '#7A7060' }}>1 favorito — elegí otro para comparar</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 2, background: '#EDE8DC', borderRadius: 10, padding: 3, boxShadow: '0 1px 3px rgba(20,20,20,0.08)' }}>
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
            )}

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
                          onPhotoTap={() => openDetail(spotlightProperty)}
                          onShare={() => { trackShareClick(spotlightProperty); window.open(buildShareWhatsAppUrl(spotlightProperty), '_blank') }}
                          brokerMode={brokerMode}
                          onAddToShortlist={brokerMode ? () => addToShortlist(spotlightProperty) : undefined}
                          publicShareMode={publicShareMode}
                          publicShareBroker={publicShareBrokerProp}
                          priceSnapshot={priceSnapshotsMap ? priceSnapshotsMap[spotlightProperty.id] || null : null}
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
                {/* UTM contextual banner — desktop */}
                {showZonaBanner && (
                  <div className="utm-zona-banner">
                    <div className="utm-zona-text">
                      <span className="utm-zona-title">Equipetrol tiene 5 microzonas con precios distintos</span>
                      <span className="utm-zona-sub">Filtrá por la tuya</span>
                    </div>
                    <div className="utm-zona-chips">
                      {ZONAS_ALQUILER_UI.filter(z => z.id !== 'equipetrol_3er_anillo' && z.id !== 'sin_zona').map(z => (
                        <button key={z.id} className="utm-zona-chip" onClick={() => handleBannerZona(z.id)}>{z.label}</button>
                      ))}
                    </div>
                    <button className="utm-zona-close" onClick={() => { bannerDismissedRef.current = true; setBannerDismissed(true) }}>&times;</button>
                  </div>
                )}
                {brokerMode && fuentesPermitidas.size === 0 && (
                  <div style={{ padding: '40px 16px', textAlign: 'center', color: '#7A7060', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                    Activá al menos una fuente arriba para ver alquileres.
                  </div>
                )}
                {brokerMode && fuentesPermitidas.size > 0 && gridProperties.length === 0 && properties.length > 0 && (
                  <div style={{ padding: '40px 16px', textAlign: 'center', color: '#7A7060', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                    {onlySelectedFilter
                      ? 'No hay alquileres marcados que cumplan los filtros actuales.'
                      : 'No hay alquileres de las fuentes seleccionadas.'}
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
                          onPhotoTap={() => openDetail(p)}
                          onShare={() => { trackShareClick(p); window.open(buildShareWhatsAppUrl(p), '_blank') }}
                          brokerMode={brokerMode}
                          onAddToShortlist={brokerMode ? () => addToShortlist(p) : undefined}
                          publicShareMode={publicShareMode}
                          publicShareBroker={publicShareBrokerProp}
                          priceSnapshot={priceSnapshotsMap ? priceSnapshotsMap[p.id] || null : null}
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
                    properties={displayedProperties}
                    onSelectProperty={handleMapSelect}
                    selectedId={mapSelectedId}
                  />
                </div>
                {/* Floating card when a pin is selected */}
                {mapSelectedId && (() => {
                  const sp = displayedProperties.find(x => x.id === mapSelectedId)
                  if (!sp) return null
                  return (
                    <MapFloatCard
                      key={sp.id}
                      property={sp}
                      isFavorite={favorites.has(sp.id)}
                      onClose={() => setMapSelectedId(null)}
                      onToggleFavorite={() => toggleFavorite(sp.id)}
                      onOpenDetail={() => openDetail(sp)}
                      publicShareBroker={publicShareBrokerProp}
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
                      {!brokerMode && favProps.length >= 2 && (
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
          {/* Top bar — search pill (Airbnb/TikTok style).
              Oculto en publicShareMode (cliente ve el header del broker) y en brokerMode
              (el chip ⚙ Filtros del banner del broker reemplaza al pill). */}
          {!publicShareMode && !brokerMode && (
            <div className="alq-top-bar">
              <button className={`alq-search-pill${pillPulse ? ' pulse' : ''}`} onClick={() => { setPillPulse(false); setFilterOverlayOpen(true); trackEvent('open_filter_overlay') }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <span className="alq-search-text">{searchPillText}</span>
                {isFiltered && <div className="alq-search-dot" />}
              </button>
            </div>
          )}

          {/* Context badge — overlaid on first card photo */}
          {activeCardIndex === 0 && !loading && properties.length > 0 && (
            <div className="alq-context-badge">
              {properties.length} deptos en alquiler · Equipetrol
            </div>
          )}


          {/* UTM contextual banner — mobile */}
          {showZonaBanner && (
            <div className="utm-zona-banner-mobile">
              <div className="utm-zona-text-m">Equipetrol tiene <strong>5 microzonas</strong> con precios distintos</div>
              <div className="utm-zona-chips-m">
                {ZONAS_ALQUILER_UI.filter(z => z.id !== 'equipetrol_3er_anillo' && z.id !== 'sin_zona').map(z => (
                  <button key={z.id} className="utm-zona-chip-m" onClick={() => handleBannerZona(z.id)}>{z.label}</button>
                ))}
              </div>
              <button className="utm-zona-close-m" onClick={() => { bannerDismissedRef.current = true; setBannerDismissed(true) }}>&times;</button>
            </div>
          )}

          {/* Floating map button — oculto en brokerMode (toggle Grid|Map en el banner) */}
          {!brokerMode && (
            <button className="alq-map-floating" aria-label="Ver mapa" onClick={() => { setMobileMapOpen(true); trackEvent('open_map_mobile') }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#141414" strokeWidth="1.5" style={{width:22,height:22}}>
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
            </button>
          )}

          {/* Bot nudge pill — appears once after 5s of inactivity */}
          {nudgeVisible && (
            <div className="alq-nudge-pill" onClick={tapNudge}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:14,height:14,flexShrink:0}}><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
              <span>Preguntale a Simón que buscás</span>
              <button className="alq-nudge-x" onClick={(e) => { e.stopPropagation(); dismissNudge() }}>&times;</button>
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
                  return <div key={item.data.id} style={{ height: idx === 0 ? '88dvh' : '100dvh', scrollSnapAlign: 'start', background: '#EDE8DC' }} />
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
                    brokerMode={brokerMode}
                    onAddToShortlist={brokerMode ? () => addToShortlist(item.data) : undefined}
                    publicShareMode={publicShareMode}
                    publicShareBroker={publicShareBrokerProp}
                    priceSnapshot={priceSnapshotsMap ? priceSnapshotsMap[item.data.id] || null : null}
                  />
                )
              })
            )}
          </div>
        </>
      )}

      {waModalElement}

      {/* Modal Enviar shortlist — solo broker mode */}
      {brokerMode && broker && (
        <ShortlistSendModal
          isOpen={shortlistModalOpen}
          onClose={() => setShortlistModalOpen(false)}
          broker={broker}
          cantidadPropiedades={favorites.size}
          existingShortlists={brokerShortlists.shortlists}
          onConfirm={handleSendShortlist}
        />
      )}

      {/* Panel Mis shortlists enviadas — solo broker mode */}
      {brokerMode && broker && (
        <ShortlistsPanel
          isOpen={shortlistsPanelOpen}
          onClose={() => setShortlistsPanelOpen(false)}
          broker={broker}
          shortlists={brokerShortlists.shortlists}
          loading={brokerShortlists.loading}
          onArchive={brokerShortlists.archive}
          onRefresh={brokerShortlists.refresh}
        />
      )}

      {/* Banner modo broker — arriba del feed cuando activo */}
      {brokerMode && broker && (
        <div className="alq-broker-banner">
          <div className="alq-broker-banner-brand">
            <span className="alq-broker-banner-logo">SIMON</span>
            <span className="alq-broker-banner-divider">·</span>
            <span className="alq-broker-banner-label">BROKER</span>
            <span className="alq-broker-banner-name">{broker.nombre}</span>
          </div>
          <div className="alq-broker-tabs" role="tablist" aria-label="Tipo de operación">
            <Link href={`/broker/${broker.slug}`} className="alq-broker-tab" role="tab" aria-selected="false">
              Ventas
            </Link>
            <button className="alq-broker-tab active" role="tab" aria-selected="true" disabled>Alquileres</button>
          </div>
          {properties.length > 0 && (
            <div className="alq-broker-viewmode" role="tablist" aria-label="Modo de vista">
              <button
                className={`alq-broker-vm-btn ${!mobileMapOpen ? 'active' : ''}`}
                onClick={() => { setMobileMapOpen(false); trackEvent('switch_view', { view_mode: 'grid', source: 'broker_banner' }) }}
                aria-label="Ver lista" role="tab" aria-selected={!mobileMapOpen}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </button>
              <button
                className={`alq-broker-vm-btn ${mobileMapOpen ? 'active' : ''}`}
                onClick={() => { setMobileMapOpen(true); trackEvent('switch_view', { view_mode: 'map', source: 'broker_banner' }) }}
                aria-label="Ver mapa" role="tab" aria-selected={mobileMapOpen}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </button>
            </div>
          )}
          <button
            className="alq-broker-tool"
            onClick={() => { setFilterOverlayOpen(true); trackEvent('open_filter_overlay', { source: 'broker_banner' }) }}
            title="Filtrar alquileres"
          >
            ⚙ Filtros{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </button>
          {favorites.size > 0 && (
            <button
              className={`alq-broker-tool ${onlySelectedFilter ? 'active' : ''}`}
              onClick={() => setOnlySelectedFilter(v => !v)}
              title={onlySelectedFilter ? 'Mostrar todos los alquileres' : 'Ver solo los marcados'}
            >
              ★ Solo seleccionados · {favorites.size}
            </button>
          )}
          {!onlySelectedFilter && visibleNotMarked.length > 0 && properties.length < 100 && (
            <button
              className="alq-broker-tool alq-broker-tool-add"
              onClick={markAllVisible}
              title="Agregar todas las propiedades visibles a la selección"
            >
              + Marcar los {visibleNotMarked.length} visibles
            </button>
          )}
          <button
            className="alq-broker-tool alq-broker-send"
            onClick={() => {
              if (favorites.size === 0) { showToast('Marcá al menos 1 alquiler para enviar'); return }
              setShortlistModalOpen(true)
            }}
            title="Enviar shortlist por WhatsApp"
            disabled={favorites.size === 0}
          >
            Enviar ({favorites.size})
          </button>
          <button className="alq-broker-banner-shortlists" onClick={() => setShortlistsPanelOpen(true)}>
            Mis shortlists{brokerShortlists.shortlists.length > 0 ? ` · ${brokerShortlists.shortlists.length}` : ''}
          </button>
          <a
            className="alq-broker-tool alq-broker-market-link"
            href="/mercado/equipetrol/alquileres"
            target="_blank"
            rel="noopener"
            onClick={() => trackEvent('broker_open_mercado', { broker_slug: broker?.slug, tipo_operacion: 'alquiler' })}
            title="Abrir dashboard de mercado de alquileres en pestaña nueva"
          >
            Ver mercado <span aria-hidden="true" className="alq-broker-market-arrow">↗</span>
          </a>
          {/* Fila de fuentes/franquicias — solo modo broker.
              Default las 3 marcadas (= ver todo). Persistido por slug en localStorage. */}
          <div className="alq-fuentes-row">
            <span className="alq-fuentes-label">Fuentes:</span>
            {FUENTES_BROKER.map(f => {
              const fb = FUENTES_BROKER_BADGE[f]
              const active = fuentesPermitidas.has(f)
              const style = active
                ? { background: fb.bg, color: fb.color, borderColor: fb.bg }
                : undefined
              return (
                <button
                  key={f}
                  type="button"
                  className={`alq-fuente-chip ${active ? 'active' : ''}`}
                  style={style}
                  onClick={() => toggleFuente(f)}
                  aria-pressed={active}
                  title={active ? `Ocultar ${FUENTES_BROKER_LABELS[f]}` : `Mostrar ${FUENTES_BROKER_LABELS[f]}`}
                >
                  {FUENTES_BROKER_LABELS[f]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Header modo public share — header del broker que comparte la shortlist
          con su cliente. CTA WhatsApp arma mensaje con los corazones marcados. */}
      {publicShareMode && publicShare && (
        <div className="alq-public-share-header">
          <div className="apsh-broker">
            {publicShare.broker.foto_url
              ? <img src={publicShare.broker.foto_url} alt={publicShare.broker.nombre} className="apsh-broker-photo" />
              : <div className="apsh-broker-photo apsh-broker-photo-ph">{publicShare.broker.nombre.charAt(0)}</div>}
            <div className="apsh-broker-info">
              <div className="apsh-broker-label">Selección de</div>
              <div className="apsh-broker-name">{publicShare.broker.nombre}</div>
              {publicShare.broker.inmobiliaria && (
                <div className="apsh-broker-agency">{publicShare.broker.inmobiliaria}</div>
              )}
            </div>
          </div>
          <a
            href={(() => {
              const hearted = properties.filter(p => favorites.has(p.id))
              if (hearted.length > 0) {
                const lines = hearted.map(p => {
                  const name = p.nombre_edificio || p.nombre_proyecto || 'Depto'
                  const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
                  return `• ${name} (${dorms} · ${Math.round(p.area_m2)}m² · Bs ${Math.round(p.precio_mensual_bob).toLocaleString('es-BO')}/mes)`
                }).join('\n')
                const plural = hearted.length === 1 ? 'este' : 'estos'
                const noun = hearted.length === 1 ? 'alquiler' : `${hearted.length} alquileres`
                const msg = `Hola ${publicShare.broker.nombre}, me interesa${hearted.length === 1 ? '' : 'n'} ${plural} ${noun}:\n\n${lines}\n\n¿Podemos coordinar?`
                return `https://wa.me/${publicShare.broker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`
              }
              return `https://wa.me/${publicShare.broker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${publicShare.broker.nombre}, vi los alquileres que me enviaste.`)}`
            })()}
            target="_blank" rel="noopener noreferrer" className="apsh-wa"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            WhatsApp
          </a>
        </div>
      )}

      {/* FAB "Mapa" — mobile only, publicShareMode. El top bar con el toggle
          está oculto en este modo, este FAB es la forma de llegar al mapa.
          Oculto cuando el overlay de mapa ya está abierto (mobileMapOpen). */}
      {publicShareMode && !isDesktop && !mobileMapOpen && properties.length > 0 && (
        <button
          className="alq-public-map-fab"
          onClick={() => setMobileMapOpen(true)}
          aria-label="Ver mapa"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          Mapa
        </button>
      )}

      {/* Banner inferior Comparar (2+ favoritos) — solo mobile, fuera del condicional layout
          para que aparezca en publicShareMode mobile (cliente final ve la shortlist en grid).
          En desktop hay otro botón Comparar dentro del toggle bar del desktop-main. */}
      {!brokerMode && !isDesktop && favorites.size >= 1 && (
        <div className="alq-compare-banner-wrap">
          <button className="alq-compare-banner" onClick={() => favorites.size >= 2 ? openCompare() : showToast('Elegí al menos 2 para comparar')} style={{ flex: 1 }}>
            <span className="alq-compare-banner-text">{favorites.size} favorito{favorites.size > 1 ? 's' : ''}{favorites.size >= 2 ? ' · Comparar' : ''}</span>
            {favorites.size >= 2 && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16}}><path d="M9 18l6-6-6-6"/></svg>}
          </button>
          <button className="alq-compare-banner-clear" aria-label="Limpiar favoritos" onClick={(e) => { e.stopPropagation(); setFavorites(new Set()); showToast('Favoritos limpiados') }}>&times;</button>
        </div>
      )}

      {/* Filter overlay — fuera del condicional layout para que funcione en todas las
          superficies: publicShare mobile (no se usa pero queda disponible), broker mobile
          (chip ⚙ Filtros del banner) y feed público mobile (search pill). */}
      <FilterOverlay
        key={`fo-${filterComponentVersion}`}
        isOpen={filterOverlayOpen}
        onClose={() => setFilterOverlayOpen(false)}
        totalCount={totalCount}
        filteredCount={properties.length}
        isFiltered={isFiltered}
        currentFilters={filters}
        onApply={(f) => { applyFilters(f); setFilterOverlayOpen(false) }}
        onReset={() => { resetFilters(); setFilterOverlayOpen(false) }}
        proyectoNames={proyectoNames}
      />

      {/* Full-screen mobile map — fuera del condicional layout para que funcione
          en publicShareMode mobile, brokerMode mobile y feed público mobile. */}
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
                  publicShareBroker={publicShareBrokerProp}
                />
              )
            })()}
          </div>
        </div>
      )}
    </>
  )
}

// ===== DESKTOP FILTERS (sidebar, auto-apply) =====
function DesktopFilters({ currentFilters, isFiltered, onApply, onReset, proyectoNames }: {
  currentFilters: FiltrosAlquiler; isFiltered: boolean
  onApply: (f: FiltrosAlquiler) => void; onReset: () => void; proyectoNames?: string[]
}) {
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_mensual_max || MAX_SLIDER_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set(currentFilters.dormitorios_lista || []))
  const [amoblado, setAmoblado] = useState(currentFilters.amoblado || false)
  const [mascotas, setMascotas] = useState(currentFilters.acepta_mascotas || false)
  const [conParqueo, setConParqueo] = useState(currentFilters.con_parqueo || false)
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set(currentFilters.zonas_permitidas || []))
  const [orden, setOrden] = useState<FiltrosAlquiler['orden']>(currentFilters.orden || 'recientes')
  const [proyecto, setProyecto] = useState(currentFilters.proyecto || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Build filters object from current state
  const buildFilters = useCallback((price: number, dorms: Set<number>, amob: boolean, masc: boolean, parq: boolean, zonas: Set<string>, ord: FiltrosAlquiler['orden'], proy?: string) => {
    const f: FiltrosAlquiler = { orden: ord || 'recientes', limite: 200, solo_con_fotos: true }
    if (price < MAX_SLIDER_PRICE) f.precio_mensual_max = price
    if (dorms.size > 0) f.dormitorios_lista = Array.from(dorms)
    if (amob) f.amoblado = true
    if (masc) f.acepta_mascotas = true
    if (parq) f.con_parqueo = true
    if (zonas.size > 0) f.zonas_permitidas = Array.from(zonas)
    if (proy?.trim()) f.proyecto = proy.trim()
    return f
  }, [])

  // Auto-apply with debounce
  const autoApply = useCallback((price: number, dorms: Set<number>, amob: boolean, masc: boolean, parq: boolean, zonas: Set<string>, ord: FiltrosAlquiler['orden'], proy?: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onApply(buildFilters(price, dorms, amob, masc, parq, zonas, ord, proy))
    }, 400)
  }, [onApply, buildFilters])

  function toggleDorm(d: number) {
    setSelectedDorms(prev => {
      const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d)
      autoApply(maxPrice, n, amoblado, mascotas, conParqueo, selectedZonas, orden, proyecto)
      return n
    })
  }
  function toggleZona(id: string) {
    setSelectedZonas(prev => {
      const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id)
      autoApply(maxPrice, selectedDorms, amoblado, mascotas, conParqueo, n, orden, proyecto)
      return n
    })
  }
  function handlePriceChange(price: number) {
    setMaxPrice(price)
    autoApply(price, selectedDorms, amoblado, mascotas, conParqueo, selectedZonas, orden, proyecto)
  }
  function handleAmoblado() {
    const next = !amoblado
    setAmoblado(next)
    autoApply(maxPrice, selectedDorms, next, mascotas, conParqueo, selectedZonas, orden, proyecto)
  }
  function handleMascotas() {
    const next = !mascotas
    setMascotas(next)
    autoApply(maxPrice, selectedDorms, amoblado, next, conParqueo, selectedZonas, orden, proyecto)
  }
  function handleParqueo() {
    const next = !conParqueo
    setConParqueo(next)
    autoApply(maxPrice, selectedDorms, amoblado, mascotas, next, selectedZonas, orden, proyecto)
  }
  function handleOrden(o: FiltrosAlquiler['orden']) {
    setOrden(o)
    autoApply(maxPrice, selectedDorms, amoblado, mascotas, conParqueo, selectedZonas, o, proyecto)
  }
  function handleProyecto(v: string) {
    setProyecto(v)
    autoApply(maxPrice, selectedDorms, amoblado, mascotas, conParqueo, selectedZonas, orden, v)
  }

  return (
    <div className="df-wrap">
      {/* Edificio search */}
      <div className="df-group">
        <div className="df-label"><span className="df-dot" />EDIFICIO</div>
        <input type="text" className="df-search" placeholder="Buscar edificio..." value={proyecto}
          onChange={e => handleProyecto(e.target.value)} list="df-proyectos" autoComplete="off" />
        {proyectoNames && proyectoNames.length > 0 && (
          <datalist id="df-proyectos">
            {proyectoNames.map(n => <option key={n} value={n} />)}
          </datalist>
        )}
      </div>

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

    </div>
  )
}

// ===== FILTER OVERLAY (full-screen, replaces MobileFilterCard in feed) =====
function FilterOverlay({ isOpen, onClose, totalCount, filteredCount, isFiltered, currentFilters, onApply, onReset, proyectoNames }: {
  isOpen: boolean; onClose: () => void
  totalCount: number; filteredCount: number; isFiltered: boolean
  currentFilters: FiltrosAlquiler
  onApply: (f: FiltrosAlquiler) => void; onReset: () => void; proyectoNames?: string[]
}) {
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_mensual_max || MAX_SLIDER_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set(currentFilters.dormitorios_lista || []))
  const [amoblado, setAmoblado] = useState(currentFilters.amoblado || false)
  const [mascotas, setMascotas] = useState(currentFilters.acepta_mascotas || false)
  const [conParqueo, setConParqueo] = useState(currentFilters.con_parqueo || false)
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set(currentFilters.zonas_permitidas || []))
  const [orden, setOrden] = useState<FiltrosAlquiler['orden']>(currentFilters.orden || 'recientes')
  const [proyecto, setProyecto] = useState(currentFilters.proyecto || '')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const previewRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)

  const buildFilters = useCallback((): FiltrosAlquiler => {
    const f: FiltrosAlquiler = { orden: orden || 'recientes', limite: 200, solo_con_fotos: true }
    if (maxPrice < MAX_SLIDER_PRICE) f.precio_mensual_max = maxPrice
    if (selectedDorms.size > 0) f.dormitorios_lista = Array.from(selectedDorms)
    if (amoblado) f.amoblado = true
    if (mascotas) f.acepta_mascotas = true
    if (conParqueo) f.con_parqueo = true
    if (selectedZonas.size > 0) f.zonas_permitidas = Array.from(selectedZonas)
    if (proyecto.trim()) f.proyecto = proyecto.trim()
    return f
  }, [maxPrice, selectedDorms, amoblado, mascotas, conParqueo, selectedZonas, orden, proyecto])

  // Debounced preview count
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (!isOpen) return
    if (previewRef.current) clearTimeout(previewRef.current)
    previewRef.current = setTimeout(async () => {
      try {
        const { data } = await fetchFromAPI({ ...buildFilters(), limite: 200 })
        setPreviewCount(data.length)
      } catch { /* best effort */ }
    }, 400)
    return () => { if (previewRef.current) clearTimeout(previewRef.current) }
  }, [buildFilters, isOpen])

  // Reset preview when overlay opens
  useEffect(() => {
    if (isOpen) { setPreviewCount(null); isFirstRender.current = true }
  }, [isOpen])

  function toggleDorm(d: number) { setSelectedDorms(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n }) }
  function toggleZona(id: string) { setSelectedZonas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }

  function handleApply() { onApply(buildFilters()) }
  function handleReset() {
    setMaxPrice(MAX_SLIDER_PRICE); setSelectedDorms(new Set()); setSelectedZonas(new Set())
    setAmoblado(false); setMascotas(false); setConParqueo(false); setOrden('recientes'); setProyecto('')
    onReset()
  }

  if (!isOpen) return null

  const displayCount = previewCount !== null ? previewCount : (isFiltered ? filteredCount : totalCount)

  return (
    <div className="afo-overlay">
      <div className="afo-header">
        <button className="afo-close" onClick={onClose}>&times;</button>
        <span className="afo-title">Filtros</span>
        <span className="afo-count">{displayCount} deptos</span>
      </div>
      <div className="afo-body">
        {/* Edificio search */}
        <div className="afo-group"><div className="afo-label"><span className="afo-dot" />EDIFICIO</div>
          <input type="text" className="afo-search" placeholder="Buscar edificio..." value={proyecto}
            onChange={e => setProyecto(e.target.value)} list="afo-proyectos" autoComplete="off" />
          {proyectoNames && proyectoNames.length > 0 && (
            <datalist id="afo-proyectos">
              {proyectoNames.map(n => <option key={n} value={n} />)}
            </datalist>
          )}
        </div>
        {/* Microzonas */}
        <div className="afo-group"><div className="afo-label"><span className="afo-dot" />MICROZONA</div>
          <div className="afo-zonas">{ZONAS_ALQUILER_UI.filter(z => z.id !== 'sin_zona').map(z => (
            <button key={z.id} className={`afo-zona-btn ${selectedZonas.has(z.id) ? 'active' : ''}`} onClick={() => toggleZona(z.id)}>{z.label}</button>
          ))}</div>
        </div>
        {/* Budget */}
        <div className="afo-group"><div className="afo-label"><span className="afo-dot" />PRESUPUESTO MAXIMO</div>
          <input type="range" className="afo-slider" min={2000} max={MAX_SLIDER_PRICE} step={500} value={maxPrice} onChange={e => setMaxPrice(parseInt(e.target.value))} />
          <div className="afo-slider-val">{formatPrice(maxPrice)}/mes</div>
        </div>
        {/* Dorms */}
        <div className="afo-group"><div className="afo-label"><span className="afo-dot" />DORMITORIOS</div>
          <div className="afo-dorms">{[0,1,2,3].map(d => (
            <button key={d} className={`afo-dorm-btn ${selectedDorms.has(d) ? 'active' : ''}`} onClick={() => toggleDorm(d)}>{d === 0 ? 'Mono' : d === 3 ? '3+' : d}</button>
          ))}</div>
        </div>
        {/* Toggles */}
        <div className="afo-group"><div className="afo-dorms">
          <button className={`afo-dorm-btn afo-amoblado ${amoblado ? 'active' : ''}`} onClick={() => setAmoblado(!amoblado)}>Amoblado</button>
          <button className={`afo-dorm-btn afo-mascotas ${mascotas ? 'active' : ''}`} onClick={() => setMascotas(!mascotas)}>Mascotas</button>
          <button className={`afo-dorm-btn ${conParqueo ? 'active' : ''}`} onClick={() => setConParqueo(!conParqueo)}>Parqueo</button>
        </div></div>
        {/* Orden */}
        <div className="afo-group"><div className="afo-label"><span className="afo-dot" />ORDENAR POR</div>
          <div className="afo-dorms">{ORDEN_OPTIONS.map(o => (
            <button key={o.value} className={`afo-dorm-btn ${orden === o.value ? 'active' : ''}`} onClick={() => setOrden(o.value)}>{o.label}</button>
          ))}</div>
        </div>
      </div>
      <div className="afo-footer">
        {isFiltered && <button className="afo-reset" onClick={handleReset}>Quitar filtros</button>}
        <button className="afo-apply" onClick={handleApply}>
          VER {displayCount} RESULTADOS
        </button>
      </div>
    </div>
  )
}

// ===== MAP FLOATING CARD (own state to avoid re-rendering the map) =====
function MapFloatCard({ property: sp, isFavorite, onClose, onToggleFavorite, onOpenDetail, mobile, publicShareBroker = null }: {
  property: UnidadAlquiler; isFavorite: boolean; mobile?: boolean
  onClose: () => void; onToggleFavorite: () => void; onOpenDetail: () => void
  // publicShareMode: CTA WA redirige al broker (no al agente original).
  publicShareBroker?: { nombre: string; telefono: string } | null
}) {
  const publicShareMode = publicShareBroker !== null
  const brokerHref = publicShareMode && publicShareBroker
    ? `https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(buildClientToBrokerAlquilerMessage(sp, publicShareBroker.nombre))}`
    : null
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
            {publicShareMode && brokerHref ? (
              <a href={brokerHref} target="_blank" rel="noopener noreferrer" className="mfc-m-btn-wsp">WhatsApp</a>
            ) : sp.agente_whatsapp ? (
              <a href="#" onClick={(e) => handleWhatsAppLead(e, sp, buildAlquilerWaMessage(sp), 'map_card_mobile')} className="mfc-m-btn-wsp">WhatsApp</a>
            ) : null}
          </div>
        </div>
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
          {publicShareMode && brokerHref ? (
            <a href={brokerHref} target="_blank" rel="noopener noreferrer" className="map-float-btn-wsp">WhatsApp</a>
          ) : sp.agente_whatsapp ? (
            <a href="#" onClick={(e) => handleWhatsAppLead(e, sp, buildAlquilerWaMessage(sp), 'map_card')} className="map-float-btn-wsp">WhatsApp</a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ===== DESKTOP CARD =====
const DesktopCard = memo(function DesktopCard({
  property: p, isFavorite, favoritesCount, petFilterActive, onToggleFavorite, onOpenInfo, onPhotoTap, onShare, isFirst,
  brokerMode = false, onAddToShortlist, publicShareMode = false, publicShareBroker = null, priceSnapshot = null,
}: {
  property: UnidadAlquiler; isFavorite: boolean; favoritesCount: number; petFilterActive?: boolean
  onToggleFavorite: () => void; onOpenInfo: () => void; onPhotoTap?: (photoIdx: number) => void; onShare?: () => void; isFirst?: boolean
  brokerMode?: boolean; onAddToShortlist?: () => void
  publicShareMode?: boolean
  publicShareBroker?: { nombre: string; telefono: string } | null
  priceSnapshot?: { bobSnapshot: number | null; bobActual: number | null } | null
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = (p.fotos_urls?.length ?? 0) > 0 ? p.fotos_urls : ['']
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!!isFirst)

  // Lazy load: only render image when card enters viewport
  useEffect(() => {
    if (isFirst) { setVisible(true); return }
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
    // El cap de MAX_FAVORITES lo maneja el padre toggleFavorite (con toast).
    if (brokerMode && onAddToShortlist) { onAddToShortlist(); return }
    onToggleFavorite()
  }

  const priceChangeBadge = (() => {
    if (!publicShareMode || !priceSnapshot) return null
    const { bobSnapshot, bobActual } = priceSnapshot
    if (bobSnapshot == null || bobActual == null) return null
    if (bobSnapshot <= 0) return null
    const delta = (bobActual - bobSnapshot) / bobSnapshot
    if (Math.abs(delta) < 0.01) return null
    return { direction: delta < 0 ? 'down' : 'up', from: bobSnapshot, to: bobActual }
  })()

  return (
    <div className={`dc-card${petFilterActive && p.acepta_mascotas === true ? ' pet-confirmed' : ''}`} ref={cardRef}>
      {/* Photo */}
      <div className="dc-photo" style={{ ...(visible && photos[photoIdx] ? { backgroundImage: `url('${photos[photoIdx]}')` } : { background: '#D8D0BC' }), cursor: photos[photoIdx] ? 'pointer' : undefined }} onClick={() => { if (photos[photoIdx] && onPhotoTap) onPhotoTap(photoIdx) }}>
        {photos.length > 1 && (
          <>
            {photoIdx > 0 && (
              <button className="dc-nav dc-prev" aria-label="Foto anterior" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx - 1) }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M15 18l-6-6 6-6"/></svg>
              </button>
            )}
            {photoIdx < photos.length - 1 && (
              <button className="dc-nav dc-next" aria-label="Foto siguiente" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx + 1) }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )}
            <div className="dc-photo-count">{photoIdx + 1}/{photos.length}</div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="dc-content">
        <div className="dc-name">{displayName}{p.dias_en_mercado !== null && p.dias_en_mercado <= 60 && <span className="dc-reciente">Publicación reciente</span>}</div>
        <div className="dc-zona">{displayZona(p.zona)} <span className="dc-id">#{p.id}</span></div>
        <div className="dc-price-block">
          <div className="dc-price">{formatPrice(p.precio_mensual_bob)}<span>/mes</span></div>
          <div className="dc-specs">
            {p.area_m2}m² · {dormLabel(p.dormitorios)} · {p.banos ? `${p.banos} baño${p.banos > 1 ? 's' : ''}` : '—'}{p.piso ? ` · Piso ${p.piso}` : ''}
          </div>
        </div>
        <div className="dc-specs-2">
          {(p.amoblado === 'si' || p.amoblado === 'semi') && <span className="dc-highlight gold">{p.amoblado === 'si' ? 'Amoblado' : 'Semi-amoblado'}</span>}
          {p.acepta_mascotas && <span className="dc-highlight green">Mascotas</span>}
          {[
            p.estacionamientos && p.estacionamientos > 0 ? `${p.estacionamientos} parqueo` : null,
            p.baulera ? 'Baulera' : null,
            p.monto_expensas_bob && p.monto_expensas_bob > 0 ? `Expensas Bs ${p.monto_expensas_bob}` : null,
          ].filter(Boolean).map((t, i) => <span key={i}>{i > 0 || p.amoblado || p.acepta_mascotas ? '  ·  ' : ''}{t}</span>)}
        </div>
        {priceChangeBadge && (
          <div className={`dc-price-change dc-price-change-${priceChangeBadge.direction}`}>
            {priceChangeBadge.direction === 'down'
              ? `↓ Bajo de ${formatPrice(priceChangeBadge.from)} a ${formatPrice(priceChangeBadge.to)}/mes`
              : `↑ Antes ${formatPrice(priceChangeBadge.from)} · ahora ${formatPrice(priceChangeBadge.to)}/mes`}
          </div>
        )}
        <div className="dc-actions">
          <button
            className={`dc-act-btn dc-act-fav ${isFavorite ? 'active' : ''} ${brokerMode ? 'dc-act-fav-broker' : ''}`}
            onClick={handleFav}
            aria-label={brokerMode ? (isFavorite ? 'Quitar de seleccion' : 'Agregar a seleccion') : (isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos')}
            title={brokerMode ? (isFavorite ? 'Quitar de la shortlist' : 'Agregar a la shortlist') : undefined}
          >
            {brokerMode ? (
              <svg viewBox="0 0 24 24" fill={isFavorite ? '#F2B441' : 'none'} stroke={isFavorite ? '#F2B441' : 'currentColor'} strokeWidth="1.5" style={{ width: 20, height: 20 }}>
                <polygon points="12 2 15 9 22 9.5 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.5 9 9 12 2"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : 'currentColor'} strokeWidth="1.5" style={{ width: 20, height: 20 }}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            )}
          </button>
          {onShare && !publicShareMode && (
            <button className="dc-act-btn" onClick={onShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg> Compartir
            </button>
          )}
          <button className="dc-act-btn dc-act-detail" onClick={onOpenInfo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg> Ver mas
          </button>
          {publicShareMode && publicShareBroker ? (
            <a
              href={`https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(buildClientToBrokerAlquilerMessage(p, publicShareBroker.nombre))}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('click_whatsapp_broker', { property_id: p.id, source: 'alq_card_desktop_public' })}
              className="dc-wsp-inline"
            >
              <svg viewBox="0 0 24 24" fill="#1EA952" style={{ width: 14, height: 14 }}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Whatsapp
            </a>
          ) : !brokerMode && p.agente_whatsapp ? (
            <a href="#" onClick={(e) => handleWhatsAppLead(e, p, buildAlquilerWaMessage(p), 'card_desktop')} className="dc-wsp-inline">
              <svg viewBox="0 0 24 24" fill="#1EA952" style={{ width: 14, height: 14 }}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Whatsapp
            </a>
          ) : null}
        </div>
      </div>

    </div>
  )
}, (prev, next) =>
  prev.property === next.property &&
  prev.isFavorite === next.isFavorite &&
  prev.favoritesCount === next.favoritesCount &&
  prev.isFirst === next.isFirst &&
  prev.petFilterActive === next.petFilterActive &&
  prev.brokerMode === next.brokerMode &&
  prev.publicShareMode === next.publicShareMode &&
  prev.priceSnapshot?.bobSnapshot === next.priceSnapshot?.bobSnapshot &&
  prev.priceSnapshot?.bobActual === next.priceSnapshot?.bobActual
)

// ===== MOBILE PROPERTY CARD (full-screen) =====
const MobilePropertyCard = memo(function MobilePropertyCard({
  property: p, isFirst, showHint, isFavorite, favoritesCount, isSpotlight, petFilterActive, onToggleFavorite, onOpenInfo, onPhotoTap, onShare,
  brokerMode = false, onAddToShortlist, publicShareMode = false, publicShareBroker = null, priceSnapshot = null,
}: {
  property: UnidadAlquiler; isFirst: boolean; showHint?: boolean; isFavorite: boolean; favoritesCount: number; isSpotlight: boolean; petFilterActive?: boolean
  onToggleFavorite: () => void; onOpenInfo: () => void; onPhotoTap?: (photoIdx: number) => void; onShare?: () => void
  brokerMode?: boolean; onAddToShortlist?: () => void
  publicShareMode?: boolean
  publicShareBroker?: { nombre: string; telefono: string } | null
  priceSnapshot?: { bobSnapshot: number | null; bobActual: number | null } | null
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [shakeBtn, setShakeBtn] = useState(false)

  function handleFavorite() {
    // Cap MAX_FAVORITES lo maneja el padre toggleFavorite (con toast).
    // El shake visual queda solo cuando el padre rechaza por cap (necesitaría
    // pasar callback; por simplicidad lo dejamos sin shake — toast cubre el feedback).
    if (brokerMode && onAddToShortlist) { onAddToShortlist(); return }
    onToggleFavorite()
  }

  // Badge de cambio de precio (snapshot vs actual): solo en publicShareMode y si la
  // diferencia supera 1% entre bobSnapshot y bobActual. Regla 10/12: BOB es fuente de
  // verdad en alquiler.
  const priceChangeBadge = (() => {
    if (!publicShareMode || !priceSnapshot) return null
    const { bobSnapshot, bobActual } = priceSnapshot
    if (bobSnapshot == null || bobActual == null) return null
    if (bobSnapshot <= 0) return null
    const delta = (bobActual - bobSnapshot) / bobSnapshot
    if (Math.abs(delta) < 0.01) return null
    const direction = delta < 0 ? 'down' : 'up'
    return { direction, from: bobSnapshot, to: bobActual }
  })()

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
    <div className={`alq-card${isFirst ? ' alq-card-first' : ''}${petFilterActive && p.acepta_mascotas === true ? ' pet-confirmed' : ''}`} ref={cardRef}>
      <PhotoCarousel photos={p.fotos_urls || []} isFirst={isFirst} showHint={showHint} onPhotoTap={onPhotoTap} propertyId={p.id} />
      {isSpotlight && (
        <div className="amc-spotlight-badge">Te compartieron este depto</div>
      )}
      <div className="amc-content">
        <div className="amc-name">{displayName}{p.dias_en_mercado !== null && p.dias_en_mercado <= 60 && <span className="amc-reciente">Publicación reciente</span>}</div>
        <div className="amc-zona">{displayZona(p.zona)} <span className="amc-id">#{p.id}</span></div>
        <div className="amc-price-block">
          <div className="amc-price">{formatPrice(p.precio_mensual_bob)}/mes</div>
          <div className="amc-specs">{p.area_m2}m² · {dormLabel(p.dormitorios)} · {p.banos ? `${p.banos} baño${p.banos > 1 ? 's' : ''}` : '—'}{p.piso ? ` · Piso ${p.piso}` : ''}</div>
        </div>
        <div className="amc-specs-2">
          {(p.amoblado === 'si' || p.amoblado === 'semi') && <span className="amc-highlight gold">{p.amoblado === 'si' ? 'Amoblado' : 'Semi-amoblado'}</span>}
          {p.acepta_mascotas && <span className="amc-highlight green">Mascotas</span>}
          {[
            p.estacionamientos && p.estacionamientos > 0 ? `${p.estacionamientos} parqueo` : null,
            p.baulera ? 'Baulera' : null,
            p.monto_expensas_bob && p.monto_expensas_bob > 0 ? `Expensas Bs ${p.monto_expensas_bob}` : null,
          ].filter(Boolean).map((t, i) => <span key={i}>{i > 0 || p.amoblado || p.acepta_mascotas ? '  ·  ' : ''}{t}</span>)}
        </div>
        {p.descripcion && (
          <div className="amc-razon">&ldquo;{p.descripcion.slice(0, 120)}{p.descripcion.length > 120 ? '...' : ''}&rdquo;</div>
        )}
        {priceChangeBadge && (
          <div className={`amc-price-change amc-price-change-${priceChangeBadge.direction}`}>
            {priceChangeBadge.direction === 'down'
              ? `↓ Bajo de ${formatPrice(priceChangeBadge.from)} a ${formatPrice(priceChangeBadge.to)}/mes`
              : `↑ Antes ${formatPrice(priceChangeBadge.from)} · ahora ${formatPrice(priceChangeBadge.to)}/mes`}
          </div>
        )}
        <div className="amc-actions">
          <button
            className={`amc-btn amc-fav ${isFavorite ? 'active' : ''} ${shakeBtn ? 'shake' : ''} ${brokerMode ? 'amc-fav-broker' : ''}`}
            aria-label={brokerMode ? (isFavorite ? 'Quitar de seleccion' : 'Agregar a seleccion') : (isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos')}
            onClick={handleFavorite}
            title={brokerMode ? (isFavorite ? 'Quitar de la shortlist' : 'Agregar a la shortlist') : undefined}
          >
            {brokerMode ? (
              <svg viewBox="0 0 24 24" fill={isFavorite ? '#F2B441' : 'none'} stroke={isFavorite ? '#F2B441' : '#7A7060'} strokeWidth="1.5" style={{ width: 22, height: 22 }}>
                <polygon points="12 2 15 9 22 9.5 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.5 9 9 12 2"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : '#7A7060'} strokeWidth="1.5" style={{ width: 22, height: 22 }}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            )}
          </button>
          {onShare && !publicShareMode && (
            <button className="amc-btn amc-share" aria-label="Compartir por WhatsApp" onClick={onShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 18, height: 18 }}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg> Compartir
            </button>
          )}
          <button className="amc-btn amc-info" onClick={onOpenInfo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg> Ver mas
          </button>
          {publicShareMode && publicShareBroker ? (
            <a
              href={`https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(buildClientToBrokerAlquilerMessage(p, publicShareBroker.nombre))}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('click_whatsapp_broker', { property_id: p.id, source: 'alq_card_mobile_public' })}
              className="amc-wsp-inline-mobile"
            >
              <svg viewBox="0 0 24 24" fill="#1EA952" style={{width:14,height:14}}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Whatsapp
            </a>
          ) : !brokerMode && p.agente_whatsapp ? (
            <a href="#" onClick={(e) => handleWhatsAppLead(e, p, buildAlquilerWaMessage(p), 'card_mobile')} className="amc-wsp-inline-mobile">
              <svg viewBox="0 0 24 24" fill="#1EA952" style={{width:14,height:14}}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Whatsapp
            </a>
          ) : null}
        </div>
        {!publicShareMode && <a href="/landing-v2" className="amc-brand">simonbo.com</a>}
      </div>
      {isFirst && <div className="amc-scroll-hint"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{width:18,height:18}}><path d="M12 5v14M19 12l-7 7-7-7"/></svg></div>}

    </div>
  )
}, (prev, next) =>
  prev.property.id === next.property.id &&
  prev.isFavorite === next.isFavorite &&
  prev.favoritesCount === next.favoritesCount &&
  prev.isFirst === next.isFirst &&
  prev.isSpotlight === next.isSpotlight &&
  prev.petFilterActive === next.petFilterActive &&
  prev.brokerMode === next.brokerMode &&
  prev.publicShareMode === next.publicShareMode &&
  prev.priceSnapshot?.bobSnapshot === next.priceSnapshot?.bobSnapshot &&
  prev.priceSnapshot?.bobActual === next.priceSnapshot?.bobActual
)

// ===== PHOTO CAROUSEL (native scroll-snap) =====
function PhotoCarousel({ photos, isFirst, showHint, onPhotoTap, propertyId }: { photos: string[]; isFirst: boolean; showHint?: boolean; onPhotoTap?: (index: number) => void; propertyId?: number }) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const swipedRef = useRef(false)
  const total = photos.length || 1
  // Only load current slide + 1 neighbor to save bandwidth
  const [maxLoaded, setMaxLoaded] = useState(isFirst ? 2 : 0)
  const zoneRef = useRef<HTMLDivElement>(null)

  // Lazy: only start loading when card enters viewport
  useEffect(() => {
    if (isFirst) { setMaxLoaded(2); return }
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
        // Track first swipe per card (indicates photo interest)
        if (idx > 0 && !swipedRef.current) {
          swipedRef.current = true
          trackEvent('swipe_photos', { property_id: propertyId, photo_index: idx, total_photos: total, source: 'card' })
        }
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
          return (
          <div key={i} className="pc-slide" style={shouldLoad && url ? { backgroundImage: `url('${url}')` } : { background: '#D8D0BC' }}
            onTouchStart={() => { isDragging.current = false }}
            onTouchMove={() => { isDragging.current = true }}
            onClick={() => { if (!isDragging.current && onPhotoTap && url) onPhotoTap(currentIdx) }}
          >
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
    </div>
  )
}

// ===== BOTTOM SHEET GALLERY =====
function BottomSheetGallery({ photos, propertyId }: { photos: string[]; propertyId?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const swipedRef = useRef(false)
  const total = photos.length

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth)
      setCurrentIdx(Math.min(idx, total - 1))
      if (idx > 0 && !swipedRef.current) {
        swipedRef.current = true
        trackEvent('swipe_photos', { property_id: propertyId, photo_index: idx, total_photos: total, source: 'bottom_sheet' })
      }
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [total, propertyId])

  function goTo(idx: number) {
    scrollRef.current?.scrollTo({ left: idx * scrollRef.current.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="bsg-wrap">
      <div className="bsg-scroll" ref={scrollRef}>
        {photos.map((url, i) => (
          <div key={i} className="bsg-slide">
            <img src={url} alt={`Foto ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'} draggable={false} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
        ))}
      </div>
      {total > 1 && currentIdx > 0 && (
        <button className="bsg-arrow bsg-arrow-left" onClick={() => goTo(currentIdx - 1)} aria-label="Foto anterior">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{width:16,height:16}}><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
      {total > 1 && currentIdx < total - 1 && (
        <button className="bsg-arrow bsg-arrow-right" onClick={() => goTo(currentIdx + 1)} aria-label="Foto siguiente">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{width:16,height:16}}><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}
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
    </div>
  )
}

// ===== BOTTOM SHEET =====
function BottomSheet({
  open, property, onClose, isDesktop, gateCompleted, onGate, petFilterActive, isFavorite, onToggleFavorite, onShare, properties, onSwapProperty,
  brokerMode = false, publicShareBroker = null, priceSnapshot = null,
}: {
  open: boolean; property: UnidadAlquiler | null; onClose: () => void; isDesktop: boolean
  gateCompleted: boolean; onGate: (n: string, t: string, c: string, url: string) => void; petFilterActive?: boolean
  isFavorite?: boolean; onToggleFavorite?: () => void; onShare?: () => void
  properties?: UnidadAlquiler[]; onSwapProperty?: (p: UnidadAlquiler) => void
  brokerMode?: boolean
  publicShareBroker?: { nombre: string; telefono: string; foto_url: string | null; slug: string } | null
  priceSnapshot?: { bobSnapshot: number | null; bobActual: number | null } | null
}) {
  const publicShareMode = publicShareBroker !== null
  const [showGate, setShowGate] = useState(false)
  const [gateName, setGateName] = useState('')
  const [gateTel, setGateTel] = useState('')
  const [gateEmail, setGateEmail] = useState('')
  const [descExpanded, setDescExpanded] = useState(false)
  const [selectedQs, setSelectedQs] = useState<Set<number>>(new Set())

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

  // Reset gate form + questions when property changes
  const propId = property?.id
  useEffect(() => {
    setShowGate(false); setDescExpanded(false); setSelectedQs(new Set())
    sheetRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [propId])

  // --- Broker questions (adapted from CompareSheet) ---
  const MAX_QS = 3
  const brokerQuestions = useMemo(() => {
    if (!property) return []
    const qs: string[] = []
    qs.push('Condiciones de ingreso: adelanto, garantia y comision del broker')
    qs.push('Se puede negociar el precio con contrato de 12+ meses?')
    qs.push('La garantia se devuelve al finalizar el contrato? En que condiciones?')
    if (!property.contrato_minimo_meses) qs.push('Cual es el contrato minimo?')
    if (!property.monto_expensas_bob) qs.push('Expensas incluidas o aparte? Cuanto son?')
    if (!property.servicios_incluidos || !Array.isArray(property.servicios_incluidos) || property.servicios_incluidos.length === 0) qs.push('Que servicios incluye? (agua, luz, wifi, gas)')
    if (!property.deposito_meses) qs.push('Cuantos meses de deposito requiere?')
    if (property.acepta_mascotas === null) qs.push('Se aceptan mascotas?')
    qs.push('Fecha de disponibilidad para mudarse?')
    return qs
  }, [property?.id, property?.contrato_minimo_meses, property?.monto_expensas_bob, property?.servicios_incluidos, property?.deposito_meses, property?.acepta_mascotas])

  // --- Similar properties in same zona + dorms ---
  const similarProps = useMemo(() => {
    if (!property || !properties || properties.length === 0) return []
    return properties
      .filter(q => q.zona === property.zona && q.dormitorios === property.dormitorios && q.id !== property.id && q.fotos_urls?.length > 0)
      .sort((a, b) => Math.abs(a.precio_mensual_bob - property.precio_mensual_bob) - Math.abs(b.precio_mensual_bob - property.precio_mensual_bob))
      .slice(0, 4)
  }, [property?.id, property?.zona, property?.dormitorios, property?.precio_mensual_bob, properties])

  // --- Market data for this property's zona + dorms ---
  const marketData = useMemo(() => {
    if (!property || !properties || properties.length === 0) return null
    const comparables = properties.filter(
      q => q.zona === property.zona && q.dormitorios === property.dormitorios && q.id !== property.id
    )
    if (comparables.length < 2) return null
    const prices = comparables.map(q => q.precio_mensual_bob).sort((a, b) => a - b)
    const pctl = (sorted: number[], pct: number) => {
      const idx = (sorted.length - 1) * pct
      const lo = Math.floor(idx), hi = Math.ceil(idx)
      return lo === hi ? sorted[lo] : Math.round(sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo))
    }
    const mediana = pctl(prices, 0.5)
    const diffPct = Math.round(((property.precio_mensual_bob - mediana) / mediana) * 100)
    return { mediana, min: prices[0], max: prices[prices.length - 1], count: comparables.length, diffPct }
  }, [property?.id, property?.zona, property?.dormitorios, property?.precio_mensual_bob, properties])

  function toggleQuestion(idx: number) {
    setSelectedQs(prev => {
      const next = new Set(prev)
      if (next.has(idx)) { next.delete(idx) }
      else if (next.size < MAX_QS) { next.add(idx) }
      return next
    })
  }

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
      {/* Sticky close + fav bar */}
      <div className="bs-sticky-top">
        {onToggleFavorite && (
          <button
            className={`bs-sticky-fav ${isFavorite ? 'active' : ''} ${brokerMode ? 'bs-sticky-fav-broker' : ''}`}
            aria-label={brokerMode ? (isFavorite ? 'Quitar de seleccion' : 'Agregar a seleccion') : 'Guardar favorito'}
            onClick={onToggleFavorite}
            title={brokerMode ? (isFavorite ? 'Quitar de la shortlist' : 'Agregar a la shortlist') : undefined}
          >
            {brokerMode ? (
              <svg viewBox="0 0 24 24" fill={isFavorite ? '#F2B441' : 'none'} stroke={isFavorite ? '#F2B441' : '#fff'} strokeWidth="1.5" style={{ width: 18, height: 18 }}>
                <polygon points="12 2 15 9 22 9.5 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.5 9 9 12 2"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : '#fff'} strokeWidth="1.5" style={{ width: 18, height: 18 }}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            )}
          </button>
        )}
        <button className="bs-sticky-close" aria-label="Cerrar detalle" onClick={onClose}>&times;</button>
      </div>
      {/* Header — building name, zone, price with accent, specs */}
      <div className="bs-header-redesign">
        <div className="bs-hr-name">{displayName}</div>
        <div className="bs-hr-sub">{displayZona(p.zona)} <span className="bs-hr-id">#{p.id}</span>
          {p.dias_en_mercado !== null && p.dias_en_mercado >= 0 && (
            <> · {p.dias_en_mercado === 0 ? 'Publicado hoy' : p.dias_en_mercado === 1 ? 'Hace 1 día' : `Hace ${p.dias_en_mercado} días`}</>
          )}
        </div>
        <div className="bs-hr-price-block">
          <div className="bs-hr-price">{formatPrice(p.precio_mensual_bob)}<span>/mes</span></div>
        </div>
        <div className="bs-hr-specs">
          {dormLabel(p.dormitorios)} · {p.area_m2}m² · {p.banos ? `${p.banos} baño${p.banos > 1 ? 's' : ''}` : '—'}{p.piso ? ` · Piso ${p.piso}` : ''}
        </div>
        {publicShareMode && priceSnapshot && priceSnapshot.bobSnapshot != null && priceSnapshot.bobActual != null && priceSnapshot.bobSnapshot > 0 && Math.abs((priceSnapshot.bobActual - priceSnapshot.bobSnapshot) / priceSnapshot.bobSnapshot) >= 0.01 && (
          <div className={`bs-hr-price-change ${priceSnapshot.bobActual < priceSnapshot.bobSnapshot ? 'down' : 'up'}`}>
            {priceSnapshot.bobActual < priceSnapshot.bobSnapshot
              ? `↓ Bajó de ${formatPrice(priceSnapshot.bobSnapshot)} a ${formatPrice(priceSnapshot.bobActual)}/mes`
              : `↑ Antes ${formatPrice(priceSnapshot.bobSnapshot)} · ahora ${formatPrice(priceSnapshot.bobActual)}/mes`}
          </div>
        )}
      </div>
      {/* Galería de fotos horizontal */}
      {p.fotos_urls && p.fotos_urls.length > 0 && (
        <BottomSheetGallery photos={p.fotos_urls} propertyId={p.id} />
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
      {p.descripcion && (
        <div className="bs-section">
          <div className="bs-sl"><span className="bs-sl-dot" />Sobre esta propiedad</div>
          <div className={`bs-desc ${descExpanded ? 'expanded' : ''}`}>{p.descripcion}</div>
          {p.descripcion.length > 150 && !descExpanded && (
            <button className="bs-desc-more" onClick={() => setDescExpanded(true)}>Ver mas</button>
          )}
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
      {/* --- Mini Market Study --- */}
      {marketData && (
        <div className="bs-section">
          <div className="bs-sl"><span className="bs-sl-dot" />Mercado en {displayZona(p.zona)}</div>
          <div className="bs-mkt">
            <div className="bs-mkt-row">
              <span className="bs-mkt-label">Mediana {dormLabel(p.dormitorios)}</span>
              <span className="bs-mkt-value">{formatPrice(marketData.mediana)}/mes</span>
            </div>
            <div className="bs-mkt-row">
              <span className="bs-mkt-label">Este depto</span>
              <span className={`bs-mkt-badge ${marketData.diffPct <= 0 ? 'below' : 'above'}`}>
                {marketData.diffPct <= 0 ? `${Math.abs(marketData.diffPct)}% bajo mediana` : `${marketData.diffPct}% sobre mediana`}
              </span>
            </div>
            <div className="bs-mkt-row">
              <span className="bs-mkt-label">Rango</span>
              <span className="bs-mkt-value">{formatPrice(marketData.min)} — {formatPrice(marketData.max)}</span>
            </div>
            <div className="bs-mkt-count">{marketData.count} propiedades similares disponibles</div>
          </div>
        </div>
      )}
      {/* --- Similar Properties --- */}
      {similarProps.length > 0 && (
        <div className="bs-section">
          <div className="bs-sl"><span className="bs-sl-dot" />Tambien en {displayZona(p.zona)}</div>
          <div className="bs-sim-scroll">
            {similarProps.map(sp => {
              const spName = sp.nombre_edificio || sp.nombre_proyecto || 'Departamento'
              return (
                <button key={sp.id} className="bs-sim-card" onClick={() => onSwapProperty?.(sp)}>
                  {sp.fotos_urls?.[0] ? (
                    <img src={sp.fotos_urls[0]}
                         alt={spName} className="bs-sim-thumb" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <div className="bs-sim-thumb bs-sim-nophoto" />
                  )}
                  <div className="bs-sim-info">
                    <div className="bs-sim-name">{spName}</div>
                    <div className="bs-sim-price">{formatPrice(sp.precio_mensual_bob)}/mes</div>
                    <div className="bs-sim-specs">{sp.area_m2}m² · {dormLabel(sp.dormitorios)}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {/* --- Preguntas para el broker --- Ocultas en brokerMode (el broker ya conoce) y publicShareMode (cliente habla directo con broker) */}
      {!brokerMode && !publicShareMode && brokerQuestions.length > 0 && (
        <div className="bs-section">
          <div className="bs-q-header">
            <div className="bs-sl"><span className="bs-sl-dot" />Preguntas para el broker</div>
            <span className="bs-q-hint">
              {selectedQs.size > 0 ? `${selectedQs.size}/${MAX_QS} — se incluyen en WhatsApp` : `Selecciona hasta ${MAX_QS}`}
            </span>
          </div>
          <div className="bs-q-list">
            {brokerQuestions.map((q, i) => {
              const isSelected = selectedQs.has(i)
              const isDisabled = !isSelected && selectedQs.size >= MAX_QS
              return (
                <button key={i} className={`bs-q-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => toggleQuestion(i)}>
                  <span className={`bs-q-check ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="#EDE8DC" strokeWidth="3" style={{width:10,height:10}}><path d="M5 12l5 5L20 7"/></svg>}
                  </span>
                  <span className="bs-q-text">{q}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {/* Gate "Ver anuncio original" — oculto en brokerMode y publicShareMode (confianza en el broker) */}
      {!brokerMode && !publicShareMode && p.url && (
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
      {/* En brokerMode: link directo al anuncio sin gate (broker confía en su flujo) */}
      {brokerMode && p.url && (
        <div className="bs-section">
          <a className="bs-ver-anuncio" href={p.url} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('broker_open_listing', { property_id: p.id })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Ver anuncio original ↗
          </a>
        </div>
      )}
      {/* Sticky footer: WSP + Compartir */}
      <div className="bs-sticky-footer">
        {publicShareMode && publicShareBroker ? (
          <a
            href={`https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(buildClientToBrokerAlquilerMessage(p, publicShareBroker.nombre))}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('click_whatsapp_broker', { property_id: p.id, source: 'alq_bottom_sheet_public' })}
            className="bs-footer-wsp"
          >
            <svg viewBox="0 0 24 24" fill="#fff" style={{ width: 16, height: 16 }}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Escribir al broker
          </a>
        ) : !brokerMode && p.agente_whatsapp ? (
          <a href="#" onClick={(e) => {
            const selectedTexts = Array.from(selectedQs).sort().map(idx => brokerQuestions[idx]).filter(Boolean)
            const msg = buildAlquilerWaMessage(p, { preguntas: selectedTexts })
            handleWhatsAppLead(e, p, msg, 'bottom_sheet', selectedTexts.length > 0 ? selectedTexts : undefined)
          }} className="bs-footer-wsp">
            <svg viewBox="0 0 24 24" fill="#fff" style={{ width: 16, height: 16 }}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Whatsapp
          </a>
        ) : null}
        {brokerMode && p.agente_whatsapp && (
          <a
            href={`https://wa.me/${p.agente_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(buildAlquilerWaMessage(p))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bs-footer-wsp"
            onClick={() => trackEvent('broker_wa_agente', { property_id: p.id, tipo_operacion: 'alquiler' })}
          >
            <svg viewBox="0 0 24 24" fill="#fff" style={{ width: 16, height: 16 }}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WA al agente
          </a>
        )}
        {onShare && !publicShareMode && (
          <button className="bs-footer-share" onClick={onShare}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Compartir
          </button>
        )}
      </div>
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
    </div>
  )
}

// ===== SEO Head Component =====
function AlquileresHead({ seo, brokerSlug = null, publicShareHash = null }: {
  seo: AlquileresSEO
  brokerSlug?: string | null
  publicShareHash?: string | null
}) {
  const mesAnio = formatMesAnioSEO(seo.fechaActualizacion)
  const fechaCorta = formatFechaCortaSEO(seo.fechaActualizacion)
  // URL canónica según contexto. Sin override, el share del browser/OS resuelve
  // og:url y termina compartiendo simonbo.com/alquileres (feed público)
  // aunque el broker esté en /broker/[slug]/alquileres o un cliente en /b/[hash].
  const url = publicShareHash
    ? `https://simonbo.com/b/${publicShareHash}`
    : brokerSlug
    ? `https://simonbo.com/broker/${brokerSlug}/alquileres`
    : 'https://simonbo.com/alquileres'

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

// ===== getStaticProps — SEO data + first 8 properties for LCP =====
export const getStaticProps: GetStaticProps<{ seo: AlquileresSEO; initialProperties: UnidadAlquiler[] }> = async () => {
  const [data, initialProperties] = await Promise.all([
    fetchMercadoAlquilerData(),
    buscarUnidadesAlquiler({ orden: 'recientes', limite: 8, solo_con_fotos: true }).catch(() => [] as UnidadAlquiler[]),
  ])
  return {
    props: {
      initialProperties,
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
