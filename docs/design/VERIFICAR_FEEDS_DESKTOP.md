# Verificar los feeds (`/ventas`, `/alquileres`) — desktop y mobile

Cómo verificar cambios visuales/de layout de los feeds. El resumen: **usar
Playwright headless**, no el preview interno. La primera parte es desktop; al
final está la sección **mobile**, que tiene sus propios gotchas.

## Por qué NO alcanza el preview interno / mirar el dev server

Los feeds arrancan renderizando el **layout mobile** (`useIsDesktop()` empieza
en `false`) y recién pasan a desktop cuando corre un `useEffect` con
`matchMedia`. En la práctica:

- El **preview MCP headless** no hidrata React de forma confiable para estos
  feeds → se queda en mobile (`.vd-cols` / `.ad-cols` nunca aparecen) y no se
  puede inspeccionar el layout desktop.
- **Claude-in-Chrome** funciona pero la pestaña que abre queda en 2º plano
  (`document.visibilityState === 'hidden'`) → Chrome pausa React → tampoco
  hidrata, salvo que el humano traiga esa ventana al frente.

Perseguir esos dos caminos quema tiempo. Playwright evita el problema.

## La vía: Playwright headless (ya instalado en `simon-mvp/`)

1. El dev server debe estar corriendo en `localhost:3000` (`npm run dev`).
2. Escribir el script **dentro de `simon-mvp/`** (para que resuelva
   `playwright` desde su `node_modules`). Ej. `simon-mvp/_verify.mjs`:

```js
import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto('http://localhost:3000/ventas', { waitUntil: 'networkidle' })
await p.waitForSelector('.vd-cols, .ad-cols', { timeout: 15000 }) // espera el layout desktop
// abrir el side sheet (opcional): await p.click('.vlc')  // .alc en alquileres
// medir con getBoundingClientRect y/o sacar screenshot:
const data = await p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null }
  return { sheet: r('.bs-side'), footer: r('.bs-side .bs-sticky-footer') }
})
console.log(JSON.stringify(data, null, 2))
await p.screenshot({ path: 'C:/.../scratchpad/shot.png' })
await b.close()
```

3. Correr: `cd simon-mvp && node _verify.mjs`
4. **Borrar el `.mjs`** al terminar (es temporal, no va al repo).

Una corrida = layout hidratado + medición + screenshot. Eficiente y
reproducible.

## Selectores útiles

- Desktop montado: `.vd-cols` (ventas) / `.ad-cols` (alquileres)
- Cards de lista densa: `.vlc` (ventas) / `.alc` (alquileres)
- Side sheet: `.bs-side` (ventas) / `.bs-side-alq` (alquileres)
- Pills de filtro: `.vfp` / `.afp`
- Filtro por área del mapa: botón `.vd-map-search-btn` / `.ad-map-search-btn` ·
  chip `.vd-area-chip` / `.ad-area-chip` · contador `.vd-count-num2` / `.ad-count-num2`

## Verificar MOBILE

Desde el filtro por área del mapa (3-ago-2026) hay superficie mobile que también
requiere Playwright. Tres gotchas que cuestan medio día descubrir:

1. **No alcanza con achicar el viewport.** Hay que pasar `isMobile: true` +
   `hasTouch: true`, si no el layout mobile no se activa bien:
   ```js
   const p = await b.newPage({
     viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
     deviceScaleFactor: 2,
   })
   ```
2. **Un swipe con `mouse.move` NO arrastra un carrusel** (`overflow-x` + scroll-snap):
   el mouse arrastra el mapa, no el contenedor. Para deslizar el carrusel del mapa
   usar **`mouse.wheel(deltaX, 0)`** (puede hacer falta más de un tick para vencer el
   snap). Con el swipe uno concluye equivocadamente que la sincronización está rota.
3. **El binario de Chromium de la caché puede no coincidir** con la versión del paquete
   `playwright` (error "Executable doesn't exist"). En vez de bajar browsers, pasar el
   que ya está: `chromium.launch({ executablePath: '<...>/ms-playwright/chromium_headless_shell-XXXX/chrome-headless-shell-win64/chrome-headless-shell.exe' })`.

**Selectores mobile:** header `.mfh` · feed TikTok `.mt-feed` · barra inferior
`.mt-bottombar` (botón `.mt-bb-map`) · overlay del mapa `.mt-map-overlay` /
`.alq-mobile-map-overlay` · carrusel `.mt-rail` / `.alq-rail` (cada tarjeta lleva
`data-rail-idx`) · botón puente `.mt-map-apply` / `.alq-map-apply` · chip de área
`.mt-area-chip` / `.alq-area-chip`.

**Cerrar el side sheet** (desktop): NO responde a `Escape`. Usar `.bs-side .bs-close`
en ventas y `.bs-side-alq .bsa-nav-close` en alquileres.

## Límite conocido: tiles satelitales

Playwright headless **no pinta tiles JPEG cross-origin** (las de satélite),
aunque el callejero PNG (OpenStreetMap) sí se ve. Para verificar mapas con
capa satelital hace falta un navegador real. (Por eso el modo satélite se
retiró: además de esto, las fuentes gratuitas — Esri, Google — no eran
viables en la red del usuario; requiere token de Mapbox.)

## Reglas del repo al verificar

- **Nunca** `npm run build` con el dev server corriendo (pelean por el puerto).
- **No** `next/image` en los feeds sin revisar el límite de transformaciones
  de Vercel (usar `<img>`).
