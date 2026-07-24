// Helpers para construir URLs de WhatsApp y mensajes predeterminados.

/**
 * Limpia un teléfono dejando solo dígitos. Quita +, espacios, guiones.
 * wa.me espera el número completo con código de país sin signos.
 *  '+591 70123456' -> '59170123456'
 */
export function normalizarTelefonoWA(telefono: string): string {
  return telefono.replace(/\D/g, '')
}

/**
 * Construye la URL de WhatsApp con número y mensaje precargados.
 * Funciona tanto en mobile (abre app) como desktop (abre WhatsApp Web).
 *
 * @param telefono - con o sin signos, código de país incluido
 * @param mensaje - texto a precargar (se url-encodea)
 */
export function buildWhatsAppURL(telefono: string, mensaje: string): string {
  const numero = normalizarTelefonoWA(telefono)
  const texto = encodeURIComponent(mensaje)
  return `https://wa.me/${numero}?text=${texto}`
}

// ============================================================================
// WhatsApp Window Manager — deep link directo, sin pestaña intermedia
// ----------------------------------------------------------------------------
// LIMITACIONES INVESTIGADAS (mayo 2026):
//  1. window.close() cross-origin está BLOQUEADO por COOP de WhatsApp Web.
//     Una vez que la pestaña navega a wa.com, no podemos cerrarla por JS.
//  2. window.open(url, 'named') NO reusa la pestaña porque WhatsApp aplica
//     COOP same-origin que rompe el name-binding entre browsing context groups.
//     Cada window.open abre una pestaña nueva sin importar el nombre.
//  3. Por estas razones, Remax/InfoCasas tienen pestañas que se acumulan —
//     no es elección de UX, es limitación del modelo de seguridad web.
//
// SOLUCIÓN APLICADA:
// Disparar el esquema custom `whatsapp://` vía anchor click invisible. El
// browser intercepta el click → si hay handler registrado (app instalada),
// el OS abre la app SIN abrir pestaña en el browser. Si no hay handler, el
// click falla silenciosamente y nuestro fallback (timer de 1.5s + detección
// de blur) abre la pestaña api.whatsapp.com/send como hace Remax.
//
// La primera vez en cada browser, Chrome puede pedir permiso "¿Permitir que
// [sitio] abra WhatsApp?". El user marca "Permitir + recordar" y no vuelve
// a aparecer.
// ============================================================================

function _isMobileLike(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches
  }
  return 'ontouchstart' in window && (navigator.maxTouchPoints ?? 0) > 0
}

function _buildApiUrl(telefono: string, mensaje: string): string {
  const numero = normalizarTelefonoWA(telefono)
  const texto = encodeURIComponent(mensaje)
  return `https://api.whatsapp.com/send/?phone=${numero}&text=${texto}&type=phone_number&app_absent=0`
}

function _buildAppDeepLink(telefono: string, mensaje: string): string {
  const numero = normalizarTelefonoWA(telefono)
  const texto = encodeURIComponent(mensaje)
  return `whatsapp://send?phone=${numero}&text=${texto}`
}

/**
 * Dispara el esquema whatsapp:// vía anchor click invisible. No abre pestaña.
 * Devuelve después de armar el dispatch — la detección de éxito/falla la
 * hace el caller con un timer + listener de blur.
 */
function _dispatchAppDeepLink(deepLink: string): void {
  const a = document.createElement('a')
  a.href = deepLink
  a.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0'
  document.body.appendChild(a)
  a.click()
  // Pequeña demora antes de remover para que el browser procese el click
  setTimeout(() => { try { a.remove() } catch { /* ignore */ } }, 100)
}

function _openFallbackTab(telefono: string, mensaje: string): void {
  const url = _buildApiUrl(telefono, mensaje)
  const opened = window.open(url, '_blank')
  if (!opened) window.location.href = url
}

/**
 * Abre WhatsApp para un teléfono + mensaje.
 *
 * Desktop: dispara el esquema `whatsapp://` para abrir la app nativa sin
 * pestaña intermedia. Si la app no responde en ~1.5s (no instalada o
 * permiso del browser denegado), abre `api.whatsapp.com/send/...` en pestaña
 * nueva como fallback.
 *
 * Mobile: usa wa.me con _blank — el OS intercepta el intent y abre la app
 * de WhatsApp móvil. Comportamiento nativo, sin cambios.
 *
 * @param telefono - con o sin signos, código de país incluido
 * @param mensaje - texto a precargar (se url-encodea)
 */
export interface WaClickCtx {
  /** Desde dónde: 'feed' | 'sheet' | 'compare' | 'mapa' | 'shortlist' … */
  origen?: string
  propiedad_id?: number | null
  tipo_operacion?: 'venta' | 'alquiler' | null
}

/**
 * Beacon del INTENTO DE CONTACTO (mig 299 · tabla wa_clicks). Alimenta la métrica
 * "contactos de WhatsApp por semana", que hasta ahora solo registraba 1 de 4
 * superficies (el modal del feed de alquiler) — las shortlists, que son las de
 * MÁS engagement del sitio, no dejaban rastro.
 *
 * Va acá adentro (y no en los ~39 call-sites de openWhatsApp) para que TODA
 * superficie quede cubierta sin tocarlas una por una. El `hash` de la shortlist
 * se deduce de la URL (`/b/<hash>`) → el server resuelve de QUIÉN es el clic sin
 * pedirle nada al usuario.
 *
 * `keepalive` es lo que lo hace funcionar: el request sobrevive a que la pestaña
 * navegue a WhatsApp. Nunca lanza — una métrica jamás debe romper el contacto.
 */
function _registrarWaClick(telefono: string, ctx?: WaClickCtx): void {
  try {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return
    const m = window.location.pathname.match(/^\/b\/([A-Za-z0-9_-]+)/)
    const hash = m?.[1] ?? undefined
    const esDebug = new URLSearchParams(window.location.search).get('debug') === '1'
    fetch('/api/public/wa-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        origen: ctx?.origen || (hash ? 'shortlist' : 'feed'),
        propiedad_id: ctx?.propiedad_id ?? null,
        tipo_operacion: ctx?.tipo_operacion ?? null,
        destino_telefono: telefono,
        hash,
        es_test: esDebug,
      }),
    }).catch(() => {})
  } catch { /* nunca romper el flujo del usuario */ }
}

export function openWhatsApp(telefono: string, mensaje: string, ctx?: WaClickCtx): void {
  if (typeof window === 'undefined') return

  _registrarWaClick(telefono, ctx)

  if (_isMobileLike()) {
    const mobileUrl = buildWhatsAppURL(telefono, mensaje)
    const opened = window.open(mobileUrl, '_blank')
    if (!opened) window.location.href = mobileUrl
    return
  }

  // Desktop: intentar app nativa via deep link
  const deepLink = _buildAppDeepLink(telefono, mensaje)

  let appDetected = false
  const onSignal = () => { appDetected = true }
  // blur dispara cuando el OS pasa foco a la app de WA (caso típico)
  window.addEventListener('blur', onSignal, { once: true })
  // visibilitychange complementa para casos donde blur no se dispara
  const onVis = () => { if (document.hidden) appDetected = true }
  document.addEventListener('visibilitychange', onVis)

  _dispatchAppDeepLink(deepLink)

  setTimeout(() => {
    window.removeEventListener('blur', onSignal)
    document.removeEventListener('visibilitychange', onVis)
    if (!appDetected) {
      // App no respondió → fallback a pestaña con api.whatsapp.com
      _openFallbackTab(telefono, mensaje)
    }
  }, 1500)
}

/**
 * Pre-abre pestaña de WhatsApp DENTRO del click handler, antes de cualquier
 * `await`. Necesario en flujos async (ej: ShortlistSendModal) porque iOS
 * Safari/Chrome bloquean `window.open` post-await.
 *
 * Para el path desktop con deep link, esta función NO abre pestaña — solo
 * la abre en mobile (donde el flujo siempre fue pestaña + intent).
 *
 * NOTA: como desktop dispara `whatsapp://` (no abre pestaña), no hay user
 * gesture que preservar. El anchor click se hace post-await directo.
 */
let _mobilePreparedRef: Window | null = null

export function prepareWhatsAppWindow(): void {
  if (typeof window === 'undefined') return
  if (_isMobileLike()) {
    _mobilePreparedRef = window.open('', '_blank')
  }
  // Desktop: no-op. El deep link no requiere pestaña pre-abierta.
}

/**
 * Navega/abre la URL final de WhatsApp después del await del flujo modal.
 *
 * Mobile: navega la pestaña pre-abierta a wa.me para que el OS dispare intent.
 * Desktop: extrae phone + texto de la URL y delega a openWhatsApp para usar
 * el flujo de deep link directo.
 */
export function commitWhatsAppWindow(whatsappUrl: string): void {
  if (typeof window === 'undefined') return

  if (_isMobileLike()) {
    if (_mobilePreparedRef && !_mobilePreparedRef.closed) {
      try {
        _mobilePreparedRef.location.href = whatsappUrl
      } catch {
        window.open(whatsappUrl, '_blank')
      }
      _mobilePreparedRef = null
    } else {
      const opened = window.open(whatsappUrl, '_blank')
      if (!opened) window.location.href = whatsappUrl
    }
    return
  }

  // Desktop: parsear phone + text de la URL recibida y usar el flujo deep link.
  // Acepta wa.me/<phone>?text=X o api.whatsapp.com/send?phone=X&text=Y formats.
  const parsed = _parsePhoneAndText(whatsappUrl)
  if (parsed) {
    openWhatsApp(parsed.phone, parsed.text)
  } else {
    // Si no pudimos parsear (formato inesperado), abrir pestaña como fallback.
    const opened = window.open(whatsappUrl, '_blank')
    if (!opened) window.location.href = whatsappUrl
  }
}

function _parsePhoneAndText(url: string): { phone: string; text: string } | null {
  try {
    const waMeMatch = url.match(/^https:\/\/wa\.me\/(\d+)(?:\?text=(.*))?$/)
    if (waMeMatch) {
      return { phone: waMeMatch[1], text: decodeURIComponent(waMeMatch[2] || '') }
    }
    const u = new URL(url)
    if (u.hostname.endsWith('whatsapp.com')) {
      const phone = u.searchParams.get('phone') || ''
      const text = u.searchParams.get('text') || ''
      if (phone) return { phone, text }
    }
  } catch { /* fall through */ }
  return null
}

/**
 * Reset interno para tests. NO usar en código de producción.
 * @internal
 */
export function _resetWindowManagerForTests(): void {
  _mobilePreparedRef = null
}

/**
 * Mensaje predeterminado para shortlist enviada al cliente.
 * El broker puede editarlo antes de enviar.
 */
export function defaultShortlistMessage(opts: {
  clienteNombre: string
  brokerNombre: string
  shortlistUrl: string
  cantidadPropiedades: number
}): string {
  const { clienteNombre, brokerNombre, shortlistUrl, cantidadPropiedades } = opts
  const plural = cantidadPropiedades === 1 ? 'propiedad' : 'propiedades'
  return `Hola ${clienteNombre}, te preparé una selección de ${cantidadPropiedades} ${plural} en Equipetrol que cumplen lo que buscamos. Te dejo el link para que las veas con calma. Cualquier duda me avisás.

${shortlistUrl}

— ${brokerNombre}`
}

/**
 * Variante de defaultShortlistMessage SIN URL — se usa en editores donde el
 * link va en un bloque inmutable separado (modal de creación de shortlist).
 * El helper buildShortlistWAMessage anexa la URL al final cuando se envía.
 */
export function defaultShortlistMessageBody(opts: {
  clienteNombre: string
  brokerNombre: string
  cantidadPropiedades: number
}): string {
  const { clienteNombre, brokerNombre, cantidadPropiedades } = opts
  const plural = cantidadPropiedades === 1 ? 'propiedad' : 'propiedades'
  return `Hola ${clienteNombre}, te preparé una selección de ${cantidadPropiedades} ${plural} en Equipetrol que cumplen lo que buscamos. Te dejo el link para que las veas con calma. Cualquier duda me avisás.

— ${brokerNombre}`
}

/**
 * Construye el mensaje final de WhatsApp para una shortlist garantizando que la URL
 * pública esté presente. Cubre el caso donde el broker editó el textarea y borró
 * (a propósito o por accidente) el placeholder/URL.
 *
 * - Si no hay mensaje custom → usa el default (que ya incluye la URL).
 * - Si hay mensaje custom y ya incluye la URL → lo respeta tal cual.
 * - Si hay mensaje custom sin la URL → la anexa al final con doble salto.
 *
 * Usado en: creación inicial (useBrokerShortlists), reenvío desde panel
 * (ShortlistsPanel) y reenvío desde pantalla detalle (broker/[slug]/shortlists/[id]).
 */
export function buildShortlistWAMessage(opts: {
  customMessage?: string | null
  clienteNombre: string
  brokerNombre: string
  shortlistUrl: string
  cantidadPropiedades: number
}): string {
  const { customMessage, shortlistUrl } = opts
  if (!customMessage || !customMessage.trim()) {
    return defaultShortlistMessage({
      clienteNombre: opts.clienteNombre,
      brokerNombre: opts.brokerNombre,
      shortlistUrl,
      cantidadPropiedades: opts.cantidadPropiedades,
    })
  }
  if (customMessage.includes(shortlistUrl)) return customMessage
  return `${customMessage.trim()}\n\n${shortlistUrl}`
}
