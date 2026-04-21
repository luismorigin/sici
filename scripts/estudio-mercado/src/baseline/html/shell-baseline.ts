import type { BaselineResult } from '../types-baseline.js'
import type { NarrativaRenderer } from '../narrativa/loader.js'
import { BASELINE_STYLES } from './styles.js'
import { renderChartsScript } from './charts.js'

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
import { renderFicha } from './sections/ficha.js'

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

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>${BASELINE_STYLES}</style>
</head>
<body>

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

${renderFicha(data, narrativa)}

</div>

${renderChartsScript(data)}

</body>
</html>
`
}
