// API admin: GET lista de contactos del bot (CRM B2C) con sus contadores.
//
// GET /api/admin/contactos?search=76308
//   → { contactos: [...], stats: { total, con_shortlist, activos_7d, mensajes } }
//
// Protegido por requireAdmin. PII → nunca cachear.

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import { listContactos, getContactosStats } from '@/lib/simon-contactos'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const search = String(req.query.search || '').trim() || null
    const [contactos, stats] = await Promise.all([
      listContactos({ search }),
      getContactosStats(),
    ])

    res.setHeader('Cache-Control', 'private, no-store')
    return res.status(200).json({ contactos, stats })
  } catch (err) {
    console.error('[api/admin/contactos]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
