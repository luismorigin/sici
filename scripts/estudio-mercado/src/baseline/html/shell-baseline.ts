import type { BaselineResult } from '../types-baseline.js'
import type { NarrativaRenderer } from '../narrativa/loader.js'
import { BASELINE_STYLES } from './styles.js'

import { renderCover } from './sections/cover.js'
import { renderTresLecturas } from './sections/tres-lecturas.js'
import { renderMetodologia } from './sections/metodologia.js'
import { renderVistazo } from './sections/vistazo.js'
import { renderSubmercados } from './sections/submercados.js'
import { renderOferta } from './sections/oferta.js'
import { renderPrecios } from './sections/precios.js'
import { renderConcentracion } from './sections/concentracion.js'
import { renderAlquiler } from './sections/alquiler.js'
import { renderLimites } from './sections/limites.js'
import { renderCtaProducto } from './sections/cta-producto.js'
import { renderFicha } from './sections/ficha.js'

const PUBLIC_BASE_URL = 'https://simonbo.com'

function renderMetaAndSchema(data: BaselineResult, title: string): string {
  const description = `Radiografía del mercado portal-observable de departamentos en los ${data.panorama.totalZonas} submercados de ${data.config.zonaLabel} al ${data.config.fechaCorte}. ${data.panorama.totalVenta} unidades en venta y ${data.panorama.totalAlquiler} en alquiler analizadas. Publicación trimestral de Simón — Inteligencia Inmobiliaria.`
  const canonicalUrl = `${PUBLIC_BASE_URL}/reports/${data.config.outputFilename}`
  // SVG incluido en repo; para máxima compatibilidad con parsers antiguos
  // (WhatsApp, Facebook), exportar a PNG 1200x630 desde el SVG y referenciar .png
  const ogImage = `${PUBLIC_BASE_URL}/og/${data.config.outputFilename.replace('.html', '.svg')}`

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    image: ogImage,
    datePublished: data.config.fechaCorteISO,
    author: {
      '@type': 'Organization',
      name: 'Simón — Inteligencia Inmobiliaria',
      url: PUBLIC_BASE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Simón — Inteligencia Inmobiliaria',
      url: PUBLIC_BASE_URL,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
  }

  return `
<meta name="description" content="${description}">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:image" content="${ogImage}">
<meta property="og:locale" content="es_BO">
<meta property="article:published_time" content="${data.config.fechaCorteISO}">
<meta property="article:section" content="Mercado inmobiliario">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImage}">
<link rel="canonical" href="${canonicalUrl}">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
`
}

function renderInteractivityScript(): string {
  return `
<script>
(function () {
  // Progress bar de lectura
  const bar = document.querySelector('.read-progress .bar');
  const updateBar = () => {
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docH > 0 ? (window.scrollY / docH) * 100 : 0;
    if (bar) bar.style.width = pct + '%';
  };
  window.addEventListener('scroll', updateBar, { passive: true });
  updateBar();

  // Mini-ToC active state con IntersectionObserver
  const sections = document.querySelectorAll('section[id^="s"]');
  const tocLinks = document.querySelectorAll('.mini-toc li');
  const tocMap = new Map();
  tocLinks.forEach(li => {
    const a = li.querySelector('a');
    if (a) tocMap.set(a.getAttribute('href').slice(1), li);
  });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        tocLinks.forEach(l => l.classList.remove('active'));
        const li = tocMap.get(e.target.id);
        if (li) li.classList.add('active');
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });

  sections.forEach(s => obs.observe(s));
})();
</script>
`
}

export function assembleBaselineHTML(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const title = `${data.config.zonaLabel} — Baseline de Inventario y Precios | ${data.config.edicion.replace('01 · ', '')}`

  const toc = `
<div class="toc">
  <h4>Contenidos</h4>
  <ol>
    <li><a href="#s1">01 · Resumen ejecutivo y tesis del mercado</a><span>pág. 1</span></li>
    <li><a href="#s2">02 · Metodología y universo observable</a><span>pág. 2</span></li>
    <li><a href="#s3">03 · ${data.config.zonaLabel} de un vistazo</a><span>pág. 3</span></li>
    <li><a href="#s4">04 · Los submercados</a><span>pág. 4</span></li>
    <li><a href="#s5">05 · Distribución de oferta por tipología</a><span>pág. 6</span></li>
    <li><a href="#s6">06 · Precios publicados</a><span>pág. 8</span></li>
    <li><a href="#s7">07 · Concentración por desarrolladora</a><span>pág. 10</span></li>
    <li><a href="#s8">08 · Mercado de alquiler</a><span>pág. 11</span></li>
    <li><a href="#s9">09 · Lo que este reporte no afirma + Agenda próximas ediciones</a><span>pág. 12</span></li>
    <li><a href="#s10">10 · Ficha editorial</a><span>pág. 13</span></li>
  </ol>
</div>
`

  const miniToc = `
<nav class="mini-toc" aria-label="Navegación del reporte">
  <div class="title">Secciones</div>
  <ol>
    <li><a href="#s1">01 · Resumen</a></li>
    <li><a href="#s2">02 · Metodología</a></li>
    <li><a href="#s3">03 · Vistazo</a></li>
    <li><a href="#s4">04 · Submercados</a></li>
    <li><a href="#s5">05 · Oferta</a></li>
    <li><a href="#s6">06 · Precios</a></li>
    <li><a href="#s7">07 · Concentración</a></li>
    <li><a href="#s8">08 · Alquiler</a></li>
    <li><a href="#s9">09 · Límites · Agenda</a></li>
    <li><a href="#s10">10 · Ficha</a></li>
  </ol>
</nav>
`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${renderMetaAndSchema(data, title)}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>${BASELINE_STYLES}</style>
</head>
<body>

<div class="read-progress" aria-hidden="true"><div class="bar"></div></div>

${miniToc}

<div class="page">

${renderCover(data, narrativa)}

${toc}

${renderTresLecturas(data, narrativa)}

${renderMetodologia(data, narrativa)}

${renderVistazo(data, narrativa)}

${renderSubmercados(data, narrativa)}

${renderOferta(data, narrativa)}

${renderPrecios(data, narrativa)}

${renderConcentracion(data, narrativa)}

${renderAlquiler(data, narrativa)}

${renderLimites(data, narrativa)}

${renderCtaProducto(data, narrativa)}

${renderFicha(data, narrativa)}

</div>

${renderInteractivityScript()}

</body>
</html>
`
}
