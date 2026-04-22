import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'
import { zonaLong } from '../labels.js'

export function renderOferta(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const vars = { zonaLabel: data.config.zonaLabel }

  const totalD0 = data.demanda.totalPorDorms[0] ?? 0
  const totalD1 = data.demanda.totalPorDorms[1] ?? 0
  const totalD2 = data.demanda.totalPorDorms[2] ?? 0
  const totalD3 = data.demanda.totalPorDorms[3] ?? 0
  const totalGeneral = data.demanda.totalGeneral

  const pctD0 = Math.round((totalD0 / totalGeneral) * 100)
  const pctD1 = Math.round((totalD1 / totalGeneral) * 100)
  const pctD2 = Math.round((totalD2 / totalGeneral) * 100)
  const pctD3 = Math.round((totalD3 / totalGeneral) * 100)

  // Matriz consolidada: inventario Z×dorm + tamaño Z×dorm en 1 tabla
  const tamMap = new Map(data.demanda.tamanoPorZonaDorms.map(t => [t.zona, t.medianaM2PorDorms]))

  const fmtM2 = (v: number) => v > 0 ? String(v) : '—'

  const matrizRows = data.demanda.inventarioPorZonaDorms.map(z => {
    const inv = z.porDorms
    const tam = tamMap.get(z.zona) ?? {}
    return `    <tr>
      <td><strong>${zonaLong(z.zona)}</strong></td>
      <td class="num">${inv[0] ?? 0}</td>
      <td class="num">${inv[1] ?? 0}</td>
      <td class="num">${inv[2] ?? 0}</td>
      <td class="num">${inv[3] ?? 0}</td>
      <td class="num tot-cell"><strong>${z.total}</strong></td>
      <td class="num n">${fmtM2(tam[1] ?? 0)}</td>
      <td class="num n">${fmtM2(tam[2] ?? 0)}</td>
      <td class="num n">${fmtM2(tam[3] ?? 0)}</td>
    </tr>`
  }).join('\n')

  const totalRow = `    <tr style="background:var(--arena-dark);font-weight:600;">
      <td>Total ${data.config.zonaLabel}</td>
      <td class="num">${totalD0}</td>
      <td class="num">${totalD1}</td>
      <td class="num">${totalD2}</td>
      <td class="num">${totalD3}</td>
      <td class="num">${totalGeneral}</td>
      <td class="num n">—</td>
      <td class="num n">—</td>
      <td class="num n">—</td>
    </tr>`

  const invNota = `La oferta dominante es 1 dormitorio (${pctD1}%) seguido por 2 dormitorios (${pctD2}%). Los monoambientes son ${pctD0}% del total. Los 3 dormitorios representan ${pctD3}% — señal clara de un mercado orientado al comprador joven-individual y al inversionista de producto pequeño. (La diferencia con ${data.panorama.totalVenta} son unidades con dormitorios no declarados o fuera de rango.)`

  return `
<!-- 4. DISTRIBUCIÓN DE OFERTA -->
<section id="s5">
  <span class="section-num">04 · Distribución de oferta</span>
  <h2>Tipología y tamaño</h2>

  <p>${narrativa.render('s5.tamano_nota', vars)}</p>

  <table class="matriz-oferta">
    <tr>
      <th rowspan="2">Zona</th>
      <th class="num" colspan="5">Inventario por dormitorios</th>
      <th class="num" colspan="3">Tamaño mediano (m²)</th>
    </tr>
    <tr>
      <th class="num">Mono</th>
      <th class="num">1D</th>
      <th class="num">2D</th>
      <th class="num">3D</th>
      <th class="num">Total</th>
      <th class="num">1D</th>
      <th class="num">2D</th>
      <th class="num">3D</th>
    </tr>
${matrizRows}
${totalRow}
  </table>
  <p class="muted">${invNota}</p>
</section>
`
}
