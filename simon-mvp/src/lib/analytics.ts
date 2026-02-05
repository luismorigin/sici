// Google Analytics Event Tracking
// ID: G-Q8CRRJD6SL

export const GA_ID = 'G-Q8CRRJD6SL'

// Tipos de eventos
type EventName =
  | 'landing_view'
  | 'filtros_started'
  | 'formulario_completed'
  | 'resultados_view'
  | 'premium_requested'

interface EventParams {
  [key: string]: string | number | boolean | undefined
}

// Enviar evento a Google Analytics
export function trackEvent(eventName: EventName, params?: EventParams) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params)
  }
}

// Declarar gtag en window para TypeScript
declare global {
  interface Window {
    gtag: (
      command: 'event' | 'config' | 'js',
      targetId: string | Date,
      params?: Record<string, unknown>
    ) => void
    dataLayer: unknown[]
  }
}
