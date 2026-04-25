// API admin: GET listar shortlists con metadata de protección.
//
// GET /api/admin/shortlists?broker_slug=abc
//   → BrokerShortlistProtected[] (incluye archivadas y todos los status,
//     ordenadas por created_at DESC).
//
// Protegido por requireAdmin (super_admin).

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import { listShortlistsForBrokerAdmin } from '@/lib/broker-shortlists-server'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const brokerSlug = String(req.query.broker_slug || '').trim()
    if (!brokerSlug) {
      return res.status(400).json({ error: 'broker_slug requerido' })
    }
    const data = await listShortlistsForBrokerAdmin(brokerSlug)
    return res.status(200).json(data)
  } catch (err) {
    console.error('[api/admin/shortlists]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
