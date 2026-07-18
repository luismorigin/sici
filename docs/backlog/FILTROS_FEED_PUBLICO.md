# Filtros pendientes en feed público

Backlog de filtros pendientes para los feeds públicos `/ventas` y `/alquileres`. Dos orígenes:
- **Promociones desde broker** (§1, §2): filtros ya entregados en modo broker (`/broker/[slug]` y `/broker/[slug]/alquileres`, abril 2026) que faltan des-gatear al público.
- **Filtros nuevos** (§3): features que no existen en broker, propuestas para el feed público directamente.

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

## 3. Filtro por área visible del mapa ("Buscar en esta zona")

**Qué es:** en el layout desktop (vista mixta o mapa), que lo que se ve dentro del encuadre del mapa pase a filtrar la lista de cards — el patrón "Redo search in this area" de Airbnb/Zillow. El usuario se ubica sobre una esquina/media zona y la lista se acota a esos pines.

**Estado:** no implementado. Idea de exploración (17-jul-2026).

**Por qué es barato (client-side puro):**
- El feed carga TODAS las unidades de Equipetrol en el navegador (`/api/ventas` y `/api/alquileres` traen ~el universo activo, sin paginar contra el server). Filtrar por el rectángulo visible es intersectar `latitud`/`longitud` con los límites del mapa — sin tocar BD ni RPC.
- Leaflet ya calcula el encuadre: `map.getBounds()` ya se usa en `simon-mvp/src/components/venta/VentaMap.tsx` (paneo condicional al hover). Falta solo que ese dato "suba" al padre en `moveend`/`zoomend` vía un callback nuevo (`onBoundsChange`).
- Los pines se reconstruyen solos cuando cambia la lista de `properties` → el clustering no se toca.
- Estimado: ~1–1.5 días para dejarlo pulido en ventas + alquileres (gemelos, doble trabajo). Versión mínima (solo filtra las cards, sin tocar el resumen) = ~medio día.

**El costo real no es el mapa, es la coherencia:**
- **Resumen de mercado fiduciario.** El panel derecho (sin selección) muestra mediana, rango y "N comparables". Si se filtra por encuadre, ese resumen debería recalcularse sobre lo visible — y achicar el mapa a media cuadra puede dejar pocos comparables y debilitar el mensaje fiduciario. Es lo que hay que diseñar con cuidado, no el pin. La versión mínima evita esto dejando el resumen quieto.
- **Convivencia con el filtro de zona.** Hoy ya se filtra por microzona (Eq. Centro, Sirari, …) con polígonos. El filtro por encuadre es otra capa geográfica: debe sumarse como refinamiento con un chip "Área del mapa" que se pueda limpiar, no como segunda forma paralela que confunda.

**Recomendación de UX:** patrón **botón "Buscar en esta zona"** (aparece al mover el mapa), NO auto-filtrar-mientras-se-mueve. Da control al usuario y no recalcula lo fiduciario en cada micro-movimiento.

**Por qué no ahora:** en Equipetrol el valor es modesto — es una zona chica y ya hay filtro por microzona; el plus real ("cerca de esta esquina") es acotado. El patrón mapa-como-filtro rinde cuando hay mucha superficie y las zonas fijas no alcanzan.

**Cuándo reactivar:**
- Al abrir la expansión a Zona Norte / más macrozonas (ahí el valor sube fuerte). Ver `docs/proyectos/zona-norte/`.
- Si aparece señal orgánica de que los visitantes quieren acotar por ubicación fina (clarity/hotjar, soporte).
- Alternativa de bajo compromiso: soltar primero la **versión mínima** (botón que solo acota las cards, resumen intacto) como prueba de apetito antes de invertir en la coherencia fiduciaria.

---

## Referencias

- Commit Fase 0 (filtros fuente/franquicia broker): `c9fb067`
- Commit Fase 1 (filtro m² broker): `ff5e438`
- Commit Fase 2 + 2.5 (inputs precio editables broker + slider min alquileres broker): `ba58128`
- Commit Fase 3 (inputs precio editables al público): `026b496`
- Doc broker BACKLOG: `docs/broker/BACKLOG.md`
