# Plan — Parametrización por macrozona/microzona (aislamiento EQ ↔ ZN)

> **Fuente de verdad del ticket #15** (`BACKLOG.md`). Reemplaza/amplía la entrada "#15 — Aislamiento ZN".
> **Creado:** 1-jun-2026. **Estado:** EN EJECUCIÓN.

## Estado de ejecución (actualizado 1-jun-2026)

| Fase | Estado | Notas |
|---|---|---|
| **F0 — Cimiento BD** | ✅ **HECHA** | Migración 257 aplicada y verificada (venta EQ=384/ZN=399, alq EQ=143/ZN=105, 0 sin macrozona, helper==columna, sin duplicación). |
| **F1 — Stop the bleed** | ✅ **HECHA** | Home Market Lens (`supabase.ts` obtenerMetricasMercado/Snapshot24h/ZonasAlquiler + `landing-data.ts`), audit-ventas/alquileres-mensual `db.mjs`, 2 command.md semanales (+ copias `.claude/commands/`), estudio `panoramaMercado` (param `zonasIncluidas` + helper `getZonasDeMacrozona` + `config.macrozona`), `analisis_11q`. Typecheck OK (estudio + frontend). |
| **F2 — Dashboards admin** | ✅ **HECHA** | `market.tsx` (8 fetch de mercado → EQ) + `market-alquileres.tsx` (2 fetch). Lookups de `proyectos_master` por id NO tocados (ya acotados). `market_absorption_snapshots` NO tocado (blindado mig 256). **Caveat:** `fetchDataQuality` (L935) queda sin filtrar a propósito (mide cobertura zona incl. sin-zona; es health-check transversal, no métrica de precios). Typecheck OK. |
| **F3 — SSOT único** | ✅ **HECHA (código + SQL aplicado + verificado)** | Decisión: **'Eq. 3er Anillo' ES Equipetrol → unificar a 6 zonas** (marginal: 4 props venta, 0 alq). Código: `mercado-data.ts`/`mercado-alquiler-data.ts` usan `ZONAS_EQUIPETROL_DB` (6) + copy SEO/Schema.org "5→6 zonas" en ~15 lugares (typecheck OK). **SQL: migración 258 aplicada y verificada** — `resumen_mercado('venta')` default = 384 (6 zonas EQ incl. 3er Anillo, 0 ZN), `resumen_mercado('alquiler')` = 143. Allowlist de 5 eliminada. `/api/zonas` (3c) movido a #6. Baseline trimestral fuera de scope (reporte congelado). |
| **F4 — Exponer ZN/microzona** | ✅ **HECHA (parte de aislamiento)** | **4c**: cerrado el leak de `resultados-v2.tsx:637` (default `ZONAS_EQUIPETROL_DB` si la URL no trae zonas). Typecheck OK. **El resto de F4 (selectores ZN, `/api/zonas`, slugs ZN en `buscar_unidades_alquiler`) se consolida en el ticket #6 (exposición pública de ZN)** — es infra de exposición, no de aislamiento. Nota: el `ELSE` del CASE de `buscar_unidades_alquiler` ya permite pedir microzonas ZN por nombre BD. |
| **F5 — Cierres future-proof** | ✅ **HECHA** | **HITL ya genérico**: el trigger activo `trg_separar_hitl_por_macrozona` usa `separar_hitl_por_macrozona()` (basada en `zona_general`, escala a Urubó vía `NOT IN ('Equipetrol')`). La función vieja `separar_hitl_zona_norte` quedó **huérfana** (código muerto; limpieza opcional con patrón `_trash_*`). **Regla SSOT macrozona documentada en `CLAUDE.md`** (sección Zonas Canónicas). Smoke-test Urubó: procedimiento abajo (no ejecutado — requiere staging). |

### Smoke-test Urubó (procedimiento, para cuando se sume la 3ra macrozona)
1. En staging: `INSERT INTO zonas_geograficas (nombre, zona_general, geom, activo) VALUES ('Urubó Centro', 'Urubó', <geom>, true);` (+ las microzonas que correspondan).
2. Verificar SIN tocar código: `SELECT zona_general, COUNT(*) FROM v_mercado_venta GROUP BY 1;` debe mostrar 'Urubó'. `SELECT macrozona_de('Urubó Centro');` → 'Urubó'. `getZonasDeMacrozona('Urubó')` (script) → las microzonas.
3. Lo que SÍ requiere código (bajo, no cero): slugs UI en `buscar_unidades_alquiler` CASE, labels/copy editorial, selectores (ticket #6), config del estudio/baseline de la nueva macrozona.

> **🔗 Relacionado — `docs/backlog/UNIFICACION_MERCADO_DATA.md` (repo general).** Este plan parcheó el filtro de macrozona **consumidor por consumidor** (las 4 superficies de mercado: `mercado-data.ts`, `/admin/market`, estudio, baseline). Esa deuda de abril propone unificarlas en un **motor único** — que es la solución de fondo que **elimina la dispersión del filtro** (un solo lugar filtra macrozona). Si se ataca esa unificación, incorporar `zona_general` como parámetro del motor. **Nota de scope:** este trabajo es **infra global** (no específico de Zona Norte); vive acá por trazabilidad histórica (ZN fue el disparador), pero la solución de fondo es del repo general.

> **Método:** 3 exploradores read-only (capa BD / frontend / scripts) → planificador → revisor adversarial → verificación de dudas contra la BD viva. Todos los conteos de este doc fueron verificados con el MCP `postgres-sici` el 1-jun-2026.

---

## 1. Objetivo del director (textual)

> "Quiero que cuando pidas mostrarme el mercado en Equipetrol o en la Zona Norte o en alguna microzona, utilice la vista o las herramientas necesarias que puedan identificar por zona. Por ahora tenemos microzonas, y zona norte con microzonas. Quiero que el sistema de vistas y herramientas que usan data no se vea afectado por este aumento de zonas."

Traducción operativa:
1. **Aislar**: toda superficie que hoy debe ser "solo Equipetrol" debe dejar de mezclar Zona Norte.
2. **Parametrizar**: poder pedir el mercado de una macrozona (EQ / ZN) o de una microzona puntual y obtener la data correcta.
3. **Future-proof**: agregar Urubó/Polanco sin reescribir N lugares (ADR-009/010, "macrozonas hermanas").
4. **No romper Equipetrol producción** (strangler pattern) ni el snapshot de absorción.

---

## 2. Diagnóstico raíz

La **macrozona vive solo en `zonas_geograficas.zona_general`** (`'Equipetrol'` vs `'Zona Norte'`). El resto del sistema razona en **microzonas sueltas** (`propiedades_v2.zona` = nombre de microzona). Cuando solo existía Equipetrol, "lo que no es `Sin zona` ES Equipetrol" funcionaba por accidente. Al entrar ZN con 14 microzonas de nombre propio + `activo=true`, esa premisa se rompió y **ZN ≈ 50% del volumen** se cuela en todo consumidor que asume "todo es EQ".

**Conteos verificados (1-jun-2026, join `DISTINCT nombre` a `zona_general`):**

| Vista | Equipetrol | Zona Norte |
|---|---|---|
| `v_mercado_venta` | 384 | 399 |
| `v_mercado_alquiler` | 143 | 105 |

Cero zonas de las vistas quedan sin fila en `zonas_geograficas` (no hay huérfanas).

### 2.1 Modelo de datos actual

- `propiedades_v2.zona` = nombre de **microzona** (auto-asignado por GPS: trigger `trg_asignar_zona_venta` / `trigger_asignar_zona_alquiler` + `get_zona_by_gps`).
- `propiedades_v2.microzona` = subdivisión más fina (inconsistente; muchas vistas hacen `COALESCE(microzona, zona)`).
- **`zonas_geograficas`** es la única tabla que conoce la macrozona: `zona_general` + `nombre` (= `p.zona`) + `geom` (PostGIS) + `activo`.
- **Join canónico macrozona→microzona:** `zonas_geograficas.nombre = propiedades_v2.zona WHERE zona_general = '<macrozona>'`.

### 2.2 ⚠️ Trampa del doble polígono

`zonas_geograficas` tiene **2 filas con `nombre = 'Equipetrol Norte'`** (2 polígonos). Un INNER/LEFT JOIN naíve por `nombre` **duplica filas**. Verificado: `zona='Equipetrol Norte'` → 43 filas base, **86 con JOIN naíve, 43 con `SELECT DISTINCT nombre`**. Ningún otro nombre mapea a >1 `zona_general` (solo 'Equipetrol Norte', y ambas filas son 'Equipetrol'). → **Usar siempre `(SELECT DISTINCT nombre, zona_general FROM zonas_geograficas WHERE activo)`**.

### 2.3 Definiciones divergentes de "qué es Equipetrol" (deuda a unificar)

| Definición | Dónde | Estado |
|---|---|---|
| `ZONAS_EQUIPETROL_DB` (6: 5 EQ + 'Eq. 3er Anillo') | `simon-mvp/src/lib/zonas.ts:79` | ✅ correcta (canónica del P0) |
| `ZONAS_EQUIPETROL` (5, **falta 'Eq. 3er Anillo'**) | `lib/mercado-data.ts`, `lib/mercado-alquiler-data.ts` | 🐛 bug |
| allowlist 5 zonas (**falta 'Eq. 3er Anillo'**) | SQL `resumen_mercado()`, `buscar_propiedades()` | 🐛 bug |
| `zonasIncluidas` (5) | `scripts/estudio-mercado/.../config/equipetrol-mayo-2026.ts` | 🐛 falta 3er Anillo |
| varios mapas legacy (`ZONA_DISPLAY`, `ALQUILER_TO_VENTA_ZONA`, `microzonaToZona`) | frontend | a revisar |

El fix de raíz **elimina las listas** (derivar de `zonas_geograficas`), con lo cual el bug del 3er Anillo desaparece por construcción.

---

## 3. Inventario exhaustivo (3 dominios)

Clasificación: `DEBE-SER-EQ` (contaminado) · `PARAMETRIZABLE` (debería aceptar zona y no lo hace bien) · `YA-PROTEGIDO` · `DEBE-VER-TODO` (correcto que vea EQ+ZN, no tocar).

### 3.1 Capa BD

| Objeto | Archivo / def | Clasificación | Nota |
|---|---|---|---|
| `v_mercado_venta` | `sql/migrations/193_vistas_mercado.sql:11` (def viva) | DEBE-SER-EQ (raíz) | filtra solo `zona IS NOT NULL`; no expone `zona_general` |
| `v_mercado_alquiler` | `193_vistas_mercado.sql:41` | DEBE-SER-EQ (raíz) | idem |
| `v_metricas_mercado` | `sql/views/v_metricas_mercado.sql` (def viva confirmada) | DEBE-SER-EQ | `GROUP BY dormitorios, COALESCE(microzona,zona)` sin macrozona → emite filas ZN. Lectores SQL se acotan por zona (ver §4 dudas) |
| `generate_advisor_snapshot()` + tabla `advisor_property_snapshot` | `sql/migrations/220_advisor_property_snapshot.sql` | DEBE-VER-TODO / deuda | 14.429 filas, **0 consumidores en código** (grep). Decidir status aparte, no bloquea |
| `analisis_mercado_fiduciario(jsonb)` | def viva | PARAMETRIZABLE (P2) | bloque 1 usa `buscar_unidades_reales` (respeta `zonas_permitidas`); **bloques 2 y 4 hacen query directa a `propiedades_v2` sin filtro zona** → mezcla. Pero es funnel premium **legacy dormido** |
| `buscar_unidades_reales/simple/alquiler(jsonb)` | `sql/functions/query_layer/`, `alquiler/` | PARAMETRIZABLE | ya aceptan `zonas_permitidas` dentro del `p_filtros jsonb` (lo usa el P0). `buscar_unidades_alquiler` tiene un `CASE` de slugs hardcodeado solo para 7 zonas EQ |
| `resumen_mercado()`, `buscar_propiedades()` | `sql/migrations/030`/`095` | YA-PROTEGIDO (con bug) | allowlist EQ pero de **5 zonas** (falta 3er Anillo) |
| `snapshot_absorcion_mercado()` | `sql/functions/snapshots/` + mig 251/256 | **DEBE-VER-TODO — NO TOCAR** | LOOP global ya blindado a EQ (mig 256); LOOP por-zona genera las 14 series ZN. Filtrarlo rompería ZN |
| `buscar_acm(integer)` | `sql/migrations/226` (def viva) | seguro | cohorte `WHERE zona = zona_de_la_prop` → se acota, NO mezcla |
| `calcular_posicion_mercado(numeric,text,integer)` | def viva | seguro | busca `v_metricas_mercado WHERE zona = p_zona` → se acota |
| `generar_razon_fiduciaria(integer)` | def viva | seguro | encadena por la zona de la prop |
| matching same-zone, HITL `separar_hitl_zona_norte` | mig 251/252/253 | YA-PROTEGIDO | HITL hardcodea string `'Zona Norte'` (no escala — existe `separar_hitl_por_macrozona` candidato) |
| pipeline (merge, enrichment, matching, recálculo) | `sql/functions/` | DEBE-VER-TODO | procesan toda prop, correcto |

### 3.2 Frontend (simon-mvp)

| Superficie | Archivo:línea | Clasificación | Nota |
|---|---|---|---|
| **Home Market Lens** `obtenerMetricasMercado` | `lib/supabase.ts:697` | 🔴 DEBE-SER-EQ (público) | query directa `propiedades_v2` sin filtro zona → `precio/m²` y conteos de la home mezclan EQ+ZN |
| Home `obtenerSnapshot24h` | `lib/supabase.ts:816` | DEBE-SER-EQ | alias legacy 'Equipetrol' posiblemente roto post-mig184 |
| Home `obtenerZonasAlquiler` | `lib/supabase.ts:1789` | DEBE-SER-EQ | sin filtro → lista microzonas ZN |
| Home propertyCount / avgPriceM2 | `lib/landing-data.ts:46,62` | DEBE-SER-EQ | hero inflado con venta ZN |
| `/admin/market` (~9 fetch) | `pages/admin/market.tsx` (KPIs L220, tipologías L278, top L340, oportunidades L517, amenidades L643, antigüedad L959, zona analysis L757, absorción L1004) | DEBE-SER-EQ | leen `propiedades_v2`/`v_mercado_venta` con solo `.not('zona','is',null)`. Header hardcoded L1220 |
| `/admin/market-alquileres` | `pages/admin/market-alquileres.tsx:104,145` + pivot | DEBE-SER-EQ | pivot lista microzonas ZN |
| `obtenerMicrozonas` | `lib/supabase.ts:1667` | ✅ modelo a imitar | whitelist, descarta lo no-EQ |
| `/api/ventas`, `/api/alquileres`, `/api/chat-alquileres` | `pages/api/*` | YA-PROTEGIDO (P0) | default `ZONAS_EQUIPETROL_DB` |
| `ventas.tsx`/`alquileres.tsx` getStaticProps | `pages/*.tsx` | YA-PROTEGIDO (P0) | idem |
| `lib/mercado-data.ts`, `lib/mercado-alquiler-data.ts` | L60/L128 | YA-PROTEGIDO (con bug) | array local de **5 zonas** (excluye 3er Anillo, inconsistente con el feed) |
| `/mercado/equipetrol/*` | `pages/mercado/equipetrol/*.tsx` | PARAMETRIZABLE | copy + Schema.org 100% hardcoded EQ; no existe `/mercado/zona-norte/*` |
| Selectores de zona `/ventas` `/alquileres` | `ventas.tsx`, `alquileres.tsx` | PARAMETRIZABLE | solo slugs EQ; no se puede pedir microzona ZN |
| `resultados-v2.tsx:637` (funnel premium dormido) | — | GAP | sin default EQ → posible leak por URL directa |
| `/admin/alquileres`, `/admin/salud`, `/admin/supervisor/*`, broker CMA | — | DEBE-VER-TODO | correcto |

### 3.3 Scripts / herramientas

| Herramienta | Archivo:línea | Clasificación | Nota |
|---|---|---|---|
| **audit-feed-ventas-mensual** | `scripts/auditoria-feed-ventas/lib/db.mjs:17` | 🔴 DEBE-SER-EQ (cuesta plata) | `v_mercado_venta` sin filtro → Firecrawl sobre 399 props ZN = **~$2 extra/corrida** ($1.75→$3.75) |
| **estudio-mercado `panoramaMercado()`** | `src/tools/panorama-mercado.ts:5` → `src/db.ts:102` | 🔴 DEBE-SER-EQ (cara al cliente) | corre `queryVenta()` sin zona → mete 14 microzonas ZN en el panorama que ve Condado/Proinco |
| audit-feed-alquileres-mensual | `scripts/auditoria-feed-alquileres/lib/db.mjs:21,199,236` | DEBE-SER-EQ | curl, $0 pero contamina reporte |
| audit-feed-ventas/alquileres-semanal | `*.command.md` (checks SQL) | DEBE-SER-EQ | $0, ruido |
| `analisis_alquileres_11q.js` | `scripts/analisis_alquileres_11q.js:63` | DEBE-SER-EQ | `v_mercado_alquiler` sin filtro. **+ 🔒 service_role JWT hardcodeado `:7` → rotar key (fix seguridad aparte)** |
| estudio-mercado tools por-zona (7) | `src/tools/*.ts` | ✅ YA-PROTEGIDO | reciben `config.zona` y filtran bien |
| **baseline multizona** | `src/baseline/db-baseline.ts` (`zonasIncluidas`) | ✅ PATRÓN GOLD-STANDARD | una macrozona = un array de zonas en config. Cero código para Urubó |
| poc-zona-norte, verify-pm-gps, llm-enrichment | `scripts/*` | DEBE-VER-TODO / N-A | ZN-native o por-ids |
| generate-condado-pdf, check_ga4_metrics.py | — | NO-APLICA | leen Markdown / leads, no mercado |

---

## 4. Dudas verificadas contra la BD (afinan el scope)

| Duda | Veredicto (verificado 1-jun) | Efecto |
|---|---|---|
| `buscar_acm` (CMA) | cohorte `WHERE zona = zona_de_la_prop` → **no mezcla** | sale del scope |
| `calcular_posicion_mercado` | `v_metricas_mercado WHERE zona = p_zona` → **se acota** | sale del scope |
| informe PDF / razón fiduciaria | encadenan por la zona de la prop → **seguro por construcción** | el informe a cliente **no se contamina** |
| `advisor_property_snapshot` | 14.429 filas, **0 consumidores en código** | deuda, no bloquea |
| `analisis_mercado_fiduciario` | bloques 2/4 mezclan, pero **legacy dormido** | P2 |
| **`obtenerMetricasMercado` (home Market Lens)** | query directa sin filtro zona, **público** | 🔴 sube de prioridad |

**Conclusión del afinamiento:** el camino fiduciario/CMA por-propiedad NO requiere cambios (el revisor lo había marcado P0/P1 — falsa alarma). Lo realmente urgente es **público**: home Market Lens + dashboards admin, más lo caro (audit-mensual Firecrawl) y lo cara-al-cliente (estudio panorama).

---

## 5. Solución (2 piezas + SSOT)

> El revisor eliminó la "Pieza C" del diseño original (parámetro `p_macrozona` en las RPC): las 4 RPC reciben un único `p_filtros jsonb` que **ya tiene `zonas_permitidas`** (lo usa el P0). No hay que tocar firmas SQL — solo traducir macrozona → lista de nombres y pasarla.

### Pieza A — Columna `zona_general` en las vistas de mercado
`CREATE OR REPLACE VIEW v_mercado_venta` / `v_mercado_alquiler` agregando:
```sql
LEFT JOIN (
  SELECT DISTINCT nombre, zona_general
  FROM zonas_geograficas
  WHERE activo = TRUE
) zg ON zg.nombre = p.zona
```
- `LEFT` (fail-safe): zona nueva sin fila → `zona_general = NULL`, la prop no desaparece.
- `DISTINCT` colapsa el doble polígono 'Equipetrol Norte' (verificado: no infla conteos).
- Columna **aditiva** → no rompe consumidores actuales. Habilita `WHERE zona_general='Equipetrol'` a todo lector de la vista (4 skills audit + `analisis_11q` + queries ad-hoc).

### Pieza B — Helper de derivación (el corazón)
Para consumidores que van a `propiedades_v2` **directo** (dashboards admin, home, estudio panorama), donde la columna de la vista no llega:
- **SQL:** `macrozona_de(text) RETURNS text` → `SELECT zona_general FROM zonas_geograficas WHERE nombre = $1 AND activo LIMIT 1`.
- **TS/scripts:** `getZonasDeMacrozona(macrozona)` → `SELECT nombre FROM zonas_geograficas WHERE zona_general = $1 AND activo`.

### SSOT único
Todo deriva de `zonas_geograficas`. Se **borran** las listas hardcodeadas (arrays de 5 en `mercado-data.ts`/`mercado-alquiler-data.ts`, allowlists SQL). `ZONAS_EQUIPETROL_DB` (la de 6, correcta) queda como conveniencia de tipado en frontend. Nuevo `/api/zonas` que lee `zonas_geograficas` para los selectores. **El bug del 3er Anillo desaparece por construcción.**

> **Rechazado:** columna `zona_general` denormalizada en `propiedades_v2`. Exigiría tocar el trigger de asignación de zona (Regla 7) + backfill de ~1000 filas → más riesgo sobre el pipeline nocturno EQ, sin ganancia (el JOIN es contra 21 filas, costo nulo).

---

## 6. Fases (orden por riesgo/urgencia)

> **Leyenda:** `[SQL-H]` = SQL, lo aplica el humano desde Supabase UI (MCP readonly). `[COD-C]` = código, lo edita Claude.
> **Regla 7 obligatoria:** `pg_get_functiondef`/`pg_get_viewdef` de la def viva antes de cada `CREATE OR REPLACE`.

### FASE 0 — Cimiento BD (BLOQUEANTE)
- [ ] `[SQL-H]` Exportar def viva de `v_mercado_venta` y `v_mercado_alquiler`.
- [ ] `[SQL-H]` Migración `257_zona_general_en_vistas.sql` (usar `sql/migrations/_template.sql` con GRANTs): columna `zona_general` en ambas vistas (LEFT JOIN DISTINCT) + función `macrozona_de(text)` + GRANT EXECUTE a `anon, authenticated, service_role, claude_readonly`.
- [ ] Verificación de paridad (§7).

### FASE 1 — Stop the bleed: público + caro + cara-al-cliente
*(todo depende de F0; paralelos entre sí)*
- [ ] `[COD-C]` **Home Market Lens**: `lib/supabase.ts` `obtenerMetricasMercado` (L697), `obtenerSnapshot24h` (L816), `obtenerZonasAlquiler` (L1789); `lib/landing-data.ts` (L46, L62) → filtrar a EQ. **Público.**
- [ ] `[COD-C]` **audit-feed-ventas-mensual** `lib/db.mjs:17` → `.eq('zona_general','Equipetrol')`. Corta ~$2 Firecrawl/corrida.
- [ ] `[COD-C]` **estudio-mercado `panoramaMercado`**: `db.ts queryVenta()` acepta `zonasIncluidas` (patrón `db-baseline.ts:89` `isZonaValida`). Cara al cliente.
- [ ] `[COD-C]` audit-feed-alquileres-mensual `lib/db.mjs:21,199,236` + 4 `*.command.md` semanales.
- [ ] `[COD-C]` `analisis_alquileres_11q.js` → filtrar EQ (el fix de seguridad del JWT va aparte, ver §9).

### FASE 2 — Descontaminar dashboards admin
*(depende de F0)*
- [ ] `[COD-C]` `/admin/market.tsx` — los ~9 fetch → `.eq('zona_general','Equipetrol')`. **No tocar** la lectura de `market_absorption_snapshots` con `zona='global'` (ya es EQ-only). Header sigue "Equipetrol Market Pulse".
- [ ] `[COD-C]` `/admin/market-alquileres.tsx` — `fetchRentalData`/`fetchVentaData` + pivot.
- [ ] `[SQL-H]` `v_metricas_mercado` — agregar `zona_general` (mismo JOIN) por si algún lector agregado lo necesita. (Sus lectores SQL ya se acotan por zona, así que es defensivo.)
- [ ] ⚠️ **Comunicar al director**: al filtrar EQ, los KPIs de `/admin/market` **van a cambiar** (hoy incluyen 399 props ZN). Es una *corrección*, no un bug.

### FASE 3 — Unificar SSOT
*(3a bloquea 3b)*
- [ ] `[SQL-H]` `resumen_mercado()`, `buscar_propiedades()` — reemplazar allowlist de 5 zonas por subselect `zona_general='Equipetrol'`. **Corrige el bug 3er Anillo en BD.**
- [ ] `[COD-C]` Borrar `ZONAS_EQUIPETROL` (5) de `mercado-data.ts:60` y `mercado-alquiler-data.ts`; importar `ZONAS_EQUIPETROL_DB` o filtrar por columna `zona_general`.
- [ ] `[COD-C]` Nuevo `/api/zonas` (lee `zonas_geograficas`) + helper `getZonasDeMacrozona()` para scripts.
- [ ] `[COD-C]` `estudio-mercado` config `equipetrol-mayo-2026.ts` → agregar 'Eq. 3er Anillo' o derivar de helper.

### FASE 4 — Exponer ZN/microzona (parametrización)
*(depende de F0 + 3c)*
- [ ] `[COD-C]` Traducción macrozona→`zonas_permitidas` en los callers de `buscar_unidades_*` (NO se tocan firmas SQL). Generalizar el `CASE` de slugs EQ de `buscar_unidades_alquiler`.
- [ ] `[COD-C]` Selectores de zona `/ventas` y `/alquileres` consumen `/api/zonas` → ofrecen macrozona + microzonas. Default explícito sigue siendo Equipetrol.
- [ ] `[COD-C]` `resultados-v2.tsx:637` — default EQ explícito (cierra leak legacy).

### FASE 5 — Cierres future-proof
- [ ] `[SQL-H]` HITL `separar_hitl_zona_norte` → `separar_hitl_por_macrozona` genérico (no bloqueante).
- [ ] `[COD-C]` Documentar regla SSOT en `CLAUDE.md` (§8).
- [ ] Smoke-test Urubó (staging): insertar fila `zona_general='Urubó'` en `zonas_geograficas` y confirmar que vistas/RPC/scripts la recogen sin cambio de código.

---

## 7. Plan de verificación (paridad EQ diff=0 + ZN pedible)

### Fase 0
```sql
-- Conteo por macrozona (esperado venta EQ=384/ZN=399, alq EQ=143/ZN=105)
SELECT zona_general, COUNT(*) FROM v_mercado_venta GROUP BY 1;
SELECT zona_general, COUNT(*) FROM v_mercado_alquiler GROUP BY 1;
-- Anti-duplicación: total con columna == baseline pre-migración
SELECT COUNT(*) FROM v_mercado_venta;
-- Cero zonas sin clasificar
SELECT COUNT(*) FROM v_mercado_venta WHERE zona_general IS NULL AND zona IS NOT NULL;  -- esperado 0
-- Helper coincide con la columna
SELECT COUNT(*) FROM v_mercado_venta WHERE zona_general IS DISTINCT FROM macrozona_de(zona);  -- esperado 0
```

### Fases 1-2
- Snapshot de KPIs/Market Lens **antes** del cambio; tras filtrar EQ, los números EQ no se mueven (solo se excluye ZN que contaminaba). Documentar el delta para el director.
- `audit-ventas-mensual`: set de props a scrapear baja de ~783 a 384 (0 props ZN en Firecrawl).
- `panorama` EQ idéntico al previo; con `macrozona='Zona Norte'` aparece ZN y EQ ausente.

### Fase 3
- `SELECT nombre FROM zonas_geograficas WHERE zona_general='Equipetrol' AND activo` == `ZONAS_EQUIPETROL_DB` (6 zonas, incluye 3er Anillo).

### Fase 4
- `buscar_unidades_*` sin macrozona == resultado actual (regresión cero).
- con macrozona='Equipetrol' == universo 384 venta; con 'Zona Norte' devuelve ZN; con microzona 'Sirari' solo Sirari.

### Fase 5
- Smoke Urubó: `/api/zonas` y los selectores reconocen la nueva macrozona sin tocar código.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper el snapshot de absorción | NO se toca. La columna vive en las vistas, que el snapshot no consume. Verificar serie `zona='global'` sin cambios post-F2 |
| Romper el feed EQ producción | Columna aditiva; todo filtro EQ es **default explícito**; paridad diff=0 obligatoria por fase; `pg_get_*` antes de cada `CREATE OR REPLACE` |
| Doble polígono 'Equipetrol Norte' | `SELECT DISTINCT nombre` en el subselect. INNER JOIN naíve PROHIBIDO |
| Defaults implícitos → leak ZN | Toda superficie EQ-only filtra `zona_general='Equipetrol'` explícito; `LEFT JOIN` deja `NULL` visible (no silencioso); cerrar gap `resultados-v2.tsx:637` |
| KPIs admin "cambian" | Comunicarlo como corrección al director (hoy incluyen 399 props ZN) |
| Migraciones locales desactualizadas | def viva = fuente de verdad (Regla 7); humano aplica el SQL |
| Drift futuro de "qué es EQ" | SSOT única en `zonas_geograficas`; borrar listas hardcodeadas; documentar en CLAUDE.md |

---

## 9. Fuera de scope (tickets aparte)

- **Parametrizar las 4 skills de audit por macrozona** (`--macrozona="Zona Norte"`, default Equipetrol): hoy están fijadas a `'Equipetrol'` por diseño. Decisión 1-jun-2026: dejarlas solo-EQ. La base ya está lista (`zona_general`), parametrizar es un cambio chico. Hacer **cuando la data de ZN madure** (matching hoy ralo ~23-60% → un audit ZN daría ruido por data inmadura, no por bugs).

- **Exponer públicamente ZN con SEO** (`/mercado/zona-norte/*`, copy + Schema.org indexado): **ticket #6**. Este plan solo hace ZN *pedible* internamente y por selector.
- **🔒 Rotar el service_role JWT hardcodeado** en `scripts/analisis_alquileres_11q.js:7` (rotar en Supabase + mover a `.env` + purgar de git): **fix de seguridad urgente e independiente** del refactor de zonas.
- **`advisor_property_snapshot`**: decidir si es EQ-only o multi-macrozona cuando aparezca un consumidor. Hoy sin consumidor → deuda.
- **`analisis_mercado_fiduciario`** (funnel premium legacy dormido): parametrizar bloques 2/4 solo si se reactiva el funnel.

---

## 10. Future-proof honesto — Urubó NO es "cero código"

Agregar una macrozona será **"bajo código"**, no "cero código". Con SSOT en `zonas_geograficas`, lo automático es: vistas, `macrozona_de`, `resumen_mercado`/`buscar_propiedades`, audits, panorama, `/api/zonas`. **Igual hay que tocar:**
- `buscar_unidades_alquiler` — el `CASE` de slugs UI→BD (o refactor a tabla).
- `lib/zonas.ts` — labels/slugs/labelCorto son **contenido editorial**, no derivable de la BD.
- Selectores UI + copy + Schema.org de las landings por macrozona.
- Config editorial del estudio/baseline de la nueva macrozona.

---

## Apéndice — Archivos clave (paths absolutos)

- `sql/migrations/193_vistas_mercado.sql` — def de referencia de las 2 vistas.
- `sql/migrations/_template.sql` — plantilla obligatoria para mig 257 (GRANTs).
- `sql/migrations/255_snapshot_absorcion_v4_dinamico.sql` — **blueprint multi-macrozona descartado** (referencia de diseño del patrón `FOR macrozona IN SELECT DISTINCT zona_general...`).
- `scripts/estudio-mercado/src/baseline/db-baseline.ts` — patrón gold-standard `zonasIncluidas`/`isZonaValida`.
- `simon-mvp/src/lib/zonas.ts:79` — `ZONAS_EQUIPETROL_DB` (SSOT frontend).
- `simon-mvp/src/lib/supabase.ts:1667` — `obtenerMicrozonas` (modelo de filtrado a imitar).
- `simon-mvp/src/pages/admin/market.tsx` — mayor superficie contaminada del frontend.
