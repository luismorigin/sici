# Plan #7.1 — Fase 3: Discovery Alquiler Zona Norte

> **Estado:** PLAN para sesión futura. Nada aplicado.
> **Objetivo:** que alquiler ZN tenga la misma base de discovery que venta (3 portales, robusta), eliminando la dependencia del slug roto de Remax. Sin reescribir el core.
> **Principio rector:** replicar lo que venta YA hizo y probó (strangler, ADR-009). NO inventar arquitectura nueva. Equipetrol producción intacto salvo el fix mínimo de zona.

---

## TL;DR

El único agujero estructural de alquiler ZN es el **discovery**. El resto del enjambre (enrichment, merge, verificador) ya es zone-agnostic (verificado con 3 subagentes 30-may). El plan = clonar los workflows `_zonanorte` de venta para alquiler + el fix de "marcar ausentes" + 2 subidas de LIMIT. **Es lo mismo que ya funciona en venta; no hay diseño nuevo.**

> ⚠️ **Este TL;DR y las "Fases" de abajo son la versión INICIAL. El plan corregido (tras doble-check senior con datos de prod) está en §0 — ese manda.**

---

## 0. Plan corregido (tras doble-check senior, 30-may)

Un revisor senior cuantificó el plan contra prod y podó over-engineering. **Datos que mandan:**

| Portal | Alquiler EQ activo (completado) | Alquiler ZN activo | ZN en pending |
|---|---|---|---|
| **C21** | **121** (fuente #1) | 1 | 1 (← el bug lo tumba) |
| **Remax** | 22 | **30** (trae todo SC) | 1 (caída real, no bug) |
| **BI** | 2 | 0 | 0 |

### Podas aceptadas (del revisor)
- **P1 — Blindar "marcar ausentes" SOLO en C21, no en los 3.** El bug solo tumba ZN cuando el scrape EQ no contiene la prop. Eso pasa únicamente en C21 (grid fijo EQ). Remax trae todo SC → no pierde sus 30 ZN. BI no toca ZN. Tocar 3 workflows EQ de prod para 2 pending es desproporcionado. Y va **junto con** la cobertura, no antes (antes no compra nada).
- **P2 — Remax: patch del existente, NO workflow nuevo.** Remax ya trae las 30 ZN de colado; el agujero (slug `/equipetrolnoroeste` + `TOTAL_PAGES`) se cierra con el mismo cambio de 2 constantes que venta ZN ya hizo (base SC + TOTAL_PAGES + filtro polígono). Es un patch, no un clon completo.
- **P3 — Subir LIMITs (enrichment/verificador): NO es tarea.** 31 props no saturan `LIMIT 20`/`60`. Queda como **nota condicional** ("subir si el volumen lo pide"), fuera de las fases.
- **P4 — BI: no hacer.** 0 ZN, 2 EQ. Nunca para ZN hoy.
- **Riesgo EQ descartado con datos:** el filtro `zona IN (6 EQ)` no huérfana props EQ legítimas (las `zona IS NULL` del pool activo son todas `excluida_zona`). Usar **`zona IN (6 EQ) OR zona IS NULL`** en marcar-ausentes por cinturón-y-tiradores (costo cero).

### Corrección al revisor (donde se pasó de tijera)
- **C21 ZN SÍ es core, NO diferible.** El revisor lo difirió por "aporta 1 prop hoy" — pero ese 1 es porque el discovery C21 ZN no existe. **C21 es la fuente #1 de alquiler** (121 vs 22 de Remax en EQ). Con grid ZN propio traería el grueso del inventario ZN. Remax solo (30) es cobertura parcial de la fuente chica. Sin C21 ZN, "alquiler ZN con la misma base que venta" no se cumple.

### Plan mínimo viable corregido
1. **Fase 0 — Verificar prod** (drift n8n + comportamiento real del slug Remax). Sin esto, ciego. ~30 min.
2. **Remax ZN — patch del workflow existente:** base SC + TOTAL_PAGES + filtro polígono ZN. Cobertura inmediata (30/31 de lo que ya hay). ~1h.
3. **C21 ZN — clonar el grid de venta ZN → alquiler** (`registrar_discovery_alquiler`, `operacion=alquiler`). Es donde está el inventario ZN real a futuro (fuente #1). ~2-3h.
4. **Blindar marcar-ausentes SOLO en C21** con `zona IN (6 EQ) OR zona IS NULL`. Junto con el paso 3. ~30 min.
5. **NO hacer:** BI ZN, subida de LIMITs (notas condicionales).

**Diferencia vs plan inicial:** toca **1 workflow EQ (C21) + 1 patch Remax + 1 clon C21 ZN**, en vez de 3 EQ + 2 nuevos + LIMITs. Resuelve la fragilidad (slug Remax) y la cobertura real (C21 grid) con mínima superficie sobre EQ producción.

### Verificar en Fase 0 (antes de ejecutar)
- ¿El slug `/equipetrolnoroeste` de Remax filtra o lo ignora la API? (las 30 ZN sugieren que NO filtra → el patch puede ser aún más chico).
- Versión real en prod de cada discovery alquiler (drift; repo dice `TOTAL_PAGES=8`, prod puede diferir).
- Confirmar que la Remax ZN pending (id 2344) es caída real del portal, no del bug.

---

## Contexto (por qué hace falta)

- **Hoy:** alquiler ZN entra solo por Remax, de colado (su slug `equipetrolnoroeste` no filtra → devuelve todo SC → trigger GPS etiqueta ZN). C21 (grid fijo EQ) y BI (filtra `barrio=equipetrol`) no traen ZN. Frágil: si Remax "arregla" el slug, ZN deja de entrar.
- **Bug latente:** el "marcar ausentes" de los 3 discovery alquiler no filtra zona (mismo bug que venta cerró en `fb78d23`). Ya visible: 1 C21 ZN + 1 Remax ZN en `inactivo_pending`.
- **Referencia que copiamos:** venta resolvió esto con workflows `_zonanorte` (fetch amplio SC + filtro polígono ZN + marcar-ausentes filtrado por zona) y blindando el discovery EQ a las 6 zonas.

---

## Decisiones de diseño (deliberadamente mínimas)

1. **Strangler, no unificar.** Clonar los `_zonanorte` de venta; EQ intacto salvo el filtro de zona en marcar-ausentes. (Unificar EQ+ZN en un workflow toca EQ producción sin necesidad → descartado.)
2. **Priorizar por volumen.** Remax + C21 primero. **BI diferible** (volumen ínfimo en alquiler EQ: ~5-7 props; el costo/beneficio de un BI ZN es bajo hoy).
3. **NO tocar el core.** Enrichment/merge/verificador son zone-agnostic → solo se suben 2 LIMITs. Cero reescritura.
4. **NO construir "multi-macrozona universal" ahora.** Eso es el ticket #11 (cuando llegue Urubó). Acá solo ZN, clonando venta.

---

## Fases

### Fase 0 — Verificar prod (drift n8n) · ~30 min · sin riesgo
Antes de tocar nada, abrir la **n8n UI** (el repo puede diferir de prod) y confirmar:
- Versión real de cada discovery alquiler (Remax/C21/BI), enrichment (¿v2.1.0 con inyección de proyectos?), verificador (¿v2.0.0?, ¿reactiva props que vuelven a HTTP 200?).
- Confirmar empíricamente que Remax alquiler trae todo SC (contar props no-EQ que insertó la última corrida).
- `pg_get_functiondef` de las funciones que se puedan tocar (Regla 7).
- Cómo lucen los nodos reales "obtener activas BD" y "marcar ausentes" en los 3 discovery EQ alquiler.

### Fase 1 — Blindar discovery EQ alquiler · el fix mínimo que toca EQ
En los 3 discovery EQ alquiler, agregar `AND zona IN (6 zonas EQ)` en **"obtener activas BD"** y **"marcar ausentes"** (= `fb78d23` para alquiler). Evita que EQ marque/pise props ZN cuando ZN tenga su propio discovery.
- Riesgo EQ: patrón ya probado en venta. Bajo.
- Validar: tras el cambio, una corrida EQ no marca ninguna prop ZN como `inactivo_pending`.

### Fase 2 — Crear discovery ZN alquiler · el core · EQ intacto
Clonar los workflows `_zonanorte` de **venta**, adaptar a alquiler (llamar `registrar_discovery_alquiler`, endpoint de alquiler de cada portal):
- **Remax alquiler ZN:** endpoint base SC explícito (no el slug roto) + filtro polígono ZN + marcar-ausentes filtrado a ZN.
- **C21 alquiler ZN:** grid de coordenadas sobre el polígono ZN + ídem.
- **BI alquiler ZN:** DIFERIDO (evaluar tras ver volumen Remax+C21).
- Cron escalonado para no chocar con EQ ni saturar Firecrawl.
- El trigger GPS (`trg_asignar_zona_alquiler`) ya etiqueta microzonas ZN — nada que tocar ahí (verificado hoy: 31 props zonificadas OK).

### Fase 3 — Throughput · ajustes triviales
- **Enrichment** `LIMIT 20`/noche: medir cuántas props/noche genera ZN; subir solo si hace falta.
- **Verificador** audit `LIMIT 60` → ~120: para el volumen extra de pending ZN.

---

## Validación (criterio de éxito)
Tras una corrida nocturna completa:
1. Discovery ZN trae props de los portales activados; EQ no las pisa (0 props ZN nuevas en `inactivo_pending` por culpa de EQ).
2. Enrichment/merge las procesan (status `completado`, `llm_output` poblado, nombre/precio OK).
3. Snapshot (FIX A, ya en prod) las cuenta en la serie por microzona ZN.
4. Sin regresión en Equipetrol (conteos venta y alquiler EQ estables).

## Rollback
- Workflows ZN nuevos: desactivar en n8n (1 click). 
- Filtro de zona en EQ: revertir el nodo. 
- Todo reversible, sin migración de datos.

---

## Lo que este plan NO hace (anti over-engineering)
- NO crea el sistema "multi-macrozona dinámico" (ticket #11, espera a Urubó).
- NO reescribe enrichment/merge/verificador (zone-agnostic; solo LIMITs).
- NO incluye BI en el primer corte (volumen ínfimo; se evalúa después).
- NO toca el matching (FIX B1 es otro paquete, se mide con el volumen que traiga esta fase).

## Estimación
Fase 0: 30 min. Fase 1: 1-2h (3 workflows, cambio chico c/u). Fase 2: 3-4h (clonar 2 workflows venta→alquiler). Fase 3: 15 min. Total ~1 sesión.
