// Datos de mercado de ALQUILER para ZONA NORTE — copia separada de
// mercado-alquiler-data.ts. Filtra por las 14 microzonas ZN (getMicrozonasZN)
// en vez de las 6 zonas Equipetrol. NO toca la experiencia de Equipetrol.
// Alimenta el SEO/KPIs de la página /zona-norte/alquileres.
import { supabase } from './supabase'
import { getMicrozonasZN, displayZona } from './zonas'

// --- Types ---

export interface AlquilerKPIs {
  totalUnidades: number
  rentaMedianaBs: number
  bsM2Promedio: number
  edificiosConOferta: number
  fechaActualizacion: string
}

export interface AlquilerTipologiaRow {
  dormitorios: number
  unidades: number
  rentaMedianaBs: number
  rentaP25Bs: number
  rentaP75Bs: number
  bsM2Mediana: number
}

export interface AlquilerZonaRow {
  zonaDisplay: string
  unidades: number
  bsM2Promedio: number
  rentaMedianaBs: number
}

export interface YieldZonaRow {
  zonaDisplay: string
  rentaBsM2: number
  ventaUsdM2: number
  yieldAnual: number
  unidadesAlquiler: number
}

export interface MercadoAlquilerData {
  kpis: AlquilerKPIs
  tipologias: AlquilerTipologiaRow[]
  zonas: AlquilerZonaRow[]
  yieldData: YieldZonaRow[]
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

// --- Fallback neutro (si la query falla) — NO mostrar data de Equipetrol en ZN ---

const FALLBACK_DATA: MercadoAlquilerData = {
  kpis: {
    totalUnidades: 0,
    rentaMedianaBs: 0,
    bsM2Promedio: 0,
    edificiosConOferta: 0,
    fechaActualizacion: new Date().toISOString().split('T')[0],
  },
  tipologias: [],
  zonas: [],
  yieldData: [],
  generatedAt: new Date().toISOString(),
}

// --- Data fetching ---

interface RawAlquilerProp {
  precio_mensual_bob: number
  precio_mensual_usd: number | null
  area_total_m2: number
  dormitorios: number | null
  zona: string | null
  id_proyecto_master: number | null
  es_multiproyecto: boolean | null
  tipo_propiedad_original: string | null
}

export async function fetchMercadoAlquilerDataZN(): Promise<MercadoAlquilerData> {
  try {
    if (!supabase) throw new Error('Supabase not initialized')
    const microzonasZN = getMicrozonasZN()

    // Fetch alquiler properties from the view
    const { data: rawProps } = await supabase
      .from('v_mercado_alquiler')
      .select('precio_mensual_bob, precio_mensual_usd, area_total_m2, dormitorios, zona, id_proyecto_master, es_multiproyecto, tipo_propiedad_original')

    if (!rawProps || rawProps.length === 0) {
      console.warn('fetchMercadoAlquilerDataZN: no data, using fallback')
      return FALLBACK_DATA
    }

    // Filter: zona in Zona Norte (14 microzonas), area >= 20, precio > 0
    const excludeTypes = ['baulera', 'parqueo', 'garaje', 'deposito']
    const props = (rawProps as RawAlquilerProp[]).filter(p => {
      if (!p.zona || !microzonasZN.includes(p.zona)) return false
      if (!p.precio_mensual_bob || p.precio_mensual_bob <= 0) return false
      if (!p.area_total_m2 || p.area_total_m2 < 20) return false
      if (p.es_multiproyecto === true) return false
      if (p.tipo_propiedad_original && excludeTypes.includes(p.tipo_propiedad_original)) return false
      return true
    })

    if (props.length === 0) {
      console.warn('fetchMercadoAlquilerDataZN: no props after filtering, using fallback')
      return FALLBACK_DATA
    }

    // --- KPIs ---
    const precios = props.map(p => p.precio_mensual_bob).sort((a, b) => a - b)
    const bsM2Values = props
      .filter(p => p.area_total_m2 > 0)
      .map(p => p.precio_mensual_bob / p.area_total_m2)
    const proyectosSet = new Set(props.map(p => p.id_proyecto_master).filter(Boolean))

    const kpis: AlquilerKPIs = {
      totalUnidades: props.length,
      rentaMedianaBs: Math.round(median(precios)),
      bsM2Promedio: Math.round(bsM2Values.reduce((a, b) => a + b, 0) / bsM2Values.length * 10) / 10,
      edificiosConOferta: proyectosSet.size,
      fechaActualizacion: new Date().toISOString().split('T')[0],
    }

    // --- Tipologias ---
    const dormGroups: Record<number, number[]> = {}
    const dormBsM2: Record<number, number[]> = {}
    props.forEach(p => {
      const d = p.dormitorios ?? -1
      if (d < 0 || d > 3) return
      if (!dormGroups[d]) { dormGroups[d] = []; dormBsM2[d] = [] }
      dormGroups[d].push(p.precio_mensual_bob)
      if (p.area_total_m2 > 0) dormBsM2[d].push(p.precio_mensual_bob / p.area_total_m2)
    })

    const tipologias: AlquilerTipologiaRow[] = Object.entries(dormGroups)
      .map(([dStr, precios]) => {
        const d = parseInt(dStr)
        const sorted = [...precios].sort((a, b) => a - b)
        const bsm2Sorted = [...(dormBsM2[d] || [])].sort((a, b) => a - b)
        return {
          dormitorios: d,
          unidades: precios.length,
          rentaMedianaBs: Math.round(percentile(sorted, 0.5)),
          rentaP25Bs: Math.round(percentile(sorted, 0.25)),
          rentaP75Bs: Math.round(percentile(sorted, 0.75)),
          bsM2Mediana: Math.round(percentile(bsm2Sorted, 0.5) * 10) / 10,
        }
      })
      .sort((a, b) => a.dormitorios - b.dormitorios)

    // --- Zonas (microzonas ZN, label corto via displayZona) ---
    const zonaGroups: Record<string, { precios: number[]; bsM2: number[] }> = {}
    props.forEach(p => {
      if (!p.zona) return
      if (!zonaGroups[p.zona]) zonaGroups[p.zona] = { precios: [], bsM2: [] }
      zonaGroups[p.zona].precios.push(p.precio_mensual_bob)
      if (p.area_total_m2 > 0) zonaGroups[p.zona].bsM2.push(p.precio_mensual_bob / p.area_total_m2)
    })

    const zonas: AlquilerZonaRow[] = Object.entries(zonaGroups)
      .map(([zona, g]) => ({
        zonaDisplay: displayZona(zona),
        unidades: g.precios.length,
        bsM2Promedio: Math.round(g.bsM2.reduce((a, b) => a + b, 0) / g.bsM2.length * 10) / 10,
        rentaMedianaBs: Math.round(median(g.precios)),
      }))
      .sort((a, b) => b.unidades - a.unidades)

    // --- Yield (cruce con venta) ---
    let yieldData: YieldZonaRow[] = []
    try {
      const { data: ventaProps } = await supabase
        .from('v_mercado_venta')
        .select('zona, precio_m2')

      if (ventaProps && ventaProps.length > 0) {
        // Avg precio_m2 por zona venta
        const ventaByZona: Record<string, { sum: number; count: number }> = {}
        ventaProps.forEach((p: any) => {
          if (!p.zona || !p.precio_m2) return
          if (!ventaByZona[p.zona]) ventaByZona[p.zona] = { sum: 0, count: 0 }
          ventaByZona[p.zona].sum += parseFloat(p.precio_m2)
          ventaByZona[p.zona].count++
        })

        // TC paralelo
        const { data: tcData } = await supabase
          .from('config_global')
          .select('valor')
          .eq('clave', 'tipo_cambio_paralelo')
          .single()
        const tcPar = parseFloat(tcData?.valor) || 10.20

        Object.entries(zonaGroups).forEach(([zona, rental]) => {
          if (rental.bsM2.length < 3) return
          const ventaZona = ventaByZona[zona]
          if (!ventaZona || ventaZona.count < 3) return

          const rentaBsM2 = rental.bsM2.reduce((a, b) => a + b, 0) / rental.bsM2.length
          const ventaUsdM2 = ventaZona.sum / ventaZona.count
          const ventaBsM2 = ventaUsdM2 * tcPar
          const yieldAnual = (rentaBsM2 * 12 / ventaBsM2) * 100

          yieldData.push({
            zonaDisplay: displayZona(zona),
            rentaBsM2: Math.round(rentaBsM2 * 10) / 10,
            ventaUsdM2: Math.round(ventaUsdM2),
            yieldAnual: Math.round(yieldAnual * 100) / 100,
            unidadesAlquiler: rental.precios.length,
          })
        })
        yieldData.sort((a, b) => b.yieldAnual - a.yieldAnual)
      }
    } catch (err) {
      console.warn('fetchMercadoAlquilerDataZN: yield calculation failed', err)
    }

    return {
      kpis,
      tipologias,
      zonas,
      yieldData,
      generatedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error('fetchMercadoAlquilerDataZN error:', err)
    return FALLBACK_DATA
  }
}
