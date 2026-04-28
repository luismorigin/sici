// Watermark al pie del Demo Cliente (/b/demo). Variante de ShortlistWatermark
// con CTA destacado de activación + copy aclarando que es una muestra +
// brand link al pie. Orden: CTA llamativo arriba (salvia + arena, pill
// con sombra), texto explicativo en medio, brand link abajo.

import { useState } from 'react'
import DemoModalEducational from './DemoModalEducational'

export default function DemoFooterWatermark() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <footer className="sl-watermark-demo">
        <button type="button" className="sl-cta-pill" onClick={() => setOpen(true)}>
          Activá tu cuenta de Simón
        </button>
        <div className="sl-watermark-meta">
          Esta es una muestra de cómo recibirían tus clientes una shortlist tuya.
        </div>
        <div className="sl-watermark-line">
          Generado con{' '}
          <a href="https://simonbo.com" target="_blank" rel="noopener noreferrer">
            Simón · Inteligencia Inmobiliaria de Equipetrol
          </a>
        </div>

        <style jsx>{`
          .sl-watermark-demo {
            padding: 32px 16px 40px;
            text-align: center;
            font-family: 'DM Sans', system-ui, sans-serif;
            border-top: 1px solid rgba(20, 20, 20, 0.08);
            margin-top: 32px;
            background: transparent;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
          }
          .sl-cta-pill {
            background: #3A6A48;
            color: #EDE8DC;
            border: 0;
            padding: 14px 28px;
            border-radius: 999px;
            font-family: 'Figtree', system-ui, sans-serif;
            font-size: 15px;
            font-weight: 600;
            letter-spacing: 0.2px;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(58, 106, 72, 0.25);
            transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
            -webkit-tap-highlight-color: transparent;
          }
          .sl-cta-pill:hover {
            background: #2e5439;
            transform: translateY(-1px);
            box-shadow: 0 6px 22px rgba(58, 106, 72, 0.35);
          }
          .sl-cta-pill:active {
            transform: translateY(0);
          }
          .sl-watermark-meta {
            font-size: 12px;
            color: rgba(20, 20, 20, 0.55);
            line-height: 1.45;
            max-width: 360px;
          }
          .sl-watermark-line {
            font-size: 11px;
            color: rgba(20, 20, 20, 0.45);
            letter-spacing: 0.3px;
            line-height: 1.4;
          }
          .sl-watermark-line a {
            color: rgba(20, 20, 20, 0.65);
            text-decoration: underline;
            font-weight: 500;
          }
          .sl-watermark-line a:hover {
            color: #141414;
          }
        `}</style>
      </footer>

      <DemoModalEducational
        isOpen={open}
        onClose={() => setOpen(false)}
        context="watermark_footer"
        title="Activá tu cuenta de Simón"
        body="Tus clientes reciben un link como éste, pero con tu nombre, foto y WhatsApp. Empezá a usarlo con tus clientes hoy."
      />
    </>
  )
}
