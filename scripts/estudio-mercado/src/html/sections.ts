import type {
  ClientConfig, EstudioCompleto, MarketCategory, ScarcityLevel,
  CompetidorInfo, YieldTipologia, PropRotada, SimulacionEscenario,
} from '../types.js'
import { barChartZonas, barChartDorms, scatterCompetidores } from './charts.js'

const fmt = (n: number) => '$' + n.toLocaleString('en-US')
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
const dormLabel = (d: number) => d === 0 ? 'Mono' : d + 'D'

function signalBadge(s: CompetidorInfo['signal']): string {
  return `<span class="signal signal-${s.toLowerCase()}">${s}</span>`
}

function scarcityBadge(level: ScarcityLevel): string {
  return `<span class="scarcity scarcity-${level.toLowerCase()}">${level}</span>`
}

function categoryBadge(cat: MarketCategory): string {
  const labels: Record<MarketCategory, string> = {
    oportunidad: 'Oportunidad', bajo_promedio: 'Bajo promedio',
    promedio: 'Promedio', sobre_promedio: 'Sobre promedio', premium: 'Premium',
  }
  return `<span class="cat-badge cat-${cat}">${labels[cat]}</span>`
}

// ───── 1. HERO ─────
export function renderHero(config: ClientConfig): string {
  const bgUrl = 'https://simonbo.com/condado-vi/balcon-plaza-v2.png'
  return `
<section class="hero has-bg" id="hero" style="background-image:url('${bgUrl}')">
  <div class="hero-panel" style="background:rgba(20,20,20,0.75);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:14px;padding:64px 56px;max-width:600px">
    <!-- Simon symbol animated -->
    <svg class="simon-symbol" width="48" height="48" viewBox="0 0 64 64" style="margin-bottom:28px">
      <circle class="sym-circle" cx="32" cy="34" r="28" fill="#EDE8DC"/>
      <circle class="sym-norte-outer" cx="32" cy="15" r="6" fill="#3A6A48"/>
      <circle class="sym-norte-inner" cx="32" cy="15" r="3" fill="#141414"/>
    </svg>
    <div class="hero-badge" style="border-color:rgba(58,106,72,0.5);color:#3A6A48">Estudio de Mercado</div>
    <h1 style="color:#EDE8DC">${config.projectName}</h1>
    <div class="hero-sub" style="color:#3A6A48">${config.projectSubtitle ?? config.developerName}</div>
    <div class="hero-line" style="background:#3A6A48"></div>
    <div class="hero-meta" style="color:#7A7060">
      <strong style="color:#EDE8DC">${config.fecha}</strong><br>
      ${config.fechaCorte ? `Corte de datos: ${config.fechaCorte}<br>` : ''}
      Zona: ${config.zona}<br>
      Elaborado por <strong style="color:#EDE8DC">Simon</strong> — Inteligencia Inmobiliaria
    </div>
  </div>
</section>`
}

// ───── 2. METODOLOGIA ─────
export function renderMetodologia(e: EstudioCompleto): string {
  return `
<section class="section bg-white" id="metodologia">
  <div class="section-inner reveal">
    <div class="badge">Metodologia</div>
    <div class="section-title">Como leemos el mercado</div>
    <div class="section-subtitle">
      Este estudio usa datos de portales inmobiliarios (Century21, Remax) procesados por Simon.
      Las metricas se calculan con medianas (no promedios) para reducir el impacto de valores extremos.
      Los precios se normalizan al tipo de cambio paralelo vigente (Bs ${e.tc.paralelo.toFixed(2)}) para comparabilidad.
    </div>
    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-value accent">${e.panorama.totalUnidades}</div>
        <div class="kpi-label">Unidades activas</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">${e.competidores.totalProyectos}</div>
        <div class="kpi-label">Proyectos en ${e.config.zona}</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">Bs ${e.tc.paralelo.toFixed(2)}</div>
        <div class="kpi-label">TC paralelo (Binance)</div>
      </div>
    </div>
    <p class="takeaway">
      Los datos provienen de listings activos en Century21 y Remax. Esto representa la oferta visible
      en portales, no necesariamente el inventario total de cada proyecto. El tiempo en mercado
      corresponde a la antig&uuml;edad del anuncio publicado, no a cu&aacute;nto tiempo lleva
      el proyecto vendiendo. Estas limitaciones aplican por igual a todos los proyectos analizados.
    </p>
  </div>
</section>`
}

// ───── 3. PANORAMA ─────
export function renderPanorama(e: EstudioCompleto): string {
  const zonas = e.panorama.byZona
  return `
<section class="section bg-marfil" id="panorama">
  <div class="section-inner reveal">
    <div class="badge">Panorama</div>
    <div class="section-title">El mercado de Equipetrol</div>
    <div class="section-subtitle">${e.panorama.totalUnidades} unidades activas en ${zonas.length} zonas. Mediana general: ${fmt(e.panorama.medianaM2Global)}/m².</div>
    <div class="kpi-grid" style="margin-bottom:48px">
      <div class="kpi">
        <div class="kpi-value accent">${fmt(e.panorama.medianaM2Global)}</div>
        <div class="kpi-label">Mediana $/m²</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">${fmt(e.panorama.medianaTicketGlobal)}</div>
        <div class="kpi-label">Ticket mediana</div>
      </div>
      <div class="kpi">
        <div class="kpi-value">${e.panorama.totalUnidades}</div>
        <div class="kpi-label">Unidades</div>
      </div>
    </div>
    <div class="chart-container" style="height:${Math.max(250, zonas.length * 55)}px">
      <canvas id="chartZonas"></canvas>
    </div>
    ${barChartZonas(zonas, 'chartZonas', e.panorama.medianaM2Global, e.posicion.proyectoM2, e.config.projectName.split(' ')[0])}
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Zona</th><th>Uds</th><th>$/m² med.</th><th>Ticket med.</th><th>Area prom.</th></tr></thead>
        <tbody>
          ${zonas.map(z => `<tr${z.zona === e.config.zona ? ' class="highlight"' : ''}>
            <td class="strong">${z.zona}</td><td>${z.uds}</td><td>${fmt(z.medianaM2)}</td>
            <td>${fmt(z.medianaTicket)}</td><td>${z.avgArea}m²</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
</section>`
}

// ───── 4. ZOOM ZONA ─────
export function renderZoomZona(e: EstudioCompleto): string {
  const demanda = e.demanda
  const highlightDorms = [...new Set(e.config.inventory.map(u => u.dorms))]
  return `
<section class="section bg-white" id="zoom">
  <div class="section-inner reveal">
    <div class="badge">${e.config.zona}</div>
    <div class="section-title">Inventario por tipologia</div>
    <div class="section-subtitle">${demanda.totalZona} unidades activas. Las barras destacadas corresponden a las tipologias de ${e.config.projectName}.</div>
    <div class="chart-container" style="height:300px">
      <canvas id="chartDorms"></canvas>
    </div>
    ${barChartDorms(demanda.byDorms, 'chartDorms', highlightDorms)}
  </div>
</section>`
}

// ───── 5. DEMANDA / ESCASEZ ─────
export function renderDemanda(e: EstudioCompleto): string {
  const items = e.demanda.byDorms
  return `
<section class="section bg-marfil" id="demanda">
  <div class="section-inner reveal">
    <div class="badge">Oferta</div>
    <div class="section-title">Escasez por tipologia</div>
    <div class="section-subtitle">Concentracion de la oferta activa en ${e.config.zona}. Las tipologias con menos unidades listadas tienen menor competencia directa.</div>
    <div class="yield-grid">
      ${items.map(d => `
      <div class="yield-card${d.nivel === 'CRITICA' || d.nivel === 'ALTA' ? ' attractive' : ''}">
        <div class="yield-tipo">${dormLabel(d.dorms)}</div>
        <div class="yield-value${d.nivel === 'CRITICA' || d.nivel === 'ALTA' ? ' high' : ' low'}">${d.uds}</div>
        <div class="yield-rent">${d.pctOfTotal}% del inventario</div>
        <div style="margin-top:12px">${scarcityBadge(d.nivel)}</div>
      </div>`).join('')}
    </div>
  </div>
</section>`
}

// ───── 6. POSICION COMPETITIVA ─────
export function renderPosicion(e: EstudioCompleto): string {
  const p = e.posicion
  return `
<section class="section bg-ebano" id="posicion">
  <div class="section-inner reveal">
    <div class="badge">Posicion</div>
    <div class="section-title">Donde esta ${e.config.projectName}</div>
    <div class="section-subtitle">
      A ${fmt(p.proyectoM2)}/m² normalizado, el proyecto esta ${fmtPct(p.diffPctGlobal)} vs la mediana de ${e.config.zona} (${fmt(p.medianaZonaM2)}/m²).
      Percentil ${p.percentilEnZona} — ${p.percentilEnZona >= 50 ? 'por encima' : 'por debajo'} de la mitad del mercado.
    </div>
    <div style="text-align:center;margin-bottom:48px">
      ${categoryBadge(p.categoriaGlobal)}
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Tipologia</th><th>Proyecto $/m²</th><th>Mediana zona</th><th>Diferencia</th><th>Categoria</th><th>Oferta zona</th></tr></thead>
        <tbody>
          ${p.byTypology.map(t => `<tr>
            <td class="strong">${dormLabel(t.dorms)}</td>
            <td>${fmt(t.proyectoM2)}</td><td>${fmt(t.medianaZonaM2)}</td>
            <td>${fmtPct(t.diffPct)}</td><td>${categoryBadge(t.categoria)}</td>
            <td>${t.unidadesEnZona} uds</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
</section>`
}

// ───── 6b. DIFERENCIADOR DE PRODUCTO ─────
export function renderDiferenciador(e: EstudioCompleto): string {
  // Calcular diff de tamaño por tipología vs mercado
  const dormTypes = [...new Set(e.config.inventory.map(u => u.dorms))].sort()

  // Get market medians from panorama data (zona-filtered)
  const zonaRows = e.panorama.byZona.find(z => z.zona === e.config.zona)
  if (!zonaRows) return ''

  return `
<section class="section bg-white" id="diferenciador">
  <div class="section-inner reveal">
    <div class="badge">Producto</div>
    <div class="section-title">Tu producto vs el mercado</div>
    <div class="section-subtitle">Que diferencia a ${e.config.projectName} de la competencia en ${e.config.zona}.</div>

    <!-- Tamaño por tipología -->
    <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--caramelo);margin-bottom:16px">Tamano por tipologia</div>
    <div class="yield-grid" style="margin-bottom:32px">
      ${dormTypes.map(dorms => {
        const units = e.config.inventory.filter(u => u.dorms === dorms)
        const condadoM2 = Math.round((units.reduce((s, u) => s + u.m2, 0) / units.length) * 10) / 10
        // Mediana m2 del mercado para esta tipología (hardcoded from BD query — TODO: add to tool)
        const zonaM2Map: Record<number, number> = { 1: 49.7, 2: 88.1, 3: 163.0 }
        const globalM2Map: Record<number, number> = { 1: 50.0, 2: 85.7, 3: 163.0 }
        const mercadoM2 = zonaM2Map[dorms] ?? 0
        const globalM2 = globalM2Map[dorms] ?? 0
        const diffPct = mercadoM2 > 0 ? Math.round(((condadoM2 - mercadoM2) / mercadoM2) * 100) : 0
        const isDiff = Math.abs(diffPct) > 10
        return `
      <div class="yield-card${isDiff ? ' attractive' : ''}">
        <div class="yield-tipo">${dormLabel(dorms)} (${units.length} uds)</div>
        <div class="yield-value${isDiff ? ' high' : ''}" style="font-size:36px">${condadoM2}m\u00B2</div>
        <div class="yield-rent">
          Mediana ${dormLabel(dorms)} en ${e.config.zona.split(' ')[0]}: ${mercadoM2}m\u00B2<br>
          Mediana ${dormLabel(dorms)} todas las zonas: ${globalM2}m\u00B2
        </div>
        ${isDiff ? `<div style="font-size:15px;font-weight:600;color:var(--caramelo);margin-top:8px">${diffPct > 0 ? '+' : ''}${diffPct}% vs ${dormLabel(dorms)} del mercado</div>` : `<div style="font-size:13px;color:var(--piedra);margin-top:8px">Comparable al mercado</div>`}
      </div>`
      }).join('')}
    </div>

    <!-- Equipamiento scorecard -->
    <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--caramelo);margin-bottom:16px">Equipamiento de unidad</div>
    <div class="table-wrap" style="margin-bottom:32px">
      <table class="data" style="text-align:center">
        <thead><tr><th style="text-align:left">Item</th><th style="color:var(--caramelo)">${e.config.projectName.split(' ')[0]}</th><th>Atrium</th><th>HH Once</th><th>Luxe S.</th><th>Sky Tower</th></tr></thead>
        <tbody>
          <tr><td style="text-align:left">Aire acondicionado</td><td style="color:var(--caramelo)">&#9679;</td><td>&#9679;</td><td style="color:var(--arena)">&#9675;</td><td>&#9679;</td><td>&#9679;</td></tr>
          <tr><td style="text-align:left">Cocina encimera</td><td style="color:var(--caramelo)">&#9679;</td><td>&#9679;</td><td>&#9679;</td><td>&#9679;</td><td>&#9679;</td></tr>
          <tr><td style="text-align:left">Horno empotrado</td><td style="color:var(--caramelo)">&#9679;</td><td>&#9679;</td><td style="color:var(--arena)">&#9675;</td><td>&#9679;</td><td style="color:var(--arena)">&#9675;</td></tr>
          <tr style="background:var(--caramelo-10)"><td style="text-align:left"><strong>Heladera</strong></td><td style="color:var(--caramelo)">&#9679;</td><td style="color:var(--arena)">&#9675;</td><td style="color:var(--arena)">&#9675;</td><td>&#9679;</td><td>&#9679;</td></tr>
          <tr style="background:var(--caramelo-10)"><td style="text-align:left"><strong>Lavadora / Secadora</strong></td><td style="color:var(--caramelo)">&#9679;</td><td style="color:var(--arena)">&#9675;</td><td style="color:var(--arena)">&#9675;</td><td>&#9679;</td><td style="color:var(--arena)">&#9675;</td></tr>
          <tr style="background:var(--caramelo-10)"><td style="text-align:left"><strong>Lavavajillas</strong></td><td style="color:var(--caramelo)">&#9679;</td><td style="color:var(--arena)">&#9675;</td><td style="color:var(--arena)">&#9675;</td><td style="color:var(--arena)">&#9675;</td><td style="color:var(--arena)">&#9675;</td></tr>
          <tr><td style="text-align:left">Calefon</td><td style="color:var(--caramelo)">&#9679;</td><td>&#9679;</td><td style="color:var(--arena)">&#9675;</td><td>&#9679;</td><td>&#9679;</td></tr>
          <tr><td style="text-align:left">Closets</td><td style="color:var(--caramelo)">&#9679;</td><td>&#9679;</td><td>&#9679;</td><td>&#9679;</td><td>&#9679;</td></tr>
          <tr><td style="text-align:left">Box bano vidrio</td><td style="color:var(--caramelo)">&#9679;</td><td>&#9679;</td><td>&#9679;</td><td>&#9679;</td><td>&#9679;</td></tr>
          <tr style="border-top:2px solid var(--carbon);font-weight:700"><td style="text-align:left">TOTAL</td><td style="color:var(--caramelo)">9/9</td><td>6/9</td><td>3/9</td><td>8/9</td><td>6/9</td></tr>
        </tbody>
      </table>
    </div>
    <p style="font-size:13px;color:var(--piedra)">Las filas destacadas son los items que diferencian a ${e.config.projectName}. Unico proyecto con lavavajillas en la zona.</p>

    <!-- Amenidades -->
    <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--caramelo);margin-top:40px;margin-bottom:16px">Amenidades del edificio</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--arena);border-radius:14px;overflow:hidden;margin-bottom:24px">
      <div style="padding:24px;background:var(--marfil)">
        <div style="font-size:15px;font-weight:600;color:var(--carbon);margin-bottom:12px">${e.config.projectName}</div>
        <div style="font-size:14px;color:var(--piedra);line-height:2">
          Piscina<br>Gimnasio<br>Seguridad 24/7<br>Churrasquera<br>Salon de eventos<br>Terraza<br>Ascensor
        </div>
        <div style="font-size:13px;font-weight:600;color:var(--carbon);margin-top:12px">7 amenidades</div>
      </div>
      <div style="padding:24px">
        <div style="font-size:15px;font-weight:600;color:var(--carbon);margin-bottom:12px">Competidores premium</div>
        <div style="font-size:14px;color:var(--piedra);line-height:2">
          Todo lo anterior +<br>Sauna / Jacuzzi<br>Co-working<br>Pet Friendly<br>Recepcion<br>Sala de juegos<br>Estacionamiento visitas
        </div>
        <div style="font-size:13px;font-weight:600;color:var(--piedra);margin-top:12px">11-15 amenidades</div>
      </div>
    </div>

    <!-- Resumen -->
    <div style="padding:20px;border-radius:14px;background:var(--marfil);margin-top:24px">
      <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--caramelo);margin-bottom:12px">Resumen</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:14px;color:var(--carbon);line-height:1.6">
        <div>
          <strong style="color:var(--caramelo)">Fortaleza</strong><br>
          Equipamiento de unidad superior (9/9). Unico con lavavajillas. Linea blanca completa facilita alquiler amoblado.
        </div>
        <div>
          <strong style="color:var(--caramelo)">Fortaleza</strong><br>
          1D de 62m\u00B2 — 27% mas grande que la mediana del mercado (49m\u00B2). Es un diferenciador no comunicado en portales.
        </div>
        <div>
          <strong style="color:var(--piedra)">Debilidad</strong><br>
          Menos amenidades que competidores premium (7 vs 11-15). Sin sauna, co-working ni pet friendly.
        </div>
      </div>
    </div>

    <!-- Comparativa directa vs Atrium -->
    <div style="margin-top:48px;padding-top:40px;border-top:2px solid var(--arena)">
      <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--caramelo);margin-bottom:8px">Comparativa directa</div>
      <div style="font-size:28px;font-weight:500;font-family:'Figtree',sans-serif;color:var(--carbon);margin-bottom:8px">${e.config.projectName} vs Atrium</div>
      <div style="font-size:15px;color:var(--piedra);margin-bottom:28px">Atrium es el competidor directo mas relevante: misma zona, entrega inmediata, tipologias similares. 7 unidades activas, 171+ dias en mercado.</div>

      <!-- Tabla comparativa por tipología -->
      <div class="table-wrap" style="margin-bottom:28px">
        <table class="data" style="text-align:center">
          <thead><tr><th style="text-align:left">Tipologia</th><th colspan="2">${e.config.projectName.split(' ')[0]}</th><th colspan="2">Atrium</th><th>Diferencia</th></tr></thead>
          <thead><tr><th style="text-align:left"></th><th>m\u00B2</th><th>$/m\u00B2</th><th>m\u00B2</th><th>$/m\u00B2</th><th>$/m\u00B2</th></tr></thead>
          <tbody>
            <tr>
              <td style="text-align:left" class="strong">1D</td>
              <td>62.1</td><td style="color:var(--caramelo)">$2,171</td>
              <td>45.7</td><td>$2,152</td>
              <td style="font-weight:600;color:var(--caramelo)">+1% &middot; comparable</td>
            </tr>
            <tr>
              <td style="text-align:left" class="strong">2D</td>
              <td>86.7</td><td style="color:var(--carbon)">$2,200</td>
              <td>84.0</td><td>$1,845</td>
              <td style="font-weight:600;color:var(--piedra)">+19% &middot; Condado mas caro</td>
            </tr>
            <tr>
              <td style="text-align:left" class="strong">3D</td>
              <td>144.3</td><td style="color:var(--carbon)">$2,200</td>
              <td colspan="2" style="color:var(--piedra)">No tiene</td>
              <td style="color:var(--piedra)">Sin comparacion</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Insights -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
        <div style="padding:20px;border-radius:14px;background:var(--marfil)">
          <div style="font-size:14px;font-weight:600;color:var(--carbon);margin-bottom:8px">1 Dormitorio</div>
          <div style="font-size:14px;color:var(--piedra);line-height:1.7">
            El $/m\u00B2 es practicamente igual (+1%). La diferencia de ticket ($135K vs $98K) es 100% por tamano: Condado tiene <strong>36% mas metros</strong> (62 vs 46m\u00B2). Comercialmente parece mas caro, tecnicamente no lo es.
          </div>
        </div>
        <div style="padding:20px;border-radius:14px;background:var(--marfil)">
          <div style="font-size:14px;font-weight:600;color:var(--carbon);margin-bottom:8px">2 Dormitorios</div>
          <div style="font-size:14px;color:var(--piedra);line-height:1.7">
            Tamano similar (87 vs 84m\u00B2) pero Condado cobra <strong>19% mas por m\u00B2</strong> ($2,200 vs $1,845). La diferencia se justifica por equipamiento (lavavajillas, lavadora, secadora) que Atrium no incluye.
          </div>
        </div>
      </div>

      <!-- Equipamiento lado a lado -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--arena);border-radius:14px;overflow:hidden;margin-bottom:24px">
        <div style="padding:20px;background:var(--marfil)">
          <div style="font-size:14px;font-weight:600;color:var(--caramelo);margin-bottom:12px">${e.config.projectName.split(' ')[0]} — Equip. 9/9</div>
          <div style="font-size:13px;color:var(--piedra);line-height:2">
            A/C &middot; Cocina &middot; Horno &middot; <strong style="color:var(--carbon)">Heladera</strong> &middot; <strong style="color:var(--carbon)">Lavadora</strong> &middot; <strong style="color:var(--carbon)">Secadora</strong> &middot; <strong style="color:var(--carbon)">Lavavajillas</strong> &middot; Calefon &middot; Closets
          </div>
        </div>
        <div style="padding:20px">
          <div style="font-size:14px;font-weight:600;color:var(--piedra);margin-bottom:12px">Atrium — Equip. 6/9</div>
          <div style="font-size:13px;color:var(--piedra);line-height:2">
            A/C &middot; Cocina &middot; Horno &middot; <span style="color:var(--arena)">~~Heladera~~</span> &middot; <span style="color:var(--arena)">~~Lavadora~~</span> &middot; <span style="color:var(--arena)">~~Secadora~~</span> &middot; <span style="color:var(--arena)">~~Lavavajillas~~</span> &middot; Calefon &middot; Closets
          </div>
        </div>
      </div>

      <!-- Amenidades lado a lado -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--arena);border-radius:14px;overflow:hidden">
        <div style="padding:20px;background:var(--marfil)">
          <div style="font-size:14px;font-weight:600;color:var(--piedra);margin-bottom:12px">${e.config.projectName.split(' ')[0]} — 7 amenidades</div>
          <div style="font-size:13px;color:var(--piedra);line-height:2">
            Piscina &middot; Gimnasio &middot; Seguridad 24/7 &middot; Churrasquera &middot; Salon &middot; Terraza &middot; Ascensor
          </div>
        </div>
        <div style="padding:20px">
          <div style="font-size:14px;font-weight:600;color:var(--carbon);margin-bottom:12px">Atrium — 11 amenidades</div>
          <div style="font-size:13px;color:var(--piedra);line-height:2">
            Todo lo anterior + <strong style="color:var(--carbon)">Sauna/Jacuzzi</strong> &middot; <strong style="color:var(--carbon)">Pet Friendly</strong> &middot; <strong style="color:var(--carbon)">Co-working</strong> &middot; <strong style="color:var(--carbon)">Espacio Zen</strong>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>`
}

// ───── 7. COMPETIDORES ─────
export function renderCompetidores(e: EstudioCompleto): string {
  const comp = e.competidores
  return `
<section class="section bg-white" id="competidores">
  <div class="section-inner reveal">
    <div class="badge">Competencia</div>
    <div class="section-title">Mapa competitivo</div>
    <div class="section-subtitle">${comp.totalProyectos} proyectos activos en ${comp.zona} (mostrando los de 3+ unidades). Ordenados por precio. Tamano del punto = unidades.</div>
    <div class="chart-container" style="height:400px">
      <canvas id="chartScatter"></canvas>
    </div>
    ${scatterCompetidores(comp.top, e.config.projectName, 'chartScatter')}
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Proyecto</th><th>Uds</th><th>$/m²</th><th>Estado</th><th>Signal</th></tr></thead>
        <tbody>
          ${comp.top.map(c => {
            const isProject = c.proyecto === e.config.projectName
            const signalClass = c.signal === 'ESTANCADO' ? ' style="background:rgba(58,53,48,0.08)"'
              : c.signal === 'PROLONGADO' ? ' style="background:rgba(58,53,48,0.04)"'
              : ''
            const rowClass = isProject ? ' class="highlight"' : ''
            const estadoLabel = (c.estado === 'entrega_inmediata' || c.estado === 'nuevo_a_estrenar') ? 'Entrega inmediata' : (c.estado === 'preventa' || c.estado === 'en_construccion' || c.estado === 'en_pozo') ? 'Preventa' : '—'
            return `<tr${isProject ? rowClass : signalClass}>
            <td class="strong">${c.proyecto}</td><td>${c.uds}</td>
            <td>${fmt(c.medianaM2)}</td>
            <td style="font-size:13px">${estadoLabel}</td>
            <td>${signalBadge(c.signal)}</td>
          </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:16px 28px;margin-top:20px;font-size:13px;color:var(--piedra)">
      <div>${signalBadge('NUEVO' as any)} &lt; 45 dias publicado</div>
      <div>${signalBadge('ACTIVO' as any)} 45 a 90 dias</div>
      <div>${signalBadge('PROLONGADO' as any)} 90 a 150 dias</div>
      <div>${signalBadge('ESTANCADO' as any)} +150 dias</div>
    </div>
    <p class="chart-note" style="margin-top:16px">Signal = tiempo que llevan publicados los anuncios en portales, no velocidad de venta.</p>
  </div>
</section>`
}

// ───── 8. VISIBILIDAD PORTALES ─────
export function renderVisibilidad(e: EstudioCompleto): string {
  const v = e.visibilidad
  const allDorms = [...new Set([...Object.keys(v.inventarioPorDorms), ...Object.keys(v.visiblesPorDorms)])].sort()
  return `
<section class="section bg-marfil" id="visibilidad">
  <div class="section-inner reveal">
    <div class="badge">Visibilidad</div>
    <div class="section-title">Tu inventario vs lo que ve el mercado</div>
    <div class="section-subtitle">
      De ${v.totalInventario} unidades disponibles, solo ${v.visiblesEnPortal} aparecen en portales inmobiliarios.
      ${v.invisibles} unidades son invisibles para compradores que buscan online.
    </div>
    <div class="gap-indicator">
      <div class="gap-number">${v.gapPct}%</div>
      <div class="gap-text">
        <strong>${v.invisibles} de ${v.totalInventario} unidades</strong> no aparecen en ningun portal.
        Los compradores que buscan en Century21 o Remax no pueden encontrarlas.
      </div>
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Tipologia</th><th>Inventario real</th><th>En portales</th><th>Invisibles</th></tr></thead>
        <tbody>
          ${allDorms.map(d => {
            const inv = v.inventarioPorDorms[Number(d)] ?? 0
            const vis = v.visiblesPorDorms[Number(d)] ?? 0
            return `<tr>
              <td class="strong">${dormLabel(Number(d))}</td>
              <td>${inv}</td><td>${vis}</td>
              <td class="${inv - vis > 0 ? 'strong' : ''}">${inv - vis}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
    ${v.detalle.length > 0 ? `
    <p style="margin-top:32px;font-size:15px;font-weight:600;color:var(--carbon)">Listings activos en portales:</p>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Fuente</th><th>Broker</th><th>Dorms</th><th>Area</th><th>$/m²</th><th>Dias</th><th>Nota</th><th>Link</th></tr></thead>
        <tbody>
          ${v.detalle.map(l => `<tr>
            <td>${l.fuente}</td><td>${l.broker ?? '—'}</td><td>${dormLabel(l.dorms)}</td>
            <td>${l.areaM2}m²</td><td>${fmt(l.precioM2)}</td><td>${l.diasEnMercado}d</td>
            <td>${l.esMultiproyecto ? '<span style="font-size:12px;color:var(--caramelo)">Multiproyecto — muestra varias tipologias</span>' : ''}</td>
            <td>${l.url ? `<a href="${l.url}" target="_blank" rel="noopener" style="color:var(--caramelo);text-decoration:underline;font-size:13px">Ver anuncio</a>` : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${v.detalle.some(l => l.esMultiproyecto) ? `
    <p class="chart-note" style="margin-top:12px">
      Los listings multiproyecto anuncian el edificio completo (varias tipologias en un solo aviso).
      Aunque aparecen como una unidad en nuestro conteo, su alcance real es mayor.
    </p>` : ''}` : ''}
  </div>
</section>`
}

// ───── 9. ROTACION OBSERVADA ─────
export function renderRotacion(e: EstudioCompleto): string {
  const r = e.rotacion
  return `
<section class="section bg-marfil" id="rotacion">
  <div class="section-inner reveal">
    <div class="badge">Rotacion</div>
    <div class="section-title">Que salio del mercado</div>
    <div class="section-subtitle">
      En los ultimos ${r.dias} dias, ${r.totalRotadas} propiedades dejaron de aparecer en portales en ${r.zona}:
      ${r.totalIndividuales} salidas individuales y ${r.totalBatch} en retiros de proyecto (${r.retirosBatch.length} evento${r.retirosBatch.length !== 1 ? 's' : ''} donde un broker retiro multiples listings el mismo dia).
    </div>
    ${r.totalRotadas > 0 ? `
    ${(() => {
      const indiv = r.salidasIndividuales
      const batches = r.retirosBatch

      // Tipología breakdown de individuales
      const byDorm = new Map<number, number>()
      for (const p of indiv) byDorm.set(p.dorms, (byDorm.get(p.dorms) ?? 0) + 1)
      const sorted = [...byDorm.entries()].sort((a, b) => b[1] - a[1])
      const dormTypes = sorted.map(([d]) => d)

      // Análisis sobre individuales (no batch)
      const preciosM2 = indiv.filter(p => p.precioM2 > 0).map(p => p.precioM2)
      const medianaM2Salidas = preciosM2.length > 0 ? [...preciosM2].sort((a, b) => a - b)[Math.floor(preciosM2.length / 2)] : 0
      const medianaM2Zona = e.posicion.medianaZonaM2
      const diff = medianaM2Salidas > 0 && medianaM2Zona > 0
        ? Math.round(((medianaM2Salidas - medianaM2Zona) / medianaM2Zona) * 100)
        : 0
      const diffLabel = diff < -10 ? 'Segmento accesible' : diff > 10 ? 'Segmento premium' : 'Parejo'

      // Competidores con salidas individuales
      const competidorNames = new Set(e.competidores.top.map(c => c.proyecto))
      const compMap = new Map<string, typeof indiv>()
      for (const p of indiv) {
        const name = p.nombreEdificio ?? 'Sin nombre'
        if (competidorNames.has(name)) {
          const arr = compMap.get(name) ?? []
          arr.push(p)
          compMap.set(name, arr)
        }
      }
      const compCards = [...compMap.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4).map(([name, props]) => {
        const dorms = [...new Set(props.map(p => p.dorms))].sort().map(d => dormLabel(d)).join(', ')
        const prices = props.filter(p => p.precioM2 > 0).map(p => p.precioM2).sort((a, b) => a - b)
        const medPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0
        return { name, count: props.length, dorms, medPrice }
      })

      // Salidas del propio proyecto (en individuales)
      const propiasSalidas = indiv.filter(p => (p.nombreEdificio ?? '').toLowerCase().includes(e.config.projectName.split(' ')[0].toLowerCase()))

      return `
    <div style="margin-bottom:32px">
      <!-- Resumen: individuales vs retiros -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:32px;border-radius:14px;overflow:hidden">
        <div style="padding:32px;text-align:center;background:var(--carbon)">
          <div style="font-family:'Figtree',sans-serif;font-size:48px;font-weight:500;color:var(--marfil)">${r.totalIndividuales}</div>
          <div style="font-size:14px;color:var(--piedra-light);margin-top:6px">Salidas individuales</div>
        </div>
        <div style="padding:32px;text-align:center;background:var(--white);border:1px solid var(--arena);border-left:none">
          <div style="font-family:'Figtree',sans-serif;font-size:48px;font-weight:500;color:var(--piedra)">${r.totalBatch}</div>
          <div style="font-size:14px;color:var(--piedra);margin-top:6px">Retiros de proyecto (${batches.length} evento${batches.length !== 1 ? 's' : ''})</div>
        </div>
      </div>

      ${batches.length > 0 ? `
      <!-- Retiros batch -->
      <div style="padding:24px;border-radius:14px;background:var(--white);margin-bottom:32px">
        <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--piedra);margin-bottom:16px">Retiros de proyecto</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
          ${batches.map(b => `
          <div style="padding:20px;border-radius:14px;background:var(--marfil);border-left:3px solid var(--arena)">
            <div style="font-size:15px;font-weight:600;color:var(--carbon)">${b.proyecto}</div>
            <div style="font-size:32px;font-weight:500;font-family:'Figtree',sans-serif;color:var(--piedra);margin:6px 0">${b.count} uds</div>
            <div style="font-size:13px;color:var(--piedra)">${b.dorms} &middot; ${b.fecha}</div>
            ${b.broker ? `<div style="font-size:12px;color:var(--piedra);margin-top:4px">Broker: ${b.broker}</div>` : ''}
          </div>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--piedra);margin-top:12px;font-style:italic">Mismo proyecto, mismo dia — retiro de listings, no ventas individuales</div>
      </div>` : ''}

      <!-- Lectura de salidas individuales -->
      <div style="padding:28px;border-radius:14px;background:var(--white);margin-bottom:32px">
      <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--caramelo);margin-bottom:20px">Salidas individuales</div>

      ${(() => {
        const diasList = indiv.filter(p => p.diasEnMercado > 0).map(p => p.diasEnMercado).sort((a, b) => a - b)
        const medianaDias = diasList.length > 0 ? diasList[Math.floor(diasList.length / 2)] : 0
        return `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
        <div style="padding:20px;border:1px solid var(--arena);border-radius:14px;text-align:center;background:var(--white)">
          <div style="font-family:'Figtree',sans-serif;font-size:32px;font-weight:500;color:var(--carbon)">${fmt(medianaM2Salidas)}</div>
          <div style="font-size:13px;color:var(--piedra);margin-top:4px">$/m\u00B2 mediana salidas</div>
        </div>
        <div style="padding:20px;border:1px solid var(--arena);border-radius:14px;text-align:center;background:var(--white)">
          <div style="font-family:'Figtree',sans-serif;font-size:32px;font-weight:500;color:var(--carbon)">${fmt(medianaM2Zona)}</div>
          <div style="font-size:13px;color:var(--piedra);margin-top:4px">$/m\u00B2 mediana activas</div>
        </div>
        <div style="padding:20px;border:1px solid ${Math.abs(diff) > 10 ? 'var(--caramelo)' : 'var(--arena)'};border-radius:14px;text-align:center;background:var(--white)">
          <div style="font-family:'Figtree',sans-serif;font-size:32px;font-weight:500;color:var(--caramelo)">${diff > 0 ? '+' : ''}${diff}%</div>
          <div style="font-size:13px;color:var(--piedra);margin-top:4px">${diffLabel}</div>
        </div>
        <div style="padding:20px;border:1px solid var(--arena);border-radius:14px;text-align:center;background:var(--white)">
          <div style="font-family:'Figtree',sans-serif;font-size:32px;font-weight:500;color:var(--carbon)">${medianaDias}d</div>
          <div style="font-size:13px;color:var(--piedra);margin-top:4px">Dias publicado (mediana)</div>
        </div>
      </div>`
      })()}

      ${compCards.length > 0 ? `
      <div style="font-size:13px;font-weight:500;color:var(--piedra);margin-bottom:12px;letter-spacing:0.5px">COMPETIDORES CON SALIDAS</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:24px">
        ${compCards.map(c => `
        <div style="padding:16px;border:1px solid var(--arena);border-radius:14px;background:var(--white)">
          <div style="font-size:15px;font-weight:600;color:var(--carbon);margin-bottom:8px">${c.name}</div>
          <div style="font-size:28px;font-weight:500;font-family:'Figtree',sans-serif;color:var(--carbon)">${c.count}</div>
          <div style="font-size:13px;color:var(--piedra);margin-top:4px">${c.dorms} &middot; ${fmt(c.medPrice)}/m\u00B2 med.</div>
        </div>`).join('')}
      </div>` : ''}

      ${propiasSalidas.length > 0 ? `
      <div style="padding:16px 20px;border:2px solid var(--caramelo);border-radius:14px;background:rgba(58,106,72,0.05);display:flex;align-items:flex-start;gap:16px;margin-bottom:24px">
        <div style="font-size:24px;line-height:1">!</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--caramelo);margin-bottom:6px">${propiasSalidas.length} salida(s) de ${e.config.projectName}</div>
          ${propiasSalidas.map(p => `<div style="font-size:14px;color:var(--carbon)">#${p.id} &middot; ${dormLabel(p.dorms)} &middot; ${p.areaM2}m\u00B2 &middot; ${fmt(p.precioM2)}/m\u00B2 &middot; ${p.fechaSalida}${p.broker ? ` &middot; ${p.broker}` : ''}</div>`).join('')}
          <div style="font-size:13px;color:var(--piedra);margin-top:8px">Verificar si fue venta real o listing retirado/expirado</div>
        </div>
      </div>` : ''}

      <div style="font-size:12px;color:var(--piedra);padding-top:12px;border-top:1px solid var(--arena)">
        Salidas individuales = listings que dejaron de aparecer uno a uno. Datos indicativos.
      </div>
      </div>

    <!-- Cards tipología (solo individuales) -->
    <div class="yield-grid" style="margin-bottom:32px">
      ${sorted.map(([d, count]) => {
        const pct = r.totalIndividuales > 0 ? Math.round((count / r.totalIndividuales) * 100) : 0
        const dormsProps = indiv.filter(p => p.dorms === d)
        const dormsM2 = dormsProps.filter(p => p.precioM2 > 0).map(p => p.precioM2).sort((a, b) => a - b)
        const dormsDias = dormsProps.filter(p => p.diasEnMercado > 0).map(p => p.diasEnMercado).sort((a, b) => a - b)
        const medM2 = dormsM2.length > 0 ? dormsM2[Math.floor(dormsM2.length / 2)] : 0
        const medDias = dormsDias.length > 0 ? dormsDias[Math.floor(dormsDias.length / 2)] : 0
        return `<div class="yield-card${pct >= 40 ? ' attractive' : ''}" style="cursor:pointer" onclick="filterRotacion(${d})">
        <div class="yield-tipo">${dormLabel(d)}</div>
        <div class="yield-value${pct >= 40 ? ' high' : ' low'}">${count}</div>
        <div class="yield-rent">${pct}% de las salidas</div>
        ${medM2 > 0 ? `<div style="font-size:13px;color:var(--piedra);margin-top:8px">${fmt(medM2)}/m\u00B2 med.</div>` : ''}
        ${medDias > 0 ? `<div style="font-size:13px;color:var(--piedra)">${medDias}d publicado med.</div>` : ''}
      </div>`
      }).join('')}
    </div>
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <button class="rot-pill active" onclick="filterRotacion('all')" data-rotfilter="all">Todas <span class="rot-pill-count">${r.totalIndividuales}</span></button>
      ${dormTypes.map(d => `<button class="rot-pill" onclick="filterRotacion(${d})" data-rotfilter="${d}">${dormLabel(d)} <span class="rot-pill-count">${byDorm.get(d)}</span></button>`).join('')}
    </div>
    <div id="rotacionToggle" style="margin-bottom:16px">
      <button onclick="toggleRotacionTable()" style="font-size:14px;color:var(--caramelo);cursor:pointer;border:1px solid var(--caramelo);background:none;padding:8px 20px;font-family:'DM Sans',sans-serif;font-weight:500;transition:background 0.2s;border-radius:100px" onmouseover="this.style.background='var(--caramelo-10)'" onmouseout="this.style.background='none'">
        Ver detalle de las ${r.totalIndividuales} salidas individuales
      </button>
    </div>
    <div id="rotacionTable" style="display:none">
      <div class="table-wrap">
        <table class="data" id="rotacionDataTable">
          <thead><tr><th>Proyecto</th><th>Dorms</th><th>Area</th><th>$/m²</th><th>Dias publicado</th><th>Fecha salida</th></tr></thead>
          <tbody>
            ${indiv.map((p: PropRotada) => `<tr data-dorms="${p.dorms}">
              <td class="strong">${p.nombreEdificio ?? 'Sin nombre'}</td>
              <td>${dormLabel(p.dorms)}</td><td>${p.areaM2}m²</td>
              <td>${fmt(p.precioM2)}</td><td>${p.diasEnMercado}d</td><td>${p.fechaSalida}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <script>
    function toggleRotacionTable() {
      const t = document.getElementById('rotacionTable');
      const btn = document.querySelector('#rotacionToggle button');
      if (t.style.display === 'none') {
        t.style.display = 'block';
        btn.textContent = 'Ocultar detalle';
      } else {
        t.style.display = 'none';
        btn.textContent = 'Ver detalle de las ${r.totalIndividuales} salidas individuales';
      }
    }
    function filterRotacion(dorms) {
      const rows = document.querySelectorAll('#rotacionDataTable tbody tr');
      const btns = document.querySelectorAll('[data-rotfilter]');
      btns.forEach(b => b.classList.remove('active'));
      if (dorms === 'all') {
        rows.forEach(r => r.style.display = '');
        document.querySelector('[data-rotfilter="all"]').classList.add('active');
      } else {
        rows.forEach(r => {
          r.style.display = r.dataset.dorms == dorms ? '' : 'none';
        });
        const btn = document.querySelector('[data-rotfilter="' + dorms + '"]');
        if (btn) btn.classList.add('active');
      }
      // Auto-open table when filtering
      document.getElementById('rotacionTable').style.display = 'block';
      document.querySelector('#rotacionToggle button').textContent = 'Ocultar detalle';
    }
    </` + `script>`
    })()}` : '<p class="takeaway">No se detectaron salidas en este periodo.</p>'}
    <!-- Qué entró al mercado -->
    ${r.nuevas.total > 0 ? `
    <div style="margin-top:48px;padding-top:40px;border-top:2px solid var(--arena)">
      <div class="badge">Nuevas</div>
      <div class="section-title" style="font-size:28px">Que entro al mercado</div>
      <div class="section-subtitle" style="margin-bottom:28px">
        ${r.nuevas.total} propiedades nuevas aparecieron en portales en los ultimos ${r.dias} dias en ${r.zona}.
        ${r.nuevas.total > r.totalIndividuales
          ? `Entraron mas de las que salieron — el mercado crece.`
          : r.nuevas.total < r.totalIndividuales
          ? `Salieron mas de las que entraron — el inventario se contrae.`
          : `Entraron las mismas que salieron — el mercado se mantiene estable.`}
      </div>

      <!-- Nuevas vs Salidas -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:28px">
        <div style="padding:24px;border-radius:14px;text-align:center;background:var(--white)">
          <div style="font-family:'Figtree',sans-serif;font-size:36px;font-weight:500;color:var(--caramelo)">${r.nuevas.total}</div>
          <div style="font-size:13px;color:var(--piedra);margin-top:4px">Nuevas entradas</div>
        </div>
        <div style="padding:24px;border-radius:14px;text-align:center;background:var(--white)">
          <div style="font-family:'Figtree',sans-serif;font-size:36px;font-weight:500;color:var(--carbon)">${r.totalIndividuales}</div>
          <div style="font-size:13px;color:var(--piedra);margin-top:4px">Salidas individuales</div>
        </div>
        <div style="padding:24px;border-radius:14px;text-align:center;background:var(--white);border:1px solid ${r.nuevas.total >= r.totalIndividuales ? 'var(--caramelo)' : 'var(--arena)'}">
          <div style="font-family:'Figtree',sans-serif;font-size:36px;font-weight:500;color:${r.nuevas.total >= r.totalIndividuales ? 'var(--caramelo)' : 'var(--piedra)'}">${r.nuevas.total >= r.totalIndividuales ? '+' : ''}${r.nuevas.total - r.totalIndividuales}</div>
          <div style="font-size:13px;color:var(--piedra);margin-top:4px">Balance neto</div>
        </div>
      </div>

      <!-- Nuevas por tipología -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px">
        ${r.nuevas.byDorms.map(d => `
        <div style="padding:16px;border-radius:14px;text-align:center;background:var(--white)">
          <div style="font-size:14px;font-weight:600;color:var(--carbon)">${dormLabel(d.dorms)}</div>
          <div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:var(--carbon)">${d.count}</div>
          <div style="font-size:12px;color:var(--piedra)">${d.pct}% de las nuevas</div>
          ${d.medianaM2 > 0 ? `<div style="font-size:13px;color:var(--piedra);margin-top:8px">${fmt(d.medianaM2)}/m\u00B2 med.</div>` : ''}
        </div>`).join('')}
      </div>

      ${r.nuevas.medianaM2 > 0 ? `
      <div style="padding:16px 20px;border-radius:14px;background:var(--white);font-size:14px;color:var(--piedra)">
        Las nuevas entran con mediana de <strong style="color:var(--carbon)">${fmt(r.nuevas.medianaM2)}/m\u00B2</strong>
        ${(() => {
          const diffNuevas = Math.round(((r.nuevas.medianaM2 - e.posicion.medianaZonaM2) / e.posicion.medianaZonaM2) * 100)
          return diffNuevas > 5
            ? `— ${diffNuevas}% por encima de la mediana activa. Los nuevos proyectos apuntan a un segmento mas alto.`
            : diffNuevas < -5
            ? `— ${Math.abs(diffNuevas)}% por debajo de la mediana activa. La oferta nueva es mas accesible.`
            : `— alineada con la mediana activa. Sin cambio de tendencia en precios.`
        })()}
      </div>` : ''}
    </div>` : ''}

    <p class="takeaway" style="margin-top:32px">
      Nota: Una propiedad que sale del portal puede haber sido vendida, retirada por el broker,
      o haber expirado. Las entradas corresponden a nuevos listings detectados por primera vez.
    </p>
  </div>
</section>`
}

// ───── 10. YIELD ─────
export function renderYield(e: EstudioCompleto): string {
  const items = e.yield.byDorms.filter(d => d.rentaAmobladoUsd || d.rentaNoAmobladoUsd)
  return `
<section class="section bg-ebano" id="yield">
  <div class="section-inner reveal">
    <div class="badge">Rentabilidad</div>
    <div class="section-title">Alquiler y retorno</div>
    <div class="section-subtitle">
      Yield bruto anual por tipologia en ${e.yield.zona}. Mediana de rentas mensuales en USD.
      El premium por amoblado es un diferencial clave para el comprador-inversor.
    </div>
    <div class="yield-grid">
      ${items.map((d: YieldTipologia) => {
        const yieldVal = d.yieldBrutoAmob ?? d.yieldBrutoNoAmob ?? 0
        const isHigh = yieldVal >= 5
        return `
      <div class="yield-card${isHigh ? ' attractive' : ''}">
        <div class="yield-tipo">${dormLabel(d.dorms)}</div>
        <div class="yield-value${isHigh ? ' high' : ' low'}">${yieldVal.toFixed(1)}%</div>
        <div class="yield-rent">
          ${d.rentaAmobladoUsd ? `Amoblado: ${fmt(d.rentaAmobladoUsd)}/mes (n=${d.nAmoblado})` : ''}
          ${d.rentaNoAmobladoUsd ? `<br>Sin amoblar: ${fmt(d.rentaNoAmobladoUsd)}/mes (n=${d.nNoAmoblado})` : ''}
          ${d.premiumAmobladoPct ? `<br>Premium amoblado: <strong>${fmtPct(d.premiumAmobladoPct)}</strong>` : ''}
        </div>
        <div class="yield-detail">
          Ticket venta mediana: ${fmt(d.medianaVentaTicket)}<br>
          ${d.anosRetornoAmob ? `Retorno amoblado: ${d.anosRetornoAmob} anos` : ''}
          ${d.anosRetornoNoAmob ? `<br>Retorno sin amoblar: ${d.anosRetornoNoAmob} anos` : ''}
        </div>
      </div>`
      }).join('')}
    </div>
    <p class="takeaway" style="color:var(--piedra-light)">
      Yield bruto = (renta mensual &times; 12) / precio venta. No incluye vacancias, mantenimiento, impuestos ni gastos de condominio.
      Las medianas son mas robustas que promedios pero con muestras chicas (n&lt;10) deben leerse con cautela.
    </p>

    <!-- Condado yield comparison -->
    ${(() => {
      const TC_OFICIAL = 6.96
      const dormTypes = [...new Set(e.config.inventory.map(u => u.dorms))].sort()
      const condadoYield = dormTypes.map(dorms => {
        const units = e.config.inventory.filter(u => u.dorms === dorms)
        const avgTicket = Math.round(units.reduce((s, u) => s + u.precioUsd, 0) / units.length)
        const ticketNorm = e.config.tcDetectado === 'paralelo'
          ? Math.round(avgTicket * e.tc.paralelo / TC_OFICIAL)
          : avgTicket
        const avgM2 = Math.round((units.reduce((s, u) => s + u.m2, 0) / units.length) * 10) / 10
        const yieldData = items.find(d => d.dorms === dorms)

        // Renta directa del mercado
        const rentaAmob = yieldData?.rentaAmobladoUsd ?? null
        const rentaM2Amob = yieldData?.rentaM2AmobladoUsd ?? null
        const medianaAreaAlq = yieldData?.medianaAreaAlquiler ?? null

        // Si hay diferencia de tamaño >20%, usar renta/m² estimada
        const sizeDiff = medianaAreaAlq && medianaAreaAlq > 0 ? Math.abs(avgM2 - medianaAreaAlq) / medianaAreaAlq : 0
        const usarRentaM2 = sizeDiff > 0.2 && rentaM2Amob

        const rentaEstimada = usarRentaM2 ? Math.round(rentaM2Amob * avgM2) : rentaAmob
        const rentaLabel = usarRentaM2 ? 'estimada por m\u00B2' : 'mediana mercado'

        const yieldAmob = rentaEstimada && ticketNorm > 0 ? Math.round((rentaEstimada * 12 / ticketNorm) * 1000) / 10 : null
        const retornoAmob = rentaEstimada && rentaEstimada > 0 ? Math.round((ticketNorm / (rentaEstimada * 12)) * 10) / 10 : null

        return { dorms, units: units.length, avgTicket, ticketNorm, avgM2, rentaEstimada, rentaAmob, rentaM2Amob, rentaLabel, yieldAmob, retornoAmob, medianaAreaAlq, usarRentaM2, sizeDiff }
      }).filter(d => d.rentaEstimada)

      if (condadoYield.length === 0) return ''

      return `
    <div style="margin-top:48px;padding-top:40px;border-top:1px solid rgba(255,255,255,0.08)">
      <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--caramelo);margin-bottom:20px">Retorno — ${e.config.projectName}</div>
      <div style="font-size:15px;color:var(--piedra-light);margin-bottom:28px;line-height:1.6">
        Yield estimado usando los precios reales de ${e.config.projectName} ($${e.config.precioM2Billete}/m\u00B2)
        y las rentas del mercado en ${e.config.zona}.
        Cuando el area del dpto difiere >20% de la mediana de alquiler, se estima la renta por m\u00B2.
      </div>

      <div class="yield-grid">
        ${condadoYield.map(d => {
          const isHigh = (d.yieldAmob ?? 0) >= 5
          return `
        <div class="yield-card${isHigh ? ' attractive' : ''}">
          <div class="yield-tipo">${dormLabel(d.dorms)} (${d.units} uds, ${d.avgM2}m\u00B2)</div>
          <div class="yield-value${isHigh ? ' high' : ' low'}">${(d.yieldAmob ?? 0).toFixed(1)}%</div>
          <div class="yield-rent">
            Ticket: ${fmt(d.avgTicket)} billete${d.ticketNorm !== d.avgTicket ? ` (${fmt(d.ticketNorm)} norm.)` : ''}
            <br>Renta amoblada: <strong>${fmt(d.rentaEstimada!)}/mes</strong> (${d.rentaLabel})
            ${d.rentaM2Amob ? `<br>Renta/m\u00B2: $${d.rentaM2Amob.toFixed(2)}/m\u00B2/mes` : ''}
          </div>
          <div class="yield-detail">
            Yield: ${(d.yieldAmob ?? 0).toFixed(1)}% &middot; Retorno: ${d.retornoAmob} a\u00F1os
            ${d.usarRentaM2 ? `<br><span style="font-size:12px;color:var(--piedra-light)">Nota: los alquileres de ${dormLabel(d.dorms)} en la zona tienen mediana ${d.medianaAreaAlq}m\u00B2 vs ${d.avgM2}m\u00B2 de ${e.config.projectName}. Se uso renta/m\u00B2 ($${d.rentaM2Amob!.toFixed(2)}) para estimar.</span>` : ''}
          </div>
        </div>`
        }).join('')}
      </div>

      <div style="font-size:14px;color:var(--piedra-light);margin-top:20px;line-height:1.6;padding:16px 20px;border:1px solid rgba(255,255,255,0.08);border-radius:14px">
        ${e.config.projectName} entrega con linea blanca completa (heladera, lavadora, secadora, lavavajillas),
        lo que reduce la inversion inicial para alquilar amoblado. Sin embargo, el yield mostrado no incluye
        el costo de amoblar (muebles, menaje, decoracion) ni vacancias, mantenimiento, impuestos o gastos de condominio.
        El retorno real del primer a&ntilde;o sera menor al yield bruto mostrado.
      </div>
    </div>`
    })()}
  </div>
</section>`
}

// ───── 11. SIMULACION PRECIO ─────
export function renderSimulacion(e: EstudioCompleto): string {
  const sims = e.simulacion.escenarios
  if (sims.length === 0) return ''

  const refs = e.simulacion.medianasReferencia
  const dormTypes = [...new Set(e.config.inventory.map(u => u.dorms))].sort()

  const actual = sims.find(s => s.precioM2 === e.config.precioM2Billete)
  // Separar propuesto ($1,550) y alternativa MKT ($1,600)
  const otherSims = sims.filter(s => s.precioM2 !== e.config.precioM2Billete)
  const propuesto = otherSims.find(s => s.precioM2 === Math.min(...otherSims.map(o => o.precioM2)))
  const mktSim = otherSims.find(s => s !== propuesto)
  const diffPrecioM2 = actual && propuesto ? actual.precioM2 - propuesto.precioM2 : 0

  // Labels
  const getLabel = (s: SimulacionEscenario) => {
    if (s.precioM2 === e.config.precioM2Billete) return 'Escenario actual'
    if (s === mktSim) return 'Alternativa: reducir + destinar a MKT'
    return 'Escenario propuesto'
  }

  // Solo mostrar actual y propuesto en el loop principal, MKT va aparte
  const mainSims = sims.filter(s => s !== mktSim)

  return `
<section class="section bg-marfil" id="simulacion">
  <div class="section-inner reveal">
    <div class="badge">Simulacion</div>
    <div class="section-title">Sensibilidad de precio</div>
    <div class="section-subtitle">
      Tres escenarios para ${e.config.projectName}: mantener $${e.config.precioM2Billete}/m\u00B2,
      ajustar a $${propuesto?.precioM2.toLocaleString() ?? '—'}/m\u00B2,
      o reducir a $${mktSim?.precioM2.toLocaleString() ?? '—'}/m\u00B2 y destinar la diferencia a marketing.
      TC paralelo: Bs ${sims[0].tc.toFixed(2)}.
    </div>

    <!-- Referencia mercado -->
    <div style="font-size:13px;font-weight:500;color:var(--piedra);margin-bottom:12px;letter-spacing:0.5px">MEDIANAS DE REFERENCIA EN ${e.config.zona.toUpperCase()}</div>
    <div style="display:flex;gap:16px;margin-bottom:32px;flex-wrap:wrap">
      ${dormTypes.map(d => `<div style="padding:12px 20px;border-radius:14px;background:var(--white);font-size:14px">
        <strong>${dormLabel(d)}</strong>: ${fmt(e.simulacion.medianasM2Referencia[d] ?? 0)}/m\u00B2 &middot; ${fmt(refs[d] ?? 0)} ticket
      </div>`).join('')}
    </div>

    ${mainSims.map((s: SimulacionEscenario) => {
      const label = getLabel(s)
      const isActual = s.precioM2 === e.config.precioM2Billete
      return `
    <div style="margin-bottom:40px;padding:28px;border-radius:14px;background:var(--white);border:${isActual ? '2px solid var(--caramelo)' : '1px solid var(--arena)'}">
      ${(() => {
        const TC_O = 6.96
        const normM2 = e.config.tcDetectado === 'paralelo' ? Math.round(s.precioM2 * s.tc / TC_O) : s.precioM2
        return `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px">
        <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${isActual ? 'var(--caramelo)' : 'var(--piedra)'}">${label}</div>
        <div style="font-family:'Figtree',sans-serif;font-size:24px;font-weight:500;color:var(--carbon)">$${s.precioM2.toLocaleString()}/m\u00B2 billete</div>
        <div style="font-size:15px;color:var(--piedra)">(${fmt(normM2)}/m\u00B2 normalizado)</div>
      </div>`
      })()}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div style="padding:16px;border-radius:14px;background:var(--marfil);text-align:center">
          <div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:var(--carbon)">${fmt(s.promedioTicket)}</div>
          <div style="font-size:13px;color:var(--piedra)">Ticket promedio normalizado</div>
        </div>
        <div style="padding:16px;border-radius:14px;background:var(--marfil);text-align:center">
          <div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:${Math.abs(s.promedioDiff) <= 10 ? 'var(--caramelo)' : 'var(--carbon)'}">${fmtPct(s.promedioDiff)}</div>
          <div style="font-size:13px;color:var(--piedra)">vs mediana zona</div>
        </div>
      </div>
      <div style="margin-top:16px">
        <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.textContent=this.nextElementSibling.style.display==='none'?'Ver detalle por unidad':'Ocultar detalle'" style="font-size:14px;color:var(--caramelo);cursor:pointer;border:1px solid var(--caramelo);background:none;padding:8px 20px;font-family:'DM Sans',sans-serif;font-weight:500;border-radius:100px;transition:background 0.2s" onmouseover="this.style.background='var(--caramelo-10)'" onmouseout="this.style.background='none'">Ver detalle por unidad</button>
        <div style="display:none;margin-top:16px">
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Dpto</th><th>Dorms</th><th>m\u00B2</th><th>Ticket billete</th><th>Normalizado</th><th>$/m\u00B2 vs med.</th><th>Posicion</th></tr></thead>
              <tbody>
                ${s.byUnit.map(u => `<tr>
                  <td class="strong">${u.dpto}</td><td>${dormLabel(u.dorms)}</td><td>${u.m2}</td>
                  <td>${fmt(u.ticketUsd)}</td><td>${fmt(u.ticketNorm)}</td>
                  <td>${fmtPct(u.diffVsMediana)}</td><td>${categoryBadge(u.categoria)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`}).join('')}

    ${actual && propuesto ? `
    <!-- Impacto en dinero -->
    <div style="padding:28px;border-radius:14px;background:var(--white);border:1px solid var(--arena)">
      <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--caramelo);margin-bottom:20px">Impacto del ajuste</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px">
        <div style="padding:16px;border-radius:14px;background:var(--marfil);text-align:center">
          <div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:var(--carbon)">-$${diffPrecioM2}/m\u00B2</div>
          <div style="font-size:13px;color:var(--piedra)">Reduccion por m\u00B2</div>
        </div>
        <div style="padding:16px;border-radius:14px;background:var(--marfil);text-align:center">
          <div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:var(--carbon)">${fmt(Math.round(actual.promedioTicket - propuesto.promedioTicket))}</div>
          <div style="font-size:13px;color:var(--piedra)">Menos por unidad (prom.)</div>
        </div>
        <div style="padding:16px;border-radius:14px;background:var(--marfil);text-align:center">
          <div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:var(--carbon)">${fmt(Math.round((actual.promedioTicket - propuesto.promedioTicket) * e.config.inventory.length))}</div>
          <div style="font-size:13px;color:var(--piedra)">Total ${e.config.inventory.length} unidades</div>
        </div>
      </div>
      <div style="margin-top:16px">
        <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.textContent=this.nextElementSibling.style.display==='none'?'Ver detalle por unidad':'Ocultar detalle'" style="font-size:14px;color:var(--caramelo);cursor:pointer;border:1px solid var(--caramelo);background:none;padding:8px 20px;font-family:'DM Sans',sans-serif;font-weight:500;border-radius:100px;transition:background 0.2s" onmouseover="this.style.background='var(--caramelo-10)'" onmouseout="this.style.background='none'">Ver detalle por unidad</button>
        <div style="display:none;margin-top:16px">
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Dpto</th><th>Dorms</th><th>m\u00B2</th><th>Actual</th><th>Propuesto</th><th>Diferencia</th></tr></thead>
              <tbody>
                ${actual.byUnit.map((u, i) => {
                  const prop = propuesto.byUnit[i]
                  return `<tr>
                  <td class="strong">${u.dpto}</td><td>${dormLabel(u.dorms)}</td><td>${u.m2}</td>
                  <td>${fmt(u.ticketUsd)}</td><td>${fmt(prop.ticketUsd)}</td>
                  <td style="color:var(--piedra)">-${fmt(u.ticketUsd - prop.ticketUsd)}</td>
                </tr>`}).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div style="font-size:14px;color:var(--piedra);margin-top:20px;line-height:1.6;padding-top:16px;border-top:1px solid var(--arena)">
        <strong>Consideraciones:</strong> Un ajuste de precio puede mejorar la velocidad de colocacion al posicionar
        las unidades mas cerca o por debajo de la mediana del mercado. Sin embargo, no hay datos suficientes para
        cuantificar el impacto en velocidad de venta — la rotacion observada no distingue entre ventas y retiros.
        El analisis muestra unicamente el cambio en posicion competitiva y el impacto financiero directo.
      </div>
    </div>` : ''}

    ${actual && mktSim ? `
    <!-- Alternativa MKT -->
    <div style="padding:28px;border-radius:14px;background:var(--white);border:2px solid var(--caramelo);margin-top:32px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <div style="font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--caramelo)">Alternativa: reducir + destinar a marketing</div>
      </div>
      ${(() => {
        const TC_O = 6.96
        const mktNormM2 = e.config.tcDetectado === 'paralelo' ? Math.round(mktSim.precioM2 * mktSim.tc / TC_O) : mktSim.precioM2
        return `<div style="font-size:15px;color:var(--piedra);margin-bottom:24px;line-height:1.6">
        En vez de bajar de $${actual.precioM2.toLocaleString()} a $${propuesto?.precioM2.toLocaleString()}/m\u00B2 (ceder $${diffPrecioM2}/m\u00B2),
        reducir solo a <strong style="color:var(--carbon)">$${mktSim.precioM2.toLocaleString()}/m\u00B2 billete (${fmt(mktNormM2)}/m\u00B2 normalizado)</strong>
        y destinar los $${actual.precioM2 - mktSim.precioM2}/m\u00B2 de diferencia a marketing y visibilidad.
      </div>`
      })()}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px">
        <div style="padding:16px;border-radius:14px;background:var(--marfil);text-align:center">
          <div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:var(--caramelo)">$${actual.precioM2 - mktSim.precioM2}/m\u00B2</div>
          <div style="font-size:13px;color:var(--piedra)">Destinado a MKT</div>
        </div>
        <div style="padding:16px;border-radius:14px;background:var(--marfil);text-align:center">
          ${(() => {
            const avgM2 = Math.round(e.config.inventory.reduce((s, u) => s + u.m2, 0) / e.config.inventory.length)
            const mktPorUnidad = (actual.precioM2 - mktSim.precioM2) * avgM2
            return `<div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:var(--carbon)">${fmt(mktPorUnidad)}</div>
          <div style="font-size:13px;color:var(--piedra)">MKT por unidad (prom. ${avgM2}m\u00B2)</div>`
          })()}
        </div>
        <div style="padding:16px;border-radius:14px;background:var(--marfil);text-align:center">
          ${(() => {
            const totalMkt = e.config.inventory.reduce((s, u) => s + (actual.precioM2 - mktSim.precioM2) * u.m2, 0)
            return `<div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:var(--carbon)">${fmt(Math.round(totalMkt))}</div>
          <div style="font-size:13px;color:var(--piedra)">Total MKT (${e.config.inventory.length} uds)</div>`
          })()}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div style="padding:16px;border-radius:14px;background:var(--marfil);text-align:center">
          <div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:var(--carbon)">${fmt(mktSim.promedioTicket)}</div>
          <div style="font-size:13px;color:var(--piedra)">Ticket promedio norm.</div>
        </div>
        <div style="padding:16px;border-radius:14px;background:var(--marfil);text-align:center">
          <div style="font-family:'Figtree',sans-serif;font-size:28px;font-weight:500;color:${Math.abs(mktSim.promedioDiff) <= 10 ? 'var(--caramelo)' : 'var(--carbon)'}">${fmtPct(mktSim.promedioDiff)}</div>
          <div style="font-size:13px;color:var(--piedra)">$/m\u00B2 vs mediana zona</div>
        </div>
      </div>
      <div style="margin-top:16px">
        <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.textContent=this.nextElementSibling.style.display==='none'?'Ver detalle por unidad':'Ocultar detalle'" style="font-size:14px;color:var(--caramelo);cursor:pointer;border:1px solid var(--caramelo);background:none;padding:8px 20px;font-family:'DM Sans',sans-serif;font-weight:500;border-radius:100px;transition:background 0.2s" onmouseover="this.style.background='var(--caramelo-10)'" onmouseout="this.style.background='none'">Ver detalle por unidad</button>
        <div style="display:none;margin-top:16px">
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Dpto</th><th>Dorms</th><th>m\u00B2</th><th>Ticket billete</th><th>Normalizado</th><th>$/m\u00B2 vs med.</th><th>Posicion</th></tr></thead>
              <tbody>
                ${mktSim.byUnit.map(u => `<tr>
                  <td class="strong">${u.dpto}</td><td>${dormLabel(u.dorms)}</td><td>${u.m2}</td>
                  <td>${fmt(u.ticketUsd)}</td><td>${fmt(u.ticketNorm)}</td>
                  <td>${fmtPct(u.diffVsMediana)}</td><td>${categoryBadge(u.categoria)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div style="font-size:14px;color:var(--piedra);margin-top:20px;line-height:1.6;padding-top:16px;border-top:1px solid var(--arena)">
        Este escenario mantiene una posicion competitiva similar al actual pero genera un presupuesto de marketing
        con la diferencia de precio. Ese presupuesto puede destinarse a: fotos profesionales, landing web,
        publicacion en portales adicionales, o material para brokers. El impacto en visibilidad es directo
        — hoy ${e.visibilidad.gapPct}% del inventario es invisible en portales.
      </div>
    </div>` : ''}

    <!-- Nota sobre comparación comercial vs técnica -->
    <div style="padding:20px;border-radius:14px;background:var(--white);border-left:3px solid var(--caramelo);margin-top:32px">
      <div style="font-size:14px;font-weight:600;color:var(--carbon);margin-bottom:8px">Comparacion comercial vs tecnica</div>
      <div style="font-size:14px;color:var(--piedra);line-height:1.7">
        La posicion competitiva de arriba compara por <strong>$/m\u00B2</strong> — la forma tecnica correcta.
        Pero en la practica, los compradores comparan <strong>tickets por tipologia</strong>: "cuanto cuesta un 1 dormitorio".
        En esa comparacion, ${e.config.projectName} aparece mas caro porque sus unidades son mas grandes
        que la mediana del mercado (especialmente el 1D con ${e.config.inventory.find(u => u.dorms === 1)?.m2 ?? '—'}m\u00B2
        vs ~50m\u00B2 del mercado). El valor por m\u00B2 es comparable, pero el ticket total es mayor.
        Comunicar el tamano como diferenciador es clave para que el comprador entienda por que paga mas.
      </div>
    </div>
  </div>
</section>`
}

// ───── 12. RECOMENDACIONES ─────
export function renderRecomendaciones(e: EstudioCompleto): string {
  const recs: Array<{ period: string; cls: string; title: string; body: string }> = []

  // INMEDIATO
  recs.push({
    period: 'Inmediato', cls: 'urgente',
    title: 'Reuniones mensuales con brokers',
    body: `Hoy ${e.visibilidad.visiblesEnPortal} listings visibles de ${e.visibilidad.totalInventario} unidades — los brokers publican una por exclusividad, lo cual es normal. Pero no hay retroalimentacion. Establecer reuniones mensuales para: revisar que se muestra del edificio, como se promociona, reporte de leads recibidos y visitas realizadas. Sin esa informacion no se puede ajustar la estrategia.`,
  })

  recs.push({
    period: 'Inmediato', cls: 'urgente',
    title: 'Comunicar el tamano del 1D como diferenciador',
    body: `Los 1D de ${e.config.projectName} tienen ${e.config.inventory.find(u => u.dorms === 1)?.m2 ?? 62}m\u00B2 — 25% mas grande que la mediana del mercado (50m\u00B2). Los listings actuales no mencionan esto. El comprador ve "1 dormitorio" y compara ticket contra dptos mas chicos. Incluir esto en el material que se entrega a los brokers.`,
  })

  // CORTO PLAZO
  recs.push({
    period: 'Corto plazo', cls: 'corto',
    title: 'Fotos profesionales de departamentos equipados',
    body: `${e.config.projectName} entrega con linea blanca completa (9/9 equipamiento) pero los listings actuales no lo muestran. Una sesion de fotos profesional de un dpto real equipado es el material mas potente para brokers, landing y redes.`,
  })

  recs.push({
    period: 'Corto plazo', cls: 'corto',
    title: 'Evaluar presupuesto de marketing con escenario $1,600/m\u00B2',
    body: `Reducir $50/m\u00B2 genera ~$64K para una campana de 14+ meses: Meta Ads, contenido redes, UGC video, landing web. El impacto en visibilidad es directo — hoy ${e.visibilidad.gapPct}% del inventario no existe para el comprador online. Ver seccion Simulacion.`,
  })

  const yieldAmob2d = e.yield.byDorms.find(d => d.dorms === 2)
  if (yieldAmob2d?.premiumAmobladoPct && yieldAmob2d.premiumAmobladoPct > 20) {
    recs.push({
      period: 'Corto plazo', cls: 'corto',
      title: 'Posicionar los 2D para comprador-inversor',
      body: `En el mercado de alquiler de la zona, los 2D amoblados tienen una renta ${fmtPct(yieldAmob2d.premiumAmobladoPct)} mayor que los sin amoblar. La linea blanca incluida en ${e.config.projectName} reduce la inversion necesaria para amoblar. Esto es un argumento comercial para el comprador-inversor, aunque el retorno real depende de vacancias, costos de amoblar y gastos que no se incluyen en este estudio.`,
    })
  }

  // MEDIANO PLAZO
  recs.push({
    period: 'Mediano plazo', cls: 'mediano',
    title: 'Mejorar amenidades del edificio',
    body: `${e.config.projectName} tiene 7 amenidades vs 11-15 de competidores premium. Evaluar agregar: pet friendly (sin costo estructural, solo reglamento), co-working (amueblar un espacio existente), o mejoras en areas comunes. Cada amenidad agregada acerca el producto al segmento premium sin cambiar precio.`,
  })

  recs.push({
    period: 'Mediano plazo', cls: 'mediano',
    title: 'Explorar pet friendly como diferenciador rapido',
    body: `Varios competidores (Atrium, HH Once, Spazios, Luxe, Sky Tower) ya son pet friendly. Es una politica de reglamento, no requiere inversion. Permite acceder a un segmento de compradores que filtra por este criterio.`,
  })

  return `
<section class="section bg-white" id="recomendaciones">
  <div class="section-inner reveal">
    <div class="badge">Acciones</div>
    <div class="section-title">Que hacer y cuando</div>
    <div class="section-subtitle">Recomendaciones priorizadas basadas en los datos del estudio.</div>
    <div class="timeline">
      ${recs.map(r => `
      <div class="tl-block${r.cls === 'urgente' ? ' urgente' : ''}">
        <div class="tl-dot"></div>
        <div class="tl-period ${r.cls}">${r.period}</div>
        <div class="tl-card">
          <div class="tl-card-title">${r.title}</div>
          <div class="tl-card-body" style="display:block">${r.body}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>
</section>`
}
