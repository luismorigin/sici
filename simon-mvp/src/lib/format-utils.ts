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
 * Etiqueta de tipología de UNA propiedad, para TEXTO CORRIDO. Devuelve `null` cuando no se sabe,
 * para que el llamador **omita el segmento entero** (`zona · 241m²` en vez de `zona · — · 241m²`).
 *
 * Hay tres formateadores de dormitorios y cada uno existe por un motivo distinto:
 *   · `formatDorms()`     → 'Todos' para null. Es de los FILTROS ("todos los dormitorios").
 *   · `dormLabel()`       → '—' para null. Es de las TABLAS (una celda necesita relleno).
 *   · `dormLabelOrNull()` → null. Es de los TEXTOS, donde lo que no se sabe no se escribe.
 * Usar el equivocado es lo que produce un guión suelto en medio de una frase, o peor, un dato
 * inventado.
 *
 * 🔑 NUNCA convertir null a 0 antes de mostrar. `0` es una AFIRMACIÓN ("es monoambiente"),
 * no una ausencia. Contrato del frontend shadow: null = "no sé", y lo que no se sabe no se
 * muestra. Caso real (27-jul-2026): el penthouse 8000223 —241 m², $375.000, piso 16— salía
 * como "Mono" en el feed porque `/api/ventas` hacía `?? 0`; su aviso solo dice "DEPARTAMENTO
 * PISO 16, PROYECTO STRATTO UP". Y el daño no era la etiqueta: el chip fiduciario comparaba
 * ese penthouse contra el mercado de monoambientes y concluía "más caro que similares".
 */
export const dormLabelOrNull = (
  dorms: number | null | undefined,
  formato: 'largo' | 'corto' | 'numero' = 'corto'
): string | null => {
  if (dorms === null || dorms === undefined || Number.isNaN(dorms)) return null
  if (dorms === 0) return formato === 'largo' ? 'Monoambiente' : formato === 'numero' ? 'Mono' : 'Mono'
  if (formato === 'numero') return String(dorms)
  if (formato === 'largo') return dorms === 1 ? '1 dormitorio' : `${dorms} dormitorios`
  return `${dorms} dorm`
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
  return d === 0 ? 'Mono' : d + ' dorm'
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

// ── ÁREA — el aviso puede no informarla, y eso NO es cero ────────────────────
// Los mappers de los feeds hacen `parseFloat(p.area_m2) || 0`, así que "no lo
// sabemos" llega como 0. Interpolarlo directo imprime "0 m²", que es AFIRMAR un
// dato falso — y en los mensajes de WhatsApp se lo afirma al captador.
// 🔑 El bot ya se comporta bien: sus RPC devuelven el área tal cual, sin COALESCE,
//    así que un aviso sin dato le llega como `null`. Esto hace que el front haga
//    lo mismo. Medido el 31-ago: 28 avisos activos no informan área — ni el portal
//    ni el texto la traen, no hay nada que extraer.
// ⚠️ NUNCA escribir `${Math.round(x.area_m2)}m²` a mano. Usar estos dos.

/** "45m²" cuando se sabe · "" cuando no. Para JSX suelto. */
export function areaTxt(a?: number | null): string {
  return a && a > 0 ? `${Math.round(a)}m²` : ''
}

/** "45m² · " cuando se sabe · "" cuando no. El separador va ADENTRO para no
 *  dejar " ·  · " colgando cuando falta el dato. */
export function areaCon(a: number | null | undefined, sep: string): string {
  return a && a > 0 ? `${Math.round(a)}m²${sep}` : ''
}
