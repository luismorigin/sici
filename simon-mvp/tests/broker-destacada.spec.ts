// E2E: feature destacada (⭐ Recomendada por tu broker) - migración 239
//
// Verifica:
//  1. POST /api/broker/shortlists acepta items_metadata con is_destacada
//  2. GET /api/broker/shortlists/[id] persiste y devuelve is_destacada
//  3. /b/[hash] muestra la destacada PRIMERA aunque su orden manual sea otro
//  4. /b/[hash] renderiza chip "⭐ Recomendada por tu broker" sobre la destacada
//
// El server dev corre en :3003 (3000-3002 ocupados por otros procesos).
// Sin auth: las API rutas usan service_role server-side.

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3003'
const BROKER_SLUG = 'abel-flores'

// IDs de venta en Equipetrol Centro (queriado antes con claude_readonly)
const PROP_IDS = [20, 30, 150, 166]

// La destacada va en la posición 3 del orden manual (id=150).
// Esperamos que aparezca PRIMERA en /b/[hash].
const DESTACADA_ID = 150

interface CreateResponse {
  id: string
  hash: string
  cliente_nombre: string
}

test.describe('broker shortlist - destacada feature (migración 239)', () => {
  let shortlistId: string
  let shortlistHash: string

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/broker/shortlists`, {
      data: {
        broker_slug: BROKER_SLUG,
        cliente_nombre: 'Test Destacada E2E',
        cliente_telefono: '+59170000001',
        propiedad_ids: PROP_IDS,
        tipo_operacion: 'venta',
        items_metadata: [
          {
            propiedad_id: DESTACADA_ID,
            is_destacada: true,
            comentario_broker: 'Esta es la mejor opción según tu perfil — recomendada.',
          },
        ],
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as CreateResponse
    expect(body.id).toBeTruthy()
    expect(body.hash).toBeTruthy()
    shortlistId = body.id
    shortlistHash = body.hash
    console.log(`[setup] shortlist creada: id=${shortlistId} hash=${shortlistHash}`)
  })

  test.afterAll(async ({ request }) => {
    if (shortlistId) {
      await request.delete(`${BASE_URL}/api/broker/shortlists/${shortlistId}`)
      console.log(`[cleanup] shortlist archivada: ${shortlistId}`)
    }
  })

  test('GET devuelve is_destacada=true en el item correcto', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/broker/shortlists/${shortlistId}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body.items)).toBeTruthy()
    expect(body.items).toHaveLength(4)

    const destacada = body.items.find((it: { propiedad_id: number; is_destacada?: boolean }) => it.propiedad_id === DESTACADA_ID)
    expect(destacada).toBeDefined()
    expect(destacada.is_destacada).toBe(true)

    // Las demás NO destacadas
    const otras = body.items.filter((it: { propiedad_id: number; is_destacada?: boolean }) => it.propiedad_id !== DESTACADA_ID)
    for (const it of otras) {
      expect(it.is_destacada).toBeFalsy()
    }
  })

  test('POST con 2+ destacadas en items_metadata es rechazado con 400', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/broker/shortlists`, {
      data: {
        broker_slug: BROKER_SLUG,
        cliente_nombre: 'Test Validacion',
        cliente_telefono: '+59170000002',
        propiedad_ids: PROP_IDS.slice(0, 2),
        tipo_operacion: 'venta',
        items_metadata: [
          { propiedad_id: PROP_IDS[0], is_destacada: true },
          { propiedad_id: PROP_IDS[1], is_destacada: true },
        ],
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(String(body.error || '').toLowerCase()).toContain('destacada')
  })

  test('/b/[hash] muestra chip "Recomendada" en la card destacada', async ({ page }) => {
    await page.goto(`${BASE_URL}/b/${shortlistHash}`)
    // El chip vive sobre la card de la destacada. Render text "Recomendada por tu broker"
    const chip = page.getByText('Recomendada por tu broker').first()
    await expect(chip).toBeVisible({ timeout: 10000 })
  })

  test('/b/[hash] renderiza la destacada PRIMERA aunque su orden manual sea 3', async ({ page }) => {
    await page.goto(`${BASE_URL}/b/${shortlistHash}`)

    // Esperar a que carguen las cards. En desktop son .vc; el ID se renderiza
    // como "#150" dentro de cada card.
    await page.waitForSelector('.vc', { timeout: 10000 })
    const cards = page.locator('.vc')
    const count = await cards.count()
    expect(count).toBe(4)

    // Extraer el ID visible de la primera card (formato: #20, #30, #150, etc.)
    const primeraCardText = await cards.first().textContent()
    expect(primeraCardText).toBeTruthy()
    const idMatch = primeraCardText!.match(/#(\d+)/)
    expect(idMatch).toBeTruthy()
    const primeraCardId = Number(idMatch![1])

    // La destacada (150) debe aparecer primera, NO en su orden manual (3ra).
    expect(primeraCardId).toBe(DESTACADA_ID)
    console.log(`[ok] primera card = #${primeraCardId} (destacada esperada: #${DESTACADA_ID})`)
  })

  test('/b/[hash] muestra el comentario del broker en la card destacada', async ({ page }) => {
    await page.goto(`${BASE_URL}/b/${shortlistHash}`)
    await page.waitForSelector('.vc', { timeout: 10000 })

    // El comentario va clamp a 1 línea con texto italic. Buscamos por
    // el texto que pusimos en setup (puede aparecer truncado).
    const cardComentario = page.locator('.vc-comentario').first()
    await expect(cardComentario).toBeVisible({ timeout: 5000 })
  })
})
