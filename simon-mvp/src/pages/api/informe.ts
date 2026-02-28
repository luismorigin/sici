/**
 * API Route: Informe Fiduciario Premium v2
 *
 * Recibe datos completos por POST desde resultados.tsx
 * Genera HTML con el template v3 completo (9 secciones + mapa)
 *
 * POST /api/informe
 * Body: { propiedades, datosUsuario, analisis, leadData? }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import type { InformeRequest } from '@/lib/informe/types'
import { generateInformeHTML } from '@/lib/informe/template'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    // Host para URLs absolutas (necesario porque el informe abre en blob: URL)
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000'
    const baseHost = `${protocol}://${host}`

    const { propiedades, datosUsuario, analisis, leadData } = req.body as InformeRequest

    if (!propiedades || propiedades.length === 0) {
      return res.status(400).json({ error: 'No hay propiedades para generar el informe' })
    }

    const html = generateInformeHTML({ propiedades, datosUsuario, analisis, leadData, baseHost })

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(html)

  } catch (err) {
    console.error('Error generando informe:', err)
    res.status(500).json({ error: 'Error interno', details: String(err) })
  }
}
