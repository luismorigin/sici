// ============================================================================
// Datos de mercado del entorno SHADOW para /mercado/* — SERVER-ONLY
// ----------------------------------------------------------------------------
// Lee las tablas nuevas del lanzamiento TC nuevo:
//   - v_serie_precios_venta (mig 334): la curva de precios, EMPALMADA — historia
//     estimada hasta el 20-jul + medición viva del cron de ahí en adelante, con
//     macrozona. Reemplazó a `market_price_reexpresado`, que quedó congelada el
//     21-jul cuando el cutover le cortó la fuente (y que ahora es su primer tramo).
//   - market_absorption_snapshots_shadow (migs 283-286 + 313): yield por zona
//   - v_mercado_venta_shadow / v_mercado_alquiler_shadow: cortes vivos
//
// 🔴 TODAS las funciones piden la macrozona OBLIGATORIA — ver `MacrozonaNombre`.
//
// ⚠️ USA SERVICE ROLE (las tablas de series son Preset D: sin acceso anon —
// regla 13 de CLAUDE.md: service_role SIEMPRE server-side). Importar SOLO
// desde getStaticProps/getServerSideProps, NUNCA desde componentes cliente.
//
// Todo es graceful: si falta env o falla una query, devuelve null y la página
// renderiza sin esa sección (no rompe el build).
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { displayZona } from './zonas'
import type { MacrozonaNombre } from './macrozonas'

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

const MES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/**
 * 🔴 TODAS las funciones de este archivo piden la macrozona OBLIGATORIA, sin default.
 * Es deliberado y es la lección del 18-ago-2026: `/api/ventas` tenía Equipetrol
 * como default, el feed de Zona Norte salió a producción sirviendo propiedades
 * de Equipetrol, y ni `tsc` ni `build` dijeron nada — un default no falla, hace
 * la cosa equivocada en silencio. Acá, una página que se olvide no compila.
 * Ver `feedback_aislamiento_no_depende_del_llamador`.
 */

function mediana(sorted: number[]): number {
  if (!sorted.length) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ─── Serie histórica reexpresada (mensual, 1 dormitorio) ────────────────────

export interface SeriePunto {
  mes: string
  usd_m2: number
  bs_m2: number
  tc: number
}

export interface SerieMensual {
  puntos: SeriePunto[]
  /** variación % primer→último mes de cada curva (redondeada) */
  varUsdPct: number
  varBsPct: number
  varTcPct: number
  /** primer día con dato de esta macrozona — para declarar cobertura corta */
  desde: string
  /** true si la curva incluye el tramo ESTIMADO (reexpresado, ~7% de error) */
  incluyeEstimado: boolean
}

/** Un mes con menos días que esto no se dibuja: un punto hecho de 1 día se lee
 *  como un mes entero. Muerde en macrozonas nuevas (ZN empezó un 31 de julio). */
const MIN_DIAS_POR_MES = 5

/**
 * Serie mensual de $/m² (1 dormitorio, agregado de la macrozona).
 *
 * 🔴 Lee `v_serie_precios_venta` (mig 334), NO `market_price_reexpresado`.
 * Esa tabla quedó congelada el 21-jul-2026: su fuente (`precios_historial` +
 * `propiedades_v2_archivo`) murió con el cutover. La vista la empalma con los
 * snapshots shadow, que avanzan solos cada noche y sí tienen macrozona.
 *
 * Devuelve null si la macrozona no tiene al menos 2 meses dibujables — es el
 * caso de una zona recién incorporada, y forzar la curva ahí inventaría una
 * tendencia. La página declara la cobertura en vez de dibujar.
 */
export async function fetchSerieMensualVentas(macrozona: MacrozonaNombre): Promise<SerieMensual | null> {
  try {
    const sb = serverClient()
    if (!sb) return null
    const { data, error } = await sb
      .from('v_serie_precios_venta')
      .select('fecha, usd_m2, bs_m2, tc, fuente')
      .eq('macrozona', macrozona)
      .eq('zona', 'global')
      .eq('dormitorios', 1)
      .order('fecha')
    if (error || !data?.length) return null

    const filas = data as Array<{ fecha: string; usd_m2: number; bs_m2: number; tc: number; fuente: string }>
    const desde = String(filas[0].fecha).slice(0, 10)
    const incluyeEstimado = filas.some(r => r.fuente === 'historico')

    const porMes = new Map<string, { usd: number[]; bs: number[]; tc: number[]; dias: Set<string> }>()
    for (const r of filas) {
      const key = String(r.fecha).slice(0, 7)
      const e = porMes.get(key) || { usd: [], bs: [], tc: [], dias: new Set<string>() }
      if (r.usd_m2) e.usd.push(Number(r.usd_m2))
      if (r.bs_m2) e.bs.push(Number(r.bs_m2))
      if (r.tc) e.tc.push(Number(r.tc))
      e.dias.add(String(r.fecha).slice(0, 10))
      porMes.set(key, e)
    }

    const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)
    const puntos: SeriePunto[] = [...porMes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([, v]) => v.dias.size >= MIN_DIAS_POR_MES)
      .map(([key, v]) => ({
        mes: MES_LABEL[parseInt(key.slice(5, 7), 10) - 1] || key,
        usd_m2: Math.round(avg(v.usd)),
        bs_m2: Math.round(avg(v.bs)),
        tc: Math.round(avg(v.tc) * 100) / 100,
      }))
      .filter(p => p.usd_m2 > 0 && p.bs_m2 > 0)

    if (puntos.length < 2) return null
    const first = puntos[0], last = puntos[puntos.length - 1]
    const pct = (a: number, b: number) => Math.round((b / a - 1) * 1000) / 10
    return {
      puntos,
      varUsdPct: pct(first.usd_m2, last.usd_m2),
      varBsPct: pct(first.bs_m2, last.bs_m2),
      varTcPct: pct(first.tc, last.tc),
      desde,
      incluyeEstimado,
    }
  } catch {
    return null
  }
}

// ─── Indicadores vivos de venta (vistas shadow + snapshot shadow) ───────────

export interface YieldZona {
  zona: string
  roi: number
}

export interface VentasShadowExtra {
  /** yield bruto anual por zona, 1 dorm, del snapshot shadow más reciente */
  yieldZonas: YieldZona[]
  /** días publicado (mediana) del inventario activo */
  domVenta: number | null
  domAlquiler: number | null
  /** spread del inventario activo: preventa vs entrega inmediata (todas las tipologías) */
  spread: { prevN: number; prevM2: number; entrN: number; entrM2: number } | null
  edificios: number | null
}

// El mapa de display vive en `zonas.ts` y ya conoce las dos macrozonas (las 6 de
// Equipetrol y las 14 microzonas de Zona Norte). Tener una copia acá servía
// mientras la página era Equipetrol-only; con ZN habría mostrado los nombres
// crudos de la BD sin fallar.

export async function fetchVentasShadowExtra(macrozona: MacrozonaNombre): Promise<VentasShadowExtra | null> {
  try {
    const sb = serverClient()
    if (!sb) return null

    // 🔴 FILTRAR SIEMPRE POR MACROZONA. Esta página es /mercado/equipetrol: sin el filtro,
    // las vistas shadow traen TAMBIÉN Zona Norte (378 props de venta al 31-jul-2026) y los
    // números salen mezclados. Medido antes del fix: "edificios" decía 257 cuando eran 135,
    // y el spread preventa→entrega se BORRABA (1.668 vs 1.661 = sin spread, cuando el real
    // es 1.707 → 1.780, +4,3 %). Justo la métrica del inversor.
    // 🔴 `macrozona` EXISTE SOLO DESDE LA MIG 313 — este archivo la REQUIERE aplicada.
    // Si el deploy sale antes que la migración, la query del snapshot falla con
    // "column ... does not exist"; `Promise.all` no rechaza (el error viene dentro del
    // objeto), así que la página NO se cae: simplemente se queda SIN yield por zona.
    // Pasó el 31-jul-2026 — el commit salió y la migración quedó sin aplicar.
    const [viewRes, snapRes, alqDomRes] = await Promise.all([
      sb.from('v_mercado_venta_shadow')
        .select('precio_m2, estado_construccion, dias_en_mercado, id_proyecto_master')
        .eq('zona_general', macrozona),
      sb.from('market_absorption_snapshots_shadow')
        .select('fecha, zona, dormitorios, roi_bruto_anual')
        .eq('dormitorios', 1)
        .eq('macrozona', macrozona)
        .neq('zona', 'global')
        .not('roi_bruto_anual', 'is', null)
        .order('fecha', { ascending: false })
        .limit(24),
      sb.from('v_mercado_alquiler_shadow')
        .select('dias_en_mercado')
        .eq('zona_general', macrozona),
    ])

    const rows = (viewRes.data || []) as Array<{
      precio_m2: number | string | null
      estado_construccion: string | null
      dias_en_mercado: number | null
      id_proyecto_master: number | null
    }>
    if (!rows.length) return null

    const m2 = (r: (typeof rows)[number]) => parseFloat(String(r.precio_m2)) || 0
    const PREV = ['preventa', 'en_construccion', 'en_pozo']
    const prev = rows.filter(r => r.estado_construccion && PREV.includes(r.estado_construccion) && m2(r) > 0)
    const entr = rows.filter(r => r.estado_construccion === 'entrega_inmediata' && m2(r) > 0)
    const sortM2 = (a: typeof rows) => a.map(m2).sort((x, y) => x - y)

    const dias = rows.map(r => r.dias_en_mercado).filter((d): d is number => d != null).sort((a, b) => a - b)
    const diasAlq = ((alqDomRes.data || []) as Array<{ dias_en_mercado: number | null }>)
      .map(r => r.dias_en_mercado).filter((d): d is number => d != null).sort((a, b) => a - b)

    // yield: solo la fecha más reciente del snapshot
    const snapRows = (snapRes.data || []) as Array<{ fecha: string; zona: string; roi_bruto_anual: number | string }>
    const lastFecha = snapRows[0]?.fecha
    const yieldZonas: YieldZona[] = snapRows
      .filter(r => r.fecha === lastFecha)
      .map(r => ({ zona: displayZona(r.zona), roi: Math.round(parseFloat(String(r.roi_bruto_anual)) * 10) / 10 }))
      .filter(y => y.roi > 0)
      .sort((a, b) => b.roi - a.roi)

    return {
      yieldZonas,
      domVenta: dias.length ? Math.round(mediana(dias)) : null,
      domAlquiler: diasAlq.length ? Math.round(mediana(diasAlq)) : null,
      spread: prev.length >= 5 && entr.length >= 5
        ? {
            prevN: prev.length, prevM2: Math.round(mediana(sortM2(prev))),
            entrN: entr.length, entrM2: Math.round(mediana(sortM2(entr))),
          }
        : null,
      edificios: new Set(rows.map(r => r.id_proyecto_master).filter(Boolean)).size || null,
    }
  } catch {
    return null
  }
}

// ─── Cortes vivos de alquiler (vista + tabla shadow) ────────────────────────

export interface CorteAlquiler {
  n: number
  medianaBs: number
}

export interface AlquilerShadowExtra {
  /** solo el positivo declarado (regla fiduciaria de flags) */
  amoblado: CorteAlquiler | null
  equipado: CorteAlquiler | null
  conParqueo: CorteAlquiler | null
  rangoP25: number | null
  rangoP75: number | null
  domAlquiler: number | null
  domVenta: number | null
  edificios: number | null
}

export async function fetchAlquilerShadowExtra(macrozona: MacrozonaNombre): Promise<AlquilerShadowExtra | null> {
  try {
    const sb = serverClient()
    if (!sb) return null

    const [viewRes, equipRes, ventaDomRes] = await Promise.all([
      sb.from('v_mercado_alquiler_shadow')
        .select('id, precio_mensual_bob, amoblado, estacionamientos, parqueo_incluido, dias_en_mercado, id_proyecto_master')
        .eq('zona_general', macrozona),
      // equipado vive en datos_json de la tabla (no expuesto en la vista)
      sb.from('propiedades_v2')
        .select('id, datos_json')
        .eq('tipo_operacion', 'alquiler')
        .eq('status', 'completado'),
      // Mismo motivo que arriba: sin el filtro, el DOM de venta mezcla Zona Norte.
      sb.from('v_mercado_venta_shadow')
        .select('dias_en_mercado')
        .eq('zona_general', macrozona),
    ])

    const rows = (viewRes.data || []) as Array<{
      id: number
      precio_mensual_bob: number | string | null
      amoblado: string | null
      estacionamientos: number | null
      parqueo_incluido: boolean | null
      dias_en_mercado: number | null
      id_proyecto_master: number | null
    }>
    if (!rows.length) return null

    const equipadoIds = new Set(
      ((equipRes.data || []) as Array<{ id: number; datos_json: { equipado?: boolean } | null }>)
        .filter(r => r.datos_json?.equipado === true)
        .map(r => r.id)
    )

    const bob = (r: (typeof rows)[number]) => parseFloat(String(r.precio_mensual_bob)) || 0
    const corte = (pred: (r: (typeof rows)[number]) => boolean): CorteAlquiler | null => {
      const vals = rows.filter(r => pred(r) && bob(r) > 0).map(bob).sort((a, b) => a - b)
      return vals.length >= 5 ? { n: vals.length, medianaBs: Math.round(mediana(vals)) } : null
    }

    const todos = rows.map(bob).filter(v => v > 0).sort((a, b) => a - b)
    const pctl = (p: number) => Math.round(todos[Math.min(todos.length - 1, Math.floor((todos.length - 1) * p))])
    const dias = rows.map(r => r.dias_en_mercado).filter((d): d is number => d != null).sort((a, b) => a - b)
    const diasVenta = ((ventaDomRes.data || []) as Array<{ dias_en_mercado: number | null }>)
      .map(r => r.dias_en_mercado).filter((d): d is number => d != null).sort((a, b) => a - b)

    return {
      amoblado: corte(r => r.amoblado === 'si'),
      equipado: corte(r => equipadoIds.has(r.id)),
      conParqueo: corte(r => (r.estacionamientos ?? 0) >= 1 || r.parqueo_incluido === true),
      rangoP25: todos.length ? pctl(0.25) : null,
      rangoP75: todos.length ? pctl(0.75) : null,
      domAlquiler: dias.length ? Math.round(mediana(dias)) : null,
      domVenta: diasVenta.length ? Math.round(mediana(diasVenta)) : null,
      edificios: new Set(rows.map(r => r.id_proyecto_master).filter(Boolean)).size || null,
    }
  } catch {
    return null
  }
}
