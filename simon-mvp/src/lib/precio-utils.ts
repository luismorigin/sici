/**
 * Normalización de precio USD para propiedades con TC paralelo.
 *
 * Propiedades con tipo_cambio_detectado = 'paralelo' tienen precio_usd en USD físicos.
 * Para compararlas con propiedades a TC oficial, se normaliza:
 *   precio_usd × tc_paralelo / 6.96
 */

export const TC_OFICIAL = 6.96

export function normalizarPrecio(
  precioUsd: number,
  tcDetectado: string | null,
  tcParalelo: number
): number {
  if (tcDetectado === 'paralelo' && tcParalelo > 0) {
    return Math.round(precioUsd * tcParalelo / TC_OFICIAL)
  }
  return precioUsd
}
