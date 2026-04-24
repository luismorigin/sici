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
import type { BrokerShortlist, CreateShortlistPayload } from '@/types/broker-shortlist'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
      return res.status(200).json(data || [])
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

      const hash = await generateUniqueHash()

      const { data: shortlist, error: errInsert } = await supabase
        .from('broker_shortlists')
        .insert({
          broker_slug: payload.broker_slug,
          hash,
          cliente_nombre: payload.cliente_nombre.trim(),
          cliente_telefono: payload.cliente_telefono.trim(),
          mensaje_whatsapp: payload.mensaje_whatsapp?.trim() || null,
        })
        .select('*')
        .single()

      if (errInsert || !shortlist) throw errInsert || new Error('insert failed')

      // Snapshot de precio. Depende del tipo_operacion de la shortlist:
      //
      // VENTA (migraciones 229 + 230):
      //  - precio_usd_snapshot  = RAW (propiedades_v2.precio_usd) → detecta cambio del agente
      //  - precio_norm_snapshot = NORMALIZADO (v_mercado_venta.precio_usd) → mostrar al cliente
      // El badge dispara solo si el RAW cambió (cambio del agente, no movimiento TC).
      //
      // ALQUILER (migración 233):
      //  - precio_mensual_bob_snapshot = BOB directo (propiedades_v2.precio_mensual_bob)
      // En alquiler el BOB es la fuente de verdad (regla 10 CLAUDE.md), no hay split
      // raw/norm porque el USD se deriva como bob/6.96.
      const tipoOperacion: 'venta' | 'alquiler' = payload.tipo_operacion === 'alquiler' ? 'alquiler' : 'venta'
      const rawByPropId = new Map<number, number | null>()
      const normByPropId = new Map<number, number | null>()
      const bobByPropId = new Map<number, number | null>()
      try {
        if (tipoOperacion === 'alquiler') {
          const bobRes = await supabase
            .from('propiedades_v2')
            .select('id, precio_mensual_bob')
            .in('id', payload.propiedad_ids)
          for (const r of (bobRes.data || []) as Array<{ id: number; precio_mensual_bob: string | number | null }>) {
            const v = r.precio_mensual_bob != null ? parseFloat(String(r.precio_mensual_bob)) : null
            bobByPropId.set(r.id, Number.isFinite(v as number) ? (v as number) : null)
          }
        } else {
          const [rawRes, normRes] = await Promise.all([
            supabase.from('propiedades_v2').select('id, precio_usd').in('id', payload.propiedad_ids),
            supabase.from('v_mercado_venta').select('id, precio_usd').in('id', payload.propiedad_ids),
          ])
          for (const r of (rawRes.data || []) as Array<{ id: number; precio_usd: string | number | null }>) {
            const v = r.precio_usd != null ? parseFloat(String(r.precio_usd)) : null
            rawByPropId.set(r.id, Number.isFinite(v as number) ? (v as number) : null)
          }
          for (const r of (normRes.data || []) as Array<{ id: number; precio_usd: string | number | null }>) {
            const v = r.precio_usd != null ? parseFloat(String(r.precio_usd)) : null
            normByPropId.set(r.id, Number.isFinite(v as number) ? (v as number) : null)
          }
        }
      } catch (snapErr) {
        console.warn('[create shortlist] snapshot precio fallback:', snapErr)
      }

      // Insertar items en el orden recibido.
      // Los snapshots del otro tipo_operacion quedan NULL (no aplican).
      const items = payload.propiedad_ids.map((pid, idx) => ({
        shortlist_id: shortlist.id,
        propiedad_id: pid,
        tipo_operacion: tipoOperacion,
        orden: idx,
        precio_usd_snapshot: tipoOperacion === 'venta' ? (rawByPropId.get(pid) ?? null) : null,
        precio_norm_snapshot: tipoOperacion === 'venta' ? (normByPropId.get(pid) ?? null) : null,
        precio_mensual_bob_snapshot: tipoOperacion === 'alquiler' ? (bobByPropId.get(pid) ?? null) : null,
      }))

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
