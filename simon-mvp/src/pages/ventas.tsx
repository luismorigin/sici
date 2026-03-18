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
    // 3 means 3+ — we send dormitorios_lista with actual value 3, the RPC handles >=3 via dormitorios_min
    // For simplicity: if 3 is selected, we include 3 in the list and the RPC matches exact
    // To get 3+, we'd need dormitorios_min. Let's handle: if only 3 selected, use dormitorios_min=3
    // If mixed (e.g. 1 and 3), use dormitorios_lista for exact matches + won't catch 4+
    // Simplest correct approach: split 3 out as dormitorios_min if present
    const hasThreePlus = dorms.has(3)
    const others = arr.filter(d => d !== 3)
    if (hasThreePlus && others.length === 0) {
      // Only 3+ selected
      f.dormitorios = 3 // RPC dormitorios filter is exact match, but we need >=3
      // Actually the RPC doesn't have dormitorios_min for ventas simple.
      // Let's use dormitorios_lista with [3,4,5] to cover 3+
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
      {/* Zonas */}
      <div className="vf-group">
        <div className="vf-label">ZONA</div>
        <div className="vf-zona-btns">
          {ZONAS_CANONICAS.map(z => (
            <button key={z.db} className={`vf-zona-btn ${selectedZonas.has(z.db) ? 'active' : ''}`}
              onClick={() => toggleZona(z.db)}>{z.labelCorto}</button>
          ))}
        </div>
      </div>

      {/* Price range slider */}
      <div className="vf-group">
        <div className="vf-label">PRESUPUESTO</div>
        <div className="vf-range-display">{formatPriceK(minPrice)} — {formatPriceK(maxPrice)}</div>
        <div className="vf-range-wrap">
          <input type="range" className="vf-slider vf-slider-min" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={minPrice} onChange={e => handleMinPrice(parseInt(e.target.value))} />
          <input type="range" className="vf-slider vf-slider-max" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={maxPrice} onChange={e => handleMaxPrice(parseInt(e.target.value))} />
        </div>
      </div>

      {/* Dormitorios */}
      <div className="vf-group">
        <div className="vf-label">DORMITORIOS</div>
        <div className="vf-btn-row">
          {[0, 1, 2, 3].map(d => (
            <button key={d} className={`vf-btn ${selectedDorms.has(d) ? 'active' : ''}`}
              onClick={() => toggleDorm(d)}>{d === 0 ? 'Mono' : d === 3 ? '3+' : d}</button>
          ))}
        </div>
      </div>

      {/* Entrega */}
      <div className="vf-group">
        <div className="vf-label">ENTREGA</div>
        <div className="vf-btn-row">
          {ENTREGA_OPTIONS.map(o => (
            <button key={o.value} className={`vf-btn ${entrega === o.value ? 'active' : ''}`}
              onClick={() => handleEntrega(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>

      {/* Orden */}
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
              onClick={() => setEntrega(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
      <div className="vf-group">
        <div className="vf-label">ORDENAR POR</div>
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

// ===== Placeholder card =====
function CardPlaceholder({ property }: { property: UnidadVenta }) {
  const foto = property.fotos_urls?.[0]
  return (
    <div className="venta-card">
      <div className="venta-card-img">
        {foto ? (
          <img src={foto} alt={property.proyecto} loading="lazy" />
        ) : (
          <div className="venta-card-nofoto">Sin fotos</div>
        )}
        {property.fotos_count > 1 && (
          <span className="venta-card-fotocount">{property.fotos_count}</span>
        )}
      </div>
      <div className="venta-card-body">
        <div className="venta-card-nombre">{property.proyecto}</div>
        <div className="venta-card-zona">{displayZona(property.zona)} · #{property.id}</div>
        <div className="venta-card-precio">${property.precio_usd.toLocaleString('en-US')}</div>
        <div className="venta-card-m2">${property.precio_m2.toLocaleString('en-US')}/m²</div>
        <div className="venta-card-specs">
          {property.area_m2 > 0 && <span>{Math.round(property.area_m2)}m²</span>}
          {property.dormitorios !== null && <span>{property.dormitorios === 0 ? 'Mono' : `${property.dormitorios} dorm`}</span>}
          {property.banos !== null && <span>{property.banos} baño{property.banos !== 1 ? 's' : ''}</span>}
        </div>
        <div className="venta-card-badges">
          {property.solo_tc_paralelo && <span className="venta-badge">TC Paralelo</span>}
          {property.precio_negociable && <span className="venta-badge">Negociable</span>}
          {property.plan_pagos_desarrollador && <span className="venta-badge">Plan pagos</span>}
          {property.descuento_contado_pct && property.descuento_contado_pct > 0 && (
            <span className="venta-badge">-{property.descuento_contado_pct}% ctdo</span>
          )}
          {property.estado_construccion === 'preventa' && <span className="venta-badge">Preventa</span>}
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
  const [totalCount, setTotalCount] = useState(0) // total sin filtros
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

  const activeFilterCount = useMemo(() => {
    let c = 0
    if (filters.zonas_permitidas?.length) c += filters.zonas_permitidas.length
    if (filters.precio_min && filters.precio_min > MIN_PRICE) c++
    if (filters.precio_max && filters.precio_max < MAX_PRICE) c++
    if (filters.dormitorios_lista?.length) c++
    if (filters.estado_entrega) c++
    return c
  }, [filters])

  // Persist favorites to localStorage
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

  // Fetch properties
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
        /* ===== DESKTOP LAYOUT ===== */
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
            <DesktopFilters
              currentFilters={filters}
              isFiltered={isFiltered}
              onApply={applyFilters}
              onReset={resetFilters}
            />
          </aside>

          <main className="ventas-main">
            {loadError && (
              <div className="ventas-error">
                <p>No se pudo cargar. Verifica tu conexión.</p>
                <button onClick={() => fetchProperties()}>Reintentar</button>
              </div>
            )}
            {loading && properties.length === 0 && !loadError && (
              <div className="ventas-loading">Cargando departamentos en venta...</div>
            )}
            {!loading && properties.length === 0 && !loadError && (
              <div className="ventas-empty">No se encontraron departamentos con esos filtros.</div>
            )}
            {properties.length > 0 && (
              <div className="ventas-grid">
                {properties.map(p => (
                  <CardPlaceholder key={p.id} property={p} />
                ))}
              </div>
            )}
          </main>
        </div>
      ) : (
        /* ===== MOBILE LAYOUT ===== */
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
            <MobileFilters
              currentFilters={filters}
              isFiltered={isFiltered}
              onApply={applyFilters}
              onReset={resetFilters}
            />
          )}

          <div className="ventas-mobile-feed">
            {loadError && (
              <div className="ventas-error">
                <p>No se pudo cargar.</p>
                <button onClick={() => fetchProperties()}>Reintentar</button>
              </div>
            )}
            {loading && properties.length === 0 && !loadError && (
              <div className="ventas-loading">Cargando...</div>
            )}
            {!loading && properties.length === 0 && !loadError && (
              <div className="ventas-empty">No se encontraron departamentos.</div>
            )}
            {properties.map(p => (
              <CardPlaceholder key={p.id} property={p} />
            ))}
          </div>
        </>
      )}

      <style jsx global>{`
        body { background: #0a0a0a; margin: 0; }
      `}</style>
      <style jsx>{`
        /* ===== DESKTOP ===== */
        .ventas-desktop {
          display: flex;
          min-height: 100vh;
          font-family: 'Manrope', sans-serif;
          color: #f8f6f3;
        }
        .ventas-sidebar {
          width: 320px;
          min-width: 320px;
          background: #111;
          border-right: 1px solid #222;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          overflow-y: auto;
          z-index: 10;
        }
        .ventas-sidebar-header {
          padding: 24px 20px 12px;
          display: flex;
          align-items: baseline;
          gap: 12px;
        }
        .ventas-logo {
          font-family: 'Cormorant Garamond', serif;
          font-size: 24px;
          font-weight: 600;
          color: #f8f6f3;
          text-decoration: none;
        }
        .ventas-label {
          font-size: 11px;
          letter-spacing: 2px;
          color: #c9a959;
          font-weight: 600;
        }
        .ventas-sidebar-count {
          padding: 8px 20px 20px;
        }
        .ventas-count-num {
          font-family: 'Cormorant Garamond', serif;
          font-size: 36px;
          font-weight: 600;
          color: #f8f6f3;
          display: block;
          line-height: 1;
        }
        .ventas-count-text {
          font-size: 13px;
          color: #888;
        }
        .ventas-main {
          margin-left: 320px;
          flex: 1;
          padding: 24px;
          min-height: 100vh;
        }
        .ventas-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 20px;
        }

        /* ===== MOBILE ===== */
        .ventas-top-bar {
          position: sticky;
          top: 0;
          z-index: 20;
          background: #0a0a0a;
          border-bottom: 1px solid #222;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Manrope', sans-serif;
        }
        .ventas-logo-mobile {
          font-family: 'Cormorant Garamond', serif;
          font-size: 20px;
          font-weight: 600;
          color: #f8f6f3;
          text-decoration: none;
        }
        .ventas-label-mobile {
          font-size: 10px;
          letter-spacing: 2px;
          color: #c9a959;
          font-weight: 600;
        }
        .ventas-filter-btn {
          background: none;
          border: 1px solid #333;
          border-radius: 6px;
          color: #f8f6f3;
          padding: 6px 8px;
          cursor: pointer;
          position: relative;
          display: flex;
          align-items: center;
        }
        .ventas-filter-dot {
          position: absolute;
          top: -3px;
          right: -3px;
          width: 8px;
          height: 8px;
          background: #c9a959;
          border-radius: 50%;
        }
        .ventas-count-mobile {
          margin-left: auto;
          font-size: 12px;
          color: #888;
        }
        .ventas-mobile-feed {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          font-family: 'Manrope', sans-serif;
        }

        /* ===== MOBILE FILTER PANEL ===== */
        .mf-panel {
          background: #111;
          border-bottom: 1px solid #222;
          padding: 16px;
          font-family: 'Manrope', sans-serif;
        }
        .mf-apply {
          width: 100%;
          padding: 14px;
          background: #c9a959;
          color: #0a0a0a;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 1px;
          cursor: pointer;
          margin-top: 8px;
        }

        /* ===== FILTER COMPONENTS (shared desktop/mobile) ===== */
        .vf-wrap {
          padding: 0 20px 20px;
        }
        .vf-group {
          margin-bottom: 18px;
        }
        .vf-label {
          font-size: 10px;
          letter-spacing: 2px;
          color: #666;
          margin-bottom: 8px;
          font-weight: 600;
        }
        .vf-zona-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .vf-zona-btn {
          padding: 6px 12px;
          border-radius: 100px;
          border: 1px solid #333;
          background: transparent;
          color: #aaa;
          font-size: 12px;
          cursor: pointer;
          font-family: 'Manrope', sans-serif;
          transition: all 0.15s;
        }
        .vf-zona-btn.active {
          border-color: #c9a959;
          color: #c9a959;
          background: rgba(201, 169, 89, 0.06);
        }
        .vf-btn-row {
          display: flex;
          gap: 8px;
        }
        .vf-btn {
          flex: 1;
          padding: 8px 4px;
          border-radius: 4px;
          border: 1px solid #333;
          background: transparent;
          color: #aaa;
          font-size: 12px;
          cursor: pointer;
          font-family: 'Manrope', sans-serif;
          transition: all 0.15s;
        }
        .vf-btn.active {
          border-color: #c9a959;
          color: #c9a959;
          background: rgba(201, 169, 89, 0.06);
        }

        /* ===== RANGE SLIDER (dual handle) ===== */
        .vf-range-display {
          font-size: 14px;
          color: #c9a959;
          margin-bottom: 8px;
          text-align: right;
        }
        .vf-range-wrap {
          position: relative;
          height: 24px;
        }
        .vf-slider {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          pointer-events: none;
          height: 24px;
        }
        .vf-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #c9a959;
          cursor: pointer;
          pointer-events: all;
          border: 2px solid #0a0a0a;
          position: relative;
          z-index: 2;
        }
        .vf-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #c9a959;
          cursor: pointer;
          pointer-events: all;
          border: 2px solid #0a0a0a;
        }
        .vf-slider::-webkit-slider-runnable-track {
          height: 3px;
          background: #333;
          border-radius: 2px;
        }
        .vf-slider::-moz-range-track {
          height: 3px;
          background: #333;
          border-radius: 2px;
        }
        .vf-slider-min {
          z-index: 1;
        }
        .vf-slider-max {
          z-index: 2;
        }

        .vf-reset {
          width: 100%;
          padding: 10px;
          background: transparent;
          border: 1px solid #333;
          border-radius: 6px;
          color: #888;
          font-size: 12px;
          cursor: pointer;
          font-family: 'Manrope', sans-serif;
          margin-top: 4px;
        }

        /* ===== CARD ===== */
        .venta-card {
          background: #161616;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #222;
        }
        .venta-card-img {
          position: relative;
          height: 220px;
          background: #111;
        }
        .venta-card-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .venta-card-nofoto {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #555;
          font-size: 14px;
        }
        .venta-card-fotocount {
          position: absolute;
          bottom: 8px;
          right: 8px;
          background: rgba(0,0,0,0.7);
          color: #ccc;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
        }
        .venta-card-body {
          padding: 16px;
        }
        .venta-card-nombre {
          font-family: 'Cormorant Garamond', serif;
          font-size: 20px;
          font-weight: 600;
          color: #f8f6f3;
          line-height: 1.2;
        }
        .venta-card-zona {
          font-size: 12px;
          color: #888;
          margin-top: 2px;
        }
        .venta-card-precio {
          font-family: 'Cormorant Garamond', serif;
          font-size: 24px;
          font-weight: 600;
          color: #f8f6f3;
          margin-top: 12px;
        }
        .venta-card-m2 {
          font-size: 14px;
          color: #c9a959;
          margin-top: 2px;
        }
        .venta-card-specs {
          display: flex;
          gap: 12px;
          margin-top: 10px;
          font-size: 13px;
          color: #aaa;
        }
        .venta-card-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }
        .venta-badge {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 4px;
          background: rgba(201, 169, 89, 0.15);
          color: #c9a959;
          border: 1px solid rgba(201, 169, 89, 0.3);
        }

        /* ===== STATES ===== */
        .ventas-loading, .ventas-empty, .ventas-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 300px;
          color: #888;
          font-family: 'Manrope', sans-serif;
          font-size: 15px;
          text-align: center;
        }
        .ventas-error button {
          margin-top: 12px;
          padding: 8px 20px;
          background: #c9a959;
          color: #0a0a0a;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
        }

        /* ===== TOAST ===== */
        .ventas-toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: #222;
          color: #f8f6f3;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-family: 'Manrope', sans-serif;
          z-index: 100;
          border: 1px solid #333;
        }
      `}</style>
    </>
  )
}
