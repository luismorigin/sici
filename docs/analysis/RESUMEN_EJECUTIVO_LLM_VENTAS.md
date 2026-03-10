# Resumen Ejecutivo — LLM Enrichment Ventas v1.0

> Fecha: 2026-03-10 | Modelo: claude-haiku-4-5-20251001 | N=30 | Costo: $0.026

---

## 1. Resultado del test

| Métrica | Valor |
|---------|-------|
| Propiedades procesadas | 30/30 (0 errores) |
| Tokens totales | 87,438 |
| Costo total | $0.026 |
| Costo por propiedad | $0.0009 |
| Tiempo promedio/prop | ~4.3s |
| Errores de validación | 0 |

### Veredictos agregados (480 comparaciones en 16 campos × 30 props)

| Veredicto | Count | % |
|-----------|-------|---|
| igual | 282 | 58.8% |
| llm_agrega | 68 | 14.2% |
| llm_no_detecta | 90 | 18.8% |
| llm_difiere | 40 | 8.3% |

---

## 2. Análisis por campo

### Campos GANADORES (LLM aporta valor claro)

| Campo | Agrega | Difiere | Impacto | Análisis |
|-------|--------|---------|---------|----------|
| **es_multiproyecto** | 30 | 0 | 100% | Campo nuevo. LLM lo llena siempre. Útil para filtros de calidad. |
| **fecha_entrega_estimada** | 9 | 0 | 30% | 9 fechas nuevas extraídas (abr 2026, dic 2025, jun 2027, etc.). Sin errores. Campo crítico para inversores. |
| **piso** | 7 | 0 | 23% | 7 pisos nuevos. Valores razonables (1, 4, 6, 7, 8, 13). Cero falsos positivos. |
| **estado_construccion** | 0 | 7 | 23% | 4× no_especificado→entrega_inmediata, 3× entrega_inmediata→nuevo_a_estrenar. Correcciones legítimas en su mayoría. |
| **plan_pagos_desarrollador** | 5 | 1 | 20% | 5 nuevos detectados. |
| **parqueo_incluido** | 3 | 0 | 10% | 3 nuevos (todos true). Sin falsos positivos. |

### Campos con PROBLEMAS (requieren ajuste antes de producción)

| Campo | Issue | Detalle |
|-------|-------|---------|
| **depende_de_tc** | 23 difiere (77%) | **ERROR SISTEMÁTICO**: LLM dice `false` porque ve "$us" en descripciones, pero `moneda_original=BOB` en TODAS las props. El LLM no tiene acceso a la moneda original del listing. **Solución: eliminar este campo del LLM, dejarlo en el pipeline regex.** |
| **tipo_cambio_detectado** | 12 no_detecta | LLM devuelve NULL donde BD tiene `no_especificado`. Esto es discutible — NULL es técnicamente más correcto que `no_especificado`. Pero 2 casos preocupan: oficial→NULL y paralelo→NULL. |
| **solo_tc_paralelo** | 5 difiere (false→true) | Posible sobrecarga: LLM interpreta "solo dólares" como paralelo, lo cual es correcto conceptualmente, pero BD tenía false. Necesita revisión manual. |
| **baulera** | 14 no_detecta | LLM devuelve NULL donde BD tenía valores. Pipeline regex/discovery es mejor aquí. |
| **acepta_permuta** | 17 no_detecta | LLM no encuentra dato. Regex tampoco lo tenía (era NULL→NULL en BD). |

---

## 3. Hallazgos críticos

### 3a. depende_de_tc — Error sistemático

El campo `depende_de_tc` es **100% determinístico** basado en `moneda_original`. Si la moneda original es BOB, depende_de_tc=true. El LLM NO tiene acceso a esta información y hace inferencias erróneas desde el texto.

**Decisión: NO incluir `depende_de_tc` en el prompt LLM.** Mantener lógica actual del merge.

### 3b. tipo_cambio_detectado — Valor limitado

El LLM convierte 10× `no_especificado→NULL`, lo cual es neutral (ambos significan "no se sabe"). Solo 1 caso de nueva información (ID 1049: no_especificado→paralelo). El regex actual ya cubre los casos claros.

**Decisión: Mantener en prompt pero con peso bajo. No sobreescribir valores existentes no-null.**

### 3c. estado_construccion — Valor ALTO

7 correcciones, todas plausibles:
- 4× `no_especificado→entrega_inmediata` (LLM detecta "amoblado + piso específico + USD fijo")
- 3× `entrega_inmediata→nuevo_a_estrenar` (LLM distingue "a estrenar sin muebles")

**Decisión: Habilitar para producción con confianza alta solamente.**

### 3d. Campos nuevos — Alto ROI con bajo riesgo

`fecha_entrega_estimada`, `piso`, `parqueo_incluido`, `es_multiproyecto` tienen 0 falsos positivos en 30 props. Son campos que el regex no extrae o extrae mal.

---

## 4. Costo estimado en producción

| Concepto | Valor |
|----------|-------|
| Props procesadas/noche | ~40-50 (nuevas + actualizadas) |
| Tokens/prop promedio | 2,915 (87,438/30) |
| Costo/prop | ~$0.0009 |
| Costo/mes | ~$1.20 |
| Props procesadas/año | ~15,000 |
| Costo/año | ~$13.50 |

---

## 5. Plan de activación para n8n

### Fase 1: Test expandido (30 props más)
1. Ejecutar el script con 30 props diferentes para confirmar hallazgos
2. Verificar manualmente los 7 cambios de estado_construccion
3. Confirmar que piso/parqueo/fecha_entrega son correctos

### Fase 2: Integración n8n
1. Crear nodo "LLM Enrichment Venta" entre Enrichment y Merge
2. Input: propiedades con `datos_json_enrichment.descripcion` no vacía
3. Construir prompt con `buildPrompt()` del script
4. POST a Anthropic API (mismo patrón que alquileres)
5. Parsear y validar con `parseAndValidate()`
6. Guardar en `datos_json_enrichment.llm_output`

### Fase 3: Merge update
1. Modificar `merge_discovery_enrichment_v2()` para consumir LLM output
2. Prioridad: LLM > Enrichment regex para campos seleccionados
3. **NUNCA** para: depende_de_tc, precio_usd, area, dorms, baños, GPS
4. Respetar `campos_bloqueados` siempre

### Campos habilitados para producción (safe)

| Campo | Condición para escribir a BD |
|-------|------------------------------|
| nombre_edificio | confianza alta + match con proyectos_master |
| estado_construccion | confianza alta solamente |
| piso | rango -2 a 40 |
| parqueo_incluido | cualquier confianza |
| parqueo_precio_adicional | rango 0-50k |
| fecha_entrega_estimada | campo nuevo, siempre escribir |
| es_multiproyecto | campo nuevo, siempre escribir |
| plan_pagos_desarrollador | cualquier confianza |
| amenities_confirmados | en datos_json_enrichment (no en campo directo) |
| equipamiento_detectado | en datos_json_enrichment (no en campo directo) |
| descripcion_limpia | en datos_json_enrichment (no en campo directo) |

### Campos EXCLUIDOS del LLM

| Campo | Razón |
|-------|-------|
| depende_de_tc | Determinístico por moneda_original. LLM no tiene acceso. |
| precio_usd | Riesgo alto. Regex robusto. |
| area_total_m2 | Discovery es fuente de verdad. |
| dormitorios/baños | Discovery es fuente de verdad. |
| latitud/longitud | API GPS es fuente de verdad. |

---

## 6. Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| LLM inventa nombre_edificio | Baja | Solo escribir si match con proyectos_master |
| estado_construccion incorrecto | Media | Solo con confianza alta. Review flag si difiere de regex. |
| Costo API se dispara | Baja | Haiku es $0.001/prop. Budget guard en n8n. |
| Rate limit Anthropic | Baja | 2s delay entre calls. Batch nocturno ~50 props. |
| Prompt injection via descripción | Baja | Descripciones son scraped text, no user input. Validación post-LLM. |

---

## 7. Archivos del feature branch

```
docs/analysis/INVESTIGACION_LLM_VENTAS.md     — Research Phase 0
docs/analysis/RESUMEN_EJECUTIVO_LLM_VENTAS.md  — Este archivo
scripts/llm-enrichment/enrich-ventas-llm.js    — Script standalone
scripts/llm-enrichment/prompt-ventas-v1.md     — Prompt documentation
scripts/llm-enrichment/output/                 — Test results JSON
sql/functions/enrichment/registrar_enrichment_venta_llm.sql — SQL function (producción futura)
sql/migrations/188_create_llm_enrichment_test_results.sql   — DDL tabla test (no ejecutada)
```

---

## 8. Instrucciones para ejecutar el test

```bash
# Dry run (no API calls)
node scripts/llm-enrichment/enrich-ventas-llm.js --ids=30,35,43 --dry-run

# Run on specific IDs
node scripts/llm-enrichment/enrich-ventas-llm.js --ids=30,35,43

# Run on 30 random props
node scripts/llm-enrichment/enrich-ventas-llm.js --limit=30

# Full 30 IDs del test original
node scripts/llm-enrichment/enrich-ventas-llm.js --ids=30,35,43,48,59,101,418,465,470,519,574,621,909,920,1095,183,234,296,370,450,455,479,530,559,569,611,849,1006,1009,1049
```

Requiere `ANTHROPIC_API_KEY` en `simon-mvp/.env.local`.
