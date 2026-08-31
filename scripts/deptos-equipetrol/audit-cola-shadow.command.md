---
description: Audita MATCHING + DUPLICADOS del feed SHADOW del híbrido (venta + alquiler) — tres superficies: sin-match-con-nombre (PM_NUEVO/fuzzy), auto-matches riesgosos (nombre_unico_zona_dif) y duplicados SIN código repetido (apart-hotel/republicación, agrupa por pm+precio+área; el slug reescrito de C21 ya lo caza el discovery desde el PR #64). El .mjs filtra $0 SIN fetch (lee el anuncio ya guardado); el VEREDICTO de matching lo dan subagentes-lectores (juez), el dedup es determinístico. SQL contra propiedades_v2 que aplica el humano. Read-only.
---

# /audit-cola-shadow — Audit de matching del feed SHADOW (híbrido)

> ⏰ **AGENDADO (21-jul-2026): corre SOLO todas las noches como routine local, ÚLTIMO de la cadena**
> (`~/.claude/scheduled-tasks/audit-cola-shadow-nocturno/`), **después** de los dos crons de captura
> — corre DESPUÉS de las 4 capturas (Equipetrol venta+alquiler, ZN venta+alquiler), así audita lo que
> se cargó esa noche. Horario exacto en la tabla de `revisar-routines.command.md` (única fuente de horarios). Avisa por **Slack** con lo que
> quedó para aplicar. En la corrida agendada **NO aplica NADA** (nadie puede dar OK): deja el SQL escrito
> en `output/audit-cola-shadow-log.md`. **Las routines NO están en git** — viven en
> `~/.claude/scheduled-tasks/` de la máquina del founder; si está apagada, corre al siguiente arranque.
>
> **Fuente de verdad** de este comando. Copiar a `.claude/commands/audit-cola-shadow.md`
> (skills gitignored en `.claude/commands/`; el repo guarda el `.command.md`).
>
> **Port alineado de `/audit-cola-matching` al híbrido.** El doc `AUDITORIAS_POST_CUTOVER.md`
> §"/audit-cola-matching — MUDA DE TABLA": la cola `matching_sugerencias` NO existe para el híbrido
> (matchea en el `--apply`). El VALOR reutilizable no es la cola, es el patrón *leer el anuncio →
> subagente-lector JUEZ → cruce contra `proyectos_master`+GPS → SQL con candados*. Solo cambia de
> QUÉ se lee: en vez de la cola, las **dos superficies de shadow**.

## Principio rector (NO romper — heredado de la skill madre)

> **El `.mjs` es un FILTRO, no un juez. El juez es la lectura del anuncio por un subagente-lector LLM.**

Validado 19-jun sobre `pendiente_zona_norte`: el motor acertó 4/25 por nombre exacto; **16 falsos
positivos**, incluido un **score 95** (Galil Parque III, real = Galil Parque I). Aprobar por score mete
basura. El número/torre del cluster manda ("Stone 3"≠"III", "Uptown Drei"≠"Equipetrol"). Memorias:
`project_matching_zn_aprobacion_16jun2026`, `feedback_candado_formato_objeto`.

## Ventaja vs el audit-cola de prod

Shadow **ya guarda el anuncio que el reader juzgó** (`datos_json.contenido.descripcion`) → el juez lee
de ahí, **SIN re-fetch → $0 y sin riesgo de bloqueo de IP**. (Si el anuncio pudo haber cambiado desde la
carga, eso lo cubre el otro comando, `/audit-deptos-shadow`, que sí re-fetchea por drift.)

## Las superficies

> ⚠️ Este encabezado decía **"las tres superficies"** hasta el 6-ago-2026, cuando el script ya tenía
> cinco: la 4 (29-jul) y la 5 (4-ago) se sumaron al `.mjs` y **nunca se documentaron acá**. Quedan
> descritas abajo en corto. La fuente de verdad de lo que se calcula es siempre
> `auditar-matching-shadow.mjs`, no este archivo.

1. **SIN MATCH con nombre** — `id_proyecto_master IS NULL AND nombre_edificio IS NOT NULL`
   (`metodo` sin_match/fuzzy_debil/ambiguo). Candidatos **PM_NUEVO** (595 Bloque La Salle, 3660 Hamburgo)
   o **fuzzy débil** (1674 Sky Collection). El `.mjs` ya trae los candidatos de `buscar_proyecto_fuzzy`.
2. **AUTO-MATCH RIESGOSO** — `datos_json.trazabilidad.metodo_match = 'nombre_unico_zona_dif'`
   (confianza 85: nombre único exacto pero **zona ≠**). Falsos positivos: Sky Luxury, Maré, Uptown Drei.
   El `.mjs` trae `pm_actual` + `dist_metros` prop↔pm → **priorizá por distancia**: `dist≈0` con mismo
   nombre = casi seguro correcto (solo cruza el borde de zona); `dist` grande (>300m) = revisar en serio.
3. **DUPLICADOS** (apart-hoteles / republicaciones **sin código repetido**) — Reusa `dup-checks.mjs` de prod.
   🔴 **Corregido el 4-ago-2026:** acá decía *"el detector del pipeline NO los caza (cada aviso tiene código
   único)"*. La premisa estaba **invertida**: el código de C21 es único por **AVISO**, y un mismo aviso puede
   tener **varias URLs** — C21 reescribe el slug cuando el captador edita. Desde el PR #64 **el pipeline sí caza
   esa clase**, en el discovery y por ese mismo código (ver `discovery-deptos.mjs`, "slug reescrito"). Lo que
   queda para esta superficie es lo que el código NO puede resolver: apart-hoteles y republicaciones con
   códigos distintos.
   ⚠️ **Y esta superficie no podía cazar el slug reescrito ni por casualidad**: agrupa por `pm+precio+área`, y
   en esos casos **el precio cambió** (es el motivo de la reescritura). Cuando el audit del 4-ago levantó 2 de
   esos 3 dedups fue por coincidencia (precio igual), no por diseño.
   **MEJORA shadow:** agrupa por **pm** cuando existe
   (más certero que el string del nombre — el pm ya matcheado deja el dedup servido), + precio + área, y
   compara descripciones (**≥90% = mismo aviso replicado**; descripciones distintas = unidades legítimas del
   mismo edificio, NO se tocan). **GUARDA POR PISO**: si dos avisos del mismo grupo declaran `piso` distinto,
   van a grupos separados y NUNCA se deduplican (aunque la desc sea ≥90%) — son unidades reales (caso Las Dalias
   324 piso1/325 piso5). Piso `null` = comodín (agrupan entre sí, no se pierden apart-hoteles sin piso declarado).
   $0, sin fetch (la desc ya está guardada). Caso canónico: MAI Suites (7 avisos, piso null).
4. **EL LECTOR FIJÓ EL PM CON DUDAS** (29-jul-2026) — el MOAT guardó `confianza` no-alta al asignar el
   edificio. Van al juez a CONFIRMAR / CORREGIR / SIN_NOMBRE. Las props cargadas antes del 29-jul no
   guardan confianza → no entran (y el script lo **declara**, para no leer el 0 como "todo limpio").
5. **EL MATCH QUEDÓ LEJOS DEL EDIFICIO** (4-ago-2026, umbral **800 m**) — 🔴 **REPORTA, NO DESCONECTA**:
   medido el 4-ago, **3 de 6** tenían el match BIEN y el pin del portal MAL. El juez decide cuál de los
   tres lados falla (aviso / ficha del pm / pin). Rastro que corta la relectura:
   `datos_json.trazabilidad.distancia_revisada`.
6. **EL EDIFICIO SE CONTRADICE SOBRE SU ESTADO DE OBRA** (6-ago-2026) — nació de que el founder vio
   **HH Once** publicado a la vez como *preventa* y como *entrega inmediata* en el mismo feed.
   🔴 **El daño no es de cobertura, es de credibilidad**: dos etiquetas contradictorias del mismo
   edificio en la misma pantalla no se leen como "faltan datos", se leen como que el sitio no sabe.
   Dos clases:
   - **`conflicto_interno`** — los avisos de venta **vigentes** del edificio se contradicen entre sí.
   - **`conflicto_cruzado`** — todos los avisos de venta dicen *preventa* **pero hay alquiler activo**
     (no se alquila lo que no está construido). La regla NO lo toca a propósito: el consenso de vecinos
     (96,7%) y la señal de alquiler (95%) son fuerzas parejas — lo dicta un humano, no un umbral.

   🔑 **La regla de la mig 315 ya resuelve el `conflicto_interno` hacia "entregado"** (un edificio no
   vuelve al pozo: *entrega_inmediata* es evidencia positiva, *preventa* es el default del aviso que
   nadie actualizó). **Pero eso es una PRESUNCIÓN, y el script la declara como tal** (`estado_origen =
   'conflicto_resuelto'`). Lo que se le pide al humano es **sellarla**, no arreglar el feed.
   ⚠️ **NO se resuelve por mayoría**: en HH Once la mayoría dice preventa (4 vigentes contra 2) y **la
   mayoría está equivocada** — la entrega fue en marzo de 2026 y esos 4 son catálogo de la
   desarrolladora publicado antes de entregar.
   **Rastro que corta la relectura:** `proyectos_master.entrega_verificada` (mig 315). Sin el dictado,
   los mismos 10 edificios vuelven todas las noches.
   📌 Al 6-ago: **10 edificios · 69 props** (8 internos + 2 cruzados), 4 de ellos en Equipetrol.
   ✅ **Sellados los 10 el 7-ago** → la superficie dio **0** el 8-ago, en las dos zonas.
7. **DOS AVISOS DEL MISMO DEPTO A PRECIOS INCOMPATIBLES** (8-ago-2026, umbral **30%**) — mismo
   `id_proyecto_master` + misma **área** + mismo **captador**, con precios normalizados que difieren
   más de 30%. 🔴 **REPORTA, NO DECIDE**: no dice cuál precio es el bueno, dice que **los dos no
   pueden serlo**.
   **Origen:** Sky Eclipse. La captadora Elizabeth Oconnor tenía 3 avisos del mismo depto (2 dorm,
   101 m²) y uno estaba a **$84.000 contra $165.948** — la mitad. Estuvo **5 semanas** tirando abajo
   la mediana de Equipetrol Centro, y el dedup no podía verlo porque **el precio es parte de la clave
   de grupo**: dos avisos del mismo depto con precios distintos nunca se comparan entre sí.

   🔑 **Por qué esto y NO "arreglar el dedup"** (medido antes de escribir el código): el dedup **no
   está roto**. Agregar el captador como señal fuerte marcaría como duplicados **5 grupos de unidades
   REALES en pisos distintos** (Community Alto Norte 1/2/11 · Las Dalias 1/5 · Macororó 15 13/15 ·
   Le Blanc 4/5 · Soul Parc 1/2) y **reabriría los 3 clusters de EDIFICIO K1** ya juzgados como
   inventario real el 5-ago. En Sky Eclipse **no había ninguna señal que discriminara** (sin piso,
   mismo texto, misma área): cualquier umbral que cace ese caso rompe K1. Lo inequívoco no era la
   duplicación, era el **precio**.

   **Umbral 30%:** medido sobre los grupos legítimos de hoy, la brecha máxima es **7%** (variación
   normal entre pisos); con umbral 5% aparecen 5 grupos, entre ellos Rhodium con 19% — 4 monoambientes
   del mismo captador en pisos distintos, que NO son error. Sky Eclipse era **97%**.
   ⚠️ Lee de **`v_mercado_venta_shadow`**, donde el precio ya está NORMALIZADO. Comparar `precio_usd`
   crudo daría brechas falsas entre un aviso tagueado `bob` y uno en USD — el mismo error que este
   detector busca cazar.
   **Rastro que corta la relectura:** `datos_json.trazabilidad.brecha_precio_revisada`.
   📌 **SOLO VENTA, y es una decisión — no un olvido.** Las otras 6 superficies corren sobre las dos
   operaciones; ésta lee `v_mercado_venta_shadow` porque el caso que la originó era de venta y no se
   quiso ampliar el alcance sin medir. El mismo problema **puede existir en alquiler** (mismo depto,
   mismo captador, precios incompatibles). Confirmado con el founder el 8-ago: queda así por ahora.
   Si algún día se extiende: la gemela es `v_mercado_alquiler_shadow` con `precio_mensual` en vez de
   `precio_norm`, y **hay que recalibrar el umbral** — 30% se midió sobre precios de venta.

10. **LA PROP Y SU EDIFICIO EN MACROZONAS DISTINTAS** (20-ago-2026) — un edificio no está en dos
   macrozonas. La `zona` de la prop la escribe el cargador desde el GPS del aviso, que a menudo es el
   **pin genérico del portal**; la del edificio viene de la ficha. Si difieren de MACROZONA (no de zona:
   entre zonas vecinas el borde es difuso y daría ruido), una de las dos está mal — y casi siempre es la
   de la prop, que mientras tanto alimenta la mediana de una microzona ajena.
   🔴 **Corregir el GPS NO recalcula la zona:** la tabla viva no tiene triggers → van en el MISMO UPDATE.

11. **DOS FICHAS DEL CATÁLOGO QUE EL MATCHER VE COMO UNA** (28-ago-2026, mig 345) — la única superficie
   que **no mira propiedades sino el CATÁLOGO**. `normalize_nombre()` borra el prefijo genérico y los
   numerales romanos, así que dos fichas activas distintas colapsan al mismo texto: para
   `buscar_proyecto_fuzzy()` son **el mismo edificio, con score idéntico**, y el desempate cae en el id
   de ficha más bajo. Lee `v_colisiones_catalogo`.
   🔑 **Lo que hace peligrosa a una colisión no es que exista: es la DISTANCIA.** Los tres "Condado"
   están a 50 m — elegir mal no mueve ni la zona ni la mediana del m². Los dos "Domus Luxury" están a
   2.375 m **y en macrozonas distintas**: ahí elegir mal manda la propiedad al mercado equivocado.
   Por eso silencia las vecinas (misma macrozona y < 800 m, el mismo umbral que la superficie 5) y las
   **declara contadas**; ordena por daño potencial: mismo nombre exacto → cruza macrozona → distancia.
   🔴 **REPORTA, NO ARREGLA.** Lo que hoy salva a los homónimos lejanos es el discriminador de distancia,
   que actúa **DESPUÉS** del fuzzy; la superficie existe para que se sepa de quién depende eso. Tocar
   `normalize_nombre()` se midió y se descartó (`docs/reports/AUDITORIA_NORMALIZACION_NOMBRES_2026-08-27.md`).
   ⚠️ **No depende de la zona auditada** — sale igual en los dos logs de la noche. La marca 🆕 sale de
   `output/colisiones-catalogo-conocidas.json` y significa *"este audit nunca lo vio"*, **no** *"apareció
   hoy en el catálogo"*; el archivo se escribe en un temporal y se renombra.
   📌 **Por qué existe:** los tres alias intrusos de esta semana se encontraron **de rebote**, tirando del
   hilo de una prop mal matcheada. El pm 156 "Condominio Portofino" llevó **nueve meses** capturando
   propiedades ajenas sin que ninguna alarma lo viera.
   🔎 **Se puede correr sola, en cualquier momento:**
   ```
   node auditar-matching-shadow.mjs --solo-colisiones
   ```
   No lee propiedades, no toca la bandeja `audit_hallazgos` y **no deja la marca de audit completo del
   día** — o sea, no le miente a los reintentos agendados. Útil después de cargar fichas nuevas.

11b. **UNA PROP CAYÓ DEL LADO EQUIVOCADO DE UNA COLISIÓN** (31-ago-2026) — la 11 mira el catálogo;
   ésta mira si alguna **propiedad** ya cayó del lado malo. Nació de `2702`: el aviso dice *"Condominio
   Camila"* sin numeral y estaba colgado de `pm 412 "Edificio Camila II"` **a 565 m**, cuando
   `pm 584 "Condominio Camila"` está **a 3 m**.
   🔑 **La cronología explica el mecanismo, y se repite:** la ficha 412 se creó el 28-may · la prop
   entró el 29-jul, cuando 412 era la ÚNICA "camila" → **el match era correcto en ese momento** · la
   584 se creó el 17-ago → desde ese día la prop le pertenecía a la 584, y **nada la re-matcheó**.
   Estuvo mal 14 días. **El matcher no re-matchea props viejas**, así que cada ficha nueva puede dejar
   huérfanas propiedades ya capturadas, en silencio.
   🔴 **Ninguna otra superficie podía verlo:** la 5 dispara a los **800 m** y eran 565; la 2 exige
   **zona distinta** y las dos fichas comparten zona.
   🔑 **ES UNA CONJUNCIÓN, Y NINGUNA MITAD SIRVE SOLA** — medido sobre las 985 props activas con ficha
   y nombre, ANTES de escribir el código:
   · solo el **NOMBRE** (calza exacto con otra ficha y no con la suya) → **7 casos, los 7 falsos
     positivos**: avisos que dicen "Barcelona" a secas, en `pm 273 "BARCELONA 04.05 Miró Tower"` a 9 m
     —correcto— que calzan con `pm 427 "Condominio Barcelona"`, a **6.838 m**.
   · solo la **DISTANCIA** (una hermana está más cerca) → **5 casos, 4 de ruido**: Platinum 46 vs 0,
     Condado 1.317 vs 1.277, Galil 304 vs 278, Barak 32 vs 30 — el error del pin, no del match.
   · **las dos juntas → 1 caso, y era el real.** El nombre dice quién PODRÍA ser; la distancia, quién ES.
   Compara por **núcleo** (`nucleo()` de `lib/filtrar-alias.mjs`): saca el prefijo genérico y **CONSERVA
   el numeral**, que es justo lo que `normalize_nombre` borra y por eso el matcher no lo ve.
   Saltea **pines genéricos** (ahí la distancia es una ilusión) y props con **candado** en
   `id_proyecto_master`. **REPORTA, NO DECIDE** — el veredicto lo da un humano leyendo el aviso.
   ✅ **Validada contra el caso que la motivó** (regla del proyecto: un detector que da 0 hay que
   probarlo contra su caso fundador, o no se distingue "limpio" de "roto"). Simulando 2702 en pm 412:
   dispara, y ni el filtro de pin genérico ni el de candado la habrían suprimido.

## Flujo de ejecución (desde `scripts/deptos-equipetrol/`)

### 0. 🔁 Si te disparó un REINTENTO agendado: `--si-falta` decide si te toca correr

```
node auditar-matching-shadow.mjs --zona=todas --si-falta
```
**Corré esto PRIMERO cuando la corrida sea un reintento agendado** (no la de las 04:53). El script
decide solo y sale en menos de un segundo si no le toca:
- **Ya corrió hoy con las 4 capturas** → `⏭️ Nada que hacer` y sale. **No sigas con los pasos de
  abajo**: el audit del día ya está hecho y su log ya está escrito.
- **Todavía faltan capturas** → `⏳ Todavía faltan capturas` + cuáles. Sale. Lo tomará el próximo
  disparo. **Tampoco sigas.**
- **Están las 4 y aún no corrió con ellas** → `▶️ corro ahora` y hace el audit completo. Seguí con
  los pasos 2 en adelante (juez, SQL, log, Slack) como una corrida normal.

🔑 **Por qué se agenda EL AUDIT varias veces en vez de que la última captura lo llame:** si esa captura
falla o la cadena se desordena, un audit que dependa de ella no corre nunca. Así el audit no depende
del eslabón más frágil — el primer disparo que encuentre las 4 capturas hace el trabajo.

📌 **De dónde salió** (21-ago-2026): el audit se disparó **09:01** y las 4 capturas **09:06–09:11** —
la máquina había dormido y todas dispararon juntas al arrancar. La guarda lo detectó y abortó
correctamente, pero **el re-corrido hubo que pedirlo a mano**, y sin eso el parte de la mañana habría
descrito el inventario de la víspera. La marca del día vive en `output/.audit-completo-<fecha>.json`
y solo se escribe si el alcance fue COMPLETO: un audit parcial no bloquea al que sí pueda ver todo.

### 1. Correr la fase mecánica ($0, sin fetch)
```
node auditar-matching-shadow.mjs --zona=equipetrol    # ambas operaciones
node auditar-matching-shadow.mjs --zona=zona-norte    # 🔴 SIEMPRE también esta
node auditar-matching-shadow.mjs --op venta --zona=zona-norte
node auditar-matching-shadow.mjs --op alquiler --limit 40
```
🔴 **ALCANCE — pasá SIEMPRE la zona explícita, y cubrí las dos.** El default de la perilla
(`lib/zonas-hibrido.mjs`) es `equipetrol`, pensado para el pipeline de **captura** (aislar ZN para que
no arrastre a Equipetrol si algo sale mal). En un **audit** ese mismo default es una trampa: lo no
auditado se lee como limpio. Pasó el **30-jul-2026** — la routine corrió sin `--zona`, Equipetrol dio
cero y el parte habría dicho "nada que aplicar" con 17 UPDATE y un PM_NUEVO esperando en ZN.
Desde el 30-jul el `.mjs` **avisa** cuando quedan filas activas fuera del alcance (`🔴 ALCANCE PARCIAL`):
si aparece, corré la zona que falta o usá `--zona=todas`. Ver memoria `project_audit_nocturno_no_ve_zona_norte`.

Escribe `output/audit-matching-shadow-<ts>.json` con `superficie_1` (+ `candidatos`) y `superficie_2`
(+ `pm_actual`/`pm_nombre`/`pm_zona`/`dist_metros`). Si ambas están en 0 → nada que auditar, reportá.

> **Superficie 1 · ruido conocido** (30-jul-2026): el `.mjs` desvía a `superficie_1_ruido_conocido` las
> props cuyo `nombre_edificio` ya fue juzgado como **no-edificio** — odónimos ("Los Jazmines" es una
> calle de Sirari) y prefijos-familia ambiguos ("Sky Collection", "Galil", "Baruc"). **No van al juez**
> y siguen sin match, que es el veredicto correcto; lo que se evita es re-juzgar lo mismo cada noche
> (8000213 y 8000253 cayeron 6 noches seguidas). La lista es `NOMBRES_NO_EDIFICIO` en el `.mjs`:
> comparación **exacta** del nombre normalizado (nunca `includes` — "Sky Collection Tulip" sí va al
> juez), solo casos **ya decididos** con su fecha, y siempre **declarados** en el resumen. Si un caso
> deja de ser ambiguo, el arreglo va al **alias del catálogo** y la entrada se saca de la lista.

> **Superficie 3 (duplicados) es DETERMINÍSTICA** — no necesita juez. El `.mjs` ya trae los clusters
> (`sobreviviente` + `duplicados`). Confirmá por lectura los clusters de 2 y los de `área=0` (clave débil);
> los grandes (apart-hotel, ≥5 avisos idénticos) son seguros. SQL directo en el paso 4.

### 2. Lanzar el JUEZ — subagentes-lectores (superficies 1 y 2)
Agrupá cada superficie en lotes de ~6-8 y lanzá **subagentes `general-purpose` en paralelo** (varios en un
mensaje). Cada uno lee `descripcion_anuncio` + `titulo` + `pistas_nombre` (NO fetchea — ya está guardado):

> Sos auditor de matching inmobiliario en Santa Cruz. Leé el `titulo`+`descripcion` del anuncio y
> determiná el edificio EXACTO que nombra (con su **número/torre/romano** — "Macororó 13"≠"15",
> "Stone 3"≠"III", "Uptown Drei"≠"Uptown Equipetrol"). Veredicto por prop:
> - **Superficie 1** → **APROBAR(pm_candidato)** si el anuncio nombra ese edificio exacto y hay candidato
>   con score alto · **PM_NUEVO(nombre_real)** si nombra un edificio claro no cargado · **SIN_NOMBRE** si no.
> - **Superficie 2** → **CONFIRMAR** si el anuncio nombra el `pm_nombre` actual (número incluido) ·
>   **CORREGIR(otro pm)** si nombra OTRO · **RECHAZAR** si el anuncio no nombra ese edificio (FP).
> Atractores (NO confiar en nombre único): "CONDOMINIO ONE", "Sky…", "Brickell". Devolvé tabla:
> `prop_id | superficie | pm sugerido/actual | nombre_real | veredicto | cita textual`.

### 3. Cruzar CORREGIR/PM_NUEVO contra `proyectos_master` (MCP `postgres-sici`, read-only)
Igual que la skill madre: por cada `nombre_real`, `SELECT ... FROM proyectos_master WHERE nombre_oficial
ILIKE ANY(...)` + verificar `dist` prop↔pm-candidato. Nombre + GPS combinados mandan; el GPS roto del
portal NO bloquea un nombre explícito (matchear por nombre igual). PM_NUEVO = `gps_verificado_visual='si'`
solo tras verificación humana (el founder da el GPS en Google Maps). NO inventar GPS.

### 4. Generar el SQL — contra `propiedades_v2` (NO aplicar; el humano lo corre)
- **Candado `AND id_proyecto_master IS NULL`** en cada UPDATE de superficie 1 (no pisa lo ya correcto).
- Superficie 2 CORREGIR/RECHAZAR: `UPDATE propiedades_v2 SET id_proyecto_master=<nuevo|NULL>` +
  **candado formato-OBJETO** si es cluster numerado (un string NO protege, `feedback_candado_formato_objeto`):
  ```sql
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'id_proyecto_master', jsonb_build_object('bloqueado',true,'por','auditor_cola_shadow',
       'fecha','<YYYY-MM-DD>','razon','cluster numerado','valor_original',id_proyecto_master))
  ```
- `metodo_match` (en `datos_json.trazabilidad`) → dejar traza `auditor_cola_shadow_<fecha>`.
- 🔴 **CONFIRMAR también se ESCRIBE** (superficies 2 y 4) — desde el 30-jul-2026. Un CONFIRMAR que no
  deja rastro hace que la prop vuelva al juez **todas las noches**: las 13 de superficie 4 se
  confirmaron 13/13 de madrugada y reaparecieron intactas 5 h después; `8000275`/`8000145`/`8000187`
  llevaban **6 noches** confirmándose. Emitir SIEMPRE, junto con los CORREGIR/RECHAZAR:
  ```sql
  datos_json = COALESCE(datos_json,'{}'::jsonb) || jsonb_build_object(
    'trazabilidad', COALESCE(datos_json->'trazabilidad','{}'::jsonb) || jsonb_build_object(
      'confirmado_por','auditor_cola_shadow_<fecha>',
      'confirmado_evidencia','<la cita que sostiene el match>',
      'confirmado_superficie', <2|4>))
  -- candado: AND datos_json->'trazabilidad'->>'confirmado_por' IS NULL
  ```
  El `.mjs` excluye lo tagueado de las superficies 2 y 4 y lo **declara** aparte
  (`ya_confirmados_por_auditor`). Revocable: `datos_json #- '{trazabilidad,confirmado_por}'`.
  ⚠️ **NO** lograr el mismo efecto subiendo `confianza_lector` a `'alta'`: eso manda la prop al
  **punto ciego** (los `lector_fijo` de confianza alta no entran a NINGUNA superficie). El tag deja la
  confianza original intacta y mantiene la prop elegible para el muestreo del punto ciego.
  Plantilla completa: `output/04-SHADOW-confirmados-2026-07-30.sql`.
- **Superficie 3 (dedup):** `UPDATE propiedades_v2 SET duplicado_de=<sobreviviente>, fecha_actualizacion=NOW()
  WHERE id IN (<duplicados>)`. La vista filtra `duplicado_de IS NULL` → salen del feed. **Reversible** (`=NULL`).
  Confirmá por lectura los clusters de 2 antes de aplicar; los apart-hotel grandes son directos.
  ⚠️ **El `.mjs` ya ignora props con `duplicado_de`** (si no, marcaría un sobreviviente ya elegido →
  CICLO A↔B → el edificio se oculta entero; bug cazado 14-jul, Santorini/Lofty). No re-introducir props
  ya deduplicadas al cluster. 🔴 **Desde el 4-ago `duplicado_de` ya NO viene solo heredado de prod**: lo
  escribe también el cargador en `--apply` cuando C21 reescribió el slug (`dedup_por='cargador_slug_reescrito'`).
  El filtro aplica igual — pero no asumas que una fila con `duplicado_de` nació en el régimen viejo.
- **Superficie 9 — EL AVISO HABLA SOLO EN BOLIVIANOS Y NO ESTÁ TAGUEADO `bob`** (20-ago-2026, en el
  `.mjs`). **Origen:** `8000699` (Vilareal Duo). El aviso decía *"Precio: Bs. 382.800"* y nada más —
  ni una mención de dólares. Alguien lo dividió por 6,96 y guardó **$55.000**, cuando al cambio real
  son **$33.097**: **66% de sobreprecio**, en el feed y en el bot.
  🔑 **Por qué este detector y no "revisar los tags de TC"** (medido antes de escribirlo): la vía del
  tag daba **83% de falsos positivos** — de 6 candidatos, 5 tenían el tag bien puesto (ver §8) — y
  necesitaba un juez LLM para confirmar 5 de cada 6. **La moneda, en cambio, es inequívoca**: si el
  aviso sólo habla en Bs, el precio está en Bs. Sobre 769 avisos dio **exactamente 1 resultado y era
  el correcto: 0 falsos positivos, sin juez.** Mismo razonamiento que la superficie 7 con Sky Eclipse:
  no se toca lo que funciona, se agrega el detector que SÍ discrimina.
  **Filtros:** monto en Bs de 5+ dígitos (para no cazar *"expensas Bs 500"*) **y** ninguna mención de
  dólares. **Rastro:** `datos_json.trazabilidad.moneda_revisada`.
  🔴 **REPORTA, NO DECIDE — y el arreglo mueve el PRECIO, no sólo el tag**: los `bob` guardan los
  **bolivianos crudos** en `precio_usd` y la vista los divide por el TC del día.
  ```sql
  UPDATE propiedades_v2
  SET precio_usd = <los Bs del aviso>, tipo_cambio_detectado = 'bob', moneda_original = 'BOB',
      datos_json = COALESCE(datos_json,'{}'::jsonb) || jsonb_build_object(
        'trazabilidad', COALESCE(datos_json->'trazabilidad','{}'::jsonb) || jsonb_build_object(
          'moneda_revisada','auditor_superficie_9_<fecha>','moneda_revisada_evidencia','<la cita>'))
  WHERE id = <ID> AND tipo_cambio_detectado <> 'bob';   -- candado
  ```
  ✅ **Validado el 20-ago**: da 0 y **el 0 es real** — corriendo la misma lógica sin el filtro `<> bob`
  aparecen **18 avisos en bolivianos y los 18 están bien tagueados**, incluido su caso fundador.
  🔑 Un detector que da 0 hay que probarlo contra el caso que lo motivó: si no, no se distingue
  *"limpio"* de *"roto"*.
- **Superficie 8 — TAG DE TC SIN ANCLA EN EL AVISO — ⛔ DESCARTADA como superficie automática
  (20-ago-2026), queda como registro:** props con
  `tipo_cambio_detectado = 'oficial_viejo'` cuyo aviso **no menciona el número** (6.96 / Bs 7 / TC 7).
  Ese tag enciende el badge **"Cotiza a Bs 7"** en el feed (commit `e966096`), así que un tag mal
  puesto le hace decir a la card algo que el anuncio no dice.
  🔴 **NO SE PUEDE DETECTAR CON REGEX — está probado.** Se intentó tres veces el 20-ago y las tres
  fallaron en variantes distintas: `T/C 7` (con barra), `Tipo de cambio; 7` (punto y coma),
  `¡A TIPO DE CAMBIO 7!` (mayúsculas y signos), `TC 6.97` (no 6.96). Cada patrón daba un número
  distinto — 85, después 14, después menos. **Ninguno era confiable.** Por eso el tag lo pone un
  lector que lee el aviso ENTERO, y por eso la revisión va acá: es la única herramienta que puede
  leer con criterio.
  **Antecedente real:** dos props (`8000937`, `8000943`) tenían el tag porque el lector razonó que
  *"el BCB es la institución del rate viejo"* — y el BCB es el oficial **vigente**. Se corrigieron a
  mano el 20-ago (commit `eca70f2`); el spec ahora lo nombra. Quedan **~12 candidatos** del mismo
  tipo. Medición de referencia: de 97 con el tag, **83 sí anclan al número** (12 dicen 6.96, 71 dicen
  "cambio 7") — el badge está bien en la gran mayoría.
  **Veredicto del juez:** CONFIRMAR el tag · CORREGIR a `no_especificado` (si no hay ancla numérica)
  · o `paralelo`. ⚠️ **Corregir el tag NO mueve el precio**: en el régimen nuevo el único tag que
  transforma el precio es `bob`. Lo único que cambia es si el badge se enciende.
  🔑 **Hueco declarado que hoy no se puede cerrar:** un aviso anclado a un valor INTERMEDIO
  (8.50 / 9 / 10) merecería badge y no hay palanca para encenderlo sin mentir sobre el rate. Son 4.
  ✅ **PRIMERA CORRIDA — 20-ago-2026. De 6 candidatos, 5 tenían el tag BIEN puesto.** No apareció
  ningún caso del tipo BCB. Los 5 los trajo el filtro porque el ancla al 7 está escrita de formas que
  **ningún regex alcanza** — y esto es la prueba concreta de por qué esta superficie existe:
  · `T. C. 7.00` (puntos y espacios) · `Tipo de cambio promocional de Bs. 7` (19 chars de por medio)
  · `(𝐓𝐂 𝟕)` **en Unicode decorativo** — no son las letras T y C
  · `$us 70.000 (Bs 490.000)` y `100,000$us o Bs 700,000` → **el ratio da 7,0 exacto sin nombrar el
    tipo de cambio**. No existe expresión regular para *"estos dos números se dividen en 7"*.
  🔴 **El único que estaba mal NO era un tag ambiguo: era una MONEDA mal clasificada.** `8000699`
  (Vilareal Duo) publicaba *"Precio: Bs. 382.800"* y nada más; alguien lo dividió por 6,96 y guardó
  **$55.000** cuando al cambio real son **$33.097** — 66% de sobreprecio, en el feed y en el bot.
  Corregido a `bob` (los Bs crudos van a `precio_usd`, como los otros 50; la vista divide por el TC
  del día). **Caso único en los 769 avisos**, verificado con el patrón completo.
  📌 **Rastro para no re-juzgar:** los confirmados llevan `trazabilidad.tc_confirmado_por`.
  🔑 **Clave PROPIA, no `confirmado_por`**: esa la usan las superficies 2 y 4 para el juicio de
  MATCHING, y un confirmado de tipo de cambio no debe apagar el juicio de matching de esa prop.
  Filtro: `AND datos_json->'trazabilidad'->>'tc_confirmado_por' IS NULL`.
  Plantilla: `output/08-TC-confirmados-2026-08-20.sql`.
- **Superficie 6 (estado de obra):** el veredicto NO va a la propiedad, va al **catálogo del edificio**
  — es una característica del edificio, no del aviso (si va en la prop hay que repetirla en cada aviso
  nuevo). Y **se guarda la FECHA DE LA OBSERVACIÓN, no el estado a secas**: *"al 6-ago-2026 ya estaba
  entregado"* es verdad para siempre; un estado suelto se pudre (por eso `estado_construccion` acierta
  solo 78%). No hace falta averiguar cuándo se entregó: alcanza una fecha en la que ya lo estaba.
  ```sql
  UPDATE proyectos_master
  SET entrega_verificada = 'entregado',        -- o 'en_pozo'
      entrega_verificada_at = NOW(), entrega_verificada_por = 'founder',
      entrega_verificada_notas = '<cómo lo supo: visita / foto / dato del captador>'
  WHERE id_proyecto_master = <ID> AND entrega_verificada IS NULL;   -- candado
  ```
  ⚠️ **`'entregado'` no caduca nunca; `'en_pozo'` caduca a los 365 días** (lo aplica la vista, mig 315):
  un *"lo vi en obra"* de hace dos años no dice nada del edificio de hoy.
  ⚠️ **Toca PROD (`proyectos_master`)** — invariante shadow: pedir OK explícito, igual que los alias.
  Plantilla: `output/07-ESTADO-OBRA-dictado-founder-2026-08-06.sql`.
- Temp tables con VALUES multilínea para listas de IDs. Cerrar con SELECT de verificación; el humano
  hace COMMIT/ROLLBACK. **PM_NUEVO**: si el catálogo es prod (read-only en fase shadow), los alias/PM
  nuevos se REGISTRAN para el cutover — NO se escriben a `proyectos_master` ahora (invariante shadow).

### 5. Reportar + preguntar + **avisar por Slack**
Tabla ejecutiva: `prop | superficie | pm sugerido/actual | veredicto | pm final | evidencia`. Totales por
veredicto. **NUNCA aplicar UPDATEs sin OK.** Ofrecé correr con `ROLLBACK` primero; pedí los GPS de los
PM_NUEVO al founder. Log en `output/audit-cola-shadow-log.md`.

**Y mandá el aviso a Slack:**
```
node notificar-slack.mjs "<resumen>"
```
> ⚠️ **Acá el aviso importa MÁS que en el cron.** El cron escribe a shadow solo (su trabajo queda hecho
> aunque nadie mire); **la salida de este audit es 100% pendientes del humano** — SQL que alguien tiene
> que aplicar. Si corre de noche y nadie lo ve, **la cola crece en silencio y el matching se degrada**.

El mensaje debe decir **qué hay para aplicar y dónde**:
- **🔔 con pendientes** — `🔔 *Audit cola shadow* · N revisados` + `X corregir · Y PM_NUEVO · Z alias` +
  **dónde está el SQL** (`output/audit-cola-shadow-log.md`) + si hay PM_NUEVO, que **faltan los GPS del
  founder** (los bloquea).
- **✅ sin pendientes** — `✅ Audit cola shadow · N revisados · nada que aplicar`. Decirlo **explícitamente**:
  sin esto no se distingue "corrió y está limpio" de "no corrió".

## Reglas (heredadas + propias de shadow)
1. **Score/nombre-único ≠ juez.** El número del cluster y la lectura mandan. `nombre_unico_zona_dif` con
   dist grande = sospechoso; con dist≈0 = casi seguro OK (pero igual lo lee el juez).
2. **Candado `IS NULL` imprescindible** (superficie 1) + **formato-objeto** (superficie 2 clusters).
3. **SIN_NOMBRE → sin match** es correcto (mejor que un FP).
4. **SHADOW, read-only.** El `.mjs` no escribe; el SQL va contra `propiedades_v2`; a prod solo
   SELECT + RPC. PM/alias nuevos se registran para el cutover, no se escriben a prod.
5. **El juez lee el anuncio GUARDADO** (no re-fetch). El drift lo cubre `/audit-deptos-shadow`.

## Relación con las otras skills
- **`/audit-deptos-shadow`** = drift + cambio de precio en portal (re-fetch). Este = matching (sin fetch).
  Complementarios: corré este PRIMERO (matching sano) y el de drift después.
- **`/audit-cola-matching`** (prod) = la skill madre, sigue viva para macrozonas en n8n.
- Contexto: `AUDITORIAS_POST_CUTOVER.md` + memoria `project_checkpoint_deptos_hibrido`.
