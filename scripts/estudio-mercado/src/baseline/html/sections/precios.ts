import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'

const ZONA_LONG: Record<string, string> = {
  'Equipetrol Centro': 'Equipetrol Centro',
  'Equipetrol Norte': 'Equipetrol Norte',
  'Equipetrol Oeste': 'Equipetrol Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'Villa Brígida',
}

const DORM_LABEL: Record<number, string> = {
  0: '0D',
  1: '1D',
  2: '2D',
  3: '3D',
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
        ? `<td rowspan="${segs.length}"><strong>${ZONA_LONG[zona] ?? zona}</strong></td>`
        : ''
      filas.push(`    <tr>
      ${zonaCell}<td>${DORM_LABEL[s.dorms] ?? s.dorms + 'D'}</td><td class="num${numClass}">${s.n}${nSuffix}</td><td class="num${numClass}">$${s.mediana.toLocaleString()}</td><td class="num${numClass}">$${s.p25.toLocaleString()} – $${s.p75.toLocaleString()}</td><td class="num${numClass}">$${s.medianaM2.toLocaleString()}</td>
    </tr>`)
    })
  }

  return `
<!-- 6. PRECIOS PUBLICADOS -->
<section id="s6">
  <span class="section-num">06 · Precios publicados</span>
  <h2>Rangos reales, no promedios</h2>
  <p class="lead">${narrativa.render('s6.lead', vars)}</p>

  <h3>Tabla maestra de precios por zona × dormitorios</h3>
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

  <div class="chart-wrap">
    <div class="chart-title">Rango de precios (P25 – P75) por zona y dormitorios</div>
    <div class="chart-subtitle">USD normalizados · línea marca la mediana · solo segmentos con n ≥ 20</div>
    <div class="chart-canvas-tall"><canvas id="chartPrecios"></canvas></div>
  </div>

  <h3>Lectura</h3>
  <p>${narrativa.render('s6.lectura_p1', vars)}</p>
  <p>${narrativa.render('s6.lectura_p2', vars)}</p>
</section>
`
}
