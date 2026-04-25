import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import type { GetStaticProps } from 'next'
import type { UnidadVenta, FiltrosVentaSimple } from '@/lib/supabase'
import { ZONAS_CANONICAS, displayZona } from '@/lib/zonas'
import { trackEvent } from '@/lib/analytics'
import { fetchMercadoData, type MercadoData } from '@/lib/mercado-data'
import type { Broker } from '@/lib/simon-brokers'
import ACMInline from '@/components/broker/ACMInline'
import { useBrokerShortlists } from '@/hooks/useBrokerShortlists'
import ShortlistSendModal from '@/components/broker/ShortlistSendModal'
import ShortlistsPanel from '@/components/broker/ShortlistsPanel'

// --- SEO types ---
interface VentasSEO {
  totalPropiedades: number
  medianaPrecioM2: number
  absorcionPct: number
  fechaActualizacion: string
  generatedAt: string
  tipologias: Array<{ dormitorios: number; unidades: number; precioMediano: number; precioP25: number; precioP75: number }>
  zonas: Array<{ zonaDisplay: string; unidades: number; medianaPrecioM2: number }>
}

const DORM_LABELS_SEO: Record<number, string> = { 0: 'Studio', 1: '1 dormitorio', 2: '2 dormitorios', 3: '3 dormitorios' }

function fmtSEO(n: number): string {
  return '$' + n.toLocaleString('en-US')
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

const PhotoViewer = dynamic(() => import('@/components/alquiler/PhotoViewer'), { ssr: false })
const VentaMap = dynamic(() => import('@/components/venta/VentaMap'), { ssr: false })
const CompareSheet = dynamic(() => import('@/components/venta/CompareSheet'), { ssr: false })

// ===== Constants =====
const MIN_PRICE = 30000
const MAX_PRICE = 400000
const PRICE_STEP = 10000
const FILTER_CARD_POSITION = 1 // legacy — kept for reference
const MAX_FAVORITES = 3

const VIRTUAL_WINDOW = 3
const ORDEN_OPTIONS: Array<{ value: FiltrosVentaSimple['orden']; label: string }> = [
  { value: 'recientes', label: 'Recientes' },
  { value: 'precio_asc', label: 'Precio \u2191' },
  { value: 'precio_desc', label: 'Precio \u2193' },
]
const ENTREGA_OPTIONS = [
  { value: '', label: 'Todo' },
  { value: 'entrega_inmediata', label: 'Inmediata' },
  { value: 'solo_preventa', label: 'Preventa' },
]

function formatPriceK(v: number) { return `$${(v / 1000).toFixed(0)}k` }

function buildEmptyMessage(f: FiltrosVentaSimple): string {
  const parts: string[] = []
  if (f.dormitorios_lista?.length) {
    const labels = f.dormitorios_lista.map(d => d === 0 ? 'mono' : d === 3 ? '3+ dorm' : `${d} dorm`)
    parts.push(labels.join(' o '))
  }
  if (f.estado_entrega === 'entrega_inmediata') parts.push('entrega inmediata')
  if (f.estado_entrega === 'solo_preventa') parts.push('preventa')
  if (f.zonas_permitidas?.length) {
    const zonas = f.zonas_permitidas.map(z => {
      const found = ZONAS_CANONICAS.find(zc => zc.db === z)
      return found ? found.labelCorto : z
    })
    parts.push('en ' + zonas.join(' o '))
  }
  if (f.precio_max) parts.push(`bajo $us ${(f.precio_max / 1000).toFixed(0)}k`)
  if (parts.length === 0) return 'No hay departamentos disponibles en este momento.'
  return `No hay ${parts.join(', ')}. Probá quitando un filtro.`
}

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function formatFechaEntrega(fecha: string): string {
  const [y, m] = fecha.split('-')
  const mi = parseInt(m, 10) - 1
  return mi >= 0 && mi < 12 ? `${MESES_CORTO[mi]} ${y}` : fecha
}

// ===== Hook: desktop detection =====
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

// ===== API fetch =====
async function fetchFromAPI(
  filtros: FiltrosVentaSimple,
  spotlightId?: number
): Promise<{ data: UnidadVenta[]; total: number; spotlight?: UnidadVenta | null }> {
  const res = await fetch('/api/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filtros, spotlightId }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ===== Build filters =====
function buildFilters(
  minP: number, maxP: number, dorms: Set<number>, zonas: Set<string>,
  entrega: string, orden: FiltrosVentaSimple['orden'], proyecto?: string
): FiltrosVentaSimple {
  const f: FiltrosVentaSimple = { solo_con_fotos: true }
  if (minP > MIN_PRICE) f.precio_min = minP
  if (maxP < MAX_PRICE) f.precio_max = maxP
  if (dorms.size > 0) {
    const arr = [...dorms].sort()
    const hasThreePlus = dorms.has(3)
    const others = arr.filter(d => d !== 3)
    if (hasThreePlus && others.length === 0) {
      f.dormitorios_lista = [3, 4, 5]
    } else if (hasThreePlus) {
      f.dormitorios_lista = [...others, 3, 4, 5]
    } else {
      f.dormitorios_lista = arr
    }
  }
  if (zonas.size > 0) f.zonas_permitidas = [...zonas]
  if (entrega) f.estado_entrega = entrega as FiltrosVentaSimple['estado_entrega']
  if (orden) f.orden = orden
  if (proyecto?.trim()) f.proyecto = proyecto.trim()
  return f
}

// ===== SVG Icons =====
const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill={filled ? '#E05555' : 'none'} stroke={filled ? '#E05555' : '#7A7060'} strokeWidth="1.5">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </svg>
)
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#7A7060" strokeWidth="1.5">
    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
)
const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
)
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2"><polyline points="9 6 15 12 9 18"/></svg>
)

// ===== Shared filter UI =====
function FilterControls({ minPrice, maxPrice, selectedDorms, selectedZonas, entrega, orden, proyecto, proyectoNames, onMinPrice, onMaxPrice, onToggleZona, onToggleDorm, onEntrega, onOrden, onProyecto }: {
  minPrice: number; maxPrice: number; selectedDorms: Set<number>; selectedZonas: Set<string>; entrega: string; orden: FiltrosVentaSimple['orden']; proyecto: string; proyectoNames?: string[]
  onMinPrice: (v: number) => void; onMaxPrice: (v: number) => void; onToggleZona: (db: string) => void; onToggleDorm: (d: number) => void; onEntrega: (v: string) => void; onOrden: (v: FiltrosVentaSimple['orden']) => void; onProyecto: (v: string) => void
}) {
  return (
    <>
      <div className="vf-group"><div className="vf-label">EDIFICIO</div>
        <input type="text" className="vf-search" placeholder="Buscar edificio..." value={proyecto}
          onChange={e => onProyecto(e.target.value)} list="vf-proyectos" autoComplete="off" />
        {proyectoNames && proyectoNames.length > 0 && (
          <datalist id="vf-proyectos">
            {proyectoNames.map(n => <option key={n} value={n} />)}
          </datalist>
        )}
      </div>
      <div className="vf-group"><div className="vf-label">ZONA</div>
        <div className="vf-zona-btns">
          {ZONAS_CANONICAS.map(z => (
            <button key={z.db} className={`vf-zona-btn ${selectedZonas.has(z.db) ? 'active' : ''}`}
              onClick={() => onToggleZona(z.db)}>{z.labelCorto}</button>
          ))}
        </div>
      </div>
      <div className="vf-group"><div className="vf-label">PRESUPUESTO</div>
        <div className="vf-range-display">{formatPriceK(minPrice)} — {formatPriceK(maxPrice)}</div>
        <div className="vf-range-wrap">
          <input type="range" className="vf-slider vf-slider-min" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={minPrice} aria-label="Precio mínimo" onChange={e => onMinPrice(parseInt(e.target.value))} />
          <input type="range" className="vf-slider vf-slider-max" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={maxPrice} aria-label="Precio máximo" onChange={e => onMaxPrice(parseInt(e.target.value))} />
        </div>
        <div className="vf-tc-note">Precios en USD oficial · TC Bs 6.96</div>
      </div>
      <div className="vf-group"><div className="vf-label">DORMITORIOS</div>
        <div className="vf-btn-row">
          {[0, 1, 2, 3].map(d => (
            <button key={d} className={`vf-btn ${selectedDorms.has(d) ? 'active' : ''}`}
              onClick={() => onToggleDorm(d)}>{d === 0 ? 'Mono' : d === 3 ? '3+' : d}</button>
          ))}
        </div>
      </div>
      <div className="vf-group"><div className="vf-label">ENTREGA</div>
        <div className="vf-btn-row">
          {ENTREGA_OPTIONS.map(o => (
            <button key={o.value} className={`vf-btn ${entrega === o.value ? 'active' : ''}`}
              onClick={() => onEntrega(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
      <div className="vf-group"><div className="vf-label">ORDENAR POR</div>
        <div className="vf-btn-row">
          {ORDEN_OPTIONS.map(o => (
            <button key={o.value} className={`vf-btn ${orden === o.value ? 'active' : ''}`}
              onClick={() => onOrden(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
    </>
  )
}

// ===== Desktop Filters =====
function DesktopFilters({ currentFilters, isFiltered, onApply, onReset, proyectoNames }: {
  currentFilters: FiltrosVentaSimple; isFiltered: boolean
  onApply: (f: FiltrosVentaSimple) => void; onReset: () => void; proyectoNames?: string[]
}) {
  const [minPrice, setMinPrice] = useState(currentFilters.precio_min || MIN_PRICE)
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_max || MAX_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set())
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set(currentFilters.zonas_permitidas || []))
  const [entrega, setEntrega] = useState(currentFilters.estado_entrega || '')
  const [orden, setOrden] = useState<FiltrosVentaSimple['orden']>(currentFilters.orden || 'recientes')
  const [proyecto, setProyecto] = useState(currentFilters.proyecto || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const autoApply = useCallback((mnP: number, mxP: number, dorms: Set<number>, zonas: Set<string>, ent: string, ord: FiltrosVentaSimple['orden'], proy?: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onApply(buildFilters(mnP, mxP, dorms, zonas, ent, ord, proy))
    }, 400)
  }, [onApply])

  function toggleZona(db: string) { setSelectedZonas(prev => { const n = new Set(prev); if (n.has(db)) n.delete(db); else n.add(db); autoApply(minPrice, maxPrice, selectedDorms, n, entrega, orden, proyecto); return n }) }
  function toggleDorm(d: number) { setSelectedDorms(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); autoApply(minPrice, maxPrice, n, selectedZonas, entrega, orden, proyecto); return n }) }
  function handleMinPrice(v: number) { const c = Math.min(v, maxPrice - PRICE_STEP); setMinPrice(c); autoApply(c, maxPrice, selectedDorms, selectedZonas, entrega, orden, proyecto) }
  function handleMaxPrice(v: number) { const c = Math.max(v, minPrice + PRICE_STEP); setMaxPrice(c); autoApply(minPrice, c, selectedDorms, selectedZonas, entrega, orden, proyecto) }
  function handleEntrega(v: string) { setEntrega(v); autoApply(minPrice, maxPrice, selectedDorms, selectedZonas, v, orden, proyecto) }
  function handleOrden(v: FiltrosVentaSimple['orden']) { setOrden(v); autoApply(minPrice, maxPrice, selectedDorms, selectedZonas, entrega, v, proyecto) }
  function handleProyecto(v: string) { setProyecto(v); autoApply(minPrice, maxPrice, selectedDorms, selectedZonas, entrega, orden, v) }

  return (
    <div className="vf-wrap">
      <FilterControls minPrice={minPrice} maxPrice={maxPrice} selectedDorms={selectedDorms} selectedZonas={selectedZonas}
        entrega={entrega} orden={orden} proyecto={proyecto} proyectoNames={proyectoNames} onMinPrice={handleMinPrice} onMaxPrice={handleMaxPrice}
        onToggleZona={toggleZona} onToggleDorm={toggleDorm} onEntrega={handleEntrega} onOrden={handleOrden} onProyecto={handleProyecto} />
      {isFiltered && <button className="vf-reset" onClick={onReset}>Quitar filtros</button>}
    </div>
  )
}

// ===== Desktop VentaCard =====
function VentaCard({ property: p, isFavorite, onToggleFavorite, onShare, onPhotoTap, onDetails, isFirst, brokerMode, onAddToShortlist, publicShareMode = false, brokerInfo = null, publicShareBroker = null, priceSnapshot = null }: {
  property: UnidadVenta; isFavorite: boolean; isFirst?: boolean
  onToggleFavorite: () => void; onShare: () => void; onPhotoTap: (idx: number) => void; onDetails: () => void
  brokerMode?: boolean; onAddToShortlist?: () => void; publicShareMode?: boolean
  brokerInfo?: { nombre: string; inmobiliaria?: string | null } | null
  publicShareBroker?: { nombre: string; telefono: string } | null
  priceSnapshot?: { rawSnapshot: number | null; normSnapshot: number | null; rawActual: number | null } | null
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls?.length > 0 ? p.fotos_urls : []
  const hasPhotos = photos.length > 0
  const cardRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!!isFirst)

  useEffect(() => {
    if (isFirst) { setVisible(true); return }
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [isFirst])

  // Sync photoIdx con scroll del carrusel — patrón clonado de MobileVentaCard.
  // Permite swipe táctil en mobile + actualiza counter/dots mientras scrolleás.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || photos.length <= 1) return
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        if (!el) { ticking = false; return }
        const idx = Math.round(el.scrollLeft / el.clientWidth)
        setPhotoIdx(idx)
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [photos.length])

  function navTo(idx: number) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' })
  }

  const amenities = p.amenities_confirmados || []
  const equipamiento = p.equipamiento_detectado || []

  // Carrusel scroll-snap solo en publicShareMode (shortlist del cliente final).
  // Para feed normal y broker mode mantenemos la foto estática + flechas
  // (el carrusel introducía regresiones que no llegamos a aislar).
  const useCarousel = publicShareMode

  return (
    <div className="vc" ref={cardRef}>
      <div className="vc-photo" style={!useCarousel && hasPhotos && visible ? { backgroundImage: `url('${photos[photoIdx]}')`, cursor: 'pointer' } : undefined}
        onClick={!useCarousel ? () => { if (hasPhotos) onPhotoTap(photoIdx) } : undefined}>
        {useCarousel && (
          <div className="vc-photo-scroll" ref={scrollRef}>
            {hasPhotos ? photos.map((url, i) => (
              <div key={i} className="vc-slide"
                style={visible ? { backgroundImage: `url('${url}')` } : undefined}
                onClick={() => onPhotoTap(i)} />
            )) : (
              <div className="vc-slide vc-slide-empty"><div className="vc-nofoto">Sin fotos</div></div>
            )}
          </div>
        )}
        {!useCarousel && !hasPhotos && <div className="vc-nofoto">Sin fotos</div>}
        {p.tc_sospechoso && <div className="vc-tc-badge">Confirmar tipo de cambio</div>}
        {brokerMode && !publicShareMode && (() => { const fb = fuenteBadge(p.fuente); return fb ? <div className="vc-fuente-badge" style={{ background: fb.bg, color: fb.color }}>{fb.label}</div> : null })()}
        {photos.length > 1 && (<>
          {photoIdx > 0 && <button className="vc-nav vc-nav-prev" aria-label="Foto anterior" onClick={e => { e.stopPropagation(); useCarousel ? navTo(photoIdx - 1) : setPhotoIdx(photoIdx - 1) }}><ChevronLeft /></button>}
          {photoIdx < photos.length - 1 && <button className="vc-nav vc-nav-next" aria-label="Foto siguiente" onClick={e => { e.stopPropagation(); useCarousel ? navTo(photoIdx + 1) : setPhotoIdx(photoIdx + 1) }}><ChevronRight /></button>}
          <div className="vc-photo-count">{photoIdx + 1}/{photos.length}</div>
        </>)}
      </div>
      <div className="vc-body">
        <div className="vc-name">{p.proyecto}{p.dias_en_mercado !== null && p.dias_en_mercado <= 60 && <span className="vc-reciente">Publicación reciente</span>}</div>
        <div className="vc-zona">{displayZona(p.zona)} <span className="vc-id">#{p.id}</span></div>
        <div className="vc-price-block">
          <div className="vc-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')} <span className="vc-tc">(T.C. oficial)</span></div>
          {(() => { const b = priceChangeBadge(priceSnapshot, p.precio_usd); return b ? <div className={`vc-price-change vc-price-change-${b.kind}`}>{b.label}</div> : null })()}
          <div className="vc-specs">{[
            p.dormitorios !== null ? (p.dormitorios === 0 ? 'Monoambiente' : `${p.dormitorios} dorm`) : null,
            p.area_m2 > 0 ? `${Math.round(p.area_m2)} m²` : null,
            p.banos !== null ? `${p.banos} baño${p.banos !== 1 ? 's' : ''}` : null,
            p.piso ? `Piso ${p.piso}` : null,
          ].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="vc-specs-2">{[
          p.precio_m2 > 0 ? `$us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m²` : null,
          p.estado_construccion === 'preventa'
            ? (p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa')
            : 'Entrega inmediata',
          p.parqueo_incluido ? 'Parqueo incl.' : null,
          p.baulera_incluido ? 'Baulera incl.' : null,
                  ].filter(Boolean).join('  ·  ')}</div>
        <div className="vc-actions">
          <button className={`vc-act-btn vc-act-fav ${brokerMode ? 'vc-act-star' : ''} ${isFavorite ? 'active' : ''}`} aria-label={brokerMode ? (isFavorite ? 'Quitar de shortlist' : 'Agregar a shortlist') : 'Favorito'} onClick={onToggleFavorite}>
            {brokerMode ? (
              <svg viewBox="0 0 24 24" fill={isFavorite ? '#3A6A48' : 'none'} stroke={isFavorite ? '#3A6A48' : 'currentColor'} strokeWidth="1.5" style={{ width: 20, height: 20 }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : 'currentColor'} strokeWidth="1.5" style={{ width: 20, height: 20 }}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            )}
          </button>
          {!brokerMode && (
            <button className="vc-act-btn" aria-label="Compartir" onClick={onShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg> Compartir
            </button>
          )}
          <button className="vc-act-btn vc-act-detail" aria-label="Ver detalles" onClick={onDetails}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg> Ver mas
          </button>
          {publicShareMode && publicShareBroker && (
            <a href={`https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(buildClientToBrokerMessage(p, publicShareBroker.nombre))}`}
              target="_blank" rel="noopener noreferrer" className="vc-act-btn vc-act-wsp">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="#1EA952"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Consultar
            </a>
          )}
          {!publicShareMode && p.agente_telefono && (
            <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(buildAgentWaMessage(p, brokerInfo))}`}
              target="_blank" rel="noopener noreferrer" className="vc-act-btn vc-act-wsp"
              onClick={() => trackEvent('click_whatsapp_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_usd), source: 'card_desktop' })}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="#1EA952"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Whatsapp
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== Mobile TikTok VentaCard (55% foto / 45% contenido) =====
function MobileVentaCard({ property: p, isFavorite, onToggleFavorite, onShare, onPhotoTap, onDetails, isSpotlight, isFirst, brokerMode, onAddToShortlist, publicShareMode = false, brokerInfo = null, publicShareBroker = null, priceSnapshot = null }: {
  property: UnidadVenta; isFavorite: boolean; isSpotlight?: boolean; isFirst?: boolean
  onToggleFavorite: () => void; onShare: () => void; onPhotoTap: (idx: number) => void; onDetails: () => void
  brokerMode?: boolean; onAddToShortlist?: () => void; publicShareMode?: boolean
  brokerInfo?: { nombre: string; inmobiliaria?: string | null } | null
  publicShareBroker?: { nombre: string; telefono: string } | null
  priceSnapshot?: { rawSnapshot: number | null; normSnapshot: number | null; rawActual: number | null } | null
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls?.length > 0 ? p.fotos_urls : []
  const amenities = p.amenities_confirmados || []
  const zoneRef = useRef<HTMLDivElement>(null)
  const [maxLoaded, setMaxLoaded] = useState(isFirst ? 2 : 0)

  // Lazy: only start loading when card enters viewport
  useEffect(() => {
    if (isFirst) { setMaxLoaded(2); return }
    const el = zoneRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setMaxLoaded(2); obs.disconnect() }
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [isFirst])

  // Track swipe position for dots
  useEffect(() => {
    const el = scrollRef.current
    if (!el || photos.length <= 1) return
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        if (!el) { ticking = false; return }
        const idx = Math.round(el.scrollLeft / el.clientWidth)
        setPhotoIdx(idx)
        setMaxLoaded(prev => Math.max(prev, idx + 2))
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [photos.length])

  return (
    <div className="mc">
      {/* Photo carousel zone (55%) */}
      <div className="mc-photo-zone" ref={zoneRef}>
        <div className="mc-photo-scroll" ref={scrollRef}>
          {photos.length > 0 ? photos.map((url, i) => {
            const shouldLoad = i < maxLoaded
            return (
            <div key={i} className="mc-slide" style={shouldLoad && url ? { backgroundImage: `url('${url}')`, cursor: 'pointer' } : { cursor: 'pointer' }}
              onClick={() => onPhotoTap(i)}>
            </div>
            )
          }) : (
            <div className="mc-slide mc-slide-empty" />
          )}
        </div>
        {/* Gradient fade to black at bottom */}
        <div className="mc-photo-fade" />
        {/* Photo counter */}
        {photos.length > 1 && (
          <div className="mc-photo-count">{photoIdx + 1}/{photos.length}</div>
        )}
        {/* Dots */}
        {photos.length > 1 && photos.length <= 10 && (
          <div className="mc-dots">
            {photos.map((_, i) => (
              <div key={i} className={`mc-dot ${i === photoIdx ? 'active' : ''}`} />
            ))}
          </div>
        )}
      </div>

      {/* Spotlight badge */}
      {isSpotlight && <div className="mc-spotlight">Te compartieron este depto</div>}
      {p.tc_sospechoso && <div className="mc-tc-badge">Confirmar tipo de cambio</div>}
      {brokerMode && !publicShareMode && (() => { const fb = fuenteBadge(p.fuente); return fb ? <div className="mc-fuente-badge" style={{ background: fb.bg, color: fb.color }}>{fb.label}</div> : null })()}

      {/* Content zone (45%) */}
      <div className="mc-content">
        <div className="mc-name">{p.proyecto}{p.dias_en_mercado !== null && p.dias_en_mercado <= 60 && <span className="mc-reciente">Publicación reciente</span>}</div>
        <div className="mc-zona">{displayZona(p.zona)} <span className="mc-id">#{p.id}</span></div>
        <div className="mc-price-block">
          <div className="mc-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')} <span className="mc-tc">(T.C. oficial)</span></div>
          {(() => { const b = priceChangeBadge(priceSnapshot, p.precio_usd); return b ? <div className={`mc-price-change mc-price-change-${b.kind}`}>{b.label}</div> : null })()}
          <div className="mc-specs">{[
            p.dormitorios !== null ? (p.dormitorios === 0 ? 'Monoambiente' : `${p.dormitorios} dorm`) : null,
            p.area_m2 > 0 ? `${Math.round(p.area_m2)} m²` : null,
            p.banos !== null ? `${p.banos} baño${p.banos !== 1 ? 's' : ''}` : null,
            p.piso ? `Piso ${p.piso}` : null,
          ].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="mc-specs-2">{[
          p.precio_m2 > 0 ? `$us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m²` : null,
          p.estado_construccion === 'preventa'
            ? (p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa')
            : 'Entrega inmediata',
          p.parqueo_incluido ? 'Parqueo incl.' : null,
          p.baulera_incluido ? 'Baulera incl.' : null,
                  ].filter(Boolean).join('  ·  ')}</div>
        <div className="mc-actions">
          <button className={`mc-btn mc-fav ${brokerMode ? 'mc-star' : ''} ${isFavorite ? 'active' : ''}`} aria-label={brokerMode ? (isFavorite ? 'Quitar de shortlist' : 'Agregar a shortlist') : 'Favorito'} onClick={onToggleFavorite}>
            {brokerMode ? (
              <svg viewBox="0 0 24 24" fill={isFavorite ? '#3A6A48' : 'none'} stroke={isFavorite ? '#3A6A48' : '#7A7060'} strokeWidth="1.5" style={{ width: 22, height: 22 }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : '#7A7060'} strokeWidth="1.5" style={{ width: 22, height: 22 }}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            )}
          </button>
          {!brokerMode && (
            <button className="mc-btn mc-share" aria-label="Compartir" onClick={onShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 18, height: 18 }}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          )}
          <button className="mc-btn mc-info" onClick={onDetails}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg> Ver mas
          </button>
          {((publicShareMode && publicShareBroker) || (!publicShareMode && p.agente_telefono)) && (
            <a href={publicShareMode && publicShareBroker
              ? `https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(buildClientToBrokerMessage(p, publicShareBroker.nombre))}`
              : `https://wa.me/${p.agente_telefono!.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(buildAgentWaMessage(p, brokerInfo))}`}
              target="_blank" rel="noopener noreferrer" className="mc-btn mc-wsp-inline"
              onClick={() => trackEvent('click_whatsapp_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_usd), source: 'card_mobile' })}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Whatsapp
            </a>
          )}
        </div>
        <a href="/landing-v2" className="mc-branding">simonbo.com</a>
      </div>
    </div>
  )
}

// ===== Mobile Filter Card (full-screen, snaps in feed) =====
function MobileFilterCard({ totalCount, filteredCount, isFiltered, onApply, onReset, proyectoNames }: {
  totalCount: number; filteredCount: number; isFiltered: boolean
  onApply: (f: FiltrosVentaSimple) => void; onReset: () => void; proyectoNames?: string[]
}) {
  const [minPrice, setMinPrice] = useState(MIN_PRICE)
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set())
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set())
  const [entrega, setEntrega] = useState('')
  const [orden, setOrden] = useState<FiltrosVentaSimple['orden']>('recientes')
  const [proyecto, setProyecto] = useState('')

  function handleMinPrice(v: number) { setMinPrice(Math.min(v, maxPrice - PRICE_STEP)) }
  function handleMaxPrice(v: number) { setMaxPrice(Math.max(v, minPrice + PRICE_STEP)) }
  function toggleZona(db: string) { setSelectedZonas(prev => { const n = new Set(prev); if (n.has(db)) n.delete(db); else n.add(db); return n }) }
  function toggleDorm(d: number) { setSelectedDorms(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n }) }

  function apply() {
    onApply(buildFilters(minPrice, maxPrice, selectedDorms, selectedZonas, entrega, orden, proyecto))
  }

  return (
    <div className="mfc">
      <div className="mfc-header">
        <span className="mfc-count">{isFiltered ? filteredCount : totalCount}</span>
        <span className="mfc-sub">{isFiltered ? `de ${totalCount} departamentos` : 'departamentos en Equipetrol'}</span>
      </div>
      <div className="mfc-divider"><span className="mfc-line" /><span className="mfc-text">Filtra</span><span className="mfc-line" /></div>
      <div className="mfc-filters">
        <FilterControls minPrice={minPrice} maxPrice={maxPrice} selectedDorms={selectedDorms} selectedZonas={selectedZonas}
          entrega={entrega} orden={orden} proyecto={proyecto} proyectoNames={proyectoNames} onMinPrice={handleMinPrice} onMaxPrice={handleMaxPrice}
          onToggleZona={toggleZona} onToggleDorm={toggleDorm} onEntrega={v => setEntrega(v)} onOrden={v => setOrden(v)} onProyecto={v => setProyecto(v)} />
      </div>
      <button className="mfc-cta" onClick={apply}>APLICAR FILTROS</button>
      {isFiltered && <button className="mfc-reset" onClick={onReset}>Quitar filtros · ver todas</button>}
      <div className="mfc-skip">seguí explorando &darr;</div>
    </div>
  )
}

// ===== Mobile Filter Overlay (TikTok/Airbnb style) =====
function FilterOverlay({ isOpen, onClose, totalCount, filteredCount, isFiltered, onApply, onReset, proyectoNames }: {
  isOpen: boolean; onClose: () => void
  totalCount: number; filteredCount: number; isFiltered: boolean
  onApply: (f: FiltrosVentaSimple) => void; onReset: () => void; proyectoNames?: string[]
}) {
  const [minPrice, setMinPrice] = useState(MIN_PRICE)
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set())
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set())
  const [entrega, setEntrega] = useState('')
  const [orden, setOrden] = useState<FiltrosVentaSimple['orden']>('recientes')
  const [proyecto, setProyecto] = useState('')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const previewRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)

  const currentFilters = useMemo(() =>
    buildFilters(minPrice, maxPrice, selectedDorms, selectedZonas, entrega, orden, proyecto),
    [minPrice, maxPrice, selectedDorms, selectedZonas, entrega, orden, proyecto]
  )

  // Debounced preview count
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (!isOpen) return
    if (previewRef.current) clearTimeout(previewRef.current)
    previewRef.current = setTimeout(async () => {
      try {
        const result = await fetchFromAPI(currentFilters)
        setPreviewCount(result.total)
      } catch {}
    }, 400)
    return () => { if (previewRef.current) clearTimeout(previewRef.current) }
  }, [currentFilters, isOpen])

  // Reset preview when overlay opens
  useEffect(() => {
    if (isOpen) { setPreviewCount(null); isFirstRender.current = true }
  }, [isOpen])

  function handleMinPrice(v: number) { setMinPrice(Math.min(v, maxPrice - PRICE_STEP)) }
  function handleMaxPrice(v: number) { setMaxPrice(Math.max(v, minPrice + PRICE_STEP)) }
  function toggleZona(db: string) { setSelectedZonas(prev => { const n = new Set(prev); if (n.has(db)) n.delete(db); else n.add(db); return n }) }
  function toggleDorm(d: number) { setSelectedDorms(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n }) }

  function handleApply() {
    onApply(currentFilters)
    onClose()
  }
  function handleReset() {
    setMinPrice(MIN_PRICE); setMaxPrice(MAX_PRICE)
    setSelectedDorms(new Set()); setSelectedZonas(new Set())
    setEntrega(''); setOrden('recientes'); setProyecto('')
    onReset()
    onClose()
  }

  if (!isOpen) return null

  const displayCount = previewCount !== null ? previewCount : (isFiltered ? filteredCount : totalCount)

  return (
    <div className="fo-overlay">
      <div className="fo-header">
        <button className="fo-close" aria-label="Cerrar filtros" onClick={onClose}>&times;</button>
        <span className="fo-title">Filtros</span>
        <span className="fo-count">{displayCount} deptos</span>
      </div>
      <div className="fo-body">
        <FilterControls minPrice={minPrice} maxPrice={maxPrice} selectedDorms={selectedDorms} selectedZonas={selectedZonas}
          entrega={entrega} orden={orden} proyecto={proyecto} proyectoNames={proyectoNames} onMinPrice={handleMinPrice} onMaxPrice={handleMaxPrice}
          onToggleZona={toggleZona} onToggleDorm={toggleDorm} onEntrega={v => setEntrega(v)} onOrden={v => setOrden(v)} onProyecto={v => setProyecto(v)} />
      </div>
      <div className="fo-footer">
        {isFiltered && <button className="fo-reset" onClick={handleReset}>Quitar filtros</button>}
        <button className="fo-apply" onClick={handleApply}>
          VER {displayCount} RESULTADOS
        </button>
      </div>
    </div>
  )
}

// ===== Map Float Card =====
function MapFloatCard({ property: p, isFavorite, onClose, onOpenDetail, onToggleFavorite, mobile }: {
  property: UnidadVenta; isFavorite: boolean; onClose: () => void; onOpenDetail: () => void; onToggleFavorite: () => void; mobile?: boolean
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls ?? []
  const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
  return (
    <div className={mobile ? 'mfc-mobile' : 'mfc-desktop'}>
      <button className="mfc-close" aria-label="Cerrar" onClick={onClose}>&times;</button>
      <div className="mfc-photo" style={photos[photoIdx] ? { backgroundImage: `url('${photos[photoIdx]}')` } : undefined}>
        {photos.length > 1 && (<>
          {photoIdx > 0 && <button className="mfc-nav mfc-nav-prev" aria-label="Foto anterior" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx - 1) }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>}
          {photoIdx < photos.length - 1 && <button className="mfc-nav mfc-nav-next" aria-label="Foto siguiente" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx + 1) }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>}
          <div className="mfc-count">{photoIdx + 1}/{photos.length}</div>
        </>)}
        <button className={`mfc-fav ${isFavorite ? 'active' : ''}`} onClick={e => { e.stopPropagation(); onToggleFavorite() }}>
          <HeartIcon filled={isFavorite} />
        </button>
      </div>
      <div className="mfc-body">
        <div className="mfc-name">{p.proyecto}</div>
        <div className="mfc-specs">{displayZona(p.zona)} · {Math.round(p.area_m2)}m² · {dorms}</div>
        <div className="mfc-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')}</div>
        <div className="mfc-m2">$us {Math.round(p.precio_m2).toLocaleString('en-US')}/m²</div>
        <button className="mfc-detail" onClick={onOpenDetail}>Ver detalles</button>
      </div>
    </div>
  )
}

// ===== Bottom Sheet Gallery =====
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
      <style jsx>{`
        .bsg-wrap{position:relative;background:#141414}
        .bsg-scroll{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .bsg-scroll::-webkit-scrollbar{display:none}
        .bsg-slide{flex:0 0 100%;scroll-snap-align:start;aspect-ratio:16/9;overflow:hidden}
        .bsg-slide img{width:100%;height:100%;object-fit:cover;display:block;-webkit-user-drag:none}
        .bsg-arrow{display:none;position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:50%;background:rgba(20,20,20,0.6);border:1px solid rgba(255,255,255,0.15);cursor:pointer;align-items:center;justify-content:center;z-index:2;transition:opacity 0.2s}
        .bsg-arrow:hover{background:rgba(20,20,20,0.8)}
        .bsg-arrow-left{left:10px}
        .bsg-arrow-right{right:10px}
        @media (min-width:768px){.bsg-arrow{display:flex}}
        .bsg-counter{position:absolute;bottom:12px;right:12px;background:rgba(20,20,20,0.75);color:rgba(255,255,255,0.8);font-size:12px;font-weight:500;padding:4px 10px;border-radius:100px;font-family:'DM Sans',sans-serif}
        .bsg-dots{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:5px;z-index:2}
        .bsg-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.35)}
        .bsg-dot.active{background:#fff;width:18px;border-radius:3px}
        .bsg-dot-more{font-size:10px;color:rgba(255,255,255,0.5);font-family:'DM Sans',sans-serif}
      `}</style>
    </div>
  )
}

// ===== Bottom Sheet =====
function BottomSheet({ property: p, isOpen, onClose, onShare, isFavorite, onToggleFavorite, gateCompleted, onGate, isDesktop, properties, onSwapProperty, brokerMode = false, onAddToShortlist, publicShareBroker = null, brokerInfo = null }: {
  property: UnidadVenta | null; isOpen: boolean; onClose: () => void; onShare?: () => void
  isFavorite?: boolean; onToggleFavorite?: () => void
  gateCompleted: boolean; onGate: (n: string, t: string, c: string, url: string) => void; isDesktop: boolean
  properties?: UnidadVenta[]; onSwapProperty?: (p: UnidadVenta) => void
  brokerMode?: boolean; onAddToShortlist?: (p: UnidadVenta) => void
  publicShareBroker?: { nombre: string; telefono: string } | null
  // Datos del broker activo (cuando brokerMode=true). Se usa para personalizar
  // el mensaje WA broker→broker (identificación + franquicia + link del anuncio).
  brokerInfo?: { nombre: string; inmobiliaria?: string | null } | null
}) {
  const publicShareMode = publicShareBroker !== null
  const [gateName, setGateName] = useState('')
  const [gateTel, setGateTel] = useState('')
  const [gateEmail, setGateEmail] = useState('')
  const [showGate, setShowGate] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [selectedQs, setSelectedQs] = useState<Set<number>>(new Set())
  const MAX_QS = 3

  // Reset state when property changes
  const propId = p?.id
  useEffect(() => {
    setDescExpanded(false)
    setShowGate(false)
    setSelectedQs(new Set())
  }, [propId])

  const similarProps = useMemo(() => {
    if (!p || !properties || properties.length === 0) return []
    return properties
      .filter(q => q.zona === p.zona && q.dormitorios === p.dormitorios && q.id !== p.id && q.fotos_urls?.length > 0)
      .sort((a, b) => Math.abs(a.precio_usd - p.precio_usd) - Math.abs(b.precio_usd - p.precio_usd))
      .slice(0, 4)
  }, [p?.id, p?.zona, p?.dormitorios, p?.precio_usd, properties])

  const brokerQuestions = useMemo(() => {
    if (!p) return []
    const isPreventa = p.estado_construccion === 'preventa'
    const qs: string[] = []
    qs.push('El precio es negociable?')
    if (isPreventa) {
      qs.push('Cual es el plan de pagos? Cuantas cuotas?')
      if (!p.fecha_entrega) qs.push('Cual es la fecha estimada de entrega?')
      qs.push('Se puede visitar el showroom o ver el avance de obra?')
      qs.push('Que incluye el precio? (parqueo, baulera, acabados)')
    } else {
      qs.push('Cuales son los costos de cierre? (notaria, impuestos, transferencia)')
      qs.push('Se puede coordinar una visita?')
      if (p.plan_pagos_desarrollador) qs.push('Cual es el plan de pagos? Cuantas cuotas?')
      if (!p.plan_pagos_desarrollador) qs.push('Acepta financiamiento bancario?')
      qs.push('Cuanto son las expensas mensuales?')
    }
    if (p.solo_tc_paralelo) qs.push('A que tipo de cambio se cierra? Se congela al reservar?')
    return qs
  }, [p?.id, p?.estado_construccion, p?.plan_pagos_desarrollador, p?.solo_tc_paralelo, p?.fecha_entrega])

  function toggleQuestion(idx: number) {
    setSelectedQs(prev => {
      const next = new Set(prev)
      if (next.has(idx)) { next.delete(idx) }
      else if (next.size < MAX_QS) { next.add(idx) }
      return next
    })
  }

  if (!p) return null

  const amenities = p.amenities_confirmados || []
  const equipamiento = p.equipamiento_detectado || []

  function handleVerOriginal() {
    if (gateCompleted) { window.open(p!.url, '_blank') }
    else { setShowGate(true) }
  }

  function submitGate() {
    if (!gateName.trim() || !gateTel.trim() || !gateEmail.trim()) return
    onGate(gateName.trim(), gateTel.trim(), gateEmail.trim(), p!.url || '')
    setShowGate(false)
  }

  return (
    <>
      <div className={`bs-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <div className={`bs bs-venta ${isOpen ? 'open' : ''} ${isDesktop ? 'bs-desktop' : ''}`}>
        {/* Floating close + fav — always visible */}
        <div className="bs-floating-actions">
          {onToggleFavorite && (
            <button className={`bs-fav ${brokerMode ? 'bs-star' : ''} ${isFavorite ? 'active' : ''}`} aria-label={brokerMode ? (isFavorite ? 'Quitar de shortlist' : 'Agregar a shortlist') : 'Favorito'} onClick={onToggleFavorite}>
              {brokerMode ? (
                <svg viewBox="0 0 24 24" fill={isFavorite ? '#3A6A48' : 'none'} stroke={isFavorite ? '#3A6A48' : 'currentColor'} strokeWidth="1.5" style={{ width: 20, height: 20 }}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : 'currentColor'} strokeWidth="1.5" style={{ width: 20, height: 20 }}>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              )}
            </button>
          )}
          <button className="bs-close" aria-label="Cerrar detalles" onClick={onClose}>&times;</button>
        </div>
        {/* Header — styled like feed card */}
        <div className="bs-dark-header">
          <div className="bs-h-name">
            {p.proyecto}
            {p.dias_en_mercado !== null && p.dias_en_mercado <= 60 && <span className="bs-h-reciente">Reciente</span>}
          </div>
          <div className="bs-h-zona">{displayZona(p.zona)} · #{p.id}</div>
          <div className="bs-h-price-block">
            <div className="bs-h-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')} <span className="bs-h-tc">(T.C. oficial)</span>{p.tc_sospechoso && <span className="bs-tc-badge">Confirmar tipo de cambio</span>}</div>
            <div className="bs-h-specs">{[
              p.dormitorios !== null ? (p.dormitorios === 0 ? 'Monoambiente' : `${p.dormitorios} dorm`) : null,
              p.area_m2 > 0 ? `${Math.round(p.area_m2)} m²` : null,
              p.banos !== null ? `${p.banos} baño${p.banos !== 1 ? 's' : ''}` : null,
              p.piso ? `Piso ${p.piso}` : null,
            ].filter(Boolean).join(' · ')}</div>
            <div className="bs-h-sub">{[
              p.precio_m2 > 0 ? `$us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m²` : null,
              p.estado_construccion === 'preventa'
                ? (p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa')
                : 'Entrega inmediata',
            ].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
          {/* Galería de fotos horizontal */}
          {p.fotos_urls && p.fotos_urls.length > 0 && (
            <BottomSheetGallery photos={p.fotos_urls} propertyId={p.id} />
          )}

          {/* Características */}
          <div className="bs-section">
            <div className="bs-sl"><span className="bs-sl-dot" />Características</div>
            <div className="bs-grid">
              {p.area_m2 > 0 && (
                <div className="bs-feat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M3 14h7v7H3z"/><path d="M14 14h7v7h-7z"/></svg>
                  <div className="bs-fv">{Math.round(p.area_m2)}m²</div>
                  <div className="bs-fl">Área</div>
                </div>
              )}
              {p.dormitorios !== null && (
                <div className="bs-feat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v3"/></svg>
                  <div className="bs-fv">{p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`}</div>
                  <div className="bs-fl">Tipo</div>
                </div>
              )}
              {p.banos !== null && (
                <div className="bs-feat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h3v2.25"/></svg>
                  <div className="bs-fv">{p.banos} baño{p.banos !== 1 ? 's' : ''}</div>
                  <div className="bs-fl">Baños</div>
                </div>
              )}
              {p.piso && (
                <div className="bs-feat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>
                  <div className="bs-fv">Piso {p.piso}</div>
                  <div className="bs-fl">Nivel</div>
                </div>
              )}
              {p.estacionamientos && p.estacionamientos > 0 && (
                <div className="bs-feat hl">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 002 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>
                  <div className="bs-fv">{p.estacionamientos} incl.</div>
                  <div className="bs-fl">Parqueo</div>
                </div>
              )}
            </div>
          </div>

          {/* Badges */}
          <div className="bs-section">
            <div className="bs-badges">
              {p.estado_construccion === 'preventa' && <span className="bs-badge gold">{p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa'}</span>}
              {p.estado_construccion !== 'preventa' && <span className="bs-badge">Entrega inmediata</span>}
              {p.precio_negociable && <span className="bs-badge gold">Negociable</span>}
              {p.plan_pagos_desarrollador && <span className="bs-badge">Plan de pagos</span>}
              {p.descuento_contado_pct && p.descuento_contado_pct > 0 && <span className="bs-badge gold">-{p.descuento_contado_pct}% contado</span>}
              {p.parqueo_incluido && <span className="bs-badge">Parqueo incluido</span>}
              {p.baulera_incluido && <span className="bs-badge">Baulera incluida</span>}
              {p.solo_tc_paralelo && <span className="bs-badge">TC Paralelo</span>}
            </div>
          </div>

          {/* ACM inline — solo en modo broker */}
          {brokerMode && <ACMInline propiedadId={p.id} tcSospechoso={p.tc_sospechoso} />}

          {/* Amenidades */}
          {amenities.length > 0 && (
            <div className="bs-section">
              <div className="bs-sl"><span className="bs-sl-dot" />Edificio</div>
              <div className="bs-aw">{amenities.map((a, i) => <span key={i} className="bs-at">{a}</span>)}</div>
            </div>
          )}

          {/* Equipamiento */}
          {equipamiento.length > 0 && (
            <div className="bs-section">
              <div className="bs-sl"><span className="bs-sl-dot" />Departamento</div>
              <div className="bs-aw">{equipamiento.map((e, i) => <span key={i} className="bs-at">{e}</span>)}</div>
            </div>
          )}

          {/* Descripción (colapsable) */}
          {p.descripcion && (
            <div className="bs-section">
              <div className="bs-sl"><span className="bs-sl-dot" />Sobre esta propiedad</div>
              <div className={`bs-desc ${descExpanded ? 'expanded' : ''}`}>{p.descripcion}</div>
              {p.descripcion.length > 150 && !descExpanded && (
                <button className="bs-desc-more" onClick={() => setDescExpanded(true)}>Ver más</button>
              )}
            </div>
          )}

          {/* Agente info — oculto en publicShareMode (cliente solo contacta al broker) */}
          {!publicShareMode && p.agente_nombre && (
            <div className="bs-section">
              <div className="bs-agent">
                <span className="bs-agent-name">{p.agente_nombre}</span>
                {p.agente_oficina && <span className="bs-agent-office"> · {p.agente_oficina}</span>}
              </div>
            </div>
          )}

          {/* Propiedades similares — oculto en publicShareMode (cliente solo ve lo curado) */}
          {!publicShareMode && similarProps.length > 0 && (
            <div className="bs-section">
              <div className="bs-sl"><span className="bs-sl-dot" />También en {displayZona(p.zona)}</div>
              <div className="bs-sim-scroll">
                {similarProps.map(sp => (
                  <button key={sp.id} className="bs-sim-card" aria-label={`Ver ${sp.proyecto}`} onClick={() => onSwapProperty?.(sp)}>
                    {sp.fotos_urls?.[0] ? (
                      <img src={sp.fotos_urls[0]}
                           alt={sp.proyecto} className="bs-sim-thumb" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <div className="bs-sim-thumb bs-sim-nophoto" />
                    )}
                    <div className="bs-sim-info">
                      <div className="bs-sim-name">{sp.proyecto}</div>
                      <div className="bs-sim-price">$us {Math.round(sp.precio_usd).toLocaleString('en-US')}</div>
                      <div className="bs-sim-specs">{Math.round(sp.area_m2)}m² · {sp.dormitorios === 0 ? 'Mono' : `${sp.dormitorios} dorm`}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preguntas para el vendedor — oculto en modo broker (el broker es el que responde) */}
          {!brokerMode && !publicShareMode && brokerQuestions.length > 0 && (
            <div className="bs-section">
              <div className="bs-q-header">
                <div className="bs-sl"><span className="bs-sl-dot" />Preguntas para el vendedor</div>
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

          {/* Ubicación Google Maps */}
          {p.latitud && p.longitud && (
            <div className="bs-section">
              <a href={`https://www.google.com/maps?q=${p.latitud},${p.longitud}`}
                target="_blank" rel="noopener noreferrer" className="bs-gmaps-link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 18, height: 18, flexShrink: 0 }}>
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Ver ubicación en Google Maps
              </a>
            </div>
          )}

          {/* Boton "Agregar/Quitar de shortlist" — solo en modo broker, con feedback de estado */}
          {brokerMode && onToggleFavorite && (
            <div className="bs-section">
              <button className={`bs-add-shortlist ${isFavorite ? 'bs-add-shortlist-active' : ''}`} onClick={onToggleFavorite}>
                <svg viewBox="0 0 24 24" fill={isFavorite ? '#EDE8DC' : 'none'} stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                {isFavorite ? 'Quitar de shortlist' : 'Agregar a shortlist'}
              </button>
            </div>
          )}

          {/* Ver original (con gate) — oculto en modo broker y en publicShare (cliente confía en el broker) */}
          {!brokerMode && !publicShareMode && p.url && (
            <div className="bs-section">
              {!showGate ? (
                <button className="bs-ver-original" onClick={handleVerOriginal}>
                  Ver anuncio original &#8599;
                </button>
              ) : (
                <div className="bs-gate">
                  <div className="bs-gate-title">Para ver el anuncio original, dejanos tus datos</div>
                  <input className="bs-gate-input" placeholder="Tu nombre" value={gateName} onChange={e => setGateName(e.target.value)} />
                  <input className="bs-gate-input" placeholder="Tu teléfono" value={gateTel} onChange={e => setGateTel(e.target.value)} type="tel" />
                  <input className="bs-gate-input" placeholder="Tu correo" value={gateEmail} onChange={e => setGateEmail(e.target.value)} type="email" />
                  <button className="bs-gate-submit" onClick={submitGate}
                    disabled={!gateName.trim() || !gateTel.trim() || !gateEmail.trim()}>Ver anuncio &#8599;</button>
                </div>
              )}
            </div>
          )}

          {/* En modo broker, mostrar link directo al anuncio original sin gate */}
          {brokerMode && p.url && (
            <div className="bs-section">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="bs-ver-original">
                Ver anuncio original en {p.fuente === 'century21' ? 'Century21' : 'Remax'} &#8599;
              </a>
            </div>
          )}

          {/* Sticky footer CTA */}
          <div className="bs-sticky-footer">
            {publicShareMode && publicShareBroker ? (
              <a href={`https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${publicShareBroker.nombre}, me interesa: ${p.proyecto} (${p.dormitorios === 0 ? 'Mono' : p.dormitorios + ' dorm'}, ${Math.round(p.area_m2)}m², $us ${Math.round(p.precio_usd).toLocaleString('en-US')}).`)}`}
                target="_blank" rel="noopener noreferrer" className="bs-wsp-cta">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Consultar por WhatsApp
              </a>
            ) : p.agente_telefono && (
              <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent((() => {
                const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
                const specs = `${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')}`

                // Modo broker: copy B2B (identificación + franquicia + pedido + link del anuncio)
                if (brokerMode && brokerInfo) {
                  const identidad = brokerInfo.inmobiliaria
                    ? `${brokerInfo.nombre} de ${brokerInfo.inmobiliaria}`
                    : `${brokerInfo.nombre}, broker independiente`
                  let msg = `Hola, soy ${identidad}. Trabajo en Equipetrol.\n\n`
                  msg += `Tengo un cliente interesado en ${p.proyecto} (${specs}).\n\n`
                  msg += `¿Sigue disponible?`
                  if (p.url) msg += `\n\nAnuncio: ${p.url}`
                  msg += `\n\nSi tenés alternativas parecidas, también me interesan.`
                  return msg
                }

                // Modo público (cliente final): copy original
                const selectedTexts = Array.from(selectedQs).sort().map(idx => brokerQuestions[idx]).filter(Boolean)
                let msg = `Hola, vi ${p.proyecto} en Simon y me gustaria mas informacion`
                if (selectedTexts.length > 0) msg += `\n\nAntes, me gustaria saber:\n${selectedTexts.map(t => `— ${t}`).join('\n')}`
                if (p.url) msg += '\n' + p.url
                return msg
              })())}`}
                target="_blank" rel="noopener noreferrer" className="bs-wsp-cta"
                onClick={() => trackEvent('click_whatsapp_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_usd), source: 'detail_sheet', questions_count: selectedQs.size })}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Whatsapp
              </a>
            )}
            {onShare && !brokerMode && (
              <button className="bs-share-btn" onClick={onShare}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                Compartir
              </button>
            )}
          </div>
      </div>
    </>
  )
}

// ===== Toast =====
function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null
  return <div className="ventas-toast">{message}</div>
}

// Devuelve un badge informativo según qué cambió desde que el broker armó la shortlist:
//
//   1. AGENTE cambió el precio en el portal (RAW cambió):
//        - bajó: verde "↓ Bajó de $us X" (oportunidad)
//        - subió: gris "Antes era $us X" (transparencia)
//
//   2. TC PARALELO se movió (RAW igual, pero NORMALIZADO cambió):
//        - subió: azul "↑ TC paralelo subió ~$us X"
//        - bajó: azul "↓ TC paralelo bajó ~$us X"
//
//   3. Sin cambios significativos (<1%) → null
//
// El cliente siempre ve `p.precio_usd` (NORMALIZADO actual). El badge agrega
// contexto sobre qué causó la diferencia con el precio que vio al recibir el link.
function priceChangeBadge(snap: { rawSnapshot: number | null; normSnapshot: number | null; rawActual: number | null } | null | undefined, normActual: number): { kind: 'agent-down' | 'agent-up' | 'tc-down' | 'tc-up'; label: string } | null {
  if (!snap) return null
  const { rawSnapshot, normSnapshot, rawActual } = snap
  if (!rawSnapshot || !rawActual || !normSnapshot || rawSnapshot <= 0 || normSnapshot <= 0) return null
  const fmt = (n: number) => '$us ' + Math.round(n).toLocaleString('en-US')
  // Para el caso TC paralelo (estimativo, ya tiene "~"): redondeo a magnitud legible.
  // Evita números falsa-precisos tipo "$us 48,325" que se leen como cuarenta y ocho mil trescientos veinticinco.
  const fmtAprox = (n: number): string => {
    const abs = Math.round(n)
    if (abs >= 10000) return '$us ' + Math.round(abs / 1000) + 'k'
    if (abs >= 1000) {
      const k = abs / 1000
      return '$us ' + (Math.round(k * 10) / 10).toFixed(k % 1 === 0 ? 0 : 1) + 'k'
    }
    return '$us ' + abs.toLocaleString('en-US')
  }

  // Caso 1: el agente cambió el precio (RAW se movió) — precisión real del portal
  const rawDiff = rawActual - rawSnapshot
  const rawPct = Math.abs(rawDiff) / rawSnapshot
  if (rawPct >= 0.01) {
    if (rawDiff < 0) return { kind: 'agent-down', label: `↓ Bajó de ${fmt(normSnapshot)}` }
    return { kind: 'agent-up', label: `Antes era ${fmt(normSnapshot)}` }
  }

  // Caso 2: RAW estable pero NORMALIZADO cambió → fue movimiento del TC paralelo (aproximado)
  const normDiff = normActual - normSnapshot
  const normPct = Math.abs(normDiff) / normSnapshot
  if (normPct >= 0.01) {
    const absDiff = Math.abs(normDiff)
    if (normDiff < 0) return { kind: 'tc-down', label: `↓ TC paralelo bajó · ~${fmtAprox(absDiff)}` }
    return { kind: 'tc-up', label: `↑ TC paralelo subió · ~${fmtAprox(absDiff)}` }
  }

  return null
}

// Mensaje WhatsApp del cliente del shortlist DIRIGIDO AL BROKER (no al agente del listing).
// Usado en /b/[hash] para botones "Consultar por WA" en card o sheet.
function buildClientToBrokerMessage(p: UnidadVenta, brokerName: string): string {
  const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
  return `Hola ${brokerName}, me interesa esta propiedad:\n\n${p.proyecto} (${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')})\n\n¿Podemos coordinar?`
}

// Mensaje WhatsApp del cliente al broker con LISTA de propiedades de interés.
// Usado en CompareSheet (publicShareMode) cuando el cliente comparó 2+ y quiere consultar.
function buildClientShortlistInterestMessage(props: UnidadVenta[], brokerName: string): string {
  const lines = props.map(p => {
    const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
    return `• ${p.proyecto} (${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')})`
  }).join('\n')
  return `Hola ${brokerName}, estoy interesado en estas alternativas:\n\n${lines}\n\n¿Podemos coordinar?`
}

// Mensaje WhatsApp dirigido al agente del listing.
// Si viene `brokerInfo` (estamos en /broker/[slug]) → copy B2B con identificación,
// franquicia/independiente y link del anuncio. Si no, copy estándar de cliente final.
function buildAgentWaMessage(p: UnidadVenta, brokerInfo: { nombre: string; inmobiliaria?: string | null } | null): string {
  if (brokerInfo) {
    const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
    const specs = `${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')}`
    const identidad = brokerInfo.inmobiliaria
      ? `${brokerInfo.nombre} de ${brokerInfo.inmobiliaria}`
      : `${brokerInfo.nombre}, broker independiente`
    let msg = `Hola, soy ${identidad}. Trabajo en Equipetrol.\n\n`
    msg += `Tengo un cliente interesado en ${p.proyecto} (${specs}).\n\n`
    msg += `¿Sigue disponible?`
    if (p.url) msg += `\n\nAnuncio: ${p.url}`
    msg += `\n\nSi tenés alternativas parecidas, también me interesan.`
    return msg
  }
  // Modo público: copy original
  return `Hola, vi ${p.proyecto} en Simon y me gustaría más información${p.url ? '\n' + p.url : ''}`
}

// Badge de la inmobiliaria de origen (solo visible al broker para identificar
// rápidamente qué portal listea cada propiedad). Colores institucionales:
//  - Century 21: dorado característico
//  - RE/MAX: rojo + azul (uso rojo)
//  - Bien Inmuebles: azul corporativo (no aparece en venta hoy, queda preparado)
function fuenteBadge(fuente: string | null | undefined): { label: string; color: string; bg: string } | null {
  if (!fuente) return null
  const f = fuente.toLowerCase()
  if (f === 'century21' || f === 'c21') return { label: 'Century 21', color: '#000', bg: '#BEAF87' }
  if (f === 'remax') return { label: 'RE/MAX', color: '#fff', bg: '#DC1C2E' }
  if (f === 'bien_inmuebles' || f === 'bieninmuebles') return { label: 'Bien Inmuebles', color: '#fff', bg: '#1a4980' }
  return null
}

// Public share: cuando /b/[hash] reusa este feed, pasa este prop para
// (a) saltar fetch (la lista viene curada), (b) ocultar filtros/sidebar/spotlight/mapa,
// (c) ocultar gate/preguntas/WA agente del sheet, (d) mostrar header con datos del broker.
export interface PublicShareData {
  hash: string
  broker: { slug: string; nombre: string; telefono: string; foto_url: string | null; inmobiliaria?: string | null }
  items: UnidadVenta[]
  itemComments?: Record<number, string | null>
  // Snapshot de precio (migraciones 229 + 230). Para cada propiedad:
  //  - rawSnapshot: precio_usd RAW al armar (propiedades_v2.precio_usd) — detecta cambio del agente
  //  - normSnapshot: precio NORMALIZADO al armar (v_mercado_venta.precio_usd) — para mostrar "Antes era $X"
  //  - rawActual: precio_usd RAW actual — comparar contra rawSnapshot
  // Lógica del badge: si abs(rawActual - rawSnapshot)/rawSnapshot > 1% → cambio del agente → mostrar badge
  // Si solo cambió el normalizado pero no el raw, fue movimiento de TC → no mostrar.
  priceSnapshots?: Record<number, { rawSnapshot: number | null; normSnapshot: number | null; rawActual: number | null }>
  // IDs que el cliente ya marcó con corazón (migración 234). Hidrata favorites
  // al montar en lugar de localStorage.
  initialHearts?: number[]
}

// ===== Page =====
export default function VentasPage({ seo, initialProperties = [], brokerSlug: brokerSlugProp = null, broker: brokerProp = null, publicShare = null }: { seo: VentasSEO; initialProperties: UnidadVenta[]; brokerSlug?: string | null; broker?: Broker | null; publicShare?: PublicShareData | null }) {
  const publicShareMode = publicShare !== null
  const publicShareBrokerProp: { nombre: string; telefono: string; foto_url: string | null; slug: string } | null = publicShare ? publicShare.broker : null
  const priceSnapshotsMap: Record<number, { rawSnapshot: number | null; normSnapshot: number | null; rawActual: number | null }> | null = publicShare && publicShare.priceSnapshots ? publicShare.priceSnapshots : null
  const initialProps = publicShareMode ? publicShare!.items : initialProperties
  const [properties, setProperties] = useState<UnidadVenta[]>(initialProps)
  const [loading, setLoading] = useState(publicShareMode ? false : initialProperties.length === 0)
  const [loadError, setLoadError] = useState(false)
  const [filters, setFilters] = useState<FiltrosVentaSimple>({ orden: 'recientes' })
  const [isFiltered, setIsFiltered] = useState(false)
  const [totalCount, setTotalCount] = useState(initialProps.length)
  const [unfilteredCount, setUnfilteredCount] = useState(initialProps.length)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const [compareOpen, setCompareOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  // PhotoViewer state
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)
  const [viewerName, setViewerName] = useState('')
  const [viewerSubtitle, setViewerSubtitle] = useState('')
  // Bottom Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetProperty, setSheetProperty] = useState<UnidadVenta | null>(null)
  const [gateCompleted, setGateCompleted] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid')
  const [mobileMapOpen, setMobileMapOpen] = useState(false)
  const [mapSelectedId, setMapSelectedId] = useState<number | null>(null)
  const [proyectoNames, setProyectoNames] = useState<string[]>(() => [...new Set(initialProps.map(p => p.proyecto).filter(Boolean))].sort())
  const [filterOverlayOpen, setFilterOverlayOpen] = useState(false)
  // Filter nudge pill (show once per session after 6+ cards without interaction)
  const [nudgeVisible, setNudgeVisible] = useState(false)
  const nudgeDismissedRef = useRef(false)
  const hasOpenedDetailRef = useRef(false)
  const isFilteredRef = useRef(false)
  // Spotlight
  const [spotlightId, setSpotlightId] = useState<number | null>(null)
  const [fetchedSpotlight, setFetchedSpotlight] = useState<UnidadVenta | null>(null)
  const isDesktop = useIsDesktop()
  const router = useRouter()
  const fetchGenRef = useRef(0)
  const feedRef = useRef<HTMLDivElement>(null)

  // Modo broker: activo cuando la pagina /broker/[slug] renderiza VentasPage
  // con broker como prop (inyectado desde getStaticProps → lib/simon-brokers).
  const brokerSlug = brokerSlugProp
  const broker = brokerProp
  const brokerMode = broker !== null
  const brokerInfoProp: { nombre: string; inmobiliaria?: string | null } | null = broker ? { nombre: broker.nombre, inmobiliaria: broker.inmobiliaria } : null

  // S2: shortlists del broker — selección actual = `favorites`, persistencia y envío via hook
  const brokerShortlists = useBrokerShortlists(broker)
  const [shortlistModalOpen, setShortlistModalOpen] = useState(false)
  const [shortlistsPanelOpen, setShortlistsPanelOpen] = useState(false)
  // Filtro broker: ver solo propiedades marcadas (útil cuando hay muchas + filtros cambiados)
  const [onlySelectedFilter, setOnlySelectedFilter] = useState(false)

  // publicShareMode O brokerMode mobile: el body tiene overflow:hidden por la media
  // query del feed TikTok. Cuando forzamos layout desktop-grid en mobile, hay que
  // restaurar overflow:auto para que scroll funcione.
  const needsBodyScroll = publicShareMode || (brokerMode && !isDesktop)
  useEffect(() => {
    if (!needsBodyScroll) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'auto'
    document.documentElement.style.overflow = 'auto'
    return () => {
      document.body.style.overflow = prev
      document.documentElement.style.overflow = ''
    }
  }, [needsBodyScroll])

  // Keep isFilteredRef in sync for scroll handler (avoids stale closure)
  useEffect(() => { isFilteredRef.current = isFiltered }, [isFiltered])

  // Check gate status from localStorage
  useEffect(() => {
    try { if (localStorage.getItem('ventas_gate_v1')) setGateCompleted(true) } catch {}
  }, [])

  // Deep-link: parse ?edificio= from URL → pre-apply building filter
  useEffect(() => {
    const edificioParam = router.query.edificio
    if (edificioParam && typeof edificioParam === 'string') {
      const f = buildFilters(MIN_PRICE, MAX_PRICE, new Set(), new Set(), '', 'recientes', edificioParam)
      setFilters(f)
      setIsFiltered(true)
      fetchProperties(f)
    }
  }, [router.query.edificio]) // eslint-disable-line react-hooks/exhaustive-deps

  // Spotlight: parse ?id= from URL
  useEffect(() => {
    const idParam = router.query.id
    if (idParam && typeof idParam === 'string') {
      const parsed = parseInt(idParam, 10)
      if (!isNaN(parsed)) setSpotlightId(parsed)
    }
  }, [router.query.id])

  // Spotlight: fetch if not in properties
  useEffect(() => {
    if (!spotlightId) { setFetchedSpotlight(null); return }
    if (properties.find(p => p.id === spotlightId)) return
    let cancelled = false
    fetchFromAPI({ solo_con_fotos: false }, spotlightId).then(({ spotlight }) => {
      if (!cancelled && spotlight) setFetchedSpotlight(spotlight as UnidadVenta)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [spotlightId, properties.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const spotlightProperty = useMemo(() => {
    if (!spotlightId) return null
    return properties.find(p => p.id === spotlightId) || fetchedSpotlight || null
  }, [spotlightId, properties, fetchedSpotlight])

  function showToast(msg: string) { setToastMsg(msg); setToastVisible(true); setTimeout(() => setToastVisible(false), 2500) }

  function openViewer(p: UnidadVenta, photoIdx: number) {
    if (!p.fotos_urls?.length) return
    setViewerPhotos(p.fotos_urls)
    setViewerIndex(photoIdx)
    setViewerName(p.proyecto)
    setViewerSubtitle(`${displayZona(p.zona)} · ${Math.round(p.area_m2)}m² · ${p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`} · $us ${Math.round(p.precio_usd).toLocaleString('en-US')}`)
    setViewerOpen(true)
    trackEvent('view_photos_venta', { property_id: p.id, property_name: p.proyecto, fotos_count: p.fotos_urls.length })
  }

  function dismissNudge() {
    setNudgeVisible(false)
    trackEvent('nudge_filter_dismiss_venta')
  }

  function tapNudge() {
    setNudgeVisible(false)
    trackEvent('nudge_filter_tap_venta')
    setFilterOverlayOpen(true)
  }

  function openSheet(p: UnidadVenta) {
    hasOpenedDetailRef.current = true
    setSheetProperty(p)
    setSheetOpen(true)
    trackEvent('open_detail_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_usd) })
  }

  function handleGate(nombre: string, telefono: string, correo: string, url: string) {
    try { localStorage.setItem('ventas_gate_v1', JSON.stringify({ nombre, telefono, correo, ts: new Date().toISOString() })) } catch {}
    setGateCompleted(true)
    window.open(url, '_blank')
    trackEvent('lead_gate_venta', { property_id: sheetProperty?.id, property_name: sheetProperty?.proyecto, zona: sheetProperty?.zona ? displayZona(sheetProperty.zona) : undefined })
    // Fire and forget — save lead to DB
    const prop = sheetProperty
    fetch('/api/lead-gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre, telefono, correo, origen: 'ventas',
        propiedad_id: prop?.id, propiedad_nombre: prop?.proyecto, zona: prop?.zona,
      }),
    }).catch(() => {})
  }
  function toggleFavorite(id: number) {
    const isFav = favorites.has(id)
    // Límite de 3 solo aplica al modo público estándar. Ni brokerMode ni
    // publicShareMode aplican el cap: broker arma shortlists amplias, cliente
    // marca corazones como feedback sin tope.
    if (!brokerMode && !publicShareMode && !isFav && favorites.size >= MAX_FAVORITES) {
      showToast(`Maximo ${MAX_FAVORITES} favoritos`)
      return
    }
    trackEvent('toggle_favorite_venta', { property_id: id, action: isFav ? 'remove' : 'add', total_favs: isFav ? favorites.size - 1 : favorites.size + 1 })
    setFavorites(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    // Feedback al broker: en publicShareMode persistir heart en BD (optimistic).
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
      showToast(brokerMode ? 'Quitado de la selección' : 'Quitado de favoritos')
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
  // Lista que se muestra: si filtro broker "solo seleccionadas" está ON,
  // restringe a las marcadas. Útil para no perderse cuando hay 30+ marcadas.
  const displayedProperties = useMemo(
    () => (brokerMode && onlySelectedFilter) ? properties.filter(p => favorites.has(p.id)) : properties,
    [brokerMode, onlySelectedFilter, properties, favorites]
  )
  const visibleNotMarked = useMemo(
    () => brokerMode ? properties.filter(p => !favorites.has(p.id)) : [],
    [brokerMode, properties, favorites]
  )
  function markAllVisible() {
    if (visibleNotMarked.length === 0) return
    trackEvent('broker_mark_all_visible', { count: visibleNotMarked.length, broker_slug: broker?.slug })
    setFavorites(prev => {
      const n = new Set(prev)
      for (const p of properties) n.add(p.id)
      return n
    })
    showToast(`${visibleNotMarked.length} propiedad${visibleNotMarked.length === 1 ? '' : 'es'} agregada${visibleNotMarked.length === 1 ? '' : 's'}`)
  }
  function shareProperty(p: UnidadVenta) {
    // En publicShareMode, el link queda dentro del shortlist del broker para no
    // "filtrar" el lead a simonbo.com/ventas. En modo público o broker usamos /ventas.
    const baseUrl = publicShareMode
      ? `${window.location.origin}${window.location.pathname}`
      : `${window.location.origin}/ventas`
    const url = `${baseUrl}?id=${p.id}`
    const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
    const text = `Mirá esta propiedad: ${p.proyecto} (${dorms}, ${Math.round(p.area_m2)}m², $us ${Math.round(p.precio_usd).toLocaleString('en-US')})`

    trackEvent('share_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona), source: publicShareMode ? 'public_share' : 'feed' })

    // En publicShareMode (cliente del broker), abrir WhatsApp directo: el user
    // elige a quién mandar al momento. Más confiable que Web Share API que
    // suele fallar en desktop sin apps configuradas.
    if (publicShareMode) {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text + '\n\n' + url)}`
      window.open(waUrl, '_blank', 'noopener,noreferrer')
      return
    }

    // En feed público: Web Share API si está, fallback a copy
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      navigator.share({ title: p.proyecto, text, url }).catch(() => {
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => showToast('Link copiado'))
      })
      return
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast('Link copiado')).catch(() => showToast('No se pudo copiar'))
    } else {
      window.prompt('Copiá el link:', url)
    }
  }
  function addToShortlist(p: UnidadVenta) {
    // S2: el botón ⭐/Agregar a shortlist alterna favorite. La "selección actual" del
    // broker para mandar al cliente = el set de favoritos. Al confirmar el envío,
    // se crea la shortlist en BD y se limpian los favoritos.
    trackEvent('broker_add_to_shortlist', { property_id: p.id, broker_slug: broker?.slug })
    toggleFavorite(p.id)
  }
  async function handleSendShortlist(data: { cliente_nombre: string; cliente_telefono: string; mensaje_whatsapp?: string }) {
    if (!broker) throw new Error('Broker no resuelto')
    const propiedad_ids = Array.from(favorites)
    if (propiedad_ids.length === 0) throw new Error('No hay propiedades seleccionadas')
    trackEvent('broker_send_shortlist', { broker_slug: broker.slug, count: propiedad_ids.length })
    const { whatsappUrl } = await brokerShortlists.createAndSend({ ...data, propiedad_ids })
    setFavorites(new Set())
    showToast('Shortlist enviada')
    return { whatsappUrl }
  }
  function openCompare() {
    trackEvent('open_compare_venta', { property_ids: Array.from(favorites).join(','), count: favorites.size })
    setCompareOpen(true)
  }

  const favoriteProperties = useMemo(() => {
    return properties.filter(p => favorites.has(p.id))
  }, [properties, favorites])

  const activeFilterCount = useMemo(() => {
    let c = 0
    if (filters.zonas_permitidas?.length) c += filters.zonas_permitidas.length
    if (filters.precio_min && filters.precio_min > MIN_PRICE) c++
    if (filters.precio_max && filters.precio_max < MAX_PRICE) c++
    if (filters.dormitorios_lista?.length) c++
    if (filters.estado_entrega) c++
    return c
  }, [filters])

  // Search pill summary text
  const searchPillText = useMemo(() => {
    if (!isFiltered) return 'Comienza tu búsqueda'
    const parts: string[] = []
    if (filters.zonas_permitidas?.length) {
      const zonas = filters.zonas_permitidas.map(z => {
        const found = ZONAS_CANONICAS.find(zc => zc.db === z)
        return found ? found.labelCorto : z
      })
      parts.push(zonas.join(', '))
    }
    if (filters.dormitorios_lista?.length) {
      const d = filters.dormitorios_lista
      parts.push(d.map(x => x === 0 ? 'Mono' : x === 3 ? '3+' : `${x}d`).join(','))
    }
    if (filters.precio_max && filters.precio_max < MAX_PRICE) parts.push(`<${formatPriceK(filters.precio_max)}`)
    return parts.length > 0 ? parts.join(' · ') : `${activeFilterCount} filtros`
  }, [isFiltered, filters, activeFilterCount])

  // Persist favorites
  // Hidratar favorites: publicShareMode desde BD (initialHearts), los demás desde localStorage.
  useEffect(() => {
    if (publicShareMode) {
      const hearts = publicShare?.initialHearts
      if (hearts && hearts.length > 0) setFavorites(new Set(hearts))
      return
    }
    try { const s = localStorage.getItem('ventas_favorites_v1'); if (s) setFavorites(new Set(JSON.parse(s))) } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (publicShareMode) return // persistencia va por BD en toggleFavorite
    if (favorites.size > 0) localStorage.setItem('ventas_favorites_v1', JSON.stringify([...favorites]))
  }, [favorites, publicShareMode])

  // Scroll tracking (mobile TikTok)
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
        // Filter nudge: show once after 6+ cards without detail/filter interaction
        if (idx >= 6 && !nudgeDismissedRef.current && !hasOpenedDetailRef.current && !isFilteredRef.current) {
          nudgeDismissedRef.current = true
          setNudgeVisible(true)
          trackEvent('nudge_filter_shown_venta', { card_index: idx })
          setTimeout(() => setNudgeVisible(false), 5000)
        }
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isDesktop, loading])

  // Fetch
  const fetchProperties = useCallback(async (f?: FiltrosVentaSimple) => {
    const gen = ++fetchGenRef.current
    setLoading(true); setLoadError(false)
    try {
      const result = await fetchFromAPI(f || filters)
      if (gen !== fetchGenRef.current) return 0
      setProperties(result.data); setTotalCount(result.total)
      if (!f || Object.keys(f).length === 0) {
        setUnfilteredCount(result.total)
        setProyectoNames([...new Set(result.data.map(p => p.proyecto).filter(Boolean))].sort())
      }
      return result.total
    } catch (err) {
      if (gen !== fetchGenRef.current) return 0
      console.error('Error fetching ventas:', err); setLoadError(true); return 0
    } finally { if (gen === fetchGenRef.current) setLoading(false) }
  }, [filters])

  // Only fetch on mount if no SSG data (fallback) or if spotlight needs fetching
  useEffect(() => { if (publicShareMode) return; if (initialProperties.length === 0 || spotlightId) fetchProperties() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function applyFilters(newFilters: FiltrosVentaSimple) {
    setFilters(newFilters); setIsFiltered(true)
    const count = await fetchProperties(newFilters)
    trackEvent('apply_filters_venta', {
      zonas: newFilters.zonas_permitidas?.join(',') || 'todas',
      dorms: newFilters.dormitorios_lista?.join(',') || 'todos',
      precio_min: newFilters.precio_min,
      precio_max: newFilters.precio_max,
      estado_entrega: newFilters.estado_entrega || 'todo',
      total_results: count
    })
    if (count === 0) trackEvent('no_results_venta', { zonas: newFilters.zonas_permitidas?.join(','), dorms: newFilters.dormitorios_lista?.join(',') })
    showToast(`${count} departamentos encontrados`)
    if (feedRef.current) feedRef.current.scrollTo({ top: 0 })
    setActiveCardIndex(0)
  }
  async function resetFilters() {
    const defaults: FiltrosVentaSimple = {}
    setFilters(defaults); setIsFiltered(false)
    const count = await fetchProperties(defaults)
    showToast(`${count} departamentos · sin filtros`)
    if (feedRef.current) feedRef.current.scrollTo({ top: 0 })
    setActiveCardIndex(0)
  }

  // Build feed items (mobile): spotlight first, then property cards (filter card removed — now overlay)
  const feedItems = useMemo(() => {
    const items: Array<{ type: 'property'; data: UnidadVenta; isSpotlight?: boolean }> = []
    const baseList = (brokerMode && onlySelectedFilter)
      ? properties.filter(p => favorites.has(p.id))
      : properties
    const mobileProps = spotlightProperty
      ? [spotlightProperty, ...baseList.filter(p => p.id !== spotlightId)]
      : baseList
    mobileProps.forEach((p, i) => {
      items.push({ type: 'property', data: p, isSpotlight: i === 0 && !!spotlightProperty })
    })
    return items
  }, [properties, favorites, brokerMode, onlySelectedFilter, spotlightProperty, spotlightId])

  return (
    <>
      <VentasHead
        seo={seo}
        brokerSlug={brokerSlug}
        publicShareHash={publicShare?.hash ?? null}
      />

      <Toast message={toastMsg} visible={toastVisible} />

      {/* PhotoViewer */}
      {viewerOpen && (
        <PhotoViewer photos={viewerPhotos} initialIndex={viewerIndex}
          buildingName={viewerName} subtitle={viewerSubtitle}
          onClose={() => setViewerOpen(false)} />
      )}

      {/* Bottom Sheet */}
      <BottomSheet property={sheetProperty} isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setSheetProperty(null) }}
        onShare={sheetProperty ? () => shareProperty(sheetProperty) : undefined}
        isFavorite={sheetProperty ? favorites.has(sheetProperty.id) : false}
        onToggleFavorite={(sheetProperty && !publicShareMode) ? () => toggleFavorite(sheetProperty.id) : undefined}
        gateCompleted={gateCompleted} onGate={handleGate} isDesktop={isDesktop}
        properties={properties} onSwapProperty={(p) => setSheetProperty(p)}
        brokerMode={brokerMode}
        onAddToShortlist={addToShortlist}
        publicShareBroker={publicShareBrokerProp}
        brokerInfo={brokerInfoProp} />

      {/* Banner inferior — modo broker: Enviar shortlist (1+) | público: Comparar (2+) */}
      {brokerMode && broker && favorites.size >= 1 && (
        <div className="vt-compare-banner-wrap vt-shortlist-banner-wrap">
          <button className="vt-compare-banner vt-shortlist-banner" onClick={() => setShortlistModalOpen(true)}>
            <span className="vt-compare-banner-text">Enviar shortlist · {favorites.size} {favorites.size === 1 ? 'propiedad' : 'propiedades'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16}}><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
          <button className="vt-compare-banner-clear" aria-label="Limpiar selección" onClick={(e) => { e.stopPropagation(); setFavorites(new Set()); showToast('Selección limpiada') }}>&times;</button>
        </div>
      )}
      {!brokerMode && favorites.size >= 2 && (
        <div className="vt-compare-banner-wrap">
          <button className="vt-compare-banner" onClick={openCompare}>
            <span className="vt-compare-banner-text">{favorites.size} favorito{favorites.size > 1 ? 's' : ''} · Comparar</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16}}><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button className="vt-compare-banner-clear" aria-label="Limpiar favoritos" onClick={(e) => { e.stopPropagation(); setFavorites(new Set()); showToast('Favoritos limpiados') }}>&times;</button>
        </div>
      )}

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

      {/* CompareSheet */}
      <CompareSheet
        open={compareOpen}
        properties={favoriteProperties}
        onClose={() => setCompareOpen(false)}
        publicShareBroker={publicShareBrokerProp}
      />

      {/* Banner modo broker — visible arriba de todo cuando activo */}
      {brokerMode && broker && (
        <div className="vt-broker-banner">
          <div className="vt-broker-banner-brand">
            <span className="vt-broker-banner-logo">SIMON</span>
            <span className="vt-broker-banner-divider">·</span>
            <span className="vt-broker-banner-label">BROKER</span>
            <span className="vt-broker-banner-name">{broker.nombre}</span>
          </div>
          <div className="vt-broker-tabs" role="tablist" aria-label="Tipo de operación">
            <button className="vt-broker-tab active" role="tab" aria-selected="true" disabled>Ventas</button>
            <Link href={`/broker/${broker.slug}/alquileres`} className="vt-broker-tab" role="tab" aria-selected="false">
              Alquileres
            </Link>
          </div>
          {properties.length > 0 && (
            <div className="vt-broker-viewmode" role="tablist" aria-label="Modo de vista">
              <button
                className={`vt-broker-vm-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => { setViewMode('grid'); trackEvent('switch_view_venta', { view_mode: 'grid', source: 'broker_banner' }) }}
                aria-label="Ver lista" role="tab" aria-selected={viewMode === 'grid'}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </button>
              <button
                className={`vt-broker-vm-btn ${viewMode === 'map' ? 'active' : ''}`}
                onClick={() => { setViewMode('map'); trackEvent('switch_view_venta', { view_mode: 'map', source: 'broker_banner' }) }}
                aria-label="Ver mapa" role="tab" aria-selected={viewMode === 'map'}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </button>
            </div>
          )}
          <button
            className="vt-broker-tool"
            onClick={() => { setFilterOverlayOpen(true); trackEvent('open_filter_overlay_venta', { source: 'broker_banner' }) }}
            title="Filtrar propiedades"
          >
            ⚙ Filtros{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </button>
          {favorites.size > 0 && (
            <button
              className={`vt-broker-tool ${onlySelectedFilter ? 'active' : ''}`}
              onClick={() => setOnlySelectedFilter(v => !v)}
              title={onlySelectedFilter ? 'Mostrar todas las propiedades' : 'Ver solo las propiedades marcadas'}
            >
              ★ Solo seleccionadas · {favorites.size}
            </button>
          )}
          {!onlySelectedFilter && visibleNotMarked.length > 0 && properties.length < 100 && (
            <button
              className="vt-broker-tool vt-broker-tool-add"
              onClick={markAllVisible}
              title="Agregar todas las propiedades visibles a la selección"
            >
              + Marcar las {visibleNotMarked.length} visibles
            </button>
          )}
          <button className="vt-broker-banner-shortlists" onClick={() => setShortlistsPanelOpen(true)}>
            Mis shortlists{brokerShortlists.shortlists.length > 0 ? ` · ${brokerShortlists.shortlists.length}` : ''}
          </button>
          <a
            className="vt-broker-tool vt-broker-market-link"
            href="/mercado/equipetrol"
            target="_blank"
            rel="noopener"
            onClick={() => trackEvent('broker_open_mercado', { broker_slug: broker?.slug })}
            title="Abrir dashboard de mercado de Equipetrol en pestaña nueva"
          >
            Ver mercado <span aria-hidden="true" className="vt-broker-market-arrow">↗</span>
          </a>
        </div>
      )}

      {/* FAB mapa en publicShareMode mobile — el toggle Grid|Mapa text se pierde con scroll */}
      {publicShareMode && !isDesktop && viewMode === 'grid' && properties.length > 0 && (
        <button
          className="vt-public-map-fab"
          onClick={() => setViewMode('map')}
          aria-label="Ver mapa"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          Mapa
        </button>
      )}

      {/* Header modo public share — header del broker que comparte la shortlist */}
      {publicShareMode && publicShare && (
        <div className="vt-public-share-header">
          <div className="vpsh-broker">
            {publicShare.broker.foto_url
              ? <img src={publicShare.broker.foto_url} alt={publicShare.broker.nombre} className="vpsh-broker-photo" />
              : <div className="vpsh-broker-photo vpsh-broker-photo-ph">{publicShare.broker.nombre.charAt(0)}</div>}
            <div className="vpsh-broker-info">
              <div className="vpsh-broker-label">Selección de</div>
              <div className="vpsh-broker-name">{publicShare.broker.nombre}</div>
              {publicShare.broker.inmobiliaria && (
                <div className="vpsh-broker-agency">{publicShare.broker.inmobiliaria}</div>
              )}
            </div>
          </div>
          <a
            href={(() => {
              const hearted = properties.filter(p => favorites.has(p.id))
              if (hearted.length > 0) {
                const lines = hearted.map(p => {
                  const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
                  return `• ${p.proyecto} (${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')})`
                }).join('\n')
                const plural = hearted.length === 1 ? 'esta' : 'estas'
                const noun = hearted.length === 1 ? 'propiedad' : `${hearted.length} propiedades`
                const msg = `Hola ${publicShare.broker.nombre}, me interesa${hearted.length === 1 ? '' : 'n'} ${plural} ${noun}:\n\n${lines}\n\n¿Podemos coordinar?`
                return `https://wa.me/${publicShare.broker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`
              }
              return `https://wa.me/${publicShare.broker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${publicShare.broker.nombre}, vi las propiedades que me enviaste.`)}`
            })()}
            target="_blank" rel="noopener noreferrer" className="vpsh-wa"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            WhatsApp
          </a>
        </div>
      )}

      {/* Filter overlay — montado siempre (lo dispara el search pill mobile o el chip Filtros del broker mobile) */}
      <FilterOverlay isOpen={filterOverlayOpen} onClose={() => setFilterOverlayOpen(false)}
        totalCount={unfilteredCount || totalCount} filteredCount={properties.length}
        isFiltered={isFiltered} onApply={applyFilters} onReset={resetFilters} proyectoNames={proyectoNames} />

      {(isDesktop || publicShareMode || brokerMode) ? (
        /* ===== DESKTOP (o public share / broker en cualquier device — feed con grid simple) ===== */
        <div className={`ventas-desktop ${publicShareMode ? 'ventas-desktop-public' : ''} ${(brokerMode && !isDesktop) ? 'ventas-desktop-broker-mobile' : ''} ${brokerMode ? 'ventas-desktop-broker' : ''}`}>
          {!publicShareMode && !(brokerMode && !isDesktop) && (
            <aside className="ventas-sidebar">
              <div className="ventas-sidebar-header">
                <Link href="/landing-v2" className="ventas-logo">Simon</Link>
                <div className="ventas-label">VENTAS</div>
              </div>
              <div className="ventas-sidebar-count">
                <span className="ventas-count-num">{properties.length}</span>
                <span className="ventas-count-text">{isFiltered ? `de ${unfilteredCount} departamentos` : 'departamentos en Equipetrol'}</span>
              </div>
              <DesktopFilters currentFilters={filters} isFiltered={isFiltered} onApply={applyFilters} onReset={resetFilters} proyectoNames={proyectoNames} />
            </aside>
          )}
          <main className="ventas-main">
            {/* View mode toggle — oculto en publicShareMode mobile (FAB) y en brokerMode (banner verde) */}
            {properties.length > 0 && !(publicShareMode && !isDesktop) && !brokerMode && (
              <div className="vm-toggle">
                <button className={`vm-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => { setViewMode('grid'); trackEvent('switch_view_venta', { view_mode: 'grid' }) }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  Grid
                </button>
                <button className={`vm-btn ${viewMode === 'map' ? 'active' : ''}`} onClick={() => { setViewMode('map'); trackEvent('switch_view_venta', { view_mode: 'map' }) }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Mapa
                </button>
              </div>
            )}
            {loadError && <div className="ventas-status"><p>No se pudo cargar.</p><button onClick={() => fetchProperties()}>Reintentar</button></div>}
            {loading && properties.length === 0 && !loadError && <div className="ventas-status">Cargando departamentos en venta...</div>}
            {!loading && properties.length === 0 && !loadError && <div className="ventas-status">{buildEmptyMessage(filters)}</div>}
            {/* Desktop spotlight — visible también en publicShareMode (link compartido /b/[hash]?id=X) */}
            {spotlightProperty && (
              <div className="ds-spotlight">
                <div className="ds-spotlight-banner">
                  <span>Te compartieron este departamento</span>
                  <button className="ds-spotlight-close" aria-label="Cerrar destacado" onClick={() => setSpotlightId(null)}>&times;</button>
                </div>
                <VentaCard property={spotlightProperty} isFavorite={favorites.has(spotlightProperty.id)}
                  onToggleFavorite={() => toggleFavorite(spotlightProperty.id)} onShare={() => shareProperty(spotlightProperty)}
                  onPhotoTap={() => openSheet(spotlightProperty)} onDetails={() => openSheet(spotlightProperty)}
                  brokerMode={brokerMode} onAddToShortlist={() => addToShortlist(spotlightProperty)} publicShareMode={publicShareMode} brokerInfo={brokerInfoProp} publicShareBroker={publicShareBrokerProp} priceSnapshot={priceSnapshotsMap ? priceSnapshotsMap[spotlightProperty.id] : null} />
                <div className="ds-spotlight-sep">
                  <span className="ds-spotlight-line" /><span className="ds-spotlight-text">Explorar más departamentos</span><span className="ds-spotlight-line" />
                </div>
              </div>
            )}
            {displayedProperties.length > 0 && viewMode === 'grid' && (
              <div className="ventas-grid">
                {(spotlightProperty ? displayedProperties.filter(p => p.id !== spotlightId) : displayedProperties).map((p, idx) => (
                  <VentaCard key={p.id} property={p} isFavorite={favorites.has(p.id)} isFirst={idx === 0}
                    onToggleFavorite={() => toggleFavorite(p.id)} onShare={() => shareProperty(p)}
                    onPhotoTap={() => openSheet(p)} onDetails={() => openSheet(p)}
                    brokerMode={brokerMode} onAddToShortlist={() => addToShortlist(p)} publicShareMode={publicShareMode} brokerInfo={brokerInfoProp} publicShareBroker={publicShareBrokerProp} priceSnapshot={priceSnapshotsMap ? priceSnapshotsMap[p.id] : null} />
                ))}
              </div>
            )}
            {brokerMode && onlySelectedFilter && displayedProperties.length === 0 && (
              <div className="ventas-status">No hay propiedades marcadas que cumplan los filtros actuales.</div>
            )}
            {properties.length > 0 && viewMode === 'map' && (
              <div className="ventas-map-container">
                <VentaMap properties={properties} onSelectProperty={(id) => setMapSelectedId(id)} selectedId={mapSelectedId} />
                {mapSelectedId && (() => {
                  const sp = properties.find(x => x.id === mapSelectedId)
                  if (!sp) return null
                  return <MapFloatCard property={sp} isFavorite={favorites.has(sp.id)} onClose={() => setMapSelectedId(null)} onOpenDetail={() => { setMapSelectedId(null); openSheet(sp) }} onToggleFavorite={() => toggleFavorite(sp.id)} mobile={!isDesktop || publicShareMode} />
                })()}
                <button className="vt-back-to-grid" onClick={() => { setViewMode('grid'); setMapSelectedId(null) }} aria-label="Volver a la lista">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}><path d="M15 18l-6-6 6-6"/></svg>
                  Volver a la lista
                </button>
              </div>
            )}
          </main>
        </div>
      ) : (
        /* ===== MOBILE TIKTOK FEED ===== */
        <main>
          {/* Top bar — search pill (Airbnb/TikTok style) */}
          <div className="mt-top-bar">
            <button className="mt-search-pill" onClick={() => { setFilterOverlayOpen(true); trackEvent('open_filter_overlay_venta') }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.8}}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <span className="mt-search-text">{searchPillText}</span>
              {isFiltered && <div className="mt-search-dot" />}
            </button>
          </div>

          {/* Card counter */}
          {properties.length > 0 && (
            <div className="mt-counter">{activeCardIndex + 1} / {feedItems.length}</div>
          )}

          {/* Map floating button */}
          <button className="mt-map-btn" aria-label="Ver mapa" onClick={() => { setMobileMapOpen(true); trackEvent('open_map_mobile_venta') }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#EDE8DC" strokeWidth="1.5" style={{width:22,height:22}}>
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
          </button>

          {/* Filter nudge pill — appears once after 6+ cards without interaction */}
          {nudgeVisible && (
            <div className="vt-nudge-pill" onClick={tapNudge}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:14,height:14,flexShrink:0}}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span>Filtra por zona o precio</span>
              <button className="vt-nudge-x" aria-label="Cerrar sugerencia" onClick={(e) => { e.stopPropagation(); dismissNudge() }}>&times;</button>
            </div>
          )}

          {/* Full-screen mobile map */}
          {mobileMapOpen && (
            <div className="mt-map-overlay">
              <div className="mt-map-header">
                <span className="mt-map-title">Mapa de Ventas</span>
                <button className="mt-map-close" aria-label="Cerrar mapa" onClick={() => { setMobileMapOpen(false); setMapSelectedId(null) }}>&times;</button>
              </div>
              <div className="mt-map-body">
                <VentaMap properties={properties} onSelectProperty={(id) => setMapSelectedId(id)} selectedId={mapSelectedId} />
                {mapSelectedId && (() => {
                  const sp = properties.find(x => x.id === mapSelectedId)
                  if (!sp) return null
                  return <MapFloatCard mobile property={sp} isFavorite={favorites.has(sp.id)} onClose={() => setMapSelectedId(null)} onOpenDetail={() => { setMapSelectedId(null); setMobileMapOpen(false); openSheet(sp) }} onToggleFavorite={() => toggleFavorite(sp.id)} />
                })()}
              </div>
            </div>
          )}

          {/* TikTok feed */}
          <div className="mt-feed" ref={feedRef}>
            {loadError && <div className="mc" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A7060' }}>
              <div style={{ textAlign: 'center' }}><p>No se pudo cargar.</p><button onClick={() => fetchProperties()} style={{ padding: '8px 20px', background: '#141414', color: '#EDE8DC', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Reintentar</button></div>
            </div>}
            {loading && properties.length === 0 && !loadError && <div className="mc" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A7060' }}>Cargando...</div>}
            {!loading && properties.length === 0 && !loadError && <div className="mc" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A7060', textAlign: 'center', padding: '0 32px' }}>{buildEmptyMessage(filters)}</div>}
            {feedItems.map((item, idx) => {
              const isNearby = Math.abs(idx - activeCardIndex) <= VIRTUAL_WINDOW
              if (!isNearby) {
                return <div key={`ph-${item.data.id}`} className="mc-placeholder" />
              }
              const p = item.data
              return <MobileVentaCard key={p.id} property={p} isFavorite={favorites.has(p.id)}
                isSpotlight={item.isSpotlight} isFirst={idx === 0}
                onToggleFavorite={() => toggleFavorite(p.id)} onShare={() => shareProperty(p)}
                onPhotoTap={() => openSheet(p)} onDetails={() => openSheet(p)}
                brokerMode={brokerMode} onAddToShortlist={() => addToShortlist(p)} publicShareMode={publicShareMode} brokerInfo={brokerInfoProp} publicShareBroker={publicShareBrokerProp} priceSnapshot={priceSnapshotsMap ? priceSnapshotsMap[p.id] : null} />
            })}
          </div>
        </main>
      )}

      <style jsx global>{`
        body { background: #EDE8DC; margin: 0; }
        @media (max-width: 767px) { body { overflow: hidden; } }

        /* ===== DESKTOP LAYOUT ===== */
        .ventas-desktop { display:flex; min-height:100vh; font-family:'DM Sans',sans-serif; color:#EDE8DC }
        .ventas-desktop-public .ventas-main { margin-left:0 !important; padding-top:80px !important }
        .ventas-desktop-public .ventas-grid { grid-template-columns:repeat(auto-fill,minmax(280px,1fr)) }
        /* Broker en mobile: mismo layout que public share — grid simple sin sidebar */
        .ventas-desktop-broker-mobile .ventas-main { margin-left:0 !important; padding-top:110px !important; padding:110px 12px 24px !important }
        .ventas-desktop-broker-mobile .ventas-grid { grid-template-columns:1fr; gap:14px }
        /* Link público venta /b/[hash] — NEGRO para que el cliente sienta el peso/elegancia
           de la decisión patrimonial. Alquiler usa header arena. */
        .vt-public-share-header { position:fixed; top:0; left:0; right:0; z-index:50; background:#141414; color:#EDE8DC; padding:10px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid rgba(237,232,220,0.08); font-family:'DM Sans',sans-serif; box-shadow:0 1px 6px rgba(0,0,0,0.4) }
        .vpsh-broker { display:flex; align-items:center; gap:10px; min-width:0 }
        .vpsh-broker-photo { width:44px; height:44px; border-radius:50%; object-fit:cover; display:block }
        .vpsh-broker-photo-ph { background:#7BB389; color:#141414; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:18px }
        .vpsh-broker-info { min-width:0; line-height:1.2 }
        .vpsh-broker-label { font-size:10px; color:rgba(237,232,220,0.55); text-transform:uppercase; letter-spacing:0.6px; font-weight:600 }
        .vpsh-broker-name { font-size:15px; font-weight:600; font-family:'Figtree',sans-serif; color:#EDE8DC }
        .vpsh-broker-agency { font-size:11px; color:rgba(237,232,220,0.55); font-weight:500; margin-top:1px; letter-spacing:0.2px }
        .vpsh-wa { display:inline-flex; align-items:center; gap:6px; background:#25D366; color:#fff; padding:8px 14px; border-radius:100px; text-decoration:none; font-size:13px; font-weight:600; -webkit-tap-highlight-color:transparent }
        .vpsh-wa:active { transform:scale(0.97) }
        .vt-public-map-fab { position:fixed; bottom:max(20px, calc(env(safe-area-inset-bottom) + 16px)); left:16px; z-index:100; display:inline-flex; align-items:center; gap:8px; background:#141414; color:#EDE8DC; border:none; padding:14px 22px 14px 18px; border-radius:100px; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; letter-spacing:0.3px; cursor:pointer; box-shadow:0 6px 22px rgba(0,0,0,0.35); -webkit-tap-highlight-color:transparent }
        .vt-public-map-fab:active { transform:scale(0.96) }
        .ventas-sidebar { width:320px; min-width:320px; background:#141414; border-right:1px solid rgba(237,232,220,0.08); position:fixed; top:0; left:0; bottom:0; overflow-y:auto; z-index:10 }
        .ventas-sidebar-header { padding:24px 20px 12px; display:flex; align-items:baseline; gap:12px }
        .ventas-logo { font-family:'Figtree',sans-serif; font-size:24px; font-weight:500; color:#EDE8DC; text-decoration:none }
        .ventas-label { font-size:11px; letter-spacing:0.5px; color:#B8AD9E; font-weight:600 }
        .ventas-sidebar-count { padding:8px 20px 20px }
        .ventas-count-num { font-family:'Figtree',sans-serif; font-size:48px; font-weight:500; color:#EDE8DC; display:block; line-height:1; font-variant-numeric:tabular-nums }
        .ventas-count-text { font-size:13px; color:#9A8E7A }
        .ventas-main { margin-left:320px; flex:1; padding:24px; min-height:100vh; background:#1a1a1a }
        .ventas-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:24px }
        .ventas-map-container { height:calc(100vh - 80px); border-radius:14px; overflow:hidden; border:1px solid rgba(237,232,220,0.08); position:relative }
        .vt-back-to-grid { position:absolute; top:14px; left:14px; z-index:1100; display:inline-flex; align-items:center; gap:6px; background:#141414; color:#EDE8DC; border:none; padding:10px 16px; border-radius:100px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; letter-spacing:0.3px; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.35); -webkit-tap-highlight-color:transparent }
        .vt-back-to-grid:active { transform:scale(0.97) }

        /* Map float card — desktop */
        .mfc-desktop { position:absolute; bottom:20px; left:20px; z-index:1000; background:#1a1a1a; border:1px solid rgba(237,232,220,0.1); border-radius:14px; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.4); display:flex; width:380px; animation:mfcIn 0.2s ease-out }
        /* Map float card — mobile */
        .mfc-mobile { position:absolute; bottom:12px; left:12px; right:12px; z-index:1000; background:#1a1a1a; border:1px solid rgba(237,232,220,0.1); border-radius:14px; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.4); display:flex; animation:mfcIn 0.2s ease-out }
        @keyframes mfcIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        .mfc-close { position:absolute; top:8px; right:8px; z-index:10; width:36px; height:36px; border-radius:50%; background:#fff; border:none; color:#141414; font-size:22px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.4); font-weight:600; padding:0 }
        .mfc-photo { width:130px; min-width:130px; background-size:cover; background-position:center; background-color:#2a2a2a; position:relative }
        .mfc-nav { position:absolute; top:50%; transform:translateY(-50%); width:40px; height:40px; border-radius:50%; background:rgba(20,20,20,0.6); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:3 }
        .mfc-nav-prev { left:4px }
        .mfc-nav-next { right:4px }
        .mfc-count { position:absolute; bottom:6px; right:6px; background:rgba(20,20,20,0.75); color:rgba(255,255,255,0.8); font-size:10px !important; padding:2px 6px; border-radius:8px; font-family:'DM Sans',sans-serif; line-height:1.2 }
        .mfc-fav { position:absolute; top:6px; left:6px; width:44px; height:44px; border-radius:50%; background:rgba(20,20,20,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:3 }
        .mfc-fav.active { background:rgba(224,85,85,0.15) }
        .mfc-fav svg { width:16px; height:16px }
        .mfc-body { flex:1; padding:14px }
        .mfc-name { font-family:'Figtree',sans-serif; font-size:18px; color:#EDE8DC; line-height:1.2; margin-bottom:4px; font-weight:500 }
        .mfc-specs { font-size:12px; color:#9A8E7A; margin-bottom:8px; font-family:'DM Sans',sans-serif }
        .mfc-price { font-family:'DM Sans',sans-serif; font-size:22px; color:#EDE8DC; line-height:1; font-weight:500; font-variant-numeric:tabular-nums }
        .mfc-m2 { font-size:11px; color:#9A8E7A; margin-bottom:10px; font-family:'DM Sans',sans-serif }
        .mfc-detail { width:100%; padding:8px; background:rgba(237,232,220,0.08); border:1px solid rgba(237,232,220,0.1); color:#EDE8DC; font-family:'DM Sans',sans-serif; font-size:12px; cursor:pointer; border-radius:10px }

        /* View mode toggle */
        .vm-toggle { display:flex; gap:4px; margin-bottom:20px; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.1); border-radius:10px; padding:4px; width:fit-content }
        .vm-btn { display:flex; align-items:center; gap:6px; padding:8px 16px; border:none; border-radius:8px; background:transparent; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:12px; cursor:pointer; transition:all 0.15s }
        .vm-btn.active { background:rgba(237,232,220,0.1); color:#EDE8DC; font-weight:600 }

        /* ===== MOBILE TIKTOK LAYOUT ===== */
        .mt-top-bar { position:fixed; top:0; left:0; right:0; z-index:50; display:flex; align-items:center; justify-content:center; padding:10px 16px; padding-top:max(10px, env(safe-area-inset-top)); pointer-events:none }
        .mt-top-bar > * { pointer-events:auto }
        .mt-search-pill { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.15); padding:8px 16px; border-radius:100px; border:none; cursor:pointer; position:relative; max-width:80vw }
        .mt-search-text { font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; color:rgba(255,255,255,0.7); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:0.2px }
        .mt-search-dot { position:absolute; top:5px; right:5px; width:6px; height:6px; background:#3A6A48; border-radius:50% }

        /* ===== FILTER OVERLAY (full-screen takeover) ===== */
        .fo-overlay { position:fixed; inset:0; z-index:200; background:#141414; display:flex; flex-direction:column; animation:foSlideUp 0.3s ease-out }
        @keyframes foSlideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        .fo-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; padding-top:max(16px, calc(env(safe-area-inset-top) + 8px)); border-bottom:1px solid rgba(237,232,220,0.08) }
        .fo-close { width:44px; height:44px; border-radius:50%; border:none; background:rgba(237,232,220,0.08); color:#B8AD9E; font-size:22px; display:flex; align-items:center; justify-content:center; cursor:pointer }
        .fo-title { font-family:'Figtree',sans-serif; font-size:20px; font-weight:500; color:#EDE8DC }
        .fo-count { font-size:14px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-variant-numeric:tabular-nums }
        .fo-body { flex:1; overflow-y:auto; padding:20px }
        .fo-footer { padding:16px 20px; padding-bottom:max(16px, calc(env(safe-area-inset-bottom) + 8px)); border-top:1px solid rgba(237,232,220,0.08); display:flex; gap:10px }
        .fo-reset { flex:0 0 auto; padding:14px 20px; background:transparent; border:1px solid rgba(237,232,220,0.12); border-radius:10px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:13px; cursor:pointer }
        .fo-apply { flex:1; padding:14px; background:#EDE8DC; border:none; border-radius:10px; color:#141414; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; cursor:pointer }
        .fo-apply:active { transform:scale(0.97) }
        .mt-counter { position:fixed; bottom:max(16px, calc(env(safe-area-inset-bottom) + 8px)); right:16px; z-index:50; font-size:12px; color:#7A7060; font-family:'DM Sans',sans-serif; font-weight:500; font-variant-numeric:tabular-nums }
        .mt-map-btn { position:fixed; bottom:max(140px, calc(env(safe-area-inset-bottom) + 130px)); right:20px; z-index:100; width:48px; height:48px; border-radius:50%; background:rgba(20,20,20,0.7); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.2) }
        /* Banner broker venta — NEGRO (paridad con marca: peso = decisión patrimonial).
           Alquiler usa banner arena (más ligero, decisión rápida). Inversión cromática
           total respecto al feed mobile/desktop para que el navbar se despegue del fondo. */
        .vt-broker-banner { position:fixed; top:0; left:0; right:0; z-index:60; background:#141414; color:#EDE8DC; padding:9px 18px; font-family:'DM Sans',sans-serif; display:flex; align-items:center; gap:12px; box-shadow:0 1px 0 rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.25); border-bottom:1px solid rgba(237,232,220,0.08) }
        .vt-broker-banner-brand { display:flex; align-items:baseline; gap:8px; min-width:0 }
        .vt-broker-banner-logo { font-family:'Figtree',sans-serif; font-weight:700; font-size:15px; letter-spacing:0.6px; color:#EDE8DC }
        .vt-broker-banner-divider { opacity:0.35; font-size:14px; color:#EDE8DC }
        /* Salvia bumpeada para legibilidad sobre negro (variante dark del #3A6A48) */
        .vt-broker-banner-label { font-family:'DM Sans',sans-serif; font-weight:600; font-size:10px; letter-spacing:1.6px; text-transform:uppercase; color:#7BB389 }
        .vt-broker-banner-name { font-family:'Figtree',sans-serif; font-weight:500; font-size:13px; margin-left:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#EDE8DC }
        .vt-broker-viewmode { display:inline-flex; gap:0; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.14); border-radius:8px; padding:2px; flex-shrink:0 }
        .vt-broker-vm-btn { background:transparent; border:none; color:rgba(237,232,220,0.5); padding:5px 11px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:background 0.15s, color 0.15s; -webkit-tap-highlight-color:transparent }
        .vt-broker-vm-btn:hover { color:rgba(237,232,220,0.9) }
        .vt-broker-vm-btn.active { background:#EDE8DC; color:#141414 }
        /* Tabs Ventas / Alquileres (Día 4-5 Fase 2) */
        .vt-broker-tabs { display:inline-flex; gap:0; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.14); border-radius:100px; padding:2px; flex-shrink:0 }
        .vt-broker-tab { background:transparent; border:none; color:rgba(237,232,220,0.55); padding:5px 14px; border-radius:100px; cursor:pointer; font-family:inherit; font-size:12px; font-weight:600; letter-spacing:0.3px; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; transition:background 0.15s, color 0.15s; -webkit-tap-highlight-color:transparent; white-space:nowrap }
        .vt-broker-tab:hover:not(.active) { color:rgba(237,232,220,0.95) }
        .vt-broker-tab.active { background:#EDE8DC; color:#141414; cursor:default }
        /* Padding extra en el sidebar SOLO en brokerMode para que no quede tapado por el banner negro fijo */
        .ventas-desktop-broker .ventas-sidebar { padding-top:48px }
        /* Padding-top en el main desktop también, para que las cards no queden tapadas */
        .ventas-desktop-broker .ventas-main { padding-top:70px }
        .vt-broker-banner-shortlists { margin-left:auto; background:#EDE8DC; color:#141414; border:1px solid #EDE8DC; padding:5px 12px; border-radius:100px; font-size:11px; font-weight:600; letter-spacing:0.3px; cursor:pointer; -webkit-tap-highlight-color:transparent; font-family:inherit; white-space:nowrap }
        .vt-broker-banner-shortlists:active { transform:scale(0.96) }
        .vt-broker-tool { background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.22); color:#EDE8DC; padding:5px 12px; border-radius:100px; font-size:11px; font-weight:600; letter-spacing:0.3px; cursor:pointer; -webkit-tap-highlight-color:transparent; font-family:inherit; white-space:nowrap }
        .vt-broker-tool:hover { background:rgba(237,232,220,0.12) }
        .vt-broker-tool:active { transform:scale(0.96) }
        .vt-broker-tool.active { background:#EDE8DC; color:#141414; border-color:#EDE8DC }
        .vt-broker-tool-add { background:rgba(123,179,137,0.16); border-color:rgba(123,179,137,0.50); color:#9BCDA8 }
        .vt-broker-tool-add:hover { background:rgba(123,179,137,0.24) }
        .vt-broker-market-link { text-decoration:none; display:inline-flex; align-items:center; gap:4px }
        .vt-broker-market-arrow { opacity:0.55; font-weight:500 }
        @media (max-width: 768px) {
          .vt-broker-banner { flex-wrap:wrap; padding:6px 12px; gap:6px }
          .vt-broker-tool, .vt-broker-banner-shortlists { font-size:10px; padding:3px 8px }
        }
        .vt-shortlist-banner { background:#EDE8DC !important; color:#141414 !important; border:1px solid rgba(20,20,20,0.15) !important; box-shadow:0 6px 22px rgba(20,20,20,0.18) !important }
        .vt-shortlist-banner svg { color:#141414 !important }
        .vt-shortlist-banner-wrap .vt-compare-banner-clear { background:#EDE8DC !important; color:rgba(20,20,20,0.55) !important; border:1px solid rgba(20,20,20,0.15) !important; box-shadow:0 6px 22px rgba(20,20,20,0.18) !important }
        /* Banner shortlist mobile: pegado abajo (igual que desktop) — el grid layout
           del broker mobile permite scroll natural sin tapar contenido. */
        @media (max-width: 768px) {
          .vt-shortlist-banner-wrap .vt-compare-banner { padding:10px 16px !important; font-size:13px !important; min-height:42px !important }
          .vt-shortlist-banner-wrap .vt-compare-banner-clear { width:42px !important; min-height:42px !important; font-size:18px !important }
        }
        .vt-compare-banner-wrap { position:fixed; bottom:max(24px, calc(env(safe-area-inset-bottom) + 16px)); left:50%; transform:translateX(-50%); z-index:150; display:flex; align-items:stretch; gap:6px; max-width:calc(100vw - 32px) }
        .vt-compare-banner { display:flex; align-items:center; gap:10px; padding:12px 20px; background:#141414; color:#EDE8DC; border:1px solid rgba(237,232,220,0.1); border-radius:100px; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; letter-spacing:0.3px; cursor:pointer; box-shadow:0 6px 20px rgba(0,0,0,0.25); min-height:48px; white-space:nowrap; -webkit-tap-highlight-color:transparent }
        .vt-compare-banner:active { transform:scale(0.97) }
        .vt-compare-banner-text { font-variant-numeric:tabular-nums }
        .vt-compare-banner-clear { width:48px; min-height:48px; background:#141414; border:1px solid rgba(237,232,220,0.1); border-radius:50%; color:rgba(237,232,220,0.6); font-size:20px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 20px rgba(0,0,0,0.25) }
        .vt-nudge-pill { position:fixed; bottom:max(90px, calc(env(safe-area-inset-bottom) + 80px)); left:50%; transform:translateX(-50%); z-index:100; display:flex; align-items:center; gap:8px; background:#3A6A48; color:#EDE8DC; padding:12px 16px 12px 18px; border-radius:100px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; letter-spacing:0.3px; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,0.18); animation:vtNudgeIn 0.3s ease-out }
        .vt-nudge-x { background:none; border:none; color:rgba(237,232,220,0.6); font-size:18px; line-height:1; cursor:pointer; padding:0 0 0 4px }
        @keyframes vtNudgeIn { from{opacity:0;transform:translateX(-50%) translateY(12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        .mt-map-overlay { position:fixed; inset:0; z-index:300; background:#141414; display:flex; flex-direction:column }
        .mt-map-header { display:flex; align-items:center; justify-content:space-between; padding:12px 20px; padding-top:max(12px, env(safe-area-inset-top)); background:#141414; border-bottom:1px solid rgba(237,232,220,0.1) }
        .mt-map-title { font-family:'Figtree',sans-serif; font-size:20px; font-weight:500; color:#EDE8DC }
        .mt-map-close { width:44px; height:44px; border-radius:10px; border:none; background:rgba(237,232,220,0.08); color:#B8AD9E; font-size:20px; display:flex; align-items:center; justify-content:center; cursor:pointer }
        .mt-map-body { flex:1; position:relative; overflow:hidden }
        .mt-map-body .venta-map { position:absolute; inset:0 }

        .mt-feed { height:100vh; height:100dvh; overflow-y:scroll; scroll-snap-type:y mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none }
        .mt-feed::-webkit-scrollbar { display:none }

        /* ===== MOBILE CARD (50% foto / 50% contenido) ===== */
        .mc { height:100vh; height:100dvh; scroll-snap-align:start; scroll-snap-stop:always; position:relative; overflow:hidden; display:flex; flex-direction:column; background:#141414 }
        .mc-placeholder { height:100vh; height:100dvh; scroll-snap-align:start; background:#141414 }

        /* Photo zone (60%) */
        .mc-photo-zone { flex:0 0 60%; position:relative; overflow:hidden }
        .mc-photo-zone::after { content:''; position:absolute; bottom:0; left:0; right:0; height:80px; background:linear-gradient(transparent, #141414); pointer-events:none; z-index:2 }
        .mc-photo-zone::before { content:''; position:absolute; top:0; left:0; right:0; height:70px; background:linear-gradient(rgba(0,0,0,0.35), transparent); pointer-events:none; z-index:3 }
        .mc-photo-scroll { display:flex; height:100%; overflow-x:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none }
        .mc-photo-scroll::-webkit-scrollbar { display:none }
        .mc-slide { flex:0 0 100%; height:100%; background-size:cover; background-position:center; background-color:#D8D0BC; scroll-snap-align:start; position:relative; overflow:hidden }
        .mc-slide-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center; pointer-events:none }
        .mc-slide-empty { background:#D8D0BC }
        .mc-photo-fade { display:none }
        .mc-photo-count { position:absolute; bottom:36px; right:16px; z-index:5; background:rgba(20,20,20,0.75); padding:5px 12px; border-radius:100px; font-size:12px; font-weight:500; color:rgba(255,255,255,0.8); font-family:'DM Sans',sans-serif; display:flex; align-items:center; gap:5px }
        .mc-dots { position:absolute; bottom:36px; left:50%; transform:translateX(-50%); display:flex; gap:6px; z-index:5 }
        .mc-dot { width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,0.3); transition:all 0.25s }
        .mc-dot.active { background:#fff; width:20px; border-radius:3px }

        .mc-btn { display:flex; align-items:center; justify-content:center; gap:5px; background:none; border:none; color:#9A8E7A; font-size:12px; font-family:'DM Sans',sans-serif; cursor:pointer; padding:8px; min-width:44px; min-height:44px }
        .mc-btn.mc-fav.active svg { filter:drop-shadow(0 2px 4px rgba(224,85,85,0.4)) }
        .mc-btn.mc-share { color:#9A8E7A }
        .mc-btn.mc-info { color:rgba(237,232,220,0.85); font-size:12px; letter-spacing:0.3px; background:rgba(237,232,220,0.08); border-radius:10px; padding:8px 14px; font-weight:500 }
        .mc-btn.mc-shortlist { background:rgba(58,106,72,0.15); border:1px solid rgba(58,106,72,0.4) }
        .mc-spotlight { position:absolute; top:max(56px, calc(env(safe-area-inset-top) + 50px)); left:16px; z-index:10; background:rgba(250,250,248,0.95); border-left:3px solid #3A6A48; padding:8px 14px; border-radius:0 8px 8px 0; font-family:'DM Sans',sans-serif; font-size:12px; color:#141414; letter-spacing:0.3px }
        .mc-tc-badge { position:absolute; top:max(56px, calc(env(safe-area-inset-top) + 50px)); right:16px; z-index:10; background:rgba(180,130,20,0.9); color:#fff; padding:6px 12px; border-radius:4px; font-family:'DM Sans',sans-serif; font-size:11px; font-weight:500; letter-spacing:0.2px }
        .mc-fuente-badge { position:absolute; top:max(56px, calc(env(safe-area-inset-top) + 50px)); left:16px; z-index:10; padding:5px 10px; border-radius:4px; font-family:'DM Sans',sans-serif; font-size:10px; font-weight:700; letter-spacing:0.4px; text-transform:uppercase; box-shadow:0 2px 6px rgba(0,0,0,0.3) }

        /* Desktop spotlight */
        .ds-spotlight { margin-bottom:32px }
        .ds-spotlight-banner { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; margin-bottom:16px; background:rgba(237,232,220,0.06); border-left:3px solid #3A6A48; border-radius:0 14px 14px 0; font-family:'DM Sans',sans-serif; font-size:14px; color:#EDE8DC }
        .ds-spotlight-close { background:none; border:none; color:#9A8E7A; font-size:20px; cursor:pointer; padding:0 4px }
        .ds-spotlight-close:hover { color:#EDE8DC }
        .ds-spotlight-sep { display:flex; align-items:center; gap:16px; margin-top:24px }
        .ds-spotlight-line { flex:1; height:1px; background:rgba(237,232,220,0.08) }
        .ds-spotlight-text { font-size:12px; color:#9A8E7A; font-family:'DM Sans',sans-serif; letter-spacing:0.5px; white-space:nowrap; text-transform:uppercase }

        /* Content zone (45%) */
        .mc-content { flex:1; padding:0 24px 8px; padding-bottom:max(8px, calc(env(safe-area-inset-bottom) + 4px)); display:flex; flex-direction:column; overflow:hidden }
        .mc-name { font-family:'Figtree',sans-serif; font-size:24px; font-weight:500; color:#EDE8DC; line-height:1.1; margin-bottom:2px; padding-top:8px; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap }
        .mc-reciente { font-size:11px; font-weight:600; color:#3A6A48; font-family:'DM Sans',sans-serif; letter-spacing:0.3px; background:rgba(58,106,72,0.15); padding:2px 8px; border-radius:4px }
        .mc-zona { font-size:13px; color:#9A8E7A; letter-spacing:0.3px; margin-bottom:12px; font-family:'DM Sans',sans-serif }
        .mc-price-block { border-left:3px solid #3A6A48; padding-left:14px; margin-bottom:8px }
        .mc-price { font-family:'DM Sans',sans-serif; font-size:28px; font-weight:500; color:#EDE8DC; line-height:1; margin-bottom:6px; font-variant-numeric:tabular-nums }
        .mc-tc { font-size:11px; font-weight:400; color:rgba(237,232,220,0.3); letter-spacing:0.2px }
        .mc-specs { font-size:15px; color:#C8C0B0; font-family:'DM Sans',sans-serif; font-weight:400; line-height:1.4 }
        .mc-specs-2 { font-size:15px; color:#EDE8DC; font-family:'DM Sans',sans-serif; margin-bottom:auto; font-weight:300 }
        .mc-wsp-inline { display:flex; align-items:center; gap:5px; text-decoration:none; color:#fff; font-size:12px; font-weight:600; background:#1EA952; border-radius:10px; padding:8px 14px }
        .mc-actions { display:flex; align-items:center; justify-content:space-between; padding-top:8px; border-top:1px solid rgba(237,232,220,0.1); margin-top:auto; min-height:36px }
        .mc-branding { display:block; text-align:center; font-family:'DM Sans',sans-serif; font-size:11px; color:rgba(237,232,220,0.25); text-decoration:none; padding-top:6px; letter-spacing:0.3px }
        .mc-btn.mc-fav.shake { animation:mcShake 0.3s ease }
        @keyframes mcShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }

        /* ===== MOBILE FILTER CARD (full-screen) ===== */
        .mfc { height:100vh; height:100dvh; scroll-snap-align:start; scroll-snap-stop:always; background:#141414; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding:60px 28px 20px; padding-bottom:max(20px, calc(env(safe-area-inset-bottom) + 8px)); font-family:'DM Sans',sans-serif; overflow-y:auto }
        .mfc-header { display:flex; align-items:baseline; gap:8px; margin-bottom:6px }
        .mfc-count { font-family:'Figtree',sans-serif; font-size:40px; font-weight:500; color:#EDE8DC; line-height:1; font-variant-numeric:tabular-nums }
        .mfc-sub { font-size:15px; font-weight:400; color:#9A8E7A; font-family:'DM Sans',sans-serif }
        .mfc-divider { display:flex; align-items:center; gap:12px; width:100%; margin-bottom:14px }
        .mfc-line { flex:1; height:1px; background:rgba(237,232,220,0.1) }
        .mfc-text { font-size:12px; letter-spacing:0.5px; color:#9A8E7A; font-weight:600; text-transform:uppercase }
        .mfc-filters { width:100%; max-width:320px; margin-bottom:12px }
        .mfc-cta { display:block; width:100%; max-width:320px; padding:15px; background:#EDE8DC; border:1px solid #EDE8DC; color:#141414; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; cursor:pointer; margin-bottom:10px; border-radius:10px; transition:all 0.3s }
        .mfc-cta:active { transform:scale(0.97) }
        .mfc-reset { display:block; width:100%; max-width:320px; padding:11px; background:transparent; border:1px solid rgba(237,232,220,0.12); color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:13px; cursor:pointer; margin-bottom:8px; border-radius:10px }
        .mfc-skip { font-size:13px; color:rgba(237,232,220,0.4); font-weight:300; font-family:'DM Sans',sans-serif }

        /* ===== FILTER COMPONENTS (shared) ===== */
        .vf-wrap { padding:0 20px 20px; border-top:1px solid rgba(237,232,220,0.08); padding-top:16px }
        .vf-group { margin-bottom:14px; text-align:left }
        .vf-label { font-size:12px; letter-spacing:0.5px; color:#9A8E7A; margin-bottom:7px; font-weight:600; font-family:'DM Sans',sans-serif; text-transform:uppercase; display:flex; align-items:center; gap:6px }
        .vf-label::before { content:''; width:6px; height:6px; border-radius:50%; background:#3A6A48; flex-shrink:0 }
        .vf-search { width:100%; padding:9px 12px; border-radius:10px; border:1px solid rgba(237,232,220,0.12); background:transparent; color:#EDE8DC; font-size:14px; font-family:'DM Sans',sans-serif; outline:none; transition:border-color 0.2s }
        .vf-search::placeholder { color:#7A7060 }
        .vf-search:focus { border-color:#3A6A48 }
        .vf-zona-btns { display:flex; flex-wrap:wrap; gap:7px }
        .vf-zona-btn { padding:7px 14px; border-radius:100px; border:1px solid rgba(237,232,220,0.12); background:transparent; color:#9A8E7A; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s }
        .vf-zona-btn:hover { border-color:rgba(237,232,220,0.25); color:#EDE8DC }
        .vf-zona-btn.active { border:2px solid #3A6A48; color:#EDE8DC; background:rgba(58,106,72,0.15); font-weight:600 }
        .vf-btn-row { display:flex; gap:8px }
        .vf-btn { flex:1; padding:12px 8px; border-radius:10px; border:1px solid rgba(237,232,220,0.12); background:transparent; color:#9A8E7A; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s; text-align:center; min-height:44px }
        .vf-btn:hover { border-color:rgba(237,232,220,0.25); color:#EDE8DC }
        .vf-btn.active { border:2px solid #3A6A48; color:#EDE8DC; background:rgba(58,106,72,0.15); font-weight:600 }
        .vf-range-display { font-size:14px; color:#EDE8DC; margin-bottom:10px; text-align:right; font-family:'DM Sans',sans-serif; font-weight:500; font-variant-numeric:tabular-nums }
        .vf-range-wrap { position:relative; height:28px }
        .vf-slider { position:absolute; top:0; left:0; width:100%; -webkit-appearance:none; appearance:none; background:transparent; pointer-events:none; height:28px }
        .vf-slider::-webkit-slider-thumb { -webkit-appearance:none; width:24px; height:24px; border-radius:50%; background:#EDE8DC; cursor:pointer; pointer-events:all; border:2px solid #3A6A48; position:relative; z-index:2 }
        .vf-slider::-moz-range-thumb { width:24px; height:24px; border-radius:50%; background:#EDE8DC; cursor:pointer; pointer-events:all; border:2px solid #3A6A48 }
        .vf-slider::-webkit-slider-runnable-track { height:3px; background:rgba(237,232,220,0.25); border-radius:2px }
        .vf-slider::-moz-range-track { height:3px; background:rgba(237,232,220,0.25); border-radius:2px }
        .vf-slider-min { z-index:1 }
        .vf-slider-max { z-index:2 }
        .vf-tc-note { font-size:12px; color:#9A8E7A; font-family:'DM Sans',sans-serif; margin-top:8px; text-align:right }
        .vf-reset { width:100%; max-width:340px; padding:10px; background:transparent; border:1px solid rgba(237,232,220,0.12); border-radius:10px; color:#9A8E7A; font-size:12px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s }
        .vf-reset:hover { border-color:rgba(237,232,220,0.25); color:#EDE8DC }

        /* ===== DESKTOP VENTA CARD ===== */
        .vc { background:#1e1e1e; border:1px solid rgba(237,232,220,0.08); border-radius:14px; overflow:hidden; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); display:flex; flex-direction:column }
        .vc:hover { transform:translateY(-4px); box-shadow:0 12px 32px rgba(0,0,0,0.3) }
        /* vc-photo es ahora el wrapper; vc-photo-scroll es el carrusel con scroll-snap horizontal
           (swipe táctil en mobile + click en flechas en desktop). Patrón clonado de mc-photo-scroll. */
        .vc-photo { height:220px; background-color:#2a2a2a; position:relative; overflow:hidden }
        .vc-photo-scroll { display:flex; height:100%; overflow-x:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none }
        .vc-photo-scroll::-webkit-scrollbar { display:none }
        .vc-slide { flex:0 0 100%; height:100%; background-size:cover; background-position:center; background-color:#2a2a2a; scroll-snap-align:start; scroll-snap-stop:always; cursor:pointer }
        .vc-slide-empty { display:flex; align-items:center; justify-content:center; cursor:default }
        @keyframes vcShimmer { 0%,100%{background-color:#2a2a2a} 50%{background-color:#333} }
        .vc-photo:not([style*="background-image"]) { animation:vcShimmer 1.5s ease-in-out infinite }
        .vc-nofoto { display:flex; align-items:center; justify-content:center; height:100%; color:#9A8E7A; font-size:13px; font-family:'DM Sans',sans-serif }
        .vc-nav { position:absolute; top:50%; transform:translateY(-50%); width:36px; height:36px; border-radius:50%; background:rgba(20,20,20,0.6); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.15s; z-index:3 }
        .vc-nav:hover { background:rgba(20,20,20,0.85) }
        .vc-nav-prev { left:8px }
        .vc-nav-next { right:8px }
        .vc-photo-count { position:absolute; top:10px; right:10px; background:rgba(20,20,20,0.75); color:rgba(255,255,255,0.8); font-size:11px; padding:3px 8px; border-radius:100px; font-family:'DM Sans',sans-serif }
        .vc-tc-badge { position:absolute; bottom:10px; left:10px; background:rgba(180,130,20,0.9); color:#fff; font-size:11px; font-weight:500; padding:4px 10px; border-radius:4px; font-family:'DM Sans',sans-serif; letter-spacing:0.2px; z-index:3 }
        .vc-fuente-badge { position:absolute; top:10px; left:10px; font-size:10px; font-weight:700; padding:4px 9px; border-radius:4px; font-family:'DM Sans',sans-serif; letter-spacing:0.4px; text-transform:uppercase; z-index:4; box-shadow:0 2px 4px rgba(0,0,0,0.2) }
        .vc-fav { position:absolute; top:10px; left:10px; width:40px; height:40px; border-radius:50%; background:rgba(20,20,20,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s; z-index:3 }
        .vc-fav:hover { transform:scale(1.1) }
        .vc-fav.active { background:rgba(224,85,85,0.15) }
        .vc-share { position:absolute; top:10px; left:58px; width:40px; height:40px; border-radius:50%; background:rgba(20,20,20,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s; z-index:3 }
        .vc-share:hover { transform:scale(1.1); background:rgba(20,20,20,0.7) }
        .vc-body { padding:16px; flex:1; display:flex; flex-direction:column }
        .vc-name { font-family:'Figtree',sans-serif; font-size:20px; font-weight:500; color:#EDE8DC; line-height:1.2; margin-bottom:2px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap }
        .vc-reciente { font-size:11px; font-weight:500; color:#3A6A48; font-family:'DM Sans',sans-serif; letter-spacing:0.3px }
        .vc-zona { font-size:12px; color:#9A8E7A; letter-spacing:0.5px; margin-bottom:10px }
        .vc-id { color:rgba(237,232,220,0.3); font-size:12px; margin-left:4px; letter-spacing:0 }
        .vc-price-block { border-left:3px solid #3A6A48; padding-left:12px; margin-bottom:8px }
        .vc-price-change { font-family:'DM Sans',sans-serif; font-size:11px; font-weight:600; letter-spacing:0.3px; margin-top:4px; display:inline-block; padding:3px 8px; border-radius:4px }
        .vc-price-change-agent-down { background:rgba(58,106,72,0.15); color:#5fb074 }
        .vc-price-change-agent-up { background:rgba(237,232,220,0.08); color:rgba(237,232,220,0.55) }
        .vc-price-change-tc-down, .vc-price-change-tc-up { background:rgba(125,160,200,0.15); color:#9DBFE0; font-weight:500; font-size:10px }
        .mc-price-change { font-family:'DM Sans',sans-serif; font-size:11px; font-weight:600; letter-spacing:0.3px; margin-top:6px; display:inline-block; padding:3px 8px; border-radius:4px }
        .mc-price-change-agent-down { background:rgba(58,106,72,0.15); color:#5fb074 }
        .mc-price-change-agent-up { background:rgba(237,232,220,0.08); color:rgba(237,232,220,0.55) }
        .mc-price-change-tc-down, .mc-price-change-tc-up { background:rgba(125,160,200,0.15); color:#9DBFE0; font-weight:500; font-size:10px }
        .vc-price { font-family:'DM Sans',sans-serif; font-size:24px; font-weight:500; color:#EDE8DC; line-height:1; margin-bottom:4px; font-variant-numeric:tabular-nums }
        .vc-tc { font-size:11px; font-weight:400; color:rgba(237,232,220,0.3); letter-spacing:0.2px }
        .vc-specs { font-size:15px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-weight:300 }
        .vc-specs-2 { font-size:15px; color:#EDE8DC; font-family:'DM Sans',sans-serif; margin-bottom:10px; font-weight:300 }
        .vc-actions { border-top:1px solid rgba(237,232,220,0.08); padding-top:8px; margin-top:auto; display:flex; align-items:center; justify-content:space-between; min-height:36px }
        .vc-act-btn { display:flex; align-items:center; gap:4px; background:none; border:none; color:#9A8E7A; font-size:11px; font-family:'DM Sans',sans-serif; cursor:pointer; padding:4px 0; transition:color 0.15s; text-decoration:none }
        .vc-act-btn:hover { color:#EDE8DC }
        .vc-act-fav.active svg { filter:drop-shadow(0 2px 4px rgba(224,85,85,0.4)) }
        .vc-act-detail { color:rgba(237,232,220,0.7) }
        .vc-act-wsp { color:#1EA952; font-weight:600 }
        .vc-act-shortlist { color:#3A6A48; font-weight:600; background:rgba(58,106,72,0.08); border:1px solid rgba(58,106,72,0.25) }
        .vc-act-wsp:hover { color:#25D366 }

        /* ===== STATES ===== */
        .ventas-status { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:300px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:15px; text-align:center }
        .ventas-status button { margin-top:12px; padding:8px 20px; background:#EDE8DC; color:#141414; border:none; border-radius:10px; cursor:pointer; font-weight:600; font-size:14px }

        /* ===== TOAST ===== */
        .ventas-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#141414; color:#EDE8DC; padding:10px 24px; border-radius:100px; font-size:13px; font-family:'DM Sans',sans-serif; z-index:100; font-weight:600 }

        /* ===== BOTTOM SHEET (ventas dark theme — .bs-venta overrides alquileres.css) ===== */
        .bs-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:500; opacity:0; pointer-events:none; transition:opacity 0.3s }
        .bs-overlay.open { opacity:1; pointer-events:auto }

        /* Base structure (ventas-specific, not in alquileres.css) */
        .bs-venta.bs { background:#1a1a1a; color:#EDE8DC; padding-bottom:72px }
        .bs-venta .bs-floating-actions { position:sticky; top:0; z-index:10; display:flex; align-items:center; justify-content:flex-end; gap:4px; padding:8px 16px; padding-top:max(8px, calc(env(safe-area-inset-top) + 4px)) }
        .bs-venta .bs-fav { width:40px; height:40px; border-radius:50%; border:none; background:rgba(20,20,20,0.6); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:#9A8E7A; display:flex; align-items:center; justify-content:center; cursor:pointer }
        .bs-venta .bs-fav.active svg { filter:drop-shadow(0 2px 4px rgba(224,85,85,0.4)) }
        .bs-venta .bs-close { width:40px; height:40px; border-radius:50%; border:none; background:rgba(20,20,20,0.6); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:#EDE8DC; font-size:22px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0 }

        /* Dark header */
        .bs-venta .bs-dark-header { background:#141414; padding:0 24px 20px }
        .bs-venta .bs-h-name { font-family:'Figtree',sans-serif; font-size:24px; font-weight:500; color:#EDE8DC; line-height:1.1; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap }
        .bs-venta .bs-h-reciente { font-size:11px; font-weight:500; color:#3A6A48; font-family:'DM Sans',sans-serif; letter-spacing:0.3px }
        .bs-venta .bs-h-zona { font-size:13px; color:#9A8E7A; letter-spacing:0.3px; margin-bottom:12px; font-family:'DM Sans',sans-serif; margin-top:2px }
        .bs-venta .bs-h-price-block { border-left:3px solid #3A6A48; padding-left:14px }
        .bs-venta .bs-h-price { font-family:'DM Sans',sans-serif; font-size:28px; font-weight:500; color:#EDE8DC; line-height:1; margin-bottom:6px; font-variant-numeric:tabular-nums }
        .bs-venta .bs-h-tc { font-size:11px; font-weight:400; color:rgba(237,232,220,0.3); letter-spacing:0.2px }
        .bs-tc-badge { display:inline-block; margin-left:10px; background:rgba(180,130,20,0.9); color:#fff; font-size:10px; font-weight:500; padding:3px 8px; border-radius:3px; vertical-align:middle; letter-spacing:0.2px }
        .bs-venta .bs-h-specs { font-size:15px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-weight:300; line-height:1.4 }
        .bs-venta .bs-h-sub { font-size:14px; color:#EDE8DC; font-family:'DM Sans',sans-serif; font-weight:300; margin-top:4px }

        /* Content sections — override alquileres.css arena backgrounds */
        .bs-venta .bs-section { background:#1a1a1a; border-bottom:1px solid rgba(237,232,220,0.08) }
        .bs-venta .bs-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px }
        .bs-venta .bs-feat { background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.1); box-shadow:none }
        .bs-venta .bs-fi { color:#9A8E7A }
        .bs-venta .bs-fv { color:#EDE8DC }
        .bs-venta .bs-fl { color:#9A8E7A }
        .bs-venta .bs-feat.hl { border-color:rgba(237,232,220,0.15); background:rgba(237,232,220,0.08) }
        .bs-venta .bs-feat.hl .bs-fl { color:#EDE8DC }
        .bs-venta .bs-feat.hl .bs-fv { color:#EDE8DC; font-weight:600 }
        .bs-venta .bs-aw { display:flex; flex-wrap:wrap; gap:6px }
        .bs-venta .bs-at { background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.1); color:#EDE8DC }
        .bs-venta .bs-sl { color:#9A8E7A }
        .bs-venta .bs-badges { display:flex; flex-wrap:wrap; gap:8px }
        .bs-venta .bs-badge { border:1px solid rgba(237,232,220,0.15); color:#9A8E7A; background:transparent }
        .bs-venta .bs-badge.gold { border-color:rgba(237,232,220,0.25); color:#EDE8DC; background:rgba(237,232,220,0.08) }
        .bs-venta .bs-desc { color:#9A8E7A }
        .bs-venta .bs-agent { font-size:14px; margin-bottom:10px }
        .bs-venta .bs-agent-name { color:#EDE8DC }
        .bs-venta .bs-agent-office { color:#9A8E7A }
        .bs-venta .bs-gmaps-link { background:rgba(237,232,220,0.08); border:none; color:#EDE8DC }
        .bs-venta .bs-ver-original { width:100%; padding:14px; background:rgba(237,232,220,0.08); border:1px solid rgba(237,232,220,0.1); color:#EDE8DC; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:15px; cursor:pointer; font-weight:500; display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none }
        .bs-venta .bs-add-shortlist { width:100%; padding:14px; background:transparent; border:1.5px solid #3A6A48; color:#3A6A48; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:15px; cursor:pointer; font-weight:600; letter-spacing:0.3px; display:flex; align-items:center; justify-content:center; gap:8px; -webkit-tap-highlight-color:transparent; transition:background 0.15s, color 0.15s }
        .bs-venta .bs-add-shortlist:active { transform:scale(0.98); opacity:0.9 }
        .bs-venta .bs-add-shortlist-active { background:#3A6A48; color:#EDE8DC }
        .bs-venta .bs-gate { display:flex; flex-direction:column; gap:12px }
        .bs-venta .bs-gate-title { font-size:14px; color:#9A8E7A; margin-bottom:4px }
        .bs-venta .bs-gate-input { background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.12); color:#EDE8DC }
        .bs-venta .bs-gate-input::placeholder { color:#9A8E7A }
        .bs-venta .bs-gate-submit { background:#EDE8DC; color:#141414 }

        /* Sticky footer */
        .bs-venta .bs-sticky-footer { position:sticky; bottom:0; z-index:502; display:flex; gap:8px; padding:12px 20px; padding-bottom:max(12px, calc(env(safe-area-inset-bottom) + 8px)); background:#1a1a1a; border-top:1px solid rgba(237,232,220,0.08) }
        .bs-venta .bs-wsp-cta { display:flex; align-items:center; justify-content:center; gap:8px; flex:1; padding:12px; background:#1EA952; border:none; border-radius:10px; color:#fff; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; text-decoration:none; min-height:44px; transition:opacity 0.2s }
        .bs-venta .bs-wsp-cta:active { opacity:0.85 }
        .bs-venta .bs-share-btn { display:flex; align-items:center; justify-content:center; gap:6px; padding:12px 16px; background:transparent; border:1px solid rgba(237,232,220,0.15); border-radius:10px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:400; cursor:pointer; transition:opacity 0.2s }

        /* Broker questions (dark) */
        .bs-venta .bs-q-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px }
        .bs-venta .bs-q-header .bs-sl { margin-bottom:0 }
        .bs-venta .bs-q-hint { font-size:11px; color:#9A8E7A; font-family:'DM Sans',sans-serif; white-space:nowrap }
        .bs-venta .bs-q-list { display:flex; flex-direction:column; gap:6px }
        .bs-venta .bs-q-item { display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:14px; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.1); cursor:pointer; text-align:left; transition:border-color 0.15s,background 0.15s; font-family:'DM Sans',sans-serif; -webkit-tap-highlight-color:transparent }
        .bs-venta .bs-q-item.selected { border-color:#3A6A48; border-width:2px; background:rgba(58,106,72,0.08); padding:9px 11px }
        .bs-venta .bs-q-item.disabled { opacity:0.35; cursor:default }
        .bs-venta .bs-q-check { width:18px; height:18px; min-width:18px; border-radius:4px; border:1.5px solid rgba(237,232,220,0.2); display:flex; align-items:center; justify-content:center; transition:background 0.15s,border-color 0.15s }
        .bs-venta .bs-q-check.checked { background:#3A6A48; border-color:#3A6A48 }
        .bs-venta .bs-q-text { font-size:13px; font-weight:300; color:#EDE8DC; line-height:1.4 }

        /* Similar properties */
        .bs-venta .bs-sim-card { background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.1) }
        .bs-venta .bs-sim-card:active { border-color:#3A6A48 }
        .bs-venta .bs-sim-thumb { background:#2a2a2a }
        .bs-venta .bs-sim-nophoto { background:#2a2a2a }
        .bs-venta .bs-sim-name { color:#EDE8DC }
        .bs-venta .bs-sim-price { color:#EDE8DC }
        .bs-venta .bs-sim-specs { color:#9A8E7A }

      `}</style>
    </>
  )
}

// ===== SEO Head Component =====
function VentasHead({ seo, brokerSlug = null, publicShareHash = null }: {
  seo: VentasSEO
  brokerSlug?: string | null
  publicShareHash?: string | null
}) {
  const mesAnio = formatMesAnioSEO(seo.fechaActualizacion)
  const fechaCorta = formatFechaCortaSEO(seo.fechaActualizacion)
  // URL canónica según contexto. Sin esto, og:url devuelve el feed público
  // aunque el broker esté en /broker/[slug] o un cliente en /b/[hash],
  // y al compartir el browser/WhatsApp comparte la URL genérica.
  const url = publicShareHash
    ? `https://simonbo.com/b/${publicShareHash}`
    : brokerSlug
    ? `https://simonbo.com/broker/${brokerSlug}`
    : 'https://simonbo.com/ventas'

  const title = `${seo.totalPropiedades} Departamentos en Venta en Equipetrol — Desde ${fmtSEO(seo.tipologias[0]?.precioMediano || 85000)} | Simon`
  const description = `Departamentos en venta en Equipetrol, Santa Cruz, Bolivia. ${seo.totalPropiedades} unidades activas. Precio mediano del m²: ${fmtSEO(seo.medianaPrecioM2)} USD. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`

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
          { '@type': 'ListItem', position: 2, name: 'Departamentos en Venta', item: url },
        ],
      },
      {
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: `Departamentos en venta en Equipetrol — ${mesAnio}`,
        description: `${seo.totalPropiedades} departamentos en venta en Equipetrol. Precio mediano del m²: ${fmtSEO(seo.medianaPrecioM2)} USD. Cobertura: 5 zonas. Fuentes: Century 21, Remax, Bien Inmuebles.`,
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
          { '@type': 'PropertyValue', name: 'Precio mediano por metro cuadrado', value: seo.medianaPrecioM2, unitText: 'USD/m2' },
          { '@type': 'PropertyValue', name: 'Departamentos en venta', value: seo.totalPropiedades, unitText: 'unidades' },
          { '@type': 'PropertyValue', name: 'Actividad de mercado mensual', value: seo.absorcionPct, unitText: 'porcentaje' },
          ...seo.tipologias.map(t => ({
            '@type': 'PropertyValue',
            name: `Precio mediano ${DORM_LABELS_SEO[t.dormitorios] || t.dormitorios + 'D'}`,
            value: t.precioMediano,
            unitText: 'USD',
          })),
          ...seo.zonas.map(z => ({
            '@type': 'PropertyValue',
            name: `Precio m² en ${z.zonaDisplay}`,
            value: z.medianaPrecioM2,
            unitText: 'USD/m2',
          })),
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Cuantos departamentos hay en venta en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `En ${mesAnio} hay ${seo.totalPropiedades} departamentos en venta en Equipetrol, Santa Cruz de la Sierra, Bolivia. Datos actualizados diariamente. Fuente: Simon Inteligencia Inmobiliaria (simonbo.com/ventas).`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cuanto cuesta un departamento en Equipetrol, Santa Cruz?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: seo.tipologias.map(t =>
                `${DORM_LABELS_SEO[t.dormitorios] || t.dormitorios + 'D'}: ${fmtSEO(t.precioMediano)} USD mediano (rango ${fmtSEO(t.precioP25)}–${fmtSEO(t.precioP75)}), ${t.unidades} unidades.`
              ).join(' ') + ` Datos de ${mesAnio}. Fuente: simonbo.com/ventas.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cual es el precio del metro cuadrado en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El precio mediano del m² en Equipetrol es ${fmtSEO(seo.medianaPrecioM2)} USD (${mesAnio}). Por zona: ${seo.zonas.map(z => `${z.zonaDisplay}: ${fmtSEO(z.medianaPrecioM2)}/m²`).join(', ')}. Fuente: simonbo.com/ventas.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Donde puedo ver departamentos en venta en Equipetrol con precios reales?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Simon (simonbo.com/ventas) muestra ${seo.totalPropiedades} departamentos en venta en Equipetrol con precios verificados y actualizados diariamente desde Century 21, Remax y Bien Inmuebles. Incluye filtros por zona, dormitorios, precio y estado de entrega.`,
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
      <meta name="theme-color" content="#141414" />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:image" content="https://simonbo.com/skyline-equipetrol.jpg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="Simon — Inteligencia Inmobiliaria" />
      <meta property="og:locale" content="es_BO" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content="https://simonbo.com/skyline-equipetrol.jpg" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph) }}
      />
    </Head>
  )
}

// ===== getStaticProps — SEO data + initial properties =====
export const getStaticProps: GetStaticProps<{ seo: VentasSEO; initialProperties: UnidadVenta[] }> = async () => {
  const { supabase } = await import('@/lib/supabase')
  const data = await fetchMercadoData()

  // Fetch initial properties (default filters: recientes, solo_con_fotos)
  let initialProperties: UnidadVenta[] = []
  try {
    if (!supabase) throw new Error('Supabase not configured')
    const { data: rows } = await supabase.rpc('buscar_unidades_simple', {
      p_filtros: { limite: 500, solo_con_fotos: true, orden: 'recientes' }
    })
    if (rows) {
      initialProperties = rows.map((p: any) => ({
        id: p.id,
        proyecto: p.nombre_proyecto || 'Sin proyecto',
        desarrollador: p.desarrollador || null,
        zona: p.zona || 'Sin zona',
        microzona: p.microzona || null,
        dormitorios: p.dormitorios ?? 0,
        banos: p.banos ? parseFloat(String(p.banos)) : null,
        precio_usd: parseFloat(String(p.precio_usd)) || 0,
        precio_m2: parseFloat(String(p.precio_m2)) || 0,
        area_m2: parseFloat(String(p.area_m2)) || 0,
        score_calidad: p.score_calidad ?? null,
        agente_nombre: p.agente_nombre || null,
        agente_telefono: p.agente_telefono || null,
        agente_oficina: p.agente_oficina || null,
        fotos_urls: p.fotos_urls || [],
        fotos_count: p.fotos_count || 0,
        url: p.url || '',
        amenities_lista: p.amenities_lista || [],
        es_multiproyecto: p.es_multiproyecto || false,
        estado_construccion: p.estado_construccion || 'no_especificado',
        dias_en_mercado: p.dias_en_mercado ?? null,
        amenities_confirmados: p.amenities_confirmados || [],
        amenities_por_verificar: p.amenities_por_verificar || [],
        equipamiento_detectado: p.equipamiento_detectado || [],
        descripcion: p.descripcion || null,
        latitud: p.latitud ? parseFloat(String(p.latitud)) : null,
        longitud: p.longitud ? parseFloat(String(p.longitud)) : null,
        estacionamientos: p.estacionamientos ?? null,
        baulera: p.baulera ?? null,
        fecha_entrega: p.fecha_entrega || null,
        piso: p.piso || null,
        plan_pagos_desarrollador: p.plan_pagos_desarrollador ?? null,
        acepta_permuta: p.acepta_permuta ?? null,
        solo_tc_paralelo: p.solo_tc_paralelo ?? null,
        precio_negociable: p.precio_negociable ?? null,
        descuento_contado_pct: p.descuento_contado_pct ?? null,
        parqueo_incluido: p.parqueo_incluido ?? null,
        parqueo_precio_adicional: p.parqueo_precio_adicional ?? null,
        baulera_incluido: p.baulera_incluido ?? null,
        baulera_precio_adicional: p.baulera_precio_adicional ?? null,
        plan_pagos_cuotas: p.plan_pagos_cuotas ?? null,
        plan_pagos_texto: p.plan_pagos_texto || null,
        fuente: p.fuente || '',
        tc_sospechoso: p.tc_sospechoso ?? false,
      }))
    }
  } catch (err) {
    console.error('getStaticProps: error fetching initial properties', err)
  }

  return {
    props: {
      seo: {
        totalPropiedades: data.kpis.totalPropiedades,
        medianaPrecioM2: data.kpis.medianaPrecioM2,
        absorcionPct: data.kpis.absorcionPct,
        fechaActualizacion: data.kpis.fechaActualizacion,
        generatedAt: data.generatedAt,
        tipologias: data.tipologias.map(t => ({
          dormitorios: t.dormitorios,
          unidades: t.unidades,
          precioMediano: t.precioMediano,
          precioP25: t.precioP25,
          precioP75: t.precioP75,
        })),
        zonas: data.zonas.map(z => ({
          zonaDisplay: z.zonaDisplay,
          unidades: z.unidades,
          medianaPrecioM2: z.medianaPrecioM2,
        })),
      },
      initialProperties,
    },
    revalidate: 21600, // 6 hours
  }
}
