// API admin: actualiza status / notas de un broker de prospección.
//
// PATCH /api/admin/prospection/[telefono]
//   body: { status?: 'pending'|'msg1_sent'|'msg2_sent'|'msg3_sent', notas?: string|null, stamp_dates?: boolean }
//   → ProspectionBroker (row actualizado)
//
// Si stamp_dates=true y status es msg1/2/3_sent, setea fecha_msg* a NOW
// (solo si era NULL — preserva fechas históricas).

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import { updateProspection, type ProspectionStatus } from '@/lib/broker-prospection'

const VALID_STATUSES: ProspectionStatus[] = ['pending', 'msg1_sent', 'msg2_sent', 'msg3_sent']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const telefono = String(req.query.telefono || '').trim()
  if (!telefono) return res.status(400).json({ error: 'telefono requerido' })

  try {
    const body = req.body || {}
    const status = body.status as string | undefined
    if (status !== undefined && !VALID_STATUSES.includes(status as ProspectionStatus)) {
      return res.status(400).json({ error: `status inválido. Debe ser: ${VALID_STATUSES.join(', ')}` })
    }

    const notas = body.notas === undefined ? undefined : (body.notas === null ? null : String(body.notas))
    const stamp_dates = Boolean(body.stamp_dates)

    const updated = await updateProspection(telefono, {
      status: status as ProspectionStatus | undefined,
      notas,
      stamp_dates,
    })

    if (!updated) return res.status(404).json({ error: 'broker no encontrado' })

    return res.status(200).json(updated)
  } catch (err) {
    console.error('[api/admin/prospection/PATCH]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
