import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import type { UnidadVenta, FiltrosVentaSimple } from '@/lib/supabase'
import { ZONAS_CANONICAS, displayZona } from '@/lib/zonas'

// ===== Constants =====
const MIN_PRICE = 30000
const MAX_PRICE = 500000
const PRICE_STEP = 10000
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

function formatPriceK(v: number) {
  return `$${(v / 1000).toFixed(0)}k`
}

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function formatFechaEntrega(fecha: string): string {
  // "2026-03" → "Mar 2026"
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

// ===== Build filters from component state =====
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

// ===== Desktop Filters Component =====
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

  function toggleZona(db: string) {
    setSelectedZonas(prev => {
      const n = new Set(prev)
      if (n.has(db)) n.delete(db); else n.add(db)
      autoApply(minPrice, maxPrice, selectedDorms, n, entrega, orden)
      return n
    })
  }
  function toggleDorm(d: number) {
    setSelectedDorms(prev => {
      const n = new Set(prev)
      if (n.has(d)) n.delete(d); else n.add(d)
      autoApply(minPrice, maxPrice, n, selectedZonas, entrega, orden)
      return n
    })
  }
  function handleMinPrice(v: number) {
    const clamped = Math.min(v, maxPrice - PRICE_STEP)
    setMinPrice(clamped)
    autoApply(clamped, maxPrice, selectedDorms, selectedZonas, entrega, orden)
  }
  function handleMaxPrice(v: number) {
    const clamped = Math.max(v, minPrice + PRICE_STEP)
    setMaxPrice(clamped)
    autoApply(minPrice, clamped, selectedDorms, selectedZonas, entrega, orden)
  }
  function handleEntrega(v: string) {
    setEntrega(v)
    autoApply(minPrice, maxPrice, selectedDorms, selectedZonas, v, orden)
  }
  function handleOrden(v: FiltrosVentaSimple['orden']) {
    setOrden(v)
    autoApply(minPrice, maxPrice, selectedDorms, selectedZonas, entrega, v)
  }

  return (
    <div className="vf-wrap">
      <div className="vf-group">
        <div className="vf-label">ZONA</div>
        <div className="vf-zona-btns">
          {ZONAS_CANONICAS.map(z => (
            <button key={z.db} className={`vf-zona-btn ${selectedZonas.has(z.db) ? 'active' : ''}`}
              onClick={() => toggleZona(z.db)}>{z.labelCorto}</button>
          ))}
        </div>
      </div>
      <div className="vf-group">
        <div className="vf-label">PRESUPUESTO</div>
        <div className="vf-range-display">{formatPriceK(minPrice)} — {formatPriceK(maxPrice)}</div>
        <div className="vf-range-wrap">
          <input type="range" className="vf-slider vf-slider-min" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={minPrice} onChange={e => handleMinPrice(parseInt(e.target.value))} />
          <input type="range" className="vf-slider vf-slider-max" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={maxPrice} onChange={e => handleMaxPrice(parseInt(e.target.value))} />
        </div>
        <div className="vf-tc-note">Precios en USD oficial · TC Bs 6.96</div>
      </div>
      <div className="vf-group">
        <div className="vf-label">DORMITORIOS</div>
        <div className="vf-btn-row">
          {[0, 1, 2, 3].map(d => (
            <button key={d} className={`vf-btn ${selectedDorms.has(d) ? 'active' : ''}`}
              onClick={() => toggleDorm(d)}>{d === 0 ? 'Mono' : d === 3 ? '3+' : d}</button>
          ))}
        </div>
      </div>
      <div className="vf-group">
        <div className="vf-label">ENTREGA</div>
        <div className="vf-btn-row">
          {ENTREGA_OPTIONS.map(o => (
            <button key={o.value} className={`vf-btn ${entrega === o.value ? 'active' : ''}`}
              onClick={() => handleEntrega(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
      <div className="vf-group">
        <div className="vf-label">ORDENAR POR</div>
        <div className="vf-btn-row">
          {ORDEN_OPTIONS.map(o => (
            <button key={o.value} className={`vf-btn ${orden === o.value ? 'active' : ''}`}
              onClick={() => handleOrden(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
      {isFiltered && <button className="vf-reset" onClick={onReset}>Quitar filtros</button>}
    </div>
  )
}

// ===== Mobile Filters Panel =====
function MobileFilters({ currentFilters, isFiltered, onApply, onReset }: {
  currentFilters: FiltrosVentaSimple; isFiltered: boolean
  onApply: (f: FiltrosVentaSimple) => void; onReset: () => void
}) {
  const [minPrice, setMinPrice] = useState(currentFilters.precio_min || MIN_PRICE)
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_max || MAX_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set())
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set(currentFilters.zonas_permitidas || []))
  const [entrega, setEntrega] = useState(currentFilters.estado_entrega || '')
  const [orden, setOrden] = useState<FiltrosVentaSimple['orden']>(currentFilters.orden || 'recientes')

  function apply() {
    onApply(buildFilters(minPrice, maxPrice, selectedDorms, selectedZonas, entrega, orden))
  }
  function toggleZona(db: string) {
    setSelectedZonas(prev => { const n = new Set(prev); if (n.has(db)) n.delete(db); else n.add(db); return n })
  }
  function toggleDorm(d: number) {
    setSelectedDorms(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n })
  }
  function handleMinPrice(v: number) { setMinPrice(Math.min(v, maxPrice - PRICE_STEP)) }
  function handleMaxPrice(v: number) { setMaxPrice(Math.max(v, minPrice + PRICE_STEP)) }

  return (
    <div className="mf-panel">
      <div className="vf-group"><div className="vf-label">ZONA</div>
        <div className="vf-zona-btns">
          {ZONAS_CANONICAS.map(z => (
            <button key={z.db} className={`vf-zona-btn ${selectedZonas.has(z.db) ? 'active' : ''}`}
              onClick={() => toggleZona(z.db)}>{z.labelCorto}</button>
          ))}
        </div>
      </div>
      <div className="vf-group"><div className="vf-label">PRESUPUESTO</div>
        <div className="vf-range-display">{formatPriceK(minPrice)} — {formatPriceK(maxPrice)}</div>
        <div className="vf-range-wrap">
          <input type="range" className="vf-slider vf-slider-min" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={minPrice} onChange={e => handleMinPrice(parseInt(e.target.value))} />
          <input type="range" className="vf-slider vf-slider-max" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={maxPrice} onChange={e => handleMaxPrice(parseInt(e.target.value))} />
        </div>
        <div className="vf-tc-note">Precios en USD oficial · TC Bs 6.96</div>
      </div>
      <div className="vf-group"><div className="vf-label">DORMITORIOS</div>
        <div className="vf-btn-row">
          {[0, 1, 2, 3].map(d => (
            <button key={d} className={`vf-btn ${selectedDorms.has(d) ? 'active' : ''}`}
              onClick={() => toggleDorm(d)}>{d === 0 ? 'Mono' : d === 3 ? '3+' : d}</button>
          ))}
        </div>
      </div>
      <div className="vf-group"><div className="vf-label">ENTREGA</div>
        <div className="vf-btn-row">
          {ENTREGA_OPTIONS.map(o => (
            <button key={o.value} className={`vf-btn ${entrega === o.value ? 'active' : ''}`}
              onClick={() => setEntrega(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
      <div className="vf-group"><div className="vf-label">ORDENAR POR</div>
        <div className="vf-btn-row">
          {ORDEN_OPTIONS.map(o => (
            <button key={o.value} className={`vf-btn ${orden === o.value ? 'active' : ''}`}
              onClick={() => setOrden(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
      <button className="mf-apply" onClick={apply}>APLICAR FILTROS</button>
      {isFiltered && <button className="vf-reset" onClick={onReset}>Quitar filtros</button>}
    </div>
  )
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

// ===== Venta Card =====
function VentaCard({ property: p, isFavorite, onToggleFavorite, onShare }: {
  property: UnidadVenta; isFavorite: boolean
  onToggleFavorite: () => void; onShare: () => void
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls?.length > 0 ? p.fotos_urls : []
  const hasPhotos = photos.length > 0
  const amenities = p.amenities_confirmados || []
  const equipamiento = p.equipamiento_detectado || []

  return (
    <div className="vc">
      {/* Photo section with carousel */}
      <div className="vc-photo"
        style={hasPhotos ? { backgroundImage: `url('${photos[photoIdx]}')` } : undefined}>
        {!hasPhotos && <div className="vc-nofoto">Sin fotos</div>}

        {/* Carousel nav */}
        {photos.length > 1 && (
          <>
            {photoIdx > 0 && (
              <button className="vc-nav vc-nav-prev" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx - 1) }}>
                <ChevronLeft />
              </button>
            )}
            {photoIdx < photos.length - 1 && (
              <button className="vc-nav vc-nav-next" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx + 1) }}>
                <ChevronRight />
              </button>
            )}
            <div className="vc-photo-count">{photoIdx + 1}/{photos.length}</div>
          </>
        )}

        {/* Overlay buttons */}
        <button className={`vc-fav ${isFavorite ? 'active' : ''}`} onClick={e => { e.stopPropagation(); onToggleFavorite() }}>
          <HeartIcon filled={isFavorite} />
        </button>
        <button className="vc-share" onClick={e => { e.stopPropagation(); onShare() }}>
          <ShareIcon />
        </button>
      </div>

      {/* Content */}
      <div className="vc-body">
        <div className="vc-name">{p.proyecto}</div>
        <div className="vc-zona">{displayZona(p.zona)} <span className="vc-id">#{p.id}</span></div>
        <div className="vc-price">${p.precio_usd.toLocaleString('en-US')}</div>
        <div className="vc-m2">${p.precio_m2.toLocaleString('en-US')}/m²</div>
        <div className="vc-usd-note">USD oficial</div>
        <div className="vc-specs">
          {[
            p.area_m2 > 0 ? `${Math.round(p.area_m2)}m²` : null,
            p.dormitorios !== null ? (p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`) : null,
            p.banos !== null ? `${p.banos} baño${p.banos !== 1 ? 's' : ''}` : null,
            p.piso ? `${p.piso}° piso` : null,
          ].filter(Boolean).join(' · ')}
        </div>

        {/* Badges */}
        <div className="vc-badges">
          {p.precio_negociable && <span className="vc-badge">Negociable</span>}
          {p.plan_pagos_desarrollador && <span className="vc-badge">Plan pagos</span>}
          {p.descuento_contado_pct && p.descuento_contado_pct > 0 && (
            <span className="vc-badge">-{p.descuento_contado_pct}% ctdo</span>
          )}
          {p.estado_construccion === 'preventa' && (
            <span className="vc-badge">{p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa'}</span>
          )}
          {p.parqueo_incluido && <span className="vc-badge">Parqueo incl.</span>}
          {p.baulera_incluido && <span className="vc-badge">Baulera incl.</span>}
        </div>

        {/* Feature hints: amenidades (edificio) + equipamiento (depto) */}
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

        {/* Actions */}
        <div className="vc-actions">
          <button className="vc-details-btn" onClick={() => { /* Bloque 5: bottom sheet */ }}>Ver detalles</button>
          {p.url && (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="vc-ver">
              Ver original &#8599;
            </a>
          )}
        </div>
      </div>
    </div>
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const fetchGenRef = useRef(0)

  function showToast(msg: string) {
    setToastMsg(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2500)
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
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copiado al portapapeles')
    }).catch(() => {
      showToast('No se pudo copiar el link')
    })
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
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ventas_favorites_v1')
      if (saved) setFavorites(new Set(JSON.parse(saved)))
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    if (favorites.size > 0) {
      localStorage.setItem('ventas_favorites_v1', JSON.stringify([...favorites]))
    }
  }, [favorites])

  // Fetch
  const fetchProperties = useCallback(async (f?: FiltrosVentaSimple) => {
    const gen = ++fetchGenRef.current
    setLoading(true)
    setLoadError(false)
    try {
      const result = await fetchFromAPI(f || filters)
      if (gen !== fetchGenRef.current) return 0
      setProperties(result.data)
      setTotalCount(result.total)
      if (!f || Object.keys(f).length === 0) setUnfilteredCount(result.total)
      return result.total
    } catch (err) {
      if (gen !== fetchGenRef.current) return 0
      console.error('Error fetching ventas:', err)
      setLoadError(true)
      return 0
    } finally {
      if (gen === fetchGenRef.current) setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchProperties()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function applyFilters(newFilters: FiltrosVentaSimple) {
    setFilters(newFilters)
    setIsFiltered(true)
    setMobileFiltersOpen(false)
    const count = await fetchProperties(newFilters)
    showToast(`${count} departamentos encontrados`)
  }
  async function resetFilters() {
    const defaults: FiltrosVentaSimple = {}
    setFilters(defaults)
    setIsFiltered(false)
    setMobileFiltersOpen(false)
    const count = await fetchProperties(defaults)
    showToast(`${count} departamentos · sin filtros`)
  }

  return (
    <>
      <Head>
        <title>Simon · Departamentos en Venta · Equipetrol</title>
        <meta name="description" content="Departamentos en venta en Equipetrol, Santa Cruz. Datos reales, precios actualizados." />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#0a0a0a" />
      </Head>

      <Toast message={toastMsg} visible={toastVisible} />

      {isDesktop ? (
        <div className="ventas-desktop">
          <aside className="ventas-sidebar">
            <div className="ventas-sidebar-header">
              <Link href="/landing-v2" className="ventas-logo">Simon</Link>
              <div className="ventas-label">VENTAS</div>
            </div>
            <div className="ventas-sidebar-count">
              <span className="ventas-count-num">{properties.length}</span>
              <span className="ventas-count-text">
                {isFiltered ? `de ${unfilteredCount} departamentos` : 'departamentos en Equipetrol'}
              </span>
            </div>
            <DesktopFilters currentFilters={filters} isFiltered={isFiltered} onApply={applyFilters} onReset={resetFilters} />
          </aside>
          <main className="ventas-main">
            {loadError && (
              <div className="ventas-status"><p>No se pudo cargar. Verifica tu conexión.</p>
                <button onClick={() => fetchProperties()}>Reintentar</button></div>
            )}
            {loading && properties.length === 0 && !loadError && (
              <div className="ventas-status">Cargando departamentos en venta...</div>
            )}
            {!loading && properties.length === 0 && !loadError && (
              <div className="ventas-status">No se encontraron departamentos con esos filtros.</div>
            )}
            {properties.length > 0 && (
              <div className="ventas-grid">
                {properties.map(p => (
                  <VentaCard key={p.id} property={p} isFavorite={favorites.has(p.id)}
                    onToggleFavorite={() => toggleFavorite(p.id)} onShare={() => shareProperty(p)} />
                ))}
              </div>
            )}
          </main>
        </div>
      ) : (
        <>
          <div className="ventas-top-bar">
            <Link href="/landing-v2" className="ventas-logo-mobile">Simon</Link>
            <span className="ventas-label-mobile">
              {isFiltered ? `${activeFilterCount} FILTRO${activeFilterCount > 1 ? 'S' : ''}` : 'VENTAS'}
            </span>
            <button className="ventas-filter-btn" onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18M7 12h10M10 18h4"/></svg>
              {isFiltered && <div className="ventas-filter-dot" />}
            </button>
            <span className="ventas-count-mobile">{properties.length} deptos</span>
          </div>
          {mobileFiltersOpen && (
            <MobileFilters currentFilters={filters} isFiltered={isFiltered} onApply={applyFilters} onReset={resetFilters} />
          )}
          <div className="ventas-mobile-feed">
            {loadError && (
              <div className="ventas-status"><p>No se pudo cargar.</p>
                <button onClick={() => fetchProperties()}>Reintentar</button></div>
            )}
            {loading && properties.length === 0 && !loadError && (
              <div className="ventas-status">Cargando...</div>
            )}
            {!loading && properties.length === 0 && !loadError && (
              <div className="ventas-status">No se encontraron departamentos.</div>
            )}
            {properties.map(p => (
              <VentaCard key={p.id} property={p} isFavorite={favorites.has(p.id)}
                onToggleFavorite={() => toggleFavorite(p.id)} onShare={() => shareProperty(p)} />
            ))}
          </div>
        </>
      )}

      <style jsx global>{`
        body { background: #0a0a0a; margin: 0; }
        /* ===== LAYOUT DESKTOP ===== */
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

        /* ===== LAYOUT MOBILE ===== */
        .ventas-top-bar { position:sticky; top:0; z-index:20; background:#0a0a0a; border-bottom:1px solid #222; padding:12px 16px; display:flex; align-items:center; gap:8px; font-family:'Manrope',sans-serif }
        .ventas-logo-mobile { font-family:'Cormorant Garamond',serif; font-size:20px; font-weight:600; color:#f8f6f3; text-decoration:none }
        .ventas-label-mobile { font-size:10px; letter-spacing:2px; color:#c9a959; font-weight:600 }
        .ventas-filter-btn { background:none; border:1px solid #333; border-radius:6px; color:#f8f6f3; padding:6px 8px; cursor:pointer; position:relative; display:flex; align-items:center }
        .ventas-filter-dot { position:absolute; top:-3px; right:-3px; width:8px; height:8px; background:#c9a959; border-radius:50% }
        .ventas-count-mobile { margin-left:auto; font-size:12px; color:#888 }
        .ventas-mobile-feed { padding:12px; display:flex; flex-direction:column; gap:16px; font-family:'Manrope',sans-serif }

        /* ===== MOBILE FILTER PANEL ===== */
        .mf-panel { background:#111; border-bottom:1px solid #222; padding:16px 16px 12px; font-family:'Manrope',sans-serif }
        .mf-apply { width:100%; padding:14px; background:#c9a959; color:#0a0a0a; border:none; border-radius:8px; font-weight:700; font-size:14px; letter-spacing:1px; cursor:pointer; margin-top:12px }

        /* ===== FILTER COMPONENTS ===== */
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
        .vf-reset { width:100%; padding:10px; background:transparent; border:1px solid #333; border-radius:6px; color:#888; font-size:12px; cursor:pointer; font-family:'Manrope',sans-serif; margin-top:4px; transition:all 0.15s }
        .vf-reset:hover { border-color:#555; color:#ccc }

        /* ===== VENTA CARD ===== */
        .vc { background:#111; border:1px solid rgba(255,255,255,0.06); border-radius:12px; overflow:hidden; transition:border-color 0.2s }
        .vc:hover { border-color:rgba(201,169,89,0.2) }

        /* Photo */
        .vc-photo { height:220px; background-size:cover; background-position:center; background-color:#1a1a1a; position:relative }
        @keyframes vcShimmer { 0%,100%{background-color:#1a1a1a} 50%{background-color:#262626} }
        .vc-photo:not([style*="background-image"]) { animation:vcShimmer 1.5s ease-in-out infinite }
        .vc-nofoto { display:flex; align-items:center; justify-content:center; height:100%; color:#444; font-size:13px; font-family:'Manrope',sans-serif }

        /* Carousel nav */
        .vc-nav { position:absolute; top:50%; transform:translateY(-50%); width:36px; height:36px; border-radius:50%; background:rgba(10,10,10,0.6); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.15s; z-index:3 }
        .vc-nav:hover { background:rgba(10,10,10,0.85) }
        .vc-nav-prev { left:8px }
        .vc-nav-next { right:8px }
        .vc-photo-count { position:absolute; top:10px; right:10px; background:rgba(10,10,10,0.6); color:#ccc; font-size:11px; padding:3px 8px; border-radius:10px; font-family:'Manrope',sans-serif }

        /* Overlay buttons */
        .vc-fav { position:absolute; top:10px; left:10px; width:40px; height:40px; border-radius:50%; background:rgba(10,10,10,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s; z-index:3 }
        .vc-fav:hover { transform:scale(1.1) }
        .vc-fav.active { background:rgba(201,169,89,0.15) }
        .vc-share { position:absolute; top:10px; left:58px; width:40px; height:40px; border-radius:50%; background:rgba(10,10,10,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s; z-index:3 }
        .vc-share:hover { transform:scale(1.1); background:rgba(10,10,10,0.7) }

        /* Content */
        .vc-body { padding:16px }
        .vc-name { font-family:'Cormorant Garamond',serif; font-size:20px; font-weight:400; color:#fff; line-height:1.2; margin-bottom:2px }
        .vc-zona { font-size:11px; color:rgba(255,255,255,0.5); letter-spacing:1px; margin-bottom:10px }
        .vc-id { color:rgba(255,255,255,0.2); font-size:10px; margin-left:4px; letter-spacing:0 }
        .vc-price { font-family:'Cormorant Garamond',serif; font-size:28px; font-weight:400; color:#f8f6f3; line-height:1; margin-bottom:4px; font-variant-numeric:tabular-nums }
        .vc-m2 { font-size:14px; color:#c9a959; margin-bottom:2px }
        .vc-usd-note { font-size:10px; color:rgba(255,255,255,0.25); font-family:'Manrope',sans-serif; margin-bottom:8px }
        .vc-specs { font-size:12px; color:rgba(255,255,255,0.6); margin-bottom:10px; font-family:'Manrope',sans-serif; display:flex; gap:8px; flex-wrap:wrap }
        .vc-specs span { white-space:nowrap }

        /* Badges */
        .vc-badges { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px }
        .vc-badge { font-size:10px; font-weight:500; padding:3px 9px; border-radius:100px; border:1px solid rgba(201,169,89,0.25); color:#c9a959; font-family:'Manrope',sans-serif }

        /* Feature hints (amenidades + equipamiento) */
        .vc-features { font-size:11px; color:rgba(255,255,255,0.4); font-family:'Manrope',sans-serif; display:flex; align-items:center; gap:7px; margin-bottom:5px; line-height:1.4 }
        .vc-features-icon { flex-shrink:0 }
        .vc-features-icon.icon-building { color:rgba(255,255,255,0.5) }
        .vc-features-icon.icon-unit { color:rgba(201,169,89,0.5) }
        .vc-features-count { color:#c9a959; flex-shrink:0 }

        /* Actions */
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
      `}</style>
    </>
  )
}
