import { supabase } from './supabase'
import { fetchAllRows } from './supabase-paginado'
import { displayZona } from './zonas'
import type { Macrozona } from './macrozonas'

// --- Types ---

export interface AlquilerKPIs {
  totalUnidades: number
  rentaMedianaBs: number
  bsM2Promedio: number
  edificiosConOferta: number
  fechaActualizacion: string
}

/** Mediana de un corte con su n — el n viaja SIEMPRE (doctrina de muestras). */
export interface CorteMediana {
  n: number
  medianaBs: number
}

export interface AlquilerTipologiaRow {
  dormitorios: number
  unidades: number
  rentaMedianaBs: number
  rentaP25Bs: number
  rentaP75Bs: number
  bsM2Mediana: number
  // Split amoblado POR tipología (rediseño mobile). NUNCA comparar amoblado
  // global: los amoblados se concentran en monoambientes y el agregado dice lo
  // contrario que cada tipología (paradoja de composición medida el 22-jul).
  // "Sin declarar" y no "no amoblado": el negativo casi nunca se declara.
  // null = no llega al gate n>=5 (no se publican medianas de muestras chicas).
  amobladoSi: CorteMediana | null
  sinDeclarar: CorteMediana | null
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

// --- Fallback data (real data from Mar 2026) ---

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
  amoblado: string | null // 'si' | 'no' | 'semi' | null (solo el positivo es confiable)
}

export async function fetchMercadoAlquilerData(macrozona: Macrozona): Promise<MercadoAlquilerData> {
  try {
    if (!supabase) throw new Error('Supabase not initialized')

    // Lanzamiento TC nuevo: vista SHADOW (display Bs igual; misma base que el
    // feed). Al cutover se repointea a v_mercado_alquiler (CUTOVER_DATA_PLAN).
    // PAGINADO: sin filtro de zona en el query (se filtra abajo en JS) → crece con todo el
    // inventario de alquiler. Ver lib/supabase-paginado.ts.
    const rawProps = await fetchAllRows<any>(
      supabase
        .from('v_mercado_alquiler_shadow')
        .select('precio_mensual_bob, precio_mensual_usd, area_total_m2, dormitorios, zona, id_proyecto_master, es_multiproyecto, tipo_propiedad_original, amoblado')
        .in('zona', macrozona.zonasDB),
      'mercado alquiler: v_mercado_alquiler_shadow',
    )

    if (!rawProps || rawProps.length === 0) {
      throw new Error(`fetchMercadoAlquilerData: sin datos para ${macrozona.nombre}`)
    }

    // Filter: zona in Equipetrol, area >= 20, precio > 0
    const excludeTypes = ['baulera', 'parqueo', 'garaje', 'deposito']
    const props = (rawProps as RawAlquilerProp[]).filter(p => {
      if (!p.zona || !macrozona.zonasDB.includes(p.zona)) return false
      if (!p.precio_mensual_bob || p.precio_mensual_bob <= 0) return false
      if (!p.area_total_m2 || p.area_total_m2 < 20) return false
      if (p.es_multiproyecto === true) return false
      if (p.tipo_propiedad_original && excludeTypes.includes(p.tipo_propiedad_original)) return false
      return true
    })

    if (props.length === 0) {
      throw new Error(`fetchMercadoAlquilerData: 0 props tras filtrar en ${macrozona.nombre}`)
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
    // Split amoblado POR tipología: 'si' vs sin-declarar. 'no'/'semi' quedan
    // fuera del split (n≈2-5 en toda la base — el negativo no se declara).
    const dormAmoSi: Record<number, number[]> = {}
    const dormAmoNd: Record<number, number[]> = {}
    props.forEach(p => {
      const d = p.dormitorios ?? -1
      if (d < 0 || d > 3) return
      if (!dormGroups[d]) { dormGroups[d] = []; dormBsM2[d] = []; dormAmoSi[d] = []; dormAmoNd[d] = [] }
      dormGroups[d].push(p.precio_mensual_bob)
      if (p.area_total_m2 > 0) dormBsM2[d].push(p.precio_mensual_bob / p.area_total_m2)
      if (p.amoblado === 'si') dormAmoSi[d].push(p.precio_mensual_bob)
      else if (p.amoblado == null) dormAmoNd[d].push(p.precio_mensual_bob)
    })

    // Gate n>=5: bajo el umbral el corte no se publica (mediana de 2 avisos = ruido)
    const corteDe = (vals: number[]): CorteMediana | null => {
      if (vals.length < 5) return null
      const sorted = [...vals].sort((a, b) => a - b)
      return { n: sorted.length, medianaBs: Math.round(percentile(sorted, 0.5)) }
    }

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
          amobladoSi: corteDe(dormAmoSi[d] || []),
          sinDeclarar: corteDe(dormAmoNd[d] || []),
        }
      })
      .sort((a, b) => a.dormitorios - b.dormitorios)

    // --- Zonas ---
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
      // Shadow: el $/m² de venta baja al régimen nuevo → el yield bruto sube
      // (~×1.45). Coherente con el marco TC nuevo, no es un bug.
      // PAGINADO: trae la vista ENTERA (el filtro por zona se hace abajo en JS), así que es
      // la consulta más grande del front — 833 filas al 2-ago-2026 contra el corte de 1.000
      // de PostgREST, que es silencioso. Si se cortara, el yield de las zonas que quedan al
      // final saldría con menos comparables (o vacío) sin que nada lo indique.
      const ventaProps = await fetchAllRows<{ zona: string; precio_m2: number }>(
        supabase.from('v_mercado_venta_shadow').select('zona, precio_m2').in('zona', macrozona.zonasDB),
        'yield: v_mercado_venta_shadow',
      )

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
      console.warn('fetchMercadoAlquilerData: yield calculation failed', err)
    }

    return {
      kpis,
      tipologias,
      zonas,
      yieldData,
      generatedAt: new Date().toISOString(),
    }
  } catch (err) {
    // 🔴 SE PROPAGA — mismo motivo que en `mercado-data.ts`: el FALLBACK servia
    // numeros reales de marzo de 2026 (regimen TC viejo) con la fecha de hoy, y con
    // macrozonas habria servido los de Equipetrol en la pagina de Zona Norte.
    // Con ISR, un fallo de regeneracion deja servida la ultima version buena.
    console.error('fetchMercadoAlquilerData error:', err)
    throw err
  }
}
