// Serie histórica con toggle USD | Bs | Dólar — una curva por vez, con su
// delta y su lectura. Reemplaza al gráfico de 3 curvas superpuestas + tabla
// siempre visible (la tabla desbordaba el viewport mobile).
//
// AEO: la tabla gemela NO desaparece — vive en un <details> al pie. El
// contenido de <details> está en el DOM aunque esté colapsado, así que los
// crawlers/agentes la leen igual; el humano la abre solo si la quiere.
//
// Fiduciario (regla 12): NUNCA un % de variación sin declarar la moneda. Por
// eso el toggle es explícito y cada moneda lleva su propia lectura — en USD y
// en Bs la historia es distinta porque el dólar se movió.
import { useState } from 'react'
import type { SerieMensual } from '@/lib/mercado-shadow-data'
import { trackEvent } from '@/lib/analytics'

type Moneda = 'usd' | 'bs' | 'tc'

const fmtUsd = (n: number) => '$' + n.toLocaleString('en-US')
const fmtBs = (n: number) => 'Bs ' + n.toLocaleString('es-BO')
const fmtTc = (n: number) => 'Bs ' + n.toFixed(2).replace('.', ',')

export default function SerieInteractiva({ serie, operacion }: { serie: SerieMensual; operacion: 'venta' | 'alquiler' }) {
  const [mon, setMon] = useState<Moneda>('usd')

  const cfg: Record<Moneda, { valores: number[]; fmt: (n: number) => string; delta: string; nota: string }> = {
    usd: {
      valores: serie.puntos.map(p => p.usd_m2),
      fmt: fmtUsd,
      // La banda 12-17% viene del análisis de métodos (migs 287/288) — el
      // punto exacto depende del método de reexpresión, la banda es robusta.
      delta: '−12 a −17%',
      nota: `En dólares reales el m² bajó de ${fmtUsd(serie.puntos[0].usd_m2)} a ${fmtUsd(serie.puntos[serie.puntos.length - 1].usd_m2)}. Parte es el inmueble, parte es el dólar: por eso mostramos las dos monedas.`,
    },
    bs: {
      valores: serie.puntos.map(p => p.bs_m2),
      fmt: (n: number) => 'Bs ' + (n / 1000).toFixed(1).replace('.', ',') + 'k',
      delta: `${serie.varBsPct.toFixed(0)}%`,
      nota: 'En bolivianos la baja es cerca de la mitad que en dólares: el resto de la "caída en USD" es el dólar encareciéndose, no el inmueble.',
    },
    tc: {
      valores: serie.puntos.map(p => p.tc),
      fmt: fmtTc,
      delta: `+${serie.varTcPct.toFixed(0)}%`,
      nota: `El dólar paralelo pasó de ${fmtTc(serie.puntos[0].tc)} a ${fmtTc(serie.puntos[serie.puntos.length - 1].tc)} en el período — es la cuña entre la curva en USD y la curva en Bs.`,
    },
  }

  const c = cfg[mon]
  const baja = c.delta.startsWith('−')
  const color = baja ? '#D08770' : '#D4A93C'

  // Sparkline SVG server-safe (sin canvas: los agentes leen HTML)
  const W = 360, H = 110, P = 10
  const v = c.valores
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1
  const X = (i: number) => P + (i * (W - 2 * P)) / (v.length - 1)
  const Y = (x: number) => H - P - ((x - min) / span) * (H - 2 * P - 14)
  const pts = v.map((x, i) => `${X(i)},${Y(x)}`).join(' ')

  const setMoneda = (m: Moneda) => {
    setMon(m)
    trackEvent('mercado_serie_moneda', { operacion, moneda: m })
  }

  return (
    <div className="si">
      <div className="si-head">
        <div className="si-delta num" style={{ color }}>
          {c.delta}
          <small>
            {c.fmt(v[0])} → {c.fmt(v[v.length - 1])}
          </small>
        </div>
        <div className="si-toggle" role="tablist" aria-label="Moneda de la serie">
          {(['usd', 'bs', 'tc'] as Moneda[]).map(m => (
            <button key={m} aria-pressed={mon === m} onClick={() => setMoneda(m)}>
              {m === 'usd' ? 'USD' : m === 'bs' ? 'Bs' : 'Dólar'}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Evolución mensual en ${mon === 'usd' ? 'dólares' : mon === 'bs' ? 'bolivianos' : 'tipo de cambio'}: ${c.delta}`}>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={P} x2={W - P} y1={P + f * (H - 2 * P)} y2={P + f * (H - 2 * P)} stroke="var(--mx-line, rgba(237,232,220,0.09))" />
        ))}
        <polygon points={`${P},${H - P} ${pts} ${W - P},${H - P}`} fill={color} opacity="0.08" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {v.map((x, i) => (
          <circle key={i} cx={X(i)} cy={Y(x)} r={i === v.length - 1 ? 4.5 : 2.6} fill={i === v.length - 1 ? color : 'var(--mx-bg, #141414)'} stroke={color} strokeWidth="1.6" />
        ))}
      </svg>
      <div className="si-meses num">
        {serie.puntos.map(p => (
          <span key={p.mes}>{p.mes}</span>
        ))}
      </div>
      <p className="si-nota">{c.nota}</p>

      {/* Tabla gemela (AEO): en el DOM siempre, visible bajo demanda */}
      <details className="si-tabla">
        <summary>Ver la tabla de datos mes a mes</summary>
        <div className="si-scroll">
          <table aria-label="Serie mensual del precio por metro cuadrado">
            <thead>
              <tr>
                <th>Mes</th>
                <th>USD/m²</th>
                <th>Bs/m²</th>
                <th>Dólar (Bs)</th>
              </tr>
            </thead>
            <tbody>
              {serie.puntos.map(p => (
                <tr key={p.mes}>
                  <td>{p.mes}</td>
                  <td>{fmtUsd(p.usd_m2)}</td>
                  <td>{fmtBs(p.bs_m2)}</td>
                  <td>{p.tc.toFixed(2).replace('.', ',')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <style jsx>{`
        .si-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
        .si-delta { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; }
        .si-delta small { display: block; font-size: 12.5px; color: var(--mx-dim, rgba(237,232,220,0.62)); font-weight: 400; margin-top: 2px; }
        .num { font-variant-numeric: tabular-nums; }
        .si-toggle { display: flex; background: var(--mx-panel, rgba(237,232,220,0.05)); border: 1px solid var(--mx-line, rgba(237,232,220,0.09)); border-radius: 9px; padding: 2px; flex-shrink: 0; }
        .si-toggle button { font: inherit; font-size: 11.5px; padding: 5px 10px; border-radius: 7px; color: var(--mx-dim, rgba(237,232,220,0.62)); font-weight: 500; background: none; border: 0; cursor: pointer; }
        .si-toggle button[aria-pressed='true'] { background: var(--mx-panel2, rgba(237,232,220,0.1)); color: var(--mx-text, #EDE8DC); }
        .si-toggle button:focus-visible { outline: 2px solid var(--mx-accent, #9DBF9E); outline-offset: 1px; }
        .si-meses { display: flex; justify-content: space-between; font-size: 11px; color: var(--mx-dim, rgba(237,232,220,0.62)); margin-top: 6px; padding: 0 2px; }
        .si-nota { margin: 12px 0 0; font-size: 12px; color: var(--mx-dim, rgba(237,232,220,0.62)); line-height: 1.5; }
        .si-tabla { margin-top: 12px; }
        .si-tabla summary { font-size: 12.5px; color: var(--mx-accent, #9DBF9E); cursor: pointer; }
        .si-tabla summary:focus-visible { outline: 2px solid var(--mx-accent, #9DBF9E); outline-offset: 2px; border-radius: 4px; }
        /* la tabla scrollea DENTRO de su contenedor — el body nunca (era el bug de la franja blanca) */
        .si-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--mx-dim, rgba(237,232,220,0.62)); padding: 8px 10px; border-bottom: 1px solid var(--mx-line, rgba(237,232,220,0.09)); }
        td { padding: 9px 10px; border-bottom: 1px solid var(--mx-line, rgba(237,232,220,0.09)); color: var(--mx-text, #EDE8DC); font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  )
}
