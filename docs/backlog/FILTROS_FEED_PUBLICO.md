# Filtros del feed público — pendientes y entregados

Backlog de filtros para los feeds públicos `/ventas` y `/alquileres`. Dos orígenes:
- **Promociones desde broker** (§1, §2 — **pendientes**): filtros ya entregados en modo broker (`/broker/[slug]` y `/broker/[slug]/alquileres`, abril 2026) que faltan des-gatear al público.
- **Filtros nuevos** (§3 — ✅ **entregado 3-ago-2026**): features que no existen en broker, propuestas para el feed público directamente.

**Contexto:** Abel Flores (primer broker founder) pidió en una demo de café tres filtros adicionales: por fuente/franquicia, por superficie m², y inputs editables (no slider) para precio. Se implementaron en 4 fases (commits `c9fb067`, `ff5e438`, `ba58128`, `026b496`) — la Fase 3 ya promovió los inputs editables de precio al feed público. Las dos extensiones siguientes quedaron parqueadas a propósito.

---

## 1. Filtro de superficie m² en feed público

**Estado:** funcionalmente listo en broker. State, persistencia localStorage y filtrado client-side ya están implementados en `simon-mvp/src/pages/ventas.tsx` y `simon-mvp/src/pages/alquileres.tsx`, gateados por la flag `brokerMode`.

**Para activarlo en feed público:**
- En `FilterControls` (ventas) y `FilterOverlay` + `DesktopFilters` (alquileres), des-gatear el bloque "SUPERFICIE (m²)" del check `brokerMode && onAreaMin && onAreaMax`.
- Mover state `areaMin`/`areaMax` de `VentasPage`/`AlquileresPage` fuera del scope broker, con una key de localStorage genérica (no por slug — algo como `ventas_filtro_area`).
- Ajustar `displayedProperties`/`gridProperties`/`feedItems`/`visibleNotMarked` para aplicar el filtro siempre (no solo cuando broker).
- Cambio mecánico ~10-15 líneas en cada archivo. **Cero cambios en API ni BD.**

**Por qué no ahora:** el feed público mobile es estilo TikTok con un overlay full-screen de filtros cuidadosamente balanceado para entrar en una pantalla. Agregar el bloque m² aumenta la altura del overlay y hay que validar que la experiencia mobile no se rompe. Antes de hacerlo conviene tener señal de que los usuarios públicos lo necesitan — los brokers sí lo pidieron por casos concretos (60m² vs 120m² al mismo precio = perfiles distintos), pero el visitante público típico filtra principalmente por presupuesto.

**Cuándo reactivar:**
- Pedido orgánico de visitantes del feed (soporte, encuestas, hotjar/clarity).
- Cuando se haga rebalanceo del overlay TikTok mobile por otra razón y se pueda colar junto.

---

## 2. Filtro de precio mínimo en alquileres público

**Estado:** funcional en broker (sub-fase 2.5 del entregable de abril) — doble slider min/max + 2 inputs editables, filtrado client-side. El público de alquileres hoy solo tiene techo (`precio_mensual_max`), no piso.

**Para promoverlo al feed público:**
- Agregar `precio_mensual_min?: number` a la interface `FiltrosAlquiler` (`simon-mvp/src/lib/supabase.ts`)
- Modificar `simon-mvp/src/pages/api/alquileres.ts` para aceptar el campo y pasarlo al RPC
- Modificar la función SQL `buscar_unidades_alquiler` para aplicar el filtro WHERE
- Migración SQL aplicada en producción
- Frontend: descongelar el slider min y el input min del check `brokerMode`

**Por qué no ahora:** es el único cambio del set pedido por Abel que toca BD/API real (los demás se resolvieron client-side). El público actual está cómodo sin filtro de mínimo — el patrón de búsqueda en alquiler suele ser "no quiero pagar más de X", no "quiero un piso de calidad". Bajo riesgo de implementar pero no justifica el trabajo de migración SQL ahora.

**Cuándo reactivar:**
- Señal concreta de necesidad de visitantes públicos.
- Cuando se toque la RPC `buscar_unidades_alquiler` por otro motivo (ej. agregar índice de calidad, ordenamiento custom) y se pueda colar el parámetro junto.

---

## 3. Filtro por área visible del mapa ("Buscar en esta zona") — ✅ IMPLEMENTADO

**Estado:** ✅ **en producción desde el 3-ago-2026** (PR #62, squash `f750a2a`), en `/ventas` y
`/alquileres` de Equipetrol, **escritorio y celular**. Diseño, decisiones y postmortem:
**`docs/design/PLAN_MAPA_FILTRO_AIRBNB.md`** — leer ese doc, no este, para trabajar sobre la feature.

**Qué es:** lo que se ve dentro del encuadre del mapa filtra la lista — el patrón "Redo search in
this area" de Airbnb/Zillow. Se conserva esta sección como registro del origen (investigación del
17-jul-2026) y porque el checkpoint de diseño la referencia.

### Qué se cumplió de lo previsto en julio

- **Client-side puro, sin tocar BD ni RPC.** El feed ya trae el universo activo al navegador y el
  filtro es intersectar `latitud`/`longitud` con el encuadre. Confirmado.
- **Convivencia con el filtro de microzona** resuelta como se anticipó: el área es un refinamiento
  aditivo con chip **"Área del mapa ×"** limpiable, no una segunda capa geográfica paralela.
- **Botón "Buscar en esta zona"** en escritorio (no auto-filtrar al mover).

### Qué salió distinto de lo previsto — lo útil de esta sección

1. **No era barato: había un bloqueante escondido.** Se dijo *"los pines se reconstruyen solos
   cuando cambia la lista → el clustering no se toca"*. Falso: el mapa se **reconstruía entero** y
   re-encuadraba (`fitBounds`), así que filtrar por el encuadre generaba un **loop de
   retroalimentación**. Hubo que reescribir el ciclo de vida de `VentaMap`/`AlquilerMapMulti` antes
   de empezar (Fase 0, commit `978ac71`) — que de paso cerró la deuda del 24-jun.
2. **El callback no se llamó `onBoundsChange`.** Son dos: `onUserMove` (escritorio, solo movimientos
   del usuario) y `onViewportChange` (celular, además emite el encuadre inicial). Ambos suprimen los
   movimientos programáticos; sin eso el `panTo` del resalte genera otro bucle.
3. **La "versión mínima" costaba MÁS, no menos.** Dejar el resumen fiduciario quieto mientras la
   lista se acota requería bifurcar un memo que hoy comparten. Se descartó: **el resumen sigue al
   área** y con <5 comparables cae al caveat existente ("Pocas publicaciones…"), que es la respuesta
   honesta.
4. **En celular la recomendación de UX se invirtió a propósito:** las mini-tarjetas del carrusel se
   actualizan **solas**, sin botón de confirmar — en el teléfono el resultado tiene que verse al
   instante. El botón sobrevive como puente al feed ("Ver los N de esta zona").
5. **El disparador no fue el previsto.** Se esperaba reactivarlo al abrir Zona Norte; se hizo por un
   dato de tráfico: **85% de los usuarios son mobile** (204 de 240 en 28 días) y no tenían ninguna
   forma de explorar por ubicación.

### Sigue pendiente (relacionado)

- **Dibujar el área de búsqueda a mano alzada** — nunca se implementó, sigue fuera de scope.
- **Llevar el botón a Zona Norte y `/ventas/casas`** — esos feeds heredaron el fix del mapa pero
  **no** reciben el filtro (no tienen el layout split; ver `PLAN_MAPA_FILTRO_AIRBNB.md`).
- **`?bbox` en la URL** para compartir un área — sería el primer filtro con escritura a la URL.

---

## Referencias

- Commit Fase 0 (filtros fuente/franquicia broker): `c9fb067`
- Commit Fase 1 (filtro m² broker): `ff5e438`
- Commit Fase 2 + 2.5 (inputs precio editables broker + slider min alquileres broker): `ba58128`
- Commit Fase 3 (inputs precio editables al público): `026b496`
- Doc broker BACKLOG: `docs/broker/BACKLOG.md`

**§3 — filtro por área del mapa (PR #62, mergeado como `f750a2a`):**
- `978ac71` — Fase 0: el mapa deja de reconstruirse (cierra deuda 24-jun, la heredan todos los feeds)
- `e687ad3` — Fase 1: "Buscar en esta zona" en `/ventas` escritorio
- `417eb19` — Fase 2: espejo en `/alquileres`
- `c5381a5` — Fase 4: carrusel de mini-tarjetas en el mapa del celular
- Diseño y postmortem: `docs/design/PLAN_MAPA_FILTRO_AIRBNB.md`
