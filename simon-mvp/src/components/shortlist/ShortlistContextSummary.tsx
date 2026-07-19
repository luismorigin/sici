// Resumen superior de la shortlist mobile — CONTEXTO DE LA SELECCIÓN (no del
// mercado). Tarjeta expandida arriba de todo (primer item del grid, en flujo).
// Al scrollear aparece una tira compacta FIXED bajo el header; tocarla vuelve
// arriba y reabre el resumen. El menú también puede reabrirlo (expandSignal).
//
// No usa position:sticky a propósito: algún ancestro del feed usa overflow y el
// sticky no se sostiene; el patrón fixed-al-scrollear es robusto y sin saltos.
import React, { useEffect, useRef, useState } from 'react'
import { shortlistTheme, type ShortlistVariant } from './theme'
import { SHORTLIST_HEADER_H } from './ShortlistMobileHeader'
import type { ShortlistListStats } from '@/lib/shortlist-context'

interface Props {
  variant: ShortlistVariant
  stats: ShortlistListStats
  hasFavorites: boolean
  // cambia de valor cuando el menú pide "Contexto de la selección"
  expandSignal?: number
}

const COLLAPSE_AT = 120 // px de scroll para mostrar la tira colapsada

export default function ShortlistContextSummary({ variant, stats, hasFavorites, expandSignal }: Props) {
  const t = shortlistTheme(variant)
  const [scrolled, setScrolled] = useState(false)
  const firstSignal = useRef(expandSignal)

  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY || 0) > COLLAPSE_AT)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (expandSignal === firstSignal.current) return
    firstSignal.current = expandSignal
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [expandSignal])

  return (
    <>
      <section className="slcs" aria-label="Contexto de la selección">
        <div className="slcs-card">
          <div className="slcs-title">Tu selección</div>
          <div className="slcs-ctx">{stats.contextLine}</div>
          <div className="slcs-rows">
            {stats.rangoLabel && (
              <div className="slcs-row">
                <span className="slcs-k">Rango en esta lista</span>
                <span className="slcs-v">{stats.rangoLabel}</span>
              </div>
            )}
            {stats.medianaLabel && (
              <div className="slcs-row">
                <span className="slcs-k">Mediana de esta lista</span>
                <span className="slcs-v">
                  {stats.medianaLabel}
                  {stats.medianaSecondaryLabel ? <span className="slcs-v2"> · {stats.medianaSecondaryLabel}</span> : null}
                </span>
              </div>
            )}
          </div>
          <div className="slcs-hint">
            {hasFavorites
              ? 'Compará tus favoritas o pedí parecidas por WhatsApp.'
              : 'Marcá favoritas para comparar o pedir parecidas.'}
          </div>
        </div>
      </section>

      <button
        className={`slcs-strip ${scrolled ? 'is-visible' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Ver contexto de la selección"
        aria-hidden={!scrolled}
        tabIndex={scrolled ? 0 : -1}
      >
        <span className="slcs-strip-txt">{stats.collapsedLabel}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <style jsx>{`
        .slcs {
          grid-column: 1 / -1;
          background: ${t.bg};
          border-bottom: 1px solid ${t.border};
          font-family: 'DM Sans', sans-serif;
        }
        .slcs-card { padding: 12px 4px 16px; }
        .slcs-title {
          font-family: 'Figtree', sans-serif; font-weight: 700; font-size: 17px;
          color: ${t.text}; letter-spacing: 0.2px;
        }
        .slcs-ctx { font-size: 13px; color: ${t.textMuted}; margin-top: 2px; }
        .slcs-rows { margin-top: 10px; display: flex; flex-direction: column; gap: 7px; }
        .slcs-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .slcs-k { font-size: 12.5px; color: ${t.textMuted}; flex-shrink: 0; }
        .slcs-v {
          font-size: 14px; font-weight: 600; color: ${t.text};
          font-variant-numeric: tabular-nums; text-align: right;
        }
        .slcs-v2 { color: ${t.textMuted}; font-weight: 500; white-space: nowrap; }
        .slcs-hint {
          margin-top: 11px; font-size: 12.5px; color: ${t.textFaint};
          border-top: 1px solid ${t.border}; padding-top: 10px;
        }
        .slcs-strip {
          position: fixed; top: ${SHORTLIST_HEADER_H}px; left: 0; right: 0;
          z-index: 55;
          width: 100%; border: none; cursor: pointer;
          background: ${t.surface};
          border-bottom: 1px solid ${t.border};
          -webkit-tap-highlight-color: transparent;
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 11px 16px; color: ${t.text};
          transform: translateY(-100%); opacity: 0; pointer-events: none;
          transition: transform 0.2s ease, opacity 0.2s ease;
          box-shadow: 0 2px 10px ${variant === 'venta' ? 'rgba(0,0,0,0.4)' : 'rgba(20,18,14,0.08)'};
          font-family: 'DM Sans', sans-serif;
        }
        .slcs-strip.is-visible { transform: translateY(0); opacity: 1; pointer-events: auto; }
        .slcs-strip-txt {
          font-size: 13px; font-weight: 600; color: ${t.text};
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .slcs-strip svg { color: ${t.textMuted}; flex-shrink: 0; }
      `}</style>
    </>
  )
}
