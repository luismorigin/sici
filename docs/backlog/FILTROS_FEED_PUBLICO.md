# Filtros pendientes en feed público

Pendientes de extender los feeds públicos `/ventas` y `/alquileres` con filtros que ya se entregaron en modo broker (`/broker/[slug]` y `/broker/[slug]/alquileres`) durante abril 2026.

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

## Referencias

- Commit Fase 0 (filtros fuente/franquicia broker): `c9fb067`
- Commit Fase 1 (filtro m² broker): `ff5e438`
- Commit Fase 2 + 2.5 (inputs precio editables broker + slider min alquileres broker): `ba58128`
- Commit Fase 3 (inputs precio editables al público): `026b496`
- Doc broker BACKLOG: `docs/broker/BACKLOG.md`
