import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'

function formatFechaCorta(isoDate: string): string {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  const dia = d.getDate()
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${dia} ${meses[d.getMonth()]} ${d.getFullYear()}`
}

export function renderMetodologia(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const fuentes = data.panorama.byFuente
  const fuentesComposicion = fuentes
    .map(f => `${f.label} ${f.pctTotal.toFixed(0)}% (${f.uds} unidades)`)
    .join(', ')

  const tcEjemplo = Math.round(150000 * data.tc.paralelo / data.tc.oficial).toLocaleString()

  const vars = {
    zonaLabel: data.config.zonaLabel,
    zonasCount: data.panorama.totalZonas,
    totalVenta: data.panorama.totalVenta,
    totalAlquiler: data.panorama.totalAlquiler,
    fechaCorte: data.config.fechaCorte,
    fuentesComposicion,
    inventarioEstancado: data.panorama.inventarioEstancado,
    inventarioEstancadoPct: data.panorama.inventarioEstancadoPct.toFixed(1),
    tcParalelo: data.tc.paralelo.toFixed(2),
    tcOficial: data.tc.oficial.toFixed(2),
    tcEjemploCalculo: tcEjemplo,
    tcSpread: data.tc.spread.toFixed(1),
    fechaCorteTCParalelo: formatFechaCorta(data.tc.fechaParalelo),
  }

  return `
<!-- 2. METODOLOGÍA -->
<section id="s2">
  <span class="section-num">02 · Metodología</span>
  <h2>Qué miramos, qué no, con qué filtros</h2>

  <h3>Universo observable</h3>
  <p>${narrativa.render('s2.universo_p1', vars)}</p>
  <p>${narrativa.render('s2.universo_p2', vars)}</p>

  <h3>Filtros de calidad aplicados</h3>
  <p>${narrativa.render('s2.filtros_intro', vars)}</p>
  <ul>
    <li>Propiedad activa: <code>status ∈ (completado, actualizado)</code></li>
    <li>Sin duplicados: <code>duplicado_de IS NULL</code></li>
    <li>Tipología depto: excluye parqueo, baulera, garaje, depósito</li>
    <li>Área mínima 20 m² (filtro secundario contra parqueos mal clasificados)</li>
    <li>Sin multiproyectos (una misma unidad no se cuenta dos veces)</li>
    <li>Antigüedad del listado: ≤300 días para entrega inmediata, ≤730 para preventa (venta); ≤150 días (alquiler)</li>
  </ul>

  <div class="caveat">
    <strong>Sobre el filtro de antigüedad — inventario estancado no incluido</strong>
    ${narrativa.render('s2.inventario_estancado', vars)}
  </div>

  <h3>Precio normalizado — la unidad que usamos para comparar</h3>
  <p>${narrativa.render('s2.tc_intro', vars)}</p>

  <div class="note" style="padding:20px 24px;">
    <table style="margin:0 0 16px 0;">
      <tr><th>Tipo de cambio</th><th class="num">Valor</th><th>Fuente</th></tr>
      <tr><td><strong>Oficial</strong> (fijo por política cambiaria)</td><td class="num">${data.tc.oficial.toFixed(2)} Bs/USD</td><td>Banco Central de Bolivia</td></tr>
      <tr><td><strong>Paralelo</strong> (cotización libre, se actualiza diario)</td><td class="num">${data.tc.paralelo.toFixed(2)} Bs/USD</td><td>Binance P2P, captura del ${formatFechaCorta(data.tc.fechaParalelo)}</td></tr>
      <tr style="background:var(--arena-dark);"><td><strong>Spread paralelo sobre oficial</strong></td><td class="num"><strong>+${data.tc.spread.toFixed(1)}%</strong></td><td>—</td></tr>
    </table>
    <p style="margin-bottom:0;font-size:14px;color:var(--negro-soft);">${narrativa.render('s2.tc_nota', vars)}</p>
  </div>

  <p>${narrativa.render('s2.tc_explicacion_p1', vars)}</p>
  <p>${narrativa.render('s2.tc_explicacion_p2', vars)}</p>

  <h4>Ejemplo — dos listings con el mismo "USD 150,000" publicado</h4>
  <table>
    <tr><th>Listing</th><th>Cómo se publica</th><th class="num">Precio publicado</th><th class="num">Precio normalizado</th></tr>
    <tr><td>Depto A</td><td>USD al oficial</td><td class="num">$150,000</td><td class="num">$150,000</td></tr>
    <tr><td>Depto B</td><td>USD billete (al paralelo)</td><td class="num">$150,000</td><td class="num"><strong>$${tcEjemplo}</strong></td></tr>
  </table>
  <p class="muted">${narrativa.render('s2.tc_ejemplo_nota', vars)}</p>

  <p>${narrativa.render('s2.tc_cierre', vars)}</p>

  <div class="caveat">
    <strong>Lo que el precio normalizado NO es</strong>
    ${narrativa.render('s2.tc_no_es', vars)}
  </div>

  <h3>Antigüedad del listado — qué medimos y qué no</h3>
  <p>${narrativa.render('s2.antiguedad_intro', vars)}</p>

  <table>
    <tr>
      <th>Métrica</th>
      <th>Qué mide</th>
      <th>Cuándo empieza a contar</th>
    </tr>
    <tr>
      <td><strong>Antigüedad del listado</strong><br>(lo que este reporte publica)</td>
      <td>Días que lleva publicado <em>este listing específico</em> en Century21 o Remax</td>
      <td>Fecha de publicación del aviso actual en el portal</td>
    </tr>
    <tr>
      <td><strong>Días en el mercado real</strong><br>(lo que NO medimos)</td>
      <td>Tiempo total que el dueño lleva tratando de vender la propiedad</td>
      <td>El día que el dueño decidió vender — independiente de si usó portal, qué agencia, o ninguna</td>
    </tr>
  </table>

  <p>${narrativa.render('s2.antiguedad_body', vars)}</p>

  <p>${narrativa.render('s2.antiguedad_consecuencia', vars)}</p>

  <h3>Otras definiciones operativas</h3>
  <table>
    <tr><th>Término</th><th>Cómo lo usamos</th></tr>
    <tr><td><strong>Precio publicado</strong></td><td>Precio de publicación (ya normalizado al oficial para este reporte). No es precio de cierre. La brecha típica entre publicación y cierre es 5–15% en venta.</td></tr>
    <tr><td><strong>$/m²</strong></td><td>Precio normalizado dividido por área construida total declarada.</td></tr>
    <tr><td><strong>Mediana / P25 / P75</strong></td><td>Estadísticos de distribución. Se usan medianas (no medias) para reducir el efecto de outliers en muestras chicas.</td></tr>
  </table>

  <h3>Fechas de corte</h3>
  <p>${narrativa.render('s2.fechas_corte', vars)}</p>
</section>
`
}
