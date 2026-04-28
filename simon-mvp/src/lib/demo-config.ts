// Modo demo: configuración compartida entre /b/demo (Demo Cliente) y
// /broker/demo (Demo Broker, Sprint 2).
//
// Slugs/hashes "demo" son reservados — la migración 236 crea las rows
// reales en simon_brokers y broker_shortlists con esos identificadores.
// Los detectores en demo-mode.ts comparan contra estas constantes para
// activar bypass de gates, sanitización y modales educativos.

export const DEMO_BROKER_SLUG = 'demo'
export const DEMO_SHORTLIST_HASH = 'demo'

// WhatsApp del founder para CTAs de "Activar mi cuenta". Override via env
// para no hardcodear en código compilado. Default: Luis Medina.
export const FOUNDER_WHATSAPP =
  process.env.NEXT_PUBLIC_FOUNDER_WHATSAPP || '+59176308808'

// Broker placeholder visible en /b/demo. El nombre [Tu Nombre] es literal
// — los corchetes son la pista visual de que el broker prospect ve un
// slot que en producción mostraría su propio nombre.
export const DEMO_BROKER_PLACEHOLDER = {
  slug: DEMO_BROKER_SLUG,
  nombre: '[Tu Nombre]',
  telefono: FOUNDER_WHATSAPP,
  foto_url: null as string | null,
  inmobiliaria: 'Tu Inmobiliaria',
} as const

export const DEMO_SHORTLIST_TITLE = 'Selección demo · Equipetrol'

// Mensajes pre-armados para CTAs de "Activar mi cuenta" según contexto.
// Se concatenan con el WA del founder para abrir chat con prefill.
export type DemoCTAContext =
  | 'wa_broker_b_demo'
  | 'contactar_captador'
  | 'enviar_shortlist'
  | 'guardar_favorito'
  | 'watermark_top'
  | 'watermark_footer'

export function getDemoCTAMessage(context: DemoCTAContext): string {
  switch (context) {
    case 'wa_broker_b_demo':
      return 'Hola, vi la demo de Simón (link cliente) y quiero entender cómo activar mi cuenta para empezar a usarlo con mis clientes.'
    case 'contactar_captador':
      return 'Hola, vi la demo de Simón y quiero acceso a los captadores para coordinar comisión compartida.'
    case 'enviar_shortlist':
      return 'Hola, vi la demo de Simón y quiero empezar a mandar shortlists profesionales a mis clientes.'
    case 'guardar_favorito':
      return 'Hola, vi la demo de Simón y quiero activar mi cuenta para trabajar con favoritos guardados.'
    case 'watermark_top':
    case 'watermark_footer':
      return 'Hola, estuve viendo la demo de Simón y quiero saber cómo activar mi cuenta.'
  }
}
