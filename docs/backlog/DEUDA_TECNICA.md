# Deuda Técnica — SICI

> Extraído de CLAUDE.md el 27 Feb 2026. Actualizado 19 Jun 2026.

## Módulo TC dinámico — DEPRECADO (19 Jun 2026)

**Qué era:** cron `recalcular-precios-diario` (7:05 AM) + `recalcular_precios_batch_nocturno`/`recalcular_precio_propiedad` que cacheaban `precio_usd_actualizado` cuando cambiaba el TC.

**Por qué se deprecó:** superado por `precio_normalizado()` que normaliza EN VIVO en cada consulta del feed. Verificado que NINGÚN consumidor final usa `precio_usd_actualizado` (ni RPCs del feed, ni snapshots de absorción, ni `buscar_acm`, ni estudio de mercado, ni frontend salvo setearlo a null al editar). Cron desagendado + funciones marcadas DEPRECADO via COMMENT.

**Pendiente (opcional, baja):** las funciones siguen en la BD (huérfanas, inertes). Borrarlas formalmente algún día. Doc actualizada: `sql/functions/tc_dinamico/README.md` + `docs/arquitectura/TIPO_CAMBIO_SICI.md` §11.7. Memoria: `project_bug_mig174_tc_paralelo_n8n_incompleta`.

## config_global — limpieza de claves TC fósiles (19 Jun 2026)

La migración 174 (7-mar) había **desactivado** las claves MAYÚSCULAS duplicadas (`TIPO_CAMBIO_OFICIAL`/`TIPO_CAMBIO_PARALELO`) pero NO las borró ni completó el paso n8n. El 19-jun se **borraron** (solo quedan las minúsculas activas: `tipo_cambio_oficial`=6.96, `tipo_cambio_paralelo`=9.88 dinámico). El `flujo_b_processing_v3.0` de producción ya estaba arreglado (usa minúsculas) — el archivo del repo estaba stale y se sincronizó. **Lección: el repo n8n ≠ producción; verificar contra el export real del founder.**

## Paralelo en alquiler — IMPLEMENTADO (19 Jun 2026), causa raíz pendiente

**Hecho:** `v_mercado_alquiler` ahora deriva `precio_mensual = bob / CASE WHEN solo_tc_paralelo THEN <tc_paralelo> ELSE 6.96 END` (ver ADR-012 ZN + `TIPO_CAMBIO_SICI.md`). Permite Bs-real + USD-correcto en alquileres cotizados al paralelo. Tag `solo_tc_paralelo` manual (1 prop hoy: 1970).

**Pendiente (baja):** que el LLM de enrichment de alquiler **detecte y setee `solo_tc_paralelo`** automáticamente (como ya detecta paralelo en venta), para no taggear a mano.

## `tipo_cambio_detectado='paralelo'` espurio en alquiler — limpiado, MONITOREAR (19 Jun 2026)

240 alquileres tenían `tipo_cambio_detectado='paralelo'` espurio (heredado de migraciones de normalización de VENTA — 059/168/175 — que corrieron sobre props `moneda='BOB'` sin distinguir operación). Inocuo (la vista de alquiler no lee ese campo), pero se limpió a NULL (alineado con la detección real del LLM). **Monitorear ~1 semana:** si vuelven alquileres en `'paralelo'`, hay un setter activo no hallado (improbable por la evidencia — ninguna función/workflow/trigger de alquiler lo setea). NO limpiar de nuevo sin hallar la causa.

## Discovery Remax casas/terrenos — fix `land_m2` aplicado + parking inexistente (19 Jun 2026)

**Hecho (n8n prod):** nodo "Extraer Propiedades" de `discovery_remax_casas_terrenos` — `land_area_m`→`land_m2` (campo real de la API `/api/search`, confirmado por la sonda con 94% de área en terrenos reales) + `.toLowerCase()` en `subtype_property.name` (la API devuelve "Casa"/"Terreno", el pipeline filtra minúscula) + `estacionamientos: null` (la API de Remax **NO expone parking** — `number_parking` era campo fantasma; el área del terreno tampoco está en el HTML del detalle, solo en la API de búsqueda).

**Impacto:** 0 hoy en Equipetrol (Remax no tiene terrenos reales ahí — los pocos "Terreno" son deptos mal subtipados). **Crítico al extender el pipeline a Urubó** (~179 terrenos Remax). Ver memoria `project_sonda_suelo_zn_urubo_jun2026`.

## Merge y amenities — RIESGO ACEPTADO (9 Mar 2026)

**Problema original:** `merge_discovery_enrichment()` reconstruye `datos_json->'amenities'` desde enrichment cada noche, sobrescribiendo ediciones manuales.

**Mitigación actual (suficiente):**
1. Trigger `proteger_amenities_candados()` (migración 116): si hay candado `amenities` o `equipamiento`, restaura valor previo post-merge
2. `AmenitiesEditor.tsx` auto-activa candados al editar → toda edición manual queda protegida automáticamente

**Análisis (9 Mar 2026):**
- 367 props venta activas
- 249 (68%) con candado amenities/equipamiento → protegidas por trigger
- 118 (32%) sin candado → nunca fueron editadas manualmente, enrichment produce los mismos datos cada noche
- Sin enrichment nuevo → merge escribe lo mismo (sin impacto)
- Con enrichment nuevo → merge escribe datos frescos (comportamiento deseado)

**Conclusión:** El único caso de pérdida sería editar amenities sin candado, pero el admin auto-activa candados. El riesgo es teórico, no práctico. No requiere cambios adicionales.

## Refactor extractores n8n — PENDIENTE (futuro)

**Problema:** `MEDIA_ZONA_USD_M2` y bounding boxes están hardcodeados en extractores C21/Remax.

**Solución ideal:**
- `MEDIA_ZONA_USD_M2` debería leerse de BD (snapshots o query) en vez de estar hardcodeado
- Bounding boxes de `zona_validada_gps` deberían reemplazarse por `get_zona_by_gps()`

**Estado:** Valores actualizados manualmente (9 Mar 2026). Funcional pero requiere actualización manual cuando cambian promedios de zona.

## Discovery Remax — paginación fija (parche 8→9 aplicado 24 May 2026; DINÁMICA PENDIENTE)

**Estado:** parche aplicado — `TOTAL_PAGES` subido de 8 a 9 en el nodo "Generar URLs Remax" (n8n prod + repo). La página 9 ya se captura. **El fix de fondo sigue abierto:** 9 es otro número fijo; si la zona vuelve a crecer (10+ páginas) reaparece el mismo problema. La solución real es paginación dinámica (abajo). Riesgo de no hacerlo: bajo mientras la zona no crezca; volver a subir el número es un parche de 1 línea.

**Problema (original):** el discovery Remax (`flujo_a_discovery_remax`) usaba `TOTAL_PAGES = 8` fijo cuando la zona `equipetrolnoroeste` ya tenía **9 páginas** (`last_page=9`). La página no capturada hacía caer props vivas rotativamente cada noche → el verificador las marca ausentes → `inactivo_confirmed` → congeladas vivas (falsos positivos). Caso confirmado: id=1310 (reactivada manual 21-may).

**Evidencia:** API `last_page=9` vs discovery `TOTAL_PAGES=8`. SICI tiene 187 `inactivo_confirmed` de venta Remax (vs 103 activas) — una fracción son falsos positivos por esta causa.

**Fix:** paginación dinámica — leer `last_page` de `page=1` e iterar `1..last_page` (con fallback a mínimo seguro). Verificado que `last_page` es confiable y `page>last_page` devuelve `[]` limpio — NO hay bug de last_page; se había descartado solo por simplicidad/performance (ver `docs/extractores/RESEARCH_REMAX_API.md §4.1`). Parche alternativo: subir `TOTAL_PAGES` a 12. Alinea con la arquitectura "fetch amplio + filtro polígono GPS" del proyecto Zona Norte (`docs/proyectos/zona-norte/`).

**Caveat:** el fix mejora la captura futura pero NO reactiva las ya congeladas (venta sí reactiva al recapturar; alquiler es terminal). Cambio en workflow n8n (producción — validar en n8n UI, el repo puede diferir). Verificación de vida correcta: slug exacto + operación en API, no HTTP 200 (`RESEARCH_REMAX_API §23`).

## Discovery pisa correcciones del LLM (dormitorios) — AUDITADO Y CERRADO (24 May 2026)

**Estado:** auditoría completa verificando contra la **descripción cruda del aviso** (`datos_json_enrichment->>'descripcion'`, disponible en venta para los 3 portales — no solo alquiler). Las props detectadas se corrigieron y blindaron con candado; barrido global de cierre dio gap ≈ 1 prop (ya corregida). **No se justifica tocar el merge core.** Detalle: memoria `audit_overrides_llm_dorms.md`.

**Cómo funciona el flujo realmente (lo que la auditoría aclaró):**
- `registrar_discovery` pisa `dormitorios` con `COALESCE(portal, actual)` solo si NO hay candado, y dispara re-merge solo si detecta cambio. Las props `completado` sin cambio NO se re-mergean → su valor refleja la lógica del merge de su última fecha de merge (puede ser vieja). Por eso un cambio en el merge NO es retroactivo.
- El merge ya resuelve los monoambientes nuevos vía "LLM-gana sobre discovery" (v2.4.0) → quedan `fuente_dormitorios=llm`. El guardrail mono (mig 246) es backup y mira `url`+`datos_json_discovery`, NO la cruda — importa poco porque el LLM gana antes.
- El **candado** es la única protección total (discovery y merge lo respetan). Es el mecanismo correcto para los casos detectados.

**Por qué NO se toca el merge core:** el gap es ~0 y modificar `merge_discovery_enrichment`/`registrar_discovery` (core) es alto riesgo (regla 7). El "LLM-gana" cubre los nuevos; los viejos quedaron candados.

**⚠ "El LLM tiene razón" NO es universal.** Para dorms el LLM→0 es mixto: a veces monoambiente real (acierta), a veces 1-dorm que alucina por "studio"/"smart studio". La **cruda es el único árbitro**. Para `estado_construccion`/`tipo_cambio_detectado` el LLM suele leer el aviso viejo → la columna del founder es la verdad y `existing_protected` es by-design. Distinguir por campo. Ver `CALIDAD_DATOS_BACKLOG.md` ("Coherencia texto↔dato").

**Pendiente menor (opcional):** detección continua vía `/audit-feed-ventas-semanal` (+ alquileres) — check read-only de divergencias cruda↔columna, sin tocar producción.

## Extractor Remax no captura el `title` del aviso — FIX DE RIESGO BAJO, SIN IMPLEMENTAR (decisión 24 May 2026: dejar anotado)

**Decisión:** documentado pero NO aplicado. El gap es chico (~1 prop) y el founder prefiere no tocar los extractores (archivos largos, frágiles) sin necesidad real. Queda listo para aplicar si algún día conviene.

**Síntoma:** props cuyo **título** del aviso trae la tipología pero la **descripción** no. Caso testigo: prop 1778 (SÖLO Industrial Apartments, 33,57 m²). El título del portal dice "DEPARTAMENTO EN VENTA EQUIPETROL (Monoambiente)" pero la descripción es marketing genérico del proyecto, sin la palabra. Resultado: monoambiente catalogado como 1 dorm.

**Por qué se escapa a todo:** Remax no tiene tipo "monoambiente" en su taxonomía → el API de búsqueda da `number_bedrooms=1` (→ columna=1); el LLM recibe solo la descripción (sin la palabra) → alucina 1 con confianza alta; el guardrail mono del merge mira `url`+`datos_json_discovery`, no el título. La única fuente con la verdad es el `title` del data-page, y **el extractor lo descarta**. (No es punto ciego inevitable: el dato está en la fuente.)

**El fix (1 línea por extractor, aditivo):** en `flujo_b_processing_v3.0`, nodo "Extractor Remax v1.9", dentro de `mapearRemax`, junto a `data.descripcion = descripcion;` agregar:
```js
data.titulo_anuncio = listing.title || "";
```
El LLM ya está cableado para usarlo: `Build Prompt v4.0` (flujo_enrichment_llm_venta) ya lee `enrichment.titulo_anuncio` e inserta "TÍTULO DEL ANUNCIO" en el prompt (hoy sale "(no disponible)"). Con el título poblado, el LLM detecta "(Monoambiente)" → dorms=0 confianza alta → el merge ("LLM-gana sobre discovery") lo aplica sobre el 1 del portal. Análogo en "Extractor Century21 v16.5" con el `encabezado` (menos urgente: en C21 la descripción cruda ya suele empezar con el encabezado).

**Por qué es riesgo bajo (verificado, no asumido):**
- **Aditivo:** agrega una key nueva, lee `listing.title` (ya usado en `extraerNombreEdificio`), no toca ninguna variable ni flujo existente.
- **No colisiona:** `titulo_anuncio`/`data.title`/`.titulo` no aparecen en ningún nodo del workflow → no pisa nada.
- **Mismo riel que un campo que ya funciona:** el nodo "Registrar Enrichment" pasa `JSON.stringify($json)` (el objeto entero, sin mapeo ni whitelist) y `registrar_enrichment` hace `datos_json_enrichment = p_data` (guarda todo). `titulo_anuncio` viaja igual que `descripcion`, que ya llega a la BD.
- **Validado empíricamente:** test A/B/C con Haiku 4.5 (temp 0, prompt real, 3/3 determinista) — sin título→1 (bug), con título "(Monoambiente)"→0 (fix), título neutro→1 (control: no sobre-corrige). Script: `scripts/llm-enrichment/test-titulo-fix.js`.

**Cómo aplicarlo con red de seguridad (si se decide):** duplicar el workflow en n8n → hacer el cambio en la copia → ejecutar el nodo Extractor aislado con input pinneado y confirmar que el output es idéntico salvo el campo nuevo → recién entonces aplicar al workflow real → sincronizar el JSON del repo. Rollback = borrar la línea (cero migración). **No retroactivo:** solo corrige props futuras; las ya `completado` (hermanas de SÖLO, etc.) requieren re-enrichment forzado o corrección manual + candado.

**Referencia:** memoria `audit_overrides_llm_dorms.md`.

## Funciones SQL con filtros de mercado — REVISADO (23 Mar 2026)

**Contexto:** Migración 193 creó vistas canónicas `v_mercado_venta` y `v_mercado_alquiler`. Auditoría de 60 funciones encontró 3 con filtros incompletos. Re-investigado 23 Mar 2026.

**`analisis_mercado_fiduciario` — CÓDIGO MUERTO (eliminar del backlog)**
- Ninguna página la llama. `obtenerAnalisisMercado()` existe en `supabase.ts` pero ningún componente lo importa
- Las páginas del funnel premium (`resultados-v2`) usan `buscar_unidades_reales`, no esta función
- Deprecar cuando se haga limpieza de funciones SQL

**`buscar_unidades_reales` — CORREGIDO y DESPLEGADO**
- Migración 198: status `IN ('completado', 'actualizado')` + `precio_normalizado() > 0` en WHERE, 4 CTEs y 2 subqueries

**`buscar_unidades_alquiler` — CORREGIDO y DESPLEGADO**
- Migración 196: `precio_mensual_bob IS NOT NULL` → `precio_mensual_usd > 0` (alinea con `v_mercado_alquiler`)

**Funciones sin uso en producción (código muerto):**
- `buscar_unidades_con_amenities` — nunca integrada al frontend (migración 019)
- `generar_razon_fiduciaria` — sin llamadas desde frontend/API
- `explicar_precio` — sin llamadas desde frontend/API
- `analisis_mercado_fiduciario` — sin llamadas desde frontend/API (ver arriba)

## Snapshots absorción — CORREGIDO (13 Abr 2026)

**Problemas resueltos:**
1. ~~Verificador excluía C21~~ → v5.1 eliminó `AND fuente = 'remax'` (131 props confirmadas)
2. ~~Absorción histórica corrupta~~ → Migración 199 backfill (40 fechas recalculadas, absorción 2 dorms 0-12% → 20-31%)
3. ~~Snapshot global sin granularidad por zona~~ → Migración 200 agrega `zona` + `venta_pending_30d` (~26 filas/día)
4. ~~Snapshot sin filtros canónicos~~ → Fix 24 Mar: duplicado_de, es_multiproyecto, tipo_propiedad_original, zona NOT NULL, 300d cutoff
5. ~~Market Pulse sin absorción~~ → Dashboard integra KPI card, tabla por zona, 2 charts serie temporal
6. ~~Asimetría filtros inventario/absorbidas~~ → Migración 211 (13 Abr): quitar 300d de inventario, alinear filtros en absorbidas, `primera_ausencia_at IS NOT NULL`, mediana en $/m², columnas nuevas (absorbidas_entrega/preventa, roi_amoblado/no_amoblado). filter_version=3. Backfill v2 absorbidas. Doc canónico: `docs/canonical/ABSORCION_LIMITACIONES.md`

**Deuda residual:**
- `MEDIA_ZONA_USD_M2` en extractores n8n sigue hardcodeado — podría leerse de snapshots por zona ahora que existen
- ~~`market.tsx` usa `MICROZONA_DISPLAY` con nombres legacy~~ **RESUELTO 24 Mar 2026:** refactorizado a `displayZona()` de `lib/zonas.ts`, query usa `zona` en vez de `microzona`, eliminados `MICROZONA_DISPLAY`, `getZonaLabel`, `ZONA_DISPLAY_TO_SNAPSHOT`
- `/admin/market` (Market Pulse Dashboard) consume snapshots pero no filtra por `filter_version` — debería mostrar solo v3 cuando tenga suficiente historia

## Herramientas de estudio de mercado — PENDIENTE (13 Abr 2026)

**Contexto:** Simon Advisor (`../simon-advisor/`) tiene funciones de análisis (scoring, escasez, yield, deep dive) pero son TypeScript acopladas a su app. SICI necesita sus propias herramientas SQL para generar estudios de mercado para desarrolladoras, reutilizables entre clientes.

**Funciones propuestas (SQL en `sql/functions/query_layer/`):**
- `estudio_panorama_mercado(zona?)` — inventario, precios, medianas por zona+dorms
- `estudio_competidores(zona, id_proyecto_master)` — seguimiento de proyectos con unidades activas, cambio vs período anterior
- `estudio_posicion_proyecto(id_proyecto_master)` — posición vs mercado, escasez, score (lógica de Advisor adaptada)
- `estudio_yield_segmentado(zona?, dorms?)` — yield por amoblado/no amoblado con n mínimo
- `estudio_rotacion_observada(zona?, dias?)` — props que salieron del mercado verificadas una por una, sin tasa inflada

**Diseño:** parámetros genéricos (id_proyecto_master, zona) — sirven para cualquier desarrolladora, no solo Condado. Construís las funciones una vez, cambiás el ID del proyecto y tenés el estudio.

**Referencia de lógica:** `simon-advisor/src/lib/tool-executor.ts` — Investment Score (6 factores ponderados), Market Position (segmentado preventa/entrega), Scarcity (4 niveles), Yield (mediana, ajuste preventa).

**Prioridad: ALTA.** Se construyen con el estudio de Condado abril como primer caso real (Opción B: módulo TypeScript en `scripts/estudio-mercado/`).

**Roadmap:**
1. **Fase 1 (ahora):** Módulo TS en SICI que encapsula las herramientas + genera HTML del estudio. Cada sección del HTML = una herramienta reutilizable. Primer cliente: Condado VI.
2. **Fase 2 (backlog):** Mini-advisor para desarrolladoras. Capa conversacional (Claude API) sobre las herramientas de Fase 1. Interfaz orientada al desarrollador/promotor, no al inversionista. Potencial producto API vendible a desarrolladoras.

## Refactor ventas /ventas — Deuda del Bloque 1 (18 Mar 2026)

Ítems encontrados durante el Bloque 1 del refactor ventas (`docs/refactor/VENTAS_SIMPLIFICADO.md`).

| # | Ítem | Dónde | Severidad | Cuándo resolver |
|---|---|---|---|---|
| 1 | `plan_pagos_cuotas: unknown \| null` en `RawUnidadSimpleRow` y `UnidadVenta` — debería ser `Record<string, unknown>[] \| null` | `types/db-responses.ts`, `lib/supabase.ts` | Baja | Cuando se use en UI |
| 2 | `LIMIT 500` en `buscar_unidades_simple()` — si el catálogo supera 500 props activas, corta sin aviso | `sql/functions/query_layer/buscar_unidades_simple.sql` | Media | Cuando ventas pase ~400 props |
| 3 | Spotlight en `api/ventas.ts` hace query completa (`limite: 500`) para buscar un solo ID — ineficiente | `pages/api/ventas.ts` | Baja | Bloque 5 (compartir/spotlight) |
| 4 | `CardPlaceholder` ya tiene foto, precio, specs y badges funcionales — en Bloque 3 iterar sobre esta base, no reescribir desde cero | `pages/ventas.tsx` | Info | Bloque 3 |
| 5 | `fotos_count` badge se renderiza fuera de la imagen + `object-fit` no adapta bien fotos de distintos portales (collages, watermarks, aspect ratios verticales) | `pages/ventas.tsx` | Media | Bloque 3 |

## Simon Brand — PENDIENTES (24 Mar 2026)

Tokens + landing mergeados a main. Plan completo en `docs/simon/SIMON_BRAND_TOKENS_PLAN.md`.
Source of truth de marca: repo `simon-brand` (github.com/luismorigin/simon-brand).

**Completado:** tokens (`48fd79d`), landing v1 migrada (`d985619`), landing v2 desde mockup (`c83e91e`), **landing v1.4** (`90d603f`), **alquileres v1.4** (`198027e`) — arena/negro/salvia completo, 0 refs legacy, hydration fix, doc UI decisions.
**Bloqueado:** variación trimestral por zona — snapshots necesitan ≥30d historia (~24 Abr).

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 1 | Actualizar `SIMON_BRAND_GUIDELINES.md` | **SIGUIENTE** | Reemplazar paleta vieja con v1.4 |
| 2 | ~~Migrar `/alquileres` a tokens `s-*`~~ | HECHO | `198027e` — doc: `docs/simon/ALQUILERES_UI_DECISIONS.md` |
| 3 | Migrar `/ventas` a tokens `s-*` | BAJA | Visualmente ya usa paleta correcta (negro/arena/salvia). Solo falta reemplazar 79 hex hardcodeados → tokens. Cambio cosmético de mantenibilidad, cero cambio visual. Hacer oportunista cuando se toque `/ventas` por otra razón |
| 4 | ~~Migrar `/mercado` a tokens `s-*`~~ | DESCARTADO | `/mercado` será rediseñada para ser AI-driven. Migrar tokens ahora es trabajo que se tira en el rediseño |
| 5 | Eliminar `premium-theme.ts` | PENDIENTE | Solo cuando no queden imports |
| 6 | Limpiar hex hardcodeados en JSX | PENDIENTE | `bg-[#0a0a0a]` → `bg-s-negro`, etc. Gradual |
| 11 | Subir docs actualizados al Knowledge de Claude.ai | PENDIENTE | `simon-decisions.md` + `simon-comunicacion.md` + `simon-design-tokens.ts` al proyecto "Simon Brand System" |

## Alquileres TBT / code-splitting — NO URGENTE (8 Abr 2026)

**Contexto:** Lighthouse mobile pasó de 53 → 92 con el refactor de performance (`b0dd372`). TBT quedó en ~350ms (13 long tasks). Score actual es 92 — excelente.

**Causa del TBT:** `alquileres.tsx` sigue siendo ~2,900 líneas en un solo componente. Hydration de React parsea todo de golpe. GA4 + Meta Pixel agregan trabajo al main thread.

**Solución potencial:**
- Code-split componentes pesados (BottomSheet, FilterOverlay, DesktopFilters) con `next/dynamic`
- O migrar a App Router con streaming SSR (React Server Components)

**Prioridad: BAJA.** Score 92 es excelente para Core Web Vitals. El TBT no afecta UX perceptible. Solo revisitar si el score baja de 80 o si se agregan features pesados a la página.

## Pin first card hardcodeado — CONSCIENTE (8 Abr 2026)

**Contexto:** Experimento CRO top-of-funnel. La primera card del feed `/alquileres` está pinneada a IDs `[1350, 1349, 1333]` con fallback en cascada (`alquileres.tsx`, constante `PINNED_FIRST_IDS`).

**Implicaciones:**
1. **Hardcodeado**: Si los 3 IDs se dan de baja, el feed vuelve al sort natural (sin efecto negativo)
2. **Flash en carga**: ISR renderiza la primera prop por recientes → deferred fetch carga 123 props → pin reordena → scroll reset. Causa flash visual (~300ms) y +0.3s en LCP (1.2s → 1.5s). Sigue dentro del umbral verde de Core Web Vitals (<2.5s)
3. ~~Preload mismatch~~ — resuelto 24 abr 2026 (commits `c8a0f17` + `c14f764`): el `<link rel="preload">` fue removido en ambos feeds al cerrar la Capa 1 de `IMAGE_OPTIMIZATION_VERCEL.md`. Ya no hay mismatch, y los preconnects en `_document.tsx:11-13` cubren DNS/TLS al CDN origen

**Solución futura (si escala):**
- Mover IDs pinneados a un campo `pin_feed` en admin o tabla de config
- Hacer el pin en el server (SQL ORDER BY) para eliminar el reorder client-side y recuperar LCP

**Prioridad: BAJA.** El trade-off CRO (mejor primera impresión) justifica +0.3s de LCP. Revisitar si se necesita rotar pins frecuentemente o si LCP sube de 2s.

## Bottom Sheet Comparativo Express — TRACKING PENDIENTE (10 Abr 2026)

**Contexto:** Se agregaron 3 secciones al bottom sheet de `/alquileres`: mini estudio de mercado, propiedades similares (scroll horizontal con swap), y preguntas seleccionables para el broker (se incluyen en mensaje WA). Objetivo: subir send rate de WhatsApp (0/7 confirmado pre-cambio).

**Qué ya se mide (sin cambios):**
- `leads_alquiler` con `fuente = 'bottom_sheet'` — clicks WA desde el sheet
- `preguntas_enviadas` — se guarda cuando el usuario selecciona preguntas

**Query de seguimiento (correr ~17 Abr 2026):**
```sql
SELECT DATE(created_at - INTERVAL '4 hours') as fecha,
  COUNT(*) as leads_total,
  COUNT(*) FILTER (WHERE preguntas_enviadas IS NOT NULL) as con_preguntas
FROM leads_alquiler WHERE fuente = 'bottom_sheet'
  AND (es_test = false OR es_test IS NULL)
  AND (es_debounce = false OR es_debounce IS NULL)
  AND created_at >= '2026-04-10'
GROUP BY 1 ORDER BY 1;
```

**Tracking adicional (agregar si los datos iniciales son prometedores):**
- `view_market_context` — cuando la sección de mercado se hace visible (intersection observer)
- `tap_similar_property` — cuando toca un similar para swap

**Validación cualitativa:** Contactar a 1-2 brokers top y preguntarles si ahora los mensajes llegan con preguntas. Comparar con el 0/7 pre-cambio.

**Prioridad: MEDIA.** Esperar 1 semana de datos antes de agregar más tracking.

## Filtro por nombre de edificio en feeds (14 Abr 2026)

Agregar filtro por nombre de edificio/proyecto en `/ventas` y `/alquileres`. Hoy solo se filtra por zona, dormitorios y precio. Poder buscar "Atrium" o "Condado" y ver solo las unidades de ese proyecto. Útil para seguimiento de competidores y para compradores que ya saben qué edificio les interesa.

**Prioridad: BAJA.** Nice to have, no bloquea nada.

## ✓ Pipeline alquiler — descripción cruda persistida (RESUELTO 9 May 2026)

**Estado:** Resuelto. Migración 243 + workflow `Enrichment LLM Alquiler v2.1.0` en producción desde 9 May 2026 ~22:30. La key `datos_json_enrichment.descripcion` se popula automáticamente en cada enrichment nocturno (Remax/C21/BI). RPC `buscar_unidades_alquiler` ya tenía la rama 1 del COALESCE preparada — feed muestra cruda automáticamente. **No se hizo backfill** de las 146 props pre-existentes (decisión: opción A = esperar al pipeline). Verificado E2E con 3 props (1385 BI, 1812 Remax, 1821 C21).

**Pendiente menor (no urgente):** sincronizar `audit-feed-alquileres` clonando `audit-feed-ventas` con cambios de fuente (`v_mercado_alquiler`, extractor por fuente, selectores de precio mensual). Pre-requisitos cubiertos.

---

### Contexto histórico (problema original)

**Problema:** En el feed `/alquileres`, los usuarios ven la descripción `descripcion_limpia` (resumen estructurado del LLM) en lugar del texto literal del broker. Eso pierde matices comerciales como "PRECIO BAJADO!", "ÚLTIMA UNIDAD", urgencias y tono.

**Causa:** Diseño "LLM-first" del pipeline de alquiler (decisión arquitectónica deliberada — `pipeline_alquiler_canonical.md` líneas 41-43). El nodo "Construir Prompt" del workflow `flujo_enrichment_llm_alquiler_v2.0.0.json` SÍ extrae la descripción cruda del HTML (Remax: `data-page.description_website`, C21: del markdown, BI: del HTML). La usa para alimentar al LLM **pero no la persiste**. Solo guarda el output del LLM en `datos_json_enrichment->'llm_output'`.

Verificado: en `propiedades_v2` para alquiler (150 props), las keys disponibles en `datos_json_enrichment` son solo `metadata` y `llm_output`. No hay `descripcion`, `description`, ni `descripcion_completa`. La RPC `buscar_unidades_alquiler` cae al fallback `llm_output->>'descripcion_limpia'` por COALESCE.

**Fix propuesto (3 cambios pequeños, ~2-3 hr total):**

1. **Modificar nodo "Construir Prompt" (JS)** — exponer la cruda al output del nodo:
   ```javascript
   return [{
     json: {
       prop_id: prop.id,
       prompt: prompt_text,
       descripcion_cruda: descripcion,  // ← AGREGAR
       agente_directo,
       fotos_extraidas,
       ...
     }
   }];
   ```

2. **Modificar nodo "Parsear y Validar" (JS)** — pasarla al SQL:
   ```javascript
   datos_llm.descripcion_cruda = $('Construir Prompt').first().json.descripcion_cruda;
   ```

3. **Modificar `registrar_enrichment_alquiler()`** — extraerla del JSONB y persistir en `datos_json_enrichment->'descripcion'` (top-level). El feed empieza a mostrarla automáticamente porque la RPC ya hace `COALESCE(enrichment.descripcion, llm_output.descripcion_limpia, ...)`.

**Backfill de 150 props existentes:**

Después de aplicar el fix, las nuevas props guardarán cruda. Para las 150 ya existentes hay 2 opciones:
- **a) Script Node ad-hoc** — re-scrape Firecrawl + UPDATE JSONB (~5 min ejecución, $0.75 una vez)
- **b) Workflow n8n nuevo "Backfill Descripción Alquiler"** — más visible, mismo costo

**Beneficios:**
- Feed muestra texto literal del broker (mejora UX, captura urgencia/tono)
- Permite audit mensual textual de alquileres (idéntico al de venta) en lugar del audit "estructurado" más limitado
- Coherencia con pipeline venta — mismo schema, menos casos especiales en código

**Riesgos:**
- Cambio en pipeline productivo (mitigado: cambios aditivos, no rompen lo existente)
- Función SQL `registrar_enrichment_alquiler()` toca producción (mitigado: testear en branch antes)

**Prioridad: MEDIA.** Funcionó 3 meses sin queja, pero agregar visibilidad para usuarios + habilitar audit textual son valor real.

**Referencia:** Investigado en sesión 8-9 May 2026 — branch `audit/descripciones-drift`. Workflow afectado: `n8n/workflows/alquiler/flujo_enrichment_llm_alquiler_v2.0.0.json`. Función SQL: ver migración existente de `registrar_enrichment_alquiler`.

## Migración Sonnet 4 → 4.6 — RESUELTO (15 May 2026)

**Contexto:** Anthropic comunicó retiro de `claude-sonnet-4` (nativo, ID `claude-sonnet-4-20250514`) el **15-Jun-2026 9AM PT**. Recomendación oficial: upgrade a Sonnet 4.6 (mismo precio, más inteligente, drop-in) o a Opus 4.7.

**Cambios aplicados (2 endpoints legacy):**
- `simon-mvp/src/pages/api/razon-fiduciaria.ts:150` → `claude-sonnet-4-6`
- `simon-mvp/src/pages/api/generar-guia.ts:151` → `claude-sonnet-4-6`

Ambos pertenecen al **funnel premium legacy** (`/filtros-v2 → /formulario-v2 → /resultados-v2`), no al flujo productivo principal (`/` → `/ventas`).

**Por qué los workflows n8n NO se tocaron:**
Los workflows de enrichment (`modulo_1/`, `alquiler/`, `casas_terrenos/`) usan **`claude-haiku-4-5-20251001`**, que **no está en lista de retiro**. Tampoco aplica para `api/chat-alquileres.ts` (también Haiku 4.5). El retiro de Sonnet 4 solo afecta a los 2 endpoints listados arriba — los pipelines nocturnos siguen intactos.

**Nota residual:** `scripts/llm-enrichment/enrich-ventas-llm.js:56` declara `sonnet: 'claude-sonnet-4-6'` como opción de modelo en herramienta de testing — ya estaba en 4.6, no requiere acción.
