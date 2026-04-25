/**
 * Fingerprinting de visitantes a /b/[hash] para el cap de vistas únicas
 * (Plan Inicial = 20 por shortlist). Ver docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md.
 *
 * Estrategia primario + fallback:
 *  1. Cookie persistente `sl_visitor_<first8>` (1 año, HttpOnly): identifica
 *     el dispositivo de forma estable. Es el primario porque Tigo/Entel
 *     hacen NAT pesado en Bolivia (20 personas pueden compartir IP), entonces
 *     IP+UA solo da falsos positivos del cap.
 *  2. Si el cliente bloqueó cookies (raro), fallback a sha256(ip+ua+shortlist_id).
 *     El salt con shortlist_id evita correlacionar visitas del mismo dispositivo
 *     entre shortlists distintas — útil si más adelante hacemos analytics y
 *     queremos privacidad cruzada.
 *
 * El nombre de cookie usa los primeros 8 chars del UUID de la shortlist
 * para que un mismo dispositivo abriendo 5 shortlists distintas tenga 5
 * cookies independientes (no se mezclan entre shortlists).
 *
 * Helpers diseñados para usarse desde getServerSideProps de /b/[hash], pero
 * son agnósticos a Next.js (acceden solo a `headers` y `socket` de IncomingMessage).
 */

import { createHash } from 'crypto'
import type { IncomingMessage } from 'http'

/** Extrae IP del cliente respetando X-Forwarded-For (Vercel/proxies). */
export function getClientIP(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  if (Array.isArray(forwarded)) return forwarded[0]
  return req.socket?.remoteAddress || 'unknown'
}

/** sha256 hex (no truncamos — 64 chars baratos en BD/índices). */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Nombre de cookie por shortlist: `sl_visitor_<first8 del UUID>`. */
export function visitorCookieName(shortlistId: string): string {
  return `sl_visitor_${shortlistId.slice(0, 8)}`
}

/**
 * Devuelve el fingerprint a usar para esta visita.
 *  - Si el visitante ya tiene cookie de esta shortlist → la cookie es el fingerprint.
 *  - Si no → sha256(ip + ua + shortlist_id) como fallback.
 *
 * El segundo retorno indica si se debe setear cookie nueva en la respuesta
 * (es decir, si vino sin cookie). Útil para que el caller decida emitir Set-Cookie.
 */
export function computeFingerprint(
  req: IncomingMessage & { cookies?: Partial<Record<string, string>> },
  shortlistId: string
): { fingerprint: string; isNewVisitor: boolean; ip: string; userAgent: string } {
  const cookieName = visitorCookieName(shortlistId)
  const cookieValue = req.cookies?.[cookieName]
  const ip = getClientIP(req)
  const userAgent = (req.headers['user-agent'] as string | undefined) || ''

  if (cookieValue && typeof cookieValue === 'string' && cookieValue.length > 0) {
    return { fingerprint: cookieValue, isNewVisitor: false, ip, userAgent }
  }

  // Fallback: sha256(ip + ua + shortlist_id). Salt con shortlist_id evita
  // correlacionar visitas del mismo dispositivo entre shortlists distintas.
  const fallback = sha256(`${ip}|${userAgent}|${shortlistId}`)
  return { fingerprint: fallback, isNewVisitor: true, ip, userAgent }
}

/**
 * Construye el header Set-Cookie para persistir el fingerprint 1 año.
 * Atributos:
 *  - HttpOnly: no accesible desde JS (cookie solo para tracking server-side).
 *  - SameSite=Lax: permite que el cliente abra el link desde WhatsApp/email.
 *  - Secure: solo en producción (en dev local HTTPS no está disponible).
 *  - Max-Age=1 año: persistencia larga = uniqueness estable por dispositivo.
 */
export function buildVisitorCookie(shortlistId: string, fingerprint: string): string {
  const name = visitorCookieName(shortlistId)
  const oneYear = 60 * 60 * 24 * 365
  const isProd = process.env.NODE_ENV === 'production'
  const attrs = [
    `${name}=${fingerprint}`,
    `Max-Age=${oneYear}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    isProd ? 'Secure' : '',
  ].filter(Boolean)
  return attrs.join('; ')
}
