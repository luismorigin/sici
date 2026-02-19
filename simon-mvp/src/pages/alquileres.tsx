import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { buscarUnidadesAlquiler, type UnidadAlquiler, type FiltrosAlquiler } from '@/lib/supabase'

// Leaflet: dynamic import SSR-safe
const MapComponent = dynamic(() => import('@/components/alquiler/AlquilerMap'), { ssr: false })
const MapMultiComponent = dynamic(() => import('@/components/alquiler/AlquilerMapMulti'), { ssr: false })

// ===== CONSTANTS =====
const ZONAS_UI = [
  { id: 'equipetrol_centro', label: 'Eq. Centro' },
  { id: 'equipetrol_norte', label: 'Eq. Norte' },
  { id: 'sirari', label: 'Sirari' },
  { id: 'villa_brigida', label: 'V. Brigida' },
  { id: 'faremafu', label: 'Faremafu' },
  { id: 'equipetrol_franja', label: 'Eq. Franja' },
]

const MAX_FAVORITES = 3
const FILTER_CARD_POSITION = 3

function dormLabel(d: number) { return d === 0 ? 'Estudio' : d + ' dorm' }
function formatPrice(p: number) { return 'Bs ' + p.toLocaleString('es-BO') }

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
export default function AlquileresPage() {
  const isDesktop = useIsDesktop()
  const [properties, setProperties] = useState<UnidadAlquiler[]>([])
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetProperty, setSheetProperty] = useState<UnidadAlquiler | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid')
  const [mapSelectedId, setMapSelectedId] = useState<number | null>(null)
  const [mobileMapOpen, setMobileMapOpen] = useState(false)

  const [filters, setFilters] = useState<FiltrosAlquiler>({
    precio_mensual_max: 18000,
    orden: 'recientes',
    limite: 200,
    solo_con_fotos: true,
  })
  const [isFiltered, setIsFiltered] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  const feedRef = useRef<HTMLDivElement>(null)

  const fetchProperties = useCallback(async (f: FiltrosAlquiler) => {
    setLoading(true)
    const data = await buscarUnidadesAlquiler(f)
    setProperties(data)
    setLoading(false)
    return data.length
  }, [])

  useEffect(() => {
    async function init() {
      const data = await buscarUnidadesAlquiler({ limite: 200, solo_con_fotos: false })
      setTotalCount(data.length)
      await fetchProperties(filters)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  }

  async function resetFilters() {
    const defaultFilters: FiltrosAlquiler = {
      precio_mensual_max: 18000,
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

  function handleMapSelect(id: number) {
    setMapSelectedId(id)
    const p = properties.find(x => x.id === id)
    if (p) { setSheetProperty(p); setSheetOpen(true) }
  }

  function toggleFavorite(id: number) {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) }
      else if (next.size < MAX_FAVORITES) { next.add(id) }
      return next
    })
  }

  // Mobile: feed items with filter card at position 3
  const feedItems: Array<{ type: 'property'; data: UnidadAlquiler } | { type: 'filter' }> = []
  let filterInserted = false
  properties.forEach((p, i) => {
    feedItems.push({ type: 'property', data: p })
    if (i === FILTER_CARD_POSITION - 1 && !filterInserted) { feedItems.push({ type: 'filter' }); filterInserted = true }
  })
  if (properties.length > 0 && !filterInserted) {
    feedItems.push({ type: 'filter' })
  }

  return (
    <>
      <Head>
        <title>Simon · Alquileres Equipetrol</title>
        <meta name="description" content="Alquileres en Equipetrol, Santa Cruz. Departamentos verificados con datos reales." />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="theme-color" content="#0a0a0a" />
      </Head>

      <style jsx global>{`
        body { background: #0a0a0a; }
        @media (max-width: 767px) { body { overflow: hidden; } }
      `}</style>

      {/* Toast */}
      <div className={`alq-toast ${toastVisible ? 'show' : ''}`}>{toastMessage}</div>

      {/* Bottom sheet overlay */}
      {sheetOpen && <div className="alq-sheet-overlay" onClick={() => setSheetOpen(false)} />}
      <BottomSheet
        open={sheetOpen}
        property={sheetProperty}
        onClose={() => setSheetOpen(false)}
        isDesktop={isDesktop}
      />

      {isDesktop ? (
        /* ==================== DESKTOP LAYOUT ==================== */
        <div className="desktop-layout">
          {/* Left sidebar - filters */}
          <aside className="desktop-sidebar">
            <div className="desktop-sidebar-header">
              <Link href="/landing-v2" className="desktop-logo">Simon</Link>
              <div className="desktop-label">ALQUILERES</div>
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
                <svg viewBox="0 0 24 24" fill="#c9a959" stroke="#c9a959" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                {favorites.size} favorito{favorites.size > 1 ? 's' : ''}
              </div>
            )}
          </aside>

          {/* Right content */}
          <main className="desktop-main" ref={viewMode === 'grid' ? feedRef : undefined}
            style={viewMode === 'map' ? { overflow: 'hidden', display: 'flex', flexDirection: 'column' } : undefined}>
            {/* View toggle bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{properties.length} resultado{properties.length !== 1 ? 's' : ''}</span>
              <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 3 }}>
                <button
                  onClick={() => setViewMode('grid')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
                    background: viewMode === 'grid' ? '#c9a959' : '#1a1a1a',
                    color: viewMode === 'grid' ? '#0a0a0a' : '#fff',
                    fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', borderRadius: 6, letterSpacing: 1,
                    border: viewMode === 'grid' ? '2px solid #c9a959' : '2px solid rgba(255,255,255,0.3)',
                  }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:15,height:15}}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
                    background: viewMode === 'map' ? '#c9a959' : '#1a1a1a',
                    color: viewMode === 'map' ? '#0a0a0a' : '#fff',
                    fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', borderRadius: 6, letterSpacing: 1,
                    border: viewMode === 'map' ? '2px solid #c9a959' : '2px solid rgba(255,255,255,0.3)',
                  }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:15,height:15}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Mapa
                </button>
              </div>
            </div>

            {loading && properties.length === 0 ? (
              <div className="desktop-loading">Cargando alquileres...</div>
            ) : properties.length === 0 ? (
              <div className="desktop-loading">No se encontraron alquileres con estos filtros</div>
            ) : viewMode === 'grid' ? (
              <div className="desktop-grid">
                {properties.map(p => (
                  <DesktopCard
                    key={p.id}
                    property={p}
                    isFavorite={favorites.has(p.id)}
                    favoritesCount={favorites.size}
                    onToggleFavorite={() => toggleFavorite(p.id)}
                    onOpenInfo={() => { setSheetProperty(p); setSheetOpen(true) }}
                  />
                ))}
              </div>
            ) : (
              /* Map view: map + scrollable list */
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', minHeight: 300 }}>
                  <MapMultiComponent
                    properties={properties}
                    onSelectProperty={handleMapSelect}
                    selectedId={mapSelectedId}
                  />
                </div>
                <div style={{ height: 220, minHeight: 220, overflowX: 'auto', overflowY: 'hidden', display: 'flex', gap: 12, padding: '16px 0 8px' }}>
                  {properties.map(p => {
                    const isSelected = p.id === mapSelectedId
                    const name = p.nombre_edificio || p.nombre_proyecto || 'Departamento'
                    return (
                      <div key={p.id}
                        onClick={() => handleMapSelect(p.id)}
                        style={{
                          flex: '0 0 240px', background: '#111',
                          border: `1px solid ${isSelected ? '#c9a959' : 'rgba(255,255,255,0.06)'}`,
                          borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column',
                        }}>
                        <div style={{ height: 100, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#1a1a1a', ...(p.fotos_urls?.[0] ? { backgroundImage: `url('${p.fotos_urls[0]}')` } : {}) }} />
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: '#fff', lineHeight: 1.2, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 6 }}>{p.zona || 'Equipetrol'}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: '#c9a959', lineHeight: 1 }}>{formatPrice(p.precio_mensual_bob)}/mes</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontFamily: "'Manrope', sans-serif" }}>{p.area_m2}m² · {dormLabel(p.dormitorios)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </main>
        </div>
      ) : (
        /* ==================== MOBILE LAYOUT (TikTok feed) ==================== */
        <>
          {/* Top bar */}
          <div className="alq-top-bar">
            <div>
              <div className="alq-logo">Simon</div>
              <div className="alq-label">ALQUILERES</div>
            </div>
            <button className="alq-filter-btn" onClick={() => {
              document.getElementById('filterCard')?.scrollIntoView({ behavior: 'smooth' })
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18M7 12h10M10 18h4"/></svg>
            </button>
          </div>

          {/* Floating fav button */}
          <div className="alq-fav-floating">
            <svg viewBox="0 0 24 24" fill="none" stroke="#c9a959" strokeWidth="1.5">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <div className={`alq-fav-count ${favorites.size > 0 ? 'show' : ''}`}>{favorites.size}</div>
          </div>

          {/* Floating map button */}
          <button className="alq-map-floating" onClick={() => setMobileMapOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#c9a959" strokeWidth="1.5" style={{width:22,height:22}}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
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
                  onSelectProperty={(id) => { setMobileMapOpen(false); handleMapSelect(id) }}
                  selectedId={mapSelectedId}
                />
              </div>
            </div>
          )}

          <CardCounter total={feedItems.length} active={activeCardIndex} />

          {/* Feed */}
          <div className="alq-feed" ref={feedRef}>
            {loading && properties.length === 0 ? (
              <div className="alq-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="alq-logo" style={{ fontSize: 44, marginBottom: 8 }}>Simon</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Cargando alquileres...</div>
                </div>
              </div>
            ) : (
              feedItems.map((item, idx) => {
                if (item.type === 'filter') {
                  return (
                    <MobileFilterCard
                      key="filter"
                      totalCount={totalCount}
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
                    isFavorite={favorites.has(item.data.id)}
                    favoritesCount={favorites.size}
                    onToggleFavorite={() => toggleFavorite(item.data.id)}
                    onOpenInfo={() => { setSheetProperty(item.data); setSheetOpen(true) }}
                    onVisible={() => setActiveCardIndex(idx)}
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
          position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 300;
          background: #c9a959; color: #0a0a0a; padding: 10px 24px; border-radius: 100px;
          font-size: 13px; font-weight: 600; font-family: 'Manrope', sans-serif;
          opacity: 0; transition: opacity 0.3s; pointer-events: none;
        }
        .alq-toast.show { opacity: 1; }
        .alq-sheet-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 200; }

        /* ========== DESKTOP ========== */
        .desktop-layout {
          display: flex; height: 100vh; overflow: hidden;
          font-family: 'Manrope', sans-serif;
        }
        .desktop-sidebar {
          width: 320px; min-width: 320px; height: 100vh;
          background: #0a0a0a; border-right: 1px solid rgba(255,255,255,0.06);
          padding: 32px 28px; overflow-y: auto;
          display: flex; flex-direction: column;
        }
        .desktop-sidebar-header { margin-bottom: 32px; }
        .desktop-logo {
          font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 400;
          color: #fff; text-decoration: none; display: block;
        }
        .desktop-label { font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 3px; margin-top: 2px; }
        .desktop-sidebar-count { margin-bottom: 28px; }
        .desktop-count-num {
          font-family: 'Cormorant Garamond', serif; font-size: 48px; font-weight: 300;
          color: #c9a959; line-height: 1; display: block;
        }
        .desktop-count-label { font-size: 13px; color: rgba(255,255,255,0.4); }
        .desktop-fav-summary {
          margin-top: auto; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: center; gap: 8px; color: #c9a959; font-size: 13px;
        }

        .desktop-main {
          flex: 1; height: 100vh; overflow-y: auto; padding: 32px;
          scrollbar-width: thin; scrollbar-color: rgba(201,169,89,0.3) transparent;
        }
        .desktop-main::-webkit-scrollbar { width: 6px; }
        .desktop-main::-webkit-scrollbar-track { background: transparent; }
        .desktop-main::-webkit-scrollbar-thumb { background: rgba(201,169,89,0.3); border-radius: 3px; }
        .desktop-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 24px; max-width: 1200px;
        }
        .desktop-loading {
          display: flex; align-items: center; justify-content: center; height: 300px;
          color: rgba(255,255,255,0.4); font-size: 15px;
        }


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
          padding: 12px 20px; padding-top: max(12px, env(safe-area-inset-top));
          background: linear-gradient(rgba(10,10,10,0.7), transparent); pointer-events: none;
        }
        .alq-top-bar > * { pointer-events: auto; }
        .alq-logo { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 400; color: #fff; }
        .alq-label { font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 3px; }
        .alq-filter-btn {
          width: 38px; height: 38px; border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.15); background: rgba(10,10,10,0.5); color: #fff;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .alq-fav-floating {
          position: fixed; bottom: max(24px, calc(env(safe-area-inset-bottom) + 8px)); right: 24px;
          z-index: 100; width: 48px; height: 48px; border-radius: 50%;
          background: rgba(10,10,10,0.7); border: 1px solid rgba(201,169,89,0.25);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .alq-fav-floating svg { width: 22px; height: 22px; }
        .alq-fav-count {
          position: absolute; top: -4px; right: -4px;
          width: 18px; height: 18px; border-radius: 50%;
          background: #c9a959; color: #0a0a0a; font-size: 10px; font-weight: 600;
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transform: scale(0); transition: all 0.3s;
        }
        .alq-fav-count.show { opacity: 1; transform: scale(1); }

        /* Mobile map button */
        .alq-map-floating {
          position: fixed; bottom: max(24px, calc(env(safe-area-inset-bottom) + 8px)); left: 24px;
          z-index: 100; width: 48px; height: 48px; border-radius: 50%;
          background: rgba(10,10,10,0.7); border: 1px solid rgba(201,169,89,0.25);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .alq-mobile-map-overlay {
          position: fixed; inset: 0; z-index: 300; background: #0a0a0a;
          display: flex; flex-direction: column;
        }
        .alq-mobile-map-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 20px; padding-top: max(12px, env(safe-area-inset-top));
          background: #0a0a0a; border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .alq-mobile-map-title { font-family: 'Cormorant Garamond', serif; font-size: 20px; color: #fff; }
        .alq-mobile-map-close {
          width: 36px; height: 36px; border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.1); background: transparent;
          color: rgba(255,255,255,0.5); font-size: 20px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .alq-mobile-map-body { flex: 1; }
      `}</style>
    </>
  )
}

// ===== DESKTOP FILTERS (sidebar, auto-apply) =====
function DesktopFilters({ currentFilters, isFiltered, onApply, onReset }: {
  currentFilters: FiltrosAlquiler; isFiltered: boolean
  onApply: (f: FiltrosAlquiler) => void; onReset: () => void
}) {
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_mensual_max || 18000)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set())
  const [amoblado, setAmoblado] = useState(currentFilters.amoblado || false)
  const [mascotas, setMascotas] = useState(currentFilters.acepta_mascotas || false)
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set(currentFilters.zonas_permitidas || []))
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Build filters object from current state
  const buildFilters = useCallback((price: number, dorms: Set<number>, amob: boolean, masc: boolean, zonas: Set<string>) => {
    const f: FiltrosAlquiler = { precio_mensual_max: price, orden: 'recientes', limite: 200, solo_con_fotos: true }
    if (dorms.size === 1) { const d = Array.from(dorms)[0]; if (d < 3) f.dormitorios = d }
    if (amob) f.amoblado = true
    if (masc) f.acepta_mascotas = true
    if (zonas.size > 0) f.zonas_permitidas = Array.from(zonas)
    return f
  }, [])

  // Auto-apply with debounce
  const autoApply = useCallback((price: number, dorms: Set<number>, amob: boolean, masc: boolean, zonas: Set<string>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onApply(buildFilters(price, dorms, amob, masc, zonas))
    }, 400)
  }, [onApply, buildFilters])

  function toggleDorm(d: number) {
    setSelectedDorms(prev => {
      const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d)
      autoApply(maxPrice, n, amoblado, mascotas, selectedZonas)
      return n
    })
  }
  function toggleZona(id: string) {
    setSelectedZonas(prev => {
      const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id)
      autoApply(maxPrice, selectedDorms, amoblado, mascotas, n)
      return n
    })
  }
  function handlePriceChange(price: number) {
    setMaxPrice(price)
    autoApply(price, selectedDorms, amoblado, mascotas, selectedZonas)
  }
  function handleAmoblado() {
    const next = !amoblado
    setAmoblado(next)
    autoApply(maxPrice, selectedDorms, next, mascotas, selectedZonas)
  }
  function handleMascotas() {
    const next = !mascotas
    setMascotas(next)
    autoApply(maxPrice, selectedDorms, amoblado, next, selectedZonas)
  }

  return (
    <div className="df-wrap">
      {/* Microzonas */}
      <div className="df-group">
        <div className="df-label">MICROZONA</div>
        <div className="df-zona-btns">
          {ZONAS_UI.map(z => (
            <button key={z.id} className={`df-zona-btn ${selectedZonas.has(z.id) ? 'active' : ''}`}
              onClick={() => toggleZona(z.id)}>{z.label}</button>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div className="df-group">
        <div className="df-label">PRESUPUESTO MAXIMO</div>
        <input type="range" className="df-slider" min={2000} max={18000} step={500} value={maxPrice}
          onChange={e => handlePriceChange(parseInt(e.target.value))} />
        <div className="df-slider-val">{formatPrice(maxPrice)}/mes</div>
      </div>

      {/* Dorms */}
      <div className="df-group">
        <div className="df-label">DORMITORIOS</div>
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
          <button className={`df-dorm-btn ${amoblado ? 'active' : ''}`} onClick={handleAmoblado}>Amoblado</button>
          <button className={`df-dorm-btn ${mascotas ? 'active' : ''}`} onClick={handleMascotas}>Mascotas</button>
        </div>
      </div>

      {isFiltered && <button className="df-reset" onClick={onReset}>Quitar filtros</button>}

      <style jsx>{`
        .df-wrap { flex: 1; }
        .df-group { margin-bottom: 18px; }
        .df-label { font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.35); letter-spacing: 2px; margin-bottom: 8px; }
        .df-zona-btns { display: flex; flex-wrap: wrap; gap: 6px; }
        .df-zona-btn { padding: 6px 12px; border: 1px solid rgba(255,255,255,0.12); background: transparent; color: rgba(255,255,255,0.5); font-family: 'Manrope', sans-serif; font-size: 11px; cursor: pointer; border-radius: 100px; transition: all 0.2s; }
        .df-zona-btn.active { border-color: #c9a959; color: #c9a959; background: rgba(201,169,89,0.06); }
        .df-dorm-btns { display: flex; gap: 8px; }
        .df-dorm-btn { flex: 1; padding: 9px; border: 1px solid rgba(255,255,255,0.12); background: transparent; color: rgba(255,255,255,0.5); font-family: 'Manrope', sans-serif; font-size: 12px; cursor: pointer; border-radius: 4px; transition: all 0.2s; }
        .df-dorm-btn.active { border-color: #c9a959; color: #c9a959; background: rgba(201,169,89,0.06); }
        .df-slider { width: 100%; -webkit-appearance: none; appearance: none; height: 2px; background: rgba(255,255,255,0.12); border-radius: 2px; outline: none; }
        .df-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #c9a959; cursor: pointer; }
        .df-slider-val { text-align: right; font-size: 13px; color: #c9a959; margin-top: 6px; font-weight: 500; }
        .df-cta { display: block; width: 100%; padding: 12px; background: #c9a959; border: none; color: #0a0a0a; font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; margin-bottom: 10px; transition: opacity 0.2s; }
        .df-cta:hover { opacity: 0.9; }
        .df-reset { display: block; width: 100%; padding: 10px; background: transparent; border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.5); font-family: 'Manrope', sans-serif; font-size: 12px; cursor: pointer; border-radius: 4px; }
      `}</style>
    </div>
  )
}

// ===== DESKTOP CARD =====
function DesktopCard({ property: p, isFavorite, favoritesCount, onToggleFavorite, onOpenInfo }: {
  property: UnidadAlquiler; isFavorite: boolean; favoritesCount: number
  onToggleFavorite: () => void; onOpenInfo: () => void
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = (p.fotos_urls?.length ?? 0) > 0 ? p.fotos_urls : ['']
  const displayName = p.nombre_edificio || p.nombre_proyecto || 'Departamento'

  const badges: Array<{ text: string; color: string }> = []
  if (p.amoblado === 'si') badges.push({ text: 'Amoblado', color: 'gold' })
  if (p.amoblado === 'semi') badges.push({ text: 'Semi-amoblado', color: 'gold' })
  if (p.acepta_mascotas) badges.push({ text: 'Mascotas', color: 'purple' })
  if (p.monto_expensas_bob && p.monto_expensas_bob > 0) badges.push({ text: 'Expensas incl.', color: 'gold' })
  if (p.estacionamientos && p.estacionamientos > 0) badges.push({ text: `${p.estacionamientos} parqueo`, color: '' })
  if (p.baulera) badges.push({ text: 'Baulera', color: '' })

  function handleFav() {
    if (!isFavorite && favoritesCount >= MAX_FAVORITES) return
    onToggleFavorite()
  }

  return (
    <div className="dc-card">
      {/* Photo */}
      <div className="dc-photo" style={photos[photoIdx] ? { backgroundImage: `url('${photos[photoIdx]}')` } : { background: '#1a1a1a' }}>
        {photos.length > 1 && (
          <>
            {photoIdx > 0 && (
              <button className="dc-nav dc-prev" onClick={() => setPhotoIdx(photoIdx - 1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M15 18l-6-6 6-6"/></svg>
              </button>
            )}
            {photoIdx < photos.length - 1 && (
              <button className="dc-nav dc-next" onClick={() => setPhotoIdx(photoIdx + 1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )}
            <div className="dc-photo-count">{photoIdx + 1}/{photos.length}</div>
          </>
        )}
        {/* Fav button on photo */}
        <button className={`dc-fav-btn ${isFavorite ? 'active' : ''}`} onClick={handleFav}>
          <svg viewBox="0 0 24 24" fill={isFavorite ? '#c9a959' : 'none'} stroke={isFavorite ? '#c9a959' : '#fff'} strokeWidth="1.5" style={{ width: 20, height: 20 }}>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="dc-content">
        <div className="dc-name">{displayName}</div>
        <div className="dc-zona">{p.zona || 'Equipetrol'}</div>
        <div className="dc-price">{formatPrice(p.precio_mensual_bob)}<span>/mes</span></div>
        <div className="dc-specs">
          {p.area_m2}m2 · {dormLabel(p.dormitorios)} · {p.banos ? `${p.banos} bano${p.banos > 1 ? 's' : ''}` : '—'}
        </div>
        <div className="dc-badges">
          {badges.slice(0, 4).map((b, i) => (
            <span key={i} className={`dc-badge ${b.color}`}>{b.text}</span>
          ))}
        </div>
        <div className="dc-actions">
          <button className="dc-info-btn" onClick={onOpenInfo}>Info + Mapa</button>
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="dc-ver-btn">Ver &#8599;</a>
        </div>
      </div>

      <style jsx>{`
        .dc-card { background: #111; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; transition: border-color 0.2s; }
        .dc-card:hover { border-color: rgba(201,169,89,0.2); }
        .dc-photo { height: 220px; background-size: cover; background-position: center; background-color: #1a1a1a; position: relative; }
        .dc-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; border-radius: 50%; background: rgba(10,10,10,0.6); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .dc-prev { left: 8px; }
        .dc-next { right: 8px; }
        .dc-photo-count { position: absolute; top: 10px; right: 10px; background: rgba(10,10,10,0.6); padding: 3px 10px; border-radius: 100px; font-size: 11px; color: rgba(255,255,255,0.7); font-family: 'Manrope', sans-serif; }
        .dc-fav-btn { position: absolute; top: 10px; left: 10px; width: 36px; height: 36px; border-radius: 50%; background: rgba(10,10,10,0.5); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.15s; }
        .dc-fav-btn:hover { transform: scale(1.1); }
        .dc-fav-btn.active { background: rgba(201,169,89,0.15); }
        .dc-content { padding: 16px; }
        .dc-name { font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 400; color: #fff; line-height: 1.2; margin-bottom: 2px; }
        .dc-zona { font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 1px; margin-bottom: 10px; }
        .dc-price { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 400; color: #c9a959; line-height: 1; margin-bottom: 4px; }
        .dc-price span { font-size: 16px; color: rgba(201,169,89,0.6); }
        .dc-specs { font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 10px; font-family: 'Manrope', sans-serif; }
        .dc-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
        .dc-badge { font-size: 10px; font-weight: 500; padding: 3px 8px; border-radius: 100px; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-family: 'Manrope', sans-serif; }
        .dc-badge.gold { border-color: rgba(201,169,89,0.25); color: #c9a959; }
        .dc-badge.purple { border-color: rgba(168,85,247,0.25); color: #a855f7; }
        .dc-actions { display: flex; gap: 8px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px; }
        .dc-info-btn { flex: 1; padding: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-family: 'Manrope', sans-serif; font-size: 11px; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
        .dc-info-btn:hover { border-color: rgba(255,255,255,0.3); color: #fff; }
        .dc-ver-btn { flex: 1; padding: 8px; background: rgba(201,169,89,0.1); border: 1px solid rgba(201,169,89,0.25); color: #c9a959; font-family: 'Manrope', sans-serif; font-size: 11px; text-align: center; text-decoration: none; border-radius: 6px; transition: all 0.2s; font-weight: 500; }
        .dc-ver-btn:hover { background: rgba(201,169,89,0.2); }
      `}</style>
    </div>
  )
}

// ===== MOBILE PROPERTY CARD (full-screen) =====
function MobilePropertyCard({
  property: p, isFirst, isFavorite, favoritesCount, onToggleFavorite, onOpenInfo, onVisible,
}: {
  property: UnidadAlquiler; isFirst: boolean; isFavorite: boolean; favoritesCount: number
  onToggleFavorite: () => void; onOpenInfo: () => void; onVisible: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [shakeBtn, setShakeBtn] = useState(false)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) onVisible()
    }, { threshold: 0.6 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [onVisible])

  function handleFavorite() {
    if (!isFavorite && favoritesCount >= MAX_FAVORITES) {
      setShakeBtn(true); setTimeout(() => setShakeBtn(false), 300); return
    }
    onToggleFavorite()
  }

  const badges: Array<{ text: string; color: string }> = []
  if (p.amoblado === 'si') badges.push({ text: 'Amoblado', color: 'gold' })
  if (p.amoblado === 'semi') badges.push({ text: 'Semi-amoblado', color: 'gold' })
  if (p.acepta_mascotas) badges.push({ text: 'Mascotas', color: 'purple' })
  if (p.monto_expensas_bob && p.monto_expensas_bob > 0) badges.push({ text: 'Expensas incl.', color: 'gold' })
  if (p.estacionamientos && p.estacionamientos > 0) badges.push({ text: `${p.estacionamientos} parqueo`, color: '' })
  if (p.baulera) badges.push({ text: 'Baulera', color: '' })
  if (p.deposito_meses) badges.push({ text: `Deposito ${p.deposito_meses}m`, color: '' })

  const displayName = p.nombre_edificio || p.nombre_proyecto || 'Departamento'

  return (
    <div className="alq-card" ref={cardRef}>
      <PhotoCarousel photos={p.fotos_urls || []} isFirst={isFirst} />
      <div className="mc-content">
        <div className="mc-name">{displayName}</div>
        <div className="mc-zona">{p.zona || 'Equipetrol'}</div>
        <div className="mc-price">{formatPrice(p.precio_mensual_bob)}/mes</div>
        <div className="mc-specs">{p.area_m2}m2 · {dormLabel(p.dormitorios)} · {p.banos ? `${p.banos} bano${p.banos > 1 ? 's' : ''}` : '—'}</div>
        <div className="mc-badges">
          {badges.slice(0, 4).map((b, i) => <span key={i} className={`mc-badge ${b.color}`}>{b.text}</span>)}
        </div>
        {p.descripcion && (
          <div className="mc-razon">&ldquo;{p.descripcion.slice(0, 120)}{p.descripcion.length > 120 ? '...' : ''}&rdquo;</div>
        )}
        <div className="mc-actions">
          <button className={`mc-btn mc-fav ${isFavorite ? 'active' : ''} ${shakeBtn ? 'shake' : ''}`} onClick={handleFavorite}>
            <svg viewBox="0 0 24 24" fill={isFavorite ? '#c9a959' : 'none'} stroke={isFavorite ? '#c9a959' : 'currentColor'} strokeWidth="1.5" style={{ width: 22, height: 22 }}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <button className="mc-btn mc-info" onClick={onOpenInfo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 18, height: 18 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg> Info + Mapa
          </button>
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="mc-btn mc-ver">Ver &#8599;</a>
        </div>
      </div>
      {isFirst && <div className="mc-scroll-hint"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{width:18,height:18}}><path d="M12 5v14M19 12l-7 7-7-7"/></svg></div>}

      <style jsx>{`
        .alq-card { height: 100vh; height: 100dvh; scroll-snap-align: start; position: relative; overflow: hidden; display: flex; flex-direction: column; background: #0a0a0a; }
        .mc-content { flex: 1; padding: 0 24px 20px; padding-bottom: max(20px, calc(env(safe-area-inset-bottom) + 8px)); display: flex; flex-direction: column; overflow: hidden; }
        .mc-name { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 400; color: #fff; line-height: 1.1; margin-bottom: 3px; }
        .mc-zona { font-size: 12px; color: rgba(255,255,255,0.5); letter-spacing: 1px; margin-bottom: 12px; }
        .mc-price { font-family: 'Cormorant Garamond', serif; font-size: 36px; font-weight: 400; color: #c9a959; line-height: 1; margin-bottom: 4px; }
        .mc-specs { font-size: 13px; font-weight: 300; color: rgba(255,255,255,0.55); margin-bottom: 12px; font-family: 'Manrope', sans-serif; }
        .mc-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .mc-badge { font-size: 10px; font-weight: 500; letter-spacing: 0.5px; padding: 4px 10px; border-radius: 100px; border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.04); font-family: 'Manrope', sans-serif; }
        .mc-badge.gold { border-color: rgba(201,169,89,0.25); color: #c9a959; background: rgba(201,169,89,0.06); }
        .mc-badge.purple { border-color: rgba(168,85,247,0.25); color: #a855f7; background: rgba(168,85,247,0.06); }
        .mc-razon { font-size: 12px; font-weight: 300; color: rgba(255,255,255,0.45); line-height: 1.5; margin-bottom: auto; font-style: italic; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .mc-actions { display: flex; align-items: center; gap: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 8px; }
        .mc-btn { display: flex; align-items: center; gap: 5px; background: none; border: none; color: rgba(255,255,255,0.6); font-size: 12px; font-family: 'Manrope', sans-serif; cursor: pointer; padding: 6px 0; }
        .mc-btn.mc-fav.active svg { filter: drop-shadow(0 2px 4px rgba(201,169,89,0.5)); }
        .mc-btn.mc-info { color: rgba(255,255,255,0.5); font-size: 11px; letter-spacing: 0.5px; }
        .mc-btn.mc-ver { margin-left: auto; color: #c9a959; text-decoration: none; font-weight: 500; }
        .mc-btn.shake { animation: mcShake 0.3s ease; }
        @keyframes mcShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
        .mc-scroll-hint { position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%); z-index: 10; animation: mcBounce 2s infinite; opacity: 0.25; }
        @keyframes mcBounce { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-5px)} }
      `}</style>
    </div>
  )
}

// ===== PHOTO CAROUSEL (native scroll-snap) =====
function PhotoCarousel({ photos, isFirst }: { photos: string[]; isFirst: boolean }) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const total = photos.length || 1

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
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="pc-zone">
      <div className="pc-scroll" ref={scrollRef}>
        {(photos.length > 0 ? photos : ['']).map((url, i) => (
          <div key={i} className="pc-slide" style={url ? { backgroundImage: `url('${url}')` } : { background: '#1a1a1a' }} />
        ))}
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
      {isFirst && total > 1 && (
        <div className="pc-swipe-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:20,height:20}}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Desliza para mas fotos
        </div>
      )}
      <style jsx>{`
        .pc-zone { flex: 0 0 55%; position: relative; overflow: hidden; }
        .pc-zone::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 80px; background: linear-gradient(transparent, #0a0a0a); pointer-events: none; z-index: 2; }
        .pc-scroll { display: flex; height: 100%; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .pc-scroll::-webkit-scrollbar { display: none; }
        .pc-slide { flex: 0 0 100%; height: 100%; background-size: cover; background-position: center; background-color: #111; scroll-snap-align: start; }
        .pc-counter { position: absolute; top: 16px; right: 16px; z-index: 5; background: rgba(10,10,10,0.6); backdrop-filter: blur(8px); padding: 5px 12px; border-radius: 100px; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.8); display: flex; align-items: center; gap: 5px; font-family: 'Manrope', sans-serif; }
        .pc-dots { position: absolute; bottom: 90px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 5; }
        .pc-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.35); transition: all 0.25s; }
        .pc-dot.active { background: #fff; width: 20px; border-radius: 3px; }
        .pc-swipe-hint { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 10; display: flex; align-items: center; gap: 8px; background: rgba(10,10,10,0.65); padding: 10px 20px; border-radius: 100px; color: rgba(255,255,255,0.7); font-size: 13px; font-family: 'Manrope', sans-serif; pointer-events: none; animation: pcFade 3s ease-in-out forwards; }
        @keyframes pcFade { 0%{opacity:0} 15%{opacity:1} 70%{opacity:1} 100%{opacity:0} }
      `}</style>
    </div>
  )
}

// ===== MOBILE FILTER CARD =====
function MobileFilterCard({ totalCount, currentFilters, isFiltered, onApply, onReset }: {
  totalCount: number; currentFilters: FiltrosAlquiler; isFiltered: boolean
  onApply: (f: FiltrosAlquiler) => void; onReset: () => void
}) {
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_mensual_max || 18000)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(new Set())
  const [amoblado, setAmoblado] = useState(currentFilters.amoblado || false)
  const [mascotas, setMascotas] = useState(currentFilters.acepta_mascotas || false)
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set(currentFilters.zonas_permitidas || []))

  function toggleDorm(d: number) { setSelectedDorms(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n }) }
  function toggleZona(id: string) { setSelectedZonas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  function handleApply() {
    const f: FiltrosAlquiler = { precio_mensual_max: maxPrice, orden: 'recientes', limite: 200, solo_con_fotos: true }
    if (selectedDorms.size === 1) { const d = Array.from(selectedDorms)[0]; if (d < 3) f.dormitorios = d }
    if (amoblado) f.amoblado = true
    if (mascotas) f.acepta_mascotas = true
    if (selectedZonas.size > 0) f.zonas_permitidas = Array.from(selectedZonas)
    onApply(f)
  }

  return (
    <div className="alq-card mfc" id="filterCard">
      <div className="mfc-logo">Simon</div>
      <div className="mfc-label-wrap"><span className="mfc-line"/><span className="mfc-label">Inteligencia Inmobiliaria</span><span className="mfc-line"/></div>
      <div className="mfc-count">{totalCount}</div>
      <div className="mfc-sub">alquileres en Equipetrol</div>
      <div className="mfc-q">Queres ver solo<br/>lo que te sirve?</div>
      <div className="mfc-filters">
        <div className="mfc-group"><div className="mfc-gl">MICROZONA</div>
          <div className="mfc-zonas">{ZONAS_UI.map(z => <button key={z.id} className={`mfc-zb ${selectedZonas.has(z.id)?'active':''}`} onClick={()=>toggleZona(z.id)}>{z.label}</button>)}</div>
        </div>
        <div className="mfc-group"><div className="mfc-gl">PRESUPUESTO MAXIMO</div>
          <input type="range" className="mfc-slider" min={2000} max={18000} step={500} value={maxPrice} onChange={e=>setMaxPrice(parseInt(e.target.value))}/>
          <div className="mfc-sv">{formatPrice(maxPrice)}/mes</div>
        </div>
        <div className="mfc-group"><div className="mfc-gl">DORMITORIOS</div>
          <div className="mfc-dorms">{[0,1,2,3].map(d=><button key={d} className={`mfc-db ${selectedDorms.has(d)?'active':''}`} onClick={()=>toggleDorm(d)}>{d===0?'Mono':d===3?'3+':d}</button>)}</div>
        </div>
        <div className="mfc-group"><div className="mfc-dorms">
          <button className={`mfc-db ${amoblado?'active':''}`} onClick={()=>setAmoblado(!amoblado)}>Amoblado</button>
          <button className={`mfc-db ${mascotas?'active':''}`} onClick={()=>setMascotas(!mascotas)}>Mascotas</button>
        </div></div>
      </div>
      <button className="mfc-cta" onClick={handleApply}>FILTRAR</button>
      {isFiltered && <button className="mfc-reset" onClick={onReset}>Quitar filtros · ver todas</button>}
      <div className="mfc-skip">o segui explorando &darr;</div>
      <style jsx>{`
        .mfc { display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px 32px;height:100vh;height:100dvh;scroll-snap-align:start;background:#0a0a0a; }
        .mfc-logo { font-family:'Cormorant Garamond',serif;font-size:44px;font-weight:400;color:#fff;margin-bottom:6px; }
        .mfc-label-wrap { display:flex;align-items:center;gap:16px;margin-bottom:24px; }
        .mfc-line { width:28px;height:1px;background:#c9a959; }
        .mfc-label { font-size:10px;color:#c9a959;letter-spacing:4px;font-family:'Manrope',sans-serif; }
        .mfc-count { font-family:'Cormorant Garamond',serif;font-size:56px;font-weight:300;color:#c9a959;line-height:1;margin-bottom:6px; }
        .mfc-sub { font-size:15px;font-weight:300;color:rgba(255,255,255,0.45);margin-bottom:24px;font-family:'Manrope',sans-serif; }
        .mfc-q { font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:400;color:#fff;margin-bottom:20px;line-height:1.3; }
        .mfc-filters { width:100%;max-width:300px;margin-bottom:20px; }
        .mfc-group { margin-bottom:14px;text-align:left; }
        .mfc-gl { font-size:10px;font-weight:500;color:rgba(255,255,255,0.35);letter-spacing:2px;margin-bottom:8px;font-family:'Manrope',sans-serif; }
        .mfc-zonas { display:flex;flex-wrap:wrap;gap:6px; }
        .mfc-zb { padding:6px 12px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.5);font-family:'Manrope',sans-serif;font-size:11px;cursor:pointer;border-radius:100px;transition:all 0.2s; }
        .mfc-zb.active { border-color:#c9a959;color:#c9a959;background:rgba(201,169,89,0.06); }
        .mfc-dorms { display:flex;gap:8px; }
        .mfc-db { flex:1;padding:9px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.5);font-family:'Manrope',sans-serif;font-size:12px;cursor:pointer;border-radius:4px;transition:all 0.2s; }
        .mfc-db.active { border-color:#c9a959;color:#c9a959;background:rgba(201,169,89,0.06); }
        .mfc-slider { width:100%;-webkit-appearance:none;appearance:none;height:2px;background:rgba(255,255,255,0.12);border-radius:2px;outline:none; }
        .mfc-slider::-webkit-slider-thumb { -webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#c9a959;cursor:pointer; }
        .mfc-sv { text-align:right;font-size:13px;color:#c9a959;margin-top:6px;font-weight:500;font-family:'Manrope',sans-serif; }
        .mfc-cta { display:block;width:100%;max-width:300px;padding:14px;background:#c9a959;border:none;color:#0a0a0a;font-family:'Manrope',sans-serif;font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;cursor:pointer;margin-bottom:12px; }
        .mfc-cta:active { transform:scale(0.97); }
        .mfc-reset { display:block;width:100%;max-width:300px;padding:10px;background:transparent;border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.5);font-family:'Manrope',sans-serif;font-size:12px;cursor:pointer;margin-bottom:12px;border-radius:4px; }
        .mfc-skip { font-size:12px;color:rgba(255,255,255,0.25);font-weight:300;font-family:'Manrope',sans-serif; }
      `}</style>
    </div>
  )
}

// ===== BOTTOM SHEET =====
function BottomSheet({ open, property, onClose, isDesktop }: { open: boolean; property: UnidadAlquiler | null; onClose: () => void; isDesktop: boolean }) {
  if (!property) return null
  const p = property

  const features: Array<{ icon: string; label: string; value: string; highlight?: boolean }> = []
  features.push({ icon: '📐', label: 'Area', value: `${p.area_m2}m2` })
  features.push({ icon: '🛏️', label: 'Tipo', value: dormLabel(p.dormitorios) })
  features.push({ icon: '🚿', label: 'Banos', value: p.banos ? `${p.banos} bano${p.banos > 1 ? 's' : ''}` : '—' })
  if (p.piso !== null) features.push({ icon: '🏢', label: 'Piso', value: p.piso === 0 ? 'PB' : `Piso ${p.piso}` })
  if (p.estacionamientos !== null) features.push({ icon: '🚗', label: 'Parqueo', value: p.estacionamientos > 0 ? `${p.estacionamientos} incl.` : 'No incl.' })
  if (p.baulera) features.push({ icon: '📦', label: 'Baulera', value: 'Si', highlight: true })
  if (p.amoblado === 'si' || p.amoblado === 'semi') features.push({ icon: '🪑', label: 'Amoblado', value: p.amoblado === 'si' ? 'Si' : 'Semi', highlight: true })
  if (p.acepta_mascotas !== null) features.push({ icon: '🐾', label: 'Mascotas', value: p.acepta_mascotas ? 'Acepta' : 'No acepta', highlight: p.acepta_mascotas })
  if (p.deposito_meses) features.push({ icon: '💰', label: 'Deposito', value: `${p.deposito_meses} mes${p.deposito_meses > 1 ? 'es' : ''}` })
  if (p.monto_expensas_bob) features.push({ icon: '🏠', label: 'Expensas', value: `Bs ${p.monto_expensas_bob}`, highlight: true })
  if (p.contrato_minimo_meses) features.push({ icon: '📋', label: 'Contrato', value: `${p.contrato_minimo_meses} meses` })

  const displayName = p.nombre_edificio || p.nombre_proyecto || 'Detalles'
  const hasGPS = p.latitud && p.longitud

  return (
    <div className={`bs ${open ? 'open' : ''} ${isDesktop ? 'bs-desktop' : ''}`}>
      <div className="bs-handle" />
      <div className="bs-header">
        <div className="bs-title">{displayName}</div>
        <button className="bs-close" onClick={onClose}>&times;</button>
      </div>
      <div className="bs-section">
        <div className="bs-sl">CARACTERISTICAS</div>
        <div className="bs-grid">
          {features.map((f, i) => (
            <div key={i} className={`bs-feat ${f.highlight ? 'hl' : ''}`}>
              <div className="bs-fi">{f.icon}</div>
              <div className="bs-fv">{f.value}</div>
              <div className="bs-fl">{f.label}</div>
            </div>
          ))}
        </div>
      </div>
      {p.amenities_lista && p.amenities_lista.length > 0 && (
        <div className="bs-section">
          <div className="bs-sl">AMENIDADES</div>
          <div className="bs-aw">{p.amenities_lista.map((a, i) => <span key={i} className="bs-at">{a}</span>)}</div>
        </div>
      )}
      {(p.agente_nombre || p.agente_whatsapp) && (
        <div className="bs-section">
          <div className="bs-sl">CONTACTO</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {p.agente_nombre && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{p.agente_nombre}</span>}
            {p.agente_whatsapp && <a href={`https://wa.me/${p.agente_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#25d366', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}>WhatsApp</a>}
          </div>
        </div>
      )}
      {hasGPS && (
        <div className="bs-section">
          <div className="bs-sl">UBICACION</div>
          <div className="bs-map">{open && <MapComponent lat={p.latitud!} lng={p.longitud!} />}</div>
        </div>
      )}
      <style jsx>{`
        .bs { position:fixed;bottom:0;left:0;right:0;z-index:201;background:#141414;border-radius:20px 20px 0 0;max-height:80vh;transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.32,0.72,0,1);overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:max(20px,env(safe-area-inset-bottom)); }
        .bs::-webkit-scrollbar{display:none;}
        .bs.open{transform:translateY(0);}
        .bs-desktop{max-width:480px;left:auto;right:0;border-radius:20px 0 0 0;height:100vh;max-height:100vh;}
        .bs-desktop.open{transform:translateY(0);}
        .bs-handle{width:36px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;margin:12px auto 0;}
        .bs-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px 12px;border-bottom:1px solid rgba(255,255,255,0.06);}
        .bs-title{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:400;color:#fff;}
        .bs-close{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);background:transparent;color:rgba(255,255,255,0.5);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;}
        .bs-section{padding:16px 24px;}
        .bs-sl{font-size:10px;font-weight:500;color:rgba(255,255,255,0.3);letter-spacing:2px;margin-bottom:12px;font-family:'Manrope',sans-serif;}
        .bs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
        .bs-feat{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);}
        .bs-fi{font-size:20px;}
        .bs-fl{font-size:10px;color:rgba(255,255,255,0.6);text-align:center;font-family:'Manrope',sans-serif;}
        .bs-fv{font-size:12px;font-weight:500;color:#fff;font-family:'Manrope',sans-serif;}
        .bs-feat.hl{border-color:rgba(201,169,89,0.2);background:rgba(201,169,89,0.04);}
        .bs-feat.hl .bs-fl{color:#c9a959;}
        .bs-feat.hl .bs-fv{color:#c9a959;}
        .bs-aw{display:flex;flex-wrap:wrap;gap:6px;}
        .bs-at{font-size:11px;padding:4px 10px;border-radius:100px;border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);font-family:'Manrope',sans-serif;}
        .bs-map{width:100%;height:200px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);}
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
        .cc-pip{width:3px;height:10px;border-radius:2px;background:rgba(255,255,255,0.12);transition:all 0.3s;}
        .cc-pip.active{background:#c9a959;height:22px;}
      `}</style>
    </div>
  )
}
