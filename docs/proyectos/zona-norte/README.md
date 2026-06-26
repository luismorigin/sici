# Proyecto Zona Norte — Expansión geográfica de SICI

> Primera expansión de SICI más allá de Equipetrol. Zona piloto: **Zona Norte (Av. Banzer)**, Santa Cruz. MVP enfocado en **discovery de departamentos (venta + alquiler)**.

---

## Estado actual — 24 Jun 2026

**Foco actual: pipeline de casas/vivienda ZN.** Casas ZN activas cargadas (con contacto del captador; condominios en `condominios_master` mig 260+261; conteos vivos en `v_mercado_casas` / `condominios_master`); flujo híbrido manual (`scripts/sonda-suelo` + agentes-lectores, NO n8n). **Backfill 21-jun: las casas ya tienen todos los campos del contrato de deptos** — `fotos_urls`+`cantidad_fotos`, `descripcion`, `fecha_publicacion`, `codigo_propiedad`, `estacionamientos`/`oficina_telefono` (solo C21), además del `id` propio (ref pública `SIM-V<id>`) y `fuente` (Remax/C21). **Feed `/ventas/casas` en prod (mergeado, dark launch/noindex; vista `v_mercado_casas` ✅ mig 262) + cron `/cron-casas` (`scripts/casas-zn/`, verificador modelo deptos — ADR-015). Pendiente: validar unos días → og:image → público.**

**Fases 1-4 + #8 microzonas aplicadas (29-may):** 14 microzonas en BD (mig 254), frontend (`lib/zonas.ts`) y workflows discovery ZN. **Matching de deptos depurado (16-19 jun): venta 85.8%, alquiler 83.3%** (ver BITACORA). **Feeds públicos ZN construidos 23-jun (dark launch / noindex):** `/zona-norte/ventas` + `/zona-norte/alquileres` (ver memoria `project_feed_zona_norte_aislamiento`). Feed casas en prod (mergeado, dark launch/noindex) + cron `/cron-casas`. Próximo: #6 frontend `/mercado/zona-norte`.

| Hito | Estado |
|---|---|
| Fases 1-2 (blindajes mig 250-253) | ✅ |
| Fase 3: dark launch venta en prod (workflows discovery) | ✅ (26-may) |
| Fase 4: validar calidad pipeline con data real | ✅ (audit 28-may) |
| Audit GPS + cleanup historico K1/STONE/CURUPAU/Brickell (63 falsos) | ✅ (28-may) |
| Cargar pm Zona Norte (#1.5 + capas 2-3 + cleanup nocturno 29-may) | ✅ **73 pm activos con 100% verificación visual** |
| Match rate ZN venta | ✅ **85.8%** (16-jun, desde 19.7%) — aprobar sugerencias `pendiente_zona_norte` + 7 pm nuevos |
| Match rate ZN alquiler | ✅ **83.3%** (16-jun) — mismo método; sin nombre → matchea por GPS, validación por URL de anuncio |
| **#8 Microzonas (14 — grilla anillos×avenidas)** | ✅ **aplicado 29-may** (mig 254 + `lib/zonas.ts` + workflows discovery). Snapshot v4 descartado → ver #12 |
| Fase 5 / #7: alquiler (replicar patrón) | ✅ feed `/zona-norte/alquileres` construido 23-jun (dark launch/noindex); discovery ZN activo desde Fase 3 |
| Asset `og:image` ZN | ⬜ pendiente — subir `simon-mvp/public/skyline-zona-norte.jpg`. Los feeds ZN ya apuntan a esa ruta (commit `4ba18b2`); hasta subirla, compartir el link no muestra imagen de preview |
| #6 Frontend `/mercado/zona-norte` | ⬜ pendiente — prototipo multi-macrozona |
| #1.7 Detector automático de clusters emergentes | ⬜ pendiente — infraestructura escalable |
| #5 Exposición pública | ⬜ post-validación 90 días |

> Tickets nuevos del 29-may (ver `BACKLOG.md`): **#12** agregado snapshot `global_zona_norte`, **#13** blindaje matching a `zona_general`, **#14** gap snapshot Remax (baja prioridad).

**Detalle de cada hito + decisiones:** ver `BACKLOG.md`. **Cronología y lecciones aprendidas:** ver `BITACORA.md`. **Operación día a día + kill-switch:** ver `operacion.md`.

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

**Desde mig 253 (27-may), refactorizado en mig 254 (29-may):** las sugerencias del matching automático para props de macrozonas en piloto (no-Equipetrol) se marcan con `estado='pendiente_<macrozona>'` (para ZN: **`pendiente_zona_norte`**) en lugar de `'pendiente'`. El HITL Equipetrol (`/admin/supervisor/matching`) filtra por `estado='pendiente'` y por lo tanto NO las ve.

**Por qué:** ADR-003 ya decía que Zona Norte arrancaría sin proyectos master y sin matching automático. La separación de estado evita que cientos de sugerencias ZN ensucien el flujo HITL de Equipetrol durante el piloto.

**Implementación:** trigger `trg_separar_hitl_por_macrozona` BEFORE INSERT en `matching_sugerencias` (mig 254 — reemplazó a `trg_separar_hitl_zona_norte` de mig 253). Usa `zona_general` dinámicamente → soporta múltiples macrozonas en piloto sin tocar código (Urubó, etc.). Genera `pendiente_<macrozona>` (ej `pendiente_zona_norte`). Permanente, cero mantenimiento. Reversible con el rollback de mig 254.

**Nada se pierde.** Las sugerencias ZN quedan completas en la tabla (propiedad_id, proyecto_master_sugerido, score, método, razón). Para verlas:

```sql
SELECT ms.*, p.url, p.nombre_edificio, pm.nombre_oficial
FROM matching_sugerencias ms
JOIN propiedades_v2 p ON ms.propiedad_id = p.id
JOIN proyectos_master pm ON ms.proyecto_master_sugerido = pm.id_proyecto_master
WHERE ms.estado = 'pendiente_zona_norte'
ORDER BY ms.score_confianza DESC;
```

### 🛠️ Cambio futuro de UI cuando se decida revisar matches ZN

Cuando llegue el momento de incorporar Zona Norte al flujo HITL formal (post-validación del piloto, decisión documentada en ADR futuro):

**Opciones de implementación:**

1. **UI separada nueva** — crear `/admin/supervisor/matching-zona-norte` que filtra por `estado='pendiente_zona_norte'`. Las funciones backend (`aplicar_matches_aprobados`, etc.) ya funcionan con cualquier estado, solo cambia el filtro de display. Recomendado si Zona Norte sigue siendo un piloto separado.

2. **Toggle/dropdown en UI existente** — agregar selector de zona en `/admin/supervisor/matching` para alternar entre "Equipetrol" y "Zona Norte" (o "Todas"). Recomendado si ZN deja de ser piloto y se integra al flujo normal.

3. **Migración total a HITL único** — `UPDATE matching_sugerencias SET estado='pendiente' WHERE estado='pendiente_zona_norte'` + `DROP TRIGGER trg_separar_hitl_por_macrozona`. Las sugerencias ZN aparecen en el HITL Equipetrol normal. Recomendado cuando Zona Norte tenga proyectos master propios suficientes y se quiera tratar igual.

**Ubicación del código relevante:**
- Trigger: `sql/migrations/254_microzonas_zona_norte.sql` (función `separar_hitl_por_macrozona`, reemplazó la `separar_hitl_zona_norte` de mig 253)
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
| [BACKLOG.md](./BACKLOG.md) | Tickets pendientes por prioridad (críticos / medianos / producto / investigación). Surgió de la validación Fase 3+4. |
| [PRD.md](./PRD.md) | Qué se construye: fases, migraciones, riesgos, rollback. |
| [operacion.md](./operacion.md) | Cómo operar día a día y kill-switch en 4 niveles si algo sale mal. |
| [investigacion/mapa-impacto.md](./investigacion/mapa-impacto.md) | El enjambre completo, etapa por etapa: qué toca Zona Norte. |
| [investigacion/spike-portales.md](./investigacion/spike-portales.md) | Discovery geográfico: cómo filtra cada portal, GPS al 100%. |
| [investigacion/poc-resultados.md](./investigacion/poc-resultados.md) | Resultados del PoC: 595 props, calidad, muestra con links. |

**Código del PoC:** `scripts/poc-zona-norte/` (script + polígono de prueba). El `resultados.json` es output generado (gitignorado).

---

## Scope (qué SÍ y qué NO)

**SÍ (MVP):** discovery de departamentos venta + alquiler de Zona Norte; pasar esa data por el pipeline real (enrichment → merge → verificador); validar calidad.

**NO (por ahora):** matching con `proyectos_master`, fichas técnicas, posicionamiento de marca, landing, rutas públicas `/mercado/zona-norte`, comunicación a clientes B2B. Todo eso se decide **después** de que el motor funcione.

> **Nota (20-jun):** casas/vivienda ZN YA es frente activo (305 casas cargadas con contacto, 45 condominios en `condominios_master`); falta el feed público. Terrenos siguen fuera de scope por ahora.
> **Nota (21-jun):** backfill completado — las casas ya tienen fotos, descripción, fecha de publicación y código del portal (faltaban respecto al contrato de deptos). El feed público ya tiene todos los datos para renderizar cards completas; solo falta construirlo.
