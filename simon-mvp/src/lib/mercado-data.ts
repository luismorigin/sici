import { supabase } from './supabase'
import { displayZona } from './zonas'
import type { Macrozona } from './macrozonas'
import { fetchAllRows } from './supabase-paginado'

// --- Types ---

export interface MercadoKPIs {
  totalPropiedades: number
  medianaPrecioM2: number
  absorcionPct: number | null
  fechaActualizacion: string
}

export interface TipologiaRow {
  dormitorios: number
  unidades: number
  precioMediano: number
  precioP25: number
  precioP75: number
  medianaPrecioM2: number
  // Rango típico del $/m² (rediseño mobile): el rango de precio total solo no
  // responde "¿es caro para lo que es, o solo es grande?". Siguen opcionales en el
  // tipo —la UI muestra el rango de m² solo cuando existe— aunque desde que se
  // eliminó el FALLBACK (20-ago-2026) esta función siempre los calcula.
  m2P25?: number
  m2P75?: number
}

export interface ZonaRow {
  zonaDisplay: string
  unidades: number
  medianaPrecioM2: number
  precioMediano: number
}


export interface MercadoData {
  kpis: MercadoKPIs
  tipologias: TipologiaRow[]
  zonas: ZonaRow[]
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


// --- Data fetching ---

interface RawProp {
  // precio_norm: ya normalizado por la vista (régimen TC nuevo en shadow)
  precio_norm: number | string | null
  area_total_m2: number
  dormitorios: number | null
  zona: string | null
  estado_construccion: string | null
  fecha_publicacion: string | null
  fecha_discovery: string | null
  es_multiproyecto: boolean | null
  tipo_propiedad_original: string | null
}

function applyQualityFilters(props: RawProp[], zonasDB: string[]): RawProp[] {
  const now = new Date()
  const excludeTypes = ['baulera', 'parqueo', 'garaje', 'deposito']

  return props.filter(p => {
    if (!p.zona || !zonasDB.includes(p.zona)) return false
    const precio = p.precio_norm ? parseFloat(String(p.precio_norm)) : 0
    if (precio <= 0 || p.area_total_m2 < 20) return false
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

export async function fetchMercadoData(macrozona: Macrozona): Promise<MercadoData> {
  try {
    if (!supabase) throw new Error('Supabase not initialized')

    // Lanzamiento TC nuevo: la vista SHADOW ya normaliza (precio_norm, régimen
    // nuevo) y aplica los filtros de calidad canónicos. Al cutover se repointea
    // a v_mercado_venta (CUTOVER_DATA_PLAN). Macrozona se filtra acá (ticket #15).
    // PAGINADO (ver lib/supabase-paginado.ts): hoy filtra por macrozona y queda holgado,
    // pero PostgREST corta en 1.000 sin error y estos son los KPIs de /mercado.
    const rawProps = await fetchAllRows<any>(
      supabase
        .from('v_mercado_venta_shadow')
        .select('precio_norm, area_total_m2, dormitorios, zona, estado_construccion, fecha_publicacion, fecha_discovery, es_multiproyecto, tipo_propiedad_original')
        .gte('area_total_m2', 20)
        .gt('precio_norm', 0)
        .in('zona', macrozona.zonasDB),
      'mercado venta: v_mercado_venta_shadow',
    )

    if (!rawProps || rawProps.length === 0) throw new Error('No properties found')

    const props = applyQualityFilters(rawProps as RawProp[], macrozona.zonasDB)
    if (props.length === 0) throw new Error('No properties after filtering')

    // precio_norm ya viene normalizado de la vista — sin TC en JS
    const enriched = props.map(p => {
      const precioNorm = parseFloat(String(p.precio_norm))
      return { ...p, precioNorm, precioM2: precioNorm / p.area_total_m2 }
    })

    // --- KPIs ---
    const allPreciosM2 = enriched.map(p => p.precioM2).sort((a, b) => a - b)
    const medianaPrecioM2 = Math.round(percentile(allPreciosM2, 0.5))

    // ── ACTIVIDAD DE MERCADO (absorcion): NO SE PUBLICA (20-ago-2026) ──────────
    // Se devuelve `null` y la pagina no pinta la tarjeta. Las dos fuentes fallan,
    // cada una por su lado, y ninguna FALLA RUIDOSAMENTE:
    //
    //  · `market_absorption_snapshots` (prod, la que se usaba hasta hoy) quedo
    //    CONGELADA el 27-jul con el cutover. Servia una absorcion de hace 24 dias
    //    bajo un badge que decia "Actualizado hoy".
    //
    //  · `market_absorption_snapshots_shadow` (la viva) tiene el numero, pero el
    //    numero todavia no significa nada: se calcula sobre las bajas de los
    //    ultimos 30 dias (`primera_ausencia_at`) y ese campo tiene **3 dias de
    //    historia** — la primera baja registrada es del 17-ago-2026. La ventana
    //    esta vacia en 27 de sus 30 dias. Por eso da 1,0% en Equipetrol y 0,0% en
    //    Zona Norte, y salta de 0 a 6 de un dia para el otro: no mide absorcion,
    //    mide lo que el verificador alcanzo a marcar esta semana.
    //    (Ademas esa tabla no es legible con la clave publica, que es la que usa
    //    este archivo — habria dado 0 en silencio.)
    //
    // 🔑 Publicar 1% de actividad donde antes decia 8% no es "actualizar el dato":
    // es afirmar que el mercado se freno, cuando lo que se frenó fue la medicion.
    // Se reactiva cuando `primera_ausencia_at` acumule ~30 dias (mediados de sep)
    // y se compare contra la serie de prod antes de encenderlo.
    const absorcionPct: number | null = null

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
        m2P25: Math.round(percentile(preciosM2, 0.25)),
        m2P75: Math.round(percentile(preciosM2, 0.75)),
      }
    }).filter(t => t.unidades > 0)

    // --- Zonas ---
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

    // El bloque `historico` se elimino el 20-ago-2026: consultaba
    // `market_absorption_snapshots` (prod, congelada el 27-jul) y NINGUNA pagina lo
    // consumia — `getStaticProps` ya lo descartaba antes de serializar. La curva
    // historica vive ahora en `v_serie_precios_venta` (mig 334).

    return { kpis, tipologias, zonas, generatedAt: new Date().toISOString() }
  } catch (error) {
    // 🔴 SE PROPAGA. Hasta el 20-ago-2026 aca habia un FALLBACK con numeros reales
    // del 9-mar-2026 ($2.090/m2, regimen TC viejo) que se servian con la fecha de
    // HOY: si Supabase fallaba durante el build, la pagina publicaba precios 25%
    // por encima del mercado sin una sola senal de que algo habia salido mal.
    // Y con macrozonas era peor: Zona Norte habria mostrado los numeros de Equipetrol.
    // 🔑 Con ISR, un fallo de regeneracion deja servida la ultima version BUENA —
    // que es exactamente lo que se quiere. Un fallo en el primer build es ruidoso,
    // y eso tambien es lo que se quiere.
    console.error('[mercado-data] Error fetching data:', error)
    throw error
  }
}
