import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  _client = createClient(url, key)
  return _client
}

export async function fetchTC(): Promise<{ paralelo: number; oficial: number }> {
  const sb = getSupabase()
  const { data } = await sb
    .from('config_global')
    .select('clave, valor')
    .in('clave', ['tipo_cambio_paralelo', 'tipo_cambio_oficial'])
    .eq('activo', true)

  let paralelo = 9.28
  let oficial = 6.96
  for (const row of data ?? []) {
    if (row.clave === 'tipo_cambio_paralelo') paralelo = parseFloat(row.valor)
    if (row.clave === 'tipo_cambio_oficial') oficial = parseFloat(row.valor)
  }
  return { paralelo, oficial }
}

export interface VentaRow {
  id: number
  nombre_edificio: string | null
  dormitorios: number
  area_total_m2: number
  precio_norm: number
  precio_m2: number
  dias_en_mercado: number
  zona: string
  id_proyecto_master: number | null
  estado_construccion: string | null
  fuente: string
  precio_usd: number
  tipo_cambio_detectado: string | null
}

export interface AlquilerRow {
  id: number
  nombre_edificio: string | null
  dormitorios: number
  area_total_m2: number
  precio_mensual: number
  dias_en_mercado: number
  zona: string
  amoblado: string | null
}

// Estudios de mercado consultan propiedades_v2 directo (NO vistas UX).
// Mismos filtros canónicos de calidad pero SIN límite de días.
// precio_norm, precio_m2, dias_en_mercado se calculan en JS post-query.
const VENTA_COLUMNS = 'id, nombre_edificio, dormitorios, area_total_m2, zona, id_proyecto_master, estado_construccion, fuente, precio_usd, tipo_cambio_detectado, es_multiproyecto, tipo_propiedad_original, fecha_publicacion, fecha_discovery, duplicado_de'
const ALQUILER_COLUMNS = 'id, nombre_edificio, dormitorios, area_total_m2, zona, amoblado, precio_mensual_bob, precio_mensual_usd, fecha_publicacion, fecha_discovery, duplicado_de, es_multiproyecto, tipo_propiedad_original'

// Zonas excluidas de estudios de mercado (muestra insuficiente o sin asignar)
const ZONAS_EXCLUIDAS = ['Sin zona', 'Eq. 3er Anillo']

// Zona aliases legacy -> nombre canonico
const ZONA_ALIASES: Record<string, string> = {
  'Villa Brígida': 'Villa Brigida',
}

function normalizeZona(zona: string): string {
  return ZONA_ALIASES[zona] ?? zona
}

function isZonaValida(zona: string | null): boolean {
  if (!zona || zona === '') return false
  return !ZONAS_EXCLUIDAS.includes(zona) && !ZONAS_EXCLUIDAS.includes(normalizeZona(zona))
}

// TC paralelo para precio_normalizado() — se setea en generate.ts después de fetchTC()
let _tcParalelo = 9.28
let _tcOficial = 6.96
export function setTC(tc: { paralelo: number; oficial: number }) {
  _tcParalelo = tc.paralelo
  _tcOficial = tc.oficial
}

function precioNormalizado(precioUsd: number, tcDetectado: string | null): number {
  if (tcDetectado === 'paralelo' && _tcParalelo > 0) {
    return Math.round(precioUsd * _tcParalelo / _tcOficial)
  }
  return precioUsd
}

function calcDiasEnMercado(fechaPub: string | null, fechaDisc: string | null): number {
  const fecha = fechaPub ?? fechaDisc
  if (!fecha) return 0
  return Math.round((Date.now() - new Date(fecha).getTime()) / 86400000)
}

export async function queryVenta(zona?: string, dorms?: number): Promise<VentaRow[]> {
  const sb = getSupabase()
  let q = sb.from('propiedades_v2').select(VENTA_COLUMNS)
    .eq('tipo_operacion', 'venta')
    .in('status', ['completado', 'actualizado'])
    .is('duplicado_de', null)
    .not('zona', 'is', null)
    .gt('precio_usd', 0)
    .gte('area_total_m2', 20)
  if (zona) q = q.eq('zona', zona)
  if (dorms !== undefined) q = q.eq('dormitorios', dorms)
  const { data, error } = await q.limit(3000)
  if (error) throw new Error(`queryVenta: ${error.message}`)
  return (data ?? [])
    .filter(r => {
      if (!isZonaValida(r.zona)) return false
      if (r.es_multiproyecto === true) return false
      const tipo = r.tipo_propiedad_original ?? ''
      if (['baulera', 'parqueo', 'garaje', 'deposito'].includes(tipo)) return false
      return true
    })
    .map(r => {
      const area = parseFloat(r.area_total_m2) || 0
      const precioUsd = parseFloat(r.precio_usd) || 0
      const pNorm = precioNormalizado(precioUsd, r.tipo_cambio_detectado)
      const pM2 = area > 0 ? pNorm / area : 0
      return {
        ...r,
        zona: normalizeZona(r.zona),
        area_total_m2: area,
        precio_usd: precioUsd,
        precio_norm: pNorm,
        precio_m2: pM2,
        dias_en_mercado: calcDiasEnMercado(r.fecha_publicacion, r.fecha_discovery),
      }
    }) as VentaRow[]
}

export async function queryAlquiler(zona?: string, dorms?: number): Promise<AlquilerRow[]> {
  const sb = getSupabase()
  let q = sb.from('propiedades_v2').select(ALQUILER_COLUMNS)
    .eq('tipo_operacion', 'alquiler')
    .in('status', ['completado', 'actualizado'])
    .is('duplicado_de', null)
    .not('zona', 'is', null)
    .gt('precio_mensual_usd', 0)
    .gte('area_total_m2', 20)
  if (zona) q = q.eq('zona', zona)
  if (dorms !== undefined) q = q.eq('dormitorios', dorms)
  const { data, error } = await q.limit(2000)
  if (error) throw new Error(`queryAlquiler: ${error.message}`)
  return (data ?? [])
    .filter(r => {
      if (!isZonaValida(r.zona)) return false
      if (r.es_multiproyecto === true) return false
      const tipo = r.tipo_propiedad_original ?? ''
      if (['baulera', 'parqueo', 'garaje', 'deposito'].includes(tipo)) return false
      return true
    })
    .map(r => {
      const bob = parseFloat(r.precio_mensual_bob) || 0
      return {
        ...r,
        zona: normalizeZona(r.zona),
        area_total_m2: parseFloat(r.area_total_m2) || 0,
        precio_mensual: bob > 0 ? Math.round((bob / _tcOficial) * 100) / 100 : parseFloat(r.precio_mensual_usd) || 0,
        dias_en_mercado: calcDiasEnMercado(r.fecha_publicacion, r.fecha_discovery),
      }
    }) as AlquilerRow[]
}

export async function queryPropiedadesProyecto(idProyecto: number): Promise<VentaRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('propiedades_v2')
    .select('id, nombre_edificio, dormitorios, area_total_m2, precio_usd, tipo_cambio_detectado, fuente, zona, id_proyecto_master, estado_construccion, primera_ausencia_at, status, url, es_multiproyecto, fecha_publicacion, fecha_discovery, datos_json_enrichment')
    .eq('id_proyecto_master', idProyecto)
    .eq('tipo_operacion', 'venta')
    .in('status', ['completado', 'inactivo_pending'])
  if (error) throw new Error(`queryPropiedadesProyecto: ${error.message}`)
  return (data ?? []) as any[]
}

export async function queryRotacion(zona: string, dias: number): Promise<any[]> {
  const sb = getSupabase()
  const fechaDesde = new Date()
  fechaDesde.setDate(fechaDesde.getDate() - dias)

  const { data, error } = await sb
    .from('propiedades_v2')
    .select('id, nombre_edificio, dormitorios, area_total_m2, precio_usd, tipo_cambio_detectado, tipo_propiedad_original, es_multiproyecto, primera_ausencia_at, fecha_publicacion, fecha_creacion, zona, datos_json_enrichment')
    .eq('tipo_operacion', 'venta')
    .eq('status', 'inactivo_confirmed')
    .eq('zona', zona)
    .is('duplicado_de', null)
    .not('primera_ausencia_at', 'is', null)
    .gte('primera_ausencia_at', fechaDesde.toISOString())
    .gt('precio_usd', 0)
    .gte('area_total_m2', 20)
    .limit(200)
  if (error) throw new Error(`queryRotacion: ${error.message}`)

  // Filtros alineados con migration 211 (snapshot_absorcion_mercado)
  return (data ?? []).filter((r: any) => {
    const tipo = r.tipo_propiedad_original ?? ''
    if (['baulera', 'parqueo', 'garaje', 'deposito'].includes(tipo)) return false
    if (r.es_multiproyecto === true) return false
    return true
  })
}

export async function queryNuevas(zona: string, dias: number): Promise<any[]> {
  const sb = getSupabase()
  const fechaDesde = new Date()
  fechaDesde.setDate(fechaDesde.getDate() - dias)

  const { data, error } = await sb
    .from('propiedades_v2')
    .select('id, nombre_edificio, dormitorios, area_total_m2, precio_usd, tipo_cambio_detectado, zona, fecha_creacion')
    .eq('tipo_operacion', 'venta')
    .in('status', ['completado', 'actualizado', 'nueva', 'pendiente_enriquecimiento'])
    .is('duplicado_de', null)
    .eq('zona', zona)
    .gt('precio_usd', 0)
    .gte('area_total_m2', 20)
    .gte('fecha_creacion', fechaDesde.toISOString())
    .limit(500)
  if (error) throw new Error(`queryNuevas: ${error.message}`)

  return (data ?? []).filter((r: any) => {
    if (r.es_multiproyecto === true) return false
    const tipo = r.tipo_propiedad_original ?? ''
    if (['baulera', 'parqueo', 'garaje', 'deposito'].includes(tipo)) return false
    return true
  })
}

// --- Utility ---

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const frac = idx - lower
  if (lower + 1 >= sorted.length) return sorted[lower]
  return sorted[lower] + frac * (sorted[lower + 1] - sorted[lower])
}

export function percentileRank(values: number[], value: number): number {
  if (values.length === 0) return 50
  const below = values.filter(v => v < value).length
  return Math.round((below / values.length) * 100)
}
