# AUDITORIA COMPLETA DE DATOS SICI

**Fecha:** 8 Enero 2026
**Objetivo:** Entender qué datos realmente tenemos antes de construir más features

---

## PASO 1: INVENTARIO DE TABLAS

### Tablas Principales (con datos)

| Tabla | Filas | Propósito |
|-------|-------|-----------|
| propiedades_v2 | 448 | **PRINCIPAL** - Propiedades activas del mercado |
| proyectos_master | 190 | Catálogo de edificios/proyectos |
| matching_sugerencias | 357 | HITL - Sugerencias de matching |
| precios_historial | 711 | Tracking de cambios de precio |
| sin_match_exportados | 141 | HITL - Props sin proyecto asignado |
| workflow_executions | 81 | Tracking de ejecuciones n8n |
| conversaciones_simon | 75 | Leads del chatbot Simón |

### Tablas de Configuración

| Tabla | Filas | Propósito |
|-------|-------|-----------|
| zonas_geograficas | 7 | Microzonas de Equipetrol |
| mapeo_subtipos_remax | 16 | Normalización tipos Remax |
| auditoria_tipo_cambio | 15 | Historial TC |
| config_global | 5 | Configuración sistema |
| tc_binance_historial | 3 | TC Binance P2P |

### Tablas Legacy/Backup

| Tabla | Filas | Estado |
|-------|-------|--------|
| propiedades | 398 | **LEGACY - NO USAR** |
| proyectos | 96 | Legacy |
| propiedades_v2_backup_20260104 | 438 | Backup |
| proyectos_master_backup_20260104 | 192 | Backup |

### Tablas VACIAS (0 filas)

| Tabla | Propósito Original |
|-------|-------------------|
| unidades_reales | Knowledge Graph - NO IMPLEMENTADO |
| unidades_virtuales | Knowledge Graph - NO IMPLEMENTADO |

---

## PASO 2: ANALISIS DE propiedades_v2

### Por Status

| Status | Cantidad | Con Proyecto | Multiproyecto |
|--------|----------|--------------|---------------|
| completado | 340 | 318 (94%) | 63 |
| inactivo_pending | 76 | 37 (49%) | 5 |
| excluido_operacion | 32 | 0 (0%) | 0 |
| **TOTAL** | **448** | **355 (79%)** | **68** |

### Por Fuente

| Fuente | Total | Con Proyecto | % Matched |
|--------|-------|--------------|-----------|
| century21 | 286 | 248 | 86.7% |
| remax | 162 | 107 | 66.0% |

### Completitud de Campos

| Campo | Con valor | % |
|-------|-----------|---|
| precio_usd | ~95% | Estimado |
| area_total_m2 | ~90% | Estimado |
| dormitorios | ~85% | Estimado |
| GPS (lat/lng) | ~95% | De datos_json |
| datos_json | 382 | 85% |

---

## PASO 3: UNIDADES VIRTUALES vs REALES

### Hallazgo Crítico

El campo `es_multiproyecto` distingue:
- **false (380):** Unidades REALES - una URL = una unidad física específica
- **true (68):** Unidades VIRTUALES - una URL = múltiples tipologías del mismo proyecto

### Impacto en Estudio de Mercado

Del dataset filtrado (352 propiedades para venta):

| Tipo | Cantidad | % | Precio Prom | $/m2 |
|------|----------|---|-------------|------|
| Reales | 285 | 81% | $155,585 | $2,056 |
| Multiproyecto | 67 | 19% | $176,057 | $1,839 |

**OBSERVACION:** Las multiproyecto tienen $/m2 11% más bajo, posiblemente porque:
- Son precios de preventa/desarrollador
- Representan el rango mínimo de tipologías
- Pueden incluir promociones

**VALIDEZ DEL ESTUDIO:** El estudio de mercado mezcla ambas pero con 81% de unidades reales, las métricas son representativas. Para análisis más precisos, considerar filtrar `es_multiproyecto = false`.

---

## PASO 4: PROYECTOS MASTER

### Completitud

| Campo | Con valor | % |
|-------|-----------|---|
| nombre_oficial | 188/188 | 100% |
| zona | 188/188 | 100% |
| GPS (lat/lng) | 186/188 | 99% |
| gps_verificado_google | 165/188 | 88% |
| desarrollador | 104/188 | **55%** |

### Top Desarrolladores (en proyectos_master)

| Desarrollador | Proyectos |
|---------------|-----------|
| Sky Properties | 25 |
| Port-Delux S.R.L. | 11 |
| Smart Studio | 9 |
| Elite Desarrollos | 6 |
| Condominios Brickell | 5 |
| Sommet S.R.L. | 5 |

### Brecha de Datos
- **84 proyectos sin desarrollador** (45%)
- Oportunidad para enriquecimiento IA

---

## PASO 5: SISTEMA HITL

### Matching Sugerencias

| Estado | Cantidad | % |
|--------|----------|---|
| aprobadas | 320 | 90% |
| rechazadas | 37 | 10% |
| pendientes | 0 | 0% |
| **TOTAL** | **357** | - |

**Conclusión:** Sistema HITL funcionando, cola vacía

### Sin Match Exportados

| Estado | Cantidad |
|--------|----------|
| pendientes | 8 |
| procesadas | 0 |
| descartadas | 0 |
| **TOTAL** | **141** |

**Conclusión:** 8 propiedades esperando revisión manual

---

## PASO 6: ESTRUCTURA datos_json

El campo `datos_json` en propiedades_v2 es MUY rico:

```json
{
  "agente": { "nombre", "telefono", "oficina_nombre" },
  "fisico": { "banos", "dormitorios", "area_total_m2", "es_multiproyecto" },
  "fuente": "century21|remax",
  "calidad": { "score_core", "score_fiduciario", "conflictos[]" },
  "proyecto": { "nombre_edificio", "estado_construccion" },
  "amenities": {
    "lista": ["Piscina", "Churrasquera", ...],
    "equipamiento": ["Aire Acondicionado", ...],
    "estado_amenities": { amenity: { valor, fuente, confianza } }
  },
  "contenido": { "fotos_urls[]", "descripcion", "cantidad_fotos" },
  "ubicacion": { "latitud", "longitud", "zona_validada_gps" },
  "financiero": { "precio_usd", "precio_m2", "tipo_cambio_usado" },
  "trazabilidad": { "fecha_merge", "merge_version", "scraper_version" },
  "discrepancias": { "gps", "area", "precio", "dormitorios" }
}
```

**Amenities están en:** `datos_json->'amenities'->'lista'`

---

## HALLAZGOS PRINCIPALES

### Lo que FUNCIONA bien:
1. Pipeline nocturno estable (Discovery -> Enrichment -> Merge -> Matching)
2. Tasa de matching 94% para propiedades completadas
3. Sistema HITL operativo con cola vacía
4. GPS verificado en 88% de proyectos
5. Datos ricos en datos_json (amenities, calidad, trazabilidad)

### GAPS identificados:
1. **45% de proyectos sin desarrollador** - Oportunidad FASE 3
2. **Tablas Knowledge Graph vacías** - unidades_reales/virtuales nunca pobladas
3. **19% multiproyecto mezclado** - Considerar separar en análisis
4. **8 sin_match pendientes** - Requieren revisión manual
5. **32 excluidas sin proyecto** - Status nuevo, sin flujo HITL

### Recomendaciones:
1. **Antes de Simón v2:** Crear vistas que filtren multiproyecto para métricas puras
2. **FASE 3 prioridad:** Enriquecer desarrollador en 84 proyectos
3. **Supervisor Excluidas:** Implementar HITL para las 32 props excluidas
4. **Knowledge Graph:** Evaluar si tablas vacías son necesarias o deprecar

---

## QUERIES UTILES

```sql
-- Propiedades limpias para análisis (solo reales, solo venta)
SELECT * FROM propiedades_v2
WHERE es_activa = true
  AND tipo_operacion = 'venta'
  AND es_multiproyecto = false
  AND precio_usd > 30000
  AND area_total_m2 > 25
  AND (precio_usd / area_total_m2) BETWEEN 800 AND 4000;

-- Proyectos sin desarrollador
SELECT nombre_oficial, zona
FROM proyectos_master
WHERE activo AND desarrollador IS NULL;

-- Amenities de una propiedad
SELECT datos_json->'amenities'->'lista' as amenities
FROM propiedades_v2 WHERE id = 123;
```

---

## ARCHIVOS RELACIONADOS

- `docs/ESTUDIO_MERCADO_EQUIPETROL.md` - Estudio de mercado
- `sql/views/v_metricas_mercado.sql` - Vistas para Simón
- `docs/planning/KNOWLEDGE_GRAPH_VALIDATED_PLAN.md` - Plan Knowledge Graph
- `docs/planning/SUPERVISOR_EXCLUIDAS_PLAN.md` - Plan supervisor excluidas

---

## VALIDACION

- [x] Inventario completo de 29 tablas
- [x] Análisis propiedades_v2 por status/fuente
- [x] Distinción virtual vs real identificada (es_multiproyecto)
- [x] Impacto en estudio de mercado cuantificado (19% multiproyecto)
- [x] Completitud proyectos_master analizada (55% con desarrollador)
- [x] Sistema HITL revisado (cola vacía)
- [x] Estructura datos_json documentada
- [x] Gaps y recomendaciones listados
