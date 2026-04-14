import type { EstudioCompleto } from '../types.js'
import { getCSS } from './design-system.js'
import {
  renderHero, renderMetodologia, renderPanorama, renderZoomZona,
  renderDemanda, renderPosicion, renderDiferenciador, renderCompetidores, renderVisibilidad,
  renderRotacion, renderYield, renderSimulacion, renderRecomendaciones,
} from './sections.js'

interface NavItem {
  id: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'metodologia', label: 'Metodologia' },
  { id: 'panorama', label: 'Panorama' },
  { id: 'zoom', label: 'Zona' },
  { id: 'demanda', label: 'Oferta' },
  { id: 'posicion', label: 'Posicion' },
  { id: 'diferenciador', label: 'Producto' },
  { id: 'competidores', label: 'Competencia' },
  { id: 'visibilidad', label: 'Visibilidad' },
  { id: 'rotacion', label: 'Rotacion' },
  { id: 'yield', label: 'Yield' },
  { id: 'simulacion', label: 'Simulacion' },
  { id: 'recomendaciones', label: 'Acciones' },
]

function renderNav(projectName: string): string {
  return `
<nav class="nav" id="mainNav">
  <div class="nav-inner">
    <div class="nav-brand">${projectName}</div>
    ${NAV_ITEMS.map(n => `<a href="#${n.id}" class="nav-link">${n.label}</a>`).join('')}
  </div>
</nav>`
}

function renderFooter(e: EstudioCompleto): string {
  // Simon brand tokens (from simon-design-tokens.ts)
  const S_ARENA = '#EDE8DC'
  const S_NEGRO = '#141414'
  const S_SALVIA = '#3A6A48'
  const S_PIEDRA = '#7A7060'

  return `
<footer style="background:${S_NEGRO};color:${S_PIEDRA};padding:80px 32px" id="footer">
  <div style="max-width:1100px;margin:0 auto">
    <div style="text-align:center">
      <!-- Simon Norte symbol -->
      <svg width="48" height="48" viewBox="0 0 64 64" style="margin-bottom:20px">
        <circle cx="32" cy="34" r="28" fill="${S_ARENA}"/>
        <circle cx="32" cy="15" r="6" fill="${S_SALVIA}"/>
        <circle cx="32" cy="15" r="3" fill="${S_NEGRO}"/>
      </svg>
      <div style="font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;color:${S_ARENA};letter-spacing:0.3px;margin-bottom:4px">
        Simon
      </div>
      <div style="font-family:'DM Sans',sans-serif;font-size:12px;color:${S_PIEDRA};letter-spacing:0.5px;margin-bottom:24px">
        Inteligencia Inmobiliaria
      </div>
      <div style="width:40px;height:1px;background:${S_SALVIA};margin:0 auto 24px;opacity:0.5"></div>
      <p style="font-size:13px;color:${S_PIEDRA};line-height:1.8;max-width:500px;margin:0 auto">
        Estudio generado el ${new Date().toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })}
        con datos de Century21, Remax y Bien Inmuebles.<br>
        TC paralelo Binance P2P: Bs ${e.tc.paralelo.toFixed(2)} &middot; TC oficial: Bs ${e.tc.oficial.toFixed(2)}
      </p>
      <p style="font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:${S_SALVIA};margin-top:20px;letter-spacing:0.3px">
        simonbo.com
      </p>
    </div>
  </div>
</footer>`
}

function getCommonJS(): string {
  return `
<script>
// Reveal on scroll
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// Nav show/hide
let lastScroll = 0;
const nav = document.getElementById('mainNav');
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (y > 400) {
    nav.classList.toggle('visible', y < lastScroll || y < 500);
  } else {
    nav.classList.remove('visible');
  }
  lastScroll = y;
}, { passive: true });

// Nav active state
const sections = document.querySelectorAll('.section, .hero');
const navLinks = document.querySelectorAll('.nav-link');
const navObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('active'));
      const link = document.querySelector('.nav-link[href="#' + e.target.id + '"]');
      if (link) link.classList.add('active');
    }
  });
}, { threshold: 0.3 });
sections.forEach(s => navObserver.observe(s));
</script>`
}

export function assembleHTML(estudio: EstudioCompleto): string {
  const config = estudio.config
  const css = getCSS(config.colors)

  const sections = [
    renderHero(config),
    renderMetodologia(estudio),
    renderPanorama(estudio),
    renderZoomZona(estudio),
    renderDemanda(estudio),
    renderPosicion(estudio),
    renderDiferenciador(estudio),
    renderCompetidores(estudio),
    renderVisibilidad(estudio),
    renderRotacion(estudio),
    renderYield(estudio),
    renderSimulacion(estudio),
    renderRecomendaciones(estudio),
  ].filter(Boolean)

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Estudio de Mercado — ${config.projectName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet"/>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></` + `script>
<style>${css}</style>
</head>
<body>
${renderNav(config.projectName)}
${sections.join('\n')}
${renderFooter(estudio)}
${getCommonJS()}
</body>
</html>`
}
