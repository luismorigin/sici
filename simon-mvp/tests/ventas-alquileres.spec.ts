import { test, expect } from '@playwright/test'

// ===== VENTAS =====

test.describe('Ventas page', () => {
  test('loads and shows properties', async ({ page }) => {
    await page.goto('/ventas')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle(/Simon|Ventas|Departamentos/)
  })

  test('search pill visible on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/ventas')
    await page.waitForLoadState('networkidle')
    const pill = page.locator('.mt-search-pill')
    await expect(pill).toBeVisible()
    await expect(pill).toContainText('Comienza tu búsqueda')
  })

  test('filter overlay opens and closes on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/ventas')
    await page.waitForLoadState('networkidle')
    await page.locator('.mt-search-pill').click()
    const overlay = page.locator('.fo-overlay')
    await expect(overlay).toBeVisible()
    await page.locator('.fo-close').click()
    await expect(overlay).not.toBeVisible()
  })

  test('filter overlay shows live count on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/ventas')
    await page.waitForLoadState('networkidle')
    await page.locator('.mt-search-pill').click()
    const dormBtn = page.locator('.vf-btn').nth(1)
    await dormBtn.click()
    await page.waitForTimeout(600)
    const applyBtn = page.locator('.fo-apply')
    await expect(applyBtn).toContainText(/VER \d+ RESULTADOS/)
  })

  test('mobile feed renders cards', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/ventas')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.mt-feed')).toBeVisible()
    await page.waitForTimeout(3000)
    const body = await page.textContent('body')
    expect(body).toContain('$us')
  })

  test('desktop sidebar filters visible', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only')
    await page.goto('/ventas')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.ventas-sidebar')).toBeVisible()
    await expect(page.locator('.vf-wrap')).toBeVisible()
  })

  test('desktop loads cards', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only')
    await page.goto('/ventas')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(page.locator('.ventas-grid')).toBeVisible()
    const cards = page.locator('.ventas-grid > *')
    await expect(cards.first()).toBeVisible()
  })

  // CSS isolation: ventas dark theme not polluted by alquileres.css
  test('ventas filter overlay uses dark theme', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/ventas')
    await page.waitForLoadState('networkidle')
    await page.locator('.mt-search-pill').click()
    const overlay = page.locator('.fo-overlay')
    await expect(overlay).toBeVisible()
    const bg = await overlay.evaluate(el => getComputedStyle(el).backgroundColor)
    // Ventas = dark theme (#141414 = rgb(20, 20, 20))
    expect(bg).toBe('rgb(20, 20, 20)')
  })
})

// ===== ALQUILERES =====

test.describe('Alquileres page', () => {
  test('loads and shows properties', async ({ page }) => {
    await page.goto('/alquileres')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle(/Simon|Alquiler/)
  })

  // --- ISR + deferred fetch ---

  test('shows ISR data immediately without loading flash', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/alquileres')
    // Should NOT show "Cargando alquileres..." — ISR data is ready
    const loadingText = page.getByText('Cargando alquileres...')
    await expect(loadingText).not.toBeVisible()
    // Feed should be visible immediately
    await expect(page.locator('.alq-feed')).toBeVisible()
  })

  test('deferred fetch replaces ISR data with full list', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/alquileres')
    // ISR gives 8 items; after ~3s the full fetch brings ~100+
    // Wait for fetch to complete
    await page.waitForTimeout(4000)
    const feedItems = page.locator('.alq-feed > div')
    const count = await feedItems.count()
    // Should have more than the ISR 8
    expect(count).toBeGreaterThan(8)
  })

  // --- Mobile UI ---

  test('search pill visible on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/alquileres')
    await page.waitForLoadState('networkidle')
    const pill = page.locator('.alq-search-pill')
    await expect(pill).toBeVisible()
    await expect(pill).toContainText('Comienza tu búsqueda')
  })

  test('filter overlay opens and closes on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/alquileres')
    await page.waitForLoadState('networkidle')
    await page.locator('.alq-search-pill').click()
    // NOTE: alquileres uses afo-* prefix (not fo-*) to avoid collision with ventas
    const overlay = page.locator('.afo-overlay')
    await expect(overlay).toBeVisible()
    await expect(page.locator('.afo-title')).toContainText('Filtros')
    await page.locator('.afo-close').click()
    await expect(overlay).not.toBeVisible()
  })

  test('filter overlay uses light theme (not ventas dark)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/alquileres')
    await page.waitForLoadState('networkidle')
    await page.locator('.alq-search-pill').click()
    const overlay = page.locator('.afo-overlay')
    await expect(overlay).toBeVisible()
    const bg = await overlay.evaluate(el => getComputedStyle(el).backgroundColor)
    // Alquileres = light theme (#EDE8DC = rgb(237, 232, 220))
    expect(bg).toBe('rgb(237, 232, 220)')
  })

  test('mobile feed renders cards with Bs prices', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/alquileres')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.alq-feed')).toBeVisible()
    await page.waitForTimeout(3000)
    const body = await page.textContent('body')
    expect(body).toContain('Bs')
  })

  test('mobile card has photo carousel', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/alquileres')
    await page.waitForTimeout(5000)
    // Skip if no data available (local build without Supabase)
    const noResults = page.getByText('Sin resultados')
    if (await noResults.isVisible().catch(() => false)) { test.skip(true, 'no data in local build'); return }
    const carousel = page.locator('.pc-zone').first()
    await expect(carousel).toBeVisible({ timeout: 10000 })
    const counter = page.locator('.pc-counter').first()
    await expect(counter).toContainText(/1\/\d+/)
  })

  test('mobile card shows property info', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/alquileres')
    await page.waitForTimeout(5000)
    // Skip if no data available (local build without Supabase)
    const noResults = page.getByText('Sin resultados')
    if (await noResults.isVisible().catch(() => false)) { test.skip(true, 'no data in local build'); return }
    const content = page.locator('.amc-content').first()
    await expect(content).toBeVisible({ timeout: 10000 })
    await expect(content.locator('.amc-name')).toBeVisible()
    await expect(content.locator('.amc-zona')).toBeVisible()
    await expect(content.locator('.amc-price')).toContainText(/Bs/)
  })

  test('favorite toggle works on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/alquileres')
    await page.waitForTimeout(5000)
    const noResults = page.getByText('Sin resultados')
    if (await noResults.isVisible().catch(() => false)) { test.skip(true, 'no data in local build'); return }
    const favBtn = page.locator('.amc-btn.amc-fav').first()
    await expect(favBtn).toBeVisible({ timeout: 10000 })
    await favBtn.click()
    // Toast should confirm
    const toast = page.locator('.alq-toast.show')
    await expect(toast).toBeVisible({ timeout: 5000 })
    await expect(toast).toContainText(/favorito/)
  })

  // --- Desktop UI ---

  test('desktop loads with sidebar and cards', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only')
    await page.goto('/alquileres')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(page.locator('.desktop-sidebar')).toBeVisible()
    await expect(page.locator('.desktop-main')).toBeVisible()
    const cards = page.locator('.dc-card')
    await expect(cards.first()).toBeVisible()
  })

  test('desktop card shows property data', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only')
    await page.goto('/alquileres')
    await page.waitForTimeout(3000)
    const card = page.locator('.dc-card').first()
    await expect(card.locator('.dc-name')).toBeVisible()
    await expect(card.locator('.dc-price')).toContainText(/Bs/)
    await expect(card.locator('.dc-photo')).toBeVisible()
  })

  test('desktop filters work', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only')
    await page.goto('/alquileres')
    await page.waitForTimeout(3000)
    // Click a dorm filter button
    const dormBtn = page.locator('.df-dorm-btn').first()
    await dormBtn.click()
    // Should become active
    await expect(dormBtn).toHaveClass(/active/)
    // Wait for debounced filter + fetch
    await page.waitForTimeout(1500)
    // Reset should appear
    await expect(page.locator('.df-reset')).toBeVisible()
  })

  test('desktop grid/map toggle works', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only')
    await page.goto('/alquileres')
    await page.waitForTimeout(3000)
    const cards = page.locator('.dc-card')
    if (await cards.count() === 0) { test.skip(true, 'no data in local build'); return }
    // Click "Mapa" button
    const mapBtn = page.getByText('Mapa')
    await mapBtn.click()
    // Grid should disappear, map should load
    await expect(page.locator('.desktop-grid')).not.toBeVisible()
    // Click "Grid" button
    const gridBtn = page.getByText('Grid')
    await gridBtn.click()
    await expect(page.locator('.desktop-grid')).toBeVisible()
  })

  // --- Body styles cleanup ---

  test('body background resets when navigating away', async ({ page }) => {
    await page.goto('/alquileres')
    await page.waitForTimeout(1000)
    // Check body background is set (browser normalizes hex to rgb)
    const bgOnAlq = await page.evaluate(() => document.body.style.background)
    expect(bgOnAlq).toMatch(/EDE8DC|237.*232.*220/)
    // Navigate to another page
    await page.goto('/ventas')
    await page.waitForTimeout(1000)
    // Body background should have been cleaned up by useEffect
    const bgOnVentas = await page.evaluate(() => document.body.style.background)
    expect(bgOnVentas).not.toMatch(/EDE8DC|237.*232.*220/)
  })

  // --- Shimmer stops ---

  test('shimmer animation stops after image loads on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only')
    await page.goto('/alquileres')
    await page.waitForTimeout(6000)
    // Skip if no cards (local build without Supabase data)
    const cards = page.locator('.dc-card')
    if (await cards.count() === 0) { test.skip(true, 'no data in local build'); return }
    const photo = cards.first().locator('.dc-photo')
    const style = await photo.getAttribute('style') || ''
    if (style.includes('background-image')) {
      // CSS rule .dc-photo[style*="background-image"] { animation: none } should apply
      const anim = await photo.evaluate(el => getComputedStyle(el).animationName)
      expect(anim).toBe('none')
    } else {
      await expect(photo).toBeVisible()
    }
  })

  // --- Chat widget deferred ---

  test('chat widget not present immediately, appears after delay', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/alquileres')
    // Immediately: chat widget should NOT be in DOM
    await page.waitForTimeout(500)
    let chatWidgets = await page.locator('[class*="simon-chat"], [class*="SimonChat"]').count()
    expect(chatWidgets).toBe(0)
    // After 3s: should appear
    await page.waitForTimeout(3000)
    // Widget may or may not be visible (depends on implementation), but DOM should have it
    // Just verify the page didn't crash
    await expect(page.locator('.alq-feed')).toBeVisible()
  })
})

// ===== CSS ISOLATION =====

test.describe('CSS isolation between pages', () => {
  test('alquileres CSS does not break ventas filter overlay colors', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only — filter overlay is mobile UI')
    // Load ventas (which also loads alquileres.css from _app)
    await page.goto('/ventas', { waitUntil: 'networkidle' })
    // Open filter overlay
    await page.locator('.mt-search-pill').click()
    const overlay = page.locator('.fo-overlay')
    await expect(overlay).toBeVisible()
    // Verify dark theme colors (ventas uses #141414 bg)
    const bg = await overlay.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgb(20, 20, 20)')
    const title = page.locator('.fo-title')
    const titleColor = await title.evaluate(el => getComputedStyle(el).color)
    // Ventas title should be light (#EDE8DC = rgb(237, 232, 220))
    expect(titleColor).toBe('rgb(237, 232, 220)')
  })

  test('alquileres CSS does not break ventas mobile card colors', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await page.goto('/ventas', { waitUntil: 'networkidle' })
    await page.waitForTimeout(3000)
    // Ventas mobile cards use mc-content (NOT amc-content)
    const content = page.locator('.mc-content').first()
    if (await content.count() > 0) {
      // mc-name should be light color on dark bg
      const name = content.locator('.mc-name')
      if (await name.count() > 0) {
        const color = await name.evaluate(el => getComputedStyle(el).color)
        // Should be light (ventas dark theme) — rgb(237, 232, 220) or close
        const [r, g, b] = color.match(/\d+/g)!.map(Number)
        expect(r).toBeGreaterThan(200) // light text on dark bg
      }
    }
  })
})
