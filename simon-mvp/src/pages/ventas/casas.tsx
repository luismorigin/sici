import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import type { GetStaticProps } from 'next'
import { ZONAS_ZONA_NORTE, getMicrozonasZN, displayZona, getZonaLabel } from '@/lib/zonas'
import { trackEvent } from '@/lib/analytics'
import { openWhatsApp } from '@/lib/whatsapp'
import { mapCasaRow, filtrarCasas, ordenarCasas } from '@/lib/casas'
import type { UnidadCasa, FiltrosCasa } from '@/lib/casas'

// ===== chipLabelZN helper (same as zona-norte feeds) =====
const RING_ORD: Record<string, string> = { '2do': '2º', '3er': '3º', '4to': '4º', '6to': '6º', '8vo': '8º' }
function chipLabelZN(full: string): string {
  const idx = full.indexOf(' anillo ')
  if (idx === -1) return full
  const ring = full.slice(0, idx).split('-').map(r => RING_ORD[r] || r).join('-')
  return `${ring} · ${full.slice(idx + ' anillo '.length)}`
}

// Nombre de zona para mostrar en cards/sheet/mapa: MISMO formato legible que el
// filtro (chipLabelZN sobre el label completo), no la abreviatura de displayZona.
function zonaChip(zona: string | null | undefined): string {
  return chipLabelZN(getZonaLabel(zona))
}

// ===== SEO types =====
interface CasasSEO {
  totalCasas: number
  medianaPrecioM2: number
  medianaTerreno: number
  nEnCondominio: number
  fechaActualizacion: string
}

// ===== Dynamic imports =====
const PhotoViewer = dynamic(() => import('@/components/alquiler/PhotoViewer'), { ssr: false })
const VentaMap = dynamic(() => import('@/components/venta/VentaMap'), { ssr: false })

// ===== Constants =====
const MIN_PRICE = 50000
const MAX_PRICE = 1000000
const PRICE_STEP = 25000
const MAX_FAVORITES = 3
const TERRENO_MAX_DEFAULT = 2000

function formatPriceK(v: number) { return `$${(v / 1000).toFixed(0)}k` }

// ===== useIsDesktop =====
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

// ===== WA message =====
function buildCasaWaMsg(p: UnidadCasa): string {
  const specs = [
    p.dormitorios != null ? `${p.dormitorios} dorm` : null,
    p.area_total_m2 ? `${Math.round(p.area_total_m2)}m² constr.` : null,
    p.area_terreno_m2 ? `${Math.round(p.area_terreno_m2)}m² terreno` : null,
    `$us ${Math.round(p.precio_norm).toLocaleString('en-US')}`,
  ].filter(Boolean).join(' · ')
  const nombre = p.agente_nombre ? ` ${p.agente_nombre.trim().split(/\s+/)[0]}` : ''
  return `Hola${nombre}, vi esta casa en Simón (ref SIM-V${p.id}) — ${p.url || 'simonbo.com/ventas/casas'}. Me interesa, ¿sigue disponible?\n\n${p.titulo} (${specs})`
}

// ===== SVG icons =====
const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill={filled ? '#E05555' : 'none'} stroke={filled ? '#E05555' : '#7A7060'} strokeWidth="1.5">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </svg>
)
// ===== Mini-card flotante del mapa (clon del MapFloatCard de deptos, adaptado a casas) =====
function CasaMapFloatCard({ property: p, isFavorite, onClose, onOpenDetail, onToggleFavorite, mobile }: {
  property: UnidadCasa; isFavorite: boolean; onClose: () => void; onOpenDetail: () => void; onToggleFavorite: () => void; mobile?: boolean
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls ?? []
  const dorms = p.dormitorios != null ? `${p.dormitorios} dorm` : null
  const specs = [zonaChip(p.zona), p.area_total_m2 ? `${Math.round(p.area_total_m2)}m²` : null, dorms].filter(Boolean).join(' · ')
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
        <div className="mfc-name">{p.titulo}</div>
        <div className="mfc-specs">{specs}</div>
        <div className="mfc-price">$us {Math.round(p.precio_norm).toLocaleString('en-US')}</div>
        {p.precio_m2 > 0 && <div className="mfc-m2">$us {Math.round(p.precio_m2).toLocaleString('en-US')}/m²</div>}
        <button className="mfc-detail" onClick={onOpenDetail}>Ver detalles</button>
      </div>
    </div>
  )
}

const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
)
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2"><polyline points="9 6 15 12 9 18"/></svg>
)
const WspSVG = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

// ===== Precio inputs with buffer =====
function PriceInputsCasas({ minPrice, maxPrice, onMinPrice, onMaxPrice }: {
  minPrice: number; maxPrice: number
  onMinPrice: (v: number) => void; onMaxPrice: (v: number) => void
}) {
  const MIN_K = Math.round(MIN_PRICE / 1000)
  const MAX_K = Math.round(MAX_PRICE / 1000)
  const [minStr, setMinStr] = useState(String(Math.round(minPrice / 1000)))
  const [maxStr, setMaxStr] = useState(String(Math.round(maxPrice / 1000)))
  useEffect(() => { setMinStr(String(Math.round(minPrice / 1000))) }, [minPrice])
  useEffect(() => { setMaxStr(String(Math.round(maxPrice / 1000))) }, [maxPrice])
  function commitMin() {
    const n = parseInt(minStr)
    if (!Number.isFinite(n)) { setMinStr(String(Math.round(minPrice / 1000))); return }
    const maxK = Math.round(maxPrice / 1000)
    const clamped = Math.max(MIN_K, Math.min(n, maxK - Math.round(PRICE_STEP / 1000)))
    setMinStr(String(clamped))
    if (clamped * 1000 !== minPrice) onMinPrice(clamped * 1000)
  }
  function commitMax() {
    const n = parseInt(maxStr)
    if (!Number.isFinite(n)) { setMaxStr(String(Math.round(maxPrice / 1000))); return }
    const minK = Math.round(minPrice / 1000)
    const clamped = Math.min(MAX_K, Math.max(n, minK + Math.round(PRICE_STEP / 1000)))
    setMaxStr(String(clamped))
    if (clamped * 1000 !== maxPrice) onMaxPrice(clamped * 1000)
  }
  return (
    <div className="vf-price-inputs">
      <label className="vf-area-field">
        <span className="vf-area-prefix">Min</span>
        <span className="vf-price-dollar">$</span>
        <input type="number" className="vf-area-input" inputMode="numeric" min={MIN_K} max={MAX_K} step={25}
          value={minStr} aria-label="Precio mínimo en miles de USD"
          onChange={e => setMinStr(e.target.value)} onBlur={commitMin}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <span className="vf-area-suffix">K</span>
      </label>
      <span className="vf-area-sep">—</span>
      <label className="vf-area-field">
        <span className="vf-area-prefix">Max</span>
        <span className="vf-price-dollar">$</span>
        <input type="number" className="vf-area-input" inputMode="numeric" min={MIN_K} max={MAX_K} step={25}
          value={maxStr} aria-label="Precio máximo en miles de USD"
          onChange={e => setMaxStr(e.target.value)} onBlur={commitMax}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <span className="vf-area-suffix">K</span>
      </label>
    </div>
  )
}

// ===== Terreno inputs with buffer =====
function TerrenoInputs({ terrenoMin, terrenoMax, onTerrenoMin, onTerrenoMax }: {
  terrenoMin: number; terrenoMax: number
  onTerrenoMin: (v: number) => void; onTerrenoMax: (v: number) => void
}) {
  const [minStr, setMinStr] = useState(terrenoMin > 0 ? String(terrenoMin) : '')
  const [maxStr, setMaxStr] = useState(terrenoMax > 0 ? String(terrenoMax) : '')
  useEffect(() => { setMinStr(terrenoMin > 0 ? String(terrenoMin) : '') }, [terrenoMin])
  useEffect(() => { setMaxStr(terrenoMax > 0 ? String(terrenoMax) : '') }, [terrenoMax])
  function commitMin() {
    const n = parseInt(minStr)
    if (!minStr.trim() || !Number.isFinite(n)) { setMinStr(''); if (terrenoMin > 0) onTerrenoMin(0); return }
    const clamped = Math.max(0, Math.min(n, terrenoMax > 0 ? terrenoMax : TERRENO_MAX_DEFAULT))
    setMinStr(String(clamped))
    if (clamped !== terrenoMin) onTerrenoMin(clamped)
  }
  function commitMax() {
    const n = parseInt(maxStr)
    if (!maxStr.trim() || !Number.isFinite(n)) { setMaxStr(''); if (terrenoMax > 0) onTerrenoMax(0); return }
    const clamped = Math.min(TERRENO_MAX_DEFAULT, Math.max(n, terrenoMin))
    setMaxStr(String(clamped))
    if (clamped !== terrenoMax) onTerrenoMax(clamped)
  }
  const filtroActivo = terrenoMin > 0 || terrenoMax > 0
  return (
    <>
      <div className="vf-area-inputs">
        <label className="vf-area-field">
          <span className="vf-area-prefix">Min</span>
          <input type="number" className="vf-area-input" inputMode="numeric" min={0} max={TERRENO_MAX_DEFAULT} step={50}
            value={minStr} placeholder="0" aria-label="Terreno mínimo m²"
            onChange={e => setMinStr(e.target.value)} onBlur={commitMin}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
          <span className="vf-area-suffix">m²</span>
        </label>
        <span className="vf-area-sep">—</span>
        <label className="vf-area-field">
          <span className="vf-area-prefix">Max</span>
          <input type="number" className="vf-area-input" inputMode="numeric" min={0} max={TERRENO_MAX_DEFAULT} step={50}
            value={maxStr} placeholder="2000" aria-label="Terreno máximo m²"
            onChange={e => setMaxStr(e.target.value)} onBlur={commitMax}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
          <span className="vf-area-suffix">m²</span>
        </label>
      </div>
      {filtroActivo && (
        <button type="button" className="vf-area-clear"
          onClick={() => { onTerrenoMin(0); onTerrenoMax(0) }}>
          Quitar filtro de terreno
        </button>
      )}
    </>
  )
}

// ===== Default filtros =====
const DEFAULT_FILTROS: FiltrosCasa = {
  microzonas: [],
  precioMin: MIN_PRICE,
  precioMax: MAX_PRICE,
  dormitorios: [],
  condominio: 'todos',
  amenidades: [],
  terrenoMin: 0,
  terrenoMax: 0,
  orden: 'recientes',
}

function isFiltered(f: FiltrosCasa): boolean {
  return (
    f.microzonas.length > 0 ||
    f.precioMin > MIN_PRICE ||
    f.precioMax < MAX_PRICE ||
    f.dormitorios.length > 0 ||
    f.condominio !== 'todos' ||
    f.amenidades.length > 0 ||
    f.terrenoMin > 0 ||
    f.terrenoMax > 0 ||
    f.orden !== 'recientes'
  )
}

// ===== Filter controls (shared desktop+mobile) =====
function FilterControls({ f, onChange }: { f: FiltrosCasa; onChange: (f: FiltrosCasa) => void }) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function update(patch: Partial<FiltrosCasa>) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onChange({ ...f, ...patch }), 400)
  }
  function updateImmediate(patch: Partial<FiltrosCasa>) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onChange({ ...f, ...patch })
  }
  function toggleMicrozona(db: string) {
    const next = f.microzonas.includes(db)
      ? f.microzonas.filter(z => z !== db)
      : [...f.microzonas, db]
    updateImmediate({ microzonas: next })
  }
  function toggleDorm(d: number) {
    const next = f.dormitorios.includes(d)
      ? f.dormitorios.filter(x => x !== d)
      : [...f.dormitorios, d]
    updateImmediate({ dormitorios: next })
  }
  function toggleAmenidad(a: string) {
    const next = f.amenidades.includes(a)
      ? f.amenidades.filter(x => x !== a)
      : [...f.amenidades, a]
    updateImmediate({ amenidades: next })
  }
  return (
    <>
      <div className="vf-group">
        <div className="vf-label">ZONA</div>
        <div className="vf-zona-btns">
          {ZONAS_ZONA_NORTE.map(z => (
            <button key={z.db} className={`vf-zona-btn ${f.microzonas.includes(z.db) ? 'active' : ''}`}
              title={z.label} onClick={() => toggleMicrozona(z.db)}>{chipLabelZN(z.label)}</button>
          ))}
        </div>
      </div>
      <div className="vf-group">
        <div className="vf-label">PRESUPUESTO</div>
        <PriceInputsCasas minPrice={f.precioMin} maxPrice={f.precioMax}
          onMinPrice={v => update({ precioMin: v })}
          onMaxPrice={v => update({ precioMax: v })} />
        <div className="vf-range-wrap">
          <input type="range" className="vf-slider vf-slider-min" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={f.precioMin} aria-label="Precio mínimo"
            onChange={e => update({ precioMin: parseInt(e.target.value) })} />
          <input type="range" className="vf-slider vf-slider-max" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={f.precioMax} aria-label="Precio máximo"
            onChange={e => update({ precioMax: parseInt(e.target.value) })} />
        </div>
        <div className="vf-tc-note">Precios en USD oficial · TC Bs 6.96</div>
      </div>
      <div className="vf-group">
        <div className="vf-label">DORMITORIOS</div>
        <div className="vf-btn-row">
          {[2, 3, 4, 5].map(d => (
            <button key={d} className={`vf-btn ${f.dormitorios.includes(d) ? 'active' : ''}`}
              onClick={() => toggleDorm(d)}>{d === 5 ? '5+' : d}</button>
          ))}
        </div>
      </div>
      <div className="vf-group">
        <div className="vf-label">TIPO</div>
        <div className="vf-btn-row">
          {(['todos', 'cerrado', 'individual'] as const).map(v => (
            <button key={v} className={`vf-btn ${f.condominio === v ? 'active' : ''}`}
              onClick={() => updateImmediate({ condominio: v })}>
              {v === 'todos' ? 'Todos' : v === 'cerrado' ? 'Cerrado' : 'Individual'}
            </button>
          ))}
        </div>
      </div>
      <div className="vf-group">
        <div className="vf-label">AMENIDADES</div>
        <div className="vf-btn-row">
          {['piscina', 'jardin', 'churrasquera'].map(a => (
            <button key={a} className={`vf-btn ${f.amenidades.includes(a) ? 'active' : ''}`}
              onClick={() => toggleAmenidad(a)}>
              {a === 'piscina' ? 'Piscina' : a === 'jardin' ? 'Jardín' : 'Churrasquera'}
            </button>
          ))}
        </div>
      </div>
      <div className="vf-group">
        <div className="vf-label">TERRENO (m²)</div>
        <TerrenoInputs terrenoMin={f.terrenoMin} terrenoMax={f.terrenoMax}
          onTerrenoMin={v => update({ terrenoMin: v })}
          onTerrenoMax={v => update({ terrenoMax: v })} />
      </div>
      <div className="vf-group">
        <div className="vf-label">ORDENAR POR</div>
        <div className="vf-btn-row">
          {([
            { value: 'recientes', label: 'Recientes' },
            { value: 'precio_asc', label: 'Precio ↑' },
            { value: 'precio_desc', label: 'Precio ↓' },
            { value: 'terreno_desc', label: 'Terreno ↓' },
          ] as { value: FiltrosCasa['orden']; label: string }[]).map(o => (
            <button key={o.value} className={`vf-btn ${f.orden === o.value ? 'active' : ''}`}
              onClick={() => updateImmediate({ orden: o.value })}>{o.label}</button>
          ))}
        </div>
      </div>
    </>
  )
}

// ===== Desktop sidebar =====
function DesktopFilters({ f, filtered, onReset, onChange }: {
  f: FiltrosCasa; filtered: boolean; onReset: () => void; onChange: (f: FiltrosCasa) => void
}) {
  return (
    <div className="vf-wrap">
      <FilterControls f={f} onChange={onChange} />
      {filtered && <button className="vf-reset" onClick={onReset}>Quitar filtros</button>}
    </div>
  )
}

// ===== Mobile filter overlay =====
function FilterOverlay({ isOpen, onClose, f, totalCount, filteredCount, filtered, onChange, onReset }: {
  isOpen: boolean; onClose: () => void
  f: FiltrosCasa; totalCount: number; filteredCount: number; filtered: boolean
  onChange: (f: FiltrosCasa) => void; onReset: () => void
}) {
  const [localF, setLocalF] = useState<FiltrosCasa>(f)
  useEffect(() => { if (isOpen) setLocalF(f) }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!isOpen) return null
  function apply() { onChange(localF); onClose() }
  function reset() { onReset(); onClose() }
  return (
    <div className="fo-overlay">
      <div className="fo-header">
        <button className="fo-close" aria-label="Cerrar filtros" onClick={onClose}>&times;</button>
        <span className="fo-title">Filtros</span>
        <span className="fo-count">{filtered ? filteredCount : totalCount} casas</span>
      </div>
      <div className="fo-body">
        <FilterControls f={localF} onChange={setLocalF} />
      </div>
      <div className="fo-footer">
        {filtered && <button className="fo-reset" onClick={reset}>Quitar filtros</button>}
        <button className="fo-apply" onClick={apply}>VER {filtered ? filteredCount : totalCount} RESULTADOS</button>
      </div>
    </div>
  )
}

// ===== Gallery for BottomSheet =====
function BSGallery({ photos, propertyId }: { photos: string[]; propertyId?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const total = photos.length
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth)
      setCurrentIdx(Math.min(idx, total - 1))
      if (idx > 0) trackEvent('swipe_photos', { property_id: propertyId, source: 'bottom_sheet_casa' })
    }
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [total, propertyId])
  function goTo(idx: number) { scrollRef.current?.scrollTo({ left: idx * (scrollRef.current?.clientWidth || 0), behavior: 'smooth' }) }
  return (
    <div className="bsg-wrap">
      <div className="bsg-scroll" ref={scrollRef}>
        {photos.map((url, i) => (
          <div key={i} className="bsg-slide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Foto ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'} draggable={false}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
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
      {total > 1 && <div className="bsg-counter">{currentIdx + 1} / {total}</div>}
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
        .bsg-arrow{display:none;position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:50%;background:rgba(20,20,20,0.6);border:1px solid rgba(255,255,255,0.15);cursor:pointer;align-items:center;justify-content:center;z-index:2}
        .bsg-arrow-left{left:10px}.bsg-arrow-right{right:10px}
        @media(min-width:768px){.bsg-arrow{display:flex}}
        .bsg-counter{position:absolute;bottom:12px;right:12px;background:rgba(20,20,20,0.75);color:rgba(255,255,255,0.8);font-size:12px;font-weight:500;padding:4px 10px;border-radius:100px;font-family:'DM Sans',sans-serif}
        .bsg-dots{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:5px;z-index:2}
        .bsg-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.35)}
        .bsg-dot.active{background:#fff;width:18px;border-radius:3px}
        .bsg-dot-more{font-size:10px;color:rgba(255,255,255,0.5);font-family:'DM Sans',sans-serif}
      `}</style>
    </div>
  )
}

// ===== BottomSheet (simplified — no broker, no gate, no compare) =====
function BottomSheet({ property: p, isOpen, onClose, onShare, isFavorite, onToggleFavorite, isDesktop, allCasas, onSwap }: {
  property: UnidadCasa | null; isOpen: boolean; onClose: () => void; onShare?: () => void
  isFavorite: boolean; onToggleFavorite: () => void; isDesktop: boolean
  allCasas: UnidadCasa[]; onSwap: (c: UnidadCasa) => void
}) {
  const [descExpanded, setDescExpanded] = useState(false)
  const propId = p?.id
  useEffect(() => { setDescExpanded(false) }, [propId])

  const similares = useMemo(() => {
    if (!p) return []
    return allCasas
      .filter(c => c.zona === p.zona && c.id !== p.id && c.fotos_urls.length > 0)
      .sort((a, b) => Math.abs(a.precio_norm - p.precio_norm) - Math.abs(b.precio_norm - p.precio_norm))
      .slice(0, 4)
  }, [p?.id, p?.zona, p?.precio_norm, allCasas]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return null

  const specs1Parts = [
    p.dormitorios != null ? `${p.dormitorios} dorm` : null,
    p.area_total_m2 ? `${Math.round(p.area_total_m2)} m² constr.` : null,
    p.banos != null ? `${p.banos} baño${p.banos !== 1 ? 's' : ''}` : null,
  ].filter(Boolean)

  const specs2Parts = [
    p.area_terreno_m2 ? `${Math.round(p.area_terreno_m2)} m² terreno` : null,
    p.precio_m2 > 0 ? `$us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m²` : null,
    p.enCondominio ? 'Condominio cerrado' : 'Casa individual',
    p.estacionamientos ? `${p.estacionamientos} parqueo${p.estacionamientos !== 1 ? 's' : ''}` : null,
  ].filter(Boolean)

  return (
    <>
      <div className={`bs-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <div className={`bs bs-venta ${isOpen ? 'open' : ''} ${isDesktop ? 'bs-desktop' : ''}`}>
        <div className="bs-floating-actions">
          <button className={`bs-fav ${isFavorite ? 'active' : ''}`} aria-label="Favorito" onClick={onToggleFavorite}>
            <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : 'currentColor'} strokeWidth="1.5" style={{width:20,height:20}}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <button className="bs-close" aria-label="Cerrar" onClick={onClose}>&times;</button>
        </div>
        <div className="bs-dark-header">
          <div className="bs-h-name">
            {p.titulo}
            {p.dias_en_mercado !== null && p.dias_en_mercado <= 60 && <span className="bs-h-reciente">Reciente</span>}
          </div>
          <div className="bs-h-zona">{zonaChip(p.zona)} · #{p.id}</div>
          <div className="bs-h-price-block">
            <div className="bs-h-price">$us {Math.round(p.precio_norm).toLocaleString('en-US')} <span className="bs-h-tc">(T.C. oficial)</span></div>
            <div className="bs-h-specs">{specs1Parts.join(' · ')}</div>
            <div className="bs-h-sub">{specs2Parts.join(' · ')}</div>
          </div>
        </div>

        {p.fotos_urls.length > 0 && <BSGallery photos={p.fotos_urls} propertyId={p.id} />}

        {/* Características */}
        <div className="bs-section">
          <div className="bs-sl"><span className="bs-sl-dot" />Características</div>
          <div className="bs-grid">
            {p.area_total_m2 && (
              <div className="bs-feat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M3 14h7v7H3z"/><path d="M14 14h7v7h-7z"/></svg>
                <div className="bs-fv">{Math.round(p.area_total_m2)}m²</div>
                <div className="bs-fl">Construido</div>
              </div>
            )}
            {p.area_terreno_m2 && (
              <div className="bs-feat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>
                <div className="bs-fv">{Math.round(p.area_terreno_m2)}m²</div>
                <div className="bs-fl">Terreno</div>
              </div>
            )}
            {p.dormitorios != null && (
              <div className="bs-feat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v3"/></svg>
                <div className="bs-fv">{p.dormitorios} dorm</div>
                <div className="bs-fl">Dormitorios</div>
              </div>
            )}
            {p.banos != null && (
              <div className="bs-feat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h3v2.25"/></svg>
                <div className="bs-fv">{p.banos} baño{p.banos !== 1 ? 's' : ''}</div>
                <div className="bs-fl">Baños</div>
              </div>
            )}
            {p.estacionamientos && p.estacionamientos > 0 && (
              <div className="bs-feat hl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 002 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>
                <div className="bs-fv">{p.estacionamientos} incl.</div>
                <div className="bs-fl">Parqueo</div>
              </div>
            )}
            {(p.frente_m || p.fondo_m) && (
              <div className="bs-feat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bs-fi"><path d="M3 6l9-3 9 3v12l-9 3-9-3V6z"/></svg>
                <div className="bs-fv">{[p.frente_m ? `${p.frente_m}m` : null, p.fondo_m ? `${p.fondo_m}m` : null].filter(Boolean).join('×')}</div>
                <div className="bs-fl">Frente×Fondo</div>
              </div>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="bs-section">
          <div className="bs-badges">
            <span className="bs-badge">{p.enCondominio ? 'Condominio cerrado' : 'Casa individual'}</span>
            {p.dias_en_mercado !== null && p.dias_en_mercado <= 60 && <span className="bs-badge gold">Publicación reciente</span>}
          </div>
        </div>

        {/* Amenidades */}
        {p.amenidades.length > 0 && (
          <div className="bs-section">
            <div className="bs-sl"><span className="bs-sl-dot" />Amenidades</div>
            <div className="bs-aw">{p.amenidades.map((a, i) => <span key={i} className="bs-at">{a}</span>)}</div>
          </div>
        )}

        {/* Descripción */}
        {p.descripcion && (
          <div className="bs-section">
            <div className="bs-sl"><span className="bs-sl-dot" />Sobre esta propiedad</div>
            <div className={`bs-desc ${descExpanded ? 'expanded' : ''}`}>{p.descripcion}</div>
            {p.descripcion.length > 150 && !descExpanded && (
              <button className="bs-desc-more" onClick={() => setDescExpanded(true)}>Ver más</button>
            )}
          </div>
        )}

        {/* Agente */}
        {p.agente_nombre && (
          <div className="bs-section">
            <div className="bs-agent">
              <span className="bs-agent-name">{p.agente_nombre}</span>
              {p.oficina_nombre && <span className="bs-agent-office"> · {p.oficina_nombre}</span>}
            </div>
          </div>
        )}

        {/* Similares */}
        {similares.length > 0 && (
          <div className="bs-section">
            <div className="bs-sl"><span className="bs-sl-dot" />También en {zonaChip(p.zona)}</div>
            <div className="bs-sim-scroll">
              {similares.map(c => (
                <button key={c.id} className="bs-sim-card" aria-label={`Ver ${c.titulo}`} onClick={() => onSwap(c)}>
                  {c.fotos_urls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.fotos_urls[0]} alt={c.titulo} className="bs-sim-thumb" loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <div className="bs-sim-thumb bs-sim-nophoto" />
                  )}
                  <div className="bs-sim-info">
                    <div className="bs-sim-name">{c.titulo}</div>
                    <div className="bs-sim-price">$us {Math.round(c.precio_norm).toLocaleString('en-US')}</div>
                    <div className="bs-sim-specs">{[c.area_total_m2 ? `${Math.round(c.area_total_m2)}m²` : null, c.dormitorios != null ? `${c.dormitorios} dorm` : null].filter(Boolean).join(' · ')}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Google Maps */}
        {p.latitud && p.longitud && (
          <div className="bs-section">
            <a href={`https://www.google.com/maps?q=${p.latitud},${p.longitud}`}
              target="_blank" rel="noopener noreferrer" className="bs-gmaps-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:18,height:18,flexShrink:0}}>
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Ver ubicación en Google Maps
            </a>
          </div>
        )}

        {/* Ver anuncio original */}
        {p.url && (
          <div className="bs-section">
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="bs-ver-original">
              Ver anuncio original &#8599;
            </a>
          </div>
        )}

        {/* Sticky footer */}
        <div className="bs-sticky-footer">
          {p.agente_telefono && (
            <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(buildCasaWaMsg(p))}`}
              target="_blank" rel="noopener noreferrer" className="bs-wsp-cta"
              onClick={(e) => {
                e.preventDefault()
                trackEvent('click_whatsapp_casa', { property_id: p.id, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_norm), source: 'detail_sheet' })
                openWhatsApp(p.agente_telefono!, buildCasaWaMsg(p))
              }}>
              <WspSVG /> Whatsapp
            </a>
          )}
          {onShare && (
            <button className="bs-share-btn" onClick={onShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:16,height:16}}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
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
  return <div className="ventas-toast"><span>{message}</span></div>
}

// ===== Desktop CasaCard =====
function CasaCard({ casa: p, isFavorite, onToggleFavorite, onShare, onPhotoTap, onDetails, isFirst }: {
  casa: UnidadCasa; isFavorite: boolean; isFirst?: boolean
  onToggleFavorite: () => void; onShare: () => void; onPhotoTap: (idx: number) => void; onDetails: () => void
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const [maxLoaded, setMaxLoaded] = useState(2)
  const photos = p.fotos_urls
  const cardRef = useRef<HTMLDivElement>(null)
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

  const amenChips = p.amenidades.slice(0, 5)
  const specs2Parts = [
    p.area_terreno_m2 ? `${Math.round(p.area_terreno_m2)}m² terreno` : null,
    p.precio_m2 > 0 ? `$us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m²` : null,
    p.enCondominio ? 'Condominio cerrado' : 'Casa individual',
    p.estacionamientos ? `${p.estacionamientos} parqueo${p.estacionamientos !== 1 ? 's' : ''}` : null,
  ].filter(Boolean)

  return (
    <div className="vc" ref={cardRef}>
      <div className="vc-photo"
        style={photos[photoIdx] && visible ? { backgroundImage: `url('${photos[photoIdx]}')`, cursor: 'pointer' } : undefined}
        onClick={() => { if (photos[photoIdx]) onPhotoTap(photoIdx) }}>
        {!photos[photoIdx] && <div className="vc-nofoto">Sin fotos</div>}
        {photos.length > 1 && (<>
          {photoIdx > 0 && <button className="vc-nav vc-nav-prev" aria-label="Foto anterior" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx - 1); setMaxLoaded(prev => Math.max(prev, photoIdx + 1)) }}><ChevronLeft /></button>}
          {photoIdx < photos.length - 1 && <button className="vc-nav vc-nav-next" aria-label="Foto siguiente" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx + 1); setMaxLoaded(prev => Math.max(prev, photoIdx + 2)) }}><ChevronRight /></button>}
          <div className="vc-photo-count">{photoIdx + 1}/{photos.length}</div>
        </>)}
      </div>
      <div className="vc-body">
        <div className="vc-name">{p.titulo}{p.dias_en_mercado !== null && p.dias_en_mercado <= 60 && <span className="vc-reciente">Publicación reciente</span>}</div>
        <div className="vc-zona">{zonaChip(p.zona)} <span className="vc-id">#{p.id}</span></div>
        <div className="vc-price-block">
          <div className="vc-price">$us {Math.round(p.precio_norm).toLocaleString('en-US')} <span className="vc-tc">(T.C. oficial)</span></div>
          <div className="vc-specs">{[
            p.dormitorios != null ? `${p.dormitorios} dorm` : null,
            p.area_total_m2 ? `${Math.round(p.area_total_m2)} m² constr.` : null,
            p.banos != null ? `${p.banos} baño${p.banos !== 1 ? 's' : ''}` : null,
          ].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="vc-specs-2">{specs2Parts.join('  ·  ')}</div>
        {amenChips.length > 0 && (
          <div className="vc-amen-chips">
            {amenChips.map((a, i) => <span key={i} className="vc-amen-chip">{a}</span>)}
          </div>
        )}
        <div className="vc-actions">
          <button className={`vc-act-btn vc-act-fav ${isFavorite ? 'active' : ''}`} aria-label="Favorito" onClick={onToggleFavorite}>
            <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : 'currentColor'} strokeWidth="1.5" style={{width:20,height:20}}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <button className="vc-act-btn" aria-label="Compartir" onClick={onShare}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:16,height:16}}>
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg> Compartir
          </button>
          <button className="vc-act-btn vc-act-detail" aria-label="Ver detalles" onClick={onDetails}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:16,height:16}}>
              <polyline points="6 9 12 15 18 9"/>
            </svg> Ver más
          </button>
          {p.agente_telefono && (
            <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(buildCasaWaMsg(p))}`}
              target="_blank" rel="noopener noreferrer" className="vc-act-btn vc-act-wsp"
              onClick={(e) => {
                e.preventDefault()
                trackEvent('click_whatsapp_casa', { property_id: p.id, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_norm), source: 'card_desktop' })
                openWhatsApp(p.agente_telefono!, buildCasaWaMsg(p))
              }}>
              <WspSVG /> Whatsapp
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== Mobile TikTok CasaCard =====
function MobileCasaCard({ casa: p, isFavorite, onToggleFavorite, onShare, onPhotoTap, onDetails, isSpotlight, isFirst }: {
  casa: UnidadCasa; isFavorite: boolean; isSpotlight?: boolean; isFirst?: boolean
  onToggleFavorite: () => void; onShare: () => void; onPhotoTap: (idx: number) => void; onDetails: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls
  const zoneRef = useRef<HTMLDivElement>(null)
  const [maxLoaded, setMaxLoaded] = useState(isFirst ? 2 : 0)

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

  const amenChips = p.amenidades.slice(0, 4)
  const specs2Parts = [
    p.area_terreno_m2 ? `${Math.round(p.area_terreno_m2)}m² terreno` : null,
    p.enCondominio ? 'Cerrado' : 'Individual',
  ].filter(Boolean)

  return (
    <div className="mc">
      <div className="mc-photo-zone" ref={zoneRef}>
        <div className="mc-photo-scroll" ref={scrollRef}>
          {photos.length > 0 ? photos.map((url, i) => {
            const shouldLoad = i < maxLoaded
            return (
              <div key={i} className="mc-slide"
                style={shouldLoad && url ? { backgroundImage: `url('${url}')`, cursor: 'pointer' } : { cursor: 'pointer' }}
                onClick={() => onPhotoTap(i)} />
            )
          }) : <div className="mc-slide mc-slide-empty" />}
        </div>
        <div className="mc-photo-fade" />
        {photos.length > 1 && <div className="mc-photo-count">{photoIdx + 1}/{photos.length}</div>}
        {photos.length > 1 && photos.length <= 10 && (
          <div className="mc-dots">
            {photos.map((_, i) => <div key={i} className={`mc-dot ${i === photoIdx ? 'active' : ''}`} />)}
          </div>
        )}
      </div>

      {isSpotlight && <div className="mc-spotlight">Te compartieron esta casa</div>}

      <div className="mc-content">
        <div className="mc-name">{p.titulo}{p.dias_en_mercado !== null && p.dias_en_mercado <= 60 && <span className="mc-reciente">Publicación reciente</span>}</div>
        <div className="mc-zona">{zonaChip(p.zona)} <span className="mc-id">#{p.id}</span></div>
        <div className="mc-price-block">
          <div className="mc-price">$us {Math.round(p.precio_norm).toLocaleString('en-US')} <span className="mc-tc">(T.C. oficial)</span></div>
          <div className="mc-specs">{[
            p.dormitorios != null ? `${p.dormitorios} dorm` : null,
            p.area_total_m2 ? `${Math.round(p.area_total_m2)} m² constr.` : null,
            p.banos != null ? `${p.banos} baño${p.banos !== 1 ? 's' : ''}` : null,
          ].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="mc-specs-2">{specs2Parts.join('  ·  ')}</div>
        {amenChips.length > 0 && (
          <div className="mc-amen-chips">
            {amenChips.map((a, i) => <span key={i} className="mc-amen-chip">{a}</span>)}
          </div>
        )}
        <div className="mc-actions">
          <button className={`mc-btn mc-fav ${isFavorite ? 'active' : ''}`} aria-label="Favorito" onClick={onToggleFavorite}>
            <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : '#7A7060'} strokeWidth="1.5" style={{width:22,height:22}}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <button className="mc-btn mc-share" aria-label="Compartir" onClick={onShare}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:18,height:18}}>
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
          <button className="mc-btn mc-info" onClick={onDetails}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:16,height:16}}>
              <polyline points="6 9 12 15 18 9"/>
            </svg> Ver más
          </button>
          {p.agente_telefono && (
            <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(buildCasaWaMsg(p))}`}
              target="_blank" rel="noopener noreferrer" className="mc-btn mc-wsp-inline"
              onClick={(e) => {
                e.preventDefault()
                trackEvent('click_whatsapp_casa', { property_id: p.id, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_norm), source: 'card_mobile' })
                openWhatsApp(p.agente_telefono!, buildCasaWaMsg(p))
              }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Whatsapp
            </a>
          )}
        </div>
        <a href="/" className="mc-branding">simonbo.com</a>
      </div>
    </div>
  )
}

// ===== Page =====
export default function VentasCasasPage({ casas: initialCasas, seo }: { casas: UnidadCasa[]; seo: CasasSEO }) {
  const isDesktop = useIsDesktop()
  const router = useRouter()
  const feedRef = useRef<HTMLDivElement>(null)

  const [filtros, setFiltros] = useState<FiltrosCasa>(DEFAULT_FILTROS)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const [filterOverlayOpen, setFilterOverlayOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid')
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)
  const [viewerName, setViewerName] = useState('')
  const [viewerSubtitle, setViewerSubtitle] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetCasa, setSheetCasa] = useState<UnidadCasa | null>(null)
  const [spotlightId, setSpotlightId] = useState<number | null>(null)
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [mapSelectedId, setMapSelectedId] = useState<number | null>(null)
  const [mobileMapOpen, setMobileMapOpen] = useState(false)

  // Spotlight: parse ?id=
  useEffect(() => {
    const idParam = router.query.id
    if (idParam && typeof idParam === 'string') {
      const parsed = parseInt(idParam, 10)
      if (!isNaN(parsed)) setSpotlightId(parsed)
    }
  }, [router.query.id])

  // Favorites: load/persist localStorage
  useEffect(() => {
    try { const s = localStorage.getItem('casas_favorites_v1'); if (s) setFavorites(new Set(JSON.parse(s))) } catch {}
  }, [])
  useEffect(() => {
    if (favorites.size > 0) {
      try { localStorage.setItem('casas_favorites_v1', JSON.stringify([...favorites])) } catch {}
    }
  }, [favorites])

  function showToast(msg: string) {
    setToastMsg(msg); setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2500)
  }

  function toggleFavorite(id: number) {
    const isFav = favorites.has(id)
    if (!isFav && favorites.size >= MAX_FAVORITES) {
      showToast(`Máximo ${MAX_FAVORITES} — destildá uno para agregar otro`); return
    }
    setFavorites(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
    if (!isFav) {
      const count = favorites.size + 1
      showToast(count >= 2 ? `${count}/${MAX_FAVORITES} · Podés comparar` : `Guardado · ${count}/${MAX_FAVORITES}`)
    } else {
      showToast('Quitado de favoritos')
    }
  }

  function shareProperty(c: UnidadCasa) {
    const url = `${window.location.origin}/ventas/casas?id=${c.id}`
    const text = `Mirá esta casa: ${c.titulo} (${[c.dormitorios != null ? `${c.dormitorios} dorm` : null, c.area_total_m2 ? `${Math.round(c.area_total_m2)}m²` : null, `$us ${Math.round(c.precio_norm).toLocaleString('en-US')}`].filter(Boolean).join(', ')})`
    trackEvent('share_casa', { property_id: c.id, zona: displayZona(c.zona) })
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      navigator.share({ title: c.titulo, text, url }).catch(() => {
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

  function openViewer(c: UnidadCasa, idx: number) {
    if (!c.fotos_urls.length) return
    setViewerPhotos(c.fotos_urls); setViewerIndex(idx)
    setViewerName(c.titulo)
    setViewerSubtitle(`${zonaChip(c.zona)} · ${[c.area_total_m2 ? `${Math.round(c.area_total_m2)}m²` : null, c.dormitorios != null ? `${c.dormitorios} dorm` : null, `$us ${Math.round(c.precio_norm).toLocaleString('en-US')}`].filter(Boolean).join(' · ')}`)
    setViewerOpen(true)
    trackEvent('view_photos_casa', { property_id: c.id, fotos_count: c.fotos_urls.length })
  }

  function openSheet(c: UnidadCasa) {
    setSheetCasa(c); setSheetOpen(true)
    trackEvent('open_detail_casa', { property_id: c.id, zona: displayZona(c.zona), precio_usd: Math.round(c.precio_norm) })
  }

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
        setActiveCardIndex(Math.round(el.scrollTop / el.clientHeight))
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isDesktop])

  // Derived lists
  const casasFiltradas = useMemo(() => {
    const filtered = filtrarCasas(initialCasas, filtros)
    return ordenarCasas(filtered, filtros.orden)
  }, [initialCasas, filtros])

  const filtered = isFiltered(filtros)

  const spotlightCasa = useMemo(() => {
    if (!spotlightId) return null
    return initialCasas.find(c => c.id === spotlightId) || null
  }, [spotlightId, initialCasas])

  const displayList = useMemo(() => {
    if (!spotlightCasa) return casasFiltradas
    return [spotlightCasa, ...casasFiltradas.filter(c => c.id !== spotlightId)]
  }, [casasFiltradas, spotlightCasa, spotlightId])

  // Map props: adapt UnidadCasa to VentaMap shape
  const mapProps = useMemo(() => casasFiltradas
    .filter(c => c.latitud && c.longitud)
    .map(c => ({
      id: c.id,
      proyecto: c.titulo,
      zona: c.zona,
      dormitorios: c.dormitorios ?? 0,
      precio_usd: c.precio_norm,
      precio_m2: c.precio_m2,
      area_m2: c.area_total_m2 ?? 0,
      latitud: c.latitud,
      longitud: c.longitud,
    })), [casasFiltradas])

  // Pin → solo selecciona (muestra la mini-card flotante); el detalle se abre
  // desde "Ver detalles" de la mini-card, igual que el feed de deptos.
  function handleMapSelect(id: number) {
    setMapSelectedId(id)
  }

  // Texto del search pill mobile (describe los filtros activos, igual que deptos).
  const searchPillText = useMemo(() => {
    const parts: string[] = []
    if (filtros.microzonas.length) parts.push(filtros.microzonas.length === 1 ? '1 zona' : `${filtros.microzonas.length} zonas`)
    if (filtros.dormitorios.length) parts.push(filtros.dormitorios.map(d => d === 5 ? '5+' : String(d)).join('/') + ' dorm')
    if (filtros.condominio !== 'todos') parts.push(filtros.condominio === 'cerrado' ? 'cerrado' : 'individual')
    if (filtros.amenidades.length) parts.push(filtros.amenidades.join('/'))
    if (filtros.precioMin > MIN_PRICE || filtros.precioMax < MAX_PRICE) parts.push(`$${Math.round(filtros.precioMin / 1000)}-${Math.round(filtros.precioMax / 1000)}k`)
    if (filtros.terrenoMin > 0 || filtros.terrenoMax > 0) parts.push('terreno')
    return parts.length ? parts.join(' · ') : 'Buscar casa · zona, precio, dorms…'
  }, [filtros])

  const emptyMsg = filtered
    ? 'No hay casas con estos filtros. Probá quitando alguno.'
    : 'No hay casas disponibles en este momento.'

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Casas en venta — Zona Norte | Simón</title>
        <meta name="description" content={`${seo.totalCasas} casas en venta en Zona Norte, Santa Cruz. Mediana $us ${Math.round(seo.medianaPrecioM2)}/m². Simón Inmobiliario.`} />
        <meta property="og:title" content="Casas en venta — Zona Norte | Simón" />
        <meta property="og:description" content={`${seo.totalCasas} casas disponibles · ${seo.nEnCondominio} en condominio · mediana $us ${Math.round(seo.medianaPrecioM2)}/m²`} />
        <meta property="og:image" content="/skyline-zona-norte.jpg" />
        <meta property="og:type" content="website" />
      </Head>

      <Toast message={toastMsg} visible={toastVisible} />

      {viewerOpen && (
        <PhotoViewer photos={viewerPhotos} initialIndex={viewerIndex}
          buildingName={viewerName} subtitle={viewerSubtitle}
          onClose={() => setViewerOpen(false)} />
      )}

      <BottomSheet property={sheetCasa} isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setSheetCasa(null) }}
        onShare={sheetCasa ? () => shareProperty(sheetCasa) : undefined}
        isFavorite={sheetCasa ? favorites.has(sheetCasa.id) : false}
        onToggleFavorite={() => { if (sheetCasa) toggleFavorite(sheetCasa.id) }}
        isDesktop={isDesktop}
        allCasas={casasFiltradas}
        onSwap={(c) => setSheetCasa(c)} />

      <FilterOverlay isOpen={filterOverlayOpen} onClose={() => setFilterOverlayOpen(false)}
        f={filtros} totalCount={initialCasas.length} filteredCount={casasFiltradas.length}
        filtered={filtered} onChange={setFiltros} onReset={() => setFiltros(DEFAULT_FILTROS)} />

      {/* Compare banner */}
      {favorites.size >= 2 && (
        <div className="vt-compare-banner-wrap">
          <button className="vt-compare-banner">
            <span className="vt-compare-banner-text">{favorites.size} favorito{favorites.size > 1 ? 's' : ''} seleccionados</span>
          </button>
          <button className="vt-compare-banner-clear" aria-label="Limpiar favoritos"
            onClick={() => { setFavorites(new Set()); showToast('Favoritos limpiados') }}>&times;</button>
        </div>
      )}

      {/* ===== DESKTOP LAYOUT ===== */}
      {isDesktop && (
        <div className="vt-layout">
          <aside className="vt-sidebar">
            <div className="vt-sidebar-header">
              <div className="vt-sidebar-title">Casas · Zona Norte</div>
              <div className="vt-sidebar-count">{casasFiltradas.length} casas{filtered ? ` de ${initialCasas.length}` : ''}</div>
            </div>
            <DesktopFilters f={filtros} filtered={filtered}
              onReset={() => setFiltros(DEFAULT_FILTROS)} onChange={setFiltros} />
          </aside>
          <main className="vt-main">
            {/* Toolbar */}
            <div className="vt-toolbar">
              <span className="vt-toolbar-count">{casasFiltradas.length} casas en Zona Norte</span>
              <div className="vt-toolbar-right">
                {filtered && <button className="vt-toolbar-reset" onClick={() => setFiltros(DEFAULT_FILTROS)}>Quitar filtros</button>}
                <button className={`vt-view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:16,height:16}}>
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                  </svg>
                </button>
                <button className={`vt-view-btn ${viewMode === 'map' ? 'active' : ''}`} onClick={() => setViewMode('map')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:16,height:16}}>
                    <path d="M3 11l8-8 8 8"/><path d="M3 6l8-8 8 8" style={{display:'none'}}/><polygon points="1 6 8 1 15 6 8 11 1 6"/><polygon points="9 17 16 12 23 17 16 22 9 17"/>
                  </svg>
                  Mapa
                </button>
              </div>
            </div>

            {spotlightCasa && (
              <div className="vt-spotlight-banner">
                <span>Te compartieron esta casa</span>
                <button onClick={() => setSpotlightId(null)}>&times;</button>
              </div>
            )}

            {viewMode === 'map' && mapProps.length > 0 && (
              <div className="vt-map-wrap">
                <VentaMap properties={mapProps} onSelectProperty={handleMapSelect} selectedId={mapSelectedId} />
                {mapSelectedId && (() => {
                  const sc = casasFiltradas.find(c => c.id === mapSelectedId)
                  if (!sc) return null
                  return <CasaMapFloatCard property={sc} isFavorite={favorites.has(sc.id)}
                    onClose={() => setMapSelectedId(null)}
                    onOpenDetail={() => { setMapSelectedId(null); openSheet(sc) }}
                    onToggleFavorite={() => toggleFavorite(sc.id)}
                    mobile={!isDesktop} />
                })()}
              </div>
            )}

            {viewMode === 'grid' && (
              <div className="vt-grid">
                {displayList.length === 0 && (
                  <div className="vt-empty">{emptyMsg}</div>
                )}
                {displayList.map((c, i) => (
                  <CasaCard key={c.id} casa={c} isFavorite={favorites.has(c.id)}
                    isFirst={i === 0}
                    onToggleFavorite={() => toggleFavorite(c.id)}
                    onShare={() => shareProperty(c)}
                    onPhotoTap={(idx) => openViewer(c, idx)}
                    onDetails={() => openSheet(c)} />
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ===== MOBILE LAYOUT (TikTok) ===== */}
      {!isDesktop && (
        <>
          {/* Top bar — search pill (mismo componente que el feed de deptos) */}
          <div className="mt-top-bar">
            <button className="mt-search-pill" onClick={() => { setFilterOverlayOpen(true); trackEvent('open_filter_overlay_casa') }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.8}}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <span className="mt-search-text">{searchPillText}</span>
              {filtered && <div className="mt-search-dot" />}
            </button>
          </div>

          {/* Contador de cards */}
          {displayList.length > 0 && (
            <div className="mt-counter">{activeCardIndex + 1} / {displayList.length}</div>
          )}

          {/* Botón de mapa flotante */}
          <button className="mt-map-btn" aria-label="Ver mapa" onClick={() => { setMobileMapOpen(true); trackEvent('open_map_mobile_casa') }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#EDE8DC" strokeWidth="1.5" style={{width:22,height:22}}>
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
          </button>

          {/* Mapa full-screen mobile */}
          {mobileMapOpen && (
            <div className="mt-map-overlay">
              <div className="mt-map-header">
                <span className="mt-map-title">Mapa de casas</span>
                <button className="mt-map-close" aria-label="Cerrar mapa" onClick={() => { setMobileMapOpen(false); setMapSelectedId(null) }}>&times;</button>
              </div>
              <div className="mt-map-body">
                {mapProps.length > 0 && <VentaMap properties={mapProps} onSelectProperty={handleMapSelect} selectedId={mapSelectedId} />}
                {mapSelectedId && (() => {
                  const sc = casasFiltradas.find(c => c.id === mapSelectedId)
                  if (!sc) return null
                  return <CasaMapFloatCard mobile property={sc} isFavorite={favorites.has(sc.id)}
                    onClose={() => setMapSelectedId(null)}
                    onOpenDetail={() => { setMapSelectedId(null); setMobileMapOpen(false); openSheet(sc) }}
                    onToggleFavorite={() => toggleFavorite(sc.id)} />
                })()}
              </div>
            </div>
          )}

          <div className="vt-feed" ref={feedRef}>
            {displayList.length === 0 && (
              <div className="mc mc-empty"><div className="mc-empty-msg">{emptyMsg}</div></div>
            )}
            {displayList.map((c, i) => (
              <MobileCasaCard key={c.id} casa={c}
                isFavorite={favorites.has(c.id)}
                isFirst={i === 0}
                isSpotlight={i === 0 && !!spotlightCasa}
                onToggleFavorite={() => toggleFavorite(c.id)}
                onShare={() => shareProperty(c)}
                onPhotoTap={(idx) => openViewer(c, idx)}
                onDetails={() => openSheet(c)} />
            ))}
          </div>
        </>
      )}

      {/* ===== SEO FOOTER ===== */}
      <div className="vt-seo-section">
        <div className="vt-seo-inner">
          <h1 className="vt-seo-h1">Casas en venta — Zona Norte, Santa Cruz</h1>
          <p className="vt-seo-p">
            {seo.totalCasas} casas disponibles · {seo.nEnCondominio} en condominio cerrado ·
            Mediana $us {Math.round(seo.medianaPrecioM2)}/m²
            {seo.medianaTerreno > 0 ? ` · Terreno mediano ${Math.round(seo.medianaTerreno)}m²` : ''}.
            Actualizado {new Date(seo.fechaActualizacion + 'T12:00:00').toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </div>
      </div>

      {/* ===== GLOBAL CSS (cloned from zona-norte/ventas) ===== */}
      <style jsx global>{`
        html,body{margin:0;padding:0;background:#141414;color:#EDE8DC;font-family:'DM Sans',sans-serif}
        *{box-sizing:border-box}
        @media(max-width:767px){html,body{overflow:hidden;height:100%}}

        /* ---- DESKTOP LAYOUT ---- */
        .vt-layout{display:flex;min-height:100vh;background:#141414}
        .vt-sidebar{width:260px;flex-shrink:0;background:#1A1A18;border-right:1px solid rgba(237,232,220,0.08);overflow-y:auto;height:100vh;position:sticky;top:0}
        .vt-sidebar-header{padding:20px 18px 12px;border-bottom:1px solid rgba(237,232,220,0.08)}
        .vt-sidebar-title{font-family:'Figtree',sans-serif;font-size:16px;font-weight:700;color:#EDE8DC;letter-spacing:-0.01em}
        .vt-sidebar-count{font-size:12px;color:rgba(237,232,220,0.45);margin-top:4px}
        .vt-main{flex:1;overflow-y:auto;padding:0 20px 60px}
        .vt-toolbar{display:flex;align-items:center;justify-content:space-between;padding:16px 0 12px;border-bottom:1px solid rgba(237,232,220,0.08);margin-bottom:16px}
        .vt-toolbar-count{font-size:13px;color:rgba(237,232,220,0.55)}
        .vt-toolbar-right{display:flex;align-items:center;gap:8px}
        .vt-toolbar-reset{font-size:12px;color:#3A6A48;background:none;border:none;cursor:pointer;padding:4px 8px}
        .vt-view-btn{background:rgba(237,232,220,0.06);border:1px solid rgba(237,232,220,0.12);color:rgba(237,232,220,0.6);padding:6px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:12px;font-family:'DM Sans',sans-serif}
        .vt-view-btn.active{background:rgba(237,232,220,0.15);color:#EDE8DC;border-color:rgba(237,232,220,0.25)}
        .vt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;padding-bottom:40px}
        .vt-empty{grid-column:1/-1;padding:60px 20px;text-align:center;color:rgba(237,232,220,0.35);font-size:15px}
        .vt-spotlight-banner{background:rgba(58,106,72,0.15);border:1px solid rgba(58,106,72,0.4);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#3A6A48}
        .vt-spotlight-banner button{background:none;border:none;color:rgba(237,232,220,0.5);cursor:pointer;font-size:18px}
        .vt-map-wrap{height:520px;border-radius:10px;overflow:hidden;margin-bottom:20px}

        /* ---- MOBILE FEED ---- */
        .vt-feed{height:100vh;overflow-y:scroll;scroll-snap-type:y mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .vt-feed::-webkit-scrollbar{display:none}
        /* ===== TOP BAR MOBILE (mismo componente que el feed de deptos) ===== */
        .mt-top-bar{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:10px 16px;padding-top:max(10px, env(safe-area-inset-top));pointer-events:none}
        .mt-top-bar > *{pointer-events:auto}
        .mt-search-pill{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.15);padding:8px 16px;border-radius:100px;border:none;cursor:pointer;position:relative;max-width:80vw;color:#fff}
        .mt-search-text{font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:rgba(255,255,255,0.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.2px}
        .mt-search-dot{position:absolute;top:5px;right:5px;width:6px;height:6px;background:#3A6A48;border-radius:50%}
        .mt-counter{position:fixed;bottom:max(16px, calc(env(safe-area-inset-bottom) + 8px));right:16px;z-index:50;font-size:12px;color:#9A8E7A;font-family:'DM Sans',sans-serif;font-weight:500;font-variant-numeric:tabular-nums}
        .mt-map-btn{position:fixed;bottom:max(140px, calc(env(safe-area-inset-bottom) + 130px));right:20px;z-index:100;width:48px;height:48px;border-radius:50%;background:rgba(20,20,20,0.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2)}
        .mt-map-overlay{position:fixed;inset:0;z-index:300;background:#141414;display:flex;flex-direction:column}
        .mt-map-header{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;padding-top:max(12px, env(safe-area-inset-top));background:#141414;border-bottom:1px solid rgba(237,232,220,0.1)}
        .mt-map-title{font-family:'Figtree',sans-serif;font-size:20px;font-weight:500;color:#EDE8DC}
        .mt-map-close{width:44px;height:44px;border-radius:10px;border:none;background:rgba(237,232,220,0.08);color:#B8AD9E;font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer}
        .mt-map-body{flex:1;position:relative;overflow:hidden}
        .mt-map-body .venta-map{position:absolute;inset:0}
        @media(min-width:768px){.mt-top-bar,.mt-counter,.mt-map-btn{display:none}}

        /* ---- DESKTOP CARD (vc-*) ---- */
        .vc{background:#1E1E1C;border-radius:10px;overflow:hidden;border:1px solid rgba(237,232,220,0.08);transition:border-color 0.15s}
        .vc:hover{border-color:rgba(237,232,220,0.18)}
        .vc-photo{height:200px;background:#2A2A28 center/cover no-repeat;position:relative}
        .vc-nofoto{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(237,232,220,0.2);font-size:13px}
        .vc-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(20,20,20,0.55);border:none;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2}
        .vc-nav-prev{left:8px}.vc-nav-next{right:8px}
        .vc-photo-count{position:absolute;bottom:8px;right:8px;background:rgba(20,20,20,0.75);color:rgba(255,255,255,0.8);font-size:11px;padding:3px 8px;border-radius:100px;font-family:'DM Sans',sans-serif}
        .vc-body{padding:14px}
        .vc-name{font-family:'Figtree',sans-serif;font-weight:700;font-size:15px;color:#EDE8DC;margin-bottom:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .vc-reciente{font-size:10px;font-weight:600;background:rgba(58,106,72,0.2);color:#3A6A48;padding:2px 6px;border-radius:100px;letter-spacing:0.02em;text-transform:uppercase;font-family:'DM Sans',sans-serif}
        .vc-zona{font-size:12px;color:rgba(237,232,220,0.45);margin-bottom:8px}
        .vc-id{color:rgba(237,232,220,0.25)}
        .vc-price-block{margin-bottom:6px}
        .vc-price{font-size:17px;font-weight:700;color:#EDE8DC;font-family:'Figtree',sans-serif}
        .vc-tc{font-size:11px;font-weight:400;color:rgba(237,232,220,0.35);margin-left:4px}
        .vc-specs{font-size:12px;color:rgba(237,232,220,0.6);margin-top:3px}
        .vc-specs-2{font-size:11px;color:rgba(237,232,220,0.4);margin-bottom:8px}
        .vc-amen-chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
        .vc-amen-chip{font-size:10px;background:rgba(237,232,220,0.07);color:rgba(237,232,220,0.55);padding:2px 7px;border-radius:100px;border:1px solid rgba(237,232,220,0.1)}
        .vc-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid rgba(237,232,220,0.07)}
        .vc-act-btn{display:flex;align-items:center;gap:5px;padding:6px 10px;border-radius:6px;background:rgba(237,232,220,0.06);border:1px solid rgba(237,232,220,0.1);color:rgba(237,232,220,0.65);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:background 0.15s}
        .vc-act-btn:hover{background:rgba(237,232,220,0.12)}
        .vc-act-fav.active{color:#E05555}
        .vc-act-wsp{background:rgba(30,169,82,0.12);border-color:rgba(30,169,82,0.25);color:#1EA952}
        .vc-act-wsp:hover{background:rgba(30,169,82,0.2)}
        .vc-act-detail{}

        /* ---- MOBILE CARD (mc-*) ---- */
        .mc{height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;position:relative;background:#141414}
        .mc-empty{align-items:center;justify-content:center}
        .mc-empty-msg{color:rgba(237,232,220,0.4);font-size:15px;text-align:center;padding:20px}
        .mc-photo-zone{flex:0 0 55%;position:relative;overflow:hidden;background:#1A1A18}
        .mc-photo-scroll{display:flex;height:100%;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .mc-photo-scroll::-webkit-scrollbar{display:none}
        .mc-slide{flex:0 0 100%;scroll-snap-align:start;background:#2A2A28 center/cover no-repeat}
        .mc-slide-empty{background:#1A1A18}
        .mc-photo-fade{position:absolute;bottom:0;left:0;right:0;height:60px;background:linear-gradient(to bottom,transparent,rgba(20,20,20,0.7))}
        .mc-photo-count{position:absolute;bottom:10px;right:10px;background:rgba(20,20,20,0.75);color:rgba(255,255,255,0.8);font-size:11px;padding:3px 8px;border-radius:100px;font-family:'DM Sans',sans-serif}
        .mc-dots{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:4px}
        .mc-dot{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.3);transition:all 0.2s}
        .mc-dot.active{background:#fff;width:14px;border-radius:3px}
        .mc-spotlight{position:absolute;top:12px;left:12px;background:rgba(58,106,72,0.9);color:#EDE8DC;font-size:11px;font-weight:600;padding:5px 10px;border-radius:6px;z-index:3;letter-spacing:0.02em;font-family:'DM Sans',sans-serif}
        .mc-content{flex:1;overflow-y:auto;padding:14px 14px 80px;display:flex;flex-direction:column;gap:4px}
        .mc-content::-webkit-scrollbar{display:none}
        .mc-name{font-family:'Figtree',sans-serif;font-weight:700;font-size:16px;color:#EDE8DC;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .mc-reciente{font-size:10px;font-weight:600;background:rgba(58,106,72,0.2);color:#3A6A48;padding:2px 6px;border-radius:100px;text-transform:uppercase;font-family:'DM Sans',sans-serif}
        .mc-zona{font-size:12px;color:rgba(237,232,220,0.45)}
        .mc-id{color:rgba(237,232,220,0.25)}
        .mc-price{font-size:18px;font-weight:700;color:#EDE8DC;font-family:'Figtree',sans-serif}
        .mc-tc{font-size:11px;font-weight:400;color:rgba(237,232,220,0.35);margin-left:4px}
        .mc-specs{font-size:13px;color:rgba(237,232,220,0.65);margin-top:2px}
        .mc-specs-2{font-size:11px;color:rgba(237,232,220,0.4)}
        .mc-amen-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
        .mc-amen-chip{font-size:10px;background:rgba(237,232,220,0.07);color:rgba(237,232,220,0.55);padding:2px 7px;border-radius:100px;border:1px solid rgba(237,232,220,0.1)}
        .mc-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:8px;border-top:1px solid rgba(237,232,220,0.07)}
        .mc-btn{display:flex;align-items:center;gap:5px;padding:8px 12px;border-radius:8px;background:rgba(237,232,220,0.06);border:1px solid rgba(237,232,220,0.1);color:rgba(237,232,220,0.75);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif}
        .mc-fav.active{color:#E05555}
        .mc-wsp-inline{background:#1EA952;border-color:#1EA952;color:#fff}
        .mc-branding{font-size:10px;color:rgba(237,232,220,0.18);text-decoration:none;text-align:right;margin-top:4px}

        /* ---- FILTER SIDEBAR (vf-*) ---- */
        .vf-wrap{padding:12px 14px 20px}
        .vf-group{margin-bottom:18px}
        .vf-label{font-size:10px;font-weight:700;letter-spacing:0.08em;color:rgba(237,232,220,0.35);margin-bottom:8px;text-transform:uppercase}
        .vf-zona-btns{display:flex;flex-wrap:wrap;gap:4px}
        .vf-zona-btn{font-size:10px;padding:3px 7px;border-radius:5px;background:rgba(237,232,220,0.06);border:1px solid rgba(237,232,220,0.1);color:rgba(237,232,220,0.55);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.15s;white-space:nowrap}
        .vf-zona-btn.active{background:rgba(58,106,72,0.2);border-color:#3A6A48;color:#3A6A48}
        .vf-btn-row{display:flex;flex-wrap:wrap;gap:5px}
        .vf-btn{font-size:12px;padding:5px 12px;border-radius:6px;background:rgba(237,232,220,0.06);border:1px solid rgba(237,232,220,0.1);color:rgba(237,232,220,0.6);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.15s}
        .vf-btn.active{background:rgba(58,106,72,0.15);border-color:#3A6A48;color:#3A6A48}
        .vf-price-inputs{display:flex;align-items:center;gap:6px;margin-bottom:8px}
        .vf-area-field{display:flex;align-items:center;gap:3px;background:rgba(237,232,220,0.05);border:1px solid rgba(237,232,220,0.12);border-radius:6px;padding:4px 7px}
        .vf-area-prefix{font-size:10px;color:rgba(237,232,220,0.3)}
        .vf-price-dollar{font-size:11px;color:rgba(237,232,220,0.4)}
        .vf-area-input{width:50px;background:transparent;border:none;color:#EDE8DC;font-size:12px;font-family:'DM Sans',sans-serif;outline:none}
        .vf-area-input::-webkit-outer-spin-button,.vf-area-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .vf-area-suffix{font-size:10px;color:rgba(237,232,220,0.3)}
        .vf-area-sep{color:rgba(237,232,220,0.2);font-size:12px}
        .vf-area-inputs{display:flex;align-items:center;gap:6px;margin-bottom:6px}
        .vf-area-clear{font-size:11px;color:rgba(237,232,220,0.35);background:none;border:none;cursor:pointer;padding:2px 0;font-family:'DM Sans',sans-serif;text-decoration:underline}
        .vf-range-wrap{position:relative;height:24px;margin-bottom:4px}
        .vf-slider{position:absolute;width:100%;-webkit-appearance:none;appearance:none;height:3px;background:rgba(237,232,220,0.15);border-radius:2px;outline:none;pointer-events:none}
        .vf-slider::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#3A6A48;cursor:pointer;pointer-events:all}
        .vf-slider-min{z-index:3}.vf-slider-max{z-index:2}
        .vf-tc-note{font-size:10px;color:rgba(237,232,220,0.28);margin-top:4px}
        .vf-reset{width:100%;margin-top:6px;padding:9px;background:rgba(237,232,220,0.06);border:1px solid rgba(237,232,220,0.1);color:rgba(237,232,220,0.5);border-radius:7px;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif}

        /* ---- FILTER OVERLAY (fo-*) ---- */
        .fo-overlay{position:fixed;inset:0;z-index:200;background:#141414;display:flex;flex-direction:column;overflow:hidden}
        .fo-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(237,232,220,0.08)}
        .fo-close{background:none;border:none;color:#EDE8DC;font-size:24px;cursor:pointer;padding:0;line-height:1}
        .fo-title{font-family:'Figtree',sans-serif;font-weight:700;font-size:16px;color:#EDE8DC}
        .fo-count{font-size:13px;color:rgba(237,232,220,0.45)}
        .fo-body{flex:1;overflow-y:auto;padding:8px 16px 0}
        .fo-footer{padding:12px 16px;border-top:1px solid rgba(237,232,220,0.08);display:flex;gap:8px}
        .fo-reset{flex:1;padding:12px;background:rgba(237,232,220,0.06);border:1px solid rgba(237,232,220,0.12);color:rgba(237,232,220,0.6);border-radius:8px;cursor:pointer;font-size:14px;font-family:'DM Sans',sans-serif}
        .fo-apply{flex:2;padding:12px;background:#3A6A48;border:none;color:#EDE8DC;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;font-family:'DM Sans',sans-serif}

        /* ---- BOTTOM SHEET (bs-*) ---- */
        .bs-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100;opacity:0;pointer-events:none;transition:opacity 0.25s}
        .bs-overlay.open{opacity:1;pointer-events:all}
        .bs{position:fixed;bottom:0;left:0;right:0;z-index:101;background:#1A1A18;border-radius:16px 16px 0 0;max-height:92vh;overflow-y:auto;transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.32,0.72,0,1)}
        .bs.open{transform:translateY(0)}
        .bs-desktop{max-width:480px;left:auto;right:0;top:0;bottom:0;border-radius:16px 0 0 0;max-height:100vh}
        .bs-venta.bs-desktop{left:auto;right:0}
        .bs-floating-actions{position:sticky;top:0;z-index:10;display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 14px 4px;background:#1A1A18}
        .bs-fav,.bs-close{background:rgba(237,232,220,0.08);border:1px solid rgba(237,232,220,0.12);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:rgba(237,232,220,0.7)}
        .bs-fav.active{color:#E05555}
        .bs-close{font-size:20px;color:rgba(237,232,220,0.6)}
        .bs-dark-header{padding:14px 16px 16px;background:#1A1A18}
        .bs-h-name{font-family:'Figtree',sans-serif;font-weight:700;font-size:18px;color:#EDE8DC;margin-bottom:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .bs-h-reciente{font-size:10px;font-weight:600;background:rgba(58,106,72,0.2);color:#3A6A48;padding:2px 6px;border-radius:100px;text-transform:uppercase;font-family:'DM Sans',sans-serif}
        .bs-h-zona{font-size:12px;color:rgba(237,232,220,0.4);margin-bottom:10px}
        .bs-h-price{font-size:22px;font-weight:700;color:#EDE8DC;font-family:'Figtree',sans-serif}
        .bs-h-tc{font-size:11px;font-weight:400;color:rgba(237,232,220,0.3);margin-left:4px}
        .bs-h-specs{font-size:13px;color:rgba(237,232,220,0.6);margin-top:4px}
        .bs-h-sub{font-size:12px;color:rgba(237,232,220,0.4);margin-top:3px}
        .bs-section{padding:14px 16px;border-top:1px solid rgba(237,232,220,0.07)}
        .bs-sl{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:rgba(237,232,220,0.4);margin-bottom:12px}
        .bs-sl-dot{width:4px;height:4px;border-radius:50%;background:#3A6A48;flex-shrink:0}
        .bs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .bs-feat{display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 8px;background:rgba(237,232,220,0.04);border-radius:8px;border:1px solid rgba(237,232,220,0.07)}
        .bs-feat.hl{border-color:rgba(58,106,72,0.35);background:rgba(58,106,72,0.07)}
        .bs-fi{width:20px;height:20px;color:#3A6A48}
        .bs-fv{font-size:13px;font-weight:700;color:#EDE8DC;text-align:center}
        .bs-fl{font-size:10px;color:rgba(237,232,220,0.35);text-align:center}
        .bs-badges{display:flex;flex-wrap:wrap;gap:6px}
        .bs-badge{font-size:11px;padding:4px 10px;border-radius:100px;background:rgba(237,232,220,0.07);border:1px solid rgba(237,232,220,0.12);color:rgba(237,232,220,0.6)}
        .bs-badge.gold{background:rgba(242,180,65,0.1);border-color:rgba(242,180,65,0.3);color:#F2B441}
        .bs-aw{display:flex;flex-wrap:wrap;gap:6px}
        .bs-at{font-size:12px;padding:4px 10px;border-radius:100px;background:rgba(237,232,220,0.05);border:1px solid rgba(237,232,220,0.1);color:rgba(237,232,220,0.6)}
        .bs-desc{font-size:13px;color:rgba(237,232,220,0.6);line-height:1.6;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
        .bs-desc.expanded{display:block;-webkit-line-clamp:unset}
        .bs-desc-more{font-size:12px;color:#3A6A48;background:none;border:none;cursor:pointer;padding:4px 0;font-family:'DM Sans',sans-serif}
        .bs-agent{font-size:13px;color:rgba(237,232,220,0.5)}
        .bs-agent-name{color:rgba(237,232,220,0.7)}
        .bs-agent-office{color:rgba(237,232,220,0.4)}
        .bs-sim-scroll{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
        .bs-sim-scroll::-webkit-scrollbar{display:none}
        .bs-sim-card{display:flex;flex-direction:column;gap:6px;min-width:120px;background:rgba(237,232,220,0.04);border:1px solid rgba(237,232,220,0.08);border-radius:8px;overflow:hidden;cursor:pointer;text-align:left;flex-shrink:0}
        .bs-sim-thumb{width:100%;height:80px;object-fit:cover;display:block}
        .bs-sim-nophoto{height:80px;background:#2A2A28}
        .bs-sim-info{padding:6px 8px 8px}
        .bs-sim-name{font-size:12px;font-weight:600;color:#EDE8DC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .bs-sim-price{font-size:12px;color:#EDE8DC;font-family:'Figtree',sans-serif}
        .bs-sim-specs{font-size:10px;color:rgba(237,232,220,0.4);margin-top:2px}
        .bs-gmaps-link{display:flex;align-items:center;gap:8px;font-size:13px;color:#3A6A48;text-decoration:none;padding:10px 0}
        .bs-ver-original{display:block;width:100%;padding:12px;border:1px solid rgba(237,232,220,0.15);border-radius:8px;background:transparent;color:rgba(237,232,220,0.6);font-size:13px;text-align:center;cursor:pointer;font-family:'DM Sans',sans-serif;text-decoration:none}
        .bs-sticky-footer{position:sticky;bottom:0;background:#1A1A18;padding:12px 16px;border-top:1px solid rgba(237,232,220,0.08);display:flex;gap:8px}
        .bs-wsp-cta{flex:1;padding:13px;background:#1EA952;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;text-decoration:none;font-family:'DM Sans',sans-serif}
        .bs-share-btn{padding:13px 16px;background:rgba(237,232,220,0.07);border:1px solid rgba(237,232,220,0.12);border-radius:8px;color:rgba(237,232,220,0.6);font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:'DM Sans',sans-serif}

        /* ---- COMPARE BANNER ---- */
        .vt-compare-banner-wrap{position:fixed;bottom:0;left:0;right:0;z-index:90;display:flex;gap:0;pointer-events:none}
        .vt-compare-banner{flex:1;background:#3A6A48;color:#EDE8DC;border:none;padding:14px 20px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;pointer-events:all;font-family:'DM Sans',sans-serif}
        .vt-compare-banner-text{flex:1;text-align:center}
        .vt-compare-banner-clear{background:#2D5238;border:none;color:#EDE8DC;padding:14px 18px;cursor:pointer;font-size:20px;pointer-events:all}

        /* ---- TOAST ---- */
        .ventas-toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#2A2A28;border:1px solid rgba(237,232,220,0.12);color:#EDE8DC;padding:10px 20px;border-radius:100px;font-size:13px;z-index:500;white-space:nowrap;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:8px;box-shadow:0 4px 24px rgba(0,0,0,0.4)}

        /* ---- SEO SECTION ---- */
        .vt-seo-section{padding:40px 20px;background:#111110;border-top:1px solid rgba(237,232,220,0.06)}
        .vt-seo-inner{max-width:700px;margin:0 auto}
        .vt-seo-h1{font-family:'Figtree',sans-serif;font-size:18px;font-weight:700;color:rgba(237,232,220,0.55);margin:0 0 10px}
        .vt-seo-p{font-size:13px;color:rgba(237,232,220,0.3);line-height:1.7;margin:0}

        /* ===== BOTTOM SHEET dark theme — .bs-venta sobrescribe alquileres.css (tema arena) =====
           alquileres.css define .bs-* con fondo claro y es global (_app.tsx). Sin estos overrides
           scopeados (especificidad 0,2,0 > 0,1,0) el cuerpo del sheet sale texto-claro sobre claro. */
        .bs-venta.bs{background:#1A1A18;color:#EDE8DC}
        .bs-venta .bs-section{background:#1A1A18;border-bottom:1px solid rgba(237,232,220,0.08)}
        .bs-venta .bs-sl{color:#9A8E7A}
        .bs-venta .bs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .bs-venta .bs-feat{background:rgba(237,232,220,0.06);border:1px solid rgba(237,232,220,0.1);box-shadow:none}
        .bs-venta .bs-fi{color:#9A8E7A}
        .bs-venta .bs-fv{color:#EDE8DC}
        .bs-venta .bs-fl{color:#9A8E7A}
        .bs-venta .bs-feat.hl{border-color:rgba(237,232,220,0.15);background:rgba(237,232,220,0.08)}
        .bs-venta .bs-feat.hl .bs-fl{color:#EDE8DC}
        .bs-venta .bs-feat.hl .bs-fv{color:#EDE8DC;font-weight:600}
        .bs-venta .bs-aw{display:flex;flex-wrap:wrap;gap:6px}
        .bs-venta .bs-at{background:rgba(237,232,220,0.06);border:1px solid rgba(237,232,220,0.1);color:#EDE8DC}
        .bs-venta .bs-badge{border:1px solid rgba(237,232,220,0.15);color:#9A8E7A;background:transparent}
        .bs-venta .bs-badge.gold{border-color:rgba(242,180,65,0.3);color:#F2B441;background:rgba(242,180,65,0.1)}
        .bs-venta .bs-desc{color:rgba(237,232,220,0.6)}
        .bs-venta .bs-agent{color:rgba(237,232,220,0.5)}
        .bs-venta .bs-agent-name{color:#EDE8DC}
        .bs-venta .bs-agent-office{color:#9A8E7A}
        .bs-venta .bs-sim-card{background:rgba(237,232,220,0.06);border:1px solid rgba(237,232,220,0.1)}
        .bs-venta .bs-sim-thumb,.bs-venta .bs-sim-nophoto{background:#2a2a2a}
        .bs-venta .bs-sim-name,.bs-venta .bs-sim-price{color:#EDE8DC}
        .bs-venta .bs-sim-specs{color:#9A8E7A}
        .bs-venta .bs-gmaps-link{background:rgba(237,232,220,0.08);color:#EDE8DC;border-radius:8px;padding:12px}
        .bs-venta .bs-ver-original{background:rgba(237,232,220,0.08);border:1px solid rgba(237,232,220,0.1);color:#EDE8DC}

        /* ===== MAP FLOAT CARD (mini-card al seleccionar un pin — clon de deptos) ===== */
        .vt-map-wrap{position:relative}
        @keyframes mfcIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .mfc-desktop{position:absolute;bottom:20px;left:20px;z-index:1000;background:#1a1a1a;border:1px solid rgba(237,232,220,0.1);border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);display:flex;width:380px;animation:mfcIn 0.2s ease-out}
        .mfc-mobile{position:absolute;bottom:12px;left:12px;right:12px;z-index:1000;background:#1a1a1a;border:1px solid rgba(237,232,220,0.1);border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);display:flex;animation:mfcIn 0.2s ease-out}
        .mfc-close{position:absolute;top:8px;right:8px;z-index:10;width:36px;height:36px;border-radius:50%;background:#fff;border:none;color:#141414;font-size:22px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-weight:600;padding:0}
        .mfc-photo{width:130px;min-width:130px;background-size:cover;background-position:center;background-color:#2a2a2a;position:relative}
        .mfc-nav{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:rgba(20,20,20,0.6);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:3}
        .mfc-nav-prev{left:4px}
        .mfc-nav-next{right:4px}
        .mfc-count{position:absolute;bottom:6px;right:6px;background:rgba(20,20,20,0.75);color:rgba(255,255,255,0.8);font-size:10px;padding:2px 6px;border-radius:8px;font-family:'DM Sans',sans-serif;line-height:1.2}
        .mfc-fav{position:absolute;top:6px;left:6px;width:44px;height:44px;border-radius:50%;background:rgba(20,20,20,0.5);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:3}
        .mfc-fav.active{background:rgba(224,85,85,0.15)}
        .mfc-fav svg{width:16px;height:16px}
        .mfc-body{flex:1;padding:14px}
        .mfc-name{font-family:'Figtree',sans-serif;font-size:18px;color:#EDE8DC;line-height:1.2;margin-bottom:4px;font-weight:500}
        .mfc-specs{font-size:12px;color:#9A8E7A;margin-bottom:8px;font-family:'DM Sans',sans-serif}
        .mfc-price{font-family:'DM Sans',sans-serif;font-size:22px;color:#EDE8DC;line-height:1;font-weight:500;font-variant-numeric:tabular-nums}
        .mfc-m2{font-size:11px;color:#9A8E7A;margin-bottom:10px;font-family:'DM Sans',sans-serif}
        .mfc-detail{width:100%;padding:8px;background:rgba(237,232,220,0.08);border:1px solid rgba(237,232,220,0.1);color:#EDE8DC;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;border-radius:10px}
      `}</style>
    </>
  )
}

// ===== getStaticProps =====
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return Math.round(sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo))
}

export const getStaticProps: GetStaticProps<{ casas: UnidadCasa[]; seo: CasasSEO }> = async () => {
  let casas: UnidadCasa[] = []
  let seo: CasasSEO = {
    totalCasas: 0,
    medianaPrecioM2: 0,
    medianaTerreno: 0,
    nEnCondominio: 0,
    fechaActualizacion: new Date().toISOString().split('T')[0],
  }

  try {
    const { supabase } = await import('@/lib/supabase')
    if (!supabase) throw new Error('Supabase not configured')

    const { data: rows, error } = await supabase
      .from('v_mercado_casas')
      .select('*')
      .in('microzona', getMicrozonasZN())

    if (error) throw error

    const mapped = (rows || []).map(mapCasaRow)
    // Quitar las que no tienen fotos
    casas = mapped.filter(c => c.fotos_urls.length > 0)

    // Calcular SEO
    const preciosM2 = casas.map(c => c.precio_m2).filter(v => v > 0).sort((a, b) => a - b)
    const terrenos = casas.map(c => c.area_terreno_m2).filter((v): v is number => v != null && v > 0).sort((a, b) => a - b)

    seo = {
      totalCasas: casas.length,
      medianaPrecioM2: percentile(preciosM2, 0.5),
      medianaTerreno: percentile(terrenos, 0.5),
      nEnCondominio: casas.filter(c => c.enCondominio).length,
      fechaActualizacion: new Date().toISOString().split('T')[0],
    }
  } catch (err) {
    console.error('getStaticProps /ventas/casas: error', err)
    // Fallback: empty array, build won't fail
  }

  return {
    props: { casas, seo },
    revalidate: 3600,
  }
}
