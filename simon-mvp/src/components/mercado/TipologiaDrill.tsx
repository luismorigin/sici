// Tipologías como cards con drill-down — reemplaza a la tabla de 5 columnas
// que desbordaba el viewport mobile (+41px ventas / +71px alquileres) y
// escondía el $/m² en letra chica.
//
// Principios (del mockup validado 22-jul, MERCADO_MOBILE_REDESIGN_PLAN.md):
//  - El valor comparable ($/m² o Bs/mes) se ve SIN abrir nada.
//  - <details> nativo: accesibilidad gratis y el contenido queda en el DOM
//    aunque esté colapsado → los crawlers/agentes lo leen igual (AEO).
//  - Números en color pleno ≥13px; solo las explicaciones van atenuadas.
//  - Cada card termina en un deep-link al feed con el filtro puesto: la página
//    de mercado deja de ser un callejón sin salida.
//
// Tema por CSS custom props --mx-* (los define el wrapper de cada página:
// ventas = oscuro, alquileres = arena). Un solo código para las dos.
import Link from 'next/link'
import { trackEvent } from '@/lib/analytics'

export interface DrillRango {
  min: number
  med: number
  max: number
  /** formatea un valor del rango para mostrar ("$68.896" / "Bs 3.500") */
  fmt: (n: number) => string
  cap: string
}

export interface DrillSplitRow {
  label: string
  n: number
  valor: string
}

export interface TipologiaItem {
  key: string
  label: string
  sub: string
  valor: string
  secundario?: string
  rangos: DrillRango[]
  split?: DrillSplitRow[]
  splitCap?: string
  href: string
  hrefLabel: string
}

function RangoBar({ r }: { r: DrillRango }) {
  // Ventana con aire a los costados para que el rango no toque los bordes
  const min = r.min * 0.86
  const max = r.max * 1.08
  const pos = (v: number) => ((v - min) / (max - min)) * 100
  return (
    <div className="rg">
      <div className="rg-l num">
        <span>{r.fmt(r.min)}</span>
        <span>{r.fmt(r.max)}</span>
      </div>
      <div className="rg-track" role="img" aria-label={`Rango típico de ${r.fmt(r.min)} a ${r.fmt(r.max)}, mediana ${r.fmt(r.med)}`}>
        <i style={{ left: `${pos(r.min)}%`, width: `${pos(r.max) - pos(r.min)}%` }} />
        <b style={{ left: `${pos(r.med)}%` }} />
      </div>
      <div className="rg-cap">{r.cap}</div>
      <style jsx>{`
        .rg { margin-top: 12px; }
        .rg-l { display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; color: var(--mx-text, #EDE8DC); font-variant-numeric: tabular-nums; }
        .rg-track { position: relative; height: 8px; background: var(--mx-panel2, rgba(237,232,220,0.1)); border-radius: 4px; margin-top: 6px; }
        .rg-track i { position: absolute; top: 0; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--mx-bar-a, rgba(157,191,158,0.35)), var(--mx-bar-b, rgba(157,191,158,0.75))); }
        .rg-track b { position: absolute; top: -3px; width: 2.5px; height: 14px; background: var(--mx-text, #EDE8DC); border-radius: 2px; }
        .rg-cap { font-size: 12px; color: var(--mx-dim, rgba(237,232,220,0.62)); margin-top: 7px; line-height: 1.45; }
      `}</style>
    </div>
  )
}

export default function TipologiaDrill({ items, operacion }: { items: TipologiaItem[]; operacion: 'venta' | 'alquiler' }) {
  return (
    <div className="td">
      {items.map(t => (
        <details
          key={t.key}
          className="td-item"
          onToggle={e => {
            if ((e.currentTarget as HTMLDetailsElement).open) {
              trackEvent('mercado_drill', { operacion, tipologia: t.key })
            }
          }}
        >
          <summary className="td-sum">
            <span className="td-nom">
              {t.label}
              <small>{t.sub}</small>
            </span>
            <span className="td-val">
              <span className="td-med num">{t.valor}</span>
              {t.secundario && <small className="td-m2 num">{t.secundario}</small>}
            </span>
            <svg className="td-chev" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="td-det">
            {t.rangos.map((r, i) => (
              <RangoBar key={i} r={r} />
            ))}
            {t.split && t.split.length > 0 && (
              <div className="td-split">
                {t.split.map(s => (
                  <div className="td-split-row num" key={s.label}>
                    <span>
                      {s.label} <small>· {s.n} avisos</small>
                    </span>
                    <b>{s.valor}</b>
                  </div>
                ))}
                {t.splitCap && <div className="td-split-cap">{t.splitCap}</div>}
              </div>
            )}
            <div className="td-foot">
              <Link href={t.href} className="td-link">
                {t.hrefLabel}
              </Link>
            </div>
          </div>
        </details>
      ))}
      <style jsx>{`
        .td { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
        .td-item { background: var(--mx-panel, rgba(237,232,220,0.05)); border: 1px solid var(--mx-line, rgba(237,232,220,0.09)); border-radius: 14px; overflow: hidden; }
        .td-sum { display: flex; align-items: center; gap: 12px; padding: 14px 15px; cursor: pointer; list-style: none; }
        .td-sum::-webkit-details-marker { display: none; }
        .td-sum:focus-visible { outline: 2px solid var(--mx-accent, #9DBF9E); outline-offset: -2px; border-radius: 14px; }
        .td-nom { font-size: 14.5px; font-weight: 500; flex: 1; color: var(--mx-text, #EDE8DC); }
        .td-nom small { display: block; font-size: 12px; color: var(--mx-dim, rgba(237,232,220,0.62)); font-weight: 400; margin-top: 2px; }
        .td-val { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .td-med { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; color: var(--mx-text, #EDE8DC); }
        /* el $/m² es EL dato comparable → visible sin abrir, 14px, contraste alto */
        .td-m2 { font-size: 14px; font-weight: 500; color: var(--mx-accent, #9DBF9E); }
        .num { font-variant-numeric: tabular-nums; }
        .td-chev { color: var(--mx-dim2, rgba(237,232,220,0.4)); transition: transform 0.18s; flex-shrink: 0; }
        .td-item[open] .td-chev { transform: rotate(180deg); }
        .td-det { padding: 2px 15px 16px; border-top: 1px solid var(--mx-line, rgba(237,232,220,0.09)); }
        .td-split { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; border-top: 1px dashed var(--mx-line, rgba(237,232,220,0.09)); padding-top: 11px; }
        .td-split-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--mx-dim, rgba(237,232,220,0.62)); }
        .td-split-row b { color: var(--mx-text, #EDE8DC); font-weight: 500; }
        .td-split-row small { color: var(--mx-dim2, rgba(237,232,220,0.4)); font-size: 11.5px; }
        .td-split-cap { font-size: 11.5px; color: var(--mx-dim, rgba(237,232,220,0.62)); margin-top: 4px; line-height: 1.45; }
        .td-foot { display: flex; justify-content: flex-end; margin-top: 14px; }
        .td :global(.td-link) { font-size: 13px; font-weight: 500; color: var(--mx-accent, #9DBF9E); text-decoration: none; }
        .td :global(.td-link:hover) { text-decoration: underline; }
        @media (prefers-reduced-motion: reduce) { .td-chev { transition: none; } }
      `}</style>
    </div>
  )
}
