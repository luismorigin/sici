// Botón flotante para reabrir el bottom sheet de intro de /b/demo.
// Visible siempre que estamos en modo demo. Bottom-right, mobile-first,
// no invasivo. Los visitantes que cerraron la intro pueden volver a
// abrirla; los que entran desde un link compartido por un colega ven
// el botón visible y entienden que hay una explicación disponible.

export interface DemoIntroTriggerProps {
  onClick: () => void
}

export default function DemoIntroTrigger({ onClick }: DemoIntroTriggerProps) {
  return (
    <button type="button" className="dit-btn" onClick={onClick} aria-label="¿Qué es una shortlist?">
      <span className="dit-icon" aria-hidden="true">ⓘ</span>
      <span className="dit-label">¿Qué es una shortlist?</span>
      <style jsx>{`
        .dit-btn {
          position: fixed;
          right: 16px;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
          background: #141414;
          color: #fff;
          border: 0;
          border-radius: 999px;
          padding: 10px 16px 10px 12px;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
          z-index: 180;
          transition: transform 160ms ease, background 160ms ease;
        }
        .dit-btn:hover {
          background: #2a2a2a;
          transform: translateY(-1px);
        }
        .dit-icon {
          font-size: 15px;
          line-height: 1;
          opacity: 0.92;
        }
        .dit-label {
          letter-spacing: 0.2px;
        }
      `}</style>
    </button>
  )
}
