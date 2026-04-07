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

// ===== Constants =====
const MIN_PRICE = 30000
const MAX_PRICE = 400000
const PRICE_STEP = 10000
const FILTER_CARD_POSITION = 3
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
  entrega: string, orden: FiltrosVentaSimple['orden']
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
function FilterControls({ minPrice, maxPrice, selectedDorms, selectedZonas, entrega, orden, onMinPrice, onMaxPrice, onToggleZona, onToggleDorm, onEntrega, onOrden }: {
  minPrice: number; maxPrice: number; selectedDorms: Set<number>; selectedZonas: Set<string>; entrega: string; orden: FiltrosVentaSimple['orden']
  onMinPrice: (v: number) => void; onMaxPrice: (v: number) => void; onToggleZona: (db: string) => void; onToggleDorm: (d: number) => void; onEntrega: (v: string) => void; onOrden: (v: FiltrosVentaSimple['orden']) => void
}) {
  return (
    <>
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
            value={minPrice} onChange={e => onMinPrice(parseInt(e.target.value))} />
          <input type="range" className="vf-slider vf-slider-max" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={maxPrice} onChange={e => onMaxPrice(parseInt(e.target.value))} />
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
function DesktopFilters({ currentFilters, isFiltered, onApply, onReset }: {
  currentFilters: FiltrosVentaSimple; isFiltered: boolean
  onApply: (f: FiltrosVentaSimple) => void; onReset: () => void
}) {
  const [minPrice, setMinPrice] = useState(currentFilters.precio_min || MIN_PRICE)
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_max || MAX_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set())
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set(currentFilters.zonas_permitidas || []))
  const [entrega, setEntrega] = useState(currentFilters.estado_entrega || '')
  const [orden, setOrden] = useState<FiltrosVentaSimple['orden']>(currentFilters.orden || 'recientes')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const autoApply = useCallback((mnP: number, mxP: number, dorms: Set<number>, zonas: Set<string>, ent: string, ord: FiltrosVentaSimple['orden']) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onApply(buildFilters(mnP, mxP, dorms, zonas, ent, ord))
    }, 400)
  }, [onApply])

  function toggleZona(db: string) { setSelectedZonas(prev => { const n = new Set(prev); if (n.has(db)) n.delete(db); else n.add(db); autoApply(minPrice, maxPrice, selectedDorms, n, entrega, orden); return n }) }
  function toggleDorm(d: number) { setSelectedDorms(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); autoApply(minPrice, maxPrice, n, selectedZonas, entrega, orden); return n }) }
  function handleMinPrice(v: number) { const c = Math.min(v, maxPrice - PRICE_STEP); setMinPrice(c); autoApply(c, maxPrice, selectedDorms, selectedZonas, entrega, orden) }
  function handleMaxPrice(v: number) { const c = Math.max(v, minPrice + PRICE_STEP); setMaxPrice(c); autoApply(minPrice, c, selectedDorms, selectedZonas, entrega, orden) }
  function handleEntrega(v: string) { setEntrega(v); autoApply(minPrice, maxPrice, selectedDorms, selectedZonas, v, orden) }
  function handleOrden(v: FiltrosVentaSimple['orden']) { setOrden(v); autoApply(minPrice, maxPrice, selectedDorms, selectedZonas, entrega, v) }

  return (
    <div className="vf-wrap">
      <FilterControls minPrice={minPrice} maxPrice={maxPrice} selectedDorms={selectedDorms} selectedZonas={selectedZonas}
        entrega={entrega} orden={orden} onMinPrice={handleMinPrice} onMaxPrice={handleMaxPrice}
        onToggleZona={toggleZona} onToggleDorm={toggleDorm} onEntrega={handleEntrega} onOrden={handleOrden} />
      {isFiltered && <button className="vf-reset" onClick={onReset}>Quitar filtros</button>}
    </div>
  )
}

// ===== Desktop VentaCard =====
function VentaCard({ property: p, isFavorite, onToggleFavorite, onShare, onPhotoTap, onDetails, isFirst }: {
  property: UnidadVenta; isFavorite: boolean; isFirst?: boolean
  onToggleFavorite: () => void; onShare: () => void; onPhotoTap: (idx: number) => void; onDetails: () => void
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls?.length > 0 ? p.fotos_urls : []
  const hasPhotos = photos.length > 0
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!!isFirst)

  useEffect(() => {
    if (isFirst) return
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [isFirst])
  const amenities = p.amenities_confirmados || []
  const equipamiento = p.equipamiento_detectado || []

  return (
    <div className="vc" ref={cardRef}>
      <div className="vc-photo" style={hasPhotos && visible ? { backgroundImage: `url('${photos[photoIdx]}')`, cursor: 'pointer' } : undefined}
        onClick={() => { if (hasPhotos) onPhotoTap(photoIdx) }}>
        {!hasPhotos && <div className="vc-nofoto">Sin fotos</div>}
        {photos.length > 1 && (<>
          {photoIdx > 0 && <button className="vc-nav vc-nav-prev" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx - 1) }}><ChevronLeft /></button>}
          {photoIdx < photos.length - 1 && <button className="vc-nav vc-nav-next" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx + 1) }}><ChevronRight /></button>}
          <div className="vc-photo-count">{photoIdx + 1}/{photos.length}</div>
        </>)}
        <button className={`vc-fav ${isFavorite ? 'active' : ''}`} onClick={e => { e.stopPropagation(); onToggleFavorite() }}><HeartIcon filled={isFavorite} /></button>
        <button className="vc-share" onClick={e => { e.stopPropagation(); onShare() }}><ShareIcon /></button>
      </div>
      <div className="vc-body">
        <div className="vc-name">{p.proyecto}</div>
        <div className="vc-zona">{displayZona(p.zona)} <span className="vc-id">#{p.id}</span></div>
        <div className="vc-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')}</div>
        <div className="vc-m2">$us {Math.round(p.precio_m2).toLocaleString('en-US')}/m²</div>
        <div className="vc-usd-note">USD oficial</div>
        <div className="vc-specs">{[
          p.area_m2 > 0 ? `${Math.round(p.area_m2)}m²` : null,
          p.dormitorios !== null ? (p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`) : null,
          p.banos !== null ? `${p.banos} baño${p.banos !== 1 ? 's' : ''}` : null,
          p.piso ? `${p.piso}° piso` : null,
        ].filter(Boolean).join(' · ')}</div>
        <div className="vc-badges">
          {p.dias_en_mercado !== null && p.dias_en_mercado <= 7 && <span className="vc-badge green">Nuevo</span>}
          {p.precio_negociable && <span className="vc-badge">Negociable</span>}
          {p.plan_pagos_desarrollador && <span className="vc-badge">Plan pagos</span>}
          {p.descuento_contado_pct && p.descuento_contado_pct > 0 && <span className="vc-badge">-{p.descuento_contado_pct}% ctdo</span>}
          {p.estado_construccion === 'preventa' && <span className="vc-badge">{p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa'}</span>}
          {p.parqueo_incluido && <span className="vc-badge">Parqueo incl.</span>}
          {p.baulera_incluido && <span className="vc-badge">Baulera incl.</span>}
        </div>
        {amenities.length > 0 && (
          <div className="vc-features">
            <svg className="vc-features-icon icon-building" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18M3 7v14M21 7v14M6 21V10M10 21V10M14 21V10M18 21V10M3 7l9-4 9 4"/></svg>
            <span>{amenities.slice(0, 3).join(' · ')}</span>
            {amenities.length > 3 && <span className="vc-features-count">+{amenities.length - 3}</span>}
          </div>
        )}
        {equipamiento.length > 0 && (
          <div className="vc-features">
            <svg className="vc-features-icon icon-unit" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>{equipamiento.slice(0, 3).join(' · ')}</span>
            {equipamiento.length > 3 && <span className="vc-features-count">+{equipamiento.length - 3}</span>}
          </div>
        )}
        <div className="vc-actions">
          <button className="vc-details-btn" onClick={onDetails}>Ver detalles</button>
          {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="vc-ver">Ver original &#8599;</a>}
        </div>
      </div>
    </div>
  )
}

// ===== Mobile TikTok VentaCard (55% foto / 45% contenido) =====
function MobileVentaCard({ property: p, isFavorite, onToggleFavorite, onShare, onPhotoTap, onDetails, isSpotlight, isFirst }: {
  property: UnidadVenta; isFavorite: boolean; isSpotlight?: boolean; isFirst?: boolean
  onToggleFavorite: () => void; onShare: () => void; onPhotoTap: (idx: number) => void; onDetails: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls?.length > 0 ? p.fotos_urls : []
  const amenities = p.amenities_confirmados || []
  const zoneRef = useRef<HTMLDivElement>(null)
  const [maxLoaded, setMaxLoaded] = useState(isFirst ? 2 : 0)

  // Lazy: only start loading when card enters viewport
  useEffect(() => {
    if (isFirst) return
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
            const useRealImg = isFirst && i === 0 && url
            return (
            <div key={i} className="mc-slide" style={!useRealImg ? (shouldLoad && url ? { backgroundImage: `url('${url}')`, cursor: 'pointer' } : { cursor: 'pointer' }) : { cursor: 'pointer' }}
              onClick={() => onPhotoTap(i)}>
              {useRealImg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" fetchPriority="high" draggable={false} className="mc-slide-img" />
              )}
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

      {/* Content zone (45%) */}
      <div className="mc-content">
        <div className="mc-name">{p.proyecto}</div>
        <div className="mc-zona">{displayZona(p.zona)} <span className="mc-id">#{p.id}</span></div>
        <div className="mc-price-block">
          <div className="mc-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')}</div>
          <div className="mc-specs">{[
            p.dormitorios !== null ? (p.dormitorios === 0 ? 'Monoambiente' : `${p.dormitorios} dorm`) : null,
            p.area_m2 > 0 ? `${Math.round(p.area_m2)} m²` : null,
            p.banos !== null ? `${p.banos} baño${p.banos !== 1 ? 's' : ''}` : null,
          ].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="mc-specs-2">{[
          p.precio_m2 > 0 ? `$us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m²` : null,
          p.estado_construccion === 'preventa'
            ? (p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa')
            : 'Entrega inmediata',
          p.dias_en_mercado !== null && p.dias_en_mercado <= 7 ? 'Nuevo' : null,
        ].filter(Boolean).join('   ·   ')}</div>
        <div className="mc-actions">
          <button className={`mc-btn mc-fav ${isFavorite ? 'active' : ''}`} onClick={onToggleFavorite}>
            <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : '#7A7060'} strokeWidth="1.5" style={{ width: 22, height: 22 }}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <button className="mc-btn mc-share" onClick={onShare}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 18, height: 18 }}>
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg> Compartir
          </button>
          <button className="mc-btn mc-info" onClick={onDetails}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg> Ver mas
          </button>
        </div>
        {p.agente_telefono && (
          <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola, vi este departamento en Simon y me interesa: ${p.proyecto} - $$us {Math.round(p.precio_usd).toLocaleString('en-US')}${p.url ? '\n' + p.url : ''}`)}`}
            target="_blank" rel="noopener noreferrer" className="mc-wsp"
            onClick={() => trackEvent('click_whatsapp_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_usd), source: 'card_mobile' })}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
            Consultar por WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}

// ===== Mobile Filter Card (full-screen, snaps in feed) =====
function MobileFilterCard({ totalCount, filteredCount, isFiltered, onApply, onReset }: {
  totalCount: number; filteredCount: number; isFiltered: boolean
  onApply: (f: FiltrosVentaSimple) => void; onReset: () => void
}) {
  const [minPrice, setMinPrice] = useState(MIN_PRICE)
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set())
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set())
  const [entrega, setEntrega] = useState('')
  const [orden, setOrden] = useState<FiltrosVentaSimple['orden']>('recientes')

  function handleMinPrice(v: number) { setMinPrice(Math.min(v, maxPrice - PRICE_STEP)) }
  function handleMaxPrice(v: number) { setMaxPrice(Math.max(v, minPrice + PRICE_STEP)) }
  function toggleZona(db: string) { setSelectedZonas(prev => { const n = new Set(prev); if (n.has(db)) n.delete(db); else n.add(db); return n }) }
  function toggleDorm(d: number) { setSelectedDorms(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n }) }

  function apply() {
    onApply(buildFilters(minPrice, maxPrice, selectedDorms, selectedZonas, entrega, orden))
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
          entrega={entrega} orden={orden} onMinPrice={handleMinPrice} onMaxPrice={handleMaxPrice}
          onToggleZona={toggleZona} onToggleDorm={toggleDorm} onEntrega={v => setEntrega(v)} onOrden={v => setOrden(v)} />
      </div>
      <button className="mfc-cta" onClick={apply}>APLICAR FILTROS</button>
      {isFiltered && <button className="mfc-reset" onClick={onReset}>Quitar filtros · ver todas</button>}
      <div className="mfc-skip">seguí explorando &darr;</div>
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
      <button className="mfc-close" onClick={onClose}>&times;</button>
      <div className="mfc-photo" style={photos[photoIdx] ? { backgroundImage: `url('${photos[photoIdx]}')` } : undefined}>
        {photos.length > 1 && (<>
          {photoIdx > 0 && <button className="mfc-nav mfc-nav-prev" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx - 1) }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>}
          {photoIdx < photos.length - 1 && <button className="mfc-nav mfc-nav-next" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx + 1) }}>
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
            <img src={url} alt={`Foto ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'} draggable={false} />
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
function BottomSheet({ property: p, isOpen, onClose, onShare, isFavorite, onToggleFavorite, gateCompleted, onGate, isDesktop }: {
  property: UnidadVenta | null; isOpen: boolean; onClose: () => void; onShare?: () => void
  isFavorite?: boolean; onToggleFavorite?: () => void
  gateCompleted: boolean; onGate: (n: string, t: string, c: string, url: string) => void; isDesktop: boolean
}) {
  const [gateName, setGateName] = useState('')
  const [gateTel, setGateTel] = useState('')
  const [gateEmail, setGateEmail] = useState('')
  const [showGate, setShowGate] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  // Reset state when property changes
  const propId = p?.id
  useEffect(() => {
    setDescExpanded(false)
    setShowGate(false)
  }, [propId])

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
      <div className={`bs ${isOpen ? 'open' : ''} ${isDesktop ? 'bs-desktop' : ''}`}>
        <div className="bs-handle" />
        {/* Header negro — nombre, precio, zona, WhatsApp */}
        <div className="bs-dark-header">
          <div className="bs-dh-top">
            <div>
              <div className="bs-title">{p.proyecto}</div>
              <div className="bs-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')}</div>
              <div className="bs-published">
                {displayZona(p.zona)}
                {p.dias_en_mercado !== null && p.dias_en_mercado >= 0 && (
                  <> · {p.dias_en_mercado === 0 ? 'Publicado hoy' : p.dias_en_mercado === 1 ? 'Hace 1 día' : `Hace ${p.dias_en_mercado} días`}</>
                )}
              </div>
            </div>
            <div className="bs-header-actions">
              {onToggleFavorite && (
                <button className={`bs-fav ${isFavorite ? 'active' : ''}`} onClick={onToggleFavorite}>
                  <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : 'currentColor'} strokeWidth="1.5" style={{ width: 20, height: 20 }}>
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                </button>
              )}
              <button className="bs-close" onClick={onClose}>&times;</button>
            </div>
          </div>
          {p.agente_telefono && (
            <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola, vi ${p.proyecto} en Simon y me gustaría más información\n${p.url || ''}`)}`}
              target="_blank" rel="noopener noreferrer" className="bs-wsp-cta"
              onClick={() => trackEvent('click_whatsapp_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_usd), source: 'detail_sheet' })}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
              Consultar por WhatsApp
            </a>
          )}
          {onShare && (
            <button className="bs-share-btn" onClick={onShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Compartir
            </button>
          )}
          <div className="bs-price-detail">{Math.round(p.precio_m2) > 0 ? `$us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m² · ` : ''}USD oficial</div>
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

          {/* Agente info */}
          {p.agente_nombre && (
            <div className="bs-section">
              <div className="bs-agent">
                <span className="bs-agent-name">{p.agente_nombre}</span>
                {p.agente_oficina && <span className="bs-agent-office"> · {p.agente_oficina}</span>}
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

          {/* Ver original (con gate) */}
          {p.url && (
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
      </div>
    </>
  )
}

// ===== Toast =====
function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null
  return <div className="ventas-toast">{message}</div>
}

// ===== Page =====
export default function VentasPage({ seo }: { seo: VentasSEO }) {
  const [properties, setProperties] = useState<UnidadVenta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filters, setFilters] = useState<FiltrosVentaSimple>({})
  const [isFiltered, setIsFiltered] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [unfilteredCount, setUnfilteredCount] = useState(0)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
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
  // Spotlight
  const [spotlightId, setSpotlightId] = useState<number | null>(null)
  const [fetchedSpotlight, setFetchedSpotlight] = useState<UnidadVenta | null>(null)
  const isDesktop = useIsDesktop()
  const router = useRouter()
  const fetchGenRef = useRef(0)
  const feedRef = useRef<HTMLDivElement>(null)

  // Check gate status from localStorage
  useEffect(() => {
    try { if (localStorage.getItem('ventas_gate_v1')) setGateCompleted(true) } catch {}
  }, [])

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

  function openSheet(p: UnidadVenta) {
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
    trackEvent('toggle_favorite_venta', { property_id: id, action: isFav ? 'remove' : 'add' })
    setFavorites(prev => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id); showToast('Quitado de favoritos') }
      else { n.add(id); showToast('Agregado a favoritos') }
      return n
    })
  }
  function shareProperty(p: UnidadVenta) {
    const url = `${window.location.origin}/ventas?id=${p.id}`
    navigator.clipboard.writeText(url).then(() => showToast('Link copiado')).catch(() => showToast('No se pudo copiar'))
    trackEvent('share_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona) })
  }

  const activeFilterCount = useMemo(() => {
    let c = 0
    if (filters.zonas_permitidas?.length) c += filters.zonas_permitidas.length
    if (filters.precio_min && filters.precio_min > MIN_PRICE) c++
    if (filters.precio_max && filters.precio_max < MAX_PRICE) c++
    if (filters.dormitorios_lista?.length) c++
    if (filters.estado_entrega) c++
    return c
  }, [filters])

  // Persist favorites
  useEffect(() => { try { const s = localStorage.getItem('ventas_favorites_v1'); if (s) setFavorites(new Set(JSON.parse(s))) } catch {} }, [])
  useEffect(() => { if (favorites.size > 0) localStorage.setItem('ventas_favorites_v1', JSON.stringify([...favorites])) }, [favorites])

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
      if (!f || Object.keys(f).length === 0) setUnfilteredCount(result.total)
      return result.total
    } catch (err) {
      if (gen !== fetchGenRef.current) return 0
      console.error('Error fetching ventas:', err); setLoadError(true); return 0
    } finally { if (gen === fetchGenRef.current) setLoading(false) }
  }, [filters])

  useEffect(() => { fetchProperties() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Build feed items (mobile): spotlight first, then property cards + filter card
  const feedItems = useMemo(() => {
    const items: Array<{ type: 'property'; data: UnidadVenta; isSpotlight?: boolean } | { type: 'filter' }> = []
    let filterInserted = false
    const mobileProps = spotlightProperty
      ? [spotlightProperty, ...properties.filter(p => p.id !== spotlightId)]
      : properties
    mobileProps.forEach((p, i) => {
      items.push({ type: 'property', data: p, isSpotlight: i === 0 && !!spotlightProperty })
      if (i === FILTER_CARD_POSITION - 1 && !filterInserted) { items.push({ type: 'filter' }); filterInserted = true }
    })
    if (mobileProps.length > 0 && !filterInserted) items.push({ type: 'filter' })
    return items
  }, [properties, spotlightProperty, spotlightId])

  return (
    <>
      <VentasHead seo={seo} />
      {/* Preload first photo for faster LCP */}
      {properties.length > 0 && properties[0].fotos_urls?.[0] && (
        <Head>
          <link rel="preload" as="image" href={properties[0].fotos_urls[0]} fetchPriority="high" />
        </Head>
      )}

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
        onToggleFavorite={sheetProperty ? () => toggleFavorite(sheetProperty.id) : undefined}
        gateCompleted={gateCompleted} onGate={handleGate} isDesktop={isDesktop} />

      {isDesktop ? (
        /* ===== DESKTOP (unchanged) ===== */
        <div className="ventas-desktop">
          <aside className="ventas-sidebar">
            <div className="ventas-sidebar-header">
              <Link href="/landing-v2" className="ventas-logo">Simon</Link>
              <div className="ventas-label">VENTAS</div>
            </div>
            <div className="ventas-sidebar-count">
              <span className="ventas-count-num">{properties.length}</span>
              <span className="ventas-count-text">{isFiltered ? `de ${unfilteredCount} departamentos` : 'departamentos en Equipetrol'}</span>
            </div>
            <DesktopFilters currentFilters={filters} isFiltered={isFiltered} onApply={applyFilters} onReset={resetFilters} />
          </aside>
          <main className="ventas-main">
            {/* View mode toggle */}
            {properties.length > 0 && (
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
            {/* Desktop spotlight */}
            {spotlightProperty && (
              <div className="ds-spotlight">
                <div className="ds-spotlight-banner">
                  <span>Te compartieron este departamento</span>
                  <button className="ds-spotlight-close" onClick={() => setSpotlightId(null)}>&times;</button>
                </div>
                <VentaCard property={spotlightProperty} isFavorite={favorites.has(spotlightProperty.id)}
                  onToggleFavorite={() => toggleFavorite(spotlightProperty.id)} onShare={() => shareProperty(spotlightProperty)}
                  onPhotoTap={(idx) => openViewer(spotlightProperty, idx)} onDetails={() => openSheet(spotlightProperty)} />
                <div className="ds-spotlight-sep">
                  <span className="ds-spotlight-line" /><span className="ds-spotlight-text">Explorar más departamentos</span><span className="ds-spotlight-line" />
                </div>
              </div>
            )}
            {properties.length > 0 && viewMode === 'grid' && (
              <div className="ventas-grid">
                {(spotlightProperty ? properties.filter(p => p.id !== spotlightId) : properties).map((p, idx) => (
                  <VentaCard key={p.id} property={p} isFavorite={favorites.has(p.id)} isFirst={idx === 0}
                    onToggleFavorite={() => toggleFavorite(p.id)} onShare={() => shareProperty(p)}
                    onPhotoTap={(idx) => openViewer(p, idx)} onDetails={() => openSheet(p)} />
                ))}
              </div>
            )}
            {properties.length > 0 && viewMode === 'map' && (
              <div className="ventas-map-container">
                <VentaMap properties={properties} onSelectProperty={(id) => setMapSelectedId(id)} selectedId={mapSelectedId} />
                {mapSelectedId && (() => {
                  const sp = properties.find(x => x.id === mapSelectedId)
                  if (!sp) return null
                  return <MapFloatCard property={sp} isFavorite={favorites.has(sp.id)} onClose={() => setMapSelectedId(null)} onOpenDetail={() => { setMapSelectedId(null); openSheet(sp) }} onToggleFavorite={() => toggleFavorite(sp.id)} />
                })()}
              </div>
            )}
          </main>
        </div>
      ) : (
        /* ===== MOBILE TIKTOK FEED ===== */
        <>
          {/* Top bar — pills flotantes (inmersivo) */}
          <div className="mt-top-bar">
            <a href="/landing-v2" className="mt-top-bar-left">
              <svg width={18} height={18} viewBox="0 0 64 64" fill="none" style={{flexShrink:0}}>
                <circle cx="32" cy="34" r="28" fill="#EDE8DC"/>
                <circle cx="32" cy="15" r="6" fill="#3A6A48"/>
                <circle cx="32" cy="15" r="3" fill="#141414"/>
              </svg>
              <span className="mt-logo">Simon</span>
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="mt-filter-btn" onClick={() => {
                const filterIdx = feedItems.findIndex(i => i.type === 'filter')
                if (filterIdx >= 0 && feedRef.current) {
                  feedRef.current.scrollTo({ top: filterIdx * feedRef.current.clientHeight, behavior: 'smooth' })
                }
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                {isFiltered && <div className="mt-filter-dot" />}
              </button>
            </div>
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

          {/* Full-screen mobile map */}
          {mobileMapOpen && (
            <div className="mt-map-overlay">
              <div className="mt-map-header">
                <span className="mt-map-title">Mapa de Ventas</span>
                <button className="mt-map-close" onClick={() => { setMobileMapOpen(false); setMapSelectedId(null) }}>&times;</button>
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
                return <div key={item.type === 'filter' ? 'filter-ph' : `ph-${(item as any).data.id}`}
                  className="mc-placeholder" />
              }
              if (item.type === 'filter') {
                return <MobileFilterCard key="filter" totalCount={unfilteredCount || totalCount} filteredCount={properties.length}
                  isFiltered={isFiltered} onApply={applyFilters} onReset={resetFilters} />
              }
              const p = item.data
              return <MobileVentaCard key={p.id} property={p} isFavorite={favorites.has(p.id)}
                isSpotlight={item.isSpotlight} isFirst={idx === 0}
                onToggleFavorite={() => toggleFavorite(p.id)} onShare={() => shareProperty(p)}
                onPhotoTap={() => openSheet(p)} onDetails={() => openSheet(p)} />
            })}
          </div>
        </>
      )}

      <style jsx global>{`
        body { background: #EDE8DC; margin: 0; }
        @media (max-width: 767px) { body { overflow: hidden; } }

        /* ===== DESKTOP LAYOUT ===== */
        .ventas-desktop { display:flex; min-height:100vh; font-family:'DM Sans',sans-serif; color:#141414 }
        .ventas-sidebar { width:320px; min-width:320px; background:#EDE8DC; border-right:1px solid #D8D0BC; position:fixed; top:0; left:0; bottom:0; overflow-y:auto; z-index:10 }
        .ventas-sidebar-header { padding:24px 20px 12px; display:flex; align-items:baseline; gap:12px }
        .ventas-logo { font-family:'Figtree',sans-serif; font-size:24px; font-weight:500; color:#141414; text-decoration:none }
        .ventas-label { font-size:11px; letter-spacing:0.5px; color:#7A7060; font-weight:600 }
        .ventas-sidebar-count { padding:8px 20px 20px }
        .ventas-count-num { font-family:'Figtree',sans-serif; font-size:48px; font-weight:500; color:#141414; display:block; line-height:1; font-variant-numeric:tabular-nums }
        .ventas-count-text { font-size:13px; color:#7A7060 }
        .ventas-main { margin-left:320px; flex:1; padding:24px; min-height:100vh }
        .ventas-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:24px }
        .ventas-map-container { height:calc(100vh - 80px); border-radius:14px; overflow:hidden; border:1px solid #D8D0BC; position:relative }

        /* Map float card — desktop */
        .mfc-desktop { position:absolute; bottom:20px; left:20px; z-index:1000; background:#1a1a1a; border:1px solid rgba(237,232,220,0.1); border-radius:14px; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.4); display:flex; width:380px; animation:mfcIn 0.2s ease-out }
        /* Map float card — mobile */
        .mfc-mobile { position:absolute; bottom:12px; left:12px; right:12px; z-index:1000; background:#1a1a1a; border:1px solid rgba(237,232,220,0.1); border-radius:14px; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.4); display:flex; animation:mfcIn 0.2s ease-out }
        @keyframes mfcIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        .mfc-close { position:absolute; top:8px; right:8px; z-index:10; width:28px; height:28px; border-radius:50%; background:rgba(20,20,20,0.6); border:none; color:#fff; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center }
        .mfc-photo { width:130px; min-width:130px; background-size:cover; background-position:center; background-color:#2a2a2a; position:relative }
        .mfc-nav { position:absolute; top:50%; transform:translateY(-50%); width:28px; height:28px; border-radius:50%; background:rgba(20,20,20,0.6); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:3 }
        .mfc-nav-prev { left:4px }
        .mfc-nav-next { right:4px }
        .mfc-count { position:absolute; bottom:6px; right:6px; background:rgba(20,20,20,0.75); color:rgba(255,255,255,0.8); font-size:10px !important; padding:2px 6px; border-radius:8px; font-family:'DM Sans',sans-serif; line-height:1.2 }
        .mfc-fav { position:absolute; top:6px; left:6px; width:32px; height:32px; border-radius:50%; background:rgba(20,20,20,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:3 }
        .mfc-fav.active { background:rgba(224,85,85,0.15) }
        .mfc-fav svg { width:16px; height:16px }
        .mfc-body { flex:1; padding:14px }
        .mfc-name { font-family:'Figtree',sans-serif; font-size:18px; color:#EDE8DC; line-height:1.2; margin-bottom:4px; font-weight:500 }
        .mfc-specs { font-size:12px; color:#9A8E7A; margin-bottom:8px; font-family:'DM Sans',sans-serif }
        .mfc-price { font-family:'DM Sans',sans-serif; font-size:22px; color:#EDE8DC; line-height:1; font-weight:500; font-variant-numeric:tabular-nums }
        .mfc-m2 { font-size:11px; color:#9A8E7A; margin-bottom:10px; font-family:'DM Sans',sans-serif }
        .mfc-detail { width:100%; padding:8px; background:rgba(237,232,220,0.08); border:1px solid rgba(237,232,220,0.1); color:#EDE8DC; font-family:'DM Sans',sans-serif; font-size:12px; cursor:pointer; border-radius:10px }

        /* View mode toggle */
        .vm-toggle { display:flex; gap:4px; margin-bottom:20px; background:#FAFAF8; border:1px solid #D8D0BC; border-radius:10px; padding:4px; width:fit-content }
        .vm-btn { display:flex; align-items:center; gap:6px; padding:8px 16px; border:none; border-radius:8px; background:transparent; color:#7A7060; font-family:'DM Sans',sans-serif; font-size:12px; cursor:pointer; transition:all 0.15s }
        .vm-btn.active { background:rgba(58,106,72,0.08); color:#141414; font-weight:600 }

        /* ===== MOBILE TIKTOK LAYOUT ===== */
        .mt-top-bar { position:fixed; top:0; left:0; right:0; z-index:50; display:flex; align-items:center; justify-content:space-between; padding:10px 16px; padding-top:max(10px, env(safe-area-inset-top)); pointer-events:none }
        .mt-top-bar > * { pointer-events:auto }
        .mt-top-bar-left { display:flex; align-items:center; gap:8px; background:rgba(20,20,20,0.55); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); padding:6px 14px; border-radius:10px; border:none; text-decoration:none }
        .mt-logo { font-family:'Figtree',sans-serif; font-size:15px; font-weight:500; color:rgba(237,232,220,0.85); letter-spacing:0.3px }
        .mt-filter-btn { width:38px; height:38px; border-radius:10px; border:none; background:rgba(20,20,20,0.55); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:rgba(237,232,220,0.85); display:flex; align-items:center; justify-content:center; cursor:pointer; position:relative }
        .mt-filter-dot { position:absolute; top:6px; right:6px; width:8px; height:8px; background:#3A6A48; border-radius:50% }
        .mt-counter { position:fixed; bottom:max(16px, calc(env(safe-area-inset-bottom) + 8px)); right:16px; z-index:50; font-size:12px; color:#7A7060; font-family:'DM Sans',sans-serif; font-weight:500; font-variant-numeric:tabular-nums }
        .mt-map-btn { position:fixed; bottom:max(140px, calc(env(safe-area-inset-bottom) + 130px)); right:20px; z-index:100; width:48px; height:48px; border-radius:50%; background:rgba(20,20,20,0.7); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.2) }
        .mt-map-overlay { position:fixed; inset:0; z-index:300; background:#141414; display:flex; flex-direction:column }
        .mt-map-header { display:flex; align-items:center; justify-content:space-between; padding:12px 20px; padding-top:max(12px, env(safe-area-inset-top)); background:#141414; border-bottom:1px solid rgba(237,232,220,0.1) }
        .mt-map-title { font-family:'Figtree',sans-serif; font-size:20px; font-weight:500; color:#EDE8DC }
        .mt-map-close { width:36px; height:36px; border-radius:10px; border:none; background:rgba(237,232,220,0.08); color:#9A8E7A; font-size:20px; display:flex; align-items:center; justify-content:center; cursor:pointer }
        .mt-map-body { flex:1; position:relative; overflow:hidden }
        .mt-map-body .venta-map { position:absolute; inset:0 }

        .mt-feed { height:100vh; height:100dvh; overflow-y:scroll; scroll-snap-type:y mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none }
        .mt-feed::-webkit-scrollbar { display:none }

        /* ===== MOBILE CARD (50% foto / 50% contenido) ===== */
        .mc { height:100vh; height:100dvh; scroll-snap-align:start; scroll-snap-stop:always; position:relative; overflow:hidden; display:flex; flex-direction:column; background:#141414 }
        .mc-placeholder { height:100vh; height:100dvh; scroll-snap-align:start; background:#141414 }

        /* Photo zone (50%) */
        .mc-photo-zone { flex:0 0 50%; position:relative; overflow:hidden }
        .mc-photo-zone::after { content:''; position:absolute; bottom:0; left:0; right:0; height:80px; background:linear-gradient(transparent, #141414); pointer-events:none; z-index:2 }
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
        .mc-spotlight { position:absolute; top:max(56px, calc(env(safe-area-inset-top) + 50px)); left:16px; z-index:10; background:rgba(250,250,248,0.95); border-left:3px solid #3A6A48; padding:8px 14px; border-radius:0 8px 8px 0; font-family:'DM Sans',sans-serif; font-size:12px; color:#141414; letter-spacing:0.3px }

        /* Desktop spotlight */
        .ds-spotlight { margin-bottom:32px }
        .ds-spotlight-banner { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; margin-bottom:16px; background:#FAFAF8; border-left:3px solid #3A6A48; border-radius:0 14px 14px 0; font-family:'DM Sans',sans-serif; font-size:14px; color:#3A3530 }
        .ds-spotlight-close { background:none; border:none; color:#7A7060; font-size:20px; cursor:pointer; padding:0 4px }
        .ds-spotlight-close:hover { color:#141414 }
        .ds-spotlight-sep { display:flex; align-items:center; gap:16px; margin-top:24px }
        .ds-spotlight-line { flex:1; height:1px; background:#D8D0BC }
        .ds-spotlight-text { font-size:12px; color:#7A7060; font-family:'DM Sans',sans-serif; letter-spacing:0.5px; white-space:nowrap; text-transform:uppercase }

        /* Content zone (45%) */
        .mc-content { flex:1; padding:0 24px 20px; padding-bottom:max(20px, calc(env(safe-area-inset-bottom) + 8px)); display:flex; flex-direction:column; overflow:hidden }
        .mc-name { font-family:'Figtree',sans-serif; font-size:24px; font-weight:500; color:#EDE8DC; line-height:1.1; margin-bottom:2px; padding-top:8px }
        .mc-zona { font-size:13px; color:#9A8E7A; letter-spacing:0.3px; margin-bottom:12px; font-family:'DM Sans',sans-serif }
        .mc-price-block { border-left:3px solid #3A6A48; padding-left:14px; margin-bottom:8px }
        .mc-price { font-family:'DM Sans',sans-serif; font-size:28px; font-weight:500; color:#EDE8DC; line-height:1; margin-bottom:6px; font-variant-numeric:tabular-nums }
        .mc-specs { font-size:13px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-weight:300; line-height:1.4 }
        .mc-specs-2 { font-size:13px; color:rgba(237,232,220,0.4); font-family:'DM Sans',sans-serif; margin-bottom:auto; font-weight:300 }
        .mc-wsp { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:12px; background:#1EA952; border:none; border-radius:10px; color:#fff; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; text-decoration:none; margin-top:auto; min-height:44px; flex-shrink:0 }
        .mc-wsp:active { opacity:0.85 }
        .mc-actions { display:flex; align-items:center; gap:12px; padding-top:10px; border-top:1px solid rgba(237,232,220,0.1); margin-top:8px }
        .mc-btn.mc-fav.shake { animation:mcShake 0.3s ease }
        @keyframes mcShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }

        /* ===== MOBILE FILTER CARD (full-screen) ===== */
        .mfc { height:100vh; height:100dvh; scroll-snap-align:start; scroll-snap-stop:always; background:#EDE8DC; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding:60px 28px 20px; padding-bottom:max(20px, calc(env(safe-area-inset-bottom) + 8px)); font-family:'DM Sans',sans-serif; overflow-y:auto }
        .mfc-header { display:flex; align-items:baseline; gap:8px; margin-bottom:6px }
        .mfc-count { font-family:'Figtree',sans-serif; font-size:40px; font-weight:500; color:#141414; line-height:1; font-variant-numeric:tabular-nums }
        .mfc-sub { font-size:15px; font-weight:400; color:#7A7060; font-family:'DM Sans',sans-serif }
        .mfc-divider { display:flex; align-items:center; gap:12px; width:100%; margin-bottom:14px }
        .mfc-line { flex:1; height:1px; background:#D8D0BC }
        .mfc-text { font-size:12px; letter-spacing:0.5px; color:#3A3530; font-weight:600; text-transform:uppercase }
        .mfc-filters { width:100%; max-width:320px; margin-bottom:12px }
        .mfc-cta { display:block; width:100%; max-width:320px; padding:15px; background:#141414; border:1px solid #141414; color:#EDE8DC; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; cursor:pointer; margin-bottom:10px; border-radius:10px; transition:all 0.3s }
        .mfc-cta:active { transform:scale(0.97) }
        .mfc-reset { display:block; width:100%; max-width:320px; padding:11px; background:transparent; border:1px solid #D8D0BC; color:#7A7060; font-family:'DM Sans',sans-serif; font-size:13px; cursor:pointer; margin-bottom:8px; border-radius:10px }
        .mfc-skip { font-size:13px; color:#7A7060; font-weight:300; font-family:'DM Sans',sans-serif }

        /* ===== FILTER COMPONENTS (shared) ===== */
        .vf-wrap { padding:0 20px 20px; border-top:1px solid #D8D0BC; padding-top:16px }
        .vf-group { margin-bottom:14px; text-align:left }
        .vf-label { font-size:12px; letter-spacing:0.5px; color:#3A3530; margin-bottom:7px; font-weight:600; font-family:'DM Sans',sans-serif; text-transform:uppercase; display:flex; align-items:center; gap:6px }
        .vf-label::before { content:''; width:6px; height:6px; border-radius:50%; background:#3A6A48; flex-shrink:0 }
        .vf-zona-btns { display:flex; flex-wrap:wrap; gap:7px }
        .vf-zona-btn { padding:7px 14px; border-radius:100px; border:1px solid #D8D0BC; background:#FAFAF8; color:#3A3530; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s }
        .vf-zona-btn:hover { border-color:#7A7060; color:#141414 }
        .vf-zona-btn.active { border:2px solid #3A6A48; color:#141414; background:#FAFAF8; font-weight:600; box-shadow:0 2px 8px rgba(58,106,72,0.12) }
        .vf-btn-row { display:flex; gap:8px }
        .vf-btn { flex:1; padding:10px 4px; border-radius:10px; border:1px solid #D8D0BC; background:#FAFAF8; color:#3A3530; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s; text-align:center }
        .vf-btn:hover { border-color:#7A7060; color:#141414 }
        .vf-btn.active { border:2px solid #3A6A48; color:#141414; background:#FAFAF8; font-weight:600; box-shadow:0 2px 8px rgba(58,106,72,0.12) }
        .vf-range-display { font-size:14px; color:#141414; margin-bottom:10px; text-align:right; font-family:'DM Sans',sans-serif; font-weight:500; font-variant-numeric:tabular-nums }
        .vf-range-wrap { position:relative; height:28px }
        .vf-slider { position:absolute; top:0; left:0; width:100%; -webkit-appearance:none; appearance:none; background:transparent; pointer-events:none; height:28px }
        .vf-slider::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:#FAFAF8; cursor:pointer; pointer-events:all; border:2px solid #141414; position:relative; z-index:2 }
        .vf-slider::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:#FAFAF8; cursor:pointer; pointer-events:all; border:2px solid #141414 }
        .vf-slider::-webkit-slider-runnable-track { height:2px; background:#D8D0BC; border-radius:2px }
        .vf-slider::-moz-range-track { height:2px; background:#D8D0BC; border-radius:2px }
        .vf-slider-min { z-index:1 }
        .vf-slider-max { z-index:2 }
        .vf-tc-note { font-size:12px; color:#7A7060; font-family:'DM Sans',sans-serif; margin-top:8px; text-align:right }
        .vf-reset { width:100%; max-width:340px; padding:10px; background:transparent; border:1px solid #D8D0BC; border-radius:10px; color:#7A7060; font-size:12px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s }
        .vf-reset:hover { border-color:#3A3530; color:#3A3530 }

        /* ===== DESKTOP VENTA CARD ===== */
        .vc { background:#FAFAF8; border:1px solid #D8D0BC; border-radius:14px; overflow:hidden; transition:all 0.25s cubic-bezier(0.4,0,0.2,1) }
        .vc:hover { transform:translateY(-4px); box-shadow:0 12px 32px rgba(58,53,48,0.08) }
        .vc-photo { height:220px; background-size:cover; background-position:center; background-color:#D8D0BC; position:relative }
        @keyframes vcShimmer { 0%,100%{background-color:#D8D0BC} 50%{background-color:#EDE8DC} }
        .vc-photo:not([style*="background-image"]) { animation:vcShimmer 1.5s ease-in-out infinite }
        .vc-nofoto { display:flex; align-items:center; justify-content:center; height:100%; color:#7A7060; font-size:13px; font-family:'DM Sans',sans-serif }
        .vc-nav { position:absolute; top:50%; transform:translateY(-50%); width:36px; height:36px; border-radius:50%; background:rgba(20,20,20,0.6); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.15s; z-index:3 }
        .vc-nav:hover { background:rgba(20,20,20,0.85) }
        .vc-nav-prev { left:8px }
        .vc-nav-next { right:8px }
        .vc-photo-count { position:absolute; top:10px; right:10px; background:rgba(20,20,20,0.75); color:rgba(255,255,255,0.8); font-size:11px; padding:3px 8px; border-radius:100px; font-family:'DM Sans',sans-serif }
        .vc-fav { position:absolute; top:10px; left:10px; width:40px; height:40px; border-radius:50%; background:rgba(20,20,20,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s; z-index:3 }
        .vc-fav:hover { transform:scale(1.1) }
        .vc-fav.active { background:rgba(224,85,85,0.15) }
        .vc-share { position:absolute; top:10px; left:58px; width:40px; height:40px; border-radius:50%; background:rgba(20,20,20,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s; z-index:3 }
        .vc-share:hover { transform:scale(1.1); background:rgba(20,20,20,0.7) }
        .vc-body { padding:16px }
        .vc-name { font-family:'Figtree',sans-serif; font-size:20px; font-weight:500; color:#141414; line-height:1.2; margin-bottom:2px }
        .vc-zona { font-size:12px; color:#7A7060; letter-spacing:0.5px; margin-bottom:10px }
        .vc-id { color:#7A7060; font-size:12px; margin-left:4px; letter-spacing:0 }
        .vc-price { font-family:'DM Sans',sans-serif; font-size:28px; font-weight:500; color:#141414; line-height:1; margin-bottom:4px; font-variant-numeric:tabular-nums }
        .vc-m2 { font-size:14px; color:#3A3530; margin-bottom:2px }
        .vc-usd-note { font-size:12px; color:#7A7060; font-family:'DM Sans',sans-serif; margin-bottom:8px }
        .vc-specs { font-size:12px; color:#3A3530; margin-bottom:10px; font-family:'DM Sans',sans-serif; display:flex; gap:8px; flex-wrap:wrap }
        .vc-badges { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px }
        .vc-badge { font-size:12px; font-weight:500; padding:3px 8px; border-radius:100px; border:1px solid #D8D0BC; color:#3A3530; font-family:'DM Sans',sans-serif }
        .vc-badge.green { border-color:#3A6A48; color:#EDE8DC; background:#3A6A48 }
        .vc-features { font-size:12px; color:#7A7060; font-family:'DM Sans',sans-serif; display:flex; align-items:center; gap:7px; margin-bottom:5px; line-height:1.4 }
        .vc-features-icon { flex-shrink:0 }
        .vc-features-icon.icon-building { color:#7A7060 }
        .vc-features-icon.icon-unit { color:#3A6A48 }
        .vc-features-count { color:#3A6A48; flex-shrink:0 }
        .vc-actions { border-top:1px solid #D8D0BC; padding-top:12px; margin-top:2px; display:flex; gap:8px }
        .vc-details-btn { flex:1; padding:8px; background:transparent; border:1px solid #D8D0BC; color:#3A3530; font-family:'DM Sans',sans-serif; font-size:12px; cursor:pointer; border-radius:10px; transition:all 0.2s }
        .vc-details-btn:hover { border-color:#3A3530; color:#141414 }
        .vc-ver { flex:1; padding:8px; background:rgba(58,53,48,0.03); border:1px solid #D8D0BC; color:#3A3530; font-family:'DM Sans',sans-serif; font-size:12px; text-align:center; text-decoration:none; border-radius:10px; transition:all 0.2s; font-weight:500 }
        .vc-ver:hover { background:rgba(58,53,48,0.08) }

        /* ===== STATES ===== */
        .ventas-status { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:300px; color:#7A7060; font-family:'DM Sans',sans-serif; font-size:15px; text-align:center }
        .ventas-status button { margin-top:12px; padding:8px 20px; background:#141414; color:#EDE8DC; border:none; border-radius:10px; cursor:pointer; font-weight:600; font-size:14px }

        /* ===== TOAST ===== */
        .ventas-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#141414; color:#EDE8DC; padding:10px 24px; border-radius:100px; font-size:13px; font-family:'DM Sans',sans-serif; z-index:100; font-weight:600 }

        /* ===== BOTTOM SHEET ===== */
        .bs-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:500; opacity:0; pointer-events:none; transition:opacity 0.3s }
        .bs-overlay.open { opacity:1; pointer-events:auto }
        .bs { position:fixed; bottom:0; left:0; right:0; max-height:80vh; background:#1a1a1a; border-radius:20px 20px 0 0; z-index:501; transform:translateY(100%); transition:transform 0.35s cubic-bezier(0.32,0.72,0,1); overflow-y:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; font-family:'DM Sans',sans-serif; color:#EDE8DC; padding-bottom:max(20px, env(safe-area-inset-bottom)) }
        .bs.open { transform:translateY(0) }
        .bs-desktop { left:auto; right:0; top:0; bottom:0; max-height:100vh; width:480px; max-width:100%; border-radius:0; border-left:1px solid rgba(237,232,220,0.1); transform:translateX(100%); transition:transform 0.35s cubic-bezier(0.32,0.72,0,1) }
        .bs-desktop.open { transform:translateX(0) }
        .bs-handle { width:40px; height:4px; background:rgba(237,232,220,0.3); border-radius:2px; margin:10px auto 0; position:relative; z-index:2 }
        .bs-desktop .bs-handle { display:none }
        .bs-dark-header { background:#141414; padding:0 24px 20px; border-radius:20px 20px 14px 14px }
        .bs .bs-handle + .bs-dark-header { padding-top:16px }
        .bs-dh-top { display:flex; align-items:flex-start; justify-content:space-between }
        .bs-title { font-family:'Figtree',sans-serif; font-size:22px; font-weight:500; color:#EDE8DC }
        .bs-header-actions { display:flex; align-items:center; gap:4px; flex-shrink:0 }
        .bs-fav { width:44px; height:44px; border-radius:50%; border:none; background:transparent; color:#9A8E7A; display:flex; align-items:center; justify-content:center; cursor:pointer }
        .bs-fav.active svg { filter:drop-shadow(0 2px 4px rgba(224,85,85,0.4)) }
        .bs-close { width:44px; height:44px; border-radius:50%; border:none; background:transparent; color:#9A8E7A; font-size:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0 }
        .bs-wsp-cta { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:14px; background:#1EA952; border:none; border-radius:10px; color:#fff; font-family:'DM Sans',sans-serif; font-size:15px; font-weight:500; text-decoration:none; min-height:44px; transition:opacity 0.2s; margin-top:16px }
        .bs-wsp-cta:active { opacity:0.85 }
        .bs-share-btn { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:12px; background:transparent; border:1px solid rgba(237,232,220,0.15); border-radius:10px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:400; cursor:pointer; margin-top:8px; transition:opacity 0.2s }
        .bs-share-btn:active { opacity:0.7 }
        .bs::-webkit-scrollbar { display:none }
        .bs-published { font-size:13px; color:#9A8E7A; font-family:'DM Sans',sans-serif; margin-top:2px }
        .bs-section { padding:18px 24px; border-bottom:1px solid rgba(237,232,220,0.08) }
        .bs-section-border { border-bottom:1px solid #D8D0BC }
        .bs-zona { font-size:14px; color:#9A8E7A; letter-spacing:0.5px }
        .bs-id { color:#7A7060; font-size:12px; margin-left:4px; letter-spacing:0 }
        .bs-location { display:inline-flex; align-items:center; gap:6px; color:#3A6A48; font-size:13px; text-decoration:none; margin-top:6px }
        .bs-gmaps-link { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:14px; background:rgba(237,232,220,0.08); border-radius:10px; color:#EDE8DC; font-family:'DM Sans',sans-serif; font-size:15px; font-weight:500; text-decoration:none; transition:opacity 0.2s }
        .bs-gmaps-link:active { opacity:0.85 }
        .bs-sl { font-size:12px; font-weight:600; color:#9A8E7A; letter-spacing:0.5px; margin-bottom:12px; font-family:'DM Sans',sans-serif; text-transform:uppercase; display:flex; align-items:center; gap:8px }
        .bs-sl-dot { width:6px; height:6px; border-radius:50%; background:#3A6A48; flex-shrink:0 }
        .bs-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px }
        .bs-feat { display:flex; flex-direction:column; align-items:center; gap:6px; padding:12px 8px; border-radius:14px; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.1); box-shadow:none }
        .bs-fi { width:20px; height:20px; color:#9A8E7A }
        .bs-fv { font-size:15px; font-weight:300; color:#EDE8DC; font-family:'DM Sans',sans-serif }
        .bs-fl { font-size:13px; font-weight:300; color:#9A8E7A; text-align:center; font-family:'DM Sans',sans-serif }
        .bs-feat.hl { border-color:rgba(237,232,220,0.15); background:rgba(237,232,220,0.08) }
        .bs-feat.hl .bs-fl { color:#EDE8DC }
        .bs-feat.hl .bs-fv { color:#EDE8DC; font-weight:600 }
        .bs-aw { display:flex; flex-wrap:wrap; gap:6px }
        .bs-at { font-size:15px; font-weight:300; padding:4px 10px; border-radius:100px; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.1); color:#EDE8DC; font-family:'DM Sans',sans-serif }
        .bs-price { font-family:'DM Sans',sans-serif; font-size:28px; font-weight:500; color:#EDE8DC; font-variant-numeric:tabular-nums }
        .bs-price-detail { font-size:13px; color:#9A8E7A; font-family:'DM Sans',sans-serif; margin-top:8px }
        .bs-badges { display:flex; flex-wrap:wrap; gap:8px }
        .bs-badge { font-size:12px; padding:4px 10px; border-radius:100px; border:1px solid rgba(237,232,220,0.15); color:#9A8E7A; font-family:'DM Sans',sans-serif; background:transparent }
        .bs-badge.gold { border-color:rgba(237,232,220,0.25); color:#EDE8DC; background:rgba(237,232,220,0.08) }
        .bs-section-title { font-size:12px; letter-spacing:0.5px; color:#3A3530; font-weight:600; margin-bottom:12px; display:flex; align-items:center; gap:8px; text-transform:uppercase }
        .bs-tags { display:flex; flex-wrap:wrap; gap:8px }
        .bs-tag { font-size:15px; padding:4px 10px; border-radius:100px; background:#FAFAF8; border:1px solid #D8D0BC; color:#3A3530; font-weight:300 }
        .bs-desc { font-size:14px; color:#9A8E7A; line-height:1.6; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; font-weight:300 }
        .bs-desc.expanded { -webkit-line-clamp:unset; display:block }
        .bs-desc-more { background:none; border:none; color:#3A6A48; font-size:13px; cursor:pointer; padding:4px 0 0; margin-top:4px; font-family:'DM Sans',sans-serif; font-weight:500 }
        .bs-agent { font-size:14px; margin-bottom:10px }
        .bs-agent-name { color:#EDE8DC }
        .bs-agent-office { color:#9A8E7A }
        .bs-wsp { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:14px; background:#1EA952; border:none; border-radius:10px; color:#fff; font-family:'DM Sans',sans-serif; font-size:15px; font-weight:500; text-decoration:none; min-height:44px; margin-top:16px }
        .bs-ver-original { width:100%; padding:14px; background:rgba(237,232,220,0.08); border:1px solid rgba(237,232,220,0.1); color:#EDE8DC; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:15px; cursor:pointer; font-weight:500; display:flex; align-items:center; justify-content:center; gap:8px }
        .bs-gate { display:flex; flex-direction:column; gap:12px }
        .bs-gate-title { font-size:14px; color:#9A8E7A; margin-bottom:4px }
        .bs-gate-input { width:100%; padding:12px 14px; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.12); border-radius:10px; color:#EDE8DC; font-family:'DM Sans',sans-serif; font-size:15px; box-sizing:border-box }
        .bs-gate-input::placeholder { color:#9A8E7A }
        .bs-gate-submit { width:100%; padding:14px; background:#EDE8DC; color:#141414; border:none; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:15px; font-weight:500; cursor:pointer }
        .bs-gate-submit:disabled { opacity:0.4; cursor:default }

      `}</style>
    </>
  )
}

// ===== SEO Head Component =====
function VentasHead({ seo }: { seo: VentasSEO }) {
  const mesAnio = formatMesAnioSEO(seo.fechaActualizacion)
  const fechaCorta = formatFechaCortaSEO(seo.fechaActualizacion)
  const url = 'https://simonbo.com/ventas'

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
export const getStaticProps: GetStaticProps<{ seo: VentasSEO }> = async () => {
  const data = await fetchMercadoData()
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
    },
    revalidate: 21600, // 6 hours
  }
}
