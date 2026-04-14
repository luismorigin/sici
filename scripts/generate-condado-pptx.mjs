/**
 * Genera PowerPoint ejecutivo — Estudio de Mercado Condado VI Plaza Italia
 * 10 slides con branding Condado VI (marfil/carbón/caramelo)
 *
 * Usage: node scripts/generate-condado-pptx.mjs
 */

import PptxGenJS from 'pptxgenjs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(__dirname, '../docs/reports/ESTUDIO_MERCADO_CONDADO_2026_03.pptx')

// ── Design tokens ───────────────────────────────────────────────────────────
const C = {
  marfil: 'FAF7F2',
  carbon: '2C2824',
  piedra: '7A7168',
  caramelo: 'B8906F',
  carameloDark: '9A7558',
  arena: 'E8E2DA',
  ebano: '1A1714',
  white: 'FFFFFF',
  danger: 'C0392B',
  success: '27AE60',
}

const FONT_DISPLAY = 'Playfair Display'
const FONT_BODY = 'DM Sans'

// ── Helpers ─────────────────────────────────────────────────────────────────

function addBackground(slide) {
  slide.background = { color: C.marfil }
}

function addFooter(slide, text = 'Condado VI Plaza Italia — Estudio de Mercado · Marzo 2026') {
  slide.addText(text, {
    x: 0.4, y: 7.0, w: 9.2, h: 0.3,
    fontSize: 7, fontFace: FONT_BODY, color: C.piedra, align: 'left',
  })
  // Caramelo accent line at top
  slide.addShape('rect', {
    x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.caramelo },
  })
}

function addSlideTitle(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.5, y: 0.3, w: 9, h: 0.6,
    fontSize: 26, fontFace: FONT_DISPLAY, color: C.carbon, bold: false,
  })
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 0.85, w: 9, h: 0.35,
      fontSize: 13, fontFace: FONT_BODY, color: C.piedra, italic: true,
    })
  }
}

function addKPIRow(slide, kpis, y = 1.35) {
  const w = 9 / kpis.length
  kpis.forEach((kpi, i) => {
    slide.addText([
      { text: kpi.value + '\n', options: { fontSize: 28, fontFace: FONT_DISPLAY, color: C.carbon, bold: true } },
      { text: kpi.label, options: { fontSize: 10, fontFace: FONT_BODY, color: C.piedra } },
    ], {
      x: 0.5 + i * w, y, w: w - 0.1, h: 0.9,
      align: 'center', valign: 'middle',
      fill: { color: C.white }, rectRadius: 0.08,
      shadow: { type: 'outer', blur: 4, offset: 2, color: C.arena, opacity: 0.5 },
    })
  })
}

/** Simple check/empty dot for scorecard */
const CHECK = '●'
const EMPTY = '○'

// ── Build presentation ──────────────────────────────────────────────────────

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE' // 13.33 x 7.5 — but we use 10x7.5
pptx.defineLayout({ name: 'A4WIDE', width: 10, height: 7.5 })
pptx.layout = 'A4WIDE'

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 1 — Portada
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }

  // Accent line top
  s.addShape('rect', { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.caramelo } })

  // Badge
  s.addText('ESTUDIO DE MERCADO', {
    x: 3, y: 2.0, w: 4, h: 0.4,
    fontSize: 9, fontFace: FONT_BODY, color: C.carameloDark,
    align: 'center', letterSpacing: 4,
    border: { type: 'solid', color: C.caramelo, pt: 0.75 },
  })

  // Title
  s.addText('Condado VI', {
    x: 1, y: 2.7, w: 8, h: 0.9,
    fontSize: 42, fontFace: FONT_DISPLAY, color: C.carbon, align: 'center', bold: false,
  })
  s.addText('Plaza Italia', {
    x: 1, y: 3.5, w: 8, h: 0.6,
    fontSize: 22, fontFace: FONT_DISPLAY, color: C.carameloDark, align: 'center',
  })

  // Divider
  s.addShape('rect', { x: 4.5, y: 4.3, w: 1, h: 0.015, fill: { color: C.caramelo } })

  // Meta
  s.addText([
    { text: 'Cliente: ', options: { bold: true, color: C.carbon } },
    { text: 'Proinco / Constructora Condado\n', options: { color: C.piedra } },
    { text: 'Fecha: ', options: { bold: true, color: C.carbon } },
    { text: '10 de marzo de 2026\n', options: { color: C.piedra } },
    { text: 'Fuente: ', options: { bold: true, color: C.carbon } },
    { text: 'SICI — 312 unidades verificadas con GPS\n', options: { color: C.piedra } },
    { text: 'TC Paralelo: ', options: { bold: true, color: C.carbon } },
    { text: 'Bs 9.454/USD (Binance P2P)', options: { color: C.piedra } },
  ], {
    x: 2.5, y: 4.6, w: 5, h: 1.4,
    fontSize: 10, fontFace: FONT_BODY, lineSpacingMultiple: 1.8, align: 'center',
  })

  // Footer
  s.addText('SICI — Sistema Inteligente de Captura Inmobiliaria', {
    x: 2, y: 6.8, w: 6, h: 0.3,
    fontSize: 8, fontFace: FONT_BODY, color: C.piedra, align: 'center', letterSpacing: 2,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 2 — Panorama Equipetrol
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBackground(s)
  addFooter(s)
  addSlideTitle(s, 'El mercado donde competís', 'Panorama Equipetrol — 6 zonas monitoreadas')

  addKPIRow(s, [
    { value: '312', label: 'Unidades activas' },
    { value: '$2,128', label: '$/m² promedio' },
    { value: '$160K', label: 'Ticket promedio' },
  ])

  // Horizontal bar chart — zones by $/m² mediana
  const zones = [
    { name: 'Eq. Norte', median: 2338, uds: 26 },
    { name: 'Eq. Centro', median: 2096, uds: 136 },
    { name: 'Sirari', median: 2001, uds: 47 },
    { name: 'Eq. 3er Anillo', median: 1957, uds: 3 },
    { name: 'V. Brígida', median: 1955, uds: 48 },
    { name: 'Eq. Oeste', median: 1874, uds: 52 },
  ]

  s.addChart(pptx.charts.BAR, [
    {
      name: '$/m² Mediana',
      labels: zones.map(z => `${z.name} (${z.uds} uds)`),
      values: zones.map(z => z.median),
    },
  ], {
    x: 0.5, y: 2.5, w: 9, h: 4.3,
    barDir: 'bar',
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
    valGridLine: { style: 'none' },
    chartColors: [C.caramelo, C.caramelo, C.caramelo, C.caramelo, C.caramelo, C.caramelo],
    plotArea: { fill: { color: C.marfil } },
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 3 — Zoom Equipetrol Centro
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBackground(s)
  addFooter(s)
  addSlideTitle(s, 'Tu zona: 44% del mercado', 'Equipetrol Centro — Precios por tipología')

  addKPIRow(s, [
    { value: '136', label: 'Unidades activas' },
    { value: '58', label: 'Proyectos' },
    { value: '$2,096', label: '$/m² mediana' },
  ])

  // Grouped bar chart — tipologías
  s.addChart(pptx.charts.BAR, [
    {
      name: '$/m² Mediana',
      labels: ['Mono (0D)', '1 Dorm', '2 Dorms', '3 Dorms'],
      values: [2355, 2183, 2039, 1685],
    },
    {
      name: 'Condado VI $/m²',
      labels: ['Mono (0D)', '1 Dorm', '2 Dorms', '3 Dorms'],
      values: [0, 2212, 2212, 2212],
    },
  ], {
    x: 0.5, y: 2.5, w: 5.5, h: 4.3,
    barDir: 'col',
    barGrouping: 'clustered',
    showValue: true,
    valueFontSize: 9,
    valueFontFamily: FONT_BODY,
    dataLabelFormatCode: '$#,##0',
    catAxisLabelFontSize: 10,
    catAxisLabelFontFamily: FONT_BODY,
    catAxisLabelColor: C.carbon,
    valAxisHidden: true,
    catGridLine: { style: 'none' },
    valGridLine: { style: 'dash', color: C.arena, size: 0.5 },
    chartColors: [C.piedra, C.caramelo],
    showLegend: true,
    legendPos: 'b',
    legendFontSize: 9,
    legendFontFamily: FONT_BODY,
    legendColor: C.carbon,
    plotArea: { fill: { color: C.marfil } },
  })

  // Ticket avg table on the right
  const ticketRows = [
    ['Tipología', 'Ticket Avg', 'Uds'],
    ['Mono (0D)', '$112K', '16'],
    ['1 Dorm', '$113K', '65'],
    ['2 Dorms', '$187K', '46'],
    ['3 Dorms', '$327K', '7'],
  ]
  s.addTable(ticketRows, {
    x: 6.3, y: 2.8, w: 3.3,
    fontSize: 9, fontFace: FONT_BODY, color: C.carbon,
    border: { type: 'solid', color: C.arena, pt: 0.5 },
    colW: [1.3, 1.0, 1.0],
    rowH: [0.35, 0.3, 0.3, 0.3, 0.3],
    autoPage: false,
    headerRow: true,
    headerRowColor: C.marfil,
    headerRowFill: C.ebano,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 4 — Posición Competitiva (scatter)
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBackground(s)
  addFooter(s)
  addSlideTitle(s, 'Dónde está Condado VI', 'Proyectos en Eq. Centro — $/m² vs inventario')

  // Since pptxgenjs scatter is limited, use a table-based visual
  const projects = [
    ['Proyecto', '$/m² Med.', 'Uds', 'Estado', 'Tipologías'],
    ['Sky Tower', '$2,833', '7', 'Preventa', '0, 1, 2D'],
    ['Luxe Suites', '$2,819', '5', 'Entrega inm.', '0, 1, 2D'],
    ['Luxe Tower', '$2,642', '4', 'Preventa', '1, 2D'],
    ['Condado VI', '$2,212', '14*', 'Entrega inm.', '1, 2, 3D'],
    ['Atrium', '$2,017', '10', 'Entrega inm.', '1, 2D'],
    ['Terrazzo', '$2,030', '14', 'Preventa dic26', '0–3D, Dpx'],
    ['Sky Level', '$2,055', '5', 'Preventa', '1, 2D'],
    ['HH Once', '$1,833', '8', 'Preventa', '0, 1D'],
    ['HH Chuubi', '$1,747', '5', 'Preventa', '1, 2D'],
  ]

  // Highlight Condado VI row
  const tableOpts = {
    x: 0.5, y: 1.4, w: 9,
    fontSize: 10, fontFace: FONT_BODY, color: C.carbon,
    border: { type: 'solid', color: C.arena, pt: 0.5 },
    colW: [2.2, 1.3, 0.8, 1.8, 2.0],
    rowH: [0.38, 0.35, 0.35, 0.35, 0.42, 0.35, 0.35, 0.35, 0.35, 0.35],
    autoPage: false,
    headerRow: true,
    headerRowColor: C.marfil,
    headerRowFill: C.ebano,
  }

  s.addTable(projects, tableOpts)

  // Highlight row for Condado VI (row index 4, y offset)
  s.addShape('rect', {
    x: 0.5, y: 1.4 + 0.38 + 0.35 * 3, w: 9, h: 0.42,
    fill: { color: C.caramelo, transparency: 85 },
    border: { type: 'solid', color: C.caramelo, pt: 1 },
  })

  // Footnote
  s.addText('* 14 unidades reales (solo 5 en portales). Ordenado por $/m² descendente.', {
    x: 0.5, y: 5.8, w: 9, h: 0.3,
    fontSize: 8, fontFace: FONT_BODY, color: C.piedra, italic: true,
  })

  // Key insight box
  s.addText([
    { text: 'Condado VI ', options: { bold: true, color: C.carameloDark } },
    { text: 'está en el P55-P70 del mercado — ligeramente sobre la mediana ($2,096) pero justificado por el equipamiento más completo de la zona.', options: { color: C.carbon } },
  ], {
    x: 0.5, y: 6.1, w: 9, h: 0.6,
    fontSize: 10, fontFace: FONT_BODY,
    fill: { color: C.white }, rectRadius: 0.06,
    border: { type: 'solid', color: C.caramelo, pt: 0.75 },
    margin: [6, 10, 6, 10],
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 5 — Equipamiento Scorecard
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBackground(s)
  addFooter(s)
  addSlideTitle(s, 'El departamento más equipado de Equipetrol', 'Equipamiento de unidad — comparativa directa')

  const items = [
    'Aire acondicionado', 'Cocina encimera', 'Campana extractora',
    'Horno eléctrico', 'Heladera', 'Lavavajillas',
    'Lavadora/Secadora', 'Calefón', 'Roperos empotrados', 'Box de baño',
  ]
  //                           CVI  Atri HHOn HHCh Luxe SkyL Terr
  const matrix = [
    [1, 1, 0, 0, 1, 1, 1], // Aire
    [1, 1, 1, 1, 1, 1, 1], // Cocina
    [1, 0, 1, 1, 1, 1, 1], // Campana
    [1, 1, 0, 0, 1, 1, 1], // Horno
    [1, 0, 0, 0, 1, 0, 1], // Heladera
    [1, 0, 0, 0, 0, 0, 0], // Lavavajillas
    [1, 0, 0, 0, 1, 0, 0], // Lavadora
    [1, 1, 0, 0, 1, 1, 0], // Calefón
    [1, 1, 1, 1, 1, 1, 0], // Roperos
    [1, 1, 1, 1, 1, 1, 1], // Box baño
  ]
  const competitors = ['Condado VI', 'Atrium', 'HH Once', 'HH Chuubi', 'Luxe S.', 'Sky Level', 'Terrazzo']
  const totals = [10, 6, 4, 4, 9, 7, 6]

  // Header row
  const headerRow = ['', ...competitors]
  const rows = [headerRow]
  for (let i = 0; i < items.length; i++) {
    rows.push([items[i], ...matrix[i].map(v => v ? CHECK : EMPTY)])
  }
  rows.push(['TOTAL', ...totals.map(t => `${t}/10`)])

  const colW = [1.8, 1.1, 0.9, 0.95, 0.95, 0.95, 0.95, 0.95]

  s.addTable(rows, {
    x: 0.3, y: 1.4, w: 9.4,
    fontSize: 9, fontFace: FONT_BODY, color: C.carbon,
    border: { type: 'solid', color: C.arena, pt: 0.5 },
    colW,
    rowH: 0.32,
    autoPage: false,
    headerRow: true,
    headerRowColor: C.marfil,
    headerRowFill: C.ebano,
    align: 'center',
  })

  // Highlight Condado VI column — overlay
  s.addShape('rect', {
    x: 1.8 + 0.3, y: 1.4, w: 1.1, h: 0.32 * 12,
    fill: { color: C.caramelo, transparency: 88 },
    border: { type: 'solid', color: C.caramelo, pt: 1.5 },
  })

  // Callout box
  s.addShape('roundRect', {
    x: 0.5, y: 5.7, w: 9, h: 0.7,
    fill: { color: C.ebano }, rectRadius: 0.06,
  })
  s.addText([
    { text: 'Ahorro para el comprador: ', options: { color: C.marfil, fontSize: 12 } },
    { text: '$3,000 – $5,000 USD ', options: { color: C.caramelo, fontSize: 16, bold: true } },
    { text: 'en línea blanca incluida', options: { color: C.marfil, fontSize: 12 } },
  ], {
    x: 0.5, y: 5.7, w: 9, h: 0.7,
    fontFace: FONT_BODY, align: 'center', valign: 'middle',
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 6 — Amenidades: brecha
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBackground(s)
  addFooter(s)
  addSlideTitle(s, 'Donde Terrazzo te supera', 'Amenidades de edificio — brecha competitiva')

  // Two columns
  // Left — Condado VI
  s.addShape('roundRect', {
    x: 0.5, y: 1.5, w: 4.2, h: 4.8,
    fill: { color: C.white }, rectRadius: 0.08,
    border: { type: 'solid', color: C.caramelo, pt: 1.5 },
  })
  s.addText('Condado VI', {
    x: 0.5, y: 1.6, w: 4.2, h: 0.45,
    fontSize: 15, fontFace: FONT_DISPLAY, color: C.carbon, align: 'center', bold: true,
  })
  s.addText('7 amenidades', {
    x: 0.5, y: 2.0, w: 4.2, h: 0.3,
    fontSize: 11, fontFace: FONT_BODY, color: C.caramelo, align: 'center',
  })

  const condadoAmenities = [
    '✓  Piscina', '✓  Gimnasio', '✓  Churrasquera',
    '✓  Salón de eventos', '✓  Seguridad 24/7', '✓  Ascensor',
    '✓  Terraza/Balcón',
  ]
  s.addText(condadoAmenities.join('\n'), {
    x: 1.0, y: 2.5, w: 3.2, h: 3.0,
    fontSize: 11, fontFace: FONT_BODY, color: C.carbon, lineSpacingMultiple: 1.7,
  })

  // Right — Terrazzo
  s.addShape('roundRect', {
    x: 5.3, y: 1.5, w: 4.2, h: 4.8,
    fill: { color: C.white }, rectRadius: 0.08,
    border: { type: 'solid', color: C.piedra, pt: 1 },
  })
  s.addText('Terrazzo', {
    x: 5.3, y: 1.6, w: 4.2, h: 0.45,
    fontSize: 15, fontFace: FONT_DISPLAY, color: C.carbon, align: 'center', bold: true,
  })
  s.addText('12 amenidades', {
    x: 5.3, y: 2.0, w: 4.2, h: 0.3,
    fontSize: 11, fontFace: FONT_BODY, color: C.piedra, align: 'center',
  })

  const shared = [
    '✓  Piscina', '✓  Gimnasio', '✓  Churrasquera',
    '✓  Salón de eventos', '✓  Seguridad 24/7', '✓  Ascensor',
    '✓  Terraza/Balcón',
  ]
  const exclusive = [
    '+  Sauna', '+  Cocina de verano', '+  Parque infantil',
    '+  Fogatero', '+  Pet Center',
  ]
  s.addText(shared.join('\n'), {
    x: 5.8, y: 2.5, w: 3.2, h: 2.5,
    fontSize: 11, fontFace: FONT_BODY, color: C.piedra, lineSpacingMultiple: 1.5,
  })
  s.addText(exclusive.join('\n'), {
    x: 5.8, y: 4.8, w: 3.2, h: 1.3,
    fontSize: 11, fontFace: FONT_BODY, color: C.danger, bold: true, lineSpacingMultiple: 1.5,
  })

  // Note
  s.addText('Pet Friendly pendiente de confirmar — el 46% de la oferta de Eq. Centro ya lo es.', {
    x: 0.5, y: 6.5, w: 9, h: 0.3,
    fontSize: 9, fontFace: FONT_BODY, color: C.piedra, italic: true, align: 'center',
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 7 — Condado VI vs Terrazzo
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBackground(s)
  addFooter(s)
  addSlideTitle(s, 'Condado VI vs Terrazzo', 'Dos propuestas distintas, mismo micro-mercado')

  const compRows = [
    ['', 'Condado VI', 'Terrazzo'],
    ['Entrega', 'Inmediata', 'Diciembre 2026'],
    ['$/m² promedio', '$2,212', '~$2,030 (−8%)'],
    ['Equip. unidad', '10/10', '6/10'],
    ['Amenidades', '7', '12'],
    ['Tipologías', '1D, 2D, 3D', 'Mono–3D, Dúplex'],
    ['Interiorismo', '—', 'Roberto Franco'],
    ['Propuesta', '"Listo para vivir"', '"Experiencia de edificio"'],
  ]

  s.addTable(compRows, {
    x: 0.5, y: 1.4, w: 9,
    fontSize: 11, fontFace: FONT_BODY, color: C.carbon,
    border: { type: 'solid', color: C.arena, pt: 0.5 },
    colW: [2.2, 3.4, 3.4],
    rowH: 0.42,
    autoPage: false,
    headerRow: true,
    headerRowColor: C.marfil,
    headerRowFill: C.ebano,
  })

  // Bar chart — $/m² by typology
  s.addChart(pptx.charts.BAR, [
    {
      name: 'Condado VI',
      labels: ['1D', '2D', '3D'],
      values: [2212, 2212, 2212],
    },
    {
      name: 'Terrazzo',
      labels: ['1D', '2D', '3D'],
      values: [2000, 2073, 2077],
    },
  ], {
    x: 0.5, y: 5.0, w: 9, h: 1.7,
    barDir: 'col',
    barGrouping: 'clustered',
    showValue: true,
    valueFontSize: 8,
    valueFontFamily: FONT_BODY,
    dataLabelFormatCode: '$#,##0',
    catAxisLabelFontSize: 9,
    catAxisLabelFontFamily: FONT_BODY,
    catAxisLabelColor: C.carbon,
    valAxisHidden: true,
    catGridLine: { style: 'none' },
    valGridLine: { style: 'none' },
    chartColors: [C.caramelo, C.piedra],
    showLegend: true,
    legendPos: 'b',
    legendFontSize: 8,
    legendFontFamily: FONT_BODY,
    plotArea: { fill: { color: C.marfil } },
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 8 — Alquiler / Yield
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBackground(s)
  addFooter(s)
  addSlideTitle(s, 'Referencia de yield para el inversor', 'Mercado de alquiler Eq. Centro — datos preliminares')

  // Yield chart
  s.addChart(pptx.charts.BAR, [
    {
      name: 'Precio venta (USD)',
      labels: ['1D (~63m²)', '2D (~87m²)', '3D (~144m²)'],
      values: [140000, 185000, 290000],
    },
  ], {
    x: 0.5, y: 1.5, w: 5.5, h: 4.0,
    barDir: 'col',
    showValue: true,
    valueFontSize: 10,
    valueFontFamily: FONT_BODY,
    dataLabelFormatCode: '$#,##0',
    catAxisLabelFontSize: 10,
    catAxisLabelFontFamily: FONT_BODY,
    catAxisLabelColor: C.carbon,
    valAxisHidden: true,
    catGridLine: { style: 'none' },
    valGridLine: { style: 'none' },
    chartColors: [C.caramelo],
    plotArea: { fill: { color: C.marfil } },
  })

  // Yield cards on right
  const yields = [
    { tipo: '1D', alq: '$517/mes', yield: '4.4%', color: C.piedra },
    { tipo: '2D', alq: '$1,149/mes', yield: '7.5%', color: C.caramelo },
    { tipo: '3D', alq: '$1,800/mes', yield: '7.4%', color: C.caramelo },
  ]
  yields.forEach((y, i) => {
    const yPos = 1.8 + i * 1.3
    s.addShape('roundRect', {
      x: 6.5, y: yPos, w: 3, h: 1.0,
      fill: { color: C.white }, rectRadius: 0.06,
      border: { type: 'solid', color: y.color, pt: 1 },
    })
    s.addText([
      { text: y.yield + '\n', options: { fontSize: 22, fontFace: FONT_DISPLAY, color: y.color, bold: true } },
      { text: `${y.tipo} · ${y.alq}`, options: { fontSize: 9, fontFace: FONT_BODY, color: C.piedra } },
    ], {
      x: 6.5, y: yPos, w: 3, h: 1.0,
      align: 'center', valign: 'middle',
    })
  })

  // Caveat
  s.addText('Datos preliminares — pipeline alquileres operativo desde Feb 2026. Precios de lista, no renta efectiva.', {
    x: 0.5, y: 6.0, w: 9, h: 0.4,
    fontSize: 8, fontFace: FONT_BODY, color: C.piedra, italic: true,
    fill: { color: C.arena, transparency: 50 }, rectRadius: 0.04,
    margin: [4, 8, 4, 8],
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 9 — Plan de Acción
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  addBackground(s)
  addFooter(s)
  addSlideTitle(s, 'Qué hacer y cuándo', 'Roadmap de acciones priorizadas')

  // 3 columns — Urgente, Corto, Mediano
  const cols = [
    {
      title: 'URGENTE', subtitle: 'Semana 1–2', color: C.caramelo,
      items: [
        'Unificar nombre a\n"Condado VI Plaza Italia"',
        'Actualizar listing C21\n(ID 1037 — sin fotos)',
        'Corregir "Condado Park 6"\nen ID 968',
      ],
    },
    {
      title: 'CORTO PLAZO', subtitle: 'Mes 1', color: C.carameloDark,
      items: [
        'Fotos profesionales\nreales (no renders)',
        'Campaña "El más\nequipado de Equipetrol"',
        'Estrategia precios\npor tipología',
      ],
    },
    {
      title: 'MEDIANO PLAZO', subtitle: 'Mes 2–3', color: C.piedra,
      items: [
        'Activación broker\nmulticanal',
        'Estrategia TC billete\npara comprador BOB',
        'Monitoreo absorción\nTerrazzo mensual',
      ],
    },
  ]

  cols.forEach((col, ci) => {
    const x = 0.4 + ci * 3.15
    // Column header
    s.addShape('roundRect', {
      x, y: 1.5, w: 2.95, h: 0.7,
      fill: { color: col.color }, rectRadius: 0.06,
    })
    s.addText([
      { text: col.title + '\n', options: { fontSize: 12, bold: true, color: C.marfil } },
      { text: col.subtitle, options: { fontSize: 9, color: C.marfil } },
    ], {
      x, y: 1.5, w: 2.95, h: 0.7,
      fontFace: FONT_BODY, align: 'center', valign: 'middle',
    })

    // Items
    col.items.forEach((item, ii) => {
      const yPos = 2.4 + ii * 1.3
      s.addShape('roundRect', {
        x: x + 0.05, y: yPos, w: 2.85, h: 1.1,
        fill: { color: C.white }, rectRadius: 0.06,
        border: { type: 'solid', color: C.arena, pt: 0.75 },
      })
      s.addText(item, {
        x: x + 0.15, y: yPos + 0.1, w: 2.65, h: 0.9,
        fontSize: 10, fontFace: FONT_BODY, color: C.carbon,
        valign: 'middle',
      })
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 10 — Cierre
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide()
  s.background = { color: C.marfil }

  // Accent line
  s.addShape('rect', { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.caramelo } })

  // Main message
  s.addText('Condado VI = Listo para vivir', {
    x: 1, y: 1.5, w: 8, h: 0.8,
    fontSize: 30, fontFace: FONT_DISPLAY, color: C.carbon, align: 'center',
  })

  // 3 pillars
  const pillars = [
    { icon: '10/10', label: 'Equipamiento\nmás completo' },
    { icon: 'HOY', label: 'Entrega\ninmediata' },
    { icon: '♦', label: 'Plaza\nItalia' },
  ]
  pillars.forEach((p, i) => {
    const x = 1.0 + i * 2.8
    s.addShape('roundRect', {
      x, y: 2.8, w: 2.4, h: 1.6,
      fill: { color: C.white }, rectRadius: 0.08,
      border: { type: 'solid', color: C.caramelo, pt: 1 },
    })
    s.addText([
      { text: p.icon + '\n', options: { fontSize: 26, fontFace: FONT_DISPLAY, color: C.caramelo, bold: true } },
      { text: p.label, options: { fontSize: 11, fontFace: FONT_BODY, color: C.carbon } },
    ], {
      x, y: 2.8, w: 2.4, h: 1.6,
      align: 'center', valign: 'middle',
    })
  })

  // Quote
  s.addText('"El comprador se muda mañana.\nSolo trae su ropa."', {
    x: 1.5, y: 4.8, w: 7, h: 0.8,
    fontSize: 16, fontFace: FONT_DISPLAY, color: C.carameloDark, align: 'center',
    italic: true,
  })

  // Divider
  s.addShape('rect', { x: 4.5, y: 5.8, w: 1, h: 0.015, fill: { color: C.caramelo } })

  // Data quality note
  s.addText('312 unidades verificadas con GPS · 3 fuentes · TC Bs 9.454 · Marzo 2026', {
    x: 1, y: 6.0, w: 8, h: 0.3,
    fontSize: 9, fontFace: FONT_BODY, color: C.piedra, align: 'center',
  })

  // Footer
  s.addText('SICI — Sistema Inteligente de Captura Inmobiliaria', {
    x: 2, y: 6.8, w: 6, h: 0.3,
    fontSize: 8, fontFace: FONT_BODY, color: C.piedra, align: 'center', letterSpacing: 2,
  })
}

// ── Export ───────────────────────────────────────────────────────────────────

await pptx.writeFile({ fileName: OUT_PATH })
console.log(`✅ PPTX generado: ${OUT_PATH}`)
