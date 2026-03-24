import { supabase } from './supabase'
import { normalizarPrecio } from './precio-utils'

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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return percentile(sorted, 0.5)
}

const ZONAS_EQUIPETROL = ['Equipetrol Centro', 'Equipetrol Norte', 'Equipetrol Oeste', 'Sirari', 'Villa Brigida']

const ZONA_DISPLAY: Record<string, string> = {
  'Equipetrol Centro': 'Eq. Centro',
  'Equipetrol Norte': 'Eq. Norte',
  'Equipetrol Oeste': 'Eq. Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'V. Brigida',
}

// --- Fallbacks (real data from Mar 2026) ---

const FALLBACK_DATA: MercadoData = {
  kpis: {
    totalPropiedades: 268,
    medianaPrecioM2: 2090,
    absorcionPct: 8.4,
    fechaActualizacion: '2026-03-09',
  },
  tipologias: [
    { dormitorios: 0, unidades: 38, precioMediano: 88721, precioP25: 74191, precioP75: 107701, medianaPrecioM2: 2186 },
    { dormitorios: 1, unidades: 119, precioMediano: 106839, precioP25: 94285, precioP75: 136198, medianaPrecioM2: 2123 },
    { dormitorios: 2, unidades: 81, precioMediano: 181832, precioP25: 150762, precioP75: 227011, medianaPrecioM2: 2040 },
    { dormitorios: 3, unidades: 26, precioMediano: 326287, precioP25: 247784, precioP75: 443321, medianaPrecioM2: 1873 },
  ],
  zonas: [
    { zonaDisplay: 'Eq. Centro', unidades: 120, medianaPrecioM2: 2244, precioMediano: 120000 },
    { zonaDisplay: 'Sirari', unidades: 44, medianaPrecioM2: 2085, precioMediano: 175000 },
    { zonaDisplay: 'V. Brigida', unidades: 40, medianaPrecioM2: 1938, precioMediano: 115000 },
    { zonaDisplay: 'Eq. Oeste', unidades: 32, medianaPrecioM2: 2075, precioMediano: 160000 },
    { zonaDisplay: 'Eq. Norte', unidades: 26, medianaPrecioM2: 2339, precioMediano: 153000 },
  ],
  historico: [],
  generatedAt: '2026-03-09T09:00:00Z',
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
  const excludeTypes = ['baulera', 'parqueo', 'garaje', 'deposito']

  return props.filter(p => {
    if (!p.zona || !ZONAS_EQUIPETROL.includes(p.zona)) return false
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

export async function fetchMercadoData(): Promise<MercadoData> {
  try {
    if (!supabase) throw new Error('Supabase not initialized')

    // Fetch TC paralelo
    const { data: tcData } = await supabase
      .from('config_global')
      .select('valor')
      .eq('clave', 'tipo_cambio_paralelo')
      .single()
    const tcPar = parseFloat(tcData?.valor) || 0

    // Fetch all qualifying properties in one query
    const { data: rawProps } = await supabase
      .from('propiedades_v2')
      .select('precio_usd, area_total_m2, tipo_cambio_detectado, dormitorios, zona, estado_construccion, fecha_publicacion, fecha_discovery, es_multiproyecto, tipo_propiedad_original')
      .eq('tipo_operacion', 'venta')
      .in('status', ['completado', 'actualizado'])
      .is('duplicado_de', null)
      .gte('area_total_m2', 20)
      .gt('precio_usd', 0)
      .in('zona', ZONAS_EQUIPETROL)

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

    // Absorption from latest snapshot
    const { data: absRows } = await supabase
      .from('market_absorption_snapshots')
      .select('fecha, venta_tasa_absorcion')
      .eq('zona', 'global')
      .order('fecha', { ascending: false })
      .limit(8)

    let absorcionPct = FALLBACK_DATA.kpis.absorcionPct
    if (absRows && absRows.length > 0) {
      const latestDate = (absRows[0] as any).fecha
      const latest = absRows.filter((r: any) => r.fecha === latestDate)
      const sum = latest.reduce((s: number, r: any) => s + (parseFloat(r.venta_tasa_absorcion) || 0), 0)
      absorcionPct = Math.round((sum / latest.length) * 10) / 10
    }

    const kpis: MercadoKPIs = {
      totalPropiedades: enriched.length,
      medianaPrecioM2,
      absorcionPct,
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

    // --- Zonas ---
    const zonaGroups = new Map<string, typeof enriched>()
    for (const p of enriched) {
      const display = ZONA_DISPLAY[p.zona!] || p.zona!
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

    // --- Histórico ---
    const { data: histData } = await supabase
      .from('market_absorption_snapshots')
      .select('fecha, venta_activas, venta_usd_m2, venta_tasa_absorcion')
      .eq('zona', 'global')
      .order('fecha', { ascending: true })

    const historico: HistoricoPoint[] = []
    if (histData && histData.length > 0) {
      const byDate = new Map<string, { activas: number; precioSum: number; absSum: number; count: number }>()
      for (const row of histData as any[]) {
        const entry = byDate.get(row.fecha) || { activas: 0, precioSum: 0, absSum: 0, count: 0 }
        entry.activas += parseInt(row.venta_activas) || 0
        entry.precioSum += parseInt(row.venta_usd_m2) || 0
        entry.absSum += parseFloat(row.venta_tasa_absorcion) || 0
        entry.count += 1
        byDate.set(row.fecha, entry)
      }

      const allPoints = Array.from(byDate.entries()).map(([fecha, d]) => ({
        fecha,
        totalActivas: d.activas,
        precioM2Promedio: Math.round(d.precioSum / d.count),
        absorcionPct: Math.round((d.absSum / d.count) * 10) / 10,
      }))

      // <=60 points: show all. >60: sample weekly.
      // With daily snapshots, 60 points ≈ 2 months — plenty readable.
      if (allPoints.length <= 60) {
        historico.push(...allPoints)
      } else {
        for (let i = 0; i < allPoints.length; i++) {
          if (i % 7 === 0 || i === allPoints.length - 1) historico.push(allPoints[i])
        }
      }
    }

    return { kpis, tipologias, zonas, historico, generatedAt: new Date().toISOString() }
  } catch (error) {
    console.error('[mercado-data] Error fetching data:', error)
    return { ...FALLBACK_DATA, generatedAt: new Date().toISOString() }
  }
}
