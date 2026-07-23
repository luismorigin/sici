// Zonas como barras comparativas — reemplaza a la tabla. La más cara arriba,
// las demás con su distancia porcentual respecto de ella: la brecha entre zonas
// ES el dato ("¿cuánto más barato es V. Brígida?"), no los valores sueltos.
// Tema por CSS custom props --mx-* (ver TipologiaDrill).
export interface ZonaBarItem {
  label: string
  sub: string
  valor: number
  valorFmt: string
}

export default function ZonasBars({ items }: { items: ZonaBarItem[] }) {
  if (!items.length) return null
  const ordenadas = [...items].sort((a, b) => b.valor - a.valor)
  const max = ordenadas[0].valor
  return (
    <div className="zb">
      {ordenadas.map((z, i) => (
        <div className={`zb-row${i === 0 ? ' zb-top' : ''}`} key={z.label}>
          <div className="zb-n">
            {z.label}
            <small>{z.sub}</small>
          </div>
          <div className="zb-track" role="img" aria-label={`${z.label}: ${z.valorFmt}`}>
            <i style={{ width: `${(z.valor / max) * 100}%` }} />
          </div>
          <div className="zb-v num">
            {z.valorFmt}
            {i > 0 && <small>−{Math.round((1 - z.valor / max) * 100)}%</small>}
          </div>
        </div>
      ))}
      <style jsx>{`
        .zb { display: flex; flex-direction: column; gap: 11px; margin-top: 16px; }
        .zb-row { display: grid; grid-template-columns: 96px 1fr auto; gap: 10px; align-items: center; }
        .zb-n { font-size: 12.5px; text-align: right; color: var(--mx-dim, rgba(237,232,220,0.62)); line-height: 1.25; }
        .zb-n small { display: block; font-size: 10.5px; color: var(--mx-dim, rgba(237,232,220,0.62)); }
        .zb-track { height: 20px; background: var(--mx-panel, rgba(237,232,220,0.05)); border-radius: 5px; overflow: hidden; }
        .zb-track i { display: block; height: 100%; background: linear-gradient(90deg, var(--mx-bar-deep, #2E5239), var(--mx-accent-deep, #3A6A48)); border-radius: 5px; min-width: 8px; }
        .zb-top .zb-track i { background: linear-gradient(90deg, var(--mx-accent-deep, #3A6A48), var(--mx-accent, #9DBF9E)); }
        .zb-v { font-size: 13.5px; font-weight: 600; min-width: 62px; text-align: right; color: var(--mx-text, #EDE8DC); }
        .zb-v small { display: block; font-size: 10.5px; font-weight: 400; color: var(--mx-dim, rgba(237,232,220,0.62)); }
        .num { font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  )
}
