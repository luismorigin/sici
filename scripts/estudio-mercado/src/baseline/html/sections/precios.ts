import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'
import { zonaLong, dormLabel } from '../labels.js'

function renderDotPlot(data: BaselineResult): string {
  const segs = data.precios.rangosChart
  if (segs.length === 0) return ''

  const allVals = segs.flatMap(s => [s.p25, s.p75])
  const minVal = Math.floor(Math.min(...allVals) / 10000) * 10000
  const maxVal = Math.ceil(Math.max(...allVals) / 10000) * 10000
  const range = maxVal - minVal || 1

  const xPct = (v: number) => ((v - minVal) / range) * 100

  const rows = segs.map(s => {
    const p25x = xPct(s.p25).toFixed(2)
    const p75x = xPct(s.p75).toFixed(2)
    const medx = xPct(s.med).toFixed(2)
    const medK = `$${(s.med / 1000).toFixed(0)}K`

    return `  <div class="dotplot-row">
    <div class="dp-label">${s.label}</div>
    <svg class="dotplot-svg" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
      <line x1="${p25x}" y1="10" x2="${p75x}" y2="10" stroke="#7BA687" stroke-width="1.5"/>
      <circle cx="${p25x}" cy="10" r="2.2" fill="#8A8A8A"/>
      <circle cx="${p75x}" cy="10" r="2.2" fill="#8A8A8A"/>
      <circle cx="${medx}" cy="10" r="3.5" fill="#141414"/>
    </svg>
    <div class="dp-val">mediana <strong>${medK}</strong></div>
  </div>`
  }).join('\n')

  const tickMid = Math.round((minVal + maxVal) / 2 / 10000) * 10000

  return `
<div class="dotplot-wrap">
  <div class="chart-title">Rango de precios (P25 — P75) por zona y dormitorios</div>
  <div class="chart-subtitle">USD normalizados · punto grande negro marca la mediana · puntos gris P25 y P75 · solo segmentos con n ≥ 20</div>
${rows}
  <div class="dotplot-axis">
    <span></span>
    <span class="dp-scale">
      <span>$${(minVal / 1000).toFixed(0)}K</span>
      <span>$${(tickMid / 1000).toFixed(0)}K</span>
      <span>$${(maxVal / 1000).toFixed(0)}K</span>
    </span>
    <span></span>
  </div>
</div>
`
}

export function renderPrecios(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const vars = { zonaLabel: data.config.zonaLabel }

  // Agrupar segmentos por zona para rowspan
  const porZona = new Map<string, typeof data.precios.segmentos>()
  for (const seg of data.precios.segmentos) {
    const arr = porZona.get(seg.zona) ?? []
    arr.push(seg)
    porZona.set(seg.zona, arr)
  }

  const filas: string[] = []
  for (const [zona, segs] of porZona) {
    segs.forEach((s, idx) => {
      const numClass = s.muestraMarginal ? ' n' : ''
      const nSuffix = s.muestraMarginal ? '*' : ''
      const zonaCell = idx === 0
        ? `<td rowspan="${segs.length}"><strong>${zonaLong(zona)}</strong></td>`
        : ''
      filas.push(`    <tr>
      ${zonaCell}<td>${dormLabel(s.dorms)}</td><td class="num${numClass}">${s.n}${nSuffix}</td><td class="num${numClass}">$${s.mediana.toLocaleString()}</td><td class="num${numClass}">$${s.p25.toLocaleString()} – $${s.p75.toLocaleString()}</td><td class="num${numClass}">$${s.medianaM2.toLocaleString()}</td>
    </tr>`)
    })
  }

  return `
<!-- 5. PRECIOS PUBLICADOS -->
<section id="s6">
  <span class="section-num">05 · Precios publicados</span>
  <h2>Rangos reales, no promedios</h2>
  <p class="lead">${narrativa.render('s6.lead', vars)}</p>

${renderDotPlot(data)}

  <h3>Lectura</h3>
  <p>${narrativa.render('s6.lectura_p1', vars)}</p>
  <p>${narrativa.render('s6.lectura_p2', vars)}</p>

  <details class="details-table">
    <summary>Ver tabla detallada por zona × dormitorios</summary>
    <table>
      <tr>
        <th>Zona</th><th>Dorms</th>
        <th class="num">n</th>
        <th class="num">Mediana USD</th>
        <th class="num">P25 – P75</th>
        <th class="num">$/m² med.</th>
      </tr>
${filas.join('\n')}
    </table>
    <p class="muted">${narrativa.render('s6.tabla_nota', vars)}</p>
  </details>
</section>
`
}
