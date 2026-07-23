# Rediseño mobile de /mercado — de documento SEO a app de indicadores

> **Estado: ✅ EN PRODUCCIÓN — PR #36 mergeado el 22-jul-2026.** Verificado en
> `simonbo.com/mercado/equipetrol/ventas` y `/alquileres`: drill-downs vivos, desborde 0px,
> schema intacto, 0 tablas viejas. Las 4 fases de abajo están hechas; quedan solo los dos
> pendientes del final (Rich Results Test + reemplazar el placeholder de la serie de alquiler
> cuando el snapshot shadow madure, ~fin de agosto). Este doc queda como registro de las
> decisiones tomadas y su porqué.
> Mockup interactivo (datos reales del 22-jul): https://claude.ai/code/artifact/bea086d3-bf95-4cd7-8fd3-84312982c51d
> Origen: el founder quiso mostrarle `/mercado/equipetrol/ventas` a un amigo en el celular y
> *"le pareció imposible sacar un dato rápido"*. Diagnóstico: las páginas estaban construidas como
> **artículos para Google** (Schema.org Article/Dataset/FAQPage) — el humano quedó en segundo plano.
> Además las tablas desbordaban el viewport (+41px ventas, +71px alquileres → franja blanca y
> scroll lateral de toda la página; el hub `/mercado/equipetrol` está bien).

---

## El principio de diseño

**El resumen primero, el detalle bajo demanda.** Un número por bloque, su dirección, y la lectura
en lenguaje humano. El drill-down (tocar para expandir) reemplaza a las tablas de 5 columnas.
Los números van en color pleno y ≥13px; solo las explicaciones van atenuadas — nada por debajo
del contraste AA en mobile.

### Decisiones YA tomadas en el mockup (con su porqué — no reabrir sin nueva data)

| Decisión | Por qué |
|---|---|
| **SIN sección "pozo vs entrega"** | El pozo real se vende por canales internos de las desarrolladoras, NO se publica en portales → la muestra es un recorte sesgado y no hay comparación honesta posible. Memoria `preventa_pozo_sesgo_portales`. Además: deltas de 1-2% en medianas con n<50 = ruido — se reporta "sin diferencia detectable", nunca "+1%" |
| **$/m² visible en la fila colapsada** (no escondido en el drill) | Es EL dato comparable entre deptos de distinto tamaño |
| **Dos rangos en el drill**: precio total Y $/m² (p25–p75 + mediana) | El rango de precio solo no responde "¿es caro para lo que es, o solo es grande?" |
| **Split amoblado DENTRO de cada tipología de alquiler** (nunca global) | Paradoja de composición medida: global el amoblado parece más barato (se concentra en monoambientes); por tipología es SIEMPRE más caro. La comparación global miente. Se compara "amoblado vs sin declarar" (el negativo casi no se declara — doctrina del positivo) |
| **Serie de alquiler = placeholder honesto** hasta ~fin de agosto | La serie vieja es USD régimen viejo con universo de ~35 avisos/mes (mostrarla = engañar); la confiable (Bs, con corte amoblado) arrancó el 21-jul con el snapshot shadow y necesita ~30 días |
| **Serie de venta = la reexpresada** (migs 287-289), con toggle USD / Bs / Dólar | Nunca un % de variación sin declarar la moneda (regla 12 de CLAUDE.md). Depende de la tarea mensual `reconstruir-serie-precios.mjs` |
| **Gate n≥5** en todo segmento | 4 dorm (n=2) o 3D pozo (n=3) no publican mediana — se dice por qué |
| **Toggle Comprar/Alquilar** | Como cualquier app de finanzas; en implementación navega entre URLs (ver Fase 0) |
| **Cada card de tipología termina en "Ver los N →"** | Deep-link al feed con el filtro puesto (`/ventas?dormitorios=1`) — la página de mercado deja de ser callejón sin salida |

## Fases

### Fase 0 · Decisión de URLs (founder, 5 min) — ✅ HECHO
Mantener las **3 URLs actuales** (`/mercado/equipetrol` + `/ventas` + `/alquileres`) — son activos
SEO indexados. El toggle Comprar/Alquilar **navega entre URLs** (no es estado client-side): cada
página queda deep-linkeable y el SEO intacto. El hub no se toca (no tiene el problema).

### Fase 1 · Capa de datos (~medio día) — ✅ HECHO
Todo existe ya — **no requiere migraciones**:
- Tipologías con p25/p75 de precio y de $/m²: `v_mercado_venta_shadow` / `v_mercado_alquiler_shadow`
  (percentiles en SQL, como hace `lib/mercado-alquiler-data.ts` hoy)
- Split amoblado: columna `amoblado` de la vista de alquiler (gate n≥5 por celda)
- Serie venta: `market_price_reexpresado` (USD + Bs + TC por fecha)
- TC del día: `/api/tc-actual` (ya existe, con fallback)
- ISR 6h como el resto de las superficies

### Fase 2 · UI (~1-1,5 días) — ✅ HECHO
Componentes compartidos entre las dos páginas desde el día uno (lección de los feeds: ventas y
alquileres quedaron como gemelos con sistemas CSS distintos y cada pieza se toca 2 veces —
patrón a seguir: `components/feed/FeedDesktopNav.tsx`, el único realmente compartido):
`components/mercado/` (implementados): `TipologiaDrill`, `ZonasBars`, `Lectura`, `SerieInteractiva`
(toggle moneda + tabla gemela AEO), `CtaSticky`, `FaqAccordion`. Tema por CSS custom props `--mx-*`
que define cada página (venta oscura / alquiler arena) — un solo código para las dos. Los KPIs y el
hero quedaron inline en cada página (styled-jsx) por ser específicos de la operación. **Al morir las
tablas murió el desborde horizontal** (el bug de la franja blanca se arregló gratis — era la única
causa). Se eliminaron 6 componentes muertos del diseño pre-21-jul (EvolucionSerie + 5).

### Fase 3 · Preservar el SEO (~2 h) — ✅ HECHO
El marcado Schema.org (Article/Dataset/FAQPage) **se mantiene en el head** — Google lo lee igual
con la UI nueva. El texto de las FAQs pasa a un acordeón al pie (colapsado para el humano,
presente para el crawler). Mismas URLs, mismos canonical/meta. Verificar con Rich Results Test
post-deploy.

### Fase 4 · Medición + verificación (~2 h) — ✅ HECHO (23 checks Playwright)
- Eventos: `mercado_view {operacion}` + `mercado_drill {operacion, tipologia}` vía `trackEvent`
  (los CTA al feed ya caen en el embudo canónico como `feed_view` con deep-link)
- Verificación Playwright mobile (el preview interno no hidrata React): desborde 0 en 280→430px,
  drill-downs funcionan, contraste de los números
- Deploy directo (sin dark launch: las páginas tienen ~9 sesiones/28d — el riesgo es mínimo y
  un flag sería sobre-ingeniería)

**Total: ~2-3 días — completado en la sesión del 22-jul.**

## Qué NO hacer
- ❌ Re-agregar pozo vs entrega "cuando haya más data" de portales — el sesgo es estructural, no de tamaño de muestra
- ❌ Ejes truncados para que diferencias chicas "se vean" — cuando la diferencia es invisible, el gráfico se elimina, no se agranda
- ❌ Un dashboard configurable / filtros por zona+tipología+moneda cruzados — el mockup ya decide la jerarquía; más knobs = menos claridad
- ❌ Tocar el hub `/mercado/equipetrol` (está bien) o el desktop (el problema reportado es mobile; desktop hereda gratis el layout de 412px centrado)
