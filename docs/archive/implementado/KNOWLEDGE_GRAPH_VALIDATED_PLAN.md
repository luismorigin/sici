# SICI Knowledge Graph - Plan Validado con MCP

**Fecha:** 5 Enero 2026
**Status:** APROBADO
**Validación:** Schema real inspeccionado vía postgres-sici MCP

---

## A. RESUMEN EJECUTIVO

El Design Doc (`SICI_KNOWLEDGE_GRAPH_DESIGN.md`) propone agregar 8 columnas JSONB a `proyectos_master` para amenities, equipamiento, tipologías, etc. Sin embargo, **MCP revela que ya existe un sistema rico de amenities a nivel de propiedad** con tracking de confianza y fuente.

El gap principal NO es el schema sino la **consolidación de datos de propiedades hacia proyectos**.

**Ajustes clave:**
1. **NO crear columnas JSONB redundantes** - usar funciones de agregación
2. **Priorizar consolidación automática** sobre extracción IA (ya hay data)
3. **373/439 propiedades ya tienen amenities con confianza** - aprovechar
4. **Query Layer es la pieza faltante real** - las funciones de búsqueda

---

## PRIORIDADES APROBADAS

### Semana 1 - MVP
- [ ] `buscar_unidades_reales()` - función de búsqueda principal
- [ ] `v_amenities_proyecto` - vista materializada
- [ ] Índices GIN para performance

### Post-MVP (Diferido)
- Fase 5: Enrichment IA (84 proyectos sin desarrollador)
- `consolidar_tipologias_proyecto()` - extraer tipologías de multiproyecto

---

## B. ESTADO ACTUAL DEL SCHEMA (CONFIRMADO POR MCP)

### B.1 proyectos_master (188 activos)

| Columna | Tipo | Estado |
|---------|------|--------|
| id_proyecto_master | integer | EXISTE |
| nombre_oficial | text | EXISTE |
| alias_conocidos | text[] | EXISTE |
| latitud, longitud | numeric | EXISTE |
| zona | text | EXISTE |
| desarrollador | text | EXISTE (104/188 = 55%) |
| tipo_proyecto | text | EXISTE (82/188 = 44%) |
| google_place_id | varchar | EXISTE |
| gps_verificado_google | boolean | EXISTE |
| **amenities** | JSONB | NO EXISTE (propuesto) |
| **equipamiento_estandar** | JSONB | NO EXISTE (propuesto) |
| **tipologias** | JSONB | NO EXISTE (propuesto) |
| **estructura** | JSONB | NO EXISTE (propuesto) |

### B.2 propiedades_v2 (439 activas, 335 completadas)

| Columna/Key | Contenido | Cobertura |
|-------------|-----------|-----------|
| id_proyecto_master | FK a proyecto | 353/439 (80%) |
| es_multiproyecto | Listing genérico | 68 multiproyecto |
| datos_json->'**agente**' | {nombre, telefono, oficina_nombre} | 373/439 (85%) |
| datos_json->'amenities' | Estructura rica con confianza | 373/439 (85%) |
| datos_json->'contenido'->'**fotos_urls**' | Array de URLs | EXISTE |
| datos_json->'fisico' | {dormitorios, area, banos...} | EXISTE |

### B.3 Estructura REAL de amenities (datos_json->'amenities')

```json
{
  "lista": ["Piscina", "Churrasquera", "Sauna/Jacuzzi", "Seguridad 24/7"],
  "equipamiento": ["Aire Acondicionado", "Cocina Equipada"],
  "estado_amenities": {
    "Piscina": {
      "valor": true,
      "fuente": "jsonld",
      "confianza": "alta"
    },
    "Pet Friendly": {
      "valor": "por_confirmar",
      "fuente": "no_detectado",
      "confianza": "baja"
    }
  }
}
```

### B.4 Estructura REAL de agente (datos_json->'agente')

```json
{
  "nombre": "Fernando Lamas Varanda",
  "telefono": "+59178000988",
  "oficina_nombre": "Home"
}
```

**NOTA:** El Design Doc usa "asesor" e "inmobiliaria", pero la DB real usa **"agente"** y **"oficina_nombre"**.

---

## C. CORRESPONDENCIA DOC ↔ DB

### C.1 Correcciones de Keys

| Design Doc | DB Real | Acción |
|------------|---------|--------|
| `datos_json->'asesor'` | `datos_json->'agente'` | Usar key real |
| `datos_json->'asesor'->>'inmobiliaria'` | `datos_json->'agente'->>'oficina_nombre'` | Usar key real |
| `datos_json->'contenido'->'fotos'` | `datos_json->'contenido'->'fotos_urls'` | Usar key real |

### C.2 Lo que YA EXISTE (no duplicar)

| Design Doc Propone | DB Real | Acción |
|--------------------|---------|--------|
| amenities en proyecto | amenities en propiedad (85%) | CONSOLIDAR |
| equipamiento_estandar | equipamiento en propiedad | CONSOLIDAR |
| Score de calidad | score_calidad_dato, score_fiduciario | Ya existen |

### C.3 Lo que FALTA (implementar)

| Campo | Prioridad | Justificación |
|-------|-----------|---------------|
| tipologias en proyecto | DIFERIDO | Necesario para búsqueda |
| Query Layer (funciones) | **MVP** | Core del Knowledge Graph |
| estado_comercial | DIFERIDO | Preventa/construcción |

### C.4 Lo que SOBRA (omitir)

| Campo | Razón |
|-------|-------|
| amenities JSONB en proyecto | Ya existe a nivel propiedad |
| acabados JSONB | Bajo ROI |
| seguridad JSONB | Mayoría tiene "Seguridad 24/7" por defecto |

---

## D. GAPS CRÍTICOS (Top 10)

| # | Gap | Impacto | Mitigación |
|---|-----|---------|------------|
| 1 | No hay tipologías en proyecto | No se puede buscar "2D en X" | DIFERIDO |
| 2 | **No hay función de búsqueda** | Simón no filtra por amenities | **MVP: buscar_unidades_reales()** |
| 3 | 84/188 proyectos sin desarrollador | 45% sin metadata | DIFERIDO |
| 4 | **Data amenities dispersa** | Por propiedad, no proyecto | **MVP: v_amenities_proyecto** |
| 5 | Key "agente" vs "asesor" | Doc incorrecto | Ajustar funciones |
| 6 | 68 multiproyecto sin tipologías | Info perdida | DIFERIDO |
| 7 | **Sin índices GIN** | Performance JSONB | **MVP: Crear índices** |
| 8 | Sin FK formal | Integridad débil | Migración 017 |
| 9 | Views ausentes | Recálculo constante | MVP: v_amenities_proyecto |
| 10 | Sin score unificado | Duplicación | DIFERIDO |

---

## E. AJUSTES MÍNIMOS RECOMENDADOS

### E.1 Schema (proyectos_master) - DIFERIDO

```sql
-- Post-MVP
ALTER TABLE proyectos_master ADD COLUMN IF NOT EXISTS
  tipologias JSONB DEFAULT '[]',
  estado_comercial JSONB DEFAULT '{}';
```

### E.2 Índices GIN - MVP

```sql
-- PRIORIDAD MVP
CREATE INDEX idx_propiedades_amenities ON propiedades_v2
  USING GIN ((datos_json->'amenities') jsonb_path_ops);

-- Post-MVP
CREATE INDEX idx_proyectos_tipologias ON proyectos_master
  USING GIN (tipologias jsonb_path_ops);
```

### E.3 Funciones SQL Corregidas - MVP

```sql
-- PRIORIDAD MVP: Usar keys reales 'agente', 'oficina_nombre', 'fotos_urls'
CREATE OR REPLACE FUNCTION buscar_unidades_reales(p_filtros JSONB DEFAULT '{}')
RETURNS TABLE (
  id INTEGER,
  proyecto TEXT,
  dormitorios INTEGER,
  precio_usd NUMERIC,
  area_m2 NUMERIC,
  asesor_nombre TEXT,
  asesor_wsp TEXT,
  asesor_inmobiliaria TEXT,
  cantidad_fotos INTEGER,
  url TEXT,
  amenities_lista JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    pm.nombre_oficial,
    p.dormitorios,
    p.precio_usd,
    p.area_total_m2,
    p.datos_json->'agente'->>'nombre',
    p.datos_json->'agente'->>'telefono',
    p.datos_json->'agente'->>'oficina_nombre',
    jsonb_array_length(COALESCE(p.datos_json->'contenido'->'fotos_urls', '[]'))::integer,
    p.url,
    p.datos_json->'amenities'->'lista'
  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  WHERE p.es_activa = true
    AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
    AND pm.activo = true
    -- Filtros dinámicos
    AND (p_filtros->>'dormitorios' IS NULL
         OR p.dormitorios = (p_filtros->>'dormitorios')::int)
    AND (p_filtros->>'precio_max' IS NULL
         OR p.precio_usd <= (p_filtros->>'precio_max')::numeric)
    AND (p_filtros->>'precio_min' IS NULL
         OR p.precio_usd >= (p_filtros->>'precio_min')::numeric)
    AND (p_filtros->>'zona' IS NULL
         OR pm.zona ILIKE '%' || (p_filtros->>'zona') || '%')
  ORDER BY p.precio_usd ASC;
END;
$$ LANGUAGE plpgsql;
```

### E.4 Vista Materializada v_amenities_proyecto - MVP

```sql
-- PRIORIDAD MVP
CREATE MATERIALIZED VIEW v_amenities_proyecto AS
SELECT
  pm.id_proyecto_master,
  pm.nombre_oficial,
  -- Amenities confirmados (confianza >= media Y valor = true)
  jsonb_agg(DISTINCT amenity) FILTER (
    WHERE estado->>'valor' = 'true'
    AND estado->>'confianza' IN ('alta', 'media')
  ) as amenities_confirmados,
  -- Amenities posibles (confianza baja O por_confirmar)
  jsonb_agg(DISTINCT amenity) FILTER (
    WHERE estado->>'valor' = 'por_confirmar'
    OR estado->>'confianza' = 'baja'
  ) as amenities_posibles
FROM proyectos_master pm
JOIN propiedades_v2 p ON p.id_proyecto_master = pm.id_proyecto_master
CROSS JOIN LATERAL jsonb_each(p.datos_json->'amenities'->'estado_amenities') AS e(amenity, estado)
WHERE pm.activo = true
  AND p.es_activa = true
  AND jsonb_typeof(p.datos_json->'amenities'->'estado_amenities') = 'object'
GROUP BY pm.id_proyecto_master;

CREATE UNIQUE INDEX ON v_amenities_proyecto (id_proyecto_master);
```

### E.5 Normalización de Amenities (CRÍTICO)

Los 16 amenities existentes en la DB (confirmado por MCP):

| Label en DB | Key Normalizada | Alias Aceptados |
|-------------|-----------------|-----------------|
| "Piscina" | `piscina` | pileta, alberca |
| "Pet Friendly" | `pet_friendly` | mascotas, permite_mascotas |
| "Gimnasio" | `gimnasio` | gym, fitness |
| "Churrasquera" | `churrasquera` | parrilla, bbq |
| "Sauna/Jacuzzi" | `sauna_jacuzzi` | spa, hidromasaje |
| "Ascensor" | `ascensor` | elevador |
| "Seguridad 24/7" | `seguridad_24h` | vigilancia, porteria |
| "Co-working" | `coworking` | cowork, oficina_compartida |
| "Área Social" | `area_social` | salon_social |
| "Salón de Eventos" | `salon_eventos` | salon_fiestas |
| "Terraza/Balcón" | `terraza` | balcon, rooftop |
| "Jardín" | `jardin` | areas_verdes |
| "Parque Infantil" | `parque_infantil` | juegos_ninos, playground |
| "Recepción" | `recepcion` | lobby, hall |
| "Lavadero" | `lavadero` | lavanderia |
| "Estacionamiento para Visitas" | `estacionamiento_visitas` | parqueo_visitas |

**Función de normalización:**

```sql
CREATE OR REPLACE FUNCTION normalizar_amenity(p_label TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE lower(trim(p_label))
    WHEN 'piscina' THEN 'piscina'
    WHEN 'pileta' THEN 'piscina'
    WHEN 'pet friendly' THEN 'pet_friendly'
    WHEN 'mascotas' THEN 'pet_friendly'
    WHEN 'gimnasio' THEN 'gimnasio'
    WHEN 'gym' THEN 'gimnasio'
    WHEN 'churrasquera' THEN 'churrasquera'
    WHEN 'parrilla' THEN 'churrasquera'
    WHEN 'sauna/jacuzzi' THEN 'sauna_jacuzzi'
    WHEN 'spa' THEN 'sauna_jacuzzi'
    WHEN 'ascensor' THEN 'ascensor'
    WHEN 'seguridad 24/7' THEN 'seguridad_24h'
    WHEN 'co-working' THEN 'coworking'
    WHEN 'cowork' THEN 'coworking'
    WHEN 'área social' THEN 'area_social'
    WHEN 'salón de eventos' THEN 'salon_eventos'
    WHEN 'terraza/balcón' THEN 'terraza'
    WHEN 'jardín' THEN 'jardin'
    WHEN 'parque infantil' THEN 'parque_infantil'
    WHEN 'recepción' THEN 'recepcion'
    WHEN 'lavadero' THEN 'lavadero'
    WHEN 'estacionamiento para visitas' THEN 'estacionamiento_visitas'
    ELSE lower(regexp_replace(trim(p_label), '[^a-z0-9]', '_', 'g'))
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Las funciones de búsqueda usan keys normalizadas, no labels.**

### E.6 Fix Bug Boolean en estado_amenities

El campo `valor` puede ser:
- `true` (boolean) → amenity confirmado
- `"por_confirmar"` (string) → amenity posible
- `false` o `null` → no tiene el amenity

**Mapeo:**

| valor en DB | Interpretación | Categoría |
|-------------|----------------|-----------|
| `true` | Confirmado | confirmado |
| `"por_confirmar"` | Posible | posible |
| `false` | No tiene | excluir |
| `null` | Desconocido | excluir |

**Función helper:**

```sql
CREATE OR REPLACE FUNCTION interpretar_valor_amenity(p_valor JSONB)
RETURNS TEXT AS $$
BEGIN
  IF p_valor IS NULL THEN
    RETURN 'no_tiene';
  ELSIF jsonb_typeof(p_valor) = 'boolean' THEN
    RETURN CASE WHEN p_valor::boolean THEN 'confirmado' ELSE 'no_tiene' END;
  ELSIF jsonb_typeof(p_valor) = 'string' THEN
    RETURN CASE WHEN p_valor::text = '"por_confirmar"' THEN 'posible' ELSE 'no_tiene' END;
  ELSE
    RETURN 'no_tiene';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### E.7 Categorías de Amenities

**Definiciones:**

```sql
-- amenities_confirmados: confianza >= "media" AND valor = true
-- amenities_posibles: confianza = "baja" OR valor = "por_confirmar"
```

**En la vista materializada:**

```sql
-- Filtro para confirmados
WHERE interpretar_valor_amenity(estado->'valor') = 'confirmado'
  AND estado->>'confianza' IN ('alta', 'media')

-- Filtro para posibles
WHERE interpretar_valor_amenity(estado->'valor') = 'posible'
   OR estado->>'confianza' = 'baja'
```

**Uso en búsqueda:**

```sql
-- Simón busca "piscina" → buscar en amenities_confirmados
-- Si no hay resultados → expandir a amenities_posibles con disclaimer

SELECT * FROM buscar_unidades_reales('{
  "amenities": ["piscina"],
  "incluir_posibles": false  -- default
}'::jsonb);
```

---

## F. PLAN DE IMPLEMENTACIÓN

### Semana 1 - MVP
- [ ] Índice GIN sobre datos_json->'amenities'
- [ ] Funciones helper: normalizar_amenity(), interpretar_valor_amenity()
- [ ] Vista materializada v_amenities_proyecto
- [ ] Función buscar_unidades_reales(filtros)
- [ ] Test de búsqueda con filtros

### Post-MVP (Fase 2+)
- [ ] Migración 019: tipologias, estado_comercial
- [ ] consolidar_tipologias_proyecto(id)
- [ ] buscar_proyectos_compatibles(filtros)
- [ ] obtener_listings_proyecto(id)
- [ ] Enrichment IA (84 proyectos)
- [ ] Integración Simón

---

## G. CHECKLIST DE PRUEBAS

### G.1 Validación MVP

```sql
-- Verificar índice GIN creado
SELECT indexname FROM pg_indexes
WHERE tablename = 'propiedades_v2' AND indexname LIKE '%amenities%';

-- Verificar vista materializada
SELECT COUNT(*) FROM v_amenities_proyecto;

-- Test búsqueda básica
SELECT * FROM buscar_unidades_reales('{"dormitorios": 2}'::jsonb) LIMIT 5;

-- Test búsqueda con precio
SELECT * FROM buscar_unidades_reales('{"precio_max": 100000}'::jsonb) LIMIT 5;
```

### G.2 Validación Keys Correctas

```sql
-- Verificar estructura agente
SELECT
  datos_json->'agente'->>'nombre' as nombre,
  datos_json->'agente'->>'telefono' as telefono,
  datos_json->'agente'->>'oficina_nombre' as oficina
FROM propiedades_v2
WHERE datos_json->'agente' IS NOT NULL
LIMIT 3;

-- Verificar fotos_urls
SELECT
  jsonb_array_length(datos_json->'contenido'->'fotos_urls') as fotos
FROM propiedades_v2
WHERE datos_json->'contenido'->'fotos_urls' IS NOT NULL
LIMIT 5;
```

### G.3 Validación Normalización

```sql
-- Test función normalizar_amenity
SELECT
  normalizar_amenity('Pet Friendly') = 'pet_friendly' as test1,
  normalizar_amenity('Piscina') = 'piscina' as test2,
  normalizar_amenity('Co-working') = 'coworking' as test3;

-- Test función interpretar_valor_amenity
SELECT
  interpretar_valor_amenity('true'::jsonb) = 'confirmado' as test1,
  interpretar_valor_amenity('"por_confirmar"'::jsonb) = 'posible' as test2,
  interpretar_valor_amenity('false'::jsonb) = 'no_tiene' as test3;
```

---

## H. PREGUNTAS ABIERTAS (RESUELTAS)

| Pregunta | Decisión |
|----------|----------|
| ¿Consolidación batch o real-time? | Batch post-merge nocturno |
| ¿Threshold de confianza? | >= "media" para confirmados |
| ¿Tipologías en columna o calculadas? | DIFERIDO |
| ¿Views materializadas o funciones? | Views con refresh + fallback |

---

## I. MÉTRICAS DE ÉXITO

| Métrica | Actual | Target MVP |
|---------|--------|------------|
| Función buscar_unidades_reales | NO EXISTE | Funcional |
| Vista v_amenities_proyecto | NO EXISTE | Funcional |
| Índice GIN amenities | NO EXISTE | Creado |
| Tiempo búsqueda | N/A | <500ms |

---

## J. FALLBACK Y OBSERVABILIDAD

### J.1 Fallback si Vista Materializada Falla

```sql
-- Si v_amenities_proyecto no está disponible o está stale,
-- las funciones de búsqueda calculan on-the-fly (más lento pero funciona)

CREATE OR REPLACE FUNCTION buscar_unidades_reales(p_filtros JSONB)
RETURNS TABLE (...) AS $$
DECLARE
  v_usar_vista BOOLEAN;
BEGIN
  -- Verificar si vista existe y está actualizada
  SELECT EXISTS (
    SELECT 1 FROM pg_matviews WHERE matviewname = 'v_amenities_proyecto'
  ) INTO v_usar_vista;

  IF v_usar_vista THEN
    -- Usar vista materializada (rápido)
    RETURN QUERY SELECT ... FROM v_amenities_proyecto ...;
  ELSE
    -- Calcular on-the-fly (lento pero funciona)
    RETURN QUERY SELECT ... FROM propiedades_v2 ...;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### J.2 Alertas y Monitoreo

```sql
-- Registrar duración de refresh
CREATE TABLE IF NOT EXISTS refresh_log (
  id SERIAL PRIMARY KEY,
  vista TEXT NOT NULL,
  inicio TIMESTAMP NOT NULL,
  fin TIMESTAMP,
  duracion_ms INTEGER,
  filas INTEGER,
  error TEXT
);

-- Alerta Slack si refresh tarda > 5 min (implementar en n8n)
```

### J.3 Log de Queries Lentas

```sql
-- Query para detectar búsquedas lentas (> 500ms)
SELECT
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE query ILIKE '%buscar_unidades%'
  AND mean_exec_time > 500
ORDER BY mean_exec_time DESC;
```

### J.4 Health Check para Knowledge Graph

```sql
-- Agregar a auditoría diaria
SELECT jsonb_build_object(
  'vista_amenities_existe', EXISTS(SELECT 1 FROM pg_matviews WHERE matviewname = 'v_amenities_proyecto'),
  'funcion_buscar_existe', EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'buscar_unidades_reales'),
  'indice_gin_existe', EXISTS(SELECT 1 FROM pg_indexes WHERE indexname LIKE '%amenities%'),
  'cobertura_amenities', (
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE datos_json->'amenities' IS NOT NULL) / COUNT(*), 1)
    FROM propiedades_v2 WHERE es_activa = true
  )
) as knowledge_graph_health;
```

---

*Plan validado con MCP: 5 Enero 2026*
*Status: APROBADO*
*MVP: buscar_unidades_reales() + v_amenities_proyecto + Índices GIN*
