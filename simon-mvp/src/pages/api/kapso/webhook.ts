// Ingest de mensajes de WhatsApp desde Kapso.
//
//   Cliente ⇄ WhatsApp ⇄ Kapso ──webhook──> POST /api/kapso/webhook ──> Supabase
//
// Cierra el último tramo del funnel: se podía medir el click en una publicación
// (/api/ir → mkt_clicks_puente) pero no si esa persona llegó a escribir. Ahora
// el primer mensaje queda registrado y, como /ir precarga el nombre de la pieza
// en el texto, `v_atribucion_contactos` dice qué publicación generó la
// conversación — no solo el click.
//
// 🔑 El bot NO escribe en SICI. Kapso EMPUJA el evento y SICI escribe con su
// propio service_role. `bot_kapso_readonly` sigue siendo incapaz de modificar
// nada, que es el diseño de lab-kapso y no hay que romperlo.
//
// Contrato (lab-kapso/.agents/skills/integrate-whatsapp/references/):
//   · Header `X-Webhook-Signature` = HMAC-SHA256(secret, raw body) en hex
//   · Verificar contra los BYTES CRUDOS, antes de parsear el JSON
//   · Responder 200 en <10s; si no, Kapso reintenta a los 10s/40s/90s
//   · Puede venir en lote (`X-Webhook-Batch: true`) → aceptar array
//
// Requiere la env var KAPSO_WEBHOOK_SECRET (el mismo valor configurado en Kapso).

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { normalizePhone } from '@/lib/phone'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET

// El body crudo hace falta para verificar la firma: si Next lo parsea, el JSON
// re-serializado NO es byte a byte el que se firmó y el HMAC nunca coincide.
export const config = { api: { bodyParser: false } }

function leerRaw(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = []
    req.on('data', c => partes.push(typeof c === 'string' ? Buffer.from(c) : c))
    req.on('end', () => resolve(Buffer.concat(partes)))
    req.on('error', reject)
  })
}

/** Comparación en tiempo constante: un `===` filtra el secreto por timing. */
function firmaValida(raw: Buffer, firma: string): boolean {
  if (!WEBHOOK_SECRET || !firma) return false
  const esperada = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')
  const a = Buffer.from(esperada, 'utf8')
  const b = Buffer.from(firma.trim().toLowerCase(), 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

interface EventoKapso {
  message?: {
    id?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
    kapso?: { direction?: string; content?: string }
  }
  conversation?: {
    id?: string
    phone_number?: string
    kapso?: { contact_name?: string }
  }
}

interface MensajeNormalizado {
  telefono: string
  nombre: string | null
  direccion: 'in' | 'out'
  texto: string | null
  tipo: string | null
  kapso_message_id: string
  kapso_conversation_id: string | null
  enviado_at: string
}

function normalizarEvento(ev: EventoKapso): MensajeNormalizado | null {
  const wamid = ev?.message?.id
  const crudo = ev?.conversation?.phone_number
  if (!wamid || !crudo) return null

  const telefono = normalizePhone(crudo)
  // Solo Bolivia: un número de otro país es ruido o una prueba de Kapso.
  if (!telefono) return null

  // El timestamp de WhatsApp viene en segundos como string.
  const ts = Number(ev?.message?.timestamp)
  const enviado_at = Number.isFinite(ts) && ts > 0
    ? new Date(ts * 1000).toISOString()
    : new Date().toISOString()

  return {
    telefono,
    nombre: ev?.conversation?.kapso?.contact_name?.slice(0, 120) || null,
    direccion: ev?.message?.kapso?.direction === 'outbound' ? 'out' : 'in',
    texto: (ev?.message?.text?.body ?? ev?.message?.kapso?.content ?? null)?.slice(0, 4000) ?? null,
    tipo: ev?.message?.type?.slice(0, 40) || null,
    kapso_message_id: String(wamid).slice(0, 200),
    kapso_conversation_id: ev?.conversation?.id?.slice(0, 200) || null,
    enviado_at,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  // Sin secreto configurado se rechaza TODO. Aceptar sin firmar convertiría el
  // endpoint en un formulario público para inyectar conversaciones falsas
  // — "el agujero más grande del plan" (CRM_CLIENTES_B2C_PLAN.md §6).
  if (!WEBHOOK_SECRET) {
    console.error('[kapso/webhook] KAPSO_WEBHOOK_SECRET no configurado — rechazando')
    return res.status(503).json({ error: 'not_configured' })
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[kapso/webhook] Supabase no configurado')
    return res.status(503).json({ error: 'not_configured' })
  }

  let raw: Buffer
  try {
    raw = await leerRaw(req)
  } catch {
    return res.status(400).json({ error: 'body_ilegible' })
  }

  const firma = String(req.headers['x-webhook-signature'] || '')
  if (!firmaValida(raw, firma)) {
    console.warn('[kapso/webhook] firma inválida — rechazado')
    return res.status(401).json({ error: 'firma_invalida' })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'json_invalido' })
  }

  // Kapso puede mandar los mensajes en lote (X-Webhook-Batch).
  const eventos: EventoKapso[] = Array.isArray(payload)
    ? (payload as EventoKapso[])
    : [payload as EventoKapso]

  const mensajes = eventos.map(normalizarEvento).filter((m): m is MensajeNormalizado => m !== null)
  if (mensajes.length === 0) return res.status(200).json({ ok: true, guardados: 0 })

  const sb = createClient(supabaseUrl, supabaseServiceKey)
  let guardados = 0

  try {
    // Un upsert de contactos por teléfono distinto (suelen ser 1-2 por lote).
    const porTelefono = new Map<string, MensajeNormalizado>()
    for (const m of mensajes) if (!porTelefono.has(m.telefono)) porTelefono.set(m.telefono, m)

    const contactoIds = new Map<string, string>()
    for (const [telefono, m] of porTelefono) {
      // `nombre` solo se pisa si Kapso trae uno: un evento sin nombre no debe
      // borrar el que ya teníamos.
      const fila: Record<string, unknown> = { telefono, updated_at: new Date().toISOString() }
      if (m.nombre) fila.nombre = m.nombre
      const { data, error } = await sb
        .from('simon_contactos')
        .upsert(fila, { onConflict: 'telefono' })
        .select('id')
        .single()
      if (error) throw error
      if (data?.id) contactoIds.set(telefono, data.id as string)
    }

    const filas = mensajes
      .filter(m => contactoIds.has(m.telefono))
      .map(m => ({
        contacto_id: contactoIds.get(m.telefono),
        telefono: m.telefono,
        direccion: m.direccion,
        texto: m.texto,
        tipo: m.tipo,
        kapso_message_id: m.kapso_message_id,
        kapso_conversation_id: m.kapso_conversation_id,
        enviado_at: m.enviado_at,
      }))

    if (filas.length) {
      // Idempotencia: Kapso reintenta a los 10s/40s/90s si no recibe 200, y el
      // mismo wamid puede llegar varias veces. ignoreDuplicates evita el 23505.
      const { error } = await sb
        .from('simon_mensajes')
        .upsert(filas, { onConflict: 'kapso_message_id', ignoreDuplicates: true })
      if (error) throw error
      guardados = filas.length
    }
  } catch (e) {
    // 500 hace que Kapso reintente — correcto para un fallo transitorio de BD.
    console.error('[kapso/webhook] error guardando:', e)
    return res.status(500).json({ error: 'error_guardando' })
  }

  return res.status(200).json({ ok: true, guardados })
}
