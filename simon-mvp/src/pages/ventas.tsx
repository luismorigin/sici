import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import type { UnidadVenta, FiltrosVentaSimple } from '@/lib/supabase'
import { ZONAS_CANONICAS, displayZona } from '@/lib/zonas'

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
  <svg viewBox="0 0 24 24" width="20" height="20" fill={filled ? '#c9a959' : 'none'} stroke={filled ? '#c9a959' : '#fff'} strokeWidth="1.5">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </svg>
)
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="1.5">
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
function VentaCard({ property: p, isFavorite, onToggleFavorite, onShare, onPhotoTap, onDetails }: {
  property: UnidadVenta; isFavorite: boolean
  onToggleFavorite: () => void; onShare: () => void; onPhotoTap: (idx: number) => void; onDetails: () => void
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls?.length > 0 ? p.fotos_urls : []
  const hasPhotos = photos.length > 0
  const amenities = p.amenities_confirmados || []
  const equipamiento = p.equipamiento_detectado || []

  return (
    <div className="vc">
      <div className="vc-photo" style={hasPhotos ? { backgroundImage: `url('${photos[photoIdx]}')`, cursor: 'pointer' } : undefined}
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
function MobileVentaCard({ property: p, isFavorite, onToggleFavorite, onShare, onPhotoTap, onDetails, isSpotlight }: {
  property: UnidadVenta; isFavorite: boolean; isSpotlight?: boolean
  onToggleFavorite: () => void; onShare: () => void; onPhotoTap: (idx: number) => void; onDetails: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls?.length > 0 ? p.fotos_urls : []
  const amenities = p.amenities_confirmados || []

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
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [photos.length])

  return (
    <div className="mc">
      {/* Photo carousel zone (55%) */}
      <div className="mc-photo-zone">
        <div className="mc-photo-scroll" ref={scrollRef}>
          {photos.length > 0 ? photos.map((url, i) => (
            <div key={i} className="mc-slide" style={{ backgroundImage: `url('${url}')`, cursor: 'pointer' }}
              onClick={() => onPhotoTap(i)} />
          )) : (
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
        <div className="mc-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')}</div>
        <div className="mc-specs">{[
          p.area_m2 > 0 ? `${Math.round(p.area_m2)}m²` : null,
          p.dormitorios !== null ? (p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`) : null,
          p.banos !== null ? `${p.banos} baño${p.banos !== 1 ? 's' : ''}` : null,
        ].filter(Boolean).join(' · ')}</div>
        <div className="mc-badges">
          {p.dias_en_mercado !== null && p.dias_en_mercado <= 7 && <span className="mc-badge-pill green">Nuevo</span>}
          {p.precio_m2 > 0 && <span className="mc-badge-pill gold">$us {Math.round(p.precio_m2).toLocaleString('en-US')}/m²</span>}
          <span className="mc-badge-pill">{p.estado_construccion === 'preventa'
            ? (p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa')
            : 'Entrega inmediata'}</span>
        </div>
        <div className="mc-actions">
          <button className={`mc-action-icon ${isFavorite ? 'active' : ''}`} onClick={onToggleFavorite}><HeartIcon filled={isFavorite} /></button>
          <button className="mc-action-icon" onClick={onShare}><ShareIcon /></button>
          <button className="mc-action-icon" onClick={onDetails}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </button>
        </div>
        {p.agente_telefono && (
          <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola, vi este departamento en Simon y me interesa: ${p.proyecto} - $$us {Math.round(p.precio_usd).toLocaleString('en-US')}${p.url ? '\n' + p.url : ''}`)}`}
            target="_blank" rel="noopener noreferrer" className="mc-wsp">
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
      {isFiltered && <button className="vf-reset" style={{ marginTop: 8 }} onClick={onReset}>Quitar filtros</button>}
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

// ===== Bottom Sheet =====
function BottomSheet({ property: p, isOpen, onClose, gateCompleted, onGate, isDesktop }: {
  property: UnidadVenta | null; isOpen: boolean; onClose: () => void
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
        <div className="bs-header">
          <div className="bs-title">{p.proyecto}</div>
          <button className="bs-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="bs-scroll">
          {/* Zona + ubicación */}
          <div className="bs-section">
            <span className="bs-zona">{displayZona(p.zona)} <span className="bs-id">#{p.id}</span></span>
            {p.latitud && p.longitud && (
              <a href={`https://www.google.com/maps?q=${p.latitud},${p.longitud}`}
                target="_blank" rel="noopener noreferrer" className="bs-location">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#c9a959" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                Ver ubicación
              </a>
            )}
          </div>

          {/* Precio PRIMERO */}
          <div className="bs-section">
            <div className="bs-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')}</div>
            <div className="bs-price-detail">$us {Math.round(p.precio_m2).toLocaleString('en-US')}/m² · USD oficial</div>
          </div>

          {/* Specs grid */}
          <div className="bs-section bs-section-border">
            <div className="bs-grid">
              {p.area_m2 > 0 && <div className="bs-feat"><span className="bs-feat-val">{Math.round(p.area_m2)}</span><span className="bs-feat-label">m²</span></div>}
              {p.dormitorios !== null && <div className="bs-feat"><span className="bs-feat-val">{p.dormitorios}</span><span className="bs-feat-label">{p.dormitorios === 0 ? 'Mono' : 'Dorm'}</span></div>}
              {p.banos !== null && <div className="bs-feat"><span className="bs-feat-val">{p.banos}</span><span className="bs-feat-label">Baño{p.banos !== 1 ? 's' : ''}</span></div>}
              {p.piso && <div className="bs-feat"><span className="bs-feat-val">{p.piso}</span><span className="bs-feat-label">Piso</span></div>}
              {p.estacionamientos && p.estacionamientos > 0 && <div className="bs-feat"><span className="bs-feat-val">{p.estacionamientos}</span><span className="bs-feat-label">Parqueo</span></div>}
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
              <div className="bs-section-title">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" style={{opacity:0.6}}><path d="M3 21h18M3 7v14M21 7v14M6 21V10M10 21V10M14 21V10M18 21V10M3 7l9-4 9 4"/></svg>
                Edificio
              </div>
              <div className="bs-tags">{amenities.map((a, i) => <span key={i} className="bs-tag">{a}</span>)}</div>
            </div>
          )}

          {/* Equipamiento */}
          {equipamiento.length > 0 && (
            <div className="bs-section">
              <div className="bs-section-title">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#c9a959" strokeWidth="1.5" style={{opacity:0.6}}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                Departamento
              </div>
              <div className="bs-tags">{equipamiento.map((e, i) => <span key={i} className="bs-tag">{e}</span>)}</div>
            </div>
          )}

          {/* Descripción (colapsable) */}
          {p.descripcion && (
            <div className="bs-section">
              <div className="bs-section-title">Sobre esta propiedad</div>
              <div className={`bs-desc ${descExpanded ? 'expanded' : ''}`}>{p.descripcion}</div>
              {p.descripcion.length > 150 && !descExpanded && (
                <button className="bs-desc-more" onClick={() => setDescExpanded(true)}>Ver más</button>
              )}
            </div>
          )}

          {/* Agente + WhatsApp */}
          {p.agente_telefono && (
            <div className="bs-section">
              {p.agente_nombre && (
                <div className="bs-agent">
                  <span className="bs-agent-name">{p.agente_nombre}</span>
                  {p.agente_oficina && <span className="bs-agent-office"> · {p.agente_oficina}</span>}
                </div>
              )}
              <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola, vi ${p.proyecto} en Simon y me gustaría más información\n${p.url || ''}`)}`}
                target="_blank" rel="noopener noreferrer" className="bs-wsp">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
                Consultar por WhatsApp
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
export default function VentasPage() {
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
  }

  function openSheet(p: UnidadVenta) {
    setSheetProperty(p)
    setSheetOpen(true)
  }

  function handleGate(nombre: string, telefono: string, correo: string, url: string) {
    try { localStorage.setItem('ventas_gate_v1', JSON.stringify({ nombre, telefono, correo, ts: new Date().toISOString() })) } catch {}
    setGateCompleted(true)
    window.open(url, '_blank')
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
      <Head>
        <title>Simon · Departamentos en Venta · Equipetrol</title>
        <meta name="description" content="Departamentos en venta en Equipetrol, Santa Cruz. Datos reales, precios actualizados." />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#0a0a0a" />
      </Head>

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
                <button className={`vm-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  Grid
                </button>
                <button className={`vm-btn ${viewMode === 'map' ? 'active' : ''}`} onClick={() => setViewMode('map')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Mapa
                </button>
              </div>
            )}
            {loadError && <div className="ventas-status"><p>No se pudo cargar.</p><button onClick={() => fetchProperties()}>Reintentar</button></div>}
            {loading && properties.length === 0 && !loadError && <div className="ventas-status">Cargando departamentos en venta...</div>}
            {!loading && properties.length === 0 && !loadError && <div className="ventas-status">No se encontraron departamentos con esos filtros.</div>}
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
                {(spotlightProperty ? properties.filter(p => p.id !== spotlightId) : properties).map(p => (
                  <VentaCard key={p.id} property={p} isFavorite={favorites.has(p.id)}
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
          {/* Fixed top bar with gradient */}
          <div className="mt-top-bar">
            <Link href="/landing-v2" className="mt-logo">Simon</Link>
            <span className="mt-label">VENTAS</span>
            <button className="mt-filter-btn" onClick={() => {
              const filterIdx = feedItems.findIndex(i => i.type === 'filter')
              if (filterIdx >= 0 && feedRef.current) {
                feedRef.current.scrollTo({ top: filterIdx * feedRef.current.clientHeight, behavior: 'smooth' })
              }
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18M7 12h10M10 18h4"/></svg>
              {isFiltered && <div className="mt-filter-dot" />}
            </button>
          </div>

          {/* Card counter */}
          {properties.length > 0 && (
            <div className="mt-counter">{activeCardIndex + 1} / {feedItems.length}</div>
          )}

          {/* Map floating button */}
          <button className="mt-map-btn" onClick={() => setMobileMapOpen(true)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </button>

          {/* Map overlay */}
          {mobileMapOpen && (
            <div className="mt-map-overlay">
              <button className="mt-map-close" onClick={() => { setMobileMapOpen(false); setMapSelectedId(null) }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <VentaMap properties={properties} onSelectProperty={(id) => setMapSelectedId(id)} selectedId={mapSelectedId} />
              {mapSelectedId && (() => {
                const sp = properties.find(x => x.id === mapSelectedId)
                if (!sp) return null
                return <MapFloatCard mobile property={sp} isFavorite={favorites.has(sp.id)} onClose={() => setMapSelectedId(null)} onOpenDetail={() => { setMapSelectedId(null); setMobileMapOpen(false); openSheet(sp) }} onToggleFavorite={() => toggleFavorite(sp.id)} />
              })()}
            </div>
          )}

          {/* TikTok feed */}
          <div className="mt-feed" ref={feedRef}>
            {loadError && <div className="mc" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
              <div style={{ textAlign: 'center' }}><p>No se pudo cargar.</p><button onClick={() => fetchProperties()} style={{ padding: '8px 20px', background: '#c9a959', color: '#0a0a0a', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Reintentar</button></div>
            </div>}
            {loading && properties.length === 0 && !loadError && <div className="mc" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Cargando...</div>}
            {!loading && properties.length === 0 && !loadError && <div className="mc" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>No se encontraron departamentos.</div>}
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
                isSpotlight={item.isSpotlight}
                onToggleFavorite={() => toggleFavorite(p.id)} onShare={() => shareProperty(p)}
                onPhotoTap={(idx) => openViewer(p, idx)} onDetails={() => openSheet(p)} />
            })}
          </div>
        </>
      )}

      <style jsx global>{`
        body { background: #0a0a0a; margin: 0; }
        @media (max-width: 767px) { body { overflow: hidden; } }

        /* ===== DESKTOP LAYOUT ===== */
        .ventas-desktop { display:flex; min-height:100vh; font-family:'Manrope',sans-serif; color:#f8f6f3 }
        .ventas-sidebar { width:320px; min-width:320px; background:#111; border-right:1px solid #222; position:fixed; top:0; left:0; bottom:0; overflow-y:auto; z-index:10 }
        .ventas-sidebar-header { padding:24px 20px 12px; display:flex; align-items:baseline; gap:12px }
        .ventas-logo { font-family:'Cormorant Garamond',serif; font-size:24px; font-weight:600; color:#f8f6f3; text-decoration:none }
        .ventas-label { font-size:11px; letter-spacing:2px; color:#c9a959; font-weight:600 }
        .ventas-sidebar-count { padding:8px 20px 20px }
        .ventas-count-num { font-family:'Cormorant Garamond',serif; font-size:36px; font-weight:600; color:#f8f6f3; display:block; line-height:1 }
        .ventas-count-text { font-size:13px; color:#888 }
        .ventas-main { margin-left:320px; flex:1; padding:24px; min-height:100vh }
        .ventas-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:24px }
        .ventas-map-container { height:calc(100vh - 80px); border-radius:12px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); position:relative }

        /* Map float card — desktop */
        .mfc-desktop { position:absolute; bottom:20px; left:20px; z-index:1000; background:#111; border:1px solid rgba(201,169,89,0.25); border-radius:12px; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.6); display:flex; width:380px; animation:mfcIn 0.2s ease-out }
        /* Map float card — mobile */
        .mfc-mobile { position:absolute; bottom:12px; left:12px; right:12px; z-index:1000; background:#111; border:1px solid rgba(201,169,89,0.25); border-radius:12px; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.6); display:flex; animation:mfcIn 0.2s ease-out }
        @keyframes mfcIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        .mfc-close { position:absolute; top:8px; right:8px; z-index:10; width:28px; height:28px; border-radius:50%; background:rgba(10,10,10,0.7); border:none; color:#fff; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center }
        .mfc-photo { width:130px; min-width:130px; background-size:cover; background-position:center; background-color:#1a1a1a; position:relative }
        .mfc-nav { position:absolute; top:50%; transform:translateY(-50%); width:28px; height:28px; border-radius:50%; background:rgba(10,10,10,0.6); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:3 }
        .mfc-nav-prev { left:4px }
        .mfc-nav-next { right:4px }
        .mfc-count { position:absolute; bottom:6px; right:6px; background:rgba(10,10,10,0.7); color:#fff; font-size:10px !important; padding:2px 6px; border-radius:8px; font-family:'Manrope',sans-serif; line-height:1.2 }
        .mfc-fav { position:absolute; top:6px; left:6px; width:32px; height:32px; border-radius:50%; background:rgba(10,10,10,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:3 }
        .mfc-fav.active { background:rgba(201,169,89,0.2) }
        .mfc-fav svg { width:16px; height:16px }
        .mfc-body { flex:1; padding:14px }
        .mfc-name { font-family:'Cormorant Garamond',serif; font-size:18px; color:#fff; line-height:1.2; margin-bottom:4px }
        .mfc-specs { font-size:12px; color:rgba(255,255,255,0.5); margin-bottom:8px; font-family:'Manrope',sans-serif }
        .mfc-price { font-family:'Cormorant Garamond',serif; font-size:22px; color:#c9a959; line-height:1 }
        .mfc-m2 { font-size:11px; color:rgba(255,255,255,0.4); margin-bottom:10px; font-family:'Manrope',sans-serif }
        .mfc-detail { width:100%; padding:8px; background:transparent; border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.7); font-family:'Manrope',sans-serif; font-size:12px; cursor:pointer; border-radius:6px }

        /* View mode toggle */
        .vm-toggle { display:flex; gap:4px; margin-bottom:20px; background:#111; border-radius:8px; padding:4px; width:fit-content }
        .vm-btn { display:flex; align-items:center; gap:6px; padding:8px 16px; border:none; border-radius:6px; background:transparent; color:rgba(255,255,255,0.5); font-family:'Manrope',sans-serif; font-size:12px; cursor:pointer; transition:all 0.15s }
        .vm-btn.active { background:rgba(201,169,89,0.15); color:#c9a959 }

        /* ===== MOBILE TIKTOK LAYOUT ===== */
        .mt-top-bar { position:fixed; top:0; left:0; right:0; z-index:50; display:flex; align-items:center; gap:8px; padding:12px 20px; padding-top:max(12px, env(safe-area-inset-top)); background:linear-gradient(rgba(10,10,10,0.7), transparent); pointer-events:none; font-family:'Manrope',sans-serif }
        .mt-top-bar > * { pointer-events:auto }
        .mt-logo { font-family:'Cormorant Garamond',serif; font-size:20px; font-weight:600; color:#f8f6f3; text-decoration:none }
        .mt-label { font-size:10px; letter-spacing:2px; color:#c9a959; font-weight:600 }
        .mt-filter-btn { background:rgba(10,10,10,0.5); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#f8f6f3; padding:6px 8px; cursor:pointer; position:relative; display:flex; align-items:center }
        .mt-filter-dot { position:absolute; top:-3px; right:-3px; width:8px; height:8px; background:#c9a959; border-radius:50% }
        .mt-counter { position:fixed; bottom:max(16px, calc(env(safe-area-inset-bottom) + 8px)); right:16px; z-index:50; font-size:10px; color:rgba(255,255,255,0.3); font-family:'Manrope',sans-serif }
        .mt-map-btn { position:fixed; bottom:max(24px, calc(env(safe-area-inset-bottom) + 8px)); left:24px; z-index:50; width:48px; height:48px; border-radius:50%; background:rgba(10,10,10,0.7); border:1px solid rgba(201,169,89,0.25); display:flex; align-items:center; justify-content:center; cursor:pointer; color:#c9a959 }
        .mt-map-overlay { position:fixed; inset:0; z-index:200; background:#0a0a0a }
        .mt-map-close { position:absolute; top:max(16px, env(safe-area-inset-top)); right:16px; z-index:201; width:44px; height:44px; border-radius:50%; background:rgba(10,10,10,0.7); border:1px solid rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; cursor:pointer }

        .mt-feed { height:100vh; height:100dvh; overflow-y:scroll; scroll-snap-type:y mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none }
        .mt-feed::-webkit-scrollbar { display:none }

        /* ===== MOBILE CARD (55% foto / 45% contenido) ===== */
        .mc { height:100vh; height:100dvh; scroll-snap-align:start; scroll-snap-stop:always; position:relative; overflow:hidden; display:flex; flex-direction:column; background:#0a0a0a }
        .mc-placeholder { height:100vh; height:100dvh; scroll-snap-align:start; background:#0a0a0a }

        /* Photo zone (55%) */
        .mc-photo-zone { flex:0 0 55%; position:relative; overflow:hidden }
        .mc-photo-scroll { display:flex; height:100%; overflow-x:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none }
        .mc-photo-scroll::-webkit-scrollbar { display:none }
        .mc-slide { flex:0 0 100%; height:100%; background-size:cover; background-position:center; background-color:#1a1a1a; scroll-snap-align:start }
        .mc-slide-empty { background:#111 }
        .mc-photo-fade { position:absolute; bottom:0; left:0; right:0; height:80px; background:linear-gradient(transparent, #0a0a0a); pointer-events:none; z-index:2 }
        .mc-photo-count { position:absolute; top:max(60px, calc(env(safe-area-inset-top) + 52px)); right:16px; z-index:5; background:rgba(10,10,10,0.7); padding:4px 12px; border-radius:100px; font-size:12px; color:rgba(255,255,255,0.8); font-family:'Manrope',sans-serif }
        .mc-dots { position:absolute; bottom:90px; left:50%; transform:translateX(-50%); display:flex; gap:6px; z-index:5 }
        .mc-dot { width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,0.3); transition:all 0.25s }
        .mc-dot.active { background:#fff; width:20px; border-radius:3px }

        .mc-action-icon { width:44px; min-width:44px; height:44px; border-radius:50%; background:none; border:1px solid rgba(255,255,255,0.12); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s }
        .mc-action-icon.active { border-color:rgba(201,169,89,0.3); background:rgba(201,169,89,0.08) }
        .mc-action-icon svg { filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3)) }
        .mc-spotlight { position:absolute; top:max(56px, calc(env(safe-area-inset-top) + 50px)); left:16px; z-index:10; background:rgba(26,23,20,0.9); border-left:3px solid #c9a959; padding:8px 14px; border-radius:0 8px 8px 0; font-family:'Manrope',sans-serif; font-size:12px; color:#f8f6f3; letter-spacing:0.3px }

        /* Desktop spotlight */
        .ds-spotlight { margin-bottom:32px }
        .ds-spotlight-banner { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; margin-bottom:16px; background:#1a1714; border-left:3px solid #c9a959; border-radius:0 8px 8px 0; font-family:'Manrope',sans-serif; font-size:14px; color:#f8f6f3 }
        .ds-spotlight-close { background:none; border:none; color:#888; font-size:20px; cursor:pointer; padding:0 4px }
        .ds-spotlight-sep { display:flex; align-items:center; gap:16px; margin-top:24px }
        .ds-spotlight-line { flex:1; height:1px; background:#222 }
        .ds-spotlight-text { font-size:12px; color:#555; font-family:'Manrope',sans-serif; letter-spacing:1px; white-space:nowrap }

        /* Content zone (45%) */
        .mc-content { flex:1; padding:0 24px; padding-bottom:max(16px, calc(env(safe-area-inset-bottom) + 8px)); display:flex; flex-direction:column; overflow:hidden }
        .mc-name { font-family:'Cormorant Garamond',serif; font-size:26px; font-weight:400; color:#fff; line-height:1.1; margin-bottom:3px }
        .mc-zona { font-size:12px; color:rgba(255,255,255,0.6); letter-spacing:1px; margin-bottom:10px }
        .mc-id { color:rgba(255,255,255,0.2); font-size:10px; margin-left:4px; letter-spacing:0 }
        .mc-price { font-family:'Cormorant Garamond',serif; font-size:36px; font-weight:400; color:#c9a959; line-height:1; margin-bottom:4px; font-variant-numeric:tabular-nums }
        .mc-specs { font-size:13px; color:rgba(255,255,255,0.7); font-family:'Manrope',sans-serif; margin-bottom:10px }
        .mc-badges { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:auto }
        .mc-badge-pill { font-size:10px; font-weight:500; padding:4px 10px; border-radius:100px; border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.7); background:rgba(255,255,255,0.04); font-family:'Manrope',sans-serif; letter-spacing:0.3px }
        .mc-badge-pill.gold { border-color:rgba(201,169,89,0.3); color:#c9a959; background:rgba(201,169,89,0.06) }
        .mc-badge-pill.green { border-color:rgba(34,197,94,0.25); color:#22c55e; background:rgba(34,197,94,0.06) }
        .mc-wsp { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:12px; background:#25d366; border:none; border-radius:8px; color:#fff; font-family:'Manrope',sans-serif; font-size:14px; font-weight:600; text-decoration:none; margin-top:8px; min-height:44px }
        .mc-actions { display:flex; gap:8px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06); margin-top:8px }
        .mc-btn { flex:1; padding:10px; background:transparent; border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.7); font-family:'Manrope',sans-serif; font-size:12px; cursor:pointer; border-radius:6px; text-align:center; text-decoration:none; transition:all 0.15s }
        .mc-btn-gold { border-color:rgba(201,169,89,0.25); color:#c9a959; background:rgba(201,169,89,0.06) }

        /* ===== MOBILE FILTER CARD (full-screen) ===== */
        .mfc { height:100vh; height:100dvh; scroll-snap-align:start; scroll-snap-stop:always; background:#0a0a0a; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; padding-top:max(70px, calc(env(safe-area-inset-top) + 60px)); font-family:'Manrope',sans-serif; overflow-y:auto }
        .mfc-header { text-align:center; margin-bottom:16px }
        .mfc-count { font-family:'Cormorant Garamond',serif; font-size:40px; font-weight:400; color:#c9a959; display:block; line-height:1 }
        .mfc-sub { font-size:12px; color:#888 }
        .mfc-divider { display:flex; align-items:center; gap:12px; width:100%; margin-bottom:16px }
        .mfc-line { flex:1; height:1px; background:#222 }
        .mfc-text { font-size:10px; letter-spacing:2px; color:#555; font-weight:600 }
        .mfc-filters { width:100%; max-width:340px }
        .mfc-cta { width:100%; max-width:340px; padding:14px; background:#c9a959; color:#0a0a0a; border:none; border-radius:8px; font-weight:700; font-size:14px; letter-spacing:1px; cursor:pointer; margin-top:8px }

        /* ===== FILTER COMPONENTS (shared) ===== */
        .vf-wrap { padding:0 20px 20px; border-top:1px solid #222; padding-top:16px }
        .vf-group { margin-bottom:20px }
        .vf-label { font-size:10px; letter-spacing:2px; color:#555; margin-bottom:10px; font-weight:600; font-family:'Manrope',sans-serif }
        .vf-zona-btns { display:flex; flex-wrap:wrap; gap:8px }
        .vf-zona-btn { padding:7px 14px; border-radius:100px; border:1px solid #333; background:transparent; color:#999; font-size:12px; cursor:pointer; font-family:'Manrope',sans-serif; transition:all 0.15s }
        .vf-zona-btn:hover { border-color:#555; color:#ccc }
        .vf-zona-btn.active { border-color:#c9a959; color:#c9a959; background:rgba(201,169,89,0.08) }
        .vf-btn-row { display:flex; gap:8px }
        .vf-btn { flex:1; padding:9px 4px; border-radius:6px; border:1px solid #333; background:transparent; color:#999; font-size:12px; cursor:pointer; font-family:'Manrope',sans-serif; transition:all 0.15s; text-align:center }
        .vf-btn:hover { border-color:#555; color:#ccc }
        .vf-btn.active { border-color:#c9a959; color:#c9a959; background:rgba(201,169,89,0.08) }
        .vf-range-display { font-size:14px; color:#c9a959; margin-bottom:10px; text-align:right; font-family:'Manrope',sans-serif; font-weight:500 }
        .vf-range-wrap { position:relative; height:28px }
        .vf-slider { position:absolute; top:0; left:0; width:100%; -webkit-appearance:none; appearance:none; background:transparent; pointer-events:none; height:28px }
        .vf-slider::-webkit-slider-thumb { -webkit-appearance:none; width:22px; height:22px; border-radius:50%; background:#c9a959; cursor:pointer; pointer-events:all; border:3px solid #111; position:relative; z-index:2 }
        .vf-slider::-moz-range-thumb { width:22px; height:22px; border-radius:50%; background:#c9a959; cursor:pointer; pointer-events:all; border:3px solid #111 }
        .vf-slider::-webkit-slider-runnable-track { height:3px; background:#333; border-radius:2px }
        .vf-slider::-moz-range-track { height:3px; background:#333; border-radius:2px }
        .vf-slider-min { z-index:1 }
        .vf-slider-max { z-index:2 }
        .vf-tc-note { font-size:10px; color:rgba(255,255,255,0.3); font-family:'Manrope',sans-serif; margin-top:8px; text-align:right }
        .vf-reset { width:100%; max-width:340px; padding:10px; background:transparent; border:1px solid #333; border-radius:6px; color:#888; font-size:12px; cursor:pointer; font-family:'Manrope',sans-serif; transition:all 0.15s }
        .vf-reset:hover { border-color:#555; color:#ccc }

        /* ===== DESKTOP VENTA CARD ===== */
        .vc { background:#111; border:1px solid rgba(255,255,255,0.06); border-radius:12px; overflow:hidden; transition:border-color 0.2s }
        .vc:hover { border-color:rgba(201,169,89,0.2) }
        .vc-photo { height:220px; background-size:cover; background-position:center; background-color:#1a1a1a; position:relative }
        @keyframes vcShimmer { 0%,100%{background-color:#1a1a1a} 50%{background-color:#262626} }
        .vc-photo:not([style*="background-image"]) { animation:vcShimmer 1.5s ease-in-out infinite }
        .vc-nofoto { display:flex; align-items:center; justify-content:center; height:100%; color:#444; font-size:13px; font-family:'Manrope',sans-serif }
        .vc-nav { position:absolute; top:50%; transform:translateY(-50%); width:36px; height:36px; border-radius:50%; background:rgba(10,10,10,0.6); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.15s; z-index:3 }
        .vc-nav:hover { background:rgba(10,10,10,0.85) }
        .vc-nav-prev { left:8px }
        .vc-nav-next { right:8px }
        .vc-photo-count { position:absolute; top:10px; right:10px; background:rgba(10,10,10,0.6); color:#ccc; font-size:11px; padding:3px 8px; border-radius:10px; font-family:'Manrope',sans-serif }
        .vc-fav { position:absolute; top:10px; left:10px; width:40px; height:40px; border-radius:50%; background:rgba(10,10,10,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s; z-index:3 }
        .vc-fav:hover { transform:scale(1.1) }
        .vc-fav.active { background:rgba(201,169,89,0.15) }
        .vc-share { position:absolute; top:10px; left:58px; width:40px; height:40px; border-radius:50%; background:rgba(10,10,10,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s; z-index:3 }
        .vc-share:hover { transform:scale(1.1); background:rgba(10,10,10,0.7) }
        .vc-body { padding:16px }
        .vc-name { font-family:'Cormorant Garamond',serif; font-size:20px; font-weight:400; color:#fff; line-height:1.2; margin-bottom:2px }
        .vc-zona { font-size:11px; color:rgba(255,255,255,0.5); letter-spacing:1px; margin-bottom:10px }
        .vc-id { color:rgba(255,255,255,0.2); font-size:10px; margin-left:4px; letter-spacing:0 }
        .vc-price { font-family:'Cormorant Garamond',serif; font-size:28px; font-weight:400; color:#f8f6f3; line-height:1; margin-bottom:4px; font-variant-numeric:tabular-nums }
        .vc-m2 { font-size:14px; color:#c9a959; margin-bottom:2px }
        .vc-usd-note { font-size:10px; color:rgba(255,255,255,0.25); font-family:'Manrope',sans-serif; margin-bottom:8px }
        .vc-specs { font-size:12px; color:rgba(255,255,255,0.6); margin-bottom:10px; font-family:'Manrope',sans-serif; display:flex; gap:8px; flex-wrap:wrap }
        .vc-badges { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px }
        .vc-badge { font-size:10px; font-weight:500; padding:3px 9px; border-radius:100px; border:1px solid rgba(201,169,89,0.25); color:#c9a959; font-family:'Manrope',sans-serif }
        .vc-badge.green { border-color:rgba(34,197,94,0.25); color:#22c55e }
        .vc-features { font-size:11px; color:rgba(255,255,255,0.4); font-family:'Manrope',sans-serif; display:flex; align-items:center; gap:7px; margin-bottom:5px; line-height:1.4 }
        .vc-features-icon { flex-shrink:0 }
        .vc-features-icon.icon-building { color:rgba(255,255,255,0.5) }
        .vc-features-icon.icon-unit { color:rgba(201,169,89,0.5) }
        .vc-features-count { color:#c9a959; flex-shrink:0 }
        .vc-actions { border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; margin-top:2px; display:flex; gap:8px }
        .vc-details-btn { flex:1; padding:8px; background:transparent; border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.7); font-family:'Manrope',sans-serif; font-size:11px; cursor:pointer; border-radius:6px; transition:all 0.2s }
        .vc-details-btn:hover { border-color:rgba(255,255,255,0.3); color:#fff }
        .vc-ver { flex:1; padding:8px; background:rgba(201,169,89,0.08); border:1px solid rgba(201,169,89,0.2); color:#c9a959; font-family:'Manrope',sans-serif; font-size:11px; text-align:center; text-decoration:none; border-radius:6px; transition:all 0.2s; font-weight:500 }
        .vc-ver:hover { background:rgba(201,169,89,0.15) }

        /* ===== STATES ===== */
        .ventas-status { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:300px; color:#888; font-family:'Manrope',sans-serif; font-size:15px; text-align:center }
        .ventas-status button { margin-top:12px; padding:8px 20px; background:#c9a959; color:#0a0a0a; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:14px }

        /* ===== TOAST ===== */
        .ventas-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#222; color:#f8f6f3; padding:10px 20px; border-radius:8px; font-size:13px; font-family:'Manrope',sans-serif; z-index:100; border:1px solid #333 }

        /* ===== BOTTOM SHEET ===== */
        .bs-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:500; opacity:0; pointer-events:none; transition:opacity 0.3s }
        .bs-overlay.open { opacity:1; pointer-events:auto }
        .bs { position:fixed; bottom:0; left:0; right:0; max-height:85vh; background:#111; border-top-left-radius:16px; border-top-right-radius:16px; z-index:501; transform:translateY(100%); transition:transform 0.35s cubic-bezier(0.32,0.72,0,1); overflow:hidden; display:flex; flex-direction:column; font-family:'Manrope',sans-serif; color:#f8f6f3 }
        .bs.open { transform:translateY(0) }
        .bs-desktop { left:auto; right:0; top:0; bottom:0; max-height:100vh; width:480px; max-width:100%; border-radius:0; border-left:1px solid #222; transform:translateX(100%); transition:transform 0.35s cubic-bezier(0.32,0.72,0,1) }
        .bs-desktop.open { transform:translateX(0) }
        .bs-handle { width:40px; height:4px; background:#333; border-radius:2px; margin:10px auto 0 }
        .bs-desktop .bs-handle { display:none }
        .bs-header { display:flex; align-items:center; justify-content:space-between; padding:18px 24px 14px; border-bottom:1px solid #222 }
        .bs-title { font-family:'Cormorant Garamond',serif; font-size:26px; font-weight:400; color:#fff }
        .bs-close { background:none; border:none; color:#888; cursor:pointer; padding:8px; display:flex; align-items:center }
        .bs-scroll { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding-bottom:max(24px, env(safe-area-inset-bottom)) }
        .bs-section { padding:18px 24px; border-bottom:1px solid rgba(255,255,255,0.04) }
        .bs-section-border { border-bottom:1px solid rgba(255,255,255,0.08) }
        .bs-zona { font-size:14px; color:rgba(255,255,255,0.55); letter-spacing:1px }
        .bs-id { color:rgba(255,255,255,0.25); font-size:12px; margin-left:4px; letter-spacing:0 }
        .bs-location { display:inline-flex; align-items:center; gap:6px; color:#c9a959; font-size:13px; text-decoration:none; margin-top:6px }
        .bs-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px }
        .bs-feat { text-align:center }
        .bs-feat-val { font-family:'Cormorant Garamond',serif; font-size:28px; color:#fff; display:block; line-height:1 }
        .bs-feat-label { font-size:12px; color:rgba(255,255,255,0.55); letter-spacing:1px; text-transform:uppercase }
        .bs-price { font-family:'Cormorant Garamond',serif; font-size:32px; color:#c9a959 }
        .bs-price-detail { font-size:14px; color:rgba(255,255,255,0.55); margin-top:4px }
        .bs-badges { display:flex; flex-wrap:wrap; gap:8px }
        .bs-badge { font-size:12px; padding:6px 14px; border-radius:100px; border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.7); font-family:'Manrope',sans-serif }
        .bs-badge.gold { border-color:rgba(201,169,89,0.3); color:#c9a959 }
        .bs-section-title { font-size:13px; letter-spacing:2px; color:rgba(255,255,255,0.55); font-weight:600; margin-bottom:12px; display:flex; align-items:center; gap:8px; text-transform:uppercase }
        .bs-tags { display:flex; flex-wrap:wrap; gap:8px }
        .bs-tag { font-size:13px; padding:6px 14px; border-radius:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.7) }
        .bs-desc { font-size:14px; color:rgba(255,255,255,0.55); line-height:1.7; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden }
        .bs-desc.expanded { -webkit-line-clamp:unset; display:block }
        .bs-desc-more { background:none; border:none; color:#c9a959; font-size:13px; cursor:pointer; padding:6px 0 0; font-family:'Manrope',sans-serif }
        .bs-agent { font-size:14px; margin-bottom:10px }
        .bs-agent-name { color:#f8f6f3 }
        .bs-agent-office { color:rgba(255,255,255,0.4) }
        .bs-wsp { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:14px; background:#25d366; border:none; border-radius:8px; color:#fff; font-family:'Manrope',sans-serif; font-size:15px; font-weight:600; text-decoration:none; min-height:48px }
        .bs-ver-original { width:100%; padding:14px; background:transparent; border:1px solid rgba(201,169,89,0.25); color:#c9a959; border-radius:8px; font-family:'Manrope',sans-serif; font-size:14px; cursor:pointer }
        .bs-gate { display:flex; flex-direction:column; gap:12px }
        .bs-gate-title { font-size:14px; color:rgba(255,255,255,0.6); margin-bottom:4px }
        .bs-gate-input { width:100%; padding:12px 14px; background:rgba(255,255,255,0.04); border:1px solid #333; border-radius:8px; color:#f8f6f3; font-family:'Manrope',sans-serif; font-size:15px; box-sizing:border-box }
        .bs-gate-input::placeholder { color:rgba(255,255,255,0.3) }
        .bs-gate-submit { width:100%; padding:14px; background:#c9a959; color:#0a0a0a; border:none; border-radius:8px; font-family:'Manrope',sans-serif; font-size:15px; font-weight:700; cursor:pointer }
        .bs-gate-submit:disabled { opacity:0.4; cursor:default }
      `}</style>
    </>
  )
}
