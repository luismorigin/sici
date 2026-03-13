/**
 * Genera PowerPoint ejecutivo — Estudio de Mercado Condado VI v2
 * 20 slides con branding Condado VI (marfil/blanco/caramelo, ebano solo bookends)
 *
 * Usage: node scripts/generate-condado-pptx-v2.mjs
 */

import PptxGenJS from 'pptxgenjs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(__dirname, '../docs/reports/ESTUDIO_MERCADO_CONDADO_2026_03_v2.pptx')

// ── Design tokens (from condado-vi.tsx landing) ─────────────────────────────
const C = {
  marfil: 'FAF7F2',
  white: 'FFFFFF',
  ebano: '1A1714',
  carbon: '2C2824',
  piedra: '7A7168',
  caramelo: 'B8906F',
  carameloDark: '9A7558',
  arena: 'E8E2DA',
}

const FONT_DISPLAY = 'Playfair Display'
const FONT_BODY = 'DM Sans'

const CHECK = '●'
const EMPTY = '○'

// ── Helpers ─────────────────────────────────────────────────────────────────

function addAccentLine(slide, color = C.caramelo) {
  slide.addShape('rect', { x: 0, y: 0, w: 10, h: 0.04, fill: { color } })
}

function addFooter(slide, isEbano = false) {
  const color = isEbano ? C.piedra : C.piedra
  slide.addText('Condado VI Plaza Italia — Estudio de Mercado · Marzo 2026', {
    x: 0.4, y: 7.0, w: 7, h: 0.3,
    fontSize: 7, fontFace: FONT_BODY, color, align: 'left',
  })
}

function addBadge(slide, text, isEbano = false) {
  slide.addText(text, {
    x: 0.5, y: 0.2, w: text.length * 0.11 + 0.6, h: 0.3,
    fontSize: 8, fontFace: FONT_BODY, color: C.caramelo,
    align: 'center', letterSpacing: 3,
    border: { type: 'solid', color: C.caramelo, pt: 0.75 },
  })
}

function addSlideTitle(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.5, y: 0.65, w: 9, h: 0.6,
    fontSize: 26, fontFace: FONT_DISPLAY, color: C.carbon, bold: false,
  })
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 1.15, w: 9, h: 0.35,
      fontSize: 13, fontFace: FONT_BODY, color: C.piedra, italic: true,
    })
  }
}

function addKPIRow(slide, kpis, y = 1.6, numColor = C.carbon) {
  const w = 9 / kpis.length
  kpis.forEach((kpi, i) => {
    slide.addText([
      { text: kpi.value + '\n', options: { fontSize: 28, fontFace: FONT_DISPLAY, color: kpi.color || numColor, bold: true } },
      { text: kpi.label, options: { fontSize: 10, fontFace: FONT_BODY, color: C.piedra } },
    ], {
      x: 0.5 + i * w, y, w: w - 0.1, h: 0.9,
      align: 'center', valign: 'middle',
      fill: { color: C.white }, rectRadius: 0.08,
      shadow: { type: 'outer', blur: 3, offset: 1, color: C.arena, opacity: 0.4 },
    })
  })
}

function makeTableOpts(x, y, w, colW, rowH = 0.35) {
  return {
    x, y, w,
    fontSize: 10, fontFace: FONT_BODY, color: C.carbon,
    border: { type: 'solid', color: C.arena, pt: 0.5 },
    colW,
    rowH,
    autoPage: false,
    headerRow: true,
    headerRowColor: C.marfil,
    headerRowFill: C.ebano,
  }
}

// ── Build presentation ──────────────────────────────────────────────────────

const pptx = new PptxGenJS()
pptx.defineLayout({ name: 'CVI', width: 10, height: 7.5 })
pptx.layout = 'CVI'

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — Portada (Ebano)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.ebano }
  addAccentLine(s)

  s.addText('ESTUDIO DE MERCADO', {
    x: 3, y: 2.0, w: 4, h: 0.4,
    fontSize: 9, fontFace: FONT_BODY, color: C.caramelo,
    align: 'center', letterSpacing: 4,
    border: { type: 'solid', color: C.caramelo, pt: 0.75 },
  })

  s.addText('Condado VI', {
    x: 1, y: 2.7, w: 8, h: 0.9,
    fontSize: 42, fontFace: FONT_DISPLAY, color: C.marfil, align: 'center',
  })
  s.addText('Plaza Italia', {
    x: 1, y: 3.5, w: 8, h: 0.6,
    fontSize: 22, fontFace: FONT_DISPLAY, color: C.caramelo, align: 'center',
  })

  s.addShape('rect', { x: 4.5, y: 4.3, w: 1, h: 0.015, fill: { color: C.caramelo } })

  s.addText([
    { text: 'Cliente: ', options: { bold: true, color: C.marfil } },
    { text: 'Proinco / Constructora Condado\n', options: { color: C.piedra } },
    { text: 'Fecha: ', options: { bold: true, color: C.marfil } },
    { text: '12 de marzo de 2026\n', options: { color: C.piedra } },
    { text: 'Fuente: ', options: { bold: true, color: C.marfil } },
    { text: 'SICI — 311 unidades verificadas con GPS\n', options: { color: C.piedra } },
    { text: 'TC Paralelo: ', options: { bold: true, color: C.marfil } },
    { text: 'Bs 9.454/USD (Binance P2P)', options: { color: C.piedra } },
  ], {
    x: 2.5, y: 4.6, w: 5, h: 1.4,
    fontSize: 10, fontFace: FONT_BODY, lineSpacingMultiple: 1.8, align: 'center',
  })

  s.addShape('rect', { x: 4.5, y: 6.2, w: 1, h: 0.015, fill: { color: C.caramelo } })

  s.addText('SICI — Sistema Inteligente de Captura Inmobiliaria', {
    x: 2, y: 6.8, w: 6, h: 0.3,
    fontSize: 8, fontFace: FONT_BODY, color: C.piedra, align: 'center', letterSpacing: 2,
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — Panorama Equipetrol (Marfil)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }
  addAccentLine(s)
  addBadge(s, 'PANORAMA EQUIPETROL')
  addFooter(s)

  addKPIRow(s, [
    { value: '311', label: 'Unidades activas' },
    { value: '$2,033', label: 'Mediana $/m²' },
    { value: '$162K', label: 'Ticket promedio' },
  ], 1.2)

  // Accent KPI
  s.addText([
    { text: '5\n', options: { fontSize: 48, fontFace: FONT_DISPLAY, color: C.caramelo, bold: true } },
    { text: 'microzonas monitoreadas', options: { fontSize: 12, fontFace: FONT_BODY, color: C.piedra } },
  ], { x: 3.5, y: 3.0, w: 3, h: 1.2, align: 'center', valign: 'middle' })

  s.addText('Equipetrol Centro · Sirari · Eq. Norte · Eq. Oeste · Villa Brígida', {
    x: 1, y: 4.5, w: 8, h: 0.4,
    fontSize: 12, fontFace: FONT_BODY, color: C.carbon, align: 'center',
  })

  s.addShape('rect', { x: 4.5, y: 5.2, w: 1, h: 0.01, fill: { color: C.caramelo } })

  s.addText('Corte: 12 de marzo de 2026', {
    x: 3, y: 5.4, w: 4, h: 0.3,
    fontSize: 10, fontFace: FONT_BODY, color: C.piedra, align: 'center',
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — Precios por Zona (Blanco)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  addAccentLine(s)
  addBadge(s, 'COMPARATIVO POR ZONA')
  addSlideTitle(s, 'Precio por zona', 'Mediana $/m² normalizado')
  addFooter(s)

  const zones = [
    { name: 'Eq. Norte (26 uds)', median: 2317, highlight: false },
    { name: 'Eq. Centro (140 uds)', median: 2088, highlight: true },
    { name: 'Sirari (54 uds)', median: 1991, highlight: false },
    { name: 'Eq. Oeste (48 uds)', median: 1900, highlight: false },
    { name: 'V. Brígida (43 uds)', median: 1866, highlight: false },
  ]

  s.addChart(pptx.charts.BAR, [
    {
      name: '$/m² Mediana',
      labels: zones.map(z => z.name),
      values: zones.map(z => z.median),
    },
  ], {
    x: 0.5, y: 1.8, w: 9, h: 4.5,
    barDir: 'bar',
    barGrouping: 'clustered',
    showValue: true,
    valueFontSize: 10,
    valueFontFamily: FONT_BODY,
    valueColor: C.carbon,
    dataLabelFormatCode: '$#,##0',
    catAxisLabelFontSize: 10,
    catAxisLabelFontFamily: FONT_BODY,
    catAxisLabelColor: C.carbon,
    valAxisHidden: true,
    catGridLine: { style: 'none' },
    valGridLine: { style: 'none' },
    chartColors: [C.arena, C.caramelo, C.arena, C.arena, C.arena],
    plotArea: { fill: { color: C.white } },
  })

  s.addText('Condado VI: $2,241/m² → percentil 55-70 del mercado', {
    x: 0.5, y: 6.5, w: 9, h: 0.3,
    fontSize: 9, fontFace: FONT_BODY, color: C.piedra, italic: true,
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — Tendencia Feb → Mar (Marfil)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }
  addAccentLine(s)
  addBadge(s, 'TENDENCIA')
  addSlideTitle(s, 'Febrero → Marzo')
  addFooter(s)

  const deltas = [
    { value: '+11%', detail: 'Oferta\n280 → 311 uds', color: C.carbon },
    { value: '-1.1%', detail: '$/m² mediana\n$2,055 → $2,033', color: C.arena },
    { value: '+1.3%', detail: 'TC paralelo\n9.33 → 9.454', color: C.arena },
  ]
  const w = 9 / 3
  deltas.forEach((d, i) => {
    s.addText([
      { text: d.value + '\n', options: { fontSize: 42, fontFace: FONT_DISPLAY, color: d.color, bold: true } },
      { text: d.detail, options: { fontSize: 11, fontFace: FONT_BODY, color: C.piedra } },
    ], {
      x: 0.5 + i * w, y: 1.8, w: w - 0.1, h: 2.0,
      align: 'center', valign: 'middle',
      fill: { color: C.white }, rectRadius: 0.08,
      shadow: { type: 'outer', blur: 3, offset: 1, color: C.arena, opacity: 0.3 },
    })
  })

  s.addText('Más oferta + precios estables = mercado de compradores', {
    x: 1, y: 4.5, w: 8, h: 0.5,
    fontSize: 14, fontFace: FONT_BODY, color: C.piedra, italic: true, align: 'center',
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — Zoom Eq. Centro (Blanco)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  addAccentLine(s)
  addBadge(s, 'ZOOM EQUIPETROL CENTRO')
  addFooter(s)

  addKPIRow(s, [
    { value: '140', label: 'Unidades activas\n45% del mercado' },
    { value: '62', label: 'Proyectos distintos' },
    { value: '$2,088', label: '$/m² mediana' },
  ], 0.8)

  s.addChart(pptx.charts.BAR, [
    {
      name: '$/m² Mediana Mercado',
      labels: ['Mono (0D)', '1 Dorm', '2 Dorms', '3 Dorms'],
      values: [2324, 2141, 2055, 2001],
    },
    {
      name: 'Condado VI $/m²',
      labels: ['Mono (0D)', '1 Dorm', '2 Dorms', '3 Dorms'],
      values: [0, 2241, 2241, 2241],
    },
  ], {
    x: 0.5, y: 2.6, w: 5.5, h: 4.2,
    barDir: 'col',
    barGrouping: 'clustered',
    showValue: true,
    valueFontSize: 9,
    valueFontFamily: FONT_BODY,
    valueColor: C.carbon,
    dataLabelFormatCode: '$#,##0',
    catAxisLabelFontSize: 10,
    catAxisLabelFontFamily: FONT_BODY,
    catAxisLabelColor: C.carbon,
    valAxisHidden: true,
    catGridLine: { style: 'none' },
    valGridLine: { style: 'dash', color: C.arena, size: 0.5 },
    chartColors: [C.arena, C.caramelo],
    showLegend: true,
    legendPos: 'b',
    legendFontSize: 9,
    legendFontFamily: FONT_BODY,
    legendColor: C.carbon,
    plotArea: { fill: { color: C.white } },
  })

  // Side table
  s.addTable([
    ['Tipología', 'Uds', 'Ticket Avg'],
    ['Mono (0D)', '18', '$107K'],
    ['1 Dorm', '67', '$111K'],
    ['2 Dorms', '45', '$188K'],
    ['3 Dorms', '8', '$323K'],
  ], makeTableOpts(6.3, 2.8, 3.3, [1.3, 0.8, 1.2], 0.35))
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — Absorcion (Marfil)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }
  addAccentLine(s)
  addBadge(s, 'ABSORCION — MARZO 2026')
  addSlideTitle(s, 'Donde está la demanda real', 'Mercado total (5 zonas) — Snapshot 12 Mar 2026')
  addFooter(s)

  const absorption = [
    ['Tipología', 'Activas', 'Absorbidas 30d', 'Tasa', 'Meses Inv.'],
    ['Monoambiente', '45', '6', '11.8%', '7.5'],
    ['1 Dormitorio', '139', '13', '8.6%', '10.7'],
    ['2 Dormitorios', '98', '2', '2.0%', '49.0'],
    ['3 Dormitorios', '25', '2', '7.4%', '12.5'],
  ]

  s.addTable(absorption, makeTableOpts(0.5, 1.8, 9, [2.2, 1.3, 1.8, 1.3, 1.5], 0.42))

  // Callout for 2D
  s.addShape('roundRect', {
    x: 0.5, y: 4.3, w: 9, h: 0.8,
    fill: { color: C.white }, rectRadius: 0.06,
    border: { type: 'solid', color: C.caramelo, pt: 0.75 },
  })
  s.addText([
    { text: '2D = 49 meses de inventario. ', options: { bold: true, color: C.caramelo } },
    { text: '1D y Mono son los segmentos con mayor rotación (8.6% y 11.8%). 3D tiene demanda sana con inventario chico (25 uds).', options: { color: C.carbon } },
  ], {
    x: 0.7, y: 4.3, w: 8.6, h: 0.8,
    fontSize: 11, fontFace: FONT_BODY, valign: 'middle',
  })

  // Bajas
  s.addText('Bajas confirmadas Eq. Centro (30d): 17 uds — 10 de 1D, 5 mono, 2 de 2D, 0 de 3D', {
    x: 0.5, y: 5.3, w: 9, h: 0.3,
    fontSize: 9, fontFace: FONT_BODY, color: C.piedra, italic: true,
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 7 — Dias en Mercado (Blanco)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  addAccentLine(s)
  addBadge(s, 'VELOCIDAD DE VENTA')
  addSlideTitle(s, 'Cuánto tardan en venderse', 'Días en mercado — Eq. Centro')
  addFooter(s)

  const dias = [
    ['Tipología', 'Uds', 'Días Avg', 'Mediana', 'Rango'],
    ['Mono (0D)', '18', '46', '32', '10–168'],
    ['1D', '67', '82', '57', '3–275'],
    ['2D', '45', '91', '58', '9–211'],
    ['3D', '8', '58', '50', '22–147'],
  ]

  s.addTable(dias, makeTableOpts(0.5, 1.8, 9, [2.0, 1.0, 1.5, 1.5, 2.0], 0.40))

  s.addText([
    { text: 'Mono y 3D se venden más rápido ', options: { bold: true, color: C.caramelo } },
    { text: '(mediana 32 y 50 días). 2D es el más lento con mayor dispersión (9–211 días).', options: { color: C.carbon } },
  ], {
    x: 0.5, y: 4.3, w: 9, h: 0.6,
    fontSize: 11, fontFace: FONT_BODY,
    fill: { color: C.marfil }, rectRadius: 0.06,
    border: { type: 'solid', color: C.arena, pt: 0.5 },
    margin: [6, 10, 6, 10],
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 8 — Proyectos Estancados (Marfil)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }
  addAccentLine(s)
  addBadge(s, 'SEÑALES DE ALERTA')
  addSlideTitle(s, 'Proyectos estancados en Eq. Centro', 'Todos son 2D · >100 días promedio')
  addFooter(s)

  const stalled = [
    ['Proyecto', 'Uds', '$/m²', 'Días Avg', 'Señal'],
    ['Sky Plaza Italia', '1', '$2,212', '211', 'Vecino directo CVI'],
    ['Luxe Tower', '1', '$3,014', '195', 'Premium estancado'],
    ['Uptown NUU', '1', '$2,810', '168', 'Ultra-premium, nicho'],
    ['HH Chuubi', '1', '$1,772', '162', 'Preventa estancada'],
    ['Domus Infinity', '1', '$2,463', '155', 'Premium sin demanda'],
    ['Atrium', '7/10', '$2,123', '137', 'Mayor inventario 2D'],
  ]

  s.addTable(stalled, makeTableOpts(0.5, 1.8, 9, [2.2, 0.8, 1.2, 1.2, 2.8], 0.40))

  // Highlight Atrium row
  s.addShape('rect', {
    x: 0.5, y: 1.8 + 0.40 * 6, w: 9, h: 0.40,
    fill: { color: C.caramelo, transparency: 90 },
  })

  s.addText('Todos 2D. Todos >$1,700/m². Sin rotación.', {
    x: 0.5, y: 5.0, w: 9, h: 0.3,
    fontSize: 12, fontFace: FONT_BODY, color: C.piedra, italic: true,
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 9 — 8 Entregados (Blanco)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  addAccentLine(s)
  addBadge(s, 'ENTREGADOS EQ. CENTRO')
  addSlideTitle(s, 'Donde compite Condado VI', '8 proyectos entregados con 3+ unidades')
  addFooter(s)

  const entregados = [
    ['Proyecto', 'Uds', '$/m² Med.', 'Ticket Rango', 'Días'],
    ['Luxe Suites', '6', '$2,796', '$98–227K', '51'],
    ['Nano Smart', '3', '$2,446', '$92–153K', '68'],
    ['Ed. Spazios', '3', '$2,541', '$110–419K', '25'],
    ['Sky Plaza Italia', '5', '$2,212', '$82–194K', '112'],
    ['▸ Condado VI', '6', '$2,212', '$133–319K', '88'],
    ['Ed. Klug', '3', '$2,115', '$135–156K', '47'],
    ['Atrium', '10', '$2,213', '$99–220K', '134'],
    ['Torre Ara', '3', '$1,893', '$176–293K', '19'],
  ]

  s.addTable(entregados, {
    ...makeTableOpts(0.5, 1.8, 9, [2.2, 0.7, 1.3, 1.8, 0.9], 0.38),
  })

  // Highlight CVI row (row 5, offset = header + 4 rows)
  s.addShape('rect', {
    x: 0.5, y: 1.8 + 0.38 * 5, w: 9, h: 0.38,
    fill: { color: C.caramelo, transparency: 88 },
    border: { type: 'solid', color: C.caramelo, pt: 1 },
  })

  s.addText([
    { text: 'Solo 2 competidores entregados ofrecen 3D. ', options: { bold: true, color: C.caramelo } },
    { text: 'Las 3 unidades 3D de CVI ($323K) tienen poca competencia directa.', options: { color: C.carbon } },
  ], {
    x: 0.5, y: 5.5, w: 9, h: 0.5,
    fontSize: 10, fontFace: FONT_BODY,
    fill: { color: C.marfil }, rectRadius: 0.06,
    margin: [6, 10, 6, 10],
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 10 — Equipamiento Scorecard (Marfil)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }
  addAccentLine(s)
  addBadge(s, 'EQUIPAMIENTO DE UNIDAD')
  addSlideTitle(s, 'El departamento más equipado de Equipetrol Centro')
  addFooter(s)

  const items = [
    'Aire acondicionado', 'Cocina encimera', 'Campana extractora',
    'Horno eléctrico', 'Heladera', 'Lavavajillas',
    'Lavadora/Secadora', 'Calefón', 'Roperos empotrados', 'Box de baño',
  ]
  //                         CVI  Atrium Luxe  SkyPI
  const matrix = [
    [1, 1, 1, 1], // Aire
    [1, 1, 1, 1], // Cocina
    [1, 0, 1, 0], // Campana
    [1, 1, 1, 1], // Horno
    [1, 0, 1, 0], // Heladera
    [1, 0, 0, 0], // Lavavajillas
    [1, 0, 1, 0], // Lavadora
    [1, 1, 1, 1], // Calefón
    [1, 1, 1, 1], // Roperos
    [1, 1, 1, 1], // Box baño
  ]
  const competitors = ['Condado VI', 'Atrium', 'Luxe Suites', 'Sky Plaza It.']
  const totals = [10, 6, 9, 6]

  const headerRow = ['', ...competitors]
  const rows = [headerRow]
  for (let i = 0; i < items.length; i++) {
    rows.push([items[i], ...matrix[i].map(v => v ? CHECK : EMPTY)])
  }
  rows.push(['TOTAL', ...totals.map(t => `${t}/10`)])

  s.addTable(rows, {
    x: 0.5, y: 1.6, w: 9,
    fontSize: 10, fontFace: FONT_BODY, color: C.carbon,
    border: { type: 'solid', color: C.arena, pt: 0.5 },
    colW: [2.2, 1.5, 1.3, 1.5, 1.5],
    rowH: 0.32,
    autoPage: false,
    headerRow: true,
    headerRowColor: C.marfil,
    headerRowFill: C.ebano,
    align: 'center',
  })

  // Highlight CVI column
  s.addShape('rect', {
    x: 0.5 + 2.2, y: 1.6, w: 1.5, h: 0.32 * 12,
    fill: { color: C.caramelo, transparency: 90 },
    border: { type: 'solid', color: C.caramelo, pt: 1.5 },
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 11 — Amenidades Brecha (Blanco)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  addAccentLine(s)
  addBadge(s, 'AMENIDADES DE EDIFICIO')
  addSlideTitle(s, 'La brecha competitiva')
  addFooter(s)

  // Left — CVI
  s.addShape('roundRect', {
    x: 0.5, y: 1.8, w: 4.2, h: 4.6,
    fill: { color: C.marfil }, rectRadius: 0.08,
    border: { type: 'solid', color: C.caramelo, pt: 1.5 },
  })
  s.addText('Condado VI', {
    x: 0.5, y: 1.9, w: 4.2, h: 0.4,
    fontSize: 15, fontFace: FONT_DISPLAY, color: C.carbon, align: 'center',
  })
  s.addText('4/8', {
    x: 0.5, y: 2.3, w: 4.2, h: 0.4,
    fontSize: 24, fontFace: FONT_DISPLAY, color: C.caramelo, align: 'center', bold: true,
  })

  const cviAmenities = [
    `${CHECK}  Piscina`, `${CHECK}  Gimnasio`, `${CHECK}  Churrasquera`,
    `${CHECK}  Salón de eventos`, `${EMPTY}  Co-working`, `${CHECK}  Seguridad 24/7`,
    `${EMPTY}  Espacio Zen`, `${EMPTY}  Sala de masajes`,
  ]
  s.addText(cviAmenities.join('\n'), {
    x: 1.0, y: 2.9, w: 3.2, h: 3.2,
    fontSize: 11, fontFace: FONT_BODY, color: C.carbon, lineSpacingMultiple: 1.6,
  })

  // Right — Competencia
  s.addShape('roundRect', {
    x: 5.3, y: 1.8, w: 4.2, h: 4.6,
    fill: { color: C.marfil }, rectRadius: 0.08,
    border: { type: 'solid', color: C.arena, pt: 1 },
  })
  s.addText('Competencia', {
    x: 5.3, y: 1.9, w: 4.2, h: 0.4,
    fontSize: 15, fontFace: FONT_DISPLAY, color: C.carbon, align: 'center',
  })
  s.addText('7/8', {
    x: 5.3, y: 2.3, w: 4.2, h: 0.4,
    fontSize: 24, fontFace: FONT_DISPLAY, color: C.carbon, align: 'center', bold: true,
  })

  const compAmenities = [
    `${CHECK}  Piscina`, `${CHECK}  Gimnasio`, `${CHECK}  Churrasquera`,
    `${CHECK}  Salón de eventos`, `${CHECK}  Co-working`, `${CHECK}  Seguridad 24/7`,
    `${CHECK}  Espacio Zen`, `${CHECK}  Sala de masajes`,
  ]
  s.addText(compAmenities.join('\n'), {
    x: 5.8, y: 2.9, w: 3.2, h: 3.2,
    fontSize: 11, fontFace: FONT_BODY, color: C.carbon, lineSpacingMultiple: 1.6,
  })

  s.addText('Atrium 7/8 · Luxe Suites 7/8 · Sky Plaza Italia 5/8', {
    x: 0.5, y: 6.6, w: 9, h: 0.3,
    fontSize: 9, fontFace: FONT_BODY, color: C.piedra, italic: true, align: 'center',
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 12 — CVI vs Terrazzo (Marfil)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }
  addAccentLine(s)
  addBadge(s, 'COMPETIDOR CLAVE — TERRAZZO')
  addSlideTitle(s, 'Condado VI vs Terrazzo', 'Mismo micro-mercado · ~500m de distancia')
  addFooter(s)

  const compRows = [
    ['', 'Condado VI', 'Terrazzo'],
    ['Entrega', 'Inmediata', 'Diciembre 2026'],
    ['$/m² promedio', '$2,241', '~$2,078 (−7%)'],
    ['Equipamiento', '16 items', '12 items'],
    ['Amenidades', '7', '12'],
    ['Tipologías', '1D, 2D, 3D', 'Mono–3D, Dúplex'],
    ['Disponibles', '14', '14'],
    ['Vendidas', '~11+', '6'],
    ['Interiorismo', '—', 'Roberto Franco'],
  ]

  s.addTable(compRows, {
    ...makeTableOpts(0.5, 1.8, 9, [2.2, 3.4, 3.4], 0.40),
  })

  // Propuesta de valor
  s.addShape('rect', { x: 0.5, y: 5.8, w: 9, h: 0.01, fill: { color: C.caramelo } })
  s.addText([
    { text: '"Listo para vivir"', options: { color: C.caramelo, fontSize: 14, bold: true } },
    { text: '   vs   ', options: { color: C.piedra, fontSize: 12 } },
    { text: '"Experiencia de edificio"', options: { color: C.piedra, fontSize: 14, italic: true } },
  ], {
    x: 1, y: 6.0, w: 8, h: 0.5,
    fontFace: FONT_BODY, align: 'center', valign: 'middle',
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 13 — Precios CVI vs Terrazzo (Blanco)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  addAccentLine(s)
  addBadge(s, 'PRECIO POR TIPOLOGIA')
  addSlideTitle(s, 'Condado VI vs Terrazzo $/m²', 'Precios normalizados TC 9.454')
  addFooter(s)

  s.addChart(pptx.charts.BAR, [
    {
      name: 'Condado VI',
      labels: ['1D', '2D', '3D'],
      values: [2241, 2241, 2241],
    },
    {
      name: 'Terrazzo',
      labels: ['1D', '2D', '3D'],
      values: [2000, 2210, 2105],
    },
  ], {
    x: 0.5, y: 1.8, w: 9, h: 4.0,
    barDir: 'col',
    barGrouping: 'clustered',
    showValue: true,
    valueFontSize: 10,
    valueFontFamily: FONT_BODY,
    valueColor: C.carbon,
    dataLabelFormatCode: '$#,##0',
    catAxisLabelFontSize: 11,
    catAxisLabelFontFamily: FONT_BODY,
    catAxisLabelColor: C.carbon,
    valAxisHidden: true,
    catGridLine: { style: 'none' },
    valGridLine: { style: 'none' },
    chartColors: [C.caramelo, C.arena],
    showLegend: true,
    legendPos: 'b',
    legendFontSize: 10,
    legendFontFamily: FONT_BODY,
    legendColor: C.carbon,
    plotArea: { fill: { color: C.white } },
  })

  s.addText('CVI cobra +7% pero incluye $3-5K en equipamiento. Diferencia real: +3-4%', {
    x: 0.5, y: 6.2, w: 9, h: 0.4,
    fontSize: 10, fontFace: FONT_BODY, color: C.piedra, italic: true,
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 14 — Amenidades CVI vs Terrazzo (Marfil)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }
  addAccentLine(s)
  addBadge(s, 'BRECHA DE AMENIDADES')
  addSlideTitle(s, 'Donde Terrazzo supera')
  addFooter(s)

  // Left — shared
  s.addText([
    { text: 'COMPARTEN (7)\n\n', options: { fontSize: 10, color: C.caramelo, letterSpacing: 2 } },
    { text: 'Piscina\nGimnasio\nChurrasquera\nSalón de eventos\nSeguridad 24/7\nAscensor\nTerraza/Balcón', options: { fontSize: 12, color: C.piedra } },
  ], {
    x: 0.7, y: 1.8, w: 4, h: 4.0,
    fontFace: FONT_BODY, lineSpacingMultiple: 1.6, valign: 'top',
  })

  // Right — exclusive Terrazzo
  s.addText([
    { text: 'SOLO TERRAZZO (+5)\n\n', options: { fontSize: 10, color: C.caramelo, letterSpacing: 2 } },
    { text: 'Sauna\nCocina de verano\nParque infantil\nFogatero\nPet Center', options: { fontSize: 13, color: C.carbon, bold: true } },
  ], {
    x: 5.3, y: 1.8, w: 4, h: 4.0,
    fontFace: FONT_BODY, lineSpacingMultiple: 1.6, valign: 'top',
  })

  // Vertical divider
  s.addShape('rect', { x: 4.95, y: 1.8, w: 0.01, h: 3.5, fill: { color: C.arena } })

  s.addText('Terrazzo tiene 2 pisos completos de áreas sociales. Principal vulnerabilidad de CVI en Plaza Italia.', {
    x: 0.5, y: 6.0, w: 9, h: 0.5,
    fontSize: 11, fontFace: FONT_BODY, color: C.piedra, italic: true,
    fill: { color: C.white }, rectRadius: 0.06,
    margin: [6, 10, 6, 10],
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 15 — Alquiler + Yields (Blanco)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  addAccentLine(s)
  addBadge(s, 'MERCADO DE ALQUILER')
  addSlideTitle(s, 'Referencia de yield', 'Eq. Centro — 64 activos')
  addFooter(s)

  // Left table
  s.addTable([
    ['Tipología', 'Activos', 'Mediana/mes'],
    ['Mono', '7', '$460'],
    ['1D', '24', '$510'],
    ['2D', '20', '$1,149'],
    ['3D', '4', '$1,978'],
  ], makeTableOpts(0.5, 1.8, 5, [1.5, 1.2, 1.5], 0.38))

  // Right — yield cards
  const yields = [
    { tipo: '1D', alq: '$510/mes', yield: '4.4%', borderColor: C.arena, textColor: C.piedra },
    { tipo: '2D', alq: '$1,149/mes', yield: '7.1%', borderColor: C.caramelo, textColor: C.caramelo },
    { tipo: '3D', alq: '$1,978/mes', yield: '7.3%', borderColor: C.caramelo, textColor: C.caramelo },
  ]
  yields.forEach((y, i) => {
    const yPos = 2.0 + i * 1.3
    s.addShape('roundRect', {
      x: 6.2, y: yPos, w: 3.3, h: 1.0,
      fill: { color: C.marfil }, rectRadius: 0.06,
      border: { type: 'solid', color: y.borderColor, pt: 1 },
    })
    s.addText([
      { text: y.yield + '\n', options: { fontSize: 24, fontFace: FONT_DISPLAY, color: y.textColor, bold: true } },
      { text: `${y.tipo} · ${y.alq}`, options: { fontSize: 10, fontFace: FONT_BODY, color: C.piedra } },
    ], {
      x: 6.2, y: yPos, w: 3.3, h: 1.0,
      align: 'center', valign: 'middle',
    })
  })

  s.addText('Pipeline desde Feb 2026 · precios de lista · no garantiza ocupación', {
    x: 0.5, y: 6.0, w: 9, h: 0.3,
    fontSize: 8, fontFace: FONT_BODY, color: C.piedra, italic: true,
    fill: { color: C.marfil, transparency: 50 }, rectRadius: 0.04,
    margin: [4, 8, 4, 8],
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 16 — Fortalezas (Marfil)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }
  addAccentLine(s)
  addBadge(s, 'FORTALEZAS')
  addSlideTitle(s, 'Lo que tiene Condado VI')
  addFooter(s)

  const strengths = [
    { num: '01', title: 'Equipamiento 10/10', desc: 'Único con línea blanca completa en Eq. Centro' },
    { num: '02', title: 'Entrega inmediata', desc: 'Competidores estancados o en preventa' },
    { num: '03', title: 'Plaza Italia', desc: 'Corazón de Equipetrol Centro' },
    { num: '04', title: '$2,241/m²', desc: 'Equip. de Luxe Suites al precio de Atrium' },
    { num: '05', title: 'Poca competencia 3D', desc: 'Solo 8 uds entregadas en Centro' },
    { num: '06', title: '1D más dinámico', desc: '8.6% absorción, 13 ventas/mes' },
  ]

  strengths.forEach((item, i) => {
    const y = 1.6 + i * 0.85
    s.addText(item.num, {
      x: 0.5, y, w: 0.7, h: 0.7,
      fontSize: 20, fontFace: FONT_DISPLAY, color: C.caramelo, align: 'right', valign: 'top',
    })
    s.addText([
      { text: item.title + '\n', options: { fontSize: 14, fontFace: FONT_BODY, color: C.carbon, bold: true } },
      { text: item.desc, options: { fontSize: 11, fontFace: FONT_BODY, color: C.piedra } },
    ], {
      x: 1.4, y, w: 7.5, h: 0.7, valign: 'top',
    })
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 17 — Debilidades (Blanco)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  addAccentLine(s)
  addBadge(s, 'DEBILIDADES')
  addSlideTitle(s, 'Lo que debe resolver')
  addFooter(s)

  const weaknesses = [
    { num: '01', title: 'Sin presencia digital', desc: 'Brokers controlan la narrativa' },
    { num: '02', title: 'Material audiovisual inexistente', desc: 'Sin fotos profesionales ni video' },
    { num: '03', title: 'Amenidades sin vestir', desc: 'Áreas comunes sin puesta en escena' },
    { num: '04', title: 'Brecha amenidades: 4/8', desc: 'vs 7/8 de Atrium y Luxe Suites' },
    { num: '05', title: '2D sobreofertado: 49 meses', desc: '50% del inventario en segmento más lento' },
    { num: '06', title: 'Pet Friendly sin confirmar', desc: '3 competidores directos SÍ lo son' },
    { num: '07', title: 'Terrazzo: 12 vs 7 amenidades', desc: 'Principal vulnerabilidad Plaza Italia' },
  ]

  weaknesses.forEach((item, i) => {
    const y = 1.6 + i * 0.73
    s.addText(item.num, {
      x: 0.5, y, w: 0.7, h: 0.6,
      fontSize: 18, fontFace: FONT_DISPLAY, color: C.arena, align: 'right', valign: 'top',
    })
    s.addText([
      { text: item.title + '\n', options: { fontSize: 13, fontFace: FONT_BODY, color: C.carbon, bold: true } },
      { text: item.desc, options: { fontSize: 10, fontFace: FONT_BODY, color: C.piedra } },
    ], {
      x: 1.4, y, w: 7.5, h: 0.6, valign: 'top',
    })
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 18 — Plan de Accion (Marfil)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }
  addAccentLine(s)
  addBadge(s, 'PLAN DE ACCION')
  addSlideTitle(s, 'Qué hacer y cuándo')
  addFooter(s)

  const cols = [
    {
      title: 'URGENTE', subtitle: 'Semana 1–2', color: C.caramelo,
      items: ['P0 · Vestir amenidades\n+ fotos/video profesional', 'P0 · Landing page\n+ redes sociales'],
    },
    {
      title: 'CORTO PLAZO', subtitle: 'Mes 1', color: C.carbon,
      items: ['P1 · Kit profesional\npara brokers', 'P1 · Foco comercial\nen 1D y 3D', 'P1 · Narrativa\n"Listo para vivir"'],
    },
    {
      title: 'MEDIANO', subtitle: 'Mes 2–3', color: C.piedra,
      items: ['P2 · Monitoreo\ncompetitivo mensual', 'P2 · Confirmar y\ncomunicar Pet Friendly'],
    },
  ]

  cols.forEach((col, ci) => {
    const x = 0.4 + ci * 3.15
    // Header
    s.addShape('roundRect', {
      x, y: 1.7, w: 2.95, h: 0.65,
      fill: { color: col.color }, rectRadius: 0.06,
    })
    s.addText([
      { text: col.title + '\n', options: { fontSize: 11, bold: true, color: C.marfil } },
      { text: col.subtitle, options: { fontSize: 9, color: C.marfil } },
    ], {
      x, y: 1.7, w: 2.95, h: 0.65,
      fontFace: FONT_BODY, align: 'center', valign: 'middle',
    })

    // Cards
    col.items.forEach((item, ii) => {
      const yPos = 2.55 + ii * 1.25
      s.addShape('roundRect', {
        x: x + 0.05, y: yPos, w: 2.85, h: 1.05,
        fill: { color: C.white }, rectRadius: 0.06,
        border: { type: 'solid', color: col.color === C.caramelo ? C.caramelo : C.arena, pt: col.color === C.caramelo ? 1.5 : 0.75 },
      })
      s.addText(item, {
        x: x + 0.15, y: yPos + 0.1, w: 2.65, h: 0.85,
        fontSize: 10, fontFace: FONT_BODY, color: C.carbon, valign: 'middle',
      })
    })
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 19 — Matriz Prioridades (Blanco)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.white }
  addAccentLine(s)
  addBadge(s, 'MATRIZ IMPACTO / ESFUERZO')
  addSlideTitle(s, 'Priorizar lo que mueve la aguja')
  addFooter(s)

  const priorities = [
    ['Prioridad', 'Acción', 'Impacto', 'Esfuerzo'],
    ['P0', 'Vestir amenidades + fotos/video', '●●●', '●●'],
    ['P0', 'Landing page + redes sociales', '●●●', '●●'],
    ['P1', 'Kit profesional brokers', '●●●', '●'],
    ['P1', 'Foco comercial 1D y 3D', '●●', '●'],
    ['P1', 'Narrativa "Listo para vivir"', '●●', '●'],
    ['P2', 'Confirmar Pet Friendly', '●●', '●'],
    ['P2', 'Monitoreo competitivo mensual', '●', '●'],
    ['P3', 'Amoblar departamentos modelo', '●●●', '●●●'],
  ]

  s.addTable(priorities, makeTableOpts(0.5, 1.6, 9, [1.0, 4.2, 1.4, 1.4], 0.38))

  // Highlight P0 rows
  s.addShape('rect', { x: 0.5, y: 1.6 + 0.38, w: 9, h: 0.38 * 2, fill: { color: C.caramelo, transparency: 92 } })

  s.addText('Quick wins: Kit brokers + Pet Friendly (alto impacto, bajo costo)', {
    x: 0.5, y: 5.5, w: 9, h: 0.4,
    fontSize: 11, fontFace: FONT_BODY, color: C.piedra, italic: true,
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 20 — Cierre (Ebano)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.ebano }
  addAccentLine(s)

  s.addText('Condado VI tiene el mejor producto\nde Equipetrol Centro.', {
    x: 1, y: 1.2, w: 8, h: 1.0,
    fontSize: 26, fontFace: FONT_DISPLAY, color: C.marfil, align: 'center',
  })

  s.addText('El desafío no es el producto\nsino cómo se comunica.', {
    x: 1, y: 2.3, w: 8, h: 1.0,
    fontSize: 26, fontFace: FONT_DISPLAY, color: C.caramelo, align: 'center',
  })

  s.addShape('rect', { x: 4.5, y: 3.6, w: 1, h: 0.015, fill: { color: C.caramelo } })

  // 3 pillars
  const pillars = [
    { icon: '10/10', label: 'equipamiento' },
    { icon: 'HOY', label: 'entrega' },
    { icon: '♦', label: 'Plaza Italia' },
  ]
  pillars.forEach((p, i) => {
    const x = 1.0 + i * 2.8
    s.addShape('roundRect', {
      x, y: 4.0, w: 2.4, h: 1.4,
      rectRadius: 0.08,
      border: { type: 'solid', color: C.caramelo, pt: 0.75 },
    })
    s.addText([
      { text: p.icon + '\n', options: { fontSize: 28, fontFace: FONT_DISPLAY, color: C.caramelo, bold: true } },
      { text: p.label, options: { fontSize: 11, fontFace: FONT_BODY, color: C.piedra } },
    ], {
      x, y: 4.0, w: 2.4, h: 1.4,
      align: 'center', valign: 'middle',
    })
  })

  s.addText('La información es la ventaja competitiva.', {
    x: 1, y: 5.8, w: 8, h: 0.4,
    fontSize: 14, fontFace: FONT_BODY, color: C.piedra, align: 'center', italic: true,
  })

  s.addShape('rect', { x: 4.5, y: 6.4, w: 1, h: 0.015, fill: { color: C.caramelo } })

  s.addText('311 unidades verificadas · GPS · TC Bs 9.454 · Marzo 2026', {
    x: 1, y: 6.5, w: 8, h: 0.3,
    fontSize: 9, fontFace: FONT_BODY, color: C.piedra, align: 'center',
  })

  s.addText('SICI', {
    x: 2, y: 7.0, w: 6, h: 0.3,
    fontSize: 8, fontFace: FONT_BODY, color: C.piedra, align: 'center', letterSpacing: 3,
  })
}

// ── Export ───────────────────────────────────────────────────────────────────

await pptx.writeFile({ fileName: OUT_PATH })
console.log(`✅ PPTX generado: ${OUT_PATH}`)
