# Zona Norte en el híbrido — reconocimiento y perilla de zona (28-jul-2026)

> Trabajo hecho en el worktree `zn-perilla-zona`, **sin commit al repo principal y sin escribir
> una sola fila en ninguna base**. Las routines nocturnas corrieron y siguen corriendo con el
> código de `main`, intacto. Lo de acá se mergea recién con el OK del founder.

## Qué se buscaba

Responder con números, no con estimaciones: **¿cuánto cuesta llevar el híbrido a Zona Norte, y
sirve la data que ya hay?** Antes de esto, la única incógnita seria del plan era el costo del
barrido de ZN, que es ~5 veces más grande en área que Equipetrol.

## Lo que se hizo

| # | Qué | Estado |
|---|---|---|
| 1 | Perilla de zona (`lib/zonas-hibrido.mjs`) | ✅ 18/18 pruebas |
| 2 | No-regresión de Equipetrol | ✅ idéntico a main |
| 3 | Discovery de ZN medido en seco | ✅ ver abajo |
| 4 | Modo `--local` (leer sin salir al portal) | ✅ probado |
| 5 | Banda de $/m² por zona + nombres por zona | ✅ |
| 6 | Perilla en el ciclo de **alquiler** | ✅ 23/23 pruebas |
| 7 | Interruptor de laboratorio en el feed de ZN | ✅ |

**Frontera respetada:** ningún `--apply`. La primera escritura a base la decide el founder.

## La perilla

Una sola máquina, una perilla. `--zona=zona-norte` (o `ZONA_HIBRIDO`), **default `equipetrol`**
→ sin pasar nada, todo se comporta como antes.

**Cubre el ciclo completo, venta y alquiler:** discovery · cargador (`--prep`, `--apply`,
`--nuevas`) · `partir-lectura` · verificador. Las 4 combinaciones (venta/alquiler ×
Equipetrol/ZN) producen archivos con nombres distintos, y Equipetrol conserva exactamente
los nombres de siempre.

`--local` y el modo "leer desde lo guardado" viven en `lib/detalle-desde-base.mjs`, **compartido**
por los dos cargadores — no dos copias que se desincronizan, que es la deuda que ya duele en el
frontend (ventas/alquileres gemelos, cada arreglo dos veces).

### El interruptor de laboratorio del feed ZN

`/zona-norte/ventas?shadow=1` y `/zona-norte/alquileres?shadow=1` leen la data del laboratorio.
**Opt-in, default producción** — al revés que el feed de Equipetrol, donde shadow ya es el default.

Sin esto se puede cargar ZN al laboratorio y **no tener dónde comprobarlo**. Las vistas shadow no
filtran por zona, así que las props de ZN aparecen solas apenas entren. El contrato ya existía:
`/api/ventas` y `/api/alquileres` aceptan `shadow` en el body con default `false` — no se tocó
ningún default de servidor (ZN y Equipetrol comparten esos endpoints).

⚠️ Con `?shadow=1` la primera pintura viene del SSG (producción) y recién después entra la data
del laboratorio. Es una herramienta de verificación, no una cara pública: el parpadeo no importa.

**Probado con el dev server corriendo**, llamando la API desde la propia página:

| Filtro | Producción | Laboratorio |
|---|---|---|
| 14 microzonas ZN | **251** | **0** ← correcto: ZN todavía no está cargada |
| 6 zonas Equipetrol | 336 | **405** |

El 0 es la prueba: el flag cambia la fuente de verdad. Cuando el híbrido cargue ZN, ese 0 pasa a
ser el número real. Typecheck del frontend limpio.

🔶 **Lo que NO se pudo ejercitar:** que un cambio de filtro en la UI dispare el POST con el flag.
El panel del navegador no estaba abierto y este feed no hidrata en el preview interno (gotcha ya
documentado en `docs/design/VERIFICAR_FEEDS_DESKTOP.md` → se verifica con Playwright). Lo que sí se
comprobó en vivo: la condición del flag evalúa `true` con `?shadow=1` en la URL real, y la API
responde distinto según el flag. Queda un eslabón de una línea sin ejercitar a mano.

## 🔴 Tres cosas que habrían roto algo en silencio

Ninguna daba error. Las tres se encontraron midiendo, no leyendo código.

### 1. El discovery de ZN habría dado de baja TODA Equipetrol
El diff leía **todo** `propiedades_v2_shadow` sin filtrar por zona (daba igual con una sola zona
adentro). Las "desaparecidas" son las que están en shadow y el crawl no vio → correr ZN habría
marcado las 522 activas de Equipetrol como desaparecidas, y el verificador las habría dado de
baja. **Arreglado:** el diff se acota a la zona. Verificado antes de aplicarlo: shadow venta =
534 filas, las 534 dentro de las 6 zonas, 0 sin zona → para Equipetrol no cambia ningún número.

### 2. El `precio_bs` de Zona Norte es inventado
En las **435 de 435** props de ZN que lo tienen, `precio_bs / precio_usd` = **6,96 exacto**. No es
un precio en bolivianos del anuncio: es `precio_usd × 6,96` que calculó el pipeline viejo. Si el
lector lo recibiera como BOB genuino, lo taggearía `bob`, y la normalización nueva lo convierte a
la tasa de hoy (~11,6) → **el precio saldría ~40% por debajo del real**, sin error visible.
**Arreglado:** en modo `--local` el campo va NULL. Si un aviso publica en bolivianos, está en el texto.

### 3. Los chunks de lectura se pisaban otra vez
Los archivos se llaman `lectura-venta-<fecha>-cN.json`. Equipetrol-venta y ZN-venta el mismo día
→ mismo nombre → el segundo pisa al primero y **se pierden veredictos sin aviso**. Es el mismo bug
del 28-jul (PR #55), reapareciendo por zona en vez de por operación. **Arreglado:** la zona va en
el nombre *y* dentro del archivo. Equipetrol conserva sus nombres de siempre.

## La data de ZN: sirve, y bastante

**El 98% se puede releer sin internet.** 435 de 445 props activas tienen su texto guardado, y
`datos_json_enrichment` trae además agente, fotos, amenidades, moneda y fecha → alcanza para leer
**y para aplicar**. Modo `--local` probado.

Lo único que no viene de ahí: `piso`, `expensas` y `parqueo_incluido`. Los dos primeros salen del
texto (el lector los lee); el tercero **nunca** se hereda del portal, porque el flag miente
(13 props decían "incluido" con parqueo aparte, medido el 10-jul).

## El yacimiento de matching

| | Hoy | Con el híbrido |
|---|---|---|
| ZN venta (deptos) | 268 / 448 = **59,8%** | Equipetrol hoy: **91,6%** |

De las **133** props ZN con nombre de edificio y sin enganchar:

- **67 (50%)** tienen candidato con score ≥0,95 → el matcher las engancharía **sola, sin leer nada**
- 3 quedarían para el juez
- 63 son probablemente edificios que faltan en el catálogo (PM nuevos)

Solo con eso, ZN pasaría de 59,8% a **~75%**. La lectura (que corrige nombres mal extraídos) suma
más encima. ⚠️ Estimación por score puro: el matcher real además exige coherencia de zona, y hay
un antecedente de nombres que son **calles**, no edificios ("Los Jazmines").

**Catálogo listo:** 182 edificios de ZN, **100% con GPS**, 58 con alias.

## La banda de $/m² es por zona

Aplicar la de Equipetrol a ZN haría clasificar mal el tipo de cambio.

| Zona | Banda (p50–p90) | n |
|---|---|---|
| Equipetrol | $1.700 – $2.200 | 381 |
| **Zona Norte** | **$1.500 – $1.900** | 428 |

**ZN es ~12% más barata por m².** El método se validó antes de usarlo: el mismo cálculo sobre
Equipetrol reproduce el rango que la spec ya traía. La banda viaja dentro del material y del chunk.

⚠️ Sale de data del scraper viejo, sin auditar. Es una referencia para desempatar, no una verdad.
Recalcular cuando el híbrido haya releído ZN.

## El costo del barrido — MEDIDO, ya no estimado

Zona Norte: bbox de **12 × 8,8 km** contra 4,6 × 4,5 de Equipetrol → **374 cuadrantes contra 81**.

Pero ZN tiene su forma real dibujada (14 sub-zonas) y Equipetrol no → **130 cuadrantes (35%) caen
en el vacío**. Se agregó `saltarVacios` a `c21Listado`, **opt-in** (default `false` → nadie más
cambia de comportamiento; Equipetrol no tiene polígono, así que aunque se pidiera no saltaría nada).

**Corrida real del 28-jul, 15:07 → 15:19:**

| | |
|---|---|
| Tiempo | **~12 minutos** |
| Requests | **276** (244 cuadrantes de C21 + 32 páginas de Remax) — los 130 vacíos, saltados |
| Datos de proxy | **23,05 MB** |
| Bloqueos | ninguno · circuit breaker no se activó |

Contra los 2 GB del proxy (~$11, no vencen), una corrida de ZN cuesta ~1,1% del paquete. Barato.

### Lo que encontró

| | |
|---|---|
| Deptos en venta en el portal, dentro de las 14 microzonas | **498** |
| Descartados por caer fuera de zona | **0** (el salto por polígono ya filtró) |
| De esos, ya en producción | 487 |
| **Que producción NO tiene** | **11** |
| En shadow | 0 (ZN todavía no entró) |

**Dos lecturas, y conviene no confundirlas:**

1. **n8n NO se está perdiendo inventario en ZN.** Solo 11 avisos de 498. El cuello de botella que
   sí existía en Equipetrol (el grid topaba a 100 por cuadrante) acá no aparece. Bien por n8n.
2. **Pero producción tiene ~639 deptos ZN marcados como activos y el portal hoy muestra 498.**
   El desfase (~140) apunta a inventario fantasma: avisos que ya no están publicados y siguen
   contando como activos. ⚠️ Es una señal, no una conclusión — confirmarlo es trabajo del
   verificador (dos señales), no de este conteo.

**Conclusión sobre el valor:** llevar el híbrido a ZN **no se justifica por capturar más avisos**
(son 11). Se justifica por **calidad**: matching (59,8% → ~91%), precios releídos, y limpiar el
inventario fantasma. Es un argumento distinto del que valió para Equipetrol, y conviene tenerlo
claro antes de invertir el tiempo de lectura.

## Archivos tocados

```
NUEVO  scripts/deptos-equipetrol/lib/zonas-hibrido.mjs      la perilla
NUEVO  scripts/deptos-equipetrol/lib/detalle-desde-base.mjs leer sin salir al portal (venta+alquiler)
NUEVO  scripts/deptos-equipetrol/test-perilla-zona.mjs      no-regresión (23 checks, ~5s)
NUEVO  scripts/deptos-equipetrol/RECONOCIMIENTO_ZN.md       este doc
  M    scripts/deptos-equipetrol/discovery-deptos.mjs        perilla + diff por zona
  M    scripts/deptos-equipetrol/discovery-alquiler.mjs      idem
  M    scripts/deptos-equipetrol/verificador-deptos.mjs      perilla + crawl/universo/disyuntor por zona
  M    scripts/deptos-equipetrol/verificador-alquiler.mjs    idem
  M    scripts/deptos-equipetrol/cargar-deptos-shadow.mjs    perilla + --local
  M    scripts/deptos-equipetrol/cargar-alquiler-shadow.mjs  idem
  M    scripts/deptos-equipetrol/partir-lectura.mjs          zona en el nombre y adentro
  M    scripts/deptos-equipetrol/READER_SPEC.md              banda de $/m² por zona
  M    scripts/sonda-suelo/lib/portales.mjs                  saltarVacios (opt-in)
  M    simon-mvp/src/pages/zona-norte/ventas.tsx             ?shadow=1 (opt-in)
  M    simon-mvp/src/pages/zona-norte/alquileres.tsx         idem
```

Volver a verificar en cualquier momento: `node scripts/deptos-equipetrol/test-perilla-zona.mjs`

ℹ️ El worktree tiene una copia de `simon-mvp/.env.local` (gitignored) y su propio
`.claude/launch.json`, puestos para poder levantar el dev y verificar. Se van con el worktree.

## 🔴 BLOQUEO antes de cargar ZN al laboratorio: `buscar_similares` (el bot)

Cuando ZN entre a `propiedades_v2_shadow`, aparece automáticamente en las vistas shadow —
que son las que leen **las superficies públicas de Equipetrol**. Hay que revisar una por una
quién filtra y quién no. Revisado el 28-jul:

| Superficie | ¿Filtra a Equipetrol? |
|---|---|
| Feed `/ventas` (`/api/ventas`) | ✅ `zonas_permitidas` = las 6 zonas por default |
| Home / superficies (`superficies-data.ts`) | ✅ `.in('zona', ZONAS_EQUIPETROL_DB)` |
| `/mercado` (`mercado-data.ts`) | ✅ idem |
| Bot · `buscar_propiedades` | ✅ `zona_general = 'Equipetrol'` |
| Bot · `resumen_mercado` | ✅ idem |
| **Bot · `buscar_similares`** | 🟠 **filtra, pero el filtro se apaga solo** (ver abajo) |
| Shortlists `/b/[hash]` | ✅ buscan por id, no por zona |
| Snapshot shadow (global) | ✅ blindado a las 6 zonas |

**El diagnóstico exacto** (primero lo di por peor de lo que es, buscando si mencionaba las zonas
de Equipetrol: no las menciona, pero filtra igual de otra forma). `buscar_similares` **sí acota por
zona**, y de una manera elegante: arma el perfil del cliente desde las propiedades de su shortlist
y busca solo en esas zonas. Si el cliente mira Equipetrol Centro y Sirari, los similares salen de
ahí. ZN no entraría.

**Pero el filtro tiene un escape:** la condición es
`(v_zonas IS NULL OR zona = ANY(v_zonas))` → **si el perfil de zonas queda vacío, el filtro se
apaga y la búsqueda sale a toda la vista.**

**Medido:** 8 de 88 shortlists (**9%**) no tienen ninguna de sus propiedades visible en las vistas
de mercado — dadas de baja, o ids que shadow todavía no tiene. Esas 8 hoy corren sin filtro de
zona. No molesta porque shadow es 100% Equipetrol; molesta **el día que entre ZN**.

**Fix: `sql/migrations/309_similares_no_cruza_zonas.sql`** — cascada de respaldo del perfil
(vista → tabla shadow → prod) y, si aun así no hay perfil, **devolver lista vacía en vez de
"cualquier cosa"**. Verificado sobre las 3 primeras huérfanas: las 3 recuperan su zona, ninguna
cae en el caso vacío, y las 80 que ya funcionan no cambian.

**Tiene que estar aplicada ANTES del primer `--apply` de ZN**, no después.

Es la tercera vez que aparece el mismo patrón (ticket #15 de contaminación ZN, el diff del
discovery, y ahora esto): **una superficie que servía a una sola zona no filtra por zona, y no
duele hasta que hay una segunda.**

## 🔴 El portal miente el precio en ZN, y miente ~40% (28-jul, tanda de 105)

Tres lectores distintos, sin hablarse, llegaron a la misma causa. En Century21-ZN el precio en
dólares del portal está **inflado ~1,4×** de forma sistemática:

> el captador carga el precio **en bolivianos a un cambio de ~10**, y C21 lo divide por **6,96**
> para mostrarlo en dólares.

Medido en la tanda: 3691 → el texto dice $61.290 y el portal $88.060 · 3661 → $110.000 vs $158.046
· 3627/3628/3629 (misma captadora) → los tres exactamente ×1,417.

**Es anterior a cualquier normalización nuestra.** No es el TC viejo: es el precio de origen.
Cuando el texto trae el monto, el lector lo corrige solo. Cuando no lo trae, **no hay con qué**.

### La consecuencia: el modo `--local` NO alcanza para leer

La regla que resuelve esto en Equipetrol (§"Fallback C21 sin precio en el texto") compara **dos**
señales: el precio en dólares y **el precio en bolivianos del portal**. Con las dos, elige la que
deja un $/m² coherente.

En modo `--local` el precio en bolivianos va NULL a propósito (el guardado era `precio_usd × 6.96`,
un número derivado que miente). Resultado medido:

| Tanda | Sin precio en el texto | % |
|---|---|---|
| 1 (40) | 33 de 37 | **89%** |
| 2 (105) | 62 de 105 | **59%** |

En esas, el lector tenía **una sola señal, y era la inflada**. No es que la regla falte: es que el
atajo le saca la herramienta que la regla necesita.

### Por qué la optimización apuntaba al recurso equivocado

| | Costo por propiedad | Recurso |
|---|---|---|
| Ir al portal | ~123 KB · 7 s | proxy: 2 GB por ~$11 — **abundante** |
| Leerla | ~7.400 tokens | cuota Max — **escaso** |

Fetchear las 448 de ZN = **~55 MB, el 2,75% del paquete**. Rehacer **una** tanda de 105 por datos
malos = **~800k tokens**. Sale más caro repetir una tanda que crawlear la zona entera.

**Doctrina que queda:** el `--prep` con fetch es el camino normal, igual que en Equipetrol. El modo
`--local` queda para lo que el fetch no puede: **avisos que ya se bajaron del portal** y **releer con
una spec nueva sin volver a molestar al portal** (que era su valor real desde el principio).

## 🟠 Decisión de producto abierta: los "Precios desde" de ZN

La spec (Nivel 2) manda a `proyectos_detectados` todo aviso cuyo precio diga "desde", **aunque traiga
área por listing** — sin monto exacto de esa unidad el precio es indeterminable, y adivinarlo
subvalúa o infla. La regla es correcta y los lectores la aplicaron bien.

Pero en ZN aparece un patrón que en Equipetrol no era común: **captadores que escriben "desde" por
costumbre en avisos de UNA sola tipología**, con su área y su monto propios. El tell de fabricación
($/m² uniforme) dice que NO fabricaron nada:

| Edificio | Avisos | $/m² de cada uno | ¿Fabricado? |
|---|---|---|---|
| Rise 2 | 18 | 1763, 1893, 1762 | ✅ sí — brochure de verdad |
| Arlet y Kenia | 3 | 1720, 1720, 1720 | ✅ sí |
| **Mangales Blue 2** | 5 | 1315, 1214, 1354, 1393, 950 | ❌ **no** |
| **Miro Tower** | 3+2 | 1135, 1398, 645 / 1135, 972 | ❌ **no** |

Con la regla actual se pierden ~8 unidades por tanda. Aflojarla arriesga meter pisos de rango como
precios reales. **Es decisión del founder — la spec NO se tocó.**

## Qué falta antes de cargar ZN de verdad

1. **Migrar alquiler a la perilla** (2 archivos, mecánico).
2. **El verificador elige el discovery por timestamp** → con dos zonas escribiendo en la misma
   carpeta, puede agarrar el de la zona equivocada. Hoy no pasa (el worktree tiene su propia
   carpeta), pero **hay que arreglarlo antes de mergear**.
3. **El feed de ZN no tiene interruptor de laboratorio** → si se carga ZN a shadow, no hay dónde
   verlo. `/zona-norte/ventas` lee producción.
4. **El snapshot de alquiler está filtrado a Equipetrol** → la venta de ZN entraría sola a la serie
   (el global está blindado, no se contamina), el alquiler no.
