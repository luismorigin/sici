# Deuda Técnica — SICI

> Extraído de CLAUDE.md el 27 Feb 2026. Actualizado 23 Mar 2026.

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

**`buscar_unidades_reales` — DEFENSIVO, baja prioridad**
- Falta `precio_usd > 0` y status `'actualizado'`: verificado 23 Mar, hay **0 registros** con precio=0 y **0 registros** con status=actualizado
- El pipeline no deja pasar datos malos actualmente. Fix válido pero sin impacto inmediato
- `buscar_unidades_simple` (nueva, /ventas) ya tiene status fix pero comparte el gap de precio>0

**`buscar_unidades_alquiler` — CORREGIDO (23 Mar 2026)**
- Cambio: `precio_mensual_bob IS NOT NULL` → `precio_mensual_usd > 0` (alinea con `v_mercado_alquiler`)
- Solo 1 prop afectada (id 1156, BOB sin USD). Pendiente aplicar migración en producción

**Funciones sin uso en producción (código muerto):**
- `buscar_unidades_con_amenities` — nunca integrada al frontend (migración 019)
- `generar_razon_fiduciaria` — sin llamadas desde frontend/API
- `explicar_precio` — sin llamadas desde frontend/API
- `analisis_mercado_fiduciario` — sin llamadas desde frontend/API (ver arriba)

## Refactor ventas /ventas — Deuda del Bloque 1 (18 Mar 2026)

Ítems encontrados durante el Bloque 1 del refactor ventas (`docs/refactor/VENTAS_SIMPLIFICADO.md`).

| # | Ítem | Dónde | Severidad | Cuándo resolver |
|---|---|---|---|---|
| 1 | `plan_pagos_cuotas: unknown \| null` en `RawUnidadSimpleRow` y `UnidadVenta` — debería ser `Record<string, unknown>[] \| null` | `types/db-responses.ts`, `lib/supabase.ts` | Baja | Cuando se use en UI |
| 2 | `LIMIT 500` en `buscar_unidades_simple()` — si el catálogo supera 500 props activas, corta sin aviso | `sql/functions/query_layer/buscar_unidades_simple.sql` | Media | Cuando ventas pase ~400 props |
| 3 | Spotlight en `api/ventas.ts` hace query completa (`limite: 500`) para buscar un solo ID — ineficiente | `pages/api/ventas.ts` | Baja | Bloque 5 (compartir/spotlight) |
| 4 | `CardPlaceholder` ya tiene foto, precio, specs y badges funcionales — en Bloque 3 iterar sobre esta base, no reescribir desde cero | `pages/ventas.tsx` | Info | Bloque 3 |
| 5 | `fotos_count` badge se renderiza fuera de la imagen + `object-fit` no adapta bien fotos de distintos portales (collages, watermarks, aspect ratios verticales) | `pages/ventas.tsx` | Media | Bloque 3 |
