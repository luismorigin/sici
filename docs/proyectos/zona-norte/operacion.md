# Operación — Proyecto Zona Norte

> Cómo operar el sistema día a día y, si algo sale mal, cómo apagar/revertir cada componente.

**Última actualización:** 29 May 2026 (post-aplicación #8 microzonas, mig 254).

> ⚠️ **Cambio mig 254 (29-may):** las props ZN ya NO tienen `zona='Zona Norte'` — viven en **14 microzonas** (`zona_general='Zona Norte'`). El macro 'Zona Norte' quedó `activo=false`. Todas las queries de abajo usan el patrón `zona IN (SELECT nombre FROM zonas_geograficas WHERE zona_general='Zona Norte')` en vez del literal viejo.

---

## Estado operativo actual

Zona Norte está en **dark launch** desde el 26-may-2026. Desde la **mig 254 (29-may)** las props ZN viven en **14 microzonas** (el macro 'Zona Norte' quedó inactivo):
- Workflows discovery ZN activos (cron 1:15 AM C21, 1:45 AM Remax). Filtran por `zona_general='Zona Norte'` → toman las 14 microzonas automáticamente.
- Pipeline interno (enrichment → merge → matching → snapshot) procesa ZN sin intervención. El snapshot lo genera la función v3 actual (su LOOP 2 itera por microzona) — el "v4 paralelo" se descartó (BACKLOG #12).
- HITL Equipetrol limpio (sugerencias ZN separadas en `estado='pendiente_zona_norte'`).
- Frontend público sigue mostrando solo Equipetrol — ZN NO expuesta al usuario final (el admin sí ve las 14 microzonas en filtros).

---

## 🛑 Kill-switch (apagar todo Zona Norte)

Aplicar en este orden si algo sale mal y necesitás revertir el dark launch:

### Nivel 1 — Desactivar discovery (no toca data existente)

**Cuándo:** el discovery ZN está trayendo data sucia o saturando el verificador.

**Cómo:** En n8n UI, abrir cada workflow y toggle **OFF**:
- `flujo_a_discovery_century21_zonanorte_v1.0.0`
- `flujo_a_discovery_remax_zonanorte_v1.0.0`

**Efecto:** mañana 1:15/1:45 AM NO corre nada nuevo. Las 373+ props ZN existentes siguen en BD y en el pipeline normal.

**Reversible:** toggle ON cuando quieras retomar.

---

### Nivel 2 — Borrar props nuevas Zona Norte (sin tocar histórico)

**Cuándo:** la data capturada hoy está sucia y no querés que entre al pipeline.

**Cómo:**
```sql
-- Borrar props nuevas Zona Norte capturadas por workflow ZN (mantiene legacy backfill)
-- Post-mig 254: se identifican por metodo_discovery (la zona ahora es microzona)
DELETE FROM propiedades_v2
WHERE metodo_discovery LIKE 'zonanorte_%'
  AND zona IN (SELECT nombre FROM zonas_geograficas WHERE zona_general = 'Zona Norte')
  AND fecha_creacion >= 'YYYY-MM-DD';  -- fecha desde donde borrar
```

**Reversible:** sí, esperar el próximo discovery para repoblar.

---

### Nivel 3 — Sacar Zona Norte del sistema (no destructivo)

**Cuándo:** querés que el sistema no procese más props ZN pero conservar la data ya capturada.

**Cómo:**
```sql
-- Desactivar las 14 microzonas (dejan de asignarse a props nuevas por GPS)
UPDATE zonas_geograficas SET activo = false WHERE zona_general = 'Zona Norte';
```

**Efecto:** props nuevas con GPS en ZN ya no se etiquetan como ZN (quedan `zona=NULL`). Las existentes se mantienen. El frontend público sigue sin verlas.

**Reversible:** `UPDATE zonas_geograficas SET activo = true WHERE zona_general = 'Zona Norte';`

---

### Nivel 4 — Rollback completo (destructivo)

**Cuándo:** decidís que Zona Norte fue un error y querés borrarlo todo.

**Cómo:** rollback en orden inverso de las migraciones:

```sql
-- 0. Rollback mig 254 (microzonas) PRIMERO. Revierte props/pm a zona='Zona Norte',
--    reactiva el macro, borra las 14 microzonas, restaura el trigger 253 y la
--    constraint. SIN este paso, los siguientes no agarran (las props ya no son
--    'Zona Norte' sino microzonas).
\i sql/migrations/254_microzonas_zona_norte_rollback.sql
-- (Opcional: aplicar backup_dirigido_pre_mig254_2026-05-29.sql para estado exacto
--  de las 3 props anómalas.)

-- 1. Rollback mig 253 (HITL separado). El rollback de 254 ya restauró el trigger
--    viejo (trg_separar_hitl_zona_norte); para quitarlo del todo:
DROP TRIGGER IF EXISTS trg_separar_hitl_zona_norte ON matching_sugerencias;
DROP TRIGGER IF EXISTS trg_separar_hitl_por_macrozona ON matching_sugerencias;
DROP FUNCTION IF EXISTS separar_hitl_zona_norte();
DROP FUNCTION IF EXISTS separar_hitl_por_macrozona();
UPDATE matching_sugerencias SET estado='pendiente' WHERE estado IN ('pendiente_zn','pendiente_zona_norte');
UPDATE matching_sugerencias SET estado='pendiente' WHERE estado='obsoleto_cross_zona';

-- 2. Rollback mig 252 (blindaje trigram)
-- Re-aplicar versión pre-blindaje desde sql/functions/matching/generar_matches_trigram.sql

-- 3. Rollback mig 251 (blindajes nombre + snapshot)
-- Re-aplicar versiones pre-blindaje desde sql/functions/

-- 4. Rollback mig 250 (polígono + CHECK)
DELETE FROM propiedades_v2 WHERE zona = 'Zona Norte';
UPDATE proyectos_master SET zona = 'Sin zona' WHERE zona = 'Zona Norte';
DELETE FROM zonas_geograficas WHERE nombre = 'Zona Norte';
ALTER TABLE propiedades_v2 DROP CONSTRAINT zona_valida;
ALTER TABLE propiedades_v2 ADD CONSTRAINT zona_valida CHECK (
  zona IS NULL OR zona IN ('Equipetrol Centro','Equipetrol Norte','Equipetrol Oeste',
                           'Sirari','Villa Brigida','Eq. 3er Anillo','Sin zona')
);
```

**ATENCIÓN:** este rollback pierde las 373+ props capturadas. NO es reversible.

---

## Activación del cron (recordatorio)

Si por algún motivo desactivaste los workflows discovery y querés volver a prenderlos:

1. n8n UI → workflow → toggle **ON**.
2. Verificar que la próxima corrida nocturna funciona.

Cron schedules:
- `flujo_a_discovery_century21_zonanorte`: `15 1 * * *` (1:15 AM hora Bolivia)
- `flujo_a_discovery_remax_zonanorte`: `45 1 * * *` (1:45 AM hora Bolivia)

---

## Rutina de captura de casas ZN — `/cron-casas` ($0)

Las **casas ZN** NO las captura n8n (eso es solo deptos). Se capturan con el flujo híbrido, y la
forma operativa de hoy es **manual-asistida, $0 bajo Max**:

**Cada 2-3 días** (casas es bajo volumen, no tiempo real) → abrí Claude Code en el repo y corré:

```
/cron-casas
```

El agente hace TODO en la sesión: discovery → diff → MOAT (lo lee el agente, sin API) → cargar
nuevas (INSERT-only) → verificador (baja con gracia 2d) → registra y commitea el log. Es gratis
porque corre bajo tu suscripción Max, sin API ni servidor.

- **Historial de corridas:** `scripts/casas-zn/cron-casas-log.md` (una línea por corrida).
- **Pipeline + comando:** `scripts/casas-zn/` (fuente del comando: `cron-casas.command.md`).
- **No corras dos veces seguidas** — el diff ya vería 0 nuevas.
- **Automatizar (opcional, "corre solo"):** n8n/Task Scheduler local + MOAT por API (~$4/mes).
  Requiere la PC prendida (la nube de Claude Code NO sirve: bloquea la red a los portales).
  Decisión y costos: **ADR-013** + `docs/arquitectura/PLATAFORMA_HIBRIDA_GENERICA.md` §11.

---

## Qué monitorear día a día

> **Patrón post-mig 254:** las props ZN se identifican con
> `zona IN (SELECT nombre FROM zonas_geograficas WHERE zona_general='Zona Norte')`.

### Conteo de inventario activo Zona Norte
```sql
SELECT COUNT(*) FROM propiedades_v2
WHERE zona IN (SELECT nombre FROM zonas_geograficas WHERE zona_general='Zona Norte')
  AND tipo_operacion='venta' AND status='completado';
-- Comparar con días previos: estable salvo absorciones / nuevas.
```

### ¿Un cron Equipetrol marca ZN como pending por error?
```sql
SELECT COUNT(*) FROM propiedades_v2 p
JOIN zonas_geograficas zg ON zg.nombre = p.zona AND zg.zona_general='Zona Norte'
WHERE p.status='inactivo_pending' AND p.primera_ausencia_at::date = CURRENT_DATE
  AND p.metodo_discovery NOT LIKE 'zonanorte_%';  -- marcadas por algo que NO es discovery ZN
-- Esperado: 0. Los discovery EQ filtran por lista positiva de 6 zonas EQ → no tocan ZN.
```

### ¿HITL Equipetrol contaminado con ZN?
```sql
SELECT COUNT(*) FROM matching_sugerencias ms
JOIN propiedades_v2 p ON ms.propiedad_id = p.id
JOIN zonas_geograficas zg ON zg.nombre = p.zona
WHERE ms.estado='pendiente' AND zg.zona_general='Zona Norte';
-- Esperado: 0 — si > 0, el trigger trg_separar_hitl_por_macrozona falló.
```

### ¿Matches cross-MACROZONA aplicados? (EQ↔ZN)
```sql
SELECT COUNT(*) FROM propiedades_v2 p
JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
JOIN zonas_geograficas zp ON zp.nombre = p.zona
JOIN zonas_geograficas zm ON zm.nombre = pm.zona
WHERE zp.zona_general <> zm.zona_general;
-- Esperado: 0 — una prop NO debe matchear a un pm de otra macrozona.
-- NOTA: cross-MICROZONA dentro de ZN (prop y pm en microzonas vecinas) SÍ ocurre y
-- es legítimo — es el tema del ticket #13, no una alarma.
```

### Snapshot Equipetrol limpio
```sql
SELECT venta_activas FROM market_absorption_snapshots
WHERE zona='global' AND fecha=CURRENT_DATE AND dormitorios=1;
-- EQ usa zona='global' (sin cambio post-mig 254). Comparar con día anterior: estable.
```

### Props nuevas en gaps de la grilla (deberían ser 0)
```sql
-- Las 14 microzonas dejan ~43 ha de gaps (1.56% del área). Una prop con GPS en un
-- gap queda zona=NULL. Hoy 0 props ahí; monitorear que no entren nuevas.
SELECT COUNT(*) FROM propiedades_v2
WHERE zona IS NULL AND status='completado'
  AND latitud BETWEEN -17.772 AND -17.664
  AND longitud BETWEEN -63.195 AND -63.111
  AND fecha_discovery::date >= CURRENT_DATE - 1;
-- ALERTA si > 0: revisar si conviene ajustar algún polígono. Ver ZONAS_ZONA_NORTE.md.
```

---

## Cuándo subir verificador throttle (Fase 6 PRD)

Si el verificador venta no alcanza a confirmar props pending de Equipetrol + Zona Norte juntos:
- Actual: LIMIT 150/noche
- Sugerido: LIMIT 200/noche (~+33%)

Cambio en `flujo_c_verificador_v2.0.0` nodo "Postgres Get Props" — actualizar el LIMIT en la query.

---

## Cuándo crear UI para HITL Zona Norte

Si las sugerencias `pendiente_zona_norte` crecen a un volumen que vale la pena revisar (>200), crear `/admin/supervisor/matching-zona-norte` filtrado por `estado='pendiente_zona_norte'`. Ver README sección "Cambio futuro de UI" para las 3 opciones documentadas.

---

## Referencias

- [README.md](./README.md) — panorama del proyecto.
- [DECISIONES.md](./DECISIONES.md) — ADRs.
- [BITACORA.md](./BITACORA.md) — cronología.
- [PRD.md](./PRD.md) — fases y rollback por fase.
- Migraciones: `250_*.sql`…`253_*.sql` (blindajes) + **`254_microzonas_zona_norte.sql`** (14 microzonas) + su `_rollback.sql`. (mig 255 snapshot v4 **DESCARTADA** — ver BACKLOG #12.)
- Workflows: `n8n/workflows/modulo_1/flujo_a_discovery_*_zonanorte_v1.0.0.json`.
