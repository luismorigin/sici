// ============================================================================
// Datos de mercado del entorno SHADOW para /mercado/* — SERVER-ONLY
// ----------------------------------------------------------------------------
// Lee las tablas nuevas del lanzamiento TC nuevo:
//   - market_price_reexpresado (migs 287-289): serie histórica 6,5 meses en
//     USD + Bs + TC por fecha (ESTIMACIÓN declarada, ver COMMENT de la tabla)
//   - market_absorption_snapshots_shadow (migs 283-286): yield por zona
//   - v_mercado_venta_shadow / v_mercado_alquiler_shadow: cortes vivos
//
// ⚠️ USA SERVICE ROLE (las tablas de series son Preset D: sin acceso anon —
// regla 13 de CLAUDE.md: service_role SIEMPRE server-side). Importar SOLO
// desde getStaticProps/getServerSideProps, NUNCA desde componentes cliente.
//
// Todo es graceful: si falta env o falla una query, devuelve null y la página
// renderiza sin esa sección (no rompe el build).
// ============================================================================
import { createClient } from '@supabase/supabase-js'

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

const MES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

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
}

export async function fetchSerieMensualVentas(): Promise<SerieMensual | null> {
  try {
    const sb = serverClient()
    if (!sb) return null
    const { data, error } = await sb
      .from('market_price_reexpresado')
      .select('fecha, usd_m2_mediana, bs_m2_mediana, tc_paralelo_fecha')
      .eq('zona', 'global')
      .eq('dormitorios', 1)
      .order('fecha')
    if (error || !data?.length) return null

    const porMes = new Map<string, { usd: number[]; bs: number[]; tc: number[] }>()
    for (const r of data as Array<{ fecha: string; usd_m2_mediana: number; bs_m2_mediana: number; tc_paralelo_fecha: number }>) {
      const key = String(r.fecha).slice(0, 7)
      const e = porMes.get(key) || { usd: [], bs: [], tc: [] }
      if (r.usd_m2_mediana) e.usd.push(Number(r.usd_m2_mediana))
      if (r.bs_m2_mediana) e.bs.push(Number(r.bs_m2_mediana))
      if (r.tc_paralelo_fecha) e.tc.push(Number(r.tc_paralelo_fecha))
      porMes.set(key, e)
    }

    const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)
    const puntos: SeriePunto[] = [...porMes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
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

const ZONA_DISPLAY: Record<string, string> = {
  'Equipetrol Centro': 'Eq. Centro',
  'Equipetrol Norte': 'Eq. Norte',
  'Equipetrol Oeste': 'Eq. Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'V. Brígida',
  'Eq. 3er Anillo': 'Eq. 3er Anillo',
}

export async function fetchVentasShadowExtra(): Promise<VentasShadowExtra | null> {
  try {
    const sb = serverClient()
    if (!sb) return null

    const [viewRes, snapRes, alqDomRes] = await Promise.all([
      sb.from('v_mercado_venta_shadow')
        .select('precio_m2, estado_construccion, dias_en_mercado, id_proyecto_master'),
      sb.from('market_absorption_snapshots_shadow')
        .select('fecha, zona, dormitorios, roi_bruto_anual')
        .eq('dormitorios', 1)
        .neq('zona', 'global')
        .not('roi_bruto_anual', 'is', null)
        .order('fecha', { ascending: false })
        .limit(24),
      sb.from('v_mercado_alquiler_shadow').select('dias_en_mercado'),
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
      .map(r => ({ zona: ZONA_DISPLAY[r.zona] || r.zona, roi: Math.round(parseFloat(String(r.roi_bruto_anual)) * 10) / 10 }))
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

export async function fetchAlquilerShadowExtra(): Promise<AlquilerShadowExtra | null> {
  try {
    const sb = serverClient()
    if (!sb) return null

    const [viewRes, equipRes, ventaDomRes] = await Promise.all([
      sb.from('v_mercado_alquiler_shadow')
        .select('id, precio_mensual_bob, amoblado, estacionamientos, parqueo_incluido, dias_en_mercado, id_proyecto_master')
        .eq('zona_general', 'Equipetrol'),
      // equipado vive en datos_json de la tabla (no expuesto en la vista)
      sb.from('propiedades_v2_shadow')
        .select('id, datos_json')
        .eq('tipo_operacion', 'alquiler')
        .eq('status', 'completado'),
      sb.from('v_mercado_venta_shadow').select('dias_en_mercado'),
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
