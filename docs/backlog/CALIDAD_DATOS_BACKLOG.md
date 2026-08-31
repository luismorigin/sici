# Backlog Calidad de Datos — SICI

> Extraído de CLAUDE.md el 27 Feb 2026. Actualizado 28 Ago 2026.

## ✅ El dedup elegía el SOBREVIVIENTE por id más bajo — estuvo mal 3 de 3 (28 Ago · CERRADO)

`scripts/auditoria-feed-ventas/lib/dup-checks.mjs:47` ordena el grupo por id y toma el primero:

```js
const ordenados = [...items].sort((a, b) => a.id - b.id);
...
sobreviviente: base.id,   // = el id más bajo del cluster
```

**El id más bajo es el aviso MÁS VIEJO, y en una republicación el viejo es justamente el que se
está muriendo.** El 28-ago el audit propuso tres dedups y en los tres el sobreviviente estaba
invertido:

| cluster | propuesto | correcto | evidencia |
|---|---|---|---|
| Uptown Drei | 187 | **8001130** | 187 con `primera_ausencia_at` = ese mismo día 16:36 |
| Altamura | 2044 | **8001144** | 2044 con `primera_ausencia_at` = ese mismo día 17:06 |
| Mare | 8000098 | **8000800** | el viejo arrastra un texto que dice "180.000 $us" con precio 173.000 |

🔑 **El síntoma es traicionero: aplicar la propuesta tal cual saca del feed el aviso VIVO y deja
publicado el muerto.** En Uptown habría desaparecido el departamento entero (187 ya estaba fuera del
feed por antigüedad), y nada lo habría avisado.

### ✅ ARREGLADO el 28-ago — pero solo cubre 2 de los 3 casos, y se sabe por qué

`dup-checks.mjs` acepta ahora un campo opcional `ausente` (= `primera_ausencia_at` seteado) y ordena
poniendo esos al final; el sobreviviente es el primero de la lista. `auditar-matching-shadow.mjs` se
lo pasa. **Sin el campo el orden colapsa al de antes (id ascendente), byte por byte** — por eso las
3 skills de prod que también importan esta librería no cambian de comportamiento.

**Medido con la función REAL, no con una réplica** (la lección de esta semana), sobre las 1.249 filas
activas y replayeando los 4 clusters de hoy:

| prueba | resultado |
|---|---|
| No-regresión, todo el inventario, con y sin el campo | **membresía de los clusters IDÉNTICA** · 0 sobrevivientes cambian |
| Replay Uptown Drei `187 / 8001130` | 187 → **8001130** ✅ |
| Replay Altamura `2044 / 8001144` | 2044 → **8001144** ✅ |
| Replay Mare `8000098 / 8000800` | 8000098 → 8000098 🔴 **no cambia** |

🔴 **Mare NO se arregla, y el motivo importa: ninguno de los dos tiene `primera_ausencia_at`.** No es
una republicación que el verificador haya visto morir — es **el mismo listado de Remax con la URL
reescrita** (mismo id `120079022-34`, mismo UUID, las mismas 19 fotos), y el verificador no marcó
ausente a ninguno. Lo que delató al viejo fue algo que ningún campo captura: **su descripción dice
"180.000 $us" mientras su precio es 173.000** (el drift del 27-ago corrigió el número y no el texto).

✅ **CERRADO el 28-ago, pero AGUAS ARRIBA — no por esta vía.** Acá quedaba abierto *"cuando el cluster
es una URL reescrita de Remax, el sobreviviente sigue saliendo mal"*, y la salida no fue mejorar el
desempate del dedup: fue **que el caso no llegue al dedup**. El discovery ya cazaba la republicación por
slug reescrito de C21 y estaba limitado a esa fuente por una línea; desde `d45706c` **también caza la de
Remax**, y ahí no hay que adivinar quién es el viejo — el discovery lo sabe, porque encontró la fila
vieja por su código. Marca la nueva con `reemplaza_a` y el cargador deduplica al aplicar.
🔑 **La lección de diseño:** el mejor arreglo de un desempate difícil fue no tener que desempatar.
Medido sobre las 1.802 filas: el extractor cubre 100% de C21 y 100% de Remax, 19 grupos con código
repetido, cero falsos positivos. Y destapó un caso vivo que nadie había visto: `1728` a $188.000 y
`8000799` a $180.000, el mismo depto con descripción de md5 idéntico, **los dos en el feed**.

⚠️ **Y hay un segundo efecto que el arreglo no cubre: deduplicar hacia el nuevo RESETEA la
antigüedad.** El portal recrea el aviso justamente para eso — Altamura pasaría de 199 días a 18,
Uptown de 328 a 24. El 28-ago se resolvió a mano arrastrando `fecha_publicacion` del viejo al
sobreviviente **y bloqueándola en `campos_bloqueados`** para que la captura no la pise. Si el dedup
se automatiza, eso tiene que ir en el mismo movimiento.
🔴 Ojo con la ventana del feed al arrastrar la fecha: la vista corta a **300 días**, salvo
`preventa`/`en_construccion`/`en_pozo`, que van a **730**. Uptown con la fecha real (328 d) sigue en
el feed **solo porque está tageado `preventa`**.

## ✅ Berchatti Beni — dos criterios de dedup opuestos sobre el mismo caso (28 Ago · ZANJADO el 31 Ago)

Los avisos **8001153 / 8001154 / 8001155** son la republicación 1:1 de **8000494 / 8000495 / 8000496**
(emparejados por UUID de listing de Remax; el portal cambió el id padre `120116002` → `1200346220` y
corrió los sufijos). **No hay doble conteo hoy**: los tres viejos están inactivos y fuera del feed, y
las fechas de publicación se heredaron bien (114/114/116 días, sin reseteo).

**El problema es de criterio, no de datos.** En su momento alguien **dedupó 8000495 y 8000496 dentro
de 8000494** — o sea, colapsó las tres unidades en una. El 28-ago el juez del audit recomendó
**NO tocar** las tres nuevas, con esta evidencia: los 3 tienen **UUID de listing distinto** en el CRM
de Remax y **3 sets de fotos distintos**.

🔑 **Y por qué el detector automático las agrupa igual:** su criterio es "descripción ≥90% igual",
pero **esa descripción la escribe nuestro propio lector** a partir de los campos estructurados
(arranca *"Invertí en un departamento funcional…"*, con emojis) y **no contiene ni un dato de
unidad** — ni piso, ni número, ni orientación. Dos unidades distintas de 31 m² / 1 dorm del mismo
proyecto producen texto idéntico **por construcción**. En los clusters donde la descripción es el
texto CRUDO del portal (con erratas y emojis del captador) el criterio sí discrimina.

### ✅ ZANJADO el 31-ago-2026 — y por el caso hermano, no por Berchatti

Se resolvió mirando **Gardenia**, que planteaba exactamente la misma pregunta: `8001089` y `8001174`,
mismo listado padre de Remax (`1200164198`) con sufijo de unidad `-44` y `-50`, **idénticos en
descripción, precio, área, baños y captador**. El founder abrió las dos URLs y comparó: **son dos
unidades distintas.**

👉 **El criterio queda fijado: en Remax el sufijo de unidad distingue DEPARTAMENTOS.** Con eso Berchatti
(`-15`/`-16`/`-17`) también queda resuelto — la decisión de no deduplicarlos era la correcta, y la que
está mal es la vieja, que fusionó `8000495` y `8000496` dentro de `8000494`. Esos tres ya están
inactivos y fuera del feed, así que no hay nada que revertir.

🔑 **Y se cerró el agujero que los hacía volver:** la superficie 3 era la ÚNICA sin clave de rastro, así
que un cluster juzgado *"NO son duplicados"* reaparecía todas las noches — Berchatti volvió **cuatro
noches seguidas** (28, 29, 30 y 31). Ahora respeta `datos_json.trazabilidad.dedup_revisado`, y los 5
avisos de los dos casos quedaron marcados `NO_DEDUPLICAR`.
⚠️ **Se silencia el CLUSTER, no la propiedad**: si mañana entra un aviso nuevo a ese grupo, el cluster
tiene un integrante sin marcar y vuelve entero al humano. Excluir las props marcadas habría dejado a un
duplicado real solo y sin detectar.

## 🔴 Avisos SIN NOMBRE DE EDIFICIO — en VENTA no se publican; en alquiler sí (19 Ago 2026)

**El aviso no dice de qué edificio habla.** No es un nombre mal escrito (eso lo resuelve un alias del
catálogo): el captador publicó "Departamento en venta" y nada más. Sin nombre no hay match posible
—la regla del proyecto prohíbe matchear por GPS solo (`matching_no_usa_gps_solo`)— así que la
propiedad queda sin `id_proyecto_master`.

### Cuántos son (medido el 19-ago sobre inventario activo `status='completado'`)

| | Equipetrol | Zona Norte |
|---|---|---|
| **Venta** | 34 de 468 · **7,3 %** | 71 de 398 · **17,8 %** |
| **Alquiler** | 31 de 220 · **14,1 %** | 52 de 139 · **37,4 %** |

**188 avisos activos en total.** Dos lecturas que el número absoluto esconde:
- **Zona Norte está 2-3× peor que Equipetrol** en las dos operaciones — pero **Equipetrol no está
  exento**: son 65 avisos. La frase "es un problema de ZN" es falsa.
- **Alquiler está al doble que venta en las dos macrozonas.** En alquiler de Zona Norte, **4 de cada
  10 avisos** no declaran edificio.

### 🔑 La asimetría que importa: venta y alquiler se comportan distinto ante el mismo hueco

| | `v_mercado_*_shadow` (mide) | RPC del feed (publica) | No se ve |
|---|---:|---:|---:|
| **Venta** | 764 | **658** | **106** |
| **Alquiler** | 295 | 295 | **0** |

`buscar_unidades_simple_shadow` hace **INNER JOIN a `proyectos_master`** → un aviso sin edificio
**se captura, se guarda, cuenta para las medianas de mercado y no lo ve nadie**. Es el **14 % del
inventario de venta**. `buscar_unidades_alquiler_shadow` **no** exige el join: las 64 sin edificio
se publican igual.

⚠️ **Lo que NO se verificó:** de las 106 retenidas en venta, 96 son las sin edificio; **las otras 10
salen por algún otro criterio que no se persiguió**. Antes de tocar nada, medir esas 10 — puede haber
un segundo mecanismo escondido.

### Por qué NO se arregla con alias

Un alias traduce una grafía (`"Platinium II"` → pm 25). Acá **no hay nada que traducir**: el aviso no
nombra ningún edificio. Cargar alias no mueve este número ni un punto.

### Las opciones

1. **Dejarlo (hoy).** El sistema prefiere no publicar antes que atar un aviso al edificio equivocado.
   Defendible — pero **la asimetría venta/alquiler no es una decisión tomada, es una consecuencia**
   de que dos RPC se escribieron distinto. Nadie eligió que alquiler sí y venta no.
2. **Inferir el edificio por GPS.** ❌ Choca de frente con `matching_no_usa_gps_solo`, y el pin
   genérico de C21 (10 avisos activos de ZN comparten una coordenada, 8 edificios distintos) lo
   volvería un generador de matches falsos.
3. **Que el lector lo deduzca** del texto y las fotos en el MOAT. Más caro y no siempre posible, pero
   es el único camino que respeta la regla del nombre.
4. **Publicarlos declarando** *"edificio no informado"*, sin atarlos a ningún pm. Es la misma salida
   que se eligió para el área faltante y para el estado de obra: **declarar lo que no se sabe en vez
   de ocultarlo**. Recupera 106 avisos de venta sin inventar un solo match.

👉 **Decisión pendiente del founder.** Anotado el 19-ago mientras se revisaban las routines; el tema
salió de preguntar si el problema también pasaba en Equipetrol. Sí pasa.

---

## 🔴 Avisos SIN ÁREA — el feed los oculta en silencio, y el filtro no hace lo que cree (13 Ago 2026)

**Son dos problemas encadenados.** El primero es de captura; el segundo, de cómo el feed reacciona
a ese hueco. Se pueden atacar por separado, pero la decisión del segundo depende de la respuesta
al primero.

### Problema A — el dato no llega

| Fuente / operación | Sin área |
|---|---|
| **Remax ALQUILER** | **22,9%** (22 de 96) — *1 de cada 4* |
| Remax venta | 5,1% (15 de 294) |
| Century21 | **0,1%** (1 de 999) |

**Mecanismo (verificado):** el área de Remax viene del **discovery** (search API), **no del detalle**
— `lib/detalle-deptos.mjs` lo dice explícito: *"El área NO se saca del detalle (Remax no la trae
ahí)"*. Si el buscador no la devuelve para un aviso, **no hay segunda oportunidad**. Verificado
además que **tampoco está en el texto** de la descripción (8 casos revisados).

🔴 **LA PREGUNTA QUE CIERRA EL TEMA, todavía sin responder:** *¿el aviso en remax.bo muestra la
superficie?* Si la muestra → es un **bug del discovery** y el arreglo es leer el dato. Si no la
muestra → es **dato faltante en origen** y no hay nada que arreglar del lado nuestro; ahí recién
tiene sentido decidir el Problema B.
⚠️ El 11-ago no se pudo comprobar porque el fetch directo a remax.bo fallaba. **Desde el 13-ago
Remax responde normal (HTTP 200 en 1,9 s sin proxy)** → la pregunta ahora SE PUEDE responder.
Ver memoria `project_remax_cayo_noche_12ago`.

📌 **Y no es solo Remax.** El 13-ago apareció el primer caso claro en **C21**: la prop `8000826`
(Condominio Confort, ZN) entró con `area_total_m2 = NULL`. Está bien matcheada, con precio y
fotos — y aun así **nunca va a aparecer en el feed**, por el Problema B.

### Problema B — el filtro `area_total_m2 >= 20` dejó de hacer lo que fue diseñado para hacer

Medido el 13-ago sobre el inventario vivo (ya con los filtros canónicos aplicados):

| | Venta | Alquiler |
|---|---:|---:|
| **Sin área (`NULL`)** | **13** | **19** |
| Área real < 20 m² | **0** | **1** |

**De las 33 propiedades que ese filtro oculta, 32 son "no sabemos" y 1 sola es realmente chica.**

🔑 El filtro se puso para dejar afuera **bauleras y parqueos por tamaño** — pero eso **ya lo hace el
filtro de TIPO** (`baulera`/`parqueo`/`garaje`/`deposito`). Hoy el de área atrapa otra cosa.
🔑 Y la causa técnica es el patrón que apareció cinco veces el 11-ago: **en SQL `NULL >= 20` es
FALSE**, así que *"no sabemos la superficie"* se trata igual que *"mide 4 m²"*.

**Las tres opciones, y por qué la tercera:**
1. **Ocultarlas (hoy).** Coherente —sin área no hay $/m², no entran en medianas, el chip de rango no
   se calcula— pero **se ocultan en silencio**: el feed dice 359 y hay 372.
2. **Mostrarlas como si nada.** No: una card sin superficie al lado de otras con $/m² se lee como un
   error del sitio.
3. ✅ **Mostrarlas DECLARANDO** — *"superficie no informada"*, sin $/m², y **excluidas de las
   medianas**. Es lo que el sistema ya hace con el estado de obra (*"sin confirmar"* en vez de
   inventar) y con el carrusel del mapa (*"las 30 más cercanas"* en vez de truncar callado).
   **El sistema declara lo que no sabe en todos lados menos acá.**

⚠️ **NO es un cambio chico:** ese filtro vive en las vistas de mercado, que alimentan el feed, los
snapshots, las medianas, los yields y el bot. Tocar una vista compartida sin mirar la superficie de
al lado es exactamente lo que costó caro con las migs 315/316/317 (ver la regla #13 del CLAUDE.md).
Si se hace, va con foto previa y evals por superficie.

**Orden sugerido:** responder A (una lectura del portal) → recién entonces decidir B.

## 🟡 El PIN GENÉRICO de C21 — 49 avisos mal ubicados en el mapa (27 Ago 2026)

Cuando el captador no marca el mapa, C21 guarda un **punto por defecto**. No es un error
aleatorio: es siempre la misma coordenada, y llega en cada captura.

### Cuánto es (medido el 27-ago sobre las 1.770 filas con GPS)

```
223  coordenadas compartidas por más de un aviso   ← normal, son unidades del mismo edificio
 11  coordenadas con DOS O MÁS EDIFICIOS distintos ← esos son los pines genéricos
 75  avisos ahí · 55 activos
```

🔴 **Un solo pin explica casi todo**: `-17.76697, -63.19290` tiene **40 avisos de 24
edificios distintos** (27 en el feed) — Sky Tower, Golden Tower, Madero Residence, Onix
Art, Uptown Drei, Stratto Up y veinte más, todos en el mismo punto.

⚠️ **"Comparten pin" NO es el criterio.** Platinum y Platinum II comparten coordenada a
**10 metros** de sus edificios; Sky Design y Sky Elite a 130 m. Son vecinos y el pin está
prácticamente bien. Lo que importa es **la distancia de cada aviso a SU edificio**:

```
56  avisos activos a más de 300 m de su edificio
49  de esos, en el feed → se muestran mal en el mapa
13  tienen el GPS del edificio VERIFICADO por el founder  ← corregibles hoy
34  el edificio no tiene verificación                     ← NO tocar
 1,45 km  el más lejano
```

### Por qué NO se corrigieron los 13 (27-ago)

**Los 13 están en la MISMA ZONA que su edificio.** Ninguno cambia de zona al corregirse, así
que el error es sólo del pin en el mapa, no del filtro: una propiedad de Onix Art aparece a
940 m de donde está, pero sigue saliendo en las búsquedas de Sirari. A ese zoom, muchas caen
casi donde deben. **Es cosmética.**

Y sobre todo: **corregirlos no evita que mañana entren más.** El pin por defecto va a seguir
llegando en cada captura.

🔴 **Los 34 sin verificar NO se tocan**, y no por prudencia genérica: sería reemplazar un GPS
dudoso por otro GPS dudoso. La ficha del proyecto puede estar tan mal como el pin del portal
y no hay con qué desempatar. Para esos el camino es al revés: **verificar el edificio
primero** (son ~25 edificios; una pasada por Maps los resuelve para siempre y arregla todos
sus avisos de una).

### Lo que sí lo resuelve de raíz

Que **el cargador reconozca el pin conocido y NO lo guarde** — dejando la propiedad sin GPS
en vez de con uno falso — y que herede el del edificio cuando hay match. Un GPS ausente es
honesto; uno falso ubica la propiedad a un kilómetro y nadie lo nota.

Esto conecta con el fix de `pin generico + nombre con homonimos ya no se auto-confirma`
(commit `e68dcc5`, 27-ago). Cuando se toque el cargador para eso, corregir los 13 de una.

### Precedente: los 6 que SÍ se corrigieron (27-ago)

Salieron del audit de drift por estar a 2,7–4,0 km de su edificio **y en otra zona**. Ahí el
daño era real: Bizet aparecía junto a Casa Patio y Nature Residence.

🔑 **El diagnóstico se dio vuelta a mitad de camino.** Se los había dejado afuera del fix de
zona sospechando del match; la evidencia decía lo contrario — nombre exacto del edificio en
el aviso, dos fijados por un juez, y **el texto de los propios avisos contradecía su
coordenada** ("3er anillo externo" en Panorama, "Remanzo 3, zona norte" en Bizet). Lo que
estaba mal era el pin, no el match.

Se aplicó: GPS y zona del proyecto, **pin original guardado** en
`datos_json.trazabilidad.pin_original_del_portal`, y `latitud`/`longitud`/`zona` **candados**
para que ninguna captura los pise. Ver `sql/fixes/2026-08-27_zona_heredada_del_edificio.sql`.

---

## Monoambientes catalogados como "1 dormitorio" — RESUELTO (22 May 2026)

**Cierre (22 May 2026):** verificado contra prod. La corrección retroactiva ya estaba aplicada (302 props con señal monoambiente en `dorms=0`, 124 con candado manual + resto sostenido por el guardrail del merge). Quedaban 2 residuales activas en `v_mercado_*` (1926 venta `dorms=1`; 1943 alquiler `dorms=NULL`) — corregidas a `dorms=0` + candado (`motivo=correccion_monoambiente_retroactivo`). Barrido final: **cero props completadas con `dorms=1`/`NULL` + señal monoambiente**; las 27 con `dorms=NULL` restantes son `inactivo_confirmed`/`excluida_zona` (fuera de feed). Bug cerrado por ambos lados: retroactivo + guardrail merge (mig 246/247) para nuevas.

**Reconfirmado (24 May 2026):** barrido contra la **descripción cruda** (`datos_json_enrichment->>'descripcion'`, existe en venta para los 3 portales). 0 monoambientes mal catalogados vivos en venta y alquiler; el caso inverso (col=0 siendo 1-dorm real) dio 1 prop, ya corregida + candada. El "LLM-gana sobre discovery" captura los nuevos; el candado blinda los detectados. Ver memoria `audit_overrides_llm_dorms.md`.

**Problema (histórico, contexto del porqué):** error sistemático de extracción en **los 3 portales**: props que la fuente publica como **"monoambiente"** están cargadas con `dormitorios = 1`. Detectado desde un consumidor externo de SICI comparando contra la fuente.

**Por qué no lo atrapa un cruce interno:** `dormitorios=1` y `tipo='departamento'` están mal de forma **consistente entre sí** → cruzar campos internos (área vs dorms) no lo detecta. Solo se ve comparando contra la fuente.

**La señal de "monoambiente" difiere por portal** (verificado 21 May, `propiedades_v2`, `duplicado_de IS NULL`):

| Portal | Dónde aparece "monoambiente" | Mal catalogadas (dorms=1) |
|---|---|---|
| **C21** | en la **URL** (`url ILIKE '%monoambiente%'`, 320 props) | 68 (47 con área <40m²) |
| **Remax** | **solo en el JSON crudo** — NO en URL, NO en subtype (todo es "Departamento" en su taxonomía) | 3 |
| **Bien Inmuebles** | **solo en el JSON crudo** | 2 |

→ C21 es el grueso (~58 altamente sospechosas con área <40m²); Remax (3) y BI (2) son pocos pero **confirman que el bug es multi-portal**, no solo C21.

```sql
-- Señal UNIVERSAL (cubre los 3 portales): "monoambiente" en el JSON crudo o la URL
SELECT id, fuente, tipo_operacion, dormitorios, area_total_m2, url
FROM propiedades_v2
WHERE dormitorios = 1
  AND (datos_json_discovery::text ILIKE '%monoambiente%' OR url ILIKE '%monoambiente%')
  AND duplicado_de IS NULL
ORDER BY fuente, area_total_m2;
```

**Impacto:** búsquedas por dormitorios sesgadas (quien pide "1 dorm" recibe monoambientes; quien pide monoambiente/0d se pierde estas). Afecta a todos los consumidores de `propiedades_v2`/`v_mercado_*`.

**Causa probable** (`dormitorios` es campo de DISCOVERY — regla "Discovery > Enrichment"):
- **C21:** el portal expone "monoambiente" en el título/URL pero el extractor lo carga como `dormitorios=1` (default o mapeo erróneo).
- **Remax/BI:** el portal NO tiene tipo "monoambiente" estructurado (Remax = todo "Departamento"); el dato está solo en el texto, que el extractor no lee para inferir 0 dorms.

**Fix sugerido:**
- **Corto plazo:** corregir las confirmadas (`dormitorios=0`) **respetando `campos_bloqueados`** (regla "Manual > Automatic"). Validar abriendo algunos avisos antes de UPDATE masivo.
- **Largo plazo:** que el enrichment LLM (que sí lee el texto) detecte monoambiente y setee 0 dorms — más robusto que el extractor por portal. Revisar caso inverso (departamentos como monoambiente).

**Caveat:** "monoambiente" en URL/JSON es señal fuerte, NO prueba 100% (área <40m² afina; las de área ≥40 con dorms=1 podrían ser legítimas — 1 dorm en edificio "monoambiente").

## Coherencia texto↔dato — otros candidatos (backlog, 21 May 2026)

El bug de monoambientes es un caso del patrón "el campo estructurado del portal contradice el texto". Otros atributos con calidad propia (dimensionado sobre `v_mercado_venta`, 364 props venta):

- **TC paralelo** (`tipo_cambio_detectado`): **el de mayor impacto en el valor** (define `precio_normalizado`). NO es el mismo bug que monoambiente. El grueso de las divergencias ya está **blindado con candados manuales** del founder (+ badge "TC sospechoso", mig 227). Señales de lectura confirmadas (22 May 2026): "sólo dólares"/"billete" → `paralelo`; precio publicado en **Bs** → `oficial`. **Cuidado:** marcar `paralelo` sobre un `precio_usd` que ya fue convertido desde BOB al oficial **infla por doble conteo** (`× tc_paralelo/6.96`). Caso por caso, NO automatizar. (Caso resuelto: Spazios 1233 — billete en USD mal convertido desde BOB; corregido a `precio_usd` billete + paralelo + candado.)
- **Preventa/inmediata** (`estado_construccion`): **NO es candidato a guardrail tipo monoambiente** (revisado 22 May 2026 — la conclusión anterior era errónea). Contraintuitivo: el aviso "preventa" suele estar **viejo** — el edificio ya se entregó y el founder corrige a `entrega_inmediata` por conocimiento de terreno. El LLM lee el aviso original y "miente". La protección `existing_protected` del merge (no degrada `inmediata`→`preventa`) **es by-design**, el guardián de esa corrección. El `enrichment` regex (`registrar_enrichment`) puede revertir si la prop NO tiene candado → fix correcto: **blindar con candado** las confirmadas como entregadas, NO un guardrail automático. Relacionado: `DEUDA_TECNICA.md` (sección "Discovery pisa correcciones del LLM") — acá el "pisado" es correcto, no un bug.
- **Penthouse/dúplex mal tipados**: ~4 con la palabra en texto pero `tipo='departamento'`. Solo ~1 bug real (`penthouse` existe como tipo; `duplex` no existe → "departamento" no es falso, solo menos granular). Volumen chico → corrección manual.
- **Baños**: sano. No prioritario.

> Cuidado: NO generalizar el guardrail determinístico (texto pisa dato) a cualquier campo. Solo **"monoambiente"** es señal limpia, porque el aviso no envejece (un monoambiente es siempre 0 dorms). `estado_construccion` NO sirve (el aviso envejece: preventa→entregado) y `tipo_cambio` tampoco (la señal vive en interpretación: Bs vs dólares billete). Señales ruidosas ya descartadas: `oficina` (falsos: "cerca de oficinas", "home office"), `loft`/`estudio`.

## `tipo_operacion` mal cargado en origen por C21 — NO automatizar mientras el volumen sea bajo (8 Jun 2026)

**Problema:** corredores de Century21 cargan listings de **alquiler/anticrético** con el campo estructurado `tipoOperacion="venta"` en el origen. SICI copia ese campo y la prop entra al feed `/ventas` con precio basura (el canon mensual o el monto de anticrético en Bs ÷ 6.96 → ej. $603, $9/m²). Detectado en el audit semanal del 8-jun: 7 props (#2597, #2641 alquiler; #2613, #2614, #2615, #2599, #2616 anticrético). Todas reclasificadas + candadas (`tipo_operacion`, formato objeto). **+1 (23-jun-2026): #2701** (alquiler "Sky Aqualina", Zona Norte, canon Bs 6.500 → precio_usd $934, ~$10/m²) — detectado de rebote al auditar el bug TC de ZN (no por el audit semanal), reclasificado a `alquiler` + `precio_mensual_bob=6500` + candado. El patrón persiste (4ª tanda); confirma que el clasificador `tipo_operacion` del discovery C21 sigue colando alquileres a venta — mantener la decisión de NO automatizar (volumen bajo, riesgo de duales).

**Causa raíz — NO es bug de SICI:** el dato entra **envenenado desde C21**. El monto lo delata (4.200 Bs ≈ $603 es imposible para una venta — es canon mensual). El scraper de venta le pide a C21 "sección venta", y C21 devuelve estos listings *dentro* de esa sección porque el corredor los indexó como venta.

**Por qué el mecanismo existente NO lo agarra:** `registrar_discovery` ya marca `excluido_operacion` a todo lo que llega con operación ≠ venta — pero estos llegan con `tipoOperacion=venta`, así que pasan. (Confirmado: 0 props C21 en `excluido_operacion`; el scraper de venta nunca recibe no-venta… salvo estos mal etiquetados.)

**❌ NO arreglar en el merge:** el `merge` ni siquiera setea `tipo_operacion` (solo lo lee para el score). Quien lo asigna es `registrar_discovery` ← scraper n8n. Meter un guardrail en el merge sería tocar la función más crítica de venta (regla 7) para nada.

**Riesgo de automatizar (por qué se decide NO hacerlo hoy):** falso positivo de **listings duales** — caso real #1370 *"departamento en alquiler **o** venta de lujo"* (1.47M Bs, venta legítima de $211K). Un guardrail que excluya por ver "alquiler" en URL/título **borra ventas reales del feed en silencio**, sobre ~598 listings C21 cada noche. `anticretico` es señal limpia; **`alquiler` es traicionera** (duales comunes).

**Decisión (8-jun-2026): NO se implementa guardrail mientras el volumen siga bajo (~7/semana).** La mitigación vigente es el **audit semanal de ventas** (`/audit-feed-ventas-semanal`, check 2.4 sub-caso URL/desc), costo $0, con criterio humano que distingue el dual #1370 que un script rompería. Re-evaluar solo si el volumen crece de forma sostenida.

**Si en el futuro se automatiza** (solo con volumen alto que lo justifique), el lugar correcto es el **scraper n8n** (no el merge, no el SQL), y **solo con la señal `anticretico`** (nunca `alquiler`, por los duales) → cae solo en `excluido_operacion`. Cubre ~60% del problema (los anticréticos) con riesgo casi nulo. Alternativa de riesgo ~cero sin tocar pipeline: filtro defensivo en la vista `v_mercado_venta` que excluya `url ~* 'anticretico'`.

**Query de detección** (la usa el audit; sirve para re-dimensionar):
```sql
SELECT p.id, p.precio_usd, p.url
FROM propiedades_v2 p
WHERE p.tipo_operacion='venta' AND p.fuente='century21'
  AND p.status IN ('completado','actualizado')
  AND NOT campo_esta_bloqueado(campos_bloqueados,'tipo_operacion')
  AND p.url ~* 'anticretico';  -- 'en-alquiler' añade FP de duales ("alquiler o venta"), filtrar a mano
```

## Precio/área rotos por parsing de C21 — barrido 23-jun-2026

**Problema:** el campo `precioVenta`/área de C21 llega mal parseado al feed, generando $/m² absurdos. Tres sabores, detectados en el barrido del 23-jun (props con `precio_usd / area_total_m2 < $500`):
1. **Separador de miles mal parseado**: "504.000" Bs → leído como 504 → $72 (#2123 Community Alto Norte); "617.500" → 617,5 → $89 (#2821 Macororó 10). El punto boliviano es separador de miles, pero el extractor/portal lo trata como decimal.
2. **Captura errada del precio**: #1911 (Sky Art) — el portal muestra $201.149 (1,4M Bs) pero la BD tenía $19.397 (factor ~10). El extractor agarró un número equivocado.
3. **Área ×100 / sin decimal / del condominio**: #2823 (4449 = 44,49 m²); #2060 (187 m² para un monoambiente — la desc dice 32,60); #2013/#2014 (el área es la del condominio = 400 m², no la unidad).

**Detección:** `SELECT ... WHERE precio_usd / area_total_m2 < 500` sobre `v_mercado_venta` (= el check 2.4 "precio absurdo" de `/audit-feed-ventas-semanal`). **El precio/área real está en el portal** (`{url}?json=true` → `entity.precioVenta`, `entity.m2T`), recuperable con un fetch.

**Corregidos 23-jun** (candado formato objeto sobre `precio_usd`/`area_total_m2`): #2123 ($72→$72.414), #2821 ($89→$88.721), #1911 ($19.397→$201.149), #2823 ($71→$71.121 + 4449→44,49 m²), #2060 (187→32,60 m²). #1387 dado de **baja** (`es_activa=false`, anuncio basura). **Pendientes:** #2013/#2014 (área del condominio → fetch para el área de la unidad). #2126 **dejado** ($38.655 barato pero real, preventa económica).

**Causa de fondo:** parsing de precio/área en el extractor C21 ("Extractor Century21"). Como el TC (ver el bug de flag paralelo, migraciones 263-265), es lógica de extracción frágil enterrada en n8n. NO automatizar la corrección (riesgo de FP); se caza con el check 2.4 + fetch del portal cuando aparece. **Argumento más para el script híbrido** (parsing robusto + validación $/m² + captura del crudo).

## Baños Corregidos (14 props) - 21 Ene 2026

Auditoría manual con IA completada. 14 propiedades corregidas con `campos_bloqueados`:
- IDs: 456, 230, 255, 166, 188, 224, 231, 243, 355, 357, 415, 62, 241

## Baños Pendientes — RESUELTO (9 Mar 2026)

17 props revisadas. 13/18 ya están inactivas o excluidas (no afectan métricas).
Las 5 activas (156, 309, 385, 158, 452) tienen valores plausibles — no requieren corrección.

## Datos Corruptos — RESUELTO (9 Mar 2026)

| ID | Problema | Estado |
|----|----------|--------|
| 380 | Spazios Edén $544/m² | `inactivo_pending` — no afecta métricas |

## Backlog Extractores n8n

- [x] ~~**REIMPORTAR flujo_b_processing_v3.0.json en n8n**~~ - Resuelto: `precio_normalizado()` (migraciones 167-168) maneja TC paralelo a nivel SQL
- [x] ~~**Fix 2 TC Paralelo**~~ - Resuelto: `precio_normalizado()` convierte precios paralelo a USD reales

## Validaciones Pendientes en Pipeline

- [x] Validación precio/m² < $800: cubierto por `v_metricas_mercado` (filtra `BETWEEN 800 AND 4000`) + `buscar_unidades_reales` (outlier flag ±55%)
- [x] Filtro `tipo_operacion = 'venta'` en función `buscar_unidades_reales()` (migración 026)
- [x] Filtro `area >= 20m²` para excluir parqueos/bauleras mal clasificados (migración 026)
- [x] ~~Detectar duplicados por proyecto + área + dormitorios con precios muy diferentes~~ — Investigado 23 Mar: 19 pares, 63% son problemas de TC detection (no duplicados reales). Cross-source price variance es comportamiento normal. Cerrado.
- [x] ~~Auditar `tipo_cambio_detectado = NULL` en props activas de venta~~ — Migración 216 (15 Abr): 83 props backfilled (77 merge pre-v2.4 + 6 post). 28→oficial, 1→paralelo (ID 186, precio corregido), 54→no_especificado

## RESUELTO: Falsos positivos verificador — primera_ausencia_at stale (15 Abr 2026, migración 215)

**Root cause:** `registrar_discovery()` no limpiaba `primera_ausencia_at` al re-encontrar props inactivas. Scraper intermitente + `COALESCE(primera_ausencia_at, NOW())` en "Marcar Ausentes" preservaba valores de semanas atrás → verificador auto-confirmaba inmediatamente. 57/118 Remax activas (48%) tenían datos stale.

**Fix:** Migración 215 — `primera_ausencia_at = NULL, razon_inactiva = NULL` en `registrar_discovery()` PASO 3 + cleanup one-time. Cero impacto en absorción (conjuntos disjuntos: cleanup toca `completado`, absorción cuenta `inactivo_confirmed`).

**Análisis técnico completo:** `docs/bugs/BUG_FALSOS_POSITIVOS_REMAX.md`

## UX Completado

- [x] **Leyenda de símbolos en resultados** - Banner colapsable en resultsV2.tsx explicando: incluido, sin confirmar, parqueos, baulera, piso, plan pagos, TC paralelo, descuento, negociable

## Audits — Próximos pasos (13 May 2026)

- [x] **Skill `/audit-feed-ventas-semanal` v1.1** creada — `scripts/auditoria-feed-ventas/audit-feed-ventas-semanal.command.md`. Capas 2+3+4 sin Firecrawl, ventana configurable, race-condition guard 30 min. Test inicial sobre rango 14d-7d reveló 12 falsos positivos → recalibrada en v1.1.
- [x] **`/audit-feed-alquileres-semanal` v1.2** creada — `scripts/auditoria-feed-alquileres/audit-feed-alquileres-semanal.command.md`. Equivalente a ventas semanal adaptado: precio_mensual_bob (no precio_usd), sin TC paralelo, filtro ≤150d, 3 fuentes (C21+Remax+BI), vista `v_mercado_alquiler`. 7 checks capa 2 + 4 capa 3 + 3 capa 4; 8 calibraciones tras retest sobre 37 props (FP 85%→25%). Costo $0.
- [ ] **Validación GPS en matcher** — atrapa caso A1 del audit (LLM confunde proyectos con prefijo común). Hoy el matcher prioriza `nombre_exacto` sobre GPS — si nombre matchea pero GPS está fuera de `radio_metros`, debería downgrade a `pending` (HITL). Backlog post-skill semanal alquileres.
  🔴 **4-ago-2026 — la medición que este ticket necesitaba YA EXISTE, y la hipótesis está invertida.** Ver
  §"Props lejos de su proyecto master" abajo: el error NO parece estar del lado de la prop (el nombre del
  aviso coincide con el del PM) sino en el **GPS del PM**. Un downgrade a HITL por distancia mandaría a
  revisión manual matches correctos cuyo edificio está mal ubicado en el catálogo. **Limpiar el catálogo
  primero, después el guard.**
- [ ] **Aliases para proyectos sin aliases** — auditoría reveló que la mayoría de proyectos Eurodesign + Mirage no tenían aliases. Sería útil un audit one-shot que detecte pm con `alias_conocidos = NULL` y sugiera variantes desde props históricas.

## Props lejos de su proyecto master — ✅ ALARMA EN PROD + Portobello corregido (4 Ago 2026)

> **Cierre del mismo día (PR #66, `d59a024`).** Lo de abajo se escribió a la mañana y quedó
> parcialmente superado — se conserva porque la medición y la trazabilidad del ticket huérfano
> siguen siendo válidas. Lo que cambió:
>
> 1. **La alarma SÍ se implementó**: superficie 5 del audit nocturno (`auditar-matching-shadow.mjs`),
>    umbral 800 m, con memoria (`confirmado_por` / `distancia_revisada`) y respetando el detector de
>    pines genéricos. **REPORTA, NO DESCONECTA.**
> 2. 🔴 **La "hipótesis invertida" de abajo es solo la mitad de la verdad.** Se leyeron 6 casos: en
>    **3 el GPS malo era el del PM** (todos del mismo edificio) y en **3 el match estaba BIEN y lo que
>    fallaba era el pin que el captador puso en el portal**. Por eso la superficie 5 no degrada nada:
>    un guard automático habría roto 3 matches correctos.
> 3. **Portobello Isuto (pm 269) corregido**: su ficha tenía las coordenadas **copiadas del pm 421
>    "Portobello 6"** (3 m de diferencia) y `gps_verificado_visual='false'`. Un solo dato mal producía
>    4 síntomas: 3 avisos a 4 km · 2 avisos ajenos que *parecían* correctos · el pm 421 con 0 avisos ·
>    y nada lo detectaba porque el nombre matcheaba perfecto. GPS confirmado por el founder en Google
>    Maps; 2107/2108 reasignadas al pm 421.
> 4. **Pista automatizada** (la que resolvió el caso a mano): si los hermanos del pm están pegados →
>    el sospechoso es el aviso; si ninguno está cerca → el sospechoso es la ficha, y corregirla arregla
>    todos sus avisos de una.
>
> Quedan **7 a >2 km** (de 10) y la cola larga sin revisar. La superficie 5 los va a listar cada noche
> hasta que se los marque como revisados.



**Problema:** hay props activas a distancias imposibles de su `proyectos_master` asignado. Medido sobre
`propiedades_v2_shadow` (932 activas con GPS en ambos lados):

| Distancia prop ↔ su PM | Props | Lectura |
|---|---:|---|
| **> 2 km** | **10** | casi seguro error |
| 500 m – 2 km | 36 | sospechoso |
| 150 – 500 m | 48 | revisar |
| < 150 m | 838 | normal |

**Causa raíz — hipótesis invertida respecto del ticket viejo:** en las 10 peores **el nombre del aviso
coincide con el del PM** (ej. 3 avisos de "Portobello Isuto" a 4,0 km de su PM, y ambos declarando la
MISMA zona). Si el match fuera equivocado, los nombres no coincidirían. Lo más probable es que **el GPS
del PM en el catálogo esté mal**, no que el matcher se haya equivocado.

**Cómo se descubrió:** auditando el caso "Aura" del 4-ago. Un aviso de alquiler estuvo **23 días colgado
de un PM a 1.156 m** sin que nada lo detectara. Al buscar más casos apareció esta distribución.

**Por qué el mecanismo existente NO lo agarra:** no hay ningún chequeo de distancia prop↔PM en el
pipeline. El matcher es name-first y **nunca fuerza por GPS** (correcto), pero tampoco usa el GPS para
**desconfiar** de un match por nombre.

**Impacto:** una prop con el PM equivocado aparece en el mapa en el lugar equivocado — y desde el PR #62
(filtro por área del mapa) eso significa que **entra o sale del resultado por una ubicación falsa**.
También ensucia el conteo de props por edificio.

🔴 **Ya se había detectado en mayo y quedó huérfano — dos veces:**
1. `docs/proyectos/zona-norte/BITACORA.md:669` diseñó el **FIX B1**: guard de distancia (>800 m) que
   degrade el auto-approve a HITL. Condición que puso: *"medir distribución de distancias en matches EQ
   auto-aprobados antes de aplicar"*. **Esa medición es la tabla de arriba.** B1 nunca se aplicó y nunca
   se promovió de la bitácora a un backlog.
2. `BITACORA.md:692-697` documenta el **mismo patrón Portobello a 3-4 km** y su cleanup… **aplicado solo
   sobre `propiedades_v2` (prod)**. `propiedades_v2_shadow` nunca se re-auditó, y ahí siguen los 3 avisos.
   La doc no aclaraba que el cleanup fue prod-only → el caso se leía como cerrado.

**Decisión (4-ago-2026):** se documenta, no se automatiza todavía. Antes del guard hay que **auditar el
GPS de los PM señalados** — si el error está en el catálogo, un guard por distancia mandaría a revisión
manual matches que están bien. Orden sugerido: (1) revisar los 10 de >2 km contra Google Maps, (2)
corregir el GPS del PM donde corresponda, (3) recién ahí evaluar B1 con el catálogo limpio.

**Query de detección (re-medible):**
```sql
SELECT s.id, s.nombre_edificio, pm.nombre_oficial, pm.id_proyecto_master,
       ROUND((ST_Distance(
         ST_SetSRID(ST_MakePoint(s.longitud, s.latitud),4326)::geography,
         ST_SetSRID(ST_MakePoint(pm.longitud, pm.latitud),4326)::geography)/1000)::numeric,1) AS km
FROM propiedades_v2_shadow s
JOIN proyectos_master pm ON pm.id_proyecto_master = s.id_proyecto_master
WHERE s.status='completado' AND s.duplicado_de IS NULL AND s.es_activa
  AND ST_Distance(ST_SetSRID(ST_MakePoint(s.longitud, s.latitud),4326)::geography,
                  ST_SetSRID(ST_MakePoint(pm.longitud, pm.latitud),4326)::geography) > 2000
ORDER BY km DESC;
```

---

## Duplicados por slug reescrito del portal — RESUELTO en pipeline (4 Ago 2026 · Remax sumado el 28 Ago)

**Problema:** C21 arma la URL como `/propiedad/<codigo>_<slug>` y **reescribe el slug cuando el captador
edita el aviso**. La URL cambia → el aviso entraba como NUEVO y el mismo depto quedaba dos veces en el
feed, **con dos precios distintos**, contaminando la mediana de su microzona.

**Medido:** 8 grupos en el histórico de shadow; 5 seguían activos y visibles — Lofty Island publicado a
**$118.770 y $85.000 a la vez**, Torre Ara $85.000/$79.000, Vertical Terra Bs 4.500/4.000, Maré con dos
tipologías, y Aura con **dos nombres de edificio distintos**.

**Por qué el dedup del audit NO lo agarraba:** la superficie 3 agrupa por `pm+precio+área`, y en estos
casos **el precio cambió** (es el motivo de la reescritura). Los 2 que el audit levantó el 4-ago fueron
coincidencia, no diseño.

**Resuelto (PR #64):** el discovery lo caza por el código —único por AVISO, no por URL— y **captura la
nueva** (el precio nuevo es el vigente; saltearla dejaría el viejo para siempre), y el cargador marca la
vieja `duplicado_de` en el `--apply`. Evidencia de que es seguro sin juez: 8/8 del histórico eran el
mismo aviso, verificados por HTTP (URL vieja muerta, nueva 200). Cero falsos positivos.

**Backfill:** los 5 activos se marcaron a mano el 4-ago-2026 (`dedup_por='founder_2026-08-04'`). No queda
remanente. Detalle: memoria `project_c21_slug_reescrito`.

📉 **Señal de mercado, no solo higiene:** en 3 de los 5 casos el precio había **bajado** (−28%, −7%, −11%).
Un slug reescrito es un aviso editado — y muchas veces, una baja de precio.

### Remax también reescribe el slug — medido, NO se implementa (4 Ago 2026)

**Existe el mismo comportamiento en Remax.** Sus URLs terminan en `<mlsid>-<n>`, y el mismo aviso puede
aparecer con dos slugs: `...-santa-cruz-de-la-sierra-1200164198-31` y
`...-santa-cruz-de-la-sierra-**norte**-1200164198-31`.

**Pero hoy no hay ningún caso que resolver.** Medido el 4-ago sobre `propiedades_v2_shadow`:
**0 grupos** con MLSID repetido. Los 3 registros de ese MLSID viven en `propiedades_v2` (prod) y 2 de
los 3 ya están `inactivo_confirmed` — el verificador los fue dando de baja por su cuenta cuando
desaparecieron del portal.

**Decisión: NO se implementa el gemelo.** Sería código para un problema que hoy no existe (en C21 había
8 casos y 5 activos y visibles; acá, cero). Además las URLs de Remax son más irregulares, así que
extraer el identificador tiene más chance de fallar que en C21.

**Cuándo reactivar:** si aparece un grupo con MLSID repetido y ambos activos. La superficie 5 y el dedup
del audit ya cubren el síntoma indirectamente (dos copias del mismo aviso suelen quedar en el mismo pm).

**Query de detección (re-medible):**
```sql
SELECT substring(url from '-(\d{8,}-\d+)$') AS mlsid, COUNT(*) AS props,
       array_agg(id) AS ids, array_agg(duplicado_de) AS ya_marcados
FROM propiedades_v2_shadow
WHERE url LIKE '%remax.bo%' AND substring(url from '-(\d{8,}-\d+)$') IS NOT NULL
GROUP BY 1 HAVING COUNT(*) > 1;
```

---

## Hallazgos del resumen mensual Equipetrol (13 May 2026)

Detectados al cruzar `propiedades_v2` con `proyectos_master` para armar lectura mensual de mercado. Ambos contaminan métricas de movimiento, concentración y "lanzamientos del mes".

### 1. Duplicados latentes en SANTORINI VENTURA — RESUELTO (24 May 2026)

**Cierre (24 May 2026):** verificado contra prod. El cluster ya no infla el feed: 1 prop canónica activa (id 1754) + 15 marcadas `duplicado_de` (ids 1740-1757, quedan fuera de `v_mercado_venta`); el resto de la signatura $70.402/56m²/1D está `inactivo_confirmed`. Lo único que queda son parqueos/bauleras de área chica (3m², 12,5m²) que el filtro `area >= 20` ya excluye del mercado — no es el bug reportado. Consolidado por curación manual del founder.

**Síntoma (histórico):** 14+ propiedades activas con signatura idéntica (precio $70,402 + 56m² + 1D + estado entrega) sin marcar como duplicados. Cada una con URL distinta en Remax. El broker subió la misma unidad múltiples veces; el algoritmo de detección no las consolidó.

**Impacto:**
- Stock zonal de Villa Brígida inflado (~17 props que probablemente son la misma)
- Tabla "lanzamientos del mes" mostraba SANTORINI primero con 17 unidades — falso positivo
- Análisis derivados ("V. Brígida explotó en actividad") completamente erróneos

**Recomendación:** Revisar lógica de detección de duplicados latentes — actualmente parece basarse en URL o algún hash demasiado estricto. Considerar matching por signatura (precio + área + dorms + estado + id_proyecto_master) cuando hay ≥3 props idénticas en mismo proyecto.

### 2. Matching no respeta `proyectos_master.activo = false` — RESUELTO (migración 245)

**Cierre:** lo arregló la **migración 245** (`245_fix_matching_filter_pm_inactivo`, ver
`docs/migrations/MIGRATION_INDEX.md`). `generar_matches_por_nombre()` y `generar_matches_por_url()` no
filtraban `proyectos_master.activo = true` y auto-aprobaban (score 95/90) sugerencias hacia pms
inactivos — el mismo patrón se repetía en el Klug (2 props al pm=44, duplicado del 61), no solo en
Mare. El fix agregó `pm.activo = TRUE` al JOIN de ambas funciones y limpió 18 sugerencias `aprobado`
históricas (`revisado_por='sistema_filtro_pm_inactivo'`). `generar_matches_fuzzy`/`gps` y
`buscar_proyecto_fuzzy` ya filtraban activo. La query de auditoría de abajo sigue sirviendo como
verificación: debe dar 0 filas.

Lo que sigue es el hallazgo original (13 May 2026), conservado como histórico.

**Síntoma (histórico):** El proyecto Mare (id=4) fue marcado como duplicado de Condominio MARE (id=65) en nov 2025 e inactivado (`activo = false`). Pero 6 props nuevas que entraron al pipeline después siguieron matcheando al proyecto inactivo en lugar del activo, generando huérfanas.

**Evidencia:**
```sql
-- id=4 está inactivo y tiene notas explícitas de consolidación
SELECT id_proyecto_master, nombre_oficial, activo, notas
FROM proyectos_master
WHERE id_proyecto_master IN (4, 65);
-- id=4 "Mare" activo=false, notas="Duplicado de ID 65 - Propiedades transferidas - Inactivado 2025-11-26"
-- id=65 "Condominio MARE" activo=true

-- Pero hay 6 props vinculadas a id=4 (huérfanas)
SELECT COUNT(*) FROM propiedades_v2 WHERE id_proyecto_master = 4; -- 6
```

**Impacto:**
- Cualquier análisis de concentración por proyecto/desarrollador queda inflado (Mare aparece como "Mare Desarrollos" cuando debería ser "Mariscal Construcciones")
- Lecturas de zona se ensucian: las 6 huérfanas estaban geográficamente en coords de id=4 (Eq. Centro) pero el proyecto real Condominio MARE está en Sirari
- Cualquier consolidación futura de proyectos duplicados va a generar el mismo bug si el matching no se arregla

**Recomendación (histórica — lo aplicó la mig 245):**
- Función de matching debe filtrar `activo = true` antes de seleccionar `id_proyecto_master` → ✅ hecho
- Cleanup one-shot: re-vincular las 6 huérfanas de id=4 hacia id=65
- Auditar otros proyectos con `activo = false` para detectar huérfanas similares → apareció el Klug

**Query de auditoría sugerida:**
```sql
-- Detectar todas las huérfanas en proyectos inactivos
SELECT pm.id_proyecto_master, pm.nombre_oficial, pm.notas,
       COUNT(p.id) AS props_huerfanas
FROM proyectos_master pm
JOIN propiedades_v2 p ON p.id_proyecto_master = pm.id_proyecto_master
WHERE pm.activo = false
GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.notas
HAVING COUNT(p.id) > 0
ORDER BY props_huerfanas DESC;
```

### 3. Limitación estructural: SICI no distingue tipos de "entrada al pipeline"

**Síntoma:** Las "entradas" que registra el snapshot (`venta_nuevas_30d = 157` en mayo) mezclan:
- Lanzamientos primarios genuinos (edificio físicamente nuevo)
- Mercado secundario (reventa de unidad usada en edificio existente)
- Re-publicaciones (broker borra y resube anuncio viejo)
- Re-discoveries (SICI re-descubre prop que ya conocía)
- Consolidación de duplicados latentes (como SANTORINI)
- Habilitaciones (proyecto que pasa de preventa a entrega)

**Impacto:** Cualquier interpretación de "aceleración del mercado", "acumulación de vidriera" o "lanzamientos del mes" es inválida sin distinguir tipos. La métrica `venta_nuevas_30d` mide actividad de captura SICI, no actividad real del mercado.

**Mitigación corto plazo:** declarar el límite en cada output editorial (ya aplicado en resumen mensual Equipetrol 13 May).

**Recomendación largo plazo:**
- Campo `tipo_oferta` en `propiedades_v2`: primario / secundario / re-publicación
- Campo `año_construccion` en `proyectos_master` (data manual desde notas de prensa / observación)
- Tabla manual `lanzamientos_oficiales` alimentada editorialmente con fecha de lanzamiento real
- Para B2B pagos: la clasificación se hace manual caso a caso, no se intenta automatizar

## Tipo de propiedad sin normalizar + casas/terrenos colados en `v_mercado_venta` (17-jun-2026)

**Hallazgo** (auditoría matching 17-jun, check 3.5 sobre sin-match de Equipetrol ventas): terrenos y casas mezclados en `v_mercado_venta`. Dos problemas:

1. **`tipo_propiedad_original` sin normalizar.** Es el valor CRUDO del portal (de ahí "_original"). En toda la base (1.100+ `completado`): **"departamento" (778) + "Departamento" (322)**, "casa" (9) + "Casa" (1), "terreno" (5) + "Terreno" (2), penthouse (8), oficina (1). **No existe un campo de tipo canónico** → cada query maneja las variantes a mano (frágil, se olvida).
2. **`v_mercado_venta` NO filtra por tipo.** Incluye **11 casas/terrenos** (todas sin match). El pipeline de casas/terrenos (mig 221) las marca `status='completado'` igual que deptos, y la vista —creada cuando solo había deptos— nunca se actualizó para excluirlas.

**Por qué no molesta hoy:** el feed público (`buscar_unidades_simple`) usa **INNER JOIN** a `proyectos_master` → las casas/terrenos sin match quedan filtradas **por accidente** (no tienen pm). Solo se ven en queries directas a la vista (auditoría). ⚠️ **PERO si ventas pasa a LEFT JOIN** (para mostrar genéricos como alquiler), **aparecerían en el feed** → este fix es **prerrequisito** de ese cambio.

**Bug colateral detectado:** la auditoría semanal de ventas v1.6 filtra `tipo_propiedad_original = 'departamento'` (igualdad exacta) → **se pierde las 322 "Departamento" con mayúscula**. Cambiar a `ILIKE 'departamento'`.

**Fix — dos horizontes distintos (no confundir):**

### A) PUENTE (ahora) — blacklist en `v_mercado_venta`
Resuelve el problema inmediato (limpiar el feed de deptos). Cambio mínimo, 1 línea, consistente con la lógica que la vista YA usa (blacklist `<> ALL`):
```sql
-- en el WHERE de v_mercado_venta:
-- ANTES: AND (COALESCE(tipo_propiedad_original,'') <> ALL (ARRAY['baulera','parqueo','garaje','deposito']))
-- DESPUÉS:
AND (lower(COALESCE(tipo_propiedad_original,'')) <> ALL (ARRAY['baulera','parqueo','garaje','deposito','casa','terreno','oficina']))
```
**Análisis de riesgo (medido 17-jun): BAJO.**
- Saca **11 props** (5 casas + 6 terrenos), **todas sin match** → ya invisibles en el feed público (INNER JOIN de `buscar_unidades_simple` las tapa). **Cero impacto al feed.**
- **Ninguna vista depende** de `v_mercado_venta` (`pg_depend` = vacío).
- Consumidores (Market Pulse Dashboard, prospección, skills) **mejoran** (sacan el ruido: terrenos a $2.001/m² distorsionan medianas).
- Único riesgo menor: **4 casas/terrenos en `broker_shortlist_items`** → mitigado porque `precio_norm` se guarda como **snapshot** en el item; las shortlists existentes no se rompen (solo un re-armado de esas 4 props puntuales perdería el precio_norm).
- Aplicación: `CREATE OR REPLACE VIEW` (no DROP → reversible, no rompe deps) + test `BEGIN; … ; ROLLBACK` verificando que el total baja exactamente 11. Definición actual exportada con `pg_get_viewdef` el 17-jun.
- **NO over-engineering aquí:** NO whitelist (`IN (...)` podría excluir un tipo legítimo futuro), NO campo nuevo, NO tocar extractor. Solo ampliar el blacklist + `lower()`.

**✅ APLICADO 17-jun a AMBAS vistas (con `CREATE OR REPLACE`, def previas exportadas para revertir):**
- **`v_mercado_venta`**: blacklist ampliado (ya excluía baulera/parqueo) + `lower()` + casa/terreno/oficina. Sacó **11 casas/terrenos**. Match rate venta Eq 94.9→**98.6%**, ZN 87.2→**87.8%** (salieron sin-match del denominador). Verificado con test antes/después: **solo 2 grupos de Sirari cambian** (3-dorm: mediana 2.594→2.752 = mejora real sin la casa; 0-dorm: cae <3 props y el grupo pierde su mini-estudio — su mediana estaba contaminada igual). Las 6 funciones de mercado se benefician.
- **`v_mercado_alquiler`**: **AGREGADO** el filtro — ojo, esta vista **NO tenía NINGÚN filtro de tipo** (el "baulera" que un check superficial detecta es la *columna* `p.baulera`, no un filtro). Blacklist completo + `lower()`. Sacó **1 oficina** (2663). Penthouse (1) y deptos quedan. Total 261→260.
- **⚠️ DIFERENCIA CLAVE alquiler (verificada, no asumir):** el feed (`buscar_unidades_alquiler`) usa **`propiedades_v2` DIRECTO**, NO la vista (a diferencia de venta, donde `buscar_unidades_simple` usa la vista para el mini-estudio). → El parche de la vista **limpia las stats/comparables** (las 5 funciones de mercado) **pero la oficina 2663 SIGUE VISIBLE en el feed** (matcheada a pm 6 La Riviera). Sacarla del feed requeriría tocar `buscar_unidades_alquiler` → no vale por 1 prop. **Esto es justo lo que el campo canónico (B) resuelve bien:** el feed de alquiler filtraría por `tipo_propiedad` en un solo lugar.

### B) INFRAESTRUCTURA (en Fase 3 del PRD Casas/Terrenos) — campo `tipo_propiedad` canónico
**Cuándo:** cuando se construya el feed público de casas/terrenos (Fase 3, `docs/backlog/CASAS_TERRENOS_PRD.md`). Si el sistema escala a multi-tipo, el tipo pasa a ser dimensión de **primer orden** y el blacklist por vista NO escala (habría que parchear N vistas por cada tipo nuevo).

**Decisión de diseño (founder, 17-jun):** sí vale el campo normalizado **en ese momento** — no antes (construir infra sin consumidor sería adelantarse), no como parche de skill.

**Diseño mínimo (sin over-engineering):**
- Columna `tipo_propiedad` en `propiedades_v2` — valores **canónicos planos**: `departamento`, `penthouse`, `casa`, `terreno`, `oficina` (los que ya existen; no inventar tipos).
- **Derivada** de `tipo_propiedad_original` (que sigue siendo el crudo del portal, útil para debug) vía mapeo simple (lower + variantes). UPDATE one-shot para histórico + el merge/extractor la setea para nuevas.
- Las vistas/feeds segmentan por el canónico: `v_mercado_venta` → `tipo_propiedad IN ('departamento','penthouse')`; `v_mercado_casas` → `'casa'`, etc. Agregar un tipo = un valor en el mapeo, no parchear vistas.
- **Evitar:** jerarquía tipo/subtipo, enum rígido de Postgres (preferir `text` + CHECK o mapeo en código), migrar todo de golpe.

**Orden:** A (puente) desbloquea hoy las skills/dashboard; B (campo) se hace dentro de Fase 3, justo cuando hay varios feeds que segmentar.
