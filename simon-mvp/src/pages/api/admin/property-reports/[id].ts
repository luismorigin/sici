// API admin: PATCH actualizar status de un reporte.
//
// PATCH /api/admin/property-reports/<id>
//   body: { status: 'pending'|'in_review'|'resolved'|'false_positive', resolution_notes?: string }
//
// Si status pasa a 'resolved' o 'false_positive':
//   - resolved_at = NOW()
//   - resolved_by = admin.email
// Si vuelve a 'pending'/'in_review':
//   - resolved_at = NULL, resolved_by = NULL (constraint chk_resolved_consistency)
//
// Protegido por requireAdmin (super_admin + supervisor).

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import { updateReportStatus } from '@/lib/property-reports-server'
import type { PropertyReportStatus } from '@/types/broker-property-report'

const VALID_STATUSES: PropertyReportStatus[] = [
  'pending',
  'in_review',
  'resolved',
  'false_positive',
]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin', 'supervisor'])
  if (!admin) return

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const id = String(req.query.id || '').trim()
    if (!id) {
      return res.status(400).json({ error: 'id requerido' })
    }

    const statusRaw = String(req.body?.status || '').trim()
    if (!(VALID_STATUSES as string[]).includes(statusRaw)) {
      return res.status(400).json({ error: `status debe ser uno de ${VALID_STATUSES.join(', ')}` })
    }
    const status = statusRaw as PropertyReportStatus
    const resolutionNotes =
      typeof req.body?.resolution_notes === 'string' ? req.body.resolution_notes : null

    const updated = await updateReportStatus({
      id,
      status,
      resolutionNotes,
      resolvedBy: admin.email,
    })

    if (!updated) {
      return res.status(404).json({ error: 'reporte no encontrado' })
    }
    return res.status(200).json({ report: updated })
  } catch (err) {
    console.error('[api/admin/property-reports/[id]]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
