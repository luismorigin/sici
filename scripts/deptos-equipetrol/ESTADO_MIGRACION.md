# Migración deptos Equipetrol al híbrido — ESTADO y mapa de estrangulamiento

> Actualizado: 2026-07-10 (checkpoint fin del día, abajo). Contexto: Bloque 3 del plan strangler (ver
> `docs/arquitectura/PLATAFORMA_HIBRIDA_GENERICA.md`, sección 15 = mapa del cutover).
> Memoria: `project_checkpoint_deptos_hibrido`.
> Contrato técnico: `CONTRATO_FEED.md` · Reglas del lector: `READER_SPEC.md` (v4).

## ✅ CHECKPOINT 10-jul (fin del día) — leer esto para retomar

Estado al cierre de la rama `feat/deptos-hibrido-shadow` (local, sin push):

- ✅ **Auditoría de candados HECHA** — el Freno 1 era humo: el cutover solo re-aplica 2 matchings
  (2696/2714); 27/36 diffs son TC → van al Paquete TC.
- ✅ **Discovery 0.005 VALIDADO** — 464 props en 6 microzonas > 444 de n8n (fix STEP 0.005, `ce1e2fe`).
- ✅ **Reader validado EXHAUSTIVO → spec v4** — ~193 props (100 ciegas + 93 re-leídas), **convergió**
  (0 edges nuevos en 10 lotes, 0 alucinaciones). Las 4 reglas v4 están en `READER_SPEC.md`.
  Método anti-drift que funcionó: congelar spec → material local → subagentes-lectores → loop-until-dry.
- **Shadow = 188 props TODO en v4**; feed verificado en `localhost:3000/ventas?shadow=1`
  (158 props, precios sin inflar). 2697 (alquiler colado) fue sacado.
- **Cuello real = IP**: C21 residencial rate-limita ~2 lotes/100 desde la laptop; en prod el fetch
  corre desde infra, no laptop.
- 🔴 **FALTA**: barrer ~271 props restantes (fetch con IP fresca) · fix del cargador
  `parqueo_incluido` · id definitivo para las nuevas (secuencia en prod) · verificador integrado
  (incremento 3) · Paquete TC (al cutover los paralelo/bob BAJAN ~34% — esperado, no bug) ·
  bug C21-BOB-con-moneda-USD ya RESUELTO (regla en `READER_SPEC.md` §"Fallback C21 sin precio").

*(La sección 15.7 de PLATAFORMA_HIBRIDA_GENERICA quedó desactualizada respecto a este checkpoint:
sus ítems 1 y 2 ya están hechos.)*

## 1ª corrida E2E post-handoff (2026-07-05)

Prueba en vivo "que corre": `--prep 50` detectó **8 diferenciales** (delta correcto — el cargador
excluye los 384 ya en shadow) → lectura del MOAT → `--apply` a shadow (8 escritos) → comparación
shadow-vs-prod por SQL. **Confirma el patrón: iguala donde n8n acierta, corrige donde falla, cero
downside**, a escala de delta real (~8/día).

- **Binance**: corre (dry-run 9.97 = valor guardado; mercado plano). `--shadow` **sigue sin construir**
  → no se puede refrescar el TC shadow aislado (pendiente #1 de satélites).
- **Balance de los 8**: 4 idénticos (172 Onix Art, 1005 Sky Eclipse, 1103 Los Claveles, 1411 Speranto)
  + 2 correcciones reales + 1 SIN_NOMBRE legítimo (1103, el aviso solo da la calle "Los Claveles").
- **🐛 Corrección 1 (matching, aplicada a PROD)**: "Domus Onix" ≠ "Onix Art By Elite" (pm45). 3 deptos
  preventa (3550/3551/3552, Sirari) que n8n metió en pm45 con `metodo_match='nombre_exacto'` pero a
  **~275m** del Onix Art real (token "Onix" fuzzy). GPS verificado por el founder → **creado pm523
  "Domus Onix"** (Sirari, `gps_verificado_visual`) → el matcher name-first los auto-asigna solo →
  **prod corregido** (`UPDATE ... 45→523 + candado formato-objeto`, `metodo_match='correccion_domus_onix_5jul'`).
- **🐛 Corrección 2 (TC, solo shadow)**: 893 Nano Smart — n8n marcó `paralelo` por el `exchange_rate`
  9.83 GLOBAL de Remax (bug de los 368) → lector → `no_especificado` → feed **$3.162→$2.207/m²** (−30%).
- **⚠️ Lección reforzada** (reincidió 3×): SQL con jsonb (candados) → **`jsonb_build_object()`**, nunca
  literal `'{...}'::jsonb` largo (se parte al copiar → CR/`0x0d` → `ERROR 22P02`). Ver memoria
  `feedback_sql_jsonb_nunca_literal_largo`.
- **Inventario shadow tras el lote**: 392 deptos, 379 con match (**96,7%**).

## Comparación integral shadow-vs-prod (2026-07-05) — condiciona el cutover

392 deptos venta Eq (paridad total prod=shadow). Diffs fila-a-fila: precio >2% en 47 (>15% en 23),
TC en 137, dorms en 10, pm en 18. **El híbrido está direccionalmente mejor (mata Firecrawl, corrige
bug TC estructural, mejor matching) pero NO listo para corte ciego** — reveló 2 frenos:

- **🚨 Freno 1 — el cargador PISA CANDADOS legítimos.** Los 105 `paralelo→no_especificado` NO son
  corrección: tienen `tipo_cambio_detectado` candado en formato-objeto (`campo_esta_bloqueado()`=true
  en 105/105; 104 por `audit_tc_element` 15-jun, 1 por `criterio_mercado_equipetrol`). El cargador
  shadow NO hereda `campos_bloqueados` de prod → viola Regla 1 (Manual>Auto) → subvalúa 104 deptos.
  El "feed −12%" (mediana $/m² real $2.219→shadow $1.962) es eso, no des-inflar un bug.
- **⚠️ Freno 2 — el híbrido tiene sus propios errores de lectura.** Corrige corruptos de n8n (3542
  $7.557→$52.600) PERO 182/184 quedaron a ~$1.019/m² (mitad de prod) = sub-lectura a auditar.
- **Matching (18 difieren): neto positivo** — recupera 3 (Stone3/Baruc IV/Bamboo), mejora
  especificidad ~7 (Uptown/Sky Luxury/Luxe Tower vs pm genérico), pierde 5 por no leer nombre
  (595/Portobello×2/Murure/Equipetrol Day = backlog).

### Candados — decisión de diseño (founder, confirmada con datos)
- **La capacidad de candar YA EXISTE y no se toca**: panel `/admin/propiedades/[id]`
  (`LockPanel`/`toggleBloqueo`), formato-objeto correcto, **auto-canda el TC al editarlo a mano**
  (`usePropertyEditor.ts:848`). Eso explica el 86% de TC candado (338/392) — no fue un audit masivo,
  es el auto-candado por edición manual. En cutover el híbrido escribe la misma `propiedades_v2` →
  el admin de candados sigue idéntico.
- **Tesis founder (probada)**: el 85% de candados existía porque n8n metía datos malos y el auditor
  corregía+candaba en reversa; el híbrido lee bien de origen → menos candados. **De 338 TC candados,
  el híbrido leyendo SOLO coincide en 207 (61%)** = parche-sobre-n8n innecesario; **105 (31%) =
  conocimiento puro** (paralelo sin señal en el anuncio, SIEMPRE hará falta); 26 (8%) a revisar.
- **Diseño del fix** (founder cuestionó bien acoplar el híbrido a "jalar de propiedades_v2"): el
  comportamiento correcto = respetar los candados de la FILA QUE ACTUALIZA en su tabla destino (en
  prod = `propiedades_v2`, ya los tiene; en shadow, tabla nueva con 0 candados → SEMBRARLOS una vez
  copiando de prod). Mismo código en shadow y cutover, sin muleta. El candado es por-campo y
  reversible (no rompe el pipeline).

### Dedup de catálogo aplicado (2026-07-05, prod)
Duplicados PREEXISTENTES de n8n que el híbrido destapó (al leer el nombre específico). Consolidados
con candado `id_proyecto_master` + alias movidos + pm viejo `activo=false`: **Element (303→74),
Le Blanc (20→112), Atlantis (484→411)** + **revertido el duplicado propio Pora (depto shadow 522→85,
alias 'Pora'/'PÖRA' a pm85, DELETE pm522)**. Método: nombre-base igual (sin prefijos) + GPS <10m.
OJO series numeradas (Stone 2-7, Macororó 5-19, Portofino/Baruc/Brickell/Barak) = edificios REALES,
NO tocar. A verificar (nombre idéntico GPS lejano = un GPS mal): Klug 44/61, Baruc Norte 409/500,
Domus Luxury 73/356 (prob. distintos).

### Pendientes tras esta sesión (bloquean cutover, en orden)
1. **Fix candados del cargador** (lo más grande): sembrar `campos_bloqueados` prod→shadow (344/392
   filas con candado en prod, 0 en shadow) + `--apply` preserva y respeta candados.
2. Auditar precios sub-leídos del híbrido (182/184).
3. Decisión de producto del default TC (ligada al #1).

## Estado al 3-jul-2026 (cierre de sesión)
- **INVENTARIO COMPLETO: 384 deptos en shadow, 96,9% match** (universo prod = 402; los 18 que faltan = basura rechazada [multiproyecto/baulera/parqueo/anticrético] + ~8 remanente). Sin-match: 1 ambiguo (595 "Bloque La Salle", revisar) + 11 SIN_NOMBRE legítimos. Catálogo limpiado (aliases + dedup + fix fuzzy mig 270 + bug de selección source-agnostic).

### Próximos pasos (en orden)
1. **Comparación integral shadow-vs-prod** — con el inventario completo: conteos, medianas $/m², diffs fila-a-fila (precio/TC/dorms/match). Es **el dato que justifica el corte de n8n**. Herramientas listas: `buscar_unidades_simple` (real) vs `buscar_unidades_simple_shadow`.
2. **Enganches del cutover**: fecha LEAST en el camino de escritura real; C21 `fecha_alta` desde el discovery (`c21Listado`); `--shadow` en `actualizar-tc-binance.mjs`; script snapshot absorción.
3. **Paquete "TC nuevo"** (default paralelo + normalización base-paralelo) — JUNTO a prod, al unificarse el TC oficial. Ver READER_SPEC.md.
4. **Cutover**: el híbrido escribe `propiedades_v2` real / se apaga n8n para deptos venta — tras validar la comparación, con OK del founder.
5. Detalles menores: 595 "Bloque La Salle" (leer el aviso), alquiler (otra operación, después).
- **Pipeline reader-integrado completo**: `cargar-deptos-shadow.mjs` (`--prep`→lector→`--apply`) + `lib/matcher.mjs` (name-first) + `READER_SPEC.md` + `lib/reader-api.mjs` (costura API stub).
- **Front shadow**: `/api/ventas-shadow.ts` (dev-only) + `?shadow=1` en `ventas.tsx` → `http://localhost:3000/ventas?shadow=1`.
- **Migraciones**: 268 (entorno shadow) + 269 (vistas/RPC feed shadow) + **270 (FIX `buscar_proyecto_fuzzy`: LIMIT truncaba por id no por score — bug de matching de PROD también)**.
- **Test de bloqueo**: 100 fetch en vivo = 0 bloqueos, 100% calidad. El fetching escala; el constraint es la lectura (MOAT/tokens).
- **TC conservador = prod** (el paquete "TC nuevo" default-paralelo + normalización base-paralelo va DESPUÉS, junto a prod, al unificarse el TC).

## Decisiones (founder)

- **MOAT = el lector (Claude Code en sesión), NO API externa.** El script prepara el material ($0 fetch); yo leo precio/TC/dorms/edificio.
- **Cron = BACKLOG.** Por ahora comando on-demand corrido en sesión.
- **Cero escritura a producción.** Evolución: (a) carril de archivos → (b) **entorno SHADOW aislado** (mig 268): un clon entero (`propiedades_v2_shadow` + TC shadow + normalización shadow) donde el híbrido corre el flujo COMPLETO (write + matching + render) sin que el feed público lo vea. El corte real (híbrido escribe la tabla REAL / n8n se apaga) es tras validar varios lotes en el shadow, con OK del founder.
- **`datos_json` DIRECTO** (no reusar `merge_discovery_enrichment` SQL).

## Entorno SHADOW (mig 268 ✅ aplicada)

Clon aislado para la corrida completa sin tocar prod (verificado post-apply):
- **`propiedades_v2_shadow`** — copia exacta (`LIKE ... INCLUDING ALL`, 88 cols; `id` sin default = id real de prod para comparar fila-a-fila; sin FK ni triggers).
- **`config_global_shadow`** — TC shadow separado (paralelo 9.97 / oficial 6.96); el Binance del híbrido escribe acá (`--shadow`, seguro) + simula la unificación moviendo el oficial.
- **`precio_normalizado_shadow()`** — usa el oficial shadow como divisor (con la semilla = idéntica a la real: 100k paralelo→143.247).
- Aislada 100%: GRANTs `service_role`+`claude_readonly`, SIN anon/authenticated → invisible al Data API público. Rollback inline en la migración.

## Qué está construido (`scripts/deptos-equipetrol/`)

| Archivo | Qué hace | Estado |
|---|---|---|
| `lib/detalle-deptos.mjs` | Extractor depto C21+Remax (contacto/fotos/desc/precio + piso/expensas/parqueo/amenidades estructuradas + `parseAreaTexto` fallback BO) | ✅ |
| `lib/tc.mjs` | Clasificación TC contra Binance vivo (`cargarTC`, `clasificarTCporRatio`); texto manda, señal de respaldo | ✅ |
| `carril-paralelo.mjs` | Corre híbrido vs n8n sobre N deptos, arma contrato, compara, escribe a `output/` — CERO escritura a BD | ✅ |
| `cargar-deptos-shadow.mjs` | **Reader-integrado, 1 pasada** (v2): `--prep` fetchea material ($0, NO escribe) → el LECTOR llena `veredicto` (READER_SPEC.md) → `--apply` escribe la fila CORRECTA de una + resuelve match name-first. Mata el baseline+patch. | ✅ v2 |
| `lib/matcher.mjs` | **Matcher NAME-FIRST**: `matchearPorNombre(nombre,zona,gps)` → `buscar_proyecto_fuzzy` + corrobora zona; GPS solo desempata (nunca maneja). AUTO si score≥0.95+zona; ambiguo/sin-nombre → lector. | ✅ |
| `READER_SPEC.md` | Spec único del veredicto (precio/TC/dorms/nombre_canónico/gate) — lo cumple el lector-agente hoy y el API mañana | ✅ |
| `lib/reader-api.mjs` | Costura del lector por API (OpenRouter) — STUB marcado; `cargarSpec()` = READER_SPEC.md como system-prompt | 🔌 stub |
| `actualizar-tc-binance.mjs` | Reemplaza el flujo n8n Binance (dry-run default) | ✅ validado dry-run (9.94 vs n8n 9.97) |
| `sonda-sombra-deptos.mjs` / `moat-material.mjs` | Herramientas de validación previas | ✅ |
| `CONTRATO_FEED.md` | Spec: columnas + `datos_json` que lee `buscar_unidades_simple` | ✅ |

## Resultado del test (100 deptos, cero prod)

- Estructurado (automatizado): contacto **100/100**, fotos 94/100, dorms 90/100 (recamaras=0→lector), área 82/100 (artefacto: viene del discovery).
- Lectura de los 100: **~85 IGUALA** (n8n correcto), **~15 el híbrido corrige/caza**: precio corrupto (3519 $7.5k→$52.6k), TC mal marcado (2761 "TC 6.96"→oficial), match recuperado (Baruc IV, Stone 3), PM_NUEVO (Piazza Once), anticrético mal clasificado (3492).
- **Balance honesto:** iguala o mejora, **cero downside**; pero n8n ya hace bien ~85% y el feed ya filtra basura (bauleras/parqueos/dups por área<20 / `duplicado_de` / `es_multiproyecto`). El valor real de migrar = **matar Firecrawl + código versionable + lector que caza lo mal catalogado**, NO "arreglar el feed".

## Mapa de estrangulamiento n8n

### CORE deptos-venta (el híbrido lo reemplaza — Bloque 3)
| Paso | Workflow n8n | Híbrido |
|---|---|---|
| Discovery C21+Remax | `modulo_1/flujo_a_discovery_*` | ✅ `c21Listado`/`remaxListadoSC` |
| Enrichment regex (**Firecrawl**) | `modulo_1/flujo_b_processing_v3.0` | ✅ extractor (fetch directo) |
| Enrichment LLM (**Firecrawl**) | `modulo_1/flujo_enrichment_llm_venta` | ✅ el lector |
| Merge | `modulo_1/Flujo Merge` | ✅ `datos_json` directo |
| Matching | `modulo_2/matching_nocturno` | ✅ reusa el SQL (`matching_completo_automatizado`) |
| Verificador | `modulo_1/flujo_c_verificador` | ✅ `verificador-casas.mjs` (modelo deptos) |

### SATÉLITES (estrangular aparte)
| Pieza | Qué hace | Estado |
|---|---|---|
| `tc_dinamico_binance` | Binance → `config_global.paralelo` | ✅ `actualizar-tc-binance.mjs` (a flipear) |
| Snapshot absorción | agrega `v_mercado_venta` → `market_absorption_snapshots` | 🔨 falta script chico |
| `auditoria_diaria_sici` | health/checks | ✅ cubierto por skills de audit |

### FUERA de alcance (después)
- **Alquiler** (`alquiler/*`, 7 wf, también Firecrawl) — otra operación, tras venta.
- **Casas/terrenos** (`casas_terrenos/*`) — DESACTIVADO (híbrido ya hace casas ZN).
- `modulo_2/archive/*` — deprecados.

## Reglas clave heredadas (no romper)

- **Precio: el híbrido guarda el CRUDO** (`precio_usd` billete-si-paralelo/directo) + `tipo_cambio_detectado`. La normalización a oficial-comparable la hace el FEED en vivo (`precio_normalizado()`). Pre-normalizar = bug doble-normalización.
- **Binance solo transforma** (no re-procesa): cambiar la tasa auto-actualiza todos los paralelo al leer.
- **Matching: NO `aplicar_matches_aprobados`** (loop K1) — UPDATE directo estilo mig 259, sin pisar `nombre_edificio`. Nombre-primario, GPS solo desempata.
- **Dorms=0 = monoambiente** (correcto, el frontend lo muestra "Monoambiente").
- **Área = discovery** (fallback texto si falta).

## Primer lote en shadow (2026-07-03) ✅

`cargar-deptos-shadow.mjs` escribió **8 deptos** (4 C21 + 4 Remax, más recientes de Eq) a
`propiedades_v2_shadow`. Verificado en BD: filas válidas (CHECK/NOT NULL OK), zona/microzona
seteadas, `precio_normalizado_shadow()` corre, contacto/fotos/amenidades pobladas.

**Reparto AUTOMÁTICO vs LECTOR (baseline escrito ≠ valor final):**
- **Precio**: el pick estructurado corrige lo corrupto de n8n en el origen (3542 HH Once: n8n
  $7.557 → híbrido $52.600; el texto dice "$us 52.600"). Divergencias >15% van al worklist.
- **TC = SIEMPRE `no_especificado` en el baseline** (normaliza directo → NUNCA infla). paralelo/
  oficial son SIEMPRE del lector desde el texto. Corregido un bug propio: usar
  `clasificarTCporRatio` sobre el `exchange_rate_amount` de Remax (tasa GLOBAL 9.78) marcaba
  falso-paralelo en TODO anuncio Remax → es el bug que infló 368 deptos. Ahora el ratio es solo
  PISTA en el worklist (contraejemplo 3521: portal dice 9.8→paralelo, pero el texto dice "Oficial
  a Bs 7" → gana oficial). Consecuencia: un no_especificado escrito de más subvalúa (seguro), nunca infla.
- **Dorms**: `recamaras` de C21 devuelve **0 en deptos multi-dormitorio** (3540 74m² y 3539 117m²
  con dorms=0; n8n tenía 1 y 2). El worklist marca `dorms=0 sospechoso` cuando área>45m² o n8n>0.
  Hallazgo: la extracción de dorms del híbrido en C21 es más débil que n8n → carga de lector.
- **Matching**: `id_proyecto_master`/`nombre_edificio` copiados de prod (paso separado, CONTRATO_FEED).

### Reader pass del 1er lote ✅ (2026-07-03)
Leí las 8 descripciones ($0) y apliqué veredictos a shadow (con razón por corrección). Nota: este
1er lote usó 2 scripts transitorios (`leer-lote`/`aplicar-lectura`, ya BORRADOS) — su flujo quedó
integrado en `cargar-deptos-shadow.mjs` v2 (`--prep`→lector→`--apply`). Resultado vs n8n:
- **Híbrido+lector CORRIGE a n8n (3 errores reales + 1 de representación):**
  - 3542 HH Once: n8n $7.557 corrupto → **$52.600** ($/m² $217→$1.510).
  - 3541 Nano: n8n $71.839 marcado paralelo → normalizaba **$102.907** (doble-inflado); real $52.000 billete → $74.489 (sobrevaluaba ~38%).
  - 3521 Stone III: n8n $55.000 + **sin match**; texto "$78.571 oficial a Bs 7" → **$78.571** ($1.950/m²) + **match pm 76** recuperado.
  - 3540 Sky Moon: mismo valor de feed (~$229k) pero mejor representación (billete $160k+paralelo vs congelado) + dorms 0→1.
- **Híbrido IGUALA a n8n donde n8n acierta (sin regresiones):** 3539, 3465, 3463, 2871 (el lector confirmó, no cambió a ciegas).
- **Lección:** el baseline automático solo habría estado MAL en 5/8 (precio via `pickPrecioC21` + dorms `recamaras=0`). La etapa de LECTURA es donde está el valor, no opcional.

### Feed shadow (render) — mig 269 APLICADA + LOOP CERRADO end-to-end ✅ (2026-07-03)
`sql/migrations/269_shadow_feed_render.sql` (aplicada por el founder) clona `v_mercado_venta` →
`v_mercado_venta_shadow` y `buscar_unidades_simple` → `buscar_unidades_simple_shadow`, apuntando a
`propiedades_v2_shadow` + `precio_normalizado_shadow()`. **Comparación feed-shadow vs feed-real de
los 8 (misma RPC/contrato que `/ventas`):**
- 3542 HH Once: real $217/m² + 🚩tc_sospechoso → shadow **$1.510/m² sin badge** (corrige precio Y limpia el badge que n8n se auto-marcaba).
- 3541 Nano: real $3.083/m² (sobrevaluado, doble-inflado) → shadow **$2.232/m²** (valor real).
- 3521 Stone III: **NO aparece en real** (pm null) → **aparece en shadow $1.950/m² Stone 3** (match pm 76 recuperado; INNER JOIN lo deja entrar).
- 3540 Sky Moon: mismo valor de feed (~$229k) mejor representación. 3539/3463/2871: **idénticos** (n8n acierta). 3465: no aparece en ninguno (sin nombre → falta matching).
- **Cadena real por SQL (no proxy):** `propiedades_v2_shadow`→`precio_normalizado_shadow`→`v_mercado_venta_shadow`(medianas TC)→`buscar_unidades_simple_shadow`→misma salida que el frontend. `tc_sospechoso` funciona en shadow. **Cero regresiones.**

### Cargador reader-integrado ✅ (2026-07-03) — matching desde el ORIGEN
Refactor a 1 pasada (`--prep` → lector → `--apply`), sin baseline ni patch. **Matching name-first
resuelto por el script** (`matcher.mjs`), no a mano: el lector entrega el nombre CANÓNICO (lee
slug C21 / descripción Remax; "Stone III"→"Stone 3"), el script llama `buscar_proyecto_fuzzy` +
corrobora zona → AUTO si score≥0.95+zona. **GPS secundario** (los anunciantes lo ponen mal; sin
nombre → SIN_NOMBRE, nunca fuerza). El catálogo aprende vía `alias_sugerido` (registrado, NO escrito
a prod en fase shadow). Probado end-to-end (3 deptos): 3521→auto pm 76 (Stone 3, nombre+zona),
3540→auto pm 15 (Sky Moon), 3465 sin nombre→sin match (no aparece en feed, correcto). Rinde por
`buscar_unidades_simple_shadow`. **API-ready**: `lib/reader-api.mjs` stub, mismo READER_SPEC.md como
system-prompt (decisión founder: manual $0 ahora, API autónomo ~centavos/mes después).

### Lote de 50 ✅ (2026-07-03) — reader-integrado a escala, 2 políticas afinadas
`--prep 25` (50 deptos) → **5 subagentes-lectores** en paralelo (10 c/u, patrón `/audit-cola-matching`)
→ `--apply`. **48 escritos, 2 rechazados** (3492 anticrético + 2731 multiproyecto, correctos).
Matcher auto-resolvió ~40 por nombre; 8 pendientes (3 PM_NUEVO Pora/Piazza Once/Smart You Plaza, 3 typo/fuzzy, 2 ambiguos). **Feed shadow 38 vs real 42** (casi a la par): gana shadow 3 (Bamboo/Klug/Stone3, matches recuperados); el gap = 1 exclusión correcta (anticrético que n8n publica mal) + backlog de matching (typos + PM_NUEVO que el alias/audit cierra). **Cero regresiones.**

**2 refinamientos que salieron del lote (ya en código/spec):**
1. **Matcher zona-guard** (`matcher.mjs`): nombre ÚNICO exacto → auto-matchea AUNQUE la zona difiera (el nombre manda, GPS secundario/mal puesto). Recuperó 4 (Bamboo/Montebelluna/Sky Eclipse/Speranto). La zona solo desempata cuando hay VARIOS con el mismo nombre.
2. **Fallback de precio estructurado** (`READER_SPEC.md` Regla 5b): precio del TEXTO primero (con su TC); si el texto no trae precio pero hay precio estructurado por-unidad coherente ($/m²) → aceptar `no_especificado` (no infla; badge = red). Retener SOLO si no hay precio en ninguna fuente. Recuperó 9 (5 Sky Level preventa + 4 Speranto/Eurodesign).

### fecha_publicacion / días-en-mercado ✅ (2026-07-03)
Días-en-mercado NO se guarda (deriva en vivo = HOY − `fecha_publicacion`). Lo que importa es
proteger `fecha_publicacion` (la fecha REAL del anuncio), que en n8n se "pisaba" (el pipeline
re-toca la fila → `fecha_discovery`=NOW cada noche). Fix del híbrido:
- **Extractor** (`detalle-deptos.mjs`): Remax `date_of_listing` (verificado, coincide con prod);
  C21 NO la trae en el detalle (`?json=true` solo tiene `fechaModificacion`/`fechaFirmaCPS`) → viene
  de la DISCOVERY (`fecha_alta`); hoy fallback a prod (=discovery de n8n). **Al cutover: el discovery
  del híbrido (`c21Listado`) debe cargar `fecha_alta`.**
- **Protección LEAST** (`--apply`): `fecha_publicacion = LEAST(existente, nueva)` → la más antigua
  gana, nunca se pisa hacia adelante (anti re-scrape Y anti-bump del broker → DOM más honesto que
  el portal). Verificado: fecha corrompida a futuro vuelve a la real. El híbrido la CANDA.

## Pendientes / futuro
- **Más lotes** hasta dar confianza → decidir corte de n8n.
- **Cutover C21 fecha**: `c21Listado` (discovery) debe cargar `fecha_alta` (hoy el detalle no la trae).
- **Alias al cutover**: aplicar los `alias_sugerido` a `proyectos_master` cuando el híbrido escriba prod (hoy solo se registran).
- **PM_NUEVO**: crear los pm de edificios nuevos detectados (Pora, Piazza Once, Smart You Plaza, Eurodesign Tower) — vía el flujo existente.
- **`actualizar-tc-binance.mjs --shadow`** — flag para escribir `config_global_shadow` (el `--apply` ahí es seguro).
- Cutover Binance real (flipear `--apply` a prod + apagar workflow n8n) — tras validar en shadow.
- Script snapshot absorción.
- Más lotes de carril paralelo → decidir corte de deptos.
- **TC transición**: correr `--full` (audit) y Binance MÁS SEGUIDO mientras dure; `precio_normalizado()` tiene 6.96 hardcodeado → actualizar la función cuando el oficial se unifique.
- Empaquetar cron delta (`cron-deptos-equipetrol.mjs`) — backlog.
- Alquiler (después de venta).
