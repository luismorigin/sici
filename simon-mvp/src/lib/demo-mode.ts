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
 * Placeholder fake para agente_telefono / agente_whatsapp en demo. Es un
 * número con formato BO válido pero todo ceros tras el código país, así:
 *  - los condicionales `if (p.agente_whatsapp)` siguen siendo truthy →
 *    el botón "Contactar captador" SE RENDERIZA (el broker prospect ve
 *    cómo se vería en producción, que es parte del valor del demo)
 *  - el href construido es `wa.me/59100000000` que NO es un número real,
 *    así que aún si alguien evade los listeners de intercepción y
 *    navegara, no llegaría a un broker real
 *  - el listener global de BrokerDemoOverlay (clicks `a[href*="wa.me"]`)
 *    captura los anchors directos; los `<a href="#" onClick>` que usan
 *    `triggerWhatsAppCapture` se interceptan vía setDemoModeForCapture
 */
const DEMO_FAKE_PHONE = '+59100000000'

/**
 * Reemplaza identidad individual del captador en modo demo. Mantiene
 * agente_oficina (agencia genérica) — eso ya es público en los portales.
 * agente_nombre=null para no mostrar nombre falso, telefono/whatsapp=fake
 * para que el botón siga renderizándose y el broker prospect entienda la
 * UX, con click interceptado por el listener global.
 *
 * Aplicar SIEMPRE server-side antes de pasar a `initialProperties` /
 * `publicShare.items`. Si se aplica solo en render, la data viaja en el
 * JSON hidratado y un broker prospect con DevTools la extrae.
 */
export function sanitizeUnidadVentaForDemo(u: UnidadVenta): UnidadVenta {
  return {
    ...u,
    agente_nombre: null,
    agente_telefono: DEMO_FAKE_PHONE,
    agente_oficina: u.agente_oficina, // se mantiene
  }
}

export function sanitizeUnidadAlquilerForDemo(u: UnidadAlquiler): UnidadAlquiler {
  return {
    ...u,
    agente_nombre: null,
    agente_telefono: DEMO_FAKE_PHONE,
    agente_whatsapp: DEMO_FAKE_PHONE,
  }
}

export function sanitizeVentasArrayForDemo(arr: UnidadVenta[]): UnidadVenta[] {
  return arr.map(sanitizeUnidadVentaForDemo)
}

export function sanitizeAlquileresArrayForDemo(arr: UnidadAlquiler[]): UnidadAlquiler[] {
  return arr.map(sanitizeUnidadAlquilerForDemo)
}
