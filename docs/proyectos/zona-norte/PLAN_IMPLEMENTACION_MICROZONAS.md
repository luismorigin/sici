# Plan de Implementación — Microzonas Zona Norte (Ticket #8)

> **Status:** Listo para ejecutar. Revisión senior completa al 29-may-2026. Cierre con Camino W (modelo plano + 3 mejoras escalables) + Camino B refactor snapshot con paralelización.
> **No iniciar sin haber leído este documento entero.**

---

## Resumen ejecutivo

**Qué se hace**: Cargar las 14 microzonas Zona Norte como zonas hermanas en `zonas_geograficas`. Distribuir las 520 props ZN y 73 pm ZN en esas microzonas. Refactorizar snapshot global a ser dinámico por macrozona con paralelización filter_version=4.

**Por qué importa**: cierre del piloto Zona Norte (ADR-005) + primer cliente del sistema multi-macrozona (ADR-009).

**Cuánto tarda**: ~7.5h de trabajo + 7-14 días de observación de paralelización snapshot.

**Riesgo a Equipetrol producción**: BAJO. Con el plan ajustado, EQ ve cero cambio en datos ni en frontend. El refactor snapshot corre paralelo a la versión actual durante 2 semanas antes del switch.

**Reversibilidad**: TOTAL. Rollback documentado en `254_microzonas_zona_norte_rollback.sql`.

---

## Pre-requisitos antes de empezar

### Operacionales
- [ ] Confirmar que el cron `snapshot_absorcion_mercado()` NO está corriendo durante la ventana de migración (suspender en n8n).
- [ ] Confirmar que los workflows de discovery ZN están desactivados durante la ventana (o migrar después de la corrida nocturna).
- [ ] Backup snapshot de BD: `pg_dump` de las tablas `propiedades_v2`, `proyectos_master`, `zonas_geograficas`, `market_absorption_snapshots`, `matching_sugerencias` por las dudas.
- [ ] Branch git limpio: `git checkout -b feat/zn-microzonas-aplicacion` desde `zn/microzonas-grid-borrador`.

### Validaciones pre-migración
Ejecutar y guardar resultados (para comparar después):

```sql
-- Baseline 1: conteo de props por zona (espera idéntico para EQ después)
SELECT zona, COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status='completado') AS completado,
  COUNT(*) FILTER (WHERE tipo_operacion='venta') AS venta,
  COUNT(*) FILTER (WHERE tipo_operacion='alquiler') AS alquiler
FROM propiedades_v2
GROUP BY zona
ORDER BY 2 DESC;
-- Esperado: 6 zonas EQ + Zona Norte + 'Sin zona'

-- Baseline 2: conteo pm por zona
SELECT zona, COUNT(*) FROM proyectos_master GROUP BY zona ORDER BY 2 DESC;

-- Baseline 3: snapshot global EQ hoy
SELECT fecha, dormitorios, venta_activas, venta_absorbidas_30d, venta_tasa_absorcion
FROM market_absorption_snapshots
WHERE zona='global' AND fecha = CURRENT_DATE
ORDER BY dormitorios;

-- Baseline 4: HITL EQ pendientes hoy
SELECT estado, COUNT(*) FROM matching_sugerencias GROUP BY estado;
```

Guardar resultados en `pre-migracion-baseline.txt`.

---

## Orden de ejecución

### FASE 1 — Aplicar migración SQL principal (~2h)

**Archivo**: `sql/migrations/254_microzonas_zona_norte.sql`

**Lo que hace** (atómico en `BEGIN; ... COMMIT;`):

| Paso | Acción | Riesgo |
|---|---|---|
| 1 | Ampliar CHECK constraint `zona_valida` con 14 microzonas nuevas | 🟢 Bajo — datos existentes ya pasan el constraint |
| 2 | INSERT 14 polígonos ZN con `zona_general='Zona Norte'`, `activo=TRUE` | 🟢 Bajo — ADDITIVE |
| 3 | UPDATE polígono macro `Zona Norte` → `activo=FALSE` | 🟢 Bajo — las 14 microzonas lo reemplazan |
| 4 | Refactor `get_zona_by_gps()` agregando `AND activo=TRUE` | 🟢 Bajo — fix bueno per se |
| 5 | UPDATE 520 props ZN: `zona`/`microzona` = nombre microzona específica vía `get_zona_by_gps()` | 🟡 Medio — backfill masivo, requiere validación post |
| 6 | UPDATE 73 pm ZN: `zona` = nombre microzona específica vía `get_zona_by_gps()` | 🟢 Bajo — backfill chico |
| 7 | Refactor `separar_hitl_zona_norte()` → `separar_hitl_por_macrozona()` (usa `zona_general`) | 🟢 Bajo — escalable a futuro |

**Cómo ejecutar**:
```bash
# Desde Supabase SQL Editor o psql:
\i sql/migrations/254_microzonas_zona_norte.sql
```

**Validación POST FASE 1** (8 queries en `254_validacion.sql`):

```sql
-- CHECK 1: 14 polígonos ZN activos
SELECT COUNT(*) FROM zonas_geograficas
WHERE zona_general = 'Zona Norte' AND activo = TRUE;
-- ESPERADO: 14

-- CHECK 2: macro Zona Norte desactivado
SELECT activo FROM zonas_geograficas WHERE nombre = 'Zona Norte';
-- ESPERADO: false

-- CHECK 3: props ZN distribuidas (cero quedan en 'Zona Norte')
SELECT zona, COUNT(*) FROM propiedades_v2
WHERE zona LIKE '%anillo%' OR zona = 'Zona Norte'
GROUP BY zona ORDER BY 2 DESC;
-- ESPERADO: 14 filas con microzonas ZN + 'Zona Norte'=0 (o no aparece)

-- CHECK 4: pm ZN distribuidos
SELECT zona, COUNT(*) FROM proyectos_master
WHERE zona LIKE '%anillo%' OR zona = 'Zona Norte'
GROUP BY zona ORDER BY 2 DESC;
-- ESPERADO: 14 filas + 'Zona Norte'=0

-- CHECK 5: EQ producción intacto (vs baseline 1)
SELECT zona, COUNT(*) FROM propiedades_v2
WHERE zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
GROUP BY zona ORDER BY 2 DESC;
-- ESPERADO: idéntico al baseline 1

-- CHECK 6: matching ZN sigue funcionando
SELECT COUNT(*) AS matches_zn_disponibles
FROM generar_matches_por_nombre() gm
JOIN propiedades_v2 p ON p.id = gm.propiedad_id
JOIN zonas_geograficas zg ON zg.nombre = p.zona
WHERE zg.zona_general = 'Zona Norte';
-- ESPERADO: > 0 si hay candidatos pendientes

-- CHECK 7: trigger HITL nuevo funciona (DRY RUN)
BEGIN;
  INSERT INTO matching_sugerencias (propiedad_id, proyecto_master_sugerido, metodo_matching, score_confianza, estado)
  SELECT id, 1, 'test_migration', 50, 'pendiente'
  FROM propiedades_v2
  WHERE zona LIKE '%anillo%' LIMIT 1;
  SELECT estado FROM matching_sugerencias WHERE metodo_matching = 'test_migration';
  -- ESPERADO: 'pendiente_zn'
ROLLBACK;

-- CHECK 8: get_zona_by_gps() no devuelve macro desactivado
SELECT * FROM get_zona_by_gps(-17.74, -63.175);
-- ESPERADO: una microzona específica, NUNCA 'Zona Norte' (macro)
```

**Si CHECK 5 falla**: ABORTAR. Ejecutar rollback.
**Si CHECK 7 falla**: el trigger HITL no se aplicó bien. Revisar.

### FASE 2 — Refactor snapshot con paralelización (~2.5h)

**Archivo**: `sql/migrations/255_snapshot_absorcion_v4_dinamico.sql`

**Lo que hace**:
- Crea función paralela `snapshot_absorcion_mercado_v4()`.
- v3 actual sigue intacto, escribe `filter_version=3` con `zona='global'`.
- v4 nuevo escribe `filter_version=4` con `zona='global'` para EQ (backward compat) y `zona='global_zona_norte'` para ZN.

**Por qué backward compat 'global'**: `/admin/market.tsx` líneas 1020, 1033, 1057 filtran por `zona='global'`. Si cambiamos, rompemos el dashboard. Preserva 'global' para EQ.

**Cómo ejecutar**:
```bash
\i sql/migrations/255_snapshot_absorcion_v4_dinamico.sql

-- Test: correr ambas y comparar
SELECT snapshot_absorcion_mercado();    -- escribe filter_version=3
SELECT snapshot_absorcion_mercado_v4(); -- escribe filter_version=4

-- Query de paridad EQ (debe dar diff=0 para todas las filas)
SELECT
  a.dormitorios,
  a.venta_activas AS v3, b.venta_activas AS v4,
  a.venta_activas - b.venta_activas AS diff_activas,
  a.venta_absorbidas_30d - b.venta_absorbidas_30d AS diff_absorbidas
FROM market_absorption_snapshots a
JOIN market_absorption_snapshots b
  ON a.fecha = b.fecha AND a.dormitorios = b.dormitorios
WHERE a.zona = 'global' AND a.filter_version = 3
  AND b.zona = 'global' AND b.filter_version = 4
  AND a.fecha = CURRENT_DATE
ORDER BY a.dormitorios;
-- ESPERADO: todos los diffs = 0
```

**Si paridad no es 0**: NO seguir. Revisar lógica del refactor.

### FASE 3 — Cron paralelizado (7-14 días) [pasivo]

Configurar n8n para ejecutar ambas funciones:
- v3 actual (mantener por compat)
- v4 nuevo (para validación)

Setup recomendado: ambas al mismo tiempo después de la corrida nocturna.

**Monitoring diario** (query en `operacion.md`):
```sql
SELECT
  fecha,
  COUNT(*) FILTER (WHERE filter_version = 3) AS v3_filas,
  COUNT(*) FILTER (WHERE filter_version = 4) AS v4_filas
FROM market_absorption_snapshots
WHERE fecha >= CURRENT_DATE - 7
GROUP BY fecha
ORDER BY fecha DESC;
-- ESPERADO: v3 y v4 con número similar de filas cada día
```

### FASE 4 — Switch a v4 (sesión separada, ~30 min)

Después de 2 semanas de paridad confirmada:

```sql
BEGIN;
-- 1. Renombrar v3 a deprecated
ALTER FUNCTION snapshot_absorcion_mercado() RENAME TO snapshot_absorcion_mercado_v3_deprecated;

-- 2. Renombrar v4 a oficial
ALTER FUNCTION snapshot_absorcion_mercado_v4() RENAME TO snapshot_absorcion_mercado;

-- 3. Cron en n8n: desactivar la llamada v3_deprecated, dejar solo la principal
COMMIT;
```

### FASE 5 — Frontend update (~30 min)

**Archivo**: `simon-mvp/src/lib/zonas.ts`

Ver diff completo en sección "Diff de lib/zonas.ts" más abajo.

```bash
cd simon-mvp
npm run build     # verifica typescript
npm run test      # si hay tests
git commit -m "feat(zonas): agregar 14 microzonas ZN + helper getMicrozonasZN"
```

**Smoke test post-frontend**:
- Cargar `/admin/propiedades` → filtro de zona muestra las 14 microzonas ZN + las 6 EQ. ✓
- Cargar `/mercado/equipetrol/ventas` → resultados idénticos a pre-deploy (filtra por las 6 EQ). ✓
- Cargar `/admin/market` → series globales EQ se muestran (filtra por `zona='global'`). ✓
- Cargar `/admin/supervisor/matching` → 0 sugerencias ZN visibles (trigger HITL las separa). ✓

### FASE 6 — Workflows n8n (~30 min)

Editar `n8n/workflows/modulo_1/flujo_discovery_c21_zonanorte.json` (y los 2 análogos):

```javascript
// Snippet 1 actual:
ARRAY['Zona Norte']::text[]

// Cambio:
ARRAY[
  '2do-3er anillo La Salle-Banzer',
  '2do-3er anillo Banzer-Alemana',
  '2do-3er anillo Alemana-Mutualista',
  '3er-4to anillo La Salle-Banzer',
  '3er-4to anillo Banzer-Alemana',
  '3er-4to anillo Alemana-Mutualista',
  '4to-6to anillo Radial 26-Banzer',
  '4to-6to anillo Banzer-Alemana',
  '4to-6to anillo Alemana-Mutualista',
  '6to-8vo anillo Radial 26-Banzer',
  '6to-8vo anillo Banzer-Alemana',
  '6to-8vo anillo Alemana-Mutualista',
  '8vo anillo Paraiso - Radial 26-Banzer',
  '8vo anillo Viru Viru - Banzer-G77'
]::text[]
-- TODO(ticket #11): reemplazar por SELECT nombre FROM zonas_geograficas
-- WHERE zona_general='Zona Norte' AND activo=TRUE
```

Re-activar los 3 workflows ZN y observar corrida nocturna.

### FASE 7 — Documentación final (~1h)

- Crear `docs/canonical/ZONAS_ZONA_NORTE.md` (paralelo a `ZONAS_EQUIPETROL.md`).
- ADR-010 en `DECISIONES.md`: "Equipetrol y Zona Norte son macrozonas hermanas operativamente".
- Update `BITACORA.md` con entrada del 29-may aplicación.
- Update `README.md` proyecto ZN: ticket #8 ✅.
- Update `BACKLOG.md`: marcar ticket #8 cerrado, agregar ticket #11 nuevo "Refactor zonas dinámico".
- Update `operacion.md`: kill-switch actualizado, queries de monitoreo gaps + paralelización.

---

## Rollback completo

**Archivo**: `sql/migrations/254_microzonas_zona_norte_rollback.sql`

Reversión atómica de FASE 1:

```sql
BEGIN;

-- 1. Restaurar separar_hitl_zona_norte() versión original
CREATE OR REPLACE FUNCTION separar_hitl_zona_norte() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM propiedades_v2 p
    WHERE p.id = NEW.propiedad_id
      AND p.zona = 'Zona Norte'
  ) THEN
    NEW.estado = 'pendiente_zn';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_separar_hitl_por_macrozona ON matching_sugerencias;
CREATE TRIGGER trg_separar_hitl_zona_norte
BEFORE INSERT ON matching_sugerencias
FOR EACH ROW WHEN (NEW.estado = 'pendiente')
EXECUTE FUNCTION separar_hitl_zona_norte();

-- 2. Restaurar zona='Zona Norte' en props
UPDATE propiedades_v2 p
SET zona = 'Zona Norte', microzona = 'Zona Norte'
WHERE p.zona IN (
  '2do-3er anillo La Salle-Banzer', '2do-3er anillo Banzer-Alemana',
  '2do-3er anillo Alemana-Mutualista', '3er-4to anillo La Salle-Banzer',
  '3er-4to anillo Banzer-Alemana', '3er-4to anillo Alemana-Mutualista',
  '4to-6to anillo Radial 26-Banzer', '4to-6to anillo Banzer-Alemana',
  '4to-6to anillo Alemana-Mutualista', '6to-8vo anillo Radial 26-Banzer',
  '6to-8vo anillo Banzer-Alemana', '6to-8vo anillo Alemana-Mutualista',
  '8vo anillo Paraiso - Radial 26-Banzer', '8vo anillo Viru Viru - Banzer-G77'
);

-- 3. Restaurar zona='Zona Norte' en pm
UPDATE proyectos_master pm
SET zona = 'Zona Norte'
WHERE pm.zona IN ( ... mismas 14 microzonas ... );

-- 4. Reactivar polígono macro
UPDATE zonas_geograficas SET activo = TRUE WHERE nombre = 'Zona Norte';

-- 5. Eliminar 14 polígonos nuevos
DELETE FROM zonas_geograficas
WHERE nombre IN ( ... 14 microzonas ... ) AND zona_general = 'Zona Norte';

-- 6. Restaurar CHECK constraint original
ALTER TABLE propiedades_v2 DROP CONSTRAINT zona_valida;
ALTER TABLE propiedades_v2 ADD CONSTRAINT zona_valida CHECK (
  zona IS NULL OR zona IN (
    'Equipetrol Centro','Equipetrol Norte','Equipetrol Oeste',
    'Sirari','Villa Brigida','Eq. 3er Anillo',
    'Sin zona','Zona Norte'
  )
);

-- 7. Restaurar get_zona_by_gps() sin filtro activo
CREATE OR REPLACE FUNCTION get_zona_by_gps(p_lat double precision, p_lon double precision)
RETURNS TABLE(zona text) LANGUAGE sql STABLE AS $$
  SELECT zg.nombre::TEXT AS zona
  FROM zonas_geograficas zg
  WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(p_lon, p_lat), 4326))
  LIMIT 1;
$$;

COMMIT;
```

**Tiempo de rollback**: ~5 min de SQL + 5 min de revertir `lib/zonas.ts` y workflows = ~10 min total.

---

## Diff propuesto de `lib/zonas.ts`

```typescript
// === AGREGADO: helper macrozona ===
export type Macrozona = 'Equipetrol' | 'Zona Norte';

// === AGREGADO: 14 microzonas ZN ===
// TODO(ticket #11): reemplazar por fetch dinámico desde /api/zonas
export const ZONAS_ZONA_NORTE: ZonaCanonica[] = [
  { slug: 'zn_2_3_la_salle_banzer',   db: '2do-3er anillo La Salle-Banzer',   label: 'ZN 2-3 La Salle/Banzer',    labelCorto: 'ZN 2-3 LS-Bz' },
  { slug: 'zn_2_3_banzer_alemana',    db: '2do-3er anillo Banzer-Alemana',    label: 'ZN 2-3 Banzer/Alemana',     labelCorto: 'ZN 2-3 Bz-Al' },
  { slug: 'zn_2_3_alemana_mutualista', db: '2do-3er anillo Alemana-Mutualista', label: 'ZN 2-3 Alemana/Mutualista', labelCorto: 'ZN 2-3 Al-Mu' },
  // ... 11 más siguiendo el patrón
];

// === CAMBIO: ZONAS_ADMIN_FILTER ya no usa 'Zona Norte' literal ===
export const ZONAS_ADMIN_FILTER = [
  { id: '', label: 'Todas las zonas' },
  ...ZONAS_ADMIN,
  // CAMBIO: reemplazar { id: 'Zona Norte', label: 'Zona Norte (piloto)' }
  // por opción de macrozona ZN que abarca las 14 microzonas
  { id: '__macro_zona_norte__', label: 'Zona Norte (todas las microzonas)' },
  ...ZONAS_ZONA_NORTE.map(z => ({ id: z.db, label: z.labelCorto })),
];

// === AGREGADO: helper de filtro ===
export function getMicrozonasZN(): string[] {
  return ZONAS_ZONA_NORTE.map(z => z.db);
}

// === CAMBIO: displayZona y getZonaLabel necesitan fallback ===
const dbToZonaCompleto = new Map<string, ZonaCanonica>();
for (const z of [...ZONAS_CANONICAS, ...ZONAS_ZONA_NORTE]) {
  dbToZonaCompleto.set(z.db, z);
}

export function displayZona(zona: string | null | undefined): string {
  if (!zona) return 'Otras';
  if (zona === 'Equipetrol Franja' || zona === 'Eq. 3er Anillo') return 'Eq. 3er Anillo';
  if (zona === 'Sin zona' || zona === 'sin zona') return 'Otras';
  const found = dbToZonaCompleto.get(zona);
  return found ? found.labelCorto : zona;
}
```

**Componentes que filtran `zona='Zona Norte'`** que necesitan revisión:
- `pages/admin/propiedades.tsx` — busca `zona='Zona Norte'` → cambiar a `zona IN (getMicrozonasZN())`
- Cualquier query con `WHERE zona='Zona Norte'` literal en `pages/api/`

`grep -rn "'Zona Norte'" simon-mvp/src/` antes de hacer el commit del frontend.

---

## Bugs latentes detectados (NO bloqueantes pero conviene tener registrados)

| # | Bug | Severidad | Acción |
|---|---|---|---|
| 1 | `resumen_mercado()` y `buscar_propiedades()` hardcodean lista de 5 zonas EQ (falta 'Eq. 3er Anillo') | Bajo — preexistente | ✅ **RESUELTO 1-jun-2026 (mig 258)** — allowlist → `zona_general='Equipetrol'` (6 zonas) |
| 2 | `populate_broker_prospection()` solo trae brokers EQ; no incluye ZN | Bajo — preexistente | Agregar como sub-ticket en BACKLOG si se quiere prospección ZN |
| 3 | `insertar_proyectos_aprobados()` asigna `zona='Equipetrol'` sin sufijo (no existe en CHECK constraint) | Medio — bug latente | Investigar si la función está rota o usa otra ruta |
| 4 | Gaps en grilla (43 ha sin cobertura, 0 impacto hoy) | Bajo | Query de monitoreo en `operacion.md` |
| 5 | Snapshot serie histórica `zona='Zona Norte'` queda como dato congelado | Bajo | Documentar en `ZONAS_ZONA_NORTE.md` |
| 6 | 2 props con `zona='Sin zona'` quedarán igual (no son ZN ni EQ) | Bajo | No requiere acción |

---

## Monitoreo post-deploy (queries en `operacion.md`)

### Daily checklist (primera semana)

```sql
-- 1. Props nuevas en gaps (deberían ser 0)
SELECT COUNT(*) AS props_gap_ultimas_24h
FROM propiedades_v2
WHERE zona IS NULL
  AND status = 'completado'
  AND latitud BETWEEN -17.772 AND -17.664
  AND longitud BETWEEN -63.195 AND -63.111
  AND fecha_discovery::date >= CURRENT_DATE - 1;
-- ALERTA si > 0

-- 2. HITL EQ contaminado por ZN (debería ser 0)
SELECT COUNT(*) AS hitl_eq_contaminado
FROM matching_sugerencias ms
JOIN propiedades_v2 p ON p.id = ms.propiedad_id
JOIN zonas_geograficas zg ON zg.nombre = p.zona
WHERE ms.estado = 'pendiente'
  AND zg.zona_general = 'Zona Norte';
-- ALERTA si > 0

-- 3. Paridad snapshot v3 vs v4 (debería ser 0 diff)
SELECT a.dormitorios,
  a.venta_activas - b.venta_activas AS diff_activas
FROM market_absorption_snapshots a
JOIN market_absorption_snapshots b
  ON a.fecha = b.fecha AND a.dormitorios = b.dormitorios
WHERE a.zona='global' AND a.filter_version=3
  AND b.zona='global' AND b.filter_version=4
  AND a.fecha = CURRENT_DATE - 1
ORDER BY a.dormitorios;
-- ALERTA si algún diff != 0

-- 4. CHECK constraint actual
SELECT pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'propiedades_v2' AND con.conname = 'zona_valida';
-- Esperado: incluye las 14 microzonas
```

---

## Estimación de esfuerzo total

| Fase | Trabajo | Tiempo |
|---|---|---|
| Preparación + baseline | Pre-requisitos + queries baseline | 30 min |
| FASE 1 | Migración SQL principal + validación 8 checks | 2h |
| FASE 2 | Refactor snapshot v4 + test paridad | 2.5h |
| FASE 5 | Frontend update + smoke tests | 30 min |
| FASE 6 | Workflows n8n + re-activación | 30 min |
| FASE 7 | Docs (ADR-010 + ZONAS_ZONA_NORTE.md + BITACORA + README + BACKLOG) | 1h |
| **Subtotal sesión 1** | | **~7h** |
| FASE 3 | Paralelización snapshot (observación pasiva) | 14 días |
| FASE 4 | Switch a v4 (sesión chica futura) | 30 min |

---

## Decisiones documentadas

1. **Modelo plano** (zonas hermanas, no jerárquico) — Camino W. ADR-010 nuevo.
2. **Refactor snapshot con paralelización** (filter_version=4 + zona='global' preservado para EQ) — Camino B. Documentado acá.
3. **`zona='global'` preservado para EQ en v4** para no romper `/admin/market` (línea 1020+ filtra por `zona='global'`).
4. **`zona='global_zona_norte'` para ZN** en v4 (nuevo, sin compat existente).
5. **Cero modificación a `trg_asignar_zona_venta` y `trg_asignar_zona_alquiler`** — los triggers de asignación quedan como están.
6. **Solo modificar `separar_hitl_zona_norte()`** para usar `zona_general` (más escalable + crítico para no contaminar HITL EQ).
7. **Mantener tilde de "Paraíso" eliminada en BD** (`Paraiso`), tilde solo en display.

---

## Quien implementa esto

Cuando lo hagas vos (o cualquier ingeniero):

1. **Leer este documento entero antes de empezar.**
2. **No saltar pasos.** El orden está pensado: CHECK constraint primero porque sin eso los UPDATEs fallan.
3. **No commitear fases parciales a `main`.** Trabajar en branch `feat/zn-microzonas-aplicacion`.
4. **Si CHECK 5 del post-FASE 1 falla** (EQ producción cambió), rollback inmediato.
5. **NO desactivar v3 de snapshot hasta que la paridad esté validada por 14 días.**
6. **Smoke tests del frontend son obligatorios** antes del commit de `lib/zonas.ts`.
7. Después de FASE 7, hacer **PR a `main`** con todo junto. NO merge directo.

Si algo en este plan no está claro, **NO improvises**. Pará y consultá la sesión donde se diseñó (BITACORA 29-may-2026).
