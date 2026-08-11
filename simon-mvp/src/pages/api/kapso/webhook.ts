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
//
// 🆕 BSUID (mig 318): Meta está sacando el teléfono del payload — quien adopta un
// username obtiene privacidad de número y `wa_id`/`from` desaparecen. Mientras
// Meta siga mandando los DOS identificadores, cada evento que entra guarda también
// el BSUID: es la única ventana para construir el mapeo teléfono↔BSUID, y se
// cierra por cliente, sin fecha de corte. Quién es quién se resuelve en
// lib/kapso-identidad.ts. Briefing: lab-kapso/BRIEFING_SICI_BSUID.md (D31).

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import {
  clavesDiagnostico,
  extraerEventos,
  normalizarEvento,
  type EventoKapso,
  type MensajeNormalizado,
} from '@/lib/kapso-identidad'

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

/**
 * Deja constancia de los eventos que llegan SIN el identificador nuevo de Meta.
 *
 * 🔴 Existe por una duda concreta: está verificado que la API de Kapso expone
 * `business_scoped_user_id`, pero el ejemplo oficial del payload v2 de webhook no
 * lo lista — y SICI solo ve el webhook. Si no viniera, la columna quedaría en NULL
 * en cada evento y el backfill "andaría" sin guardar nada. Este log dice qué claves
 * trajo el payload de verdad; el termómetro en números es `v_bsuid_cobertura`.
 * No imprime valores: nada de PII en los logs.
 */
function avisarSiFaltaBsuid(eventos: EventoKapso[], mensajes: MensajeNormalizado[]) {
  const sinBsuid = mensajes.filter(m => !m.bsuid).length
  if (sinBsuid === 0) return
  console.warn(
    `[kapso/webhook] ${sinBsuid}/${mensajes.length} evento(s) sin BSUID — ` +
    `claves recibidas: ${eventos.slice(0, 1).map(clavesDiagnostico).join('')}`
  )
}

/**
 * ¿El error es "esa columna/tabla todavía no existe"?
 *
 * 🔴 Las migraciones de SICI las aplica el humano a mano, así que el deploy puede
 * llegar ANTES que la mig 318. Sin esta distinción, el ingest entero devolvería 500
 * hasta que alguien aplique el SQL: Kapso reintenta 3 veces y después abandona
 * → se perderían mensajes por el mismo agujero que estamos tapando.
 * Con esto, el webhook sigue guardando lo de siempre y avisa que falta la migración.
 */
function esColumnaInexistente(e: unknown): boolean {
  const err = e as { code?: string; message?: string }
  return err?.code === 'PGRST204' || err?.code === '42703' || err?.code === '42P01' ||
    /does not exist|schema cache/i.test(err?.message ?? '')
}

// El tipo del cliente sale de una llamada real: `ReturnType<typeof createClient>` a
// secas infiere un schema `never` y no deja escribir nada (mismo patrón que
// lib/simon-contactos.ts).
const crearSb = () => createClient(supabaseUrl as string, supabaseServiceKey as string)
type Supa = ReturnType<typeof crearSb>

/**
 * Guarda TODOS los identificadores que Meta le fue dando a una persona, no solo el
 * último.
 *
 * 🔴 El BSUID cambia: en los datos del propio founder el mismo número tiene tres,
 * y el tercero aparece el 28-jul-2026, el día de la reconexión de coexistencia
 * (lab-kapso D30). Si solo guardáramos el vigente, un evento que llegue con el
 * anterior no encontraría a nadie y crearía un contacto duplicado — que es
 * exactamente lo que el briefing manda evitar.
 *
 * No rompe el ingest si falla: un mensaje guardado sin su alias se puede
 * reconstruir después desde la API de Kapso; un mensaje perdido, no.
 */
async function guardarAlias(
  sb: Supa,
  porTelefono: Map<string, MensajeNormalizado>,
  contactoIds: Map<string, string>,
  ahora: string,
) {
  const filas = [...porTelefono.entries()]
    .filter(([tel, m]) => m.bsuid && contactoIds.has(tel))
    .map(([tel, m]) => ({
      contacto_id: contactoIds.get(tel) as string,
      meta_portfolio_id: m.portfolioId,
      business_scoped_user_id: m.bsuid as string,
      phone_number_id: m.phoneNumberId,
      origen: 'webhook',
      ultimo_visto_at: ahora,
    }))
  if (!filas.length) return

  try {
    // `primero_visto_at` no viaja en el payload a propósito: PostgREST solo pisa
    // las columnas que le mandás, así que la primera vez que se vio se conserva.
    const { error } = await sb
      .from('simon_contacto_bsuids')
      .upsert(filas, { onConflict: 'meta_portfolio_id,business_scoped_user_id' })
    if (error) throw error
  } catch (e) {
    console.warn('[kapso/webhook] no se pudo guardar el alias de BSUID:', e)
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

  const eventos = extraerEventos(payload)

  const mensajes = eventos.map(normalizarEvento).filter((m): m is MensajeNormalizado => m !== null)
  avisarSiFaltaBsuid(eventos, mensajes)
  if (mensajes.length === 0) return res.status(200).json({ ok: true, guardados: 0 })

  const sb = crearSb()
  let guardados = 0
  let sinMigracion = false

  try {
    const ahora = new Date().toISOString()

    // Un upsert de contactos por teléfono distinto (suelen ser 1-2 por lote).
    // Los identificadores se toman del PRIMER evento del lote que los traiga: en un
    // lote mezclado (entrante + saliente) puede que solo uno tenga el BSUID, y
    // quedarse con el primer evento a secas lo perdería.
    const porTelefono = new Map<string, MensajeNormalizado>()
    for (const m of mensajes) {
      if (!m.telefono) continue
      const previo = porTelefono.get(m.telefono)
      if (!previo) { porTelefono.set(m.telefono, { ...m }); continue }
      previo.nombre ??= m.nombre
      previo.bsuid ??= m.bsuid
      previo.parentBsuid ??= m.parentBsuid
      previo.username ??= m.username
      previo.phoneNumberId ??= m.phoneNumberId
    }

    const contactoIds = new Map<string, string>()
    for (const [telefono, m] of porTelefono) {
      // Ningún campo se pisa con vacío: un evento sin nombre (o sin BSUID) no debe
      // borrar el que ya teníamos. Por eso se arma la fila campo por campo.
      const fila: Record<string, unknown> = { telefono, updated_at: ahora }
      if (m.nombre) fila.nombre = m.nombre
      if (m.bsuid) {
        // El par (portfolio, bsuid) viaja junto SIEMPRE: un BSUID sin su portfolio
        // no identifica a nadie — el mismo string puede ser otra persona en otro
        // portfolio (lab-kapso D30).
        fila.business_scoped_user_id = m.bsuid
        fila.meta_portfolio_id = m.portfolioId
        fila.bsuid_visto_at = ahora
      }
      if (m.parentBsuid) fila.parent_business_scoped_user_id = m.parentBsuid
      if (m.username) fila.username = m.username
      if (m.phoneNumberId) fila.phone_number_id = m.phoneNumberId

      let { data, error } = await sb
        .from('simon_contactos')
        .upsert(fila, { onConflict: 'telefono' })
        .select('id')
        .single()

      if (error && esColumnaInexistente(error)) {
        // Deploy adelantado a la migración: se guarda lo de siempre y se avisa.
        console.warn('[kapso/webhook] mig 318 sin aplicar — guardando sin BSUID')
        sinMigracion = true
        const minima: Record<string, unknown> = { telefono, updated_at: ahora }
        if (m.nombre) minima.nombre = m.nombre
        ;({ data, error } = await sb
          .from('simon_contactos')
          .upsert(minima, { onConflict: 'telefono' })
          .select('id')
          .single())
      }
      if (error) throw error
      if (data?.id) contactoIds.set(telefono, data.id as string)
    }

    const filas = mensajes
      .filter(m => m.telefono && contactoIds.has(m.telefono))
      .map(m => ({
        contacto_id: contactoIds.get(m.telefono as string),
        telefono: m.telefono,
        direccion: m.direccion,
        texto: m.texto,
        tipo: m.tipo,
        kapso_message_id: m.kapso_message_id,
        kapso_conversation_id: m.kapso_conversation_id,
        enviado_at: m.enviado_at,
        ...(sinMigracion ? {} : { business_scoped_user_id: m.bsuid }),
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

    // El historial de identificadores. Va al final y en su propio try: es
    // información valiosa, pero NO vale perder el mensaje por ella.
    if (!sinMigracion) await guardarAlias(sb, porTelefono, contactoIds, ahora)
  } catch (e) {
    // 500 hace que Kapso reintente — correcto para un fallo transitorio de BD.
    console.error('[kapso/webhook] error guardando:', e)
    return res.status(500).json({ error: 'error_guardando' })
  }

  return res.status(200).json({ ok: true, guardados })
}
