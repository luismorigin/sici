// Barra inferior fija de la shortlist mobile. Acciones GLOBALES de la selección
// (no de una card). Estados por cantidad de favoritos (spec):
//   0  → [Ver mapa]  Marcá favoritas
//   1  → [Ver mapa]  Marcá otra para comparar
//   2+ → [Ver mapa] [Comparar N] [Más opciones]
import React from 'react'
import { shortlistTheme, type ShortlistVariant } from './theme'

export const SHORTLIST_BOTTOMBAR_H = 64

interface Props {
  variant: ShortlistVariant
  favCount: number
  onVerMapa: () => void
  onComparar: () => void
  onMasOpciones: () => void
}

function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}

export default function ShortlistBottomBar({ variant, favCount, onVerMapa, onComparar, onMasOpciones }: Props) {
  const t = shortlistTheme(variant)
  const canCompare = favCount >= 2

  return (
    <div className="slbb" role="toolbar" aria-label="Acciones de la selección">
      <button className="slbb-map" onClick={onVerMapa}>
        <MapIcon />
        <span>Ver mapa</span>
      </button>

      {favCount === 0 && <span className="slbb-hint">Marcá favoritas</span>}
      {favCount === 1 && <span className="slbb-hint">Marcá otra para comparar</span>}

      {canCompare && (
        <div className="slbb-right">
          <button className="slbb-cmp" onClick={onComparar}>Comparar {favCount}</button>
          <button className="slbb-more" onClick={onMasOpciones} aria-label="Pedir más opciones por WhatsApp">Más opciones</button>
        </div>
      )}

      <style jsx>{`
        .slbb {
          position: fixed; left: 0; right: 0;
          bottom: 0;
          z-index: 70;
          height: calc(${SHORTLIST_BOTTOMBAR_H}px + env(safe-area-inset-bottom));
          padding: 0 12px env(safe-area-inset-bottom);
          background: ${t.surface};
          border-top: 1px solid ${t.border};
          box-shadow: ${t.shadow};
          display: flex; align-items: center; gap: 10px;
          font-family: 'DM Sans', sans-serif;
        }
        .slbb-map {
          display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
          background: transparent; border: 1px solid ${t.border}; color: ${t.text};
          padding: 10px 14px; border-radius: 100px; font-size: 13.5px; font-weight: 600;
          cursor: pointer; -webkit-tap-highlight-color: transparent;
        }
        .slbb-map:active { transform: scale(0.97); }
        .slbb-hint { flex: 1; text-align: right; font-size: 12.5px; color: ${t.textFaint}; padding-right: 4px; }
        .slbb-right { flex: 1; display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
        .slbb-cmp {
          background: ${t.accent}; color: ${t.accentInk}; border: none;
          padding: 11px 18px; border-radius: 100px; font-size: 14px; font-weight: 700;
          cursor: pointer; -webkit-tap-highlight-color: transparent; white-space: nowrap;
        }
        .slbb-cmp:active { transform: scale(0.97); }
        .slbb-more {
          background: transparent; color: ${t.textMuted}; border: none;
          padding: 10px 6px; font-size: 12.5px; font-weight: 600; cursor: pointer;
          white-space: nowrap; -webkit-tap-highlight-color: transparent;
        }
      `}</style>
    </div>
  )
}
