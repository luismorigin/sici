# Contribuir a SICI

> Para reglas del sistema, zonas canónicas y arquitectura completa ver `CLAUDE.md`.

## Levantar el frontend (simon-mvp)

```bash
cd simon-mvp
npm install
cp .env.local.example .env.local   # Completar con credenciales Supabase
npm run dev                         # http://localhost:3000
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
