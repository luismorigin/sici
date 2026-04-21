import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'

const ZONA_LONG: Record<string, string> = {
  'Equipetrol Centro': 'Equipetrol Centro',
  'Equipetrol Norte': 'Equipetrol Norte',
  'Equipetrol Oeste': 'Equipetrol Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'Villa Brígida',
}

export function renderOferta(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const vars = { zonaLabel: data.config.zonaLabel }

  // Tabla inventario por zona × dorms
  const invRows = data.demanda.inventarioPorZonaDorms
    .map(z => {
      const d0 = z.porDorms[0] ?? 0
      const d1 = z.porDorms[1] ?? 0
      const d2 = z.porDorms[2] ?? 0
      const d3 = z.porDorms[3] ?? 0
      return `    <tr><td>${ZONA_LONG[z.zona] ?? z.zona}</td><td class="num">${d0}</td><td class="num">${d1}</td><td class="num">${d2}</td><td class="num">${d3}</td><td class="num"><strong>${z.total}</strong></td></tr>`
    })
    .join('\n')

  const totalD0 = data.demanda.totalPorDorms[0] ?? 0
  const totalD1 = data.demanda.totalPorDorms[1] ?? 0
  const totalD2 = data.demanda.totalPorDorms[2] ?? 0
  const totalD3 = data.demanda.totalPorDorms[3] ?? 0
  const totalGeneral = data.demanda.totalGeneral

  const pctD0 = Math.round((totalD0 / totalGeneral) * 100)
  const pctD1 = Math.round((totalD1 / totalGeneral) * 100)
  const pctD2 = Math.round((totalD2 / totalGeneral) * 100)
  const pctD3 = Math.round((totalD3 / totalGeneral) * 100)

  const totalRow = `    <tr style="background:var(--arena-dark);font-weight:600;"><td>Total ${data.config.zonaLabel}</td><td class="num">${totalD0}</td><td class="num">${totalD1}</td><td class="num">${totalD2}</td><td class="num">${totalD3}</td><td class="num">${totalGeneral}</td></tr>`

  const invNota = `La oferta dominante es 1 dormitorio (${pctD1}%) seguido por 2 dormitorios (${pctD2}%). Los monoambientes (0 dorms) son ${pctD0}% del total. Los 3 dormitorios representan ${pctD3}% — señal clara de un mercado orientado al comprador joven-individual y al inversionista de producto pequeño. (La diferencia con ${data.panorama.totalVenta} son unidades con dormitorios no declarados o fuera de rango.)`

  // Tabla tamaño mediano por zona × dorms (ordenado por tamaño 1D)
  const tamRows = [...data.demanda.tamanoPorZonaDorms]
    .sort((a, b) => (a.medianaM2PorDorms[1] ?? 0) - (b.medianaM2PorDorms[1] ?? 0))
    .map(z => {
      const m1 = z.medianaM2PorDorms[1] ?? 0
      const m2 = z.medianaM2PorDorms[2] ?? 0
      const m3 = z.medianaM2PorDorms[3] ?? 0
      return `    <tr><td>${ZONA_LONG[z.zona] ?? z.zona}</td><td class="num">${m1}</td><td class="num">${m2}</td><td class="num">${m3}</td></tr>`
    })
    .join('\n')

  // Mix entrega/preventa (entrega incluye nuevo a estrenar)
  const mixRows = data.demanda.mixEstadoPorZona
    .map(m => `    <tr><td>${ZONA_LONG[m.zona] ?? m.zona}</td><td class="num">${m.entrega}</td><td class="num">${m.preventa}</td><td class="num">${m.noEsp}</td><td class="num"><strong>${m.pctEntrega}%</strong></td></tr>`)
    .join('\n')

  return `
<!-- 5. DISTRIBUCIÓN DE OFERTA -->
<section id="s5">
  <span class="section-num">05 · Distribución de oferta</span>
  <h2>Tipología, tamaño y fase de obra</h2>

  <h3>Inventario por zona y dormitorios</h3>
  <table>
    <tr><th>Zona</th><th class="num">0D</th><th class="num">1D</th><th class="num">2D</th><th class="num">3D</th><th class="num">Total</th></tr>
${invRows}
${totalRow}
  </table>
  <p class="muted">${invNota}</p>

  <h3>Tamaño mediano por zona y dormitorios</h3>
  <p>${narrativa.render('s5.tamano_nota', vars)}</p>
  <table>
    <tr><th>Zona</th><th class="num">1D m²</th><th class="num">2D m²</th><th class="num">3D m²</th></tr>
${tamRows}
  </table>

  <h3>Antigüedad del listado por zona × dormitorios</h3>
  <div class="chart-wrap">
    <div class="chart-title">Mediana de días desde publicación del aviso hasta la fecha de corte</div>
    <div class="chart-subtitle">${narrativa.render('s5.dias_subtitle', vars)}</div>
    <div class="chart-canvas"><canvas id="chartDias"></canvas></div>
  </div>

  <h3>Mix entrega / preventa por zona</h3>
  <table>
    <tr><th>Zona</th><th class="num">Entrega*</th><th class="num">Preventa</th><th class="num">No esp.</th><th class="num">% Entrega</th></tr>
${mixRows}
  </table>
  <p class="muted">\* "Entrega" incluye tanto unidades declaradas como "entrega inmediata" como "nuevo a estrenar" — son equivalentes para el comprador (departamento listo, nunca habitado).</p>
  <p>${narrativa.render('s5.mix_lectura', vars)}</p>
</section>
`
}
