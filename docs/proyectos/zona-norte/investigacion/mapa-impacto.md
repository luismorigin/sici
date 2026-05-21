# Mapa de impacto — el enjambre completo

**Fecha:** 20 May 2026. Qué le pasa a cada etapa del pipeline de SICI cuando entra una prop de Zona Norte. El insight central: **una vez que una prop entra a `propiedades_v2`, todo el enjambre la procesa sin filtro de zona.**

---

## Pipeline etapa por etapa

| Etapa | ¿Procesa Zona Norte? | ¿Filtro de zona? | Veredicto |
|---|---|---|---|
| **Discovery** (C21/Remax/BI) | Los workflows reales están clavados a Equipetrol (grid/slug/barrio) | — | El PoC probó que los datos existen; los workflows hay que **modificarlos** (ver spike) |
| **Enrichment regex + LLM** | Sí, automático (toma todo lo nuevo) | No | ✅ Deseable. LLM sin proyectos master → infiere con "confianza media" (ok día 1) |
| **Merge** | Sí, automático | No | ✅ Deseable. TC paralelo es por portal/descripción, no por zona |
| **Matching GPS** | Sí | **Sí: `p.zona = pm.zona` + 250m** (`generar_matches_gps.sql:70,93`) | ✅ Blindado. No puede cross-matchear con Equipetrol |
| **Matching por nombre** | Sí | **NO filtra zona** (`generar_matches_por_nombre.sql:48`) | ⚠️ **Riesgo**: edificio Zona Norte con nombre igual a uno de Equipetrol = falso positivo |
| **Verificador** | Sí, automático (throttle global 150/60) | No | Sube volumen → subir límites (Lucho OK) |
| **Snapshot absorción — por zona** | Sí, genera serie propia (itera `DISTINCT zona`) | Por zona | ✅ No contamina otras zonas |
| **Snapshot absorción — global** | Sí | **NO: agrega todo `zona IS NOT NULL`** (`snapshot_absorcion_mercado.sql:86+`) | ⚠️ **Riesgo**: se mezcla en la serie global de Equipetrol |

---

## Los 2 únicos puntos de contaminación

De todo el enjambre, solo 2 ensucian Equipetrol:

1. **Matching por nombre** → falsos positivos cross-zona. Fix: `AND p.zona = pm.zona` (arregla además un bug para todas las zonas).
2. **Snapshot global** → métricas de absorción mezcladas. Fix: excluir Zona Norte del loop global (o serie separada).

El resto (enrichment, merge, verificador, matching GPS, snapshot por-zona) procesa Zona Norte **sin ensuciar nada** — y de hecho querés que lo haga, porque así validás la calidad del pipeline con data real.

→ Decisión de blindaje en [DECISIONES.md ADR-006](../DECISIONES.md). Implicancia de aislamiento en [ADR-005](../DECISIONES.md).

---

## Componentes confirmados zone-agnostic (sin cambios)

Triggers PostGIS (asignan zona por GPS), vistas `v_mercado_venta`/`v_mercado_alquiler`, prompt LLM (`{lista_proyectos_zona}` dinámico), audits semanales/mensuales, admin UI (dropdowns dinámicos), brokers shortlists, GA4/Meta Pixel/Clarity (parámetro `zona` dinámico). El pipeline de casas/terrenos (migración 221) ya validó esta arquitectura.

## Componentes con hardcoding de Equipetrol (relevantes solo si/ cuando se exponga al público — NO en MVP)

- `simon-mvp/src/lib/mercado-data.ts:60` (`ZONAS_EQUIPETROL`), rutas `/mercado/equipetrol/*`, copy + Schema.org en `landing-v2.tsx`, `ventas.tsx`, `alquileres.tsx`.
- CHECK constraint `zona_valida` (necesario al insertar la zona en producción).
