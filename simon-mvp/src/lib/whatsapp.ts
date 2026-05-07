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
