# Funciones SQL - Módulo 1

**Estado:** 🔒 CONGELADO  
**Fecha:** Diciembre 13, 2025

---

## Pipeline

```
Discovery → Enrichment → Merge
    ↓           ↓          ↓
 Flujo A    Flujo B    Automático
```

---

## Funciones por Carpeta

| Carpeta | Función | Versión | Status Salida |
|---------|---------|---------|---------------|
| `discovery/` | `registrar_discovery()` | v2.0.0 | `nueva` |
| `enrichment/` | `registrar_enrichment()` | v1.3.0 | `actualizado` |
| `merge/` | `merge_discovery_enrichment()` | v1.2.0 | `completado` |
| `merge/` | Funciones auxiliares | v1.2.0 | - |
| `tc_dinamico/` | 6 funciones + trigger | v1.1.1 | - |

---

## Contratos Semánticos

| Fase | Status Entrada | Status Salida |
|------|----------------|---------------|
| Discovery | (ninguno) | `nueva` |
| Enrichment | `nueva` | `actualizado` |
| Merge | `actualizado` | `completado` |

---

## Orden de Ejecución

1. `registrar_discovery()` - Crea propiedad
2. `registrar_enrichment()` - Enriquece datos
3. `merge_discovery_enrichment()` - Cierra pipeline

---

## Regla de Oro

> **"Manual wins over automatic"**  
> Los `campos_bloqueados` SIEMPRE se respetan.

---

⚠️ **NO MODIFICAR** - Módulo 1 Congelado
