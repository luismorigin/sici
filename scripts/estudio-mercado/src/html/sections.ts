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
  return `
<section class="hero" id="hero">
  <div class="hero-panel">
    <div class="hero-badge">Estudio de Mercado</div>
    <h1>${config.projectName}</h1>
    <div class="hero-sub">${config.projectSubtitle ?? config.developerName}</div>
    <div class="hero-line"></div>
    <div class="hero-meta">
      <strong>${config.fecha}</strong><br>
      ${config.fechaCorte ? `Corte de datos: ${config.fechaCorte}<br>` : ''}
      Zona: ${config.zona}<br>
      Elaborado por <strong>Simon</strong> — Inteligencia Inmobiliaria
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
    ${barChartZonas(zonas, 'chartZonas', e.panorama.medianaM2Global)}
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
        return `<div class="yield-card${pct >= 40 ? ' attractive' : ''}" style="cursor:pointer" onclick="filterRotacion(${d})">
        <div class="yield-tipo">${dormLabel(d)}</div>
        <div class="yield-value${pct >= 40 ? ' high' : ' low'}">${count}</div>
        <div class="yield-rent">${pct}% de las salidas individuales</div>
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
    <p class="takeaway">
      Nota: Una propiedad que sale del portal puede haber sido vendida, retirada por el broker,
      o haber expirado. Presentamos los datos observados sin inferir la causa.
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
  </div>
</section>`
}

// ───── 11. SIMULACION PRECIO ─────
export function renderSimulacion(e: EstudioCompleto): string {
  const sims = e.simulacion.escenarios
  if (sims.length === 0) return ''

  const refs = e.simulacion.medianasReferencia
  const dormTypes = [...new Set(e.config.inventory.map(u => u.dorms))].sort()

  return `
<section class="section bg-marfil" id="simulacion">
  <div class="section-inner reveal">
    <div class="badge">Simulacion</div>
    <div class="section-title">Sensibilidad de precio</div>
    <div class="section-subtitle">
      Como cambia la posicion competitiva de ${e.config.projectName} con diferentes precios por m² y tipos de cambio.
      Referencia: medianas de ${e.config.zona} por tipologia.
    </div>
    <div class="table-wrap" style="margin-bottom:24px">
      <table class="data">
        <thead><tr><th>Tipologia</th><th>Mediana zona</th></tr></thead>
        <tbody>
          ${dormTypes.map(d => `<tr><td class="strong">${dormLabel(d)}</td><td>${fmt(refs[d] ?? 0)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${sims.map((s: SimulacionEscenario) => `
    <div style="margin-bottom:48px">
      <h3 style="font-family:'Figtree',sans-serif;font-size:22px;font-weight:500;margin-bottom:16px">
        Escenario: $${s.precioM2.toLocaleString()}/m² @ TC ${s.tc.toFixed(2)}
      </h3>
      <div class="kpi-grid" style="margin-bottom:24px">
        <div class="kpi">
          <div class="kpi-value" style="font-size:36px">${fmt(s.promedioTicket)}</div>
          <div class="kpi-label">Ticket promedio norm.</div>
        </div>
        <div class="kpi">
          <div class="kpi-value${Math.abs(s.promedioDiff) <= 10 ? ' accent' : ''}" style="font-size:36px">${fmtPct(s.promedioDiff)}</div>
          <div class="kpi-label">vs mediana zona</div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Dpto</th><th>Dorms</th><th>m²</th><th>Ticket USD</th><th>Normalizado</th><th>vs Mediana</th><th>Posicion</th></tr></thead>
          <tbody>
            ${s.byUnit.map(u => `<tr>
              <td class="strong">${u.dpto}</td><td>${dormLabel(u.dorms)}</td><td>${u.m2}</td>
              <td>${fmt(u.ticketUsd)}</td><td>${fmt(u.ticketNorm)}</td>
              <td>${fmtPct(u.diffVsMediana)}</td><td>${categoryBadge(u.categoria)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`).join('')}
  </div>
</section>`
}

// ───── 12. RECOMENDACIONES ─────
export function renderRecomendaciones(e: EstudioCompleto): string {
  const recs: Array<{ period: string; cls: string; title: string; body: string }> = []

  // Dynamic recommendations based on data
  if (e.visibilidad.gapPct > 50) {
    recs.push({
      period: 'Inmediato', cls: 'urgente',
      title: 'Publicar inventario completo en portales',
      body: `${e.visibilidad.invisibles} de ${e.visibilidad.totalInventario} unidades son invisibles. Los ${dormLabel(e.config.inventory.find(u => !Object.keys(e.visibilidad.visiblesPorDorms).map(Number).includes(u.dorms))?.dorms ?? 2)} no aparecen en ningun portal. Esta es la accion de mayor impacto inmediato.`,
    })
  }

  if (e.posicion.categoriaGlobal === 'sobre_promedio' || e.posicion.categoriaGlobal === 'premium') {
    recs.push({
      period: 'Corto plazo', cls: 'corto',
      title: 'Diferenciarse por equipamiento y entrega',
      body: `El precio esta ${fmtPct(e.posicion.diffPctGlobal)} sobre la mediana. Justificar con: entrega inmediata (vs preventa de competidores), equipamiento completo, y condiciones de financiamiento.`,
    })
  }

  const yieldAmob2d = e.yield.byDorms.find(d => d.dorms === 2)
  if (yieldAmob2d?.premiumAmobladoPct && yieldAmob2d.premiumAmobladoPct > 20) {
    recs.push({
      period: 'Corto plazo', cls: 'corto',
      title: 'Comunicar potencial de renta al comprador-inversor',
      body: `El premium por amoblar un 2D es de ${fmtPct(yieldAmob2d.premiumAmobladoPct)}. El equipamiento de linea blanca de ${e.config.projectName} facilita capturar ese diferencial.`,
    })
  }

  recs.push({
    period: 'Mediano plazo', cls: 'mediano',
    title: 'Monitorear competidores estancados',
    body: `Proyectos con >150 dias pueden ajustar precios. Seguir de cerca para detectar oportunidades de reposicionamiento.`,
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
