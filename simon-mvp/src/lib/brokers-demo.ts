// Config temporal de brokers para S1 del MVP Simon Broker.
// Reemplazar por tabla BD 'brokers' cuando haya auth real (v2).
// Ver docs/broker/PRD.md

export interface Broker {
  slug: string
  nombre: string
  telefono: string
  foto_url: string | null
}

export const BROKERS_DEMO: Record<string, Broker> = {
  demo: {
    slug: 'demo',
    nombre: 'Demo Broker',
    telefono: '+59170000000',
    foto_url: null,
  },
}

export function getBrokerBySlug(slug: string | null | undefined): Broker | null {
  if (!slug) return null
  return BROKERS_DEMO[slug] || null
}

export function isValidBrokerSlug(slug: string | null | undefined): boolean {
  return getBrokerBySlug(slug) !== null
}
