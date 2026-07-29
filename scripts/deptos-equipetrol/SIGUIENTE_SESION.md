# Dónde retomar — Zona Norte al híbrido (cierre del 28-jul-2026)

> Rama `worktree-zn-perilla-zona`, worktree `.claude/worktrees/zn-perilla-zona`.
> **3 commits, sin push.** Las routines nocturnas corren `main`, que no se tocó.

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
