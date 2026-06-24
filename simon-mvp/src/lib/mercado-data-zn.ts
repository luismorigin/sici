// Datos de mercado para ZONA NORTE — copia separada de mercado-data.ts.
// Filtra por las 14 microzonas ZN (getMicrozonasZN) en vez de las 6 zonas
// Equipetrol. NO toca la experiencia de Equipetrol. Alimenta el SEO/KPIs de
// la página /zona-norte/ventas. v1: KPIs básicos (conteo + mediana m²);
// la serie de absorción es Equipetrol-only (snapshot 'global') → no aplica a ZN.
import { supabase } from './supabase'
import { normalizarPrecio } from './precio-utils'
import { getMicrozonasZN, displayZona } from './zonas'

// --- Types ---

export interface MercadoKPIs {
  totalPropiedades: number
  medianaPrecioM2: number
  absorcionPct: number
  fechaActualizacion: string
}

export interface TipologiaRow {
  dormitorios: number
  unidades: number
  precioMediano: number
  precioP25: number
  precioP75: number
  medianaPrecioM2: number
}

export interface ZonaRow {
  zonaDisplay: string
  unidades: number
  medianaPrecioM2: number
  precioMediano: number
}

export interface HistoricoPoint {
  fecha: string
  totalActivas: number
  precioM2Promedio: number
  absorcionPct: number
}

export interface MercadoData {
  kpis: MercadoKPIs
  tipologias: TipologiaRow[]
  zonas: ZonaRow[]
  historico: HistoricoPoint[]
  generatedAt: string
}

// --- Helpers ---

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return Math.round(sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo))
}

// --- Fallback mínimo (si la query falla) ---

const FALLBACK_DATA: MercadoData = {
  kpis: {
    totalPropiedades: 0,
    medianaPrecioM2: 0,
    absorcionPct: 0,
    fechaActualizacion: new Date().toISOString().split('T')[0],
  },
  tipologias: [],
  zonas: [],
  historico: [],
  generatedAt: new Date().toISOString(),
}

// --- Data fetching ---

interface RawProp {
  precio_usd: number
  area_total_m2: number
  tipo_cambio_detectado: string | null
  dormitorios: number | null
  zona: string | null
  estado_construccion: string | null
  fecha_publicacion: string | null
  fecha_discovery: string | null
  es_multiproyecto: boolean | null
  tipo_propiedad_original: string | null
}

function applyQualityFilters(props: RawProp[]): RawProp[] {
  const now = new Date()
  // Excluye no-deptos: además de los accesorios, casa/terreno/lote (en ZN hay
  // 315 casas cargadas con zona ZN → sin esto se cuelan en el conteo de deptos).
  const excludeTypes = ['baulera', 'parqueo', 'garaje', 'deposito', 'casa', 'terreno', 'lote']
  const microzonasZN = getMicrozonasZN()

  return props.filter(p => {
    if (!p.zona || !microzonasZN.includes(p.zona)) return false
    if (p.precio_usd <= 0 || p.area_total_m2 < 20) return false
    if (p.es_multiproyecto === true) return false
    if (p.tipo_propiedad_original && excludeTypes.includes(p.tipo_propiedad_original)) return false

    // Days on market filter
    const refDate = p.fecha_publicacion || p.fecha_discovery
    if (!refDate) return false
    const days = Math.floor((now.getTime() - new Date(refDate).getTime()) / 86400000)
    const isPreVenta = ['en_construccion', 'en_pozo'].includes(p.estado_construccion || '')
    return days <= (isPreVenta ? 730 : 300)
  })
}

export async function fetchMercadoDataZN(): Promise<MercadoData> {
  try {
    if (!supabase) throw new Error('Supabase not initialized')
    const microzonasZN = getMicrozonasZN()

    // Fetch TC paralelo
    const { data: tcData } = await supabase
      .from('config_global')
      .select('valor')
      .eq('clave', 'tipo_cambio_paralelo')
      .single()
    const tcPar = parseFloat(tcData?.valor) || 0

    // Fetch all qualifying properties in one query (microzonas ZN)
    const { data: rawProps } = await supabase
      .from('propiedades_v2')
      .select('precio_usd, area_total_m2, tipo_cambio_detectado, dormitorios, zona, estado_construccion, fecha_publicacion, fecha_discovery, es_multiproyecto, tipo_propiedad_original')
      .eq('tipo_operacion', 'venta')
      .in('status', ['completado', 'actualizado'])
      .is('duplicado_de', null)
      .gte('area_total_m2', 20)
      .gt('precio_usd', 0)
      .in('zona', microzonasZN)

    if (!rawProps || rawProps.length === 0) throw new Error('No properties found')

    const props = applyQualityFilters(rawProps as RawProp[])
    if (props.length === 0) throw new Error('No properties after filtering')

    // Normalize prices
    const enriched = props.map(p => {
      const precioNorm = normalizarPrecio(p.precio_usd, p.tipo_cambio_detectado, tcPar)
      return { ...p, precioNorm, precioM2: precioNorm / p.area_total_m2 }
    })

    // --- KPIs ---
    const allPreciosM2 = enriched.map(p => p.precioM2).sort((a, b) => a - b)
    const medianaPrecioM2 = Math.round(percentile(allPreciosM2, 0.5))

    // Absorción: la serie de snapshots es Equipetrol-only ('global') → no aplica a ZN (v1: 0).
    const kpis: MercadoKPIs = {
      totalPropiedades: enriched.length,
      medianaPrecioM2,
      absorcionPct: 0,
      fechaActualizacion: new Date().toISOString().split('T')[0],
    }

    // --- Tipologías ---
    const tipologias: TipologiaRow[] = [0, 1, 2, 3].map(dorm => {
      const subset = enriched.filter(p => p.dormitorios === dorm)
      if (subset.length === 0) {
        return { dormitorios: dorm, unidades: 0, precioMediano: 0, precioP25: 0, precioP75: 0, medianaPrecioM2: 0 }
      }
      const precios = subset.map(p => p.precioNorm).sort((a, b) => a - b)
      const preciosM2 = subset.map(p => p.precioM2).sort((a, b) => a - b)
      return {
        dormitorios: dorm,
        unidades: subset.length,
        precioMediano: Math.round(percentile(precios, 0.5)),
        precioP25: Math.round(percentile(precios, 0.25)),
        precioP75: Math.round(percentile(precios, 0.75)),
        medianaPrecioM2: Math.round(percentile(preciosM2, 0.5)),
      }
    }).filter(t => t.unidades > 0)

    // --- Zonas (microzonas ZN, label corto via displayZona) ---
    const zonaGroups = new Map<string, typeof enriched>()
    for (const p of enriched) {
      const display = displayZona(p.zona!)
      const group = zonaGroups.get(display) || []
      group.push(p)
      zonaGroups.set(display, group)
    }

    const zonas: ZonaRow[] = Array.from(zonaGroups.entries())
      .map(([zonaDisplay, group]) => {
        const preciosM2 = group.map(p => p.precioM2).sort((a, b) => a - b)
        const precios = group.map(p => p.precioNorm).sort((a, b) => a - b)
        return {
          zonaDisplay,
          unidades: group.length,
          medianaPrecioM2: Math.round(percentile(preciosM2, 0.5)),
          precioMediano: Math.round(percentile(precios, 0.5)),
        }
      })
      .sort((a, b) => b.unidades - a.unidades)

    // Histórico: serie de absorción es Equipetrol-only → vacío para ZN (v1).
    const historico: HistoricoPoint[] = []

    return { kpis, tipologias, zonas, historico, generatedAt: new Date().toISOString() }
  } catch (error) {
    console.error('[mercado-data-zn] Error fetching data:', error)
    return { ...FALLBACK_DATA, generatedAt: new Date().toISOString() }
  }
}
