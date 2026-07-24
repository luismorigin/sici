// API público sin auth: registra el INTENTO DE CONTACTO por WhatsApp (el clic).
//
//   POST /api/public/wa-click
//   body { origen, propiedad_id?, tipo_operacion?, hash?, destino_telefono?, es_test? }
//   → 204 siempre (es un beacon: nunca debe frenar la apertura de WhatsApp)
//
// POR QUÉ UN BEACON Y NO UN REDIRECT: el botón abre WhatsApp con el esquema
// `whatsapp://` vía anchor invisible (lib/whatsapp.ts, investigado en mayo-2026 —
// un redirect por nuestro server rompería esa UX). Así que el cliente dispara este
// POST con `keepalive` justo antes de abrir la app; sobrevive a la navegación.
//
// 🔑 Si el clic viene de una shortlist (`hash`), resolvemos DE QUIÉN es sin pedirle
// nada al usuario: la shortlist guarda el teléfono del cliente que la pidió →
// simon_contactos. Así el CRM muestra "intentó contactar por 2 de sus favoritas".
//
// Modelo de confianza (espeja /api/public/shortlist-hearts):
//  - El hash es secreto compartido: quien tenga el link puede registrar.
//  - Se valida que la propiedad pertenezca a la shortlist antes de asociarla.
//  - service_role server-side (la tabla es interna, deny-all a anon).
//  - Rate limit best-effort por IP + dedup por (propiedad, ventana corta) para no
//    inflar la métrica con doble-clics. El cliente ya tiene cooldowns propios.
//
// LÍMITE: se registra el CLIC, no el ENVÍO (el mensaje se manda dentro de WhatsApp).
// Excepción: si el destino es el número de Simón, el mensaje real llega por el
// webhook de Kapso a simon_mensajes → ahí sí se puede confirmar. Ver mig 299.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/phone'
import { isDemoShortlistHash } from '@/lib/demo-mode'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Número del bot: si el contacto va acá, el envío REAL se puede confirmar en simon_mensajes.
const SIMON_WA = '+59177066308'

const BOT_PATTERNS = ['facebookexternalhit', 'meta-externalagent', 'bot', 'crawler', 'spider', 'preview']
const esBotUA = (ua: string) => BOT_PATTERNS.some(p => ua.toLowerCase().includes(p))

// Rate limit best-effort (in-memory; en serverless es por instancia, alcanza para ruido)
const RATE_LIMIT = 20
const RATE_WINDOW = 60_000
const rateMap = new Map<string, number[]>()
function rateOk(key: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(key) || []).filter(t => now - t < RATE_WINDOW)
  if (hits.length >= RATE_LIMIT) return false
  hits.push(now)
  rateMap.set(key, hits)
  return true
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Beacon: responder rápido y NUNCA con error que el cliente tenga que manejar.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }

  try {
    const body = (req.body || {}) as {
      origen?: string; propiedad_id?: number | string; tipo_operacion?: string
      hash?: string; destino_telefono?: string; es_test?: boolean
    }

    const origen = String(body.origen || '').slice(0, 40) || 'desconocido'
    const propIdNum = Number(body.propiedad_id)
    const propiedad_id = Number.isFinite(propIdNum) && propIdNum > 0 ? propIdNum : null
    const tipo_operacion = body.tipo_operacion === 'alquiler' ? 'alquiler'
                         : body.tipo_operacion === 'venta' ? 'venta' : null

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sin-ip'
    if (!rateOk(ip)) return res.status(204).end()

    const userAgent = String(req.headers['user-agent'] || '').slice(0, 400)
    const destino = body.destino_telefono ? normalizePhone(String(body.destino_telefono)) : null

    // Shortlist → resuelve de quién es el clic (sin pedirle nada al usuario)
    let shortlist_id: string | null = null
    let contacto_id: string | null = null
    const hash = String(body.hash || '').trim()
    const esDemo = hash ? isDemoShortlistHash(hash) : false

    if (hash && !esDemo) {
      const { data: sl } = await supabase
        .from('broker_shortlists')
        .select('id, cliente_telefono')
        .eq('hash', hash)
        .maybeSingle<{ id: string; cliente_telefono: string | null }>()

      if (sl) {
        // La propiedad debe pertenecer a la shortlist (evita ensuciar con ids random)
        if (propiedad_id != null) {
          const { data: item } = await supabase
            .from('broker_shortlist_items')
            .select('id').eq('shortlist_id', sl.id).eq('propiedad_id', propiedad_id).maybeSingle()
          if (item) shortlist_id = sl.id
        } else {
          shortlist_id = sl.id
        }

        const tel = sl.cliente_telefono ? normalizePhone(sl.cliente_telefono) : null
        if (tel) {
          const { data: c } = await supabase
            .from('simon_contactos').select('id').eq('telefono', tel).maybeSingle<{ id: string }>()
          contacto_id = c?.id ?? null
        }
      }
    }

    // Dedup corto: mismo destino/propiedad en los últimos 30s → no duplicar la métrica.
    if (propiedad_id != null) {
      const desde = new Date(Date.now() - 30_000).toISOString()
      const { data: reciente } = await supabase
        .from('wa_clicks')
        .select('id')
        .eq('propiedad_id', propiedad_id)
        .eq('origen', origen)
        .gte('created_at', desde)
        .limit(1)
      if (reciente && reciente.length > 0) return res.status(204).end()
    }

    await supabase.from('wa_clicks').insert({
      propiedad_id,
      tipo_operacion,
      origen,
      shortlist_id,
      contacto_id,
      destino_telefono: destino,
      destino_es_simon: destino === SIMON_WA,
      user_agent: userAgent || null,
      es_bot: esBotUA(userAgent),
      es_test: body.es_test === true || esDemo,
    })

    return res.status(204).end()
  } catch (err) {
    // Nunca romper el flujo del usuario por un fallo de métrica.
    console.error('[api/public/wa-click]', err)
    return res.status(204).end()
  }
}
