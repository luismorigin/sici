// API: GET por id (editor) | PATCH editar | DELETE archivar (soft)
//
// GET    /api/broker/shortlists/:id   -> BrokerShortlistWithItems
// PATCH  /api/broker/shortlists/:id   body: UpdateShortlistPayload
// DELETE /api/broker/shortlists/:id   -> archived_at = NOW()

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { BrokerShortlist, BrokerShortlistWithItems, UpdateShortlistPayload } from '@/types/broker-shortlist'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ error: 'id requerido' })

  try {
    if (req.method === 'GET') {
      const { data: shortlist, error: errSL } = await supabase
        .from('broker_shortlists')
        .select('*')
        .eq('id', id)
        .is('archived_at', null)
        .maybeSingle()

      if (errSL) throw errSL
      if (!shortlist) return res.status(404).json({ error: 'shortlist no encontrada' })

      const { data: items, error: errItems } = await supabase
        .from('broker_shortlist_items')
        .select('*')
        .eq('shortlist_id', id)
        .order('orden', { ascending: true })

      if (errItems) throw errItems

      // Enriquecer items con preview de la propiedad (foto + nombre + datos clave)
      // para que el editor muestre thumbnails identificables (no solo el ID).
      const safeItems = items || []
      const propIds = safeItems.map(it => it.propiedad_id)
      let previewByPropId: Record<number, { proyecto: string; zona: string | null; precio_usd: number | null; area_m2: number | null; dormitorios: number | null; foto: string | null }> = {}
      if (propIds.length > 0) {
        const { data: rows } = await supabase.rpc('buscar_unidades_simple', {
          p_filtros: { limite: 500, solo_con_fotos: false }
        })
        const indexed = new Map<number, Record<string, unknown>>()
        for (const r of (rows || []) as Record<string, unknown>[]) {
          if (typeof r.id === 'number') indexed.set(r.id, r)
        }
        previewByPropId = propIds.reduce((acc, pid) => {
          const r = indexed.get(pid)
          if (r) {
            const fotos = Array.isArray(r.fotos_urls) ? r.fotos_urls as string[] : []
            acc[pid] = {
              proyecto: (r.nombre_proyecto as string) || `Propiedad #${pid}`,
              zona: (r.zona as string) || null,
              precio_usd: r.precio_usd ? parseFloat(String(r.precio_usd)) : null,
              area_m2: r.area_m2 ? parseFloat(String(r.area_m2)) : null,
              dormitorios: typeof r.dormitorios === 'number' ? r.dormitorios : null,
              foto: fotos[0] || null,
            }
          }
          return acc
        }, {} as typeof previewByPropId)
      }

      const itemsEnriched = safeItems.map(it => ({
        ...it,
        preview: previewByPropId[it.propiedad_id] || null,
      }))

      const result: BrokerShortlistWithItems & { items: typeof itemsEnriched } = {
        ...(shortlist as BrokerShortlist),
        items: itemsEnriched,
      }
      return res.status(200).json(result)
    }

    if (req.method === 'PATCH') {
      const payload = req.body as UpdateShortlistPayload
      const updates: Record<string, unknown> = {}

      if (payload.cliente_nombre !== undefined) updates.cliente_nombre = payload.cliente_nombre.trim()
      if (payload.cliente_telefono !== undefined) updates.cliente_telefono = payload.cliente_telefono.trim()
      if (payload.mensaje_whatsapp !== undefined) updates.mensaje_whatsapp = payload.mensaje_whatsapp?.trim() || null
      if (payload.is_published !== undefined) updates.is_published = payload.is_published

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('broker_shortlists')
          .update(updates)
          .eq('id', id)
        if (error) throw error
      }

      // Reemplazo completo de items si vienen
      if (Array.isArray(payload.items)) {
        const { error: errDel } = await supabase
          .from('broker_shortlist_items')
          .delete()
          .eq('shortlist_id', id)
        if (errDel) throw errDel

        if (payload.items.length > 0) {
          const rows = payload.items.map((it, idx) => ({
            shortlist_id: id,
            propiedad_id: it.propiedad_id,
            tipo_operacion: it.tipo_operacion || 'venta',
            comentario_broker: it.comentario_broker?.trim() || null,
            orden: it.orden ?? idx,
          }))
          const { error: errIns } = await supabase
            .from('broker_shortlist_items')
            .insert(rows)
          if (errIns) throw errIns
        }
      }

      const { data, error } = await supabase
        .from('broker_shortlists')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('broker_shortlists')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/broker/shortlists/:id]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
