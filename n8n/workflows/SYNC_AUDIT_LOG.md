# Auditoría de Sincronización Workflows n8n

**Inicio:** 28 Feb 2026
**Método:** Exportar JSON de producción → comparar con repo → registrar diferencias

---

## Resumen

| # | Workflow | Estado | Acción |
|---|---------|--------|--------|
| 1 | Discovery C21 Venta | SYNC (1 diff menor) | Repo conservado (mejor) |
| 2 | Discovery Remax Venta | NUEVO en repo | Copiado de producción |
| 3 | Flujo C Verificador Venta | SYNC | Reemplazado sesión anterior |
| 4 | Flujo C Verificador Alquiler | SYNC | Reemplazado sesión anterior |
| 5 | Flujo B Enrichment Venta | SYNC (5 diffs) | Reemplazado con producción |
| 6 | Flujo Merge Nocturno Venta | SYNC (2 diffs menores) | Repo conservado (mejor) |
| 7 | Matching Nocturno | SYNC (2 diffs menores) | Repo conservado (mejor) |
| 8 | Discovery C21 Alquiler | PENDIENTE | — |
| 9 | Discovery Remax Alquiler | PENDIENTE | — |
| 10 | Discovery Bien Inmuebles Alquiler | PENDIENTE | — |
| 11 | Enrichment LLM Alquiler | PENDIENTE | — |
| 12 | Merge Alquiler | PENDIENTE | — |
| 13 | TC Dinámico Binance | PENDIENTE | — |
| 14 | Auditoría Diaria | PENDIENTE | — |

---

## Diferencias y Observaciones

### 1. Discovery C21 Venta (`flujo_a_discovery_century21_v1.0.3_FINAL`)

**Veredicto:** Repo conservado — tiene la versión mejor.

| Nodo | Diferencia | Impacto |
|------|-----------|---------|
| `registrar_ejecucion_workflow` | Producción pasa zeros hardcoded: `(0, 0, 0, NULL, '{}'::jsonb)`. Repo pasa métricas reales: `$json.resultados.snapshot_total`, etc. | **BAJO** — no afecta pipeline, solo métricas de tracking. Producción registra ejecuciones sin datos útiles. |
| `registrar_ejecucion_workflow` | Producción: nombre nodo `registrar_ejecucion_workflow`, typeVersion 2.6. Repo: nombre `PG: Registrar Ejecución`, typeVersion 2.5 | Cosmético |
| `Obtener URLs Activas BD` | SQL formatting (newlines vs one-line) | Cosmético |
| `Marcar Ausentes` | SQL formatting (newlines vs one-line) | Cosmético |

**TODO:** Considerar actualizar producción para pasar métricas reales (copiar versión del repo).

---

### 2. Discovery Remax Venta (`flujo_a_discovery_remax_v1.0.2_FINAL`)

**Veredicto:** Archivo nuevo agregado al repo desde producción.

| Observación | Detalle | Impacto |
|-------------|---------|---------|
| **Query BD sin filtro tipo_operacion** | `Obtener URLs Activas BD` consulta: `WHERE fuente = 'remax' AND status NOT IN ('inactivo_confirmed')` — NO filtra por `tipo_operacion = 'venta'`. C21 sí filtra: `AND tipo_operacion = 'venta'`. | **MEDIO** — Remax compara snapshot de venta contra TODAS sus props (venta + alquiler + anticretico). Puede marcar como "ausente" una propiedad de alquiler que no aparece en el discovery de venta. No causa corrupción porque `Marcar Ausentes` sí filtra `AND tipo_operacion = 'venta'`, pero infla el conteo de `stats.ausentes`. |
| `registrar_ejecucion_workflow` | Misma situación que C21: zeros hardcoded | **BAJO** |
| `IF Propiedades` lógica diferente | C21 chequea `$json.skip !== true` (boolean). Remax chequea `$json.p_url` is notEmpty (string). | **NINGUNO** — ambos logran el mismo efecto (filtrar el caso skip=true), solo diferente implementación. |

**TODO:** Agregar `AND tipo_operacion = 'venta'` a la query de Remax para consistencia con C21 y evitar conteos inflados de ausentes.

---

### 3. Flujo C Verificador Venta (`flujo_c_verificador_v1.1.0_FINAL`)

**Veredicto:** Reemplazado en sesión anterior (commit `34f8061`).

Diferencias encontradas antes del reemplazo:
- Query tenía `AND tipo_operacion = 'venta'` en repo, producción no lo tiene (Remax-only no necesita filtro)
- LIMIT 100 en repo vs LIMIT 200 en producción
- Nodo `registrar_ejecucion_workflow` existía en producción, no en repo

---

### 4. Flujo C Verificador Alquiler (`flujo_c_verificador_alquiler_v1.0.0`)

**Veredicto:** Reemplazado en sesión anterior (commit `34f8061`).

Diferencias encontradas antes del reemplazo:
- Node IDs completamente diferentes (repo manual vs producción UUIDs)
- Layout positions reorganizados

---

### 5. Flujo B Enrichment Venta (`flujo_b_processing_v3.0`)

**Veredicto:** Reemplazado con producción — 5 diferencias funcionales.

| Nodo | Diferencia | Impacto |
|------|-----------|---------|
| **`Obtener Propiedades Nuevas`** | Repo: `LIMIT 2` por fuente (4 total). Producción: `LIMIT 10` por fuente (20 total). | **ALTO** — Repo procesaba solo 4 propiedades por ejecución. Producción procesa hasta 20. Diferencia directa en throughput del pipeline. |
| **`Extractor Remax`** | Repo: v1.8. Producción: **v1.9** — agrega `extraccion_exitosa` flag, cambia `modalidad → tipo_operacion`, homologación Schema Canonical v3.1. | **ALTO** — Extractor desactualizado en repo, campos de salida diferentes. |
| **`Normalizar Firecrawl`** | Repo: v1.0 (43 líneas), lee `$input.first().json.body` directo. Producción: **v1.1 Defensivo** (59 líneas), valida `input`, `input.json`, intenta `body || json`, maneja más casos de error. | **MEDIO** — Producción más robusto ante respuestas inesperadas de Firecrawl. |
| **`Preparar Datos`** | Repo: chequea `propiedades.length === 0`. Producción: chequea `propiedades.length === 0 || !propiedades[0].id` | **BAJO** — Producción maneja edge case donde query retorna fila vacía sin id. |
| **`Marcar como inactivo_confirmed`** | Repo: escribe razón en `notas` con CONCAT, usa `$json._internal_id`. Producción: solo cambia status, usa `$json.id_propiedad`. | **MEDIO** — Referencia de campo diferente (`_internal_id` vs `id_propiedad`). El repo hubiera fallado si se ejecutaba. |
| **Nodo extra en producción** | `registrar_ejecucion_workflow1` — duplicado del nodo de tracking (ambos con zeros hardcoded). | **BAJO** — Nodo duplicado probablemente accidental. |

**TODOs:**
- Verificar si Extractor C21 v16.5 también diverge (prod vs repo tienen misma versión pero diff de 44 líneas — probablemente formatting)
- El LIMIT 10 vs 2 explica por qué producción procesa más props por noche

---

### 6. Flujo Merge Nocturno Venta (`Flujo Merge - Nocturno v1.0.0`)

**Veredicto:** Repo conservado — tiene la versión mejor.

| Nodo | Diferencia | Impacto |
|------|-----------|---------|
| **`Slack Resumen`** | Producción: webhook Slack **hardcoded** en URL. Repo: usa `$env.SLACK_WEBHOOK_SICI` (variable de entorno). | **SEGURIDAD** — Repo es correcto. Producción expone secreto en JSON. Slack revoca webhooks commiteados a GitHub. |
| **Nodo duplicado** | Producción tiene `registrar_ejecucion_workflow` + `registrar_ejecucion_workflow1` (ambos zeros hardcoded). Repo tiene 1 solo `PG: Registrar Ejecución`. | **BAJO** — Duplicado accidental en producción. |

**Lógica core IDÉNTICA:** Query, ejecución merge, procesamiento resultado, generación resumen — todo igual.

**TODO:** Limpiar nodo duplicado en producción. NO commitear webhook hardcoded.

---

## Patrones Recurrentes

### Slack webhook hardcoded en producción
**Afecta:** Merge Nocturno, Matching Nocturno (2x nodos) — confirmado en 2/2 workflows con Slack
**Repo usa `$env.SLACK_WEBHOOK_SICI`** — correcto. Producción tiene URL real en el JSON.
**Recomendación:** Migrar producción a usar variable de entorno. NUNCA commitear la URL real.

### `registrar_ejecucion_workflow` — zeros hardcoded
**Afecta:** Discovery C21, Discovery Remax, Flujo B Enrichment, Merge Nocturno (confirmado en 4/4 workflows)
**Causa probable:** Edit manual rápido en n8n que perdió las expresiones dinámicas
**Impacto:** `workflow_executions` no tiene métricas útiles de ejecución
**Recomendación:** Después de completar sync, actualizar producción con versiones que pasen métricas reales

### Filtro `tipo_operacion = 'venta'` inconsistente
**Afecta:** Discovery Remax Venta (falta el filtro en query BD)
**C21 lo tiene, Remax no.** El UPDATE de ausentes sí filtra, así que no hay corrupción de datos.
**Recomendación:** Agregar filtro a Remax para consistencia

---

*Última actualización: 28 Feb 2026*
