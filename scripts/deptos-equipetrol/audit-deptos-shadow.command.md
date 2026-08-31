---
description: Auditoría del feed SHADOW del híbrido (venta + alquiler) — re-lee el anuncio HOY vs lo guardado (drift + cambio de precio en portal + matching), y manda los sospechosos a subagentes-lectores (juez). $0, read-only. Cierra el punto ciego del híbrido (lee el anuncio una sola vez).
---

# /audit-deptos-shadow — Auditoría del feed SHADOW (venta + alquiler)

> **Fuente de verdad** de este comando. Copiar a `.claude/commands/audit-deptos-shadow.md`
> (las skills viven gitignored en `.claude/commands/`; el repo guarda el `.command.md`).
>
> **Qué es:** re-lee el anuncio de cada prop del **feed shadow** y lo compara contra lo que el
> híbrido guardó, para cazar lo que el pipeline no ve. **$0, 100% read-only** (no muta nada).
> El VEREDICTO de los sospechosos lo dan **subagentes-lectores** (patrón `/audit-cola-matching` +
> `/cron-deptos-*`), NUNCA el script. Gemelo conceptual: `/cron-deptos-ventas` (captura) — esto
> **audita** lo ya cargado.

## Por qué existe (el punto ciego del híbrido)

El híbrido lee la descripción **una sola vez** (el reader = el MOAT) y el cargador excluye lo ya
cargado → **nunca re-mira**. Pero el anunciante deja la **misma URL y el mismo precio de cabecera**
y edita **solo la descripción**: baja el precio en el texto, pone "REBAJA", cambia
`disponible→reservado/vendido`, cambia condiciones. El discovery nocturno no ve nada → el veredicto
del reader queda **congelado y viejo** en el feed. n8n cubría esto por fuerza bruta (re-enrichment
nocturno, caro); el híbrido no tiene ese mecanismo → esta skill **es** ese mecanismo (el drift decide
QUÉ re-leer, así solo se paga el reader en las pocas que cambiaron). Diseño:
`AUDITORIAS_POST_CUTOVER.md` §Gap del híbrido.

**No reusa `/audit-feed-ventas-mensual-fetch`** porque esa está atada a **prod** (`v_mercado_venta` +
`datos_json_enrichment`) y al **TC viejo** (`9.954`/`1.43` hardcodeado, tags viejos). Correrla contra
shadow leería NULL y "todo pasa" sin revisar nada (ruptura silenciosa #1). Esta skill lee la columna
correcta (`datos_json.contenido.descripcion`) y **no clasifica TC en el script** — el juez re-clasifica
con `READER_SPEC` (que sí conoce `oficial_viejo`/`bob`).

## Alcance / gate

- Es **pre-cutover** y valida shadow **vs el ANUNCIO**, no vs prod ([[project_gate_cutover_deptos_no_es_comparar_prod]]).
- Read-only: el SQL de corrección se **sugiere**, lo aplica el humano (contra `propiedades_v2`).
- La detección determinística de **cambio de precio** necesita `datos_json.senales_portal` (baseline
  del portal al cargar). Filas viejas cargadas antes de que existiera ese campo → sin baseline: igual
  van al juez por drift/matching, y el juez ve `anuncio_hoy` + la decisión shadow (números a la vista).

## Pasos (desde `scripts/deptos-equipetrol/`)

### 1. Correr el auditor determinístico (fetch $0, read-only)
```
node auditar-shadow.mjs --op venta            # todas las ACTIVAS de venta
node auditar-shadow.mjs --op alquiler --limit 40      # las 40 con la lectura más vieja
node auditar-shadow.mjs --op venta --ids 3519,3540    # ids puntuales (trae aunque estén de baja)
node auditar-shadow.mjs --op venta --incluir-bajas    # + las dadas de baja (ver abajo)
```

🔴 **DESDE EL 27-ago-2026 SÓLO BARRE LAS ACTIVAS, Y `--limit` TRAE LAS MÁS VIEJAS.**
Hasta entonces tomaba **todas** las filas de la operación y las ordenaba por `id`:

- **502 de 1.770 fetches (28%) eran a avisos ya dados de baja.** Ir a buscar la
  descripción de uno que ya sabemos muerto devuelve 404 y no aporta: su baja ya está
  registrada. El drift existe para detectar que un aviso **vivo** cambió por dentro.
- **El orden por `id` hacía que `--limit` trajera lo peor.** Los ids bajos son las
  viejas de n8n, muchas ya muertas — justo al revés de lo que hace falta. Ahora ordena
  por antigüedad de captura, así que acotar con `--limit` prioriza lo que más tiempo
  lleva sin que nadie lo mire.

Al arrancar declara el alcance y la antigüedad de lo que trajo (la más vieja y la
mediana), para que un `--limit` no corte en silencio.

⚠️ Con `--incluir-bajas` vuelve al barrido completo. Sirve para un caso puntual: revisar
si una baja fue un falso positivo. No es el uso normal.

🔑 **EL FOCO POR MACROZONA ES OPT-IN, NUNCA DEFAULT.**

```
node auditar-shadow.mjs --op venta --macrozona equipetrol      # 479 activas
node auditar-shadow.mjs --op alquiler --macrozona "zona norte" # 142
node auditar-shadow.mjs --op venta                             # 882 — las dos juntas
```

Sin el flag barre **todo**, y eso es deliberado: `/audit-cola-shadow` pasó dos días
auditando sólo Equipetrol sin que nadie lo notara, porque su default de zona era
`equipetrol`. *Un default seguro para escribir es peligroso para auditar* — **lo que no
entra al barrido no falla, simplemente no se mira.**

Por eso el flag se llama `--macrozona` y no `--zona`: en los CARGADORES existe `--zona`
y su default **es** `equipetrol`. Mismo nombre con default opuesto sería una trampa.

Al arrancar declara la macrozona **siempre**, incluso cuando no se filtró
(`todas las macrozonas`), y con foco activo avisa qué queda afuera. Decirlo en voz alta
es lo que evita auditar una sola y leer el resultado como si cubriera el sistema entero.

Tolera variantes de escritura (`"zona norte"`, `Zona-Norte`) y **aborta si el nombre no
existe**, en vez de filtrar por una lista vacía: eso auditaría cero filas y el resumen
diría "0 hallazgos", que se lee igual que "está todo bien". Las zonas de cada macrozona
salen de `zonas_geograficas`, así que agregar una no requiere tocar el script.

Volumen al 27-ago: Equipetrol 479 venta + 244 alquiler · Zona Norte 403 + 142.
Para cada fila shadow: re-fetchea el anuncio (`fetchDetalleDepto`), calcula **drift** de descripción
(`similarity.mjs`: bucket + flags semánticos), **cambio de precio en portal** (crudo de hoy vs el
`senales_portal` guardado, umbral 1% graduado), y **matching-lite** (¿el `nombre_edificio` aún aparece
en el anuncio?). Escribe `output/audit-shadow-<op>-<ts>.json` con el array `material` = solo los
**sospechosos** (drift fuerte / cambio de precio / matching / flag semántico) con `veredicto_audit: null`.
- Circuit breaker (🛑) → IP bloqueada, **no insistas**, reintentá en horas. Pausa+jitter entre requests.
- El resumen impreso ya te da el panorama: buckets de drift, cambios de precio, matching sospechoso,
  sin-match-con-nombre, y **fichas que no responden**.
- 💰 **`precio_bajo_el_portal` (3-ago-2026) — el único chequeo que NO mira el portal de hoy.** Compara,
  dentro de la misma fila, `precio_usd` contra `senales_portal.precio_candidato` (el testigo que el
  portal traía al capturar) y levanta lo que quedó **3-15% POR DEBAJO**. Todo el resto de este audit
  vigila si el MUNDO cambió; esto vigila si **nosotros copiamos mal** — un error que nació entre el
  portal y el lector es invisible para el drift, porque el aviso siempre va a coincidir consigo mismo.
  Caso testigo: `8000432` (K1) guardado a $82.692 con el portal cobrando $88.027, clonado de su gemela.
  **Solo VENTA**, y no por decisión: ninguna fila de alquiler tiene ese testigo (0 de 340).
  La banda es angosta a propósito — diferencias grandes suelen ser el lector corrigiendo BIEN un "USD"
  que el portal fabricó dividiendo Bs por 6,96 (108 de 498 difieren >3%). Por debajo, en 3-15%, no hay
  explicación de moneda.
  🔑 **Al resolver un caso hay que taguear**, o vuelve cada noche y la alerta muere de ruido:
  `datos_json.precio_confirmado_por = {quien, cuando, precio: <el precio_usd de ESE momento>, veredicto, nota}`.
  Guardar el precio es lo que hace que el tag **se invalide solo**: si el captador lo cambia deja de
  coincidir y el caso vuelve. Un "ya revisado" sin esa condición tapa un error nuevo por meses.
- 🔴 **El cruce con el verificador ya lo hace el script (3-ago-2026), no lo repitas a mano.** Cada ficha
  muerta se clasifica sola en `ya de baja` / `ya en cola del verificador` (se cierra sola con la gracia
  de 2d) / **RESIDUAL**. El residual es lo único que hay que mirar: prop **activa**, ficha muerta, y
  **fuera del universo del verificador** (`desaparecidas del discovery OR primera_ausencia_at no nulo`)
  porque el portal la sigue mostrando en su LISTADO aunque la ficha ya no exista → **casi ninguna se
  arregla sola**. Sale gritado con sus URLs, y también en el JSON como `bajas_residual`.
  ⚠️ **Una clase SÍ se arregla sola desde el PR #64 (4-ago-2026): el slug reescrito del portal** — C21, y **también Remax desde el 28-ago-2026**. Cuando el
  captador edita el aviso, C21 reescribe el slug de `/propiedad/<codigo>_<slug>` y la URL vieja queda
  muerta con la prop activa — cae exacto en la definición de residual. Ahora el **discovery lo detecta
  por el código numérico** (el id real del aviso) y el **cargador marca la vieja `duplicado_de`**, así
  que ese caso se cierra en la captura y no debería llegar acá. Si aparece un residual C21 cuyo código
  ya existe en shadow con otro slug, es señal de que esa detección falló — no de un residual genuino.
  Medido el 3-ago: de **53** fichas muertas, 36 ya de baja + 15 en cola + **2 residuales**. Mirar la
  lista cruda es mirar 51 de ruido. Si no hay residual imprime `✅ Sin bajas residuales` — explícito,
  para no confundir "revisé y está limpio" con "no revisé".
  🔑 **Esa proporción cambió con el filtro de activas (27-ago): las "36 ya de baja" ya no aparecen**,
  porque ni siquiera se fetchean. El ruido se elimina en el origen en vez de clasificarse después, así
  que esperá muchas menos fichas muertas y casi todas de las clases que sí importan. Si ves un conteo
  parecido al de agosto, sospechá que corriste con `--incluir-bajas`.

### 2. MOAT — el juez (subagentes-lectores en paralelo)
### 🔴 ANTES DE CONVERTIR LOS VEREDICTOS EN SQL — medido el 27-ago sobre 90 casos

Los subagentes-lectores razonan bien sobre el ANUNCIO, pero **no conocen el esquema ni la
base**. Tres cosas fallan siempre y hay que filtrarlas antes de escribir un `UPDATE`:

**1 · Proponen columnas que NO EXISTEN.** De los campos que sugirieron, **12 no son columnas
de `propiedades_v2`**: `expensas_incluidas`, `equipamiento_canonico`, `amenidades`,
`alias_sugerido`, `parqueo_precio_adicional_bob`, `expensas_bob`, `uso_inmueble`, `equipado`…
Y cuatro existen **con otro nombre**:

```
area_m2                    → area_total_m2
estacionamientos_incluidos → estacionamientos
baulera_incluida           → baulera
nombre_edificio_canonico   → nombre_edificio
```

👉 **Verificar SIEMPRE contra `information_schema.columns` antes de generar el SQL.** Un
UPDATE con columna inventada falla; uno con la columna equivocada es peor. Lo que encontraron
y no tiene dónde ir se anota en el backlog, no se improvisa una columna.

**2 · Proponen alias que YA están registrados.** De 8 sugeridos, 3 ya existían. Verificar
contra `alias_conocidos` antes de agregar.

**3 · Llaman "canónico" al nombre COMERCIAL, que no es el `nombre_oficial` de la tabla.**
`"Sky Design"` es en realidad `"Edif. SKY DESIGN - SKY Properties"`; `"Platinum 1"` es
`"Edificio PLATINUM"`. Resolver el `id_proyecto_master` por búsqueda, nunca por nombre exacto.

🔑 **Y verificar el EFECTO, no el UPDATE.** Que una fila se haya escrito no prueba que el
problema se resolvió: el 27-ago un cambio de precio de Bs a USD dejó `tipo_cambio_detectado`
en `'bob'`, `precio_normalizado_alquiler()` devolvió NULL y **la propiedad desapareció del
feed sin que nada fallara**. La verificación buena es contra la vista o el matcher —
`SELECT ... FROM v_mercado_*_shadow WHERE id = X` o `buscar_proyecto_fuzzy('nombre')` —, no
contra la tabla.


Leé el `output/audit-shadow-<op>-<ts>.json`. Dividí el array `material` en chunks de ~10 y lanzá
**N subagentes en paralelo**. Cada subagente:
- Lee su chunk + **`READER_SPEC.md`** (venta) / **`READER_SPEC_ALQUILER.md`** (alquiler).
- Para cada entrada, re-lee `anuncio_hoy.descripcion` + `anuncio_hoy.senales` y lo contrasta con la
  decisión actual en `shadow` (precio/TC/dorms/nombre/estado/condiciones).
- Llena `veredicto_audit`:
  ```json
  { "sigue_valido": true|false,
    "correccion": { "precio_usd": 70000, "tipo_cambio_detectado": "paralelo", "estado_construccion": "...", "nombre_edificio": "...", "dormitorios": 1 },
    "nota": "por qué (cita el texto del anuncio de hoy)" }
  ```
  `sigue_valido:true` → nada que hacer. `false` → `correccion` trae SOLO los campos que cambian.
- **`motivos`** de cada entrada te dice qué disparó la revisión (drift / precio / nombre_no_aparece).

### 3. Reportar + SQL sugerido (read-only)
Con los `veredicto_audit` mergeados, armá el reporte ejecutivo:
- **🔴 Correcciones confirmadas** (precio/TC/estado cambió en el anuncio) → `UPDATE propiedades_v2
  SET ... , fecha_actualizacion=NOW() WHERE id=X;` (+ refrescar `datos_json.contenido.descripcion` con la
  de hoy, para que no reaparezca en cada corrida — mismo patrón §4.5 de la mensual).
- **💀 Bajas residuales** (`bajas_residual` del JSON) → las únicas que requieren acción. Confirmá el
  status HTTP a mano (**C21: 404 · Remax: 302**, que son las mismas señales que usa el verificador) y
  recién ahí proponé el `UPDATE ... status='inactivo_confirmed', es_activa=false,
  razon_inactiva='aviso_terminado'`. El resto de las fichas muertas NO se tocan: o ya están de baja o
  el verificador las cierra esta noche. 🔑 **El audit señala, no da de baja por su cuenta** — la
  autoridad sigue siendo `verificador-deptos/alquiler.mjs` (2 señales + gracia 2d), porque una regla
  de bajas mal hecha saca del feed propiedades que SÍ existen.
- **🔒 SELLAR los cambios de precio ya juzgados — PASO OBLIGATORIO (27-ago-2026)**

  ```
  node sellar-precio-portal.mjs output/audit-shadow-venta-<ts>.json output/audit-shadow-alquiler-<ts>.json
  ```

  🔴 **Sin esto, TODOS los cambios de precio que juzgaste vuelven idénticos la próxima corrida.**
  El chequeo compara el portal de HOY contra `datos_json.senales_portal`, que es el testigo del
  día que se **capturó** la propiedad — y ese testigo lo escriben sólo los cargadores, nada lo
  refresca. Así que una vez que el portal se mueve, el caso se repite **para siempre**, aunque lo
  hayas corregido. Medido: `8000642` se corrigió a los 120.000 que pedía el portal y volvió a
  marcar "suba 26,3%" en la corrida siguiente. Con ~57 casos por corrida y cadencia mensual, la
  lista arrastra todo el mes anterior y **la alarma muere de ruido**.

  🔴 **NO se arregla refrescando `senales_portal`.** En VENTA-USD ese campo (`precio_candidato`) lo
  comparte §COPIA MAL (`precio_bajo_el_portal`), que es ciego al portal de hoy **a propósito** —
  corre antes del fetch, porque el error que busca nació entre el portal y el lector el día de la
  captura. Pisarlo lo dejaría midiendo otra cosa. Por eso la memoria vive en un campo propio,
  `datos_json.precio_portal_revisado`, y el audit lo usa como baseline nuevo con fallback al de
  la captura.

  🔑 **Se auto-invalida por construcción**: guarda el valor del portal en el momento de juzgarlo,
  así que si el portal **vuelve a moverse** más que el umbral, el caso reaparece solo y sale
  marcado `·RE` en el resumen. No es un "ya revisado" incondicional — esos tapan un problema nuevo
  en algo que miraste hace meses.

  ⚠️ **Aplicarlo DESPUÉS del juez, nunca antes**: sellar sin haber juzgado apaga una alarma real.
  Si juzgaste sólo una parte, `--solo 3974,8000642`.
- **🏷️ Matching sospechoso** (nombre no aparece / sin-match-con-nombre) → juez decide ALIAS vs MISMATCH vs
  PM_NUEVO (mismo criterio que `/audit-cola-matching`); candar `id_proyecto_master` si es cluster numerado.
- **📷 Fotos reemplazadas** (`fotos_rotas` del JSON) → **NO necesitan juez, y son lo ÚNICO del audit que
  un usuario ve hoy mismo**: esas cards salen **vacías** en el feed. El captador cambió las imágenes del
  aviso, las que teníamos dejaron de existir en el CDN, y como el aviso sigue vivo y el texto no cambió,
  ni el verificador ni el drift de texto lo notan.

  ```
  node reparar-fotos.mjs output/audit-shadow-venta-<ts>.json output/audit-shadow-alquiler-<ts>.json
  ```

  Read-only: re-fetchea esos avisos, toma las `fotos_urls` de hoy y **emite el SQL** en
  `output/reparar-fotos-<fecha>.sql`. Cada `UPDATE` deja la fecha y el motivo en el crudo.
  🔑 **Lo que decide es la PORTADA, no el conjunto** — el feed muestra `fotos_urls[0]`, así que da igual
  que sigan vivas 8 de 11 si la primera está rota.
  ⚠️ **Si el portal no devuelve fotos, NO se toca y se declara.** Vaciar la lista se vería igual que
  "esta propiedad no tiene fotos" y se pierde la señal de que hay algo roto.
  ⚠️ **Que el conteo BAJE no es un error.** El 27-ago `8000198` pasó de 14 fotos a 1: verificado con tres
  fetches, el captador dejó una sola. Una foto que carga vale más que catorce muertas.
  📌 Este hallazgo existía desde el 3-ago y **este comando no lo mencionaba**, así que salía en el
  resumen y nadie sabía qué hacer con él. De ahí que se acumularan 19.
- **Preguntá al usuario** antes de aplicar cualquier `UPDATE`. NUNCA mutar sin OK.

Registrá una línea en `output/audit-shadow-log.md` (fecha + op + números).

**Y mandá el aviso a Slack:**
```
node notificar-slack.mjs "<resumen>"
```
> ⚠️ Igual que `/audit-cola-shadow`: **la salida de este audit son pendientes del humano** (SQL de
> corrección que alguien tiene que aplicar). Si corre de noche y nadie lo ve, **el drift queda sin
> corregir** — los precios/estados del feed se quedan viejos aunque el anuncio haya cambiado.

- **🔔 con drift detectado** — `🔔 *Audit drift shadow* (<op>) · N re-leídos` + `X correcciones ·
  Y matching sospechoso · Z posibles bajas` + dónde está el SQL (`output/audit-shadow-log.md`).
- **✅ sin drift** — `✅ Audit drift shadow (<op>) · N re-leídos · sin cambios en los anuncios`.
  Explícito, para distinguir "corrió y está limpio" de "no corrió".

## Reglas
- **SHADOW, read-only.** El `.mjs` no escribe nada. El SQL de corrección va contra `propiedades_v2`
  y lo aplica el humano. Cero escritura a prod.
- **El juez manda, no el script.** El `.mjs` detecta (drift/precio/matching); el VEREDICTO lo dan los
  subagentes-lectores con `READER_SPEC`. El script nunca decide precio/TC/estado.
- **No clasifica TC** (esquiva el `9.954` hardcodeado): emite el crudo del portal, el juez re-clasifica.
- **Lee la columna correcta** (`datos_json.contenido.descripcion`), no `datos_json_enrichment` (que en el
  híbrido está vacío → leerlo daría verde falso).
- **Anti-bloqueo IP** (`fetcher.mjs`): pausa+jitter + circuit breaker (5 fallos). 🛑 → esperá.

## Pendientes / futuro
- **Loop de re-lectura automática:** hoy el drift señala QUÉ re-leer y el juez lo hace en sesión. El
  camino al cutover es que las correcciones confirmadas se apliquen por API (`reader-api.mjs`).
- **Persistencia histórica EN BD:** el JSON de la corrida + `output/audit-shadow-log.md` (bitácora en
  archivo, primera entrada 3-ago) alcanzan para leer una corrida, pero no dan **tendencia**. Al cutover
  se puede enganchar a `audit_descripciones_*` (mig 242/267), como la mensual de prod.
- **Bajas:** este audit solo las FLAGEA; la baja la confirma `verificador-deptos/alquiler.mjs` (2 señales).
  Lo que sí cambió el 3-ago es que ya no las flagea todas juntas: separa el residual del ruido (ver §1).
- Contexto: `AUDITORIAS_POST_CUTOVER.md` (mapa de alineación al cutover) + memoria `project_checkpoint_deptos_hibrido`.
