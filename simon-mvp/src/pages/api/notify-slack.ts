import type { NextApiRequest, NextApiResponse } from 'next'

interface SlackNotification {
  event: 'lead_created' | 'form_completed' | 'property_interest'
  leadId: number
  data: {
    nombre?: string
    whatsapp?: string
    proyecto?: string
    propiedad_id?: number
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL

  if (!webhookUrl) {
    console.warn('[Slack] SLACK_WEBHOOK_URL no configurado')
    return res.status(200).json({ ok: true, skipped: true })
  }

  try {
    const { event, leadId, data } = req.body as SlackNotification

    // Formatear mensaje según el evento
    let message = ''
    let emoji = ''

    switch (event) {
      case 'lead_created':
        emoji = ':new:'
        message = `*Nuevo lead en Simon*\n` +
                  `> Nombre: ${data.nombre}\n` +
                  `> WhatsApp: ${data.whatsapp}\n` +
                  `> Lead ID: #${leadId}`
        break

      case 'form_completed':
        emoji = ':clipboard:'
        message = `*Formulario completado*\n` +
                  `> Lead: ${data.nombre} (#${leadId})\n` +
                  `> WhatsApp: ${data.whatsapp}`
        break

      case 'property_interest':
        emoji = ':house:'
        message = `*Lead interesado en propiedad*\n` +
                  `> Lead: ${data.nombre} (#${leadId})\n` +
                  `> WhatsApp: ${data.whatsapp}\n` +
                  `> Proyecto: ${data.proyecto || 'N/A'}\n` +
                  `> Propiedad ID: ${data.propiedad_id}`
        break

      default:
        return res.status(400).json({ error: 'Evento no reconocido' })
    }

    // Enviar a Slack
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} ${message}`,
        unfurl_links: false
      })
    })

    if (!response.ok) {
      throw new Error(`Slack responded with ${response.status}`)
    }

    return res.status(200).json({ ok: true })

  } catch (error: any) {
    console.error('[Slack] Error enviando notificacion:', error)
    // No fallar la request principal, Slack es secundario
    return res.status(200).json({ ok: true, error: error.message })
  }
}
