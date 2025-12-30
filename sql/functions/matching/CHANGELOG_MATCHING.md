# CHANGELOG - Matching

## [3.1.0] - 2025-12-30

### New Features

1. **GPS Matching Reactivado**
   - Filtro por `proyectos_master.gps_verificado_google = TRUE`
   - Solo proyectos con GPS verificado participan en matching por distancia
   - Evita falsos positivos por GPS heredado de propiedades

2. **Human-in-the-Loop System**
   - Google Sheet "SICI - Matching Bandeja de Aprobación"
   - Sugerencias 70-84% van a revisión humana
   - Sugerencias ≥85% se auto-aprueban
   - Supervisor 8 PM procesa decisiones

3. **Proyecto Alternativo**
   - Columnas M (PROYECTO_ALTERNATIVO) y N (GPS_ALTERNATIVO) en Sheet
   - Cuando humano rechaza y proporciona alternativo:
     - Si proyecto existe (nombre exacto): usa existente
     - Si GPS < 15m + nombre ≥70% similar: usa existente
     - Si no: crea proyecto nuevo
   - Match se aplica directamente (sin segunda aprobación)

4. **Workflows n8n en Producción**
   - `matching_nocturno.json` v1.0 - Ejecuta 4 AM diario
   - `matching_supervisor.json` v1.0 - Ejecuta 8 PM diario
   - `radar_mensual.json` v1.0 - Ejecuta día 1 de cada mes

### Funciones Actualizadas

| Función | Versión | Cambios |
|---------|---------|---------|
| `matching_completo_automatizado()` | v3.1 | Filtro gps_verificado_google |
| `crear_proyecto_desde_sugerencia()` | v2.0 | GPS alternativo + validación duplicados |
| `calcular_similitud()` | v1.0 | Nueva - Levenshtein para fuzzy |
| `calcular_distancia_metros()` | v1.0 | Nueva - Haversine para GPS |

### Nuevas Migraciones

| # | Archivo | Propósito |
|---|---------|-----------|
| 006 | `crear_proyecto_desde_sugerencia.sql` | RPC básica |
| 007 | `crear_proyecto_con_gps_validacion.sql` | RPC v2 + validación GPS/fuzzy |

### Documentación

- `docs/MANUAL_USUARIO_SHEETS.md` - Manual para usuarios de Google Sheets
- `docs/modulo_2/MATCHING_NOCTURNO_SPEC.md` - Especificación técnica

---

## [3.0.0] - 2025-12-28

### Breaking Changes

- **Migración completa a propiedades_v2:**
  - Todas las funciones ahora operan sobre `propiedades_v2` en lugar de `propiedades` (legacy)
  - FK de `matching_sugerencias.propiedad_id` apunta a `propiedades_v2.id`
  - Filtros adaptados: `status IN ('completado', 'actualizado')` y `es_para_matching = true`

### New Features

1. **Infraestructura de Microzonas GPS**
   - Nueva tabla `zonas_geograficas` con polígonos PostGIS
   - 7 microzonas de Equipetrol cargadas desde GeoJSON v4
   - Función `poblar_zonas_batch()` para asignación masiva por GPS
   - Función `get_zona_by_gps()` para consultas puntuales
   - Columna `microzona` en propiedades_v2

2. **Multi-source fallback para nombre_edificio**
   - Prioridad: columna > JSON enrichment > JSON merge
   ```sql
   COALESCE(
       NULLIF(TRIM(p.nombre_edificio), ''),
       TRIM(p.datos_json_enrichment->>'nombre_edificio'),
       TRIM(p.datos_json->'proyecto'->>'nombre_edificio')
   )
   ```

3. **Nuevas migraciones SQL**
   - `003_matching_sugerencias_fk_v2.sql` - FK hacia propiedades_v2
   - `004_microzonas_schema.sql` - Tabla y polígonos
   - `005_asignar_zona_por_gps.sql` - Funciones de asignación

### Funciones Actualizadas

| Función | Versión | Cambios |
|---------|---------|---------|
| `generar_matches_por_nombre()` | v3.0 | propiedades_v2, multi-source fallback |
| `generar_matches_por_url()` | v3.0 | propiedades_v2, retorna estadísticas |
| `generar_matches_fuzzy()` | v3.0 | propiedades_v2, requiere zona match |
| `aplicar_matches_aprobados()` | v3.0 | propiedades_v2, respeta candados |
| `matching_completo_automatizado()` | v3.0 | Orquestador actualizado |

### Resultados en Producción

| Métrica | Valor |
|---------|-------|
| Propiedades matcheadas | 82 (37.1%) |
| Matches por nombre | 45 (95% confianza) |
| Matches por URL | 35 (85-90% confianza) |
| Matches por fuzzy | 19 (75-90% confianza) |
| Propiedades con zona GPS | 370 (86%) |

### Análisis del GAP

| Razón | Propiedades | % |
|-------|-------------|---|
| Sin nombre_edificio | 98 | 70.5% |
| Fuera de polígonos (marketing vs GPS) | 27 | 19.4% |
| Nombre sin match en proyectos_master | 14 | 10.1% |

### Fixed

- `confianza_sugerencia_extractor` cambiado de NUMERIC(3,2) a NUMERIC(5,2) para scores 85-95
- Filtros de status adaptados para propiedades_v2

### Archivos Creados/Modificados

| Archivo | Tipo |
|---------|------|
| `sql/functions/matching/generar_matches_por_nombre.sql` | Actualizado v3.0 |
| `sql/functions/matching/generar_matches_por_url.sql` | Actualizado v3.0 |
| `sql/functions/matching/generar_matches_fuzzy.sql` | Actualizado v3.0 |
| `sql/functions/matching/aplicar_matches_aprobados.sql` | Actualizado v3.0 |
| `sql/functions/matching/matching_completo_automatizado.sql` | Actualizado v3.0 |
| `sql/migrations/003_matching_sugerencias_fk_v2.sql` | Nuevo |
| `sql/migrations/004_microzonas_schema.sql` | Nuevo |
| `sql/migrations/005_asignar_zona_por_gps.sql` | Nuevo |
| `geodata/microzonas_equipetrol_v4.geojson` | Existente (fuente) |

### Orden de Ejecución en Supabase

```sql
-- 1. Migración FK (requiere limpiar datos legacy)
\i sql/migrations/003_matching_sugerencias_fk_v2.sql

-- 2. Infraestructura microzonas
\i sql/migrations/004_microzonas_schema.sql

-- 3. Funciones de asignación GPS
\i sql/migrations/005_asignar_zona_por_gps.sql

-- 4. Poblar zonas (ejecutar una vez)
SELECT * FROM poblar_zonas_batch();

-- 5. Funciones de matching (DROP primero si existen)
DROP FUNCTION IF EXISTS generar_matches_por_nombre();
DROP FUNCTION IF EXISTS generar_matches_por_url();
DROP FUNCTION IF EXISTS generar_matches_fuzzy();
DROP FUNCTION IF EXISTS aplicar_matches_aprobados();

\i sql/functions/matching/generar_matches_por_nombre.sql
\i sql/functions/matching/generar_matches_por_url.sql
\i sql/functions/matching/generar_matches_fuzzy.sql
\i sql/functions/matching/aplicar_matches_aprobados.sql
\i sql/functions/matching/matching_completo_automatizado.sql

-- 6. Ejecutar matching completo
SELECT * FROM matching_completo_automatizado();

-- 7. (v3.1) Funciones Human-in-the-Loop
\i sql/migrations/006_crear_proyecto_desde_sugerencia.sql
\i sql/migrations/007_crear_proyecto_con_gps_validacion.sql
```

---

## [2.0.0] - 2024-12-xx (Versión anterior - Legacy)

- Operaba sobre tabla `propiedades` (legacy)
- Sin soporte para multi-source fallback
- Sin infraestructura de microzonas GPS
