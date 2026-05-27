# Seguridad Supabase — Reglas para no romper nada

Capturado tras remediación del linter (22 abr 2026). Leer antes de tocar schema, RLS, permisos, API routes que usan Supabase, o crear funciones RPC.

## TL;DR

1. **API routes**: `SUPABASE_SERVICE_ROLE_KEY`, nunca `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. **Service key**: NUNCA con prefijo `NEXT_PUBLIC_`
3. **Antes de `ENABLE RLS`**: grep + `pg_stat_user_tables` + `pg_depend`
4. **Antes de `DROP TABLE`**: rename a `_trash_*` primero, 7 días de espera
5. **Nuevas views**: `SECURITY INVOKER` (default), NO `SECURITY DEFINER`
6. **Nuevas funciones RPC**: `SECURITY INVOKER` + `GRANT EXECUTE` explícito
7. **Nuevas tablas en `public`**: `GRANT` explícito a roles que la consumen (obligatorio desde **30-oct-2026** — ver Regla 6)

---

## Regla 1 — API routes y uso de keys

### Cuándo usar cada key

| Key | Dónde | Por qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser, client components | Es pública, va al bundle. Solo debe ver tablas con RLS que permita anon. |
| `SUPABASE_SERVICE_ROLE_KEY` | `pages/api/*`, `app/api/*`, scripts server-side | Bypassea RLS. Solo server-side. Si filtra al browser → DB comprometida. |

### Red flags

```ts
// ❌ MAL — anon en API route: falla si tabla tiene RLS
const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// ❌ MAL — prefix NEXT_PUBLIC_ hace que Next bundlee al browser
const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

// ✅ BIEN — server-only, sin prefix
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)
```

### Cómo validar

Antes de hacer commit, grep:
```bash
grep -rn "NEXT_PUBLIC_SUPABASE_SERVICE" simon-mvp/
# Debe dar 0 resultados
```

---

## Regla 2 — Antes de `ENABLE RLS` en una tabla

Habilitar RLS sin policies = bloquear a todos los consumers legítimos.

### Checklist

1. **Grep código** — qué archivos tocan la tabla:
   ```bash
   # Buscar en todo SICI
   grep -rn "from\(['\"]nombre_tabla['\"]\)" simon-mvp/
   grep -rn "nombre_tabla" scripts/ n8n/
   ```

2. **Identificar consumers y sus keys**:
   - Browser con anon → necesita policy `TO anon`
   - API route con service_role → bypassea, no necesita policy
   - Script Python con `claude_readonly` → necesita policy `TO claude_readonly USING (true)`
   - n8n workflow → depende del user de conexión, preguntar

3. **Verificar stats de actividad** (descarta tablas huérfanas):
   ```sql
   SELECT relname, n_live_tup, last_seq_scan, seq_scan
   FROM pg_stat_user_tables
   WHERE relname = 'nombre_tabla';
   ```
   Si no hay lecturas en semanas y grep está limpio → probablemente huérfana.

4. **Verificar dependencias**:
   ```sql
   SELECT dep_obj.relname, dep_obj.relkind
   FROM pg_depend d
   JOIN pg_class c ON c.oid = d.refobjid
   JOIN pg_class dep_obj ON dep_obj.oid = d.objid
   WHERE c.relname = 'nombre_tabla' AND d.deptype != 'i';
   ```
   Views/triggers/functions dependientes van a fallar si RLS bloquea acceso del owner.

5. **Escribir policies ANTES de habilitar RLS** en el mismo bloque SQL:
   ```sql
   -- Todo junto, no en 2 migraciones
   ALTER TABLE X ENABLE ROW LEVEL SECURITY;
   CREATE POLICY X_claude_read ON X FOR SELECT TO claude_readonly USING (true);
   ```

### Patrones de policy por tipo de tabla

| Tipo | Patrón |
|---|---|
| PII / sensible (`leads_alquiler`) | Sin policy anon. `service_role` bypassea. `claude_readonly` con SELECT. |
| Data producto pública (`propiedades_v2`, `proyectos_master`) | `FOR SELECT USING (true)` — cualquiera lee, writes solo service_role |
| Lookup / catálogo (`zonas_mapeo`) | `FOR SELECT USING (true)` — lectura libre |
| Operacional interna (`workflow_executions`) | Sin policy anon. `TO claude_readonly USING (true)` si se usa en `/metrics`. |
| Broker / requiere auth | `TO authenticated USING (auth.email() = email)` o similar |

---

## Regla 3 — Antes de `DROP TABLE`

### Estrategia de 2 etapas (siempre)

**Etapa 1 — Rename a `_trash_*`**:
```sql
ALTER TABLE public.nombre_tabla RENAME TO _trash_nombre_tabla;
```
- Reversible: `ALTER TABLE _trash_nombre_tabla RENAME TO nombre_tabla;`
- Si algo la usaba, va a fallar ruidoso con `relation does not exist` en logs
- **No cierra warnings del linter** (sigue en schema public)

**Etapa 2 — DROP (después de 7 días sin errores)**:
```sql
DROP TABLE public._trash_nombre_tabla;
```
- Irreversible pero ahora es seguro

### Qué monitorear durante los 7 días

- Vercel logs → errores 500 en `/admin/*` o API routes
- n8n logs → workflows fallidos
- `/admin/salud` → chequeos de salud
- Queries ad-hoc humanas (si hay analistas/admins que exploran BD)

### Nunca

- ❌ `DROP TABLE CASCADE` sin entender qué cascadea
- ❌ DROP directo sin el paso de rename, aunque grep esté limpio (hay queries ad-hoc que grep no ve)

---

## Regla 4 — Nuevas views

### Default correcto

Desde Postgres 15+, las views se crean como `SECURITY INVOKER` por default. **Mantener ese default.**

```sql
-- ✅ BIEN (default)
CREATE VIEW v_ejemplo AS SELECT ... FROM tabla;

-- ❌ MAL — Linter lo marca como security_definer_view
CREATE VIEW v_ejemplo WITH (security_invoker = off) AS ...;
```

### Por qué no `SECURITY DEFINER`

- Corre con permisos del creator, **bypasseando RLS del caller**
- Si el creator tiene acceso a tablas que anon no debería ver → leak
- Son los 25 warnings `security_definer_view` pendientes en SICI

### Si necesitás bypass de RLS

No uses `SECURITY DEFINER`. En su lugar, usá una **función** con `SECURITY DEFINER` y permisos explícitos. Es más controlable.

---

## Regla 5 — Nuevas funciones RPC (expuestas al frontend)

### Patrón canónico

```sql
CREATE OR REPLACE FUNCTION public.mi_funcion(p_id INTEGER)
RETURNS TABLE(...)
LANGUAGE plpgsql
-- SIN "SECURITY DEFINER" → corre como INVOKER (respeta RLS del caller)
AS $$
BEGIN
  -- lógica
END;
$$;

-- GRANT explícito a los roles que necesitan llamarla
GRANT EXECUTE ON FUNCTION public.mi_funcion(INTEGER)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.mi_funcion(INTEGER) IS
  'Descripción + quién la usa + migración de origen';
```

### Cuándo usar `SECURITY DEFINER` en funciones

Solo si la función necesita acceso a tablas sin RLS que anon no debería ver directamente, pero la función filtra/agrega de forma segura. Ejemplo: una función que recibe `user_id` y devuelve solo favoritos de ese user — bypassea RLS pero el filtro hace el trabajo.

Si la usás, documentá el por qué en el `COMMENT`.

### Documentar dependencias

Si la función lee tablas X, Y, Z — escribir en el comentario de la función:
```sql
-- Lee: v_mercado_venta, v_mercado_alquiler, precios_historial
-- Si esas tablas reciben RLS, requieren policy TO anon o SECURITY DEFINER aquí
```

Esto ayuda a futuras sesiones que apliquen RLS.

---

## Regla 6 — Nuevas tablas en `public` (cambio Supabase oct-2026)

### Qué cambia

Anuncio Supabase (mayo 2026): a partir del **30-oct-2026**, en proyectos existentes (incluido el de SICI), **las tablas nuevas en `public` ya NO quedan expuestas automáticamente a la Data API** (PostgREST, GraphQL, supabase-js).

- Para proyectos creados desde **30-may-2026**: ya rige el nuevo default.
- Para nuestro proyecto SICI (existente): rige desde el **30-oct-2026**.
- Tablas existentes ANTES de esa fecha mantienen sus grants — no se rompe nada retroactivamente.

### Qué hay que hacer en cada migración nueva que `CREATE TABLE` en `public`

Agregar grants explícitos al final del bloque de creación de la tabla. Patrón canónico:

```sql
CREATE TABLE public.mi_tabla (
  id BIGSERIAL PRIMARY KEY,
  ...
);

-- 🔑 Grants explícitos a la Data API (obligatorio desde 30-oct-2026)
-- Ajustar según qué roles consumen la tabla:
GRANT SELECT                         ON public.mi_tabla TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mi_tabla TO authenticated;
GRANT ALL                            ON public.mi_tabla TO service_role;
GRANT SELECT                         ON public.mi_tabla TO claude_readonly;

-- Si va a estar bajo RLS (recomendado para tablas con PII / escrituras de usuario):
ALTER TABLE public.mi_tabla ENABLE ROW LEVEL SECURITY;
CREATE POLICY mi_tabla_select_anon ON public.mi_tabla
  FOR SELECT TO anon USING (true);
-- ... policies adicionales según el patrón de la tabla (ver Regla 2)
```

### Matriz de grants por tipo de tabla

Usar como punto de partida — ajustar caso a caso:

| Tipo de tabla | anon | authenticated | service_role | claude_readonly |
|---|---|---|---|---|
| Data pública (`propiedades_v2`, `proyectos_master`, vistas mercado) | SELECT | SELECT | ALL | SELECT |
| Lookup / catálogo (`zonas_mapeo`, `tipo_propiedad_mapeo`) | SELECT | SELECT | ALL | SELECT |
| PII / leads (`leads_mvp`, `leads_alquiler`, `leads_gate`) | INSERT (solo) | — | ALL | SELECT |
| Operacional interna (`workflow_executions`, snapshots) | — | — | ALL | SELECT |
| Broker / auth (`simon_brokers`, `broker_shortlists`) | SELECT (públicas vía hash) | SELECT/UPDATE filtrado por RLS | ALL | SELECT |
| Tabla escrita SOLO por pipeline (n8n/postgres owner) | — | — | — | SELECT |

**Coherencia con migración 249:** la 249 ya revocó escritura de `anon` en 19 tablas. Para tablas nuevas que entren en esa categoría, NO hay que dar INSERT/UPDATE/DELETE a anon de entrada — el patrón es: SELECT a anon, escritura solo a service_role.

### Funciones RPC también necesitan EXECUTE explícito

Esto ya estaba en la Regla 5, pero conviene reforzarlo: **el cambio de oct-2026 no se aplica a funciones automáticamente, pero la Regla 5 ya pide `GRANT EXECUTE` explícito**. Si seguís el patrón canónico de RPC, estás cubierto.

### Cómo auditar antes del 30-oct-2026

En Supabase dashboard → **Database → Security Advisor** → revisar qué tablas están expuestas hoy a la Data API. Sirve como baseline. Si una tabla actual NO debería estar expuesta, este es buen momento para revocar grants y endurecer.

### Referencia

- Changelog Supabase: "Tables in public schema no longer exposed to Data API by default"
- Fecha activación SICI: **30 octubre 2026**
- Plantilla de migración: `sql/migrations/_template.sql`

---

## Checklist de review (antes de commitear cambios que toquen Supabase)

- [ ] ¿API routes usan `SUPABASE_SERVICE_ROLE_KEY` (no anon)?
- [ ] ¿Ninguna env var tiene `NEXT_PUBLIC_` delante de algo sensible?
- [ ] Si creo tabla nueva: ¿va a tener PII? → Plan de RLS desde el día 1
- [ ] Si creo tabla nueva: ¿agregué `GRANT` explícitos por rol según la matriz de Regla 6?
- [ ] Si habilito RLS: ¿verifiqué grep + pg_stat + pg_depend?
- [ ] Si creo policies: ¿cubrí `anon`, `authenticated`, `claude_readonly`, `service_role` según corresponda?
- [ ] Si creo view: ¿es `SECURITY INVOKER` (default)?
- [ ] Si creo función RPC: ¿`GRANT EXECUTE` explícito + `COMMENT` con dependencias?
- [ ] Si es DROP: ¿pasé por `_trash_*` primero?

---

## Contexto vivo

- Backlog de remediación: `docs/backlog/SUPABASE_RLS_BACKLOG.md`
- Hallazgos pendientes del linter: ver Tiers 1-3 del backlog
- Migraciones de referencia del patrón correcto:
  - `224_leads_alquiler_rls.sql` — RLS con policy específica a claude_readonly
  - `226_buscar_acm.sql` — función RPC con GRANT EXECUTE y SECURITY INVOKER default
  - `249_revoke_anon_escritura_19_tablas.sql` — endurecimiento de anon (lectura intacta, escritura revocada)
- Plantilla obligatoria para tablas/RPC/views nuevas: `sql/migrations/_template.sql`
