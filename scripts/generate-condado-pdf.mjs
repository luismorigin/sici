/**
 * Genera PDF del Estudio de Mercado Condado VI con branding premium.
 * Paleta: Marfil #FAF7F2, Carbón #2C2824, Caramelo #B8906F, Arena #E8E2DA, Ébano #1A1714
 * Fonts: Playfair Display (headlines) + DM Sans (body)
 *
 * Usage: node scripts/generate-condado-pdf.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MD_PATH = resolve(__dirname, '../docs/reports/ESTUDIO_MERCADO_CONDADO_2026_03.md')
const OUT_PATH = resolve(__dirname, '../docs/reports/ESTUDIO_MERCADO_CONDADO_2026_03.pdf')

// ── Markdown → HTML (lightweight, no external lib) ──────────────────────────

function mdToHtml(md) {
  let html = md

  // Escape HTML entities in code blocks first
  // (skip for now — no code blocks in this doc)

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr/>')

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br/>')

  // Tables
  html = html.replace(/^(\|.+\|)\n(\|[-:|  ]+\|)\n((?:\|.+\|\n?)+)/gm, (_, header, _sep, body) => {
    const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('')
    const rows = body.trim().split('\n').map(row => {
      const tds = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('')
      return `<tr>${tds}</tr>`
    }).join('\n')
    return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`
  })

  // Footnotes style (¹ ² etc) — leave as-is

  // Paragraphs: wrap loose lines
  const lines = html.split('\n')
  const result = []
  let inParagraph = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isBlock = /^<(h[1-4]|table|thead|tbody|tr|th|td|hr|blockquote|ul|ol|li|div)/.test(line)
    const isEmpty = line.trim() === ''

    if (isBlock || isEmpty) {
      if (inParagraph) { result.push('</p>'); inParagraph = false }
      if (!isEmpty) result.push(line)
    } else {
      if (!inParagraph) { result.push('<p>'); inParagraph = true }
      result.push(line)
    }
  }
  if (inParagraph) result.push('</p>')

  return result.join('\n')
}

// ── HTML template with Condado VI branding ──────────────────────────────────

function wrapInTemplate(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Estudio de Mercado — Condado VI Plaza Italia</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
  :root {
    --marfil: #FAF7F2;
    --carbon: #2C2824;
    --piedra: #7A7168;
    --caramelo: #B8906F;
    --caramelo-dark: #9A7558;
    --arena: #E8E2DA;
    --ebano: #1A1714;
    --white: #FFFFFF;
  }

  @page {
    size: A4;
    margin: 20mm 18mm 24mm 18mm;

    @bottom-center {
      content: counter(page);
      font-family: 'DM Sans', sans-serif;
      font-size: 9px;
      color: var(--piedra);
    }
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'DM Sans', sans-serif;
    font-size: 10.5px;
    line-height: 1.6;
    color: var(--carbon);
    background: var(--white);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Cover page ────────────────────────────── */
  .cover {
    page-break-after: always;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    text-align: center;
    background: var(--marfil);
    color: var(--carbon);
    margin: -20mm -18mm -24mm -18mm;
    padding: 40mm 30mm;
  }

  .cover-badge {
    display: inline-block;
    border: 1px solid var(--caramelo);
    color: var(--caramelo-dark);
    font-family: 'DM Sans', sans-serif;
    font-size: 9px;
    letter-spacing: 3px;
    text-transform: uppercase;
    padding: 6px 20px;
    margin-bottom: 40px;
  }

  .cover h1 {
    font-family: 'Playfair Display', serif;
    font-size: 36px;
    font-weight: 500;
    letter-spacing: -0.5px;
    margin-bottom: 8px;
    color: var(--carbon);
  }

  .cover-subtitle {
    font-family: 'Playfair Display', serif;
    font-size: 18px;
    font-weight: 400;
    color: var(--caramelo-dark);
    margin-bottom: 60px;
  }

  .cover-meta {
    font-size: 10px;
    color: var(--piedra);
    line-height: 2;
  }

  .cover-meta strong { color: var(--carbon); }

  .cover-line {
    width: 60px;
    height: 1px;
    background: var(--caramelo);
    margin: 30px auto;
  }

  .cover-footer {
    margin-top: auto;
    font-size: 8.5px;
    color: var(--piedra);
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  /* ── Typography ────────────────────────────── */
  h1 {
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 500;
    color: var(--ebano);
    margin: 30px 0 6px;
    letter-spacing: -0.3px;
  }

  h2 {
    font-family: 'Playfair Display', serif;
    font-size: 17px;
    font-weight: 500;
    color: var(--ebano);
    margin: 28px 0 4px;
    padding-bottom: 4px;
    border-bottom: 2px solid var(--caramelo);
    page-break-after: avoid;
  }

  h3 {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: var(--carbon);
    margin: 20px 0 4px;
    page-break-after: avoid;
  }

  h4 {
    font-family: 'DM Sans', sans-serif;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--caramelo-dark);
    margin: 16px 0 4px;
    page-break-after: avoid;
  }

  p {
    margin: 6px 0;
    orphans: 3;
    widows: 3;
  }

  strong { font-weight: 600; }

  em { font-style: italic; color: var(--piedra); }

  code {
    font-family: 'DM Mono', 'Consolas', monospace;
    font-size: 9.5px;
    background: var(--arena);
    padding: 1px 4px;
    border-radius: 3px;
  }

  hr {
    border: none;
    height: 1px;
    background: var(--arena);
    margin: 24px 0;
  }

  /* ── Tables ────────────────────────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 16px;
    font-size: 9.5px;
    page-break-inside: auto;
  }

  thead tr {
    background: var(--ebano);
    color: var(--marfil);
  }

  th {
    font-family: 'DM Sans', sans-serif;
    font-weight: 600;
    text-align: left;
    padding: 6px 8px;
    font-size: 9px;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  td {
    padding: 5px 8px;
    border-bottom: 1px solid var(--arena);
    vertical-align: top;
  }

  tbody tr:nth-child(even) {
    background: var(--marfil);
  }

  tbody tr:hover {
    background: var(--arena);
  }

  /* Highlight rows with Condado VI */
  td strong {
    color: var(--caramelo-dark);
  }

  /* ── Blockquotes ───────────────────────────── */
  blockquote {
    border-left: 3px solid var(--caramelo);
    background: var(--marfil);
    padding: 10px 14px;
    margin: 10px 0;
    font-size: 10px;
    color: var(--carbon);
    page-break-inside: avoid;
  }

  blockquote strong {
    color: var(--caramelo-dark);
  }

  /* ── Lists (generated from bold + line patterns) ── */
  ul, ol {
    margin: 6px 0 6px 20px;
  }

  li {
    margin: 3px 0;
  }

  /* ── Utility ───────────────────────────────── */
  .page-break { page-break-before: always; }

  /* Print optimizations */
  h2, h3, h4 {
    page-break-after: avoid;
  }

  table, blockquote {
    page-break-inside: avoid;
  }

  /* First h1 after cover — no top margin */
  .content > h1:first-child {
    margin-top: 0;
  }
</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover">
  <div class="cover-badge">Estudio de Mercado</div>
  <h1>Condado VI</h1>
  <div class="cover-subtitle">Plaza Italia</div>
  <div class="cover-line"></div>
  <div class="cover-meta">
    <strong>Cliente:</strong> Proinco / Constructora Condado<br/>
    <strong>Fecha:</strong> 10 de marzo de 2026<br/>
    <strong>Fuente:</strong> SICI — 312 unidades verificadas con GPS<br/>
    <strong>TC Paralelo:</strong> Bs 9.454/USD (Binance P2P)<br/>
  </div>
  <div class="cover-line"></div>
  <div class="cover-footer">SICI — Sistema Inteligente de Captura Inmobiliaria</div>
</div>

<!-- Content -->
<div class="content">
${bodyHtml}
</div>

</body>
</html>`
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📄 Reading markdown...')
  const md = readFileSync(MD_PATH, 'utf-8')

  // Remove the first heading + metadata block (we have cover page)
  const cleanMd = md
    .replace(/^# .+\n/, '')
    .replace(/^\*\*Cliente:\*\*.+\n/m, '')
    .replace(/^\*\*Fecha:\*\*.+\n/m, '')
    .replace(/^\*\*Fuente:\*\*.+\n/m, '')
    .replace(/^\*\*TC Paralelo:\*\*.+\n/m, '')
    .replace(/^\*\*Precios:\*\*.+\n/m, '')
    .replace(/^> Informe de mercado.+\n/m, '')

  console.log('🔄 Converting to HTML...')
  const bodyHtml = mdToHtml(cleanMd)
  const fullHtml = wrapInTemplate(bodyHtml)

  console.log('🚀 Launching Puppeteer...')
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const page = await browser.newPage()
  await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 })

  console.log('📑 Generating PDF...')
  await page.pdf({
    path: OUT_PATH,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '24mm', left: '18mm', right: '18mm' },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width:100%;font-family:'DM Sans',sans-serif;font-size:8px;color:#7A7168;display:flex;justify-content:space-between;padding:0 18mm;">
        <span>Condado VI Plaza Italia — Estudio de Mercado</span>
        <span>Marzo 2026</span>
      </div>
    `,
    footerTemplate: `
      <div style="width:100%;font-family:'DM Sans',sans-serif;font-size:8px;color:#7A7168;display:flex;justify-content:space-between;padding:0 18mm;">
        <span>SICI — Confidencial</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>
    `,
  })

  await browser.close()
  console.log(`✅ PDF generado: ${OUT_PATH}`)
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1) })
