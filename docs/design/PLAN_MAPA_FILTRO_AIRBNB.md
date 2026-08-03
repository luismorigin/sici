# Plan — Filtro por área visible del mapa ("Buscar en esta zona") en /ventas y /alquileres

**Fecha:** 3-ago-2026 · **Rama:** `worktree-mapa-airbnb-feeds` · **Estado:** plan aprobado, sin implementar
**Origen:** `docs/backlog/FILTROS_FEED_PUBLICO.md` §3 (investigación 17-jul-2026) + exploración de código 3-ago-2026.

## Decisiones tomadas (con Lucho, 3-ago)

1. **Activación: botón "Buscar en esta zona"** — aparece flotante al mover/zoomear el mapa; la lista solo cambia al apretarlo. NO auto-filtrar mientras se mueve.
2. **El resumen de mercado del panel derecho SIGUE al área** — se recalcula sobre lo visible. Si quedan <5 comparables, el caveat existente ("Pocas publicaciones…") es la respuesta honesta.
3. **Alcance v1: /ventas + /alquileres Equipetrol, desktop** (modo mixto y modo mapa full). Zona Norte, casas y broker fuera — aunque heredan el fix del mapa gratis por componente compartido.
4. **Mobile fuera de la v1**, con guard explícito para que no se contamine (hoy ya está aislado por accidente: `feedItems` deriva de `properties`, no de `confirmados`).

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

Bug: `buildMap` depende de `[properties, onSelectProperty, makeIcon]` (`VentaMap.tsx:196`) → cualquier cambio de `properties` destruye y reconstruye el mapa Leaflet entero + `fitBounds` (`:171-174`). Con un bounds-filter esto genera loop de feedback (filtro → rebuild → fitBounds → nuevo bounds → filtro…). Documentado en `DEUDA_TECNICA.md:45-49` como "baja/cosmético" — acá pasa a bloqueante.

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
- El mapa mobile de alquileres usa `properties` crudo (`alquileres.tsx:2558`) — no tocar, ya está aislado.

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
6. Mobile (viewport 390px): feed TikTok y overlay de mapa idénticos a hoy.
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

## Fuera de scope v1 (anotado, no perdido)

- `?bbox` en la URL (sería el primer filtro con escritura bidireccional a la URL — hoy no existe ninguna).
- Zona Norte (`zona-norte/ventas.tsx` está 2.000+ líneas atrás del gemelo) y `/ventas/casas`.
- Mobile (patrón mapa full + lista deslizable = rediseño propio).
- "Dibujar área de búsqueda" a mano alzada.

## Riesgos declarados

- **Granularidad de edificio**: el contador salta de a 8-22 props por pin. Mitigación: contador explícito "N en esta área" + caveat fiduciario existente.
- **`LIMIT 500` de la RPC** (`DEUDA_TECNICA.md:221`): hoy 280/500, pero al sumar ZN el universo client-side podría cortarse en silencio y el filtro geográfico operaría sesgado. No bloquea v1 Equipetrol; revisar antes de extender a ZN.
- Al cutover shadow la granularidad GPS empeora (más props resuelven al GPS del edificio) — esperable, no accionable acá.

## Estimación

Fase 0 ~medio día · Fase 1 ~1 día · Fase 2 ~medio-1 día (incluye verificación). Total **~2–2,5 días**.
