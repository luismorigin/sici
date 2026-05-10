// Inspección del toast "TC sin confirmar" en producción.
// Renderiza /broker/abel-flores (venta), busca prop con tc_sospechoso,
// la marca, y captura cómo se ve el toast en desktop y mobile.
//
// Ejecutar: node scripts/test-toast-tc-sospechoso.mjs

import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', '.tmp-screenshots')
const URL = 'https://simonbo.com/broker/abel-flores'

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
]

async function ensureOutDir() {
  const fs = await import('fs/promises')
  await fs.mkdir(OUT_DIR, { recursive: true })
}

async function capture(viewport) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.label === 'mobile',
    hasTouch: viewport.label === 'mobile',
    bypassCSP: true,
  })
  // Disable cache to always get fresh deploy
  await ctx.route('**/*', (route) => {
    route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } })
  })
  const page = await ctx.newPage()

  console.log(`\n── ${viewport.label.toUpperCase()} (${viewport.width}×${viewport.height}) ──`)

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })

  // Dar tiempo a que el feed cargue propiedades
  await page.waitForTimeout(3000)

  // 1. Buscar primera prop con badge "Confirmar tipo de cambio"
  const badgeSelector = '.vc-tc-badge, .mc-tc-badge'
  const badgeCount = await page.locator(badgeSelector).count()
  console.log(`  Badges TC sospechoso visibles: ${badgeCount}`)

  if (badgeCount === 0) {
    console.log('  ⚠ No hay badge visible — quizás necesita scroll o no hay props sospechosas en el primer load')
    await page.screenshot({ path: path.join(OUT_DIR, `${viewport.label}-no-badge.png`), fullPage: false })
    await browser.close()
    return
  }

  // 2. Hacer scroll a esa card y capturar antes
  const firstBadge = page.locator(badgeSelector).first()
  await firstBadge.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT_DIR, `${viewport.label}-1-card-with-badge.png`) })
  console.log(`  📸 ${viewport.label}-1-card-with-badge.png`)

  // 3. Encontrar el botón ⭐ "Agregar a shortlist" de la card que contiene
  //    el badge — usamos JS porque la estructura difiere entre desktop/mobile.
  const favHandle = await page.evaluateHandle((badgeSel) => {
    const badge = document.querySelector(badgeSel)
    if (!badge) return null
    const card = badge.closest('.vc, .mc')
    if (!card) return null
    return card.querySelector('button[aria-label*="shortlist" i], button[aria-label="Favorito"], .vc-act-fav, .mc-fav, .vc-fav')
  }, badgeSelector)

  const favBtn = favHandle.asElement()
  if (!favBtn) {
    console.log('  ⚠ No encontré botón fav en la card del badge')
    await browser.close()
    return
  }

  const favLabel = await favBtn.getAttribute('aria-label').catch(() => null)
  console.log(`  Botón fav encontrado: aria-label="${favLabel}"`)

  // 4. Click + capturar toast
  await favBtn.click()
  await page.waitForTimeout(400)

  const toast = page.locator('.ventas-toast')
  const toastVisible = await toast.isVisible().catch(() => false)
  if (!toastVisible) {
    console.log('  ⚠ Toast no apareció después del click')
    await page.screenshot({ path: path.join(OUT_DIR, `${viewport.label}-no-toast.png`) })
    await browser.close()
    return
  }

  const box = await toast.boundingBox()
  const text = await toast.textContent()
  console.log(`  Toast pos: x=${box?.x.toFixed(0)}px y=${box?.y.toFixed(0)}px`)
  console.log(`  Toast size: ${box?.width.toFixed(0)}×${box?.height.toFixed(0)}px`)
  console.log(`  Viewport: ${viewport.width}×${viewport.height}px`)
  console.log(`  Toast text length: ${text?.length} chars`)
  console.log(`  Texto: "${text}"`)

  await page.screenshot({ path: path.join(OUT_DIR, `${viewport.label}-2-toast.png`), fullPage: false })
  console.log(`  📸 ${viewport.label}-2-toast.png`)

  // Verificar si overflow del viewport
  if (box && (box.x < 0 || box.x + box.width > viewport.width)) {
    console.log(`  ❌ Toast OVERFLOW del viewport`)
  } else if (box && box.width > viewport.width * 0.95) {
    console.log(`  ⚠ Toast ocupa ${(box.width / viewport.width * 100).toFixed(0)}% del ancho — muy ajustado`)
  } else {
    console.log(`  ✓ Toast dentro del viewport`)
  }

  // Inspeccionar CSS aplicado
  const css = await toast.evaluate((el) => {
    const s = window.getComputedStyle(el)
    return {
      maxWidth: s.maxWidth,
      width: s.width,
      whiteSpace: s.whiteSpace,
      padding: s.padding,
      fontSize: s.fontSize,
      borderRadius: s.borderRadius,
      lineHeight: s.lineHeight,
    }
  })
  console.log(`  CSS:`, css)

  await browser.close()
}

await ensureOutDir()
for (const v of VIEWPORTS) {
  await capture(v)
}
console.log(`\nScreenshots en: ${OUT_DIR}`)
