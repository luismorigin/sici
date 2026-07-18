// Modales fiduciarios de la shortlist: "Nueva búsqueda en Simon" (antes de
// sacar al usuario a la webapp) y "Cómo usar esta selección" (nota fiduciaria).
import React from 'react'
import { shortlistTheme, type ShortlistVariant } from './theme'

interface BaseModalProps {
  variant: ShortlistVariant
  open: boolean
  onClose: () => void
}

function ModalShell({
  variant, open, onClose, children,
}: BaseModalProps & { children: React.ReactNode }) {
  const t = shortlistTheme(variant)
  if (!open) return null
  return (
    <div className="slm-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="slm-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      <style jsx>{`
        .slm-overlay {
          position: fixed; inset: 0; z-index: 120;
          background: ${t.overlay};
          display: flex; align-items: flex-end; justify-content: center;
          padding: 0;
        }
        .slm-card {
          width: 100%; max-width: 520px;
          background: ${t.surface}; color: ${t.text};
          border-radius: 18px 18px 0 0;
          padding: 22px 20px calc(20px + env(safe-area-inset-bottom));
          font-family: 'DM Sans', sans-serif;
          box-shadow: ${t.shadow};
          animation: slm-up 0.22s ease;
        }
        @keyframes slm-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  )
}

export function NuevaBusquedaModal({
  variant, open, onClose, destino, onIr,
}: BaseModalProps & { destino: string; onIr: (destino: string) => void }) {
  const t = shortlistTheme(variant)
  return (
    <ModalShell variant={variant} open={open} onClose={onClose}>
      <div className="nb-title">Nueva búsqueda en Simon</div>
      <p className="nb-p">Vas a salir de esta selección para buscar en la webapp de Simon.</p>
      <p className="nb-p">Usala si querés cambiar zona, presupuesto, dormitorios o tipo de operación.</p>
      <p className="nb-p nb-keep">Tu selección actual seguirá disponible en este link.</p>
      <div className="nb-actions">
        <button className="nb-go" onClick={() => onIr(destino)}>Ir a la webapp</button>
        <button className="nb-stay" onClick={onClose}>Seguir viendo selección</button>
      </div>
      <style jsx>{`
        .nb-title { font-family: 'Figtree', sans-serif; font-weight: 700; font-size: 19px; color: ${t.text}; margin-bottom: 12px; }
        .nb-p { font-size: 14px; line-height: 1.5; color: ${t.textMuted}; margin: 0 0 10px; }
        .nb-keep { color: ${t.textFaint}; }
        .nb-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
        .nb-go { background: ${t.accent}; color: ${t.accentInk}; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; }
        .nb-stay { background: transparent; color: ${t.textMuted}; border: 1px solid ${t.border}; padding: 13px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; }
      `}</style>
    </ModalShell>
  )
}

export function ComoUsarModal({ variant, open, onClose }: BaseModalProps) {
  const t = shortlistTheme(variant)
  return (
    <ModalShell variant={variant} open={open} onClose={onClose}>
      <div className="cu-title">Cómo usar esta selección</div>
      <p className="cu-p">
        Simon ordena propiedades con datos disponibles de mercado, pero no reemplaza una visita
        ni la verificación con el captador.
      </p>
      <p className="cu-p cu-lead">Antes de decidir, confirmá:</p>
      <ul className="cu-list">
        <li>disponibilidad;</li>
        <li>tipo de cambio aplicado;</li>
        <li>expensas y costos de cierre;</li>
        <li>parqueo, baulera y condiciones;</li>
        <li>estado real del inmueble.</li>
      </ul>
      <p className="cu-p cu-foot">
        Los rangos y medianas ayudan a comparar, no garantizan precio justo ni rentabilidad.
      </p>
      <button className="cu-ok" onClick={onClose}>Entendido</button>
      <style jsx>{`
        .cu-title { font-family: 'Figtree', sans-serif; font-weight: 700; font-size: 19px; color: ${t.text}; margin-bottom: 12px; }
        .cu-p { font-size: 14px; line-height: 1.5; color: ${t.textMuted}; margin: 0 0 10px; }
        .cu-lead { color: ${t.text}; font-weight: 600; margin-top: 4px; }
        .cu-list { margin: 0 0 10px; padding-left: 20px; color: ${t.textMuted}; font-size: 14px; line-height: 1.7; }
        .cu-foot { color: ${t.textFaint}; }
        .cu-ok { width: 100%; background: ${t.accent}; color: ${t.accentInk}; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 8px; }
      `}</style>
    </ModalShell>
  )
}
