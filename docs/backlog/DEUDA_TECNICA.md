# Deuda Técnica — SICI

> Extraído de CLAUDE.md el 27 Feb 2026. Actualizado 24 Mar 2026.

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
