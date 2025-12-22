# SICI — Sistema Inteligente de Captura Inmobiliaria

Este repositorio contiene la base canónica del sistema SICI.

## Estado actual
- ✅ Módulo 1 — Discovery & Existencia: CERRADO
- 🔄 Módulo 2 — Enrichment & Processing: EN DESARROLLO
  - Flujo B v3.0 con arquitectura spread operator
  - Extractores: Century21 v16.5, Remax v1.9

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
| registrar_discovery() | v2.0.0 | 🔒 Congelado |
| registrar_enrichment() | v1.4.1 | ✅ Producción |
| merge_discovery_enrichment() | v1.2.0 | ✅ Producción |

Este repositorio es la fuente de verdad del sistema.
