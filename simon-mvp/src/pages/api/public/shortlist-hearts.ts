// API público sin auth: el cliente del broker en /b/[hash] marca/desmarca
// corazones sobre propiedades de su shortlist. El broker después los ve
// agregados en su panel.
//
// Endpoints:
//   GET    /api/public/shortlist-hearts?hash=<hash>
//          → 200 { propertyIds: number[] }
//   POST   /api/public/shortlist-hearts   body { hash, propiedad_id }
//          → 201 { ok: true } (idempotente — re-POST no falla)
//   DELETE /api/public/shortlist-hearts   body { hash, propiedad_id }
//          → 200 { ok: true } (idempotente — DELETE sobre NULL no falla)
//
// Modelo de confianza:
//  - El hash es secreto compartido: quien tenga el link puede marcar.
//  - Validamos que la propiedad_id pertenezca a los items de la shortlist
//    antes de insertar — evita que un atacante manche data de shortlists
//    a las que no tiene acceso con IDs aleatorios.
//  - Shortlist debe estar is_published y no archived — si el broker pausó
//    el link, no se pueden agregar más hearts.
//  - Sin rate limiting por ahora (MVP founding, <50 brokers). Si crece,
//    agregar en-memory counter por IP o edge middleware.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ShortlistRef {
  id: string
  is_published: boolean
  archived_at: string | null
}

async function resolveShortlistByHash(hash: string): Promise<ShortlistRef | null> {
  const { data } = await supabase
    .from('broker_shortlists')
    .select('id, is_published, archived_at')
    .eq('hash', hash)
    .maybeSingle<ShortlistRef>()
  return data
}

async function propertyBelongsToShortlist(shortlistId: string, propiedadId: number): Promise<boolean> {
  const { data } = await supabase
    .from('broker_shortlist_items')
    .select('id')
    .eq('shortlist_id', shortlistId)
    .eq('propiedad_id', propiedadId)
    .maybeSingle()
  return data !== null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // ---------------------------- GET ----------------------------
    if (req.method === 'GET') {
      const hash = String(req.query.hash || '').trim()
      if (!hash) return res.status(400).json({ error: 'hash requerido' })

      const shortlist = await resolveShortlistByHash(hash)
      if (!shortlist || shortlist.archived_at) return res.status(404).json({ error: 'shortlist no encontrada' })
      // Lectura sí se permite aunque esté despublicada — es info del cliente,
      // si vuelve a habilitarse los hearts ya estaban.

      const { data, error } = await supabase
        .from('broker_shortlist_hearts')
        .select('propiedad_id')
        .eq('shortlist_id', shortlist.id)
      if (error) throw error

      const propertyIds = (data || []).map((r: { propiedad_id: number }) => r.propiedad_id)
      res.setHeader('Cache-Control', 'private, no-store')
      return res.status(200).json({ propertyIds })
    }

    // --------------------- POST / DELETE -------------------------
    if (req.method === 'POST' || req.method === 'DELETE') {
      const body = (req.body || {}) as { hash?: string; propiedad_id?: number }
      const hash = typeof body.hash === 'string' ? body.hash.trim() : ''
      const propiedadId = typeof body.propiedad_id === 'number' && Number.isFinite(body.propiedad_id)
        ? body.propiedad_id
        : null
      if (!hash || propiedadId === null) {
        return res.status(400).json({ error: 'hash y propiedad_id requeridos' })
      }

      const shortlist = await resolveShortlistByHash(hash)
      if (!shortlist || shortlist.archived_at) {
        return res.status(404).json({ error: 'shortlist no encontrada' })
      }
      if (!shortlist.is_published) {
        return res.status(410).json({ error: 'shortlist pausada' })
      }

      // Validar que la propiedad pertenece a la shortlist (anti-manipulación).
      const belongs = await propertyBelongsToShortlist(shortlist.id, propiedadId)
      if (!belongs) {
        return res.status(400).json({ error: 'propiedad no pertenece a la shortlist' })
      }

      if (req.method === 'POST') {
        const { error } = await supabase
          .from('broker_shortlist_hearts')
          .upsert(
            { shortlist_id: shortlist.id, propiedad_id: propiedadId },
            { onConflict: 'shortlist_id,propiedad_id', ignoreDuplicates: true }
          )
        if (error) throw error
        return res.status(201).json({ ok: true })
      }

      // DELETE
      const { error } = await supabase
        .from('broker_shortlist_hearts')
        .delete()
        .eq('shortlist_id', shortlist.id)
        .eq('propiedad_id', propiedadId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/public/shortlist-hearts]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
