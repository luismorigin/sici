# Pipeline Alquiler — Canonical Reference v1.0

**Estado:** PRODUCCIÓN (activado 12 Feb 2026)
**Tabla:** `propiedades_v2` (compartida con venta)
**Tipo operación:** `alquiler`

---

## Principio Fundamental

> **CERO cambios a funciones del sistema vivo de venta.**

El pipeline de alquiler usa funciones **completamente separadas** (`_alquiler`). Comparten la tabla `propiedades_v2` pero nunca se modifican las funciones de venta (`registrar_discovery`, `registrar_enrichment`, `merge_discovery_enrichment`).

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────┐
│                      PIPELINE NOCTURNO ALQUILER                       │
│                                                                       │
│  2:00 AM    Discovery C21 ──→ registrar_discovery_alquiler()         │
│  2:15 AM    Discovery Remax ──→ registrar_discovery_alquiler()       │
│  3:00 AM    Enrichment LLM ──→ registrar_enrichment_alquiler()      │
│  4:00 AM    Merge ──→ merge_alquiler()                               │
│  (cron)     Verificador ──→ Flujo C universal (venta + alquiler)     │
│  9:00 AM    Snapshot ──→ snapshot_absorcion_mercado()                │
│                                                                       │
│  Tabla: propiedades_v2 (WHERE tipo_operacion = 'alquiler')           │
└──────────────────────────────────────────────────────────────────────┘
```

### Comparación con Pipeline Venta

| Aspecto | Venta | Alquiler |
|---------|-------|----------|
| Discovery | `registrar_discovery()` | `registrar_discovery_alquiler()` |
| Enrichment | Flujo B (regex extractores) | LLM Claude Haiku (via Anthropic API) |
| Merge prioridad | **Discovery > Enrichment** | **Enrichment > Discovery** (LLM-first) |
| TC paralelo | Sí (Binance P2P) | No (alquileres en BOB fijo, TC oficial 6.96) |
| Score fiduciario | Sí | No (no aplica a rentas) |
| Precio/m² | Sí | No (irrelevante para alquiler) |
| Matching a proyectos | Sí (nocturno + HITL) | No (futuro) |
| Verificación inactivas | Flujo C (universal) | Flujo C (universal) |
| Tabla | `propiedades_v2` | `propiedades_v2` (misma) |

---

## Fase 1: Discovery

### Función: `registrar_discovery_alquiler()`

**Migración:** `sql/migrations/136_registrar_discovery_alquiler.sql`
**Tipo:** INSERT/UPDATE idempotente

#### Parámetros

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `p_url` | VARCHAR | Sí | URL de la propiedad |
| `p_fuente` | VARCHAR | Sí | `'century21'` o `'remax'` |
| `p_codigo_propiedad` | VARCHAR | No | Código único de la fuente |
| `p_precio_mensual_bob` | NUMERIC | No | Precio mensual en Bs (canónico) |
| `p_precio_mensual_usd` | NUMERIC | No | Precio mensual en USD (si viene explícito) |
| `p_moneda_original` | VARCHAR | No | `'BOB'` (default) o `'USD'` |
| `p_area_total_m2` | NUMERIC | No | Área en m² |
| `p_dormitorios` | INTEGER | No | Cantidad dormitorios |
| `p_banos` | NUMERIC | No | Cantidad baños |
| `p_estacionamientos` | INTEGER | No | Cantidad estacionamientos |
| `p_tipo_propiedad_original` | TEXT | No | `'departamento'`, `'casa'`, etc. |
| `p_latitud` / `p_longitud` | NUMERIC | No | Coordenadas GPS |
| `p_zona` | TEXT | No | Zona detectada |
| `p_datos_json_discovery` | JSONB | No | JSON completo del scraping |

#### Retorno

```sql
TABLE(id INTEGER, accion TEXT, mensaje TEXT)
-- accion: 'inserted', 'updated', 'skipped', 'error'
```

#### Lógica de Decision

```
¿Existe (url + fuente + tipo_operacion='alquiler')?
  │
  ├─ NO → INSERT como 'nueva'
  │        tipo_operacion = 'alquiler' (siempre)
  │        es_activa = TRUE
  │        precio_usd = precio_mensual_bob / 6.96 (compatibilidad)
  │
  └─ SÍ → ¿status = 'inactivo_confirmed'?
           │
           ├─ SÍ → SKIP (no tocar inactivas confirmadas)
           │
           └─ NO → UPDATE respetando campos_bloqueados
                    status: excluido/inactivo_pending → 'nueva'
                    status: completado → 'actualizado'
```

#### Diferencias con Discovery Venta

1. **No excluye alquileres:** Discovery venta marca `tipo_operacion != 'venta'` como `excluido_operacion`. Discovery alquiler acepta todo como `'nueva'`.
2. **Filtro por tipo_operacion:** WHERE incluye `AND tipo_operacion = 'alquiler'` para no colisionar con ventas de la misma URL.
3. **Precio en BOB:** El campo canónico es `precio_mensual_bob`, no `precio_usd`. Se calcula USD con TC oficial fijo (6.96).
4. **Reactivación:** Si estaba `excluido_operacion` o `inactivo_pending`, pasa a `'nueva'`.

### Workflows n8n Discovery

#### Discovery C21 Alquiler
- **Archivo:** `n8n/workflows/alquiler/flujo_discovery_c21_alquiler_v1.0.0.json`
- **Cron:** 2:00 AM
- **Método:** Firecrawl scrape de `c21.com.bo/propiedades?operacion=alquiler&zona=Equipetrol`
- **Parser:** Cheerio HTML → URLs → scrape individual → `registrar_discovery_alquiler()`
- **Batch:** 5 props, 3s entre batches
- **Marcar ausentes:**
  ```sql
  UPDATE propiedades_v2
  SET status = 'inactivo_pending',
      fecha_discovery = NOW(),
      primera_ausencia_at = COALESCE(primera_ausencia_at, NOW())
  WHERE id = $1
    AND tipo_operacion = 'alquiler'
    AND status NOT IN ('inactivo_pending', 'inactivo_confirmed')
  ```

#### Discovery Remax Alquiler
- **Archivo:** `n8n/workflows/alquiler/flujo_discovery_remax_alquiler_v1.0.0.json`
- **Cron:** 2:15 AM
- **Método:** API REST `remax.bo/api/properties?transaction_type=2` + Firecrawl HTML complementario
- **Parser:** JSON API → transform → `registrar_discovery_alquiler()`

---

## Fase 2: Enrichment LLM

### Función: `registrar_enrichment_alquiler()`

**Migración:** `sql/migrations/137_registrar_enrichment_alquiler.sql`

#### Parámetros

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `p_id` | INTEGER | Sí | ID en propiedades_v2 |
| `p_datos_llm` | JSONB | Sí | JSON completo del output LLM |
| `p_modelo_usado` | TEXT | No | `'claude-haiku-4.0'` (default) |
| `p_tokens_usados` | INTEGER | No | Tokens consumidos |
| `p_requiere_revision` | BOOLEAN | No | Flag si falló validación |
| `p_errores_validacion` | TEXT[] | No | Lista de errores detectados |

#### Campos que extrae el LLM

**Específicos de alquiler (8 columnas — migración 135):**

| Columna | Tipo | Constraint | Descripción |
|---------|------|-----------|-------------|
| `precio_mensual_bob` | NUMERIC(10,2) | > 0 | Precio mensual en Bs |
| `precio_mensual_usd` | NUMERIC(10,2) | — | Precio en USD (auto-calculado si no viene) |
| `deposito_meses` | NUMERIC(2,1) | 0-6 | Depósito garantía en meses |
| `amoblado` | TEXT | `si/no/semi/null` | Estado amoblado |
| `acepta_mascotas` | BOOLEAN | — | Acepta mascotas |
| `servicios_incluidos` | JSONB | array | `["agua","luz","internet"]` |
| `contrato_minimo_meses` | INTEGER | 1-60 | Duración mínima contrato |
| `monto_expensas_bob` | NUMERIC(10,2) | >= 0 | Gastos comunes en Bs |

**Compartidos con venta (se escriben a las mismas columnas):**

| Columna | Descripción |
|---------|-------------|
| `area_total_m2` | Área en m² |
| `dormitorios` | Cantidad |
| `banos` | Cantidad (guard: < 100) |
| `estacionamientos` | Cantidad |
| `baulera` | Boolean |
| `piso` | Número de piso |
| `nombre_edificio` | Nombre del edificio |

#### LLM: Modelo y Costos

- **Modelo:** Claude Haiku 4.0 (via Anthropic API)
- **Costo:** ~$0.0044/propiedad ($0.22/mes para 50 props)
- **Prompt:** Ver `docs/alquiler/LLM_ENRICHMENT_PROMPT.md`
- **Validación post-LLM en n8n:**
  - Precio no nulo
  - Dormitorios 0-10
  - Área 15-1000 m²
  - Expensas < precio alquiler

#### Diferencias con Enrichment Venta

1. **LLM vs Regex:** Venta usa extractores regex/HTML en Flujo B. Alquiler usa Claude Haiku API.
2. **Campos únicos:** Amoblado, mascotas, servicios incluidos, depósito, contrato mínimo, expensas.
3. **Sin TC paralelo:** No convierte con Binance. Usa TC oficial fijo 6.96.
4. **HTML completo:** El LLM recibe el HTML raw completo (hasta 50k chars).

### Workflow n8n Enrichment

- **Archivo:** `n8n/workflows/alquiler/flujo_enrichment_llm_alquiler_v1.0.0.json`
- **Cron:** 3:00 AM
- **Query:** Props con `status IN ('nueva', 'actualizado')` y `tipo_operacion = 'alquiler'`
- **Batch:** 10 props, 5s entre batches
- **Modelo:** `claude-haiku-4-20250514`
- **Rate limit:** 50 props/noche máximo
- **Notificaciones:** Slack si hay props con `requiere_revision`

---

## Fase 3: Merge

### Función: `merge_alquiler()`

**Migración:** `sql/migrations/138_merge_alquiler.sql`

#### Parámetros

```sql
merge_alquiler(p_id INTEGER DEFAULT NULL)
-- Si NULL: procesa todas las pendientes de alquiler
-- Si ID: procesa solo esa propiedad
```

#### Retorno

```sql
TABLE(id INTEGER, accion TEXT, mensaje TEXT)
-- accion: 'merged', 'no_pending'
```

#### Prioridad de Resolución: ENRICHMENT-FIRST

```
Para cada campo:
  1. ¿Campo bloqueado (candado)?     → usar valor actual (candado gana siempre)
  2. ¿Columna ya tiene valor?        → usar valor en columna (ya escrito por enrichment)
  3. ¿Está en datos_json_enrichment?  → usar valor del LLM
  4. Ninguno                          → NULL
```

**Esto es INVERSO a venta**, donde Discovery gana sobre Enrichment para campos físicos. En alquiler, el LLM (enrichment) es más preciso que el scraping (discovery), por eso tiene prioridad.

#### Campos resueltos en merge

| Campo | Fuente prioritaria | Fallback |
|-------|-------------------|----------|
| `precio_mensual_bob` | Columna (enrichment) | enrichment JSON |
| `precio_mensual_usd` | Columna → auto-calc (BOB/6.96) | — |
| `area_total_m2` | Columna > 0 | NULL |
| `dormitorios` | Columna | NULL |
| `banos` | Columna (< 100) | NULL |
| `estacionamientos` | Columna | NULL |
| `nombre_edificio` | Columna | NULL |
| `amoblado` | LLM output | columna actual |
| `acepta_mascotas` | LLM output | columna actual |
| `deposito_meses` | LLM output | columna actual |
| `contrato_minimo_meses` | LLM output | columna actual |
| `monto_expensas_bob` | LLM output | columna actual |
| `piso` | LLM output | columna actual |
| `baulera` | LLM output | columna actual |

#### Post-merge

- **Status:** `'completado'`
- **es_para_matching:** `TRUE` si tiene precio + área + dormitorios
- **datos_json:** Se agrega `merge_alquiler` con fuentes y versión (audit trail)
- **cambios_merge:** JSONB con tipo, fuentes, fecha

#### Diferencias con Merge Venta

| Aspecto | Merge Venta | Merge Alquiler |
|---------|------------|----------------|
| Prioridad | Discovery > Enrichment | **Enrichment > Discovery** |
| TC paralelo | Sí (Binance P2P, fallback 10%) | No (TC oficial 6.96 fijo) |
| Score fiduciario | Calculado post-merge | No existe |
| Precio/m² | Calculado | No calculado |
| Campos únicos | forma_pago, plan_pagos | amoblado, mascotas, servicios, depósito, contrato, expensas |

### Workflow n8n Merge

- **Archivo:** `n8n/workflows/alquiler/flujo_merge_alquiler_v1.0.0.json`
- **Cron:** 4:00 AM
- **Query:** `SELECT * FROM merge_alquiler()`
- **Notificación:** Slack con count de merged

---

## Fase 4: Verificación (Flujo C Universal)

El Flujo C es **compartido** entre venta y alquiler. No hay flujo C separado.

**Query actual en producción:**
```sql
SELECT id, url, fuente, codigo_propiedad, status, primera_ausencia_at,
  EXTRACT(DAY FROM NOW() - primera_ausencia_at)::INTEGER as dias_desde_ausencia
FROM propiedades_v2
WHERE status = 'inactivo_pending'::estado_propiedad
  AND fuente = 'remax'
ORDER BY primera_ausencia_at ASC
LIMIT 200;
```

**Nota:** Sin filtro de `tipo_operacion` — procesa venta y alquiler juntos.

### Lógica de decisión

```
Para cada propiedad inactivo_pending:
  │
  ├─ HTTP HEAD → 200 (activa) → Reactivar a 'completado'
  │
  └─ HTTP HEAD → no 200 (inactiva)
       │
       ├─ dias_desde_ausencia >= 7 → Confirmar 'inactivo_confirmed'
       │
       └─ dias_desde_ausencia < 7  → Mantener 'inactivo_pending' (esperar)
```

### Patrón crítico: `primera_ausencia_at`

**TODOS** los queries de "marcar ausente" en Discovery (venta y alquiler) DEBEN incluir:
```sql
primera_ausencia_at = COALESCE(primera_ausencia_at, NOW())
```

Sin esto, Flujo C no puede calcular `dias_desde_ausencia` y las propiedades quedan en limbo permanente.

---

## Transiciones de Estado

```
                    ┌──────────────┐
                    │   NUEVA      │ ← INSERT (registrar_discovery_alquiler)
                    └──────┬───────┘
                           │
                    Enrichment LLM
                           │
                    ┌──────▼───────┐
                    │ ACTUALIZADO  │ ← UPDATE (registrar_enrichment_alquiler)
                    └──────┬───────┘
                           │
                       Merge
                           │
                    ┌──────▼───────┐
          ┌────────│ COMPLETADO   │←─────────┐
          │        └──────┬───────┘           │
          │               │                   │
     Re-discovery   No aparece en         HTTP 200
     (actualizar)   Discovery              (reactiva)
          │               │                   │
          │        ┌──────▼───────┐           │
          │        │  INACTIVO    │───────────┘
          └────────│  PENDING     │
                   └──────┬───────┘
                          │
                    ≥ 7 días sin HTTP 200
                          │
                   ┌──────▼───────┐
                   │  INACTIVO    │
                   │  CONFIRMED   │ → Cuenta como "absorbida" en snapshots
                   └──────────────┘
```

**Nota:** No existe el status `excluido_operacion` para nuevos alquileres. Ese status solo aplicaba cuando la función `registrar_discovery()` de venta encontraba un alquiler.

---

## Columnas Específicas de Alquiler (Migración 135)

| Columna | Tipo | Constraint | Índice |
|---------|------|-----------|--------|
| `precio_mensual_bob` | NUMERIC(10,2) | CHECK > 0 | `idx_prop_alquiler_activo` |
| `precio_mensual_usd` | NUMERIC(10,2) | — | — |
| `deposito_meses` | NUMERIC(2,1) | CHECK 0-6 | — |
| `amoblado` | TEXT | CHECK `si/no/semi/null` | — |
| `acepta_mascotas` | BOOLEAN | — | — |
| `servicios_incluidos` | JSONB | DEFAULT `[]` | — |
| `contrato_minimo_meses` | INTEGER | CHECK 1-60 | — |
| `monto_expensas_bob` | NUMERIC(10,2) | CHECK >= 0 | — |

### Índices

```sql
-- Búsquedas de alquiler activas
idx_prop_alquiler_activo ON (precio_mensual_bob)
  WHERE tipo_operacion = 'alquiler' AND status = 'completado' AND duplicado_de IS NULL

-- Pipeline nocturno
idx_prop_alquiler_pipeline ON (status)
  WHERE tipo_operacion = 'alquiler' AND status IN ('nueva', 'actualizado')

-- Filtros comunes
idx_prop_alquiler_filtros ON (dormitorios, precio_mensual_bob)
  WHERE tipo_operacion = 'alquiler' AND status = 'completado' AND duplicado_de IS NULL
```

---

## Precio: BOB como Moneda Canónica

En Bolivia, los alquileres se negocian en **bolivianos (Bs)**. A diferencia de ventas (que son en USD), el campo canónico es `precio_mensual_bob`.

**Conversión a USD:**
```
precio_mensual_usd = precio_mensual_bob / 6.96
```

El TC usado es el **oficial** (6.96, fijo desde 2011). **No se usa** el TC paralelo de Binance porque:
1. Los contratos de alquiler se firman en Bs
2. No hay volatilidad cambiaria en el mercado de alquileres
3. El TC paralelo es relevante solo para compraventa en USD

---

## Migraciones

| # | Archivo | Propósito |
|---|---------|-----------|
| 135 | `rental_columns.sql` | 8 columnas + 5 CHECK + 3 índices |
| 136 | `registrar_discovery_alquiler.sql` | Función discovery independiente |
| 137 | `registrar_enrichment_alquiler.sql` | Función enrichment LLM con candados |
| 138 | `merge_alquiler.sql` | Merge enrichment-first, sin TC paralelo |
| 139 | `reactivar_alquileres_existentes.sql` | Reactivar 61 alquileres previamente excluidos |

---

## Workflows n8n

| Workflow | Cron | Duración | Archivo |
|----------|------|----------|---------|
| Discovery C21 Alquiler | 2:00 AM | ~15 min | `alquiler/flujo_discovery_c21_alquiler_v1.0.0.json` |
| Discovery Remax Alquiler | 2:15 AM | ~10 min | `alquiler/flujo_discovery_remax_alquiler_v1.0.0.json` |
| Enrichment LLM | 3:00 AM | ~30 min | `alquiler/flujo_enrichment_llm_alquiler_v1.0.0.json` |
| Merge | 4:00 AM | ~2 min | `alquiler/flujo_merge_alquiler_v1.0.0.json` |
| Verificador | Universal | — | `modulo_1/flujo_c_verificador_v1.1.0_FINAL.json` |

### Variables de Entorno

```
ANTHROPIC_API_KEY=sk-ant-api03-...    # Claude Haiku
FIRECRAWL_API_KEY=fc-...              # Scraping
SLACK_WEBHOOK_SICI=https://...        # Notificaciones
```

---

## Permisos

```sql
-- Funciones
GRANT EXECUTE ON FUNCTION registrar_discovery_alquiler TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION registrar_enrichment_alquiler TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION merge_alquiler TO authenticated, service_role;
```

---

## Queries de Monitoreo

```sql
-- Estado pipeline alquiler
SELECT status, fuente, COUNT(*)
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler'
GROUP BY 1, 2
ORDER BY 1;

-- Alquileres pendientes de enrichment
SELECT COUNT(*)
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler'
  AND status IN ('nueva', 'actualizado');

-- Métricas de precios activos
SELECT
  dormitorios,
  COUNT(*) as activas,
  ROUND(AVG(precio_mensual_bob)) as avg_bob,
  ROUND(AVG(precio_mensual_usd)) as avg_usd
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler'
  AND status = 'completado'
  AND area_total_m2 >= 20
GROUP BY dormitorios
ORDER BY dormitorios;

-- Últimas ejecuciones
SELECT workflow_name, status, fecha_inicio
FROM workflow_executions
WHERE workflow_name LIKE '%alquiler%'
ORDER BY fecha_inicio DESC
LIMIT 10;
```

---

## Documentación Relacionada

| Documento | Propósito |
|-----------|-----------|
| `docs/alquiler/LLM_ENRICHMENT_PROMPT.md` | Prompt template para Claude Haiku |
| `docs/alquiler/N8N_WORKFLOWS_ALQUILER.md` | Detalle nodos n8n (pseudocódigo) |
| `docs/alquiler/COSTOS_ROI_LLM.md` | Análisis costos LLM vs regex |
| `docs/alquiler/ROADMAP_IMPLEMENTACION.md` | Roadmap original (14 días) |
| `docs/planning/ALQUILERES_INVESTIGACION.md` | Investigación inicial (6 capas exclusión) |
| `docs/modulo_2/BITACORA_SNAPSHOTS_FEB_2026.md` | Bitácora contaminación snapshots |
| `docs/canonical/discovery_canonical_v2.md` | Pipeline venta (referencia) |
| `docs/canonical/merge_canonical.md` | Merge venta (referencia) |
