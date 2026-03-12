# Deuda Técnica — SICI

> Extraído de CLAUDE.md el 27 Feb 2026. Actualizado 9 Mar 2026.

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

## Funciones SQL con filtros de mercado incompletos — PENDIENTE (12 Mar 2026)

**Contexto:** Migración 193 creó vistas canónicas `v_mercado_venta` y `v_mercado_alquiler`. Migración 194 refactorizó `snapshot_absorcion_mercado()` para usarlas. Auditoría de 60 funciones encontró 3 en producción con filtros incompletos.

**Funciones en producción que requieren corrección:**

| Prioridad | Función | Filtros faltantes | Riesgo de cambio | Dónde se usa |
|-----------|---------|-------------------|-------------------|--------------|
| ALTA | `analisis_mercado_fiduciario` | Subqueries stock/alertas: duplicado_de, tipo_prop, area, zona, precio, días | Bajo | formulario-v2 → resultados-v2 |
| MEDIA | `buscar_unidades_reales` | `precio_usd > 0`, status solo 'completado' (falta 'actualizado') | Medio (función más usada) | Landing venta, admin propiedades, broker CMA |
| BAJA | `buscar_unidades_alquiler` | Usa `precio_mensual_bob IS NOT NULL` en vez de `precio_mensual_usd > 0` | Medio-bajo (verificar si hay props con BOB sin USD) | API alquileres, admin propiedades |

**Funciones sin uso en producción (código muerto):**
- `buscar_unidades_con_amenities` — nunca integrada al frontend (migración 019)
- `generar_razon_fiduciaria` — sin llamadas desde frontend/API
- `explicar_precio` — sin llamadas desde frontend/API

**Orden recomendado:**
1. `analisis_mercado_fiduciario` — swap subqueries a `FROM v_mercado_venta` (bajo riesgo, alto valor)
2. `buscar_unidades_alquiler` — verificar datos BOB vs USD primero
3. `buscar_unidades_reales` — el más delicado, testear bien
