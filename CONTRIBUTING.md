# Contribuir a SICI

## Requisitos

- Node.js 18+
- Acceso a Supabase (producción o staging)
- n8n (para workflows de pipeline)

## Levantar el frontend (simon-mvp)

```bash
cd simon-mvp
npm install
cp .env.local.example .env.local   # Completar con credenciales Supabase
npm run dev                         # http://localhost:3000
```

## Estructura del repositorio

```
sici/
├── sql/
│   ├── functions/       → Funciones SQL canónicas (ver FUNCTION_CATALOG.md)
│   ├── migrations/      → 171 migraciones incrementales (ver docs/migrations/MIGRATION_INDEX.md)
│   ├── tests/           → Tests SQL manuales
│   ├── schema/          → Documentación de schema
│   └── views/           → Vistas materializadas
├── n8n/workflows/       → Workflows de automatización nocturna
├── geodata/             → GeoJSON de microzonas
├── docs/                → Documentación activa
└── simon-mvp/           → Frontend Next.js 14 (simonbo.com)
```

## Convenciones

### Migraciones SQL
1. Archivo: `sql/migrations/NNN_nombre_descriptivo.sql` (NNN = siguiente número)
2. Siempre incluir `CREATE OR REPLACE FUNCTION` (idempotente)
3. Antes de modificar una función: **SIEMPRE** exportar con `pg_get_functiondef()` primero
4. Nunca confiar en archivos de migración locales como fuente de verdad
5. Desplegar en Supabase SQL Editor y verificar
6. Actualizar `docs/migrations/MIGRATION_INDEX.md` con la nueva entrada

### Funciones SQL canónicas
- Directorio: `sql/functions/{dominio}/nombre_funcion.sql`
- Exportar desde producción con `pg_get_functiondef(oid)` después de cada migración
- Actualizar `sql/functions/FUNCTION_CATALOG.md`

### Frontend (simon-mvp)
- Pages Router (Next.js 14)
- Styling: Tailwind CSS
- Data: Supabase client (isomorphic)
- Componentes en subdirectorios por feature: `landing-premium/`, `results-premium/`, `alquiler/`, `broker/`, `ui/`, `shared/`

### Commits
- Convención: `tipo(scope): descripción`
- Tipos: `feat`, `fix`, `docs`, `chore`, `refactor`
- Scopes: `pipeline`, `alquiler`, `admin`, `broker`, `landing`, `sql`

## Reglas críticas

Ver `CLAUDE.md` para la lista completa. Las más importantes:

1. **campos_bloqueados** siempre se respetan (Manual > Automatic)
2. **propiedades_v2** es la ÚNICA tabla activa
3. Pipeline alquiler usa funciones PROPIAS (`_alquiler`), nunca modificar funciones de venta
4. Filtros de calidad obligatorios en estudios de mercado (ver `docs/reports/FILTROS_CALIDAD_MERCADO.md`)

## Documentación

| Qué necesitás | Dónde está |
|---------------|------------|
| Configuración completa | `CLAUDE.md` |
| Índice de migraciones | `docs/migrations/MIGRATION_INDEX.md` |
| Catálogo de funciones | `sql/functions/FUNCTION_CATALOG.md` |
| Arquitectura SICI | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` |
| Pipeline alquiler | `docs/canonical/pipeline_alquiler_canonical.md` |
| Backlogs pendientes | `docs/backlog/` |
