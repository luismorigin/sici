// Bottom sheet de bienvenida para /b/demo. Aparece auto la primera vez
// (cookie `simon_demo_intro_seen`) y el resto se accede con el botón
// flotante "ⓘ ¿Qué es?" (DemoIntroTrigger). Slide-up desde abajo, no
// fullscreen — el broker prospect ve los thumbnails de la shortlist
// detrás y entiende que es algo real, no un splash bloqueante.
//
// Sin CTA "Activar mi cuenta" intencional: el modal es educativo, el
// botón de activación vive en el watermark del pie y en el modal del
// WA broker. Acá solo "Entendido".

import { useEffect, useRef } from 'react'

export interface DemoIntroBottomSheetProps {
  isOpen: boolean
  onClose: () => void
}

const BULLETS: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: '🎯',
    title: 'Curaduría tuya',
    body: 'Elegís 5–15 propiedades de Equipetrol según el perfil de tu cliente y se las mandás por WhatsApp en un solo link.',
  },
  {
    icon: '👁',
    title: 'Lo que ve tu cliente',
    body: 'Solo lo que vos elegiste, con fotos y datos actualizados. Nunca ve a los captadores originales — vos sos el único contacto.',
  },
  {
    icon: '💱',
    title: 'Precios sin sorpresas',
    body: 'Todo normalizado a tipo de cambio oficial. Datos actualizados diariamente — nunca mandás algo desactualizado, lo verificás vos antes.',
  },
  {
    icon: '❤️',
    title: 'Favoritos + tu WhatsApp',
    body: 'Tu cliente marca lo que le interesa. Vos lo ves en tu panel y respondés por tu WhatsApp.',
  },
]

export default function DemoIntroBottomSheet({ isOpen, onClose }: DemoIntroBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (typeof window === 'undefined') return
    type Gtag = (cmd: 'event', name: string, params: Record<string, unknown>) => void
    const gtag = (window as unknown as { gtag?: Gtag }).gtag
    if (typeof gtag === 'function') {
      gtag('event', 'demo_intro_view', {})
    }
  }, [isOpen])

  // Cerrar con ESC.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  return (
    <>
      <div
        className={`dis-overlay ${isOpen ? 'dis-overlay-open' : ''}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <div
        ref={sheetRef}
        className={`dis-sheet ${isOpen ? 'dis-sheet-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dis-title"
        aria-hidden={!isOpen}
      >
        <div className="dis-handle" aria-hidden="true" />
        <div className="dis-content">
          <h2 id="dis-title" className="dis-title">
            ¿Qué es una shortlist de Simón?
          </h2>
          <p className="dis-subtitle">
            Una selección curada de propiedades que armás para un cliente específico y le mandás por WhatsApp en un solo link.
          </p>

          <ul className="dis-bullets">
            {BULLETS.map((b) => (
              <li key={b.title} className="dis-bullet">
                <span className="dis-bullet-icon" aria-hidden="true">{b.icon}</span>
                <div className="dis-bullet-text">
                  <span className="dis-bullet-title">{b.title}</span>
                  <span className="dis-bullet-body"> — {b.body}</span>
                </div>
              </li>
            ))}
          </ul>

          <button type="button" className="dis-cta" onClick={onClose}>
            Ver la demo
          </button>
        </div>
      </div>

      <style jsx>{`
        .dis-overlay {
          position: fixed;
          inset: 0;
          background: rgba(20, 20, 20, 0.45);
          opacity: 0;
          pointer-events: none;
          transition: opacity 220ms ease;
          z-index: 190;
        }
        .dis-overlay-open {
          opacity: 1;
          pointer-events: auto;
        }
        .dis-sheet {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          background: #fff;
          border-top-left-radius: 20px;
          border-top-right-radius: 20px;
          box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
          transform: translateY(100%);
          transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 200;
          max-height: 85vh;
          overflow-y: auto;
          padding-bottom: env(safe-area-inset-bottom, 16px);
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .dis-sheet-open {
          transform: translateY(0);
        }
        .dis-handle {
          width: 40px;
          height: 4px;
          background: rgba(20, 20, 20, 0.18);
          border-radius: 2px;
          margin: 10px auto 4px;
        }
        .dis-content {
          padding: 16px 22px 24px;
          max-width: 560px;
          margin: 0 auto;
        }
        .dis-title {
          font-family: 'Figtree', system-ui, sans-serif;
          font-size: 22px;
          font-weight: 600;
          color: #141414;
          margin: 8px 0 6px;
          letter-spacing: -0.2px;
        }
        .dis-subtitle {
          font-size: 14px;
          color: rgba(20, 20, 20, 0.6);
          margin: 0 0 20px;
          line-height: 1.45;
        }
        .dis-bullets {
          list-style: none;
          padding: 0;
          margin: 0 0 24px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .dis-bullet {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .dis-bullet-icon {
          font-size: 22px;
          line-height: 1;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .dis-bullet-text {
          font-size: 14px;
          line-height: 1.5;
          color: rgba(20, 20, 20, 0.85);
        }
        .dis-bullet-title {
          font-weight: 600;
          color: #141414;
        }
        .dis-bullet-body {
          color: rgba(20, 20, 20, 0.72);
        }
        .dis-cta {
          width: 100%;
          padding: 14px;
          background: #141414;
          color: #fff;
          border: 0;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: background 160ms ease;
        }
        .dis-cta:hover {
          background: #2a2a2a;
        }
        @media (min-width: 640px) {
          .dis-sheet {
            left: 50%;
            right: auto;
            transform: translate(-50%, 100%);
            width: 560px;
            border-radius: 20px;
            bottom: 24px;
            max-height: 80vh;
          }
          .dis-sheet-open {
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </>
  )
}
