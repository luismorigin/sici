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

## Snapshots absorción — RESUELTO (23-24 Mar 2026)

**Problemas resueltos:**
1. ~~Verificador excluía C21~~ → v5.1 eliminó `AND fuente = 'remax'` (131 props confirmadas)
2. ~~Absorción histórica corrupta~~ → Migración 199 backfill (40 fechas recalculadas, absorción 2 dorms 0-12% → 20-31%)
3. ~~Snapshot global sin granularidad por zona~~ → Migración 200 agrega `zona` + `venta_pending_30d` (~26 filas/día)
4. ~~Snapshot sin filtros canónicos~~ → Fix 24 Mar: duplicado_de, es_multiproyecto, tipo_propiedad_original, zona NOT NULL, 300d cutoff
5. ~~Market Pulse sin absorción~~ → Dashboard integra KPI card, tabla por zona, 2 charts serie temporal

**Deuda residual:**
- `MEDIA_ZONA_USD_M2` en extractores n8n sigue hardcodeado — podría leerse de snapshots por zona ahora que existen
- `market.tsx` usa `MICROZONA_DISPLAY` con nombres legacy + `ZONA_DISPLAY_TO_SNAPSHOT` para mapear a snapshots — cuando se unifiquen los nombres de zona en el dashboard, eliminar el mapeo

## Refactor ventas /ventas — Deuda del Bloque 1 (18 Mar 2026)

Ítems encontrados durante el Bloque 1 del refactor ventas (`docs/refactor/VENTAS_SIMPLIFICADO.md`).

| # | Ítem | Dónde | Severidad | Cuándo resolver |
|---|---|---|---|---|
| 1 | `plan_pagos_cuotas: unknown \| null` en `RawUnidadSimpleRow` y `UnidadVenta` — debería ser `Record<string, unknown>[] \| null` | `types/db-responses.ts`, `lib/supabase.ts` | Baja | Cuando se use en UI |
| 2 | `LIMIT 500` en `buscar_unidades_simple()` — si el catálogo supera 500 props activas, corta sin aviso | `sql/functions/query_layer/buscar_unidades_simple.sql` | Media | Cuando ventas pase ~400 props |
| 3 | Spotlight en `api/ventas.ts` hace query completa (`limite: 500`) para buscar un solo ID — ineficiente | `pages/api/ventas.ts` | Baja | Bloque 5 (compartir/spotlight) |
| 4 | `CardPlaceholder` ya tiene foto, precio, specs y badges funcionales — en Bloque 3 iterar sobre esta base, no reescribir desde cero | `pages/ventas.tsx` | Info | Bloque 3 |
| 5 | `fotos_count` badge se renderiza fuera de la imagen + `object-fit` no adapta bien fotos de distintos portales (collages, watermarks, aspect ratios verticales) | `pages/ventas.tsx` | Media | Bloque 3 |
