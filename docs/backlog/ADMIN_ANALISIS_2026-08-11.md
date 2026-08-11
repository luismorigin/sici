# El admin contra la data nueva — análisis profundo

> Pedido por el founder el 11-ago-2026 al arrancar el trabajo intermedio del cutover:
> *"antes estaba pensado para corregir cosas raras… vale la pena analizar cómo funciona y qué sirve
> ahora mejor con la data, y qué valdría la pena sacar o reordenar"*.
> Todo está **medido**: 6.516 ediciones reales de `propiedades_v2_historial`, las 21 pantallas, sus
> 16 funciones de BD y la lógica interna de los dos editores. Nada es opinión sobre cómo debería
> usarse: es cómo está hecho y cómo se usó.

## 1. Cómo se usó de verdad

| | |
|---|---|
| Ediciones de admin | **4.981**, sobre **534 propiedades**, en **63 días** con actividad |
| Última edición | **6-jul-2026** — 5 semanas antes de que se rompiera |
| Propagación proyecto→props | murió el **11-mar** |
| Sincronización proyecto→props | murió el **11-may** |

**El admin dejó de usarse solo, un mes antes del cutover.** No porque fallara: porque el trabajo que
hacía dejó de existir.

## 2. Qué se editaba, y qué pasa hoy con eso

| Campo | Veces | Hoy |
|---|---:|---|
| `equipamiento` | 813 | 🔻 lo extrae el lector (spec v4.2) |
| `amenities` | 636 | 🔻 lector + nivel edificio en `proyectos_master` |
| **`solo_tc_paralelo`** | 531 | 💀 **muerto** — el TC se unificó |
| `plan_pagos_desarrollador` | 509 | 🔻 lo lee el lector; el feed casi no lo usa |
| `precio_negociable` · `acepta_permuta` | 1.008 | 🔻 ídem |
| `baulera` | 490 | 🔻 el lector distingue incluida/aparte |
| **`estado_construccion`** | 464 | 🔄 cambió de forma (§4) |
| `zona` | 379 | 🔻 la resuelve `v_zona_efectiva_shadow` (mig 316) |
| **`precio_usd`** | 355 | ✅ vivo — superficie 7 del audit |
| `fecha_entrega` | 312 | 🔻 último uso 7-may |
| **`tipo_precio`** | 215 | 💀 muerto con el TC unificado |
| **`id_proyecto_master`** | 186 | ✅ vivo — pero hoy se resuelve por SQL |

**Más de 3.500 de las ~4.981 ediciones son de campos que el lector ya resuelve o que el TC unificado
volvió irrelevantes.**

### La data mejoró donde dolía
Piso **2% → 46%** · Edificio identificado **65% → 87%** · Baulera **11% → 24%** · Teléfono del
captador **96% → 100%**.
⚠️ El lector deja `null` honesto donde el aviso calla (equipado 23%, amoblado 15%, expensas 4%). Eso
**no es un hueco para llenar a mano**: es la diferencia entre "no sabemos" y "el pipeline viejo lo
inventaba".

## 3. 🔴 La lógica de precio del editor es del régimen VIEJO

Lo más grave del análisis, y no se ve desde afuera: `usePropertyEditor.ts` **convierte antes de
guardar**, con el TC viejo hardcodeado.

```js
// calcularPrecioNormalizado() — esto es lo que se ESCRIBE
case 'bob': return Math.round(precioPublicado / 6.96)   // TC real hoy: 11,64
```

**Tres formas distintas de corromper precio:**
1. **Venta en Bs** → `precio_usd = precio / 6,96` → **67% más caro**. Bs 700.000 se guardan como
   $100.575 en vez de $60.148.
2. **Alquiler** → escribe **las dos columnas** (`precio_mensual_bob` *y* `precio_mensual_usd`), y
   deriva el dólar con 6,96. El verificador nocturno controla justamente que eso **nunca** pase
   ("anti-doble-normalización: DEBE SER 0"). `pages/admin/alquileres/index.tsx` hace lo mismo, aunque
   con el TC correcto de Binance: sigue escribiendo las dos.
3. Sigue escribiendo `solo_tc_paralelo`, el flag del régimen muerto.

🔑 **El arreglo no es cambiar 6,96 por 11,64.** Es que el editor **deje de convertir**: guardar el
crudo con su tag de moneda, como hace el lector nocturno, y dejar que la base normalice al leer.
Es el principio que rige en todo el resto del sistema — *crudo adentro, normalizado afuera*.

⚠️ **Consecuencia operativa:** el admin **no se puede desplegar apuntado a la base viva** hasta
arreglar esto. Mientras escribía en la tabla que nadie leía, el error era inofensivo.

## 4. Estado por pantalla (21 pantallas, ~15.000 líneas)

| Pantalla | Líneas | Estado |
|---|---:|---|
| `market.tsx` | 2.157 | 🔴 lee la serie de prod, **cortada el 27-jul** + tabla vieja |
| `propiedades/index` | 1.579 | 🔴 usa `buscar_unidades_reales` (rota). Y la función nueva **esconde 182 props** sin edificio |
| `proyectos/[id]` | 1.160 | 🟡 anda, pero ver §5 |
| `alquileres/index` | 1.096 | 🟡 TC correcto, pero rompe la doble normalización |
| `proyectos/index` | 1.030 | 🟡 lee la tabla vieja |
| `salud` | 1.002 | 🔴 sus 3 fuentes están mudas desde el 28-jul |
| `propiedades/[id]` | 746 | 🔴 la lógica de precio de §3 |
| `market-alquileres` | 703 | 🔴 tabla vieja |
| **`supervisor/*` (5 pantallas)** | 2.721 | 💀 su cola (`matching_sugerencias`) **no recibe datos desde el 28-jul**, y **10 de sus funciones están rotas** |
| **`contactos`** | 412 | 🟢 **VIVO** — el CRM del bot, su data entra sola |
| `prospection`, `simon-brokers`, `brokers`, `property-reports` | ~2.400 | 🟢 no dependen de propiedades |

**~9.000 de las 15.000 líneas trabajan sobre datos muertos o rotos.**

🔑 **Y el dato que más dice del rediseño: la pantalla más útil del admin hoy es la única que no fue
hecha para editar** — el CRM de contactos, que solo muestra lo que el bot trae solo.

## 5. 🔴 El editor de proyectos edita el campo que el sistema dejó de creer

`proyectos_master` es **el catálogo vivo** (456 edificios, 281 con alias) y donde pasa el trabajo
real de hoy. Pero su editor no permite tocar **ninguno** de los campos que el sistema nuevo usa:

| Campo | Para qué | ¿Editable? |
|---|---|---|
| `entrega_verificada{,_at,_por,_notas}` | Sellar la observación humana del estado de obra (mig 315) | ❌ |
| `alias_conocidos` | Que un edificio no vuelva a la cola cada noche | ❌ |
| `pet_friendly` | Chip del feed (mig 278) | ❌ |
| `gps_verificado_visual` | Marcar el GPS confirmado a mano | ❌ |
| `estado_construccion` | **El campo que la mig 315 declara poco confiable (acierta 78%)** | ✅ |

Por eso los alias y los sellos se aplican **pegando SQL**: no tienen dónde entrar.

## 6. Lo que hace falta hoy — y no tiene pantalla

| Trabajo pendiente | Hoy |
|---|---|
| Props **sin edificio identificado** (no llegan al feed) | **182** (11 con nombre en el aviso) |
| Estado de obra **sin confirmar** | **187** |
| Estado de obra **deducido, no afirmado** (vecinos / hay alquiler) | **234** |
| Edificios sellados por el founder | 10 |
| Props con candado | 140 |

Cada noche el audit produce aprobaciones, confirmaciones, PM_NUEVO bloqueados por GPS, dedup,
dictados de estado y precios incompatibles. **El circuito es: el audit escribe un `.sql` → el founder
lo pega en Supabase.** El admin no participa. Eso significa: sin registro en el historial, sin
validación previa, y hay que leer SQL para entender qué se decide.

## 7. Propuesta

### Antes que nada (bloquea todo lo demás)
1. **Los candados protegen a medias** — y fallan justo donde hacen falta.
   - **Los que valen son los 140 de la base viva.** En el archivo hay 2.678 más, pero esa tabla ya no
     se lee: son historia. Y varias están **corruptas**, con claves numéricas (`0`,`1`,`2`…) en vez de
     nombres de campo — el formato roto que la memoria `feedback_candado_formato_objeto` ya había
     detectado (un string no protege; tiene que ser objeto).
   - **Quién los respeta:** el audit nocturno (`auditar-matching-shadow.mjs`) y el cron de casas. ✅
   - **Quién NO:** los cargadores de deptos. Pero el riesgo es **más específico** de lo que parece: el
     cargador hace `upsert` por `id` y en el ciclo nocturno normal **solo procesa nuevas** → inserta,
     no pisa. **El peligro aparece al RE-PROCESAR una prop existente** (`--ids`, relectura, barrido):
     ahí el upsert sobrescribe todas las columnas, candado incluido.
     🔑 O sea: **el candado falla exactamente en el caso para el que se puso.** En la operación diaria
     no molesta; el día que se relee un edificio entero, la corrección se pierde.
   - **Y el panel miente sin querer:** dice *"protegidos del merge nocturno"*, pero ese merge era del
     pipeline n8n, apagado desde el 28-jul. Quien lo lea confía en una protección que cambió de dueño.
2. **Sacar la conversión de precio del editor** (§3) antes de desplegarlo contra la base viva.

### Sacar
3. Flags de TC del editor (`solo_tc_paralelo`, `tipo_precio`) — 746 ediciones históricas, cero uso hoy.
4. Propagación y sincronización — muertas hace 3 y 5 meses.
5. **Las 5 pantallas del supervisor** (2.721 líneas) — cola sin datos, 10 funciones rotas.
6. `market`, `market-alquileres` y `salud`: repuntar a las fuentes vivas o retirar. Hoy muestran un
   mercado congelado el 27-jul y una salud que nadie reporta.

### Reordenar
7. **El editor de propiedades**: dejar arriba lo que se toca de verdad (precio, edificio, GPS/zona,
   estado, candados) y plegar el resto en "avanzado".
8. **El listado**: ordenar por lo que necesita atención (las 182 sin edificio primero), no por fecha.
   Y que consulte la tabla directo — el admin necesita ver lo que el feed esconde, que es lo contrario
   de lo que hace la función del feed.

### Agregar — lo que cambia el valor del admin
9. **La bandeja del audit**: que las decisiones que hoy viajan en `.sql` se vean como casos con su
   evidencia (la cita del anuncio, los candidatos, la distancia al edificio) y dos botones.
10. **Los campos vivos de `proyectos_master`** (§5): sellar entrega, alias, pet friendly, GPS
    verificado. Es donde está el trabajo real y hoy no tiene interfaz.

## 8. Las 11 pantallas restantes — con el uso confirmado por el founder

Estas se habían clasificado solo por su fuente de datos. El founder confirmó cuáles usaba:

| Pantalla | Uso real | Veredicto |
|---|---|---|
| **`market` + `market-alquileres`** | *"las miraba para ver el mercado, dejaron de servir cuando se cortó la serie"* | 🟢 **RECUPERABLE, y sale ganando** — ver abajo |
| **`proyectos/index` + `[id]`** | *"cuando hay que crear o corregir un edificio"* | 🟢 **el esqueleto está bien**, le faltan los 5 campos vivos (§5) |
| **`contactos`** | *"el que más valor tiene hoy"* | 🟢 vivo, no tocar |
| **`supervisor` ×5** (2.721 líneas) | *"no lo abro desde que el audit hace ese trabajo"* | 💀 **retirar** |
| `brokers`, `simon-brokers`, `prospection`, `property-reports` | negocio B2B **pausado** | ⏸️ dejar como están |
| `salud` | — | 🔴 repuntar o retirar: sus 3 fuentes están mudas |

### 🟢 `market` se recupera y MEJORA (medido)
La serie shadow tiene **todas** las columnas de la vieja (`falta_en_la_nueva = null`) **más 25**:
spread preventa/entrega, cortes por amoblado y equipado, con parqueo, días en mercado, concentración
por edificio, y **`macrozona`** → podría mostrar Equipetrol y Zona Norte por separado, algo que la
pantalla nunca pudo.
⚠️ Lo único que se pierde es profundidad: la nueva arranca el **21-jul** (1.228 filas) contra el
12-feb de la vieja. Pero esa profundidad **ya está perdida**: la vieja está cortada el 27-jul. Lo
honesto es mostrar las dos declarando el corte, como ya se hace en `/mercado`.

### 🟢 `proyectos` está mejor construido de lo que parecía
Ya tiene: crear edificio · detectar zona por GPS · inferir datos desde sus propiedades · **propagar
verificando candados antes** (`verificarCandadosAntesPropagar`). Es decir: **crear un PM desde el
admin —lo que hoy hacés por SQL— ya está resuelto**; solo hay que repuntar sus funciones.
Le faltan los 5 campos vivos de §5, que es donde está el trabajo de hoy.

## 9. Los tres aportes del founder que corrigen el diagnóstico

1. **Propagar y sincronizar SÍ sirven** — yo los había dado por muertos. Verificado: el feed toma las
   amenidades **de la propiedad**, no del edificio por JOIN, así que nada las completa solo. Y con el
   lector dejando `null` honesto (equipado 23%, amoblado 15%), propagar desde el edificio es la forma
   de completar **sin inventar**: el dato sale del edificio real, no de una suposición. Es lo contrario
   de lo que hacía el pipeline viejo.
2. **El `tipo_cambio_detectado` tiene que verse.** Hoy el editor muestra `tipo_precio` — lo que el
   humano elige — y no lo que el lector **entendió del anuncio**. Son cosas distintas, y la segunda es
   la que explica por qué un precio se ve como se ve. Va como dato, no como campo editable.
3. 🔑 **El admin tiene que hablar el idioma del feed.** Hoy muestra el precio con la fórmula vieja
   (§3) → **el número del admin y el del feed no coinciden**. Y el listado **no filtra por precio**
   (verificado: cero referencias). Entonces no se puede buscar la propiedad que se vio en el feed:
   solo por id o por nombre de edificio.

**Este tercer punto reemplaza la propuesta original de este documento.** "Convertir el admin en la
bandeja del audit" era correcto pero caro. "Que el admin hable el idioma del feed" es más barato,
arregla el problema del precio **de paso**, y sirve a las dos puertas (§10).

## 10. Las dos puertas — el encuadre que ordena el rediseño

El admin es **una herramienta con dos entradas**:
- **Por propiedad** (existe): entrás porque querés ver *esa* propiedad. Revisión.
- **Por problema** (falta): entrás porque el sistema dice *"estas 8 necesitan una decisión"*. Auditoría.

Las dos terminan en lo mismo: **mirar el dato, decidir, y trabarlo para que no se pise.** Hoy solo
existe la primera; la segunda va por SQL. Y **las dos necesitan lo mismo para servir**: que el número
sea el del feed, y que el candado proteja (✅ resuelto el 11-ago para el re-proceso).

## 11. En una frase

El admin fue construido para **corregir a mano lo que el pipeline viejo hacía mal**. El pipeline
nuevo hace bien casi todo eso —y donde no sabe, dice `null` en vez de inventar—. Lo que quedó sin
resolver no son campos sueltos: son **decisiones**, y hoy se toman pegando SQL.

El admin no necesita arreglarse. Necesita **hablar el idioma del feed** y abrir su segunda puerta.

## 12. PLAN — en 3 pasos, cada uno útil por sí solo

> Trabajo en rama. Cada paso se puede parar sin dejar nada a medias.
> Estado al 11-ago: el paso 0 (candados en los cargadores) ya está en `main`, commit `82634b1`.

### PASO 1 — Que el admin hable el idioma del feed  ⬅️ *desbloquea todo lo demás*

**GOAL (una frase):** que el número que el admin **muestra y guarda** sea exactamente el que ve el
cliente en el feed.

**NO es el goal** (y no se toca en este paso): rediseñar pantallas, la bandeja del audit, market,
proyectos. Solo el idioma del precio y poder llegar a una propiedad por lo que se ve en el feed.

#### 📸 Línea de base — medida el 11-ago, ANTES de tocar nada
La foto previa del cutover no sirve acá: medía feeds, bot y páginas públicas. El admin no estaba.
Estas son las props de referencia (todas `tipo_cambio_detectado='bob'`, el caso que rompe):

| id | crudo guardado (Bs) | **el feed muestra** | **el admin mostraría/guardaría** | brecha |
|---|---:|---:|---:|---:|
| 1441 | 595.000 | **$51.126** | $85.489 | **+67%** |
| 1903 | 670.000 | **$57.570** | $96.264 | +67% |
| 1926 | 660.000 | **$56.711** | $94.828 | +67% |
| 1937 | 820.000 | **$70.459** | $117.816 | +67% |
| 1976 | 805.000 | **$69.170** | $115.661 | +67% |
| 2082 | 432.140 | **$37.132** | $62.089 | +67% |
| 2123 | 504.000 | **$43.306** | $72.414 | +67% |
| 2126 | 515.000 | **$44.252** | $73.994 | +67% |

La brecha es **constante y estructural**: `11,638 / 6,96 = 1,672`. No es un bug de una prop, es la
fórmula.

#### Qué cambia

🔴 **No es "mostrar el crudo": es mostrar los DOS y guardar solo el crudo.**
Corrección del founder al borrador de este plan: *"cuando yo como admin vea el precio crudo voy a
decir que esto está mal"*. Y tiene razón — abrir una propiedad y ver **595.000** se lee como un dato
cargado mal, porque ese no es "el precio", es el número del aviso en otra moneda. Tal como estaba
escrito, el paso arreglaba el dato y **rompía la lectura**.

La pantalla muestra dos cosas, cada una con su rol explícito:

| | |
|---|---|
| **Lo que dice el aviso** — *editable* | Precio publicado: `595.000` en `Bolivianos` |
| **Lo que ve el cliente** — *solo lectura, debajo* | Así se ve en el feed: **$51.126** · TC del día: 11,64 |

Así el número que se edita es el del aviso, con su traducción al lado. Si los dos no cuadran, se nota
al instante.
🎁 **Y da algo que hoy no existe:** cuando el audit avisa *"este depto está a $84.000 y sus gemelos a
$165.000"* (superficie 7), se puede ver de un vistazo si el problema es **el precio** o es **la
etiqueta de moneda** — la causa más común de esos casos. Hoy el admin muestra un solo número
convertido con una fórmula vieja y no deja distinguirlos.

- **La conversión NUNCA se escribe**: aparece en pantalla como referencia y nada más. Se elimina el
  `/6.96` y el doble poblado de columnas en alquiler (§3).
- **El selector deja de llamarse "tipo de precio"** y pasa a ser lo que en realidad es: *en qué moneda
  está publicado el aviso*. Eso es lo que se guarda como etiqueta (`tipo_cambio_detectado`) y lo que
  el lector nocturno ya viene completando solo (aporte 2 de §9).
- **Filtro por precio en el listado** — hoy no existe (aporte 3). Filtra por el **normalizado**, que es
  el número con el que uno piensa y el que se ve en el feed.
- Listado y editor contra la base viva (ya hecho en la rama; se libera al desplegar este paso).

#### Qué NO cambia — y hay que poder demostrarlo
**Ningún precio ya guardado se toca.** Este paso es de **visualización y de guardado futuro**. Si al
desplegar cambia el valor de una propiedad existente, algo se hizo mal.

#### EVALS
1. 🔴 **Ninguna prop existente cambia de precio por el deploy.** Medida: los `precio_usd` de las 8 de
   arriba, idénticos antes y después. *(El único que obliga a revertir.)*
2. **El admin muestra lo mismo que el feed.** Medida: en las 8, el número de "así se ve en el feed"
   == la columna "el feed muestra" de la tabla de arriba.
3. **Guardar en Bs no infla.** Medida: editar la 1441 sin cambiar el precio y volver a leer → sigue
   `595000` con tag `bob`, no `85489`.
3-bis. **Se entiende sin explicación.** Medida cualitativa, la única del set: el founder abre la 1441
   y **no duda** de si el dato está bien cargado. Si duda, la pantalla falla aunque los números estén
   correctos — que es exactamente lo que este plan casi rompe.
4. **Se puede llegar por precio.** Medida: filtrar $50.000–$60.000 en el admin devuelve el mismo
   conjunto que el feed con ese filtro.
5. **Alquiler: una sola columna.** Medida: guardar un alquiler y verificar que no quedan pobladas
   `precio_mensual_bob` y `precio_mensual_usd` a la vez (lo que el verificador controla cada noche).

**Aborto:** solo por el eval 1. Los otros son información.
**Recién con el eval 1 y el 3 en verde se puede DESPLEGAR el admin** (hoy bloqueado, §3).

### PASO 2 — Devolver lo que se rompió y completar el catálogo
- **`market` y `market-alquileres` → serie shadow** (§8): vuelven a funcionar y ganan 25 métricas +
  las dos macrozonas. Declarar el corte del 21-jul.
- **Repuntar propagar / sincronizar / inferir** de `proyectos` (§9 aporte 1): es cómo se completan los
  `null` sin inventar.
- **Agregar a `proyectos` los 5 campos vivos** (§5): sellar entrega, alias, pet friendly, GPS verificado.
  Con eso, crear un PM y sellar un estado dejan de hacerse por SQL.

- **Los rechazos del gate, a la base y al parte matutino** — reemplaza a `supervisor/excluidas`, que
  NO se reconstruye (ver abajo).

**Evals:** market muestra la serie sin huecos y con las 2 macrozonas · crear un edificio desde el admin
deja la misma fila que el SQL del audit · un alias cargado acá saca al edificio de la cola esa noche ·
el parte de la mañana dice qué se descartó y por qué, sin abrir ningún archivo.

#### 🔍 Por qué `supervisor/excluidas` no se reconstruye — y qué va en su lugar
Se miró antes de descartarla (11-ago):
- **En la base viva hay 3 excluidas.** En el archivo había 80. No hay nada que revisar: el gate ahora
  decide **al capturar**, no después.
- **Los 127 rechazos del gate viven en `output/rechazados.json`**, un archivo local: no están en la
  base, no tienen pantalla, y solo aparecen como un número en el log de la noche.
- 🔑 **109 de esos 127 no tienen motivo** (`{id, url:null}`): son residuo del formato viejo indexado
  por id — el bug de [[project_rechazados_json_indexa_por_id]]. **Limpiarlos.**
- Los **18 nuevos sí lo tienen, y son mejores que cualquier pantalla vieja**, porque citan el anuncio:
  *"operación alquiler tipeada como venta: el cuerpo declara Precio de alquiler…"* · *"no es un
  departamento: es una CASA DÚPLEX de 2 pisos con patio"* · *"anticrético tipeado como venta: el slug
  dice en-anticretico"*.
  La pantalla vieja mostraba una razón genérica de un catálogo; el lector explica con la cita.

👉 **Entonces no hace falta pantalla: hace falta que ese motivo salga del archivo.** Que el rechazo se
guarde en la base y aparezca en el parte matutino ("anoche se descartaron 3: uno era una casa, dos eran
alquiler tipeado como venta"). Más barato que una pantalla y da lo que la pantalla nunca dio: **el
porqué en palabras**. Si un descarte está mal, se ve y se recupera.

### PASO 3 — La segunda puerta (bandeja del audit)
Que las decisiones que hoy viajan en `.sql` se vean como casos con su evidencia (la cita del anuncio,
los candidatos, la distancia al edificio) y dos botones. Aplicar desde ahí, **con registro en el
historial** — hoy el SQL no deja rastro.

**Eval:** una noche de audit resuelta entera desde la pantalla, sin abrir Supabase.

### Y en paralelo, retirar (no bloquea nada)

**Las 6 pantallas de `/admin/supervisor` — 2.721 líneas.** Todas trabajan sobre `matching_sugerencias`,
que **no recibe una fila desde el 28-jul**, y 10 de sus funciones están rotas:

| Pantalla | Líneas | Qué hacía | Qué la reemplazó |
|---|---:|---|---|
| `index` | 230 | Panel con los contadores de pendientes | — |
| `matching` | 543 | Aprobar/rechazar matches propuestos | **Superficies 1 y 2** del audit |
| `sin-match` | 684 | Resolver props sin edificio | **Superficie 1** |
| `excluidas` | 570 | Revisar props excluidas por filtros | El **gate del cargador** (ver arriba) |
| `auto-aprobados` | 522 | Validar los matches automáticos | **Superficie 2** (auto-match riesgoso) |
| `matching-piloto` | 172 | El piloto de matching por macrozona | Obsoleto al salir del piloto |

🔑 **El motivo de fondo, más allá de que estén rotas:** ese circuito hacía que un humano revisara en
lotes, después del hecho, lo que el sistema no supo resolver. El audit nocturno hace lo mismo pero
**lee el anuncio, trae la evidencia y deja el SQL listo**. Por eso el founder dejó de abrirlas sin
darse cuenta.

**También:** los flags de TC del editor · `salud` (repuntar o retirar). El B2B (`brokers`,
`simon-brokers`, `prospection`, `property-reports`) **se deja como está**: pausado y no molesta.
