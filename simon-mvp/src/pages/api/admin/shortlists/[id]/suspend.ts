// API admin: suspender / reactivar shortlist individual.
//
// POST /api/admin/shortlists/<id>/suspend  body: { action: 'suspend' | 'unsuspend' }
//
//  - 'suspend'   → status = 'suspended' (pisa cualquier estado actual)
//  - 'unsuspend' → status = 'active' (el SSR de /b/[hash] re-evalúa expiración
//                  al primer hit, así que si pasó expires_at va a volver a
//                  expired automáticamente)
//
// Protegido por requireAdmin (super_admin).

import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '@/lib/admin-api-auth'
import { suspendShortlist, unsuspendShortlist } from '@/lib/broker-shortlists-server'

const ALLOWED_ACTIONS = ['suspend', 'unsuspend'] as const
type Action = typeof ALLOWED_ACTIONS[number]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const id = String(req.query.id || '').trim()
    if (!id) return res.status(400).json({ error: 'id requerido' })

    const action = String(req.body?.action || '').trim() as Action
    if (!ALLOWED_ACTIONS.includes(action)) {
      return res.status(400).json({ error: `action debe ser uno de ${ALLOWED_ACTIONS.join(', ')}` })
    }

    if (action === 'suspend') {
      await suspendShortlist(id)
    } else {
      await unsuspendShortlist(id)
    }
    return res.status(200).json({ ok: true, action })
  } catch (err) {
    console.error('[api/admin/shortlists/[id]/suspend]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
