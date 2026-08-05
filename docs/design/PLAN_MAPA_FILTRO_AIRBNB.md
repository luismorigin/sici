# Plan — Filtro por área visible del mapa ("Buscar en esta zona") en /ventas y /alquileres

**Estado:** ✅ **COMPLETADO — en producción desde el 3-ago-2026** (PR #62, squash `f750a2a` en `main`).
**Origen:** `docs/backlog/FILTROS_FEED_PUBLICO.md` §3 (investigación 17-jul-2026) + exploración de código 3-ago-2026.
**Commits:** `978ac71` (Fase 0) · `e687ad3` (Fase 1, ventas) · `417eb19` (Fase 2, alquileres) · `c5381a5` (Fase 4, mobile).

Este doc es el **registro canónico** de la feature: decisiones, los dos bugs que costaron encontrar
y lo que quedó fuera. Para trabajar sobre el filtro, empezar acá.

## Decisiones tomadas (con Lucho, 3-ago)

1. **Escritorio — botón "Buscar en esta zona"**: aparece flotante al mover/zoomear el mapa; la lista solo cambia al apretarlo. NO auto-filtrar mientras se mueve.
2. **Celular — al revés, y a propósito**: las mini-tarjetas del carrusel se actualizan **solas** con lo que se ve, sin botón de confirmar; en el teléfono el resultado tiene que verse al instante. El botón queda como puente al feed ("Ver los N de esta zona"). Decidido sobre maqueta, ver Fase 4.
3. **El resumen de mercado del panel derecho SIGUE al área** — se recalcula sobre lo visible. Si quedan <5 comparables, el caveat existente ("Pocas publicaciones…") es la respuesta honesta.
4. **Alcance: /ventas + /alquileres de Equipetrol, escritorio Y celular.** Zona Norte, casas, broker y public-share **no reciben el filtro** — pero sí heredan el fix del mapa (Fase 0) por componente compartido.

> **Nota de proceso:** la v1 arrancó siendo desktop-only. Mobile entró después (Fase 4) al medir el
> tráfico: **85% de los usuarios son mobile** y la feature no les llegaba. El orden fue medir → maqueta
> → aprobar → programar.

## Hallazgos que condicionan el diseño

- **GPS por proyecto master** (`COALESCE(pm.latitud, p.latitud)` en las RPC shadow): 280 props sobre 97 puntos. Un edificio de 22 unidades entra/sale del encuadre de golpe. No invalida nada, pero el contador salta en escalones — declararlo, no esconderlo.
- **Resumen y lista ya comen del mismo array** (`confirmados` en ventas, `displayedProperties` en alquileres) → la coherencia resumen-lista es gratis; la "versión mínima" del backlog costaba MÁS.
- **Asimetría del gemelo alquileres**: el mapa come `mapProperties` y la lista `confirmados` (dos ramas). En ventas ambos comen `confirmados`. Enganchar el bounds-filter en el punto correcto de cada rama.
- **2 sistemas CSS**: botón/chip se escriben 2 veces — `vd-*`/styled-jsx tema oscuro (ventas) y `ad-*`/`alquileres.css` tema claro.
- **La app nunca escribe filtros a la URL** → v1 sin `?bbox` es coherente con el resto. Anotado como futuro.

## Fase 0 — Fix del rebuild del mapa (PREREQUISITO, bloqueante) — ✅ HECHA (3-ago)

> Implementada y verificada con Playwright (viewport 1440×900, ambos feeds): la instancia
> Leaflet sobrevive a pin-click, apertura/cierre del sheet y hovers; el zoom del usuario
> se conserva (caso deuda 24-jun: click en pin con zoom 17 → sigue en 17, antes volvía a 15).
> El "pane distinto" al abrir el sheet de ventas es el mini-mapa del modal (otra instancia), no un rebuild.

Bug: `buildMap` depende de `[properties, onSelectProperty, makeIcon]` (`VentaMap.tsx:196`) → cualquier cambio de `properties` destruye y reconstruye el mapa Leaflet entero + `fitBounds` (`:171-174`). Con un bounds-filter esto genera loop de feedback (filtro → rebuild → fitBounds → nuevo bounds → filtro…). Estaba documentado en `DEUDA_TECNICA.md` como "baja/cosmético" — acá pasó a bloqueante (esa entrada
hoy figura como ✅ RESUELTO, cerrada por esta misma fase).

- En `VentaMap.tsx` y `AlquilerMapMulti.tsx`: separar el efecto de **construcción** (una vez) del de **actualización de marcadores** (limpiar y repoblar el clusterGroup cuando cambia `properties`).
- `fitBounds` condicional: solo en la construcción inicial y en cambio de filtro server-side. NUNCA cuando el cambio de `properties` viene del bounds-filter.
- Respetar los gotchas existentes: el mapa nunca se desmonta (`_leaflet_pos` crash), `zoomAnimation:false` se queda como está.
- Verificar de paso que se cierra la deuda del 24-jun (seleccionar pin ya no resetea zoom) → actualizar `DEUDA_TECNICA.md`.

## Fase 1 — /ventas desktop — ✅ HECHA (3-ago, commit e687ad3)

> Verificada con Playwright. Hallazgo de implementación: además de suprimir los
> movimientos programáticos (fitBounds/panTo/invalidateSize), hay que suprimir el
> `map.stop()` del TEARDOWN — dispara un último moveend en el mapa moribundo y
> marcaba "movimiento de usuario" al cambiar lista↔mapa full. Supresión por
> timestamp, no contador (un setView a la misma vista no dispara moveend).

- **`onBoundsChange?` opcional** en `VentaMap` (emitir en `moveend`/`zoomend`). Solo se pasa desde el path `splitDesktop` — broker no lo recibe.
- Estado `mapBounds` (aplicado) + `pendingBounds` (encuadre actual): cuando difieren, aparece el botón flotante "Buscar en esta zona" sobre el mapa. Click → `mapBounds = pendingBounds`.
- **Memo nuevo `confirmadosEnBounds`** = `confirmados` ∩ rectángulo. De ahí comen: lista `.vd-list`, `panelMarketSummary` y el contador. Guard: si `!splitDesktop`, devolver `confirmados` intacto (mobile/broker inmunes).
- **El mapa sigue recibiendo `confirmados` completo** (sin bounds-filter): los pins fuera del encuadre no se ven igual, y así al alejar el zoom reaparecen — y se corta cualquier posibilidad de loop.
- **Chip "Área del mapa ×"** en la fila del contador (`vd-count-row`), FUERA de `FilterPillsVentas` — las pills se remontan con `filterComponentVersion` y el chip se perdería.
- Subtítulo del panel: agregar "· área del mapa" cuando está activo (hoy dice la zona del filtro y quedaría mintiendo).
- **Interacción con pills**: al cambiar un filtro server-side (refetch), el área del mapa SE MANTIENE y se re-intersecta sobre la nueva lista (el chip sigue visible y limpiable).
- Aplica en modo mixto y en modo mapa full (`viewMode==='map'`); al pasar a `listOnly` el chip se conserva y sigue filtrando.

## Fase 2 — /alquileres desktop (espejo) — ✅ HECHA (3-ago)

> Verificada con Playwright (mismos 8 escenarios que ventas, todos verdes). La
> asimetría de ramas se resolvió con el predicado único `inMapBounds()` a nivel
> módulo, aplicado en `confirmadosEnBounds` (lista) y dentro de
> `panelMarketSummary` (resumen). Gotcha del gemelo: el tile layer de alquileres
> no define `maxZoom` (default 18) vs 20 en ventas — el control de zoom se
> deshabilita antes; no afecta la feature.

- Misma mecánica con `AlquilerMapMulti` + clases `ad-*` en `styles/alquileres.css`, tema claro.
- Resolver la asimetría: el bounds-filter debe afectar `gridProperties`→`confirmados` (lista) Y `panelMarketSummary` (que deriva de `displayedProperties`) de forma coherente — un solo predicado `enBounds()` compartido aplicado en ambas ramas.
- ~~El mapa mobile de alquileres usa `properties` crudo — no tocar, ya está aislado.~~ **Superado por la
  Fase 4:** ese mapa pasó a recibir `displayedProperties` + `onViewportChange` y ahora lleva el carrusel.

## Fase 3 — Verificación (Playwright, según `docs/design/VERIFICAR_FEEDS_DESKTOP.md`) — ✅ HECHA (3-ago)

> Los 7 casos pasaron (repartidos entre las verificaciones de F1/F2 y una pasada
> final): pill con área activa → chip persiste y re-intersecta (341→103 con
> "2 dormitorios"); mobile 390px sin botón/chip en ambos feeds; broker queda
> protegido a nivel código (`onUserMove` solo se pasa desde paths `splitDesktop`).

El preview interno no hidrata el layout desktop → Playwright headless. Casos:
1. Mover mapa → aparece botón; click → lista+resumen+contador acotados, chip visible.
2. Limpiar chip → vuelve la lista completa, botón desaparece hasta el próximo movimiento.
3. Zoom a un edificio (<5 con precio/m²) → caveat "Pocas publicaciones…", sin crash.
4. Cambiar una pill con área activa → refetch + re-intersección, chip persiste.
5. Seleccionar pin → el mapa NO se re-encuadra (fix Fase 0).
6. ~~Mobile (390px): feed TikTok y overlay de mapa idénticos a hoy.~~ ⚠️ **Criterio SUPERADO por la
   Fase 4** — el overlay de mapa mobile ya NO es idéntico: tiene carrusel, botón "Ver los N de esta
   zona" y chip en el header. Quien re-corra esta verificación con el criterio viejo va a reportar
   una regresión que no existe. El criterio vigente es el de la Fase 4.
7. Broker mode: grid clásico intacto, sin botón.

## Feeds que HEREDAN el fix del mapa (sin recibir el botón) — ✅ verificados (3-ago)

`VentaMap`/`AlquilerMapMulti` son componentes únicos: el fix de Fase 0 le llega también a
`/zona-norte/ventas`, `/zona-norte/alquileres` y `/ventas/casas` (que NO tienen layout split
— usan el toggle viejo grid|mapa — y por eso no reciben el botón). Verificados con Playwright:

| Feed | Pins | Zoom sobrevive al click en pin | Rebuild | Botón/chip | Errores consola |
|---|---|---|---|---|---|
| `/zona-norte/ventas` | 40→77 | ✅ 16→16 | ✅ no | ✅ ausentes | ninguno |
| `/zona-norte/alquileres` | 19→59 | ✅ 15→15 | ✅ no | ✅ ausentes | ninguno |
| `/ventas/casas` | 12→50 | ✅ 14→14 | ✅ no | ✅ ausentes | ninguno |

Para ellos el cambio es **solo mejora**: antes seleccionar un pin reseteaba zoom/centro.
Card flotante, highlight del pin y clustering siguen funcionando.

## Fase 4 — MOBILE: carrusel de mini-tarjetas en el mapa — ✅ HECHA (3-ago)

Entró después de medir el tráfico: **204 de 240 usuarios (85%) son mobile**, y la
feature de escritorio no les llegaba. Decisiones de Lucho sobre la maqueta:
**las tarjetas se actualizan solas** (sin botón de confirmar — en el celular el
resultado tiene que verse al instante) y **tarjeta horizontal** (foto al costado,
tapa menos mapa).

- El mapa a pantalla completa pasa de "¿dónde queda esta?" a **explorar la zona**:
  abajo va un carrusel con lo que se ve, sincronizado en ambos sentidos con los
  pines (deslizar → resalta el pin; tocar un pin → desliza a su tarjeta).
- **El puente al feed**: botón "Ver los N de esta zona" → cierra el mapa y deja el
  feed acotado, con el chip "Área del mapa ×" en el header mobile.
- El mapa recibe la lista COMPLETA (nunca la acotada) — misma regla que desktop.
- `onViewportChange` en ambos componentes de mapa: como `onUserMove` pero además
  emite el encuadre inicial (el carrusel necesita saber qué se ve desde que abre).

🔴 **Bug real encontrado y corregido — bucle de retroalimentación:** al principio
`onViewportChange` emitía SIEMPRE, también en movimientos programáticos. El `panTo`
del resalte movía el mapa → nuevo encuadre → nueva lista → nuevo resalte → `panTo`…
El síntoma era el scroll del carrusel reseteándose solo. **Respeta la misma
supresión que `onUserMove`**; el encuadre inicial se emite aparte, explícitamente.

🔴 **Tope declarado (`RAIL_MAX = 30`):** alejando el mapa entraban 372 tarjetas y el
celular no lo aguanta. Se muestran las 30 más cercanas al centro y el contador lo
**declara** ("372 en pantalla · las 30 más cercanas") — truncar en silencio se
leería como "esto es todo lo que hay". El botón sí ofrece el total real del área.

Verificado con Playwright a 390×844 (iPhone) en ambos feeds + regresión desktop.

### Cómo verificar esto de nuevo (3 gotchas que cuestan medio día descubrir)

1. **Un swipe con `mouse.move` NO arrastra el carrusel.** Es un contenedor con `overflow-x`; en
   Chromium headless hay que usar **`mouse.wheel(deltaX, 0)`**. Con el swipe uno concluye
   equivocadamente que la sincronización está rota.
2. **No alcanza con el viewport de 390px**: hace falta `isMobile: true` + `hasTouch: true` para que
   el layout mobile se active de verdad.
3. **El binario de Chromium de la caché puede no coincidir** con la versión del paquete `playwright`
   → pasar `executablePath` explícito en `chromium.launch()`.

## Fuera de scope (anotado, no perdido)

- `?bbox` en la URL (sería el primer filtro con escritura bidireccional a la URL — hoy no existe ninguna).
- **Zona Norte y `/ventas/casas`: NO reciben el botón** (no tienen layout split; `zona-norte/ventas.tsx`
  está ~2.245 líneas atrás del gemelo). Sí heredaron el fix del mapa — ver la tabla de arriba.
- "Dibujar área de búsqueda" a mano alzada.

## Riesgos declarados

- **Granularidad de edificio**: el contador salta de a 8-22 props por pin. Mitigación: contador explícito "N en esta área" + caveat fiduciario existente.
- **`LIMIT 500` de la RPC** (`DEUDA_TECNICA.md:221`): hoy 280/500, pero al sumar ZN el universo client-side podría cortarse en silencio y el filtro geográfico operaría sesgado. No bloquea v1 Equipetrol; revisar antes de extender a ZN.
- Al cutover shadow la granularidad GPS empeora (más props resuelven al GPS del edificio) — esperable, no accionable acá.

## Lo que costó (real, no estimado)

Todo en una sesión del 3-ago-2026: Fase 0 (fix del mapa) → Fase 1 (ventas) → Fase 2 (alquileres) →
verificación → **medición de tráfico → maqueta → Fase 4 (mobile)** → merge y verificación en prod.
La estimación original de julio (~1–1,5 días para desktop) no contemplaba el rebuild del mapa, que
resultó bloqueante, ni la superficie mobile, que se sumó después de mirar los números.
