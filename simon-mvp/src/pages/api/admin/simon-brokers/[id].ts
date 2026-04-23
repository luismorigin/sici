// API admin: PATCH editar simon_broker por id
//
// PATCH /api/admin/simon-brokers/<id>   body: { nombre?, telefono?, foto_url?, inmobiliaria?, status?, notas?, fecha_proximo_cobro? }
//
// Protegido por requireAdmin (super_admin).

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import { updateBroker, deleteBroker, isValidPhoneFormat, type UpdateBrokerInput } from '@/lib/simon-brokers'

const ALLOWED_STATUS = ['activo', 'pausado', 'inactivo'] as const
type Status = typeof ALLOWED_STATUS[number]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  try {
    const id = String(req.query.id || '')
    if (!id) return res.status(400).json({ error: 'id requerido' })

    if (req.method === 'PATCH') {
      const body = req.body || {}
      const payload: UpdateBrokerInput = {}

      if (body.nombre !== undefined) payload.nombre = String(body.nombre)
      if (body.telefono !== undefined) {
        const tel = String(body.telefono)
        if (!isValidPhoneFormat(tel)) {
          return res.status(400).json({
            error: 'teléfono inválido — debe empezar con + y código de país, ej. +59178519485 (8-15 dígitos total).',
          })
        }
        payload.telefono = tel
      }
      if (body.foto_url !== undefined) payload.foto_url = body.foto_url ? String(body.foto_url) : null
      if (body.inmobiliaria !== undefined) payload.inmobiliaria = body.inmobiliaria ? String(body.inmobiliaria) : null
      if (body.notas !== undefined) payload.notas = body.notas ? String(body.notas) : null
      if (body.fecha_proximo_cobro !== undefined) {
        payload.fecha_proximo_cobro = body.fecha_proximo_cobro ? String(body.fecha_proximo_cobro) : null
      }
      if (body.status !== undefined) {
        const s = String(body.status)
        if (!ALLOWED_STATUS.includes(s as Status)) {
          return res.status(400).json({ error: `status debe ser uno de ${ALLOWED_STATUS.join(', ')}` })
        }
        payload.status = s as Status
      }

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'nada para actualizar' })
      }

      const updated = await updateBroker(id, payload)
      return res.status(200).json(updated)
    }

    if (req.method === 'DELETE') {
      await deleteBroker(id)
      return res.status(204).end()
    }

    res.setHeader('Allow', 'PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin/simon-brokers/[id]]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
