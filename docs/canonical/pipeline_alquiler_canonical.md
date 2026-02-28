# Pipeline Alquiler — Canonical Reference v2.0

**Actualizado:** 28 Feb 2026
**Estado:** PRODUCCION (activado 12 Feb 2026)
**Tabla:** `propiedades_v2` (compartida con venta)
**Tipo operacion:** `alquiler`
**Fuentes:** Century 21, Remax, Bien Inmuebles (3 fuentes)

---

## Principio Fundamental

> **CERO cambios a funciones del sistema vivo de venta.**

El pipeline de alquiler usa funciones **completamente separadas** (`_alquiler`). Comparten la tabla `propiedades_v2` pero nunca se modifican las funciones de venta (`registrar_discovery`, `registrar_enrichment`, `merge_discovery_enrichment`).

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────┐
│                      PIPELINE NOCTURNO ALQUILER                     │
│                                                                     │
│  1:30 AM    Discovery C21 + Remax ──→ registrar_discovery_alquiler()│
│  2:30 AM    Discovery Bien Inmuebles + Enrichment LLM              │
│  3:30 AM    Merge ──→ merge_alquiler() ──→ trigger matching        │
│  7:00 AM    Verificador ──→ dual mode (pending + ghost detection)  │
│  9:00 AM    Snapshot ──→ snapshot_absorcion_mercado()               │
│                                                                     │
│  Tabla: propiedades_v2 (WHERE tipo_operacion = 'alquiler')          │
└──────────────────────────────────────────────────────────────────────┘
```

### Numeros de Produccion (28 Feb 2026)

| Fuente | Completado | Inactivo Pending | Inactivo Confirmed |
|--------|------------|------------------|--------------------|
| Century 21 | 150 | 0 | 79 |
| Remax | 27 | 10 | 37 |
| Bien Inmuebles | 5 | 0 | 2 |
| **Total** | **182** | **10** | **118** |

**Matching rate:** 91.2% (166/182 completadas con `id_proyecto_master`)

### Comparacion con Pipeline Venta

| Aspecto | Venta | Alquiler |
|---------|-------|----------|
| Discovery | `registrar_discovery()` | `registrar_discovery_alquiler()` |
| Fuentes | Century 21, Remax | Century 21, Remax, **Bien Inmuebles** |
| Enrichment | Flujo B (regex extractores) | LLM Claude Haiku (via Anthropic API) |
| Merge prioridad | **Discovery > Enrichment** | **Enrichment > Discovery** (LLM-first) |
| TC paralelo | Si (Binance P2P) | No (alquileres en BOB fijo, TC oficial 6.96) |
| Score fiduciario | Si | No (no aplica a rentas) |
| Precio/m2 | Si | No (irrelevante para alquiler) |
| Matching a proyectos | Si (nocturno + HITL) | Si (trigger en merge + HITL trigram) |
| Verificacion inactivas | Workflow separado venta | **Workflow separado alquiler** |
| Tabla | `propiedades_v2` | `propiedades_v2` (misma) |

---

## Fase 1: Discovery

### Funcion: `registrar_discovery_alquiler()`

**Migracion:** `sql/migrations/136_registrar_discovery_alquiler.sql`
**Tipo:** INSERT/UPDATE idempotente

#### Parametros

| Parametro | Tipo | Obligatorio | Descripcion |
|-----------|------|-------------|-------------|
| `p_url` | VARCHAR | Si | URL de la propiedad |
| `p_fuente` | VARCHAR | Si | `'century21'`, `'remax'`, o `'bien_inmuebles'` |
| `p_codigo_propiedad` | VARCHAR | No | Codigo unico de la fuente |
| `p_precio_mensual_bob` | NUMERIC | No | Precio mensual en Bs (canonico) |
| `p_precio_mensual_usd` | NUMERIC | No | Precio mensual en USD (si viene explicito) |
| `p_moneda_original` | VARCHAR | No | `'BOB'` (default) o `'USD'` |
| `p_area_total_m2` | NUMERIC | No | Area en m2 |
| `p_dormitorios` | INTEGER | No | Cantidad dormitorios |
| `p_banos` | NUMERIC | No | Cantidad banos |
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

#### Logica de Decision

```
Existe (url + fuente + tipo_operacion='alquiler')?
  |
  +-- NO --> INSERT como 'nueva'
  |          tipo_operacion = 'alquiler' (siempre)
  |          es_activa = TRUE
  |          precio_usd = precio_mensual_bob / 6.96 (compatibilidad)
  |
  +-- SI --> status = 'inactivo_confirmed'?
             |
             +-- SI --> SKIP (no tocar inactivas confirmadas)
             |
             +-- NO --> UPDATE respetando campos_bloqueados
                        status: excluido/inactivo_pending --> 'nueva'
                        status: completado --> 'actualizado'
```

#### Diferencias con Discovery Venta

1. **No excluye alquileres:** Discovery venta marca `tipo_operacion != 'venta'` como `excluido_operacion`. Discovery alquiler acepta todo como `'nueva'`.
2. **Filtro por tipo_operacion:** WHERE incluye `AND tipo_operacion = 'alquiler'` para no colisionar con ventas de la misma URL.
3. **Precio en BOB:** El campo canonico es `precio_mensual_bob`, no `precio_usd`. Se calcula USD con TC oficial fijo (6.96).
4. **Reactivacion:** Si estaba `excluido_operacion` o `inactivo_pending`, pasa a `'nueva'`.

### Workflows n8n Discovery

#### Discovery C21 Alquiler
- **Archivo:** `n8n/workflows/alquiler/flujo_discovery_c21_alquiler_v1.0.0.json`
- **Cron:** 1:30 AM
- **Metodo:** Firecrawl scrape de `c21.com.bo/propiedades?operacion=alquiler&zona=Equipetrol`
- **Parser:** Cheerio HTML -> URLs -> scrape individual -> `registrar_discovery_alquiler()`
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
- **Cron:** 1:30 AM (junto con C21)
- **Metodo:** API REST `remax.bo/api/properties?transaction_type=2` + Firecrawl HTML complementario
- **Parser:** JSON API -> transform -> `registrar_discovery_alquiler()`

#### Discovery Bien Inmuebles (3ra fuente)
- **Archivo:** `n8n/workflows/alquiler/flujo_discovery_bien_inmuebles_alquiler.json`
- **Cron:** 2:30 AM
- **Fuente BD:** `bien_inmuebles`
- **Metodo:** Firecrawl scrape de `bieninmuebles.com.bo`
- **Particularidades:**
  - **Sin `fecha_publicacion`:** La fuente no expone fecha. Se usa `fecha_discovery` del primer INSERT y se **preserva** en re-discovery (no se sobreescribe con NOW()). Fix: migracion 165.
  - **Fotos:** Regex `uploads/catalogo/pics/` del HTML crudo. Se ordena con `nomb_img` primero (sort).
  - **Agente/contacto:** Se extrae de la seccion `agent-sides_2` del HTML -> `<h4>` para nombre + regex `[67]\d{7}` para telefono.
  - **Importante:** WebFetch convierte HTML a markdown y pierde clases CSS. Para parsear correctamente, usar `curl` para obtener HTML crudo.
  - **`fecha_enrichment` DEBE ser NULL** para que el pipeline de enrichment procese la propiedad (no basta con status).

---

## Fase 2: Enrichment LLM

### Funcion: `registrar_enrichment_alquiler()`

**Migracion:** `sql/migrations/137_registrar_enrichment_alquiler.sql`

#### Parametros

| Parametro | Tipo | Obligatorio | Descripcion |
|-----------|------|-------------|-------------|
| `p_id` | INTEGER | Si | ID en propiedades_v2 |
| `p_datos_llm` | JSONB | Si | JSON completo del output LLM |
| `p_modelo_usado` | TEXT | No | `'claude-haiku-4.0'` (default) |
| `p_tokens_usados` | INTEGER | No | Tokens consumidos |
| `p_requiere_revision` | BOOLEAN | No | Flag si fallo validacion |
| `p_errores_validacion` | TEXT[] | No | Lista de errores detectados |

#### Campos que extrae el LLM

**Especificos de alquiler (8 columnas -- migracion 135):**

| Columna | Tipo | Constraint | Descripcion |
|---------|------|-----------|-------------|
| `precio_mensual_bob` | NUMERIC(10,2) | > 0 | Precio mensual en Bs |
| `precio_mensual_usd` | NUMERIC(10,2) | -- | Precio en USD (auto-calculado si no viene) |
| `deposito_meses` | NUMERIC(2,1) | 0-6 | Deposito garantia en meses |
| `amoblado` | TEXT | `si/no/semi/null` | Estado amoblado |
| `acepta_mascotas` | BOOLEAN | -- | Acepta mascotas |
| `servicios_incluidos` | JSONB | array | `["agua","luz","internet"]` |
| `contrato_minimo_meses` | INTEGER | 1-60 | Duracion minima contrato |
| `monto_expensas_bob` | NUMERIC(10,2) | >= 0 | Gastos comunes en Bs |

**Compartidos con venta (se escriben a las mismas columnas):**

| Columna | Descripcion |
|---------|-------------|
| `area_total_m2` | Area en m2 |
| `dormitorios` | Cantidad |
| `banos` | Cantidad (guard: < 100) |
| `estacionamientos` | Cantidad |
| `baulera` | Boolean |
| `piso` | Numero de piso |
| `nombre_edificio` | Nombre del edificio |

#### LLM: Modelo y Costos

- **Modelo:** Claude Haiku 4.0 (via Anthropic API)
- **Costo:** ~$0.0044/propiedad ($0.22/mes para 50 props)
- **Prompt:** Ver `docs/alquiler/LLM_ENRICHMENT_PROMPT.md`
- **Validacion post-LLM en n8n:**
  - Precio no nulo
  - Dormitorios 0-10
  - Area 15-1000 m2
  - Expensas < precio alquiler

#### Diferencias con Enrichment Venta

1. **LLM vs Regex:** Venta usa extractores regex/HTML en Flujo B. Alquiler usa Claude Haiku API.
2. **Campos unicos:** Amoblado, mascotas, servicios incluidos, deposito, contrato minimo, expensas.
3. **Sin TC paralelo:** No convierte con Binance. Usa TC oficial fijo 6.96.
4. **HTML completo:** El LLM recibe el HTML raw completo (hasta 50k chars).

### Workflow n8n Enrichment

- **Archivo:** `n8n/workflows/alquiler/flujo_enrichment_llm_alquiler_v1.0.0.json`
- **Cron:** 2:30 AM (junto con Discovery Bien Inmuebles)
- **Query:** Props con `status IN ('nueva', 'actualizado')` y `tipo_operacion = 'alquiler'`
- **Batch:** 10 props, 5s entre batches
- **Modelo:** `claude-haiku-4-20250514`
- **Rate limit:** 50 props/noche maximo
- **Notificaciones:** Slack si hay props con `requiere_revision`

---

## Fase 3: Merge

### Funcion: `merge_alquiler()`

**Migracion:** `sql/migrations/138_merge_alquiler.sql`

#### Parametros

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

#### Prioridad de Resolucion: ENRICHMENT-FIRST

```
Para cada campo:
  1. Campo bloqueado (candado)?     --> usar valor actual (candado gana siempre)
  2. Columna ya tiene valor?        --> usar valor en columna (ya escrito por enrichment)
  3. Esta en datos_json_enrichment?  --> usar valor del LLM
  4. Ninguno                         --> NULL
```

**Esto es INVERSO a venta**, donde Discovery gana sobre Enrichment para campos fisicos. En alquiler, el LLM (enrichment) es mas preciso que el scraping (discovery), por eso tiene prioridad.

#### Campos resueltos en merge

| Campo | Fuente prioritaria | Fallback |
|-------|-------------------|----------|
| `precio_mensual_bob` | Columna (enrichment) | enrichment JSON |
| `precio_mensual_usd` | Columna -> auto-calc (BOB/6.96) | -- |
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
- **es_para_matching:** `TRUE` si tiene precio + area + dormitorios
- **datos_json:** Se agrega `merge_alquiler` con fuentes y version (audit trail)
- **cambios_merge:** JSONB con tipo, fuentes, fecha

#### Diferencias con Merge Venta

| Aspecto | Merge Venta | Merge Alquiler |
|---------|------------|----------------|
| Prioridad | Discovery > Enrichment | **Enrichment > Discovery** |
| TC paralelo | Si (Binance P2P, fallback 10%) | No (TC oficial 6.96 fijo) |
| Score fiduciario | Calculado post-merge | No existe |
| Precio/m2 | Calculado | No calculado |
| Campos unicos | forma_pago, plan_pagos | amoblado, mascotas, servicios, deposito, contrato, expensas |

### Workflow n8n Merge

- **Archivo:** `n8n/workflows/alquiler/flujo_merge_alquiler_v1.0.0.json`
- **Cron:** 3:30 AM
- **Query:** `SELECT * FROM merge_alquiler()`
- **Notificacion:** Slack con count de merged
- **Nota:** merge_alquiler() NO copia fotos a columnas top-level. Las fotos se leen directamente de `datos_json_enrichment` en las RPCs del frontend (paths JSON varian por fuente: Remax/BI en `datos_json_enrichment.llm_output.fotos_urls`, C21 top-level).

---

## Fase 4: Verificacion (Verificador Alquiler)

El verificador de alquileres es un **workflow separado** del de ventas.

- **Archivo:** `n8n/workflows/alquiler/flujo_c_verificador_alquiler_v1.0.0.json`
- **Cron:** `0 7 * * *` (7:00 AM diario)
- **Scope:** Solo `tipo_operacion = 'alquiler'`
- **Limite total:** 100 propiedades por ejecucion (20 ghost + rest pending)
- **Delay:** 1.5s entre requests HTTP

### Modo Dual: Pending + Ghost Detection

El verificador opera en dos modos complementarios:

#### Modo 1: Pending (propiedades marcadas ausentes por Discovery)

```sql
SELECT id, url, fuente, codigo_propiedad, status, primera_ausencia_at,
  EXTRACT(DAY FROM NOW() - primera_ausencia_at)::INTEGER as dias_desde_ausencia
FROM propiedades_v2
WHERE status = 'inactivo_pending'::estado_propiedad
  AND tipo_operacion = 'alquiler'
ORDER BY primera_ausencia_at ASC
LIMIT 80;
```

**Logica:**
- HTTP 200 -> Reactivar a `completado`
- HTTP no-200 + dias >= 7 -> Confirmar `inactivo_confirmed`
- HTTP no-200 + dias < 7 -> Mantener `inactivo_pending` (esperar)

#### Modo 2: Ghost Detection (propiedades "fantasma" que Discovery no marca)

Detecta propiedades que siguen como `completado` + `es_activa=true` pero no aparecen en discovery hace mas de 14 dias. Esto atrapa listings removidos que Discovery no detecto (edge case con paginacion, URLs cambiadas, etc.).

```sql
SELECT id, url, fuente, status
FROM propiedades_v2
WHERE status = 'completado'
  AND es_activa = true
  AND tipo_operacion = 'alquiler'
  AND fecha_discovery < NOW() - INTERVAL '14 days'
  AND url NOT LIKE '%empty_%'
ORDER BY fecha_discovery ASC
LIMIT 20;
```

**Logica ghost:**
- HTTP 404 (o error) -> Marcar `inactivo_confirmed`, setear `fecha_inactivacion = NOW()`, `razon_inactiva = 'aviso_terminado'`
- HTTP 200 -> **SKIP** (sigue listado, Discovery simplemente no lo re-vio)

### Patron critico: `primera_ausencia_at`

**TODOS** los queries de "marcar ausente" en Discovery (venta y alquiler) DEBEN incluir:
```sql
primera_ausencia_at = COALESCE(primera_ausencia_at, NOW())
```

Sin esto, el verificador no puede calcular `dias_desde_ausencia` y las propiedades quedan en limbo permanente.

---

## Fase 5: Matching a Proyectos

### Sistema: Dictionary Lookup + Trigram (migraciones 141, 142, 146)

El matching de alquileres es **independiente** del de ventas. Opera en 3 niveles:

#### Tier 1 -- Exact Lookup (auto-approve, score 98%)
Busca `nombre_edificio` exacto en `mv_nombre_proyecto_lookup` (vista materializada con 512 variantes de 200 proyectos).

#### Tier 2 -- Normalized Lookup (auto-approve, score 90%)
Normaliza el nombre (`normalizar_nombre_edificio()`: quita prefijos, acentos, sufijos de zona) y busca en la vista. Si encuentra match, agrega el nombre original como alias al proyecto.

#### Tier 2.5 -- Trigram Similarity (HITL, score variable)
Usa `pg_trgm` con `similarity() >= 0.45` entre nombre normalizado y variantes del proyecto. Aplica bonus/penalty GPS:
- GPS < 100m -> +5 puntos
- GPS 100-500m -> neutral
- GPS > 500m -> -10 puntos

**Nunca auto-aprueba.** Siempre va a cola HITL en `/admin/supervisor/matching`.

#### Sin nombre -> `sin_match`
Propiedades sin `nombre_edificio` no generan sugerencias. Quedan para asignacion manual.

### Trigger automatico

```sql
trg_alquiler_matching BEFORE UPDATE ON propiedades_v2
  -- Se dispara cuando merge cambia status a 'completado'
  -- Solo para tipo_operacion = 'alquiler'
  -- Llama a matchear_alquiler(NEW.id)
```

El matching ocurre **automaticamente** durante el merge nocturno via trigger. No necesita workflow n8n separado.

### Batch para backlog

```sql
SELECT * FROM matching_alquileres_batch();
-- Procesa todas las propiedades completadas sin proyecto
-- Solo necesario para backlog inicial o re-proceso
```

### Migraciones matching

| # | Archivo | Proposito |
|---|---------|-----------|
| 141 | `matching_alquileres_lookup.sql` | Vista materializada, Tiers 1-2, trigger |
| 142 | `matching_alquileres_ejecutar_batch.sql` | Ejecucion batch inicial |
| 146 | `matching_alquileres_trigram_v2.sql` | Tier 2.5 trigram + GPS bonus/penalty |

---

## Query Layer: `buscar_unidades_alquiler()`

Funcion SQL que sirve el feed de alquileres en `/alquileres` y `/admin/alquileres`. Aplica filtros de calidad automaticamente:

- **Filtro antiguedad:** <= 150 dias (basado en vida mediana real: C21 34d, Remax 73d). Migracion 163.
- **Filtros estandar:** `duplicado_de IS NULL`, `area_total_m2 >= 20`, etc.
- **Busqueda por ID:** Cuando se busca por `#ID`, bypasea todos los filtros (status, zona, dormitorios).
- **Mapeo de zonas:** Expande slugs de UI a nombres sucios de BD (ver seccion Zonas en CLAUDE.md).

---

## Transiciones de Estado

```
                    +──────────────+
                    |   NUEVA      | <-- INSERT (registrar_discovery_alquiler)
                    +──────┬───────+
                           |
                    Enrichment LLM
                           |
                    +──────v───────+
                    | ACTUALIZADO  | <-- UPDATE (registrar_enrichment_alquiler)
                    +──────┬───────+
                           |
                       Merge
                           |
                    +──────v───────+
          +────────| COMPLETADO   |<─────────+
          |        +──────┬───────+           |
          |               |                   |
     Re-discovery   No aparece en         Verificador:
     (actualizar)   Discovery              HTTP 200
          |               |               (reactiva)
          |        +──────v───────+           |
          |        |  INACTIVO    |───────────+
          +────────|  PENDING     |
                   +──────┬───────+
                          |
                    >= 7 dias sin HTTP 200
                    O ghost detection (HTTP 404)
                          |
                   +──────v───────+
                   |  INACTIVO    |
                   |  CONFIRMED   | --> fecha_inactivacion + razon_inactiva
                   +──────────────+
```

**Nota:** No existe el status `excluido_operacion` para nuevos alquileres. Ese status solo aplicaba cuando la funcion `registrar_discovery()` de venta encontraba un alquiler.

---

## Sobre `expirado_stale` (migracion 164) -- NUNCA DESPLEGADO

La migracion 164 pretendia agregar un status `expirado_stale` al enum `estado_propiedad` para marcar propiedades con mas de 150 dias sin confirmacion de broker. **Este status nunca fue creado** porque la migracion asumio que `status` era free text, pero es un enum PostgreSQL (`estado_propiedad`). El `ALTER TYPE ... ADD VALUE` nunca se ejecuto.

**El filtro de 150 dias funciona correctamente** via clausula WHERE en `buscar_unidades_alquiler()`, no via transicion de status. Las propiedades viejas simplemente dejan de aparecer en el feed sin cambiar de status.

---

## Columnas Especificas de Alquiler (Migracion 135)

| Columna | Tipo | Constraint | Indice |
|---------|------|-----------|--------|
| `precio_mensual_bob` | NUMERIC(10,2) | CHECK > 0 | `idx_prop_alquiler_activo` |
| `precio_mensual_usd` | NUMERIC(10,2) | -- | -- |
| `deposito_meses` | NUMERIC(2,1) | CHECK 0-6 | -- |
| `amoblado` | TEXT | CHECK `si/no/semi/null` | -- |
| `acepta_mascotas` | BOOLEAN | -- | -- |
| `servicios_incluidos` | JSONB | DEFAULT `[]` | -- |
| `contrato_minimo_meses` | INTEGER | CHECK 1-60 | -- |
| `monto_expensas_bob` | NUMERIC(10,2) | CHECK >= 0 | -- |

### Indices

```sql
-- Busquedas de alquiler activas
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

## Precio: BOB como Moneda Canonica

En Bolivia, los alquileres se negocian en **bolivianos (Bs)**. A diferencia de ventas (que son en USD), el campo canonico es `precio_mensual_bob`.

**Conversion a USD:**
```
precio_mensual_usd = precio_mensual_bob / 6.96
```

El TC usado es el **oficial** (6.96, fijo desde 2011). **No se usa** el TC paralelo de Binance porque:
1. Los contratos de alquiler se firman en Bs
2. No hay volatilidad cambiaria en el mercado de alquileres
3. El TC paralelo es relevante solo para compraventa en USD

---

## Migraciones

### Core (launch)

| # | Archivo | Proposito |
|---|---------|-----------|
| 135 | `rental_columns.sql` | 8 columnas + 5 CHECK + 3 indices |
| 136 | `registrar_discovery_alquiler.sql` | Funcion discovery independiente |
| 137 | `registrar_enrichment_alquiler.sql` | Funcion enrichment LLM con candados |
| 138 | `merge_alquiler.sql` | Merge enrichment-first, sin TC paralelo |
| 139 | `reactivar_alquileres_existentes.sql` | Reactivar 61 alquileres previamente excluidos |
| 141 | `matching_alquileres_lookup.sql` | Matching Tiers 1-2: dictionary lookup + trigger |
| 142 | `matching_alquileres_ejecutar_batch.sql` | Ejecucion batch inicial matching |
| 146 | `matching_alquileres_trigram_v2.sql` | Tier 2.5: trigram + GPS bonus/penalty |

### Post-launch (147-169)

| # | Proposito | Estado |
|---|-----------|--------|
| 163 | Filtro antiguedad 180->150 dias basado en vida mediana real (C21: 34d, Remax: 73d) | Desplegado |
| 164 | `expirado_stale` status para props >150d | **NUNCA DESPLEGADO** (enum, no free text -- ver seccion arriba) |
| 165 | Fix fecha_discovery bug Bien Inmuebles: discovery sobreescribia con NOW() cada noche, causando days_in_market=0 siempre. Fix: preservar fecha_discovery si fuente no tiene fecha_publicacion | Desplegado |

---

## Workflows n8n

| Workflow | Cron | Duracion | Archivo |
|----------|------|----------|---------|
| Discovery C21 Alquiler | 1:30 AM | ~15 min | `alquiler/flujo_discovery_c21_alquiler_v1.0.0.json` |
| Discovery Remax Alquiler | 1:30 AM | ~10 min | `alquiler/flujo_discovery_remax_alquiler_v1.0.0.json` |
| Discovery Bien Inmuebles | 2:30 AM | ~10 min | `alquiler/flujo_discovery_bien_inmuebles_alquiler.json` |
| Enrichment LLM | 2:30 AM | ~30 min | `alquiler/flujo_enrichment_llm_alquiler_v1.0.0.json` |
| Merge | 3:30 AM | ~2 min | `alquiler/flujo_merge_alquiler_v1.0.0.json` |
| Verificador Alquiler | 7:00 AM diario | ~5 min | `alquiler/flujo_c_verificador_alquiler_v1.0.0.json` |

### Variables de Entorno

```
ANTHROPIC_API_KEY=sk-ant-api03-...    # Claude Haiku
FIRECRAWL_API_KEY=fc-...              # Scraping
SLACK_WEBHOOK_SICI=https://...        # Notificaciones (NUNCA commitear)
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

-- Metricas de precios activos
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

-- Matching rate alquiler
SELECT
  COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as con_proyecto,
  COUNT(*) as completadas,
  ROUND(100.0 * COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) /
        NULLIF(COUNT(*), 0), 1) as tasa_matching
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler'
  AND status = 'completado';

-- Ultimas ejecuciones
SELECT workflow_name, status, fecha_inicio
FROM workflow_executions
WHERE workflow_name LIKE '%alquiler%'
ORDER BY fecha_inicio DESC
LIMIT 10;
```

---

## Documentacion Relacionada

| Documento | Proposito |
|-----------|-----------|
| `docs/alquiler/LLM_ENRICHMENT_PROMPT.md` | Prompt template para Claude Haiku |
| `docs/alquiler/N8N_WORKFLOWS_ALQUILER.md` | Detalle nodos n8n (pseudocodigo) |
| `docs/alquiler/COSTOS_ROI_LLM.md` | Analisis costos LLM vs regex |
| `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` | Learnings post-launch (filtros, bugs, absorcion) |
| `docs/reports/FILTROS_CALIDAD_MERCADO.md` | Filtros calidad para estudios de mercado |
| `docs/modulo_2/BITACORA_SNAPSHOTS_FEB_2026.md` | Bitacora contaminacion snapshots |
| `docs/canonical/discovery_canonical_v2.md` | Pipeline venta (referencia) |
| `docs/canonical/merge_canonical.md` | Merge venta (referencia) |
