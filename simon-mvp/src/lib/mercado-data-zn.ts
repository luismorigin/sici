// Datos de mercado para ZONA NORTE — copia separada de mercado-data.ts.
// Filtra por las 14 microzonas ZN (getMicrozonasZN) en vez de las 6 zonas
// Equipetrol. NO toca la experiencia de Equipetrol. Alimenta el SEO/KPIs de
// la página /zona-norte/ventas. v1: KPIs básicos (conteo + mediana m²);
// la serie de absorción es Equipetrol-only (snapshot 'global') → no aplica a ZN.
import { supabase } from './supabase'
import { fetchAllRows } from './supabase-paginado'
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

/**
 * Fila de `v_mercado_venta_shadow`. La vista ya trae el precio normalizado al régimen
 * nuevo y aplica los filtros de calidad — ver la nota en `fetchMercadoDataZN`.
 * (Reemplaza al `applyQualityFilters` que replicaba esos filtros en JS sobre la tabla
 * cruda: duplicaba la regla en dos lugares y no podía normalizar bien el precio.)
 */
interface VistaProp {
  precio_norm: number | null
  precio_m2: number | null
  area_total_m2: number
  dormitorios: number | null
  zona: string | null
  tipo_propiedad_original: string | null
}

export async function fetchMercadoDataZN(): Promise<MercadoData> {
  try {
    if (!supabase) throw new Error('Supabase not initialized')
    const microzonasZN = getMicrozonasZN()

    // 🔴 Se lee la VISTA, no la tabla. Dos motivos, los dos aprendidos a los golpes:
    //  1. PERMISOS: la mig 317 le sacó a `anon` el SELECT sobre `propiedades_v2_shadow`
    //     (la clave pública, que viaja en el browser, podía escribirla). Apuntar a la tabla
    //     devuelve `42501 permission denied`. Las vistas corren con permisos del dueño.
    //  2. PRECIO: la vista ya trae `precio_norm` y `precio_m2` calculados con
    //     `precio_normalizado_shadow` — el régimen NUEVO. Normalizar en JS acá era el
    //     camino corto al ~47% de error, porque este archivo importaba la fórmula VIEJA.
    //
    // Y aplica exactamente los mismos filtros de calidad que el `applyQualityFilters` que
    // reemplaza —es_activa, status, duplicado_de, tipos excluidos, área ≥ 20, 300 d / 730 d
    // en preventa—, más `zona_efectiva` (mig 316) para la zona resuelta. Verificado contra
    // la definición de la vista, no asumido.
    // PAGINADO (ver lib/supabase-paginado.ts): PostgREST corta en 1.000 sin avisar.
    const rawProps = await fetchAllRows<VistaProp>(
      supabase
        .from('v_mercado_venta_shadow')
        .select('precio_norm, precio_m2, area_total_m2, dormitorios, zona, tipo_propiedad_original')
        .in('zona', microzonasZN),
      'mercado venta ZN: v_mercado_venta_shadow',
    )

    if (!rawProps || rawProps.length === 0) throw new Error('No properties found')

    // Lo único que la vista NO excluye y el filtro viejo sí: `lote`.
    // Y una propiedad sin precio utilizable se DESCARTA, no entra como 0 — un 0 acá
    // hundiría la mediana en silencio.
    const enriched = rawProps
      .filter(p => p.tipo_propiedad_original !== 'lote')
      .map(p => ({
        ...p,
        precioNorm: Number(p.precio_norm) || 0,
        precioM2: Number(p.precio_m2) || 0,
      }))
      .filter(p => p.precioNorm > 0 && p.precioM2 > 0)

    if (enriched.length === 0) throw new Error('No properties after filtering')

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
