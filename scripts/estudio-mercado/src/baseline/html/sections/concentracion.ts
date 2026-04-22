import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'

const FASE_COLOR: Record<string, string> = {
  'Entrega': '#3A6A48',
  'Preventa': '#7BA687',
  'Mixto': '#C08A2E',
  'Nuevo': '#5A5A5A',
  'No esp.': '#8A8A8A',
}

export function renderConcentracion(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const pctMaxDesarrolladora = data.proyectos.concentracion.length > 0
    ? Math.round((data.proyectos.concentracion[0].unidadesTotal / data.panorama.totalVenta) * 100)
    : 0

  const vars = {
    zonaLabel: data.config.zonaLabel,
    totalTopUnidades: data.proyectos.totalTopUnidades,
    pctTopSobreTotal: data.proyectos.pctTopSobreTotal.toFixed(0),
    pctMaxDesarrolladora,
  }

  const maxUds = data.proyectos.top.length > 0
    ? Math.max(...data.proyectos.top.map(p => p.unidades))
    : 1

  // Agrupar por zona (ordenada por inventario agregado desc)
  const porZona = new Map<string, typeof data.proyectos.top>()
  for (const p of data.proyectos.top) {
    const arr = porZona.get(p.zona) ?? []
    arr.push(p)
    porZona.set(p.zona, arr)
  }
  const zonasOrdenadas = [...porZona.entries()]
    .sort((a, b) => b[1].reduce((s, p) => s + p.unidades, 0) - a[1].reduce((s, p) => s + p.unidades, 0))

  const gruposHTML = zonasOrdenadas.map(([zona, proyectos]) => {
    const totalZona = proyectos.reduce((s, p) => s + p.unidades, 0)
    const filas = proyectos.sort((a, b) => b.unidades - a.unidades).map(p => {
      const widthPct = (p.unidades / maxUds) * 100
      const color = FASE_COLOR[p.faseDominante] ?? FASE_COLOR['No esp.']
      const desc = p.desarrolladora ?? '<span class="proy-sindev">sin declarar</span>'
      return `      <div class="proy-row">
        <div class="proy-name">
          <strong>${p.nombreProyecto}</strong>
          <span class="proy-dev">${desc}</span>
        </div>
        <div class="proy-bar-wrap">
          <div class="proy-bar" style="width:${widthPct.toFixed(1)}%;background:${color}" title="${p.faseDominante}"></div>
        </div>
        <div class="proy-uds">${p.unidades}</div>
      </div>`
    }).join('\n')

    return `    <div class="proy-zona-group">
      <div class="proy-zona-header">
        <span class="proy-zona-name">${zona}</span>
        <span class="proy-zona-meta">${proyectos.length} proyectos · ${totalZona} unidades</span>
      </div>
${filas}
    </div>`
  }).join('\n')

  const concentracionItems = data.proyectos.concentracion.slice(0, 6).map(c => {
    const proyectosTxt = c.proyectos.slice(0, 4).join(', ')
    const submercadosTxt = c.submercados.length === 1
      ? c.submercados[0]
      : c.submercados.length === 2
        ? `${c.submercados[0]} y ${c.submercados[1]}`
        : `${c.submercados.length} submercados distintos`
    return `    <li><strong>${c.desarrolladora}</strong> — ${c.proyectos.length} proyectos (${proyectosTxt}) — ${c.unidadesTotal} unidades activas en ${submercadosTxt}.</li>`
  }).join('\n')

  return `
<!-- 7. CONCENTRACIÓN POR DESARROLLADORA -->
<section id="s7">
  <span class="section-num">07 · Concentración</span>
  <h2>Quién construye qué, dónde</h2>
  <p class="lead">${narrativa.render('s7.lead', vars)}</p>

  <h3>Proyectos con ${data.proyectos.minUnidades} o más unidades activas</h3>

  <div class="proy-legend">
    <span><span class="sw" style="background:${FASE_COLOR['Entrega']}"></span>Entrega</span>
    <span><span class="sw" style="background:${FASE_COLOR['Preventa']}"></span>Preventa</span>
    <span><span class="sw" style="background:${FASE_COLOR['Mixto']}"></span>Mixto</span>
    <span><span class="sw" style="background:${FASE_COLOR['No esp.']}"></span>No especificado</span>
  </div>

  <div class="proy-chart">
${gruposHTML}
  </div>

  <p class="muted">${narrativa.render('s7.tabla_nota', vars)}</p>

  <h3>Concentración por desarrolladora</h3>
  <p>${narrativa.render('s7.concentracion_intro', vars)}</p>
  <ul>
${concentracionItems}
  </ul>
  <p>${narrativa.render('s7.concentracion_cierre', vars)}</p>
</section>
`
}
