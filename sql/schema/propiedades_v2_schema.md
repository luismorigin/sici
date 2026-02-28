# Schema: propiedades_v2

**Exportado de producción:** 28 Feb 2026
**Columnas:** 84
**Fuente:** `information_schema.columns` + `pg_constraint` + `pg_indexes`

---

## ENUMs

### estado_propiedad

```sql
CREATE TYPE estado_propiedad AS ENUM (
    'nueva',
    'pendiente_enriquecimiento',
    'completado',
    'actualizado',
    'inactivo_pending',
    'inactivo_confirmed',
    'excluido_operacion'
);
```

### tipo_operacion_enum

```sql
CREATE TYPE tipo_operacion_enum AS ENUM (
    'venta',
    'alquiler',
    'anticretico'
);
```

### estado_construccion_enum

```sql
CREATE TYPE estado_construccion_enum AS ENUM (
    'entrega_inmediata',
    'preventa',
    'construccion',
    'planos',
    'no_especificado',
    'usado',
    'nuevo_a_estrenar'
);
```

---

## Columnas (84)

### Identificación (7 cols)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 1 | `id` | INTEGER | NO | nextval() | PK autoincremental |
| 2 | `url` | VARCHAR(500) | NO | — | URL única de la propiedad |
| 3 | `fuente` | VARCHAR(50) | NO | — | `'century21'` \| `'remax'` \| `'bien_inmuebles'` |
| 4 | `codigo_propiedad` | VARCHAR(100) | YES | — | ID del portal |
| 5 | `tipo_operacion` | tipo_operacion_enum | YES | — | `'venta'` \| `'alquiler'` \| `'anticretico'` |
| 6 | `tipo_propiedad_original` | TEXT | YES | — | Tipo según portal (departamento, casa, etc.) |
| 7 | `estado_construccion` | estado_construccion_enum | YES | — | Ver enum arriba |

### Financiero — Venta (10 cols)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 8 | `precio_usd` | NUMERIC(12,2) | YES | — | Precio en USD |
| 9 | `precio_usd_original` | NUMERIC(12,2) | YES | — | Precio original antes de conversión |
| 10 | `moneda_original` | VARCHAR(10) | YES | — | `'USD'` \| `'BOB'` |
| 11 | `tipo_cambio_usado` | NUMERIC(6,4) | YES | — | TC aplicado en conversión |
| 12 | `tipo_cambio_detectado` | VARCHAR(20) | YES | — | `'oficial'` \| `'paralelo'` \| `'no_especificado'` |
| 13 | `requiere_actualizacion_precio` | BOOLEAN | YES | false | Flag para recálculo TC |
| 52 | `tipo_cambio_paralelo_usado` | NUMERIC | YES | — | TC paralelo Binance si aplica |
| 53 | `precio_usd_actualizado` | NUMERIC | YES | — | Último precio recalculado |
| 54 | `fecha_ultima_actualizacion_precio` | TIMESTAMP | YES | — | Cuándo se recalculó |
| 55 | `depende_de_tc` | BOOLEAN | YES | false | Si precio depende de TC paralelo |

### Financiero — Alquiler (4 cols, migración 135)

| # | Columna | Tipo | Nullable | Default | CHECK | Descripción |
|---|---------|------|----------|---------|-------|-------------|
| 77 | `precio_mensual_bob` | NUMERIC(10,2) | YES | — | > 0 | Precio mensual en Bs (canónico) |
| 78 | `precio_mensual_usd` | NUMERIC(10,2) | YES | — | — | Precio mensual en USD (auto-calc BOB/6.96) |
| 79 | `deposito_meses` | NUMERIC(2,1) | YES | — | 0-6 | Depósito garantía en meses |
| 84 | `monto_expensas_bob` | NUMERIC(10,2) | YES | — | >= 0 | Gastos comunes en Bs |

### Físico (8 cols)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 20 | `latitud` | NUMERIC(10,8) | YES | — | GPS latitud |
| 21 | `longitud` | NUMERIC(11,8) | YES | — | GPS longitud |
| 22 | `area_total_m2` | NUMERIC(10,2) | YES | — | Metros cuadrados (CHECK > 0) |
| 23 | `dormitorios` | INTEGER | YES | — | Cantidad dormitorios |
| 24 | `banos` | NUMERIC(3,1) | YES | — | Cantidad baños |
| 25 | `estacionamientos` | INTEGER | YES | — | Cantidad parking |
| 64 | `baulera` | BOOLEAN | YES | — | Tiene baulera |
| 65 | `piso` | INTEGER | YES | — | Número de piso |

### Alquiler — Detalles (4 cols, migración 135)

| # | Columna | Tipo | Nullable | Default | CHECK | Descripción |
|---|---------|------|----------|---------|-------|-------------|
| 80 | `amoblado` | TEXT | YES | — | `si/no/semi` | Estado amoblado |
| 81 | `acepta_mascotas` | BOOLEAN | YES | — | — | Acepta mascotas |
| 82 | `servicios_incluidos` | JSONB | YES | `'[]'` | — | Array: `["agua","luz","internet"]` |
| 83 | `contrato_minimo_meses` | INTEGER | YES | — | 1-60 | Duración mínima contrato |

### Parqueo y Baulera — Detalle (4 cols, migración ~085)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 71 | `parqueo_incluido` | BOOLEAN | YES | — | true=incluido en precio |
| 72 | `parqueo_precio_adicional` | NUMERIC(12,2) | YES | — | USD por parqueo si no incluido |
| 73 | `baulera_incluido` | BOOLEAN | YES | — | true=incluida en precio |
| 74 | `baulera_precio_adicional` | NUMERIC(12,2) | YES | — | USD por baulera si no incluida |

### Forma de Pago (7 cols, migración 081)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 66 | `plan_pagos_desarrollador` | BOOLEAN | YES | — | Acepta cuotas |
| 67 | `acepta_permuta` | BOOLEAN | YES | — | Acepta vehículo/propiedad |
| 68 | `solo_tc_paralelo` | BOOLEAN | YES | — | Solo USD paralelo |
| 69 | `precio_negociable` | BOOLEAN | YES | — | Acepta ofertas |
| 70 | `descuento_contado_pct` | NUMERIC(5,2) | YES | — | % descuento por pago contado |
| 75 | `plan_pagos_cuotas` | JSONB | YES | — | Detalle cuotas estructurado |
| 76 | `plan_pagos_texto` | TEXT | YES | — | Descripción libre forma de pago |

**Interpretación NULL:** `NULL` = sin confirmar, `true` = confirmado sí, `false` = confirmado no.

### Multiproyecto (5 cols)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 14 | `es_multiproyecto` | BOOLEAN | YES | false | Flag multiproyecto |
| 15 | `dormitorios_opciones` | VARCHAR(20) | YES | — | Ej: "1-3" |
| 16 | `precio_min_usd` | NUMERIC(12,2) | YES | — | Precio mínimo |
| 17 | `precio_max_usd` | NUMERIC(12,2) | YES | — | Precio máximo |
| 18 | `area_min_m2` | NUMERIC(10,2) | YES | — | Área mínima |
| 19 | `area_max_m2` | NUMERIC(10,2) | YES | — | Área máxima |

### Matching (5 cols)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 26 | `id_proyecto_master` | INTEGER | YES | — | FK a proyectos_master (confirmado) |
| 27 | `id_proyecto_master_sugerido` | INTEGER | YES | — | Sugerencia automática |
| 28 | `confianza_sugerencia_extractor` | NUMERIC(5,2) | YES | — | 0.00-1.00 score confianza |
| 29 | `metodo_match` | VARCHAR(50) | YES | — | `'fuzzy'` \| `'gps'` \| `'manual'` \| `'lookup'` \| `'trigram'` |
| 60 | `nombre_edificio` | VARCHAR | YES | — | Nombre del edificio/proyecto |

### Ubicación (2 cols)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 61 | `zona` | VARCHAR | YES | — | Zona geográfica (normalizada en venta, cruda en alquiler) |
| 62 | `microzona` | VARCHAR(100) | YES | — | Microzona PostGIS (fuente de verdad geográfica) |

### Estado y Calidad (8 cols)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 30 | `status` | estado_propiedad | NO | `'nueva'` | Estado del pipeline |
| 31 | `es_activa` | BOOLEAN | YES | true | Flag de actividad |
| 32 | `es_para_matching` | BOOLEAN | YES | true | Apta para matching |
| 33 | `razon_inactiva` | VARCHAR(200) | YES | — | Razón de inactivación (`'aviso_terminado'`) |
| 34 | `fecha_inactivacion` | TIMESTAMP | YES | — | Cuándo se confirmó baja |
| 35 | `score_calidad_dato` | INTEGER | YES | — | 0-100 completitud datos |
| 36 | `score_fiduciario` | INTEGER | YES | — | 0-100 coherencia (solo venta) |
| 58 | `primera_ausencia_at` | TIMESTAMP | YES | — | Primera vez ausente en discovery |

### Deduplicación (1 col)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 63 | `duplicado_de` | INTEGER | YES | — | FK self-ref a propiedades_v2(id) |

### Arquitectura Dual — JSON (7 cols)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 37 | `datos_json_discovery` | JSONB | YES | — | RAW snapshot API (inmutable por ejecución) |
| 38 | `datos_json_enrichment` | JSONB | YES | — | RAW extracción HTML/LLM (inmutable) |
| 39 | `datos_json` | JSONB | YES | — | Merge consolidado v2.0.0+ |
| 40 | `campos_bloqueados` | JSONB | YES | `'{}'` | Candados manuales (CHECK: debe ser objeto) |
| 41 | `discrepancias_detectadas` | JSONB | YES | — | Diferencias discovery vs enrichment |
| 42 | `campos_conflicto` | JSONB | YES | `'[]'` | Campos con conflicto entre fuentes |
| 59 | `flags_semanticos` | JSONB | YES | `'[]'` | Array warnings/errors del scoring |

### Tracking de Cambios (2 cols)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 56 | `cambios_enrichment` | JSONB | YES | — | Log de cambios enrichment |
| 57 | `cambios_merge` | JSONB | YES | — | Log de fuentes usadas en merge |

### Timestamps (6 cols)

| # | Columna | Tipo | Nullable | Default | Descripción |
|---|---------|------|----------|---------|-------------|
| 43 | `scraper_version` | VARCHAR(20) | YES | — | Versión del extractor |
| 44 | `fecha_creacion` | TIMESTAMP | YES | NOW() | Creación registro |
| 45 | `fecha_actualizacion` | TIMESTAMP | YES | NOW() | Última modificación |
| 46 | `fecha_discovery` | TIMESTAMP | YES | — | Último/primer discovery (ver nota) |
| 47 | `fecha_enrichment` | TIMESTAMP | YES | — | Último enrichment |
| 48 | `fecha_merge` | TIMESTAMP | YES | — | Último merge |
| 49 | `fecha_publicacion` | DATE | YES | — | Fecha publicación portal |
| 50 | `fecha_scraping` | TIMESTAMP | YES | — | Último scrape HTML |
| 51 | `metodo_discovery` | VARCHAR(50) | YES | — | `'api_rest'` \| `'grid_geografico'` |

**Nota sobre `fecha_discovery`:** Para fuentes sin `fecha_publicacion` (Bien Inmuebles), se preserva el valor original del INSERT. Para C21/Remax se actualiza con NOW() en cada re-discovery. Ver migración 165.

---

## CHECK Constraints (10)

```sql
-- Precio venta positivo
CHECK (precio_usd > 0 OR precio_usd IS NULL)

-- Área positiva
CHECK (area_total_m2 > 0 OR area_total_m2 IS NULL)

-- Precio alquiler positivo
CHECK (precio_mensual_bob IS NULL OR precio_mensual_bob > 0)

-- Expensas no negativas
CHECK (monto_expensas_bob IS NULL OR monto_expensas_bob >= 0)

-- Depósito 0-6 meses
CHECK (deposito_meses IS NULL OR (deposito_meses >= 0 AND deposito_meses <= 6))

-- Contrato 1-60 meses
CHECK (contrato_minimo_meses IS NULL OR (contrato_minimo_meses >= 1 AND contrato_minimo_meses <= 60))

-- Amoblado valores permitidos
CHECK (amoblado IS NULL OR amoblado IN ('si', 'no', 'semi'))

-- Candados debe ser objeto JSON
CHECK (campos_bloqueados IS NULL OR jsonb_typeof(campos_bloqueados) = 'object')

-- Multiproyecto debe tener al menos un rango
CHECK (NOT es_multiproyecto OR (dormitorios_opciones IS NOT NULL OR precio_min_usd IS NOT NULL
  OR precio_max_usd IS NOT NULL OR area_min_m2 IS NOT NULL OR area_max_m2 IS NOT NULL))

-- Fecha actualización precio lógica
CHECK (fecha_ultima_actualizacion_precio IS NULL OR fecha_ultima_actualizacion_precio >= fecha_creacion)
```

---

## Constraints

```sql
-- Primary Key
PRIMARY KEY (id)

-- Unicidad
UNIQUE (url, fuente)

-- Foreign Key
FOREIGN KEY (duplicado_de) REFERENCES propiedades_v2(id)
```

---

## Índices (13)

```sql
-- PK + Unique
CREATE UNIQUE INDEX propiedades_v2_pkey ON propiedades_v2 (id);
CREATE UNIQUE INDEX unique_url_fuente ON propiedades_v2 (url, fuente);

-- GPS
CREATE INDEX idx_propiedades_v2_lat_lon ON propiedades_v2 (latitud, longitud);

-- Matching
CREATE INDEX idx_propiedades_v2_proyecto_match ON propiedades_v2 (id_proyecto_master, es_para_matching);
CREATE INDEX idx_propiedades_v2_nombre_edificio ON propiedades_v2 (lower(nombre_edificio)) WHERE nombre_edificio IS NOT NULL;

-- Ubicación
CREATE INDEX idx_propiedades_v2_zona ON propiedades_v2 (zona) WHERE zona IS NOT NULL;
CREATE INDEX idx_propiedades_v2_microzona ON propiedades_v2 (microzona) WHERE microzona IS NOT NULL;

-- Forma de pago
CREATE INDEX idx_propiedades_plan_pagos ON propiedades_v2 (plan_pagos_desarrollador) WHERE plan_pagos_desarrollador = true;
CREATE INDEX idx_propiedades_tc_paralelo ON propiedades_v2 (solo_tc_paralelo) WHERE solo_tc_paralelo = true;
CREATE INDEX idx_propiedades_piso ON propiedades_v2 (piso) WHERE piso IS NOT NULL;

-- Alquiler (parciales)
CREATE INDEX idx_prop_alquiler_activo ON propiedades_v2 (precio_mensual_bob)
  WHERE tipo_operacion = 'alquiler' AND status = 'completado' AND duplicado_de IS NULL;
CREATE INDEX idx_prop_alquiler_pipeline ON propiedades_v2 (status)
  WHERE tipo_operacion = 'alquiler' AND status IN ('nueva', 'actualizado');
CREATE INDEX idx_prop_alquiler_filtros ON propiedades_v2 (dormitorios, precio_mensual_bob)
  WHERE tipo_operacion = 'alquiler' AND status = 'completado' AND duplicado_de IS NULL;
```

---

## Producción (28 Feb 2026)

```
Total registros: 1,002
  Venta:     692 (C21: 515, Remax: 177, excluidos: 19)
  Alquiler:  310 (C21: 229, Remax: 74, BI: 7)
```

---

**Exportado de:** `information_schema.columns`, `pg_constraint`, `pg_indexes`
**Base de datos:** Supabase PostgreSQL (producción)
