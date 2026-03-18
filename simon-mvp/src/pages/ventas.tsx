import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import type { UnidadVenta, FiltrosVentaSimple } from '@/lib/supabase'
import { displayZona } from '@/lib/zonas'

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

// ===== Page =====
export default function VentasPage() {
  const [properties, setProperties] = useState<UnidadVenta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filters] = useState<FiltrosVentaSimple>({})
  const [totalCount, setTotalCount] = useState(0)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const isDesktop = useIsDesktop()
  const fetchGenRef = useRef(0)

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
  const fetchProperties = useCallback(async () => {
    const gen = ++fetchGenRef.current
    setLoading(true)
    setLoadError(false)

    try {
      const result = await fetchFromAPI(filters)
      if (gen !== fetchGenRef.current) return // stale
      setProperties(result.data)
      setTotalCount(result.total)
    } catch (err) {
      if (gen !== fetchGenRef.current) return
      console.error('Error fetching ventas:', err)
      setLoadError(true)
    } finally {
      if (gen === fetchGenRef.current) setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  return (
    <>
      <Head>
        <title>Simon · Departamentos en Venta · Equipetrol</title>
        <meta name="description" content="Departamentos en venta en Equipetrol, Santa Cruz. Datos reales, precios actualizados." />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#0a0a0a" />
      </Head>

      {isDesktop ? (
        /* ===== DESKTOP LAYOUT ===== */
        <div className="ventas-desktop">
          <aside className="ventas-sidebar">
            <div className="ventas-sidebar-header">
              <Link href="/landing-v2" className="ventas-logo">Simon</Link>
              <div className="ventas-label">VENTAS</div>
            </div>
            <div className="ventas-sidebar-count">
              <span className="ventas-count-num">{totalCount}</span>
              <span className="ventas-count-text">departamentos en Equipetrol</span>
            </div>
            {/* Filtros — Bloque 2 */}
            <div className="ventas-filters-placeholder">
              <div style={{ padding: '16px', color: '#888', fontSize: '13px', borderTop: '1px solid #222' }}>
                Filtros (próximo bloque)
              </div>
            </div>
          </aside>

          <main className="ventas-main">
            {loadError && (
              <div className="ventas-error">
                <p>No se pudo cargar. Verifica tu conexión.</p>
                <button onClick={fetchProperties}>Reintentar</button>
              </div>
            )}
            {loading && properties.length === 0 && !loadError && (
              <div className="ventas-loading">Cargando departamentos en venta...</div>
            )}
            {!loading && properties.length === 0 && !loadError && (
              <div className="ventas-empty">No se encontraron departamentos.</div>
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
            <span className="ventas-label-mobile">VENTAS</span>
            <span className="ventas-count-mobile">{totalCount} deptos</span>
          </div>
          <div className="ventas-mobile-feed">
            {loadError && (
              <div className="ventas-error">
                <p>No se pudo cargar.</p>
                <button onClick={fetchProperties}>Reintentar</button>
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
      `}</style>
    </>
  )
}
