// Datos dinámicos compartidos por las superficies públicas nuevas:
// /home (banda de mercado), /whatsapp (dato contado por Simón) y /sobre-simon.
// Regla del proyecto: los números NUNCA van hardcodeados en producción — se leen
// de la BD en build (ISR) con fallbacks reales por si Supabase falla.
import { supabase, obtenerZonasAlquiler, obtenerMicrozonas } from './supabase'
import { ZONAS_EQUIPETROL_DB, displayZona } from './zonas'

export interface SuperficiesMarketData {
  /** Deptos en venta activos en Equipetrol (filtros de calidad del feed) */
  ventasActivas: number
  /** Deptos en alquiler activos hoy (v_mercado_alquiler, Equipetrol) */
  alquileresActivos: number
  /** Mediana de renta mensual en Bs — Eq. Centro (o global si no hay base) */
  medianaAlquilerBob: number
  /** Zona a la que corresponde la mediana de alquiler (display) */
  medianaAlquilerZona: string
  /** Zona más cara por USD/m² + su valor (calculado, NO hardcodeado) — /whatsapp */
  zonaMasCara: { zona: string; m2: number }
  /** TC paralelo del día (config_global.tipo_cambio_paralelo) — el que usa el sistema */
  tcParalelo: number
  /** USD/m² venta por zona (display) — para el demo de contexto de la home */
  m2PorZona: Record<string, number>
}

// Snapshot real (jul 2026) — solo si Supabase falla en build
const FALLBACK: SuperficiesMarketData = {
  ventasActivas: 371,
  alquileresActivos: 121,
  medianaAlquilerBob: 3750,
  medianaAlquilerZona: 'Eq. Centro',
  zonaMasCara: { zona: 'Eq. Norte', m2: 2646 },
  tcParalelo: 9.72,
  m2PorZona: {},
}

/** Redondeo para copy aproximado: 373 → "370+" (múltiplo de 10 inferior) */
export function aproximado(n: number): string {
  return `${Math.floor(n / 10) * 10}+`
}

// ─── Destacados de la home ("Entraron esta semana") ─────────────────────────
// Mezcla venta + alquiler, NADA hardcodeado: sale de las vistas de mercado en
// cada build (ISR) y se renueva solo cuando el pipeline nocturno mete props.
// SOLO fuente Remax: las fotos de Century21 llegan como thumbnail de su CDN con
// el sello C21 impreso en la imagen (verificado 8-jul) — no sirven para la home.
// Las de Remax (intramax.bo) están limpias, sin watermark.
// Zona: v_mercado_venta NO filtra macrozona → filtrar acá (ticket #15 ZN).
export interface DestacadoHome {
  id: number
  operacion: 'alquiler' | 'venta'
  titulo: string
  zona: string
  /** Bs/mes para alquiler · $us normalizado (precio_norm) para venta */
  precio: number
  dormitorios: number | null
  areaM2: number | null
  foto: string
  /** publicada hace ≤7 días */
  nueva: boolean
  /** solo alquiler — para insights del demo comparativo */
  amoblado: boolean | null
}

function mapDestacado(row: any, operacion: 'alquiler' | 'venta'): DestacadoHome | null {
  const foto = row.datos_json?.contenido?.fotos_urls?.[0]
  if (!foto || typeof foto !== 'string') return null
  const precio = Math.round(parseFloat(operacion === 'alquiler' ? row.precio_mensual_bob : row.precio_norm))
  if (!precio) return null
  const dorms = row.dormitorios
  const titulo =
    row.nombre_edificio ||
    (dorms === 0 ? 'Monoambiente' : dorms ? `Depto ${dorms} dorm` : 'Departamento')
  const fecha = row.fecha_publicacion || row.fecha_creacion
  return {
    id: row.id,
    operacion,
    titulo,
    zona: displayZona(row.zona),
    precio,
    dormitorios: dorms ?? null,
    areaM2: row.area_total_m2 ? Math.round(row.area_total_m2) : null,
    foto,
    nueva: fecha ? new Date(fecha).getTime() >= Date.now() - 7 * 86400000 : false,
    // La vista expone amoblado como 'si'/'no' (string), no booleano
    amoblado: row.amoblado === 'si' || row.amoblado === true ? true
      : row.amoblado === 'no' || row.amoblado === false ? false
      : null,
  }
}

export async function fetchDestacadosHome(): Promise<DestacadoHome[]> {
  try {
    if (!supabase) return []

    // Lanzamiento TC nuevo: las vistas SHADOW (precios reales, misma base que
    // el feed). Al cutover se repointea a las vistas prod (CUTOVER_DATA_PLAN).
    const [alq, vta] = await Promise.all([
      supabase
        .from('v_mercado_alquiler_shadow')
        .select('id, nombre_edificio, zona, precio_mensual_bob, dormitorios, area_total_m2, amoblado, datos_json, fecha_publicacion, fecha_creacion')
        .eq('zona_general', 'Equipetrol')
        .eq('fuente', 'remax')
        .not('precio_mensual_bob', 'is', null)
        .order('fecha_publicacion', { ascending: false, nullsFirst: false })
        .limit(15),
      supabase
        .from('v_mercado_venta_shadow')
        .select('id, nombre_edificio, zona, precio_norm, dormitorios, area_total_m2, datos_json, fecha_publicacion, fecha_creacion')
        .in('zona', ZONAS_EQUIPETROL_DB)
        .eq('fuente', 'remax')
        .not('precio_norm', 'is', null)
        .order('fecha_publicacion', { ascending: false, nullsFirst: false })
        .limit(15),
    ])

    const tomar = (rows: any[] | null, op: 'alquiler' | 'venta') => {
      const out: DestacadoHome[] = []
      for (const row of rows || []) {
        const d = mapDestacado(row, op)
        if (d) out.push(d)
        if (out.length === 3) break
      }
      return out
    }

    const ventas = tomar(vta.data, 'venta')
    const alquileres = tomar(alq.data, 'alquiler')

    // Intercalar venta/alquiler para que la fila mezcle ambas operaciones
    const mezcla: DestacadoHome[] = []
    for (let i = 0; i < 3; i++) {
      if (ventas[i]) mezcla.push(ventas[i])
      if (alquileres[i]) mezcla.push(alquileres[i])
    }
    return mezcla
  } catch (error) {
    console.error('[superficies-data] Error fetching destacados:', error)
    return []
  }
}

// ─── Contexto de mercado para la prop del mockup (demo home) ────────────────
// Réplica honesta del bloque del bottom sheet: mediana + rango típico (p25-p75)
// + conteo de comparables, calculados EN VIVO de v_mercado_venta. Segmentación
// como el sheet real: zona+tipología → todo Equipetrol (zona ampliada) → zona.
export interface ContextoVenta {
  medianaM2: number
  p25M2: number
  p75M2: number
  count: number
  /** etiqueta del segmento comparado, ej. "1 dorm" / "Mono" */
  segmento: string
  /** true si hubo pocos comparables en la zona y se amplió a todo Equipetrol */
  ampliada: boolean
}

function percentil(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return Math.round(sorted[lo])
  return Math.round(sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo))
}

export async function fetchContextoVenta(
  zonaDisplay: string,
  dormitorios: number | null
): Promise<ContextoVenta | null> {
  try {
    if (!supabase) return null

    // La vista ya aplica filtros de calidad; macrozona se filtra acá (ticket #15)
    // Shadow = precios TC nuevo, misma base que el feed (lanzamiento TC nuevo).
    const { data, error } = await supabase
      .from('v_mercado_venta_shadow')
      .select('zona, precio_norm, area_total_m2, dormitorios')
      .in('zona', ZONAS_EQUIPETROL_DB)
      .not('precio_norm', 'is', null)
      .gte('area_total_m2', 20)

    if (error || !data) return null

    const rows = (data as any[])
      .map(r => ({
        zona: displayZona(r.zona),
        dorms: r.dormitorios as number | null,
        m2: parseFloat(r.precio_norm) / parseFloat(r.area_total_m2),
      }))
      // Saneo recalibrado al régimen TC nuevo (p05 shadow ~$1.080/m², min ~$740)
      .filter(r => r.m2 >= 500 && r.m2 <= 5000)

    const segLabel = dormitorios === 0 ? 'Mono' : dormitorios ? `${dormitorios} dorm` : 'todas las tipologías'

    // Niveles de segmentación (mínimo 5 comparables, como el sheet)
    const niveles: Array<{ filtro: (r: typeof rows[number]) => boolean; segmento: string; ampliada: boolean }> = [
      { filtro: r => r.zona === zonaDisplay && r.dorms === dormitorios, segmento: segLabel, ampliada: false },
      { filtro: r => r.dorms === dormitorios, segmento: segLabel, ampliada: true },
      { filtro: r => r.zona === zonaDisplay, segmento: 'todas las tipologías', ampliada: false },
    ]

    for (const nivel of niveles) {
      const vals = rows.filter(nivel.filtro).map(r => r.m2).sort((a, b) => a - b)
      if (vals.length >= 5) {
        return {
          medianaM2: percentil(vals, 0.5),
          p25M2: percentil(vals, 0.25),
          p75M2: percentil(vals, 0.75),
          count: vals.length,
          segmento: nivel.segmento,
          ampliada: nivel.ampliada,
        }
      }
    }
    return null
  } catch (error) {
    console.error('[superficies-data] Error fetching contexto:', error)
    return null
  }
}

export async function fetchSuperficiesData(): Promise<SuperficiesMarketData> {
  try {
    if (!supabase) throw new Error('Supabase not initialized')

    // Ventas activas — cuenta sobre la vista SHADOW para que el número cuadre
    // con lo que el feed muestra (lanzamiento TC nuevo). La vista ya aplica los
    // filtros de calidad canónicos; macrozona se filtra acá (ticket #15).
    const { count: ventasCount } = await supabase
      .from('v_mercado_venta_shadow')
      .select('*', { count: 'exact', head: true })
      .in('zona', ZONAS_EQUIPETROL_DB)

    // Alquileres + medianas por zona (v_mercado_alquiler ya filtra calidad y ≤150d)
    // + TC paralelo del día (mismo patrón que landing-data)
    const [zonasAlquiler, microzonas, tcRes] = await Promise.all([
      obtenerZonasAlquiler(),
      obtenerMicrozonas(),
      supabase.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single(),
    ])
    const tcParalelo = parseFloat(tcRes.data?.valor) || FALLBACK.tcParalelo

    const alquileresActivos = zonasAlquiler.reduce((acc, z) => acc + z.total, 0)
    const centro = zonasAlquiler.find(z => z.zona === 'Equipetrol Centro')
    const zonaTop = centro ?? zonasAlquiler[0]

    // Mapa zona display → USD/m² (para comparar una prop real contra su zona).
    // displayZona() normaliza: microzonas puede devolver nombre BD o display.
    const m2PorZona: Record<string, number> = {}
    for (const m of microzonas) {
      if (m.zona && m.precio_m2) m2PorZona[displayZona(m.zona)] = m.precio_m2
    }

    // Zona más cara REAL (mayor USD/m²) — no asumir cuál es; se calcula
    const ordenadas = Object.entries(m2PorZona).sort((a, b) => b[1] - a[1])
    const zonaMasCara = ordenadas.length
      ? { zona: ordenadas[0][0], m2: ordenadas[0][1] }
      : FALLBACK.zonaMasCara

    return {
      ventasActivas: ventasCount ?? FALLBACK.ventasActivas,
      alquileresActivos: alquileresActivos > 0 ? alquileresActivos : FALLBACK.alquileresActivos,
      medianaAlquilerBob: zonaTop?.mediana_bob ?? FALLBACK.medianaAlquilerBob,
      medianaAlquilerZona: zonaTop
        ? (zonaTop.zona === 'Equipetrol Centro' ? 'Eq. Centro' : zonaTop.zona)
        : FALLBACK.medianaAlquilerZona,
      zonaMasCara,
      tcParalelo,
      m2PorZona,
    }
  } catch (error) {
    console.error('[superficies-data] Error fetching data:', error)
    return FALLBACK
  }
}
