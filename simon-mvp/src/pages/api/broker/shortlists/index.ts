// API: GET listar shortlists del broker | POST crear nueva
//
// GET  /api/broker/shortlists?slug=demo
// POST /api/broker/shortlists  body: CreateShortlistPayload
//
// Usa SUPABASE_SERVICE_ROLE_KEY (RLS bypass — las tablas no permiten anon).

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { isValidBrokerSlug } from '@/lib/simon-brokers'
import { normalizePhone } from '@/lib/phone'
import type { BrokerShortlist, CreateShortlistPayload } from '@/types/broker-shortlist'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Gates del canal del bot (simon-asistente): las shortlists del bot las recibe
// el cliente final B2C, que reabre/comparte su link → el cap de 20 vistas / 30
// días (DEFAULT de columna, para el Plan Inicial B2B) le rompe la UX. Decisión
// founder (plan §8): expiración larga (NO exención total) + sin cap de vistas.
// Los brokers de pago mantienen el DEFAULT (no se tocan acá).
const SIMON_ASISTENTE_SLUG = 'simon-asistente'
const BOT_MAX_VIEWS = 999999            // sin cap efectivo (mismo patrón que el demo, mig 236)
const BOT_EXPIRES_DAYS = 365            // ~12 meses

function generateHash(): string {
  // 8 bytes -> 11 chars base64url, recortamos a 10
  return randomBytes(8).toString('base64url').slice(0, 10)
}

async function generateUniqueHash(maxAttempts = 5): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const hash = generateHash()
    const { data } = await supabase
      .from('broker_shortlists')
      .select('id')
      .eq('hash', hash)
      .maybeSingle()
    if (!data) return hash
  }
  throw new Error('No se pudo generar hash único después de varios intentos')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const slug = String(req.query.slug || '')
      if (!(await isValidBrokerSlug(slug))) {
        return res.status(400).json({ error: 'broker_slug inválido' })
      }
      const { data, error } = await supabase
        .from('broker_shortlists')
        .select('*')
        .eq('broker_slug', slug)
        .is('archived_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      const shortlists = data || []

      // Enriquecer cada shortlist con su tipo_operacion (derivado del primer item).
      // Asumimos homogéneo (el UI no permite armar mixto). Sirve para el chip
      // [venta]/[alquiler] en el panel "Mis shortlists".
      if (shortlists.length > 0) {
        const ids = shortlists.map((s: BrokerShortlist) => s.id)
        const { data: itemRows } = await supabase
          .from('broker_shortlist_items')
          .select('shortlist_id, tipo_operacion, orden')
          .in('shortlist_id', ids)
          .order('orden', { ascending: true })
        const firstTypeById = new Map<string, 'venta' | 'alquiler'>()
        for (const r of (itemRows || []) as Array<{ shortlist_id: string; tipo_operacion: string }>) {
          if (firstTypeById.has(r.shortlist_id)) continue
          firstTypeById.set(r.shortlist_id, r.tipo_operacion === 'alquiler' ? 'alquiler' : 'venta')
        }
        for (const s of shortlists as Array<BrokerShortlist & { tipo_operacion?: 'venta' | 'alquiler' }>) {
          s.tipo_operacion = firstTypeById.get(s.id) ?? 'venta'
        }
      }

      return res.status(200).json(shortlists)
    }

    if (req.method === 'POST') {
      const payload = req.body as CreateShortlistPayload

      if (!payload?.broker_slug || !(await isValidBrokerSlug(payload.broker_slug))) {
        return res.status(400).json({ error: 'broker_slug inválido' })
      }
      if (!payload.cliente_nombre?.trim()) {
        return res.status(400).json({ error: 'cliente_nombre requerido' })
      }
      if (!payload.cliente_telefono?.trim()) {
        return res.status(400).json({ error: 'cliente_telefono requerido' })
      }
      if (!Array.isArray(payload.propiedad_ids) || payload.propiedad_ids.length === 0) {
        return res.status(400).json({ error: 'al menos una propiedad' })
      }

      // Validación máx 1 destacada (defensa server-side; el frontend ya enforce
      // auto-desmarcando al elegir otra). Migración 239.
      const itemsMetadata = Array.isArray(payload.items_metadata) ? payload.items_metadata : []
      const destacadasCount = itemsMetadata.filter(m => m.is_destacada === true).length
      if (destacadasCount > 1) {
        return res.status(400).json({
          error: 'Solo se permite 1 propiedad destacada por shortlist'
        })
      }
      // Index por propiedad_id para lookup en el insert de items
      const metadataByPropId = new Map<number, { comentario_broker: string | null; is_destacada: boolean }>()
      for (const m of itemsMetadata) {
        metadataByPropId.set(m.propiedad_id, {
          comentario_broker: m.comentario_broker?.trim() || null,
          is_destacada: m.is_destacada === true,
        })
      }

      const hash = await generateUniqueHash()

      // Gates: el bot (simon-asistente) lleva expiración larga + sin cap; los
      // demás brokers omiten estos campos y caen al DEFAULT de columna (20/30d).
      const insertData: Record<string, unknown> = {
        broker_slug: payload.broker_slug,
        hash,
        cliente_nombre: payload.cliente_nombre.trim(),
        // Normaliza a +591[67]NNNNNNN (lib/phone.ts) para que el mismo número no
        // viva en 3 formatos → identidad estable del contacto B2C (CRM, mig 296).
        // Fallback al crudo si no es un celular boliviano válido (no rompe el bot).
        cliente_telefono: normalizePhone(payload.cliente_telefono) ?? payload.cliente_telefono.trim(),
        mensaje_whatsapp: payload.mensaje_whatsapp?.trim() || null,
      }
      if (payload.broker_slug === SIMON_ASISTENTE_SLUG) {
        insertData.max_views = BOT_MAX_VIEWS
        insertData.expires_at = new Date(Date.now() + BOT_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString()
      }

      const { data: shortlist, error: errInsert } = await supabase
        .from('broker_shortlists')
        .insert(insertData)
        .select('*')
        .single()

      if (errInsert || !shortlist) throw errInsert || new Error('insert failed')

      // Snapshot de precio. Depende del tipo_operacion de la shortlist:
      //
      // VENTA (migraciones 229 + 230):
      //  - precio_usd_snapshot  = RAW (precio_usd de la vista) → detecta cambio del agente
      //  - precio_norm_snapshot = NORMALIZADO (precio_norm de la vista) → comparable
      // OJO: en las vistas de mercado `precio_usd` es el RAW y `precio_norm` el normalizado.
      // El RPC `buscar_unidades_reales` retorna `precio_normalizado() AS precio_usd` — distinto contrato.
      // El badge dispara solo si el RAW cambió (cambio del agente, no movimiento TC).
      //
      // ALQUILER (migración 233):
      //  - precio_mensual_bob_snapshot = BOB directo
      // En alquiler el BOB es la fuente de verdad (regla 10 CLAUDE.md), no hay split
      // raw/norm porque el USD se deriva del BOB por TC.
      const tipoOperacion: 'venta' | 'alquiler' = payload.tipo_operacion === 'alquiler' ? 'alquiler' : 'venta'
      const rawByPropId = new Map<number, number | null>()
      const normByPropId = new Map<number, number | null>()
      const bobByPropId = new Map<number, number | null>()
      // Lanzamiento TC nuevo (21-jul): el snapshot se toma de la vista SHADOW —
      // la MISMA base que muestra /b/[hash] (shadow-first). Si se tomara de prod,
      // el chip de cambio de precio ve la brecha de régimen y la atribuye mal
      // ("TC paralelo bajó ~$us X" falso). Además las props solo-shadow (ids
      // 8000xxx) no existen en prod → snapshot null. Fallback prod cutover-safe:
      // si la vista _shadow deja de existir, cae a la fuente vieja.
      try {
        if (tipoOperacion === 'alquiler') {
          let bobRes = await supabase
            .from('v_mercado_alquiler_shadow')
            .select('id, precio_mensual_bob')
            .in('id', payload.propiedad_ids)
          if (bobRes.error) {
            bobRes = await supabase
              .from('propiedades_v2')
              .select('id, precio_mensual_bob')
              .in('id', payload.propiedad_ids)
          }
          for (const r of (bobRes.data || []) as Array<{ id: number; precio_mensual_bob: string | number | null }>) {
            const v = r.precio_mensual_bob != null ? parseFloat(String(r.precio_mensual_bob)) : null
            bobByPropId.set(r.id, Number.isFinite(v as number) ? (v as number) : null)
          }
        } else {
          // La vista shadow expone RAW (precio_usd) y NORMALIZADO (precio_norm)
          // juntos — un solo query reemplaza el par propiedades_v2 + v_mercado_venta.
          let vRes = await supabase
            .from('v_mercado_venta_shadow')
            .select('id, precio_usd, precio_norm')
            .in('id', payload.propiedad_ids)
          if (vRes.error) {
            vRes = await supabase
              .from('v_mercado_venta')
              .select('id, precio_usd, precio_norm')
              .in('id', payload.propiedad_ids)
          }
          for (const r of (vRes.data || []) as Array<{ id: number; precio_usd: string | number | null; precio_norm: string | number | null }>) {
            const raw = r.precio_usd != null ? parseFloat(String(r.precio_usd)) : null
            const norm = r.precio_norm != null ? parseFloat(String(r.precio_norm)) : null
            rawByPropId.set(r.id, Number.isFinite(raw as number) ? (raw as number) : null)
            normByPropId.set(r.id, Number.isFinite(norm as number) ? (norm as number) : null)
          }
        }
      } catch (snapErr) {
        console.warn('[create shortlist] snapshot precio fallback:', snapErr)
      }

      // Insertar items en el orden recibido.
      // Los snapshots del otro tipo_operacion quedan NULL (no aplican).
      // comentario_broker e is_destacada vienen de items_metadata si existe (opción B,
      // modal con paso "Personalizar"); si no, defaults (sin comentario, sin destacar).
      const items = payload.propiedad_ids.map((pid, idx) => {
        const meta = metadataByPropId.get(pid)
        return {
          shortlist_id: shortlist.id,
          propiedad_id: pid,
          tipo_operacion: tipoOperacion,
          orden: idx,
          comentario_broker: meta?.comentario_broker ?? null,
          is_destacada: meta?.is_destacada ?? false,
          precio_usd_snapshot: tipoOperacion === 'venta' ? (rawByPropId.get(pid) ?? null) : null,
          precio_norm_snapshot: tipoOperacion === 'venta' ? (normByPropId.get(pid) ?? null) : null,
          precio_mensual_bob_snapshot: tipoOperacion === 'alquiler' ? (bobByPropId.get(pid) ?? null) : null,
        }
      })

      const { error: errItems } = await supabase
        .from('broker_shortlist_items')
        .insert(items)

      if (errItems) {
        // rollback manual
        await supabase.from('broker_shortlists').delete().eq('id', shortlist.id)
        throw errItems
      }

      return res.status(201).json(shortlist as BrokerShortlist)
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/broker/shortlists]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
