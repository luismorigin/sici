# Operación — Proyecto Zona Norte

> Cómo operar el sistema día a día y, si algo sale mal, cómo apagar/revertir cada componente.

**Última actualización:** 27 May 2026 (post-Fase 3+4 validadas).

---

## Estado operativo actual

Zona Norte está en **dark launch** desde el 26-may-2026:
- Workflows discovery ZN activos (cron 1:15 AM C21, 1:45 AM Remax).
- Pipeline interno (enrichment → merge → matching → snapshot) procesa ZN sin intervención.
- HITL Equipetrol limpio (sugerencias ZN separadas en `estado='pendiente_zn'`).
- Frontend público sigue mostrando solo Equipetrol — Zona Norte NO está expuesta al usuario final.

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
DELETE FROM propiedades_v2
WHERE zona = 'Zona Norte'
  AND metodo_discovery LIKE 'zonanorte_%'
  AND fecha_creacion >= 'YYYY-MM-DD';  -- fecha desde donde borrar
```

**Reversible:** sí, esperar el próximo discovery para repoblar.

---

### Nivel 3 — Sacar Zona Norte del sistema (no destructivo)

**Cuándo:** querés que el sistema no procese más props ZN pero conservar la data ya capturada.

**Cómo:**
```sql
-- Desactivar polígono (deja de asignar zona='Zona Norte' a nuevas props)
UPDATE zonas_geograficas SET activo = false WHERE nombre = 'Zona Norte';
```

**Efecto:** props nuevas con GPS en ZN ya no se etiquetan como ZN. Las existentes se mantienen. El frontend público sigue sin verlas.

**Reversible:** `UPDATE zonas_geograficas SET activo = true WHERE nombre = 'Zona Norte';`

---

### Nivel 4 — Rollback completo (destructivo)

**Cuándo:** decidís que Zona Norte fue un error y querés borrarlo todo.

**Cómo:** rollback en orden inverso de las migraciones:

```sql
-- 1. Rollback mig 253 (HITL separado)
DROP TRIGGER IF EXISTS trg_separar_hitl_zona_norte ON matching_sugerencias;
DROP FUNCTION IF EXISTS separar_hitl_zona_norte();
UPDATE matching_sugerencias SET estado='pendiente' WHERE estado='pendiente_zn';
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

## Qué monitorear día a día

### Conteo de inventario activo Zona Norte
```sql
SELECT COUNT(*) FROM propiedades_v2
WHERE zona = 'Zona Norte' AND tipo_operacion = 'venta' AND status = 'completado';
-- Esperado: ~370-400 props (puede variar día a día por absorciones / nuevas)
```

### ¿El cron Equipetrol marca ZN como pending por error?
```sql
SELECT COUNT(*) FROM propiedades_v2
WHERE zona = 'Zona Norte' AND status = 'inactivo_pending'
  AND primera_ausencia_at::date = CURRENT_DATE;
-- Esperado: 0 — si > 0, el fix del workflow Equipetrol falló
```

### ¿HITL Equipetrol contaminado con ZN?
```sql
SELECT COUNT(*) FROM matching_sugerencias ms
JOIN propiedades_v2 p ON ms.propiedad_id = p.id
WHERE ms.estado = 'pendiente' AND p.zona = 'Zona Norte';
-- Esperado: 0 — si > 0, el trigger 253 falló
```

### ¿Matches cross-zona aplicados?
```sql
SELECT COUNT(*) FROM propiedades_v2 p
JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
WHERE p.zona = 'Zona Norte' AND pm.zona != 'Zona Norte';
-- Esperado: 0 — si > 0, alguna sugerencia cross-zona pasó por aplicar_matches_aprobados
```

### Snapshot Equipetrol limpio
```sql
SELECT venta_activas FROM market_absorption_snapshots
WHERE zona = 'global' AND fecha = CURRENT_DATE AND dormitorios = 1;
-- Comparar con día anterior: debe ser estable (sin saltos bruscos)
```

---

## Cuándo subir verificador throttle (Fase 6 PRD)

Si el verificador venta no alcanza a confirmar props pending de Equipetrol + Zona Norte juntos:
- Actual: LIMIT 150/noche
- Sugerido: LIMIT 200/noche (~+33%)

Cambio en `flujo_c_verificador_v2.0.0` nodo "Postgres Get Props" — actualizar el LIMIT en la query.

---

## Cuándo crear UI para HITL Zona Norte

Si las sugerencias `pendiente_zn` (~40 actuales) crecen a un volumen que vale la pena revisar (>200), crear `/admin/supervisor/matching-zona-norte` filtrado por `estado='pendiente_zn'`. Ver README sección "Cambio futuro de UI" para las 3 opciones documentadas.

---

## Referencias

- [README.md](./README.md) — panorama del proyecto.
- [DECISIONES.md](./DECISIONES.md) — ADRs.
- [BITACORA.md](./BITACORA.md) — cronología.
- [PRD.md](./PRD.md) — fases y rollback por fase.
- Migraciones: `sql/migrations/250_*.sql`, `251_*.sql`, `252_*.sql`, `253_*.sql`.
- Workflows: `n8n/workflows/modulo_1/flujo_a_discovery_*_zonanorte_v1.0.0.json`.
