# SICI - SQL Módulo 1

**Estado:** 🔒 CONGELADO  
**Fecha:** Diciembre 13, 2025  
**Versión:** 1.0.0

---

## Estructura

```
sql/
├── functions/
│   ├── discovery/      → Fase 1: Captura inicial (API/Grid)
│   ├── enrichment/     → Fase 2: Enriquecimiento HTML
│   ├── merge/          → Fase 3: Fusión de datos
│   └── tc_dinamico/    → Sistema de tipo de cambio
├── seed/               → Datos iniciales y config
└── docs/               → Documentación arquitectura
```

---

## Pipeline Principal

```
Discovery → Enrichment → Merge → Completado
   ↓            ↓          ↓
 nueva     actualizado  completado
```

---

## Configuración Validada

| Clave | Valor |
|-------|-------|
| `tipo_cambio_oficial` | 6.96 |
| `tipo_cambio_paralelo` | 10.50 |

---

## Regla de Oro

> **"Manual wins over automatic"**  
> Los `campos_bloqueados` SIEMPRE se respetan.

---

## Propiedades de Test

| ID | Tipo | depende_de_tc |
|----|------|---------------|
| TEST-001 | USD puro | FALSE |
| TEST-002 | BOB paralelo | TRUE |
| TEST-003 | USD multi | FALSE |

---

⚠️ **NO MODIFICAR** - Módulo 1 Congelado
