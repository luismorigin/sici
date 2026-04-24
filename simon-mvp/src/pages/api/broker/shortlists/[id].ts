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
      //
      // Shortlists pueden tener items de venta o alquiler. Consultamos la RPC
      // correspondiente según tipo_operacion para que el preview incluya el
      // precio correcto (precio_usd para venta, precio_mensual_bob para alquiler)
      // y las fotos.
      type PreviewRow = {
        proyecto: string
        zona: string | null
        precio_usd: number | null
        precio_mensual_bob: number | null
        area_m2: number | null
        dormitorios: number | null
        foto: string | null
      }
      const safeItems = items || []
      const ventaIds = safeItems.filter(it => it.tipo_operacion !== 'alquiler').map(it => it.propiedad_id)
      const alquilerIds = safeItems.filter(it => it.tipo_operacion === 'alquiler').map(it => it.propiedad_id)
      const previewByPropId: Record<number, PreviewRow> = {}

      if (ventaIds.length > 0) {
        const { data: rows } = await supabase.rpc('buscar_unidades_simple', {
          p_filtros: { limite: 500, solo_con_fotos: false }
        })
        for (const r of (rows || []) as Record<string, unknown>[]) {
          if (typeof r.id !== 'number' || !ventaIds.includes(r.id)) continue
          const fotos = Array.isArray(r.fotos_urls) ? r.fotos_urls as string[] : []
          previewByPropId[r.id] = {
            proyecto: (r.nombre_proyecto as string) || `Propiedad #${r.id}`,
            zona: (r.zona as string) || null,
            precio_usd: r.precio_usd ? parseFloat(String(r.precio_usd)) : null,
            precio_mensual_bob: null,
            area_m2: r.area_m2 ? parseFloat(String(r.area_m2)) : null,
            dormitorios: typeof r.dormitorios === 'number' ? r.dormitorios : null,
            foto: fotos[0] || null,
          }
        }
      }

      if (alquilerIds.length > 0) {
        const { data: rows } = await supabase.rpc('buscar_unidades_alquiler', {
          p_filtros: { limite: 500, solo_con_fotos: false }
        })
        for (const r of (rows || []) as Record<string, unknown>[]) {
          if (typeof r.id !== 'number' || !alquilerIds.includes(r.id)) continue
          const fotos = Array.isArray(r.fotos_urls) ? r.fotos_urls as string[] : []
          const name = (r.nombre_edificio as string) || (r.nombre_proyecto as string) || `Propiedad #${r.id}`
          previewByPropId[r.id] = {
            proyecto: name,
            zona: (r.zona as string) || null,
            precio_usd: null,
            precio_mensual_bob: r.precio_mensual_bob ? parseFloat(String(r.precio_mensual_bob)) : null,
            area_m2: r.area_m2 ? parseFloat(String(r.area_m2)) : null,
            dormitorios: typeof r.dormitorios === 'number' ? r.dormitorios : null,
            foto: fotos[0] || null,
          }
        }
      }

      const itemsEnriched = safeItems.map(it => ({
        ...it,
        preview: previewByPropId[it.propiedad_id] || null,
      }))

      // Hearts del cliente (migración 234). Permite al broker ver qué marcó.
      const { data: heartRows } = await supabase
        .from('broker_shortlist_hearts')
        .select('propiedad_id')
        .eq('shortlist_id', id)
      const heartedPropertyIds: number[] = (heartRows || []).map((r: { propiedad_id: number }) => r.propiedad_id)

      const result: BrokerShortlistWithItems & {
        items: typeof itemsEnriched
        heartedPropertyIds: number[]
      } = {
        ...(shortlist as BrokerShortlist),
        items: itemsEnriched,
        heartedPropertyIds,
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
