# PLAN DE LIMPIEZA DE DATOS SICI - VERSION ESCALABLE

**Fecha:** 8 Enero 2026 (Actualizado con ejecución)
**Objetivo:** Limpiar datos Y crear infraestructura que escale

---

## ESTADO VERIFICADO EN BD (8 Enero 2026)

### ✅ INFRAESTRUCTURA IMPLEMENTADA (verificado con MCP postgres)

#### Extensiones y Índices
| Componente | Tipo | Estado |
|------------|------|--------|
| pg_trgm v1.6 | Extension | ✅ |
| idx_propiedades_amenities | Índice GIN | ✅ |
| idx_proyectos_nombre_trgm | Índice Trigram | ✅ |
| idx_motivo_no_matching_gin | Índice GIN | ✅ |
| trg_registrar_alias_matching | Trigger | ✅ |

#### Vistas SQL (5 implementadas)
| Vista | Propósito | Estado |
|-------|-----------|--------|
| v_metricas_mercado | Métricas por tipología (excluye multiproyecto) | ✅ |
| v_alternativas_proyecto | Multiproyecto "desde $X" | ✅ |
| v_salud_datos | Dashboard de gaps | ✅ |
| v_resumen_excluidas | Resumen excluidas HITL | ✅ |
| v_amenities_proyecto | Knowledge Graph (188 filas) | ✅ |

#### Funciones SQL (13 implementadas)
| Función | Propósito | Estado |
|---------|-----------|--------|
| normalize_nombre() | Normaliza nombres | ✅ |
| buscar_proyecto_fuzzy() | Fuzzy con trigrams | ✅ |
| generar_matches_trigram() | Matching trigram | ✅ |
| extraer_nombre_de_descripcion() | Extrae de descripción | ✅ |
| matching_completo_automatizado() | Orquestador v3.2 | ✅ |
| intentar_match_con_fuzzy() | Match individual | ✅ |
| registrar_alias_desde_correccion() | Auto-alias HITL | ✅ |
| detectar_razon_exclusion() | Diagnóstico excluidas | ✅ |
| exportar_propiedades_excluidas() | Export HITL | ✅ |
| procesar_accion_excluida() | Acciones HITL | ✅ |
| buscar_unidades_reales(jsonb) | Knowledge Graph | ✅ |
| normalizar_amenity() | Knowledge Graph | ✅ |
| interpretar_valor_amenity() | Knowledge Graph | ✅ |

#### Tablas Nuevas
| Tabla | Propósito | Estado |
|-------|-----------|--------|
| propiedades_excluidas_export | Tracking HITL excluidas | ✅ |
| proyectos_pendientes_enriquecimiento | Cola enriquecimiento | ✅ |

### 📊 MÉTRICAS ACTUALES

| Métrica | Valor | Status |
|---------|-------|--------|
| Matching rate | **98.2%** | ✅ Excelente |
| Huérfanas | **6** | ⚠️ Revisar |
| Proyectos sin desarrollador | **16** (8.5%) | ✅ OK (<10%) |
| Excluidas en revisión HITL | **14** | ⚠️ En Sheet |
| Cola matching | **0** | ✅ Limpia |
| Cola sin_match | **6** | ⚠️ Pendientes |

---

## ⏳ PENDIENTE: DATOS (revisión manual)

| # | Tarea | Cantidad | Prioridad | Tiempo |
|---|-------|----------|-----------|--------|
| 1 | Mapear columnas n8n Export Excluidas | 1 workflow | Alta | 15 min |
| 2 | Procesar excluidas en Sheet | 14 props | Alta | 30 min |
| 3 | Revisar/crear proyectos huérfanas | 6 props | Media | 30 min |
| 4 | Enriquecer desarrolladores faltantes | 16 proyectos | Baja | 1 hr |

---

## ❌ PENDIENTE: ESCALADO (modificar extractores/flujos)

### Enrichment (Flujo B) - Mejoras de extracción

| # | Mejora | Archivo a Modificar | Impacto |
|---|--------|---------------------|---------|
| 1 | **Extraer desarrollador** de descripción | `flujo_b_processing_v3.0.json` | Evita proyectos sin desarrollador |
| 2 | **Extraer precio_min/max** para multiproyecto | `flujo_b_processing_v3.0.json` | Rangos de precio reales |
| 3 | **Extraer nombre_edificio** de descripción cuando meta está vacío | `flujo_b_processing_v3.0.json` | Reduce huérfanas |

**Patrones a implementar:**
```javascript
// Desarrollador
const patronesDesarrollador = [
    /desarrollado por\s+([A-Za-z\s]+)/i,
    /constructora\s+([A-Za-z\s]+)/i,
    /([A-Za-z]+)\s+desarrollos/i,
    /proyecto de\s+([A-Za-z\s]+)/i
];

// Precio rango (multiproyecto)
const patronesPrecio = [
    /desde\s*\$?\s*([\d,.]+)/i,
    /a partir de\s*\$?\s*([\d,.]+)/i,
    /([\d,.]+)\s*-\s*([\d,.]+)/
];

// Nombre edificio de descripción
const patronesEdificio = [
    /condominio\s+([A-Za-z\s]+?)[\n,\.]/i,
    /edificio\s+([A-Za-z\s]+?)[\n,\.]/i,
    /torre[s]?\s+([A-Za-z\s]+?)[\n,\.]/i
];
```

### Discovery (Flujo A) - Detección temprana

| # | Mejora | Archivo a Modificar | Impacto |
|---|--------|---------------------|---------|
| 1 | **Detectar multiproyecto** en scraping | `flujo_a_discovery_*.json` | Flag temprano |
| 2 | **Detectar tipo_operacion** de URL/título | `flujo_a_discovery_*.json` | Evita excluir tarde |

### Workflows Nuevos (n8n)

| # | Workflow | Trigger | Propósito |
|---|----------|---------|-----------|
| 1 | `enriquecimiento_proyectos_nuevos` | Proyecto con desarrollador=NULL | Auto-enriquecer desde props matcheadas |
| 2 | `alerta_huerfanas_24h` | Cron diario | Notificar props sin proyecto >24h |
| 3 | `validacion_precios_anomalos` | Post-merge | Detectar $/m² fuera de rango |

### Columna Calculada (mejora futura)

```sql
-- Score de completitud automático
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS
    score_completitud INTEGER GENERATED ALWAYS AS (
        (CASE WHEN precio_usd IS NOT NULL THEN 20 ELSE 0 END) +
        (CASE WHEN area_total_m2 IS NOT NULL THEN 20 ELSE 0 END) +
        (CASE WHEN dormitorios IS NOT NULL THEN 15 ELSE 0 END) +
        (CASE WHEN id_proyecto_master IS NOT NULL THEN 25 ELSE 0 END) +
        (CASE WHEN datos_json->'ubicacion'->>'latitud' IS NOT NULL THEN 10 ELSE 0 END) +
        (CASE WHEN datos_json->'amenities'->'lista' IS NOT NULL THEN 10 ELSE 0 END)
    ) STORED;
```

---

## EXPLORACIÓN PREVIA: LO QUE YA EXISTE

### Documentación existente (39 archivos .md)
- `docs/planning/KNOWLEDGE_GRAPH_VALIDATED_PLAN.md` - Query Layer diseñado
- `docs/planning/SUPERVISOR_EXCLUIDAS_PLAN.md` - 16 props limbo
- `docs/planning/SICI_MVP_SPEC.md` - Spec Simón completa
- `docs/modulo_2/MATCHING_NOCTURNO_SPEC.md` - Pipeline matching

### Workflows n8n operativos (11 total)
- Pipeline nocturno: Discovery (1AM) → Enrichment (2AM) → Merge (3AM) → Matching (4AM)
- HITL: Supervisor Matching (8PM) + Supervisor Sin Match (8:30PM)
- Auditoría Diaria (9AM) + TC Binance (00:00)

### Campos datos_json YA EXISTENTES (subutilizados)
```javascript
datos_json.fisico.precio_min_usd     // EXISTE - pero mismo valor que max
datos_json.fisico.precio_max_usd     // EXISTE - no hay rango real
datos_json.fisico.dormitorios_opciones // EXISTE - [0,1,2] array
datos_json.proyecto.nombre_edificio_nivel_confianza // EXISTE
datos_json.proyecto.estado_construccion // EXISTE (preventa, nuevo_a_estrenar)
// desarrollador_detectado → NO EXISTE (gap real)
```

### Tablas existentes (reutilizables)
- `proyectos_pendientes_google` - Ya existe para cola de enriquecimiento
- `workflow_executions` - Ya existe para health check
- `sin_match_exportados` - Ya existe para tracking HITL

---

## PRINCIPIOS GUIA

> **SUNDAR:** "Build for scale from day one"
> **THIEL:** "Build infrastructure, not patches"
> **MUSK:** "First principles - solve root cause"
> **NUEVO:** "No reinventar - usar lo que ya existe"

Para cada problema:
1. **YA EXISTE:** Qué infraestructura/campos ya tenemos
2. **INMEDIATO:** Qué ajuste mínimo hacemos hoy
3. **ESCALABLE:** Qué proceso queda para el futuro
4. **PREVENCION:** Cómo evitamos que vuelva a pasar

---

## 1. DESARROLLADORES FALTANTES

### Estado Actual
- 84 de 188 proyectos (45%) sin desarrollador
- Todos tienen GPS y nombre

### Root Cause Analysis
**¿Por qué faltan?**
- Scraper no extrae desarrollador de listings
- Enrichment no busca desarrollador
- Proyectos creados manualmente desde HITL sin ese dato

---

### SOLUCION INMEDIATA (2-3 horas)

Enriquecer los 84 proyectos actuales:

```
Opcion C: Desde datos existentes (1 hora)
1. Query: Buscar en datos_json de propiedades matcheadas
2. Extraer desarrollador de descripcion con regex
3. Actualizar proyectos_master

Opcion A: Semi-auto con IA (2-3 horas)
1. Para los que no se resuelvan con C
2. Web search + Claude extraction
3. Validacion humana rapida
```

**Lista de los 84 proyectos:** Ver Apendice A

---

### SOLUCION ESCALABLE

**Workflow: `enriquecimiento_proyectos_nuevos`**

```
TRIGGER: Proyecto insertado en proyectos_master con desarrollador = NULL

PASOS:
1. Buscar propiedades matcheadas al proyecto
2. Extraer desarrollador de datos_json.contenido.descripcion
3. Si encontrado con confianza > 0.8 → Actualizar automatico
4. Si no encontrado → Agregar a cola `proyectos_pendientes_enriquecimiento`
5. Notificar Slack: "3 proyectos nuevos sin desarrollador"

SCHEDULE: Ejecutar diario post-matching (5 AM)
```

**Tabla nueva:**
```sql
CREATE TABLE proyectos_pendientes_enriquecimiento (
    id SERIAL PRIMARY KEY,
    id_proyecto_master INTEGER REFERENCES proyectos_master,
    campo_faltante TEXT, -- 'desarrollador', 'zona', 'gps'
    intentos INTEGER DEFAULT 0,
    ultimo_intento TIMESTAMP,
    estado TEXT DEFAULT 'pendiente', -- pendiente, en_proceso, resuelto, descartado
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

### PREVENCION

**En Enrichment (Flujo B):**
```javascript
// Agregar extraccion de desarrollador
const desarrollador = extraerDesarrollador(descripcion);
// Patrones: "Desarrollado por X", "Constructora X", "X Desarrollos"

datos_json.proyecto.desarrollador_detectado = desarrollador;
datos_json.proyecto.desarrollador_confianza = confianza;
```

**En HITL Crear Proyecto:**
- Campo desarrollador OPCIONAL pero visible
- Sugerencia automatica basada en propiedades similares

**Metrica de salud:**
```sql
-- Alerta si > 10% proyectos sin desarrollador
SELECT
    COUNT(*) FILTER (WHERE desarrollador IS NULL) * 100.0 / COUNT(*) as pct_sin_desarrollador
FROM proyectos_master WHERE activo;
-- Umbral alerta: > 10%
```

---

## 2. MULTIPROYECTO (Alternativas de Proyecto)

### YA EXISTE (descubierto en exploración)

```javascript
// En datos_json.fisico YA tenemos:
precio_min_usd: 88832        // EXISTE pero = precio_max (no hay rango)
precio_max_usd: 88832        // EXISTE pero = precio_min
dormitorios_opciones: [1,2,3] // EXISTE y funciona bien
area_min_m2: null            // EXISTE pero no se llena
area_max_m2: null            // EXISTE pero no se llena

// En datos_json.proyecto:
estado_construccion: "preventa" // EXISTE y funciona
```

**PROBLEMA REAL:** El Enrichment extrae `dormitorios_opciones` correctamente,
pero NO extrae rangos de precio de la descripción (ej: "desde $59k hasta $88k").

### Estado Actual
- 68 propiedades con `es_multiproyecto = true`
- `dormitorios_opciones` funciona bien ([0,1,2] arrays)
- `precio_min/max` NO funcionan (siempre iguales)
- La descripción contiene rangos pero NO se extraen

### Root Cause Analysis
**¿Por qué precio_min = precio_max?**
- Enrichment usa el precio del meta tag (único valor)
- La descripción dice "desde $59,448" pero NO se parsea
- El campo existe pero el extractor no lo llena

**¿Por qué 11% más barato en promedio?**
- Son preventas (precio de lanzamiento)
- El precio único es el MÍNIMO del proyecto
- Falta el precio máximo real

---

### SOLUCION INMEDIATA (30 min)

**Usar campos existentes + crear vista:**

1. Crear vista `v_alternativas_proyecto` usando campos EXISTENTES:
```sql
CREATE VIEW v_alternativas_proyecto AS
SELECT
    pm.id_proyecto_master,
    pm.nombre_oficial as proyecto,
    pm.desarrollador,
    pm.zona,
    COUNT(*) as listings_disponibles,
    MIN(p.precio_usd) as precio_desde,
    MAX(p.precio_usd) as precio_hasta,
    -- USAR dormitorios_opciones existente, no dormitorios
    (SELECT array_agg(DISTINCT d ORDER BY d)
     FROM propiedades_v2 p2,
          jsonb_array_elements_text(p2.datos_json->'fisico'->'dormitorios_opciones') d
     WHERE p2.id_proyecto_master = pm.id_proyecto_master
       AND p2.es_multiproyecto = true
    ) as tipologias_disponibles,
    bool_or(
        p.datos_json->'proyecto'->>'estado_construccion' = 'preventa'
    ) as es_preventa
FROM propiedades_v2 p
JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
WHERE p.es_multiproyecto = true
  AND p.es_activa = true
  AND p.tipo_operacion = 'venta'
  AND p.precio_usd > 30000
GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.desarrollador, pm.zona;
```

2. Actualizar vistas de metricas para EXCLUIR multiproyecto de promedios:
```sql
-- v_metricas_mercado: solo unidades reales para estadisticas
WHERE es_multiproyecto = false
```

3. UI en Simon muestra ambos:
   - Seccion "Unidades disponibles" (reales) - con precio exacto
   - Seccion "Proyectos con opciones" (multiproyecto) - "desde $X"

---

### SOLUCION ESCALABLE

**NO crear nuevos campos - los campos YA EXISTEN en datos_json:**

```javascript
// Ya existen en datos_json.fisico:
precio_min_usd      // Usar este
precio_max_usd      // Usar este
dormitorios_opciones // Ya funciona
area_min_m2         // Usar este
area_max_m2         // Usar este
```

**FIX en Enrichment (Flujo B) - extraer rangos reales:**
```javascript
// En el extractor, buscar patrones de rango en descripcion:
const patronesRango = [
    /desde\s*\$?\s*([\d,.]+)/i,           // "desde $59,448"
    /a partir de\s*\$?\s*([\d,.]+)/i,     // "a partir de $60,000"
    /precio[s]?\s*desde\s*([\d,.]+)/i,    // "precios desde 59000"
    /([\d,.]+)\s*-\s*([\d,.]+)/,          // "59000 - 88000"
];

if (esMultiproyecto && descripcion) {
    const rango = extraerRangoDeDescripcion(descripcion, patronesRango);
    if (rango) {
        datos_json.fisico.precio_min_usd = rango.min;
        datos_json.fisico.precio_max_usd = rango.max;
    }
}
```

**Tarea:** Revisar `flujo_b_processing_v3.0.json` para agregar extracción de rangos

---

### PREVENCION

**Deteccion automatica en Discovery:**
```javascript
// Detectar multiproyecto por patrones
const esMultiproyecto = detectarMultiproyecto(listing);
// Patrones: "desde $X", "tipologias disponibles", precio_min != precio_max en meta
```

**Metrica de salud:**
```sql
-- Monitorear proporcion multiproyecto
SELECT
    es_multiproyecto,
    COUNT(*) as cantidad,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as porcentaje
FROM propiedades_v2
WHERE es_activa AND tipo_operacion = 'venta'
GROUP BY es_multiproyecto;
-- Esperado: 15-25% multiproyecto es normal
```

---

## 3. HUERFANAS (Propiedades sin Proyecto)

### YA EXISTE (descubierto en exploración)

**Workflows HITL operativos:**
- `exportar_sin_match.json` - 7AM exporta huérfanas a Google Sheets
- `supervisor_sin_match.json` - 8:30PM procesa decisiones humanas
- Acciones disponibles: ASIGNAR, CREAR, CORREGIR, SIN_PROYECTO

**Tabla tracking:**
- `sin_match_exportados` - 141 registros, 8 pendientes

**Funciones SQL:**
- `obtener_sin_match_para_exportar()` - Lista props sin proyecto
- `procesar_decision_sin_match()` - Aplica decisiones HITL

**Documentación:**
- `docs/modulo_2/SIN_MATCH_SPEC.md` - Spec completa del flujo

### Estado Actual

| Status | Sin Proyecto | En Cola HITL |
|--------|--------------|--------------|
| completado | 22 | 8 ya en sin_match_exportados |
| inactivo_pending | 39 | No (ya no están en mercado) |
| excluido_operacion | 32 | No (alquiler/anticrético) |
| **TOTAL** | **93** | Solo 22 relevantes |

### Root Cause Analysis (de datos_json explorado)

**Ejemplo ID 154 (Sky Equinox) - ¿Por qué huérfana?**
```javascript
nombre_edificio: null                    // ← PROBLEMA: no se extrajo
nombre_edificio_nivel_confianza: 0       // Confianza cero
descripcion: "SKY EQUINOX – Equipetrol"  // ← El nombre ESTÁ aquí
motivo_no_matching: "datos_criticos_faltantes"
```

**Causa raíz:** El Enrichment NO extrae nombre_edificio de la descripción
cuando el meta tag no lo tiene. El nombre está en el texto pero se ignora.

**¿Por qué hay 39 inactivo_pending sin proyecto?**
- Propiedades que desaparecieron del portal antes de completar HITL
- No criticas (ya no estan en mercado)

**¿Por qué hay 32 excluido_operacion sin proyecto?**
- Son alquiler/anticretico
- El matching solo procesa tipo_operacion = 'venta'
- Decision: ¿Queremos matchear alquileres?

---

### SOLUCION INMEDIATA (1.5 horas)

**Paso 1: Excluir anticretico/alquiler (15 min)**
```sql
-- IDs 160, 164, 304, 448 son anticretico mal clasificados
UPDATE propiedades_v2
SET status = 'excluido_operacion',
    notas_internas = 'Anticretico/alquiler detectado en revision manual'
WHERE id IN (160, 164, 304, 448);
```

**Paso 2: Crear proyectos faltantes (30 min)**

| Proyecto a Crear | Props que Resuelve |
|------------------|-------------------|
| Sky Equinox | 152, 153, 154, 155 |
| Condominio Barcelona | 403 |
| Edificio Aria | 450 |
| Macororo V | 454 |
| Portobello V | 456 |

```sql
-- Ejemplo: Crear Sky Equinox
INSERT INTO proyectos_master (nombre_oficial, zona, latitud, longitud, desarrollador)
VALUES ('Sky Equinox', 'Equipetrol', -17.765, -63.193, 'Sky Properties');
```

**Paso 3: Re-ejecutar matching para las 18 restantes (15 min)**
```sql
-- Marcar para re-procesamiento
UPDATE propiedades_v2
SET status = 'pendiente_matching'
WHERE id IN (285, 286, 335, 404, 405, 451, 452, 453, 19, 61)
  AND id_proyecto_master IS NULL;
```

---

### SOLUCION ESCALABLE

**Mejorar algoritmo de matching:**

```sql
-- matching_v4: Fuzzy matching + sinonimos
CREATE OR REPLACE FUNCTION buscar_proyecto_fuzzy(p_nombre TEXT)
RETURNS TABLE (id_proyecto INTEGER, nombre TEXT, score NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pm.id_proyecto_master,
        pm.nombre_oficial,
        similarity(
            normalize_nombre(p_nombre),
            normalize_nombre(pm.nombre_oficial)
        ) as score
    FROM proyectos_master pm
    WHERE pm.activo
      AND (
          -- Match exacto en alias
          p_nombre = ANY(pm.alias_conocidos)
          OR
          -- Fuzzy match > 0.6
          similarity(normalize_nombre(p_nombre), normalize_nombre(pm.nombre_oficial)) > 0.6
      )
    ORDER BY score DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Funcion de normalizacion
CREATE OR REPLACE FUNCTION normalize_nombre(texto TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN lower(
        regexp_replace(
            regexp_replace(texto, 'condominio|edificio|torre|residencia', '', 'gi'),
            '[^a-z0-9]', '', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Sistema de alias automatico:**
```sql
-- Cuando HITL corrige un match, guardar como alias
CREATE OR REPLACE FUNCTION registrar_alias_proyecto()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.accion = 'CORREGIR' AND NEW.nombre_detectado IS NOT NULL THEN
        UPDATE proyectos_master
        SET alias_conocidos = array_append(
            COALESCE(alias_conocidos, '{}'),
            NEW.nombre_detectado
        )
        WHERE id_proyecto_master = NEW.id_proyecto_corregido;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Workflow automatico de huerfanas:**
```
TRIGGER: Propiedad en status='completado' con id_proyecto_master=NULL por >24 horas

PASOS:
1. Intentar matching fuzzy
2. Si score > 0.8 → Asignar automatico
3. Si score 0.5-0.8 → Agregar a sin_match_exportados con sugerencia
4. Si score < 0.5 → Notificar Slack "Propiedad sin match, posible proyecto nuevo"
```

---

### PREVENCION

**En Discovery/Enrichment:**
```javascript
// Normalizar nombre de edificio ANTES de matching
datos_json.proyecto.nombre_normalizado = normalizarNombre(nombreEdificio);
datos_json.proyecto.alias_detectados = extraerAlias(descripcion);
```

**Metrica de salud:**
```sql
-- Alerta si tasa de huerfanas > 5%
SELECT
    COUNT(*) FILTER (WHERE id_proyecto_master IS NULL) * 100.0 /
    COUNT(*) as pct_huerfanas
FROM propiedades_v2
WHERE es_activa AND tipo_operacion = 'venta' AND status = 'completado';
-- Umbral alerta: > 5%
```

---

## 4. CAMPOS INCOMPLETOS

### YA EXISTE (descubierto en exploración)

**Sistema de calidad en datos_json:**
```javascript
// En datos_json.calidad YA tenemos:
datos_json.calidad.score_core          // EXISTE - score 0-100
datos_json.calidad.score_fiduciario    // EXISTE - score fiduciario
datos_json.calidad.conflictos          // EXISTE - array de problemas detectados
datos_json.calidad.campos_faltantes    // EXISTE - pero no siempre poblado
```

**Columnas en propiedades_v2:**
```sql
-- YA EXISTEN en el schema:
score_calidad_dato     -- INTEGER, ya calculado por merge
score_fiduciario       -- NUMERIC, ya calculado por merge
```

**Funciones existentes:**
- `merge_discovery_enrichment()` v2.1.0 ya calcula scores de calidad
- Auditoría diaria ya reporta conteos básicos

**Knowledge Graph Plan (docs/planning/KNOWLEDGE_GRAPH_VALIDATED_PLAN.md):**
- Health check para Knowledge Graph ya diseñado (no implementado)
- Métricas de cobertura de amenities ya definidas

### Estado Actual (405 propiedades activas venta)

| Campo | Completo | % | Gap |
|-------|----------|---|-----|
| area_total_m2 | 405 | 100% | 0 |
| precio_usd | 390 | 96% | 15 |
| dormitorios | 382 | 94% | 23 |
| GPS | 380 | 94% | 25 |
| amenities | 380 | 94% | 25 |
| id_proyecto_master | 353 | 87% | 52 |

### Root Cause Analysis

**15 sin precio:**
- Precio solo en BOB sin TC especificado
- Precio en descripcion pero no en meta
- Error de scraping (campo vacio)

**23 sin dormitorios:**
- Mayoria son multiproyecto (tienen rango, no numero fijo)
- Monoambientes mal parseados (0 vs null)
- Oficinas/locales comerciales

**25 sin GPS:**
- Listings sin mapa en portal
- GPS aproximado (solo zona, no edificio)

---

### SOLUCION INMEDIATA (30 min)

**Precio faltante:**
```sql
-- Identificar los 15
SELECT id, url, datos_json->'financiero' as financiero
FROM propiedades_v2
WHERE es_activa AND tipo_operacion = 'venta' AND precio_usd IS NULL;

-- Actualizar con precio de enrichment si existe
UPDATE propiedades_v2
SET precio_usd = (datos_json->'financiero'->>'precio_usd')::numeric
WHERE precio_usd IS NULL
  AND datos_json->'financiero'->>'precio_usd' IS NOT NULL;
```

**Dormitorios faltantes:**
```sql
-- Para multiproyecto, usar el minimo detectado
UPDATE propiedades_v2
SET dormitorios = COALESCE(
    (datos_json->'fisico'->>'dormitorios')::integer,
    0  -- Asumir monoambiente si no hay dato
)
WHERE dormitorios IS NULL AND es_multiproyecto = true;
```

---

### SOLUCION ESCALABLE

**Score de completitud por propiedad:**
```sql
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS
    score_completitud INTEGER GENERATED ALWAYS AS (
        (CASE WHEN precio_usd IS NOT NULL THEN 20 ELSE 0 END) +
        (CASE WHEN area_total_m2 IS NOT NULL THEN 20 ELSE 0 END) +
        (CASE WHEN dormitorios IS NOT NULL THEN 15 ELSE 0 END) +
        (CASE WHEN id_proyecto_master IS NOT NULL THEN 25 ELSE 0 END) +
        (CASE WHEN datos_json->'ubicacion'->>'latitud' IS NOT NULL THEN 10 ELSE 0 END) +
        (CASE WHEN datos_json->'amenities'->'lista' IS NOT NULL THEN 10 ELSE 0 END)
    ) STORED;
-- Score 0-100, minimo para MVP: 70
```

**Workflow de completitud:**
```
TRIGGER: Propiedad con score_completitud < 70 despues de merge

PASOS:
1. Identificar campos faltantes
2. Intentar extraccion secundaria de descripcion
3. Si sigue incompleta → Agregar a cola de enriquecimiento manual
4. Metrica: % propiedades con score > 70
```

---

### PREVENCION

**En Enrichment:**
```javascript
// Validacion de campos criticos
const camposCriticos = ['precio_usd', 'area_total_m2', 'dormitorios'];
const faltantes = camposCriticos.filter(c => !datos[c]);

if (faltantes.length > 0) {
    datos_json.calidad.campos_faltantes = faltantes;
    datos_json.calidad.requiere_revision = true;
}
```

**Alerta proactiva:**
```sql
-- En auditoria diaria
SELECT
    fuente,
    COUNT(*) FILTER (WHERE precio_usd IS NULL) as sin_precio,
    COUNT(*) FILTER (WHERE dormitorios IS NULL) as sin_dorms,
    COUNT(*) FILTER (WHERE area_total_m2 IS NULL) as sin_area
FROM propiedades_v2
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY fuente;
-- Si alguno > 0, investigar scraper
```

---

## 5. VISTAS SQL PARA MVP

### YA EXISTE (descubierto en exploración)

**Plan Knowledge Graph APROBADO** (`docs/planning/KNOWLEDGE_GRAPH_VALIDATED_PLAN.md`):

El plan ya tiene diseñadas las funciones clave - **solo falta implementar**:

| Componente | Status | Archivo |
|------------|--------|---------|
| `buscar_unidades_reales(filtros)` | DISEÑADA, no implementada | KG Plan E.3 |
| `v_amenities_proyecto` | DISEÑADA, no implementada | KG Plan E.4 |
| `normalizar_amenity()` | DISEÑADA, no implementada | KG Plan E.5 |
| `interpretar_valor_amenity()` | DISEÑADA, no implementada | KG Plan E.6 |
| Índices GIN amenities | DISEÑADOS, no implementados | KG Plan E.2 |

**Vistas existentes en SQL:**
- `v_metricas_mercado` - YA EXISTE (`sql/views/v_metricas_mercado.sql`)
- `v_mercado_resumen` - YA EXISTE
- `get_metricas_perfil()` - YA EXISTE
- `evaluar_escasez()` - YA EXISTE

**Migración pendiente:**
- `sql/migrations/019_knowledge_graph_mvp.sql` - Ya creada pero no ejecutada

### SOLUCION INMEDIATA (30 min - ejecutar lo diseñado)

**Paso 1: Ejecutar migración Knowledge Graph (15 min)**
```bash
# La migración ya existe, solo ejecutar
psql -f sql/migrations/019_knowledge_graph_mvp.sql
```

Esto crea:
- Índices GIN para performance
- `buscar_unidades_reales()` - función de búsqueda principal
- `v_amenities_proyecto` - vista materializada
- Funciones helper de normalización

**Paso 2: Actualizar v_metricas_mercado (5 min)**
```sql
-- Agregar filtro multiproyecto a la vista existente
-- En sql/views/v_metricas_mercado.sql agregar:
AND es_multiproyecto = false
```

**Paso 3: Crear v_alternativas_proyecto (10 min)**
```sql
-- Vista NUEVA para multiproyecto (no existe en KG plan)
CREATE VIEW v_alternativas_proyecto AS
SELECT
    pm.id_proyecto_master,
    pm.nombre_oficial as proyecto,
    pm.desarrollador,
    pm.zona,
    COUNT(*) as opciones_publicadas,
    MIN(p.precio_usd) as precio_desde,
    MAX(p.precio_usd) as precio_hasta,
    -- Usar dormitorios_opciones existente en datos_json
    (SELECT array_agg(DISTINCT d::int ORDER BY d::int)
     FROM propiedades_v2 p2,
          jsonb_array_elements_text(p2.datos_json->'fisico'->'dormitorios_opciones') d
     WHERE p2.id_proyecto_master = pm.id_proyecto_master
       AND p2.es_multiproyecto = true
    ) as tipologias_disponibles,
    bool_or(
        p.datos_json->'proyecto'->>'estado_construccion' = 'preventa'
    ) as incluye_preventa
FROM propiedades_v2 p
JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
WHERE p.es_multiproyecto = true
  AND p.es_activa = true
  AND p.tipo_operacion = 'venta'
  AND p.precio_usd > 30000
GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.desarrollador, pm.zona;
```

**Paso 4: Crear v_salud_datos (5 min)**
```sql
CREATE VIEW v_salud_datos AS
SELECT
    COUNT(*) as total_propiedades,
    COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as con_proyecto,
    COUNT(*) FILTER (WHERE precio_usd IS NOT NULL) as con_precio,
    COUNT(*) FILTER (WHERE dormitorios IS NOT NULL) as con_dormitorios,
    ROUND(100.0 * COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) / COUNT(*), 1) as pct_matched,
    (SELECT COUNT(*) FROM proyectos_master WHERE activo) as total_proyectos,
    (SELECT COUNT(*) FROM proyectos_master WHERE activo AND desarrollador IS NOT NULL) as proyectos_con_dev,
    (SELECT COUNT(*) FROM matching_sugerencias WHERE estado = 'pendiente') as cola_matching,
    (SELECT COUNT(*) FROM sin_match_exportados WHERE estado = 'pendiente') as cola_sin_match,
    CURRENT_TIMESTAMP as timestamp
FROM propiedades_v2
WHERE es_activa AND tipo_operacion = 'venta';
```

---

### SOLUCION ESCALABLE (usar Knowledge Graph Plan)

**El Knowledge Graph Plan ya define la arquitectura completa:**

Ver `docs/planning/KNOWLEDGE_GRAPH_VALIDATED_PLAN.md` para:
- Semana 1 MVP: buscar_unidades_reales(), v_amenities_proyecto, índices GIN
- Post-MVP: consolidar_tipologias_proyecto(), integración Simón

**Lo que AÑADIMOS a ese plan (específico para multiproyecto):**

```
CAPA Knowledge Graph (MVP - ya diseñado):
├── buscar_unidades_reales()    -- Búsqueda con filtros
├── v_amenities_proyecto        -- Amenities consolidados
└── Índices GIN                 -- Performance

CAPA Limpieza de Datos (NUEVO):
├── v_alternativas_proyecto     -- Multiproyecto "desde $X"
├── v_salud_datos               -- Dashboard de gaps
└── v_metricas_mercado ACTUALIZADA -- Sin multiproyecto
```

**Refresh strategy (ya definida en KG Plan):**
```sql
-- El KG Plan ya define refresh_log y estrategia
-- Solo agregar nuestras vistas nuevas al refresh
CREATE OR REPLACE FUNCTION refresh_vistas_limpieza()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY v_amenities_proyecto;
    -- Las vistas normales no necesitan refresh
END;
$$ LANGUAGE plpgsql;
```

---

## RESUMEN EJECUTIVO

### CLASIFICACIÓN: Usar Existente vs Crear Nuevo

| Área | USAR EXISTENTE | CREAR NUEVO | COMPLETAR |
|------|----------------|-------------|-----------|
| **1. Desarrolladores** | - | tabla proyectos_pendientes_enriquecimiento | datos_json.proyecto.desarrollador_detectado en Enrichment |
| **2. Multiproyecto** | dormitorios_opciones, estado_construccion | v_alternativas_proyecto | precio_min/max extracción en Enrichment |
| **3. Huérfanas** | sin_match workflows, procesar_decision_sin_match() | matching_fuzzy con alias | nombre_edificio extracción de descripción |
| **4. Campos Incompletos** | score_calidad_dato, score_fiduciario | v_salud_datos | poblado de campos_faltantes |
| **5. Vistas SQL** | v_metricas_mercado, Knowledge Graph Plan | v_alternativas_proyecto | ejecutar migración 019 |

### Backlog Inmediato (2-3 horas - usando lo existente)

| # | Tarea | Tipo | Tiempo | Entregable |
|---|-------|------|--------|------------|
| 1 | **Ejecutar migración 019** | EJECUTAR | 15 min | KG funciones + índices |
| 2 | Actualizar v_metricas (excluir multi) | MODIFICAR | 10 min | Vista SQL actualizada |
| 3 | Crear v_alternativas_proyecto | CREAR | 15 min | Vista SQL nueva |
| 4 | Crear v_salud_datos | CREAR | 10 min | Vista SQL nueva |
| 5 | Excluir 4 anticrético | EJECUTAR | 5 min | UPDATE |
| 6 | Crear 5 proyectos faltantes | CREAR | 30 min | INSERT |
| 7 | Enriquecer 84 desarrolladores | COMPLETAR | 1-2 hrs | UPDATE (semi-auto) |

### Infraestructura a COMPLETAR (no crear de cero)

| # | Componente | Estado | Acción |
|---|------------|--------|--------|
| 1 | Knowledge Graph (migración 019) | DISEÑADO | **Ejecutar** |
| 2 | HITL Sin Match | OPERATIVO | Aprovechar más |
| 3 | Score de calidad | EXISTE | Exponer en vista |
| 4 | Extracción desarrollador | NO EXISTE | Crear en Enrichment |
| 5 | Extracción rangos precio | PARCIAL | Completar en Enrichment |

### Lo que NO debemos crear (ya existe)

- ❌ Nueva tabla para amenities → Ya existe en datos_json con confianza
- ❌ Sistema HITL para huérfanas → Ya existe sin_match workflows
- ❌ Score de completitud → Ya existe score_calidad_dato
- ❌ Funciones de búsqueda → Ya diseñadas en Knowledge Graph Plan
- ❌ campos precio_min/max → Ya existen, solo falta poblar

### KPIs de Salud (Alertas automáticas)

| Métrica | Umbral OK | Alerta |
|---------|-----------|--------|
| % con proyecto | > 95% | < 90% |
| % con precio | > 98% | < 95% |
| % proyectos con desarrollador | > 80% | < 70% |
| Cola HITL pendiente | < 20 | > 50 |
| Huérfanas nuevas/día | < 5 | > 10 |

---

## APENDICE A: Lista de 84 Proyectos sin Desarrollador

| # | Proyecto | Zona |
|---|----------|------|
| 1 | 281 | Equipetrol |
| 2 | 91 - Alto Busch | Equipetrol |
| 3 | Alto Busch | Equipetrol |
| 4 | Aqua Tower | Equipetrol |
| 5 | Aura Residences | Equipetrol |
| 6 | Breeze Tower | Equipetrol |
| 7 | Concret Equipetrol | Equipetrol |
| 8 | CONDADO IV | Equipetrol |
| 9 | Condado Park V | Equipetrol |
| 10 | Condado VI Plaza Italia | Equipetrol |
| 11-25 | Condominios varios | Equipetrol |
| 26-50 | Edificios varios | Equipetrol |
| 51-70 | Torres y residencias | Equipetrol |
| 71 | Swissotel Santa Cruz | Equipetrol Norte |
| 72-82 | Proyectos sin zona | Sin zona |
| 83-84 | Condominios Sirari | Sirari |

*(Lista completa en query: `SELECT nombre_oficial, zona FROM proyectos_master WHERE activo AND desarrollador IS NULL ORDER BY zona, nombre_oficial`)*

---

## APENDICE B: Lista de 68 Multiproyecto

| Proyecto | Listings | Precio Rango | Tipologias |
|----------|----------|--------------|------------|
| Sky Equinox | 7 | $46k-$72k | 0D, 1D |
| T-Veinticinco | 9 | $213k-$304k | 2D |
| Domus Insignia | 3 | $46k-$123k | 0D, 1D, 2D |
| Domus Infinity | 2 | $69k-$77k | 0D, 1D |
| HH Chuubi | 2 | $91k-$93k | 1D |
| HH Once | 2 | $96k-$117k | 1D, 2D |
| Sky Level | 5 | $103k-$193k | 1D, 2D |
| Spazios Eden | 2 | $57k-$76k | 1D |
| Spazios 1 | 1 | $157k | 2D |
| Spazios | 1 | $454k | 3D |
| ITAJU | 4 | $327k | 3D |
| Vertical Terra | 2 | $89k-$145k | 1D, 2D |
| Remax (genericos) | 17 | $43k-$653k | 1D-3D |
| Otros | 11 | variado | variado |

*(Lista completa con URLs en query)*
