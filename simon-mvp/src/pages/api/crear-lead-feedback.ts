// API: Crear Lead con Feedback Beta
// POST /api/crear-lead-feedback
// Crea lead beta tester + guarda feedback + notifica Slack

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

interface CrearLeadFeedbackRequest {
  // Datos del usuario
  nombre: string
  whatsapp: string
  email?: string
  // Feedback (2 obligatorios + 1 opcional)
  feedbackRecomendaria: string    // definitivamente | probablemente | no_seguro | no
  feedbackMasUtil: string         // comparacion_precios | posicion_mercado | info_proyectos | todo
  feedbackMejoras?: string        // texto libre (opcional)
  // Contexto de la búsqueda
  formularioRaw: Record<string, unknown>
}

interface CrearLeadFeedbackResponse {
  success: boolean
  leadId?: number
  codigoRef?: string
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CrearLeadFeedbackResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    })
  }

  if (!supabase) {
    return res.status(500).json({
      success: false,
      error: 'Database not configured'
    })
  }

  try {
    const data: CrearLeadFeedbackRequest = req.body

    // Validar datos requeridos
    if (!data.nombre?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El nombre es requerido'
      })
    }

    if (!data.whatsapp?.trim() || data.whatsapp.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp inválido'
      })
    }

    // Validar feedback obligatorio (2 preguntas)
    if (!data.feedbackRecomendaria || !data.feedbackMasUtil) {
      return res.status(400).json({
        success: false,
        error: 'Completá las 2 preguntas de feedback'
      })
    }

    // Crear lead con feedback usando la función SQL
    const { data: resultado, error: dbError } = await supabase
      .rpc('crear_lead_con_feedback', {
        p_nombre: data.nombre.trim(),
        p_whatsapp: data.whatsapp.trim(),
        p_email: data.email?.trim() || null,
        p_formulario_raw: data.formularioRaw || {},
        p_feedback_recomendaria: data.feedbackRecomendaria,
        p_feedback_alineadas: null,  // Removido del formulario
        p_feedback_honestidad: null, // Removido del formulario
        p_feedback_mas_util: data.feedbackMasUtil,
        p_feedback_mejoras: data.feedbackMejoras?.trim() || null
      })

    if (dbError) {
      console.error('Error DB crear_lead_con_feedback:', dbError)
      throw new Error(dbError.message)
    }

    if (!resultado || resultado.length === 0) {
      throw new Error('No se pudo crear el lead')
    }

    const { lead_id, codigo_ref } = resultado[0]

    // Enviar notificación Slack
    await enviarSlackFeedback({
      leadId: lead_id,
      codigoRef: codigo_ref,
      nombre: data.nombre.trim(),
      whatsapp: data.whatsapp.trim(),
      email: data.email?.trim(),
      feedback: {
        recomendaria: data.feedbackRecomendaria,
        masUtil: data.feedbackMasUtil,
        mejoras: data.feedbackMejoras
      }
    })

    return res.status(200).json({
      success: true,
      leadId: lead_id,
      codigoRef: codigo_ref
    })

  } catch (error) {
    console.error('Error en crear-lead-feedback:', error)
    return res.status(500).json({
      success: false,
      error: (error as Error).message
    })
  }
}

// ============================================================================
// Slack Notification
// ============================================================================
interface SlackFeedbackParams {
  leadId: number
  codigoRef: string
  nombre: string
  whatsapp: string
  email?: string
  feedback: {
    recomendaria: string
    masUtil: string
    mejoras?: string
  }
}

async function enviarSlackFeedback(params: SlackFeedbackParams): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    console.warn('SLACK_WEBHOOK_URL no configurado - skipping notification')
    return
  }

  const recomendariaLabel: Record<string, string> = {
    'definitivamente': '10 - Definitivamente',
    'probablemente': '7-8 Probablemente',
    'no_seguro': '4-6 No estoy seguro',
    'no': '1-3 No'
  }

  const utilLabel: Record<string, string> = {
    'comparacion_precios': 'Comparación de precios',
    'posicion_mercado': 'Posición en el mercado',
    'info_proyectos': 'Información de proyectos',
    'todo': 'Todo me pareció útil'
  }

  const mensaje = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🎉 NUEVO BETA TESTER + FEEDBACK', emoji: true }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*👤 Nombre:*\n${params.nombre}` },
          { type: 'mrkdwn', text: `*📱 WhatsApp:*\n${params.whatsapp}` },
          { type: 'mrkdwn', text: `*📧 Email:*\n${params.email || 'No proporcionado'}` },
          { type: 'mrkdwn', text: `*🎫 Código:*\n#${params.codigoRef}` }
        ]
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*📊 FEEDBACK:*' }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*¿Recomendarías?*\n${recomendariaLabel[params.feedback.recomendaria] || params.feedback.recomendaria}` },
          { type: 'mrkdwn', text: `*¿Más útil?*\n${utilLabel[params.feedback.masUtil] || params.feedback.masUtil}` }
        ]
      },
      ...(params.feedback.mejoras ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: `*💡 Sugerencia de mejora:*\n_"${params.feedback.mejoras}"_` }
      }] : []),
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Lead ID: ${params.leadId} | Informe Premium desbloqueado` }]
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
