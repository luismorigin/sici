# Módulo 1 - Arquitectura Dual

**Estado:** ✅ COMPLETADO  
**Fecha:** 23 Diciembre 2025  
**Versión:** 2.0.0

---

## Resumen Ejecutivo

Sistema de captura de propiedades inmobiliarias con arquitectura de dos fases (Discovery + Enrichment) que se fusionan en Merge, más verificación de existencia (Flujo C).

**Concepto clave:** Discovery es un **detector de cambios de existencia** (Snapshot + Comparación + Decisión), no un extractor stateless.

---

## Pipeline Principal

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  DISCOVERY  │ → │ ENRICHMENT  │ → │  MERGE v2.0 │
│   Flujo A   │    │   Flujo B   │    │  + Scoring  │
└─────────────┘    └─────────────┘    └─────────────┘
      ↓                  ↓                  ↓
    nueva           actualizado        completado
```

## Pipeline de Existencia (Flujo C)

```
┌─────────────┐         ┌─────────────┐
│  DISCOVERY  │ ──────→ │  FLUJO C    │
│  (ausencia) │         │ Verificador │
└─────────────┘         └─────────────┘
      ↓                       ↓
inactivo_pending    ┌─────────┴─────────┐
                    ↓                   ↓
            inactivo_confirmed    completado
                (HTTP 404)       (rescatado)
```

---

## Estados del Sistema

| Estado | Significado | Asignado por |
|--------|-------------|--------------|
| `nueva` | Propiedad detectada por primera vez | Discovery (Flujo A) |
| `actualizado` | Enriquecida con datos HTML | Enrichment (Flujo B) |
| `completado` | Merge exitoso o rescatada | Merge v2.0 / Flujo C |
| `inactivo_pending` | Ausente en snapshot, pendiente verificación | Discovery (Flujo A) |
| `inactivo_confirmed` | Confirmado eliminado (HTTP 404) | Flujo C |

---

## Tabla Principal

**`propiedades_v2`** - 55+ columnas

| Grupo | Columnas | Descripción |
|-------|----------|-------------|
| Identificación | 9 | url, fuente, codigo_propiedad |
| Financiero | 10 | precio_usd, TC, depende_de_tc |
| Físico | 6 | área, dormitorios, baños, GPS |
| Multiproyecto | 5 | rangos de precios/áreas |
| Matching | 4 | id_proyecto_master, sugerencias |
| Estado | 7 | status, es_activa, scores |
| Arquitectura Dual | 8 | JSONs, fechas, candados |
| **Merge v2.0** | 3 | flags_semanticos, discrepancias_detectadas, cambios_merge |
| Timestamps | 5 | creación, actualización |

---

## Funciones SQL

### Pipeline Principal

| Función | Versión | Status Salida |
|---------|---------|---------------|
| `registrar_discovery()` | v2.0.0 | `nueva` |
| `registrar_enrichment()` | v1.4.1 | `actualizado` |
| **`merge_discovery_enrichment()`** | **v2.0.0** | `completado` |

### Helpers Merge v2.0.0 (NUEVO)

| Función | Propósito |
|---------|-----------|
| `get_discovery_value()` | Normaliza paths Remax vs C21 |
| `get_discovery_value_numeric()` | Wrapper con casteo NUMERIC |
| `get_discovery_value_integer()` | Wrapper con casteo INTEGER |
| `calcular_discrepancia_porcentual()` | Thresholds precio/área |
| `calcular_discrepancia_exacta()` | Match dorms/baños |

### TC Dinámico

| Función | Versión |
|---------|---------|
| `actualizar_tipo_cambio()` | v1.1.0 |
| `recalcular_precio_propiedad()` | v1.1.1 |
| `recalcular_precios_batch_nocturno()` | v1.1.0 |

---

## Principios de Diseño

### 1. Manual > Automatic
Los `campos_bloqueados` SIEMPRE se respetan. Ningún proceso automático puede sobrescribir correcciones manuales.

### 2. Discovery > Enrichment (Campos Físicos) ⚠️ ACTUALIZADO v2.0.0
Para área, dormitorios, baños, estacionamientos y GPS: **Discovery tiene prioridad** (API estructurada más confiable que HTML parsing).

### 3. Enrichment > Discovery (Resto)
Para precio normalizado, amenities, agente, descripción: Enrichment tiene prioridad (HTML más detallado).

### 4. TC Dinámico
Propiedades en BOB se recalculan automáticamente cuando cambia el tipo de cambio.

### 5. Ausencia ≠ Inactividad
Discovery marca `inactivo_pending` (sospecha). Flujo C confirma con HTTP 404.

---

## Reglas Merge v2.0.0

### Prioridad por Campo

| Campo | Prioridad | Razón |
|-------|-----------|-------|
| Candados | SIEMPRE | Manual wins |
| área, dorms, baños, estac | Discovery > Enrichment | API estructurada |
| GPS (lat, lon) | Discovery > Enrichment | Coordenadas API |
| Precio | Condicional | Ver regla especial |
| Resto | Enrichment > Discovery | HTML detallado |

### Regla Precio

```
1. Candado → valor bloqueado
2. Enrichment normalizó (BOB→USD) → enrichment
3. Discovery USD puro:
   - Discrepancia ≤10% → discovery
   - Discrepancia >10% → enrichment (fallback seguro)
4. Default → enrichment
```

### Thresholds Discrepancias

| Rango | Flag | Acción |
|-------|------|--------|
| < 2% | null | OK |
| 2-10% | warning | Registrar, usar valor normal |
| > 10% | error | Fallback a enrichment (solo precio) |

---

## Configuración Validada

| Parámetro | Valor |
|-----------|-------|
| `tipo_cambio_oficial` | 6.96 |
| `tipo_cambio_paralelo` | 10.50 |

---

## Archivos del Módulo

| Archivo | Versión | Ubicación |
|---------|---------|-----------|
| `registrar_discovery.sql` | v2.0.0 🔒 | `functions/discovery/` |
| `registrar_enrichment.sql` | v1.4.1 | `functions/enrichment/` |
| **`merge_discovery_enrichment.sql`** | **v2.0.0** | `functions/merge/` |
| **`funciones_helper_merge.sql`** | **v2.0.0** | `functions/merge/` |
| `funciones_auxiliares_merge.sql` | v2.0.0 | `functions/merge/` |
| `modulo_tipo_cambio_dinamico.sql` | v1.1.1 | `functions/tc_dinamico/` |
| `migracion_merge_v2.0.0.sql` | - | `migrations/` |

---

## Para Claude Desktop

**Contexto mínimo:**

```
SICI Módulo 1 - Property Matching
- Tabla: propiedades_v2 (55+ cols)
- Pipeline: Discovery → Enrichment → Merge v2.0
- Merge v2.0: Discovery>Enrichment para físicos, scoring integrado
- Helper: get_discovery_value() para paths Remax vs C21
- TC: oficial=6.96, paralelo=10.50
- Regla: "Manual wins over automatic"
- Status: ✅ COMPLETADO (23 Dic 2025)
```

---

## Próximos Pasos (Módulo 2)

- Enriquecimiento GPS con polígonos
- Actualización automática de TC vía Binance API
- Normalización de estacionamientos
- Expansión a alquileres

---

**Última actualización:** 23 Diciembre 2025
