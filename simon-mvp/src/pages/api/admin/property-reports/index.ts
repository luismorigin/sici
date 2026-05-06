// API admin: GET listado paginado de reportes con filtros y métricas.
//
// GET /api/admin/property-reports
//   query:
//     status?       'pending' (default) | 'in_review' | 'resolved' | 'false_positive' | 'all'
//     simon_broker_id?  UUID
//     propiedad_id?     INTEGER
//     tipo_error?       string (ej 'precio_incorrecto')
//     desde?            ISO date
//     hasta?            ISO date
//     page?             0-based (default 0)
//     pageSize?         1-200 (default 50)
//
// Protegido por requireAdmin (super_admin + supervisor).

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import { listReportsForAdmin } from '@/lib/property-reports-server'
import { ALL_TIPOS } from '@/types/broker-property-report'
import type { PropertyReportStatus, PropertyReportTipo } from '@/types/broker-property-report'

const VALID_STATUSES: Array<PropertyReportStatus | 'all'> = [
  'pending',
  'in_review',
  'resolved',
  'false_positive',
  'all',
]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin', 'supervisor'])
  if (!admin) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const statusRaw = String(req.query.status || 'pending').trim()
    const status = (VALID_STATUSES as string[]).includes(statusRaw)
      ? (statusRaw as PropertyReportStatus | 'all')
      : 'pending'

    const tipoRaw = String(req.query.tipo_error || '').trim()
    const tipoError =
      tipoRaw && (ALL_TIPOS as string[]).includes(tipoRaw)
        ? (tipoRaw as PropertyReportTipo)
        : undefined

    const simonBrokerId = String(req.query.simon_broker_id || '').trim() || undefined
    const propiedadIdRaw = String(req.query.propiedad_id || '').trim()
    const propiedadId = propiedadIdRaw ? parseInt(propiedadIdRaw, 10) : undefined

    const desde = String(req.query.desde || '').trim() || undefined
    const hasta = String(req.query.hasta || '').trim() || undefined

    const pageRaw = parseInt(String(req.query.page || '0'), 10)
    const pageSizeRaw = parseInt(String(req.query.pageSize || '50'), 10)
    const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? pageRaw : 0
    const pageSize =
      Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 && pageSizeRaw <= 200 ? pageSizeRaw : 50

    const result = await listReportsForAdmin({
      status,
      simonBrokerId,
      propiedadId: Number.isFinite(propiedadId as number) ? (propiedadId as number) : undefined,
      tipoError,
      desde,
      hasta,
      page,
      pageSize,
    })

    return res.status(200).json(result)
  } catch (err) {
    console.error('[api/admin/property-reports]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
