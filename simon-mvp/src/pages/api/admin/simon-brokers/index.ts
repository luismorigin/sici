// API admin: GET listar simon_brokers | POST crear
//
// GET  /api/admin/simon-brokers       → [{ id, slug, nombre, ... }, ...]
// POST /api/admin/simon-brokers       body: { slug, nombre, telefono, foto_url?, inmobiliaria?, notas? }
//
// Protegido por requireAdmin (super_admin).

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import {
  listAllBrokersAdmin,
  createBroker,
  isValidSlugFormat,
  isValidPhoneFormat,
  type BrokerAdmin,
} from '@/lib/simon-brokers'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  try {
    if (req.method === 'GET') {
      const data = await listAllBrokersAdmin()
      return res.status(200).json(data satisfies BrokerAdmin[])
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const slug = String(body.slug || '').trim().toLowerCase()
      const nombre = String(body.nombre || '').trim()
      const telefono = String(body.telefono || '').trim()

      if (!slug || !nombre || !telefono) {
        return res.status(400).json({ error: 'slug, nombre y telefono requeridos' })
      }
      if (!isValidSlugFormat(slug)) {
        return res.status(400).json({
          error: 'slug inválido — solo a-z, 0-9, guiones. Largo 2-40, no puede empezar/terminar con guión.',
        })
      }
      if (!isValidPhoneFormat(telefono)) {
        return res.status(400).json({
          error: 'teléfono inválido — debe empezar con + y código de país, ej. +59178519485 (8-15 dígitos total).',
        })
      }

      try {
        const created = await createBroker({
          slug,
          nombre,
          telefono,
          foto_url: body.foto_url ?? null,
          inmobiliaria: body.inmobiliaria ?? null,
          notas: body.notas ?? null,
          fecha_proximo_cobro: body.fecha_proximo_cobro ?? null,
        })
        return res.status(201).json(created)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al crear'
        // Duplicate slug → 409
        if (msg.includes('duplicate') || msg.includes('unique')) {
          return res.status(409).json({ error: 'slug ya existe' })
        }
        return res.status(500).json({ error: msg })
      }
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin/simon-brokers]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
