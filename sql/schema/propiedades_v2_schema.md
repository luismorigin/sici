# Schema: propiedades_v2

**Última actualización:** 28 Enero 2026
**Columnas:** 67+

---

## Grupos de Columnas

### Identificación (9 cols)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | SERIAL | PK autoincremental |
| `url` | VARCHAR | URL única de la propiedad |
| `fuente` | VARCHAR | 'century21' \| 'remax' |
| `codigo_propiedad` | VARCHAR | ID del portal |
| `tipo_operacion` | VARCHAR | 'venta' \| 'alquiler' |
| `tipo_propiedad_original` | VARCHAR | Tipo según portal |
| `estado_construccion` | estado_construccion_enum | Ver ENUM abajo |
| `scraper_version` | VARCHAR | Versión del extractor |
| `metodo_discovery` | VARCHAR | 'api_rest' \| 'grid_geografico' |

### Financiero (10 cols)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `precio_usd` | NUMERIC(12,2) | Precio final en USD |
| `precio_min_usd` | NUMERIC(12,2) | Mínimo (multiproyecto) |
| `precio_max_usd` | NUMERIC(12,2) | Máximo (multiproyecto) |
| `moneda_original` | VARCHAR | 'USD' \| 'BOB' |
| `tipo_cambio_usado` | NUMERIC(10,4) | TC aplicado |
| `tipo_cambio_detectado` | VARCHAR | 'oficial' \| 'paralelo' \| 'no_especificado' |
| `tipo_cambio_paralelo_usado` | NUMERIC(10,4) | TC paralelo si aplica |
| `precio_usd_actualizado` | NUMERIC(12,2) | Último precio recalculado |
| `requiere_actualizacion_precio` | BOOLEAN | Flag para recálculo TC |
| `depende_de_tc` | BOOLEAN | Si precio depende de TC |

### Físico (12 cols)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `area_total_m2` | NUMERIC(10,2) | Metros cuadrados |
| `dormitorios` | INTEGER | Cantidad dormitorios |
| `banos` | NUMERIC(3,1) | Cantidad baños |
| `estacionamientos` | INTEGER | Cantidad parking |
| `parqueo_incluido` | BOOLEAN | **v2.26** true=incluido en precio, false=adicional |
| `parqueo_precio_adicional` | NUMERIC(12,2) | **v2.26** USD por parqueo si no incluido |
| `baulera` | BOOLEAN | Tiene baulera (v2.23) |
| `baulera_incluido` | BOOLEAN | **v2.26** true=incluida en precio, false=adicional |
| `baulera_precio_adicional` | NUMERIC(12,2) | **v2.26** USD por baulera si no incluida |
| `piso` | INTEGER | **v2.25** Número de piso. NULL=sin confirmar |
| `latitud` | NUMERIC(10,8) | GPS latitud |
| `longitud` | NUMERIC(11,8) | GPS longitud |

### Forma de Pago (5 cols) - v2.25
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `plan_pagos_desarrollador` | BOOLEAN | Acepta cuotas. NULL=sin confirmar, false=solo contado |
| `acepta_permuta` | BOOLEAN | Acepta vehículo/propiedad. NULL=sin confirmar |
| `solo_tc_paralelo` | BOOLEAN | Solo USD paralelo. NULL=sin confirmar, false=acepta oficial/Bs |
| `precio_negociable` | BOOLEAN | Acepta ofertas. NULL=sin confirmar |
| `descuento_contado_pct` | NUMERIC(5,2) | % descuento contado. NULL=sin descuento/sin confirmar |

### Multiproyecto (5 cols)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `es_multiproyecto` | BOOLEAN | Flag multiproyecto |
| `dormitorios_opciones` | VARCHAR | Ej: "1-3" |
| `area_min_m2` | NUMERIC(10,2) | Área mínima |
| `area_max_m2` | NUMERIC(10,2) | Área máxima |
| `tipologias_detectadas` | JSONB | Array de tipologías |

### Matching (6 cols)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id_proyecto_master` | INTEGER | FK a proyectos_master (confirmado) |
| `id_proyecto_master_sugerido` | INTEGER | Sugerencia automática |
| `metodo_match` | VARCHAR | 'fuzzy' \| 'gps' \| 'manual' |
| `confianza_match` | NUMERIC(3,2) | 0.00-1.00 |
| `nombre_edificio` | VARCHAR | **v2.1.0** - Nombre del edificio/proyecto |
| `zona` | VARCHAR | **v2.1.0** - Zona geográfica |

### Estado (7 cols)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `status` | estado_propiedad | ENUM: nueva, actualizado, completado, inactivo_pending, inactivo_confirmed |
| `es_activa` | BOOLEAN | Flag activa |
| `es_para_matching` | BOOLEAN | Apta para matching |
| `score_calidad_dato` | INTEGER | 0-100 completitud |
| `score_fiduciario` | INTEGER | 0-100 coherencia |
| `primera_ausencia_at` | TIMESTAMP | Primera vez ausente en discovery |
| `motivo_inactividad` | VARCHAR | Razón de inactivación |

### Arquitectura Dual (8 cols)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `datos_json_discovery` | JSONB | RAW snapshot API (inmutable) |
| `datos_json_enrichment` | JSONB | RAW extracción HTML (inmutable) |
| `datos_json` | JSONB | **Merge consolidado v2.0.0** |
| `fecha_discovery` | TIMESTAMP | Último discovery |
| `fecha_enrichment` | TIMESTAMP | Último enrichment |
| `fecha_merge` | TIMESTAMP | Último merge |
| `campos_bloqueados` | JSONB | Candados manuales |
| `cambios_merge` | JSONB | Log de merge |

### Merge v2.0.0 (3 cols) ⚠️ NUEVAS
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `flags_semanticos` | JSONB | Array de warnings/errors del scoring |
| `discrepancias_detectadas` | JSONB | Diferencias discovery vs enrichment |
| `cambios_merge` | JSONB | Tracking de fuentes usadas |

### Timestamps (5 cols)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `fecha_creacion` | TIMESTAMP | Creación registro |
| `fecha_actualizacion` | TIMESTAMP | Última modificación |
| `fecha_publicacion` | DATE | Fecha publicación portal |
| `fecha_scraping` | TIMESTAMP | Último scrape HTML |
| `updated_at` | TIMESTAMP | Trigger automático |

---

## Enum: estado_propiedad

```sql
CREATE TYPE estado_propiedad AS ENUM (
    'nueva',                    -- Recién descubierta (venta), pendiente enrichment
    'pendiente_enriquecimiento',
    'actualizado',
    'completado',
    'inactivo_pending',
    'inactivo_confirmed',
    'excluido_operacion'        -- v2.5: Alquiler/anticrético, no entra a pipeline
);
```

---

## Enum: estado_construccion_enum

```sql
CREATE TYPE estado_construccion_enum AS ENUM (
    'entrega_inmediata',
    'preventa',
    'construccion',
    'planos',
    'no_especificado',
    'usado',              -- v1.4.5: Segunda mano
    'nuevo_a_estrenar'    -- v1.4.5: Nuevo sin uso previo
);
```

---

## Índices Recomendados

```sql
CREATE INDEX idx_propiedades_status ON propiedades_v2(status);
CREATE INDEX idx_propiedades_fuente ON propiedades_v2(fuente);
CREATE INDEX idx_propiedades_codigo ON propiedades_v2(codigo_propiedad);
CREATE UNIQUE INDEX idx_propiedades_url_fuente ON propiedades_v2(url, fuente);
CREATE INDEX idx_propiedades_proyecto ON propiedades_v2(id_proyecto_master);
CREATE INDEX idx_propiedades_matching ON propiedades_v2(es_para_matching) WHERE es_para_matching = TRUE;
```

---

## Migración v2.0.0

```sql
-- Columnas agregadas para Merge v2.0.0
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS flags_semanticos JSONB DEFAULT '[]'::JSONB;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS discrepancias_detectadas JSONB;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS cambios_merge JSONB;
```

Ver: `sql/migrations/migracion_merge_v2.0.0.sql`

---

## Migración ENUM estado_construccion (24 Dic 2025)

```sql
-- Agregar valores faltantes al ENUM
ALTER TYPE estado_construccion_enum ADD VALUE IF NOT EXISTS 'usado';
ALTER TYPE estado_construccion_enum ADD VALUE IF NOT EXISTS 'nuevo_a_estrenar';
```

---

## Migración v2.1.0 - Columnas Matching (25 Dic 2025)

```sql
-- Columnas agregadas para Módulo 2 (Property Matching)
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS nombre_edificio VARCHAR(255);
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS zona VARCHAR(100);

-- Índices recomendados para matching
CREATE INDEX IF NOT EXISTS idx_propiedades_nombre_edificio
    ON propiedades_v2(nombre_edificio) WHERE nombre_edificio IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_propiedades_zona
    ON propiedades_v2(zona) WHERE zona IS NOT NULL;
```

Ver: `sql/migrations/migracion_columnas_matching_v1.0.0.sql`

---

## Migración v2.25 - Piso y Forma de Pago (28 Ene 2026)

```sql
-- Piso del departamento
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS piso INTEGER;

-- Forma de pago
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS plan_pagos_desarrollador BOOLEAN;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS acepta_permuta BOOLEAN;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS solo_tc_paralelo BOOLEAN;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS precio_negociable BOOLEAN;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS descuento_contado_pct NUMERIC(5,2);

-- Índices para filtros
CREATE INDEX IF NOT EXISTS idx_propiedades_plan_pagos
  ON propiedades_v2(plan_pagos_desarrollador) WHERE plan_pagos_desarrollador = true;
CREATE INDEX IF NOT EXISTS idx_propiedades_tc_paralelo
  ON propiedades_v2(solo_tc_paralelo) WHERE solo_tc_paralelo = true;
CREATE INDEX IF NOT EXISTS idx_propiedades_piso
  ON propiedades_v2(piso) WHERE piso IS NOT NULL;
```

### Interpretación de valores NULL

| Valor | Significado | UI |
|-------|-------------|-----|
| `true` | Confirmado que SÍ | ✓ o badge específico |
| `false` | Confirmado que NO | No mostrar o ✗ |
| `NULL` | Sin confirmar | ? con tooltip |

### Lógica derivada

```sql
-- "Solo contado" = no acepta ningún financiamiento
CASE
  WHEN plan_pagos_desarrollador = false
   AND (acepta_permuta = false OR acepta_permuta IS NULL)
  THEN 'Solo contado'
  ELSE NULL
END
```

Ver: `sql/migrations/081_columnas_piso_forma_pago.sql`
Ver: `sql/migrations/082_buscar_unidades_forma_pago.sql`

---

**Última actualización:** 28 Enero 2026
