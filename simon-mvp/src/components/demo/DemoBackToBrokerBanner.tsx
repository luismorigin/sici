// Mini banner top en /b/demo cuando el broker prospect llega desde
// /broker/demo (intentando "Enviar shortlist" abre /b/demo?ref=demo-broker
// para mostrar el lado del cliente). Permite volver al demo broker en
// 1 click sin perder progreso.
//
// Solo visible cuando `?ref=demo-broker` está en la URL — los visitantes
// regulares no ven este banner.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

export default function DemoBackToBrokerBanner() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const ref = typeof router.query.ref === 'string' ? router.query.ref : null
    setVisible(ref === 'demo-broker')
  }, [router.query.ref])

  if (!visible) return null

  return (
    <div className="dbtb">
      <span className="dbtb-tag" aria-hidden="true">🔄</span>
      <span className="dbtb-text">Vista previa del lado del cliente</span>
      <a href="/broker/demo" className="dbtb-back">
        ← Volver al panel broker
      </a>

      {/* Bajar los headers de /b/[hash] (venta y alquiler) 36px para que
          no queden tapados por el banner. Aplica global porque los headers
          tienen <style jsx> scoped en ventas.tsx / alquileres.css. */}
      <style jsx global>{`
        .vt-public-share-header { top: 36px !important; }
        .alq-public-share-header { top: 36px !important; }
      `}</style>

      <style jsx>{`
        .dbtb {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 36px;
          background: #141414;
          color: #EDE8DC;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 0 12px;
          border-bottom: 1px solid rgba(237, 232, 220, 0.08);
          z-index: 100;
          white-space: nowrap;
        }
        .dbtb-tag {
          font-size: 13px;
          line-height: 1;
        }
        .dbtb-text {
          color: rgba(237, 232, 220, 0.8);
        }
        .dbtb-back {
          background: rgba(58, 106, 72, 0.25);
          color: #D4E5DA;
          border: 1px solid rgba(58, 106, 72, 0.5);
          padding: 4px 12px;
          border-radius: 999px;
          text-decoration: none;
          font-weight: 600;
          letter-spacing: 0.2px;
          font-size: 11px;
          line-height: 1.4;
          transition: background 160ms ease, transform 160ms ease;
        }
        .dbtb-back:hover {
          background: rgba(58, 106, 72, 0.4);
          transform: translateY(-1px);
        }
        @media (max-width: 540px) {
          .dbtb {
            font-size: 11px;
            gap: 6px;
            padding: 0 8px;
          }
          .dbtb-text {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}
