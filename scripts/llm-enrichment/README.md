# LLM Enrichment — Ventas

Enrichment LLM para el pipeline de ventas de SICI. El LLM actúa como **supervisor del regex** — recibe lo que el extractor ya sacó + la descripción/título/ubicación, y valida/corrige/completa 17 campos.

## Estado actual (2026-03-17)

| Paso | Descripción | Estado | Archivos |
|------|-------------|--------|----------|
| 1 | Prompt v4.1 | Completado | `prompt-ventas-v2.md` |
| 2 | Script de test | Completado — N=30 Haiku+Sonnet, Haiku elegido | `enrich-ventas-llm.js` |
| 3 | Título/ubicación en extractores | **Pendiente** (no bloqueante) | `n8n/workflows/modulo_1/flujo_b_processing_v3.0.json` |
| 4 | Función SQL v2.0 (modo observación) | Completado — deployada 2026-03-17 | `sql/functions/enrichment/registrar_enrichment_venta_llm.sql` |
| 5 | Workflow n8n | Implementado, **pendiente importar** | `n8n/workflows/modulo_1/flujo_enrichment_llm_venta_v1.0.0.json` |
| 6 | Backfill + auditoría (Fase A) | **Completado** — 352 props, auditoría limpia | — |
| 7 | Pipeline nocturno 2 semanas (Fase B) | Pendiente — importar workflow y activar | — |
| 8 | Merge consume llm_output (Fase C) | Pendiente | `sql/functions/merge/merge_discovery_enrichment.sql` |

### Prerrequisitos para correr el test

1. **`ANTHROPIC_API_KEY`** en `simon-mvp/.env.local` — verificado
2. **Supabase credentials** (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) en `simon-mvp/.env.local` — verificado
3. **Función SQL deployada** — deployada 2026-03-17

## Archivos del módulo

```
scripts/llm-enrichment/
├── README.md                  ← este archivo
├── prompt-ventas-v1.md        ← prompt v1.0-v3.2 (histórico)
├── prompt-ventas-v2.md        ← prompt v4.0 (activo)
├── enrich-ventas-llm.js       ← script de test + backfill
├── analyze-v1.js              ← análisis de resultados v1 (histórico)
├── output/                    ← resultados JSON de cada corrida
├── package.json
└── package-lock.json
```

Archivos relacionados fuera de este directorio:

```
sql/functions/enrichment/registrar_enrichment_venta_llm.sql  ← función SQL v2.0
n8n/workflows/modulo_1/flujo_enrichment_llm_venta_v1.0.0.json  ← workflow nocturno
docs/analysis/RESUMEN_EJECUTIVO_LLM_VENTAS.md  ← resultados test original v1-v3.2
```

## Uso del script

```bash
# Dry-run: ver largo de prompts sin llamar API
node scripts/llm-enrichment/enrich-ventas-llm.js --dry-run --limit=5

# Dry-run: ver prompt completo con datos reales
node scripts/llm-enrichment/enrich-ventas-llm.js --dry-run --print-prompt --ids=458,463

# Test con Haiku (default), 30 props, solo output local
node scripts/llm-enrichment/enrich-ventas-llm.js --limit=30 --model=haiku

# Test con Sonnet para comparar
node scripts/llm-enrichment/enrich-ventas-llm.js --limit=30 --model=sonnet

# Backfill: guardar resultados en BD (requiere función SQL deployada)
node scripts/llm-enrichment/enrich-ventas-llm.js --save-to-db --limit=30 --model=haiku

# Props específicos
node scripts/llm-enrichment/enrich-ventas-llm.js --ids=207,458,463 --model=sonnet
```

### Flags

| Flag | Default | Descripción |
|------|---------|-------------|
| `--limit=N` | 30 | Número de propiedades |
| `--ids=30,35` | — | Procesar IDs específicos (ignora limit) |
| `--model=haiku\|sonnet` | haiku | Modelo Anthropic |
| `--dry-run` | false | Solo construir prompts, no llamar API |
| `--print-prompt` | false | Con `--dry-run`, imprime prompt completo |
| `--save-to-db` | false | Guardar en BD vía `registrar_enrichment_venta_llm()` |
| `--version=v4.0` | v4.0 | Etiqueta en archivos de output |

### Output

Cada corrida genera 3 archivos en `output/`:
- `test-results-{iteration}.json` — resumen agregado (contadores, stats por campo)
- `test-detail-{iteration}.json` — una fila por campo×prop (equivalente a tabla BD)
- `test-raw-{iteration}.json` — output LLM crudo + comparaciones por propiedad

## Cambios v3.2 → v4.0 → v4.1

| Cambio | Versión | Detalle |
|--------|---------|---------|
| Dormitorios/baños | v4.0 | Nuevos campos de salida. Corrige monoambientes clasificados como 1 dorm |
| `dormitorios_confianza` | v4.0 | Nuevo campo de confianza |
| `estado_construccion` | v4.0 | Simplificado a solo `preventa` / `entrega_inmediata` |
| Secciones de input | v4.0 | TÍTULO, UBICACIÓN, DATOS PORTAL, DATOS EXTRACTOR separados |
| Regla de prioridad | v4.0 | "texto contradice dato portal → usar texto" explícita |
| `--model` flag | v4.0 | Alternar Haiku/Sonnet para comparar |
| `--save-to-db` flag | v4.0 | Backfill directo a BD |
| `--print-prompt` flag | v4.0 | Ver prompt completo en dry-run |
| Función SQL v2.0 | v4.0 | Modo observación — solo guarda, no actualiza columnas |
| `solo_tc_paralelo` redefinido | v4.1 | Semántica cambiada — ver sección abajo |

## Fase A — Backfill + Auditoría (2026-03-17)

### Resultados del backfill

- **352 props** procesadas, 0 errores, 352 guardadas en BD
- Modelo: Haiku 4.5, prompt v4.1
- Costo total: $1.71

### Auditoría de difiere

| Campo | Difiere | Resultado auditoría |
|-------|---------|---------------------|
| solo_tc_paralelo | 59 | 59/59 correctos — todos `false→true`, BD no tenía dato, LLM detectó dólares/paralelo en descripción |
| estado_construccion | 43 | 43/43 correctos — 15 `nuevo_a_estrenar→entrega_inmediata` (mapeo v4.1), 6 `no_especificado→entrega_inmediata` (LLM agrega), 5 `preventa→entrega_inmediata` (edificio entregado), 17 `entrega_inmediata→preventa` (descripción portal no actualizada, LLM lee correcto) |
| nombre_edificio | 26 | 26/26 correctos — correcciones de nombre basura (calles, "Venta Aestrenar"), normalización de formato, y correcciones de edificio equivocado |
| dormitorios | 32 | 31/32 correctos — 25 monoambientes (1→0), 6 correcciones verificadas, 1 pendiente |
| es_multiproyecto | 6 | 6/6 eran falsos positivos — corregidos con instrucción explícita en prompt v4.1 y re-corrida |

### Instrucción es_multiproyecto agregada en v4.1

**Problema:** El LLM marcaba `es_multiproyecto: true` cuando la descripción mencionaba múltiples tipologías ("departamentos de 1 y 2 dormitorios"), aunque la metadata del portal tenía precio/área/dormitorios específicos de una unidad.

**Criterio correcto:** `true` solo cuando faltan 2 o más de estos 3 datos en metadata portal (precio, área, dormitorios) Y la descripción habla del proyecto en general. Si el portal tiene los 3 datos → siempre `false`.

## Decisiones de diseño

### Parse error y estado muerto silencioso

**Problema encontrado:** Cuando el LLM devuelve JSON inválido (parse error), la implementación original guardaba `llm_output: {}` en `datos_json_enrichment`. El query de pendientes del workflow filtra con `datos_json_enrichment->'llm_output' IS NULL`. Un `{}` vacío no es NULL — esa prop quedaba excluida de futuros reintentos para siempre.

**Fix:** En parse error, se guarda solo `llm_metadata` con `parse_error: true`, sin `llm_output`. La prop queda elegible para retry la noche siguiente.

Implementado en 3 lugares:
- **Nodo n8n "Parsear y Validar"**: `datos_llm = null` + early return con `parse_error: true`
- **Función SQL**: bifurcación `IF p_datos_llm IS NOT NULL` — con NULL guarda solo metadata
- **Script con `--save-to-db`**: en parse error llama `saveToDb(propId, null, ...)` para registrar intento fallido

### Cadena de prioridad de dormitorios (Paso 8 — futuro)

**Problema:** La cadena original `candado → discovery → LLM` no resuelve el caso de monoambientes. Discovery dice 1 (dato del portal, incorrecto), LLM dice 0 con confianza alta, pero discovery tiene precedencia y gana siempre.

**Cadena correcta (para implementar en merge v2.4):**

```
candado → LLM (si confianza alta Y difiere de discovery) → discovery → regex
```

```sql
-- Pseudocódigo
IF campo_bloqueado('dormitorios') THEN mantener
ELSIF llm_dormitorios IS NOT NULL
  AND llm_dormitorios_confianza = 'alta'
  AND llm_dormitorios != discovery_dormitorios THEN usar LLM
ELSIF discovery_dormitorios IS NOT NULL THEN usar discovery
ELSE mantener existente
```

### Redefinición de `solo_tc_paralelo` (v4.0 → v4.1)

**Problema encontrado en test N=30 (v4.0):** 6 `llm_difiere` en `solo_tc_paralelo`. Auditoría manual reveló que la regla original ("true solo si exige exclusivamente dólares sin alternativa") no reflejaba el criterio real del negocio.

Ejemplos del test:
- `"PAGO EN DOLARES"` → v4.0 decía true (correcto), BD tenía false (BD mal)
- `"Dólares y/o T/C paralelo"` → v4.0 decía true (falso positivo según regla vieja, correcto según criterio real)
- `"en dolares o paralelo del dia"` → v4.0 decía false (siguió regla vieja), pero debería ser true

**Criterio real (v4.1):** En el mercado inmobiliario boliviano, si un vendedor menciona dólares o TC paralelo como forma de pago — en cualquier combinación — está indicando que opera fuera del TC oficial. `solo_tc_paralelo = true` si hay cualquier mención de dólares/paralelo como forma de pago. Solo es `false` si acepta explícitamente bolivianos o TC oficial como alternativa ("dólares o bolivianos", "se acepta Bs", "al cambio oficial"), o si no hay información de forma de pago.

**Cambio en prompt:** Regla reescrita con ejemplos positivos (true) y negativos (false) realistas. Eliminados los ejemplos contradictorios de v4.0 ("dólares O paralelo = false").

### Comportamiento de --save-to-db con parse error

Con `--save-to-db` activo, un parse error **sí registra** el intento fallido en BD llamando `saveToDb(propId, null, tokens, true, errores)`. La función SQL guarda solo metadata (sin `llm_output`), dejando la prop elegible para retry. Sin `--save-to-db`, un parse error solo incrementa el contador de errores y la prop aparece en el output JSON local.

### Modo observación (función SQL v2.0)

La función **solo guarda** `llm_output` y `llm_metadata` en `datos_json_enrichment`. No actualiza ninguna columna directamente (`nombre_edificio`, `dormitorios`, etc.). La v1.0 escribía a todas las columnas respetando candados — la v2.0 elimina eso intencionalmente para la fase de auditoría (Pasos 6-7). La escritura a columnas se activará en el merge (Paso 8) después de 2+ semanas de auditoría limpia.

## Modelo elegido: Haiku 4.5

**Decisión (2026-03-16):** Haiku gana sobre Sonnet para producción.

Comparación N=30 con prompt v4.1 (mismas 30 props):

| Métrica | Haiku | Sonnet |
|---------|-------|--------|
| Igual | 356 | 353 |
| LLM agrega | 132 | 138 |
| LLM no detecta | 4 | 4 |
| LLM difiere | 18 | 15 |
| Errores | 0 | 0 |
| Tiempo promedio/prop | ~4.5s | ~6.5s |
| Costo total N=30 | $0.15 | $0.56 |

**Por qué Haiku:** Accuracy prácticamente idéntica (diferencia de 3 difiere en 510 comparaciones = 0.6%). Sonnet llena 6 gaps más pero también es 3.7x más caro y 44% más lento. A ~7 props/noche la diferencia mensual es $1 vs $3.60 — ambos insignificantes, pero no hay ganancia de calidad que justifique Sonnet.

## Costo estimado (Haiku 4.5)

| Concepto | Valor |
|----------|-------|
| Costo/prop | ~$0.005 |
| Props/noche | ~7-10 |
| Costo/mes | ~$1.00-1.50 |
