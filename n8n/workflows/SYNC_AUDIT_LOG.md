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
| 8 | Discovery C21 Alquiler | SYNC (1 diff) | Reemplazado con producción |
| 9 | Discovery Remax Alquiler | SYNC (2 diffs) | Reemplazado con producción |
| 10 | Discovery Bien Inmuebles Alquiler | SYNC (1 BUG prod) | Repo conservado (mejor) |
| 11 | Enrichment LLM Alquiler | SYNC (3 diffs) | Repo conservado (seguridad) |
| 12 | Merge Alquiler | SYNC (0 diffs funcionales) | Repo conservado (más limpio) |
| 13 | TC Dinámico Binance | SYNC (2 diffs) | Repo conservado (seguridad) |
| 14 | Auditoría Diaria | SYNC (6 diffs funcionales) | Reemplazado con producción (sanitizado) |

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

### 8. Discovery C21 Alquiler (`Discovery C21 Alquiler v1.0.0`)

**Veredicto:** Reemplazado con producción — tiene nodo Tracking que faltaba en repo.

| Nodo | Diferencia | Impacto |
|------|-----------|---------|
| **`Tracking`** | Solo en producción. Llama `registrar_ejecucion_workflow('discovery_c21_alquiler', ...)` con métricas REALES: `$json.resultados.total_snapshot`, `.nuevas`, `.existentes`. | **BAJO** — Notable: único workflow que pasa métricas reales (a diferencia de los 4 de venta con zeros). |
| Comentarios JS | Prod: "operacion_alquiler". Repo: "operacion_renta" | Cosmético |
| `alwaysOutputData` | `Extraer Propiedades`: presente en prod, ausente en repo | Cosmético |
| SQL formatting | `Marcar Ausentes`: newlines vs one-line | Cosmético |
| Node IDs | Prod: UUIDs. Repo: semánticos (`c1-trigger`, `c1-extract`, etc.) | Cosmético |

**Lógica core IDÉNTICA:** Queries SQL, JS extractores, comparación snapshot, `registrar_discovery_alquiler()` — todo igual.

---

### 9. Discovery Remax Alquiler (`Discovery Remax Alquiler v1.0.0`)

**Veredicto:** Reemplazado con producción — tiene nodo Tracking. Pero producción tiene un gap en Marcar Ausentes.

| Nodo | Diferencia | Impacto |
|------|-----------|---------|
| **`Tracking`** | Solo en producción. Métricas REALES: `alquileres_filtrados`, `nuevas_insertadas`, `existentes_actualizadas`. | **BAJO** — mismo patrón que C21 Alquiler. |
| **`Marcar Ausentes`** | Producción: `SET status, fecha_discovery` solamente. Repo tenía además `primera_ausencia_at = COALESCE(primera_ausencia_at, NOW())`. | **MEDIO** — Producción NO trackea primera ausencia. C21 Alquiler SÍ lo tiene. Inconsistencia entre portales. |
| `alwaysOutputData` | `Extraer Propiedades`: presente en prod, ausente en repo | Cosmético |
| Node IDs | Prod: UUIDs. Repo: semánticos (`a1-trigger`, etc.) | Cosmético |

**Lógica core IDÉNTICA:** URLs API, extractor, filtro alquileres, comparación, `registrar_discovery_alquiler()` — todo igual.

**TODO:** Agregar `primera_ausencia_at = COALESCE(primera_ausencia_at, NOW())` al `Marcar Ausentes` en producción para consistencia con C21 Alquiler.

---

### 10. Discovery Bien Inmuebles Alquiler (`Discovery Bien Inmuebles Alquiler v1.0.0`)

**Veredicto:** Repo conservado — producción tiene BUG en conexiones.

| Nodo | Diferencia | Impacto |
|------|-----------|---------|
| **`Log Stats` connections** | Producción: solo conecta a `Procesar Alquileres`. `Procesar Ausentes` está **HUÉRFANO** (sin input). Repo conecta a ambos nodos. | **ALTO** — BUG. Props Bien Inmuebles que desaparecen del portal NUNCA se marcan `inactivo_pending`. Quedan como activas indefinidamente. |
| Sin `Tracking` | Ninguna versión tiene nodo `registrar_ejecucion_workflow`. | **BAJO** — inconsistente con C21/Remax alquiler que sí lo tienen. |
| Node IDs | Prod: UUIDs. Repo: semánticos (`bi-trigger`, etc.) | Cosmético |

**Lógica core IDÉNTICA:** API POST, extractor Equipetrol, comparación, `registrar_discovery_alquiler()` — todo igual.

**TODO URGENTE:** Reconectar `Log Stats → Procesar Ausentes` en producción. Las props BI que salen del portal no se están marcando como ausentes.
**TODO:** Agregar nodo `Tracking` para consistencia con los otros 2 discovery alquiler.

---

### 11. Enrichment LLM Alquiler (`Enrichment LLM Alquiler v1.0.0`)

**Veredicto:** Repo conservado — producción tiene API key hardcoded.

| Nodo | Diferencia | Impacto |
|------|-----------|---------|
| **`Anthropic Haiku`** | Producción: API key Anthropic **HARDCODED** (`sk-ant-api03-...`). Repo: `$env.ANTHROPIC_API_KEY`. | **SEGURIDAD** — Repo es correcto. NUNCA commitear API keys. |
| **`Query Alquileres Sin Enrichment`** | Producción agrega `datos_json_discovery->>'amigo_clie' AS amigo_clie`. Repo no lo tiene. | **BAJO** — Fallback para nombre agente Bien Inmuebles. |
| **`Tracking` + `Tracking1`** | Solo en producción. Tracking pasa métricas reales (`total_lote`, `total_enriquecidas`). Tracking1 pasa zeros (caso sin pendientes). | **BAJO** — tracking ejecuciones. |
| Comentarios, whitespace | Construir Prompt, Parsear y Validar | Cosmético |

**Lógica core IDÉNTICA:** Firecrawl scrape, prompt híbrido (C21/Remax/BI), Haiku 4.5, validaciones, `registrar_enrichment_alquiler()`.

**TODO:** Agregar `amigo_clie` a la query del repo para paridad con producción.
**TODO:** Migrar producción a usar `$env.ANTHROPIC_API_KEY`.

---

### 12. Merge Alquiler (`Merge Alquiler v1.0.0`)

**Veredicto:** Repo conservado — zero diferencias funcionales.

| Nodo | Diferencia | Impacto |
|------|-----------|---------|
| Query pendientes | Prod: `SELECT id, url, status...` (columnas innecesarias). Repo: `SELECT COUNT(*)` (más limpio). | Cosmético |
| Nombres nodos | `Query Alquileres Pendientes` vs `Contar Pendientes`, `Tracking1` vs `Tracking Sin Pendientes` | Cosmético |
| Whitespace/comments | Resumen Final, Sin Pendientes, Tracking | Cosmético |

**Lógica core IDÉNTICA:** `merge_alquiler()`, flujo condicional, ambos tracking nodes presentes.

---

### 13. TC Dinámico Binance (`SICI - TC Dinamico Binance v1.1`)

**Veredicto:** Repo conservado — Slack seguro con credencial nativa.

| Nodo | Diferencia | Impacto |
|------|-----------|---------|
| **`Slack: Notificar Cambio TC`** | Producción: `httpRequest` con webhook **HARDCODED**. Repo: nodo nativo `n8n-nodes-base.slack` con credencial `Slack API SICI`. | **SEGURIDAD** — Repo correcto. |
| **`PG: Actualizar TC`** | Producción: `actualizar_tipo_cambio('paralelo', tc, 'binance_p2p', 'Actualizacion...')` — 4 args posicionales. Repo: `actualizar_tipo_cambio(p_nuevo_tc_paralelo := tc, p_origen := 'binance_p2p', p_notas := 'Actualizacion...')` — 3 named args sin `'paralelo'`. | **MEDIO** — Diferencia en firma de función. Ambos funcionan (producción lo confirma). |

**Lógica core IDÉNTICA:** Binance P2P, calcular TC, validar, snapshot, actualizar, registrar, Slack.

**TODO:** Verificar firma de `actualizar_tipo_cambio()` — producción pasa tipo `'paralelo'` como primer arg, repo no.

---

### 14. Auditoría Diaria (`SICI - Auditoría Diaria v2.5`)

**Veredicto:** Reemplazado con producción (sanitizado webhook) — producción v2.8 tiene funcionalidad superior.

| Nodo | Diferencia | Impacto |
|------|-----------|---------|
| **`PG: Stats Propiedades`** | Producción agrega `sin_precio` (completadas sin precio_usd). `tc_dinamico_ok` consulta `workflow_executions` en vez de `fecha_inactivacion` local. | **MEDIO** — Métrica nueva + health check más confiable. |
| **`PG: Stats Matching`** | Producción: `matching_nocturno_hoy` via subquery a `workflow_executions` (retorna 0/1). Repo: infiere desde `created_at` ventana 4-5 AM (retorna COUNT). | **BAJO** — Semánticamente similar, producción es más directo. |
| **`PG: Stats Proyectos`** | Producción agrega `con_desarrollador` y `sin_desarrollador`. | **MEDIO** — Tracking de asignación desarrollador (nuevo). |
| **`PG: Stats Sin Match`** | Producción agrega `huerfanas_no_exportadas` via vista `v_huerfanas_no_exportadas`. | **BAJO** — Métrica extra de huérfanas no procesadas. |
| **`PG: Stats Enriquecimiento`** | Solo en producción. Llama `detectar_proyectos_sin_desarrollador()`. | **MEDIO** — Nodo nuevo para backlog de enriquecimiento IA. |
| **`Merge`** | Solo en producción. Combina resultado de Stats Sin Match + Stats Enriquecimiento en paralelo antes de Stats TC. | **BAJO** — Optimización de flujo. |
| **`Code: Consolidar Reporte`** | Producción: v2.8, 238 líneas, texto plano Slack con métricas nuevas (`pctHuerfanas`, `sinPrecio`, `pctSinDesarrollador`, enrichment stats). Repo: v2.5, 333 líneas, Slack block kit format. | **ALTO** — Producción tiene más métricas pero formato más simple. Repo tiene formato más rico pero menos datos. |
| **`Slack: Reporte Diario`** | Producción: webhook **HARDCODED**. Repo: `$env.SLACK_WEBHOOK_SICI`. | **SEGURIDAD** — Sanitizado al copiar. |
| **`PG: Snapshot Absorción`** | Producción: typeVersion 2.6. Repo: 2.5. Query idéntico. | Cosmético |

**Decisión:** Producción gana porque tiene:
1. Métricas nuevas: `sin_precio`, `con/sin_desarrollador`, `huerfanas_no_exportadas`
2. Health checks vía `workflow_executions` (más confiable que inferir de timestamps)
3. Enrichment tracking (`detectar_proyectos_sin_desarrollador`)
4. Webhook sanitizado a `$env.SLACK_WEBHOOK_SICI` antes de copiar al repo

**Trade-off aceptado:** Se pierde el formato Slack block kit (repo) a favor del texto plano con más métricas (producción). El bloque kit se puede re-implementar después si se desea.

---

## Patrones Recurrentes

### Secrets hardcoded en producción
**Slack webhook:** Merge Nocturno, Matching Nocturno (2x nodos), TC Dinámico Binance, **Auditoría Diaria**. Repo usa `$env.SLACK_WEBHOOK_SICI` o credencial nativa Slack.
**API key Anthropic:** Enrichment LLM Alquiler. Repo usa `$env.ANTHROPIC_API_KEY`.
**Recomendación:** Migrar producción a variables de entorno o credenciales nativas. NUNCA commitear secrets.

### `registrar_ejecucion_workflow` — zeros hardcoded
**Afecta:** Discovery C21 Venta, Discovery Remax Venta, Flujo B Enrichment, Merge Nocturno (confirmado en 4/4 workflows de venta)
**Excepción:** Discovery C21 Alquiler SÍ pasa métricas reales (total_snapshot, nuevas, existentes)
**Causa probable:** Edit manual rápido en n8n que perdió las expresiones dinámicas
**Impacto:** `workflow_executions` no tiene métricas útiles de ejecución para venta
**Recomendación:** Después de completar sync, actualizar producción con versiones que pasen métricas reales

### Filtro `tipo_operacion = 'venta'` inconsistente
**Afecta:** Discovery Remax Venta (falta el filtro en query BD)
**C21 lo tiene, Remax no.** El UPDATE de ausentes sí filtra, así que no hay corrupción de datos.
**Recomendación:** Agregar filtro a Remax para consistencia

---

### Auditoría Diaria — formato Slack
**Producción v2.8:** Texto plano con markdown (`*bold*`, bullets) — más métricas (`sinPrecio`, `pctHuerfanas`, `pctSinDesarrollador`, sección enriquecimiento)
**Repo v2.5 anterior:** Block kit JSON (headers, sections, dividers) — formato más rico visualmente pero menos datos
**Decisión:** Se adoptó producción v2.8 (más métricas > formato). Block kit se puede re-implementar después.

---

## TODOs Consolidados

| Prioridad | Descripción | Workflow afectado |
|-----------|-------------|-------------------|
| ~~URGENTE~~ | ~~Reconectar `Log Stats → Procesar Ausentes` en producción BI~~ ✅ DONE 28 Feb | Discovery BI Alquiler |
| ALTA | Agregar `primera_ausencia_at` a Marcar Ausentes Remax Alquiler | Discovery Remax Alquiler |
| ALTA | Migrar producción a `$env.ANTHROPIC_API_KEY` | Enrichment LLM Alquiler |
| MEDIA | Migrar producción a `$env.SLACK_WEBHOOK_SICI` (5 workflows) | Merge, Matching, TC Binance, Auditoría |
| MEDIA | Agregar `amigo_clie` a query enrichment repo | Enrichment LLM Alquiler |
| MEDIA | Verificar firma `actualizar_tipo_cambio()` (3 vs 4 args) | TC Dinámico Binance |
| BAJA | Agregar Tracking node a Discovery BI Alquiler | Discovery BI Alquiler |
| BAJA | Agregar `tipo_operacion = 'venta'` a query BD Remax Venta | Discovery Remax Venta |
| BAJA | Limpiar nodos duplicados `registrar_ejecucion_workflow` en producción | Merge, Enrichment Venta |
| BAJA | Actualizar producción venta para pasar métricas reales (no zeros) | 4 workflows venta |

---

*Auditoría completada: 14/14 workflows — 28 Feb 2026*
