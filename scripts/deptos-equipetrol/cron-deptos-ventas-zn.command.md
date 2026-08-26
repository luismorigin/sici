# /cron-deptos-ventas-zn — Captura híbrida de deptos ZONA NORTE → SHADOW (bajo Max, gratis)

> **Gemelo de `/cron-deptos-ventas`** (Equipetrol). Misma maquinaria, otra zona: **todo pasa
> `--zona=zona-norte`**. Para el detalle conceptual del ciclo (qué es el MOAT, por qué el juez es el
> lector y no el script, el régimen TC) leé `cron-deptos-ventas.command.md` — acá está lo operativo
> y **lo que cambia en ZN**.
>
> **Fuente de verdad** de este comando. Copiar a `.claude/commands/cron-deptos-ventas-zn.md`
> (las skills viven gitignored en `.claude/commands/`; el repo guarda el `.command.md`).
>
> ⏰ **AGENDADA (31-jul-2026)** como routine local (`~/.claude/scheduled-tasks/cron-deptos-ventas-zn/`),
> TERCERA de la cadena: después de las dos capturas de Equipetrol y antes de ZN alquiler y del audit —
> así nunca hay dos crawls simultáneos ni compiten por la cuota Max. Horario exacto en la tabla de `revisar-routines.command.md` (única fuente de horarios).

## 🔴 LA PERILLA VA EN TODOS LOS PASOS QUE LA ACEPTAN

El default de `lib/zonas-hibrido.mjs` es **`equipetrol`**. Un paso sin `--zona=zona-norte` no falla:
**hace la cosa equivocada en silencio**. El riesgo concreto está en el discovery y el verificador —
sus `desaparecidas` se calculan contra lo que vio el crawl, así que mezclar zonas puede dar de baja
inventario sano de la otra.

| paso | script | zona |
|---|---|---|
| 1 Discovery | `discovery-deptos.mjs` | ✅ **pasar `--zona=zona-norte`** |
| 2b Prep NUEVAS | `cargar-deptos-shadow.mjs` | ✅ **pasar** |
| 3 Partir chunks | `partir-lectura.mjs` | ⚙️ la toma del **material** (no lleva flag) |
| 3 Inyectar | `inyectar-veredictos.mjs` | 🚫 **NO pasar** — no parsea el flag: trata todo argumento posterior al material como archivo de veredictos → revienta con ENOENT. La zona la toma del material |
| 4 Apply | `cargar-deptos-shadow.mjs` | ✅ **pasar** |
| 5 Verificador | `verificador-deptos.mjs` | ✅ **pasar** |
| 5b pet_friendly | `derivar-pet-friendly.mjs` | ⚪ **global a propósito** (los edificios no son de una zona) |
| 5c Snapshot | `snapshot-shadow.mjs` | ⚪ **global a propósito** (la serie mide todo shadow) |

## Lo que cambia en Zona Norte (leer antes de la primera corrida)

- **Banda de $/m²: `1280–1900`** (Equipetrol es `1700–2200`). Viaja sola en el material como
  `m2_tipico` → el lector desempata el TC con la banda de SU zona. **Y es un respaldo ancho a
  propósito: la banda real es por MICROZONA**, del 3er-4to Banzer/Alemana (~$1.693) al 8vo Viru Viru
  (~$1.051) hay 38% de diferencia. No uses la banda de zona para descartar un precio raro sin mirar
  la microzona.
- **El precio del portal en ZN viene inflado ~1,4×**: el captador carga bolivianos a ~10 y C21 divide
  por 6,96. Por eso **el modo `--local` NO alcanza** (sin el precio en bolivianos del portal el lector
  queda ciego en ~60% de los avisos). El fetch es el camino normal.
- **El tag `bob` es normal acá y no requiere decisión**: crudo en Bs + tag, y la normalización hace
  `crudo / tasa` en vivo. Cerrado el 30-jul, ver `SIGUIENTE_SESION.md`.
- **Backlog inicial: 84 nuevas** (medido en el estreno, 30-jul). ⚠️ **No confundir con las "119 que
  faltan"** de comparar prod contra shadow: el discovery además excluye los **~102 multiproyecto ya
  clasificados** (viven en `proyectos_detectados`), y no ve las que cayeron del portal. El número que
  manda es el del discovery. Entran solas como NUEVAS porque el diff es shadow-relativo.
  **No las acotes con `--limit`**: el 29-jul se leyeron 166 props en 13 chunks sin problema.
- ⏱️ **Costo real medido en el estreno** (para dimensionar el horario): discovery **~30 min**
  (374 cuadrantes contra los ~81 de Equipetrol · 276 req · **22,9 MB**) + prep de 82 detalles
  (82 req · **6,4 MB**) + 9 subagentes-lectores. **Es MUY superior a una nocturna de Equipetrol
  (~15 min, ~14 MB)** — al agendarla, darle una ventana ancha y no pegarla a la routine siguiente.

## Pasos (en orden, desde `scripts/deptos-equipetrol/`)

### 1. Discovery + diff (read-only)
```
node discovery-deptos.mjs --zona=zona-norte
```
Sale a C21 + Remax con la red de las **14 microzonas de ZN** y diffea contra shadow **filtrado por
zona** (sin ese filtro marcaría toda Equipetrol como desaparecida). Mirá **NUEVAS** / **desaparecidas**.
- 🔁 **4ª señal — SLUG REESCRITO por C21** (PR #64, 4-ago-2026): C21 reescribe el slug de
  `/propiedad/<codigo>_<slug>` al editar el aviso → entraría como NUEVO y duplicaría el depto con dos
  precios. Se detecta por el código: `🔁 N con SLUG REESCRITO por C21`. **NO se filtran, se capturan**
  (el precio nuevo es el vigente) y el cargador marca la vieja en el paso 4.
- 🔴 **ÚNICA EXCEPCIÓN al filtro de zona de este paso**: el índice de códigos C21 se arma contra shadow
  **COMPLETO, sin filtrar por zona** — el código es único en todo C21, así que un aviso que además cambió
  de zona se detecta igual. Por eso puede salir `⚠️ cambió de zona (X → Y), revisar`: no es un bug del
  filtro, es la excepción funcionando. Miralo igual, porque es raro.
- Circuit breaker (🛑) → **no insistas**, esperá unas horas. Él mismo avisa por Slack con diagnóstico
  DNS (portal caído vs IP bloqueada).
- Cooldown 20 min entre corridas (`--force` con criterio).

### 2b. Prep NUEVAS (read-only)
```
node cargar-deptos-shadow.mjs --nuevas output/discovery-deptos-zn-<ts>.json 40 --zona=zona-norte
```
⚠️ **El `--prep` de existentes NO se usa acá.** En ZN las "existentes" de prod entran por el camino
de NUEVAS: el discovery es shadow-relativo (prod no participa), así que lo que está en prod pero no
en shadow ya viene marcado como NUEVA. Ese es justamente el mecanismo que drena el backlog de 119.

### 3. MOAT — subagentes-lectores (el juez)
```
node partir-lectura.mjs output/material-nuevas-<ts>-zn.json 10   # → lectura-venta-zn-<AAAA-MM-DD>-c1..N.json
```
Lanzá **N subagentes en paralelo**. Cada uno lee su `lectura-venta-zn-<fecha>-cK.json` +
**`READER_SPEC.md`** y escribe `output/veredictos-venta-zn-<fecha>-cK.json`.

> 🔴 **Nombres namespaceados por operación Y zona — no inventes otros.** El chunk trae
> `"operacion": "venta"` y `"zona": "zona-norte"` adentro: **si no coinciden, parar y avisar**.
> El 28-jul venta y alquiler compartieron nombres y el segundo pisó al primero; la pérdida es
> **silenciosa** (se pierden veredictos y las props se caen del apply sin error).

#### 🔁 Reintento con backoff (obligatorio en corrida desatendida)
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
   un LLM, que es la regla que importa. **Con muchos chunks esto es inviable**: si tuviste que leer
   más de 2 inline, **abortá y avisá por Slack** en vez de entregar una corrida a medias.
4. **Registrá en el log** cuántos chunks reintentaron y cuántos se leyeron inline.

> 🔑 **Por qué reintentar y NO achicar la tanda:** el 30-jul los dos intentos murieron con `529`
> **con 4 props**, mientras que el 29-jul se leyeron **166 props en 13 chunks** sin drama. Un `529`
> es del lado del servicio, no del tamaño del payload. Achicar la tanda no lo evita — solo alarga
> el backlog. (Anthropic estuvo inestable ese día.)

```
node inyectar-veredictos.mjs output/material-nuevas-<ts>-zn.json output/veredictos-venta-zn-<fecha>-c*.json
```
⚠️ **Reemplaza, no acumula**: pasale **todos** los archivos en UNA corrida.

### 4. Apply — escribe a shadow
```
node cargar-deptos-shadow.mjs --apply output/material-nuevas-<ts>-zn.json --zona=zona-norte
```
Match name-first (score≥0.95+zona → AUTO; ambiguo → sin match, lo levanta el audit; **nunca fuerza
por GPS**). Imprime escritos / rechazados por gate / alias sugeridos / con-nombre-sin-match.
Los alias quedan en `output/alias-sugeridos-<fecha>-zn.sql` (**con sufijo `-zn`**: sin él es el archivo
de Equipetrol, que se escribe la misma noche en la misma carpeta) — **importan**: en ZN la mayoría de los
matches los hace el LECTOR, no el matcher, y cada alias perdido es lectura que se repite.

🔁 **MUTACIÓN ADICIONAL sobre filas PREEXISTENTES (PR #64):** si una fila traía `reemplaza_a` (slug
reescrito, paso 1), tras escribir la nueva marca **la vieja** con `duplicado_de = <id nuevo>`. Imprime
`🔁 slug reescrito por C21: N/M viejas marcadas...`. Es el ÚNICO punto donde el apply toca filas fuera
del material. Candado `duplicado_de IS NULL`, se saltea si la nueva falló, `datos_json` se mergea. Reversible.

### 5. Verificador
```
node verificador-deptos.mjs --zona=zona-norte              # DRY-RUN
node verificador-deptos.mjs --zona=zona-norte --apply      # aplica
```
Baja solo con **2 señales** (ausencia del crawl + HTTP 404/redirect) sostenidas >2d. Disyuntor 40%.

### 5b / 5c — globales, SIN `--zona`
```
node derivar-pet-friendly.mjs
node snapshot-shadow.mjs
```
⚠️ **El snapshot es idempotente por fecha**: si las routines de Equipetrol ya corrieron esa noche,
esta pasada **re-fresca la foto del día con ZN incluida**. Eso es correcto, pero recordá que
**un salto de nivel en la serie shadow al entrar ZN es COMPOSICIÓN, no mercado** (ya pasó el 29-jul:
`venta_activas` 894 → 1.007 y las zonas 7 → 18). Declararlo al leer la serie.

### 6. Verificación por SQL (sin browser en corrida desatendida)
Contra `buscar_unidades_simple_shadow` filtrando zonas ZN: que las nuevas con match entren al feed,
que el $/m² caiga en la banda de su **microzona**, y que las sin `id_proyecto_master` **no** entren
(la RPC hace INNER JOIN con `proyectos_master` — es lo esperado, no un bug: quedan retenidas hasta
que el audit las matchee).

### 7. Log + Slack
Registrá en **`output/cron-deptos-ventas-zn-log.md`** (archivo PROPIO, no el de Equipetrol — así
`/revisar-routines` puede leer las dos zonas por separado y no se mezclan los conteos).

```
node notificar-slack.mjs "<resumen>"
```
El mensaje **debe empezar diciendo la zona** (`🌆 Cron deptos-VENTA ZONA NORTE`), o se confunde con
el de Equipetrol. Formato: `N nuevas → X escritas · Y rechazadas por gate` + `Verificador: A bajas ·
B revividas` + `📊 MB` + reintentos del MOAT si los hubo + cola de excepciones (o **`Sin cola
pendiente`** explícito). Distinguir **✅ OK** / **⚠️ con observación** / **🛑 abortada**.

## Reglas

- **SHADOW, prod intacto.** El `--apply` solo muta `propiedades_v2`. A prod solo SELECT + RPC
  read-only. Los alias se REGISTRAN, no se escriben a `proyectos_master`.
- **El juez manda, no el script.** El `.mjs` filtra/fetchea/matchea; el veredicto lo dan los lectores.
- **Antes de crear un edificio nuevo: chequear por PROXIMIDAD, no solo por nombre.** El 29-jul se creó
  un duplicado a 30 m (pm 556 "Edificio Isuto by One" ↔ pm 262 "ONE ISUTO"): el mismo edificio con dos
  grafías según el portal. Correr el `SELECT` de vecinos <120 m de `SIGUIENTE_SESION.md` y mirar si los
  **tokens** coinciden en cualquier orden.
- **El matcher confunde romanos** ("Portofino IV" → "Portofino V" con score 1,0) y la **eñe**. Cada
  cluster numerado nuevo lo repite. Confianza no-alta → juez ANTES del apply.
