# Deuda técnica: Unificar superficies de data de mercado

> **Estado:** Backlog — documentado, no implementado
> **Fecha de apertura:** 21 abril 2026
> **Prioridad:** Media. No bloquea publicaciones pero expone inconsistencias visibles al usuario.
> **Contexto:** Identificado durante el refactor del reporte "Baseline de Equipetrol Abril 2026"

## Problema

**Cuatro superficies** de SICI muestran datos de mercado de Equipetrol que pueden diferir entre sí. La diferencia no siempre es bug — a veces es intencional (distintos casos de uso). Pero la falta de un motor único agrava los riesgos de divergencia no-intencional.

| Superficie | Fuente | TC paralelo | Filtro antigüedad | Filtros calidad |
|---|---|---|---|---|
| `/mercado/equipetrol` (landing) | `propiedades_v2` directo | `config_global.tipo_cambio_paralelo` (manual) | 300/730 venta, 150 alquiler | Reimplementados en JS (`mercado-data.ts`) |
| `/admin/market` (dashboard) | Mezcla: `propiedades_v2` + `v_mercado_venta` + `market_absorption_snapshots` | Depende de cada query | Mezcla | Mezcla |
| Framework estudios por cliente (`scripts/estudio-mercado/src/`, genera Condado VI) | `propiedades_v2` directo | `config_global` | **Sin filtro** — ve corpus completo | Canónicos en `queryVenta()` |
| Framework reporte público baseline (`scripts/estudio-mercado/src/baseline/`, nuevo) | `propiedades_v2` directo | `obtener_tc_actuales()` — Binance P2P vivo | Aplica 300/730/150 (paridad con feed) | Canónicos, aislados del framework de clientes |

**Dos divergencias son intencionales:**
- TC source: estudios por cliente usa `config_global` (actualizable manualmente); reporte público usa Binance P2P vivo (auditable). Ambos tienen justificación.
- Filtro antigüedad: estudios por cliente ve corpus completo (desarrolladores pagantes evalúan su posición incluyendo inventario estancado); reporte público aplica filtros (paridad con lo que el lector ve en simonbo.com).

**Una divergencia es bug:** `/mercado/equipetrol` y `/admin/market` tienen lógica replicada que puede desincronizarse silenciosamente de las vistas canónicas tras migraciones futuras.

## Problemas concretos que esto genera

1. **Filtros reimplementados pueden divergir de la vista.** `applyQualityFilters()` en `mercado-data.ts` replica los filtros de `v_mercado_venta`. Si la vista cambia (ej: migración 207 acortó alquileres a 150 días), la landing no se entera automáticamente.

2. **Dos fuentes distintas de TC paralelo.** Landing usa `config_global` (valor manual en admin), reporte usa `obtener_tc_actuales()` (Binance P2P nocturno). Si `config_global` no se actualiza tras un pico del paralelo, el mismo depto muestra dos precios normalizados distintos en dos páginas del mismo sitio.

3. **FALLBACK_DATA hardcodeado.** `lib/mercado-data.ts` líneas 70-94 tienen datos estáticos del **9 de marzo 2026**. Si Supabase falla durante build SSR, la landing sirve esos números sin advertencia. Data de 6+ semanas atrás publicada como actual.

## Solución propuesta (Fase 2)

Consolidar las **4 superficies** sobre un motor único (framework `scripts/estudio-mercado/src/tools/` expuesto vía API routes en simon-mvp):

1. **Crear API routes en `simon-mvp`** que expongan las tools:
   - `GET /api/mercado/panorama` → `panoramaMercado()`
   - `GET /api/mercado/tipologia?zona=X` → `demandaTipologia(zona)`
   - `GET /api/mercado/rotacion?zona=X&dias=30` → `rotacionObservada(zona, dias)`

2. **Migrar `lib/mercado-data.ts` para consumir las API routes** en lugar de reimplementar queries + filtros manualmente.

3. **Migrar `pages/admin/market.tsx`** para dejar de replicar queries. Consume las mismas API routes.

4. **Unificar fuente del TC paralelo** — eliminar `config_global.tipo_cambio_paralelo` o hacer que se sincronice automáticamente con el snapshot de Binance vía trigger/cron.

5. **Eliminar FALLBACK_DATA** o regenerarlo en cada build desde las tools (nunca más hardcodeado con fecha fija).

## Dependencia técnica

Las tools viven en `scripts/estudio-mercado/` con su propio `package.json` y cliente Supabase. Vercel serverless **no puede importar desde `scripts/`**. Antes de la Fase 2 hay que:

- Mover las tools a `simon-mvp/src/lib/mercado/` o
- Configurar monorepo con workspaces

Este mismo issue está documentado en `docs/backlog/ESTUDIOS_MERCADO_SAAS.md` (Fase 1 del producto SaaS) — conviene resolverlo una sola vez y beneficiar ambos tracks.

## Estimación

- Mover tools a simon-mvp: 0.5 día
- Crear 3 API routes: 0.5 día
- Refactor `mercado-data.ts`: 0.5 día
- Refactor `pages/admin/market.tsx`: 1 día
- Unificar TC paralelo: 0.5 día
- Testing + validación cross-página: 0.5 día

**Total estimado: 3.5 días de trabajo**

## Indicador de cuándo atacar esto

Esta deuda se vuelve bloqueante cuando:
- Un broker/cliente pregunta "por qué en tu landing dice X y en tu reporte dice Y"
- Se publica la segunda edición del reporte público y alguien compara con datos live
- Se habilita el producto SaaS de estudios por desarrolladora (requiere datos consistentes multi-tenant)

Hasta entonces, el reporte público se protege con la cláusula ya declarada en `§2 Metodología`: *"los datos de esta edición corresponden a un snapshot tomado el [fecha]. El sistema de captura sigue operando diariamente; los números actuales en la plataforma pueden diferir levemente de los publicados aquí."*

## Referencias

- Framework actual: `scripts/estudio-mercado/src/tools/`
- Landing data: `simon-mvp/src/lib/mercado-data.ts`
- Admin dashboard: `simon-mvp/src/pages/admin/market.tsx`
- Backlog relacionado: `docs/backlog/ESTUDIOS_MERCADO_SAAS.md`
- Hallazgo original: conversación de refactor reporte público, 21 abril 2026
