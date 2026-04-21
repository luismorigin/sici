import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'

const ZONA_LONG: Record<string, string> = {
  'Equipetrol Centro': 'Equipetrol Centro',
  'Equipetrol Norte': 'Equipetrol Norte',
  'Equipetrol Oeste': 'Equipetrol Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'Villa Brígida',
}

const PERFILES_ATAJO: Record<string, string> = {
  'Equipetrol Centro': 'Core, mayor volumen, entrega dominante',
  'Sirari': 'Premium, dominio preventa',
  'Villa Brigida': 'Entry-level, emergente',
  'Equipetrol Oeste': 'Mixto: premium + universitario',
  'Equipetrol Norte': 'Financiero, inventario chico',
}

function fullName(z: string): string {
  return ZONA_LONG[z] ?? z
}

export function renderSubmercados(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const vars = {
    zonaLabel: data.config.zonaLabel,
    zonasCount: data.panorama.totalZonas,
  }

  const filas = data.panorama.byZona.map(z => {
    const perfil = PERFILES_ATAJO[z.zona] ?? '—'
    return `    <tr>
      <td><strong>${fullName(z.zona)}</strong></td>
      <td class="num">${z.inventario}</td>
      <td class="num">$${z.medianaM2.toLocaleString()}</td>
      <td class="num">$${z.medianaTicket.toLocaleString()}</td>
      <td class="num">${z.medianaDias1D} d</td>
      <td>${perfil}</td>
    </tr>`
  }).join('\n')

  // Lectura por submercado: renderizamos cada perfil con data de su zona
  const rotMap = new Map<string, Map<number, number>>()
  for (const r of data.rotacion.porZonaDorms) {
    const inner = rotMap.get(r.zona) ?? new Map()
    inner.set(r.dorms, r.medianaDias)
    rotMap.set(r.zona, inner)
  }

  const mixMap = new Map(data.demanda.mixEstadoPorZona.map(m => [m.zona, m]))

  const perfilesHTML = data.panorama.byZona.map(z => {
    const zona = z.zona
    const mix = mixMap.get(zona)
    const rot = rotMap.get(zona)
    const totalMix = mix ? mix.entrega + mix.preventa + mix.noEsp : 1
    const pctPreventa = mix ? Math.round((mix.preventa / totalMix) * 100) : 0

    const perfilVars = {
      zonaLabel: data.config.zonaLabel,
      uds: z.inventario,
      medianaTicket: z.medianaTicket.toLocaleString(),
      medianaM2: z.medianaM2.toLocaleString(),
      pctEntrega: mix?.pctEntrega ?? 0,
      pctPreventa,
      preventaUds: mix?.preventa ?? 0,
      dias1D: rot?.get(1) ?? 0,
      dias2D: rot?.get(2) ?? 0,
      dias3D: rot?.get(3) ?? 0,
    }

    const key = `s4.perfil.${zona}`
    if (!narrativa.has(key)) return ''
    return `    <div>
      <h4>${fullName(zona)}</h4>
      <p>${narrativa.render(key, perfilVars)}</p>
    </div>`
  }).filter(Boolean)

  // Repartir en 2 columnas: primera mitad en col izq, segunda en col der
  const mid = Math.ceil(perfilesHTML.length / 2)
  const col1 = perfilesHTML.slice(0, mid).join('\n')
  const col2 = perfilesHTML.slice(mid).join('\n')

  return `
<!-- 4. LOS SUBMERCADOS -->
<section id="s4">
  <span class="section-num">04 · Los submercados</span>
  <h2>${data.panorama.totalZonas} polígonos, ${data.panorama.totalZonas} dinámicas</h2>
  <p class="lead">${narrativa.render('s4.lead', vars)}</p>

  <h3>Tabla maestra de submercados</h3>
  <table>
    <tr>
      <th>Submercado</th>
      <th class="num">Inventario</th>
      <th class="num">$/m² med.</th>
      <th class="num">Ticket med.</th>
      <th class="num">Antigüedad listado* (1D)</th>
      <th>Perfil</th>
    </tr>
${filas}
  </table>
  <p class="muted">${narrativa.render('s4.tabla_nota', vars)}</p>

  <div class="chart-wrap">
    <div class="chart-title">Inventario por submercado · split por estado de obra</div>
    <div class="chart-subtitle">Unidades activas al corte · filtros de calidad aplicados</div>
    <div class="chart-canvas"><canvas id="chartInventario"></canvas></div>
  </div>

  <div class="chart-wrap">
    <div class="chart-title">Precio mediano por metro cuadrado</div>
    <div class="chart-subtitle">USD normalizados al tipo de cambio oficial · agregado por submercado</div>
    <div class="chart-canvas"><canvas id="chartM2"></canvas></div>
  </div>

  <h3>Lectura por submercado</h3>
  <div class="two-col">
    <div>
${col1}
    </div>
    <div>
${col2}
    </div>
  </div>

  <div class="caveat">
    <strong>Submercado excluido</strong>
    ${narrativa.render('s4.excluidos', vars)}
  </div>
</section>
`
}
