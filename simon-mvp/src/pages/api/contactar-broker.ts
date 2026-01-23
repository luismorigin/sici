// API: Contactar Broker desde Informe Premium
// POST /api/contactar-broker
// Crea lead si no existe + genera código REF + mensaje WhatsApp + notifica Slack

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

interface ContactarBrokerRequest {
  // Lead ID existente (opcional - si viene de beta tester con feedback)
  leadId?: number
  // Datos del usuario (capturados en el modal, o ya guardados en el lead)
  usuarioNombre: string
  usuarioWhatsapp: string
  // Datos de la propiedad (puede ser #1, #2 o #3)
  propiedadId: number
  posicionTop3: number
  proyectoNombre: string
  precioUsd: number
  estadoConstruccion: string
  diasEnMercado: number | null
  // Datos del broker de ESA propiedad
  brokerNombre: string
  brokerWhatsapp: string
  brokerInmobiliaria?: string
  // Datos para preguntas dinámicas (perfil usuario)
  necesitaParqueo: boolean
  necesitaBaulera: boolean
  tieneMascotas: boolean
  innegociables: string[]
  // Datos específicos de ESA propiedad
  tieneParqueo: boolean
  tieneBaulera: boolean
  petFriendlyConfirmado: boolean
}

interface ContactarBrokerResponse {
  success: boolean
  codigoRef: string
  mensajeWhatsapp: string
  whatsappUrl: string
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ContactarBrokerResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      codigoRef: '',
      mensajeWhatsapp: '',
      whatsappUrl: '',
      error: 'Method not allowed'
    })
  }

  if (!supabase) {
    return res.status(500).json({
      success: false,
      codigoRef: '',
      mensajeWhatsapp: '',
      whatsappUrl: '',
      error: 'Database not configured'
    })
  }

  try {
    const data: ContactarBrokerRequest = req.body

    // Validar datos requeridos
    if (!data.usuarioNombre || !data.usuarioWhatsapp) {
      return res.status(400).json({
        success: false,
        codigoRef: '',
        mensajeWhatsapp: '',
        whatsappUrl: '',
        error: 'Missing required fields: usuarioNombre, usuarioWhatsapp'
      })
    }

    if (!data.propiedadId || !data.brokerWhatsapp) {
      return res.status(400).json({
        success: false,
        codigoRef: '',
        mensajeWhatsapp: '',
        whatsappUrl: '',
        error: 'Missing required fields: propiedadId, brokerWhatsapp'
      })
    }

    let leadId: number

    // Si viene leadId de un beta tester, usarlo; si no, crear nuevo lead
    if (data.leadId) {
      leadId = data.leadId
    } else {
      // 1. Crear lead en la base de datos (flujo legacy sin feedback)
      const { data: leadData, error: leadError } = await supabase
        .from('leads_mvp')
        .insert([{
          nombre: data.usuarioNombre,
          whatsapp: data.usuarioWhatsapp,
          formulario_raw: {
            fuente: 'informe_premium_contacto',
            timestamp: new Date().toISOString(),
            propiedad_interes: data.proyectoNombre,
            precio_propiedad: data.precioUsd,
            necesita_parqueo: data.necesitaParqueo,
            necesita_baulera: data.necesitaBaulera,
            tiene_mascotas: data.tieneMascotas,
            innegociables: data.innegociables
          },
          estado: 'interesado'
        }])
        .select('id')
        .single()

      if (leadError) {
        console.error('Error creando lead:', leadError)
        throw new Error('Error registrando datos del usuario')
      }

      leadId = leadData.id
    }

    // 2. Registrar contacto y obtener código REF
    const { data: resultado, error: dbError } = await supabase
      .rpc('registrar_contacto_broker', {
        p_lead_id: leadId,
        p_propiedad_id: data.propiedadId,
        p_broker_nombre: data.brokerNombre || 'Asesor',
        p_broker_whatsapp: data.brokerWhatsapp,
        p_broker_inmobiliaria: data.brokerInmobiliaria || null,
        p_posicion_top3: data.posicionTop3 || 1
      })

    if (dbError) {
      console.error('Error DB registrar_contacto_broker:', dbError)
      throw new Error(dbError.message)
    }

    if (!resultado || resultado.length === 0) {
      throw new Error('No se pudo registrar el contacto')
    }

    const { codigo_ref } = resultado[0]

    // 3. Construir mensaje NEUTRAL con preguntas dinámicas
    const mensaje = construirMensajeWhatsapp({
      compradorNombre: data.usuarioNombre,
      brokerNombre: data.brokerNombre || 'Asesor',
      proyectoNombre: data.proyectoNombre,
      estadoConstruccion: data.estadoConstruccion,
      necesitaParqueo: data.necesitaParqueo,
      necesitaBaulera: data.necesitaBaulera,
      tieneMascotas: data.tieneMascotas,
      innegociables: data.innegociables || [],
      tieneParqueo: data.tieneParqueo,
      tieneBaulera: data.tieneBaulera,
      petFriendlyConfirmado: data.petFriendlyConfirmado,
      codigoRef: codigo_ref
    })

    // 4. Construir URL de WhatsApp
    const whatsappUrl = `https://wa.me/${data.brokerWhatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`

    // 5. Enviar Slack a Luis
    await enviarSlackContactoBroker({
      codigoRef: codigo_ref,
      posicionTop3: data.posicionTop3 || 1,
      comprador: {
        nombre: data.usuarioNombre,
        whatsapp: data.usuarioWhatsapp,
        email: null
      },
      broker: {
        nombre: data.brokerNombre || 'Asesor',
        whatsapp: data.brokerWhatsapp,
        inmobiliaria: data.brokerInmobiliaria
      },
      propiedad: {
        nombre: data.proyectoNombre,
        precio: data.precioUsd,
        diasEnMercado: data.diasEnMercado,
        estadoConstruccion: data.estadoConstruccion
      },
      preguntasGeneradas: extraerPreguntas(mensaje)
    })

    // 6. Retornar resultado
    return res.status(200).json({
      success: true,
      codigoRef: codigo_ref,
      mensajeWhatsapp: mensaje,
      whatsappUrl
    })

  } catch (error) {
    console.error('Error en contactar-broker:', error)
    return res.status(500).json({
      success: false,
      codigoRef: '',
      mensajeWhatsapp: '',
      whatsappUrl: '',
      error: (error as Error).message
    })
  }
}

// ============================================================================
// Mensaje WhatsApp NEUTRAL (no asume visita)
// ============================================================================
interface MensajeParams {
  compradorNombre: string
  brokerNombre: string
  proyectoNombre: string
  estadoConstruccion: string
  necesitaParqueo: boolean
  necesitaBaulera: boolean
  tieneMascotas: boolean
  innegociables: string[]
  tieneParqueo: boolean
  tieneBaulera: boolean
  petFriendlyConfirmado: boolean
  codigoRef: string
}

function construirMensajeWhatsapp(params: MensajeParams): string {
  const preguntas: string[] = []

  // Preguntas condicionales (misma lógica que Sección 6 del informe)
  if (params.necesitaParqueo && !params.tieneParqueo) {
    preguntas.push('¿El parqueo está incluido en el precio?')
  }
  if (params.necesitaBaulera && !params.tieneBaulera) {
    preguntas.push('¿La baulera está incluida?')
  }
  if (params.estadoConstruccion === 'preventa') {
    preguntas.push('¿Cuál es la fecha de entrega?')
    preguntas.push('¿Cuál es el plan de pagos?')
  }
  if (params.tieneMascotas && !params.petFriendlyConfirmado) {
    preguntas.push('¿El edificio acepta mascotas?')
  }

  // Siempre incluir
  preguntas.push('¿Cuánto son las expensas mensuales?')
  preguntas.push('¿Hay flexibilidad en el precio?')

  const preguntasTexto = preguntas.map(p => `• ${p}`).join('\n')

  // MENSAJE NEUTRAL - no asume "visita"
  return `Hola ${params.brokerNombre}, soy ${params.compradorNombre}.

Vi ${params.proyectoNombre} en Simón y tengo algunas consultas antes de avanzar:

${preguntasTexto}

¿Me podrías ayudar con esta info?

Ref: #${params.codigoRef}`
}

function extraerPreguntas(mensaje: string): string[] {
  return mensaje.split('\n')
    .filter(l => l.trim().startsWith('•'))
    .map(l => l.replace('•', '').trim())
}

// ============================================================================
// Slack a Luis
// ============================================================================
interface SlackParams {
  codigoRef: string
  posicionTop3: number
  comprador: { nombre: string; whatsapp: string; email: string | null }
  broker: { nombre: string; whatsapp: string; inmobiliaria?: string }
  propiedad: { nombre: string; precio: number; diasEnMercado: number | null; estadoConstruccion: string }
  preguntasGeneradas: string[]
}

async function enviarSlackContactoBroker(params: SlackParams): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    console.warn('SLACK_WEBHOOK_URL no configurado - skipping notification')
    return
  }

  const posicionLabel = params.posicionTop3 === 1 ? '⭐ Favorita (#1)'
    : params.posicionTop3 === 2 ? '🥈 Segunda opción (#2)'
    : '🥉 Tercera opción (#3)'

  const estadoLabel: Record<string, string> = {
    'preventa': '🏗️ Preventa',
    'entrega_inmediata': '✅ Lista',
    'en_construccion': '🚧 En construcción',
    'usado': '🏠 Usado',
    'nuevo_a_estrenar': '✨ Nuevo'
  }

  const preguntasTexto = params.preguntasGeneradas.map(p => `• ${p}`).join('\n')

  const mensaje = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🔔 LEAD QUIERE CONTACTAR BROKER', emoji: true }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*👤 Comprador:*\n${params.comprador.nombre}` },
          { type: 'mrkdwn', text: `*📱 WhatsApp:*\n${params.comprador.whatsapp}` },
          { type: 'mrkdwn', text: `*📧 Email:*\n${params.comprador.email || 'No proporcionado'}` },
          { type: 'mrkdwn', text: `*🎫 Código:*\n#${params.codigoRef}` }
        ]
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*🏢 Propiedad:*\n${params.propiedad.nombre}` },
          { type: 'mrkdwn', text: `*🏆 Posición:*\n${posicionLabel}` },
          { type: 'mrkdwn', text: `*💰 Precio:*\n$${params.propiedad.precio?.toLocaleString() || '?'}` },
          { type: 'mrkdwn', text: `*🏠 Estado:*\n${estadoLabel[params.propiedad.estadoConstruccion] || params.propiedad.estadoConstruccion || '?'}` }
        ]
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*👔 Broker:*\n${params.broker.nombre}${params.broker.inmobiliaria ? ` (${params.broker.inmobiliaria})` : ''}` },
          { type: 'mrkdwn', text: `*📱 WSP Broker:*\n${params.broker.whatsapp}` }
        ]
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*📋 Preguntas del comprador:*\n${preguntasTexto}` }
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '⚡ *Acción:* Enviar WhatsApp al broker con estos datos' }]
      }
    ]
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mensaje)
    })
    if (!response.ok) {
      console.error('Slack webhook error:', response.status, await response.text())
    }
  } catch (error) {
    console.error('Error enviando Slack:', error)
  }
}
