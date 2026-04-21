import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'

const ZONA_LONG: Record<string, string> = {
  'Equipetrol Centro': 'Equipetrol Centro',
  'Equipetrol Norte': 'Equipetrol Norte',
  'Equipetrol Oeste': 'Equipetrol Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'Villa Brígida',
}

export function renderAlquiler(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const comp = data.alquiler.composicionAmoblado
  const pctAmoblado = comp.find(c => c.categoria === 'amoblado')?.pct ?? 0
  const pctSinDeclarar = comp.find(c => c.categoria === 'sin_declarar')?.pct ?? 0
  const pctNoAmoblado = comp.find(c => c.categoria === 'no_amoblado')?.pct ?? 0
  const pctSemi = comp.find(c => c.categoria === 'semi')?.pct ?? 0

  const dormsAmob = data.alquiler.porDormsAmoblado
  const r1Amob = dormsAmob.find(d => d.dorms === 1 && d.categoria === 'amoblado')?.medianaRenta ?? 0
  const r1NoAmob = dormsAmob.find(d => d.dorms === 1 && d.categoria === 'no_amoblado')?.medianaRenta ?? 0
  const r2Amob = dormsAmob.find(d => d.dorms === 2 && d.categoria === 'amoblado')?.medianaRenta ?? 0
  const r2NoAmob = dormsAmob.find(d => d.dorms === 2 && d.categoria === 'no_amoblado')?.medianaRenta ?? 0
  const r2SinDec = dormsAmob.find(d => d.dorms === 2 && d.categoria === 'sin_declarar')?.medianaRenta ?? 0

  const vars = {
    zonaLabel: data.config.zonaLabel,
    totalAlquiler: data.alquiler.total,
    totalVenta: data.panorama.totalVenta,
    pctAmoblado: pctAmoblado.toFixed(0),
    pctSinDeclarar: pctSinDeclarar.toFixed(0),
    pctNoAmoblado: pctNoAmoblado.toFixed(0),
    pctSemi: pctSemi.toFixed(0),
    renta1DAmoblado: r1Amob.toLocaleString(),
    renta1DNoAmoblado: r1NoAmob.toLocaleString(),
    renta2DAmoblado: r2Amob.toLocaleString(),
    renta2DNoAmoblado: r2NoAmob.toLocaleString(),
    renta2DSinDeclarar: r2SinDec.toLocaleString(),
  }

  const filasZona = data.alquiler.porZona
    .map(z => {
      const cls = z.muestraMarginal ? ' n' : ''
      const suf = z.muestraMarginal ? '*' : ''
      return `    <tr><td>${ZONA_LONG[z.zona] ?? z.zona}</td><td class="num${cls}">${z.n}${suf}</td><td class="num${cls}">$${z.medianaRenta.toLocaleString()}</td><td class="num${cls}">$${z.avgRenta.toLocaleString()}</td></tr>`
    })
    .join('\n')

  // Agrupar porDormsAmoblado con rowspan por dorm
  const dormGroups = new Map<number, typeof dormsAmob>()
  for (const d of dormsAmob) {
    const arr = dormGroups.get(d.dorms) ?? []
    arr.push(d)
    dormGroups.set(d.dorms, arr)
  }

  const filasDorms: string[] = []
  for (const [dorm, grupos] of [...dormGroups.entries()].sort((a, b) => a[0] - b[0])) {
    grupos.forEach((g, idx) => {
      const dormCell = idx === 0 ? `<td rowspan="${grupos.length}">${dorm}D</td>` : ''
      filasDorms.push(`    <tr>${dormCell}<td>${g.label}</td><td class="num">${g.n}</td><td class="num">$${g.medianaRenta.toLocaleString()}</td></tr>`)
    })
  }

  return `
<!-- 8. ALQUILER -->
<section id="s8">
  <span class="section-num">08 · Alquiler</span>
  <h2>Un mercado con menos datos y más ruido</h2>
  <p class="lead">${narrativa.render('s8.lead', vars)}</p>

  <h3>Inventario y rentas medianas por submercado</h3>
  <table>
    <tr><th>Zona</th><th class="num">n</th><th class="num">Renta mediana USD</th><th class="num">Renta promedio USD</th></tr>
${filasZona}
  </table>
  <p class="muted">${narrativa.render('s8.rentas_nota', vars)}</p>

  <div class="caveat">
    <strong>Caveat obligatorio — mezcla amoblado / no amoblado</strong>
    ${narrativa.render('s8.caveat_amoblado', vars)}
  </div>

  <h3>Diferencia por estado de amoblado (agregado ${data.config.zonaLabel})</h3>
  <table>
    <tr><th>Dorms</th><th>Amoblado declarado</th><th class="num">n</th><th class="num">Renta mediana</th></tr>
${filasDorms.join('\n')}
  </table>

  <h3>Una anomalía que vale la pena señalar</h3>
  <p>${narrativa.render('s8.anomalia_p1', vars)}</p>
  <p>${narrativa.render('s8.anomalia_p2', vars)}</p>
  <p>${narrativa.render('s8.anomalia_cierre', vars)}</p>
</section>
`
}
