import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// --- Supabase client (singleton aislado del framework de clientes) ---

let _client: SupabaseClient | null = null

export function getSupabaseBaseline(): SupabaseClient {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  _client = createClient(url, key)
  return _client
}

// --- TC dinámico desde Binance (via obtener_tc_actuales RPC) ---

export interface TCBaseline {
  paralelo: number
  oficial: number
  spread: number                  // spread paralelo sobre oficial, %
  fechaParalelo: string           // ISO — última captura Binance P2P
  fechaOficial: string
  timestamp: string               // ISO — cuando corrió obtener_tc_actuales()
}

export async function fetchTCBinance(): Promise<TCBaseline> {
  const sb = getSupabaseBaseline()
  const { data, error } = await sb.rpc('obtener_tc_actuales')
  if (error) throw new Error(`fetchTCBinance: ${error.message}`)
  if (!data || typeof data !== 'object') throw new Error('fetchTCBinance: RPC devolvió respuesta vacía o malformada')
  return {
    paralelo: parseFloat(data.paralelo?.valor ?? '0'),
    oficial: parseFloat(data.oficial?.valor ?? '0'),
    spread: parseFloat(data.spread ?? '0'),
    fechaParalelo: data.paralelo?.fecha_actualizacion ?? '',
    fechaOficial: data.oficial?.fecha_actualizacion ?? '',
    timestamp: data.timestamp ?? new Date().toISOString(),
  }
}

// --- Tipos de fila (derivados de propiedades_v2) ---

export interface VentaRowBaseline {
  id: number
  nombre_edificio: string | null
  dormitorios: number
  area_total_m2: number
  precio_norm: number              // USD normalizado al oficial
  precio_m2: number
  dias_en_mercado: number
  zona: string
  id_proyecto_master: number | null
  estado_construccion: string | null
  fuente: string
  precio_usd: number               // crudo del portal
  tipo_cambio_detectado: string | null
}

export interface AlquilerRowBaseline {
  id: number
  nombre_edificio: string | null
  dormitorios: number
  area_total_m2: number
  precio_mensual: number           // USD al oficial (derivado de BOB)
  dias_en_mercado: number
  zona: string
  amoblado: string | null
}

// --- Filtros canónicos (paridad con feed público) ---

const VENTA_COLUMNS = 'id, nombre_edificio, dormitorios, area_total_m2, zona, id_proyecto_master, estado_construccion, fuente, precio_usd, tipo_cambio_detectado, es_multiproyecto, tipo_propiedad_original, fecha_publicacion, fecha_discovery, duplicado_de'
const ALQUILER_COLUMNS = 'id, nombre_edificio, dormitorios, area_total_m2, zona, amoblado, precio_mensual_bob, precio_mensual_usd, fecha_publicacion, fecha_discovery, duplicado_de, es_multiproyecto, tipo_propiedad_original'

// Zonas con muestra insuficiente para el baseline (<5 unidades estables)
const ZONAS_EXCLUIDAS_BASELINE = ['Sin zona', 'Eq. 3er Anillo']

const ZONA_ALIASES: Record<string, string> = {
  'Villa Brígida': 'Villa Brigida',
}

const TIPOS_EXCLUIDOS = ['baulera', 'parqueo', 'garaje', 'deposito']

function normalizeZona(zona: string): string {
  return ZONA_ALIASES[zona] ?? zona
}

function isZonaValida(zona: string | null, zonasIncluidas?: string[]): boolean {
  if (!zona || zona === '') return false
  const canon = normalizeZona(zona)
  if (ZONAS_EXCLUIDAS_BASELINE.includes(zona) || ZONAS_EXCLUIDAS_BASELINE.includes(canon)) return false
  if (zonasIncluidas && zonasIncluidas.length > 0) return zonasIncluidas.includes(canon)
  return true
}

// --- TC state para precio_normalizado (seteado desde generate-baseline) ---

let _tcParalelo = 0
let _tcOficial = 6.96
export function setTCBaseline(tc: TCBaseline) {
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

// --- Filtro antigüedad según estado_construccion (paridad feed público) ---
// entrega_inmediata/nuevo/no_especificado: <= 300 d
// preventa: <= 730 d
// alquiler: <= 150 d (aplica distinto en queryAlquilerBaseline)
export function pasaFiltroAntiguedadVenta(dias: number, estado: string | null): boolean {
  const limite = estado === 'preventa' ? 730 : 300
  return dias <= limite
}

export function pasaFiltroAntiguedadAlquiler(dias: number): boolean {
  return dias <= 150
}

// --- Queries ---

export interface QueryVentaOpts {
  zonasIncluidas?: string[]
  dorms?: number
}

export async function queryVentaBaseline(opts: QueryVentaOpts = {}): Promise<VentaRowBaseline[]> {
  const sb = getSupabaseBaseline()
  let q = sb.from('propiedades_v2').select(VENTA_COLUMNS)
    .eq('tipo_operacion', 'venta')
    .in('status', ['completado', 'actualizado'])
    .is('duplicado_de', null)
    .not('zona', 'is', null)
    .gt('precio_usd', 0)
    .gte('area_total_m2', 20)
  if (opts.dorms !== undefined) q = q.eq('dormitorios', opts.dorms)
  const { data, error } = await q.limit(5000)
  if (error) throw new Error(`queryVentaBaseline: ${error.message}`)

  return (data ?? [])
    .filter(r => {
      if (!isZonaValida(r.zona, opts.zonasIncluidas)) return false
      if (r.es_multiproyecto === true) return false
      const tipo = r.tipo_propiedad_original ?? ''
      if (TIPOS_EXCLUIDOS.includes(tipo)) return false
      return true
    })
    .map(r => {
      const area = parseFloat(r.area_total_m2) || 0
      const precioUsd = parseFloat(r.precio_usd) || 0
      const pNorm = precioNormalizado(precioUsd, r.tipo_cambio_detectado)
      const pM2 = area > 0 ? pNorm / area : 0
      const dias = calcDiasEnMercado(r.fecha_publicacion, r.fecha_discovery)
      // `nuevo_a_estrenar` se consolida en `entrega_inmediata` — conceptualmente
      // son lo mismo para el comprador (departamento listo y nunca habitado)
      const estadoNorm = r.estado_construccion === 'nuevo_a_estrenar'
        ? 'entrega_inmediata'
        : r.estado_construccion
      return {
        id: r.id,
        nombre_edificio: r.nombre_edificio,
        dormitorios: r.dormitorios,
        area_total_m2: area,
        precio_norm: pNorm,
        precio_m2: pM2,
        dias_en_mercado: dias,
        zona: normalizeZona(r.zona),
        id_proyecto_master: r.id_proyecto_master,
        estado_construccion: estadoNorm,
        fuente: r.fuente,
        precio_usd: precioUsd,
        tipo_cambio_detectado: r.tipo_cambio_detectado,
      }
    })
    .filter(r => pasaFiltroAntiguedadVenta(r.dias_en_mercado, r.estado_construccion))
}

export async function queryAlquilerBaseline(opts: QueryVentaOpts = {}): Promise<AlquilerRowBaseline[]> {
  const sb = getSupabaseBaseline()
  let q = sb.from('propiedades_v2').select(ALQUILER_COLUMNS)
    .eq('tipo_operacion', 'alquiler')
    .in('status', ['completado', 'actualizado'])
    .is('duplicado_de', null)
    .not('zona', 'is', null)
    .gt('precio_mensual_usd', 0)
    .gte('area_total_m2', 20)
  if (opts.dorms !== undefined) q = q.eq('dormitorios', opts.dorms)
  const { data, error } = await q.limit(3000)
  if (error) throw new Error(`queryAlquilerBaseline: ${error.message}`)

  return (data ?? [])
    .filter(r => {
      if (!isZonaValida(r.zona, opts.zonasIncluidas)) return false
      if (r.es_multiproyecto === true) return false
      const tipo = r.tipo_propiedad_original ?? ''
      if (TIPOS_EXCLUIDOS.includes(tipo)) return false
      return true
    })
    .map(r => {
      const bob = parseFloat(r.precio_mensual_bob) || 0
      const dias = calcDiasEnMercado(r.fecha_publicacion, r.fecha_discovery)
      return {
        id: r.id,
        nombre_edificio: r.nombre_edificio,
        dormitorios: r.dormitorios,
        area_total_m2: parseFloat(r.area_total_m2) || 0,
        precio_mensual: bob > 0 ? Math.round((bob / _tcOficial) * 100) / 100 : parseFloat(r.precio_mensual_usd) || 0,
        dias_en_mercado: dias,
        zona: normalizeZona(r.zona),
        amoblado: r.amoblado,
      }
    })
    .filter(r => pasaFiltroAntiguedadAlquiler(r.dias_en_mercado))
}

// --- Utilities estadísticas ---

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

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}
