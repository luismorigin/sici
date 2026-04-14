import type { DesignTokens } from '../types.js'

// Simon brand tokens (source: simon-design-tokens.ts)
const DEFAULT_TOKENS: DesignTokens = {
  marfil: '#EDE8DC',      // s-arena
  ebano: '#141414',       // s-negro
  caramelo: '#3A6A48',    // s-salvia
  carameloDark: '#3A6A48',// s-salvia (single accent)
  arena: '#D8D0BC',       // s-arenaMid
  piedra: '#3A3530',      // s-tinta
}

export function getCSS(overrides?: Partial<DesignTokens>): string {
  const t = { ...DEFAULT_TOKENS, ...overrides }
  return `
:root {
  --marfil: ${t.marfil};
  --white: #FAFAF8;
  --ebano: ${t.ebano};
  --carbon: ${t.ebano};
  --piedra: ${t.piedra};
  --piedra-light: #7A7060;
  --caramelo: ${t.caramelo};
  --caramelo-dark: ${t.carameloDark};
  --arena: ${t.arena};
  --arena-text: #7A7060;
  --caramelo-10: rgba(58,106,72,0.10);
  --caramelo-15: rgba(58,106,72,0.15);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'DM Sans', sans-serif;
  color: var(--carbon);
  background: var(--marfil);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* NAV */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  background: rgba(20,20,20,0.97);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  transform: translateY(-100%);
  transition: transform 0.4s cubic-bezier(0.16,1,0.3,1);
  border-bottom: 1px solid rgba(58,106,72,0.2);
}
.nav.visible { transform: translateY(0); }
.nav-inner {
  max-width: 1200px; margin: 0 auto; padding: 0 32px;
  display: flex; align-items: center; height: 52px;
  overflow-x: auto; scrollbar-width: none;
}
.nav-inner::-webkit-scrollbar { display: none; }
.nav-brand {
  font-family: 'Figtree', sans-serif; font-size: 15px;
  color: var(--marfil); white-space: nowrap; margin-right: 32px; flex-shrink: 0;
}
.nav-link {
  font-size: 12px; font-weight: 500; color: var(--arena);
  text-decoration: none; letter-spacing: 0.5px; text-transform: uppercase;
  padding: 16px 14px; white-space: nowrap; transition: color 0.3s;
  flex-shrink: 0; position: relative;
}
.nav-link:hover, .nav-link.active { color: var(--caramelo); }
.nav-link.active::after {
  content: ''; position: absolute; bottom: 0; left: 14px; right: 14px;
  height: 2px; background: var(--caramelo);
}

/* SECTIONS */
.section {
  min-height: 100vh; padding: 100px 32px;
  display: flex; flex-direction: column; justify-content: center;
}
.section-inner { max-width: 1100px; margin: 0 auto; width: 100%; }
.bg-marfil { background: var(--marfil); }
.bg-white { background: var(--white); }
.bg-ebano { background: var(--ebano); color: var(--marfil); }

/* TYPOGRAPHY */
.badge {
  display: inline-block; font-size: 11px; font-weight: 600;
  letter-spacing: 3px; text-transform: uppercase; color: var(--caramelo-dark);
  border: 1px solid var(--caramelo); padding: 6px 18px; margin-bottom: 28px;
}
.bg-ebano .badge { border-color: rgba(58,106,72,0.5); }
.section-title {
  font-family: 'Figtree', sans-serif; font-size: 36px; font-weight: 500;
  color: var(--carbon); margin-bottom: 10px; letter-spacing: -0.3px; line-height: 1.2;
}
.bg-ebano .section-title { color: var(--marfil); }
.section-subtitle {
  font-size: 17px; color: var(--piedra); margin-bottom: 48px; line-height: 1.5;
}
.bg-ebano .section-subtitle { color: var(--piedra-light); }
.bg-ebano table.data { color: var(--marfil); }
.bg-ebano table.data thead tr { background: rgba(255,255,255,0.08); }
.bg-ebano table.data td { border-bottom-color: rgba(255,255,255,0.08); }
.bg-ebano table.data .strong { color: var(--marfil); }
.bg-ebano table.data .muted { color: var(--piedra-light); }
.bg-ebano table.data tbody tr:hover { background: rgba(58,106,72,0.12); }
.bg-ebano table.data tr.highlight { background: rgba(58,106,72,0.12); }
.bg-ebano table.data tr.highlight td { color: var(--caramelo); }
.bg-ebano .cat-badge { color: var(--marfil); }
.bg-ebano .cat-promedio { background: rgba(58,106,72,0.2); color: var(--caramelo); }
.bg-ebano .cat-oportunidad { background: rgba(58,106,72,0.3); color: #8FBF9A; }
.bg-ebano .cat-bajo_promedio { background: rgba(58,106,72,0.2); color: #8FBF9A; }
.bg-ebano .cat-sobre_promedio { background: rgba(255,255,255,0.08); color: var(--piedra-light); }
.bg-ebano .cat-premium { background: rgba(255,255,255,0.12); color: var(--marfil); }
.bg-ebano .takeaway { color: var(--piedra-light); border-top-color: rgba(255,255,255,0.08); }
.bg-ebano .yield-card { border-color: rgba(255,255,255,0.1); }
.bg-ebano .yield-card.attractive { border-color: var(--caramelo); }
.bg-ebano .yield-tipo { color: var(--marfil); }
.bg-ebano .yield-value.high { color: var(--caramelo); }
.bg-ebano .yield-value.low { color: var(--piedra-light); }
.bg-ebano .yield-rent { color: var(--piedra-light); }
.bg-ebano .yield-detail { color: var(--piedra-light); border-top-color: rgba(255,255,255,0.08); }

/* REVEAL */
.reveal {
  opacity: 0; transform: translateY(30px);
  transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1);
}
.reveal.visible { opacity: 1; transform: translateY(0); }
.reveal-delay-1 { transition-delay: 0.1s; }
.reveal-delay-2 { transition-delay: 0.2s; }
.reveal-delay-3 { transition-delay: 0.3s; }
.reveal-delay-4 { transition-delay: 0.4s; }

/* SIMON SYMBOL ANIMATION */
@keyframes symbolCircle {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes symbolNorte {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.4); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes symbolFadeUp {
  0% { opacity: 0; transform: translateY(16px); }
  100% { opacity: 1; transform: translateY(0); }
}
.simon-symbol .sym-circle { transform: scale(0); animation: symbolCircle 500ms cubic-bezier(0.34,1.56,0.64,1) 300ms forwards; }
.simon-symbol .sym-norte-outer { transform: scale(0); transform-origin: 32px 15px; animation: symbolNorte 350ms cubic-bezier(0.34,1.56,0.64,1) 700ms forwards; }
.simon-symbol .sym-norte-inner { transform: scale(0); transform-origin: 32px 15px; animation: symbolNorte 350ms cubic-bezier(0.34,1.56,0.64,1) 700ms forwards; }
.hero-panel .hero-badge { opacity: 0; animation: symbolFadeUp 450ms ease-out 1050ms forwards; }
.hero-panel h1 { opacity: 0; animation: symbolFadeUp 450ms ease-out 1200ms forwards; }
.hero-panel .hero-sub { opacity: 0; animation: symbolFadeUp 450ms ease-out 1350ms forwards; }
.hero-panel .hero-line { opacity: 0; animation: symbolFadeUp 300ms ease-out 1500ms forwards; }
.hero-panel .hero-meta { opacity: 0; animation: symbolFadeUp 450ms ease-out 1600ms forwards; }

/* HERO */
.hero {
  min-height: 100vh; display: flex; flex-direction: column;
  justify-content: center; align-items: center; text-align: center;
  padding: 60px 32px; position: relative;
  background: var(--ebano);
  background-size: cover; background-position: center;
}
.hero.has-bg::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(20,20,20,0.55); pointer-events: none;
}
.hero-panel {
  position: relative; z-index: 1;
  background: rgba(250,247,242,0.92); backdrop-filter: blur(14px);
  padding: 64px 72px; max-width: 640px; width: 100%;
}
.hero-badge {
  font-size: 12px; font-weight: 500; letter-spacing: 4px; text-transform: uppercase;
  color: var(--caramelo-dark); border: 1px solid var(--caramelo);
  padding: 8px 24px; margin-bottom: 40px; display: inline-block;
}
.hero h1 {
  font-family: 'Figtree', sans-serif; font-size: clamp(36px, 5vw, 52px);
  font-weight: 500; color: var(--carbon); letter-spacing: -0.5px; margin-bottom: 8px;
}
.hero-sub {
  font-family: 'Figtree', sans-serif; font-size: clamp(18px, 2.5vw, 24px);
  font-weight: 400; color: var(--caramelo-dark); margin-bottom: 48px;
}
.hero-line { width: 60px; height: 1px; background: var(--caramelo); margin: 0 auto 40px; }
.hero-meta { font-size: 14px; color: var(--piedra); line-height: 2.2; }
.hero-meta strong { color: var(--carbon); font-weight: 500; }

/* KPIs */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 32px 24px; }
.kpi { text-align: center; }
.kpi-value {
  font-family: 'Figtree', sans-serif; font-size: 54px; font-weight: 500;
  color: var(--carbon); line-height: 1.1; margin-bottom: 8px;
}
.kpi-value.accent { color: var(--caramelo-dark); }
.kpi-label { font-size: 14px; color: var(--piedra); letter-spacing: 0.5px; }

/* CHARTS */
.chart-container { position: relative; width: 100%; margin: 24px 0; }
.chart-container canvas { max-height: 400px; }
.chart-note { font-size: 14px; color: var(--piedra); font-style: italic; margin-top: 16px; }

/* TABLES */
.table-wrap { overflow-x: auto; margin: 16px 0; }
table.data { width: 100%; border-collapse: collapse; font-size: 14px; }
table.data thead tr { background: var(--carbon); color: var(--marfil); }
table.data th {
  font-weight: 600; text-align: left; padding: 12px 14px;
  font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap;
}
table.data td { padding: 10px 14px; border-bottom: 1px solid var(--arena); vertical-align: middle; }
table.data tbody tr:hover { background: var(--caramelo-10); }
table.data tr.highlight { background: var(--caramelo-10); }
table.data tr.highlight td { font-weight: 600; color: var(--caramelo-dark); }
table.data .muted { color: var(--arena-text); }
table.data .strong { color: var(--carbon); font-weight: 600; }

/* YIELD CARDS */
.yield-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }
.yield-card {
  border: 1px solid var(--arena); padding: 24px;
  transition: border-color 0.3s;
}
.yield-card.attractive { border-color: var(--caramelo); }
.yield-value {
  font-family: 'Figtree', sans-serif; font-size: 40px; font-weight: 500; margin-bottom: 6px;
}
.yield-value.high { color: var(--caramelo-dark); }
.yield-value.low { color: var(--piedra); }
.yield-tipo { font-size: 15px; font-weight: 600; color: var(--carbon); margin-bottom: 6px; }
.yield-rent { font-size: 14px; color: var(--piedra); }
.yield-detail { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--arena); font-size: 14px; color: var(--piedra); line-height: 1.8; }

/* COMPARE GRID */
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid var(--arena); }
.compare-col { padding: 32px; }
.compare-col:first-child { border-right: 1px solid var(--arena); }
.compare-header { font-family: 'Figtree', sans-serif; font-size: 24px; font-weight: 500; margin-bottom: 24px; }
.compare-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--arena); font-size: 15px; }
.compare-row:last-child { border-bottom: none; }
.compare-key { color: var(--piedra); }
.compare-val { font-weight: 600; }
.compare-val.wins { color: var(--carbon); }
.compare-val.loses { color: var(--arena-text); }

/* GAP INDICATOR */
.gap-indicator {
  display: flex; align-items: center; gap: 24px; margin: 32px 0;
  padding: 32px; border: 2px solid var(--caramelo); background: var(--caramelo-10);
}
.gap-number {
  font-family: 'Figtree', sans-serif; font-size: 64px; font-weight: 500;
  color: var(--caramelo-dark); line-height: 1;
}
.gap-text { font-size: 17px; color: var(--carbon); line-height: 1.5; }
.gap-text strong { color: var(--caramelo-dark); }

/* TIMELINE */
.timeline { position: relative; padding-left: 40px; }
.timeline::before {
  content: ''; position: absolute; left: 12px; top: 0; bottom: 0;
  width: 1px; background: var(--arena);
}
.tl-block { margin-bottom: 48px; position: relative; }
.tl-dot {
  position: absolute; left: -34px; top: 4px;
  width: 12px; height: 12px; border: 2px solid var(--caramelo); background: var(--marfil);
}
.tl-block.urgente .tl-dot { background: var(--caramelo); }
.tl-period { font-size: 13px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px; }
.tl-period.urgente { color: var(--caramelo-dark); }
.tl-period.corto { color: var(--carbon); }
.tl-period.mediano { color: var(--piedra); }
.tl-card {
  border: 1px solid var(--arena); padding: 16px 20px; margin-bottom: 12px;
  background: var(--white);
}
.tl-card-title { font-size: 16px; font-weight: 600; color: var(--carbon); }

/* TC SLIDER */
.tc-slider-wrap { margin: 32px 0 48px; text-align: center; }
.tc-slider-label { font-size: 14px; color: var(--piedra); margin-bottom: 12px; }
.tc-slider-value {
  font-family: 'Figtree', sans-serif; font-size: 48px; font-weight: 500;
  color: var(--carbon); margin-bottom: 16px;
}
.tc-slider {
  -webkit-appearance: none; appearance: none; width: 100%; max-width: 600px;
  height: 4px; background: var(--arena); outline: none; border-radius: 2px;
}
.tc-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 24px; height: 24px;
  background: var(--caramelo); cursor: pointer; border: 3px solid var(--white);
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
}
.tc-slider::-moz-range-thumb {
  width: 24px; height: 24px; background: var(--caramelo); cursor: pointer;
  border: 3px solid var(--white); box-shadow: 0 1px 4px rgba(0,0,0,0.15); border-radius: 0;
}
.tc-impact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin: 32px 0; }
.tc-impact-card { text-align: center; padding: 24px 16px; border: 1px solid var(--arena); background: var(--white); }
.tc-impact-value { font-family: 'Figtree', sans-serif; font-size: 36px; font-weight: 500; color: var(--carbon); margin-bottom: 4px; }
.tc-impact-label { font-size: 13px; color: var(--piedra); letter-spacing: 0.5px; }

/* SIGNAL BADGES */
.signal { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; padding: 3px 10px; text-transform: uppercase; }
.signal-nuevo { background: rgba(58,106,72,0.12); color: #3A6A48; }
.signal-activo { background: var(--caramelo-10); color: var(--caramelo-dark); }
.signal-prolongado { background: rgba(58,53,48,0.1); color: var(--piedra); }
.signal-estancado { background: rgba(58,53,48,0.18); color: var(--piedra); }

/* SCARCITY LEVELS */
.scarcity { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 1px; padding: 4px 12px; text-transform: uppercase; }
.scarcity-critica { background: var(--caramelo); color: var(--white); }
.scarcity-alta { background: var(--caramelo-dark); color: var(--white); }
.scarcity-media { background: var(--arena); color: var(--carbon); }
.scarcity-baja { background: var(--arena); color: var(--arena-text); }

/* CATEGORY BADGES */
.cat-badge { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; padding: 4px 14px; }
.cat-oportunidad { background: rgba(58,106,72,0.12); color: #3A6A48; }
.cat-bajo_promedio { background: rgba(58,106,72,0.08); color: #3A6A48; }
.cat-promedio { background: var(--caramelo-10); color: var(--caramelo-dark); }
.cat-sobre_promedio { background: rgba(140,132,122,0.15); color: var(--piedra); }
.cat-premium { background: var(--carbon); color: var(--marfil); }

/* FILTER PILLS */
.rot-pill {
  font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
  color: var(--piedra); background: var(--white); border: 1px solid var(--arena);
  padding: 8px 20px; cursor: pointer; border-radius: 100px;
  transition: all 0.25s ease-out; display: inline-flex; align-items: center; gap: 8px;
}
.rot-pill:hover { border-color: var(--caramelo); color: var(--carbon); }
.rot-pill.active {
  background: var(--caramelo); color: var(--white); border-color: var(--caramelo);
}
.rot-pill-count {
  font-size: 12px; font-weight: 600; background: rgba(0,0,0,0.08);
  padding: 2px 8px; border-radius: 100px; min-width: 24px; text-align: center;
}
.rot-pill.active .rot-pill-count { background: rgba(255,255,255,0.2); }

/* FOOTER */
.footer { background: var(--carbon); color: var(--piedra-light); padding: 80px 32px; }
.footer-inner { max-width: 1100px; margin: 0 auto; }
.footer-brand {
  text-align: center; margin-top: 40px; padding-top: 40px;
  border-top: 1px solid rgba(58,106,72,0.25);
}
.footer-brand span { font-size: 11px; letter-spacing: 4px; text-transform: uppercase; color: var(--piedra-light); }

/* TAKEAWAY */
.takeaway {
  font-size: 16px; font-style: italic; color: var(--piedra);
  margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--arena); line-height: 1.6;
}

/* RESPONSIVE */
@media (max-width: 768px) {
  .section { padding: 60px 20px; }
  .hero-panel { padding: 40px 28px; max-width: 92%; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 24px; }
  .kpi-value { font-size: 40px; }
  .compare-grid { grid-template-columns: 1fr; }
  .compare-col:first-child { border-right: none; border-bottom: 1px solid var(--arena); }
  .yield-grid { grid-template-columns: 1fr; }
  .section-title { font-size: 28px; }
  .nav-link { padding: 16px 10px; font-size: 11px; }
  .tc-impact-grid { grid-template-columns: 1fr; }
  .gap-indicator { flex-direction: column; text-align: center; }
  .gap-number { font-size: 48px; }
}
`
}
