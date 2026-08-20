# /cron-deptos-ventas — Captura híbrida de deptos Equipetrol → SHADOW (bajo Max, gratis)

> ⏰ **AGENDADO (21-jul-2026): corre SOLO todas las noches como routine local, PRIMERO de la cadena**
> (`~/.claude/scheduled-tasks/cron-deptos-equipetrol/`). Gemelos: **alquiler Equipetrol**, las dos de
> **Zona Norte** y **`/audit-cola-shadow` al final** (escalonados: el audit audita lo que las capturas
> cargaron, y nunca hay dos crawls simultáneos). Horarios exactos en la tabla de `revisar-routines.command.md` (única fuente de horarios).
> Avisan por **Slack** al terminar (`notificar-slack.mjs`).
> ⚠️ **Las routines NO están en git** — viven en `~/.claude/scheduled-tasks/`, como las skills de
> `.claude/commands/`. Son config de la máquina del founder. Si migrás de máquina, hay que recrearlas.
> ⚠️ **Corren en la máquina del founder, no en un servidor.** Si está apagada/dormida a esa hora, la
> corrida se ejecuta **al siguiente arranque de la app** (no se pierde el día; el discovery es
> shadow-relativo → lo no capturado sigue siendo "nuevo" la corrida siguiente). Ver
> `CUTOVER_DATA_PLAN.md` §Automatización (Fase 0 vs Fase completa).
>
> **Fuente de verdad** de este comando. Copiar a `.claude/commands/cron-deptos-ventas.md` para usarlo
> como `/cron-deptos-ventas` (las skills viven gitignored en `.claude/commands/`; el repo guarda el `.command.md`).
>
> **Qué es:** corre el ciclo híbrido de deptos-venta Equipetrol COMPLETO dentro de la sesión —
> discovery propio → lectura (MOAT) → apply → feed — contra el **entorno SHADOW aislado**
> (`propiedades_v2`). **PROD (n8n) queda intacto.** El único paso que necesita "modelo"
> (el MOAT = leer el anuncio y dictar precio/TC/dorms/nombre/gate) lo hacen **subagentes-lectores en
> paralelo** (patrón `/audit-cola-matching`) → **gratis, bajo Max, sin API, sin servidor**.
>
> **Opción A (corrido con cola al final):** el comando encadena los pasos de una y termina imprimiendo
> la cola de excepciones (PM_NUEVO, ambiguos, sin-match). NO se aprueba depto por depto: el juez
> dictamina, y el humano solo resuelve los dudosos que quedan al final.
>
> **Gemelo:** `/cron-casas` (mismo patrón, para casas ZN a prod). Diseño y decisiones:
> `SESION_READER_DISCOVERY.md`, `ESTADO_MIGRACION.md`, `READER_SPEC.md`, `TC_NUEVO_DECISION.md` +
> memoria `project_checkpoint_deptos_hibrido`.

## Alcance de HOY (incremento 1 — EXISTENTES)

Este comando procesa las **existentes** (deptos ya en `propiedades_v2` que el híbrido RE-lee para
corregir precio/TC/matching y llevarlos a shadow con el régimen TC nuevo). Es la mayor parte del
inventario que rota. Las **nuevas** (en el portal, aún no en prod) quedan para el **incremento 2**
(ver §Pendientes) porque requieren asignarles `id` en shadow — decisión de diseño propia.

## Pasos (ejecutá en orden, todo desde `scripts/deptos-equipetrol/`)

> Primera vez en una máquina nueva: `cd scripts/deptos-equipetrol && npm install`.

### 0. Refrescar el tipo de cambio paralelo (PRIMERO, antes de leer nada)
```
node capturar-tc-binance.mjs --apply
```
Trae el TC de Binance P2P (promedio de los 5 primeros SELL) y actualiza `config_global`, dejando la
fila en `tc_binance_historial`. **Va primero porque el clasificador de la captura de esta noche lo
usa**: `clasificarTCporRatio()` decide si el precio de un aviso está en dólares o en bolivianos
comparando contra el paralelo vivo, con 6% de tolerancia. Hasta hoy las 4 capturas nocturnas **leían**
el TC y ninguna lo **refrescaba** — quedó congelado 16 días (27-jul → 12-ago) y llegó a 0,95% de
brecha. Un falso positivo de `paralelo` es "el bug histórico que infló 368 deptos".

🔴 **UN FALLO ACÁ NO FRENA EL CRON.** El script sale con `exit 1` en cinco situaciones (Binance no
responde, TC fuera del rango 8–15, salto mayor al 10%, doble corrida del día). **Todas son
correctas** —son guardarraíles, no errores— y en todas la razón queda escrita en
`razon_no_aplicado`. Si este paso falla: **anotalo en el log del paso 7 y seguí con el paso 1**. La
captura de la noche vale mucho más que el TC del día, y con el valor viejo el clasificador sigue
acertando por semanas (la brecha crece lento: 16 días = 0,95%, el umbral es 6%).

⚠️ Solo va en ESTE cron, que es el primero de la noche (01:17). Los otros tres (alquiler Eq y los dos
de ZN) heredan el valor fresco y **no deben repetirlo**: el script se niega a correr dos veces el
mismo día salvo `--force`, así que repetirlo solo generaría ruido de error.

Detalle: `docs/arquitectura/TC_BINANCE_DIAGNOSTICO_2026-08-11.md` · plan y foto previa en
`TC_BINANCE_PLAN_2026-08-12.md`.

### 1. Discovery + diff (read-only, no escribe)
```
node discovery-deptos.mjs
```
Sale a C21 + Remax (tipo=departamento, red ancha Equipetrol), filtra por `get_zona_by_gps` ∈ las 6
microzonas, y diffea contra `propiedades_v2`. Mirá el resumen: **NUEVAS**, **existentes**,
**desaparecidas**. Escribe `output/discovery-deptos-<ts>.json`.
- 🔁 **4ª señal — SLUG REESCRITO por C21** (PR #64, 4-ago-2026). C21 arma la URL como
  `/propiedad/<codigo>_<slug>` y **reescribe el slug cuando el captador edita** (baja el precio, corrige la
  tipología, cambia el nombre del edificio). La URL cambia → el aviso entraría como NUEVO y el mismo depto
  quedaría dos veces, con dos precios. El discovery lo detecta por el código y lo imprime así:
  `🔁 N con SLUG REESCRITO por C21 (mismo código, URL nueva)` + una línea por caso.
  **NO se filtran: se capturan** (el precio nuevo es el vigente; saltearlas dejaría el viejo para siempre).
  Van marcadas con `reemplaza_a` en el JSON, y el `resumen` suma `slug_reescrito_c21`.
  ⚠️ Si alguna dice **`cambió de zona (X → Y), revisar`** → mirala: el índice de códigos se cruza contra
  shadow **COMPLETO, sin filtrar por zona** (el código es único en todo C21), así que un aviso que cambió de
  zona lo detecta igual. Es raro y vale confirmarlo.
- Si el circuit breaker (🛑) se dispara → **no insistas**, la IP está bloqueada, esperá unas horas.
- Cooldown de 20 min entre corridas (`--force` para saltarlo, con criterio).

### 2. Prep — material de lectura de las EXISTENTES (read-only, gratis)
```
node cargar-deptos-shadow.mjs --prep 40
```
Fetchea el detalle (gratis) de hasta N existentes **frescas** (excluye las ya en shadow + las rechazadas)
y arma `output/material-<ts>.json` con `veredicto: null` por depto. N agnóstico a la fuente (drena
C21 y Remax parejo). Para re-leer ids puntuales: `--prep --ids 3521,3540,...`.
- El material trae: slug, título, descripción, señales estructuradas (precio/TC/dorms/baños/piso/área),
  la lectura de n8n para contrastar, `tasa_paralelo` del lote (Binance) y candidatos de matching.

### 2b. Prep NUEVAS — capturar inventario que NO está en prod (read-only, gratis)
```
node cargar-deptos-shadow.mjs --nuevas output/discovery-deptos-<ts>.json 40
```
Fetchea el detalle (por URL, no por id) de las **NUEVAS** que el discovery vio en el portal pero que no
están en prod, y les asigna un **id reservado shadow** (rango 8M; el id real lo da prod al cutover). Van
al MISMO flujo MOAT + apply (pasos 3-4). Es lo que hace que el comando CAPTURE inventario nuevo, no solo
re-lea las existentes. (Opcional si el discovery reportó 0 nuevas.)

### 3. MOAT — lectura por subagentes-lectores (el juez; lo hacés VOS con subagentes)
```
node partir-lectura.mjs output/material-<ts>.json 10   # → lectura-venta-<AAAA-MM-DD>-c1..N.json
```
Lanzá **N subagentes en paralelo** (patrón `/audit-cola-matching`). Cada uno lee su
`lectura-venta-<fecha>-cK.json` + **`READER_SPEC.md`** y escribe `output/veredictos-venta-<fecha>-cK.json`
(array con `id`). Mergeá los veredictos de vuelta al `material-<ts>.json`.

> 🔴 **Usá SIEMPRE estos nombres; no inventes uno.** Antes esta skill no prescribía ninguno y el agente
> improvisaba `lectura-chunk-N.json` / `veredictos-chunk-N.json` — **los mismos que usaba alquiler**.
> El 28-jul-2026, con las dos routines corriendo en paralelo (pasa cuando la máquina durmió y las 3
> disparan juntas), el que escribía segundo **pisaba** al primero: un lector de venta vio cambiar su
> propio chunk entre dos lecturas, con ids y schema de ALQUILER. El daño es **silencioso** —
> `inyectar-veredictos.mjs` matchea por id, así que no mezcla data ajena: PIERDE veredictos y esas
> props se caen del apply sin aviso. El chunk trae `"operacion": "venta"` adentro: **si no coincide,
> parar y avisar**.

#### 🔁 Reintento con backoff (obligatorio en corrida desatendida — agregado 30-jul-2026)
Si un subagente-lector falla por error de **servicio** (`529 Overloaded`, `500`, timeout, "API Error"):

0. 🕐 **PONELE RELOJ: lanzá cada chunk en BACKGROUND y cortalo a los 10 minutos.**
   Un lector sano tarda **2-4 minutos**. Si a los 10 no devolvió, dalo por muerto, **cortalo**
   (`TaskStop`) y relanzá ese chunk — no esperes a que falle solo.
   🔴 **Por qué**: el 19 y el 20-ago-2026 los lectores no fallaron rápido, se colgaron **60 y 80
   minutos** y murieron *sin escribir el archivo de veredictos*; los reintentos salieron en **2 y 3
   minutos**. Con esa forma de morir, el backoff de abajo es irrelevante: el tiempo muerto ya lo
   puso el propio intento. **Costo medido de esas dos noches: ~2,5 h de cadena**, y el audit terminó
   corriendo ANTES que la última captura, así que su "0 en las 7 superficies" no cubría la noche.
1. **Reintentá ese chunk hasta 3 veces**, esperando **60s → 180s → 300s** entre intentos.
2. Si a la 3ª sigue fallando, **seguí con los otros chunks** y reintentá el que falló **al final**.
3. Recién si TODO falló, leé inline en la sesión con el mismo `READER_SPEC.md` — el juez sigue siendo
   un LLM, que es la regla que importa. **Si tuviste que leer más de 2 chunks inline, abortá y avisá
   por Slack** en vez de entregar una corrida a medias.
4. **Registrá en el log** cuántos chunks reintentaron y cuántos se leyeron inline.

> 🔑 **Por qué reintentar y NO achicar la tanda:** el 30-jul los dos intentos de subagente murieron
> con `529` **con 4 props** (la lectura terminó haciéndose inline), mientras que el 29-jul se leyeron
> **166 props en 13 chunks** sin drama. Un `529` es del lado del servicio, no del tamaño del payload
> — ese día Anthropic estuvo inestable. Achicar la tanda no lo evita: solo alarga el backlog.

Cada `veredicto` sigue el schema de `READER_SPEC.md`. Lo esencial:
- **gate**: `aceptar` | `rechazar` (+ `razon_gate`). Rechazar = multiproyecto, anticrético, baulera,
  parqueo, o precio irrecuperablemente contradictorio. Es lo más importante — un error acá mete basura.
- **precio_usd** (CRUDO, la descripción manda) + **tipo_cambio_detectado**:
  - `oficial_viejo` → texto ancla EXPLÍCITO a "6.96" / "Bs 7" / "TC 7" (se coticó al rate viejo barato).
  - `bob` → C21 en bolivianos sin precio USD en el texto (`precio_usd` = monto BOB, se normaliza LIVE).
  - `paralelo` / `oficial` / `no_especificado` → **default** (oficial-nuevo ≈ paralelo; USD directo).
  - Regla: elegí el TC que deje $/m² coherente (~$1.700–2.200); ver memoria `feedback_clasificacion_tc_por_m2`.
- **dormitorios** (0 = monoambiente), **banos**, **piso**, **nombre_edificio_canonico** (o `null` si
  el aviso no lo da — NUNCA forzar por GPS), **amenidades/amenidades_extra/equipamiento**, **amoblado**,
  **es_multiproyecto** (taguea, no rechaza).

> La normalización shadow ya entiende `bob`/`oficial_viejo`/default (`precio_normalizado_shadow`) — el
> lector solo emite el tag + el crudo; el feed traduce en vivo. No pre-normalizar.

### 4. Apply — escribe la fila correcta a shadow (muta SOLO `propiedades_v2`)
```
node cargar-deptos-shadow.mjs --apply output/material-<ts>.json
```
Arma la fila de una (estructurado + veredicto), resuelve el match **name-first** (`matcher.mjs`:
score≥0.95+zona → AUTO; ambiguo/débil → sin match, lo levanta el audit; nunca fuerza por GPS), protege
`fecha_publicacion` con LEAST (anti re-scrape/bump), y upsertea. Rechazados → memoria en `rechazados.json`.
Imprime: **X escritos**, rechazados por gate, reporte por depto (precio/TC/dorms/pm), **alias sugeridos**
y **con-nombre-sin-auto-match** (= la cola de excepciones).

🔁 **MUTACIÓN ADICIONAL sobre filas PREEXISTENTES (PR #64):** si una fila traía `reemplaza_a` (slug
reescrito, ver paso 1), después de escribir la nueva el cargador marca **la vieja** con
`duplicado_de = <id nuevo>` + trazabilidad (`dedup_metodo='codigo_c21_identico_slug_reescrito'`,
`dedup_por='cargador_slug_reescrito'`). Imprime:
`🔁 slug reescrito por C21: N/M viejas marcadas como duplicadas <vieja>→<nueva>`.
Es el ÚNICO punto donde el apply toca filas que no vienen en el material. Guardas: candado
`duplicado_de IS NULL` · se saltea si la fila nueva falló al escribir · se saltea si la vieja no existe ·
`datos_json` se **mergea**, no se pisa. Reversible (`duplicado_de = NULL`).

### 5. Verificador — baja de desaparecidos (status-code-only + 2 señales)
```
node verificador-deptos.mjs           # DRY-RUN: reporta candidatos + HTTP
node verificador-deptos.mjs --apply    # aplica contador / baja confirmada
```
Lee las `desaparecidas` del discovery (paso 1), cruza con las que están en shadow (venta), y confirma
bajas SOLO con **2 señales** (ausencia del crawl + HTTP 404/redirect) sostenidas >2d. Gracia 2d (sigue
en feed mientras corre el contador), disyuntor 40% (crawl parcial → no baja nada), status-code-only
(inmune a placeholders/bloqueos). Escribe solo shadow, filtrado a venta. Gemelo: `verificador-alquiler.mjs`.

### 5b. Refrescar `pet_friendly` del edificio (chip, mig 278)
```
node derivar-pet-friendly.mjs
```
Recalcula `proyectos_master.pet_friendly` desde las unidades shadow (venta+alquiler juntos): `true` si el edificio
tiene alguna unidad con `acepta_mascotas=true` o amenidad "Pet Friendly" (solo señal positiva). Idempotente/
determinístico → mantiene el chip al día cuando entran props nuevas. Escribe SOLO esa columna (prod la ignora; no es
juicio → se automatiza). Las RPCs shadow (migs 279/280) la exponen como chip y sacan "Pet Friendly" de las amenidades.

### 5c. Snapshot diario shadow (serie de mercado, mig 283)
```
node snapshot-shadow.mjs
```
Guarda la foto del día en `market_absorption_snapshots_shadow` (tabla APARTE de la serie prod — su
UNIQUE no distingue versiones): inventario, precios TC-nuevo, absorción, spread preventa/entrega,
cortes amoblado/equipado/parqueo y yield venta×alquiler. **Idempotente** (upsert por fecha): también
corre en los crons posteriores (alquiler Eq y los dos de ZN) y cada pasada re-fresca la foto del día —
verlo dos veces NO es un error. Si falla avisa por Slack él mismo (la foto de un día no se reconstruye).

### 6. Verificar el feed shadow (que la data rica renderice)
Levantá el dev y mirá `localhost:3000/ventas?shadow=1` (hard-reload si ves prod por el SSG):
```
npm run dev --prefix ../../simon-mvp        # o preview_start simon-mvp-dev
```
Verificá con **Playwright** (mejor que el preview Chrome headless para este feed): precios del régimen
nuevo (paralelo a valor de cara, `oficial_viejo` descontado, `bob` live), equipamiento canónico + extra,
amoblado/equipado. Alternativa gratis sin browser: comparar por SQL `buscar_unidades_simple_shadow` vs prod.

### 6b. ¿El bot puede consultar el mercado? (prueba diaria, $0)
```
node probar-bot.mjs --slack
```
Corre las **3 RPC que usa el bot** (`resumen_mercado`, `buscar_propiedades`, `buscar_similares`) en
los 5 casos que importan, **con la clave anon — la misma que usa Kapso**.

🔑 **La llave es la decisión de diseño, no un detalle.** Las dos causas del incidente de 19 días
fueron permisos de `anon` (mig 315 sin GRANT, mig 317 con REVOKE). Con `service_role` esta prueba
habría dado **verde los 19 días con el bot muerto**. Probar con la llave equivocada es peor que no
probar: da falsa tranquilidad.

Falla si: HTTP ≠ 200 · la RPC devuelve error · **responde 200 pero sin datos** · o tarda más de 3 s
(el corte de Supabase). Avisa en amarillo por encima de 2 s: ahí se está comiendo el margen, que es
como `buscar_similares` llegó a 4,06 s sin que nadie lo viera.

Va acá, después de la captura, porque una migración aplicada durante el día puede haber roto los
permisos sin que nadie lo note — el bot **no avisa cuando no puede consultar**: deriva a un asesor y
se queda callado. Correr a mano en cualquier momento: `node probar-bot.mjs` (sin `--slack`).

**Si falla, va al log y al Slack de la noche.** No aborta el cron: la captura ya terminó.

### 7. Reportar + log + **avisar por Slack**
Reportá al usuario: cuántos escritos/rechazados/retenidos, las correcciones notables vs n8n (precio
corrupto cazado, TC re-clasificado, match recuperado), y **la cola de excepciones** (PM_NUEVO a crear,
ambiguos, sin-match). Registrá una línea en `output/cron-deptos-ventas-log.md` (fecha + números).

📌 **El log DEBE declarar el tipo de cambio del paso 0**, en una línea: el valor aplicado y la
variación, o **por qué no se aplicó** si falló. Sin eso, un TC congelado vuelve a ser invisible — que
es exactamente cómo pasó desapercibido 16 días. Ejemplos:
`TC: 11,528 (−0,95%)` · `TC: NO aplicado — Binance no respondió, sigue 11,528 (2 días)`.

**Y mandá el aviso a Slack** — el cron corre de noche sin nadie mirando; sin esto el founder queda ciego
(y n8n, que hoy sí avisa, se va a apagar):
```
node notificar-slack.mjs "<resumen>"
```
El mensaje va **corto y accionable**, y DEBE distinguir el caso:
- **✅ corrida OK** — `✅ Cron deptos-VENTA · <min> min` + `N nuevas → X escritas · Y rechazadas por gate` +
  `Verificador: A bajas · B revividas` + (si hubo) `🔁 N slug reescrito → N deduplicadas` + `📊 MB` +
  (si hay cola) `🔔 PARA VOS: <n> con nombre sin match · <n> alias sugeridos · <PM_NUEVO si hay>`;
  si no hay cola, decir **`Sin cola pendiente`** explícitamente.
  🔁 **El contador de slug reescrito va SIEMPRE que sea > 0**: son filas que se ocultaron del feed sin
  que nadie lo pidiera. Y si alguna cruzó de zona, va como observación (⚠️), no como número suelto.
- **⚠️ con observación** — corrió bien pero algo llama la atención (dato sospechoso, patrón raro de un
  captador, etc.): mismo resumen + la observación en una línea.
- **🛑 abortada** — NO hace falta acá: si el discovery muere por circuit breaker, `discovery-deptos.mjs`
  manda el aviso él mismo (con diagnóstico DNS: portal caído vs bloqueo de IP) antes de salir. Si abortás
  por otro motivo (paso posterior), mandá vos el aviso con `🛑` y qué NO se escribió.

Regla del mensaje: que se entienda **si hay algo para hacer o no**. Un aviso que no diferencia "todo bien"
de "te espera trabajo" vuelve a dejar ciego al founder.

## Reglas

- **SHADOW, prod intacto.** El `--apply` solo muta `propiedades_v2` (service_role). A prod: solo
  SELECT + RPC read-only (`buscar_proyecto_fuzzy`). Los alias sugeridos se REGISTRAN, no se escriben a
  `proyectos_master`. **El cutover a prod (híbrido escribe `propiedades_v2` real / n8n se apaga) es una
  decisión APARTE, irreversible, SIEMPRE con OK explícito del founder** — este comando no lo hace.
- **gratis bajo Max.** El MOAT son subagentes en la sesión, sin API. `reader-api.mjs` (stub) es el camino
  futuro para automatizarlo por API (mismo `READER_SPEC.md` como system-prompt).
- **El juez manda, no el script.** El `.mjs` filtra/fetchea/matchea; el VEREDICTO (precio/TC/gate) lo
  dan los subagentes-lectores. NUNCA dejar que el estructurado decida solo — ahí está el valor.
- **Anti-bloqueo de IP (`fetcher.mjs`):** cooldown 20 min + circuit breaker (aborta a los 5 fallos) +
  jitter + backoff. Si ves el 🛑: no insistas, esperá unas horas; para re-procesar usá el material ya
  generado, no re-crawlees.
- **TC nuevo** (unificación oficial≈paralelo): congelado en `TC_NUEVO_DECISION.md`. Principio de
  arquitectura: **normalización = frontera de acceso** — crudo+tag adentro, normalizado afuera. El
  paquete TC completo va JUNTO a prod al cutover.

## Pendientes / incrementos futuros

- ✅ **Incremento 2 — empalme de NUEVAS: HECHO** (paso 2b, `--nuevas` en `cargar-deptos-shadow.mjs`).
- ✅ **Incremento 3 — verificador: HECHO** (paso 5, `verificador-deptos.mjs`, gemelo del de alquiler).
- **Candados** (solo para comparación shadow-vs-prod limpia): sembrar `campos_bloqueados` prod→shadow.
  Para solo cargar/enriquecer NO hace falta. Ver `ESTADO_MIGRACION.md` §Frenos.
- ✅ **Repoblar el inventario COMPLETO: HECHO** (barrido a shadow con el lector nuevo). Conteo vivo en
  `ESTADO_MIGRACION.md` / SQL sobre `propiedades_v2` (`tipo_operacion='venta'`) (~460 venta al 17-jul; NO hardcodear).
- **Empaquetar el orquestador** (`cron-deptos-equipetrol.mjs`) que encadene los pasos determinísticos
  (discovery + prep) en un solo `.mjs` — hoy este `.command.md` es el orquestador (el agente ejecuta).
- Contexto: `docs/arquitectura/PLATAFORMA_HIBRIDA_GENERICA.md` (visión) + memoria `project_checkpoint_deptos_hibrido`.
