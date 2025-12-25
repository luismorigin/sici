# MERGE - DOCUMENTO CANÓNICO

**Versión:** 2.1.0
**Fecha:** 25 Diciembre 2025
**Estado:** ✅ IMPLEMENTADO Y VALIDADO
**Archivo:** `docs/canonical/merge_canonical.md`

---

## 0. CAMBIO ARQUITECTÓNICO v2.0.0

### Breaking Changes

1. **Inversión de prioridad para campos físicos:**
   - Antes: Enrichment > Discovery
   - **Ahora: Discovery > Enrichment** para área, dorms, baños, estacionamientos, GPS

2. **Helper obligatorio:** `get_discovery_value()` para normalizar paths Remax vs C21

3. **Scoring post-merge integrado** con `flags_semanticos`

4. **Regla precio con fallback:** Si discrepancia >10%, usar Enrichment

### Nueva Arquitectura

```
Discovery → Enrichment (Extract) → Merge (Consolidate + Score) → Completado
```

---

## 1. RESPONSABILIDAD ÚNICA

Consolidar datos de Discovery + Enrichment aplicando reglas de prioridad, calcular scores de calidad y validar coherencia técnica.

### Pipeline

```
Propiedad status='nueva' o 'actualizado'
  ↓
[FASE 1: EXTRACCIÓN] Helper normaliza paths por portal
  ↓
[FASE 2: RESOLUCIÓN] Aplica reglas de prioridad
  ↓
[FASE 3: DISCREPANCIAS] Calcula diferencias con thresholds
  ↓
[FASE 4: SCORING] Calcula scores sobre datos consolidados
  ↓
[FASE 5: PERSISTENCIA] UPDATE con status='completado'
```

---

## 2. REGLAS DE PRIORIDAD v2.0.0

### Jerarquía

```
1. Candados manuales (campos_bloqueados) → SIEMPRE respetados
2. Discovery > Enrichment → Para campos físicos y GPS
3. Enrichment > Discovery → Para precio normalizado y resto
```

### Matriz de Prioridad

| Campo | Prioridad | Razón |
|-------|-----------|-------|
| `area_total_m2` | **Discovery > Enrichment** | API estructurada más confiable |
| `dormitorios` | **Discovery > Enrichment** | API estructurada más confiable |
| `banos` | **Discovery > Enrichment** | API estructurada más confiable |
| `estacionamientos` | **Discovery > Enrichment** | API estructurada más confiable |
| `latitud`, `longitud` | **Discovery > Enrichment** | GPS de API más preciso |
| `nombre_edificio` | **Discovery > Enrichment** | v2.1.0 - Para Módulo 2 Matching |
| `zona` | **Discovery > Enrichment** | v2.1.0 - Para Módulo 2 Matching |
| `precio_usd` | **Condicional** | Ver regla especial |
| Resto (amenities, agente, etc.) | Enrichment > Discovery | HTML más detallado |

---

## 3. REGLA PRECIO (Especial)

```javascript
function determinarPrecioFinal(discovery, enrichment, candados, fuente) {
  // 1. Candado siempre gana
  if (candados.precio_usd) return { valor: actual, fuente: 'blocked' };
  
  // 2. Si enrichment normalizó (BOB→USD), usar enrichment
  if (enrichment.precio_fue_normalizado || 
      enrichment.tipo_cambio_detectado !== 'no_especificado') {
    return { valor: enrichment.precio_usd, fuente: 'enrichment' };
  }
  
  // 3. Si discovery tiene USD puro
  const discoveryPrecioUSD = getDiscoveryPrecioUSD(discovery, fuente);
  if (discoveryPrecioUSD) {
    const diff = Math.abs(discoveryPrecioUSD - enrichment.precio_usd) / discoveryPrecioUSD;
    
    // Discrepancia > 10% → fallback a enrichment
    if (diff > 0.10) {
      return { valor: enrichment.precio_usd, fuente: 'enrichment_fallback' };
    }
    
    return { valor: discoveryPrecioUSD, fuente: 'discovery' };
  }
  
  // 4. Default: enrichment
  return { valor: enrichment.precio_usd, fuente: 'enrichment' };
}
```

### Thresholds Discrepancias

| Rango | Flag | Acción |
|-------|------|--------|
| < 2% | null | OK, usar valor normal |
| 2-10% | warning | Registrar, usar valor normal |
| > 10% | error | **Fallback a enrichment** (solo precio) |

---

## 4. HELPER OBLIGATORIO

### get_discovery_value()

Normaliza paths diferentes entre Remax y Century21:

| Campo | REMAX Path | C21 Path |
|-------|------------|----------|
| area_total_m2 | `listing_information.construction_area_m` | `m2C` |
| dormitorios | `listing_information.number_bedrooms` | `recamaras` |
| banos | `listing_information.number_bathrooms` | `banos` |
| latitud | `location.latitude` (STRING→NUMERIC) | `lat` |
| longitud | `location.longitude` (STRING→NUMERIC) | `lon` |
| precio_usd | `price.price_in_dollars` | Solo si `moneda=USD` |

### Wrappers

```sql
get_discovery_value(campo, discovery, fuente) → TEXT
get_discovery_value_numeric(campo, discovery, fuente) → NUMERIC
get_discovery_value_integer(campo, discovery, fuente) → INTEGER
```

---

## 5. SCORING POST-MERGE

### Score Calidad Dato (0-100)

```javascript
// Campos core: 70 pts (7 campos × 10 pts)
const camposCore = [
  'precio_usd', 'area_total_m2', 'dormitorios', 'banos',
  'latitud+longitud', 'tipo_operacion', 'estado_construccion'
];

// Campos opcionales: 30 pts
const camposOpcionales = [
  'estacionamientos', 'nombre_edificio', 'amenities',
  'descripcion', 'agente_nombre', 'cantidad_fotos'
];
```

### Score Fiduciario

```javascript
scoreFiduciario = scoreCalidadDato - penalizaciones;

// Penalizaciones:
// - precio_m2 < 500: -15 pts (error)
// - precio_m2 > 5000: -10 pts (warning)
// - area < 30m² con múltiples dorms: -5 pts
// - baños > dorms + 2: -5 pts
```

---

## 6. ESTRUCTURA datos_json FINAL

```javascript
{
  "version_merge": "2.1.0",
  "timestamp_merge": "2025-12-25T...",
  "fuente": "century21|remax",

  "financiero": {
    "precio_usd": 97700,
    "precio_m2": 2714,
    "moneda_original": "BOB",
    "tipo_cambio_usado": 6.96,
    "fuente_precio": "discovery|enrichment|enrichment_fallback|blocked",
    "precio_fue_normalizado": false
  },

  "fisico": {
    "area_total_m2": 36,
    "fuente_area": "discovery",
    "dormitorios": 1,
    "fuente_dormitorios": "discovery",
    "banos": 1,
    "fuente_banos": "discovery",
    "es_multiproyecto": false
  },

  "ubicacion": {
    "latitud": -17.7718816,
    "longitud": -63.1993099,
    "fuente_gps": "discovery",
    "zona": "Equipetrol",
    "fuente_zona": "discovery"
  },

  "proyecto": {
    "nombre_edificio": "Torre Platinum",
    "fuente_nombre_edificio": "enrichment",
    ...
  },
  "amenities": { ... },
  "agente": { ... },
  "contenido": { ... },
  
  "calidad": {
    "score_calidad_dato": 92,
    "score_fiduciario": 89,
    "flags_semanticos": [],
    "requiere_revision_humana": false,
    "es_para_matching_verificado": true
  },

  "discovery_metadata": {
    "status_portal": "enPromocion",
    "id_original": "92963"
  },

  "discrepancias": {
    "precio": { "discovery": 97701, "enrichment": 97700, "diff_pct": 0.001, "flag": null },
    "area": { "discovery": 36, "enrichment": 36, "diff_pct": 0, "flag": null }
  },

  "trazabilidad": {
    "merge_version": "2.0.0",
    "fecha_merge": "2025-12-23T..."
  }
}
```

---

## 7. FUNCIÓN SQL

```sql
merge_discovery_enrichment(p_identificador TEXT) RETURNS JSONB
```

### Búsqueda (orden)
1. `codigo_propiedad` (más común)
2. `id` (numérico)
3. `url` (fallback)

### Status Entrada Válidos
- `nueva`
- `actualizado`

### Status Salida
- **SIEMPRE `completado`**

---

## 8. VALIDACIÓN IMPLEMENTACIÓN

### Checklist

```
HELPERS:
✅ get_discovery_value() implementado
✅ Casteo GPS Remax (string→numeric)
✅ Paths por portal normalizados

PRIORIDAD:
✅ Candados SIEMPRE respetados
✅ Discovery > Enrichment (área, dorms, baños, GPS)
✅ Precio condicional con fallback 10%

SCORING:
✅ Calculado sobre datos consolidados
✅ flags_semanticos generados
✅ requiere_revision_humana calculado

PERSISTENCIA:
✅ Status SIEMPRE es 'completado'
✅ datos_json con 11 secciones
✅ discrepancias_detectadas poblado
```

### Tests Validados (23 Dic 2025)

| Propiedad | Fuente | Score | Status |
|-----------|--------|-------|--------|
| 92771 | Century21 | 100/100 | ✅ completado |
| 120099002-225 | Remax | 95/95 | ✅ completado |

---

## 9. ARCHIVOS

| Archivo | Versión | Ubicación |
|---------|---------|-----------|
| `merge_discovery_enrichment.sql` | v2.1.0 | `sql/functions/merge/` |
| `funciones_helper_merge.sql` | v2.0.0 | `sql/functions/merge/` |
| `funciones_auxiliares_merge.sql` | v2.0.0 | `sql/functions/merge/` |
| `migracion_merge_v2.0.0.sql` | - | `sql/migrations/` |
| `migracion_columnas_matching_v1.0.0.sql` | - | `sql/migrations/` |
| `CHANGELOG_MERGE.md` | - | `sql/functions/merge/` |

---

## 10. CONTROL DE VERSIONES

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 2.1.0 | 25 Dic 2025 | Soporte columnas `nombre_edificio` y `zona` para Módulo 2 |
| 2.0.1 | 24 Dic 2025 | Fix área=0 fallback a enrichment |
| 2.0.0 | 23 Dic 2025 | Inversión prioridad físicos, helper obligatorio, scoring integrado, fallback precio |
| 1.2.0 | Dic 2024 | Versión inicial con funciones auxiliares |

---

**FIN DEL DOCUMENTO CANÓNICO**
