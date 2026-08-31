# Dónde retomar — Zona Norte al híbrido (actualizado 29-jul-2026)

> ✅ **TODO MERGEADO Y PUSHEADO A `main` el 29-jul** (commit `357103b`, 10 commits).
> Las routines nocturnas ya corren con la perilla de zona, el discovery acotado y el
> verificador arreglado. El worktree `.claude/worktrees/zn-perilla-zona` sigue existiendo
> pero **ya no tiene nada exclusivo**: se puede trabajar directo en `main`.

## ⚡ Estado al 29-jul (leer esto primero)

| | |
|---|---|
| **Equipetrol** | ✅ **auditoría CERRADA**. Matching 91,4% venta · 87,0% alquiler. Sin edificios pendientes |
| **ZN venta en la base nueva** | **326 de 448**, matching **77,9%** (dos tandas aplicadas el 29-jul) |
| **Edificios ZN** | 15 creados + Torres Soho 1y2 / Torre Soho 3 · **31 alias cargados** |
| **Sin resolver en ZN** | solo 2: `2076` "Condominio Baruc norte" y `1996` "Condominio Ziri" — las dos por **nombre de cluster sin numeral** |
| **SQL del audit ZN** | escrito, sin aplicar — 4 aprobar · 1 rechazar · 4 dedup |
| **Migraciones** | 309-312 aplicadas **y** en el repo (el desfase 308↔311 se cerró) |
| **Respaldo** | `Desktop/Censo inmobiliario/RESPALDO-ZN-2026-07-29` (la carpeta `output/` está gitignored) |

✅ **Nada bloquea la tanda.** (El tag `bob` figuraba acá como bloqueo hasta el 30-jul — resuelto, ver abajo.)

## Los 3 bugs que se cazaron el 29-jul (ya arreglados en main)

1. **El verificador era ciego a las bajas de Century21** — chequeaba `?json=true`, que devuelve
   200 aunque la página esté 404. Nunca confirmaba una baja: *revivía* las props muertas cada
   noche. 111 props de Equipetrol quedaron marcadas como desaparecidas; en la muestra, las 9
   probadas estaban caídas **y en el feed**. Esperar decenas de "contadores arrancados" las
   primeras noches: es el arreglo funcionando. Memoria `project_bug_verificador_json_true_ciego`.
2. **El audit mezclaba ZN con Equipetrol** — ahora tiene perilla (`--zona`), default Equipetrol.
3. **`inyectar-veredictos` sugería el cargador de alquiler** para tandas de venta.
   ⚠️ Y **reemplaza, no acumula**: pasarle los 7 archivos en UNA corrida.

## ✅ El tag `bob` — CERRADO (30-jul-2026). No vuelve a discutirse por macrozona.

> Esta sección decía "la decisión que bloquea la tanda". **Ya no bloquea nada.** Se deja el
> razonamiento porque explica por qué los `bob` dan $/m² más bajo, no porque haya algo que decidir.

**La solución ya existe y es de arquitectura, no de macrozona:** el precio en bolivianos se guarda
**crudo con tag `bob`** y `precio_normalizado_shadow()` hace `crudo / tasa` **en vivo**
(`TC_NUEVO_DECISION.md:85`). Es el principio de siempre: *crudo + tag adentro, normalizado afuera*.
No hay una segunda decisión que tomar cuando la misma situación aparece en otra zona.

**Equipetrol ya lo demuestra en producción** (medido 30-jul, venta activa en shadow, $/m² promedio):

| tag | Equipetrol | Zona Norte |
|---|---|---|
| `no_especificado` | $1.730 (340) | $1.398 (195) |
| `paralelo` | $1.716 (61) | $1.500 (31) |
| `oficial_viejo` | $1.881 (40) | $1.462 (66) |
| **`bob`** | **$1.634 (27)** | **$1.150 (29)** |

En Equipetrol el `bob` queda **6% abajo** del `no_especificado` — dentro de la dispersión normal
entre tags, conviviendo sin problema desde el lanzamiento del TC nuevo. En ZN la brecha es mayor
(-18%), pero ZN es un mercado más barato y la muestra es de 29 props.

🔑 **Por qué se cierra y no se re-litiga:** si cada macrozona vuelve a discutir cómo interpretar un
tag que la arquitectura ya resuelve, el trabajo no escala — hay 14 microzonas en ZN y detrás viene
el resto de Santa Cruz. La decisión se toma una vez, a nivel de la normalización, y las zonas la
heredan. Lo que sí sigue valiendo es el **contraste con el terreno** (preguntarle a un captador si
acepta bolivianos a ese cambio), pero como validación de mercado, **no como bloqueo de pipeline**.

## 🔴 REGLA NUEVA (29-jul): juez independiente ANTES del apply

El audit tiene 3 superficies (sin-match · auto-match riesgoso · duplicados) y **ninguna mira los
matches que fija el lector**. (Ojo con la atribución: desde el **PR #64 (4-ago-2026)** el dedup ya no
vive solo en el audit — la **republicación por slug reescrito** (C21 y, desde el 28-ago-2026, Remax) se resuelve en la CAPTURA: el
discovery detecta el aviso por su código numérico y el cargador marca la URL vieja `duplicado_de`. La
superficie de duplicados del audit sigue existiendo para todo lo demás.) En la tanda 2 eso eran **51 matches, 15 con `confianza: media`** que
nadie iba a revisar nunca — correr el audit después del apply habría levantado 3 de 18.

Se armó un juez independiente sobre los dudosos ANTES de aplicar y **corrigió 3 (17%)**: dos falsos
positivos que iban a entrar (`2019` "CONDOMINIO ONE 1" contra un pm sin numeral; `2052` "Ares", donde
el cuerpo no nombra edificio) y un match que faltaba (`1992` Orange Residence).

👉 **En cada tanda: filtrar los veredictos con `confianza != 'alta'` + los que quedaron sin pm pero
con nombre, y mandarlos a un subagente-juez con el aviso, el pm propuesto y los candidatos.** Cuesta
~2 agentes por tanda.
Pendiente de código: darle al audit una **cuarta superficie** (`lector_fijo` + confianza media), que
el punto ciego existe también en las capturas nocturnas de Equipetrol.

## 🔴 ANTES DE CREAR UN EDIFICIO: chequear por PROXIMIDAD, no solo por nombre

El 29-jul creamos un duplicado **con dos revisiones encima**: el pm 556 "Edificio Isuto by One",
a **30 m** del pm 262 "ONE ISUTO". Es un edificio con dos nombres según el portal — Remax lo
llama "ONE ISUTO", Century21 "Isuto by One" — y los tres avisos lo ubican igual ("Av. Canal
Isuto casi 2do anillo").

El matcher no devolvió candidatos y el juez lo dio por nuevo, **los dos con razón**: como TEXTO
los nombres no se parecen. Lo que coincidía era la **ubicación**.

👉 **Al crear un pm nuevo, correr siempre esto primero** (no alcanza con "¿existe un nombre
parecido?"):

```sql
SELECT id_proyecto_master, nombre_oficial, zona,
  ROUND(ST_DistanceSphere(ST_MakePoint(<lon>,<lat>), ST_MakePoint(longitud,latitud))::numeric,0) AS dist_m
FROM proyectos_master
WHERE ST_DistanceSphere(ST_MakePoint(<lon>,<lat>), ST_MakePoint(longitud,latitud)) < 120
ORDER BY dist_m;
```
Si aparece algo a <60 m, mirar si los **tokens** coinciden en cualquier orden (One+Isuto ↔
Isuto+by+One) antes de crear. Al fusionar: sobrevive el que tiene más props colgadas; los alias
de **las dos grafías** van al que queda, o el duplicado vuelve a nacer con el próximo aviso.

Ya se usó bien en el mismo día (Sky Mint, Lisboa, los 8 de alquiler): ahí los vecinos a <200 m
eran edificios con nombres claramente distintos y se creó sin problema.

## 🔢 El matcher confunde numerales romanos (causa viva)

`buscar_proyecto_fuzzy` da **score 1,0 al edificio EQUIVOCADO** del mismo cluster cuando el numeral es
romano: "Portofino IV" → "Portofino V" 1,0 · "Galil Parque II" → "III" y "I", los dos 1,0. Con
arábigos anda bien ("Macororo 14" → "15" solo 0,667). Y el matcher **auto-aprueba desde 0,95**.
Ídem la **eñe** ("Las Pinas" vs "Las Piñas"). Tapado con 31 alias, pero cada cluster nuevo lo repite.

## El orden recomendado para seguir — actualizado 30-jul-2026

> Los pasos 1-5 de la versión anterior **ya se hicieron** (tanda de 102 aplicada, SQL del audit
> aplicado el 30-jul, edificios creados). El `bob` dejó de ser un paso. Lo que queda es esto:

**Estado medido hoy (por URL y por id, dan lo mismo):**

| | activas en prod | ya en shadow | faltan |
|---|---|---|---|
| ZN venta | 448 | 329 | **119** |
| ZN alquiler | 101 | 96 | **5** (2 son de Bien Inmuebles → fuera del alcance del híbrido) |

🔑 **Las 119 NO necesitan una relectura manual en tandas.** El discovery es **shadow-relativo**:
`nuevas = portal − shadow`, prod no participa (`discovery-deptos.mjs:199`, exclusión por prod
retirada el 20-jul). Al correr el discovery de ZN, esas 119 entran solas como NUEVAS — siempre que
sigan publicadas en el portal. Las que ya cayeron no se releen nunca, y está bien: son inventario muerto.

1. **Crear la variante ZN del comando de captura** (`/cron-deptos-ventas-zn` + `/cron-deptos-alquiler-zn`).
   Es lo único que falta: **no falta código**, faltan los comandos. 5 de los 7 pasos ya son zona-aware
   (`discovery` · `cargar` vía `resolverZona()` · `partir-lectura` vía el material · `inyectar` ·
   `verificador`); los 2 globales (`derivar-pet-friendly`, `snapshot-shadow`) están bien globales.
   ⚠️ El `.command.md` de Equipetrol invoca los 7 pasos **sin `--zona`** → la variante ZN tiene que
   pasarla en todos.
2. **Agendarlas de noche**, después de las de Equipetrol. Las 119 entran en una o dos noches sin
   competir por la cuota Max con las routines que ya funcionan.
3. **Reintento con backoff en el paso 3 (MOAT).** El 30-jul los dos intentos de subagente murieron con
   `529 Overloaded` **con 4 props** — mientras que el 29-jul se leyeron **166 props en 13 chunks** sin
   drama. No es un límite de escala: era inestabilidad del servicio. El arreglo es reintentar, NO achicar
   la tanda. Hoy el paso 3 no reintenta: cuando falla hay que leer inline a mano (con 12 chunks, inviable).
4. El audit ya cubre las dos zonas (arreglado el 30-jul) y avisa `🔴 ALCANCE PARCIAL` si algo queda fuera.

### 3 correcciones a mano de la tanda de 102
- **2262** Palma de Mallorca: el portal declara **127.800 m²** (error ×1000, va ~127,8). Daría
  $1,33 el m². **El cargador no tiene guardrail de área** — es el único caso de las 102.
- **2123**: `precio_bob_portal` llegó truncado (504 en vez de 504.000). El lector lo reconstruyó.
- **2339** Bless One: GPS corrido ~440 m → quedó en otra microzona que su gemela 2338.

### 3 edificios que necesitan mirar el predio, no leer
- **Torres Soho I** y **Soho 3** están a 49 m y 68 m del pm 509 "Torre Soho". O es un complejo
  de torres numeradas, o el 509 ya es una de ellas mal nombrada.
- **Condominio Jardín Sur**: su GPS es idéntico dígito a dígito al de otra prop que es un
  edificio distinto → pin genérico del portal.

## 🔑 La lección del 29-jul: dónde va una decisión de terreno

Lucho confirmó en terreno que hay un solo "Luxe Suite". Quedó guardado en el candado de UNA
propiedad — y por eso **no sirvió**: el aviso siguiente del mismo edificio llegó sin candado y el
audit volvió a proponer crear el edificio. Igual con "YOU II".

**El candado protege una PROPIEDAD; el alias protege el CONOCIMIENTO.** Toda decisión de terreno
sobre *qué es* un edificio va a `proyectos_master.alias_conocidos` con la grafía exacta del
captador, **además** del match. Sin eso, se repite en cada aviso nuevo — y es la causa concreta
de las "cosas que se repiten" en los reportes nocturnos.
Memoria `feedback_decision_terreno_va_al_catalogo`.

---
---

# ⤵️ Contexto original (cierre del 28-jul-2026)

## Por qué estamos haciendo esto (leer antes de ejecutar nada)

El objetivo de fondo es el **cutover**: que `propiedades_v2_shadow` pase a ser la base y n8n se
jubile. Zona Norte es una pieza de eso, y el caso para hacerla **no es capturar más avisos** — el
discovery midió que n8n solo se pierde **11 de 498**. El caso es de calidad, y son cuatro cosas
distintas que se arreglan con la misma acción:

| Qué está mal en ZN hoy | Cuánto |
|---|---|
| Matching | 59,8% contra 91,6% de Equipetrol |
| Precios inflados por el TC viejo | el feed muestra ~20% de más ($99.569 vs $80.000 medianos) |
| Datos que el frontend pide y no existen | "lo que la hace especial", piso, equipado: **0 de 445** |
| Estados de obra inventados | el pipeline viejo ponía "entrega inmediata" cuando el aviso callaba |

Y hay un efecto secundario que importa: con los precios inflados, **la data dice que ZN cuesta lo
mismo que Equipetrol** ($1.720 vs $1.703 el m²). Es falso — ZN es ~12% más barata. El TC viejo
borra la diferencia entre las dos zonas, que es justo el dato que le interesa a un comprador.

> 🔴 **Regla que salió de acá: no publicar ZN hasta terminar de releerla.** Publicarla hoy pondría
> precios 20% inflados y media ficha vacía al lado de un Equipetrol que está bien. Peor que no tenerla.

## Decisiones del founder que NO hay que revertir por "eficiencia"

Se tomaron con datos en la mano el 28-jul. Si alguien las cambia sin leer esto, se repite el trabajo.

1. **ZN no se audita campo por campo: se relee.** Se descartó auditar el crudo viejo. El lector
   re-lee y corrige, que es más barato y deja mejor resultado. Eso sacó el bloqueo más pesado del
   plan de cutover (ver `CUTOVER_DATA_PLAN.md`).
2. **Se relee CON fetch, no desde lo guardado.** El atajo `--local` parecía ahorrar, pero ahorra
   el recurso equivocado (proxy sobra, cuota no) y deja al lector ciego en el ~60% de los avisos.
   Ya costó rehacer dos tandas (~1,5M tokens).
3. **El precio se muestra como lo dice el aviso, con badge.** No se descuenta el "TC 7". Es
   criterio fiduciario: declarar la duda en vez de resolverla suponiendo. Detalle y evidencia en
   `TC_NUEVO_DECISION.md`.
4. **La spec de "Precios desde" NO se tocó** — cuesta ~8 unidades por tanda, pero cambiarla es
   decisión de producto, no de implementación.

## Dónde encaja esto en el cutover

Después de la jornada del 28-jul el mapa quedó así:

```
BLOQUEOS que siguen:   A · el motor tiene que correr sin la máquina de Lucho prendida
                       C · observabilidad (/admin/salud queda ciego al apagar n8n)

YA NO BLOQUEAN:        B · auditar ZN      → se resuelve releyendo (esto)
                       gate de precios     → resuelto por la serie reexpresada (migs 287-289),
                                             que empalma exacto con la serie shadow el 21-jul
```

O sea: **el cutover ya no depende de esperar a fin de agosto.** Depende de cerrar A y C, que es
trabajo de días. Lo de ZN corre en paralelo y no lo bloquea.

⚠️ Y ojo con el orden: el **ajuste del TC por vecinos** (decisión abierta 2) **no se puede hacer
antes de terminar de releer ZN** — hoy solo 4 de 18 props con "TC 7" tienen vecino releído con
qué compararse. No es preferencia, es dependencia.

## ⚠️ La serie de mercado: qué pasó al entrar ZN (verificado 29-jul)

**El `global` de Equipetrol NO se contaminó.** Está blindado a las 6 zonas dentro de
`snapshot_absorcion_mercado_shadow`. Conteos de los últimos 4 días: 118 → 118 → 119 → 121 (0 dorm).
Si ZN se hubiera colado, saltaba a 500 y pico.

**Pero sí pasaron dos cosas que hay que saber leer:**

1. **Escalón de precio el 29-jul, por la mig 311.** Al dejar de descontar el "TC 7": mediana de
   0 dorm 66.000 → **68.250**, 1 dorm 88.000 → **91.092**, $/m² 1.707 → **1.809**. Es correcto y
   esperado — son las 54 props que se mostraban 40% abajo volviendo a su precio. **Al publicar
   cualquier comparación que cruce esa fecha, hay que declararlo**, como se hace con las
   `filter_version`.
2. **Aparecieron filas por microzona de ZN** (el LOOP 2 del snapshot no filtra zona, a diferencia
   del global). No corrompen nada de Equipetrol, pero **esa serie nace con cobertura parcial**:
   hoy refleja 109 de 448 props. A medida que se relee ZN, el "inventario" de cada microzona va a
   subir — y eso **NO es que ZN gane propiedades**, es que las estamos leyendo. Nadie debería
   graficar la absorción de ZN hasta terminar la relectura.

## Cuándo correr los audits (y cuál)

- **`/audit-cola-shadow`** (matching + dedup) → **después de aplicar, no antes**, y con la zona
  cargada entera o casi. Hoy tiene sentido apenas se apliquen las tandas: hay 21+ props ZN con
  nombre y sin match (candidatas a PM nuevo) y varios pares de duplicados que los lectores ya
  señalaron (Ziri Zwei 2806/2805, Torre Moderna 2600/2605, 3849/3847, 3543/3544…).
- **`/audit-deptos-shadow`** (drift + precio en portal + **fotos podridas**) → **no ahora**: recién
  leímos estos avisos, el drift va a dar ~0. Conviene en unas semanas, o antes solo para las 8
  Rhodium, que ya sabemos que tienen la portada rota.

## Lo que quedó andando (aplicado y verificado)

| | |
|---|---|
| **mig 309** | `buscar_similares` ya no puede cruzar de macrozona. Las 8 shortlists sin perfil siguen devolviendo similares (cascada vista→shadow→prod); si ni así hay perfil, devuelve vacío en vez de "cualquier cosa". |
| **mig 310** | 2 brochures de ZN que quedaron etiquetados 'equipetrol'. |
| **mig 311** | "TC 7" deja de descontar + badge "Confirmar tipo de cambio". Verificado: las 42 del feed pasaron de $1.139/m² a **$1.905/m²**, que es exactamente lo que predijo el test del mismo edificio. |
| **ZN en la base nueva** | **109 props**, matching **67,9%** (venía de 59,8%), 35 brochures a la cola. |

## Lo primero al retomar

```bash
node scripts/deptos-equipetrol/test-perilla-zona.mjs      # 24 checks, ~5s
```
Si sale verde, la perilla está sana y Equipetrol intacto.

## La próxima tanda (lo que el founder pidió)

```bash
cd scripts/deptos-equipetrol
node cargar-deptos-shadow.mjs --prep 105 --zona=zona-norte      # ~12 min, ~11 MB de proxy
node partir-lectura.mjs output/material-<ts>-zn.json 15         # → 7 chunks
#   → 7 subagentes-lectores (el prompt que funcionó está más abajo)
node inyectar-veredictos.mjs output/material-<ts>-zn.json output/veredictos-venta-zn-*.json
node medir-relectura.mjs output/material-<ts>-zn.json           # qué aportó
node cargar-deptos-shadow.mjs --apply output/material-<ts>-zn.json --zona=zona-norte
```

🔴 **SIN `--local`.** El modo local no trae el precio en bolivianos del portal, y sin eso el
lector queda ciego en el ~60% de los avisos (los que no traen el monto en el texto). Ver
`RECONOCIMIENTO_ZN.md` §"El portal miente el precio". El fetch cuesta ~11 MB por tanda: barato.

🔴 **Archivar los veredictos apenas se aplica la tanda** (`output/tanda-<N>-aplicada/`), no antes
de la siguiente: los nombres solo llevan la fecha, así que dos tandas del mismo día se pisan.
Al 29-jul ya están archivadas las cuatro (`tanda-1-aplicada`, `tanda-2-descartada`,
`tanda-145-aplicada`, `tanda-104-aplicada`) y no hay ningún veredicto suelto — se puede partir
la próxima sin tocar nada.

🔧 **Mejora de fondo pendiente** (chica): que `partir-lectura.mjs` incluya la HORA en el nombre,
no solo la fecha. Mientras no esté, archivar es obligatorio y depende de que alguien se acuerde.

**Faltan ~300 props de venta** (109 de 448 hechas) + **101 de alquiler**.

### Lo que hay que pasarle a los lectores
Está en el prompt de la última tanda: banda de $/m² **por microzona**, el patrón ×1,4 del portal
y cómo desempatar con `precio_bob_portal`, que `recamaras` no distingue monoambientes, que Remax
descuenta 1 m², que "TC oficial del día" sin número NO es `oficial_viejo`, y el test de $/m²
uniforme para separar brochure de unidad.

## Decisiones abiertas (del founder, no técnicas)

1. **Los "Precios desde"**: la spec los manda a brochures aunque traigan una sola tipología con
   área y monto propios. Cuesta ~8 unidades legítimas por tanda (Mangales Blue 2, Miro Tower).
   El test de $/m² uniforme dice que esos no fabricaron nada. La spec **no se tocó**.
2. **Ajuste del TC por vecinos**: decidir caso por caso comparando contra el mismo edificio
   (arquitectura del estado de obra inferido, migs 302/303). **No se puede todavía**: en ZN solo
   4 de 18 tienen vecino releído. Requiere terminar de releer la zona.

## Pendientes concretos

- [ ] **21 edificios nuevos** para `proyectos_master` (Rise 2, Soma, Torre Murano, Mythos,
      Condominio Benidorm, Solaris, Vivaldi, Tribu…). Sale del apply, lo aplica el founder.
- [ ] **Re-leer las 8 Rhodium** (8000209-8000219): el captador reemplazó la portada y las cards
      salen vacías. El detector nuevo ya las caza.
- [ ] **Alquiler ZN** (101 props) — la perilla ya lo cubre.
- [ ] **Snapshot de alquiler** está filtrado a Equipetrol: la venta de ZN entra sola a la serie,
      el alquiler no. Es una línea.
- [ ] **Verificar el interruptor `?shadow=1` de ZN a nivel UI** — ver abajo.

## Dos cosas a medias, dichas como son

**El interruptor de ZN quedó a medio verificar.** El contrato está probado (la API responde 251
en producción y 0 en la base nueva), pero **no logré que el feed de ZN llame a la API** en las
pruebas automatizadas: no hace pedidos al cargar (usa el SSG) ni lee filtros por URL. O sea el
interruptor solo actúa **cuando el usuario filtra a mano**. Para verlo de entrada habría que
tocar el SSG.

**El navegador integrado no sirve para estos feeds.** No hidrata: React no se monta, y todo lo
que se mida ahí es basura (perdí un rato largo por eso). Está documentado en
`docs/design/VERIFICAR_FEEDS_DESKTOP.md` y ahora hay herramienta:
```bash
node simon-mvp/scripts/verificar-chip-fiduciario.mjs http://localhost:3100
```
Y para levantar el worktree sin pisar el server del repo principal, se agregó
`simon-mvp-worktree-zn` (puerto 3100) al `.claude/launch.json`, que está gitignored.

## Los dos bugs que llegaron de marketing

- ✅ **Chip "vs. similares" invisible en móvil** — arreglado. El comparador de `React.memo` de la
  tarjeta móvil no incluía `marketChip`, así que bloqueaba el re-dibujo cuando el chip llegaba
  (se calcula después del primer render). Medido con Playwright: 430px pasó de 0 a 4/4 tarjetas.
  ⚠️ Ojo al leer el reporte original: el "0 vs 200" comparaba un feed virtualizado (móvil, ~4
  tarjetas dibujadas) contra uno que no lo está (escritorio, 200). El bug era real, la magnitud no.
- ✅ **Fotos de Rhodium** — el captador reemplazó la **portada**. De 11 fotos, 8 siguen vivas,
  pero la primera da 403 y es la única que pinta la tarjeta. Detector agregado a
  `auditar-shadow.mjs`, sin costo extra de pedidos. Probado: caza las 3, no marca las sanas.

## Lo que NO hay que volver a hacer

- Optimizar el fetch a costa de la lectura: el proxy sobra (2 GB), la cuota no.
- Confiar en el navegador integrado para los feeds.
- Editar un comparador de `memo` sin mirar **a qué componente pertenece** (el archivo de
  alquileres tiene dos, y el primer intento fue en el equivocado).
