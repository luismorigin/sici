# SICI — Sistema Inteligente de Captura Inmobiliaria

Pipeline nocturno automatizado de inteligencia inmobiliaria para Equipetrol, Santa Cruz de la Sierra, Bolivia.

Captura, enriquece, clasifica y matchea propiedades de venta y alquiler desde 3 fuentes (Century21, Remax, Bien Inmuebles). Alimenta [Simón](https://simonbo.com) — asistente fiduciario inmobiliario.

## Pipeline Nocturno

> Ver `CLAUDE.md` para horarios detallados, zonas canónicas y reglas del sistema.

**Venta:** Discovery → Enrichment → Merge → Matching → Verificador → Auditoría
**Alquiler:** Discovery (3 fuentes) → Enrichment → Merge → Verificador

## Estructura

```
sici/
├── sql/
│   ├── functions/       → Funciones SQL canónicas
│   ├── migrations/      → 171 migraciones (001–169)
│   └── schema/          → Documentación de schema
├── n8n/workflows/
│   ├── modulo_1/        → Discovery, Enrichment, Merge, Verificador (venta)
│   ├── modulo_2/        → Matching, Auditoría, TC dinámico
│   └── alquiler/        → Pipeline completo alquiler (6 workflows)
├── geodata/             → microzonas_equipetrol_v4.geojson
├── docs/                → Documentación activa + canonical
└── simon-mvp/           → Frontend Next.js (simonbo.com)
```

## Frontend (simon-mvp)

**Producción:** `simonbo.com (/) → /filtros-v2 → /formulario-v2 → /resultados-v2`

| Área | Rutas |
|------|-------|
| Landing premium | `/`, `/landing-v2` |
| Búsqueda | `/filtros-v2`, `/formulario-v2`, `/resultados-v2` |
| Alquileres | `/alquileres` |
| Admin | `/admin/propiedades`, `/admin/proyectos`, `/admin/supervisor/*`, `/admin/salud`, `/admin/market` |
| Broker B2B | `/broker/dashboard`, `/broker/nueva-propiedad`, `/broker/leads`, `/broker/perfil` |

## Documentación

| Qué necesitás | Dónde está |
|---------------|------------|
| Configuración completa | `CLAUDE.md` |
| Cómo contribuir | `CONTRIBUTING.md` |
| Catálogo de funciones SQL | `sql/functions/FUNCTION_CATALOG.md` |
| Arquitectura SICI | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` |
| Pipeline alquiler | `docs/canonical/pipeline_alquiler_canonical.md` |
| Backlogs pendientes | `docs/backlog/` |

---

*Última actualización: 28 Mar 2026*
