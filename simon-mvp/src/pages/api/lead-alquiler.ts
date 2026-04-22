// API: Registrar lead WhatsApp de alquileres
// POST /api/lead-alquiler — body JSON, responde { ok, whatsapp_url }
// Bots/prefetch no ejecutan POST, eliminando leads fantasma.
//
// Fase 1 modal WA: acepta usuario_telefono, alert_consent, visitor_uuid, modal_action.
// Slack notif fire-and-forget si alert_consent=true (al webhook directo).

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { isValidBolivianPhone, normalizePhone } from '@/lib/phone'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const META_BOT_PATTERNS = [
  'facebookexternalhit',
  'facebot',
  'facebookbot',
  'metainspector',
  'facebookcatalog',
  'meta-externalagent',
]

function isMetaBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase()
  return META_BOT_PATTERNS.some(p => ua.includes(p))
}

// ===== Rate Limiter (in-memory, best-effort en serverless) =====
const RATE_LIMIT = 10
const RATE_WINDOW = 60_000
const rateMap = new Map<string, number[]>()

function checkRate(ip: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) || []).filter(t => now - t < RATE_WINDOW)
  if (hits.length >= RATE_LIMIT) {
    rateMap.set(ip, hits)
    return false
  }
  hits.push(now)
  rateMap.set(ip, hits)
  // Cleanup oportunista
  if (rateMap.size > 500) {
    for (const [k, stamps] of rateMap.entries()) {
      const recent = stamps.filter(t => now - t < RATE_WINDOW)
      if (recent.length === 0) rateMap.delete(k)
    }
  }
  return true
}

function getClientIP(req: NextApiRequest): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string') return fwd.split(',')[0].trim()
  if (Array.isArray(fwd)) return fwd[0]
  return req.socket?.remoteAddress || 'unknown'
}

// ===== Slack fire-and-forget =====
function notifySlackFireAndForget(payload: {
  leadId: number
  whatsapp: string
  proyecto: string
  propiedad_id: number | null
}) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return
  const message = `*Nuevo lead con consent* :new:\n` +
    `> WhatsApp: ${payload.whatsapp}\n` +
    `> Proyecto: ${payload.proyecto || 'N/A'}\n` +
    `> Propiedad ID: ${payload.propiedad_id ?? 'N/A'}\n` +
    `> Lead ID: #${payload.leadId}`
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message, unfurl_links: false }),
  }).catch(() => { /* silenciar: Slack no debe bloquear lead */ })
}

type ModalAction = 'submitted' | 'skipped' | 'reused' | 'dismissed'

function isValidModalAction(v: unknown): v is ModalAction {
  return v === 'submitted' || v === 'skipped' || v === 'reused' || v === 'dismissed'
}

function parseBody(req: NextApiRequest) {
  const b = req.body || {}
  return {
    phone: typeof b.phone === 'string' ? b.phone : '',
    msg: typeof b.msg === 'string' ? b.msg : '',
    prop_id: b.prop_id,
    nombre: typeof b.nombre === 'string' ? b.nombre : '',
    zona: typeof b.zona === 'string' ? b.zona : '',
    precio: b.precio,
    dorms: b.dorms,
    broker_nombre: typeof b.broker_nombre === 'string' ? b.broker_nombre : '',
    fuente: typeof b.fuente === 'string' ? b.fuente : 'card',
    preguntas: b.preguntas,
    debug: b.debug,
    sid: typeof b.sid === 'string' ? b.sid : '',
    utm_source: typeof b.utm_source === 'string' ? b.utm_source : '',
    utm_content: typeof b.utm_content === 'string' ? b.utm_content : '',
    utm_campaign: typeof b.utm_campaign === 'string' ? b.utm_campaign : '',
    // Fase 1 modal capture
    usuario_telefono: typeof b.usuario_telefono === 'string' ? b.usuario_telefono : null,
    alert_consent: b.alert_consent === true,
    visitor_uuid: typeof b.visitor_uuid === 'string' ? b.visitor_uuid : '',
    modal_action: isValidModalAction(b.modal_action) ? b.modal_action : null,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  // Rate limit por IP (best-effort serverless)
  const ip = getClientIP(req)
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' })
  }

  try {
    const parsed = parseBody(req)
    const {
      phone, msg, prop_id, nombre, zona, precio, dorms, broker_nombre,
      fuente, preguntas, debug, sid, utm_source, utm_content, utm_campaign,
      usuario_telefono: userPhoneRaw, alert_consent, visitor_uuid, modal_action,
    } = parsed

    if (!phone) {
      return res.status(400).json({ error: 'Falta número de teléfono' })
    }

    // Validar usuario_telefono si viene (Fase 1 modal). Null es válido (skip/dismiss).
    let usuario_telefono: string | null = null
    if (userPhoneRaw) {
      if (!isValidBolivianPhone(userPhoneRaw)) {
        return res.status(400).json({ error: 'Número de WhatsApp del usuario inválido' })
      }
      usuario_telefono = normalizePhone(userPhoneRaw)
    }

    const cleanPhone = phone.replace(/\D/g, '')
    const finalPhone = cleanPhone.startsWith('591') ? cleanPhone : `591${cleanPhone}`

    const msgText = msg || ''
    const whatsappUrl = `https://wa.me/${finalPhone}${msgText ? `?text=${encodeURIComponent(msgText)}` : ''}`

    // Parse preguntas
    let preguntasArr: string[] = []
    try {
      if (Array.isArray(preguntas)) preguntasArr = preguntas
      else if (typeof preguntas === 'string') preguntasArr = JSON.parse(preguntas)
    } catch { /* ignore */ }

    const propIdNum = prop_id ? parseInt(String(prop_id), 10) : NaN
    const precioNum = precio ? parseFloat(String(precio)) : NaN
    const dormsNum = dorms != null ? parseInt(String(dorms), 10) : NaN

    // Insert lead with server-side dedup (skip if same prop+phone in last 30s)
    // Usa service_role para bypassear RLS (tabla tiene PII, sin acceso anon).
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const safePropId = !isNaN(propIdNum) && propIdNum > 0 ? propIdNum : null

      try {
        if (safePropId) {
          const { data: recent } = await supabase
            .from('leads_alquiler')
            .select('id')
            .eq('propiedad_id', safePropId)
            .eq('broker_telefono', finalPhone)
            .gte('created_at', new Date(Date.now() - 30_000).toISOString())
            .limit(1)
          if (recent && recent.length > 0) {
            return res.status(200).json({ ok: true, whatsapp_url: whatsappUrl, dedup: true })
          }
        }

        // Session debounce: si mismo session_id generó lead en <5s, marcar
        let isDebounce = false
        const safeSid = sid && sid.length <= 50 ? sid : null
        if (safeSid) {
          const { data: recentSession } = await supabase
            .from('leads_alquiler')
            .select('id')
            .eq('session_id', safeSid)
            .gte('created_at', new Date(Date.now() - 5_000).toISOString())
            .limit(1)
          if (recentSession && recentSession.length > 0) {
            isDebounce = true
          }
        }

        const userAgent = (req.headers['user-agent'] || '').slice(0, 500)
        const esBot = isMetaBot(userAgent)

        const insertPayload = {
          propiedad_id: safePropId,
          nombre_propiedad: nombre.slice(0, 200) || null,
          zona: zona.slice(0, 100) || null,
          precio_bob: !isNaN(precioNum) && precioNum > 0 && precioNum < 1_000_000 ? precioNum : null,
          dormitorios: !isNaN(dormsNum) && dormsNum >= 0 && dormsNum <= 10 ? dormsNum : null,
          broker_telefono: finalPhone,
          broker_nombre: broker_nombre.slice(0, 200) || null,
          fuente: fuente.slice(0, 50) || 'card',
          preguntas_enviadas: preguntasArr.length > 0 ? preguntasArr : null,
          es_test: debug === '1' || debug === true,
          session_id: safeSid,
          es_debounce: isDebounce,
          user_agent: userAgent || null,
          es_bot: esBot,
          utm_source: utm_source.slice(0, 100) || null,
          utm_content: utm_content.slice(0, 100) || null,
          utm_campaign: utm_campaign.slice(0, 200) || null,
          // Fase 1 modal capture
          usuario_telefono,
          alert_consent: alert_consent === true,
          visitor_uuid: visitor_uuid.slice(0, 100) || null,
          modal_action,
        }

        const { data: inserted, error } = await supabase
          .from('leads_alquiler')
          .insert(insertPayload)
          .select('id')
          .single()

        if (error) {
          console.error('Error registrando lead alquiler:', error)
        } else if (inserted && alert_consent && usuario_telefono && !esBot && !isDebounce) {
          // Slack fire-and-forget: solo leads con consent real (no bots ni debounces)
          notifySlackFireAndForget({
            leadId: inserted.id,
            whatsapp: usuario_telefono,
            proyecto: nombre || '(sin nombre)',
            propiedad_id: safePropId,
          })
        }
      } catch (err) {
        console.error('Error en insert lead:', err)
      }
    }

    res.status(200).json({ ok: true, whatsapp_url: whatsappUrl })

  } catch (error) {
    console.error('Error en lead-alquiler:', error)
    res.status(500).json({ error: 'Error interno' })
  }
}
