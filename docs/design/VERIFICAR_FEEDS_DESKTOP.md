# Verificar los feeds desktop (`/ventas`, `/alquileres`)

Cómo verificar cambios visuales/de layout del **desktop** de los feeds. El
resumen: **usar Playwright headless**, no el preview interno.

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
