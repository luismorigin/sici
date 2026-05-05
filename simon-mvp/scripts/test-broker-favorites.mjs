// Test: localStorage de favorites NO debe leakear entre /alquileres público
// y /broker/[slug]/alquileres (mismo para venta).
//
// Setup: dev server corriendo en localhost:3000.
// Ejecutar: node scripts/test-broker-favorites.mjs

import { chromium } from 'playwright'

const BROKER_SLUG = 'abel-flores'
const BASE = 'http://localhost:3000'

function log(msg, ok = true) {
  const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`${tag} ${msg}`)
}

function fail(msg) {
  log(msg, false)
  process.exitCode = 1
}

async function getLS(page, key) {
  return page.evaluate((k) => localStorage.getItem(k), key)
}

async function setLS(page, key, val) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, val])
}

async function clearLS(page) {
  await page.evaluate(() => localStorage.clear())
}

// Lee el state de favorites del DOM (mira badges/contadores visibles)
async function getFavoritesCountFromUI(page, selector) {
  try {
    const el = await page.$(selector)
    if (!el) return null
    return await el.textContent()
  } catch {
    return null
  }
}

async function testFlow(label, opts) {
  const { feedPath, brokerPath, lsKey } = opts
  console.log(`\n\x1b[36m── ${label} ──\x1b[0m`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.includes('[ALQ-PERSIST]') || t.includes('[VEN-PERSIST]')) {
      console.log(`  \x1b[90m${t}\x1b[0m`)
    }
  })

  try {
    // 1. Setup: simular favoritos previos en localStorage del feed público
    await page.goto(`${BASE}${feedPath}`, { waitUntil: 'domcontentloaded' })
    await clearLS(page)
    await setLS(page, lsKey, JSON.stringify([1001, 1002, 1003]))
    const setLsValue = await getLS(page, lsKey)
    log(`Setup localStorage[${lsKey}] = ${setLsValue}`)

    // 2. Cargar /broker/[slug] — debería NO leer del localStorage compartido
    await page.goto(`${BASE}${brokerPath}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000) // dejar que useEffects corran

    // Inspeccionar React state via DOM: el banner de "Enviar shortlist · N propiedades"
    // aparece solo si favorites.size >= 1. Si NO aparece, favorites está vacío.
    const bannerText = await page.evaluate(() => {
      const el = document.querySelector('.alq-shortlist-banner-wrap, .vt-shortlist-banner-wrap')
      return el ? el.textContent : null
    })
    if (bannerText && /\d+/.test(bannerText)) {
      fail(`brokerMode HIDRATÓ desde localStorage — banner visible: "${bannerText}"`)
    } else {
      log(`brokerMode NO hidrató (banner ausente o sin contador)`)
    }

    // Confirmar también que el "Enviar (N)" en navbar es 0
    const enviarBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      const m = btns.find(b => /Enviar\s*\(/.test(b.textContent || ''))
      return m ? m.textContent : null
    })
    if (enviarBtn) {
      const match = enviarBtn.match(/\((\d+)\)/)
      const n = match ? parseInt(match[1]) : -1
      if (n === 0) log(`Botón "Enviar (0)" — selección broker está vacía`)
      else fail(`Botón "Enviar (${n})" — broker tiene ${n} props pre-marcadas (debería ser 0)`)
    } else {
      log(`Botón "Enviar" no visible (probablemente correcto, aparece con propiedades cargadas)`)
    }

    // 3. Verificar que localStorage del feed público quedó intacto
    const lsAfterBroker = await getLS(page, lsKey)
    if (lsAfterBroker === JSON.stringify([1001, 1002, 1003])) {
      log(`localStorage[${lsKey}] intacto: ${lsAfterBroker}`)
    } else {
      fail(`localStorage[${lsKey}] cambiado en brokerMode: ${lsAfterBroker}`)
    }

    // 4. Volver al feed público — debería leer localStorage previo (no contaminado)
    await page.goto(`${BASE}${feedPath}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1500)
    const lsAfterPublic = await getLS(page, lsKey)
    if (lsAfterPublic === JSON.stringify([1001, 1002, 1003])) {
      log(`Tras volver al feed público, localStorage[${lsKey}] sigue = ${lsAfterPublic}`)
    } else {
      log(`localStorage[${lsKey}] cambió tras navegar al feed público: ${lsAfterPublic}`, false)
    }

  } finally {
    await browser.close()
  }
}

console.log('Test: localStorage favorites NO leakea entre público y broker\n')

await testFlow('ALQUILER', {
  feedPath: '/alquileres',
  brokerPath: `/broker/${BROKER_SLUG}/alquileres`,
  lsKey: 'alq_favorites',
})

await testFlow('VENTA', {
  feedPath: '/ventas',
  brokerPath: `/broker/${BROKER_SLUG}`,
  lsKey: 'ventas_favorites_v1',
})

console.log(process.exitCode === 1 ? '\n\x1b[31m✗ HUBO FALLAS\x1b[0m' : '\n\x1b[32m✓ Todos los checks pasaron\x1b[0m')
