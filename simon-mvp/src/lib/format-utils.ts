/**
 * Format utilities for displaying property data
 */

import { displayZona } from './zonas'

// Palabras que delatan que el "nombre_edificio" es en realidad una frase del
// aviso (basura del extractor), no el nombre real del edificio. Ej:
// "EXCELENTE UBICACION", "Venta Av Beni", "Moderno Con Excelentes".
const NOMBRE_EDIFICIO_BASURA = /\b(venta|alquiler|excelente|ubicaci|ubicad|amplio|hermoso|moderno|exclusivo|c[oó]modo|departamento|monoambiente|dormitorio|vecinos|amenidades|oportunidad|estrenar|ideal|avenida)\b/i

/**
 * Nombre a mostrar para una unidad de alquiler.
 * 1) nombre_proyecto (proyecto matcheado — confiable)
 * 2) nombre_edificio SOLO si parece nombre real (filtra basura del extractor)
 * 3) genérico "Monoambiente · <microzona>" / "Depto N dorm · <microzona>"
 */
export function nombreAlquiler(p: {
  nombre_proyecto?: string | null
  nombre_edificio?: string | null
  dormitorios?: number | null
  zona?: string | null
}): string {
  if (p.nombre_proyecto?.trim()) return p.nombre_proyecto.trim()
  const ne = p.nombre_edificio?.trim()
  if (ne && ne.length > 3 && !NOMBRE_EDIFICIO_BASURA.test(ne)) return ne
  const tipo =
    p.dormitorios === 0 ? 'Monoambiente'
    : (typeof p.dormitorios === 'number' && p.dormitorios > 0) ? `Depto ${p.dormitorios} dorm`
    : 'Departamento'
  const zona = displayZona(p.zona)
  return zona && zona !== 'Otras' ? `${tipo} · ${zona}` : tipo
}

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

// "Abel Antonio Flores Nava" → "Abel". Usado en saludos de WhatsApp del cliente
// al broker para que no suenen robóticos. Edge case: nombres compuestos como
// "María José" pierden el "José" — bajo impacto. Migrable a columnas separadas
// (nombre_pila/apellido) en simon_brokers más adelante.
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full
}
