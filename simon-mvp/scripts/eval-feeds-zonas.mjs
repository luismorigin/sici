// eval-feeds-zonas.mjs — verificador de los feeds por macrozona
//
// Para qué: es la RED del refactor que parametriza el feed por macrozona. Corre
// ANTES de desplegar y responde tres cosas que ni `tsc` ni `npm run build` pueden ver:
//   1. cuántas propiedades muestra cada feed
//   2. 🔴 DE QUÉ MACROZONA SON  ← el chequeo que habría atajado el incidente del 18-ago,
//      cuando /zona-norte/ventas sirvió props de Eq. Centro y V. Brigida EN PRODUCCIÓN
//      con typecheck y build en verde
//   3. qué piezas del rediseño están presentes
//
// Por qué Playwright y no el navegador interno: `docs/design/VERIFICAR_FEEDS_DESKTOP.md`
// documenta que el preview MCP no hidrata el layout desktop — se queda en mobile y
// `.vd-cols` nunca aparece. Ignorarlo cuesta tiempo (comprobado el 18-ago).
//
// Uso:  cd simon-mvp && npm run dev        (en otra terminal)
//       node scripts/eval-feeds-zonas.mjs
//       node scripts/eval-feeds-zonas.mjs --guardar   → escribe la línea de base
//       node scripts/eval-feeds-zonas.mjs --comparar  → compara contra la línea de base
import { chromium } from 'playwright'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://localhost:3000'
// fileURLToPath y no .pathname: la ruta del repo tiene un espacio ("Censo inmobiliario")
// y .pathname lo devuelve como %20, que fs no resuelve.
const LINEA_BASE = fileURLToPath(new URL('./eval-feeds-zonas.base.json', import.meta.url))
const guardar  = process.argv.includes('--guardar')
const comparar = process.argv.includes('--comparar')

// Las macrozonas y cómo se reconocen sus zonas en pantalla.
const FEEDS = [
  { id: 'equipetrol', ruta: '/ventas',
    propias: /Eq\. \w+|Sirari|V\. Brigida/g,
    ajenas:  /ZN \d/g },
  { id: 'zona-norte', ruta: '/zona-norte/ventas',
    propias: /ZN \d/g,
    ajenas:  /Eq\. \w+|Sirari|V\. Brigida/g },
]

// Piezas del rediseño. Selectores tomados de VERIFICAR_FEEDS_DESKTOP.md.
const PIEZAS = {
  layout_desktop:  '.vd-cols',
  cards_lista:     '.vlc',
  pills_filtro:    '.vfp',
  boton_area_mapa: '.vd-map-search-btn',
}

async function medir(browser, feed) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errores = []
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text().slice(0, 120)) })

  await page.goto(BASE + feed.ruta, { waitUntil: 'networkidle', timeout: 60000 })
  // El listado completo llega por fetch diferido a idle: hay que esperarlo.
  await page.waitForTimeout(6000)

  const r = await page.evaluate((sels) => {
    const t = document.body.innerText
    const piezas = {}
    for (const [k, s] of Object.entries(sels)) piezas[k] = document.querySelectorAll(s).length
    return { texto: t, piezas }
  }, PIEZAS)

  const propias = (r.texto.match(feed.propias) || []).length
  const ajenas  = (r.texto.match(feed.ajenas)  || []).length
  const precios = (r.texto.match(/\$us [\d,]+/g) || []).length

  await page.close()
  return { feed: feed.id, ruta: feed.ruta, propias, ajenas, precios, piezas: r.piezas,
           errores_consola: errores.length }
}

const browser = await chromium.launch()
const resultados = []
for (const f of FEEDS) resultados.push(await medir(browser, f))
await browser.close()

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('\n📊 FEEDS POR MACROZONA\n')
for (const r of resultados) {
  const ok = r.ajenas === 0 ? '✅' : '🔴'
  console.log(`${ok} ${r.ruta}`)
  console.log(`     propiedades de SU macrozona: ${r.propias}`)
  console.log(`     de la OTRA macrozona:        ${r.ajenas}  ${r.ajenas ? '← CONTAMINACIÓN' : ''}`)
  console.log(`     precios visibles:            ${r.precios}`)
  console.log(`     piezas del rediseño:         ${Object.entries(r.piezas).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
  if (r.errores_consola) console.log(`     ⚠️  errores de consola:      ${r.errores_consola}`)
  console.log('')
}

// 🔴 La contaminación entre macrozonas es siempre un fallo, con o sin línea de base.
const contaminados = resultados.filter(r => r.ajenas > 0)
if (contaminados.length) {
  console.log('🔴 FALLA: ' + contaminados.map(r => r.ruta).join(', ') + ' muestra(n) otra macrozona.\n')
  process.exit(1)
}

if (guardar) {
  writeFileSync(LINEA_BASE, JSON.stringify(resultados, null, 2))
  console.log(`💾 línea de base guardada en ${LINEA_BASE}\n`)
} else if (comparar) {
  if (!existsSync(LINEA_BASE)) { console.log('🔴 no hay línea de base. Correr con --guardar primero.\n'); process.exit(1) }
  const base = JSON.parse(readFileSync(LINEA_BASE, 'utf8'))
  let fallas = 0
  for (const r of resultados) {
    const b = base.find(x => x.feed === r.feed)
    if (!b) continue
    // Equipetrol NO se puede mover. ZN puede mejorar (más piezas), nunca perder propiedades.
    if (r.feed === 'equipetrol' && (r.propias !== b.propias || JSON.stringify(r.piezas) !== JSON.stringify(b.piezas))) {
      console.log(`🔴 ${r.ruta} CAMBIÓ. Antes: ${b.propias} props, ${JSON.stringify(b.piezas)}`)
      console.log(`                     Ahora: ${r.propias} props, ${JSON.stringify(r.piezas)}\n`)
      fallas++
    }
    if (r.feed === 'zona-norte' && r.propias < b.propias) {
      console.log(`🔴 ${r.ruta} PERDIÓ propiedades: ${b.propias} → ${r.propias}\n`); fallas++
    }
  }
  if (fallas) { console.log('🔴 CRITERIO DE ABORTO: revertir esta fase.\n'); process.exit(1) }
  console.log('✅ sin cambios respecto de la línea de base.\n')
}
