# SICI — Sistema Inteligente de Captura Inmobiliaria

Este repositorio contiene la base canónica del sistema SICI.

## Estado actual
- ✅ Módulo 1 — Discovery & Existencia: CERRADO
- ✅ Módulo 1.5 — Merge v2.0.0: COMPLETADO (23 Dic 2025)
- ✅ Módulo 2 — Matching Propiedades→Proyectos (30 Dic 2025)
  - ✅ Fase 1: Matching Nocturno (4 AM) + Auto-aprobación ≥85%
  - ✅ Fase 2: Human-in-the-Loop (Google Sheets + Supervisor 8 PM)
  - ✅ Fase 4: Radar GPS Mensual (Google Places API)
  - 🔄 Fase 3: Enriquecimiento IA de Proyectos — PENDIENTE
  - Métricas: 37% matcheadas, 86% con zona GPS, 152 proyectos_master

## Estructura
- `/docs` → Documentación, contratos y research
- `/sql` → Funciones SQL y arquitectura de datos
- `/n8n` → Workflows y extractores (JSON exportados)

## Versiones en Producción

| Componente | Versión | Estado |
|------------|---------|--------|
| Extractor Century21 | v16.5 | ✅ Producción |
| Extractor Remax | v1.9 | ✅ Producción |
| Flujo B Processing | v3.0 | ✅ Producción |
| registrar_discovery() | v2.0.0 | ✅ Producción |
| registrar_enrichment() | v1.4.1 | ✅ Producción |
| merge_discovery_enrichment() | v2.0.0 | ✅ Producción |
| get_discovery_value() | v2.0.0 | ✅ Producción |
| **matching_completo_automatizado()** | **v3.1** | ✅ Producción |
| crear_proyecto_desde_sugerencia() | v2.0 | ✅ Producción |
| Matching Nocturno (n8n) | v1.0 | ✅ Producción |
| Matching Supervisor (n8n) | v1.0 | ✅ Producción |
| Radar Mensual (n8n) | v1.0 | ✅ Producción |

## Reglas de Merge v2.0.0

| Campo | Prioridad | Razón |
|-------|-----------|-------|
| Área, Dorms, Baños, Estac | Discovery > Enrichment | API estructurada más confiable |
| GPS | Discovery > Enrichment | Coordenadas API más precisas |
| Precio | Condicional | Discovery si USD puro, Enrichment si normalizó |
| Resto | Enrichment > Discovery | HTML más detallado |

Este repositorio es la fuente de verdad del sistema.
