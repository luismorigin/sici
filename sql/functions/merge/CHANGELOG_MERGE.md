# CHANGELOG - Merge

## [2.4.0] - 2026-03-23

### New Features — Fase C: Merge consume LLM output

El merge ahora lee `datos_json_enrichment.llm_output` y lo usa en las cadenas de prioridad.

1. **Dormitorios — nueva cadena de prioridad:**
   - `candado → LLM (confianza alta + difiere de discovery) → discovery → LLM fallback → regex → existing`
   - Resuelve monoambientes: discovery dice 1, LLM con confianza alta dice 0 → LLM gana

2. **Estado construcción — LLM con protección:**
   - LLM actualiza `no_especificado` → valor real, `nuevo_a_estrenar` → `entrega_inmediata`
   - **Regla de protección:** NUNCA degrada `entrega_inmediata` → `preventa` (anuncios desactualizados)
   - Nueva fuente tracking: `v_fuente_estado_construccion` (`llm`, `existing`, `existing_protected`)

3. **Nombre edificio — LLM como fallback:**
   - Cadena: `candado → discovery → enrichment (regex) → LLM → existing`
   - LLM llena nombres cuando ni discovery ni regex tienen dato (ej: SANTORINI VENTURA)

4. **solo_tc_paralelo y es_multiproyecto — LLM directo:**
   - `COALESCE(llm, valor_existente)` en el UPDATE
   - Sin fuente discovery/regex confiable para estos campos

### Changed

- `datos_json.proyecto` incluye `fuente_estado_construccion`
- `datos_json.trazabilidad` incluye `llm_version`, `llm_model`
- `cambios_merge` incluye `llm_disponible` y fuente `estado_construccion`
- `version_merge` → `2.4.0`

### Backfill pre-deploy (23 Mar 2026)

Correcciones manuales confirmadas por auditoría LLM (20 Mar):
- 24 monoambientes: dormitorios 1→0
- 1 dormi inverso: 0→1 (ID 953)
- 5 nombre_edificio corregidos (Sirari Palm, Sky Luxia, Malibú Friendly, Sky Eclipse, Uptown Drei)

### Migración

`sql/migrations/195_merge_consume_llm_output.sql`

---

## [2.1.0] - 2025-12-25

### New Features ✨

- **Soporte para columna `nombre_edificio`:**
  - Extracción desde Discovery y Enrichment
  - Prioridad: Discovery > Enrichment (consistente con otros campos físicos)
  - Respeta candados manuales
  - Nueva fuente tracking: `v_fuente_nombre_edificio`

- **Soporte para columna `zona`:**
  - Extracción desde Discovery y Enrichment
  - Prioridad: Discovery > Enrichment
  - Respeta candados manuales
  - Nueva fuente tracking: `v_fuente_zona`

### Changed

- Actualizado `datos_json.ubicacion` para incluir `zona` y `fuente_zona`
- Actualizado `datos_json.proyecto` para usar valor resuelto de `nombre_edificio`
- Actualizado `cambios_merge.fuentes` para incluir nuevas fuentes

### Columnas Actualizadas en UPDATE

```sql
nombre_edificio = v_nombre_edificio_final,
zona = v_zona_final,
```

### Preparación Módulo 2

Esta versión prepara las columnas necesarias para el Módulo 2 (Property Matching) que requiere:
- `nombre_edificio` para matching por nombre de proyecto
- `zona` para filtrado geográfico

---

## [2.0.1] - 2025-12-24

### Fixed 🐛

- **Fix área=0 fallback:** Cuando Discovery tiene `m2C=0` (común en preventas), ahora hace fallback a Enrichment en lugar de insertar 0
- Previene violación de `check_area_positive` constraint
- También valida que Enrichment tenga área > 0 antes de usarla

### Changed

```sql
-- ANTES (v2.0.0):
ELSIF v_disc_area IS NOT NULL THEN

-- DESPUÉS (v2.0.1):
ELSIF v_disc_area IS NOT NULL AND v_disc_area > 0 THEN
```

### Ejemplo de Propiedad Afectada

- ID: 75962 (preventa con m2C=0, m2T=37)
- Antes: Fallaba con constraint violation
- Ahora: Usa área de Enrichment (37 m²)

---

## [2.0.0] - 2025-12-23

### Breaking Changes ⚠️

- **Inversión de prioridad para campos físicos:**
  - v1.2.0: Enrichment > Discovery
  - v2.0.0: **Discovery > Enrichment** para área, dormitorios, baños, estacionamientos
  
- **Estructura datos_json completamente nueva:**
  - v1.2.0: 3 secciones básicas (financiero, fisico, ubicacion)
  - v2.0.0: **11 secciones agrupadas** (financiero, fisico, ubicacion, proyecto, amenities, agente, contenido, calidad, discovery_metadata, discrepancias, trazabilidad)

### New Features ✨

1. **Helper para normalización de paths por portal**
   - `get_discovery_value(campo, discovery, fuente)` - Extrae valores normalizando Remax vs C21
   - `get_discovery_value_numeric()` - Wrapper con casteo a NUMERIC
   - `get_discovery_value_integer()` - Wrapper con casteo a INTEGER
   - Archivo: `funciones_helper_merge.sql`

2. **Cálculo de discrepancias con thresholds**
   - `calcular_discrepancia_porcentual()` - Para campos numéricos (precio, área)
   - `calcular_discrepancia_exacta()` - Para campos enteros (dorms, baños)
   - Thresholds: <2% OK, 2-10% warning, >10% error

3. **Regla especial de precio con fallback**
   - Discovery si USD puro y enrichment no normalizó
   - Si discrepancia >10%, usar Enrichment como fallback seguro
   - Nuevo valor `fuente_precio`: 'discovery', 'enrichment', 'enrichment_fallback', 'blocked'

4. **Validación de status pre-merge**
   - Solo procesa propiedades con status 'nueva' o 'actualizado'
   - Retorna error claro si status no válido

5. **Scoring post-merge integrado**
   - `score_calidad_dato`: Campos core (70pts) + opcionales (30pts)
   - `score_fiduciario`: Validaciones de coherencia técnica
   - `flags_semanticos`: Array de warnings/errors detectados
   - Try/catch separado para no bloquear merge si scoring falla

6. **Nuevas funciones auxiliares**
   - `propiedades_requieren_revision()` - Lista props que necesitan revisión humana
   - `estadisticas_merge()` - Dashboard de métricas actualizado
   - `obtener_discrepancias(nivel, limite)` - Filtrado por severidad

### Fixed 🐛

- Casteo seguro de GPS Remax (string → numeric)
- Validación regex para estacionamientos antes de castear
- Manejo de paths anidados en JSON discovery

### Mappings por Portal

| Campo | REMAX Path | C21 Path |
|-------|------------|----------|
| area_total_m2 | `listing_information.construction_area_m` | `m2C` |
| dormitorios | `listing_information.number_bedrooms` | `recamaras` |
| banos | `listing_information.number_bathrooms` | `banos` |
| estacionamientos | `listing_information.number_parking` | `estacionamientos` |
| latitud | `location.latitude` (STRING) | `lat` (NUMERIC) |
| longitud | `location.longitude` (STRING) | `lon` (NUMERIC) |
| precio_usd | `price.price_in_dollars` | Solo si `moneda=USD` |

### Estructura datos_json Final

```javascript
{
  // METADATA
  "version_merge": "2.0.0",
  "timestamp_merge": "...",
  "fuente": "century21|remax",
  
  // 11 SECCIONES
  "financiero": { precio_usd, precio_m2, moneda_original, tipo_cambio_*, fuente_precio, ... },
  "fisico": { area, dorms, baños, estac, fuente_*, es_multiproyecto, ... },
  "ubicacion": { lat, lon, fuente_gps, zona_validada, metodo_gps },
  "proyecto": { nombre_edificio, id_proyecto_sugerido, estado_construccion, ... },
  "amenities": { lista, equipamiento, estado_amenities },
  "agente": { nombre, telefono, oficina },
  "contenido": { descripcion, titulo, fotos_urls, cantidad_fotos },
  "calidad": { scores, flags, fuentes_confianza, requiere_revision, ... },
  "discovery_metadata": { status_portal, id_original, exclusiva, fecha_alta, ... },
  "discrepancias": { precio, area, dormitorios, banos, gps },
  "trazabilidad": { versions, fechas }
}
```

### Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `merge_discovery_enrichment.sql` | Reescrito completo v2.0.0 |
| `funciones_helper_merge.sql` | NUEVO - Helpers de normalización |
| `funciones_auxiliares_merge.sql` | Actualizado a v2.0.0 |

### Orden de Ejecución en Supabase

```sql
-- 1. Primero los helpers (dependencia)
\i sql/functions/merge/funciones_helper_merge.sql

-- 2. Luego la función principal
\i sql/functions/merge/merge_discovery_enrichment.sql

-- 3. Finalmente las auxiliares
\i sql/functions/merge/funciones_auxiliares_merge.sql
```

### Tests Recomendados

```sql
-- Test 1: Propiedad Remax normal
SELECT merge_discovery_enrichment('RMX-123456');

-- Test 2: Propiedad C21 normal
SELECT merge_discovery_enrichment('87681');

-- Test 3: Verificar helper
SELECT get_discovery_value('area_total_m2', datos_json_discovery, fuente)
FROM propiedades_v2 WHERE id = 123;

-- Test 4: Estadísticas post-merge
SELECT estadisticas_merge();

-- Test 5: Propiedades con discrepancias
SELECT * FROM obtener_discrepancias('warning', 10);
```

---

## [1.2.0] - 2024-12-13 (Versión anterior)

- Merge básico Enrichment > Discovery
- Sin helper de normalización
- Sin scoring integrado
- Sin cálculo de discrepancias
