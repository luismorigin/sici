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

  @media (max-width: 720px) {
    .page { padding: 32px 24px; }
    .cover h1 { font-size: 36px; }
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .two-col { grid-template-columns: 1fr; gap: 16px; }
    h2 { font-size: 26px; }
    table { font-size: 13px; }
    th, td { padding: 7px 8px; }
  }
`
