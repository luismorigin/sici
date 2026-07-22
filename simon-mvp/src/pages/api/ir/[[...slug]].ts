// Link puente: registra de dónde viene la visita y redirige a WhatsApp.
//
//   GET /ir/f03                                  ← forma corta, la que va en el caption
//   GET /ir?p=id03&s=facebook&m=organic&o=bio    ← forma larga (links de bio)
//
// El problema que resuelve: los captions mandan a wa.me directo, y un UTM en
// wa.me no registra nada (no es nuestro dominio). Pasando por acá, el click
// queda registrado antes del salto.
//
// ⚠️ POR QUÉ NO SE USA GA4 ACÁ (contradicción del pedido original, ver
// docs/backlog/MEDICION_FUNNEL_PLAN.md §Paso 2): un 302 server-side NO ejecuta
// JavaScript, así que gtag nunca dispara — y en este sitio GA carga con
// `strategy="lazyOnload"`, más tarde todavía. Un endpoint que redirige en <300ms
// jamás va a registrar nada en GA4 por la vía del browser. El registro va a
// Supabase, que además permite JOIN con las piezas y con los leads.
//
// Se rutea desde /ir/* con un rewrite en next.config.js.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SIMON_WHATSAPP = process.env.SIMON_WHATSAPP || '59177066308'
const WA_BASE = `https://wa.me/${SIMON_WHATSAPP}`

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Crawlers que piden el link para armar la tarjeta de preview. Si no se filtran,
// cada vez que alguien comparte el link se cuenta un "click" que nadie hizo.
// Misma lección que leads_alquiler.es_bot, aplicada antes de ensuciar el dato.
const BOT_PATTERNS = [
  'facebookexternalhit', 'facebot', 'facebookbot', 'meta-externalagent',
  'whatsapp', 'telegrambot', 'twitterbot', 'slackbot', 'discordbot',
  'linkedinbot', 'bingbot', 'googlebot', 'applebot', 'bot', 'crawler', 'spider',
  'preview', 'headlesschrome',
]
const esBot = (ua: string) => {
  const s = ua.toLowerCase()
  return BOT_PATTERNS.some(p => s.includes(p))
}

const REDES: Record<string, string> = { f: 'facebook', i: 'instagram', t: 'tiktok', m: 'meta' }

// ---------------------------------------------------------------------------
// Mapa num → nombre de pieza, cacheado en memoria.
// Se lee de mkt_piezas (fuente de verdad) en vez de hardcodear la tabla, pero
// se cachea porque el redirect tiene que ser rápido: un roundtrip a la BD por
// click, solo para armar el texto, no se justifica.
// ---------------------------------------------------------------------------
let cachePiezas: Map<number, string> | null = null
let cacheVence = 0
const CACHE_TTL = 60 * 60 * 1000 // 1h

async function getPiezas(): Promise<Map<number, string>> {
  if (cachePiezas && Date.now() < cacheVence) return cachePiezas
  if (!supabaseUrl || !supabaseServiceKey) return cachePiezas || new Map()
  try {
    const sb = createClient(supabaseUrl, supabaseServiceKey)
    const { data, error } = await sb.from('mkt_piezas').select('num, nombre')
    if (error || !data) return cachePiezas || new Map()
    cachePiezas = new Map(data.map((p: { num: number; nombre: string }) => [p.num, p.nombre]))
    cacheVence = Date.now() + CACHE_TTL
    return cachePiezas
  } catch {
    return cachePiezas || new Map()
  }
}

/**
 * Nunca deja que un registro lento retrase al usuario. Se prefiere perder el dato antes que la visita.
 *
 * Recibe `PromiseLike` y no `Promise` a propósito: el query builder de supabase-js es un
 * **thenable** — tiene `.then()` pero NO `.catch()`. Pasarlo como Promise compila pero
 * revienta en runtime con "p.catch is not a function", y como el handler atrapa todo y
 * redirige igual, el fallo es SILENCIOSO: la persona llega a WhatsApp sin el texto y el
 * click no se registra. `Promise.resolve()` lo normaliza a una Promise de verdad.
 */
function conTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(p).catch(() => null),
    new Promise<null>(r => setTimeout(() => r(null), ms)),
  ])
}

const primero = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) || ''

interface Origen {
  codigo: string | null
  piezaNum: number | null
  red: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
}

/** `f03` → facebook + pieza 3. Devuelve null si no tiene la forma esperada. */
function parsearCodigo(codigo: string): { red: string; piezaNum: number } | null {
  const m = /^([fitm])(\d{1,3})$/i.exec(codigo.trim())
  if (!m) return null
  const red = REDES[m[1].toLowerCase()]
  const piezaNum = parseInt(m[2], 10)
  if (!red || !Number.isFinite(piezaNum)) return null
  return { red, piezaNum }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Cualquier fallo termina en WhatsApp igual: el objetivo es que la persona
  // llegue a escribir. Perder el registro es aceptable; perder el lead no.
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      return res.status(405).send('Method not allowed')
    }

    const ua = String(req.headers['user-agent'] || '')

    // Bots: redirigir sin registrar ni tocar la BD.
    if (esBot(ua)) return res.redirect(302, WA_BASE)

    const { slug, p, s, m, o } = req.query
    const codigo = Array.isArray(slug) ? slug[0] : (slug as string | undefined) || ''

    const org: Origen = {
      codigo: null, piezaNum: null, red: null,
      utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null,
    }

    if (codigo) {
      // Forma corta: /ir/f03
      org.codigo = codigo.slice(0, 32)
      const parsed = parsearCodigo(codigo)
      if (parsed) {
        org.red = parsed.red
        org.piezaNum = parsed.piezaNum
        org.utm_source = parsed.red
        org.utm_medium = parsed.red === 'meta' ? 'paid' : 'organic'
      }
    } else if (primero(p)) {
      // Forma larga: /ir?p=id03&s=facebook&m=organic&o=bio
      const pv = primero(p).slice(0, 64)
      org.codigo = pv
      org.red = primero(s).slice(0, 32) || null
      org.utm_source = org.red
      org.utm_medium = primero(m).slice(0, 32) || 'organic'
      org.utm_content = primero(o).slice(0, 100) || null
      const nm = /^id(\d{1,3})$/i.exec(pv)
      if (nm) org.piezaNum = parseInt(nm[1], 10)
    }

    // 2500ms y no 700: en Vercel la PRIMERA lectura de una instancia fría paga
    // cold start + TLS + el viaje a Supabase (sa-east-1) y se pasaba de 700ms.
    // Medido en producción: en frío el nombre se perdía y el click quedaba mal
    // marcado; en caliente resolvía siempre. Con ~230 usuarios/mes la función
    // está fría casi siempre, así que le pasaba a la MAYORÍA de los clicks
    // reales. El cache en memoria hace que este costo se pague una sola vez por
    // instancia; el resto de los clicks no espera nada.
    const piezas = org.piezaNum ? await conTimeout(getPiezas(), 2500) : null
    const nombrePieza = (org.piezaNum && piezas?.get(org.piezaNum)) || null

    // `valido` = el CÓDIGO parseó, no "pude leer el nombre". Son cosas distintas:
    // un /ir/f03 legítimo con la BD lenta no es un caption roto, y marcarlo así
    // ensucia justamente la señal para la que existe la columna (detectar links
    // mal escritos en publicaciones ya publicadas).
    const valido = org.piezaNum !== null

    if (org.piezaNum) {
      org.utm_campaign = nombrePieza
        ? `id${String(org.piezaNum).padStart(2, '0')}-${slugify(nombrePieza)}`
        : `id${String(org.piezaNum).padStart(2, '0')}`
    }

    // El texto precargado es la red de seguridad: deja la marca del origen DENTRO
    // de la conversación, así quien atiende ve de dónde viene sin abrir un panel.
    // Es lo único que sobrevive si el registro falla.
    //
    // Tres niveles, para no quedarnos nunca sin marca de origen:
    //   1. con nombre  → el texto lindo, y `v_atribucion_contactos` lo cruza solo
    //   2. sin nombre pero con código → al menos el código viaja en el mensaje
    //      (si la BD estuvo lenta, antes se perdía TODO el origen)
    //   3. sin código  → wa.me pelado
    const texto = nombrePieza
      ? `Hola Simón, vi tu publicación "${nombrePieza}" y quiero saber más.`
      : org.codigo
        ? `Hola Simón, vengo de tu publicación (${org.codigo}) y quiero saber más.`
        : null
    const destino = texto ? `${WA_BASE}?text=${encodeURIComponent(texto)}` : WA_BASE

    if (supabaseUrl && supabaseServiceKey) {
      const sb = createClient(supabaseUrl, supabaseServiceKey)
      await conTimeout(
        sb.from('mkt_clicks_puente').insert({
          codigo: org.codigo,
          pieza_num: org.piezaNum,
          red: org.red,
          utm_source: org.utm_source,
          utm_medium: org.utm_medium,
          utm_campaign: org.utm_campaign,
          utm_content: org.utm_content,
          valido,
          destino,
          referer: String(req.headers.referer || '').slice(0, 500) || null,
          user_agent: ua.slice(0, 500) || null,
        }),
        800,
      )
    }

    // No cachear: cada visita tiene que llegar al servidor para quedar registrada.
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    return res.redirect(302, destino)
  } catch (e) {
    console.error('[/ir] error, redirigiendo igual:', e)
    return res.redirect(302, WA_BASE)
  }
}

function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
