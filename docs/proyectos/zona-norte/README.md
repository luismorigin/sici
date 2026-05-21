# Proyecto Zona Norte — Expansión geográfica de SICI

> Primera expansión de SICI más allá de Equipetrol. Zona piloto: **Zona Norte (Av. Banzer)**, Santa Cruz. MVP enfocado en **discovery de departamentos (venta + alquiler)**.

---

## Estado actual — 21 May 2026

**Fase:** Investigación COMPLETADA ✅ → Próximo: diseño de implementación (los 2 blindajes + dark launch).

| Hito | Estado |
|---|---|
| Alineación de scope (MVP discovery venta+alquiler) | ✅ |
| Mapa de impacto del sistema completo | ✅ |
| Spike de escalabilidad: discovery por GPS en los 3 portales | ✅ |
| PoC de discovery: 595 props reales capturadas (sin tocar BD) | ✅ |
| Análisis del enjambre completo (qué contamina, qué no) | ✅ |
| Blindar matching por nombre (`AND p.zona = pm.zona`) | ⬜ pendiente |
| Blindar snapshot de absorción global | ⬜ pendiente |
| Dark launch de venta en prod real | ⬜ pendiente |
| Validar calidad de datos del pipeline con data real | ⬜ pendiente |
| Alquiler (después de venta) | ⬜ pendiente |
| Decisión de posicionamiento/integración pública | ⬜ post-piloto |

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
