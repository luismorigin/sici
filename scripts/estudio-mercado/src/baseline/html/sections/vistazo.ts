import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'

export function renderVistazo(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const pctEntrega = data.panorama.byEstado.find(e => e.estado === 'entrega_inmediata')?.pctTotal ?? 0
  const pctPreventa = data.panorama.byEstado.find(e => e.estado === 'preventa')?.pctTotal ?? 0

  const vars = {
    zonaLabel: data.config.zonaLabel,
    totalVenta: data.panorama.totalVenta,
    pctEntrega: pctEntrega.toFixed(0),
    pctPreventa: pctPreventa.toFixed(0),
  }

  const estadoRows = data.panorama.byEstado
    .map(e => `<tr><td>${e.label}</td><td class="num">${e.uds}</td><td class="num">${e.pctTotal.toFixed(1)}%</td></tr>`)
    .join('\n    ')

  // Donut chart para composición fuente (§3)
  const fuenteDonut = renderFuenteDonut(data.panorama.byFuente)

  return `
<!-- 3. EQUIPETROL DE UN VISTAZO -->
<section id="s3">
  <span class="section-num">03 · ${data.config.zonaLabel} de un vistazo</span>
  <h2>Los números macro del mercado</h2>

  <div class="kpi-hero">
    <div class="big"><span class="currency">$</span>${data.panorama.medianaM2Global.toLocaleString()}</div>
    <div class="context">
      <div class="kicker">Precio mediano por metro cuadrado</div>
      <div class="desc">${data.panorama.totalVenta} departamentos portal-observables en ${data.panorama.totalZonas} submercados de ${data.config.zonaLabel} al ${data.config.fechaCorte}. Precio normalizado a USD al tipo de cambio oficial.</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="label">Unidades en venta</div><div class="value">${data.panorama.totalVenta}</div><div class="sub">Portal-observables, al corte</div></div>
    <div class="kpi"><div class="label">Unidades en alquiler</div><div class="value">${data.panorama.totalAlquiler}</div><div class="sub">Activas ≤150 días</div></div>
    <div class="kpi"><div class="label">Submercados</div><div class="value">${data.panorama.totalZonas}</div><div class="sub">Polígonos GPS verificados</div></div>
    <div class="kpi"><div class="label">$/m² mediano</div><div class="value">$${data.panorama.medianaM2Global.toLocaleString()}</div><div class="sub">Agregado ${data.config.zonaLabel}</div></div>
  </div>

  <h3>Composición por estado de obra</h3>
  <table>
    <tr><th>Estado</th><th class="num">Unidades</th><th class="num">% del total</th></tr>
    ${estadoRows}
  </table>
  <p class="muted">${narrativa.render('s3.nota_estado', vars)}</p>

  <h3>Composición por fuente</h3>
  ${fuenteDonut}
</section>
`
}

function renderFuenteDonut(byFuente: Array<{ fuente: string; label: string; uds: number; pctTotal: number }>): string {
  const COLORS = ['#3A6A48', '#7BA687', '#C8D9CE', '#DFD8C5']
  const total = byFuente.reduce((s, f) => s + f.uds, 0)
  if (total === 0) return ''

  // SVG donut con paths (cada segmento es un arco)
  const cx = 90, cy = 90, r = 70, innerR = 42
  let currentAngle = -Math.PI / 2 // arrancar desde arriba

  const segments = byFuente.map((f, i) => {
    const frac = f.uds / total
    const startAngle = currentAngle
    const endAngle = currentAngle + frac * 2 * Math.PI
    currentAngle = endAngle

    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const x3 = cx + innerR * Math.cos(endAngle)
    const y3 = cy + innerR * Math.sin(endAngle)
    const x4 = cx + innerR * Math.cos(startAngle)
    const y4 = cy + innerR * Math.sin(startAngle)
    const largeArc = frac > 0.5 ? 1 : 0

    const d = [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
      'Z',
    ].join(' ')

    return `<path d="${d}" fill="${COLORS[i % COLORS.length]}"/>`
  }).join('')

  const legend = byFuente.map((f, i) => `
    <li>
      <span class="fuente-dot" style="background:${COLORS[i % COLORS.length]}"></span>
      <span class="fuente-label">${f.label}</span>
      <span class="fuente-num">${f.uds}</span>
      <span class="fuente-pct">${f.pctTotal.toFixed(1)}%</span>
    </li>`).join('')

  return `
<div class="fuente-donut-wrap">
  <svg viewBox="0 0 180 180" width="180" height="180" class="fuente-donut" aria-hidden="true">
    ${segments}
    <text x="90" y="85" text-anchor="middle" class="donut-total-num">${total}</text>
    <text x="90" y="102" text-anchor="middle" class="donut-total-label">listings</text>
  </svg>
  <ul class="fuente-legend">${legend}
  </ul>
</div>
`
}
