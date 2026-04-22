export const BASELINE_STYLES = `
  :root {
    --arena: #EDE8DC;
    --arena-dark: #DFD8C5;
    --negro: #141414;
    --negro-soft: #2A2A2A;
    --salvia: #3A6A48;
    --gris-600: #5A5A5A;
    --gris-400: #8A8A8A;
    --gris-200: #D8D4C8;
    --amber-caveat: #C08A2E;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'DM Sans', system-ui, sans-serif;
    background: var(--arena);
    color: var(--negro);
    line-height: 1.6;
    font-size: 15px;
  }
  h1, h2, h3, h4 { font-family: 'Figtree', system-ui, sans-serif; font-weight: 600; letter-spacing: -0.01em; }
  .page { max-width: 920px; margin: 0 auto; padding: 60px 48px; }
  .cover { min-height: 90vh; display: flex; flex-direction: column; justify-content: space-between; border-bottom: 1px solid var(--gris-200); }
  .cover .top .kicker { font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--salvia); font-weight: 600; margin-bottom: 24px; }
  .cover h1 { font-size: 52px; line-height: 1.08; font-weight: 700; max-width: 14ch; margin-bottom: 16px; }
  .cover .subtitle { font-size: 18px; color: var(--gris-600); max-width: 48ch; }
  .cover .foot { display: flex; justify-content: space-between; align-items: baseline; padding-top: 32px; border-top: 1px solid var(--gris-200); font-size: 13px; color: var(--gris-600); }
  .cover .foot strong { color: var(--negro); font-weight: 600; }

  section { padding: 72px 0 16px; border-top: 1px solid var(--gris-200); }
  section:first-of-type { border-top: none; }
  .section-num { font-size: 12px; letter-spacing: 0.16em; color: var(--salvia); font-weight: 600; text-transform: uppercase; margin-bottom: 12px; display: block; }
  h2 { font-size: 32px; line-height: 1.15; margin-bottom: 24px; max-width: 22ch; }
  h3 { font-size: 18px; margin: 32px 0 12px; color: var(--negro); }
  h4 { font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--gris-600); margin: 20px 0 10px; }

  p { margin-bottom: 16px; max-width: 72ch; }
  p.lead { font-size: 17px; color: var(--negro-soft); max-width: 68ch; }

  .muted { color: var(--gris-600); font-size: 13px; }
  .caveat { background: rgba(192,138,46,0.08); border-left: 3px solid var(--amber-caveat); padding: 14px 18px; margin: 20px 0; font-size: 14px; color: var(--negro-soft); }
  .caveat strong { color: var(--amber-caveat); display: block; margin-bottom: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
  .note { background: rgba(58,106,72,0.06); border-left: 3px solid var(--salvia); padding: 14px 18px; margin: 20px 0; font-size: 14px; }

  table { width: 100%; border-collapse: collapse; margin: 20px 0 24px; font-size: 14px; }
  th { text-align: left; font-weight: 600; padding: 10px 12px; background: var(--arena-dark); color: var(--negro); border-bottom: 2px solid var(--gris-200); font-family: 'Figtree', sans-serif; font-size: 13px; text-transform: uppercase; letter-spacing: 0.03em; }
  th.num { text-align: right; }
  td { padding: 9px 12px; border-bottom: 1px solid var(--gris-200); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.n { color: var(--gris-600); font-size: 13px; }
  tr:hover td { background: rgba(0,0,0,0.015); }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 28px 0; }
  .kpi { background: white; padding: 20px; border-radius: 2px; border-top: 2px solid var(--salvia); }
  .kpi .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--gris-600); margin-bottom: 8px; }
  .kpi .value { font-size: 28px; font-weight: 700; font-family: 'Figtree', sans-serif; color: var(--negro); }
  .kpi .sub { font-size: 12px; color: var(--gris-600); margin-top: 4px; }

  .bar-row { display: grid; grid-template-columns: 140px 1fr 80px; align-items: center; gap: 12px; padding: 8px 0; font-size: 14px; }
  .bar-track { background: var(--arena-dark); height: 14px; border-radius: 0; position: relative; }
  .bar-fill { height: 100%; background: var(--salvia); }
  .bar-val { text-align: right; font-variant-numeric: tabular-nums; color: var(--gris-600); font-size: 13px; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 24px; }
  ul, ol { padding-left: 24px; margin-bottom: 16px; }
  ul li, ol li { margin-bottom: 8px; max-width: 66ch; }

  .rojo-list { background: white; padding: 24px 28px; border-left: 3px solid #8A2A2A; margin: 20px 0; }
  .rojo-list h4 { color: #8A2A2A; margin-top: 0; }
  .rojo-list .item { padding: 10px 0; border-bottom: 1px solid var(--gris-200); }
  .rojo-list .item:last-child { border: none; }
  .rojo-list .item strong { display: block; margin-bottom: 4px; }

  .chart-wrap { margin: 28px 0 12px; padding: 24px; background: white; border-top: 2px solid var(--salvia); }
  .chart-wrap .chart-title { font-family: 'Figtree', sans-serif; font-weight: 600; font-size: 15px; margin-bottom: 4px; color: var(--negro); }
  .chart-wrap .chart-subtitle { font-size: 12px; color: var(--gris-600); margin-bottom: 16px; }
  .chart-canvas { position: relative; height: 320px; }
  .chart-canvas-tall { position: relative; height: 420px; }

  footer { border-top: 1px solid var(--gris-200); padding: 48px 0 24px; margin-top: 60px; font-size: 13px; color: var(--gris-600); }
  footer .firma { color: var(--negro); font-weight: 600; margin-bottom: 8px; font-family: 'Figtree', sans-serif; }

  .toc { background: white; padding: 28px 32px; margin: 32px 0; border-top: 2px solid var(--negro); }
  .toc h4 { margin-top: 0; }
  .toc ol { list-style: none; padding: 0; }
  .toc li { padding: 6px 0; display: flex; justify-content: space-between; border-bottom: 1px dotted var(--gris-200); font-size: 14px; }
  .toc li a { color: var(--negro); text-decoration: none; }
  .toc li a:hover { color: var(--salvia); }
  .toc li span { color: var(--gris-400); font-size: 12px; }

  /* Details expandibles — metodología y tabla precios */
  details.details-table {
    margin: 20px 0 24px; padding: 14px 18px;
    background: white; border-left: 3px solid var(--gris-200);
    font-size: 14px;
  }
  details.details-table[open] { border-left-color: var(--salvia); padding-bottom: 18px; }
  details.details-table summary {
    cursor: pointer; font-family: 'Figtree', sans-serif; font-weight: 600;
    font-size: 13px; color: var(--salvia); letter-spacing: 0.02em;
    list-style: none; padding: 2px 0; user-select: none;
  }
  details.details-table summary::-webkit-details-marker { display: none; }
  details.details-table summary::before {
    content: '+ '; font-weight: 700; color: var(--salvia);
    display: inline-block; width: 14px;
  }
  details.details-table[open] summary::before { content: '− '; }
  details.details-table[open] summary { margin-bottom: 12px; border-bottom: 1px solid var(--gris-200); padding-bottom: 10px; }
  details.details-table table { margin-top: 8px; }

  /* §3 — Donut composición fuente */
  .fuente-donut-wrap {
    display: flex; align-items: center; gap: 32px; margin: 20px 0 24px;
    padding: 20px 24px; background: white; border-top: 2px solid var(--salvia);
  }
  .fuente-donut { flex-shrink: 0; }
  .fuente-donut .donut-total-num {
    font-family: 'Figtree', sans-serif; font-weight: 700; font-size: 26px;
    fill: var(--negro); font-variant-numeric: tabular-nums;
  }
  .fuente-donut .donut-total-label {
    font-family: 'Figtree', sans-serif; font-size: 10px;
    fill: var(--gris-400); text-transform: uppercase; letter-spacing: 0.1em;
  }
  .fuente-legend { list-style: none; padding: 0; margin: 0; flex: 1; }
  .fuente-legend li {
    display: grid; grid-template-columns: 18px 1fr auto auto;
    align-items: center; gap: 10px; padding: 10px 0;
    border-bottom: 1px dotted var(--gris-200); font-size: 14px;
    max-width: none;
  }
  .fuente-legend li:last-child { border-bottom: none; }
  .fuente-dot {
    display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  }
  .fuente-label { color: var(--negro); font-weight: 500; }
  .fuente-num { font-variant-numeric: tabular-nums; color: var(--gris-600); font-size: 13px; }
  .fuente-pct {
    font-family: 'Figtree', sans-serif; font-weight: 700; color: var(--negro);
    font-variant-numeric: tabular-nums; min-width: 46px; text-align: right;
  }

  /* §5 — Matriz consolidada: subtle divider entre grupos de columnas */
  .matriz-oferta th[colspan] {
    border-bottom: 1px solid var(--gris-200);
  }
  .matriz-oferta td.tot-cell {
    border-right: 1px solid var(--gris-200);
  }
  .matriz-oferta th:nth-child(6), /* Total */
  .matriz-oferta td.tot-cell {
    background: rgba(0,0,0,0.02);
  }

  /* §4 — Mapa SVG de polígonos */
  .mapa-wrap {
    margin: 20px 0 28px; padding: 24px; background: white;
    border-top: 2px solid var(--salvia);
  }
  .mapa-title {
    font-family: 'Figtree', sans-serif; font-weight: 600; font-size: 15px;
    margin-bottom: 4px; color: var(--negro);
  }
  .mapa-subtitle {
    font-size: 12px; color: var(--gris-600); margin-bottom: 16px;
  }
  .mapa-svg { width: 100%; height: auto; display: block; }
  .mapa-label-name {
    font-family: 'Figtree', sans-serif; font-weight: 600; font-size: 13px;
    fill: var(--negro); letter-spacing: -0.01em;
    paint-order: stroke; stroke: white; stroke-width: 3px; stroke-linejoin: round;
  }
  .mapa-label-uds {
    font-family: 'Figtree', sans-serif; font-weight: 500; font-size: 10px;
    fill: var(--negro-soft); letter-spacing: 0.04em;
    paint-order: stroke; stroke: white; stroke-width: 2.5px; stroke-linejoin: round;
  }
  .mapa-legend {
    display: flex; flex-wrap: wrap; gap: 14px 20px; margin-top: 16px;
    font-size: 11px; color: var(--gris-600);
    font-family: 'Figtree', sans-serif; text-transform: uppercase; letter-spacing: 0.06em;
  }
  .mapa-leg-item { display: inline-flex; align-items: center; gap: 6px; }
  .mapa-leg-sw {
    display: inline-block; width: 12px; height: 12px; opacity: 0.75;
  }

  /* §4 — Geografía línea bajo cada h4 de perfil */
  .geo-blurb {
    font-size: 12px; color: var(--gris-600); font-style: italic;
    margin: 4px 0 10px; padding: 6px 10px;
    background: var(--arena-dark); border-left: 2px solid var(--salvia);
    max-width: none;
  }

  /* §7 — Proyectos bar chart table */
  .proy-legend {
    display: flex; gap: 18px; margin: 16px 0 20px; flex-wrap: wrap;
    font-size: 11px; color: var(--gris-600); text-transform: uppercase;
    letter-spacing: 0.06em; font-family: 'Figtree', sans-serif;
  }
  .proy-legend .sw {
    display: inline-block; width: 10px; height: 10px; margin-right: 6px;
    vertical-align: middle;
  }
  .proy-chart { margin: 16px 0 20px; }
  .proy-zona-group {
    margin-bottom: 14px; padding: 12px 16px; background: white;
    border-top: 2px solid var(--salvia);
  }
  .proy-zona-group:last-child { margin-bottom: 0; }
  .proy-zona-header {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 8px; padding-bottom: 6px;
    border-bottom: 1px solid var(--gris-200);
  }
  .proy-zona-name {
    font-family: 'Figtree', sans-serif; font-weight: 600; font-size: 13px;
    color: var(--negro); letter-spacing: 0.02em;
  }
  .proy-zona-meta {
    font-size: 10px; color: var(--gris-600);
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .proy-row {
    display: grid; grid-template-columns: 220px 1fr 36px;
    gap: 14px; align-items: center; padding: 4px 0;
    font-size: 12px;
  }
  .proy-name {
    display: flex; flex-direction: row; align-items: baseline; gap: 6px;
    min-width: 0;
  }
  .proy-name strong {
    font-weight: 600; color: var(--negro); font-size: 12px;
    font-family: 'Figtree', sans-serif;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .proy-dev {
    font-size: 10px; color: var(--gris-600);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    flex-shrink: 1;
  }
  .proy-sindev { color: var(--gris-400); font-style: italic; }
  .proy-bar-wrap {
    background: var(--arena); height: 10px; position: relative;
  }
  .proy-bar { height: 100%; min-width: 2px; transition: width 0.3s ease; }
  .proy-uds {
    font-family: 'Figtree', sans-serif; font-weight: 700; font-size: 13px;
    color: var(--negro); font-variant-numeric: tabular-nums; text-align: right;
  }

  /* Brand logo placements */
  .cover-brand { margin-bottom: 28px; display: flex; align-items: center; }
  .cta-brand { margin-bottom: 20px; }
  .footer-brand {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 12px;
  }
  .footer-brand .firma { margin-bottom: 0; }

  /* CTA producto — funnel a estudios privados (sección antes de ficha) */
  .cta-producto {
    margin: 48px 0 32px; padding: 40px 44px;
    background: var(--negro); color: var(--arena);
    border-top: 3px solid var(--salvia);
  }
  .cta-producto .kicker {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em;
    color: #A7C8B1; font-weight: 600; margin-bottom: 14px;
    font-family: 'Figtree', sans-serif;
  }
  .cta-producto h3 {
    font-family: 'Figtree', sans-serif; color: var(--arena);
    font-size: 28px; line-height: 1.2; margin: 0 0 16px; max-width: 22ch;
  }
  .cta-producto p {
    font-size: 15px; color: #C8C2B0; max-width: 58ch; margin-bottom: 20px;
  }
  .cta-producto .cta-button {
    display: inline-block; padding: 12px 24px;
    background: var(--arena); color: var(--negro);
    font-family: 'Figtree', sans-serif; font-weight: 600; font-size: 14px;
    text-decoration: none; letter-spacing: 0.02em;
    transition: background 0.2s ease;
  }
  .cta-producto .cta-button:hover { background: white; }
  .cta-producto .cta-meta {
    display: block; margin-top: 16px; font-size: 12px; color: #8A8A8A;
  }
  .cta-producto .cta-meta a { color: #C8C2B0; text-decoration: underline; text-decoration-color: #5A5A5A; }

  /* Small multiples — grilla de mini-fichas por zona (§4) */
  .zona-tiles {
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px;
    margin: 28px 0 24px;
  }
  .zona-tile {
    background: white; padding: 18px 16px; border-top: 2px solid var(--salvia);
  }
  .zona-tile .zt-name {
    font-family: 'Figtree', sans-serif; font-weight: 600; font-size: 13px;
    color: var(--negro); margin-bottom: 8px; line-height: 1.2;
  }
  .zona-tile .zt-inv {
    font-family: 'Figtree', sans-serif; font-size: 32px; font-weight: 700;
    line-height: 1; color: var(--negro); font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .zona-tile .zt-unit {
    font-size: 11px; color: var(--gris-400); margin-top: 2px;
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .zona-tile .zt-mixbar {
    display: flex; height: 6px; margin: 12px 0 6px; background: var(--arena-dark);
  }
  .zona-tile .zt-mixbar > div { height: 100%; }
  .zona-tile .zt-mixbar .mb-entrega { background: var(--salvia); }
  .zona-tile .zt-mixbar .mb-preventa { background: #7BA687; }
  .zona-tile .zt-mixbar .mb-noesp { background: #C8D9CE; }
  .zona-tile .zt-mixlabel {
    font-size: 10px; color: var(--gris-600);
    text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500;
  }
  .zona-tile .zt-divider {
    border-top: 1px solid var(--gris-200); margin: 14px 0 10px;
  }
  .zona-tile .zt-row {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 12px; margin-top: 4px;
  }
  .zona-tile .zt-row .zt-label { color: var(--gris-600); }
  .zona-tile .zt-row .zt-val {
    font-family: 'Figtree', sans-serif; font-weight: 600; color: var(--negro);
    font-variant-numeric: tabular-nums;
  }
  .zona-tile .zt-days-label {
    font-size: 10px; color: var(--gris-600); text-transform: uppercase;
    letter-spacing: 0.06em; margin-top: 8px; font-weight: 500;
  }
  .zona-tile .zt-days {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 4px;
  }
  .zona-tile .zt-days > div {
    display: flex; flex-direction: column; align-items: center;
    padding: 4px 0; background: var(--arena); border-top: 1px solid var(--gris-200);
  }
  .zona-tile .zt-days-dorm {
    font-size: 9px; color: var(--gris-600); letter-spacing: 0.04em;
    text-transform: uppercase; font-weight: 600;
  }
  .zona-tile .zt-days-val {
    font-family: 'Figtree', sans-serif; font-weight: 600; font-size: 14px;
    color: var(--negro); font-variant-numeric: tabular-nums; line-height: 1.1;
  }

  .zona-tiles-legend {
    display: flex; gap: 20px; align-items: center; margin-top: 4px;
    font-size: 11px; color: var(--gris-600); text-transform: uppercase;
    letter-spacing: 0.06em; font-family: 'Figtree', sans-serif;
  }
  .zona-tiles-legend .swatch {
    display: inline-block; width: 10px; height: 10px; margin-right: 6px;
    vertical-align: middle;
  }

  /* Dot plot — rangos P25/P75 + mediana (§6) */
  .dotplot-wrap {
    margin: 28px 0 12px; padding: 24px 24px 16px;
    background: white; border-top: 2px solid var(--salvia);
  }
  .dotplot-wrap .chart-title {
    font-family: 'Figtree', sans-serif; font-weight: 600; font-size: 15px;
    margin-bottom: 4px; color: var(--negro);
  }
  .dotplot-wrap .chart-subtitle {
    font-size: 12px; color: var(--gris-600); margin-bottom: 20px;
  }
  .dotplot-row {
    display: grid; grid-template-columns: 140px 1fr 110px;
    align-items: center; gap: 12px;
    padding: 10px 0; border-top: 1px solid var(--gris-200);
  }
  .dotplot-row:first-of-type { border-top: none; }
  .dotplot-row .dp-label {
    font-size: 12px; color: var(--negro); font-weight: 500;
    font-family: 'Figtree', sans-serif;
  }
  .dotplot-row .dp-val {
    font-size: 12px; text-align: right; color: var(--gris-600);
    font-variant-numeric: tabular-nums;
  }
  .dotplot-row .dp-val strong { color: var(--negro); }
  .dotplot-svg { width: 100%; height: 20px; }
  .dotplot-axis {
    display: grid; grid-template-columns: 140px 1fr 110px; gap: 12px;
    font-size: 10px; color: var(--gris-400); margin-top: 12px;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .dotplot-axis .dp-scale {
    display: flex; justify-content: space-between;
  }

  /* Progress bar — lectura */
  .read-progress {
    position: fixed; top: 0; left: 0; right: 0; height: 3px;
    background: transparent; z-index: 100; pointer-events: none;
  }
  .read-progress .bar {
    height: 100%; background: var(--salvia); width: 0%;
    transition: width 0.08s ease-out;
  }

  /* Mini-ToC sticky lateral (desktop only) */
  .mini-toc {
    position: fixed; top: 100px; right: 24px; z-index: 50;
    background: rgba(255,255,255,0.92); backdrop-filter: blur(6px);
    padding: 14px 18px; font-size: 12px; max-width: 180px;
    border-left: 2px solid var(--gris-200);
    font-family: 'Figtree', sans-serif;
  }
  .mini-toc .title {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--gris-400); margin-bottom: 10px; font-weight: 600;
  }
  .mini-toc ol { list-style: none; padding: 0; margin: 0; }
  .mini-toc li {
    padding: 4px 0; font-size: 12px;
    color: var(--gris-600); border-left: 2px solid transparent;
    padding-left: 10px; margin-left: -2px; transition: all 0.2s ease;
  }
  .mini-toc li a { color: inherit; text-decoration: none; display: block; }
  .mini-toc li:hover { color: var(--negro); }
  .mini-toc li.active {
    color: var(--salvia); border-left-color: var(--salvia); font-weight: 600;
  }

  /* KPI hero dramático — usar en una sola sección */
  .kpi-hero {
    margin: 32px 0 48px; padding: 48px 0 40px;
    border-top: 2px solid var(--negro); border-bottom: 1px solid var(--gris-200);
    display: grid; grid-template-columns: auto 1fr; gap: 48px; align-items: end;
  }
  .kpi-hero .big {
    font-family: 'Figtree', sans-serif; font-weight: 700;
    font-size: 96px; line-height: 0.95; letter-spacing: -0.03em;
    color: var(--negro); font-variant-numeric: tabular-nums;
  }
  .kpi-hero .big .currency {
    font-size: 48px; font-weight: 400; color: var(--gris-400);
    vertical-align: top; margin-right: 6px;
  }
  .kpi-hero .context { padding-bottom: 12px; }
  .kpi-hero .context .kicker {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--salvia); font-weight: 600; margin-bottom: 12px;
  }
  .kpi-hero .context .desc {
    font-size: 17px; color: var(--negro-soft); line-height: 1.5;
    max-width: 36ch;
  }

  /* Pull quote — tesis destacadas */
  .pull-quote {
    margin: 36px 0; padding: 24px 32px 24px 36px;
    border-left: 4px solid var(--salvia);
    font-family: 'Figtree', sans-serif; font-weight: 500;
    font-size: 22px; line-height: 1.35; color: var(--negro);
    letter-spacing: -0.01em; max-width: 32ch;
  }
  .pull-quote .attrib {
    display: block; margin-top: 12px; font-size: 12px;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--gris-400); font-weight: 600;
  }

  @media (max-width: 720px) {
    .page { padding: 32px 24px; }
    .cover h1 { font-size: 36px; }
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .two-col { grid-template-columns: 1fr; gap: 16px; }
    h2 { font-size: 26px; }
    table { font-size: 13px; }
    th, td { padding: 7px 8px; }
    .mini-toc { display: none; }
    .kpi-hero { grid-template-columns: 1fr; gap: 20px; padding: 32px 0; }
    .kpi-hero .big { font-size: 64px; }
    .kpi-hero .big .currency { font-size: 32px; }
    .pull-quote { font-size: 18px; padding: 18px 22px; }
    .zona-tiles { grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .zona-tile .zt-inv { font-size: 26px; }
    .dotplot-row { grid-template-columns: 110px 1fr 90px; gap: 8px; }
    .dotplot-row .dp-label { font-size: 11px; }
    .dotplot-axis { grid-template-columns: 110px 1fr 90px; gap: 8px; }
    .cta-producto { padding: 28px 24px; }
    .cta-producto h3 { font-size: 22px; }
    .proy-row { grid-template-columns: 1fr 40px; gap: 8px; }
    .proy-bar-wrap { grid-column: 1 / -1; order: 3; height: 8px; }
    .fuente-donut-wrap { flex-direction: column; gap: 16px; padding: 16px; }
    .matriz-oferta { font-size: 11px; }
    .matriz-oferta th, .matriz-oferta td { padding: 5px 4px; }
  }

  @media (min-width: 721px) and (max-width: 1200px) {
    /* ToC lateral se esconde en tablets donde el doc está centrado */
    .mini-toc { display: none; }
  }

  /* Print — PDF export limpio */
  @media print {
    body { background: white; color: black; font-size: 11pt; }
    .page { max-width: none; padding: 0; margin: 0; }
    .read-progress, .mini-toc { display: none !important; }
    section { page-break-inside: avoid; padding: 24px 0 8px; }
    h2 { font-size: 22pt; }
    h3 { font-size: 13pt; }
    table { font-size: 10pt; }
    .chart-wrap { page-break-inside: avoid; background: white; border-top: 1px solid #888; }
    .caveat, .note { background: #f5f5f5 !important; border-left-color: #888 !important; }
    .kpi-hero .big { font-size: 56pt; color: black; }
    .pull-quote { border-left-color: #888; font-size: 14pt; }
    a { color: black; text-decoration: none; }
    .toc a::after { content: ""; }
  }
`
