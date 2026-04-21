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

  const fuenteBars = data.panorama.byFuente
    .map(f => `<div class="bar-row"><span>${f.label}</span><div class="bar-track"><div class="bar-fill" style="width:${f.pctTotal}%"></div></div><span class="bar-val">${f.uds} (${f.pctTotal.toFixed(1)}%)</span></div>`)
    .join('\n  ')

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
  ${fuenteBars}
</section>
`
}
