// Header compacto de la shortlist mobile (/b/[hash]).
// Reemplaza al header de broker (vpsh-*/apsh-*) en `publicShareMode && !isDesktop`.
// Spec: [isologo] Simon / Selección para {nombre}          [hamburguesa]
// Sin icono de usuario ni login (el usuario llega por link de WhatsApp).
import React from 'react'
import { shortlistTheme, type ShortlistVariant } from './theme'

export const SHORTLIST_HEADER_H = 56

interface Props {
  variant: ShortlistVariant
  clienteNombre: string | null
  onMenu: () => void
}

export default function ShortlistMobileHeader({ variant, clienteNombre, onMenu }: Props) {
  const t = shortlistTheme(variant)
  const subtitle = clienteNombre ? `Selección para ${clienteNombre}` : 'Tu selección'
  // Isologo oficial "NORTE" (mismo de la landing, home.tsx). En el header oscuro
  // de ventas el disco va en arena; en el header arena de alquileres va en negro
  // (variante "negro" de marca) para que contraste.
  const discFill = variant === 'venta' ? '#EDE8DC' : '#141414'
  const dotInner = variant === 'venta' ? '#0D0F0D' : '#EDE8DC'

  return (
    <header className="slh">
      <div className="slh-brand">
        <svg className="slh-logo" width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="34" r="28" fill={discFill} />
          <circle cx="32" cy="15" r="6" fill="#3A6A48" />
          <circle cx="32" cy="15" r="3" fill={dotInner} />
        </svg>
        <span className="slh-txt">
          <span className="slh-name">Simon</span>
          <span className="slh-sub">{subtitle}</span>
        </span>
      </div>
      <button className="slh-menu" onClick={onMenu} aria-label="Abrir menú de la selección">
        <span /><span /><span />
      </button>

      <style jsx>{`
        .slh {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: ${SHORTLIST_HEADER_H}px;
          z-index: 60;
          background: ${t.bg};
          color: ${t.text};
          border-bottom: 1px solid ${t.border};
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 0 14px;
          font-family: 'DM Sans', sans-serif;
          box-shadow: 0 1px 8px ${variant === 'venta' ? 'rgba(0,0,0,0.4)' : 'rgba(20,18,14,0.08)'};
        }
        .slh-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .slh-logo { flex-shrink: 0; display: block; }
        .slh-txt { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
        .slh-name {
          font-family: 'Figtree', sans-serif; font-weight: 700; font-size: 16px;
          letter-spacing: 0.2px; color: ${t.text};
        }
        .slh-sub {
          font-size: 13px; color: ${t.textMuted}; font-weight: 500;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 62vw;
        }
        .slh-menu {
          width: 42px; height: 42px; flex-shrink: 0; border: none; background: transparent;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
          cursor: pointer; -webkit-tap-highlight-color: transparent; border-radius: 10px;
        }
        .slh-menu:active { background: ${t.border}; }
        .slh-menu span { display: block; width: 20px; height: 2px; border-radius: 2px; background: ${t.text}; }
      `}</style>
    </header>
  )
}
