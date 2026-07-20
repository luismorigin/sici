# Backlog — Auditoría de descripciones drift

> ⚠️ **ALCANCE (19-jul-2026):** este backlog existe porque el pipeline **n8n nunca lee el anuncio**. El **flujo
> híbrido SÍ lo lee al ingerir** y ya trae sus propias skills (`/audit-deptos-shadow` = drift, `/audit-cola-shadow`
> = matching+dedup). Al cutover, buena parte de lo planificado acá queda **redundante para deptos-Equipetrol**
> (sigue valiendo para ZN, casas y otras zonas). **Revisar antes de invertir horas.**

Pendientes detectados en la sesión del 2026-05-08. Ordenados por valor / urgencia.

---

## ⭐ EN CURSO — Migrar el audit de ventas a fetcher directo ($0, sin Firecrawl) (29-jun-2026)

**Qué intento:** el audit mensual de ventas usa Firecrawl (paga, ~$1.75 EQ / ~$3.90 EQ+ZN, 1 request por prop en la Capa 1). El flujo híbrido de Zona Norte ya recupera descripciones **gratis** con `fetch()` directo (`scripts/sonda-suelo/lib/`): C21 vía `?json=true`, Remax vía atributo `data-page`. La meta es reemplazar Firecrawl por ese fetcher → **audit mensual a $0**.

**Skill de prueba creada:** `/probar-fetcher-ventas` (`fetch-test.mjs` + `.command.md`). Read-only, $0, **aislada** del audit mensual (que sigue intacto con Firecrawl). Toma una muestra del feed, trae la descripción con el fetcher directo y la compara contra la cruda de BD (éxito + similitud). Reusa `sonda-suelo/lib/{fetcher,portales}.mjs` + `auditoria-feed-ventas/lib/db.mjs`.

**Validado (smoke):** 4/4 props, 100% éxito, $0 (C21 sim 100%, Remax 98.3%).

**Pendiente:**
1. Correr `/probar-fetcher-ventas --n 50` (sobre todo `--fuente remax`, el más dudoso por ser SPA) para confirmar con muestra grande.
2. Si da ✅: migrar `audit-feed-ventas-mensual.mjs` Capa 1 — reemplazar `lib/firecrawl.mjs` por el fetcher directo y adaptar `lib/extractor.mjs` (hoy parsea HTML de Firecrawl) para leer la descripción directa del JSON.

**Riesgo:** Firecrawl absorbe el anti-bot; el fetcher directo depende de que `?json=true`/`data-page` sigan abiertos (hoy lo están, el híbrido los usa a diario). Mitigado con el circuit breaker de `fetcher.mjs`.

### Otras mejoras de esta sesión (29-jun) ya aplicadas
- **`--macrozona`** (`equipetrol` default | `zona-norte` | `todas`): alcance seleccionable, filtrado en las 3 capas. Cierra el bug de contaminación ZN (ticket #15) que mezclaba EQ+ZN sin querer.
- **Detector de cambio de precio en portal** (Capa 1): compara el precio del texto viejo vs el del portal, piso 1% graduado por tamaño. Caza rebajas/subas que el check de Capa 2 no veía (compara contra cruda vieja). Caveat: fantasma Remax + reformulación de TC ≠ rebaja → lectura humana.

---

## ⭐ PLAN — Upgrade auditoría de matching: del regex-juez al LLM-juez (hallazgos 17-jun-2026)

**Contexto:** auditando la cola de matching de Zona Norte con un agente que **LEE los anuncios**, se encontraron **~58 falsos positivos del motor** (score 90-95) que el score/GPS/token NO detectaban. Ej: "CONDOMINIO ONE" (pm 359) atrae cualquier "Condominio X"; "Macororó 15" vs "19" (cluster numerado). Detalle: memoria `project_matching_zn_aprobacion_16jun2026`.

**Principio del upgrade:** el regex/token deja de ser el **juez** y pasa a ser el **filtro**; el juez es la **lectura del anuncio (LLM)** en los dudosos. Costo marginal — el LLM solo toca los flaggeados (hoy ~165k tokens para 145 sugerencias). Las skills NO tocan datos (read-only) → riesgo a producción bajo; el riesgo es de calibración → hacerlo **INCREMENTAL** (una skill, una mejora, validar sobre ventana real, extender).

### Transversal — las 4 skills (capa 3 / matching)
- **(A) Juez LLM para dudosos** ⭐ EMPEZAR ACÁ (semanal ventas, check 3.1): cuando el regex marque `mismatch_real`/`no_disponible`/`prefijo_ambiguo`, escalar SOLO esos a un agente que lee el anuncio y decide con el número exacto.
- **(B) Check de número en clusters**: `normalizeNombre` (matching-checks.mjs:128-129) borra romanos y es frágil con arábigos → "Macororó 15"≠"19". Check dedicado sin normalizar el número. (4 de 8 FP de hoy.)
- **(C) Confianza compuesta**: cruzar nombre-en-anuncio + GPS≤80m + sin-vecino-ambiguo (hoy: ninguna señal sola alcanza).
- **(D) Skill separada `/audit-cola-matching`** ✅ **CONSTRUIDA 19-jun-2026** en `scripts/auditoria-cola-matching/` (instalada en `.claude/commands/audit-cola-matching.md`). DECISIÓN: skill aparte, NO modo dentro de las skills de feed — la cola y el feed son problemas opuestos. Arquitectura híbrida blindada: el `.mjs` (`lib/db.mjs` cola+haversine, `lib/lector.mjs` doble fetcher C21 `?json=true`/Remax `data-page`, `lib/atractores.mjs` pre-filtro) hace lo mecánico y **ORDENA** la cola; el **VEREDICTO lo dan subagentes-lectores (juez LLM)**, nunca el script — el `.command.md` lo deja explícito como principio rector para que no degrade a clasificador automático. Genera SQL (UPDATE directo + candado `IS NULL` + temp tables + `metodo_match='auditor_cola_*'`), no auto-aplica (read-only). Multi-macrozona (`--macrozona=` → `pendiente_<slug>`). Smoke tests OK: lector extrae C21+Remax end-to-end (Remax en español vía `data-page`, sin WebFetch), pre-filtro clasifica bien atractor/cluster/sin-nombre sobre los casos reales de hoy. **MEJORA detectada 19-jun (validando en Eq):** el lector solo mira el anuncio EN VIVO, pero `datos_json_enrichment.llm_output->>'nombre_edificio'` de la BD es una fuente GRATIS (el LLM nocturno ya leyó el anuncio, a veces con más texto del que el portal muestra hoy). Caso 1917: el anuncio en vivo daba desc cortísima sin nombre, pero el `llm_output` ya tenía "Torres Sirari". → `lib/db.mjs` debe traer también `col_nombre_edificio` + `enr_nombre` + `llm_nombre` + slug de URL + `titulo`/`subtitulo` del discovery, y pasárselos al juez como pistas además del anuncio en vivo. (Verificado: de 14 sin-match en Eq, 13 no tienen nombre en NINGUNA fuente — broker publicó genérico; solo 1917 lo tenía vía llm_output.) Pendiente: correrla sobre cola ZN con datos > 0 (hoy ZN=0). Método **VALIDADO ad-hoc 19-jun-2026 sobre `pendiente_zona_norte` (33 sug / 25 props): agente-lector cazó 16 FP del motor (incl. score 95 Galil Parque III, atractor ONE→Brickell II); solo 4/25 eran correctos por nombre exacto. Cola 33→0.** Aprendizajes para empaquetar la skill: (1) el lector debe usar el **doble fetcher** — C21 `?json=true` (ok) y Remax `data-page` Inertia vía `curl` (WebFetch falla con la SPA); (2) **candado `IS NULL` imprescindible** (5/25 ya estaban correctas, el motor sugería pm equivocado encima); (3) **lectura + GPS combinados** > cualquiera solo (GPS rescató Vilareal que el lector rechazaba por sufijo; lectura cazó FP de score alto); (4) genera SQL para revisión humana, NO auto-aplica (mantiene read-only); (5) pre-filtro detector de atractores (pm con N sug fuzzy sin que su nombre aparezca en desc). Patrón de match aplicado: `metodo_match='auditor_agente_<fecha>[_pm_nuevo|_nombre]'`. Detalle: memoria `project_matching_zn_aprobacion_16jun2026`.

### Específico por skill
- **Mensual ventas**: detector de **ATRACTORES** (pm con N sugerencias `fuzzy_nombre` sin que su nombre aparezca en ninguna desc → CONDOMINIO ONE pm 359) + auditar muestra de **auto-aprobados** score≥85 con LLM (ahí se cuelan FP en Equipetrol, porque auto-aprueba directo al feed sin lectura).
- **Alquileres semanal/mensual**: LLM **aún más necesario** (`nombre_edificio` suele NULL → el regex no tiene con qué comparar) + validar los genéricos "Monoambiente · microzona" del helper `nombreAlquiler` (¿el anuncio sí nombra un edificio que se perdió? = match perdido **escondido** por el genérico).
- **Semanal ventas**: detector de **GPS corrupto** (props que comparten una misma coord errada, como las 5 de hoy: 2163/2242/2256/2260/2548).

### Causa raíz a atacar en paralelo (reduce lo que la auditoría debe cazar)
Bug en `generar_matches_fuzzy`: compara palabras ≥4 letras SIN excluir genéricos → pm con distintivo ≤3 letras (ONE/ITO/SKY/ZEN/ARA) colapsa a `[condominio]` y atrae todos. **Fix: stopwords + umbral ≥3.** Toca matching producción → ticket separado con test (afecta también Equipetrol).

**Orden de ataque:** (A) en semanal ventas → validar → (B)(C) → extender a alquileres → mensual (atractores + auto-aprobados) → fix raíz fuzzy.

---

## 🔥 Alta — bugs en sistema productivo

### 1. Verificador del pipeline tiene gap "HTTP 200 OK con HTML vacío"

C21 sirve listings inactivos con HTTP 200 + HTML esqueleto sin descripción ni meta tags. El verificador actual chequea 404/302 pero no este caso. Resultado: listings muertos quedan como `status='completado'` y siguen apareciendo en feed hasta que un humano los detecta.

**Casos detectados manualmente** (5 props del audit + 2 anteriores): #172, #497, #629, #888, #1141, #1142, #1143.

**Estado: bloqueado por bug secundario en el flujo legacy del verificador**. Test corrido el 2026-05-08 reveló que el nodo `UPDATE inactivo_confirmed` tiene hardcoded `status='inactivo_confirmed'` — ignora el `newStatus` que setea el código JS de "Procesar respuesta". Por eso el flujo no diferencia entre `pending` y `confirmed`, va siempre directo a `confirmed`.

**Para retomar este punto necesitarás 3 cambios**:

a) **Modificar `Procesar respuesta`** — bloque C21 con detector HTML vacío. Código completo de v2.1 ya redactado (ver historial de la sesión 2026-05-08, resumido en este archivo).

b) **Modificar `UPDATE inactivo_confirmed` para que sea dinámico**:
```sql
UPDATE propiedades_v2
SET
  status = '{{ $json.newStatus }}'::estado_propiedad,
  es_activa = CASE WHEN '{{ $json.newStatus }}' = 'inactivo_confirmed' THEN FALSE ELSE es_activa END,
  fecha_inactivacion = CASE
    WHEN '{{ $json.newStatus }}' = 'inactivo_confirmed'
    THEN COALESCE(primera_ausencia_at, NOW())
    ELSE fecha_inactivacion
  END,
  primera_ausencia_at = CASE
    WHEN '{{ $json.newStatus }}' = 'inactivo_pending' AND primera_ausencia_at IS NULL
    THEN NOW()
    ELSE primera_ausencia_at
  END,
  razon_inactiva = '{{ $json.razonInactiva }}',
  fecha_actualizacion = NOW()
WHERE id = {{ $json.id }}
RETURNING id, url, status, fecha_inactivacion, primera_ausencia_at, razon_inactiva,
  '{{ $json.action }}' as action,
  '{{ $json.razonInactiva }}' as "razonInactiva",
  '{{ $json.origen }}' as origen,
  '{{ $json.fuente }}' as fuente;
```

c) **Re-test con SQL de revert** (solo si retomás mañana — si pasaron varios días, los IDs pueden ser otros):
```sql
-- Revertir las 5 muertas de vuelta a completado para re-test
UPDATE propiedades_v2
SET status = 'completado'::estado_propiedad,
    es_activa = TRUE,
    fecha_inactivacion = NULL,
    primera_ausencia_at = NULL,
    razon_inactiva = NULL,
    fecha_actualizacion = NOW()
WHERE id IN (629, 888, 1141, 1142, 1143);
```

**NOTA**: las 5 props (#629, 888, 1141, 1142, 1143) ya quedaron en `inactivo_confirmed` por el test fallido del 2026-05-08. **El estado final es correcto** (están realmente muertas), solo que llegaron por el camino equivocado. NO hace falta revertirlas a menos que se quiera re-testear el flujo `pending → confirmed`.

**Workflow duplicado para retomar**: `C:\Users\LUCHO\Downloads\Flujo C - Verificador Venta v2.0.0 copy.json` (en Downloads del user, no commiteado).

Ubicación del original: `n8n/workflows/modulo_1/flujo_c_verificador_v2.0.0.json`

**Riesgo concreto del fix** (re-evaluado con datos del sistema actual):
- Falsos positivos son **self-healing en <24h** porque `registrar_discovery` reactiva `inactivo_pending` → `actualizado` (`completado`) cuando vuelve a encontrar la URL en el portal (ver `sql/functions/discovery/funciones_auxiliares_discovery.sql:116-118`).
- Bajo riesgo total dado el self-healing.

**Alternativa si no se quiere tocar verificador**: el audit mensual ya detecta listings muertos (vía Firecrawl scraped vacío). Costo: hasta 30d de delay en marcarlos. Tasa observada: ~0.7%/mes (2-3 props/mes).

---

### 2. Admin no infiere `tipo_cambio_detectado` desde descripción

`usePropertyEditor.ts:810-839` solo actualiza `tipo_cambio_detectado` si el usuario toca el dropdown "tipo_precio". Si solo edita el precio o la descripción y la descripción menciona "paralelo" / "TC del día", el campo queda con el valor anterior (a veces NULL → feed muestra precio sin TC paralelo aplicado).

**Impacto medido**: con TC paralelo en 9.954 (vs oficial 6.96), una prop con descripción de paralelo y TC=NULL muestra el precio en feed **subestimado un 43%**. Casos detectados: #317, #428, #1689 (todos fueron corregidos manualmente en esta auditoría).

**Acción posible**: cuando el editor guarda una descripción, ejecutar una heurística (regex o LLM) que detecte "paralelo" / "oficial" en la descripción y sugiera el TC al usuario en el dropdown.

---

## 🟡 Media — automatización del audit

### 3. ~~Workflow nightly~~ → **Skill `/audit-feed-ventas-mensual`** ✅ implementada

Decisión final: en vez de workflow n8n o routine remota, **slash command local** que el usuario invoca 1 vez al mes desde su Claude Code. Razones:
- Cero infra adicional (sin n8n, sin routine remota, sin GitHub Action)
- Análisis humano incluido (Claude lee output y filtra ruido conocido)
- Costo Firecrawl: $1.75/mes (350 props × $0.005)
- Acceso directo al .env.local (Firecrawl + Supabase keys)

**Componentes implementados** (commit en este branch):
- `audit-feed-ventas-mensual.mjs` — orquestador que corre 3 capas + persiste a Supabase
- `audit-matching.mjs` — capa 3 (audit de matching usando alias_conocidos)
- `lib/matching-checks.mjs` — lógica de check matching
- `lib/internal-checks.mjs` — capa 2 afinada (de 118 → 18 issues, 6.5x menos ruido)
- `lib/extractor.mjs` — agregada extracción de title del HTML
- `audit-feed-ventas-mensual.command.md` — instrucciones de la skill (copiar a `.claude/commands/audit-feed-ventas-mensual.md`)
- `sql/migrations/242_audit_descripciones.sql` — persistencia (tablas + RLS + view de tendencias)

**Activación — ✅ COMPLETADA (verificado 2026-05-25)**:
- ✅ Migración `242` aplicada en Supabase (existen `audit_descripciones_runs`, `audit_descripciones_items`, `audit_descripciones_tendencias`)
- ✅ Migración `244` aplicada (columna `tipo_operacion` en runs/items)
- ✅ Las 4 skills instaladas en `.claude/commands/`: `audit-feed-ventas-mensual`, `audit-feed-ventas-semanal`, `audit-feed-alquileres-mensual`, `audit-feed-alquileres-semanal`
- ✅ Audits **en uso recurrente** (NO es pendiente): mensual corrido el 8-may con correcciones reales aplicadas al feed (ver `reports/AUDIT_LOG.md`) + reportes mensuales 11-may + skills semanales iteradas hasta **v1.4 (25-may)**. La tabla `audit_descripciones_runs` muestra pocas filas porque las corridas semanales NO persisten por diseño.

---

### 4. Refinar `audit-internal.mjs` con patterns reales detectados

El audit interno actual tira 118 issues con mucho ruido (34% del feed). Con lo aprendido en esta sesión, refinar:

**`precio_mismatch_desc`**:
- Filtrar precios cerca de "Precio:" / "Costo:" / "$us" no cualquier número
- Tolerar diferencias explicables por TC paralelo (ratio 1.43)
- Quitar el "precio principal = mayor número" — usar primer precio cerca de keyword

**`edificio_mismatch`**:
- Solo flag si la descripción menciona explícitamente OTRO nombre de edificio (regex `Edif(?:icio)?\.? \w+`), no si simplemente no lo menciona

**Quitar `precio_actual_vs_original`**:
- Es esperable cuando admin edita precio manualmente. No es señal de bug.

Estimación: pasaría de 118 issues a ~30-40 con señal limpia.

---

## 🟢 Baja — mejoras de calidad de vida

### 5. Sync automático entre `contenido.descripcion` y `enrichment.descripcion`

Hoy vimos que el merge nocturno (v2.6.0) ya hace este sync, pero updates manuales del admin lo rompen. Propuestas:

- Trigger Postgres que mantenga ambos campos en sync
- O simplemente: que admin actualice ambos al guardar (modificar `usePropertyEditor.ts:755`)

### 6. Tabla `auditoria_descripciones` en Supabase (futuro)

Si el workflow nightly se vuelve recurrente, conviene persistir hallazgos en BD para timeseries:
- ¿Qué props son drift recurrente?
- ¿Qué brokers actualizan más?
- Patrones de cambio (tipo de drift por edificio/zona)

Solo accionable cuando el workflow nightly esté en producción.

### 7. Audit similar para feed `/alquileres`

El audit actual cubre solo `/ventas` (`v_mercado_venta`).

**Pre-requisitos cubiertos (9 May 2026):** la descripción cruda del agente ya se persiste en `datos_json_enrichment.descripcion` para alquiler — misma key que venta. Migración 243 + workflow `Enrichment LLM Alquiler v2.1.0` en producción.

**Trabajo restante (chico):**
- Clonar `lib/db.mjs` cambiando `v_mercado_venta` → `v_mercado_alquiler`.
- Ajustar selectores de precio (`precio_norm` → `precio_mensual` o `precio_mensual_bob` según convenga).
- El extractor por fuente (Remax data-page, C21 og:description, BI block-body) ya está implementado en el workflow productivo — el audit solo necesita re-scrapear y comparar contra `datos_json_enrichment.descripcion` igual que ventas.
- Skill nuevo `/audit-feed-alquileres-mensual` análogo al de ventas.

**Caveat:** el primer audit de alquileres tendrá un % alto de "sin descripción en BD" para las ~146 props pre-9-May (no se hizo backfill — opción A). A medida que esas props caigan del feed por antigüedad o se re-procesen, la cobertura sube.

---

## Datos de referencia

### Props procesadas en esta sesión

- Total feed auditado: ~350 props
- Listings inactivos detectados: 7 (5 nuevos + 2 ya marcados)
- Cambios de precio reales corregidos: 9
- Caso crítico TC mal mapeado: 2 (#317 La Riviera, #428 Las Palmeras)
- Cambios menores corregidos: 25
- Cosméticos sin acción: 11
- Descripciones sincronizadas internamente (admin↔enrichment): 21
- Props blindadas con candado: 14

### Costos

- Firecrawl total: ~$1.65 (350 props × $0.005 + verificaciones)
- Reportes guardados en `reports/` (no se commitean por defecto, solo `.gitkeep` y `AUDIT_LOG.md`)

### Reportes generados

- `reports/2026-05-08-00-17-07/` — Batch 1 (50 props más viejas)
- `reports/2026-05-08-01-28-22/` — Batch 2 (50 siguientes)
- `reports/2026-05-08-14-41-17/` — Batch 3 (252 restantes, con bug waitFor)
- `reports/2026-05-08-15-06-55/` — Re-run 41 props con waitFor 5000
- `reports/2026-05-08-15-14-31/` — Re-run 19 props con drift
- `reports/2026-05-08-16-51-27/` — Verificación 25 correcciones
- `reports/internal-2026-05-08-14-30-54/` — Audit interno SQL (118 issues)
- `reports/AUDIT_LOG.md` — Bitácora de acciones aplicadas
