# Proyecto Zona Norte — Expansión geográfica de SICI

> Primera expansión de SICI más allá de Equipetrol. Zona piloto: **Zona Norte (Av. Banzer)**, Santa Cruz. MVP enfocado en **discovery de departamentos (venta + alquiler)**.

---

## Estado actual — 26 May 2026

**Fase:** Fases 1+2 aplicadas en prod ✅ → Próximo: Fase 3 (adaptar workflows discovery).

| Hito | Estado |
|---|---|
| Alineación de scope (MVP discovery venta+alquiler) | ✅ |
| Mapa de impacto del sistema completo | ✅ |
| Spike de escalabilidad: discovery por GPS en los 3 portales | ✅ |
| PoC de discovery: 595 props reales capturadas (sin tocar BD) | ✅ |
| Análisis del enjambre completo (qué contamina, qué no) | ✅ |
| Blindar matching por nombre (`AND p.zona = pm.zona`) | ✅ (mig 251) |
| Blindar snapshot de absorción global (hardcoded 6 zonas Equipetrol) | ✅ (mig 251) |
| Cargar polígono Zona Norte + ampliar CHECK constraint | ✅ (mig 250) |
| Backfill props/proyectos legacy con `get_zona_by_gps()` | ✅ (mig 250) |
| Dark launch de venta en prod real (workflows discovery) | ⬜ pendiente — Fase 3 |
| Validar calidad de datos del pipeline con data real | ⬜ pendiente — Fase 4 |
| Alquiler (después de venta) | ⬜ pendiente — Fase 5 |
| Decisión de posicionamiento/integración pública | ⬜ post-piloto |

---

## ⚠️ Caveat sobre la serie `market_absorption_snapshots` de Zona Norte

La serie `zona='Zona Norte'` arranca el **26-may-2026** con un baseline ruidoso por el backfill histórico:
- **Inventario activo:** 2 props "completado" (legacy mal etiquetadas que cayeron dentro al re-asignar).
- **Absorbidas últimos 30 días:** 22 venta + 4 alquiler con `primera_ausencia_at` reciente.
- **Tasa de absorción aparente:** ~92% — **es falsa** (no hay mercado activo medido, son props que existieron en algún momento y se dieron de baja con zona legacy mal etiquetada).

**No usar como métrica de mercado hasta:**
1. Discovery propio activo (Fase 3).
2. ≥90 días de captura continua desde Fase 3.

Antes de eso, presentar como *"rotación observada con baseline parcial"* con caveats, igual que cualquier serie `filter_version=3` joven (ver regla 12 de CLAUDE.md y `docs/canonical/ABSORCION_LIMITACIONES.md`).

**Sobre el snapshot global Equipetrol:** desde el 27-may-2026 mostrará -2 props activas y -22 absorbidas 30d vs los días previos. **No es pérdida, es limpieza:** esas props nunca fueron Equipetrol geográficamente, estaban con etiquetas legacy pre-migración 184 que inflaban las métricas.

---

## ⚠️ HITL — Sugerencias de Zona Norte NO aparecen en `/admin/supervisor/matching`

**Desde mig 253 (27-may-2026):** las sugerencias del matching automático para props con `zona='Zona Norte'` se marcan con `estado='pendiente_zn'` en lugar de `'pendiente'`. El HITL Equipetrol (`/admin/supervisor/matching`) filtra por `estado='pendiente'` y por lo tanto NO las ve.

**Por qué:** ADR-003 ya decía que Zona Norte arrancaría sin proyectos master y sin matching automático. La separación de estado evita que cientos de sugerencias ZN ensucien el flujo HITL de Equipetrol durante el piloto.

**Implementación:** trigger `trg_separar_hitl_zona_norte` BEFORE INSERT en `matching_sugerencias`. Permanente, cero mantenimiento. Reversible con DROP TRIGGER.

**Nada se pierde.** Las sugerencias ZN quedan completas en la tabla (propiedad_id, proyecto_master_sugerido, score, método, razón). Para verlas:

```sql
SELECT ms.*, p.url, p.nombre_edificio, pm.nombre_oficial
FROM matching_sugerencias ms
JOIN propiedades_v2 p ON ms.propiedad_id = p.id
JOIN proyectos_master pm ON ms.proyecto_master_sugerido = pm.id_proyecto_master
WHERE ms.estado = 'pendiente_zn'
ORDER BY ms.score_confianza DESC;
```

### 🛠️ Cambio futuro de UI cuando se decida revisar matches ZN

Cuando llegue el momento de incorporar Zona Norte al flujo HITL formal (post-validación del piloto, decisión documentada en ADR futuro):

**Opciones de implementación:**

1. **UI separada nueva** — crear `/admin/supervisor/matching-zona-norte` que filtra por `estado='pendiente_zn'`. Las funciones backend (`aplicar_matches_aprobados`, etc.) ya funcionan con cualquier estado, solo cambia el filtro de display. Recomendado si Zona Norte sigue siendo un piloto separado.

2. **Toggle/dropdown en UI existente** — agregar selector de zona en `/admin/supervisor/matching` para alternar entre "Equipetrol" y "Zona Norte" (o "Todas"). Recomendado si ZN deja de ser piloto y se integra al flujo normal.

3. **Migración total a HITL único** — `UPDATE matching_sugerencias SET estado='pendiente' WHERE estado='pendiente_zn'` + `DROP TRIGGER trg_separar_hitl_zona_norte`. Las sugerencias ZN aparecen en el HITL Equipetrol normal. Recomendado cuando Zona Norte tenga proyectos master propios suficientes y se quiera tratar igual.

**Ubicación del código relevante:**
- Trigger: `sql/migrations/253_hitl_zona_norte_separado.sql`
- Páginas admin: `simon-mvp/src/pages/admin/supervisor/matching.tsx` (referencia para crear copia ZN)

---

## TL;DR técnico

1. **El discovery escala por GPS.** Los 3 portales (C21, Remax, Bien Inmuebles) devuelven lat/lon en cada listing → estrategia "fetch amplio + filtrar por polígono GPS". Agregar una zona nueva = dibujar un polígono. Cero trabajo manual por portal.
2. **Una vez que una prop entra a `propiedades_v2`, todo el enjambre la procesa** (enrichment, merge, matching, verificador, snapshots) sin filtro de zona. Bueno para escalar, pero por eso el aislamiento se diseña.
3. **Solo 2 puntos contaminan Equipetrol**: el matching por nombre (no filtra zona) y el snapshot de absorción global. Ambos se blindan con cambios chicos.
4. **Estrategia elegida**: dark launch en producción real (no entorno paralelo). Blindar primero, meter datos después, validar con data real, kill-switch listo.

---

## Cómo navegar esta carpeta

| Archivo | Para qué |
|---|---|
| [DECISIONES.md](./DECISIONES.md) | Las decisiones de arquitectura clave con su **porqué** (formato ADR). Empezá acá si querés entender *por qué* hacemos las cosas así. |
| [BITACORA.md](./BITACORA.md) | Cronología append-only de cómo llegamos acá. El "cómo se gestó". |
| [PRD.md](./PRD.md) | Qué se construye: fases, migraciones, riesgos, rollback. |
| [investigacion/mapa-impacto.md](./investigacion/mapa-impacto.md) | El enjambre completo, etapa por etapa: qué toca Zona Norte. |
| [investigacion/spike-portales.md](./investigacion/spike-portales.md) | Discovery geográfico: cómo filtra cada portal, GPS al 100%. |
| [investigacion/poc-resultados.md](./investigacion/poc-resultados.md) | Resultados del PoC: 595 props, calidad, muestra con links. |

**Código del PoC:** `scripts/poc-zona-norte/` (script + polígono de prueba). El `resultados.json` es output generado (gitignorado).

---

## Scope (qué SÍ y qué NO)

**SÍ (MVP):** discovery de departamentos venta + alquiler de Zona Norte; pasar esa data por el pipeline real (enrichment → merge → verificador); validar calidad.

**NO (por ahora):** matching con `proyectos_master`, fichas técnicas, posicionamiento de marca, landing, rutas públicas `/mercado/zona-norte`, comunicación a clientes B2B, casas/terrenos. Todo eso se decide **después** de que el motor funcione.
