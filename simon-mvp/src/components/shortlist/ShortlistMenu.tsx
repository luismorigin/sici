// Menú hamburguesa de la shortlist mobile. Acciones SECUNDARIAS de la selección
// (spec). NO replica la navegación de la webapp (nada de Ventas/Alquileres/
// Preventa/Mercado/Simulá). Maneja internamente los modales "Nueva búsqueda" y
// "Cómo usar esta selección".
import React, { useState } from 'react'
import { shortlistTheme, type ShortlistVariant } from './theme'
import { NuevaBusquedaModal, ComoUsarModal } from './ShortlistModals'

interface Props {
  variant: ShortlistVariant
  open: boolean
  onClose: () => void
  favCount: number
  destinoNuevaBusqueda: string
  onMasOpciones: () => void
  onComparar: () => void
  onVerMapa: () => void
  onContextoSeleccion: () => void
  onCompartir: () => void
  onReportar: () => void
  onIrWebapp: (destino: string) => void
}

export default function ShortlistMenu(props: Props) {
  const {
    variant, open, onClose, favCount, destinoNuevaBusqueda,
    onMasOpciones, onComparar, onVerMapa, onContextoSeleccion, onCompartir, onReportar, onIrWebapp,
  } = props
  const t = shortlistTheme(variant)
  const [nuevaOpen, setNuevaOpen] = useState(false)
  const [comoOpen, setComoOpen] = useState(false)

  const run = (fn: () => void) => { onClose(); fn() }
  const canCompare = favCount >= 2

  return (
    <>
      <div className={`slmenu-root ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="slmenu-scrim" onClick={onClose} />
        <nav className="slmenu-panel" aria-label="Menú de la selección">
          <div className="slmenu-head">
            <span className="slmenu-title">Tu selección</span>
            <button className="slmenu-x" onClick={onClose} aria-label="Cerrar menú">✕</button>
          </div>

          <button className="slmenu-item slmenu-primary" onClick={() => run(onMasOpciones)}>
            {favCount > 0 ? 'Pedir parecidas a mis favoritas' : 'Pedir más opciones como estas'}
          </button>

          <button
            className={`slmenu-item ${canCompare ? '' : 'is-disabled'}`}
            onClick={() => (canCompare ? run(onComparar) : undefined)}
            disabled={!canCompare}
          >
            <span>Comparar favoritos</span>
            {!canCompare && <span className="slmenu-help">Marcá 2 favoritas</span>}
          </button>

          <button className="slmenu-item" onClick={() => run(onVerMapa)}>Ver mapa</button>
          <button className="slmenu-item" onClick={() => run(onContextoSeleccion)}>Contexto de la selección</button>

          <div className="slmenu-sep" />

          <button className="slmenu-item" onClick={() => { onClose(); setNuevaOpen(true) }}>Nueva búsqueda en Simon</button>
          <button className="slmenu-item" onClick={() => run(onCompartir)}>Compartir selección</button>
          <button className="slmenu-item" onClick={() => { onClose(); setComoOpen(true) }}>Cómo usar esta selección</button>
          <button className="slmenu-item slmenu-muted" onClick={() => run(onReportar)}>Reportar dato</button>
        </nav>

        <style jsx>{`
          .slmenu-root { position: fixed; inset: 0; z-index: 110; pointer-events: none; }
          .slmenu-root.is-open { pointer-events: auto; }
          .slmenu-scrim {
            position: absolute; inset: 0; background: ${t.overlay};
            opacity: 0; transition: opacity 0.22s ease;
          }
          .slmenu-root.is-open .slmenu-scrim { opacity: 1; }
          .slmenu-panel {
            position: absolute; top: 0; right: 0; bottom: 0;
            width: min(84vw, 340px);
            background: ${t.surface}; color: ${t.text};
            transform: translateX(100%); transition: transform 0.24s ease;
            display: flex; flex-direction: column;
            padding: 14px 14px calc(18px + env(safe-area-inset-bottom));
            overflow-y: auto; font-family: 'DM Sans', sans-serif;
            box-shadow: -8px 0 28px ${variant === 'venta' ? 'rgba(0,0,0,0.5)' : 'rgba(20,18,14,0.2)'};
          }
          .slmenu-root.is-open .slmenu-panel { transform: translateX(0); }
          .slmenu-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 12px; }
          .slmenu-title { font-family: 'Figtree', sans-serif; font-weight: 700; font-size: 16px; color: ${t.text}; }
          .slmenu-x { background: transparent; border: none; color: ${t.textMuted}; font-size: 18px; cursor: pointer; padding: 4px 8px; }
          .slmenu-item {
            width: 100%; text-align: left; background: transparent; border: none;
            color: ${t.text}; font-size: 15px; font-weight: 500;
            padding: 14px 12px; border-radius: 10px; cursor: pointer;
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            -webkit-tap-highlight-color: transparent;
          }
          .slmenu-item:active { background: ${t.border}; }
          .slmenu-primary { color: ${t.accent}; font-weight: 700; }
          .slmenu-item.is-disabled { color: ${t.textFaint}; cursor: default; }
          .slmenu-help { font-size: 12px; color: ${t.textFaint}; font-weight: 500; }
          .slmenu-muted { color: ${t.textMuted}; }
          .slmenu-sep { height: 1px; background: ${t.border}; margin: 8px 6px; }
        `}</style>
      </div>

      <NuevaBusquedaModal
        variant={variant}
        open={nuevaOpen}
        onClose={() => setNuevaOpen(false)}
        destino={destinoNuevaBusqueda}
        onIr={(d) => { setNuevaOpen(false); onClose(); onIrWebapp(d) }}
      />
      <ComoUsarModal variant={variant} open={comoOpen} onClose={() => setComoOpen(false)} />
    </>
  )
}
