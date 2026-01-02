# SICI — Sistema Inteligente de Captura Inmobiliaria

Este repositorio contiene la base canónica del sistema SICI.

## Estado Actual (1 Ene 2026)

### Métricas de Producción

| Métrica | Valor |
|---------|-------|
| Total propiedades | 431 |
| Propiedades completadas | 350 |
| Con proyecto asignado | 338 (**96.6%**) |
| Proyectos activos | 190 |
| Pendientes matching | 1 |

### Estado de Módulos

- ✅ **Módulo 1** — Discovery & Existencia: COMPLETADO
- ✅ **Módulo 1.5** — Merge v2.0.0: COMPLETADO (23 Dic 2025)
- ✅ **Módulo 2** — Matching Propiedades→Proyectos (31 Dic 2025)
  - ✅ FASE 1: Matching Nocturno (4 AM) + Auto-aprobación ≥85%
  - ✅ FASE 2: Human-in-the-Loop completo (APROBAR, RECHAZAR, CORREGIR, CREAR, ASIGNAR, SIN_PROYECTO)
  - ✅ FASE 5: Pipeline Nocturno activo
  - ⚠️ FASE 4: Radar GPS Mensual (parcial - workflow existe, validación GPS pendiente)
  - ❌ FASE 3: Enriquecimiento IA de Proyectos — **PENDIENTE**

## Estructura

```
sici/
├── docs/           → Documentación, specs y research
├── sql/
│   ├── functions/  → Funciones SQL (discovery, enrichment, merge, matching)
│   └── migrations/ → Migraciones 001-012
├── n8n/
│   ├── extractores/    → JSONs de extractores
│   └── workflows/      → Módulo 1 y Módulo 2
└── geodata/        → GeoJSON microzonas Equipetrol
```

## Versiones en Producción

| Componente | Versión | Estado |
|------------|---------|--------|
| Extractor Century21 | v16.5 | ✅ Producción |
| Extractor Remax | v1.9 | ✅ Producción |
| Flujo B Processing | v3.0 | ✅ Producción |
| registrar_discovery() | v2.0.0 | ✅ Producción |
| registrar_enrichment() | v1.4.1 | ✅ Producción |
| merge_discovery_enrichment() | v2.0.0 | ✅ Producción |
| **matching_completo_automatizado()** | **v3.1** | ✅ Producción |
| crear_proyecto_desde_sugerencia() | v2.0 | ✅ Producción |
| procesar_decision_sin_match() | v1.2 | ✅ Producción |
| corregir_proyecto_matching() | v1.0 | ✅ Producción |
| Matching Nocturno (n8n) | v1.0 | ✅ Producción |
| Matching Supervisor (n8n) | v1.1 | ✅ Producción |
| Supervisor Sin Match (n8n) | v1.1 | ✅ Producción |
| Exportar Sin Match (n8n) | v1.0 | ✅ Producción |
| Auditoría Diaria (n8n) | v2.2 | ✅ Guarda snapshots |
| Radar Mensual (n8n) | v1.0 | ✅ Producción |

## Workflows Human-in-the-Loop

| Workflow | Schedule | Acciones |
|----------|----------|----------|
| Matching Nocturno | 4:00 AM | Genera sugerencias automáticas |
| Exportar Sin Match | 7:00 AM | Exporta props sin match al Sheet |
| Matching Supervisor | 8:00 PM | APROBAR, RECHAZAR, CORREGIR, PROYECTO_ALTERNATIVO |
| Supervisor Sin Match | 8:30 PM | ASIGNAR, CREAR, CORREGIR, SIN_PROYECTO |
| Auditoría Diaria | 9:00 AM | Reporte Slack + snapshots diarios |

## Pendientes para Futuras Sesiones

| Prioridad | Tarea | Detalle |
|-----------|-------|---------|
| 🟡 Media | FASE 3: Enriquecimiento IA | Columnas metadata + workflow Claude API |
| 🟢 Baja | FASE 4: Validación GPS | Workflow validador Google Places |

## Reglas de Merge v2.0.0

| Campo | Prioridad | Razón |
|-------|-----------|-------|
| Área, Dorms, Baños, Estac | Discovery > Enrichment | API estructurada más confiable |
| GPS | Discovery > Enrichment | Coordenadas API más precisas |
| Precio | Condicional | Discovery si USD puro, Enrichment si normalizó |
| Resto | Enrichment > Discovery | HTML más detallado |

---

Este repositorio es la fuente de verdad del sistema.

*Última actualización: 1 Enero 2026*
