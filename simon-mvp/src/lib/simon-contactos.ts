// lib/simon-contactos.ts — CRM B2C: contactos del bot de WhatsApp (simon-asistente).
//
// USO: SOLO server-side (API routes admin). Las tablas son PII con RLS deny-all
// → service_role. Patrón espeja a lib/broker-prospection.ts.
//
// Los contadores salen de la vista v_simon_contactos_resumen (mig 296): se DERIVAN,
// no se guardan (CRM_CLIENTES_B2C_PLAN.md §5).

import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Las 3 formas en que un mismo número quedó guardado en `broker_shortlists`
 * antes del fix de normalización (el create solo hacía .trim()):
 *   +59176308808 · 59176308808 · 76308808
 * Documentado en CRM_CLIENTES_B2C_PLAN.md §2.2. Las filas NUEVAS ya se guardan
 * normalizadas, pero las viejas siguen sucias → hay que buscar las 3.
 */
export function variantesTelefono(normalizado: string): string[] {
  const m = /^\+591([67]\d{7})$/.exec(normalizado)
  if (!m) return [normalizado]
  const local = m[1]
  return [`+591${local}`, `591${local}`, local]
}

export interface ContactoResumen {
  id: string
  telefono: string
  nombre: string | null
  estado: string
  notas: string | null
  created_at: string
  total_mensajes: number
  mensajes_in: number
  mensajes_out: number
  primer_mensaje_at: string | null
  ultimo_mensaje_at: string | null
  ultimo_texto_in: string | null
  total_shortlists: number
  ultima_shortlist_at: string | null
  total_favoritos: number
  ultimo_favorito_at: string | null
  total_wa_clicks: number
  ultimo_wa_click_at: string | null
  dias_sin_actividad: number | null
}

export interface MensajeCRM {
  id: string
  direccion: 'in' | 'out'
  texto: string | null
  tipo: string | null
  enviado_at: string
}

export interface PropShortlist {
  propiedad_id: number
  tipo_operacion: string | null
  /** Marcada con ❤ por el cliente en /b/[hash] → interés REVELADO (lo más valioso). */
  favorita: boolean
  is_destacada: boolean | null
  precio_norm_snapshot: number | null
  precio_mensual_bob_snapshot: number | null
  // Datos de la propiedad (pueden faltar si se dio de baja)
  nombre_edificio: string | null
  zona: string | null
  dormitorios: number | null
  area_total_m2: number | null
}

export interface ShortlistCRM {
  id: string
  hash: string
  cliente_nombre: string | null
  created_at: string
  view_count: number | null
  status: string | null
  /** Aperturas reales del link (broker_shortlist_views): señal de calor. */
  aperturas: number
  primera_apertura_at: string | null
  ultima_apertura_at: string | null
  props: PropShortlist[]
  total_favoritas: number
}

/** Lista de contactos con sus contadores. `search` filtra por teléfono o nombre. */
export async function listContactos(opts: { search?: string | null; limit?: number } = {}) {
  let q = sb()
    .from('v_simon_contactos_resumen')
    .select('*')
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 200)

  const s = opts.search?.trim()
  if (s) q = q.or(`telefono.ilike.%${s}%,nombre.ilike.%${s}%`)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as ContactoResumen[]
}

/** Totales para las tarjetas de arriba. */
export async function getContactosStats() {
  const { data, error } = await sb()
    .from('v_simon_contactos_resumen')
    .select('total_mensajes, total_shortlists, total_favoritos, total_wa_clicks, ultimo_mensaje_at')
  if (error) throw error

  const filas = data ?? []
  const hace7d = Date.now() - 7 * 864e5

  // La MÉTRICA del negocio: contactos de WhatsApp de los últimos 7 días — de TODAS
  // las superficies, no solo de contactos ya identificados (por eso sale de la tabla
  // directo y no de la vista, que solo cuenta los que tienen contacto_id).
  const { count: waSemana } = await sb()
    .from('wa_clicks')
    .select('id', { count: 'exact', head: true })
    .eq('es_bot', false).eq('es_test', false)
    .gte('created_at', new Date(hace7d).toISOString())

  return {
    total: filas.length,
    con_shortlist: filas.filter(f => (f.total_shortlists ?? 0) > 0).length,
    activos_7d: filas.filter(f => f.ultimo_mensaje_at && new Date(f.ultimo_mensaje_at).getTime() >= hace7d).length,
    mensajes: filas.reduce((a, f) => a + (f.total_mensajes ?? 0), 0),
    favoritos: filas.reduce((a, f) => a + (f.total_favoritos ?? 0), 0),
    contactos_wa_7d: waSemana ?? 0,
  }
}

/** Conversación completa + shortlists de un contacto (timeline del detalle). */
export async function getContactoDetalle(id: string) {
  const client = sb()

  const { data: contacto, error: eC } = await client
    .from('v_simon_contactos_resumen').select('*').eq('id', id).single()
  if (eC) throw eC

  const { data: mensajes, error: eM } = await client
    .from('simon_mensajes')
    .select('id, direccion, texto, tipo, enviado_at')
    .eq('contacto_id', id)
    .order('enviado_at', { ascending: true })
    .limit(500)
  if (eM) throw eM

  // Shortlists del bot cruzadas por teléfono (contacto_id todavía no se puebla
  // en el create path — ver CRM_CLIENTES_B2C_PLAN.md capa 3).
  //
  // ⚠️ El teléfono viejo está SUCIO: hasta el fix de hoy el create solo hacía .trim(),
  // así que el mismo número vive en 3 formatos (+59176…, 59176…, 76…). Un .eq() sobre
  // el normalizado encontraba SOLO las nuevas (bug: el detalle mostraba "SELECCIONES (1)"
  // mientras la lista contaba 21, porque la vista sí normaliza). Se buscan las 3 variantes.
  const { data: slRaw, error: eS } = await client
    .from('broker_shortlists')
    .select('id, hash, cliente_nombre, created_at, view_count, status')
    .eq('broker_slug', 'simon-asistente')
    .in('cliente_telefono', variantesTelefono((contacto as ContactoResumen).telefono))
    .order('created_at', { ascending: false })
  if (eS) throw eS

  const shortlists = await enriquecerShortlists(client, slRaw ?? [])

  return {
    contacto: contacto as ContactoResumen,
    mensajes: (mensajes ?? []) as MensajeCRM[],
    shortlists,
  }
}

type SbClient = ReturnType<typeof sb>
type ShortlistBase = { id: string; hash: string; cliente_nombre: string | null; created_at: string; view_count: number | null; status: string | null }

/**
 * Suma a cada shortlist: sus propiedades, cuáles marcó como FAVORITAS el cliente,
 * y las aperturas del link. Todo en 4 queries batch (no N+1).
 *
 * ⚠️ Los favoritos son a nivel SHORTLIST, no persona (decisión de mig 234) — si la
 * misma persona tiene 2 shortlists, sus favoritos no se unifican. Limitación declarada
 * en CRM_CLIENTES_B2C_PLAN.md §2.4.
 */
async function enriquecerShortlists(client: SbClient, base: ShortlistBase[]): Promise<ShortlistCRM[]> {
  if (base.length === 0) return []
  const ids = base.map(s => s.id)

  const [itemsRes, heartsRes, viewsRes] = await Promise.all([
    client.from('broker_shortlist_items')
      .select('shortlist_id, propiedad_id, tipo_operacion, is_destacada, precio_norm_snapshot, precio_mensual_bob_snapshot, orden')
      .in('shortlist_id', ids).order('orden', { ascending: true }),
    client.from('broker_shortlist_hearts').select('shortlist_id, propiedad_id').in('shortlist_id', ids),
    client.from('broker_shortlist_views').select('shortlist_id, created_at').in('shortlist_id', ids)
      .order('created_at', { ascending: true }),
  ])
  if (itemsRes.error) throw itemsRes.error
  if (heartsRes.error) throw heartsRes.error
  if (viewsRes.error) throw viewsRes.error

  const items = itemsRes.data ?? []
  const propIds = [...new Set(items.map(i => i.propiedad_id))]

  // Datos de la propiedad: shadow primero (es lo que el feed de Equipetrol muestra
  // desde el 21-jul), prod como fallback para lo que no esté en shadow (ZN/casas).
  const props = new Map<number, { nombre_edificio: string | null; zona: string | null; dormitorios: number | null; area_total_m2: number | null }>()
  if (propIds.length) {
    const cols = 'id, nombre_edificio, zona, dormitorios, area_total_m2'
    const [shadow, prod] = await Promise.all([
      client.from('propiedades_v2_shadow').select(cols).in('id', propIds),
      client.from('propiedades_v2').select(cols).in('id', propIds),
    ])
    for (const r of prod.data ?? []) props.set(r.id, r)      // prod primero…
    for (const r of shadow.data ?? []) props.set(r.id, r)    // …shadow pisa (gana)
  }

  const heartSet = new Set((heartsRes.data ?? []).map(h => `${h.shortlist_id}:${h.propiedad_id}`))

  return base.map(s => {
    const misItems = items.filter(i => i.shortlist_id === s.id)
    const misViews = (viewsRes.data ?? []).filter(v => v.shortlist_id === s.id)
    const propsDeSl: PropShortlist[] = misItems.map(i => {
      const p = props.get(i.propiedad_id)
      return {
        propiedad_id: i.propiedad_id,
        tipo_operacion: i.tipo_operacion,
        favorita: heartSet.has(`${s.id}:${i.propiedad_id}`),
        is_destacada: i.is_destacada,
        precio_norm_snapshot: i.precio_norm_snapshot,
        precio_mensual_bob_snapshot: i.precio_mensual_bob_snapshot,
        nombre_edificio: p?.nombre_edificio ?? null,
        zona: p?.zona ?? null,
        dormitorios: p?.dormitorios ?? null,
        area_total_m2: p?.area_total_m2 ?? null,
      }
    })
    return {
      ...s,
      aperturas: misViews.length,
      primera_apertura_at: misViews[0]?.created_at ?? null,
      ultima_apertura_at: misViews.length ? misViews[misViews.length - 1].created_at : null,
      props: propsDeSl,
      total_favoritas: propsDeSl.filter(p => p.favorita).length,
    }
  })
}

/** Edita lo único que es estado manual: `estado` y `notas`. */
export async function updateContacto(id: string, patch: { estado?: string; notas?: string }) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.estado !== undefined) updates.estado = patch.estado
  if (patch.notas !== undefined) updates.notas = patch.notas

  const { error } = await sb().from('simon_contactos').update(updates).eq('id', id)
  if (error) throw error
}

export const ESTADOS_CONTACTO = ['nuevo', 'activo', 'contacto', 'cerrado', 'descartado'] as const
