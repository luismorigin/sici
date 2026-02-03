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
