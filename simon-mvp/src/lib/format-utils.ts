/**
 * Format utilities for displaying property data
 */

/**
 * Format dormitorios count for display
 * Converts 0 to "Mono"/"Monoambiente" instead of showing "0"
 */
export const formatDorms = (
  dorms: number | string | null | undefined,
  formato: 'largo' | 'corto' = 'corto'
): string => {
  const num = typeof dorms === 'string' ? parseInt(dorms) : dorms
  if (num === null || num === undefined || isNaN(num as number)) return 'Todos'
  if (num === 0) return formato === 'largo' ? 'Monoambiente' : 'Mono'
  if (formato === 'largo') return num === 1 ? '1 dormitorio' : `${num} dormitorios`
  return num === 1 ? '1 dorm' : `${num} dorms`
}

/**
 * Format number without decimals
 */
export const formatNum = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '-'
  return Math.round(n).toLocaleString('es-BO')
}

/**
 * Simple dorm label for alquiler cards/maps
 * 0 → 'Estudio', null → '—', n → 'n dorm'
 */
export function dormLabel(d: number | null | undefined): string {
  if (d === null || d === undefined) return '—'
  return d === 0 ? 'Estudio' : d + ' dorm'
}

/**
 * Format price in Bolivianos: 'Bs 5.000'
 */
export function formatPriceBob(p: number | null | undefined): string {
  if (!p) return '—'
  return 'Bs ' + p.toLocaleString('es-BO')
}

/**
 * Format price in USD: '$85,000'
 */
export function formatPriceUSD(p: number | null | undefined): string {
  if (!p) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(p)
}
