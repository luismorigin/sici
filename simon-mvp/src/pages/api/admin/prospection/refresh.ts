// API admin: refresca la tabla broker_prospection desde v_mercado_venta.
//
// POST /api/admin/prospection/refresh
//   → { inserted, updated, total }
//
// Llama a la RPC populate_broker_prospection() que hace UPSERT
// preservando status / fechas / notas. Solo actualiza los datos
// derivados del inventario (nombre / agencia / tier / conteos).

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import { refreshProspectionData } from '@/lib/broker-prospection'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const result = await refreshProspectionData()
    return res.status(200).json(result)
  } catch (err) {
    console.error('[api/admin/prospection/refresh]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
