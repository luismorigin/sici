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
