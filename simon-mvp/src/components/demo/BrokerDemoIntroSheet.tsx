// Bottom sheet de bienvenida para /broker/demo. Variante de
// DemoIntroBottomSheet con copy adaptado a la perspectiva del broker
// prospect (qué ve y desbloquea pagando), no del cliente final.
// Cookie distinta (simon_demo_broker_intro_seen) — si vio /b/demo antes
// igual ve éste la primera vez en /broker/demo.

import { useEffect, useRef } from 'react'

export interface BrokerDemoIntroSheetProps {
  isOpen: boolean
  onClose: () => void
}

const BULLETS: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: '🏙',
    title: 'Inventario completo',
    body: 'Todas las propiedades de Equipetrol con datos al día y ACM por unidad (solo ventas) — el mismo feed que ves acá en demo.',
  },
  {
    icon: '🔒',
    title: 'Captadores protegidos',
    body: 'En tu cuenta activa desbloqueas el nombre y WhatsApp del captador original para coordinar comisión compartida.',
  },
  {
    icon: '📤',
    title: 'Shortlists ilimitadas',
    body: 'Curás 5–15 propiedades para un cliente y se las mandás por WhatsApp en un link único con el logo de tu franquicia, tu foto y tu nombre.',
  },
  {
    icon: '📊',
    title: 'Tu panel y métricas',
    body: 'Tu cuenta real te muestra qué propiedades marcó tu cliente, cuántas vistas tiene tu link y qué shortlists están activas.',
  },
]

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Filtrá por la solicitud de tu cliente',
    body: 'Zona, rango de precio, dormitorios, m². Acotá el inventario al perfil específico que estás trabajando.',
  },
  {
    title: 'Marcá las que cumplen',
    body: 'Una a una con la ⭐, o usá "+ Marcar las visibles" arriba para sumar todo lo filtrado de una vez.',
  },
  {
    title: 'Mirá en mapa o enviá la shortlist',
    body: 'Cambiá a vista mapa para ver ubicaciones, o tocá "Enviar shortlist" para ver cómo le llegaría a tu cliente (en demo solo simula).',
  },
]

export default function BrokerDemoIntroSheet({ isOpen, onClose }: BrokerDemoIntroSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (typeof window === 'undefined') return
    type Gtag = (cmd: 'event', name: string, params: Record<string, unknown>) => void
    const gtag = (window as unknown as { gtag?: Gtag }).gtag
    if (typeof gtag === 'function') {
      gtag('event', 'demo_broker_intro_view', {})
    }
  }, [isOpen])

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
        className={`bdis-overlay ${isOpen ? 'bdis-overlay-open' : ''}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <div
        ref={sheetRef}
        className={`bdis-sheet ${isOpen ? 'bdis-sheet-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bdis-title"
        aria-hidden={!isOpen}
      >
        <div className="bdis-handle" aria-hidden="true" />
        <div className="bdis-content">
          <div className="bdis-tag">🎯 Modo Demo Broker</div>
          <h2 id="bdis-title" className="bdis-title">
            Estás viendo Simón como broker activo
          </h2>
          <p className="bdis-subtitle">
            Inventario completo, ACM por propiedad, panel de shortlists. Esto es lo que vas a usar todos los días.
          </p>

          <div className="bdis-section-label">Qué es</div>
          <ul className="bdis-bullets">
            {BULLETS.map((b) => (
              <li key={b.title} className="bdis-bullet">
                <span className="bdis-bullet-icon" aria-hidden="true">{b.icon}</span>
                <div className="bdis-bullet-text">
                  <span className="bdis-bullet-title">{b.title}</span>
                  <span className="bdis-bullet-body"> — {b.body}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="bdis-section-label">Probá así</div>
          <ol className="bdis-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bdis-step">
                <span className="bdis-step-num" aria-hidden="true">{i + 1}</span>
                <div className="bdis-step-text">
                  <span className="bdis-step-title">{s.title}</span>
                  <span className="bdis-step-body"> — {s.body}</span>
                </div>
              </li>
            ))}
          </ol>

          <button type="button" className="bdis-cta" onClick={onClose}>
            Empezar a explorar
          </button>
        </div>
      </div>

      <style jsx>{`
        .bdis-overlay {
          position: fixed;
          inset: 0;
          background: rgba(20, 20, 20, 0.5);
          opacity: 0;
          pointer-events: none;
          transition: opacity 220ms ease;
          z-index: 2147483400;
        }
        .bdis-overlay-open {
          opacity: 1;
          pointer-events: auto;
        }
        .bdis-sheet {
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
          z-index: 2147483500;
          max-height: 90vh;
          overflow-y: auto;
          padding-bottom: env(safe-area-inset-bottom, 16px);
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .bdis-sheet-open {
          transform: translateY(0);
        }
        .bdis-handle {
          width: 40px;
          height: 4px;
          background: rgba(20, 20, 20, 0.18);
          border-radius: 2px;
          margin: 10px auto 4px;
        }
        .bdis-content {
          padding: 16px 22px 24px;
          max-width: 580px;
          margin: 0 auto;
        }
        .bdis-tag {
          display: inline-block;
          background: rgba(58, 106, 72, 0.12);
          color: #3A6A48;
          padding: 4px 10px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .bdis-title {
          font-family: 'Figtree', system-ui, sans-serif;
          font-size: 22px;
          font-weight: 600;
          color: #141414;
          margin: 0 0 6px;
          letter-spacing: -0.2px;
        }
        .bdis-subtitle {
          font-size: 14px;
          color: rgba(20, 20, 20, 0.6);
          margin: 0 0 20px;
          line-height: 1.45;
        }
        .bdis-section-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: rgba(20, 20, 20, 0.45);
          margin: 0 0 10px;
        }
        .bdis-bullets {
          list-style: none;
          padding: 0;
          margin: 0 0 22px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .bdis-steps {
          list-style: none;
          padding: 0;
          margin: 0 0 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .bdis-step {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .bdis-step-num {
          flex-shrink: 0;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #3A6A48;
          color: #EDE8DC;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          margin-top: 1px;
        }
        .bdis-step-text {
          font-size: 14px;
          line-height: 1.5;
          color: rgba(20, 20, 20, 0.85);
        }
        .bdis-step-title {
          font-weight: 600;
          color: #141414;
        }
        .bdis-step-body {
          color: rgba(20, 20, 20, 0.72);
        }
        .bdis-bullet {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .bdis-bullet-icon {
          font-size: 22px;
          line-height: 1;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .bdis-bullet-text {
          font-size: 14px;
          line-height: 1.5;
          color: rgba(20, 20, 20, 0.85);
        }
        .bdis-bullet-title {
          font-weight: 600;
          color: #141414;
        }
        .bdis-bullet-body {
          color: rgba(20, 20, 20, 0.72);
        }
        .bdis-cta {
          width: 100%;
          padding: 14px;
          background: #3A6A48;
          color: #EDE8DC;
          border: 0;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: background 160ms ease;
        }
        .bdis-cta:hover {
          background: #2e5439;
        }
        @media (min-width: 640px) {
          .bdis-sheet {
            left: 50%;
            right: auto;
            transform: translate(-50%, 100%);
            width: 580px;
            border-radius: 20px;
            bottom: 24px;
            max-height: 80vh;
          }
          .bdis-sheet-open {
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </>
  )
}
