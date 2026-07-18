import { useMemo } from 'react'

// Histograma de distribución de precios (estilo Zillow) para el filtro de
// presupuesto. Barras = cantidad de propiedades por rango; la parte DENTRO del
// rango seleccionado se pinta salvia, el resto muted. Estilos inline → el mismo
// componente sirve en ventas (oscuro) y alquileres (arena) sin CSS externo.
export function buildHistogram(values: number[], min: number, max: number, bins: number): number[] {
  const counts = new Array(bins).fill(0)
  if (max <= min) return counts
  const w = (max - min) / bins
  for (const v of values) {
    if (v == null || Number.isNaN(v) || v <= 0) continue
    const clamped = Math.max(min, Math.min(max, v))
    let b = Math.floor((clamped - min) / w)
    if (b >= bins) b = bins - 1
    if (b < 0) b = 0
    counts[b]++
  }
  return counts
}

export default function PriceHistogram({
  values, min, max, selMin, selMax, dark = false, bins = 30,
}: {
  values: number[]
  min: number
  max: number
  selMin: number
  selMax: number
  dark?: boolean
  bins?: number
}) {
  const counts = useMemo(() => buildHistogram(values, min, max, bins), [values, min, max, bins])
  const peak = Math.max(1, ...counts)
  if (values.length === 0) return null
  const w = (max - min) / bins
  const cIn = dark ? '#7BB389' : '#3A6A48'
  const cOut = dark ? 'rgba(237,232,220,0.16)' : '#D8D0BC'
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40, marginBottom: 6 }}>
      {counts.map((c, i) => {
        const binLo = min + i * w
        const binHi = binLo + w
        const inRange = binHi > selMin && binLo < selMax
        const h = c > 0 ? Math.max(8, Math.round((c / peak) * 100)) : 4
        return (
          <span key={i} style={{
            flex: 1,
            height: `${h}%`,
            borderRadius: '2px 2px 0 0',
            background: inRange ? cIn : cOut,
            transition: 'background 0.15s',
          }} />
        )
      })}
    </div>
  )
}
