# PRD — Zona Norte (MVP de discovery)

**Versión:** 2.0 (reescrito al scope MVP). **Fecha:** 21 May 2026. **Owner:** Lucho.
**Estado:** investigación completada; pendiente diseño/implementación de blindajes + dark launch.

> Reemplaza al PRD v1.0 (que vivía en `docs/backlog/EXPANSION_ZONAS_PRD.md`, scope inflado con posicionamiento/landing). Las decisiones de fondo están en [DECISIONES.md](./DECISIONES.md).

---

## 1. Objetivo

Validar en producción real que SICI puede **capturar departamentos (venta + alquiler) de Zona Norte y producir data de calidad** a través del pipeline existente, sin reescribir el motor y sin exponer nada al público todavía.

**Fuera de scope:** matching con `proyectos_master`, posicionamiento de marca, landing, rutas públicas, comunicación a clientes, casas/terrenos. (ADR-001)

---

## 2. La pregunta de riesgo que valida el MVP

No es "¿contamino producción?" (manejable, ver ADR-005). Es: **¿el enrichment/merge —calibrados a Equipetrol— producen data de calidad en Zona Norte, o sale sucia?** Solo se responde pasando data real por el pipeline real.

---

## 3. Fases

### Fase 1 — Blindar los 2 puntos de contaminación (ANTES de meter datos)
Pre-requisito de todo. Ver [ADR-006](./DECISIONES.md) y [mapa-impacto](./investigacion/mapa-impacto.md).
1. **Matching por nombre** (`sql/functions/matching/generar_matches_por_nombre.sql`): agregar `AND p.zona = pm.zona` al JOIN. Exportar versión de producción con `pg_get_functiondef()` antes (regla 7 de CLAUDE.md). Bonus: arregla bug latente para todas las zonas.
2. **Snapshot global** (`sql/functions/snapshots/snapshot_absorcion_mercado.sql`): excluir Zona Norte del loop `zona='global'` (o darle serie separada) hasta decidir.
- **DoD:** ambas funciones desplegadas; un INSERT de prueba con `zona='Zona Norte'` no genera match por nombre contra Equipetrol ni entra al snapshot global.
- **Rollback:** re-aplicar la versión exportada de cada función.

### Fase 2 — Habilitar la zona en el schema
1. **Migración** CHECK constraint `zona_valida` en `propiedades_v2`: agregar `'Zona Norte'`. Verificar forma actual con `pg_get_constraintdef()` antes.
2. **Migración** INSERT del polígono en `zonas_geograficas` (nombre, zona_general, geom SRID 4326, activo). Usar el geojson final (no el de prueba). Verificar columnas con `\d zonas_geograficas`.
3. **Smoke:** `SELECT get_zona_by_gps(-17.72, -63.17)` → `'Zona Norte'`; INSERT dummy dentro del polígono → trigger setea zona; borrar dummy.
- **Rollback:** revertir CHECK; `DELETE FROM zonas_geograficas WHERE nombre='Zona Norte'` (limpiar props primero si las hubiera).

### Fase 3 — Discovery de Zona Norte (rama corta + dark launch, solo VENTA primero)
Crear rama corta `feature/zn-discovery` (ADR-007). Adaptar los workflows al patrón "fetch amplio + filtro por polígono GPS" (ADR-004):
- **C21 venta:** generar el grid bbox desde el bounding box del polígono Zona Norte (no constantes Equipetrol).
- **Remax venta:** endpoint base SC (sin slug) + filtrar por `ST_Contains` / polígono.
- **BI venta:** ya trae todo SC; reemplazar filtro `barrio==='equipetrol'` por filtro por polígono.
- Recordatorio: producción n8n puede divergir del repo — pull del workflow desde n8n UI antes de duplicar.
- **DoD:** corrida nocturna inserta props con `zona='Zona Norte'`, `tipo_operacion='venta'`; sin errores; matching por nombre no las toca; snapshot global no las cuenta.
- **Kill-switch (escrito antes de activar):** `DELETE FROM propiedades_v2 WHERE zona='Zona Norte'` + desactivar workflows.

### Fase 4 — Validar calidad de la data (la prueba real)
Dejar correr el pipeline (enrichment → merge → verificador) sobre la data de venta de Zona Norte unos días.
- Revisar: % con precio normalizado correcto, % con área/dorms, comportamiento del TC, tasa de exclusión, qué hace el LLM sin proyectos master.
- Herramientas: los audits semanales (`/audit-feed-ventas-semanal`) ya son zone-agnostic → corren sobre Zona Norte sin cambios.
- **DoD:** veredicto go/no-go sobre la calidad del pipeline en la zona nueva.

### Fase 5 — Alquiler (si venta validó)
Repetir Fase 3-4 para alquiler (C21 `operacion_renta`, Remax filtrando `transaction_type`, BI `modalidad=2`).

### Fase 6 — Verificador throttle
Subir LIMIT venta 150→200 y alquiler 60→90 (Lucho OK). Sincronizar en n8n UI (no confiar en repo).

---

## 4. Archivos / recursos por fase

| Recurso | Tipo | Fase | Reversible |
|---|---|---|---|
| `generar_matches_por_nombre.sql` | fix SQL | 1 | sí |
| `snapshot_absorcion_mercado.sql` | fix SQL | 1 | sí |
| migración CHECK `zona_valida` | SQL | 2 | sí |
| migración INSERT `zonas_geograficas` | SQL | 2 | sí |
| `geodata/zona_norte_v1.geojson` | asset | 2 | sí |
| workflows discovery C21/Remax/BI venta | n8n | 3 | sí (desactivar) |
| workflows discovery alquiler | n8n | 5 | sí |
| `flujo_c_verificador_v2.0.0.json` (LIMIT) | config | 6 | sí |

---

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| Polígono captura ruido de borde (zonas vecinas) | Smoke SQL post-Fase 2; afinar polígono. El PoC ya mostró ruido menor (2 "Beni", alguna "Este") |
| Data sale de baja calidad en la zona nueva | Es justamente lo que valida la Fase 4; si sale mal, kill-switch y se ajusta enrichment |
| Producción n8n ≠ repo | Pull desde n8n UI antes de duplicar workflows |
| Volumen +595 satura verificador | Subir límites (Fase 6) |
| Olvidar blindar antes de meter datos | Fase 1 es pre-requisito duro; nunca insertar sin los 2 blindajes desplegados |

---

## 6. Próximo paso inmediato

Diseñar e implementar la **Fase 1** (los 2 blindajes): exportar las funciones de producción, escribir el fix, validar. Recién con eso desplegado se toca cualquier dato.
