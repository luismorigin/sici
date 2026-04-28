// Modo demo: detectores y sanitizadores server-side.
//
// La protección REAL contra extracción de captadores es server-side: nunca
// mandar agente_nombre/telefono/whatsapp al cliente cuando estamos en modo
// demo. Cualquier protección puramente CSS/JSX es bypasseable con DevTools
// inspeccionando window.__NEXT_DATA__. Por eso esta capa corre en
// getServerSideProps ANTES de hidratar React.
//
// Convención del MVP: el broker dueño de la propiedad sigue visible
// (agente_oficina = "Remax", "Century 21") porque es info pública en los
// portales originales. Lo que se protege es la identidad individual del
// captador y su canal directo de contacto (nombre + teléfono + whatsapp).

import { DEMO_BROKER_SLUG, DEMO_SHORTLIST_HASH } from './demo-config'
import type { UnidadVenta, UnidadAlquiler } from './supabase'

export function isDemoBrokerSlug(slug: string | null | undefined): boolean {
  return slug === DEMO_BROKER_SLUG
}

export function isDemoShortlistHash(hash: string | null | undefined): boolean {
  return hash === DEMO_SHORTLIST_HASH
}

/**
 * Quita identidad individual del captador en modo demo. Mantiene
 * agente_oficina (agencia genérica) — eso ya es público en los portales.
 *
 * Aplicar SIEMPRE server-side antes de pasar a `initialProperties` /
 * `publicShare.items`. Si se aplica solo en render, la data viaja en el
 * JSON hidratado y un broker prospect con DevTools la extrae.
 */
export function sanitizeUnidadVentaForDemo(u: UnidadVenta): UnidadVenta {
  return {
    ...u,
    agente_nombre: null,
    agente_telefono: null,
    agente_oficina: u.agente_oficina, // se mantiene
  }
}

export function sanitizeUnidadAlquilerForDemo(u: UnidadAlquiler): UnidadAlquiler {
  return {
    ...u,
    agente_nombre: null,
    agente_telefono: null,
    agente_whatsapp: null,
  }
}

export function sanitizeVentasArrayForDemo(arr: UnidadVenta[]): UnidadVenta[] {
  return arr.map(sanitizeUnidadVentaForDemo)
}

export function sanitizeAlquileresArrayForDemo(arr: UnidadAlquiler[]): UnidadAlquiler[] {
  return arr.map(sanitizeUnidadAlquilerForDemo)
}
