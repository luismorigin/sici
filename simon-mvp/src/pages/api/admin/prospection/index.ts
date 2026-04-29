// API admin: GET lista brokers de prospección con filtros opcionales.
//
// GET /api/admin/prospection?tier=1&status=pending&agencia=remax&search=juan
//   → { brokers: [...], stats: { total, pending, msg1_sent, ... } }
//
// Protegido por requireAdmin.

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import {
  listProspectionBrokers,
  getProspectionStats,
  type ProspectionStatus,
} from '@/lib/broker-prospection'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const tierRaw = req.query.tier
    const tier = tierRaw === '1' || tierRaw === '2' || tierRaw === '3' ? Number(tierRaw) as 1 | 2 | 3 : null

    const statusRaw = String(req.query.status || '')
    const status: ProspectionStatus | null =
      statusRaw === 'pending' || statusRaw === 'msg1_sent' ||
      statusRaw === 'msg2_sent' || statusRaw === 'msg3_sent' ? statusRaw : null

    const agencia = String(req.query.agencia || '').trim() || null
    const search = String(req.query.search || '').trim() || null

    const [brokers, stats] = await Promise.all([
      listProspectionBrokers({ tier, status, agencia, search }),
      getProspectionStats(),
    ])

    res.setHeader('Cache-Control', 'private, no-store')
    return res.status(200).json({ brokers, stats })
  } catch (err) {
    console.error('[api/admin/prospection]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
