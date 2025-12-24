# Merge - Funciones de Fusión

**Versión:** 2.0.1  
**Fecha:** 24 Diciembre 2025  
**Estado:** ✅ Producción

---

## Archivos

| Archivo | Versión | Propósito |
|---------|---------|-----------|
| `merge_discovery_enrichment.sql` | v2.0.1 | Función principal |
| `funciones_helper_merge.sql` | v2.0.0 | **NUEVO** - Normalización paths por portal |
| `funciones_auxiliares_merge.sql` | v2.0.0 | Utilidades batch y estadísticas |
| `CHANGELOG_MERGE.md` | - | Historial de cambios |

---

## Función Principal

```sql
merge_discovery_enrichment(p_identificador TEXT) RETURNS JSONB
```

Acepta: `codigo_propiedad` (primero), `id`, o `url`

---

## Reglas de Prioridad v2.0.1

| Campo | Prioridad | Razón |
|-------|-----------|-------|
| **Candados** | SIEMPRE ganan | Manual > Automático |
| Área, Dorms, Baños, Estac | Discovery > Enrichment (si > 0) | API estructurada |
| GPS | Discovery > Enrichment | Coordenadas API precisas |
| Precio | Condicional (ver abajo) | Lógica especial |
| Resto | Enrichment > Discovery | HTML más detallado |

### Regla Precio

```
1. Si candado → mantener valor bloqueado
2. Si enrichment normalizó (BOB→USD) → usar enrichment
3. Si discovery tiene USD puro:
   - Discrepancia < 2% → usar discovery
   - Discrepancia 2-10% → usar discovery + warning
   - Discrepancia > 10% → usar enrichment (fallback)
4. Default → enrichment
```

---

## Helper Obligatorio

```sql
-- Normaliza paths diferentes por portal
get_discovery_value(campo TEXT, discovery JSONB, fuente TEXT) → TEXT
get_discovery_value_numeric(...) → NUMERIC
get_discovery_value_integer(...) → INTEGER
```

### Mappings

| Campo | REMAX | C21 |
|-------|-------|-----|
| area_total_m2 | `listing_information.construction_area_m` | `m2C` |
| dormitorios | `listing_information.number_bedrooms` | `recamaras` |
| banos | `listing_information.number_bathrooms` | `banos` |
| latitud | `location.latitude` (STRING) | `lat` (NUMERIC) |
| longitud | `location.longitude` (STRING) | `lon` (NUMERIC) |

---

## Estructura datos_json Final

```javascript
{
  "version_merge": "2.0.1",
  "financiero": { precio_usd, precio_m2, fuente_precio, ... },
  "fisico": { area, dorms, baños, fuente_*, ... },
  "ubicacion": { lat, lon, fuente_gps, ... },
  "proyecto": { nombre_edificio, estado_construccion, ... },
  "amenities": { lista, equipamiento, ... },
  "agente": { nombre, telefono, ... },
  "contenido": { descripcion, fotos_urls, ... },
  "calidad": { scores, flags, requiere_revision, ... },
  "discovery_metadata": { status_portal, id_original, ... },
  "discrepancias": { precio, area, dormitorios, banos, gps },
  "trazabilidad": { versions, fechas }
}
```

---

## Scoring Post-Merge

| Score | Cálculo |
|-------|---------|
| `score_calidad_dato` | Campos core (70pts) + opcionales (30pts) |
| `score_fiduciario` | score_calidad - penalizaciones coherencia |

### Validaciones Coherencia
- Precio/m² < 500 o > 5000 → penalización
- Área < 30m² con múltiples dorms → warning
- Baños > dorms + 2 → warning

---

## Funciones Auxiliares

| Función | Propósito |
|---------|-----------|
| `obtener_propiedades_pendientes_merge(limite)` | Lista pendientes |
| `ejecutar_merge_batch(limite)` | Merge en lote (max 50) |
| `estadisticas_merge()` | Dashboard métricas |
| `obtener_discrepancias(nivel, limite)` | Filtrar por severidad |
| `resetear_merge(identificador)` | Re-ejecutar merge |
| `propiedades_requieren_revision(limite)` | Lista revisión humana |

---

## Respuesta Ejemplo

```json
{
  "success": true,
  "version": "2.0.1",
  "property_id": "92771",
  "status_nuevo": "completado",
  "scores": {
    "calidad_dato": 100,
    "fiduciario": 100,
    "core": 70,
    "opcionales": 30
  },
  "cambios_merge": {
    "kept": ["area_total_m2", "dormitorios"],
    "updated": ["precio_usd"],
    "blocked": [],
    "fuentes": { "precio_usd": "enrichment", "area_total_m2": "discovery" }
  },
  "es_para_matching": true
}
```

---

## Orden Ejecución SQL

```sql
-- 1. Migración (si columnas faltan)
\i sql/migrations/migracion_merge_v2.0.0.sql

-- 2. Helpers (dependencia)
\i sql/functions/merge/funciones_helper_merge.sql

-- 3. Función principal
\i sql/functions/merge/merge_discovery_enrichment.sql

-- 4. Auxiliares
\i sql/functions/merge/funciones_auxiliares_merge.sql
```

---

## Contrato Semántico

> **Status de salida: SIEMPRE `completado`**  
> Merge es el ÚNICO punto que cierra el pipeline.

> **Status entrada válidos:** `nueva`, `actualizado`

---

## Changelog Reciente

**v2.0.1 (24 Dic 2025):**
- Fix: área=0 de Discovery ahora hace fallback a Enrichment
- Previene violación de `check_area_positive`

**v2.0.0 (23 Dic 2025):**
- Inversión prioridad: Discovery > Enrichment para campos físicos
- Helper obligatorio para paths por portal
- Scoring post-merge integrado
- 11 secciones en datos_json

---

**Última actualización:** 24 Diciembre 2025
