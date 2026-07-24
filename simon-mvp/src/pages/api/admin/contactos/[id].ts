// API admin: GET detalle (conversación + shortlists) | PATCH estado/notas.
//
// GET   /api/admin/contactos/<uuid> → { contacto, mensajes, shortlists }
// PATCH /api/admin/contactos/<uuid>   body: { estado?, notas? }
//
// Protegido por requireAdmin. PII → nunca cachear.

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import { getContactoDetalle, updateContacto, ESTADOS_CONTACTO } from '@/lib/simon-contactos'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  const id = String(req.query.id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'id inválido' })
  }

  try {
    if (req.method === 'GET') {
      const detalle = await getContactoDetalle(id)
      res.setHeader('Cache-Control', 'private, no-store')
      return res.status(200).json(detalle)
    }

    if (req.method === 'PATCH') {
      const body = req.body as { estado?: string; notas?: string }
      if (body.estado !== undefined && !ESTADOS_CONTACTO.includes(body.estado as typeof ESTADOS_CONTACTO[number])) {
        return res.status(400).json({ error: 'estado inválido' })
      }
      await updateContacto(id, {
        estado: body.estado,
        notas: body.notas?.slice(0, 2000),
      })
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin/contactos/[id]]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
