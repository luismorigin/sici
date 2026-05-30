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

Un revisor senior cuantificó el plan contra prod y podó over-engineering. Inventario medido (30-may):

| Portal | Alquiler EQ activo (completado) | Alquiler ZN "activo" (SESGADO) | ZN en pending |
|---|---|---|---|
| **C21** | 121 | 1 | 1 (← el bug lo tumba) |
| **Remax** | 22 | 30 (trae todo SC) | 1 (caída real, no bug) |
| **BI** | 2 | 0 | 0 |

> ⚠️ **Esta tabla NO sirve para priorizar portales en ZN** (ver §0.1). Las columnas EQ son de otra zona; las columnas ZN están sesgadas (solo Remax tiene discovery efectivo en ZN). Se dejan solo para el análisis del bug "marcar ausentes" y del riesgo a EQ.

### Podas aceptadas (del revisor)
- **P1 — Blindar "marcar ausentes" SOLO en C21, no en los 3.** El bug solo tumba ZN cuando el scrape EQ no contiene la prop. Eso pasa únicamente en C21 (grid fijo EQ). Remax trae todo SC → no pierde sus 30 ZN. BI no toca ZN. Tocar 3 workflows EQ de prod para 2 pending es desproporcionado. Y va **junto con** la cobertura, no antes (antes no compra nada).
- **P2 — Remax: patch del existente, NO workflow nuevo.** Remax ya trae las 30 ZN de colado; el agujero (slug `/equipetrolnoroeste` + `TOTAL_PAGES`) se cierra con el mismo cambio de 2 constantes que venta ZN ya hizo (base SC + TOTAL_PAGES + filtro polígono). Es un patch, no un clon completo.
- **P3 — Subir LIMITs (enrichment/verificador): NO es tarea.** 31 props no saturan `LIMIT 20`/`60`. Queda como **nota condicional** ("subir si el volumen lo pide"), fuera de las fases.
- **P4 — BI: no hacer.** 0 ZN, 2 EQ. Nunca para ZN hoy.
- **Riesgo EQ descartado con datos:** el filtro `zona IN (6 EQ)` no huérfana props EQ legítimas (las `zona IS NULL` del pool activo son todas `excluida_zona`). Usar **`zona IN (6 EQ) OR zona IS NULL`** en marcar-ausentes por cinturón-y-tiradores (costo cero).

### 0.1 — 🔴 CORRECCIÓN DE MÉTODO (catch del director) — invalida la priorización por volumen EQ

Tanto mi plan como el doble-check priorizaron portales por el **volumen de alquiler en Equipetrol** (C21 121 > Remax 22 > BI 2). **Error de método:** la cuota de cada portal cambia por zona, y la evidencia ZN ya lo contradice (Remax 30 vs C21 1, opuesto a EQ). No se infiere el inventario de ZN desde EQ.

Se CAEN estas conclusiones:
- ❌ "C21 es la fuente #1 → core / Remax es chico" — cierto en EQ, **no demostrado en ZN**.
- ❌ "BI ínfimo → no hacer" — cierto en EQ, **no demostrado en ZN**.
- ⚠️ El único dato ZN (Remax 30 / C21 1 / BI 0) está **sesgado**: solo Remax llega a ZN (slug roto). El 1 de C21 y el 0 de BI miden *nuestra captura*, NO el inventario del portal — sus discovery ni llegan a ZN.

**Método correcto:** medir el inventario de alquiler ZN **por portal, yendo a los portales** (spike, como el PoC de venta del 20-may que contó props por portal dentro del polígono ZN). Ese dato decide orden y alcance — no los números de EQ.

### Plan mínimo viable corregido
1. **Fase 0a — Spike de inventario alquiler ZN por portal.** Consultar C21, Remax y BI por el polígono ZN y contar props de alquiler reales de cada uno. Es el PoC que venta tuvo y alquiler nunca hizo. Decide cuáles clonar y en qué orden. ~1-2h (Firecrawl/curl acotado).
2. **Fase 0b — Verificar drift n8n** (versión real de cada discovery/enrichment/verificador; si el slug de Remax filtra o no). ~30 min.
3. **Clonar discovery ZN de los portales que el spike muestre con inventario** — **por defecto los 3** (Remax patch + C21 grid + BI), sin descartar ninguno hasta que el spike lo justifique. Cada uno: fetch amplio + filtro polígono ZN + `registrar_discovery_alquiler`.
4. **Blindar "marcar ausentes"** (`zona IN (6 EQ) OR zona IS NULL`) en los discovery EQ cuyo scrape NO contenga ZN (hoy seguro C21; los demás según spike + 0b).
5. **Condicional (no tarea):** subir LIMITs si el volumen real lo pide.

**Postura por defecto = la del director: clonar los 3.** Descartar BI o diferir cualquiera requiere el dato del spike, NO la extrapolación de Equipetrol.

### Lo que SÍ se sostiene (no depende del mix por zona)
- El bug "marcar ausentes sin filtro de zona" y su fix (`zona IN (6 EQ) OR zona IS NULL`) — es lógica de zona, no de volumen.
- El riesgo a EQ del filtro = nulo (las `zona IS NULL` activas son todas `excluida_zona`).
- Enrichment/merge/verificador zone-agnostic (no dependen del portal ni la zona).
- Remax ya trae ZN de colado (su patch sigue siendo chico) — pero eso NO implica que Remax sea la fuente principal de ZN; el spike lo dirá.

### 0.2 — Consideración arquitectónica: clonar la generación MULTI-MACROZONA (no la EQ vieja)

Hay **2 generaciones** de discovery en el repo, y hay que clonar la correcta:
- **Vieja (Equipetrol-hardcoded):** `flujo_discovery_*_alquiler_v1.0.0` (alquiler) y `flujo_a_discovery_*` EQ (venta). Asumen/filtran Equipetrol.
- **Nueva (multi-macrozona universal):** los `_zonanorte` de **venta**. NO son "de Zona Norte" — leen un array de macrozonas activas: `zona_general = ANY(ARRAY['Zona Norte']::text[])`. Hoy `['Zona Norte']`; mañana `['Zona Norte','Urubó']` = **cero workflow nuevo** (ADR-009).

**Regla para #7.1:** los discovery de alquiler ZN se clonan desde la **generación nueva (venta ZN)**, NO desde la vieja EQ. Así heredan **gratis** la capacidad multi-macrozona — un solo set de discovery de alquiler que sirve ZN hoy y cualquier macrozona futura cambiando el array. Alquiler queda **a la par de venta** (cada uno con su generación escalable, separados entre sí por Regla 6).
- **Hacer:** mantener el patrón `ARRAY[...]` de macrozonas extensible. NO hardcodear `'Zona Norte'` como string suelto en filtros/queries del workflow.
- **NO hacer (≠ #11):** el sistema de zonas 100% dinámico (FK a `zonas_geograficas`, `/api/zonas`, etc.) es el ticket **#11**, para cuando llegue Urubó. Acá solo se hereda el patrón del array que venta ZN **ya** tiene — no se construye infraestructura nueva.

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
