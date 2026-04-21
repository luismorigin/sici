import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'

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

  const filas = data.proyectos.top.map(p => {
    const desc = p.desarrolladora ?? '—'
    return `    <tr><td>${p.nombreProyecto}</td><td>${p.zona}</td><td>${desc}</td><td>${p.faseDominante}</td><td class="num">${p.unidades}</td></tr>`
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
  <table>
    <tr><th>Proyecto</th><th>Zona</th><th>Desarrolladora</th><th>Fase</th><th class="num">Unidades</th></tr>
${filas}
  </table>
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
