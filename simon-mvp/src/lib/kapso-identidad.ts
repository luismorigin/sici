// lib/kapso-identidad.ts — quién es la persona del otro lado de un evento de Kapso.
//
// Meta está sacando el teléfono del payload de WhatsApp: quien adopta un username
// (@nombre) obtiene privacidad de número y `wa_id`/`from` DESAPARECEN — no llegan
// vacíos, no llegan. En su lugar viaja el BSUID (business-scoped user ID), formato
// `BO.2453994595121663`. Ver lab-kapso/BRIEFING_SICI_BSUID.md (D31, 11-ago-2026).
//
// Este módulo es PURO a propósito (sin red, sin BD, sin Next): es lo que hace
// testeable el escenario que rompe integraciones — agarrar un payload real,
// borrarle el teléfono y reinyectarlo. Ver scripts/kapso-bsuid/test-bsuid.mjs.
//
// 🔴 El BSUID NO es único global: está scopeado al PORTFOLIO comercial. La
// identidad es el PAR (meta_portfolio_id, business_scoped_user_id). Sin el
// portfolio se mezclarían historiales de personas distintas el día que la WABA
// se mueva a otro portfolio (lab-kapso D30).

import { normalizePhone } from './phone'

/**
 * Portfolio comercial dueño de la WABA del bot. Hoy hay uno solo ("Simón",
 * lab-kapso D30) y NO viene en el payload del webhook — Meta manda
 * `phone_number_id`, no el portfolio. Se resuelve por configuración.
 */
export const META_PORTFOLIO_ID = process.env.META_PORTFOLIO_ID || '2073772363472695'

/**
 * ISO-3166 (2 letras) + "." + hasta 128 alfanuméricos. La variante ENT de las
 * cuentas agrupadas mete un segmento extra: `US.ENT.xxxx`.
 * Se valida el formato para no guardar como BSUID cualquier string que Kapso
 * cambie de lugar mañana: un identificador mal formado es peor que ninguno.
 */
const RE_BSUID = /^[A-Z]{2}\.(?:ENT\.)?[A-Za-z0-9_-]{1,160}$/

export interface EventoKapso {
  message?: {
    id?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
    kapso?: {
      direction?: string
      content?: string
      statuses?: Array<{ recipient_user_id?: string }>
    }
    // Identificadores nuevos de Meta (fase aditiva: hoy llegan junto al teléfono)
    from_user_id?: string
    from_parent_user_id?: string
    to_user_id?: string
    to_parent_user_id?: string
    username?: string
  }
  conversation?: {
    id?: string
    phone_number?: string
    phone_number_id?: string
    kapso?: { contact_name?: string }
    business_scoped_user_id?: string
    parent_business_scoped_user_id?: string
    username?: string
  }
  phone_number_id?: string
}

/** Los identificadores de la PERSONA (nunca los del negocio) en un evento. */
export interface IdentidadKapso {
  /** BSUID de la persona, validado. `null` si no vino o vino mal formado. */
  bsuid: string | null
  /** Variante ENT (US.ENT.xxx) para cuentas agrupadas. Hoy siempre null en Simón. */
  parentBsuid: string | null
  /** Username de WhatsApp (@nombre) — justo quien deja de mandar el teléfono. */
  username: string | null
  /** Teléfono normalizado +591… o `null` (no vino, o no es boliviano). */
  telefono: string | null
  /** Lo que llegó como teléfono, sin normalizar (para diagnosticar descartes). */
  telefonoCrudo: string | null
  /** ISO del país que trae el propio BSUID: 'BO', 'US'… `null` si no hay BSUID. */
  paisBsuid: string | null
  /** Número del bot que recibió el mensaje (sí viene en el payload). */
  phoneNumberId: string | null
  /** Portfolio dueño del BSUID. Por configuración, no por payload. */
  portfolioId: string
}

export interface MensajeNormalizado {
  telefono: string | null
  nombre: string | null
  direccion: 'in' | 'out'
  texto: string | null
  tipo: string | null
  kapso_message_id: string
  kapso_conversation_id: string | null
  enviado_at: string
  // Identidad nueva (mig 318)
  bsuid: string | null
  parentBsuid: string | null
  username: string | null
  phoneNumberId: string | null
  portfolioId: string
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

/** Valida el formato antes de aceptar algo como BSUID. */
export function limpiarBsuid(v: unknown): string | null {
  const s = texto(v, 200)
  return s && RE_BSUID.test(s) ? s : null
}

/**
 * Saca la lista de eventos del body, en cualquiera de las formas en que Kapso lo manda.
 *
 * ⚠️ Con buffering activado el lote NO viene como array plano: viene envuelto en
 *     { type, batch: true, data: [ ...eventos... ], batch_info }
 * (doc oficial: docs.kapso.ai → Webhooks overview §1). Asumir un array plano hace
 * que el envelope se trate como UN evento, no encuentre `message.id`, y el lote
 * entero se descarte devolviendo 200 — o sea, se pierden mensajes en silencio y
 * Kapso ni siquiera reintenta porque recibió el 200.
 *
 * Se aceptan las tres formas por robustez: envelope, array plano y evento suelto.
 */
export function extraerEventos(payload: unknown): EventoKapso[] {
  if (Array.isArray(payload)) return payload as EventoKapso[]
  if (payload && typeof payload === 'object') {
    const p = payload as { batch?: boolean; data?: unknown }
    if (Array.isArray(p.data)) return p.data as EventoKapso[]
    return [payload as EventoKapso]
  }
  return []
}

export function direccionDe(ev: EventoKapso): 'in' | 'out' {
  return ev?.message?.kapso?.direction === 'outbound' ? 'out' : 'in'
}

/**
 * Los identificadores de la persona, buscados en TODOS los lugares plausibles.
 *
 * 🔴 Por qué tantos lugares: está verificado (11-ago-2026) que la **API** de Kapso
 * expone `business_scoped_user_id` en la conversación y `to_user_id` /
 * `kapso.statuses[].recipient_user_id` en el mensaje. Lo que NO está confirmado es
 * si el **payload del webhook** los trae en la misma posición — el ejemplo oficial
 * del payload v2 no los lista, y SICI solo ve el webhook. Buscar en todos lados
 * cuesta nada; suponer una sola posición cuesta el mapeo entero.
 *
 * ⚠️ Dirección: en un mensaje SALIENTE el BSUID de la persona es el DESTINATARIO
 * (`to_user_id`), no el remitente — ahí el remitente es el negocio. Tomarlo mal
 * guardaría el identificador del bot como si fuera el del cliente.
 */
export function extraerIdentidad(ev: EventoKapso): IdentidadKapso {
  const conv = ev?.conversation
  const msg = ev?.message
  const saliente = direccionDe(ev) === 'out'

  const bsuid =
    limpiarBsuid(conv?.business_scoped_user_id) ??
    limpiarBsuid(saliente ? msg?.to_user_id : msg?.from_user_id) ??
    (saliente ? limpiarBsuid(msg?.kapso?.statuses?.[0]?.recipient_user_id) : null)

  const parentBsuid =
    limpiarBsuid(conv?.parent_business_scoped_user_id) ??
    limpiarBsuid(saliente ? msg?.to_parent_user_id : msg?.from_parent_user_id)

  const telefonoCrudo = texto(conv?.phone_number, 40)

  return {
    bsuid,
    parentBsuid,
    username: texto(conv?.username ?? msg?.username, 120),
    telefono: telefonoCrudo ? normalizePhone(telefonoCrudo) : null,
    telefonoCrudo,
    paisBsuid: bsuid ? bsuid.slice(0, 2) : null,
    phoneNumberId: texto(conv?.phone_number_id ?? ev?.phone_number_id, 40),
    portfolioId: META_PORTFOLIO_ID,
  }
}

/**
 * Qué claves trajo realmente el evento. Se usa SOLO para el log de diagnóstico
 * cuando falta el BSUID: sin esto, el día que Kapso mueva el campo de lugar el
 * síntoma sería una columna en NULL sin ninguna pista de por qué.
 * No incluye valores — nada de PII en los logs.
 */
export function clavesDiagnostico(ev: EventoKapso): string {
  const k = (o: unknown) => (o && typeof o === 'object' ? Object.keys(o).join('|') : '—')
  return `conversation[${k(ev?.conversation)}] message[${k(ev?.message)}]`
}

/** Por qué un evento no se pudo procesar. Se guarda con el evento crudo. */
export type MotivoDescarte = 'sin_wamid' | 'sin_identidad' | 'fuera_de_bolivia'

export type ResultadoEvento =
  | { ok: true; mensaje: MensajeNormalizado }
  | { ok: false; motivo: MotivoDescarte }

/**
 * Evento de Kapso → fila lista para guardar, o el motivo por el que no.
 *
 * 🔴 EL CAMBIO DE LA MIG 319: antes esto era `if (!wamid || !telefono) return null`
 * y un evento sin teléfono se perdía sin log, sin error y sin posibilidad de
 * recuperarlo (Meta no reenvía). Ahora alcanza con **una** identidad: el BSUID o el
 * teléfono. El motivo se devuelve para que el que llama lo guarde crudo en vez de
 * tirarlo.
 *
 * ⚠️ El filtro "solo Bolivia" cambió de fuente, no de intención. Antes el país
 * salía del teléfono, y sin teléfono no hay país que mirar. Regla nueva: si hay
 * teléfono, manda el teléfono (evidencia más fuerte); si no hay, manda el ISO que
 * trae el propio BSUID (`BO.`). Un número de otro país sigue siendo ruido o una
 * prueba de Kapso.
 */
export function normalizarEvento(ev: EventoKapso): ResultadoEvento {
  const wamid = ev?.message?.id
  if (!wamid) return { ok: false, motivo: 'sin_wamid' }

  const id = extraerIdentidad(ev)
  if (!id.telefono && !id.bsuid) {
    return { ok: false, motivo: id.telefonoCrudo ? 'fuera_de_bolivia' : 'sin_identidad' }
  }
  // Vino un teléfono y no es boliviano: no lo salva tener BSUID.
  if (!id.telefono && id.telefonoCrudo) return { ok: false, motivo: 'fuera_de_bolivia' }
  // Sin teléfono, el país lo dice el BSUID.
  if (!id.telefono && id.paisBsuid !== 'BO') return { ok: false, motivo: 'fuera_de_bolivia' }

  // El timestamp de WhatsApp viene en segundos como string.
  const ts = Number(ev?.message?.timestamp)
  const enviado_at = Number.isFinite(ts) && ts > 0
    ? new Date(ts * 1000).toISOString()
    : new Date().toISOString()

  return {
    ok: true,
    mensaje: {
      telefono: id.telefono,
      nombre: texto(ev?.conversation?.kapso?.contact_name, 120),
      direccion: direccionDe(ev),
      texto: texto(ev?.message?.text?.body ?? ev?.message?.kapso?.content, 4000),
      tipo: texto(ev?.message?.type, 40),
      kapso_message_id: String(wamid).slice(0, 200),
      kapso_conversation_id: texto(ev?.conversation?.id, 200),
      enviado_at,
      bsuid: id.bsuid,
      parentBsuid: id.parentBsuid,
      username: id.username,
      phoneNumberId: id.phoneNumberId,
      portfolioId: id.portfolioId,
    },
  }
}

/**
 * La clave con la que se agrupan los eventos de UNA MISMA persona dentro de un lote.
 * BSUID primero, teléfono después — el mismo orden que usa la BD para resolver la
 * identidad. Al revés, en la ventana en que Meta manda los dos, dos eventos de la
 * misma persona podrían agruparse por caminos distintos.
 */
export function claveIdentidad(m: MensajeNormalizado): string {
  return m.bsuid ? `b:${m.portfolioId}:${m.bsuid}` : `t:${m.telefono}`
}

/**
 * ¿Es un aviso de Meta de que el BSUID de alguien CAMBIÓ (`user_id_update`)?
 *
 * ⚠️ La forma exacta de este evento NO está verificada contra un payload real —
 * todavía no llegó ninguno. Por eso se detecta por la FORMA (hay un identificador
 * "anterior" y uno "nuevo") y no por un nombre de campo puntual, y por eso lo que
 * no se reconoce se guarda crudo en vez de descartarse. Cuando llegue el primero,
 * el payload va a estar en `simon_eventos_sin_procesar` para ajustarlo.
 */
export function detectarCambioDeBsuid(ev: unknown): { anterior: string | null; nuevo: string } | null {
  if (!ev || typeof ev !== 'object') return null
  let anterior: string | null = null
  let nuevo: string | null = null

  const recorrer = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (/^(previous|old|former)_/.test(k) && /user_id$/.test(k)) anterior ??= limpiarBsuid(v)
      else if (/^(new|current|updated)_/.test(k) && /user_id$/.test(k)) nuevo ??= limpiarBsuid(v)
      if (v && typeof v === 'object') recorrer(v)
    }
  }
  recorrer(ev)

  return nuevo ? { anterior, nuevo } : null
}
