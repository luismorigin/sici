// API broker: POST crear reporte de datos | GET listar reportes propios.
//
// POST /api/broker/property-reports
//   body: CreatePropertyReportPayload
//   - 201 { report, duplicate: false }  → reporte nuevo creado, dispatch Slack
//   - 200 { report, duplicate: true }   → ya había uno pendiente del mismo
//                                          broker+prop (no se crea segundo)
//   - 400 { error, code }               → validación falló
//
// GET /api/broker/property-reports?slug=<broker>&propiedad_ids=<ids>&status=<csv>
//   - 200 { reports: PropertyReport[] }
//
// Auth: igual que /api/broker/shortlists — sin login broker, valida slug
// activo en simon_brokers. Patrón replicado.

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  createReport,
  dispatchSlackNotification,
  listReportsForBroker,
  resolveAppOrigin,
} from '@/lib/property-reports-server'
import { isValidBrokerSlug, getBrokerBySlug } from '@/lib/simon-brokers'
import { createClient } from '@supabase/supabase-js'
import type {
  CreatePropertyReportPayload,
  PropertyReportStatus,
} from '@/types/broker-property-report'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const slug = String(req.query.slug || '').trim()
      if (!(await isValidBrokerSlug(slug))) {
        return res.status(400).json({ error: 'broker_slug inválido' })
      }

      const propiedadIdsRaw = String(req.query.propiedad_ids || '').trim()
      const propiedadIds = propiedadIdsRaw
        ? propiedadIdsRaw
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n) && n > 0)
        : undefined

      const statusRaw = String(req.query.status || 'pending,in_review').trim()
      const statusIn = statusRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => ['pending', 'in_review', 'resolved', 'false_positive'].includes(s)) as PropertyReportStatus[]

      const reports = await listReportsForBroker(slug, {
        propiedadIds,
        statusIn: statusIn.length > 0 ? statusIn : undefined,
      })
      return res.status(200).json({ reports })
    }

    if (req.method === 'POST') {
      const payload = req.body as CreatePropertyReportPayload

      if (!payload?.broker_slug || !(await isValidBrokerSlug(payload.broker_slug))) {
        return res.status(400).json({ error: 'broker_slug inválido', code: 'broker_invalid' })
      }
      const propiedadId = Number(payload.propiedad_id)
      if (!Number.isFinite(propiedadId) || propiedadId <= 0) {
        return res.status(400).json({ error: 'propiedad_id inválido', code: 'propiedad_not_found' })
      }
      if (!payload.tipos_error || typeof payload.tipos_error !== 'object') {
        return res.status(400).json({ error: 'tipos_error requerido', code: 'no_tipos' })
      }

      const result = await createReport({
        brokerSlug: payload.broker_slug,
        propiedadId,
        tipos: payload.tipos_error,
        nota: payload.nota ?? null,
      })

      if (!result.ok) {
        const httpStatus = result.error.code === 'db_error' ? 500 : 400
        return res.status(httpStatus).json({ error: result.error.message, code: result.error.code })
      }

      const { report, duplicate } = result.result

      // Solo despachar Slack en reportes NUEVOS (no en duplicados).
      // Best-effort: no esperamos al fetch para responder al broker.
      if (!duplicate) {
        const broker = await getBrokerBySlug(payload.broker_slug)
        // Trae info de la prop para enriquecer el mensaje
        const supa = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        const { data: prop } = await supa
          .from('propiedades_v2')
          .select('id, nombre_edificio, titulo, zona, tipo_operacion')
          .eq('id', propiedadId)
          .maybeSingle()

        const propiedadNombre =
          (prop?.nombre_edificio as string | null)?.trim() ||
          (prop?.titulo as string | null)?.trim() ||
          'Sin nombre'

        // Fire-and-forget: no await el dispatch, igual loggea internamente
        dispatchSlackNotification({
          report,
          brokerNombre: broker?.nombre || payload.broker_slug,
          brokerSlug: payload.broker_slug,
          propiedadNombre,
          propiedadZona: (prop?.zona as string | null) ?? null,
          propiedadTipoOp: (prop?.tipo_operacion as 'venta' | 'alquiler' | null) ?? null,
          appOrigin: resolveAppOrigin(),
        }).catch((err) => console.error('[api/broker/property-reports] slack error:', err))
      }

      return res.status(duplicate ? 200 : 201).json({ report, duplicate })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/broker/property-reports]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
