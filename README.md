# SICI — Sistema Inteligente de Captura Inmobiliaria

Pipeline nocturno automatizado de inteligencia inmobiliaria para Equipetrol, Santa Cruz de la Sierra, Bolivia.

Captura, enriquece, clasifica y matchea propiedades de venta y alquiler desde 3 fuentes (Century21, Remax, Bien Inmuebles). Alimenta [Simón](https://simonbo.com) — asistente fiduciario inmobiliario.

## Métricas de Producción (27 Feb 2026)

| Métrica | Valor |
|---------|-------|
| Total propiedades | 986 (681 venta, 303 alquiler) |
| Propiedades completadas | 596 |
| Con proyecto asignado | 522 |
| Proyectos activos | 227 |
| Fuentes | Century21, Remax, Bien Inmuebles |
| Migraciones SQL | 171 (001–169) |

## Pipeline Nocturno

### Venta (modulo_1)
```
1:00 AM  Discovery C21 + Remax → propiedades_v2
2:00 AM  Enrichment LLM → datos_json_enrichment
3:00 AM  Merge → campos consolidados + TC paralelo
4:00 AM  Matching → id_proyecto_master
9:00 AM  Auditoría + Snapshots absorción
```

### Alquiler
```
1:30 AM  Discovery C21 + Remax
2:30 AM  Discovery Bien Inmuebles + Enrichment LLM
3:30 AM  Merge alquiler (enrichment-first, sin TC paralelo)
7:00 AM  Verificador alquiler
```

## Estructura

```
sici/
├── sql/
│   ├── functions/       → Funciones SQL canónicas
│   │   ├── discovery/   → registrar_discovery
│   │   ├── enrichment/  → registrar_enrichment
│   │   ├── merge/       → merge_discovery_enrichment
│   │   ├── matching/    → matching v3.1
│   │   ├── alquiler/    → discovery/enrichment/merge alquiler
│   │   ├── query_layer/ → buscar_unidades_reales/alquiler, razón fiduciaria, posición mercado
│   │   ├── snapshots/   → snapshot_absorcion_mercado
│   │   └── tc_dinamico/ → TC Binance P2P
│   └── migrations/      → 171 migraciones (001–169)
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
| Admin | `/admin/propiedades`, `/admin/proyectos`, `/admin/supervisor/*`, `/admin/salud`, `/admin/market` |
| Broker B2B | `/broker/dashboard`, `/broker/nueva-propiedad`, `/broker/leads`, `/broker/perfil` |

## Documentación

Ver `CLAUDE.md` para configuración completa, tabla de migraciones, zonas canónicas y reglas del sistema.

---

*Última actualización: 27 Feb 2026*
