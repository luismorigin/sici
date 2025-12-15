# Módulo 1 - Arquitectura Dual v2.0

**Estado:** ✅ COMPLETADO Y CONGELADO  
**Fecha:** Diciembre 13, 2025  
**Versión:** 1.0.0

---

## Resumen Ejecutivo

Sistema de captura de propiedades inmobiliarias con arquitectura de dos fases (Discovery + Enrichment) que se fusionan en Merge.

---

## Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  DISCOVERY  │ → │ ENRICHMENT  │ → │    MERGE    │
│   Flujo A   │    │   Flujo B   │    │  Automático │
│   (API)     │    │   (HTML)    │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
      ↓                  ↓                  ↓
    nueva           actualizado        completado
```

---

## Tabla Principal

**`propiedades_v2`** - 54 columnas

| Grupo | Columnas | Descripción |
|-------|----------|-------------|
| Identificación | 9 | url, fuente, codigo_propiedad |
| Financiero | 10 | precio_usd, TC, depende_de_tc |
| Físico | 6 | área, dormitorios, baños, GPS |
| Multiproyecto | 5 | rangos de precios/áreas |
| Matching | 4 | id_proyecto_master, sugerencias |
| Estado | 7 | status, es_activa, scores |
| Arquitectura Dual | 8 | JSONs, fechas, candados |
| Timestamps | 5 | creación, actualización |

---

## Funciones SQL (10 total)

### Pipeline Principal (3)

| Función | Versión | Status Salida |
|---------|---------|---------------|
| `registrar_discovery()` | v2.0.0 | `nueva` |
| `registrar_enrichment()` | v1.3.0 | `actualizado` |
| `merge_discovery_enrichment()` | v1.2.0 | `completado` |

### TC Dinámico (6 + 1 trigger)

| Función | Versión |
|---------|---------|
| `actualizar_tipo_cambio()` | v1.1.0 |
| `recalcular_precio_propiedad()` | v1.1.1 |
| `recalcular_precios_batch_nocturno()` | v1.1.0 |
| `ver_historial_tc()` | v1.1.0 |
| `obtener_propiedades_tc_pendiente()` | v1.1.0 |
| `obtener_tc_actuales()` | v1.1.0 |
| `trigger_tc_actualizado` | v1.1.0 |

---

## Principios de Diseño

### 1. Manual > Automatic
Los `campos_bloqueados` SIEMPRE se respetan. Ningún proceso automático puede sobrescribir correcciones manuales.

### 2. Enrichment > Discovery
En merge, los datos de HTML (más detallados) tienen prioridad sobre API.

### 3. TC Dinámico
Propiedades en BOB se recalculan automáticamente cuando cambia el tipo de cambio.

---

## Configuración Validada

| Parámetro | Valor |
|-----------|-------|
| `tipo_cambio_oficial` | 6.96 |
| `tipo_cambio_paralelo` | 10.50 |

---

## Casos de Test

| ID | Tipo | depende_de_tc | Propósito |
|----|------|---------------|-----------|
| TEST-001 | USD puro | FALSE | Control negativo TC |
| TEST-002 | BOB paralelo | TRUE | Candidata recálculo |
| TEST-003 | USD multi | FALSE | Multiproyecto |

---

## Archivos Congelados

| Archivo | Versión | Ubicación |
|---------|---------|-----------|
| `registrar_discovery.sql` | v2.0.0 | `functions/discovery/` |
| `registrar_enrichment.sql` | v1.3.0 | `functions/enrichment/` |
| `merge_discovery_enrichment.sql` | v1.2.0 | `functions/merge/` |
| `funciones_auxiliares_merge.sql` | v1.2.0 | `functions/merge/` |
| `modulo_tipo_cambio_dinamico.sql` | v1.1.1 | `functions/tc_dinamico/` |
| `seed_data.sql` | v1.3.0 | `seed/` |

---

## Para Claude Desktop

**Contexto mínimo:**

```
SICI Módulo 1 - Property Matching
- Tabla: propiedades_v2 (54 cols)
- Pipeline: Discovery → Enrichment → Merge
- TC: oficial=6.96, paralelo=10.50
- Regla: "Manual wins over automatic"
- Status: 🔒 CONGELADO (Dic 13, 2025)
```

---

## Próximos Pasos (Módulo 2)

- Enriquecimiento GPS con polígonos
- Actualización automática de TC vía Binance API
- Normalización de estacionamientos
- Expansión a alquileres

---

⚠️ **DOCUMENTO DE REFERENCIA** - NO MODIFICAR LÓGICA DEL MÓDULO 1
