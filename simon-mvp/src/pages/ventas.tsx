import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import type { GetStaticProps } from 'next'
import type { UnidadVenta, FiltrosVentaSimple } from '@/lib/supabase'
import { ZONAS_CANONICAS, ZONAS_EQUIPETROL_DB, displayZona } from '@/lib/zonas'
import { trackEvent } from '@/lib/analytics'
import { fetchMercadoData, type MercadoData } from '@/lib/mercado-data'
import type { Broker } from '@/lib/simon-brokers'
import ACMInline from '@/components/broker/ACMInline'
import { useBrokerShortlists, DEMO_SHORTLIST_BLOCKED } from '@/hooks/useBrokerShortlists'
import ShortlistSendModal from '@/components/broker/ShortlistSendModal'
import ShortlistsPanel from '@/components/broker/ShortlistsPanel'
import BrokerDemoOverlay from '@/components/demo/BrokerDemoOverlay'
import ReportPropertyModal from '@/components/broker/ReportPropertyModal'
import DataReportsBanner from '@/components/broker/DataReportsBanner'
import EdificioSelect from '@/components/feed/EdificioSelect'
import { firstName } from '@/lib/format-utils'
import { buildAtribucionWaMessage, REF_ALTERNATIVAS_ENABLED, buildAlternativasRefLine } from '@/lib/wa-message'
import { openWhatsApp } from '@/lib/whatsapp'
import { parsearBusqueda } from '@/lib/busqueda-natural'
import { useTcParalelo } from '@/lib/useTcParalelo'
import { useTypewriterPlaceholder } from '@/lib/useTypewriterPlaceholder'
import PriceHistogram from '@/components/feed/PriceHistogram'
import { AmenityIcon, SparkleIcon, hasCanonicalIcon } from '@/lib/amenity-icons'
import { AMENIDADES_FILTRABLES } from '@/config/amenidades-mercado'
import FeedDesktopNav from '@/components/feed/FeedDesktopNav'
import ShortlistMobileHeader from '@/components/shortlist/ShortlistMobileHeader'
import ShortlistContextSummary from '@/components/shortlist/ShortlistContextSummary'
import ShortlistBottomBar from '@/components/shortlist/ShortlistBottomBar'
import ShortlistMenu from '@/components/shortlist/ShortlistMenu'
import ShortlistCardChip from '@/components/shortlist/ShortlistCardChip'
import { computeVentaShortlistStats } from '@/lib/shortlist-context'
// WhatsApp oficial de Simon (negocio) — NO el personal del fundador.
const SIMON_WHATSAPP = '59177066308'

// Ejemplos reales para el placeholder typewriter del buscador natural (ventas).
const SEARCH_EXAMPLES_VENTA = [
  '1 dorm en Sirari hasta 150 mil',
  'preventa en Eq. Norte',
  '2 dormitorios con piscina',
  'monoambiente hasta 80 mil',
  'depto en Equipetrol con parqueo',
]

// Nota de TC en el filtro de presupuesto: muestra el TC paralelo DEL DÍA
// (config_global, vía /api/tc-actual) en vez del 6.96 oficial muerto hardcodeado.
function TcNote() {
  const tc = useTcParalelo()
  return <div className="vf-tc-note">Precios en USD · TC Bs {tc.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
}

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

// Filtro de fuentes (modo broker). Permite al broker mostrar solo el inventario
// de las franquicias con las que opera. Aplica solo en /broker/[slug].
const FUENTES_BROKER = ['century21', 'remax', 'bien_inmuebles'] as const
type FuenteBroker = typeof FUENTES_BROKER[number]
const FUENTES_BROKER_LABELS: Record<FuenteBroker, string> = {
  century21: 'Century 21',
  remax: 'RE/MAX',
  bien_inmuebles: 'Bien Inmuebles',
}

// Filtro de superficie m² (modo broker). Inputs editables min/max, client-side.
// Default: rango completo (sin filtro). Props sin area_m2 se ocultan cuando hay rango.
const M2_MIN_DEFAULT = 30
const M2_MAX_DEFAULT = 400

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
  // Lanzamiento TC nuevo (pre-cutover): el feed lee SHADOW por defecto
  // (propiedades_v2_shadow, reader híbrido, precios reales). ?shadow=0 = escape
  // a prod para debug/comparación.
  const shadow = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('shadow') !== '0'
  const res = await fetch('/api/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filtros, spotlightId, shadow }),
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

// ===== Badges de frescura =====
// Dos conceptos distintos que antes estaban colapsados en uno:
//  · "Nuevo"    = recién capturado por NOSOTROS (dias_desde_captura, derivado de
//                 fecha_creacion: estable, no se pisa como fecha_discovery).
//                 Solo viaja en el feed shadow; en prod es null y el badge no
//                 aplica (dias_desde_captura ausente = gate del comportamiento).
//  · "Reciente" = recién PUBLICADO en el portal (dias_en_mercado).
// Excluyentes: si es nuevo gana "Nuevo"; el umbral de reciente baja a 30d en
// shadow y conserva 60d en prod para no tocar el feed vivo hasta el cutover.
const NUEVO_MAX_DIAS = 3
const RECIENTE_MAX_DIAS_SHADOW = 30
const RECIENTE_MAX_DIAS_PROD = 60
function esNuevoCaptura(p: UnidadVenta): boolean {
  return p.dias_desde_captura != null && p.dias_desde_captura <= NUEVO_MAX_DIAS
}
function esPublicacionReciente(p: UnidadVenta): boolean {
  if (p.dias_en_mercado == null) return false
  const umbral = p.dias_desde_captura != null ? RECIENTE_MAX_DIAS_SHADOW : RECIENTE_MAX_DIAS_PROD
  return p.dias_en_mercado <= umbral
}

// ===== Filtro de amenidades (client-side, fiduciario) =====
// Se parte en DOS pills alineadas con /alquileres:
//  · Comodidades = SOLO amenidades diferenciadoras de EDIFICIO (esEstandar:false).
//    Nunca las estándar (Ascensor, Seguridad, Terraza…) ni la cola larga.
//  · Más filtros = ATRIBUTOS de la propiedad (Amoblado/Equipado/Parqueo/Baulera).
//    Ventas NO tiene acepta_mascotas (dato de alquiler) y mascotas no es criterio
//    de compra → sin filtro de mascotas (pet_friendly queda solo como chip de card).
// El filtro no oculta a los que no la listan: parte los resultados en "confirmados"
// y "no listados" (podrían tenerla sin mencionarla) — ver partición en la página.
// Solo los diferenciadores BIEN listados en la data (≥29% confirman). Descartados
// por dato: Estac. Visitas/Parque Infantil (raros), Pet Friendly (1.6%, subreportado), Jardín (0%).
// Fuente de verdad única: config/amenidades-mercado.ts (flag `filtrable`). No hardcodear.
const AMEN_DIFERENCIADORES = AMENIDADES_FILTRABLES
const AMEN_ATRIBUTOS = ['Amoblado', 'Equipado', 'Parqueo', 'Baulera']
const _DIACR_AMEN = new RegExp('[\\u0300-\\u036f]', 'g')
const _normAmen = (s: string) => s.toLowerCase().normalize('NFD').replace(_DIACR_AMEN, '').trim()
function propMatchesAmen(p: UnidadVenta, sel: Set<string>): boolean {
  for (const a of sel) {
    if (a === 'Amoblado') { if (!((p.equipamiento_detectado || []).some(e => /amoblad/i.test(e)))) return false; continue }
    if (a === 'Equipado') { if (!((p.equipamiento_detectado || []).length > 0)) return false; continue }
    if (a === 'Parqueo') { if (!(p.parqueo_incluido === true || (p.estacionamientos != null && p.estacionamientos > 0))) return false; continue }
    if (a === 'Baulera') { if (p.baulera !== true) return false; continue }
    const na = _normAmen(a)
    const has = (p.amenities_confirmados || []).some(x => _normAmen(x) === na) || (p.amenidades_extra || []).some(x => _normAmen(x) === na)
    if (!has) return false
  }
  return true
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
// Sub-componente con buffer interno para inputs de precio (broker).
// Valor expuesto en miles ($K) — el slider trabaja con valor pleno (30000-400000),
// pero el input pide al usuario escribir "150" para significar $150k. Conversión x1000.
// Commit + clamp solo en onBlur o Enter (mismo patrón que área m²).
function PriceInputsVT({ minPrice, maxPrice, onMinPrice, onMaxPrice }: {
  minPrice: number; maxPrice: number
  onMinPrice: (v: number) => void; onMaxPrice: (v: number) => void
}) {
  // Montos en número COMPLETO (no "K" — confundía). Buffer string, commit en blur/Enter.
  const [minStr, setMinStr] = useState(String(minPrice))
  const [maxStr, setMaxStr] = useState(String(maxPrice))
  useEffect(() => { setMinStr(String(minPrice)) }, [minPrice])
  useEffect(() => { setMaxStr(String(maxPrice)) }, [maxPrice])
  function commitMin() {
    const n = parseInt(minStr)
    if (!Number.isFinite(n)) { setMinStr(String(minPrice)); return }
    const clamped = Math.max(MIN_PRICE, Math.min(n, maxPrice - PRICE_STEP))
    setMinStr(String(clamped))
    if (clamped !== minPrice) onMinPrice(clamped)
  }
  function commitMax() {
    const n = parseInt(maxStr)
    if (!Number.isFinite(n)) { setMaxStr(String(maxPrice)); return }
    const clamped = Math.min(MAX_PRICE, Math.max(n, minPrice + PRICE_STEP))
    setMaxStr(String(clamped))
    if (clamped !== maxPrice) onMaxPrice(clamped)
  }
  return (
    <div className="vf-price-inputs">
      <label className="vf-area-field">
        <span className="vf-area-prefix">Min</span>
        <span className="vf-price-dollar">$</span>
        <input type="number" className="vf-area-input" inputMode="numeric"
          min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
          value={minStr}
          aria-label="Precio mínimo en USD"
          onChange={e => setMinStr(e.target.value)}
          onBlur={commitMin}
          onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }} />
      </label>
      <span className="vf-area-sep">—</span>
      <label className="vf-area-field">
        <span className="vf-area-prefix">Max</span>
        <span className="vf-price-dollar">$</span>
        <input type="number" className="vf-area-input" inputMode="numeric"
          min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
          value={maxStr}
          aria-label="Precio máximo en USD"
          onChange={e => setMaxStr(e.target.value)}
          onBlur={commitMax}
          onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }} />
      </label>
    </div>
  )
}

// Sub-componente con buffer string interno para inputs de m².
// Evita el bug de clamp en cada keystroke (al escribir "150" se clampaba a 30 con el "1").
// Commit + clamp solo en onBlur o Enter. El feed se filtra cuando hay commit.
function AreaInputsVT({ areaMin, areaMax, onAreaMin, onAreaMax }: {
  areaMin: number; areaMax: number
  onAreaMin: (v: number) => void; onAreaMax: (v: number) => void
}) {
  const [minStr, setMinStr] = useState(String(areaMin))
  const [maxStr, setMaxStr] = useState(String(areaMax))
  // Sync cuando el padre actualiza (ej: click "Quitar filtro de superficie").
  useEffect(() => { setMinStr(String(areaMin)) }, [areaMin])
  useEffect(() => { setMaxStr(String(areaMax)) }, [areaMax])
  function commitMin() {
    const n = parseInt(minStr)
    if (!Number.isFinite(n)) { setMinStr(String(areaMin)); return }
    const clamped = Math.max(M2_MIN_DEFAULT, Math.min(n, areaMax))
    setMinStr(String(clamped))
    if (clamped !== areaMin) onAreaMin(clamped)
  }
  function commitMax() {
    const n = parseInt(maxStr)
    if (!Number.isFinite(n)) { setMaxStr(String(areaMax)); return }
    const clamped = Math.min(M2_MAX_DEFAULT, Math.max(n, areaMin))
    setMaxStr(String(clamped))
    if (clamped !== areaMax) onAreaMax(clamped)
  }
  const filtroActivo = areaMin > M2_MIN_DEFAULT || areaMax < M2_MAX_DEFAULT
  return (
    <>
      <div className="vf-area-inputs">
        <label className="vf-area-field">
          <span className="vf-area-prefix">Min</span>
          <input type="number" className="vf-area-input" inputMode="numeric"
            min={M2_MIN_DEFAULT} max={M2_MAX_DEFAULT} step={5}
            value={minStr}
            aria-label="Superficie mínima en metros cuadrados"
            onChange={e => setMinStr(e.target.value)}
            onBlur={commitMin}
            onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }} />
          <span className="vf-area-suffix">m²</span>
        </label>
        <span className="vf-area-sep">—</span>
        <label className="vf-area-field">
          <span className="vf-area-prefix">Max</span>
          <input type="number" className="vf-area-input" inputMode="numeric"
            min={M2_MIN_DEFAULT} max={M2_MAX_DEFAULT} step={5}
            value={maxStr}
            aria-label="Superficie máxima en metros cuadrados"
            onChange={e => setMaxStr(e.target.value)}
            onBlur={commitMax}
            onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }} />
          <span className="vf-area-suffix">m²</span>
        </label>
      </div>
      {filtroActivo && (
        <button type="button" className="vf-area-clear"
          onClick={() => { onAreaMin(M2_MIN_DEFAULT); onAreaMax(M2_MAX_DEFAULT) }}>
          Quitar filtro de superficie
        </button>
      )}
    </>
  )
}

function FilterControls({ minPrice, maxPrice, selectedDorms, selectedZonas, entrega, orden, proyecto, proyectoNames, onMinPrice, onMaxPrice, onToggleZona, onToggleDorm, onEntrega, onOrden, onProyecto, brokerMode = false, areaMin, areaMax, onAreaMin, onAreaMax, amenSel, onAmenToggle, priceValues }: {
  minPrice: number; maxPrice: number; selectedDorms: Set<number>; selectedZonas: Set<string>; entrega: string; orden: FiltrosVentaSimple['orden']; proyecto: string; proyectoNames?: string[]
  onMinPrice: (v: number) => void; onMaxPrice: (v: number) => void; onToggleZona: (db: string) => void; onToggleDorm: (d: number) => void; onEntrega: (v: string) => void; onOrden: (v: FiltrosVentaSimple['orden']) => void; onProyecto: (v: string) => void
  brokerMode?: boolean
  areaMin?: number; areaMax?: number
  onAreaMin?: (v: number) => void; onAreaMax?: (v: number) => void
  // Comodidades (edificio) + Atributos (depto), client-side vía amenSel del padre.
  amenSel?: Set<string>; onAmenToggle?: (a: string) => void
  // Precios del feed cargado, para el histograma de distribución.
  priceValues?: number[]
}) {
  return (
    <>
      <div className="vf-group"><div className="vf-label">EDIFICIO</div>
        <EdificioSelect value={proyecto} onChange={onProyecto} options={proyectoNames || []} variant="dark" placeholder="Buscar edificio..." />
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
        {priceValues && priceValues.length > 0 && (
          <PriceHistogram values={priceValues} min={MIN_PRICE} max={MAX_PRICE} selMin={minPrice} selMax={maxPrice} dark />
        )}
        <PriceInputsVT minPrice={minPrice} maxPrice={maxPrice} onMinPrice={onMinPrice} onMaxPrice={onMaxPrice} />
        <div className="vf-range-wrap">
          <input type="range" className="vf-slider vf-slider-min" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={minPrice} aria-label="Precio mínimo" onChange={e => onMinPrice(parseInt(e.target.value))} />
          <input type="range" className="vf-slider vf-slider-max" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
            value={maxPrice} aria-label="Precio máximo" onChange={e => onMaxPrice(parseInt(e.target.value))} />
        </div>
        <TcNote />
      </div>
      {brokerMode && onAreaMin && onAreaMax && (
        <div className="vf-group"><div className="vf-label">SUPERFICIE (m²)</div>
          <AreaInputsVT
            areaMin={areaMin ?? M2_MIN_DEFAULT}
            areaMax={areaMax ?? M2_MAX_DEFAULT}
            onAreaMin={onAreaMin}
            onAreaMax={onAreaMax}
          />
        </div>
      )}
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
      {amenSel && onAmenToggle && (
        <div className="vf-group"><div className="vf-label">COMODIDADES</div>
          <div className="vf-chips">
            {AMEN_DIFERENCIADORES.map(a => (
              <button key={a} className={`vf-chip ${amenSel.has(a) ? 'active' : ''}`} onClick={() => onAmenToggle(a)}>{a}</button>
            ))}
          </div>
          <div className="vf-amen-note">Filtramos por lo que el anuncio confirma; algún depto podría tenerla sin listarla.</div>
        </div>
      )}
      {amenSel && onAmenToggle && (
        <div className="vf-group"><div className="vf-label">ATRIBUTOS DEL DEPARTAMENTO</div>
          <div className="vf-chips">
            {AMEN_ATRIBUTOS.map(a => (
              <button key={a} className={`vf-chip ${amenSel.has(a) ? 'active' : ''}`} onClick={() => onAmenToggle(a)}>{a}</button>
            ))}
          </div>
        </div>
      )}
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
function DesktopFilters({ currentFilters, isFiltered, onApply, onReset, proyectoNames, brokerMode = false, areaMin, areaMax, onAreaMin, onAreaMax }: {
  currentFilters: FiltrosVentaSimple; isFiltered: boolean
  onApply: (f: FiltrosVentaSimple) => void; onReset: () => void; proyectoNames?: string[]
  brokerMode?: boolean
  areaMin?: number; areaMax?: number
  onAreaMin?: (v: number) => void; onAreaMax?: (v: number) => void
}) {
  const [minPrice, setMinPrice] = useState(currentFilters.precio_min || MIN_PRICE)
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_max || MAX_PRICE)
  // Dorms: leer currentFilters como los demás controles (antes arrancaba vacío →
  // el chip no se marcaba). El feed guarda "3+" como [3,4,5]; se colapsa a 3.
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(
    () => new Set((currentFilters.dormitorios_lista || []).map(d => (d >= 3 ? 3 : d)))
  )
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
        onToggleZona={toggleZona} onToggleDorm={toggleDorm} onEntrega={handleEntrega} onOrden={handleOrden} onProyecto={handleProyecto}
        brokerMode={brokerMode} areaMin={areaMin} areaMax={areaMax} onAreaMin={onAreaMin} onAreaMax={onAreaMax} />
      {isFiltered && <button className="vf-reset" onClick={onReset}>Quitar filtros</button>}
    </div>
  )
}

// ===== Fila de pills de filtros (layout split desktop) =====
// Presentación tipo referencia: [Venta] [Zonas ▾] [Precio ▾] [Dorms ▾] [Estado ▾]
// [Más filtros ▾] ... [Ordenar ▾]. MISMO motor que DesktopFilters (estado local
// inicializado de currentFilters al montar + autoApply con debounce + remount
// vía key={filterComponentVersion} cuando el filtro cambia desde afuera).
function FilterPillsVentas({ currentFilters, isFiltered, onApply, onReset, proyectoNames, amenSel, onAmenToggle, priceValues }: {
  currentFilters: FiltrosVentaSimple; isFiltered: boolean
  onApply: (f: FiltrosVentaSimple) => void; onReset: () => void; proyectoNames?: string[]
  amenSel: Set<string>; onAmenToggle: (a: string) => void
  priceValues?: number[]
}) {
  const [minPrice, setMinPrice] = useState(currentFilters.precio_min || MIN_PRICE)
  const [maxPrice, setMaxPrice] = useState(currentFilters.precio_max || MAX_PRICE)
  const [selectedDorms, setSelectedDorms] = useState<Set<number>>(
    () => new Set((currentFilters.dormitorios_lista || []).map(d => (d >= 3 ? 3 : d)))
  )
  const [selectedZonas, setSelectedZonas] = useState<Set<string>>(new Set(currentFilters.zonas_permitidas || []))
  const [entrega, setEntrega] = useState(currentFilters.estado_entrega || '')
  const [orden, setOrden] = useState<FiltrosVentaSimple['orden']>(currentFilters.orden || 'recientes')
  const [proyecto, setProyecto] = useState(currentFilters.proyecto || '')
  const [openPill, setOpenPill] = useState<null | 'zonas' | 'precio' | 'dorms' | 'estado' | 'amen' | 'mas' | 'edificio' | 'orden'>(null)
  // amenSel mezcla comodidades (edificio) y atributos (depto) en un solo Set;
  // cada pill cuenta solo lo suyo para su badge.
  const comodCount = [...amenSel].filter(a => !AMEN_ATRIBUTOS.includes(a)).length
  const atribCount = [...amenSel].filter(a => AMEN_ATRIBUTOS.includes(a)).length
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Click afuera cierra el popover abierto
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenPill(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

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

  // Labels dinámicos: la pill muestra lo aplicado, no un nombre genérico
  const zonasLabel = selectedZonas.size === 0 ? 'Todas las zonas' : (() => {
    const arr = ZONAS_CANONICAS.filter(z => selectedZonas.has(z.db)).map(z => z.labelCorto)
    return arr.length === 1 ? arr[0] : `${arr[0]} +${arr.length - 1}`
  })()
  const precioActivo = minPrice > MIN_PRICE || maxPrice < MAX_PRICE
  const precioLabel = precioActivo ? `${formatPriceK(minPrice)} – ${formatPriceK(maxPrice)}` : 'Precio'
  const dormsLabel = selectedDorms.size === 0 ? 'Dorms' : [...selectedDorms].sort((a, b) => a - b).map(d => d === 0 ? 'Mono' : d === 3 ? '3+' : `${d}d`).join(', ')
  const estadoLabel = entrega === 'entrega_inmediata' ? 'Inmediata' : entrega === 'solo_preventa' ? 'Preventa' : 'Estado'
  const ordenLabel = ORDEN_OPTIONS.find(o => o.value === orden)?.label || 'Recientes'
  const masActivo = proyecto.trim().length > 0

  const toggle = (p: typeof openPill) => setOpenPill(prev => prev === p ? null : p)
  const caret = <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>

  return (
    <div className="vfp" ref={wrapRef}>
      <span className="vfp-feed">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/></svg>
        Venta
      </span>
      <div className="vfp-item">
        <button type="button" className={`vfp-pill ${selectedZonas.size > 0 ? 'vfp-on' : ''} ${openPill === 'zonas' ? 'open' : ''}`} onClick={() => toggle('zonas')} aria-expanded={openPill === 'zonas'}>{zonasLabel} {caret}</button>
        {openPill === 'zonas' && (
          <div className="vfp-pop">
            <div className="vf-zona-btns">
              {ZONAS_CANONICAS.map(z => (
                <button key={z.db} className={`vf-zona-btn ${selectedZonas.has(z.db) ? 'active' : ''}`}
                  onClick={() => toggleZona(z.db)}>{z.labelCorto}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="vfp-item">
        <button type="button" className={`vfp-pill ${precioActivo ? 'vfp-on' : ''} ${openPill === 'precio' ? 'open' : ''}`} onClick={() => toggle('precio')} aria-expanded={openPill === 'precio'}>{precioLabel} {caret}</button>
        {openPill === 'precio' && (
          <div className="vfp-pop vfp-pop-precio">
            {priceValues && priceValues.length > 0 && (
              <PriceHistogram values={priceValues} min={MIN_PRICE} max={MAX_PRICE} selMin={minPrice} selMax={maxPrice} dark />
            )}
            <PriceInputsVT minPrice={minPrice} maxPrice={maxPrice} onMinPrice={handleMinPrice} onMaxPrice={handleMaxPrice} />
            <div className="vf-range-wrap">
              <input type="range" className="vf-slider vf-slider-min" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
                value={minPrice} aria-label="Precio mínimo" onChange={e => handleMinPrice(parseInt(e.target.value))} />
              <input type="range" className="vf-slider vf-slider-max" min={MIN_PRICE} max={MAX_PRICE} step={PRICE_STEP}
                value={maxPrice} aria-label="Precio máximo" onChange={e => handleMaxPrice(parseInt(e.target.value))} />
            </div>
            <TcNote />
          </div>
        )}
      </div>
      <div className="vfp-item">
        <button type="button" className={`vfp-pill ${selectedDorms.size > 0 ? 'vfp-on' : ''} ${openPill === 'dorms' ? 'open' : ''}`} onClick={() => toggle('dorms')} aria-expanded={openPill === 'dorms'}>{dormsLabel} {caret}</button>
        {openPill === 'dorms' && (
          <div className="vfp-pop">
            <div className="vf-btn-row">
              {[0, 1, 2, 3].map(d => (
                <button key={d} className={`vf-btn ${selectedDorms.has(d) ? 'active' : ''}`}
                  onClick={() => toggleDorm(d)}>{d === 0 ? 'Mono' : d === 3 ? '3+' : d}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="vfp-item">
        <button type="button" className={`vfp-pill ${entrega ? 'vfp-on' : ''} ${openPill === 'estado' ? 'open' : ''}`} onClick={() => toggle('estado')} aria-expanded={openPill === 'estado'}>{estadoLabel} {caret}</button>
        {openPill === 'estado' && (
          <div className="vfp-pop">
            <div className="vf-btn-row">
              {ENTREGA_OPTIONS.map(o => (
                <button key={o.value} className={`vf-btn ${entrega === o.value ? 'active' : ''}`}
                  onClick={() => handleEntrega(o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="vfp-item">
        <button type="button" className={`vfp-pill ${comodCount > 0 ? 'vfp-on' : ''} ${openPill === 'amen' ? 'open' : ''}`} onClick={() => toggle('amen')} aria-expanded={openPill === 'amen'}>{comodCount > 0 ? `Comodidades · ${comodCount}` : 'Comodidades'} {caret}</button>
        {openPill === 'amen' && (
          <div className="vfp-pop vfp-pop-amen">
            <div className="vf-label">DEL EDIFICIO</div>
            <div className="vfp-amen-wrap">
              {AMEN_DIFERENCIADORES.map(a => (
                <button key={a} type="button" className={`vfp-amen-chip ${amenSel.has(a) ? 'active' : ''}`} onClick={() => onAmenToggle(a)}>{a}</button>
              ))}
            </div>
            <div className="vfp-amen-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
              <span>Filtramos por lo que el anuncio <b>confirma</b>. Algún depto podría tenerla sin haberla listado.</span>
            </div>
          </div>
        )}
      </div>
      <div className="vfp-item">
        <button type="button" className={`vfp-pill ${atribCount > 0 ? 'vfp-on' : ''} ${openPill === 'mas' ? 'open' : ''}`} onClick={() => toggle('mas')} aria-expanded={openPill === 'mas'}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
          Más filtros{atribCount > 0 ? ` · ${atribCount}` : ''} {caret}
        </button>
        {openPill === 'mas' && (
          <div className="vfp-pop vfp-pop-amen">
            <div className="vf-label">ATRIBUTOS DEL DEPARTAMENTO</div>
            <div className="vfp-amen-wrap">
              {AMEN_ATRIBUTOS.map(a => (
                <button key={a} type="button" className={`vfp-amen-chip ${amenSel.has(a) ? 'active' : ''}`} onClick={() => onAmenToggle(a)}>{a}</button>
              ))}
            </div>
            <div className="vfp-amen-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
              <span>Filtramos por lo que el anuncio <b>confirma</b>. Algún depto podría tenerlo sin haberlo listado.</span>
            </div>
          </div>
        )}
      </div>
      <div className="vfp-item">
        <button type="button" className={`vfp-pill vfp-edificio ${masActivo ? 'vfp-on' : ''} ${openPill === 'edificio' ? 'open' : ''}`} onClick={() => toggle('edificio')} aria-expanded={openPill === 'edificio'}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>
          {masActivo ? proyecto : 'Buscar edificio'} {caret}
        </button>
        {openPill === 'edificio' && (
          <div className="vfp-pop vfp-pop-mas">
            <div className="vf-label">NOMBRE DEL EDIFICIO</div>
            <EdificioSelect value={proyecto} onChange={handleProyecto} options={proyectoNames || []} variant="dark" placeholder="Ej. Sky Eclipse, Condominio Maré..." autoFocus />
          </div>
        )}
      </div>
      {isFiltered && <button type="button" className="vfp-reset" onClick={onReset}>Quitar filtros</button>}
      <div className="vfp-item vfp-orden">
        <button type="button" className={`vfp-pill ${openPill === 'orden' ? 'open' : ''}`} onClick={() => toggle('orden')} aria-expanded={openPill === 'orden'}>
          <span className="vfp-orden-label">Ordenar por</span> {ordenLabel} {caret}
        </button>
        {openPill === 'orden' && (
          <div className="vfp-pop vfp-pop-right">
            <div className="vf-btn-row">
              {ORDEN_OPTIONS.map(o => (
                <button key={o.value} className={`vf-btn ${orden === o.value ? 'active' : ''}`}
                  onClick={() => { handleOrden(o.value); setOpenPill(null) }}>{o.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ===== Desktop VentaCard =====
// memo + handlers estables (referencian la prop, no closures del padre): al
// favoritar/filtrar solo re-renderizan las cards cuyos datos cambiaron.
const VentaCard = memo(function VentaCard({ property: p, isFavorite, onToggleFavorite, onShare, onPhotoTap, onDetails, isFirst, brokerMode, onAddToShortlist, publicShareMode = false, contactoDirecto = false, brokerInfo = null, publicShareBroker = null, priceSnapshot = null, brokerComment = null, isDestacada = false, onReport, isReported = false }: {
  property: UnidadVenta; isFavorite: boolean; isFirst?: boolean
  onToggleFavorite: (id: number) => void; onShare: (p: UnidadVenta) => void; onPhotoTap: (p: UnidadVenta, idx: number) => void; onDetails: (p: UnidadVenta) => void
  brokerMode?: boolean; onAddToShortlist?: (p: UnidadVenta) => void; publicShareMode?: boolean
  // contacto_directo (B2C, migración 256): en publicShare del bot, el CTA va al
  // captador (rama feed) en vez del broker dueño. Default false = B2B intacto.
  contactoDirecto?: boolean
  brokerInfo?: { nombre: string; inmobiliaria?: string | null } | null
  publicShareBroker?: { nombre: string; telefono: string } | null
  priceSnapshot?: { rawSnapshot: number | null; normSnapshot: number | null; rawActual: number | null } | null
  // Comentario del broker para esta propiedad (migración 228, render desde 239).
  // Render: bloque arena con borde-izq salvia debajo del bloque de precio.
  brokerComment?: string | null
  // Item marcado como "Recomendada" por el broker (migración 239). Máx 1 por shortlist.
  // Render venta: card con fondo arena (invierte tema) + chip ⭐ arriba-izquierda.
  isDestacada?: boolean
  // Reporte de datos broker (migración 240). onReport abre modal; isReported
  // marca visualmente (estado local de sesión, no persistido). Solo activos
  // cuando brokerMode && !publicShareMode.
  onReport?: (p: UnidadVenta) => void
  isReported?: boolean
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  // Lazy-load por slide: solo cargamos backgroundImage de las fotos cercanas al
  // photoIdx actual. Sin esto, 70+ cards × 8-10 fotos = ~700 imágenes saturando
  // mobile RAM/red al hacer scroll vertical (causa documentada del crash mobile).
  const [maxLoaded, setMaxLoaded] = useState(2)
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
  // Además precarga la siguiente foto (idx + 2) al scrollear (lazy-load).
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

  function navTo(idx: number) {
    const el = scrollRef.current
    if (!el) return
    setMaxLoaded(prev => Math.max(prev, idx + 2))
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' })
  }

  const amenities = p.amenities_confirmados || []
  const equipamiento = p.equipamiento_detectado || []

  // Carrusel scroll-snap solo en publicShareMode (3-7 cards típicamente).
  // En feed venta (70+ cards) el carrusel crashea mobile incluso con lazy-load
  // de imágenes — el problema parece ser la cantidad de DOM (70 × N slides).
  // Para hacerlo en feed se necesita virtualización de slides (solo renderizar
  // idx ± 2 divs, no todos). Queda parqueado.
  const useCarousel = publicShareMode

  return (
    <div className={`vc ${isDestacada ? 'vc-destacada' : ''}`} ref={cardRef}>
      {isDestacada && <div className="vc-destacada-chip">⭐ Recomendada por tu broker</div>}
      <div className={`vc-photo ${!hasPhotos ? 'vc-photo-nofoto' : ''}`} style={!useCarousel && hasPhotos && visible ? { backgroundImage: `url('${photos[photoIdx]}')`, cursor: 'pointer' } : undefined}
        onClick={!useCarousel ? () => { if (hasPhotos) onPhotoTap(p, photoIdx) } : undefined}>
        {useCarousel && (
          <div className="vc-photo-scroll" ref={scrollRef}>
            {hasPhotos ? photos.map((url, i) => {
              const shouldLoad = visible && i < maxLoaded
              return (
                <div key={i} className="vc-slide"
                  style={shouldLoad ? { backgroundImage: `url('${url}')` } : undefined}
                  onClick={() => onPhotoTap(p, i)} />
              )
            }) : (
              <div className="vc-slide vc-slide-empty"><div className="vc-nofoto">Sin fotos</div></div>
            )}
          </div>
        )}
        {!useCarousel && !hasPhotos && <div className="vc-nofoto">Sin fotos</div>}
        {p.tc_sospechoso && !publicShareMode && <div className="vc-tc-badge"><span className="vc-tc-badge-i">ⓘ</span>Confirmar tipo de cambio</div>}
        {brokerMode && !publicShareMode && (() => { const fb = fuenteBadge(p.fuente); return fb ? <div className="vc-fuente-badge" style={{ background: fb.bg, color: fb.color }}>{fb.label}</div> : null })()}
        {photos.length > 1 && (<>
          {photoIdx > 0 && <button className="vc-nav vc-nav-prev" aria-label="Foto anterior" onClick={e => { e.stopPropagation(); useCarousel ? navTo(photoIdx - 1) : setPhotoIdx(photoIdx - 1) }}><ChevronLeft /></button>}
          {photoIdx < photos.length - 1 && <button className="vc-nav vc-nav-next" aria-label="Foto siguiente" onClick={e => { e.stopPropagation(); useCarousel ? navTo(photoIdx + 1) : setPhotoIdx(photoIdx + 1) }}><ChevronRight /></button>}
          <div className="vc-photo-count">{photoIdx + 1}/{photos.length}</div>
        </>)}
      </div>
      <div className="vc-body">
        <div className="vc-name">{p.proyecto}{esNuevoCaptura(p) ? <span className="vc-nuevo">Nuevo</span> : esPublicacionReciente(p) && <span className="vc-reciente">Reciente</span>}</div>
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
        {publicShareMode && p.precio_m2 > 0 && (
          <ShortlistCardChip variant="venta" op="venta" dormitorios={p.dormitorios ?? 0} zonaDb={p.zona} precioComparable={p.precio_m2} />
        )}
        {brokerComment && publicShareMode && (
          <div className="vc-comentario">
            <div className="vc-comentario-quote">&ldquo;</div>
            <div className="vc-comentario-text">{brokerComment}</div>
            {brokerComment.length > 50 && (
              <button type="button" className="vc-comentario-more" onClick={() => onDetails(p)}>
                Leer comentario completo →
              </button>
            )}
          </div>
        )}
        <div className="vc-actions">
          <button className={`vc-act-btn vc-act-fav ${brokerMode ? 'vc-act-star' : ''} ${isFavorite ? 'active' : ''}`} aria-label={brokerMode ? (isFavorite ? 'Quitar de shortlist' : 'Agregar a shortlist') : 'Favorito'} onClick={() => onToggleFavorite(p.id)}>
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
          {!brokerMode && !publicShareMode && (
            <button className="vc-act-btn" aria-label="Compartir" onClick={() => onShare(p)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg> Compartir
            </button>
          )}
          {brokerMode && !publicShareMode && onReport && (
            <button
              className={`vc-act-btn vc-act-report ${isReported ? 'reported' : ''}`}
              aria-label={isReported ? 'Reportada' : 'Reportar dato incorrecto'}
              title={isReported ? 'Ya reportada — SICI revisando' : 'Reportar dato incorrecto'}
              onClick={() => onReport(p)}
            >
              {isReported ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Reportada
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  Reportar
                </>
              )}
            </button>
          )}
          <button className="vc-act-btn vc-act-detail" aria-label="Ver detalles" onClick={() => onDetails(p)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg> Ver mas
          </button>
          {publicShareMode && !contactoDirecto && publicShareBroker && (
            <a href={`https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(buildClientToBrokerMessage(p, publicShareBroker.nombre))}`}
              target="_blank" rel="noopener noreferrer" className="vc-act-btn vc-act-wsp"
              onClick={(e) => { e.preventDefault(); openWhatsApp(publicShareBroker.telefono, buildClientToBrokerMessage(p, publicShareBroker.nombre)) }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="#1EA952"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Consultar
            </a>
          )}
          {(!publicShareMode || contactoDirecto) && p.agente_telefono && (
            <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(buildAgentWaMessage(p, brokerInfo))}`}
              target="_blank" rel="noopener noreferrer" className="vc-act-btn vc-act-wsp"
              onClick={(e) => {
                e.preventDefault()
                trackEvent('click_whatsapp_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_usd), origen: contactoDirecto ? 'public_share_directo' : 'card_desktop' })
                openWhatsApp(p.agente_telefono!, buildAgentWaMessage(p, brokerInfo))
              }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="#1EA952"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Whatsapp
            </a>
          )}
        </div>
      </div>
    </div>
  )
})

// ===== Desktop lista densa: VentaListCard =====
// Card horizontal compacta para el layout desktop split (lista | mapa/side sheet).
// Mesa de decisión: más propiedades por pantalla, tap abre el side sheet.
// Lo transaccional (WA, compartir, ver original) vive en el sheet — acá solo corazón.
const VentaListCard = memo(function VentaListCard({ property: p, isFavorite, isActive, onToggleFavorite, onOpen, marketChip = null, onHover }: {
  property: UnidadVenta; isFavorite: boolean; isActive: boolean
  onToggleFavorite: (id: number) => void; onOpen: (p: UnidadVenta) => void
  // Posición fiduciaria vs rango típico de su tipología (null = sin base suficiente)
  marketChip?: { pos: 'bajo' | 'dentro' | 'sobre'; count: number } | null
  // Hover → ubica el pin en el mapa del panel (split desktop)
  onHover?: (id: number | null) => void
}) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const photos = p.fotos_urls?.length > 0 ? p.fotos_urls : []
  const hasPhotos = photos.length > 0
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const esPreventa = p.estado_construccion === 'preventa'
  const badgeNuevo = esNuevoCaptura(p)
  const badgeReciente = !badgeNuevo && esPublicacionReciente(p)
  // Prod (sin señal de captura) conserva el badge histórico "Nueva"; shadow separa
  // "Nuevo" (capturado) de "Reciente" (publicado).
  const badgeRecienteLabel = p.dias_desde_captura != null ? 'Reciente' : 'Nueva'
  // Inclusiones (icono + label muteado, solo si están). Amoblado gana sobre Equipado.
  const equipList = p.equipamiento_detectado || []
  const amoblado = equipList.some(e => /amoblad/i.test(e))
  const equipado = amoblado || equipList.length > 0
  const conParqueo = p.parqueo_incluido === true || (p.estacionamientos != null && p.estacionamientos > 0)
  const conBaulera = p.baulera === true
  const hayIncl = equipado || conParqueo || conBaulera
  return (
    <div className={`vlc ${isActive ? 'vlc-active' : ''}`} ref={cardRef} onClick={() => onOpen(p)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p) }}
      onMouseEnter={() => onHover?.(p.id)} onMouseLeave={() => onHover?.(null)}>
      <div className="vlc-photo" style={hasPhotos && visible ? { backgroundImage: `url('${photos[photoIdx]}')` } : undefined}>
        {badgeNuevo && <span className="vlc-nueva">Nuevo</span>}
        {badgeReciente && <span className="vlc-nueva vlc-reciente-badge">{badgeRecienteLabel}</span>}
        {!hasPhotos && <div className="vlc-nofoto">Sin fotos</div>}
        {photos.length > 1 && (<>
          {photoIdx > 0 && <button className="vlc-nav vlc-nav-prev" aria-label="Foto anterior" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx - 1) }}><ChevronLeft /></button>}
          {photoIdx < photos.length - 1 && <button className="vlc-nav vlc-nav-next" aria-label="Foto siguiente" onClick={e => { e.stopPropagation(); setPhotoIdx(photoIdx + 1) }}><ChevronRight /></button>}
          <div className="vlc-count">{photoIdx + 1}/{photos.length}</div>
        </>)}
      </div>
      <div className="vlc-body">
        {/* Precio héroe + favorito */}
        <div className="vlc-toprow">
          <div className="vlc-priceblock">
            <div className="vlc-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')}</div>
            <div className="vlc-pricesub">{p.precio_m2 > 0 ? `$us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m² · ` : ''}T.C. oficial</div>
          </div>
          <button className={`vlc-fav ${isFavorite ? 'active' : ''}`} aria-label="Favorito" onClick={e => { e.stopPropagation(); onToggleFavorite(p.id) }}>
            <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : 'currentColor'} strokeWidth="1.5" style={{ width: 19, height: 19 }}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        </div>
        {/* Specs core (iconos) */}
        <div className="vlc-specs">
          {p.dormitorios !== null && <span className="vlc-spec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v3"/></svg>{p.dormitorios === 0 ? 'Mono' : p.dormitorios}</span>}
          {p.area_m2 > 0 && <span className="vlc-spec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M3 14h7v7H3z"/><path d="M14 14h7v7h-7z"/></svg>{Math.round(p.area_m2)} m²</span>}
          {p.banos !== null && <span className="vlc-spec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h3v2.25"/></svg>{p.banos}</span>}
          {p.piso != null && <span className="vlc-spec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/></svg>{p.piso === 0 ? 'PB' : `P${p.piso}`}</span>}
        </div>
        {/* Inclusiones muteadas (solo si están) */}
        {hayIncl && (
          <div className="vlc-incl">
            {equipado && <span className="vlc-incl-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 11V7a2 2 0 012-2h12a2 2 0 012 2v4"/><path d="M2 13a2 2 0 012-2h16a2 2 0 012 2v4H2z"/><path d="M4 17v2M20 17v2"/></svg>{amoblado ? 'Amoblado' : 'Equipado'}</span>}
            {conParqueo && <span className="vlc-incl-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 002 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>Parqueo</span>}
            {conBaulera && <span className="vlc-incl-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>Baulera</span>}
          </div>
        )}
        {/* Nombre · zona · #id chiquito */}
        <div className="vlc-name">{p.proyecto} <span className="vlc-zona">· {displayZona(p.zona)} · <span className="vlc-id">#{p.id}</span></span></div>
        {/* Señales de decisión: estado (Preventa destacada) + fiduciario */}
        <div className="vlc-signals">
          {esPreventa
            ? <span className="vlc-estado-pre"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>{p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa'}</span>
            : <span className="vlc-estado">Entrega inmediata</span>}
          {marketChip && (
            <span className={`vlc-mkt2 ${marketChip.pos === 'sobre' ? 'vlc-mkt2-sobre' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-5"/></svg>
              {marketChip.pos === 'bajo' ? 'Más barato que similares' : marketChip.pos === 'sobre' ? 'Más caro que similares' : 'En línea con similares'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})

// ===== Mobile TikTok VentaCard (55% foto / 45% contenido) =====
// memo + handlers estables — mismo patrón que VentaCard desktop.
const MobileVentaCard = memo(function MobileVentaCard({ property: p, isFavorite, onToggleFavorite, onShare, onPhotoTap, onDetails, onMap, isSpotlight, isFirst, showSwipeHint = false, brokerMode, onAddToShortlist, publicShareMode = false, contactoDirecto = false, brokerInfo = null, publicShareBroker = null, priceSnapshot = null, brokerComment = null, isDestacada = false, onReport, isReported = false, marketChip = null }: {
  property: UnidadVenta; isFavorite: boolean; isSpotlight?: boolean; isFirst?: boolean
  onMap?: (p: UnidadVenta) => void
  // Hint "Desliza para más fotos" — se pasa true en las primeras posiciones del
  // feed; la card lo muestra solo si además tiene más de 1 foto.
  showSwipeHint?: boolean
  onToggleFavorite: (id: number) => void; onShare: (p: UnidadVenta) => void; onPhotoTap: (p: UnidadVenta, idx: number) => void; onDetails: (p: UnidadVenta) => void
  brokerMode?: boolean; onAddToShortlist?: (p: UnidadVenta) => void; publicShareMode?: boolean
  // contacto_directo (B2C, migración 256): ver VentaCard. Default false = B2B intacto.
  contactoDirecto?: boolean
  brokerInfo?: { nombre: string; inmobiliaria?: string | null } | null
  publicShareBroker?: { nombre: string; telefono: string } | null
  priceSnapshot?: { rawSnapshot: number | null; normSnapshot: number | null; rawActual: number | null } | null
  brokerComment?: string | null
  isDestacada?: boolean
  onReport?: (p: UnidadVenta) => void
  isReported?: boolean
  // Chip fiduciario "vs. similares" (mismo dato que VentaListCard). null = sin base ≥6.
  marketChip?: { pos: 'bajo' | 'dentro' | 'sobre'; count: number } | null
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
    <div className={`mc ${isDestacada ? 'mc-destacada' : ''}`}>
      {isDestacada && <div className="mc-destacada-chip">⭐ Recomendada por tu broker</div>}
      {/* Photo carousel zone (55%) */}
      <div className="mc-photo-zone" ref={zoneRef}>
        <div className="mc-photo-scroll" ref={scrollRef}>
          {photos.length > 0 ? photos.map((url, i) => {
            const shouldLoad = i < maxLoaded
            return (
            <div key={i} className="mc-slide" style={shouldLoad && url ? { backgroundImage: `url('${url}')`, cursor: 'pointer' } : { cursor: 'pointer' }}
              onClick={() => onPhotoTap(p, i)}>
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
        {/* Hint de swipe — primeras cards con galería, se desvanece solo (paridad con alquileres) */}
        {showSwipeHint && photos.length > 1 && (
          <div className="mc-swipe-hint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:20,height:20}}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Desliza para mas fotos
          </div>
        )}
        {/* Favorito DENTRO de la foto (rediseño tanda 2). El resto de acciones vive
            en el bottom sheet: la card es para mirar y guardar. */}
        <button className={`mc-heart ${isFavorite ? 'active' : ''}`} aria-label={isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'} onClick={(e) => { e.stopPropagation(); onToggleFavorite(p.id) }}>
          <svg viewBox="0 0 24 24" fill={isFavorite ? '#3A6A48' : 'rgba(20,20,20,0.35)'} stroke={isFavorite ? '#3A6A48' : '#EDE8DC'} strokeWidth="1.6" style={{ width: 22, height: 22 }}>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
      </div>

      {/* Spotlight badge */}
      {isSpotlight && <div className="mc-spotlight">Te compartieron este depto</div>}

      {/* Content zone (45%) — tocar abre el detalle (bottom sheet) */}
      <div className="mc-content" role="button" tabIndex={0} onClick={() => onDetails(p)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDetails(p) } }}>
        <div className="mc-name">{p.proyecto}</div>
        <div className="mc-meta-row">
          {esNuevoCaptura(p) ? <span className="mc-nuevo">Nuevo</span> : esPublicacionReciente(p) && <span className="mc-reciente">Reciente</span>}
          <span className="mc-zona">{displayZona(p.zona)} <span className="mc-id">#{p.id}</span></span>
        </div>
        <div className="mc-price-block">
          <div className="mc-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')} <span className="mc-tc">(T.C. oficial)</span></div>
          {(() => { const b = priceChangeBadge(priceSnapshot, p.precio_usd); return b ? <div className={`mc-price-change mc-price-change-${b.kind}`}>{b.label}</div> : null })()}
          <div className="mc-specs">
            {p.dormitorios !== null && <span className="mc-sp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 12V7a1 1 0 011-1h16a1 1 0 011 1v5M3 12h18M3 12v6M21 12v6M6 12V9h5v3"/></svg>{p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`}</span>}
            {p.area_m2 > 0 && <span className="mc-sp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>{Math.round(p.area_m2)} m²</span>}
            {p.banos !== null && <span className="mc-sp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 12V6a2 2 0 012-2 2 2 0 012 2M4 12h17v2a4 4 0 01-4 4H8a4 4 0 01-4-4zM6 18v2M18 18v2"/></svg>{p.banos} baño{p.banos !== 1 ? 's' : ''}</span>}
            {p.piso && <span className="mc-sp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="14.5" cy="12" r="1"/></svg>Piso {p.piso}</span>}
          </div>
        </div>
        <div className="mc-specs-2">{[
          p.precio_m2 > 0 ? `$us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m²` : null,
          p.estado_construccion === 'preventa'
            ? (p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa')
            : 'Entrega inmediata',
          p.parqueo_incluido ? 'Parqueo incl.' : null,
          p.baulera_incluido ? 'Baulera incl.' : null,
                  ].filter(Boolean).join('  ·  ')}</div>
        {marketChip && (
          <div className="mc-fidrow"><span className={`mc-fid ${marketChip.pos === 'sobre' ? 'mc-fid-sobre' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18"/><rect x="5" y="12" width="3" height="6"/><rect x="10.5" y="8" width="3" height="10"/><rect x="16" y="4" width="3" height="14"/></svg>
            {marketChip.pos === 'bajo' ? 'Más barato que similares' : marketChip.pos === 'sobre' ? 'Más caro que similares' : 'En línea con similares'}
          </span></div>
        )}
      </div>
    </div>
  )
})

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
function FilterOverlay({ isOpen, onClose, totalCount, filteredCount, isFiltered, onApply, onReset, proyectoNames, brokerMode = false, areaMin, areaMax, onAreaMin, onAreaMax, amenSel, onAmenToggle, priceValues }: {
  isOpen: boolean; onClose: () => void
  totalCount: number; filteredCount: number; isFiltered: boolean
  onApply: (f: FiltrosVentaSimple) => void; onReset: () => void; proyectoNames?: string[]
  brokerMode?: boolean
  areaMin?: number; areaMax?: number
  onAreaMin?: (v: number) => void; onAreaMax?: (v: number) => void
  amenSel?: Set<string>; onAmenToggle?: (a: string) => void
  priceValues?: number[]
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

  // --- Búsqueda en lenguaje natural (lib/busqueda-natural, $0 sin IA) ---
  // Pre-llena los controles del overlay: la interpretación queda VISIBLE en
  // los propios filtros y el usuario corrige tocando. El preview count ya
  // reacciona solo a los cambios de estado.
  const [busqueda, setBusqueda] = useState('')
  const [busquedaChips, setBusquedaChips] = useState<string[]>([])
  const [avisoAlquiler, setAvisoAlquiler] = useState(false)
  const [avisoMonedaBs, setAvisoMonedaBs] = useState(false)
  function handleBusqueda(texto: string) {
    setBusqueda(texto)
    // El guard isFirstRender existe para no fetchear al abrir el overlay, pero
    // se tragaría el primer batch de cambios de la búsqueda → lo consumimos acá
    // para que el contador del botón reaccione desde el primer parseo.
    isFirstRender.current = false
    const sig = parsearBusqueda(texto)
    setBusquedaChips(sig.chips)
    setAvisoAlquiler(sig.operacion === 'alquiler')
    // Precio: en ventas los montos son USD; si el user escribió "bs", avisar
    // en vez de adivinar el tipo de cambio.
    const monedaOk = sig.moneda !== 'bob'
    setAvisoMonedaBs(!monedaOk && (sig.precioMax !== null || sig.precioMin !== null))
    // Mientras se usa la barra, la barra MANDA: cada parseo parte de filtros
    // limpios (sin acumular señales de textos anteriores). Los chips muestran
    // exactamente lo aplicado; lo no detectado vuelve a default.
    setSelectedDorms(new Set(sig.dormitorios))
    setMaxPrice(monedaOk && sig.precioMax !== null ? Math.max(MIN_PRICE + PRICE_STEP, Math.min(sig.precioMax, MAX_PRICE)) : MAX_PRICE)
    setMinPrice(monedaOk && sig.precioMin !== null ? Math.max(MIN_PRICE, Math.min(sig.precioMin, MAX_PRICE - PRICE_STEP)) : MIN_PRICE)
    const dbs = sig.zonas.map(slug => ZONAS_CANONICAS.find(z => z.slug === slug)?.db).filter(Boolean) as string[]
    setSelectedZonas(new Set(dbs))
    setEntrega(sig.entrega ?? '')
  }

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
        <span className="fo-logo" aria-hidden="true" />
        <span className="fo-hcount">{displayCount} resultados</span>
        <button className="fo-close" aria-label="Cerrar filtros" onClick={onClose}>&times;</button>
      </div>
      <div className="fo-body">
        {/* El buscador natural ahora vive en el header del feed; el overlay
            queda para refinar a mano. */}
        <FilterControls minPrice={minPrice} maxPrice={maxPrice} selectedDorms={selectedDorms} selectedZonas={selectedZonas}
          entrega={entrega} orden={orden} proyecto={proyecto} proyectoNames={proyectoNames} onMinPrice={handleMinPrice} onMaxPrice={handleMaxPrice}
          onToggleZona={toggleZona} onToggleDorm={toggleDorm} onEntrega={v => setEntrega(v)} onOrden={v => setOrden(v)} onProyecto={v => setProyecto(v)}
          brokerMode={brokerMode} areaMin={areaMin} areaMax={areaMax} onAreaMin={onAreaMin} onAreaMax={onAreaMax}
          amenSel={amenSel} onAmenToggle={onAmenToggle} priceValues={priceValues} />
      </div>
      <div className="fo-footer">
        <button className="fo-reset" onClick={handleReset}>Limpiar filtros</button>
        <button className="fo-apply" onClick={handleApply}>Ver resultados</button>
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
        trackEvent('swipe_photos', { property_id: propertyId, photo_index: idx, total_photos: total, origen: 'bottom_sheet' })
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
// sideMode: render embebido como SIDE SHEET desktop (panel derecho del layout
// split) — sin overlay, sin position:fixed, scroll interno y tabs
// Resumen | Mercado | Compra | Similares. Mobile sigue siendo bottom sheet.
function BottomSheet({ property: p, isOpen, onClose, onShare, onCompare, isFavorite, onToggleFavorite, gateCompleted, onGate, isDesktop, properties, onSwapProperty, brokerMode = false, onAddToShortlist, publicShareBroker = null, contactoDirecto = false, brokerInfo = null, brokerComment = null, sideMode = false }: {
  property: UnidadVenta | null; isOpen: boolean; onClose: () => void; onShare?: () => void
  // onCompare: agrega esta propiedad a favoritos y abre el comparador (modal desktop)
  onCompare?: () => void
  isFavorite?: boolean; onToggleFavorite?: () => void
  gateCompleted: boolean; onGate: (n: string, t: string, c: string, url: string) => void; isDesktop: boolean
  properties?: UnidadVenta[]; onSwapProperty?: (p: UnidadVenta) => void
  brokerMode?: boolean; onAddToShortlist?: (p: UnidadVenta) => void
  publicShareBroker?: { nombre: string; telefono: string } | null
  // contacto_directo (B2C, migración 256): publicShareMode se deriva localmente
  // de publicShareBroker (L1109), así que este prop entra aparte. Cuando es true,
  // el sheet vuelve al "modo feed" (agente, similares, preguntas, ver-original y
  // CTA al captador). Default false = B2B intacto.
  contactoDirecto?: boolean
  // Datos del broker activo (cuando brokerMode=true). Se usa para personalizar
  // el mensaje WA broker→broker (identificación + franquicia + link del anuncio).
  brokerInfo?: { nombre: string; inmobiliaria?: string | null } | null
  // Comentario completo del broker — se renderiza arriba del detalle, sin clamp.
  brokerComment?: string | null
  sideMode?: boolean
}) {
  const publicShareMode = publicShareBroker !== null
  // richLayout = las secciones "ricas" del modal desktop se muestran también en
  // el sheet mobile del feed público (P3b). sideMode = desktop-split; el mobile
  // público (no broker, no publicShare) también las recibe, tematizadas oscuro.
  // Broker/publicShare (mobile o desktop-no-split) conservan las secciones viejas.
  // publicShare mobile (shortlist /b/[hash]) también usa el layout rico: mismo
  // sheet que el feed (lo que la hace especial · En el departamento · orden).
  const richLayout = sideMode || (!isDesktop && !brokerMode)
  // Shortlist (/b/[hash]): el mercado se compara contra el MERCADO real (cohort
  // por zona+dorms de /api/shortlist-market), NO contra `properties` (que es la
  // lista curada). Se arma el mismo objeto que el feed y se renderiza la sección
  // nativa "Cómo está el precio".
  const [slMarket, setSlMarket] = useState<null | { mediana: number; rangoLow: number; rangoHigh: number; totalLow: number; totalHigh: number; count: number; ampliado: boolean; mixto: boolean; segmento: string | null }>(null)
  useEffect(() => {
    if (!publicShareMode || !p) { setSlMarket(null); return }
    let cancel = false
    // El endpoint lee el cohort shadow-first (misma base que la propiedad).
    const qs = `op=venta&dorms=${p.dormitorios ?? 0}&zona=${encodeURIComponent(p.zona || '')}`
    fetch(`/api/shortlist-market?${qs}`)
      .then(r => r.json())
      .then(res => {
        const d = res?.data
        if (cancel || !d || !d.enough) { if (!cancel) setSlMarket(null); return }
        setSlMarket({ mediana: d.mediana, rangoLow: d.p25, rangoHigh: d.p75, totalLow: d.secP25, totalHigh: d.secP75, count: d.count, ampliado: d.ampliado, mixto: false, segmento: null })
      })
      .catch(() => { if (!cancel) setSlMarket(null) })
    return () => { cancel = true }
  }, [publicShareMode, p?.id, p?.dormitorios, p?.zona])
  const [gateName, setGateName] = useState('')
  const [gateTel, setGateTel] = useState('')
  const [gateEmail, setGateEmail] = useState('')
  const [showGate, setShowGate] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [selectedQs, setSelectedQs] = useState<Set<number>>(new Set())
  const [showViewer, setShowViewer] = useState(false)
  const MAX_QS = 3
  // Desktop (sideMode) = modal estilo Zillow: un solo scroll con todas las
  // secciones en orden, sin tabs. Mobile ya era un solo scroll — showTab()
  // queda como marcador de sección por si se reintroducen cortes.
  const showTab = (_t: 'resumen' | 'mercado' | 'compra' | 'similares') => true
  // Riel derecho del modal: el mapa necesita identidades ESTABLES —
  // VentaMap reconstruye el mapa entero si cambia properties/onSelect.
  const railMapProps = useMemo(() => (p ? [p] : []), [p])
  const railMapNoop = useCallback(() => {}, [])

  // Reset state when property changes
  const propId = p?.id
  useEffect(() => {
    setDescExpanded(false)
    setShowGate(false)
    setSelectedQs(new Set())
    setShowViewer(false)
  }, [propId])

  const similarProps = useMemo(() => {
    if (!p || !properties || properties.length === 0) return []
    return properties
      .filter(q => q.zona === p.zona && q.dormitorios === p.dormitorios && q.id !== p.id && q.fotos_urls?.length > 0)
      .sort((a, b) => Math.abs(a.precio_usd - p.precio_usd) - Math.abs(b.precio_usd - p.precio_usd))
      .slice(0, 4)
  }, [p?.id, p?.zona, p?.dormitorios, p?.precio_usd, properties])

  // --- Contexto de mercado: $/m² para esta tipología ---
  // Formato fiduciario prudente: SIN veredicto ("X% sobre mediana") — solo
  // mediana, rango típico (p25-p75) y la posición visual de este depto en una
  // barra. El precio depende de acabados/desarrollador (caveat en el render).
  // Cascada: zona (≥5 comparables) → todo Equipetrol DECLARADO como "zona
  // ampliada" (≥5) → null (el render muestra una línea de "sin comparables").
  const marketDataMemo = useMemo(() => {
    if (!p || !p.precio_m2 || p.precio_m2 <= 0 || !properties || properties.length === 0) return null
    const pctl = (sorted: number[], pct: number) => {
      const idx = (sorted.length - 1) * pct
      const lo = Math.floor(idx), hi = Math.ceil(idx)
      return lo === hi ? sorted[lo] : Math.round(sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo))
    }
    const mismaTipologia = (q: UnidadVenta) => q.dormitorios === p.dormitorios && q.id !== p.id && q.precio_m2 > 0
    const build = (pool: UnidadVenta[], ampliado: boolean, mixto: boolean, segmento: string | null) => {
      if (pool.length < 5) return null
      const values = pool.map(q => q.precio_m2).sort((a, b) => a - b)
      // Rango TOTAL (precio_usd) además del $/m², para el comparador que muestra
      // ambos (total + por m²) por fila. precio_usd viene normalizado del RPC.
      const totals = pool.map(q => q.precio_usd).sort((a, b) => a - b)
      return {
        mediana: pctl(values, 0.5),
        rangoLow: pctl(values, 0.25),
        rangoHigh: pctl(values, 0.75),
        totalLow: pctl(totals, 0.25),
        totalHigh: pctl(totals, 0.75),
        count: pool.length,
        ampliado,
        mixto,
        segmento,
      }
    }
    // Segmentación por estado (preventa vs entrega inmediata cotizan distinto):
    // peras con peras cuando el dato existe; si no alcanza o la prop no tiene
    // el dato, canasta mixta DECLARADA en el caveat.
    const enZona = (q: UnidadVenta) => q.zona === p.zona
    const seg = p.estado_construccion === 'preventa' || p.estado_construccion === 'entrega_inmediata'
      ? p.estado_construccion : null
    const mismoSeg = (q: UnidadVenta) => q.estado_construccion === seg
    const segLabel = seg === 'preventa' ? 'preventa' : 'entrega inmediata'
    return (seg
      ? (build(properties.filter(q => enZona(q) && mismaTipologia(q) && mismoSeg(q)), false, false, segLabel)
        ?? build(properties.filter(q => mismaTipologia(q) && mismoSeg(q)), true, false, segLabel))
      : null)
      ?? build(properties.filter(q => enZona(q) && mismaTipologia(q)), false, true, null)
      ?? build(properties.filter(mismaTipologia), true, true, null)
  }, [p?.id, p?.zona, p?.dormitorios, p?.precio_m2, p?.estado_construccion, properties])
  // En la shortlist (publicShare) el mercado sale del cohort real (slMarket), no
  // de la lista. En el feed, del cálculo local sobre `properties`.
  const marketData = publicShareMode ? slMarket : marketDataMemo

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

  // Bloques que en el modal desktop viven en el RIEL derecho y en mobile
  // dentro del flujo — extraídos a consts para no duplicar JSX.
  // Contexto de mercado: solo feed público/broker (en publicShare `properties`
  // es la shortlist, no el mercado — cálculo inválido). La ausencia se explica
  // (transparencia fiduciaria), no se disimula.
  // Estado del precio vs. rango típico (lenguaje llano, sin veredictos)
  const mktStatus = marketData ? (
    p.precio_m2 < marketData.rangoLow
      ? { txt: 'Más barato que deptos similares', path: 'M3 7l6 6 4-4 8 8M21 17v-4M21 17h-4' }
      : p.precio_m2 > marketData.rangoHigh
        ? { txt: 'Más caro que deptos similares', path: 'M3 17l6-6 4 4 8-8M21 7v4M21 7h-4' }
        : { txt: 'En línea con deptos similares', path: 'M5 12l4 4L19 7' }
  ) : null
  const dormTxt = p.dormitorios === 0 ? 'monoambientes' : `${p.dormitorios} dormitorio${p.dormitorios !== 1 ? 's' : ''}`
  const dormShort = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`

  // richLayout (desktop-split + mobile público) = mercado v2 con medidor;
  // broker/publicShare = la versión mktv anterior.
  const mercadoSection = (marketData ? (richLayout ? (
    <div className="bs-section" id="bsm-sec-mercado">
      <div className="bs-sl"><span className="bs-sl-dot" />Cómo está el precio · {marketData.ampliado ? 'Equipetrol (zona ampliada)' : displayZona(p.zona)}</div>
      <div className="bs-mkt2">
        <div className="bs-mkt2-verdict">
          <span className="bs-mkt2-vico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={mktStatus!.path} /></svg></span>
          <div>
            <div className="bs-mkt2-vtitle">{mktStatus!.txt}</div>
            <div className="bs-mkt2-vsub">para departamentos de {dormTxt} en la zona</div>
          </div>
        </div>
        {(() => {
          const lo = Math.min(marketData.rangoLow, p.precio_m2) * 0.94
          const hi = Math.max(marketData.rangoHigh, p.precio_m2) * 1.06
          const pos = (v: number) => Math.min(97, Math.max(3, ((v - lo) / (hi - lo)) * 100))
          const bl = pos(marketData.rangoLow), bh = pos(marketData.rangoHigh), me = pos(p.precio_m2)
          return (
            <div className="bs-mkt2-gauge">
              <div className="bs-mkt2-ends"><span>más accesible</span><span>más premium</span></div>
              <div className="bs-mkt2-track">
                <div className="bs-mkt2-band" style={{ left: `${bl}%`, width: `${bh - bl}%` }} />
                <div className="bs-mkt2-pin" style={{ left: `${me}%` }}>
                  <svg viewBox="0 0 32 42" width="15" height="20"><path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26C32 7.2 24.8 0 16 0z" fill="currentColor" /><circle cx="16" cy="16" r="5.5" fill="#FBFAF7" /></svg>
                </div>
                <div className="bs-mkt2-here" style={{ left: `${me}%` }}>Este depto</div>
                <div className="bs-mkt2-tick" style={{ left: `${bl}%` }}>$us {marketData.rangoLow.toLocaleString('en-US')}</div>
                <div className="bs-mkt2-tick" style={{ left: `${bh}%` }}>$us {marketData.rangoHigh.toLocaleString('en-US')}</div>
              </div>
            </div>
          )
        })()}
        <div className="bs-mkt2-compare">
          <div className="bs-mkt2-crow">
            <span>Este departamento</span>
            <div className="bs-mkt2-cval"><b>$us {Math.round(p.precio_usd).toLocaleString('en-US')}</b><em>$us {Math.round(p.precio_m2).toLocaleString('en-US')}/m²</em></div>
          </div>
          <div className="bs-mkt2-crow">
            <span>Deptos similares ({dormShort})</span>
            <div className="bs-mkt2-cval"><b>$us {marketData.totalLow.toLocaleString('en-US')} – {marketData.totalHigh.toLocaleString('en-US')}</b><em>$us {marketData.rangoLow.toLocaleString('en-US')} – {marketData.rangoHigh.toLocaleString('en-US')}/m²</em></div>
          </div>
        </div>
        <div className="bs-mkt2-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
          <span>Comparamos el precio <b>total y por m²</b>. El precio por m² permite comparar aunque cambie el tamaño del depto. {marketData.ampliado ? `Pocos anuncios de esta tipología en ${displayZona(p.zona)} — comparado con todo Equipetrol. ` : ''}{marketData.mixto ? 'Incluye preventa y entrega inmediata. ' : ''}Basado en {marketData.count} deptos similares en venta.</span>
        </div>
        <div className="bs-mktv-summary">
          {p.dias_en_mercado !== null && (
            <div className="bs-mktv-sitem"><b>{p.dias_en_mercado} día{p.dias_en_mercado !== 1 ? 's' : ''}</b><span>publicado</span></div>
          )}
          <div className="bs-mktv-sitem"><b>{p.estado_construccion === 'preventa' ? (p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa') : 'Entrega inmediata'}</b><span>estado</span></div>
        </div>
      </div>
    </div>
  ) : (
    <div className="bs-section" id="bsm-sec-mercado">
      <div className="bs-sl"><span className="bs-sl-dot" />Contexto de mercado · {marketData.ampliado ? 'Equipetrol (zona ampliada)' : displayZona(p.zona)}</div>
      <div className="bs-mktv">
        <div className="bs-mktv-this">
          <span className="bs-mktv-label">{sideMode ? 'Precio de este departamento' : 'Este depto'}</span>
          <span className="bs-mktv-value">{p.precio_usd > 0 ? `$us ${Math.round(p.precio_usd).toLocaleString('en-US')} · ` : ''}$us {Math.round(p.precio_m2).toLocaleString('en-US')}/m²</span>
          <span className="bs-mktv-status">{p.precio_m2 < marketData.rangoLow ? 'Más barato que similares' : p.precio_m2 > marketData.rangoHigh ? 'Más caro que similares' : 'En línea con similares'}</span>
        </div>
        <div className="bs-mktv-zona">
          Zona ({p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`}{marketData.segmento ? ` · ${marketData.segmento}` : ''}): mediana <b>$us {marketData.mediana.toLocaleString('en-US')}/m²</b>
          <span className="bs-mktv-rango">Rango típico $us {marketData.rangoLow.toLocaleString('en-US')} — {marketData.rangoHigh.toLocaleString('en-US')}/m²</span>
        </div>
        {(() => {
          const lo = Math.min(marketData.rangoLow, p.precio_m2) * 0.94
          const hi = Math.max(marketData.rangoHigh, p.precio_m2) * 1.06
          const pos = (v: number) => Math.min(98, Math.max(2, ((v - lo) / (hi - lo)) * 100))
          return (
            <div className="bs-mktv-bar-wrap">
              <div className="bs-mktv-bar">
                <div className="bs-mktv-band" style={{ left: `${pos(marketData.rangoLow)}%`, width: `${pos(marketData.rangoHigh) - pos(marketData.rangoLow)}%` }} />
                <div className="bs-mktv-marker" style={{ left: `${pos(p.precio_m2)}%` }} />
              </div>
              <div className="bs-mktv-scale">
                <span style={{ left: `${pos(marketData.rangoLow)}%` }}>{marketData.rangoLow.toLocaleString('en-US')}</span>
                <span style={{ left: `${pos(marketData.rangoHigh)}%` }}>{marketData.rangoHigh.toLocaleString('en-US')}</span>
              </div>
            </div>
          )
        })()}
        <div className="bs-mktv-caveat">{marketData.ampliado ? `Pocos anuncios de esta tipología en ${displayZona(p.zona)} — comparado con todo Equipetrol. ` : ''}{marketData.mixto ? 'Incluye preventa y entrega inmediata. ' : ''}Basado en {marketData.count} deptos comparables activos. El precio por m² varía según acabados, amenidades y desarrollador.</div>
        {/* Resumen días en el mercado + estado — solo modal desktop */}
        {sideMode && (
          <div className="bs-mktv-summary">
            {p.dias_en_mercado !== null && (
              <div className="bs-mktv-sitem"><b>{p.dias_en_mercado} día{p.dias_en_mercado !== 1 ? 's' : ''}</b><span>en el mercado</span></div>
            )}
            <div className="bs-mktv-sitem"><b>{p.estado_construccion === 'preventa' ? (p.fecha_entrega ? `Preventa · ${formatFechaEntrega(p.fecha_entrega)}` : 'Preventa') : 'Entrega inmediata'}</b><span>estado</span></div>
          </div>
        )}
      </div>
    </div>
  )) : (p.precio_m2 > 0 ? (
    <div className="bs-section">
      <div className="bs-mktv-empty">Sin suficientes deptos comparables activos para mostrar contexto de mercado.</div>
    </div>
  ) : null))

  // Similares: oculto en publicShareMode (cliente solo ve lo curado); en
  // contactoDirecto (B2C) se muestran, igual que el feed (§6 dec.1)
  const similaresSection = (!publicShareMode || contactoDirecto) && similarProps.length > 0 ? (
    <div className="bs-section" id="bsm-sec-similares">
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
  ) : null

  // Stats con iconos + chips de inclusión. Van en distinto lugar según el layout:
  //  · modal desktop → DENTRO del header (grid de 2 columnas, al lado del precio)
  //  · mobile rico    → sección propia DEBAJO de la foto, igual que alquileres
  //                     (orden: nombre/precio/detalles → foto → iconos grandes)
  const statsAndChips = !richLayout ? null : (
    <>
      {(
        <div className="bsm-stats">
          {p.dormitorios !== null && (
            <div className="bsm-stat">
              <svg className="bsm-stat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v3"/></svg>
              <div className="bsm-stat-txt"><b>{p.dormitorios === 0 ? 'Mono' : p.dormitorios}</b><span>{p.dormitorios === 0 ? 'ambiente' : 'dorm'}</span></div>
            </div>
          )}
          {p.area_m2 > 0 && (
            <div className="bsm-stat">
              <svg className="bsm-stat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M3 14h7v7H3z"/><path d="M14 14h7v7h-7z"/></svg>
              <div className="bsm-stat-txt"><b>{Math.round(p.area_m2)}</b><span>m²</span></div>
            </div>
          )}
          {p.banos !== null && (
            <div className="bsm-stat">
              <svg className="bsm-stat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z"/><path d="M6 12V5a2 2 0 012-2h3v2.25"/></svg>
              <div className="bsm-stat-txt"><b>{p.banos}</b><span>baño{p.banos !== 1 ? 's' : ''}</span></div>
            </div>
          )}
          {p.piso != null && (
            <div className="bsm-stat">
              <svg className="bsm-stat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/></svg>
              <div className="bsm-stat-txt"><b>{p.piso === 0 ? 'PB' : p.piso}</b><span>piso</span></div>
            </div>
          )}
        </div>
      )}
      {/* Inclusiones (modal desktop): lo INCLUIDO en el precio como chips
          (equipado · N parqueo · baulera); lo OPCIONAL con costo extra (parqueo/
          baulera NO incluidos pero con precio) en una línea aparte. Nunca se
          muestra un ítem en los dos lados, ni se afirma ausencia. */}
      {richLayout && (() => {
        const amob = equipamiento.some(e => /amoblad/i.test(e))
        const equip = amob || equipamiento.length > 0
        const parqCount = (p.estacionamientos != null && p.estacionamientos > 0) ? p.estacionamientos : null
        const parqIncl = p.parqueo_incluido === true || parqCount != null
        const baulIncl = p.baulera === true || p.baulera_incluido === true
        // Pet friendly = política del EDIFICIO (chip, como parqueo/equipado — NO
        // una amenidad). Se saca de "Todas las comodidades" más abajo. Se deriva
        // del flag pet_friendly O de la mención en amenidades (dato subreportado:
        // a veces viene solo como texto "Pet Friendly" sin el flag).
        const petMatch = (a: string) => /pet\s*friendly|mascota/i.test(a)
        const petFriendly = p.pet_friendly === true
          || (p.amenities_confirmados || []).some(petMatch)
          || (p.amenidades_extra || []).some(petMatch)
        const opcionales: string[] = []
        if (!parqIncl && p.parqueo_precio_adicional != null && p.parqueo_precio_adicional > 0)
          opcionales.push(`Parqueo +$us ${Math.round(p.parqueo_precio_adicional).toLocaleString('en-US')}`)
        if (!baulIncl && p.baulera_precio_adicional != null && p.baulera_precio_adicional > 0)
          opcionales.push(`Baulera +$us ${Math.round(p.baulera_precio_adicional).toLocaleString('en-US')}`)
        if (!equip && !parqIncl && !baulIncl && !petFriendly && opcionales.length === 0) return null
        return (
          <>
            {(equip || parqIncl || baulIncl || petFriendly) && (
              <div className="bsm-incl">
                {equip && <span className="bsm-incl-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 11V7a2 2 0 012-2h12a2 2 0 012 2v4"/><path d="M2 13a2 2 0 012-2h16a2 2 0 012 2v4H2z"/><path d="M4 17v2M20 17v2"/></svg>{amob ? 'Amoblado' : 'Equipado'}</span>}
                {parqIncl && <span className="bsm-incl-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 002 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>{parqCount ? `${parqCount} parqueo${parqCount > 1 ? 's' : ''}` : 'Parqueo'}</span>}
                {baulIncl && <span className="bsm-incl-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>Baulera</span>}
                {petFriendly && <span className="bsm-incl-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10c-2 0-4 2-4 4 0 2 1 3 3 3 1 0 2-1 3-1s2 1 3 1c2 0 3-1 3-3 0-2-2-4-4-4-1 0-1.5.5-2.5.5S10 10 9 10z"/></svg>Pet friendly</span>}
              </div>
            )}
            {opcionales.length > 0 && (
              <div className="bsm-opcional">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                <span>Opcional: {opcionales.map((o, i) => <span key={i}>{i > 0 ? ' · ' : ''}<b>{o}</b></span>)}</span>
              </div>
            )}
          </>
        )
      })()}
    </>
  )

  // Header: nombre · zona · precio · detalles. En el modal desktop lleva además
  // los stats adentro (grid 2 col); en mobile los stats van aparte, bajo la foto.
  const headerBlock = (
    <div className="bs-dark-header" id="bsm-sec-resumen">
      <div className="bs-h-name">
        {p.proyecto}
        {esNuevoCaptura(p) ? <span className="bs-h-nuevo">Nuevo</span> : esPublicacionReciente(p) && <span className="bs-h-reciente">Reciente</span>}
      </div>
      <div className="bs-h-zona">{displayZona(p.zona)} · #{p.id}</div>
      <div className="bs-h-price-block">
        <div className="bs-h-price">$us {Math.round(p.precio_usd).toLocaleString('en-US')} <span className="bs-h-tc">(T.C. oficial)</span>{p.tc_sospechoso && !publicShareMode && <span className="bs-tc-badge">Confirmar tipo de cambio</span>}</div>
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
      {sideMode && statsAndChips}
    </div>
  )

  return (
    <>
      <div className={`bs-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <div className={`bs bs-venta ${isOpen ? 'open' : ''} ${sideMode ? 'bs-side' : (isDesktop ? 'bs-desktop' : '')} ${richLayout && !sideMode ? 'bs-rich' : ''}`}>
        {/* Nav de anclas del modal desktop: saltan a secciones del MISMO
            scroll (no ocultan contenido) + acciones fav/cerrar */}
        {sideMode && (
          <div className="bsm-nav">
            {([['bsm-sec-resumen', 'Resumen'], ['bsm-sec-mercado', 'Mercado'], ['bsm-sec-similares', 'Similares']] as const).map(([id, label]) => (
              <button key={id} type="button" className="bsm-nav-link"
                onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{label}</button>
            ))}
            <div className="bsm-nav-actions">
              {onToggleFavorite && (
                <button className={`bs-fav ${isFavorite ? 'active' : ''}`} aria-label="Favorito" onClick={onToggleFavorite}>
                  <svg viewBox="0 0 24 24" fill={isFavorite ? '#E05555' : 'none'} stroke={isFavorite ? '#E05555' : 'currentColor'} strokeWidth="1.5" style={{ width: 18, height: 18 }}>
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                </button>
              )}
              <button className="bs-close" aria-label="Cerrar detalles" onClick={onClose}>&times;</button>
            </div>
          </div>
        )}
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
        {/* Header (nombre/precio/detalles) — en mobile va acá, antes de la foto.
            En el modal desktop (sideMode) se mete dentro de la columna izquierda
            (ver bsm-main). Los stats con iconos NO están acá en mobile: van en su
            propia sección debajo de la foto, igual que alquileres. */}
        {!sideMode && headerBlock}
          {/* Modal desktop + UNA sola foto: no forzar el banner ancho (recorta
              renders verticales). Foto completa (contain) sobre un fondo borroso
              de sí misma — no recorta ni deja negro. Click → visor. */}
          {showTab('resumen') && sideMode && p.fotos_urls && p.fotos_urls.length === 1 && (
            <div className="bsm-photos bsm-photo-solo" onClick={() => setShowViewer(true)}>
              <div className="bsm-photo-solo-bg" style={{ backgroundImage: `url('${p.fotos_urls[0]}')` }} />
              <img src={p.fotos_urls[0]} alt={p.proyecto} className="bsm-photo-solo-img" loading="lazy" />
            </div>
          )}
          {/* Galería: carrusel (mobile) / franja acotada + visor (modal desktop, 2+ fotos) */}
          {showTab('resumen') && p.fotos_urls && p.fotos_urls.length > 0 && !(sideMode && p.fotos_urls.length === 1) && (
            <div className={`bsm-photos bsm-photos-n${Math.min(p.fotos_urls.length, 5)}`}>
              <BottomSheetGallery photos={p.fotos_urls} propertyId={p.id} />
              {sideMode && p.fotos_urls.length > 3 && (
                <button type="button" className="bsm-verfotos" onClick={() => setShowViewer(true)}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  Ver las {p.fotos_urls.length} fotos
                </button>
              )}
            </div>
          )}
          {/* Mobile rico: los iconos grandes + chips van DEBAJO de la foto
              (nombre/precio/detalles → foto → iconos), espejo de alquileres. */}
          {!sideMode && statsAndChips && (
            <div className="bs-section bsm-stats-sec">{statsAndChips}</div>
          )}

          {/* bsm-body/main/aside: en mobile son display:contents (no cambian
              nada); en el modal desktop arman las 2 columnas debajo de las
              fotos — contenido a la izquierda, tarjeta sticky a la derecha */}
          <div className="bsm-body">
          <div className="bsm-main">
          {/* Header dentro de la columna izquierda (solo modal desktop) para que
              la tarjeta WhatsApp del aside quede arriba, integrada al precio */}
          {sideMode && headerBlock}
          {/* Comentario del broker — solo en publicShareMode */}
          {showTab('resumen') && publicShareMode && brokerComment && (
            <div className="bs-section bs-broker-comment-section" id="bs-broker-comment">
              <div className="bs-sl"><span className="bs-sl-dot" />Comentario de tu broker</div>
              <div className="bs-broker-comment">
                <div className="bs-broker-comment-quote">&ldquo;</div>
                <div className="bs-broker-comment-text">{brokerComment}</div>
                {publicShareBroker && <div className="bs-broker-comment-author">— {publicShareBroker.nombre}, tu broker</div>}
              </div>
            </div>
          )}

          {/* Características — oculta en layout rico (redundante con los números
              grandes del header + las inclusiones); sigue en broker/publicShare */}
          {showTab('resumen') && !richLayout && (
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
          )}

          {/* Badges — oculto en layout rico (estado va a Mercado,
              inclusiones al header); sigue en broker/publicShare */}
          {showTab('resumen') && !richLayout && (
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
          )}

          {/* ACM inline — solo en modo broker */}
          {showTab('resumen') && brokerMode && <ACMInline propiedadId={p.id} tcSospechoso={p.tc_sospechoso} />}

          {/* Amenidades / Equipamiento — broker/publicShare: chips por categoría */}
          {showTab('resumen') && !richLayout && amenities.length > 0 && (
            <div className="bs-section">
              <div className="bs-sl"><span className="bs-sl-dot" />Edificio</div>
              <div className="bs-aw">{amenities.map((a, i) => <span key={i} className="bs-at">{a}</span>)}</div>
            </div>
          )}
          {showTab('resumen') && !richLayout && equipamiento.length > 0 && (
            <div className="bs-section">
              <div className="bs-sl"><span className="bs-sl-dot" />Departamento</div>
              <div className="bs-aw">{equipamiento.map((e, i) => <span key={i} className="bs-at">{e}</span>)}</div>
            </div>
          )}

          {/* Comodidades — MODAL DESKTOP (patrón "What's special"):
              · "Lo que la hace especial" = lo NO canónico (texto libre distintivo),
                marcado con la chispita — escala a cualquier feature.
              · "Todas las comodidades" = las canónicas, con su icono del catálogo,
                agrupadas En el edificio / En el departamento. */}
          {showTab('resumen') && richLayout && (() => {
            // Split hecho por el PIPELINE (READER_SPEC), no por el cliente:
            //  · especial = cola larga no-canónica (amenidades_extra + equipamiento_otros)
            //  · canónico = amenities_confirmados (edificio) + equipamiento_detectado (depto)
            // "Lo que la hace especial" = SOLO lo distintivo del EDIFICIO.
            // amenidades_extra trae DOS clases: estándar que el reader sacó del
            // canónico por texto explícito (Terraza, Ascensor, Área Social… — NO
            // hacen especial a nadie) y verdaderamente fuera de catálogo (Rooftop,
            // Cine, Sala de TV). Las estándar reconocidas (tienen icono canónico)
            // van a "En el edificio"; solo lo NO reconocido queda en "especial".
            // "Pet friendly" NO es una comodidad: ya se muestra como chip arriba
            // (política del edificio). Se filtra de especial y de "En el edificio".
            const isPet = (a: string) => /pet\s*friendly|mascota/i.test(a)
            const extraRaw = (p.amenidades_extra || []).filter((a: string) => !isPet(a))
            const especial = extraRaw.filter((a: string) => !hasCanonicalIcon(a))
            const extraEstandar = extraRaw.filter((a: string) => hasCanonicalIcon(a))
            const edificioSet = new Set<string>()
            const edificioCanon = ([...amenities, ...extraEstandar] as string[]).filter((a) => !isPet(a)).filter((a) => {
              const k = a.trim().toLowerCase()
              if (edificioSet.has(k)) return false
              edificioSet.add(k); return true
            })
            const deptoAll = [ ...equipamiento, ...(p.equipamiento_otros || []) ]
            if (especial.length === 0 && edificioCanon.length === 0 && deptoAll.length === 0) return null
            return (
              <>
                {especial.length > 0 && (
                  <div className="bs-section" id="bsm-sec-especial">
                    <div className="bs-sl"><span className="bs-sl-dot" />Lo que la hace especial</div>
                    <div className="bsm-especial">
                      {especial.map((x, i) => (
                        <span key={i} className="bsm-especial-pill"><SparkleIcon className="bsm-especial-ico" />{x}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(edificioCanon.length > 0 || deptoAll.length > 0) && (
                  <div className="bs-section" id="bsm-sec-comod">
                    <div className="bs-sl"><span className="bs-sl-dot" />Todas las comodidades</div>
                    {edificioCanon.length > 0 && (
                      <div className="bsm-comod-group">
                        <div className="bsm-comod-cat">En el edificio</div>
                        <div className="bsm-comod-grid">
                          {edificioCanon.map((a, i) => (
                            <div key={i} className="bsm-comod-item"><AmenityIcon name={a} className="bsm-comod-ico" />{a}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {deptoAll.length > 0 && (
                      <div className="bsm-comod-group">
                        <div className="bsm-comod-cat">En el departamento</div>
                        <div className="bsm-comod-grid">
                          {deptoAll.map((e, i) => (
                            <div key={i} className="bsm-comod-item"><AmenityIcon name={e} className="bsm-comod-ico" />{e}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          })()}

          {/* Descripción (colapsable) */}
          {showTab('resumen') && p.descripcion && (
            <div className="bs-section" id="bsm-sec-desc">
              <div className="bs-sl"><span className="bs-sl-dot" />Sobre esta propiedad</div>
              <div className={`bs-desc ${descExpanded ? 'expanded' : ''}`}>{p.descripcion}</div>
              {p.descripcion.length > 150 && !descExpanded && (
                <button className="bs-desc-more" onClick={() => setDescExpanded(true)}>Ver más</button>
              )}
            </div>
          )}

          {/* Agente info — el feed fiduciario NO muestra el captador (decisión Lucho).
              En la shortlist B2C tampoco se muestra el nombre/oficina del captador
              (decisión Lucho 18-jul): el contacto va al captador por WhatsApp con
              atribución de Simón, pero Simón es la cara — no se expone al broker.
              Antes se mostraba en contactoDirecto; ahora se oculta en publicShare. */}
          {showTab('resumen') && !sideMode && contactoDirecto && !publicShareMode && p.agente_nombre && (
            <div className="bs-section">
              <div className="bs-agent">
                <span className="bs-agent-name">{p.agente_nombre}</span>
                {p.agente_oficina && <span className="bs-agent-office"> · {p.agente_oficina}</span>}
              </div>
            </div>
          )}
          {/* "Captado por" solo en contactoDirecto (B2C); el sheet normal no lo muestra. */}
          {sideMode && contactoDirecto && p.agente_nombre && (
            <div className="bs-section bsm-trust">
              {`Captado por ${p.agente_nombre}${p.agente_oficina ? ` · ${p.agente_oficina}` : ''}`}
            </div>
          )}

          {/* Cómo está el precio — en la shortlist alimentado por el mercado
              real (slMarket), en el feed por el cálculo local. Sección nativa. */}
          {mercadoSection}
          {/* "Datos de compra" se plegó dentro de Mercado (días + estado);
              parqueo/baulera/equipado viven ahora como inclusiones en el header. */}

          {/* Propiedades similares */}
          {similaresSection}

          {/* Preguntas para el vendedor — oculto en modo broker (el broker es el que responde)
              y en publicShare; en contactoDirecto (B2C) se muestran (van al captador) */}
          {showTab('compra') && !brokerMode && (!publicShareMode || contactoDirecto) && brokerQuestions.length > 0 && (
            <div className="bs-section" id="bsm-sec-preguntas">
              <div className="bs-q-header">
                <div className="bs-sl"><span className="bs-sl-dot" />Preguntas para el vendedor</div>
                <span className="bs-q-hint">
                  {selectedQs.size > 0 ? `${selectedQs.size}/${MAX_QS} — se incluyen en WhatsApp` : `Selecciona hasta ${MAX_QS} · van en tu WhatsApp`}
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
          {/* Ubicación con mapa mediano — layout rico (desktop + mobile);
              debajo va el link a Google Maps para todos */}
          {richLayout && p.latitud && p.longitud && (
            <div className="bs-section" id="bsm-sec-ubic">
              <div className="bs-sl"><span className="bs-sl-dot" />Ubicación</div>
              <div className="bsm-flow-map">
                <VentaMap properties={railMapProps} onSelectProperty={railMapNoop} selectedId={p.id} />
              </div>
            </div>
          )}
          {showTab('resumen') && p.latitud && p.longitud && (
            <div className="bs-section bsm-ubic-link">
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
          {showTab('resumen') && brokerMode && onToggleFavorite && (
            <div className="bs-section">
              <button className={`bs-add-shortlist ${isFavorite ? 'bs-add-shortlist-active' : ''}`} onClick={onToggleFavorite}>
                <svg viewBox="0 0 24 24" fill={isFavorite ? '#EDE8DC' : 'none'} stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                {isFavorite ? 'Quitar de shortlist' : 'Agregar a shortlist'}
              </button>
            </div>
          )}

          {/* Ver original (con gate) — oculto en modo broker y en publicShare (cliente confía
              en el broker); en contactoDirecto (B2C) se muestra como el feed (§6 dec.3) */}
          {showTab('resumen') && !brokerMode && (!publicShareMode || contactoDirecto) && p.url && (
            <div className="bs-section bsm-sec-original">
              {sideMode ? (
                /* Modal desktop: anuncio original ABIERTO (sin gate) por ahora */
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="bs-ver-original">
                  Ver anuncio original &#8599;
                </a>
              ) : !showGate ? (
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
          {showTab('resumen') && brokerMode && p.url && (
            <div className="bs-section">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="bs-ver-original">
                Ver anuncio original en {p.fuente === 'century21' ? 'Century21' : 'Remax'} &#8599;
              </a>
            </div>
          )}

          </div>
          {/* Tarjeta sticky (desktop) / footer (mobile): SOLO lo esencial,
              como el "Request a tour" de Zillow — WhatsApp + Compartir.
              El precio ya vive en el bloque principal, no se repite. */}
          <div className="bsm-aside">
          <div className="bs-sticky-footer">
            {publicShareMode && !contactoDirecto && publicShareBroker ? (
              <a href={`https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${firstName(publicShareBroker.nombre)}, me interesa: ${p.proyecto} (${p.dormitorios === 0 ? 'Mono' : p.dormitorios + ' dorm'}, ${Math.round(p.area_m2)}m², $us ${Math.round(p.precio_usd).toLocaleString('en-US')}).`)}`}
                target="_blank" rel="noopener noreferrer" className="bs-wsp-cta"
                onClick={(e) => {
                  e.preventDefault()
                  const msg = `Hola ${firstName(publicShareBroker.nombre)}, me interesa: ${p.proyecto} (${p.dormitorios === 0 ? 'Mono' : p.dormitorios + ' dorm'}, ${Math.round(p.area_m2)}m², $us ${Math.round(p.precio_usd).toLocaleString('en-US')}).`
                  openWhatsApp(publicShareBroker.telefono, msg)
                }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Consultar por WhatsApp
              </a>
            ) : p.agente_telefono && (() => {
              const buildSheetMsg = (): string => {
                const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
                const specs = `${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')}`
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
                const selectedTexts = Array.from(selectedQs).sort().map(idx => brokerQuestions[idx]).filter(Boolean) as string[]
                // Modo público (feed + B2C): formato unificado con atribución.
                return buildAtribucionWaMessage({
                  nombre: p.proyecto || 'este departamento',
                  url: p.url,
                  preguntas: selectedTexts,
                  ref: `SIM-V${p.id}`,
                })
              }
              return (
              <a href={`https://wa.me/${p.agente_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(buildSheetMsg())}`}
                target="_blank" rel="noopener noreferrer" className="bs-wsp-cta"
                onClick={(e) => {
                  e.preventDefault()
                  trackEvent('click_whatsapp_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_usd), origen: contactoDirecto ? 'public_share_directo' : 'detail_sheet', questions_count: selectedQs.size })
                  openWhatsApp(p.agente_telefono!, buildSheetMsg())
                }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {selectedQs.size > 0 ? `${selectedQs.size} pregunta${selectedQs.size > 1 ? 's' : ''}` : 'WhatsApp'}
              </a>
              )
            })()}
            {/* Comparar — layout rico (desktop + mobile): agrega a favoritos y abre el comparador */}
            {richLayout && onCompare && !brokerMode && (
              <button className="bs-compare-btn" onClick={onCompare}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ width: 16, height: 16 }}>
                  <rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>
                </svg>
                <span className="bs-btn-label">Comparar</span>
              </button>
            )}
            {onShare && !brokerMode && (
              <button className="bs-share-btn" onClick={onShare} aria-label="Compartir">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                <span className="bs-btn-label">Compartir</span>
              </button>
            )}
          </div>
          </div>
          </div>
        {/* Visor de fotos a pantalla completa (botón "Ver las N fotos") */}
        {sideMode && showViewer && p.fotos_urls && p.fotos_urls.length > 0 && (
          <PhotoViewer photos={p.fotos_urls} initialIndex={0} buildingName={p.proyecto}
            subtitle={`${displayZona(p.zona)} · #${p.id}`} onClose={() => setShowViewer(false)} />
        )}
      </div>
    </>
  )
}

// ===== Toast =====
// kind="warn" → triángulo amarillo + borde izquierdo + padding asimétrico para
// avisos críticos (ej. TC sospechoso, requiere atención del broker antes de
// enviar shortlist). showToast() controla la duración (5s warn, 2.5s info).
function Toast({ message, visible, kind = 'info' }: { message: string; visible: boolean; kind?: 'info' | 'warn' | 'success' }) {
  if (!visible) return null
  return (
    <div className={`ventas-toast ${kind === 'warn' ? 'ventas-toast-warn' : ''} ${kind === 'success' ? 'ventas-toast-success' : ''}`}>
      {kind === 'warn' && (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#F2B441" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      )}
      {kind === 'success' && (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#7BB389" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
      <span>{message}</span>
    </div>
  )
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
  return `Hola ${firstName(brokerName)}, me interesa esta propiedad:\n\n${p.proyecto} (${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')})\n\n¿Podemos coordinar?`
}

// Mensaje WhatsApp del cliente al broker con LISTA de propiedades de interés.
// Usado en CompareSheet (publicShareMode) cuando el cliente comparó 2+ y quiere consultar.
function buildClientShortlistInterestMessage(props: UnidadVenta[], brokerName: string): string {
  const lines = props.map(p => {
    const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
    return `• ${p.proyecto} (${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')})`
  }).join('\n')
  return `Hola ${firstName(brokerName)}, estoy interesado en estas alternativas:\n\n${lines}\n\n¿Podemos coordinar?`
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
  // Modo público (feed + B2C): formato unificado con atribución a Simón.
  return buildAtribucionWaMessage({
    nombre: p.proyecto || 'este departamento',
    url: p.url,
    ref: `SIM-V${p.id}`,
  })
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
  if (f === 'bien_inmuebles' || f === 'bieninmuebles') return { label: 'Bien Inmuebles', color: '#fff', bg: '#37BEAA' }
  return null
}

// Public share: cuando /b/[hash] reusa este feed, pasa este prop para
// (a) saltar fetch (la lista viene curada), (b) ocultar filtros/sidebar/spotlight/mapa,
// (c) ocultar gate/preguntas/WA agente del sheet, (d) mostrar header con datos del broker.
export interface PublicShareData {
  hash: string
  // contacto_directo (migración 256): si true (solo simon-asistente), los CTA
  // por propiedad contactan al captador como en el feed, no al broker dueño.
  broker: { slug: string; nombre: string; telefono: string; foto_url: string | null; inmobiliaria?: string | null; contacto_directo?: boolean }
  items: UnidadVenta[]
  itemComments?: Record<number, string | null>
  // Items destacados por el broker (migración 239). Máx 1 por shortlist.
  // Render: card con fondo arena + chip "Recomendada por tu broker".
  itemsDestacada?: Record<number, boolean>
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
  // Modo demo (/b/demo): renderiza placeholder "Tu foto" sobre la silueta
  // del broker cuando foto_url es null. Otros affordances de demo
  // (intercept WA, intro sheet, watermark) viven en pages/b/[hash].tsx.
  isDemo?: boolean
  // Nombre del cliente de la shortlist — header mobile "Selección para {nombre}".
  clienteNombre?: string | null
}

// ===== Page =====
export default function VentasPage({ seo, initialProperties = [], brokerSlug: brokerSlugProp = null, broker: brokerProp = null, publicShare = null, brokerDemoMode = false }: { seo: VentasSEO; initialProperties: UnidadVenta[]; brokerSlug?: string | null; broker?: Broker | null; publicShare?: PublicShareData | null; brokerDemoMode?: boolean }) {
  const publicShareMode = publicShare !== null
  // contacto_directo (migración 256): B2C del bot simon-asistente. Se lee de
  // publicShare.broker (NO de publicShareBrokerProp, que está recortado y no lo
  // lleva). Cuando es true, los CTA por propiedad contactan al captador como en
  // el feed en vez del broker dueño. Default false ⇒ comportamiento B2B intacto.
  const contactoDirecto = publicShare?.broker?.contacto_directo === true
  // Rediseño mobile de la shortlist (/b/[hash]): aplica a shortlists reales, NO a
  // la demo de broker (/b/demo), que conserva su header + intro + watermark. La
  // demo se detecta por publicShare.isDemo. SSR-safe (sin isDesktop).
  const shortlistRedesign = publicShareMode && !!publicShare && !publicShare.isDemo
  const publicShareBrokerProp: { nombre: string; telefono: string; foto_url: string | null; slug: string } | null = publicShare ? publicShare.broker : null
  const priceSnapshotsMap: Record<number, { rawSnapshot: number | null; normSnapshot: number | null; rawActual: number | null }> | null = publicShare && publicShare.priceSnapshots ? publicShare.priceSnapshots : null
  const itemCommentsMap: Record<number, string | null> | null = publicShare && publicShare.itemComments ? publicShare.itemComments : null
  const itemsDestacadaMap: Record<number, boolean> | null = publicShare && publicShare.itemsDestacada ? publicShare.itemsDestacada : null
  const initialProps = publicShareMode ? publicShare!.items : initialProperties
  const [properties, setProperties] = useState<UnidadVenta[]>(initialProps)
  // Precios del feed cargado, para el histograma de distribución del filtro.
  const priceValues = useMemo(() => properties.map(p => p.precio_usd).filter(v => v > 0), [properties])
  const [loading, setLoading] = useState(publicShareMode ? false : initialProperties.length === 0)
  const [loadError, setLoadError] = useState(false)
  const [filters, setFilters] = useState<FiltrosVentaSimple>({ orden: 'recientes' })
  // Filtro de amenidades: client-side (no toca el RPC). Parte los resultados en
  // confirmados / no-listados (fiduciario). Ver AMEN_DIFERENCIADORES.
  const [amenSel, setAmenSel] = useState<Set<string>>(new Set())
  const toggleAmen = useCallback((a: string) => setAmenSel(prev => { const n = new Set(prev); if (n.has(a)) n.delete(a); else n.add(a); return n }), [])
  // Hover sobre una card de la lista (split desktop) → ubica su pin en el mapa
  // del panel (centra + resalta). null = sin hover.
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const onCardHover = useCallback((id: number | null) => setHoveredId(id), [])
  const [isFiltered, setIsFiltered] = useState(false)
  // Bump para re-montar el sidebar desktop (DesktopFilters) cuando los filtros
  // cambian por una fuente EXTERNA (buscador natural, deep-link, menú) — así los
  // controles reflejan lo aplicado. No se toca en los chips del propio sidebar
  // (evita remontar mientras el usuario interactúa; ver alquileres).
  const [filterComponentVersion, setFilterComponentVersion] = useState(0)
  const [totalCount, setTotalCount] = useState(initialProps.length)
  const [unfilteredCount, setUnfilteredCount] = useState(initialProps.length)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const [compareOpen, setCompareOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastKind, setToastKind] = useState<'info' | 'warn' | 'success'>('info')
  // Modal "Reportar dato incorrecto" — solo broker mode (migración 240).
  // reportProperty trackea cuál prop tiene el modal abierto. reportedIds es un
  // marcador visual de sesión (no persistido) para mostrar ✓ en cards reportadas.
  const [reportProperty, setReportProperty] = useState<UnidadVenta | null>(null)
  const [reportedIds, setReportedIds] = useState<Set<number>>(new Set())
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
  // Chrome mobile de la shortlist: menú hamburguesa + señal para reabrir el resumen
  const [shortlistMenuOpen, setShortlistMenuOpen] = useState(false)
  const [contextExpandSignal, setContextExpandSignal] = useState(0)
  // Modo "solo lista" del layout split: oculta el panel derecho y la lista
  // pasa a 2 columnas (densidad máxima). Con el side sheet abierto vuelve
  // al split mientras dure, y al cerrarlo retoma la lista pura.
  const [listOnly, setListOnly] = useState(false)
  const [mobileMapOpen, setMobileMapOpen] = useState(false)
  const [mapSelectedId, setMapSelectedId] = useState<number | null>(null)
  const [proyectoNames, setProyectoNames] = useState<string[]>(() => [...new Set(initialProps.map(p => p.proyecto).filter(Boolean))].sort())
  const [filterOverlayOpen, setFilterOverlayOpen] = useState(false)
  // Rediseño mobile: header con buscador nativo + drawers (menú/perfil)
  const [natQuery, setNatQuery] = useState('')
  const [natChips, setNatChips] = useState<string[]>([])
  const [natAviso, setNatAviso] = useState<'alquiler' | 'moneda' | null>(null)
  // Placeholder typewriter del buscador natural (mobile + desktop). Escribe por
  // ref (sin re-render del feed). Ver useTypewriterPlaceholder.
  const mSearchRef = useRef<HTMLInputElement>(null)
  const dSearchRef = useRef<HTMLInputElement>(null)
  useTypewriterPlaceholder(mSearchRef, SEARCH_EXAMPLES_VENTA, 'Buscá "', '"')
  useTypewriterPlaceholder(dSearchRef, SEARCH_EXAMPLES_VENTA, 'Buscá "', '"')
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
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

  // Layout desktop split (nav + lista densa + panel derecho). Solo en el feed
  // público: broker y public-share conservan el grid clásico con sus banners.
  const splitDesktop = isDesktop && !brokerMode && !publicShareMode

  // S2: shortlists del broker — selección actual = `favorites`, persistencia y envío via hook
  const brokerShortlists = useBrokerShortlists(broker)
  const [shortlistModalOpen, setShortlistModalOpen] = useState(false)
  const [shortlistsPanelOpen, setShortlistsPanelOpen] = useState(false)
  // Filtro broker: ver solo propiedades marcadas (útil cuando hay muchas + filtros cambiados)
  const [onlySelectedFilter, setOnlySelectedFilter] = useState(false)
  // Filtros broker: NO persisten — cada visita arranca en default.
  // Decisión deliberada: si filtro persistía, broker volvía al día siguiente
  // y veía un feed corto sin entender por qué (filtros olvidados de la sesión anterior).
  // Limpieza defensiva del localStorage existente al montar (versiones previas
  // sí persistían).
  const [fuentesPermitidas, setFuentesPermitidas] = useState<Set<FuenteBroker>>(() => new Set(FUENTES_BROKER))
  const [areaMin, setAreaMin] = useState<number>(M2_MIN_DEFAULT)
  const [areaMax, setAreaMax] = useState<number>(M2_MAX_DEFAULT)
  useEffect(() => {
    if (!brokerSlug) return
    try {
      localStorage.removeItem(`broker_fuentes_${brokerSlug}`)
      localStorage.removeItem(`broker_area_${brokerSlug}`)
    } catch {}
  }, [brokerSlug])
  function toggleFuente(f: FuenteBroker) {
    setFuentesPermitidas(prev => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f); else next.add(f)
      return next
    })
  }
  // Indica si el filtro de área está activo (no en defaults). Ocultar props sin area_m2 si lo está.
  const areaFiltroActivo = brokerMode && (areaMin > M2_MIN_DEFAULT || areaMax < M2_MAX_DEFAULT)
  // TC paralelo (Binance) para que el broker calcule mentalmente USD billete.
  // Solo informativo — no se aplica a ningún precio. Cargado al montar en modo broker.
  // ultimaVerificacion = workflow nocturno corre cada día (verifica Binance)
  // fecha = última actualización efectiva del valor en BD (cambia solo si delta >= 0.5%)
  const [tcParalelo, setTcParalelo] = useState<{ valor: number; fecha: string | null; verificacion: string | null } | null>(null)
  useEffect(() => {
    if (!brokerMode) return
    let cancelled = false
    fetch('/api/tc-actual')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d || typeof d.tcParalelo !== 'number') return
        setTcParalelo({ valor: d.tcParalelo, fecha: d.fechaActualizacion || null, verificacion: d.ultimaVerificacion || null })
      })
      .catch(() => { /* fail silent — el chip simplemente no aparece */ })
    return () => { cancelled = true }
  }, [brokerMode])

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

  // Entrada al feed. Alquileres tenía `page_enter_alquiler` desde siempre y
  // ventas no tenía nada equivalente, así que el primer paso del embudo existía
  // solo para una de las dos operaciones y no se podían comparar.
  useEffect(() => {
    trackEvent('feed_view', { operacion: 'venta', macrozona: 'equipetrol' })
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

  // Persistencia de reportes propios al mount: cargar todos los pendientes/in_review
  // del broker activo. Pobla reportedIds → cards muestran "Reportada" tras recargar.
  // También sirve para alimentar el banner persistente sin doble fetch.
  useEffect(() => {
    if (!brokerSlug || !brokerMode || publicShareMode) return
    let cancelled = false
    fetch(`/api/broker/property-reports?slug=${encodeURIComponent(brokerSlug)}&status=pending,in_review`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.reports) return
        const ids = new Set<number>(
          json.reports.map((r: { propiedad_id: number }) => r.propiedad_id),
        )
        setReportedIds(ids)
      })
      .catch(() => {/* best-effort */})
    return () => { cancelled = true }
  }, [brokerSlug, brokerMode, publicShareMode])

  // Spotlight: parse ?id= from URL
  useEffect(() => {
    const idParam = router.query.id
    if (idParam && typeof idParam === 'string') {
      const parsed = parseInt(idParam, 10)
      if (!isNaN(parsed)) setSpotlightId(parsed)
    }
  }, [router.query.id])

  // Deep-link de filtros: ?zonas, ?dormitorios, ?precio_min, ?precio_max (USD),
  // ?preventa=1 — usado por el buscador de la home al rutear a ventas y por la
  // entrada "Preventa" del menú. Aplica una sola vez al montar (guard).
  const deepLinkAppliedRef = useRef(false)
  useEffect(() => {
    if (deepLinkAppliedRef.current) return
    if (!router.isReady) return
    if (publicShareMode || brokerMode) { deepLinkAppliedRef.current = true; return }
    // ?edificio / ?id tienen sus propios effects — no interferir
    if (router.query.edificio) { deepLinkAppliedRef.current = true; return }

    const q = router.query
    const dorms = new Set<number>()
    const zonas = new Set<string>()
    let minP = MIN_PRICE, maxP = MAX_PRICE, entrega = ''
    let any = false

    if (typeof q.dormitorios === 'string') {
      q.dormitorios.split(',').map(s => parseInt(s, 10))
        .filter(n => Number.isInteger(n) && n >= 0 && n <= 10)
        .forEach(n => { dorms.add(n >= 3 ? 3 : n); any = true })
    }
    if (typeof q.zonas === 'string') {
      q.zonas.split(',').map(s => s.trim().toLowerCase()).forEach(slug => {
        const db = ZONAS_CANONICAS.find(z => z.slug === slug)?.db
        if (db) { zonas.add(db); any = true }
      })
    }
    const pmax = Number(q.precio_max)
    if (Number.isFinite(pmax) && pmax > 0) { maxP = Math.max(MIN_PRICE + PRICE_STEP, Math.min(pmax, MAX_PRICE)); any = true }
    const pmin = Number(q.precio_min)
    if (Number.isFinite(pmin) && pmin > 0) { minP = Math.max(MIN_PRICE, Math.min(pmin, maxP - PRICE_STEP)); any = true }
    if (q.preventa === '1') { entrega = 'solo_preventa'; any = true }

    deepLinkAppliedRef.current = true
    if (!any) return
    const f = buildFilters(minP, maxP, dorms, zonas, entrega, 'recientes')
    setFilters(f)
    setIsFiltered(true)
    fetchProperties(f)
    setFilterComponentVersion(v => v + 1)
  }, [router.isReady, router.query]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function showToast(msg: string, kind: 'info' | 'warn' | 'success' = 'info') {
    setToastMsg(msg)
    setToastKind(kind)
    setToastVisible(true)
    const duration = kind === 'info' ? 2500 : 5000
    setTimeout(() => setToastVisible(false), duration)
  }

  function openReportModal(p: UnidadVenta) {
    // Atajo anti-confusión: si ya está reportada por este broker, mostramos
    // toast directo en vez de abrir el modal vacío. El backend igual chequea
    // duplicado en el submit, pero acá evitamos que el broker pierda tiempo.
    if (reportedIds.has(p.id)) {
      showToast('Ya reportaste esta propiedad. SICI la está revisando.', 'warn')
      return
    }
    setReportProperty(p)
  }

  function handleReportSuccess(duplicate: boolean) {
    const propId = reportProperty?.id
    setReportProperty(null)
    if (propId != null) {
      setReportedIds((prev) => {
        const n = new Set(prev)
        n.add(propId)
        return n
      })
    }
    if (duplicate) {
      showToast('Ya reportaste esta propiedad. SICI la está revisando.', 'warn')
    } else {
      showToast('Reporte enviado. SICI lo está revisando.', 'success')
      trackEvent('broker_report_property', { property_id: propId })
    }
  }

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
    // Limite de 3 aplica en feed público y en publicShareMode (cliente final ve shortlist).
    // Forced choice: 3 favoritos obligan a curar/comparar, no a explorar. El comparativo
    // de 3 es legible, el de 7 no. Para el broker armando shortlist NO aplica.
    if (!brokerMode && !isFav && favorites.size >= MAX_FAVORITES) {
      showToast(`Máximo ${MAX_FAVORITES} — destildá uno para agregar otro`)
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
        // Aviso al broker cuando agrega prop con TC sospechoso: el cliente no
        // verá el badge "Confirmar tipo de cambio" en la shortlist (es señal
        // interna). El broker debe verificar el precio antes de enviar.
        const prop = properties.find(x => x.id === id)
        const isReportada = reportedIds.has(id)
        if (isReportada) {
          // Atención: prop con datos reportados como incorrectos. El broker
          // tiene que decidir si igual la incluye en la shortlist al cliente.
          showToast(`Atención: esta prop tiene datos reportados como incorrectos. SICI los está revisando.`, 'warn')
        } else if (prop?.tc_sospechoso) {
          showToast(`${newCount} ${newCount === 1 ? 'seleccionada' : 'seleccionadas'} · Verificá TC antes de enviar al cliente`, 'warn')
        } else {
          showToast(`${newCount} ${newCount === 1 ? 'propiedad seleccionada' : 'propiedades seleccionadas'}`)
        }
      } else if (newCount >= 2) {
        showToast(`${newCount}/${MAX_FAVORITES} · Podes comparar abajo`)
      } else {
        showToast(`Guardado · ${newCount}/${MAX_FAVORITES} favoritos`)
      }
    }
  }
  // Handlers estables para las cards memoizadas (patrón useLatest): la identidad
  // de estas funciones nunca cambia entre renders (así React.memo de las cards
  // sigue siendo válido), pero siempre ejecutan la versión más reciente de la
  // lógica vía ref — sin closures viejos sobre favorites/properties.
  const openCardMap = (p: UnidadVenta) => { setMapSelectedId(p.id); setMobileMapOpen(true); trackEvent('open_map_mobile_venta', { origen: 'card' }) }
  // Pin del mapa del panel → abre el side sheet. Vive acá (y no inline en el
  // JSX) porque VentaMap RECONSTRUYE el mapa entero cuando cambia la identidad
  // de onSelectProperty — un lambda inline lo reconstruía en cada render.
  const openSheetFromMap = (id: number) => { const sp = displayedProperties.find(x => x.id === id); if (sp) openSheet(sp) }
  const latestHandlersRef = useRef({ toggleFavorite, shareProperty, openSheet, addToShortlist, openReportModal, openCardMap, openSheetFromMap })
  latestHandlersRef.current = { toggleFavorite, shareProperty, openSheet, addToShortlist, openReportModal, openCardMap, openSheetFromMap }
  const onPanelMapSelect = useCallback((id: number) => latestHandlersRef.current.openSheetFromMap(id), [])
  const onCardToggleFavorite = useCallback((id: number) => latestHandlersRef.current.toggleFavorite(id), [])
  const onCardShare = useCallback((p: UnidadVenta) => latestHandlersRef.current.shareProperty(p), [])
  const onCardOpenSheet = useCallback((p: UnidadVenta) => latestHandlersRef.current.openSheet(p), [])
  const onCardPhotoTap = useCallback((p: UnidadVenta, _idx: number) => latestHandlersRef.current.openSheet(p), [])
  const onCardAddToShortlist = useCallback((p: UnidadVenta) => latestHandlersRef.current.addToShortlist(p), [])
  const onCardReport = useCallback((p: UnidadVenta) => latestHandlersRef.current.openReportModal(p), [])
  const onCardMap = useCallback((p: UnidadVenta) => latestHandlersRef.current.openCardMap(p), [])

  // Lista que se muestra: aplica filtro de fuentes (broker) + área m² (broker) + "solo seleccionadas".
  // Cuando brokerMode = false, no se aplica nada (paridad con feed público).
  const displayedProperties = useMemo(() => {
    let list: UnidadVenta[] = properties
    if (brokerMode && fuentesPermitidas.size < FUENTES_BROKER.length) {
      list = list.filter(p => fuentesPermitidas.has(((p.fuente || '').toLowerCase()) as FuenteBroker))
    }
    if (areaFiltroActivo) {
      list = list.filter(p => {
        const a = p.area_m2
        if (!a || a <= 0) return false // sin área, ocultar cuando filtro está activo
        return a >= areaMin && a <= areaMax
      })
    }
    if (brokerMode && onlySelectedFilter) {
      list = list.filter(p => favorites.has(p.id))
    }
    return list
  }, [brokerMode, onlySelectedFilter, properties, favorites, fuentesPermitidas, areaFiltroActivo, areaMin, areaMax])

  // Filtro DURO por amenidades: solo diferenciadores bien listados (son
  // argumentos de venta → se listan cuando existen). Con la aclaración honesta
  // de que filtramos por lo confirmado. NO se filtra por estándar ni cola larga.
  const amenActivo = amenSel.size > 0
  const confirmados = useMemo(() =>
    amenActivo ? displayedProperties.filter(p => propMatchesAmen(p, amenSel)) : displayedProperties
  , [displayedProperties, amenSel, amenActivo])

  // Resumen de mercado del filtro actual — panel derecho del layout split
  // (estado sin propiedad seleccionada). Client-side sobre la lista visible;
  // lenguaje fiduciario: mediana + rango observado + base declarada.
  const panelMarketSummary = useMemo(() => {
    if (!splitDesktop) return null
    const base = confirmados
    const conM2 = base.filter(q => q.precio_m2 > 0).map(q => q.precio_m2).sort((a, b) => a - b)
    if (conM2.length < 5) return { count: base.length, mediana: null, rangoLow: null, rangoHigh: null, preventaPct: null }
    const pctl = (pct: number) => {
      const idx = (conM2.length - 1) * pct
      const lo = Math.floor(idx), hi = Math.ceil(idx)
      return lo === hi ? conM2[lo] : Math.round(conM2[lo] * (hi - idx) + conM2[hi] * (idx - lo))
    }
    const preventa = base.filter(q => q.estado_construccion === 'preventa').length
    return {
      count: base.length,
      mediana: pctl(0.5),
      rangoLow: pctl(0.25),
      rangoHigh: pctl(0.75),
      preventaPct: base.length > 0 ? Math.round((preventa / base.length) * 100) : null,
    }
  }, [splitDesktop, confirmados])

  // Chip fiduciario por card — posición del precio/m² vs el rango típico
  // (p25-p75) de su tipología. Misma filosofía de cascada que el sheet:
  // zona+tipología+estado (≥6) → Equipetrol+tipología+estado → canasta mixta.
  // SIN veredicto ("oportunidad"/"caro"): solo posición declarada + base
  // contable, verificable en el tab Mercado. Map estable por id para no
  // romper el memo de las cards.
  const cardChips = useMemo(() => {
    const pools = new Map<string, number[]>()
    const push = (k: string, v: number) => { const a = pools.get(k); if (a) a.push(v); else pools.set(k, [v]) }
    for (const q of properties) {
      if (!(q.precio_m2 > 0)) continue
      const seg = q.estado_construccion === 'preventa' || q.estado_construccion === 'entrega_inmediata' ? q.estado_construccion : null
      if (seg) { push(`z|${q.zona}|${q.dormitorios}|${seg}`, q.precio_m2); push(`g|${q.dormitorios}|${seg}`, q.precio_m2) }
      push(`z|${q.zona}|${q.dormitorios}|mix`, q.precio_m2)
      push(`g|${q.dormitorios}|mix`, q.precio_m2)
    }
    pools.forEach(a => a.sort((x, y) => x - y))
    const pctl = (s: number[], pct: number) => { const i = (s.length - 1) * pct; const lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo] * (hi - i) + s[hi] * (i - lo) }
    const m = new Map<number, { pos: 'bajo' | 'dentro' | 'sobre'; count: number }>()
    for (const p of properties) {
      if (!(p.precio_m2 > 0)) continue
      const seg = p.estado_construccion === 'preventa' || p.estado_construccion === 'entrega_inmediata' ? p.estado_construccion : null
      const keys = seg
        ? [`z|${p.zona}|${p.dormitorios}|${seg}`, `g|${p.dormitorios}|${seg}`, `z|${p.zona}|${p.dormitorios}|mix`, `g|${p.dormitorios}|mix`]
        : [`z|${p.zona}|${p.dormitorios}|mix`, `g|${p.dormitorios}|mix`]
      const pool = keys.map(k => pools.get(k)).find(a => a && a.length >= 6)
      if (!pool) continue
      const lo = pctl(pool, 0.25), hi = pctl(pool, 0.75)
      m.set(p.id, { pos: p.precio_m2 < lo ? 'bajo' : p.precio_m2 > hi ? 'sobre' : 'dentro', count: pool.length - 1 })
    }
    return m
  }, [properties])

  const visibleNotMarked = useMemo(() => {
    if (!brokerMode) return []
    let list: UnidadVenta[] = properties
    if (fuentesPermitidas.size < FUENTES_BROKER.length) {
      list = list.filter(p => fuentesPermitidas.has(((p.fuente || '').toLowerCase()) as FuenteBroker))
    }
    if (areaFiltroActivo) {
      list = list.filter(p => {
        const a = p.area_m2
        if (!a || a <= 0) return false
        return a >= areaMin && a <= areaMax
      })
    }
    return list.filter(p => !favorites.has(p.id))
  }, [brokerMode, properties, favorites, fuentesPermitidas, areaFiltroActivo, areaMin, areaMax])
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

    trackEvent('share_venta', { property_id: p.id, property_name: p.proyecto, zona: displayZona(p.zona), origen: publicShareMode ? 'public_share' : 'feed' })

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
  // Buscador nativo del header (lib/busqueda-natural). Chips en vivo mientras se
  // escribe; al enviar (Enter/submit) aplica los filtros al feed. Venta = USD:
  // si el monto viene en Bs se ignora y se avisa (no adivina el TC).
  function handleNaturalSearch(texto: string, submit: boolean) {
    setNatQuery(texto)
    const sig = parsearBusqueda(texto)
    setNatChips(sig.chips)
    const montoBob = sig.moneda === 'bob' && (sig.precioMax !== null || sig.precioMin !== null)
    setNatAviso(sig.operacion === 'alquiler' ? 'alquiler' : (montoBob ? 'moneda' : null))
    if (!submit) return
    const monedaOk = sig.moneda !== 'bob'
    const f: FiltrosVentaSimple = { orden: filters.orden || 'recientes', solo_con_fotos: true }
    if (sig.dormitorios.length > 0) {
      const arr = [...new Set(sig.dormitorios)].sort((a, b) => a - b)
      f.dormitorios_lista = arr.includes(3) ? [...arr.filter(d => d !== 3), 3, 4, 5] : arr
    }
    if (monedaOk && sig.precioMax !== null) f.precio_max = Math.max(MIN_PRICE + PRICE_STEP, Math.min(sig.precioMax, MAX_PRICE))
    if (monedaOk && sig.precioMin !== null) f.precio_min = Math.max(MIN_PRICE, Math.min(sig.precioMin, MAX_PRICE - PRICE_STEP))
    const dbs = sig.zonas.map(slug => ZONAS_CANONICAS.find(z => z.slug === slug)?.db).filter(Boolean) as string[]
    if (dbs.length > 0) f.zonas_permitidas = dbs
    if (sig.entrega) f.estado_entrega = sig.entrega
    applyFilters(f)
    setFilterComponentVersion(v => v + 1) // re-marca los controles del sidebar
  }
  function openPreventaFromMenu() {
    setMenuOpen(false)
    applyFilters({ ...filters, estado_entrega: 'solo_preventa', orden: filters.orden || 'recientes', solo_con_fotos: true })
    setFilterComponentVersion(v => v + 1)
    showToast('Propiedades marcadas como preventa en las fuentes disponibles')
  }
  function openComparadorFromMenu() {
    setMenuOpen(false)
    if (favorites.size >= 2) openCompare()
    else showToast(favorites.size === 1 ? 'Guardá al menos 2 propiedades con el corazón para comparar' : 'Guardá propiedades con el corazón para comparar')
  }

  function addToShortlist(p: UnidadVenta) {
    // S2: el botón ⭐/Agregar a shortlist alterna favorite. La "selección actual" del
    // broker para mandar al cliente = el set de favoritos. Al confirmar el envío,
    // se crea la shortlist en BD y se limpian los favoritos.
    trackEvent('broker_add_to_shortlist', { property_id: p.id, broker_slug: broker?.slug })
    toggleFavorite(p.id)
  }
  async function handleSendShortlist(data: { cliente_nombre: string; cliente_telefono: string; mensaje_whatsapp?: string; items_metadata?: Array<{ propiedad_id: number; comentario_broker?: string | null; is_destacada?: boolean }> }) {
    if (!broker) throw new Error('Broker no resuelto')
    const propiedad_ids = Array.from(favorites)
    if (propiedad_ids.length === 0) throw new Error('No hay propiedades seleccionadas')
    trackEvent('broker_send_shortlist', { broker_slug: broker.slug, count: propiedad_ids.length, with_metadata: data.items_metadata ? data.items_metadata.length : 0 })
    try {
      const { whatsappUrl } = await brokerShortlists.createAndSend({
        cliente_nombre: data.cliente_nombre,
        cliente_telefono: data.cliente_telefono,
        mensaje_whatsapp: data.mensaje_whatsapp,
        propiedad_ids,
        items_metadata: data.items_metadata,
      })
      setFavorites(new Set())
      showToast('Shortlist enviada')
      return { whatsappUrl }
    } catch (err) {
      // En /broker/demo el hook lanza este error sentinela. Lo capturamos
      // antes de que ShortlistSendModal lo muestre como error rojo y
      // emitimos evento que BrokerDemoOverlay convierte en modal educativo.
      if (err instanceof Error && err.message === DEMO_SHORTLIST_BLOCKED) {
        window.dispatchEvent(new CustomEvent('simon:demo-blocked', { detail: { context: 'enviar_shortlist' } }))
        return { whatsappUrl: '' }
      }
      throw err
    }
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
  // brokerDemoMode y brokerMode: NO hidratan ni persisten — sesión limpia
  // siempre. Broker usa "Mis shortlists" (BD) para guardar/retomar trabajo;
  // localStorage compartido entre público y broker filtraría selecciones.
  useEffect(() => {
    if (publicShareMode) {
      const hearts = publicShare?.initialHearts
      if (hearts && hearts.length > 0) setFavorites(new Set(hearts))
      return
    }
    if (brokerDemoMode) return
    if (brokerMode) return
    try { const s = localStorage.getItem('ventas_favorites_v1'); if (s) setFavorites(new Set(JSON.parse(s))) } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (publicShareMode) return // persistencia va por BD en toggleFavorite
    if (brokerDemoMode) return // demo no persiste
    if (brokerMode) return // broker usa BD via "Mis shortlists"
    if (favorites.size > 0) localStorage.setItem('ventas_favorites_v1', JSON.stringify([...favorites]))
    else localStorage.removeItem('ventas_favorites_v1') // al limpiar, no rehidratar viejos
  }, [favorites, publicShareMode, brokerDemoMode, brokerMode])

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

  // Fetch on mount:
  // - sin SSG data o con spotlight → fetch inmediato (fallback original)
  // - con SSG data (payload reducido a ~24 props sin descripción) → fetch del
  //   listado completo diferido a idle: el HTML inicial pesa poco y el resto
  //   llega apenas el navegador respira. Guard fetchGenRef === 0: si el user
  //   ya filtró (disparó su propio fetch), el diferido no lo pisa.
  useEffect(() => {
    if (publicShareMode) return
    // ?shadow=0: la data SSG es SHADOW (default del lanzamiento TC nuevo; el
    // build no conoce el query param). Forzar el fetch prod INMEDIATO para no
    // mostrar precios shadow en el escape a prod (ej. #3580 = $180k shadow vs
    // $275k prod). Sin esto, el refetch se difería a idle y el sheet quedaba
    // con el snapshot shadow.
    const wantsProd = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('shadow') === '0'
    if (initialProperties.length === 0 || spotlightId || wantsProd) { fetchProperties(); return }
    const idle = typeof window.requestIdleCallback === 'function'
      ? (cb: () => void) => window.requestIdleCallback(cb, { timeout: 3000 })
      : (cb: () => void) => window.setTimeout(cb, 1500)
    idle(() => { if (fetchGenRef.current === 0) fetchProperties() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    setAmenSel(new Set())
    const count = await fetchProperties(defaults)
    showToast(`${count} departamentos · sin filtros`)
    if (feedRef.current) feedRef.current.scrollTo({ top: 0 })
    setActiveCardIndex(0)
  }

  // Build feed items (mobile): spotlight first, then property cards (filter card removed — now overlay)
  const feedItems = useMemo(() => {
    const items: Array<{ type: 'property'; data: UnidadVenta; isSpotlight?: boolean }> = []
    let baseList: UnidadVenta[] = properties
    if (brokerMode && fuentesPermitidas.size < FUENTES_BROKER.length) {
      baseList = baseList.filter(p => fuentesPermitidas.has(((p.fuente || '').toLowerCase()) as FuenteBroker))
    }
    if (areaFiltroActivo) {
      baseList = baseList.filter(p => {
        const a = p.area_m2
        if (!a || a <= 0) return false
        return a >= areaMin && a <= areaMax
      })
    }
    if (brokerMode && onlySelectedFilter) {
      baseList = baseList.filter(p => favorites.has(p.id))
    }
    const mobileProps = spotlightProperty
      ? [spotlightProperty, ...baseList.filter(p => p.id !== spotlightId)]
      : baseList
    mobileProps.forEach((p, i) => {
      items.push({ type: 'property', data: p, isSpotlight: i === 0 && !!spotlightProperty })
    })
    return items
  }, [properties, favorites, brokerMode, onlySelectedFilter, fuentesPermitidas, areaFiltroActivo, areaMin, areaMax, spotlightProperty, spotlightId])
  // Hint "Desliza para más fotos": una sola vez, en la primera card con galería.
  const swipeHintIdx = useMemo(() => feedItems.findIndex(it => (it.data.fotos_urls?.length || 0) > 1), [feedItems])

  // Drawers de menú/perfil — compartidos entre el layout mobile y el nav desktop
  // (misma lógica y clases mfd-*/mfp-*; el scrim funciona en ambos viewports).
  const menuDrawer = menuOpen && (
    <div className="mfd-scrim" onClick={() => setMenuOpen(false)}>
      <nav className="mfd" onClick={e => e.stopPropagation()} aria-label="Menú principal">
        <div className="mfd-head"><span className="mfd-title">Menú</span><button className="mfd-close" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}>&times;</button></div>
        <button className="mfd-item" onClick={openPreventaFromMenu}>Preventa</button>
        <span className="mfd-item mfd-item-active">Ventas</span>
        <a className="mfd-item" href="/alquileres">Alquileres</a>
        <div className="mfd-sec">Simulá y calculá</div>
        <button className="mfd-item mfd-sub" onClick={openComparadorFromMenu}>Comparador de propiedades</button>
        <span className="mfd-item mfd-sub mfd-soon">Calculadora de renta <span className="mfd-badge-soon">Próximamente</span></span>
        <span className="mfd-item mfd-sub mfd-soon">Crédito hipotecario <span className="mfd-badge-soon">Próximamente</span></span>
        <div className="mfd-divider" />
        <a className="mfd-item" href="/mercado/equipetrol">Mercado</a>
        <button className="mfd-item" onClick={() => { setMenuOpen(false); setProfileOpen(true) }}>Mis favoritos{favorites.size > 0 ? ` · ${favorites.size}` : ''}</button>
        <a className="mfd-item mfd-item-wa" href={`https://wa.me/${SIMON_WHATSAPP}?text=${encodeURIComponent('Hola Simon, quiero ayuda para encontrar una propiedad')}`} target="_blank" rel="noopener noreferrer">Hablar por WhatsApp</a>
      </nav>
    </div>
  )
  const profileDrawer = profileOpen && (
    <div className="mfd-scrim" onClick={() => setProfileOpen(false)}>
      <div className="mfp" onClick={e => e.stopPropagation()}>
        <div className="mfd-head"><span className="mfd-title">Tu cuenta</span><button className="mfd-close" aria-label="Cerrar" onClick={() => setProfileOpen(false)}>&times;</button></div>
        <div className="mfp-body">
          <div className="mfp-ico"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></div>
          <p className="mfp-msg">Guardá favoritos y comparativos en este dispositivo.</p>
          <p className="mfp-sub">{favorites.size === 0 ? 'Todavía no guardaste ninguna propiedad' : `${favorites.size} ${favorites.size === 1 ? 'favorito guardado' : 'favoritos guardados'}`}</p>
          {favorites.size >= 2 && <button className="mfp-cta" onClick={() => { setProfileOpen(false); openCompare() }}>Comparar {favorites.size} favoritos</button>}
        </div>
      </div>
    </div>
  )

  // ===== Chrome mobile de la shortlist (/b/[hash]) — solo publicShare mobile =====
  const shortlistStats = useMemo(
    () => (publicShareMode ? computeVentaShortlistStats(properties) : null),
    [publicShareMode, properties]
  )
  // Mensaje "Más opciones"/"Pedir parecidas" al bot (simon-asistente). Misma
  // lógica que el header de broker; centralizado para header + barra + menú.
  const buildShortlistBotMsg = (): string => {
    if (!publicShare) return ''
    const hearted = properties.filter(p => favorites.has(p.id))
    let msg: string
    if (hearted.length > 0) {
      const lines = hearted.map(p => {
        const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
        return `• ${p.proyecto} (${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')})`
      }).join('\n')
      if (contactoDirecto) {
        msg = `Hola ${firstName(publicShare.broker.nombre)}, de las que me pasaste me interesaron:\n\n${lines}\n\n¿Tenés otras parecidas?`
      } else {
        const plural = hearted.length === 1 ? 'esta' : 'estas'
        const noun = hearted.length === 1 ? 'propiedad' : `${hearted.length} propiedades`
        msg = `Hola ${firstName(publicShare.broker.nombre)}, me interesa${hearted.length === 1 ? '' : 'n'} ${plural} ${noun}:\n\n${lines}\n\n¿Podemos coordinar?`
      }
    } else if (contactoDirecto) {
      msg = `Hola ${firstName(publicShare.broker.nombre)}, vi la selección que me mandaste. ¿Me mostrás otras opciones?`
    } else {
      msg = `Hola ${firstName(publicShare.broker.nombre)}, vi las propiedades que me enviaste.`
    }
    if (contactoDirecto && REF_ALTERNATIVAS_ENABLED) {
      msg += `\n\n${buildAlternativasRefLine(publicShare.hash, hearted.map(p => p.id))}`
    }
    return msg
  }
  const openShortlistBotWhatsApp = () => {
    if (publicShare) openWhatsApp(publicShare.broker.telefono, buildShortlistBotMsg())
  }
  const shareShortlist = () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'Selección en Simon', url }).catch(() => {})
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast('Link copiado', 'success')).catch(() => {})
    }
  }
  const reportarDatoShortlist = () => {
    if (!publicShare) return
    const msg = `Hola, quiero reportar un dato de mi selección en Simon.\n\n${buildAlternativasRefLine(publicShare.hash, properties.filter(p => favorites.has(p.id)).map(p => p.id))}`
    openWhatsApp(publicShare.broker.telefono, msg)
  }

  return (
    <>
      <VentasHead
        seo={seo}
        brokerSlug={brokerSlug}
        publicShareHash={publicShare?.hash ?? null}
      />

      <Toast message={toastMsg} visible={toastVisible} kind={toastKind} />

      {/* PhotoViewer */}
      {viewerOpen && (
        <PhotoViewer photos={viewerPhotos} initialIndex={viewerIndex}
          buildingName={viewerName} subtitle={viewerSubtitle}
          onClose={() => setViewerOpen(false)} />
      )}

      {/* Bottom Sheet — en el layout split desktop el detalle se renderiza
          embebido como side sheet en el panel derecho (más abajo), no acá. */}
      {!splitDesktop && <BottomSheet property={sheetProperty} isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setSheetProperty(null) }}
        onShare={sheetProperty ? () => shareProperty(sheetProperty) : undefined}
        onCompare={(sheetProperty && !brokerMode && !publicShareMode) ? () => { setFavorites(prev => { const n = new Set(prev); n.add(sheetProperty.id); return n }); openCompare() } : undefined}
        isFavorite={sheetProperty ? favorites.has(sheetProperty.id) : false}
        onToggleFavorite={(sheetProperty && !publicShareMode) ? () => toggleFavorite(sheetProperty.id) : undefined}
        gateCompleted={gateCompleted} onGate={handleGate} isDesktop={isDesktop}
        properties={properties} onSwapProperty={(p) => setSheetProperty(p)}
        brokerMode={brokerMode}
        onAddToShortlist={addToShortlist}
        publicShareBroker={publicShareBrokerProp}
        contactoDirecto={contactoDirecto}
        brokerInfo={brokerInfoProp}
        brokerComment={sheetProperty && itemCommentsMap ? itemCommentsMap[sheetProperty.id] || null : null} />}

      {/* Modal de propiedad (estilo Zillow) para el feed público desktop.
          Fuera del gate de viewMode: se abre igual desde la lista, el mixto
          o el mapa completo ("Ver detalles" de la mini-card del mapa). Es
          position:fixed, así que su lugar en el DOM no importa. */}
      {splitDesktop && sheetOpen && sheetProperty && (
        <BottomSheet property={sheetProperty} isOpen sideMode
          onClose={() => { setSheetOpen(false); setSheetProperty(null) }}
          onShare={() => shareProperty(sheetProperty)}
          onCompare={() => { setFavorites(prev => { const n = new Set(prev); n.add(sheetProperty.id); return n }); openCompare() }}
          isFavorite={favorites.has(sheetProperty.id)}
          onToggleFavorite={() => toggleFavorite(sheetProperty.id)}
          gateCompleted={gateCompleted} onGate={handleGate} isDesktop
          properties={properties} onSwapProperty={(sp) => setSheetProperty(sp)} />
      )}

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
      {/* Desktop: bandeja de comparar (2+). En el layout split queda anclada a la
          columna de lista (no tapa mapa ni side sheet); con thumbnails A/B/C.
          En mobile lo maneja la barra fija inferior (mt-bottombar). */}
      {isDesktop && !brokerMode && favorites.size >= 2 && (
        <div className={`vt-compare-banner-wrap ${splitDesktop ? 'vt-tray-split' : ''}`}>
          <button className="vt-compare-banner" onClick={openCompare}>
            {splitDesktop && (
              <span className="vt-tray-thumbs">
                {favoriteProperties.slice(0, 3).map((fp, i) => (
                  fp.fotos_urls?.[0]
                    ? <span key={fp.id} className="vt-tray-thumb" style={{ backgroundImage: `url('${fp.fotos_urls[0]}')` }}><em>{String.fromCharCode(65 + i)}</em></span>
                    : <span key={fp.id} className="vt-tray-thumb"><em>{String.fromCharCode(65 + i)}</em></span>
                ))}
              </span>
            )}
            <span className="vt-compare-banner-text">Comparar {favorites.size} favoritos</span>
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
          propiedades={favoriteProperties.map(p => ({
            id: p.id,
            nombre: p.proyecto || `Propiedad #${p.id}`,
            foto: p.fotos_urls?.[0] || null,
            zona: displayZona(p.zona),
            precio_label: `$us ${Math.round(p.precio_usd).toLocaleString('en-US')}`,
          }))}
          existingShortlists={brokerShortlists.shortlists}
          onConfirm={handleSendShortlist}
          onDemoBlock={brokerDemoMode ? () => {
            window.dispatchEvent(new CustomEvent('simon:demo-blocked', { detail: { context: 'enviar_shortlist' } }))
          } : undefined}
        />
      )}

      {brokerDemoMode && <BrokerDemoOverlay />}

      {/* Modal Reportar dato incorrecto — solo broker mode (migración 240) */}
      {brokerMode && brokerSlug && reportProperty && (
        <ReportPropertyModal
          isOpen={true}
          onClose={() => setReportProperty(null)}
          brokerSlug={brokerSlug}
          propiedadId={reportProperty.id}
          propiedadLabel={`${reportProperty.proyecto || 'Sin nombre'} · ${displayZona(reportProperty.zona)}`}
          tipoOperacion="venta"
          tcSospechosoFlag={reportProperty.tc_sospechoso === true}
          onSuccess={handleReportSuccess}
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
        chips={cardChips}
        onClose={() => setCompareOpen(false)}
        publicShareBroker={publicShareBrokerProp}
        contactoDirecto={contactoDirecto}
        onOpenFavorites={() => setProfileOpen(true)}
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
                onClick={() => { setViewMode('grid'); trackEvent('switch_view_venta', { view_mode: 'grid', origen: 'broker_banner' }) }}
                aria-label="Ver lista" role="tab" aria-selected={viewMode === 'grid'}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </button>
              <button
                className={`vt-broker-vm-btn ${viewMode === 'map' ? 'active' : ''}`}
                onClick={() => { setViewMode('map'); trackEvent('switch_view_venta', { view_mode: 'map', origen: 'broker_banner' }) }}
                aria-label="Ver mapa" role="tab" aria-selected={viewMode === 'map'}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </button>
            </div>
          )}
          <button
            className="vt-broker-tool vt-broker-tool-primary"
            onClick={() => { setFilterOverlayOpen(true); trackEvent('open_filter_overlay_venta', { origen: 'broker_banner' }) }}
            title="Filtrar propiedades"
          >
            ⚙ Filtrar{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </button>
          <button
            className={`vt-broker-tool ${favorites.size === 0 ? 'vt-broker-tool-disabled' : (onlySelectedFilter ? 'active' : '')}`}
            onClick={favorites.size === 0 ? undefined : () => setOnlySelectedFilter(v => !v)}
            title={favorites.size === 0
              ? 'Marcá propiedades con ⭐ para activar'
              : (onlySelectedFilter ? 'Mostrar todas las propiedades' : 'Ver solo las propiedades marcadas')}
            disabled={favorites.size === 0}
          >
            ★ {favorites.size === 0 ? 'Seleccionadas · 0' : `Solo seleccionadas · ${favorites.size}`}
          </button>{/* Siempre visible: el "0" guía al broker para empezar a marcar */}
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
          {tcParalelo && (() => {
            // TC paralelo Binance — alineado al margen derecho del banner.
            // El workflow verifica Binance cada noche. Solo actualiza la BD
            // si el cambio es ≥ 0.5% (threshold para evitar ruido). Tooltip
            // con ambas fechas para que el broker entienda que TC "viejo"
            // puede significar simplemente "estable", no roto.
            const fmt = (s: string | null) => s ? new Date(s).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' }) : '—'
            const tooltipParts: string[] = ['TC paralelo Binance P2P']
            if (tcParalelo.verificacion) tooltipParts.push(`Última verificación: ${fmt(tcParalelo.verificacion)}`)
            if (tcParalelo.fecha) tooltipParts.push(`Última actualización efectiva: ${fmt(tcParalelo.fecha)}`)
            tooltipParts.push('(El TC se actualiza solo si el cambio diario es ≥ 0,5%)')
            return (
              <span className="vt-broker-tc-chip"
                title={tooltipParts.join('\n')}
                aria-label="Tipo de cambio paralelo Binance">
                <span className="vt-broker-tc-label">TC paralelo</span>
                <span className="vt-broker-tc-divider" aria-hidden="true">·</span>
                <span className="vt-broker-tc-value">Bs {tcParalelo.valor.toFixed(2)}</span>
              </span>
            )
          })()}
          {/* Fila de fuentes/franquicias — solo modo broker.
              Default las 3 marcadas (= ver todo). Persistido por slug en localStorage. */}
          <div className="vt-fuentes-row">
            <span className="vt-fuentes-label">Fuentes:</span>
            {FUENTES_BROKER.map(f => {
              const fb = fuenteBadge(f)
              const active = fuentesPermitidas.has(f)
              // Outline con color brand: fondo transparente, texto + borde
              // del color brand. Reduce saturación visual vs. pill sólido,
              // mantiene legibilidad y reconocimiento.
              const style = active && fb
                ? { background: 'transparent', color: fb.bg, borderColor: fb.bg }
                : undefined
              return (
                <button
                  key={f}
                  type="button"
                  className={`vt-fuente-chip ${active ? 'active' : ''}`}
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

      {/* Chrome mobile de la shortlist (/b/[hash]) — reemplaza el header de broker
          + FAB mapa en mobile. Header compacto + barra inferior + menú hamburguesa. */}
      {shortlistRedesign && publicShare && !isDesktop && (
        <>
          <ShortlistMobileHeader
            variant="venta"
            clienteNombre={publicShare.clienteNombre ? firstName(publicShare.clienteNombre) : null}
            onMenu={() => setShortlistMenuOpen(true)}
          />
          {viewMode === 'grid' && properties.length > 0 && (
            <ShortlistBottomBar
              variant="venta"
              favCount={favorites.size}
              onVerMapa={() => setViewMode('map')}
              onComparar={openCompare}
              onMasOpciones={openShortlistBotWhatsApp}
            />
          )}
          <ShortlistMenu
            variant="venta"
            open={shortlistMenuOpen}
            onClose={() => setShortlistMenuOpen(false)}
            favCount={favorites.size}
            destinoNuevaBusqueda="/ventas"
            onMasOpciones={openShortlistBotWhatsApp}
            onComparar={openCompare}
            onVerMapa={() => setViewMode('map')}
            onContextoSeleccion={() => setContextExpandSignal(s => s + 1)}
            onCompartir={shareShortlist}
            onReportar={reportarDatoShortlist}
            onIrWebapp={(d) => { window.location.href = d }}
          />
        </>
      )}

      {/* Header modo public share — header del broker (desktop siempre; y mobile en
          la demo de broker, que conserva su experiencia original). */}
      {publicShareMode && publicShare && (isDesktop || publicShare.isDemo) && (
        <div className="vt-public-share-header">
          <div className="vpsh-broker">
            {publicShare.broker.foto_url
              ? <img src={publicShare.broker.foto_url} alt={publicShare.broker.nombre} className="vpsh-broker-photo" />
              : publicShare.isDemo
                ? <div className="vpsh-broker-photo vpsh-broker-photo-ph vpsh-broker-photo-demo">Tu foto</div>
                : <div className="vpsh-broker-photo vpsh-broker-photo-ph">{publicShare.broker.nombre.charAt(0)}</div>}
            <div className="vpsh-broker-info">
              <div className="vpsh-broker-label">Selección de</div>
              <div className="vpsh-broker-name">{publicShare.broker.nombre}</div>
              {publicShare.broker.inmobiliaria && (
                <div className="vpsh-broker-agency">{publicShare.broker.inmobiliaria}</div>
              )}
            </div>
          </div>
          {(() => {
            const buildPubShareMsg = (): string => {
              const hearted = properties.filter(p => favorites.has(p.id))
              let msg: string
              if (hearted.length > 0) {
                const lines = hearted.map(p => {
                  const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
                  return `• ${p.proyecto} (${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')})`
                }).join('\n')
                // B2C: el broker dueño es el bot → re-enfocar a "pedir más opciones"
                // (el bot no coordina visitas; eso va por el captador). Los favoritos
                // se mandan como señal de preferencia para que el bot afine la búsqueda.
                if (contactoDirecto) {
                  msg = `Hola ${firstName(publicShare.broker.nombre)}, de las que me pasaste me interesaron:\n\n${lines}\n\n¿Tenés otras parecidas?`
                } else {
                  const plural = hearted.length === 1 ? 'esta' : 'estas'
                  const noun = hearted.length === 1 ? 'propiedad' : `${hearted.length} propiedades`
                  msg = `Hola ${firstName(publicShare.broker.nombre)}, me interesa${hearted.length === 1 ? '' : 'n'} ${plural} ${noun}:\n\n${lines}\n\n¿Podemos coordinar?`
                }
              } else if (contactoDirecto) {
                msg = `Hola ${firstName(publicShare.broker.nombre)}, vi la selección que me mandaste. ¿Me mostrás otras opciones?`
              } else {
                msg = `Hola ${firstName(publicShare.broker.nombre)}, vi las propiedades que me enviaste.`
              }
              // Línea machine-readable para el bot (solo B2C + flag de lanzamiento
              // activo). hash + propiedades_v2.id favoriteados. Ver wa-message.ts.
              if (contactoDirecto && REF_ALTERNATIVAS_ENABLED) {
                msg += `\n\n${buildAlternativasRefLine(publicShare.hash, hearted.map(p => p.id))}`
              }
              return msg
            }
            return (
          <a
            href={`https://wa.me/${publicShare.broker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(buildPubShareMsg())}`}
            target="_blank" rel="noopener noreferrer" className="vpsh-wa"
            onClick={(e) => { e.preventDefault(); openWhatsApp(publicShare.broker.telefono, buildPubShareMsg()) }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            {contactoDirecto ? 'Más opciones' : 'WhatsApp'}
          </a>
            )
          })()}
        </div>
      )}

      {/* Filter overlay — montado siempre (lo dispara el search pill mobile o el chip Filtros del broker mobile) */}
      <FilterOverlay isOpen={filterOverlayOpen} onClose={() => setFilterOverlayOpen(false)}
        totalCount={unfilteredCount || totalCount} filteredCount={properties.length}
        isFiltered={isFiltered} onApply={applyFilters} onReset={resetFilters} proyectoNames={proyectoNames}
        brokerMode={brokerMode} areaMin={areaMin} areaMax={areaMax}
        onAreaMin={setAreaMin}
        onAreaMax={setAreaMax}
        amenSel={amenSel} onAmenToggle={toggleAmen} priceValues={priceValues} />

      {(isDesktop || publicShareMode || brokerMode) ? (
        /* ===== DESKTOP (o public share / broker en cualquier device — feed con grid simple) ===== */
        <div className={`ventas-desktop ${splitDesktop ? 'ventas-desktop-split' : ''} ${publicShareMode ? 'ventas-desktop-public' : ''} ${shortlistRedesign ? 'vt-shortlist-redesign' : ''} ${(brokerMode && !isDesktop) ? 'ventas-desktop-broker-mobile' : ''} ${brokerMode ? 'ventas-desktop-broker' : ''}`}>
          {/* Nav superior desktop — solo feed público (broker/public-share tienen sus banners) */}
          {splitDesktop && (
            <FeedDesktopNav active="ventas" variant="dark"
              whatsappHref={`https://wa.me/${SIMON_WHATSAPP}?text=${encodeURIComponent('Hola Simon, quiero ayuda para encontrar una propiedad')}`}
              onPreventa={openPreventaFromMenu}
              onComparador={openComparadorFromMenu}
              onMenu={() => setMenuOpen(true)}
              onProfile={() => setProfileOpen(true)} />
          )}
          {splitDesktop && menuDrawer}
          {splitDesktop && profileDrawer}
          {/* Sidebar clásico — solo fuera del layout split (broker desktop).
              En split los filtros viven en la fila de pills sobre la lista. */}
          {!splitDesktop && !publicShareMode && !(brokerMode && !isDesktop) && (
            <aside className="ventas-sidebar">
              {!splitDesktop && (
                <div className="ventas-sidebar-header">
                  <Link href="/" className="ventas-logo">Simon</Link>
                  <div className="ventas-label">VENTAS</div>
                </div>
              )}
              <div className="ventas-sidebar-count">
                <span className="ventas-count-num">{properties.length}</span>
                <span className="ventas-count-text">{isFiltered ? `de ${unfilteredCount} departamentos` : 'departamentos en Equipetrol'}</span>
              </div>
              {/* El buscador natural del feed público vive ahora en la columna
                  izquierda del layout split (este sidebar solo se ve en broker) */}
              <DesktopFilters key={`df-${filterComponentVersion}`} currentFilters={filters} isFiltered={isFiltered} onApply={applyFilters} onReset={resetFilters} proyectoNames={proyectoNames}
                brokerMode={brokerMode} areaMin={areaMin} areaMax={areaMax}
                onAreaMin={setAreaMin}
                onAreaMax={setAreaMax} />
            </aside>
          )}
          <main className="ventas-main">
            {/* Banner persistente reportes broker — DENTRO del main para que respete
                el flujo del feed (no del root). Migración 240. */}
            {brokerMode && brokerSlug && !publicShareMode && (
              <DataReportsBanner count={reportedIds.size} />
            )}
            {/* View mode toggle — oculto en el layout split (el mapa vive en el panel
                derecho con "Ver mapa completo"), en publicShareMode mobile (FAB) y en
                brokerMode (banner verde) */}
            {!splitDesktop && properties.length > 0 && !(publicShareMode && !isDesktop) && !brokerMode && (
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
            {/* Empty state genérico — en split el mensaje vive DENTRO de la lista
                (los filtros/pills siguen visibles para poder deshacer el filtro) */}
            {!splitDesktop && !loading && properties.length === 0 && !loadError && <div className="ventas-status">{buildEmptyMessage(filters)}</div>}
            {/* Desktop spotlight — visible también en publicShareMode (link compartido /b/[hash]?id=X) */}
            {!splitDesktop && spotlightProperty && (
              <div className="ds-spotlight">
                <div className="ds-spotlight-banner">
                  <span>Te compartieron este departamento</span>
                  <button className="ds-spotlight-close" aria-label="Cerrar destacado" onClick={() => setSpotlightId(null)}>&times;</button>
                </div>
                <VentaCard property={spotlightProperty} isFavorite={favorites.has(spotlightProperty.id)}
                  onToggleFavorite={onCardToggleFavorite} onShare={onCardShare}
                  onPhotoTap={onCardPhotoTap} onDetails={onCardOpenSheet}
                  brokerMode={brokerMode} onAddToShortlist={onCardAddToShortlist} publicShareMode={publicShareMode} contactoDirecto={contactoDirecto} brokerInfo={brokerInfoProp} publicShareBroker={publicShareBrokerProp} priceSnapshot={priceSnapshotsMap ? priceSnapshotsMap[spotlightProperty.id] : null}
                  brokerComment={itemCommentsMap ? itemCommentsMap[spotlightProperty.id] : null}
                  isDestacada={itemsDestacadaMap ? itemsDestacadaMap[spotlightProperty.id] === true : false}
                  onReport={brokerMode && !publicShareMode && brokerSlug ? onCardReport : undefined}
                  isReported={reportedIds.has(spotlightProperty.id)} />
                <div className="ds-spotlight-sep">
                  <span className="ds-spotlight-line" /><span className="ds-spotlight-text">Explorar más departamentos</span><span className="ds-spotlight-line" />
                </div>
              </div>
            )}
            {/* ===== Layout split: buscador+pills+lista densa | panel derecho (mapa+mercado ↔ side sheet) ===== */}
            {splitDesktop && viewMode === 'grid' && !loadError && (
              <div className={`vd-cols ${listOnly ? 'vd-cols-solo' : ''}`}>
                <div className="vd-left">
                  {/* Buscador natural ancho — arriba de la lista, como la referencia */}
                  <div className="dsk-search vd-search">
                    <form className="dsk-search-box" onSubmit={(e) => { e.preventDefault(); handleNaturalSearch(natQuery, true); (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur() }}>
                      <svg className="dsk-search-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input className="dsk-search-input" type="search" enterKeyHint="search" value={natQuery} ref={dSearchRef}
                        onChange={(e) => handleNaturalSearch(e.target.value, false)} />
                      {natQuery && <button type="button" className="dsk-search-clear" aria-label="Limpiar" onClick={() => { setNatQuery(''); setNatChips([]); setNatAviso(null) }}>&times;</button>}
                    </form>
                    {natChips.length > 0 && <div className="dsk-search-chips">{natChips.map(c => <span key={c} className="mfh-chip">{c}</span>)}</div>}
                    {natAviso === 'moneda' && <div className="dsk-search-aviso">Los precios de venta van en $us — el monto en Bs no se aplicó.</div>}
                    {natAviso === 'alquiler' && <a className="dsk-search-aviso dsk-search-link" href="/alquileres">Parece que buscás alquilar → Ver alquileres</a>}
                    {/* Módulo guiado: pills sugeridas mientras no hay búsqueda ni filtros */}
                    {!isFiltered && !natQuery && (
                      <div className="dsk-pills">
                        {['2 dorm en Sirari', 'Hasta 120 mil', 'Preventa en Eq. Norte', 'Monoambiente con parqueo', 'Entrega inmediata'].map(s => (
                          <button key={s} type="button" className="dsk-pill" onClick={() => handleNaturalSearch(s, true)}>{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Barra sticky: pills de filtro + toggle + contador quedan
                      pegados bajo el nav al scrollear (herramienta de uso
                      repetido). El buscador ancho y el H1 scrollean. */}
                  <div className="vd-sticky">
                  {/* Fila de pills de filtros */}
                  <FilterPillsVentas key={`fp-${filterComponentVersion}`} currentFilters={filters} isFiltered={isFiltered}
                    onApply={applyFilters} onReset={resetFilters} proyectoNames={proyectoNames}
                    amenSel={amenSel} onAmenToggle={toggleAmen} priceValues={priceValues} />
                  {/* Título + contador + toggle lista|mixto|mapa */}
                  <div className="vd-count-row">
                    <h1 className="vd-h1">Departamentos en venta en {filters.zonas_permitidas?.length ? filters.zonas_permitidas.map(z => displayZona(z)).join(', ') : 'Equipetrol'}</h1>
                    <span className="vd-count-num2"><b>{amenActivo ? confirmados.length : displayedProperties.length}</b> {amenActivo ? `de ${displayedProperties.length}` : isFiltered ? `de ${unfilteredCount}` : 'activos'}</span>
                    <div className="vd-viewtoggle" role="tablist" aria-label="Modo de vista">
                      <button type="button" title="Solo lista" aria-selected={listOnly} className={`vd-vt-btn ${listOnly ? 'active' : ''}`}
                        onClick={() => { setListOnly(true); trackEvent('switch_view_venta', { view_mode: 'lista' }) }}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                      </button>
                      <button type="button" title="Lista + mapa" aria-selected={!listOnly} className={`vd-vt-btn ${!listOnly ? 'active' : ''}`}
                        onClick={() => { setListOnly(false); trackEvent('switch_view_venta', { view_mode: 'mixto' }) }}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>
                      </button>
                      <button type="button" title="Solo mapa" className="vd-vt-btn"
                        onClick={() => { setViewMode('map'); trackEvent('switch_view_venta', { view_mode: 'map', origen: 'toggle' }) }}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                      </button>
                    </div>
                  </div>
                  </div>
                <div className="vd-list">
                  {loading && displayedProperties.length === 0 && <div className="ventas-status" style={{ minHeight: 160 }}>Cargando departamentos en venta...</div>}
                  {!loading && displayedProperties.length === 0 && <div className="ventas-status" style={{ minHeight: 160 }}>{buildEmptyMessage(filters)}</div>}
                  {spotlightProperty && (
                    <div className="vd-spotlight">
                      <div className="ds-spotlight-banner">
                        <span>Te compartieron este departamento</span>
                        <button className="ds-spotlight-close" aria-label="Cerrar destacado" onClick={() => setSpotlightId(null)}>&times;</button>
                      </div>
                      <VentaListCard property={spotlightProperty} isFavorite={favorites.has(spotlightProperty.id)}
                        isActive={sheetOpen && sheetProperty?.id === spotlightProperty.id}
                        marketChip={cardChips?.get(spotlightProperty.id) ?? null}
                        onToggleFavorite={onCardToggleFavorite} onOpen={onCardOpenSheet} onHover={onCardHover} />
                    </div>
                  )}
                  {amenActivo && (
                    <div className="vd-amen-note">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
                      <span>Mostramos los {confirmados.length} que {confirmados.length === 1 ? 'confirma' : 'confirman'} <b>{[...amenSel].join(' · ')}</b> en el aviso. Algún depto podría tenerla sin listarla.</span>
                    </div>
                  )}
                  {(spotlightProperty ? confirmados.filter(p => p.id !== spotlightId) : confirmados).map(p => (
                    <VentaListCard key={p.id} property={p} isFavorite={favorites.has(p.id)}
                      isActive={sheetOpen && sheetProperty?.id === p.id}
                      marketChip={cardChips?.get(p.id) ?? null}
                      onToggleFavorite={onCardToggleFavorite} onOpen={onCardOpenSheet} onHover={onCardHover} />
                  ))}
                </div>
                </div>
                {!listOnly && (
                <div className="vd-panel">
                  {/* Mapa + resumen de mercado del filtro actual. El detalle de
                      propiedad ya NO vive en esta columna: es un modal centrado
                      (BottomSheet sideMode) renderizado aparte, con overlay.
                      El mapa nunca se desmonta (crash Leaflet _leaflet_pos). */}
                  <div className="vd-panel-home">
                      <div className="vd-map">
                        <VentaMap properties={confirmados}
                          onSelectProperty={onPanelMapSelect}
                          selectedId={hoveredId} />
                        <button className="vd-map-full" onClick={() => { setViewMode('map'); trackEvent('switch_view_venta', { view_mode: 'map', origen: 'panel' }) }}>
                          Ver mapa completo
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </button>
                      </div>
                      {panelMarketSummary && (
                        <div className="vd-mkt">
                          <div className="vd-mkt-head">
                            <div>
                              <div className="vd-mkt-title">Mercado de ventas</div>
                              <div className="vd-mkt-sub">{filters.zonas_permitidas?.length ? filters.zonas_permitidas.map(z => displayZona(z)).join(', ') : 'Equipetrol'} · publicaciones activas</div>
                            </div>
                            <a className="vd-mkt-link" href="/mercado/equipetrol/ventas">Ver mercado completo →</a>
                          </div>
                          <div className="vd-mkt-stats">
                            <div className="vd-mkt-stat">
                              <span className="vd-mkt-num">{panelMarketSummary.count}</span>
                              <span className="vd-mkt-label">ventas activas con este filtro</span>
                            </div>
                            {panelMarketSummary.mediana !== null && (
                              <div className="vd-mkt-stat">
                                <span className="vd-mkt-num">$us {panelMarketSummary.mediana.toLocaleString('en-US')}/m²</span>
                                <span className="vd-mkt-label">mediana · rango $us {panelMarketSummary.rangoLow!.toLocaleString('en-US')} — {panelMarketSummary.rangoHigh!.toLocaleString('en-US')}/m²</span>
                              </div>
                            )}
                            {panelMarketSummary.preventaPct !== null && (
                              <div className="vd-mkt-stat">
                                <span className="vd-mkt-num">{panelMarketSummary.preventaPct}%</span>
                                <span className="vd-mkt-label">preventa detectada en publicaciones</span>
                              </div>
                            )}
                          </div>
                          <div className="vd-mkt-caveat">
                            {panelMarketSummary.mediana === null
                              ? 'Pocas publicaciones con este filtro para calcular mediana y rango.'
                              : `Análisis basado en ${panelMarketSummary.count} publicaciones activas de venta. El precio por m² varía según acabados, amenidades y desarrollador.`}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
                )}
              </div>
            )}
            {!splitDesktop && displayedProperties.length > 0 && viewMode === 'grid' && (
              <div className="ventas-grid">
                {shortlistRedesign && !isDesktop && shortlistStats && (
                  <ShortlistContextSummary
                    variant="venta"
                    stats={shortlistStats}
                    hasFavorites={favorites.size > 0}
                    expandSignal={contextExpandSignal}
                  />
                )}
                {(spotlightProperty ? displayedProperties.filter(p => p.id !== spotlightId) : displayedProperties).map((p, idx) => (
                  <VentaCard key={p.id} property={p} isFavorite={favorites.has(p.id)} isFirst={idx === 0}
                    onToggleFavorite={onCardToggleFavorite} onShare={onCardShare}
                    onPhotoTap={onCardPhotoTap} onDetails={onCardOpenSheet}
                    brokerMode={brokerMode} onAddToShortlist={onCardAddToShortlist} publicShareMode={publicShareMode} contactoDirecto={contactoDirecto} brokerInfo={brokerInfoProp} publicShareBroker={publicShareBrokerProp} priceSnapshot={priceSnapshotsMap ? priceSnapshotsMap[p.id] : null}
                    brokerComment={itemCommentsMap ? itemCommentsMap[p.id] : null}
                    isDestacada={itemsDestacadaMap ? itemsDestacadaMap[p.id] === true : false}
                    onReport={brokerMode && !publicShareMode && brokerSlug ? onCardReport : undefined}
                    isReported={reportedIds.has(p.id)} />
                ))}
              </div>
            )}
            {brokerMode && fuentesPermitidas.size === 0 && (
              <div className="ventas-status">Activá al menos una fuente arriba para ver propiedades.</div>
            )}
            {brokerMode && fuentesPermitidas.size > 0 && onlySelectedFilter && displayedProperties.length === 0 && (
              <div className="ventas-status">No hay propiedades marcadas que cumplan los filtros actuales.</div>
            )}
            {brokerMode && fuentesPermitidas.size > 0 && !onlySelectedFilter && displayedProperties.length === 0 && properties.length > 0 && (
              <div className="ventas-status">No hay propiedades de las fuentes seleccionadas.</div>
            )}
            {displayedProperties.length > 0 && viewMode === 'map' && (
              <div className="ventas-map-container">
                <VentaMap properties={confirmados} onSelectProperty={(id) => setMapSelectedId(id)} selectedId={mapSelectedId} />
                {mapSelectedId && (() => {
                  const sp = properties.find(x => x.id === mapSelectedId)
                  if (!sp) return null
                  return <MapFloatCard property={sp} isFavorite={favorites.has(sp.id)} onClose={() => setMapSelectedId(null)} onOpenDetail={() => { setMapSelectedId(null); openSheet(sp) }} onToggleFavorite={() => toggleFavorite(sp.id)} mobile={!isDesktop} />
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
        <main style={{ ['--mfh-h' as any]: 'calc(104px + env(safe-area-inset-top))' }}>
          {/* Header sticky — redesign mobile (logo · perfil · hamburguesa · buscador nativo) */}
          <header className="mfh">
            <div className="mfh-top">
              <a href="/" className="mfh-brand" aria-label="Simon inicio">
                <span className="mfh-logo" aria-hidden="true" />
                <span className="mfh-brand-text">Simon</span>
              </a>
              <div className="mfh-icons">
                <button className="mfh-icon" aria-label="Tu cuenta" onClick={() => setProfileOpen(true)}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
                </button>
                <button className="mfh-icon" aria-label="Menú" onClick={() => setMenuOpen(true)}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="mfh-search-row">
              <form className="mfh-search" onSubmit={(e) => { e.preventDefault(); handleNaturalSearch(natQuery, true); (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur() }}>
                <svg className="mfh-search-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input className="mfh-search-input" type="search" enterKeyHint="search" value={natQuery} ref={mSearchRef}
                  onChange={(e) => handleNaturalSearch(e.target.value, false)} />
                {natQuery && <button type="button" className="mfh-search-clear" aria-label="Limpiar búsqueda" onClick={() => { setNatQuery(''); setNatChips([]); setNatAviso(null) }}>&times;</button>}
              </form>
              <button className="mfh-filter-btn" aria-label="Filtros" onClick={() => { setFilterOverlayOpen(true); trackEvent('open_filter_overlay_venta') }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/><circle cx="9" cy="6" r="2" fill="#141414"/><circle cx="15" cy="12" r="2" fill="#141414"/><circle cx="12" cy="18" r="2" fill="#141414"/></svg>
                {activeFilterCount > 0 && <span className="mfh-filter-badge">{activeFilterCount}</span>}
              </button>
            </div>
            {(natChips.length > 0 || natAviso) && (
              <div className="mfh-under">
                {natChips.length > 0 && <div className="mfh-chips"><span className="mfh-chips-label">Entendí:</span>{natChips.map(c => <span key={c} className="mfh-chip">{c}</span>)}</div>}
                {natAviso === 'moneda' && <div className="mfh-aviso">Los precios de venta van en $us — el monto en Bs no se aplicó.</div>}
                {natAviso === 'alquiler' && <a className="mfh-aviso mfh-aviso-link" href="/alquileres">Parece que buscás alquilar → Ver alquileres</a>}
              </div>
            )}
          </header>

          {/* Card counter */}
          {properties.length > 0 && (
            <div className="mt-counter">{activeCardIndex + 1} / {feedItems.length}</div>
          )}

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
                <VentaMap properties={confirmados} onSelectProperty={(id) => setMapSelectedId(id)} selectedId={mapSelectedId} />
                {mapSelectedId && (() => {
                  const sp = displayedProperties.find(x => x.id === mapSelectedId)
                  if (!sp) return null
                  return <MapFloatCard mobile property={sp} isFavorite={favorites.has(sp.id)} onClose={() => setMapSelectedId(null)} onOpenDetail={() => { setMapSelectedId(null); setMobileMapOpen(false); openSheet(sp) }} onToggleFavorite={() => toggleFavorite(sp.id)} />
                })()}
              </div>
            </div>
          )}

          {/* TikTok feed */}
          <div className={`mt-feed ${!brokerMode ? 'mt-feed-compare' : ''}`} ref={feedRef}>
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
                isSpotlight={item.isSpotlight} isFirst={idx === 0} showSwipeHint={idx === swipeHintIdx}
                onToggleFavorite={onCardToggleFavorite} onShare={onCardShare}
                onPhotoTap={onCardPhotoTap} onDetails={onCardOpenSheet} onMap={onCardMap}
                brokerMode={brokerMode} onAddToShortlist={onCardAddToShortlist} publicShareMode={publicShareMode} contactoDirecto={contactoDirecto} brokerInfo={brokerInfoProp} publicShareBroker={publicShareBrokerProp} priceSnapshot={priceSnapshotsMap ? priceSnapshotsMap[p.id] : null}
                brokerComment={itemCommentsMap ? itemCommentsMap[p.id] : null}
                isDestacada={itemsDestacadaMap ? itemsDestacadaMap[p.id] === true : false}
                onReport={brokerMode && !publicShareMode && brokerSlug ? onCardReport : undefined}
                isReported={reportedIds.has(p.id)} marketChip={cardChips?.get(p.id) ?? null} />
            })}
          </div>

          {/* Barra fija inferior — Ver mapa (card activa) + comparación.
              Reemplaza los botones flotantes sobre la card. */}
          {properties.length > 0 && (() => {
            const ac = feedItems[activeCardIndex]?.data
            const conGps = ac && ac.latitud && ac.longitud
            return (
              <div className="mt-bottombar">
                <button className="mt-bb-map" disabled={!conGps} onClick={() => conGps && openCardMap(ac)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ width: 17, height: 17 }}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                  Ver mapa
                </button>
                <div className="mt-bb-right">
                  {favorites.size === 0 && (
                    <span className="mt-bb-hint">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ width: 14, height: 14, flexShrink: 0 }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                      Guardá para comparar
                    </span>
                  )}
                  {favorites.size === 1 && (
                    <>
                      <span className="mt-bb-hint mt-bb-hint-active">
                        <svg viewBox="0 0 24 24" fill="#3A6A48" stroke="none" style={{ width: 14, height: 14, flexShrink: 0 }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                        1 favorito · guardá otro
                      </span>
                      <button className="mt-bb-clear" aria-label="Quitar favorito" onClick={() => setFavorites(new Set())}>&times;</button>
                    </>
                  )}
                  {favorites.size >= 2 && (
                    <>
                      <button className="mt-bb-cmp" onClick={openCompare}>
                        Comparar {favorites.size}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: 15, height: 15 }}><path d="M9 18l6-6-6-6"/></svg>
                      </button>
                      <button className="mt-bb-clear" aria-label="Limpiar favoritos" onClick={() => { setFavorites(new Set()); showToast('Favoritos limpiados') }}>&times;</button>
                    </>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Drawer menú hamburguesa — intenciones inmobiliarias primero */}
          {menuDrawer}

          {/* Drawer perfil — sin login: favoritos guardados en el dispositivo */}
          {profileDrawer}
        </main>
      )}

      <style jsx global>{`
        body { background: #EDE8DC; margin: 0; }
        @media (max-width: 767px) { body { overflow: hidden; } }

        /* ===== DESKTOP LAYOUT ===== */
        .ventas-desktop { display:flex; min-height:100vh; font-family:'DM Sans',sans-serif; color:#EDE8DC }
        .ventas-desktop-public .ventas-main { margin-left:0 !important; padding-top:80px !important }
        .ventas-desktop-public .ventas-grid { grid-template-columns:repeat(auto-fill,minmax(280px,1fr)) }
        /* Shortlist mobile (rediseño, NO demo): header compacto 56px + barra
           inferior. El resumen (primer item del grid) queda bajo el header. */
        @media (max-width:767px) {
          .vt-shortlist-redesign.ventas-desktop-public .ventas-main { padding-top:56px !important; padding-bottom:calc(84px + env(safe-area-inset-bottom)) !important }
          .vt-shortlist-redesign.ventas-desktop-public .ventas-grid { gap:14px; padding-left:12px; padding-right:12px }
        }
        /* Broker en mobile: mismo layout que public share — grid simple sin sidebar */
        .ventas-desktop-broker-mobile .ventas-main { margin-left:0 !important; padding-top:144px !important; padding:144px 12px 24px !important }
        .ventas-desktop-broker-mobile .ventas-grid { grid-template-columns:1fr; gap:14px }
        /* Link público venta /b/[hash] — NEGRO para que el cliente sienta el peso/elegancia
           de la decisión patrimonial. Alquiler usa header arena. */
        .vt-public-share-header { position:fixed; top:0; left:0; right:0; z-index:50; background:#141414; color:#EDE8DC; padding:10px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid rgba(237,232,220,0.08); font-family:'DM Sans',sans-serif; box-shadow:0 1px 6px rgba(0,0,0,0.4) }
        .vpsh-broker { display:flex; align-items:center; gap:10px; min-width:0 }
        .vpsh-broker-photo { width:44px; height:44px; border-radius:50%; object-fit:cover; display:block }
        .vpsh-broker-photo-ph { background:#7BB389; color:#141414; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:18px }
        .vpsh-broker-photo-demo { background:rgba(237,232,220,0.08); color:rgba(237,232,220,0.85); border:1.5px dashed rgba(237,232,220,0.45); font-size:9px; font-weight:500; letter-spacing:0.4px; text-transform:uppercase }
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
        .dsk-search { padding:4px 20px 16px; border-bottom:1px solid rgba(237,232,220,0.06); margin-bottom:8px }
        .dsk-search-box { display:flex; align-items:center; gap:8px; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.16); border-radius:10px; padding:0 12px; height:40px }
        .dsk-search-box:focus-within { border-color:#7BB389 }
        .dsk-search-ico { color:#9A8E7A; flex:0 0 auto }
        .dsk-search-input { flex:1; min-width:0; background:none; border:none; outline:none; color:#EDE8DC; font-family:'DM Sans',sans-serif; font-size:13px; -webkit-appearance:none; appearance:none }
        .dsk-search-input::placeholder { color:#7A7060 }
        .dsk-search-input::-webkit-search-cancel-button { -webkit-appearance:none; appearance:none }
        .dsk-search-clear { background:none; border:none; color:#9A8E7A; font-size:20px; line-height:1; cursor:pointer; padding:0 2px }
        .dsk-search-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px }
        .dsk-search-aviso { display:block; font-size:12px; color:#B8AD9E; margin-top:8px; font-family:'DM Sans',sans-serif; text-decoration:none }
        .dsk-search-link { color:#7BB389; font-weight:500 }
        .ventas-main { margin-left:320px; flex:1; padding:24px; min-height:100vh; background:#1a1a1a }
        .ventas-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:24px; align-items:start }
        .ventas-map-container { height:calc(100vh - 80px); border-radius:14px; overflow:hidden; border:1px solid rgba(237,232,220,0.08); position:relative }
        .ventas-map-container .venta-map { position:absolute; inset:0 }
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

        /* ===== LAYOUT SPLIT DESKTOP (nav + buscador+pills + lista densa + panel derecho) ===== */
        .ventas-desktop-split .ventas-main { margin-left:0; padding-top:76px }
        .ventas-desktop-split .ventas-map-container { height:calc(100vh - 76px - 24px) }
        .vd-left { display:flex; flex-direction:column; gap:14px; min-width:0 }
        /* Barra sticky: pills + toggle + contador pegados bajo el nav (56px).
           Fondo sólido del main para tapar las cards que scrollean por detrás.
           z-index alto para ganarle a las cards; los popovers de las pills
           (z-80, hijos) siguen abriendo sobre todo. */
        .vd-sticky { position:sticky; top:56px; z-index:40; display:flex; flex-direction:column; gap:12px; background:#1a1a1a; padding:12px 0 12px; border-bottom:1px solid rgba(237,232,220,0.08) }
        .vd-search { padding:0; border-bottom:none; margin-bottom:0 }
        .vd-search .dsk-search-box { height:46px; border-radius:12px }
        .vd-count-row { display:flex; align-items:baseline; justify-content:space-between; gap:10px; font-family:'DM Sans',sans-serif; font-size:13px; color:#9A8E7A }
        .vd-count-row b { color:#EDE8DC; font-weight:600; font-variant-numeric:tabular-nums }
        .vd-h1 { font-family:'Figtree',sans-serif; font-size:22px; font-weight:500; color:#EDE8DC; margin:0; line-height:1.2; margin-right:auto }
        .vd-count-num2 { white-space:nowrap }
        /* Toggle lista | mixto | mapa */
        .vd-count-row { align-items:center }
        .vd-viewtoggle { display:inline-flex; gap:2px; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.12); border-radius:10px; padding:3px; flex-shrink:0 }
        .vd-vt-btn { width:32px; height:26px; display:flex; align-items:center; justify-content:center; background:none; border:none; border-radius:7px; color:#9A8E7A; cursor:pointer; transition:background 0.15s, color 0.15s }
        .vd-vt-btn:hover { color:#EDE8DC }
        .vd-vt-btn.active { background:rgba(237,232,220,0.12); color:#EDE8DC }
        /* Modo solo lista: sin panel, lista a 2 columnas (densidad máxima).
           Doble clase: gana en especificidad a .vd-cols sin depender del orden. */
        .vd-cols.vd-cols-solo { grid-template-columns:1fr }
        .vd-cols-solo .vd-list { display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:start }
        .vd-cols-solo .vd-list > .ventas-status, .vd-cols-solo .vd-spotlight { grid-column:1 / -1 }
        /* Chip fiduciario en card */
        .vlc-mkt { display:inline-flex; align-items:center; gap:6px; margin-top:7px; font-size:12px; color:#9A8E7A }
        .vlc-mkt::before { content:''; width:6px; height:6px; border-radius:50%; background:#7A7060; flex-shrink:0 }
        .vlc-mkt-bajo { color:#7BB389 }
        .vlc-mkt-bajo::before { background:#3A6A48 }
        /* Fila de pills de filtros */
        .vfp { display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-family:'DM Sans',sans-serif }
        .vfp-feed { display:inline-flex; align-items:center; gap:6px; background:#3A6A48; color:#EDE8DC; font-size:13px; font-weight:600; padding:8px 15px; border-radius:100px; letter-spacing:0.2px }
        .vfp-item { position:relative }
        .vfp-pill { display:inline-flex; align-items:center; gap:6px; background:rgba(237,232,220,0.05); border:1px solid rgba(237,232,220,0.16); color:#B8AD9E; font-family:'DM Sans',sans-serif; font-size:13px; padding:8px 14px; border-radius:100px; cursor:pointer; transition:color 0.15s, border-color 0.15s; white-space:nowrap }
        .vfp-pill:hover { color:#EDE8DC; border-color:rgba(237,232,220,0.35) }
        .vfp-pill.open { color:#EDE8DC; border-color:#7BB389 }
        .vfp-on { color:#7BB389; border-color:rgba(123,179,137,0.45); background:rgba(58,106,72,0.14); font-weight:600 }
        .vfp-pop { position:absolute; top:calc(100% + 8px); left:0; z-index:80; min-width:250px; background:#1e1e1e; border:1px solid rgba(237,232,220,0.14); border-radius:14px; padding:14px; box-shadow:0 12px 34px rgba(0,0,0,0.45) }
        .vfp-pop-precio { min-width:300px }
        .vfp-pop-mas { min-width:280px }
        .vfp-pop-amen { min-width:320px; max-width:360px }
        /* "Buscar edificio" — pill destacado (diferenciador de Simon) */
        .vfp-edificio { background:rgba(123,179,137,0.12); border-color:rgba(123,179,137,0.4); color:#9FC7AB; max-width:220px; overflow:hidden; text-overflow:ellipsis }
        .vfp-edificio:hover { border-color:rgba(123,179,137,0.6); color:#B9D9C2 }
        .vfp-edificio.vfp-on { background:#3A6A48; border-color:#3A6A48; color:#F4F1E9 }
        .vfp-edificio svg { flex-shrink:0 }
        .vfp-amen-wrap { display:flex; flex-wrap:wrap; gap:8px }
        .vfp-amen-chip { padding:7px 13px; border-radius:100px; border:1px solid rgba(237,232,220,0.14); background:transparent; color:#9A8E7A; font-size:13px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s }
        .vfp-amen-chip:hover { border-color:rgba(237,232,220,0.32); color:#EDE8DC }
        .vfp-amen-chip.active { background:#3A6A48; border-color:#3A6A48; color:#EDE8DC }
        .vfp-amen-note { display:flex; gap:8px; margin-top:14px; padding-top:12px; border-top:1px solid rgba(237,232,220,0.1); color:#9A8E7A }
        .vfp-amen-note svg { width:15px; height:15px; flex-shrink:0; margin-top:1px }
        .vfp-amen-note span { font-size:11.5px; line-height:1.5 }
        .vfp-amen-note b { font-weight:600; color:#B8AD9E }
        /* Aclaración fiduciaria del filtro de amenidades (lista densa, feed oscuro) */
        .vd-amen-note { display:flex; align-items:flex-start; gap:8px; padding:11px 14px; background:rgba(237,232,220,0.04); border:1px solid rgba(237,232,220,0.1); border-radius:12px; color:#9A8E7A; font-family:'DM Sans',sans-serif }
        .vd-amen-note svg { width:15px; height:15px; flex-shrink:0; margin-top:1px }
        .vd-amen-note span { font-size:12.5px; line-height:1.5 }
        .vd-amen-note b { font-weight:600; color:#B8AD9E }
        .vfp-pop-right { left:auto; right:0 }
        .vfp-pop .vf-label { margin-bottom:8px }
        .vfp-reset { background:none; border:none; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:12.5px; text-decoration:underline; cursor:pointer; padding:8px 6px; white-space:nowrap }
        .vfp-reset:hover { color:#EDE8DC }
        .vfp-orden { margin-left:auto }
        .vfp-orden .vfp-pill { background:transparent; border-color:transparent }
        .vfp-orden .vfp-pill:hover { border-color:rgba(237,232,220,0.2) }
        .vfp-orden-label { color:#7A7060; font-size:12px }
        .dsk-pills { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px }
        .dsk-pill { background:rgba(237,232,220,0.05); border:1px solid rgba(237,232,220,0.14); color:#B8AD9E; font-size:12px; font-family:'DM Sans',sans-serif; padding:5px 12px; border-radius:100px; cursor:pointer; transition:color 0.15s, border-color 0.15s }
        .dsk-pill:hover { color:#EDE8DC; border-color:#7BB389 }
        /* Lista = columna dominante (como la referencia); el panel mapa/sheet
           ocupa 380-520px a la derecha */
        /* Mixto rebalanceado: mapa más ancho (~52%) — es el diferenciador de
           decisión. Lista ~48%, mínimo 440px el panel. */
        .vd-cols { display:grid; grid-template-columns:minmax(0, 48fr) minmax(440px, 52fr); gap:20px; align-items:start }
        .vd-list { display:flex; flex-direction:column; gap:12px; min-width:0 }
        .vd-spotlight { display:flex; flex-direction:column; gap:10px; margin-bottom:4px }
        /* Card de lista densa */
        .vlc { display:flex; background:#1e1e1e; border:1px solid rgba(237,232,220,0.08); border-radius:14px; overflow:hidden; cursor:pointer; transition:border-color 0.15s, transform 0.15s; min-height:172px }
        .vlc:hover { border-color:rgba(237,232,220,0.25) }
        .vlc-active { border-color:#3A6A48; box-shadow:0 0 0 1px #3A6A48 }
        .vlc-photo { width:230px; min-width:230px; background-size:cover; background-position:center; background-color:#2a2a2a; position:relative }
        .vlc-nofoto { display:flex; align-items:center; justify-content:center; height:100%; color:#9A8E7A; font-size:12px; font-family:'DM Sans',sans-serif }
        .vlc-nav { position:absolute; top:50%; transform:translateY(-50%); width:28px; height:28px; border-radius:50%; background:rgba(20,20,20,0.65); border:none; cursor:pointer; display:none; align-items:center; justify-content:center; z-index:3; color:#EDE8DC }
        .vlc:hover .vlc-nav { display:flex }
        .vlc-nav svg { width:14px; height:14px }
        .vlc-nav-prev { left:6px }
        .vlc-nav-next { right:6px }
        .vlc-count { position:absolute; bottom:6px; left:6px; background:rgba(20,20,20,0.75); color:rgba(255,255,255,0.85); font-size:10px; padding:2px 7px; border-radius:100px; font-family:'DM Sans',sans-serif }
        /* "Nueva" sobre la foto (solo recientes) — señal de atención */
        .vlc-nueva { position:absolute; top:10px; left:10px; z-index:3; font-family:'DM Sans',sans-serif; font-size:10.5px; font-weight:600; color:#0A3D1E; background:#7BB389; padding:3px 9px; border-radius:100px; letter-spacing:0.2px }
        .vlc-reciente-badge { background:rgba(255,255,255,0.92); color:#3A6A48 }
        .vlc-body { flex:1; min-width:0; padding:14px 18px; display:flex; flex-direction:column; font-family:'DM Sans',sans-serif }
        /* Precio héroe + favorito */
        .vlc-toprow { display:flex; align-items:flex-start; justify-content:space-between; gap:8px }
        .vlc-price { font-family:'Figtree',sans-serif; font-size:22px; font-weight:600; color:#F2EEE4; font-variant-numeric:tabular-nums; line-height:1; white-space:nowrap }
        .vlc-pricesub { font-size:12.5px; color:#A99E8C; margin-top:3px; font-variant-numeric:tabular-nums }
        .vlc-fav { width:32px; height:32px; min-width:32px; border-radius:50%; background:none; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#A99E8C }
        .vlc-fav:hover { color:#EDE8DC }
        /* Specs core — iconos muteados legibles (estructura, no señal) */
        .vlc-specs { display:flex; gap:16px; margin-top:12px; font-size:13.5px; color:#D0C6B4 }
        .vlc-spec { display:inline-flex; align-items:center; gap:5px; font-variant-numeric:tabular-nums }
        .vlc-spec svg { width:16px; height:16px; color:#A99E8C; flex-shrink:0 }
        /* Inclusiones muteadas legibles (icono + label) */
        .vlc-incl { display:flex; gap:14px; margin-top:8px; font-size:12px; color:#A99E8C }
        .vlc-incl-item { display:inline-flex; align-items:center; gap:5px }
        .vlc-incl-item svg { width:15px; height:15px; color:#9BAF9F; flex-shrink:0 }
        /* Nombre · zona · #id — con piso de contraste (todo legible) */
        .vlc-name { font-family:'Figtree',sans-serif; font-size:15px; font-weight:500; color:#EDE8DC; line-height:1.3; margin-top:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
        .vlc-zona { font-family:'DM Sans',sans-serif; font-size:12.5px; font-weight:400; color:#9A8E7A }
        .vlc-id { font-size:11px; color:#877C6C }
        /* Señales de decisión: estado (texto, sin pill) + UN pill fiduciario */
        .vlc-signals { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-top:auto; padding-top:10px }
        .vlc-estado { font-size:11.5px; color:#A99E8C }
        .vlc-estado-pre { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:500; color:#D3AE6E }
        .vlc-estado-pre svg { width:13px; height:13px; flex-shrink:0 }
        .vlc-mkt2 { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:#A9CDB4; background:rgba(123,179,137,0.13); padding:4px 11px; border-radius:100px }
        .vlc-mkt2 svg { width:14px; height:14px; flex-shrink:0 }
        .vlc-mkt2-sobre { color:#C4BAA8; background:rgba(237,232,220,0.08) }
        /* Panel derecho */
        .vd-panel { position:sticky; top:76px; height:calc(100vh - 76px - 20px); display:flex; flex-direction:column; gap:16px; min-width:0 }
        .vd-panel-home { flex:1; min-height:0; display:flex; flex-direction:column; gap:16px }
        /* isolation: los z-index internos de Leaflet (panes 200-700) quedan
           encapsulados y no compiten con el overlay/modal del detalle */
        .vd-map { flex:1; min-height:260px; border-radius:14px; overflow:hidden; border:1px solid rgba(237,232,220,0.08); position:relative; z-index:1; isolation:isolate }
        .vd-map .venta-map { position:absolute; inset:0 }
        .vd-map-full { position:absolute; top:12px; right:12px; z-index:1100; display:inline-flex; align-items:center; gap:6px; background:#141414; color:#EDE8DC; border:1px solid rgba(237,232,220,0.15); padding:8px 14px; border-radius:100px; font-family:'DM Sans',sans-serif; font-size:12px; font-weight:600; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.35) }
        .vd-map-full:hover { background:#1e1e1e }
        .vd-mkt { flex:0 0 auto; background:#1e1e1e; border:1px solid rgba(237,232,220,0.08); border-radius:14px; padding:18px 20px; font-family:'DM Sans',sans-serif }
        .vd-mkt-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:14px }
        .vd-mkt-title { font-family:'Figtree',sans-serif; font-size:19px; font-weight:500; color:#EDE8DC }
        .vd-mkt-sub { font-size:12px; color:#9A8E7A; margin-top:2px }
        .vd-mkt-link { font-size:12px; color:#7BB389; text-decoration:none; font-weight:500; white-space:nowrap }
        .vd-mkt-link:hover { text-decoration:underline }
        .vd-mkt-stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:14px; margin-bottom:12px }
        .vd-mkt-stat { display:flex; flex-direction:column; gap:3px; border-left:2px solid rgba(58,106,72,0.6); padding-left:12px }
        .vd-mkt-num { font-family:'Figtree',sans-serif; font-size:20px; font-weight:500; color:#EDE8DC; font-variant-numeric:tabular-nums; line-height:1.1 }
        .vd-mkt-label { font-size:11.5px; color:#9A8E7A; line-height:1.35 }
        .vd-mkt-caveat { font-size:11.5px; color:#7A7060; line-height:1.45; border-top:1px solid rgba(237,232,220,0.06); padding-top:10px }
        /* ===== MODAL DE PROPIEDAD (desktop, estilo Zillow v4) =====
           Ventana grande centrada sobre el feed oscurecido (bs-overlay, z 500).
           Estructura fiel a Zillow: nav de anclas → FOTOS a todo el ancho
           (nada las tapa) → precio+números → dos columnas: contenido | tarjeta
           STICKY con solo lo esencial (WhatsApp + Compartir). Los wrappers
           bsm-body/main/aside son display:contents en mobile (cero cambio). */
        .bsm-body, .bsm-main, .bsm-aside { display:contents }
        .bs-venta.bs-side { position:fixed; inset:auto; top:3vh; bottom:3vh; left:50%; right:auto; transform:translateX(-50%); width:min(1120px, 94vw); max-height:none; overflow-y:auto; overflow-x:hidden; max-width:none; border-radius:16px; border:1px solid rgba(237,232,220,0.1); z-index:501; padding-bottom:32px; display:flex; flex-direction:column }
        .bs-venta.bs-side.open { transform:translateX(-50%) }
        .bs-venta.bs-side > * { order:3; flex-shrink:0 }
        .bs-venta.bs-side > .bsm-nav { order:0 }
        .bs-venta.bs-side > .bsm-photos { order:1 }
        .bs-venta.bs-side > .bs-dark-header { order:2 }
        /* Dos columnas debajo de las fotos: contenido | tarjeta sticky */
        .bs-venta.bs-side .bsm-body { display:flex; align-items:flex-start; gap:0 }
        .bs-venta.bs-side .bsm-main { display:block; flex:1; min-width:0 }
        /* align-self:stretch: la columna derecha mide lo mismo que el
           contenido — sin eso la tarjeta sticky no tiene recorrido */
        .bs-venta.bs-side .bsm-aside { display:block; width:312px; flex-shrink:0; padding:16px 20px 0 0; align-self:stretch }
        /* Nav de anclas sticky */
        .bsm-nav { position:sticky; top:0; z-index:30; display:flex; align-items:center; gap:4px; background:#141414; border-bottom:1px solid rgba(237,232,220,0.1); padding:8px 20px }
        .bsm-nav-link { background:none; border:none; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; padding:7px 10px; cursor:pointer; border-radius:8px; transition:color 0.15s }
        .bsm-nav-link:hover { color:#EDE8DC; background:rgba(237,232,220,0.05) }
        .bsm-nav-actions { margin-left:auto; display:flex; align-items:center; gap:6px }
        .bsm-nav-actions .bs-fav, .bsm-nav-actions .bs-close { width:32px; height:32px; border-radius:50%; background:rgba(237,232,220,0.07); border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#EDE8DC }
        .bsm-nav-actions .bs-close { font-size:20px; line-height:1 }
        .bsm-nav-actions .bs-fav:hover, .bsm-nav-actions .bs-close:hover { background:rgba(237,232,220,0.14) }
        .bs-venta.bs-side .bs-floating-actions { display:none }
        /* Franja de fotos a TODO el ancho: 1 grande + 4 chicas (como Zillow),
           altura fija. "Ver las N fotos" abre el visor a pantalla completa. */
        .bs-venta.bs-side .bsm-photos { position:relative; padding:14px 20px 6px }
        .bs-venta.bs-side .bsm-photos .bsg-scroll { display:grid; grid-template-columns:2fr 1fr 1fr; grid-template-rows:183px 183px; gap:8px; overflow:visible; scroll-snap-type:none }
        .bs-venta.bs-side .bsm-photos .bsg-slide { aspect-ratio:auto; height:100%; min-height:0; border-radius:10px; overflow:hidden }
        .bs-venta.bs-side .bsm-photos .bsg-slide:first-child { grid-row:1 / 3 }
        .bs-venta.bs-side .bsm-photos .bsg-slide:nth-child(n+6) { display:none }
        /* Pocas fotos: adaptar el grid para NO dejar celdas vacías (fondo).
           object-fit:cover ya evita deformar; acá evitamos los huecos. */
        .bs-venta.bs-side .bsm-photos-n1 .bsg-scroll { grid-template-columns:1fr; grid-template-rows:380px }
        .bs-venta.bs-side .bsm-photos-n1 .bsg-slide:first-child { grid-row:auto }
        .bs-venta.bs-side .bsm-photos-n2 .bsg-scroll { grid-template-columns:1fr 1fr; grid-template-rows:374px }
        .bs-venta.bs-side .bsm-photos-n2 .bsg-slide:first-child { grid-row:auto }
        .bs-venta.bs-side .bsm-photos-n3 .bsg-scroll { grid-template-columns:2fr 1fr; grid-template-rows:187px 187px }
        .bs-venta.bs-side .bsm-photos-n4 .bsg-scroll { grid-template-columns:1fr 1fr; grid-template-rows:187px 187px }
        .bs-venta.bs-side .bsm-photos-n4 .bsg-slide:first-child { grid-row:auto }
        /* Una sola foto: foto completa (contain) sobre fondo borroso de sí misma */
        .bs-venta.bs-side .bsm-photo-solo { position:relative; height:400px; padding:0; margin:14px 20px 6px; border-radius:12px; overflow:hidden; cursor:pointer; background:#EDE8DC }
        .bsm-photo-solo-bg { position:absolute; inset:0; background-size:cover; background-position:center; filter:blur(26px) brightness(0.9); transform:scale(1.2) }
        .bsm-photo-solo-img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; z-index:1 }
        .bs-venta.bs-side .bsm-photos .bsg-arrow, .bs-venta.bs-side .bsm-photos .bsg-counter, .bs-venta.bs-side .bsm-photos .bsg-dots { display:none }
        .bsm-verfotos { position:absolute; right:32px; bottom:18px; display:inline-flex; align-items:center; gap:7px; background:#141414; color:#EDE8DC; border:1px solid rgba(237,232,220,0.25); padding:8px 14px; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:12.5px; font-weight:600; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.4) }
        .bsm-verfotos:hover { background:#1e1e1e }
        /* Header: precio a la izquierda + números grandes a la derecha */
        .bs-venta.bs-side .bs-dark-header { display:grid; grid-template-columns:minmax(0,1fr) auto; column-gap:24px; align-items:center }
        .bs-venta.bs-side .bsm-stats { grid-column:2; grid-row:1 / span 3; display:flex; gap:26px }
        .bsm-stat { text-align:center }
        .bsm-stat b { display:block; font-family:'Figtree',sans-serif; font-size:26px; font-weight:600; color:#EDE8DC; line-height:1.1; font-variant-numeric:tabular-nums }
        .bsm-stat span { display:block; font-size:11.5px; color:#9A8E7A; margin-top:2px }
        .bs-venta.bs-side .bs-h-specs { display:none }
        .bs-venta.bs-side .bs-h-price { font-size:24px }
        /* Tarjeta sticky (el "Request a tour" de Zillow): arranca DEBAJO de
           las fotos y se queda pegada al scrollear. Solo WhatsApp+Compartir. */
        .bs-venta.bs-side .bs-sticky-footer { position:sticky; top:56px; bottom:auto; flex-direction:column; align-items:stretch; gap:8px; padding:16px; background:#1a1a1a; border:1px solid rgba(237,232,220,0.14); border-radius:14px; border-top:1px solid rgba(237,232,220,0.14); z-index:5 }
        /* Mapa mediano en la sección Ubicación del flujo */
        .bsm-flow-map { height:230px; border-radius:12px; overflow:hidden; border:1px solid rgba(237,232,220,0.1); position:relative; isolation:isolate }
        .bsm-flow-map .venta-map { position:absolute; inset:0 }
        /* Contenido izquierdo acotado a medida de lectura (~640px) centrado.
           La franja de fotos queda full-bleed (no lleva este padding). */
        .bs-venta.bs-side .bs-dark-header,
        .bs-venta.bs-side .bs-section {
          padding-left:max(24px, calc((100% - 640px) / 2));
          padding-right:max(24px, calc((100% - 640px) / 2));
        }
        .bs-venta.bs-side .bs-section, .bs-venta.bs-side .bs-dark-header { scroll-margin-top:54px }
        .bs-venta.bs-side .bsm-trust { font-size:12.5px; color:#9A8E7A; font-family:'DM Sans',sans-serif }
        /* Secciones compactas (el contenido base es de mobile) */
        .bs-venta.bs-side .bs-section { padding-top:13px; padding-bottom:13px }
        .bs-venta.bs-side .bs-sl { margin-bottom:8px }
        .bs-venta.bs-side .bs-grid { gap:8px; grid-template-columns:repeat(4,1fr) }
        .bs-venta.bs-side .bs-feat { flex-direction:row; justify-content:flex-start; gap:9px; padding:9px 12px; border-radius:10px }
        .bs-venta.bs-side .bs-fi { width:16px; height:16px; flex-shrink:0 }
        .bs-venta.bs-side .bs-fv { font-size:13.5px }
        /* Etiquetas fuera: "51m²", "1 dorm", "1 baño", "Piso 12" se explican
           solos. Excepción: parqueo ("1 incl.") necesita su etiqueta. */
        .bs-venta.bs-side .bs-fl { display:none }
        .bs-venta.bs-side .bs-feat.hl .bs-fl { display:block; font-size:11.5px }
        @media (max-width:1180px) {
          /* Angosto: columnas fuera, la tarjeta vuelve a ser barra inferior */
          .bs-venta.bs-side .bsm-body, .bs-venta.bs-side .bsm-main, .bs-venta.bs-side .bsm-aside { display:contents }
          .bs-venta.bs-side .bs-sticky-footer { position:sticky; top:auto; bottom:0; flex-direction:row; border-radius:0; border:none; border-top:1px solid rgba(237,232,220,0.08) }
        }

        /* ===== MODAL DESKTOP — TEMA CLARO (arena/salvia, como /alquileres) =====
           Todo scopeado a .bs-side → el sheet mobile sigue oscuro e intacto.
           Mayor especificidad que las reglas oscuras base, así que ganan. */
        .bs-venta.bs.bs-side { background:#FBFAF7; color:#3D3A33; border:1px solid #E0DACB; box-shadow:0 24px 80px rgba(20,20,20,0.30) }
        .bs-venta.bs-side .bsm-nav { background:#FBFAF7; border-bottom:1px solid #E7E1D3 }
        .bs-venta.bs-side .bsm-nav-link { color:#6B6862 }
        .bs-venta.bs-side .bsm-nav-link:hover { color:#141414; background:rgba(20,20,20,0.05) }
        .bs-venta.bs-side .bsm-nav-actions .bs-fav, .bs-venta.bs-side .bsm-nav-actions .bs-close { background:rgba(20,20,20,0.05); color:#55524A }
        .bs-venta.bs-side .bsm-nav-actions .bs-fav:hover, .bs-venta.bs-side .bsm-nav-actions .bs-close:hover { background:rgba(20,20,20,0.10) }
        .bs-venta.bs-side .bsm-verfotos { background:#FBFAF7; color:#3D3A33; border:1px solid rgba(20,20,20,0.18); box-shadow:0 4px 14px rgba(20,20,20,0.16) }
        .bs-venta.bs-side .bsm-verfotos:hover { background:#fff }
        /* Header claro — ahora vive en la columna izquierda (sin grid),
           los stats van con iconos debajo del precio */
        .bs-venta.bs-side .bs-dark-header { background:transparent; display:block; padding-top:26px }
        .bs-venta.bs-side .bsm-stats { display:flex; flex-wrap:wrap; gap:24px; grid-column:auto; grid-row:auto; margin-top:16px; padding-top:16px; border-top:1px solid #E7E1D3 }
        .bs-venta.bs-side .bsm-stat { display:flex; align-items:center; gap:9px; text-align:left }
        .bsm-stat-ico { width:22px; height:22px; color:#3A6A48; flex-shrink:0 }
        .bs-venta.bs-side .bsm-stat b { font-size:22px }
        .bs-venta.bs-side .bs-h-name { color:#141414; font-size:28px }
        .bs-venta.bs-side .bs-h-reciente { color:#3A6A48 }
        .bs-venta.bs-side .bs-h-zona { color:#6B6862 }
        .bs-venta.bs-side .bs-h-price { color:#141414 }
        .bs-venta.bs-side .bs-h-tc { color:#9A9384 }
        .bs-venta.bs-side .bs-h-sub { color:#6B6862; font-weight:400 }
        .bs-venta.bs-side .bs-tc-badge { background:#EDE8DC; color:#55524A }
        .bs-venta.bs-side .bsm-stat b { color:#141414 }
        .bs-venta.bs-side .bsm-stat span { color:#6B6862 }
        /* Inclusiones (equipado/parqueo/baulera) */
        .bsm-incl { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px }
        .bsm-incl-chip { display:inline-flex; align-items:center; gap:8px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; background:#EAF0EC; color:#2C5138; padding:7px 13px; border-radius:20px }
        .bsm-incl-chip svg { width:20px; height:20px; flex-shrink:0 }
        .bsm-opcional { display:flex; align-items:center; gap:8px; margin-top:12px; color:#6B6862; font-family:'DM Sans',sans-serif }
        .bsm-opcional svg { width:15px; height:15px; flex-shrink:0; color:#9A9384 }
        .bsm-opcional span { font-size:13px }
        .bsm-opcional b { font-weight:500; color:#141414; font-variant-numeric:tabular-nums }
        /* Secciones + etiquetas + chips */
        .bs-venta.bs-side .bs-section { background:transparent; border-bottom:1px solid #E7E1D3 }
        .bs-venta.bs-side .bs-sl { color:#3A6A48 }
        .bs-venta.bs-side .bs-sl-dot { background:#3A6A48 }
        .bs-venta.bs-side .bs-at { background:#EDE8DC; border:1px solid transparent; color:#55524A }
        .bs-venta.bs-side .bs-desc { color:#3D3A33 }
        .bs-venta.bs-side .bs-desc-more { color:#3A6A48 }
        .bs-venta.bs-side .bsm-trust { color:#9A9384 }
        /* Mercado claro */
        .bs-venta.bs-side .bs-mktv { background:#F4F1E9; border:1px solid #E7E1D3 }
        .bs-venta.bs-side .bs-mktv-label { color:#6B6862 }
        .bs-venta.bs-side .bs-mktv-value { color:#141414 }
        .bs-venta.bs-side .bs-mktv-this { flex-wrap:wrap }
        .bs-mktv-status { font-size:12px; background:#EAF0EC; color:#2C5138; padding:3px 10px; border-radius:20px; align-self:center }
        .bs-venta.bs-side .bs-mktv-zona { color:#3D3A33 }
        .bs-venta.bs-side .bs-mktv-zona b { color:#141414 }
        .bs-venta.bs-side .bs-mktv-bar { background:#E7E1D3 }
        .bs-venta.bs-side .bs-mktv-band { background:#3A6A48; opacity:0.28 }
        .bs-venta.bs-side .bs-mktv-marker { background:#141414; box-shadow:0 0 0 2px #F4F1E9 }
        .bs-venta.bs-side .bs-mktv-scale span { color:#9A9384 }
        .bs-venta.bs-side .bs-mktv-caveat { color:#9A9384; border-top:1px solid rgba(20,20,20,0.08) }
        .bs-venta.bs-side .bs-mktv-empty { color:#6B6862 }
        .bs-mktv-summary { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; padding-top:14px; border-top:1px solid rgba(20,20,20,0.08) }
        /* ===== Mercado v2 — versión clara para usuario común (modal desktop) ===== */
        .bs-mkt2 { font-family:'DM Sans',sans-serif }
        .bs-mkt2-verdict { display:flex; align-items:center; gap:11px; margin-bottom:4px }
        .bs-mkt2-vico { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:#EAF0EC; color:#3A6A48; flex-shrink:0 }
        .bs-mkt2-vico svg { width:16px; height:16px }
        .bs-mkt2-vtitle { font-family:'Figtree',sans-serif; font-size:18px; font-weight:500; color:#141414; line-height:1.2 }
        .bs-mkt2-vsub { font-size:13px; color:#6B6862; margin-top:2px }
        .bs-mkt2-gauge { margin:22px 0 4px }
        .bs-mkt2-ends { display:flex; justify-content:space-between; font-size:11px; color:#9A9384; margin-bottom:7px }
        .bs-mkt2-track { position:relative; height:52px }
        .bs-mkt2-track::before { content:''; position:absolute; top:20px; left:0; right:0; height:8px; background:#E7E1D3; border-radius:5px }
        .bs-mkt2-band { position:absolute; top:20px; height:8px; background:#BFD3C6; border-radius:5px }
        .bs-mkt2-pin { position:absolute; top:0; transform:translateX(-50%); line-height:0 }
        .bs-mkt2-here { position:absolute; top:22px; transform:translateX(-50%); font-size:12px; font-weight:500; color:#141414; white-space:nowrap }
        .bs-mkt2-tick { position:absolute; top:38px; transform:translateX(-50%); font-size:11px; color:#9A9384; white-space:nowrap }
        .bs-mkt2-compare { background:#F4F1E9; border-radius:10px; padding:12px 14px; margin-top:14px }
        .bs-mkt2-crow { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:4px 0 }
        .bs-mkt2-crow + .bs-mkt2-crow { border-top:0.5px solid #E7E1D3; margin-top:5px; padding-top:9px }
        .bs-mkt2-crow span { font-size:13px; color:#6B6862; padding-top:1px }
        .bs-mkt2-crow b { font-size:15px; font-weight:500; color:#141414; text-align:right; font-variant-numeric:tabular-nums }
        .bs-mkt2-crow em { font-style:normal; font-size:12px; font-weight:400; color:#6B6862 }
        .bs-mkt2-cval { display:flex; flex-direction:column; align-items:flex-end; gap:2px; font-variant-numeric:tabular-nums }
        .bs-mkt2-cval em { font-size:12px; color:#6B6862 }
        .bs-mkt2-note { display:flex; gap:8px; margin-top:14px; color:#9A9384 }
        .bs-mkt2-note svg { width:15px; height:15px; flex-shrink:0; margin-top:1px }
        .bs-mkt2-note span { font-size:12px; line-height:1.55 }
        .bs-mkt2-note b { font-weight:500; color:#6B6862 }
        .bs-venta.bs-side .bs-mkt2-summary, .bs-mkt2 .bs-mktv-summary { border-top-color:#E7E1D3 }
        .bs-mktv-sitem b { display:block; font-family:'Figtree',sans-serif; font-size:16px; font-weight:500; color:#141414; line-height:1.2 }
        .bs-mktv-sitem span { display:block; font-size:11px; color:#6B6862; margin-top:2px }
        /* Similares claro */
        .bs-venta.bs-side .bs-sim-card { background:#FFFFFF; border:1px solid #E7E1D3 }
        .bs-venta.bs-side .bs-sim-card:hover { border-color:#3A6A48 }
        .bs-venta.bs-side .bs-sim-thumb, .bs-venta.bs-side .bs-sim-nophoto { background:#E4DFD2 }
        .bs-venta.bs-side .bs-sim-name { color:#141414 }
        .bs-venta.bs-side .bs-sim-price { color:#3A6A48 }
        .bs-venta.bs-side .bs-sim-specs { color:#6B6862 }
        /* Preguntas claro */
        .bs-venta.bs-side .bs-q-hint { color:#9A9384 }
        .bs-venta.bs-side .bs-q-item { background:#FFFFFF; border:1px solid #E0DACB }
        .bs-venta.bs-side .bs-q-item.selected { border-color:#3A6A48; background:#EAF0EC }
        .bs-venta.bs-side .bs-q-check { border:1.5px solid #C9C1B0 }
        .bs-venta.bs-side .bs-q-check.checked { background:#3A6A48; border-color:#3A6A48 }
        .bs-venta.bs-side .bs-q-text { color:#141414 }
        /* Google Maps + Ver original claros */
        .bs-venta.bs-side .bs-gmaps-link { background:transparent; border:1px solid #D9D2C2; color:#141414 }
        .bs-venta.bs-side .bs-ver-original { background:transparent; border:none; color:#3A6A48; justify-content:center }
        /* Tarjeta sticky clara: WhatsApp salvia + Comparar + Compartir */
        .bs-venta.bs-side .bs-sticky-footer { background:#FFFFFF; border:1px solid #E0DACB; border-top:1px solid #E0DACB }
        .bs-venta.bs-side .bs-wsp-cta { background:#3A6A48; color:#F4F1E9 }
        .bs-venta.bs-side .bs-wsp-cta svg { fill:#F4F1E9 }
        .bs-compare-btn { display:flex; align-items:center; justify-content:center; gap:8px; padding:11px; background:transparent; border:1px solid #B9CDBF; border-radius:10px; color:#3A6A48; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; cursor:pointer; transition:background 0.15s }
        .bs-compare-btn:hover { background:#EAF0EC }
        .bs-venta.bs-side .bs-share-btn { border:1px solid #D9D2C2; color:#55524A }
        .bs-venta.bs-side .bsm-flow-map { height:420px; border:1px solid #E0DACB }
        /* ===== Pasada UX de tipografía (modal claro) — escala consistente =====
           Body 14px (el modal es amplio, 13px se leía chico), meta 13px,
           fine print 12px. Botones: mismo tamaño/caja, jerarquía por peso. */
        .bs-venta.bs-side .bs-h-tc { font-size:12px }
        .bs-venta.bs-side .bs-h-sub { font-size:14px }
        .bs-venta.bs-side .bs-at { font-size:13px }
        .bs-venta.bs-side .bsm-incl-chip { font-size:13px }
        /* "Lo que la hace especial" (no canónicas) — pills con chispita */
        .bsm-especial { display:flex; flex-wrap:wrap; gap:10px }
        .bsm-especial-pill { display:inline-flex; align-items:center; gap:8px; background:#FFFFFF; border:0.5px solid #D7CDB8; border-radius:12px; padding:10px 14px; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; color:#141414 }
        .bsm-especial-ico { width:17px; height:17px; color:#3A6A48; flex-shrink:0 }
        /* "Todas las comodidades" (canónicas) — grilla icono + label */
        .bsm-comod-group + .bsm-comod-group { margin-top:16px }
        .bsm-comod-cat { font-size:13px; color:#3D3A33; margin-bottom:12px; font-family:'DM Sans',sans-serif }
        .bsm-comod-grid { display:grid; grid-template-columns:1fr 1fr; gap:13px 18px }
        .bsm-comod-item { display:flex; align-items:center; gap:11px; font-family:'DM Sans',sans-serif; font-size:14px; color:#141414 }
        .bsm-comod-ico { width:20px; height:20px; color:#3A6A48; flex-shrink:0 }
        .bs-venta.bs-side .bs-desc { font-size:14px; line-height:1.6 }
        .bs-venta.bs-side .bs-mktv-label { font-size:14px }
        .bs-venta.bs-side .bs-mktv-zona { font-size:13.5px }
        .bs-venta.bs-side .bs-q-text { font-size:14px; font-weight:400 }
        .bs-venta.bs-side .bs-q-hint { font-size:12px }
        .bs-venta.bs-side .bs-sim-name { font-size:14px; font-weight:500 }
        .bs-venta.bs-side .bs-sim-price { font-size:14px; font-weight:600 }
        .bs-venta.bs-side .bs-sim-specs { font-size:12.5px }
        /* Botones de la tarjeta sticky: misma caja; jerarquía por peso */
        .bs-venta.bs-side .bs-sticky-footer .bs-wsp-cta,
        .bs-venta.bs-side .bs-sticky-footer .bs-compare-btn,
        .bs-venta.bs-side .bs-sticky-footer .bs-share-btn { font-size:14px; padding:12px; min-height:46px; gap:8px; border-radius:10px }
        .bs-venta.bs-side .bs-sticky-footer .bs-wsp-cta { font-weight:600 }
        .bs-venta.bs-side .bs-sticky-footer .bs-compare-btn,
        .bs-venta.bs-side .bs-sticky-footer .bs-share-btn { font-weight:500 }
        /* Enlaces-acción del flujo: mismo tamaño (Google Maps, Ver original) */
        .bs-venta.bs-side .bs-gmaps-link { font-size:14px; font-weight:500; padding:13px }
        .bs-venta.bs-side .bs-ver-original { font-size:14px; font-weight:500; padding:12px }

        /* Reorden del modal desktop (mobile = display:contents, ignora order):
           Edificio → Departamento → Sobre → Ubicación → Mercado → Similares
           → Preguntas → Ver original */
        .bs-venta.bs-side .bsm-main { display:flex; flex-direction:column }
        .bs-venta.bs-side #bsm-sec-especial { order:1 }
        .bs-venta.bs-side #bsm-sec-comod { order:2 }
        .bs-venta.bs-side #bsm-sec-desc { order:3 }
        .bs-venta.bs-side .bsm-trust { order:4 }
        .bs-venta.bs-side #bsm-sec-ubic { order:5 }
        .bs-venta.bs-side .bsm-ubic-link { order:6 }
        .bs-venta.bs-side #bsm-sec-mercado { order:7 }
        .bs-venta.bs-side #bsm-sec-similares { order:8 }
        .bs-venta.bs-side #bsm-sec-preguntas { order:9 }
        .bs-venta.bs-side .bsm-sec-original { order:10 }

        /* ===== P3b — Sheet mobile RICO (tema OSCURO ventas) =====
           Las secciones ricas del modal desktop (bsm-stats, inclusiones, split
           de comodidades, mercado v2 con medidor) ahora se renderizan también
           en el sheet mobile público (clase bs-rich) — acá se re-tematizan sobre
           el fondo oscuro (#1a1a1a). Preguntas/Similares/Maps/Ver-original/sticky
           ya tenían base oscura mobile, no necesitan override. */
        /* Header: nombre + precio en blanco puro (ancla); specs de texto ocultos
           (los reemplazan los stats con iconos) */
        .bs-venta.bs-rich .bs-h-name { color:#FFFFFF }
        .bs-venta.bs-rich .bs-h-reciente { color:#7BB389 }
        .bs-venta.bs-rich .bs-h-price { color:#FFFFFF }
        .bs-venta.bs-rich .bs-h-specs { display:none }
        /* Stats con iconos — sección propia debajo de la foto (la separación la
           da el padding de .bs-section, no un borde suelto) */
        .bs-venta.bs-rich .bsm-stats { display:flex; gap:0 }
        .bs-venta.bs-rich .bsm-stats-sec { padding-top:16px; padding-bottom:16px }
        .bs-venta.bs-rich .bsm-stat { flex:1; display:flex; flex-direction:column; align-items:flex-start; gap:5px; text-align:left }
        .bs-venta.bs-rich .bsm-stat-ico { width:19px; height:19px; color:#7BB389 }
        .bs-venta.bs-rich .bsm-stat b { font-size:17px; color:#FFFFFF }
        .bs-venta.bs-rich .bsm-stat span { font-size:11px; color:#9A8E7A }
        /* Inclusiones (chips) — sutiles sobre oscuro */
        .bs-venta.bs-rich .bsm-incl-chip { background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.1); color:#ECE6D8 }
        .bs-venta.bs-rich .bsm-incl-chip svg { color:#7BB389 }
        .bs-venta.bs-rich .bsm-opcional { color:#9A8E7A }
        .bs-venta.bs-rich .bsm-opcional b { color:#ECE6D8 }
        /* "Lo que la hace especial" — pills oscuras */
        .bs-venta.bs-rich .bsm-especial-pill { background:rgba(237,232,220,0.05); border:0.5px solid rgba(237,232,220,0.14); color:#ECE6D8 }
        .bs-venta.bs-rich .bsm-especial-ico { color:#7BB389 }
        /* "Todas las comodidades" — grilla icono + label */
        .bs-venta.bs-rich .bsm-comod-cat { color:#9A8E7A }
        .bs-venta.bs-rich .bsm-comod-item { color:#ECE6D8 }
        .bs-venta.bs-rich .bsm-comod-ico { color:#7BB389 }
        /* Cómo está el precio (mercado v2 con medidor) */
        .bs-venta.bs-rich .bs-mkt2-vico { background:rgba(123,179,137,0.16); color:#7BB389 }
        .bs-venta.bs-rich .bs-mkt2-vtitle { color:#FFFFFF }
        .bs-venta.bs-rich .bs-mkt2-vsub { color:#9A8E7A }
        .bs-venta.bs-rich .bs-mkt2-ends { color:#7A7060 }
        .bs-venta.bs-rich .bs-mkt2-track::before { background:rgba(237,232,220,0.1) }
        .bs-venta.bs-rich .bs-mkt2-band { background:rgba(123,179,137,0.3) }
        .bs-venta.bs-rich .bs-mkt2-pin { color:#7BB389 }
        .bs-venta.bs-rich .bs-mkt2-here { color:#ECE6D8 }
        .bs-venta.bs-rich .bs-mkt2-tick { color:#7A7060 }
        .bs-venta.bs-rich .bs-mkt2-compare { background:rgba(237,232,220,0.05) }
        .bs-venta.bs-rich .bs-mkt2-crow span { color:#9A8E7A }
        .bs-venta.bs-rich .bs-mkt2-crow b { color:#FFFFFF }
        .bs-venta.bs-rich .bs-mkt2-crow em { color:#9A8E7A }
        .bs-venta.bs-rich .bs-mkt2-crow + .bs-mkt2-crow { border-top-color:rgba(237,232,220,0.1) }
        .bs-venta.bs-rich .bs-mkt2-note { color:#9A8E7A }
        .bs-venta.bs-rich .bs-mkt2-note b { color:#B8AD9E }
        .bs-venta.bs-rich .bs-mktv-summary { border-top-color:rgba(237,232,220,0.1) }
        .bs-venta.bs-rich .bs-mktv-sitem b { color:#FFFFFF }
        .bs-venta.bs-rich .bs-mktv-sitem span { color:#9A8E7A }
        /* Sticky: Comparar tematizado oscuro (par de Compartir) */
        .bs-venta.bs-rich .bs-compare-btn { border:1px solid rgba(237,232,220,0.15); color:#ECE6D8; background:transparent }
        .bs-venta.bs-rich .bs-compare-btn:hover { background:rgba(237,232,220,0.06) }
        /* Compartir = SOLO ícono (como el mockup). Con los 3 botones + texto el
           sticky desbordaba a lo ancho en equipos <=360px (Fold/S8/12 mini) y el
           sheet scrolleaba en horizontal. Padding lateral menor por la misma razón. */
        .bs-venta.bs-rich .bs-sticky-footer { padding-left:14px; padding-right:14px; gap:8px }
        .bs-venta.bs-rich .bs-share-btn .bs-btn-label { display:none }
        .bs-venta.bs-rich .bs-share-btn { padding:12px; flex:0 0 auto; min-width:46px; justify-content:center }
        .bs-venta.bs-rich .bs-wsp-cta { min-width:0 }
        .bs-venta.bs-rich .bs-compare-btn { flex:0 0 auto; white-space:nowrap }
        /* Orden de secciones en mobile rico = mismo que el modal desktop:
           especial → comodidades → sobre → ubicación → mercado → similares →
           preguntas → ver original (bsm-main pasa de display:contents a flex col) */
        .bs-venta.bs-rich .bsm-main { display:flex; flex-direction:column }
        .bs-venta.bs-rich #bsm-sec-especial { order:1 }
        .bs-venta.bs-rich #bsm-sec-comod { order:2 }
        .bs-venta.bs-rich #bsm-sec-desc { order:3 }
        .bs-venta.bs-rich .bsm-trust { order:4 }
        .bs-venta.bs-rich #bsm-sec-ubic { order:5 }
        .bs-venta.bs-rich .bsm-ubic-link { order:6 }
        .bs-venta.bs-rich #bsm-sec-mercado { order:7 }
        .bs-venta.bs-rich #bsm-sec-similares { order:8 }
        .bs-venta.bs-rich #bsm-sec-preguntas { order:9 }
        .bs-venta.bs-rich .bsm-sec-original { order:10 }

        .bs-tabs { position:sticky; top:0; z-index:9; display:flex; gap:2px; background:#141414; border-bottom:1px solid rgba(237,232,220,0.1); padding:0 16px }
        .bs-tab { flex:1; background:none; border:none; border-bottom:2px solid transparent; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; padding:11px 4px; cursor:pointer; transition:color 0.15s }
        .bs-tab:hover { color:#EDE8DC }
        .bs-tab.active { color:#7BB389; border-bottom-color:#7BB389; font-weight:600 }
        .bs-compra-rows { display:flex; flex-direction:column }
        .bs-compra-row { display:flex; align-items:baseline; justify-content:space-between; gap:14px; padding:9px 0; border-bottom:1px solid rgba(237,232,220,0.06); font-family:'DM Sans',sans-serif }
        .bs-compra-row span { font-size:13px; color:#9A8E7A }
        .bs-compra-row b { font-size:13.5px; color:#EDE8DC; font-weight:500; text-align:right; font-variant-numeric:tabular-nums }
        .bs-compra-caveat { font-size:11.5px; color:#7A7060; margin-top:12px; line-height:1.45 }
        .bs-compra-soon { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:14px; padding:12px 14px; border-radius:10px; background:rgba(237,232,220,0.04); border:1px dashed rgba(237,232,220,0.15); color:#9A8E7A; font-size:13px; font-family:'DM Sans',sans-serif }
        .bs-compra-soon em { font-style:normal; font-size:10px; font-weight:600; color:#9A8E7A; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.12); padding:2px 8px; border-radius:100px }
        /* Bandeja comparar en split: anclada a la columna de lista, no tapa panel */
        .vt-tray-split { left:24px; transform:none; bottom:20px }
        .vt-tray-thumbs { display:inline-flex; align-items:center; gap:4px; margin-right:10px }
        .vt-tray-thumb { position:relative; width:30px; height:30px; border-radius:8px; background-size:cover; background-position:center; background-color:#2a2a2a; border:1px solid rgba(237,232,220,0.2); display:inline-flex; align-items:flex-end; justify-content:flex-start }
        .vt-tray-thumb em { font-style:normal; font-size:8px; font-weight:700; color:#EDE8DC; background:rgba(20,20,20,0.8); border-radius:4px 0 0 0; padding:1px 4px; line-height:1 }

        /* ===== MOBILE TIKTOK LAYOUT ===== */
        .mt-top-bar { position:fixed; top:0; left:0; right:0; z-index:50; display:flex; align-items:center; justify-content:center; padding:10px 16px; padding-top:max(10px, env(safe-area-inset-top)); pointer-events:none }
        .mt-top-bar > * { pointer-events:auto }
        .mt-search-pill { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.15); padding:8px 16px; border-radius:100px; border:none; cursor:pointer; position:relative; max-width:80vw }
        .mt-search-text { font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; color:rgba(255,255,255,0.7); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:0.2px }
        .mt-search-dot { position:absolute; top:5px; right:5px; width:6px; height:6px; background:#3A6A48; border-radius:50% }

        /* ===== Header rediseño mobile (mfh-*) ===== */
        .mfh { position:fixed; top:0; left:0; right:0; z-index:60; background:#141414; border-bottom:1px solid rgba(237,232,220,0.08); padding-top:env(safe-area-inset-top) }
        .mfh-top { display:flex; align-items:center; justify-content:space-between; padding:8px 14px 4px }
        .mfh-brand { display:flex; align-items:center; gap:8px; text-decoration:none }
        .mfh-logo { width:22px; height:22px; border-radius:50%; background:#EDE8DC; position:relative; flex:0 0 auto }
        .mfh-logo::after { content:''; position:absolute; top:4px; left:4px; width:8px; height:8px; border-radius:50%; background:#3A6A48 }
        .mfh-brand-text { font-family:'Figtree',sans-serif; font-size:20px; font-weight:500; color:#EDE8DC; letter-spacing:0.2px }
        .mfh-icons { display:flex; align-items:center; gap:2px }
        .mfh-icon { width:40px; height:40px; display:flex; align-items:center; justify-content:center; background:none; border:none; color:#EDE8DC; cursor:pointer; border-radius:50%; -webkit-tap-highlight-color:transparent }
        .mfh-icon:active { background:rgba(237,232,220,0.1) }
        .mfh-search-row { display:flex; align-items:center; gap:8px; padding:2px 14px 12px }
        .mfh-search { flex:1; display:flex; align-items:center; gap:8px; background:rgba(237,232,220,0.08); border:1px solid rgba(237,232,220,0.14); border-radius:100px; padding:0 14px; height:42px; min-width:0 }
        .mfh-search:focus-within { border-color:#7BB389 }
        .mfh-search-ico { color:#9A8E7A; flex:0 0 auto }
        .mfh-search-input { flex:1; min-width:0; background:none; border:none; outline:none; color:#EDE8DC; font-family:'DM Sans',sans-serif; font-size:14px; -webkit-appearance:none; appearance:none }
        .mfh-search-input::placeholder { color:#7A7060 }
        .mfh-search-input::-webkit-search-cancel-button { -webkit-appearance:none; appearance:none }
        .mfh-search-clear { background:none; border:none; color:#9A8E7A; font-size:22px; line-height:1; cursor:pointer; padding:0 2px; flex:0 0 auto }
        .mfh-filter-btn { position:relative; flex:0 0 auto; width:42px; height:42px; border-radius:12px; background:rgba(237,232,220,0.08); border:1px solid rgba(237,232,220,0.14); color:#EDE8DC; display:flex; align-items:center; justify-content:center; cursor:pointer }
        .mfh-filter-badge { position:absolute; top:-5px; right:-5px; min-width:17px; height:17px; padding:0 4px; border-radius:100px; background:#3A6A48; color:#EDE8DC; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; font-family:'DM Sans',sans-serif }
        .mfh-under { padding:0 14px 10px; display:flex; flex-direction:column; gap:6px }
        .mfh-chips { display:flex; flex-wrap:wrap; align-items:center; gap:6px }
        .mfh-chips-label { font-size:12px; color:#7A7060; font-family:'DM Sans',sans-serif }
        .mfh-chip { font-size:12px; font-weight:500; color:#7BB389; background:rgba(58,106,72,0.18); border:1px solid rgba(123,179,137,0.3); padding:3px 10px; border-radius:100px; font-family:'DM Sans',sans-serif }
        .mfh-aviso { font-size:12px; color:#B8AD9E; font-family:'DM Sans',sans-serif; text-decoration:none }
        .mfh-aviso-link { color:#7BB389; font-weight:500 }

        /* ===== Drawers menú/perfil (mfd-*, mfp-*) ===== */
        .mfd-scrim { position:fixed; inset:0; z-index:120; background:rgba(0,0,0,0.5); backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px); animation:mfdFade 0.2s ease-out }
        @keyframes mfdFade { from { opacity:0 } to { opacity:1 } }
        .mfd { position:absolute; top:0; right:0; bottom:0; width:min(84vw, 340px); background:#1a1a1a; border-left:1px solid rgba(237,232,220,0.08); display:flex; flex-direction:column; padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom); animation:mfdSlide 0.25s ease-out; overflow-y:auto }
        @keyframes mfdSlide { from { transform:translateX(100%) } to { transform:translateX(0) } }
        .mfd-head { display:flex; align-items:center; justify-content:space-between; padding:16px 20px 10px }
        .mfd-title { font-family:'Figtree',sans-serif; font-size:18px; font-weight:500; color:#EDE8DC }
        .mfd-close { background:none; border:none; color:#B8AD9E; font-size:26px; line-height:1; cursor:pointer; padding:0 4px }
        .mfd-item { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; text-align:left; padding:13px 20px; background:none; border:none; color:#EDE8DC; font-family:'DM Sans',sans-serif; font-size:16px; cursor:pointer; text-decoration:none; -webkit-tap-highlight-color:transparent }
        .mfd-item:active { background:rgba(237,232,220,0.06) }
        .mfd-item-active { color:#7BB389; font-weight:600; cursor:default }
        .mfd-item-wa { color:#7BB389 }
        .mfd-sec { padding:14px 20px 4px; font-size:11px; letter-spacing:0.8px; text-transform:uppercase; color:#7A7060; font-family:'DM Sans',sans-serif; font-weight:600 }
        .mfd-sub { padding-left:20px; font-size:15px; color:#D8D0BC }
        .mfd-soon { color:#7A7060; cursor:default }
        .mfd-badge-soon { font-size:10px; font-weight:600; color:#9A8E7A; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.12); padding:2px 7px; border-radius:100px; letter-spacing:0.2px }
        .mfd-divider { height:1px; background:rgba(237,232,220,0.08); margin:8px 20px }
        .mfp { position:absolute; top:0; right:0; bottom:0; width:min(84vw, 340px); background:#1a1a1a; border-left:1px solid rgba(237,232,220,0.08); display:flex; flex-direction:column; padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom); animation:mfdSlide 0.25s ease-out }
        .mfp-body { padding:20px 24px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px }
        .mfp-ico { width:64px; height:64px; border-radius:50%; background:rgba(237,232,220,0.06); color:#B8AD9E; display:flex; align-items:center; justify-content:center; margin-bottom:6px }
        .mfp-msg { font-family:'DM Sans',sans-serif; font-size:15px; color:#EDE8DC; line-height:1.5; margin:0 }
        .mfp-sub { font-family:'DM Sans',sans-serif; font-size:13px; color:#9A8E7A; margin:0 }
        .mfp-cta { margin-top:12px; background:#3A6A48; color:#EDE8DC; border:none; border-radius:100px; padding:12px 22px; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer }

        /* ===== FILTER OVERLAY (full-screen takeover) ===== */
        .fo-overlay { position:fixed; inset:0; z-index:200; background:#141414; display:flex; flex-direction:column; animation:foSlideUp 0.3s ease-out }
        @keyframes foSlideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        .fo-header { position:relative; display:flex; align-items:center; justify-content:center; padding:16px 20px; padding-top:max(16px, calc(env(safe-area-inset-top) + 8px)); border-bottom:1px solid rgba(237,232,220,0.08) }
        .fo-hcount { font-family:'Figtree',sans-serif; font-size:20px; font-weight:500; color:#EDE8DC; font-variant-numeric:tabular-nums }
        .fo-logo { position:absolute; left:20px; top:50%; transform:translateY(-50%); width:24px; height:24px; border-radius:50%; background:#EDE8DC }
        .fo-logo::after { content:''; position:absolute; top:5px; left:5px; width:9px; height:9px; border-radius:50%; background:#3A6A48 }
        .fo-close { position:absolute; right:16px; top:50%; transform:translateY(-50%); width:38px; height:38px; border-radius:50%; border:none; background:rgba(237,232,220,0.08); color:#B8AD9E; font-size:20px; display:flex; align-items:center; justify-content:center; cursor:pointer }
        .fo-body { flex:1; overflow-y:auto; padding:20px }
        /* Búsqueda en lenguaje natural (bnv-*) */
        .bnv-group { margin-bottom:22px }
        .bnv-input { width:100%; padding:13px 16px; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.18); border-radius:12px; color:#EDE8DC; font-family:'DM Sans',sans-serif; font-size:15px; outline:none; box-sizing:border-box }
        .bnv-input::placeholder { color:#7A7060 }
        .bnv-input:focus { border-color:#7BB389 }
        .bnv-chips { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:10px }
        .bnv-chips-label { font-size:12px; color:#7A7060; font-family:'DM Sans',sans-serif }
        .bnv-chip { font-size:12px; font-weight:500; color:#7BB389; background:rgba(58,106,72,0.18); border:1px solid rgba(123,179,137,0.3); padding:3px 10px; border-radius:100px; font-family:'DM Sans',sans-serif }
        .bnv-aviso { font-size:12px; color:#B8AD9E; margin-top:8px; font-family:'DM Sans',sans-serif }
        .bnv-cross { display:inline-block; font-size:13px; color:#7BB389; margin-top:8px; text-decoration:none; font-weight:500; font-family:'DM Sans',sans-serif }
        .fo-footer { padding:16px 20px; padding-bottom:max(16px, calc(env(safe-area-inset-bottom) + 8px)); border-top:1px solid rgba(237,232,220,0.08); display:flex; gap:10px }
        .fo-reset { flex:0 0 auto; padding:14px 20px; background:transparent; border:1px solid rgba(237,232,220,0.12); border-radius:10px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:13px; cursor:pointer }
        .fo-apply { flex:1; padding:14px; background:#EDE8DC; border:none; border-radius:10px; color:#141414; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; cursor:pointer }
        .fo-apply:active { transform:scale(0.97) }
        .mt-counter { position:fixed; bottom:calc(62px + env(safe-area-inset-bottom)); right:16px; z-index:65; font-size:12px; color:rgba(237,232,220,0.5); font-family:'DM Sans',sans-serif; font-weight:500; font-variant-numeric:tabular-nums; background:rgba(20,20,20,0.5); padding:2px 8px; border-radius:100px; pointer-events:none }
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
        .ventas-desktop-broker .ventas-sidebar { padding-top:84px }
        /* Padding-top en el main desktop también, para que las cards no queden tapadas */
        .ventas-desktop-broker .ventas-main { padding-top:128px }
        /* TC paralelo Binance — texto plano, sin caja. Antes era pill verde
           que competía con otros verdes en el banner. Contraste subido para
           que el label "TC paralelo" no desaparezca en plomo. */
        .vt-broker-tc-chip { display:inline-flex; align-items:center; gap:6px; padding:0; background:transparent; border:none; color:rgba(237,232,220,0.85); font-family:'DM Sans',sans-serif; font-size:11px; font-weight:500; letter-spacing:0.2px; white-space:nowrap; cursor:default }
        .vt-broker-tc-divider { color:rgba(237,232,220,0.4); font-weight:300 }
        .vt-broker-tc-label { font-size:10px; letter-spacing:0.6px; text-transform:uppercase; color:rgba(237,232,220,0.85); font-weight:600 }
        .vt-broker-tc-value { font-variant-numeric:tabular-nums; font-weight:700; color:#EDE8DC }
        @media (max-width:768px) { .vt-broker-tc-chip { font-size:10px } .vt-broker-tc-label { font-size:9px } }
        /* Mis shortlists: ahora secundario (no compite con Filtros). Mantiene
           margin-left:auto para empujarse a la derecha del banner. */
        .vt-broker-banner-shortlists { margin-left:auto; background:rgba(237,232,220,0.06); color:#EDE8DC; border:1px solid rgba(237,232,220,0.22); padding:5px 12px; border-radius:100px; font-size:11px; font-weight:600; letter-spacing:0.3px; cursor:pointer; -webkit-tap-highlight-color:transparent; font-family:inherit; white-space:nowrap }
        .vt-broker-banner-shortlists:hover { background:rgba(237,232,220,0.12) }
        .vt-broker-banner-shortlists:active { transform:scale(0.96) }
        .vt-broker-tool { background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.22); color:#EDE8DC; padding:5px 12px; border-radius:100px; font-size:11px; font-weight:600; letter-spacing:0.3px; cursor:pointer; -webkit-tap-highlight-color:transparent; font-family:inherit; white-space:nowrap }
        .vt-broker-tool:hover { background:rgba(237,232,220,0.12) }
        /* Filtros: primary del banner. Arena sólido + texto negro + peso 700. */
        .vt-broker-tool-primary { background:#EDE8DC; color:#141414; border-color:#EDE8DC; font-weight:700 }
        .vt-broker-tool-primary:hover { background:#fff; border-color:#fff }
        /* Disabled state: cuando Seleccionadas · 0, queda visible pero apagado */
        .vt-broker-tool:disabled,
        .vt-broker-tool-disabled { opacity:0.4; cursor:default }
        .vt-broker-tool-disabled:hover,
        .vt-broker-tool:disabled:hover { background:rgba(237,232,220,0.06) }
        .vt-broker-tool:active { transform:scale(0.96) }
        .vt-broker-tool.active { background:#EDE8DC; color:#141414; border-color:#EDE8DC }
        .vt-broker-tool-add { background:rgba(123,179,137,0.16); border-color:rgba(123,179,137,0.50); color:#9BCDA8 }
        .vt-broker-tool-add:hover { background:rgba(123,179,137,0.24) }
        .vt-broker-market-link { text-decoration:none; display:inline-flex; align-items:center; gap:4px }
        .vt-broker-market-arrow { opacity:0.55; font-weight:500 }
        /* Fuentes row — fila completa dentro del banner broker.
           flex-basis:100% fuerza nueva línea (banner desktop sin flex-wrap, en este hijo sí). */
        .vt-broker-banner { flex-wrap:wrap; row-gap:8px }
        .vt-fuentes-row { flex-basis:100%; display:flex; align-items:center; gap:8px; padding-top:6px; margin-top:2px; border-top:1px solid rgba(237,232,220,0.06) }
        .vt-fuentes-label { font-family:'DM Sans',sans-serif; font-size:10px; font-weight:600; letter-spacing:1.2px; text-transform:uppercase; color:rgba(237,232,220,0.55); margin-right:4px }
        .vt-fuente-chip { background:transparent; border:1px solid rgba(237,232,220,0.22); color:#EDE8DC; padding:4px 11px; border-radius:100px; font-size:11px; font-weight:600; letter-spacing:0.3px; cursor:pointer; -webkit-tap-highlight-color:transparent; font-family:'DM Sans',sans-serif; white-space:nowrap; opacity:0.55; transition:opacity 0.15s, background 0.15s, border-color 0.15s }
        .vt-fuente-chip:hover { opacity:0.85 }
        .vt-fuente-chip:active { transform:scale(0.96) }
        .vt-fuente-chip.active { opacity:1 }
        @media (max-width: 768px) {
          .vt-broker-banner { padding:6px 12px; gap:6px }
          .vt-broker-tool, .vt-broker-banner-shortlists { font-size:10px; padding:3px 8px }
          .vt-fuentes-row { padding-top:4px; gap:6px }
          .vt-fuentes-label { font-size:9px }
          .vt-fuente-chip { font-size:10px; padding:3px 9px }
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
        /* Estado 1 favorito — bandeja discreta sin acción de comparar */
        .vt-compare-hint { display:flex; align-items:center; gap:8px; padding:11px 18px; background:rgba(20,20,20,0.92); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:#C8C0B0; border:1px solid rgba(237,232,220,0.1); border-radius:100px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; letter-spacing:0.2px; box-shadow:0 6px 20px rgba(0,0,0,0.25); white-space:nowrap }
        .vt-compare-hint-wrap .vt-compare-banner-clear { width:44px; min-height:44px; font-size:18px }
        /* Estado 0 favoritos — educativo muy discreto (sin acción, sin cerrar) */
        .vt-compare-edu { display:flex; align-items:center; gap:7px; padding:9px 16px; background:rgba(20,20,20,0.72); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:rgba(237,232,220,0.6); border:1px solid rgba(237,232,220,0.08); border-radius:100px; font-family:'DM Sans',sans-serif; font-size:12.5px; font-weight:500; letter-spacing:0.2px; white-space:nowrap }
        .vt-nudge-pill { position:fixed; bottom:max(90px, calc(env(safe-area-inset-bottom) + 80px)); left:50%; transform:translateX(-50%); z-index:100; display:flex; align-items:center; gap:8px; background:#3A6A48; color:#EDE8DC; padding:12px 16px 12px 18px; border-radius:100px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; letter-spacing:0.3px; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,0.18); animation:vtNudgeIn 0.3s ease-out }
        .vt-nudge-x { background:none; border:none; color:rgba(237,232,220,0.6); font-size:18px; line-height:1; cursor:pointer; padding:0 0 0 4px }
        @keyframes vtNudgeIn { from{opacity:0;transform:translateX(-50%) translateY(12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        .mt-map-overlay { position:fixed; inset:0; z-index:300; background:#141414; display:flex; flex-direction:column }
        .mt-map-header { display:flex; align-items:center; justify-content:space-between; padding:12px 20px; padding-top:max(12px, env(safe-area-inset-top)); background:#141414; border-bottom:1px solid rgba(237,232,220,0.1) }
        .mt-map-title { font-family:'Figtree',sans-serif; font-size:20px; font-weight:500; color:#EDE8DC }
        .mt-map-close { width:44px; height:44px; border-radius:10px; border:none; background:rgba(237,232,220,0.08); color:#B8AD9E; font-size:20px; display:flex; align-items:center; justify-content:center; cursor:pointer }
        .mt-map-body { flex:1; position:relative; overflow:hidden }
        .mt-map-body .venta-map { position:absolute; inset:0 }

        .mt-feed { height:calc(100dvh - var(--mfh-h, 0px)); margin-top:var(--mfh-h, 0px); overflow-y:scroll; scroll-snap-type:y mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none }
        .mt-feed::-webkit-scrollbar { display:none }

        /* ===== MOBILE CARD (50% foto / 50% contenido) ===== */
        .mc { height:calc(100dvh - var(--mfh-h, 0px)); scroll-snap-align:start; scroll-snap-stop:always; position:relative; overflow:hidden; display:flex; flex-direction:column; background:#141414 }
        .mc-placeholder { height:calc(100dvh - var(--mfh-h, 0px)); scroll-snap-align:start; background:#141414 }

        /* Photo zone (60%) */
        /* La foto ABSORBE la diferencia: base 60%, pero puede crecer (sin dejar
           hueco) y encoger (si el contenido necesita más). Antes era 0 0 60% fijo
           y el contenido —con overflow:hidden— se recortaba: en el S8 (360x740)
           los specs envolvían a 2 líneas y el chip fiduciario quedaba tapado. */
        .mc-photo-zone { flex:1 1 60%; min-height:130px; position:relative; overflow:hidden }
        .mc-photo-zone::after { content:''; position:absolute; bottom:0; left:0; right:0; height:80px; background:linear-gradient(transparent, #141414); pointer-events:none; z-index:2 }
        .mc-photo-zone::before { content:''; position:absolute; top:0; left:0; right:0; height:70px; background:linear-gradient(rgba(0,0,0,0.35), transparent); pointer-events:none; z-index:3 }
        .mc-photo-scroll { display:flex; height:100%; overflow-x:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none }
        .mc-photo-scroll::-webkit-scrollbar { display:none }
        .mc-slide { flex:0 0 100%; height:100%; background-size:cover; background-position:center; background-color:#D8D0BC; scroll-snap-align:start; position:relative; overflow:hidden; animation:vImgShimmer 1.5s ease-in-out infinite }
        /* Shimmer mientras carga la foto (mismo patrón que alquileres.css):
           el selector [style*=background-image] lo apaga apenas hay imagen. */
        @keyframes vImgShimmer { 0%,100%{background-color:#D8D0BC} 50%{background-color:#EDE8DC} }
        @keyframes vImgShimmerDark { 0%,100%{background-color:#2a2a2a} 50%{background-color:#3a3a3a} }
        .mc-slide[style*="background-image"], .mc-slide-empty { animation:none }
        .mc-swipe-hint { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); z-index:10; display:flex; align-items:center; gap:8px; background:rgba(20,20,20,0.65); padding:10px 20px; border-radius:100px; color:rgba(255,255,255,0.85); font-size:13px; font-family:'DM Sans',sans-serif; pointer-events:none; animation:mcHintFade 3s ease-in-out forwards }
        @keyframes mcHintFade { 0%{opacity:0} 15%{opacity:1} 70%{opacity:1} 100%{opacity:0} }
        .mc-desc { font-size:13px; font-weight:300; color:#B8AD9E; line-height:1.5; font-style:italic; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; margin-bottom:12px }
        @media (prefers-reduced-motion: reduce) { .mc-slide, .vc-photo, .vc-slide { animation:none } .mc-swipe-hint { animation:none; opacity:0.7 } }
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
        .mc-btn.mc-report { color:#C8B98A; font-weight:500 }
        .mc-btn.mc-report.reported { color:#7BB389; opacity:1 }
        .mc-btn.mc-info { color:rgba(237,232,220,0.85); font-size:12px; letter-spacing:0.3px; background:rgba(237,232,220,0.08); border-radius:10px; padding:8px 14px; font-weight:500 }
        .mc-btn.mc-shortlist { background:rgba(58,106,72,0.15); border:1px solid rgba(58,106,72,0.4) }
        .mc-spotlight { position:absolute; top:max(56px, calc(env(safe-area-inset-top) + 50px)); left:16px; z-index:10; background:rgba(250,250,248,0.95); border-left:3px solid #3A6A48; padding:8px 14px; border-radius:0 8px 8px 0; font-family:'DM Sans',sans-serif; font-size:12px; color:#141414; letter-spacing:0.3px }
        .mc-tc-badge { position:absolute; top:max(56px, calc(env(safe-area-inset-top) + 50px)); right:16px; z-index:10; background:rgba(70,130,200,0.9); color:#fff; padding:6px 12px; border-radius:4px; font-family:'DM Sans',sans-serif; font-size:11px; font-weight:500; letter-spacing:0.2px }
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
        /* flex:0 0 auto → el contenido toma SU alto real y nunca se recorta */
        .mc-content { flex:0 0 auto; padding:14px 24px 8px; padding-bottom:max(8px, calc(env(safe-area-inset-bottom) + 4px)); display:flex; flex-direction:column; overflow:hidden; cursor:pointer; -webkit-tap-highlight-color:transparent }
        /* Equipos muy angostos (Galaxy Fold plegado, 280px): el texto envuelve
           más y la foto ya no puede achicarse. Menos padding lateral = menos
           wrap, y se le permite a la foto bajar un poco más. */
        @media (max-width: 340px) {
          .mc-content { padding-left:14px; padding-right:14px }
          .mc-photo-zone { min-height:96px }
        }
        /* Corazón dentro de la foto (rediseño tanda 2) */
        .mc-heart { position:absolute; top:14px; right:14px; z-index:6; width:44px; height:44px; border-radius:50%; background:rgba(20,20,20,0.35); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; -webkit-tap-highlight-color:transparent }
        .mc-heart.active { background:rgba(58,106,72,0.22) }
        .mc-heart:active { transform:scale(0.9) }
        /* Fila inferior de la card: pista de tap + Ver mapa */
        .mc-cta-row { display:flex; align-items:center; justify-content:flex-end; gap:10px; margin-top:auto; padding-top:10px; border-top:1px solid rgba(237,232,220,0.1); min-height:40px }
        .mc-map-pill { display:inline-flex; align-items:center; gap:6px; background:rgba(237,232,220,0.08); border:1px solid rgba(237,232,220,0.16); color:#EDE8DC; border-radius:100px; padding:8px 14px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; cursor:pointer; flex:0 0 auto; -webkit-tap-highlight-color:transparent }
        .mc-map-pill:active { transform:scale(0.97) }
        /* Barra fija inferior: Ver mapa + comparación. La card reserva su alto. */
        .mt-bottombar { position:fixed; bottom:0; left:0; right:0; z-index:70; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 16px; padding-bottom:max(10px, calc(env(safe-area-inset-bottom) + 6px)); background:#141414; border-top:1px solid rgba(237,232,220,0.1) }
        .mt-bb-map { display:inline-flex; align-items:center; gap:8px; background:rgba(237,232,220,0.08); border:1px solid rgba(237,232,220,0.16); color:#EDE8DC; border-radius:100px; padding:10px 18px; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer; -webkit-tap-highlight-color:transparent }
        .mt-bb-map:disabled { opacity:0.4; cursor:default }
        .mt-bb-map:not(:disabled):active { transform:scale(0.97) }
        .mt-bb-right { display:flex; align-items:center; gap:8px; min-width:0 }
        .mt-bb-clear { flex:0 0 auto; width:40px; height:40px; border-radius:50%; background:rgba(237,232,220,0.08); border:1px solid rgba(237,232,220,0.16); color:rgba(237,232,220,0.7); font-size:20px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; -webkit-tap-highlight-color:transparent }
        .mt-bb-clear:active { transform:scale(0.94) }
        .mt-bb-hint { display:inline-flex; align-items:center; gap:7px; color:rgba(237,232,220,0.55); font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; white-space:nowrap }
        .mt-bb-hint-active { color:#C8C0B0 }
        .mt-bb-cmp { display:inline-flex; align-items:center; gap:7px; background:#3A6A48; color:#EDE8DC; border:none; border-radius:100px; padding:11px 20px; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer; -webkit-tap-highlight-color:transparent }
        .mt-bb-cmp:active { transform:scale(0.97) }
        /* La card reserva el alto de la barra fija para no quedar tapada */
        .mt-feed-compare .mc-content { padding-bottom:calc(72px + env(safe-area-inset-bottom)) }
        .mc-name { font-family:'Figtree',sans-serif; font-size:22px; font-weight:500; color:#EDE8DC; line-height:1.3; margin:0; padding:0; max-height:2.6em; overflow:hidden; flex-shrink:0 }
        .mc-meta-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:5px 0 12px; flex-shrink:0 }
        .mc-reciente { font-size:11px; font-weight:600; color:#3A6A48; font-family:'DM Sans',sans-serif; letter-spacing:0.3px; background:rgba(58,106,72,0.15); padding:2px 8px; border-radius:4px }
        .mc-nuevo { font-size:11px; font-weight:700; color:#0A3D1E; font-family:'DM Sans',sans-serif; letter-spacing:0.3px; background:#7BB389; padding:2px 8px; border-radius:4px }
        .mc-zona { font-size:13px; color:#9A8E7A; letter-spacing:0.3px; font-family:'DM Sans',sans-serif }
        .mc-price-block { border-left:3px solid #3A6A48; padding-left:14px; margin-bottom:8px; flex-shrink:0 }
        .mc-price { font-family:'DM Sans',sans-serif; font-size:28px; font-weight:500; color:#EDE8DC; line-height:1; margin-bottom:6px; font-variant-numeric:tabular-nums }
        .mc-tc { font-size:12px; font-weight:400; color:rgba(237,232,220,0.5); letter-spacing:0.2px }
        .mc-specs { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:15px; color:#C8C0B0; font-family:'DM Sans',sans-serif; font-weight:400; line-height:1.4 }
        .mc-sp { display:inline-flex; align-items:center; gap:6px }
        .mc-sp svg { width:16px; height:16px; color:#8B8272; flex-shrink:0 }
        .mc-specs-2 { font-size:15px; color:#EDE8DC; font-family:'DM Sans',sans-serif; margin-bottom:auto; font-weight:300 }
        .mc-fidrow { margin-top:10px }
        .mc-fid { display:inline-flex; align-items:center; gap:7px; padding:7px 12px; border-radius:9px; background:rgba(58,106,72,0.18); color:#7BB389; font-size:13px; font-weight:600; font-family:'DM Sans',sans-serif }
        .mc-fid svg { width:15px; height:15px; flex-shrink:0 }
        .mc-fid.mc-fid-sobre { background:rgba(216,138,90,0.16); color:#E79A6A }
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
        .vf-chips { display:flex; flex-wrap:wrap; gap:9px }
        .vf-chip { border:1px solid rgba(237,232,220,0.14); background:transparent; border-radius:11px; padding:10px 14px; font-size:13px; color:#B8AD9E; font-family:'DM Sans',sans-serif; cursor:pointer }
        .vf-chip.active { border-color:#5c8a68; background:rgba(58,106,72,0.16); color:#EDE8DC; font-weight:600 }
        .vf-amen-note { font-size:11.5px; color:#7A7060; line-height:1.45; margin-top:10px; font-family:'DM Sans',sans-serif }
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
        /* Inputs precio (modo broker) — reusa estilo .vf-area-field */
        .vf-price-inputs { display:flex; align-items:center; gap:10px; margin-bottom:10px }
        .vf-price-dollar { font-size:13px; color:#9A8E7A; font-family:'DM Sans',sans-serif; flex-shrink:0; margin-right:-2px }
        /* Inputs m² (modo broker) — pareados min/max con label flotante */
        .vf-area-inputs { display:flex; align-items:center; gap:10px }
        .vf-area-field { flex:1; display:flex; align-items:center; gap:6px; padding:8px 12px; border-radius:10px; border:1px solid rgba(237,232,220,0.12); background:transparent; transition:border-color 0.15s }
        .vf-area-field:focus-within { border-color:#3A6A48 }
        .vf-area-prefix { font-size:11px; color:#7A7060; font-family:'DM Sans',sans-serif; font-weight:600; letter-spacing:0.4px; text-transform:uppercase; flex-shrink:0 }
        .vf-area-input { width:100%; min-width:0; background:transparent; border:none; outline:none; color:#EDE8DC; font-size:14px; font-family:'DM Sans',sans-serif; font-weight:500; font-variant-numeric:tabular-nums; -moz-appearance:textfield; padding:0 }
        .vf-area-input::-webkit-outer-spin-button,.vf-area-input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0 }
        .vf-area-suffix { font-size:12px; color:#9A8E7A; font-family:'DM Sans',sans-serif; flex-shrink:0 }
        .vf-area-sep { color:#7A7060; font-size:14px; flex-shrink:0 }
        .vf-area-clear { margin-top:8px; background:transparent; border:none; color:#9A8E7A; font-size:11px; cursor:pointer; font-family:'DM Sans',sans-serif; padding:4px 0; text-align:left }
        .vf-area-clear:hover { color:#EDE8DC }

        /* ===== DESKTOP VENTA CARD ===== */
        .vc { background:#1e1e1e; border:1px solid rgba(237,232,220,0.08); border-radius:14px; overflow:hidden; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); display:flex; flex-direction:column }
        .vc:hover { transform:translateY(-4px); box-shadow:0 12px 32px rgba(0,0,0,0.3) }
        /* vc-photo: wrapper con foto estática (background-image directo) cuando !useCarousel.
           Cuando useCarousel (publicShareMode), el background-image vive en .vc-slide hijos.
           background-size:cover + position:center necesarios SIEMPRE porque el wrapper también
           se usa con backgroundImage directo en el modo no-carrusel (feed venta, broker mode). */
        .vc-photo { height:220px; background-size:cover; background-position:center; background-color:#2a2a2a; position:relative; overflow:hidden; animation:vImgShimmerDark 1.5s ease-in-out infinite }
        .vc-photo[style*="background-image"], .vc-photo-nofoto { animation:none }
        .vc-photo-scroll { display:flex; height:100%; overflow-x:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none }
        .vc-photo-scroll::-webkit-scrollbar { display:none }
        .vc-slide { flex:0 0 100%; height:100%; background-size:cover; background-position:center; background-color:#2a2a2a; scroll-snap-align:start; scroll-snap-stop:always; cursor:pointer; animation:vImgShimmerDark 1.5s ease-in-out infinite }
        .vc-slide[style*="background-image"], .vc-slide-empty { animation:none }
        .vc-slide-empty { display:flex; align-items:center; justify-content:center; cursor:default }
        @keyframes vcShimmer { 0%,100%{background-color:#2a2a2a} 50%{background-color:#333} }
        .vc-photo:not([style*="background-image"]) { animation:vcShimmer 1.5s ease-in-out infinite }
        .vc-nofoto { display:flex; align-items:center; justify-content:center; height:100%; color:#9A8E7A; font-size:13px; font-family:'DM Sans',sans-serif }
        .vc-nav { position:absolute; top:50%; transform:translateY(-50%); width:36px; height:36px; border-radius:50%; background:rgba(20,20,20,0.6); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.15s; z-index:3 }
        .vc-nav:hover { background:rgba(20,20,20,0.85) }
        .vc-nav-prev { left:8px }
        .vc-nav-next { right:8px }
        .vc-photo-count { position:absolute; top:10px; right:10px; background:rgba(20,20,20,0.75); color:rgba(255,255,255,0.8); font-size:11px; padding:3px 8px; border-radius:100px; font-family:'DM Sans',sans-serif }
        .vc-tc-badge { position:absolute; bottom:10px; left:10px; display:inline-flex; align-items:center; gap:5px; background:rgba(20,20,20,0.62); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); color:rgba(237,232,220,0.92); font-size:10.5px; font-weight:500; padding:4px 9px; border-radius:100px; border:1px solid rgba(237,232,220,0.22); font-family:'DM Sans',sans-serif; letter-spacing:0.2px; z-index:3 }
        .vc-tc-badge-i { font-size:11px; opacity:0.85 }
        .vc-fuente-badge { position:absolute; top:10px; left:10px; font-size:10px; font-weight:700; padding:4px 9px; border-radius:4px; font-family:'DM Sans',sans-serif; letter-spacing:0.4px; text-transform:uppercase; z-index:4; box-shadow:0 2px 4px rgba(0,0,0,0.2) }
        .vc-fav { position:absolute; top:10px; left:10px; width:40px; height:40px; border-radius:50%; background:rgba(20,20,20,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s; z-index:3 }
        .vc-fav:hover { transform:scale(1.1) }
        .vc-fav.active { background:rgba(224,85,85,0.15) }
        .vc-share { position:absolute; top:10px; left:58px; width:40px; height:40px; border-radius:50%; background:rgba(20,20,20,0.5); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.15s; z-index:3 }
        .vc-share:hover { transform:scale(1.1); background:rgba(20,20,20,0.7) }
        .vc-body { padding:16px; flex:1; display:flex; flex-direction:column }
        .vc-name { font-family:'Figtree',sans-serif; font-size:20px; font-weight:500; color:#EDE8DC; line-height:1.2; margin-bottom:2px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap }
        .vc-reciente { font-size:11px; font-weight:500; color:#3A6A48; font-family:'DM Sans',sans-serif; letter-spacing:0.3px }
        .vc-nuevo { font-size:11px; font-weight:700; color:#0A3D1E; font-family:'DM Sans',sans-serif; letter-spacing:0.3px; background:#7BB389; padding:1px 7px; border-radius:4px; margin-left:6px }
        .vc-zona { font-size:12px; color:#9A8E7A; letter-spacing:0.5px; margin-bottom:10px }
        .vc-id { color:rgba(237,232,220,0.3); font-size:12px; margin-left:4px; letter-spacing:0 }
        .vc-price-block { border-left:3px solid #3A6A48; padding-left:12px; margin-bottom:8px }
        .vc-price-change { font-family:'DM Sans',sans-serif; font-size:12px; font-weight:600; letter-spacing:0.3px; margin-top:4px; display:inline-block; padding:3px 8px; border-radius:4px }
        .vc-price-change-agent-down { background:rgba(58,106,72,0.15); color:#5fb074 }
        .vc-price-change-agent-up { background:rgba(237,232,220,0.08); color:rgba(237,232,220,0.55) }
        .vc-price-change-tc-down, .vc-price-change-tc-up { background:rgba(125,160,200,0.15); color:#9DBFE0; font-weight:500 }
        .mc-price-change { font-family:'DM Sans',sans-serif; font-size:12px; font-weight:600; letter-spacing:0.3px; margin-top:6px; display:inline-block; padding:3px 8px; border-radius:4px }
        .mc-price-change-agent-down { background:rgba(58,106,72,0.15); color:#5fb074 }
        .mc-price-change-agent-up { background:rgba(237,232,220,0.08); color:rgba(237,232,220,0.55) }
        .mc-price-change-tc-down, .mc-price-change-tc-up { background:rgba(125,160,200,0.15); color:#9DBFE0; font-weight:500 }
        .vc-price { font-family:'DM Sans',sans-serif; font-size:24px; font-weight:500; color:#EDE8DC; line-height:1; margin-bottom:4px; font-variant-numeric:tabular-nums }
        .vc-tc { font-size:12px; font-weight:400; color:rgba(237,232,220,0.5); letter-spacing:0.2px }
        .vc-specs { font-size:15px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-weight:300 }
        .vc-specs-2 { font-size:15px; color:#EDE8DC; font-family:'DM Sans',sans-serif; margin-bottom:10px; font-weight:300 }
        .vc-actions { border-top:1px solid rgba(237,232,220,0.08); padding-top:8px; margin-top:auto; display:flex; align-items:center; justify-content:space-between; min-height:36px }
        .vc-act-btn { display:flex; align-items:center; gap:4px; background:none; border:none; color:#9A8E7A; font-size:11px; font-family:'DM Sans',sans-serif; cursor:pointer; padding:4px 0; transition:color 0.15s; text-decoration:none }
        .vc-act-btn:hover { color:#EDE8DC }
        .vc-act-fav.active svg { filter:drop-shadow(0 2px 4px rgba(224,85,85,0.4)) }
        .vc-act-report { color:#C8B98A; font-weight:500 }
        .vc-act-report:hover { color:#E0A030 }
        .vc-act-report.reported { color:#7BB389; cursor:default; opacity:1 }
        .vc-act-report.reported:hover { color:#7BB389 }
        .vc-act-detail { color:rgba(237,232,220,0.7) }
        .vc-act-wsp { color:#1EA952; font-weight:600 }
        .vc-act-shortlist { color:#3A6A48; font-weight:600; background:rgba(58,106,72,0.08); border:1px solid rgba(58,106,72,0.25) }
        .vc-act-wsp:hover { color:#25D366 }

        /* ===== STATES ===== */
        .ventas-status { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:300px; color:#9A8E7A; font-family:'DM Sans',sans-serif; font-size:15px; text-align:center }
        .ventas-status button { margin-top:12px; padding:8px 20px; background:#EDE8DC; color:#141414; border:none; border-radius:10px; cursor:pointer; font-weight:600; font-size:14px }

        /* ===== TOAST ===== */
        .ventas-toast { position:fixed; top:max(90px, calc(env(safe-area-inset-top) + 80px)); left:50%; transform:translateX(-50%); background:#141414; color:#EDE8DC; padding:12px 20px; border-radius:14px; font-size:13px; font-family:'DM Sans',sans-serif; z-index:200; font-weight:600; width:max-content; max-width:min(520px, calc(100vw - 32px)); line-height:1.4; text-align:center; box-shadow:0 6px 22px rgba(0,0,0,0.35); display:flex; align-items:center; gap:10px }
        .ventas-toast-warn { border-left:4px solid #F2B441; padding-left:14px; text-align:left }
        .ventas-toast-success { border-left:4px solid #7BB389; padding-left:14px; text-align:left }

        /* ===== BOTTOM SHEET (ventas dark theme — .bs-venta overrides alquileres.css) ===== */
        /* 0.78: el fondo tiene superficies claras (mapa OSM) que con 0.5
           seguían compitiendo con el modal — apagado fuerte estilo Zillow */
        .bs-overlay { position:fixed; inset:0; background:rgba(10,10,10,0.78); z-index:500; opacity:0; pointer-events:none; transition:opacity 0.3s }
        .bs-overlay.open { opacity:1; pointer-events:auto }

        /* Base structure (ventas-specific, not in alquileres.css) */
        .bs-venta.bs { background:#1a1a1a; color:#EDE8DC; padding-bottom:72px }
        /* El sticky (bottom:0) se pega al borde del CONTENT box: con el
           padding-bottom quedaba flotando 72px sobre el fondo. En el sheet rico
           el sticky es la última fila → flush abajo, como alquileres. */
        .bs-venta.bs.bs-rich { padding-bottom:0 }
        /* Tope de altura de la foto por viewport: en equipos cortos (SE) el 16/9
           dejaba el precio/stats abajo del pliegue. dvh (fallback vh) = alto
           VISIBLE real; el vh mide con la barra de URL oculta. */
        .bs-venta.bs-rich .bsg-slide { max-height:32vh; max-height:32dvh }
        .bs-venta .bs-floating-actions { position:sticky; top:0; z-index:10; display:flex; align-items:center; justify-content:flex-end; gap:4px; padding:8px 16px; padding-top:max(8px, calc(env(safe-area-inset-top) + 4px)) }
        .bs-venta .bs-fav { width:40px; height:40px; border-radius:50%; border:none; background:rgba(20,20,20,0.6); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:#9A8E7A; display:flex; align-items:center; justify-content:center; cursor:pointer }
        .bs-venta .bs-fav.active svg { filter:drop-shadow(0 2px 4px rgba(224,85,85,0.4)) }
        .bs-venta .bs-close { width:40px; height:40px; border-radius:50%; border:none; background:rgba(20,20,20,0.6); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:#EDE8DC; font-size:22px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0 }

        /* Dark header */
        .bs-venta .bs-dark-header { background:#141414; padding:0 24px 20px }
        .bs-venta .bs-h-name { font-family:'Figtree',sans-serif; font-size:24px; font-weight:500; color:#EDE8DC; line-height:1.1; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap }
        .bs-venta .bs-h-reciente { font-size:11px; font-weight:500; color:#3A6A48; font-family:'DM Sans',sans-serif; letter-spacing:0.3px }
        .bs-venta .bs-h-nuevo { font-size:11px; font-weight:700; color:#0A3D1E; font-family:'DM Sans',sans-serif; letter-spacing:0.3px; background:#7BB389; padding:1px 8px; border-radius:4px; margin-left:8px }
        .bs-venta .bs-h-zona { font-size:13px; color:#9A8E7A; letter-spacing:0.3px; margin-bottom:12px; font-family:'DM Sans',sans-serif; margin-top:2px }
        .bs-venta .bs-h-price-block { border-left:3px solid #3A6A48; padding-left:14px }
        .bs-venta .bs-h-price { font-family:'DM Sans',sans-serif; font-size:28px; font-weight:500; color:#EDE8DC; line-height:1; margin-bottom:6px; font-variant-numeric:tabular-nums }
        .bs-venta .bs-h-tc { font-size:11px; font-weight:400; color:rgba(237,232,220,0.3); letter-spacing:0.2px }
        .bs-tc-badge { display:inline-block; margin-left:10px; background:rgba(70,130,200,0.9); color:#fff; font-size:10px; font-weight:500; padding:3px 8px; border-radius:3px; vertical-align:middle; letter-spacing:0.2px }
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
        /* wrap: el hint es nowrap y en equipos muy angostos (Fold 280px) no entra
           al lado del título → desbordaba el sheet. Ahora baja a su propia línea. */
        .bs-venta .bs-q-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:4px 10px }
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

        /* Contexto de mercado (sheet venta) */
        .bs-mktv { background:rgba(237,232,220,0.04); border:1px solid rgba(237,232,220,0.08); border-radius:14px; padding:16px }
        .bs-mktv-this { display:flex; align-items:baseline; gap:10px; margin-bottom:4px }
        .bs-mktv-label { font-size:13px; color:#B8AD9E }
        .bs-mktv-value { font-family:'Figtree',sans-serif; font-size:22px; font-weight:500; color:#EDE8DC }
        .bs-mktv-zona { font-size:13px; color:#B8AD9E; margin-bottom:14px; line-height:1.5 }
        .bs-mktv-zona b { color:#EDE8DC; font-weight:600 }
        .bs-mktv-rango { display:block; margin-top:2px }
        .bs-mktv-bar-wrap { margin-bottom:12px }
        .bs-mktv-bar { position:relative; height:8px; background:#2a2a2a; border-radius:4px }
        .bs-mktv-band { position:absolute; top:0; bottom:0; background:#3A6A48; opacity:0.55; border-radius:4px }
        .bs-mktv-marker { position:absolute; top:-4px; width:3px; height:16px; background:#EDE8DC; border-radius:2px; transform:translateX(-50%) }
        .bs-mktv-scale { position:relative; height:16px; margin-top:4px }
        .bs-mktv-scale span { position:absolute; transform:translateX(-50%); font-size:11px; color:#7A7060; white-space:nowrap }
        .bs-mktv-caveat { font-size:12px; color:#9A8E7A; line-height:1.5; border-top:1px solid rgba(237,232,220,0.08); padding-top:10px }
        .bs-mktv-empty { font-size:13px; color:#9A8E7A; font-style:italic }

        /* ===== Comentario broker + Destacada (migración 239) ===== */
        /* Card destacada en venta — fondo arena invierte tema oscuro, salta del fondo negro */
        .vc.vc-destacada { background:#EDE8DC; color:#141414; position:relative }
        .vc.vc-destacada .vc-name { color:#141414 }
        .vc.vc-destacada .vc-zona { color:#5a5a5a }
        .vc.vc-destacada .vc-id { color:#7a7a7a }
        .vc.vc-destacada .vc-price { color:#141414 }
        .vc.vc-destacada .vc-tc { color:#5a5a5a }
        .vc.vc-destacada .vc-specs { color:#5a5a5a }
        .vc.vc-destacada .vc-specs-2 { color:#5a5a5a }
        .vc.vc-destacada .vc-act-btn { color:#141414; border-color:rgba(20,20,20,0.18) }
        .vc.vc-destacada .vc-act-btn.vc-act-detail { color:#141414 }
        /* Chip Recomendada — venta */
        .vc-destacada-chip { position:absolute; top:12px; left:12px; z-index:3; background:#141414; color:#EDE8DC; padding:6px 12px; border-radius:100px; font-size:11px; font-weight:600; letter-spacing:0.3px; box-shadow:0 4px 12px rgba(0,0,0,0.3); pointer-events:none; font-family:'DM Sans',sans-serif }
        /* Bloque comentario broker — desktop */
        .vc-comentario { margin-top:10px; padding:10px 12px; background:#EDE8DC; border-left:3px solid #3A6A48; border-radius:6px; color:#141414; position:relative }
        .vc.vc-destacada .vc-comentario { background:#fff }
        .vc-comentario-quote { font-size:20px; color:#3A6A48; line-height:0.6; font-family:Georgia,serif; margin-bottom:2px; opacity:0.7 }
        .vc-comentario-text { font-size:12px; line-height:1.4; color:#141414; font-style:italic; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden }
        .vc-comentario-author { font-size:10px; color:#5a5a5a; margin-top:4px; font-weight:500; font-style:normal }
        .vc-comentario-more { font-size:11px; color:#3A6A48; cursor:pointer; background:none; border:none; padding:4px 0 0; font-family:inherit; font-weight:600; text-decoration:underline; text-underline-offset:2px }
        .vc-comentario-more:hover { color:#2c5238 }
        /* Mobile feed — destacada y comentario */
        .mc.mc-destacada { background:#EDE8DC; position:relative }
        .mc.mc-destacada .mc-name { color:#141414 }
        .mc.mc-destacada .mc-zona { color:#5a5a5a }
        .mc.mc-destacada .mc-id { color:#7a7a7a }
        .mc.mc-destacada .mc-price { color:#141414 }
        .mc.mc-destacada .mc-tc { color:#5a5a5a }
        .mc.mc-destacada .mc-specs { color:#5a5a5a }
        .mc.mc-destacada .mc-specs-2 { color:#5a5a5a }
        .mc.mc-destacada .mc-content { color:#141414 }
        .mc-destacada-chip { position:absolute; top:12px; left:12px; z-index:3; background:#141414; color:#EDE8DC; padding:6px 12px; border-radius:100px; font-size:10px; font-weight:600; letter-spacing:0.3px; box-shadow:0 4px 12px rgba(0,0,0,0.3); pointer-events:none; font-family:'DM Sans',sans-serif }
        .mc-comentario { margin:6px 0 4px; padding:8px 10px; background:rgba(237,232,220,0.12); border-left:3px solid #3A6A48; border-radius:6px; color:#EDE8DC }
        .mc.mc-destacada .mc-comentario { background:#fff; color:#141414 }
        .mc-comentario-quote { font-size:18px; color:#3A6A48; line-height:0.6; font-family:Georgia,serif; opacity:0.7 }
        .mc.mc-destacada .mc-comentario-quote { color:#3A6A48 }
        .mc-comentario-text { font-size:12px; line-height:1.4; font-style:italic; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden }
        .mc-comentario-author { font-size:10px; opacity:0.7; margin-top:3px; font-weight:500; font-style:normal }
        .mc-comentario-more { font-size:11px; color:#3A6A48; cursor:pointer; background:none; border:none; padding:4px 0 0; font-family:inherit; font-weight:600; text-decoration:underline; text-underline-offset:2px; -webkit-tap-highlight-color:transparent }
        .mc.mc-destacada .mc-comentario-more { color:#3A6A48 }

        /* Comentario del broker dentro del bottom sheet venta — sin clamp, texto completo */
        .bs-broker-comment { padding:14px 16px; background:#EDE8DC; border-left:3px solid #3A6A48; border-radius:8px; color:#141414 }
        .bs-broker-comment-quote { font-size:24px; color:#3A6A48; line-height:0.6; font-family:Georgia,serif; margin-bottom:4px; opacity:0.7 }
        .bs-broker-comment-text { font-size:14px; line-height:1.55; color:#141414; font-style:italic; white-space:pre-wrap; word-wrap:break-word }
        .bs-broker-comment-author { font-size:12px; color:#5a5a5a; margin-top:8px; font-weight:500; font-style:normal }
        /* Para el sheet de venta (fondo oscuro) → invertimos contraste */
        .bs-venta .bs-broker-comment { background:rgba(237,232,220,0.08); border-left-color:#7BB389 }
        .bs-venta .bs-broker-comment-quote { color:#7BB389 }
        .bs-venta .bs-broker-comment-text { color:#EDE8DC }
        .bs-venta .bs-broker-comment-author { color:rgba(237,232,220,0.6) }

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
  // En modo shortlist pública (/b/[hash]) el wrapper provee sus propios OG
  // personalizados con el nombre del broker y la cantidad de propiedades.
  // Renderizar VentasHead acá pisaría/duplicaría esos OG y WhatsApp termina
  // mostrando el preview genérico del feed ("348 Departamentos...") en vez
  // de "Selección de <broker> para <cliente>". Skipeamos.
  if (publicShareHash) return null
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
        description: `${seo.totalPropiedades} departamentos en venta en Equipetrol. Precio mediano del m²: ${fmtSEO(seo.medianaPrecioM2)} USD. Cobertura: 6 zonas. Fuentes: Century 21, Remax, Bien Inmuebles.`,
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

      {/* Escape de "<": JSON.stringify NO escapa "</script>" — si un dato de
          BD lo contuviera, rompería el parser HTML (XSS). < es JSON válido. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph).replace(/</g, '\\u003c') }}
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
    // Payload SSG mínimo: solo el primer viewport. El listado completo lo trae
    // el cliente con el fetch diferido a idle (ver useEffect de mount). Con 500
    // props completas el __NEXT_DATA__ pesaba ~800KB y hundía LCP/TTI mobile.
    // Lanzamiento TC nuevo: shadow-first con fallback prod (cutover-safe).
    const { rpcShadowFirst } = await import('@/lib/rpc-shadow')
    const { data: rows } = await rpcShadowFirst(supabase, 'buscar_unidades_simple', {
      p_filtros: { limite: 24, solo_con_fotos: true, orden: 'recientes', zonas_permitidas: ZONAS_EQUIPETROL_DB }
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
        amenidades_extra: p.amenidades_extra || [],
        equipamiento_otros: p.equipamiento_otros || [],
        pet_friendly: p.pet_friendly ?? null,
        // Solo un EXTRACTO viaja en el payload SSG (la card muestra ~110 chars);
        // el texto completo llega con el fetch diferido del cliente.
        descripcion: p.descripcion ? String(p.descripcion).slice(0, 160) : null,
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
      // Merge cola larga no canónica (buscar_extras, mig 271). Graceful: si el
      // SQL no está aplicado o no hay data (prod pre-cutover), queda [].
      try {
        const ids = initialProperties.map(pp => pp.id)
        if (ids.length) {
          const { data: extras } = await rpcShadowFirst(supabase, 'buscar_extras', { p_ids: ids })
          if (Array.isArray(extras)) {
            const byId = new Map(extras.map((e: any) => [e.id, e]))
            for (const pp of initialProperties) {
              const e: any = byId.get(pp.id)
              if (e) { pp.amenidades_extra = e.amenidades_extra || []; pp.equipamiento_otros = e.equipamiento_otros || [] }
            }
          }
        }
      } catch { /* helper opcional: no rompe el feed si no existe aún */ }
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
