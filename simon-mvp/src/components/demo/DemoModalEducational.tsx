// Modal educativo del modo demo. Aparece cuando el broker prospect intenta
// una acción protegida (contactar captador, enviar shortlist, marcar
// favorito desde /broker/demo) o desde watermarks/CTAs explícitos.
//
// Cada apertura registra un evento GA4 `demo_action_blocked` o
// `demo_cta_activate` con el contexto, para medir intenciones de
// activación en el funnel de prospección.
//
// El CTA primary abre WhatsApp del founder con un mensaje pre-armado
// específico al contexto. El secondary cierra el modal sin acción.

import { useEffect } from 'react'
import { buildWhatsAppURL } from '@/lib/whatsapp'
import {
  FOUNDER_WHATSAPP,
  getDemoCTAMessage,
  type DemoCTAContext,
} from '@/lib/demo-config'

export interface DemoModalEducationalProps {
  isOpen: boolean
  onClose: () => void
  context: DemoCTAContext
  /** Título corto, normalmente arrancando con un emoji 🔒. */
  title: string
  /** Cuerpo en 1-2 frases, en tono educativo (no promocional). */
  body: string
  /** Texto del CTA primary. Default: "Activar mi cuenta". */
  primaryLabel?: string
  /** Texto del CTA secondary. Default: "Cerrar". */
  secondaryLabel?: string
  /**
   * Override del CTA primary. Si se provee, reemplaza el default
   * (que abre WA del founder) con un handler custom. Útil cuando el
   * primary no es "activar cuenta" sino otra acción demo (ej. ver
   * ejemplo de shortlist en /b/demo).
   */
  customPrimary?: {
    label: string
    onClick: () => void
  }
  /**
   * Footer extra opcional debajo de los botones — link sutil con CTA
   * complementario. Útil cuando customPrimary toma el primary slot pero
   * queremos mantener la opción de "Activá tu cuenta" disponible.
   */
  footerLink?: {
    label: string
    onClick: () => void
  }
}

export default function DemoModalEducational({
  isOpen,
  onClose,
  context,
  title,
  body,
  primaryLabel = 'Activar mi cuenta',
  secondaryLabel = 'Cerrar',
  customPrimary,
  footerLink,
}: DemoModalEducationalProps) {
  useEffect(() => {
    if (!isOpen) return
    if (typeof window === 'undefined') return
    type Gtag = (cmd: 'event', name: string, params: Record<string, unknown>) => void
    const gtag = (window as unknown as { gtag?: Gtag }).gtag
    if (typeof gtag === 'function') {
      const eventName = context.startsWith('watermark_') ? 'demo_cta_activate' : 'demo_action_blocked'
      gtag('event', eventName, { demo_context: context })
    }
  }, [isOpen, context])

  if (!isOpen) return null

  const waUrl = buildWhatsAppURL(FOUNDER_WHATSAPP, getDemoCTAMessage(context))

  const handlePrimary = () => {
    if (typeof window !== 'undefined') {
      type Gtag = (cmd: 'event', name: string, params: Record<string, unknown>) => void
      const gtag = (window as unknown as { gtag?: Gtag }).gtag
      if (typeof gtag === 'function') {
        gtag('event', 'demo_cta_click', { demo_context: context })
      }
    }
    if (customPrimary) {
      customPrimary.onClick()
      return
    }
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  const effectivePrimaryLabel = customPrimary ? customPrimary.label : primaryLabel

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-modal-title"
      style={{ zIndex: 2147483646 }}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 id="demo-modal-title" className="text-lg font-semibold text-gray-900 mb-3">
            {title}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed mb-6">
            {body}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handlePrimary}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors"
            >
              {effectivePrimaryLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              {secondaryLabel}
            </button>
          </div>
          {footerLink && (
            <div className="mt-4 text-center text-sm">
              <button
                type="button"
                onClick={footerLink.onClick}
                className="text-gray-600 hover:text-gray-900 underline underline-offset-4"
              >
                {footerLink.label}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
