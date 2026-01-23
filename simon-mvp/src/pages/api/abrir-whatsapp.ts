// API: Abrir WhatsApp con redirect (funciona desde blob URLs)
// GET /api/abrir-whatsapp?params...
// Logea a Slack y redirige a WhatsApp

import type { NextApiRequest, NextApiResponse } from 'next'

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Solo GET (es un link)
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed')
  }

  try {
    // Extraer parámetros del query string
    const {
      leadId,
      nombre,
      whatsapp,
      propId,
      posicion,
      proyecto,
      precio,
      dormitorios,
      broker,
      brokerWsp,
      inmobiliaria,
      codigoRef,
      preguntas: preguntasJson
    } = req.query

    // Validar broker WhatsApp
    if (!brokerWsp || typeof brokerWsp !== 'string') {
      return res.status(400).send('Falta número de broker')
    }

    // Limpiar número de WhatsApp (solo dígitos)
    const numeroLimpio = brokerWsp.replace(/\D/g, '')

    // Agregar código de país si no lo tiene (Bolivia = 591)
    const numeroFinal = numeroLimpio.startsWith('591')
      ? numeroLimpio
      : `591${numeroLimpio}`

    // Parsear preguntas personalizadas
    let preguntas: string[] = []
    try {
      if (preguntasJson && typeof preguntasJson === 'string') {
        preguntas = JSON.parse(preguntasJson)
      }
    } catch { /* ignorar errores de parsing */ }

    // Construir mensaje para el broker
    const nombreUsuario = nombre || 'Usuario'
    const proyectoNombre = proyecto || 'la propiedad'
    const precioStr = precio ? `$${Number(precio).toLocaleString('en-US')}` : ''
    const dormsStr = dormitorios ? `${dormitorios} dorms` : ''
    const ref = codigoRef || `SIM-${Date.now().toString(36).toUpperCase()}`
    const brokerNombre = typeof broker === 'string' ? broker.split(' ')[0] : 'Asesor' // Solo primer nombre

    // Construir preguntas como lista
    const preguntasTexto = preguntas.length > 0
      ? `\n\nMis consultas:\n${preguntas.map(p => `• ${p}`).join('\n')}`
      : ''

    // Mensaje final con nuevo formato
    const mensaje = `Hola ${brokerNombre}! Soy ${nombreUsuario}, vi tu propiedad en Simon (plataforma de inteligencia inmobiliaria).

Me interesa el depto de ${dormsStr} en ${proyectoNombre} (${precioStr}).${preguntasTexto}

¿Me podrias confirmar estos puntos? ¡Gracias, quedo atento a tu respuesta!

Ref: ${ref}`

    // URL de WhatsApp
    const whatsappUrl = `https://wa.me/${numeroFinal}?text=${encodeURIComponent(mensaje)}`

    // Notificar a Slack (async, no bloquea el redirect)
    if (SLACK_WEBHOOK) {
      // Fire and forget - no esperamos respuesta
      fetch(SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `📱 *CONTACTO BROKER desde Informe*`,
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: '📱 Contacto Broker desde Informe', emoji: true }
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Usuario:*\n${nombreUsuario}` },
                { type: 'mrkdwn', text: `*WhatsApp:*\n${whatsapp || 'N/A'}` },
                { type: 'mrkdwn', text: `*Proyecto:*\n${proyectoNombre}` },
                { type: 'mrkdwn', text: `*Precio:*\n${precioStr || 'N/A'}` },
                { type: 'mrkdwn', text: `*Posición Top:*\n#${posicion || '?'}` },
                { type: 'mrkdwn', text: `*Broker:*\n${broker || 'N/A'} (${inmobiliaria || 'N/A'})` },
                { type: 'mrkdwn', text: `*Lead ID:*\n${leadId || 'N/A'}` },
                { type: 'mrkdwn', text: `*Ref:*\n${ref}` }
              ]
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `Prop ID: ${propId || 'N/A'} | ${new Date().toLocaleString('es-BO')}` }
              ]
            }
          ]
        })
      }).catch(err => {
        console.error('Error notificando a Slack:', err)
      })
    }

    // Redirect 302 a WhatsApp
    res.redirect(302, whatsappUrl)

  } catch (error) {
    console.error('Error en abrir-whatsapp:', error)
    // En caso de error, mostrar mensaje simple
    res.status(500).send('Error al generar enlace. Intenta de nuevo.')
  }
}
