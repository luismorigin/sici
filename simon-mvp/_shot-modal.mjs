// Verificación modal v4: fotos full width, tarjeta sticky, mobile intacto
import { chromium } from 'playwright'

const OUT = 'C:/Users/LUCHO/AppData/Local/Temp/claude/C--Users-LUCHO-Desktop-Censo-inmobiliario-sici/b5bbbb92-48fe-44f7-864a-f5369f40364e/scratchpad'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:3000/ventas', { waitUntil: 'networkidle' })
await page.waitForSelector('.vlc', { timeout: 30000 })
await page.locator('.vlc').first().click()
await page.waitForSelector('.bs-side', { timeout: 10000 })
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/v4-top.png` })

const top0 = await page.evaluate(() => {
  const f = document.querySelector('.bs-side .bs-sticky-footer')
  const ph = document.querySelector('.bs-side .bsm-photos')
  return { cardTop: Math.round(f.getBoundingClientRect().top), photosBottom: Math.round(ph.getBoundingClientRect().bottom), photosRight: Math.round(ph.getBoundingClientRect().right) }
})

await page.evaluate(() => { document.querySelector('.bs-side').scrollTop = 700 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/v4-scrolled.png` })
const top1 = await page.evaluate(() => {
  const f = document.querySelector('.bs-side .bs-sticky-footer')
  return { cardTopScrolled: Math.round(f.getBoundingClientRect().top) }
})
console.log('DESKTOP:', JSON.stringify({ ...top0, ...top1 }))

// Mobile spot-check: sheet clásico intacto
await browser.close()
const b2 = await chromium.launch()
const m = await b2.newPage({ viewport: { width: 375, height: 667 } })
await m.goto('http://localhost:3000/ventas', { waitUntil: 'networkidle' })
await m.waitForSelector('.mc-card, .mt-card, [class*="card"]', { timeout: 30000 })
await m.waitForTimeout(1500)
await m.screenshot({ path: `${OUT}/v4-mobile-feed.png` })
// abrir el sheet mobile tocando la primera card
const opened = await m.evaluate(() => {
  const card = document.querySelector('.mc-card') || document.querySelector('[class*="mc-"]')
  if (card) { (card).dispatchEvent(new MouseEvent('click', { bubbles: true })) ; return true }
  return false
})
await m.waitForTimeout(1500)
await m.screenshot({ path: `${OUT}/v4-mobile-sheet.png` })
const mob = await m.evaluate(() => {
  const bs = document.querySelector('.bs-venta')
  if (!bs) return { sheet: 'no abierto' }
  const cs = getComputedStyle(bs)
  const f = bs.querySelector('.bs-sticky-footer')
  return { sheet: 'abierto', pos: cs.position, footerPos: f ? getComputedStyle(f).position : null, footerDir: f ? getComputedStyle(f).flexDirection : null }
})
console.log('MOBILE:', JSON.stringify({ opened, ...mob }))
await b2.close()
console.log('OK')
