# Inventario completo antes de consolidar las tablas — 10-ago-2026

> Reemplaza en los hechos al escenario de `CUTOVER_DATA_PLAN.md` (escrito el 17-jul), que suponía a
> n8n vivo y a prod como base. **El founder dio de baja Firecrawl y el servidor de n8n a fines de
> julio**: prod dejó de escribirse el 28-jul y no vuelve. Este doc es el mapa verificado de qué cuelga
> de cada tabla HOY. Todo lo de abajo está medido contra la BD y el repo, no recordado.

## 0. Estado de hecho

| | |
|---|---|
| `propiedades_v2` (vieja) | **congelada desde el 28-jul**. 3.695 filas. Serie de absorción cortada el 27-jul |
| `propiedades_v2_shadow` (híbrido) | **viva**, 1.453 filas · 834 venta + 327 alquiler activas · matching 87,3% / 78,0% |
| Routines | 5 agendadas y corriendo (venta+alquiler × Equipetrol+ZN, más el audit) |
| Esquema de ambas | **idéntico** — 88 columnas, cero diferencias. 14 índices cada una |
| Choques de identidad | **cero** — donde comparten número, es la misma propiedad |
| RLS | **desactivado en ambas** (ver §5.1) |

**El híbrido NO pierde inventario (verificado).** Las 144 props que prod tenía como activas y shadow
no tiene se explican enteras: 133 son brochures de preventa apartados a propósito en
`proyectos_detectados`, 6 estaban mal clasificadas en prod (alquiler/anticrético/casa/local), 2 son
republicaciones con URL nueva ya presentes, y los 5 deptos restantes **están borrados en el portal**
(302 en Remax, 404 en C21, chequeados uno por uno).

## 1. Mapa por superficie — quién lee qué

### Leen SHADOW (la data buena) — todo lo que da la cara
| Superficie | Objeto | Dónde corre |
|---|---|---|
| Feeds `/ventas` `/alquileres` | `buscar_unidades_simple_shadow`, `buscar_unidades_alquiler_shadow` | **Vercel** |
| Home, `/sobre-simon`, `/whatsapp` | vistas `_shadow` vía `superficies-data.ts` | **Vercel** |
| `/mercado/equipetrol/*` | `mercado-shadow-data.ts` + `market_absorption_snapshots_shadow` | **Vercel** |
| Shortlists `/b/[hash]` | `rpcShadowFirst` (shadow-first con fallback a prod) | **Vercel** |
| **Bot WhatsApp** | RPCs `buscar_propiedades` / `resumen_mercado` / `buscar_similares` + **SQL crudo con `v_mercado_venta_shadow` y `v_mercado_alquiler_shadow` en `lab-kapso/src/sici.js:49,79,115,137`** | **servidor del bot** |
| **ACM** (`acm-pool`, `acm-buscar`) | `v_mercado_venta_shadow`, `v_estado_obra_inferido_shadow`, `propiedades_v2_shadow` | **Vercel** |
| `/zona-norte/ventas` | shadow | **Vercel** |
| Las 5 routines nocturnas | `propiedades_v2_shadow` en 20 archivos de `scripts/deptos-equipetrol` | **máquina local** |

### Leen PROD (la tabla congelada)
| Superficie | Estado |
|---|---|
| **Admin `/admin/propiedades/[id]`** | 🔴 lee y escribe SOLO en prod — ver §3.1 |
| **Estudios de mercado** (`scripts/estudio-mercado/src/db.ts`) | 🔴 data congelada **+ fórmula duplicada** — ver §3.2 |
| `/ventas/casas` → `v_mercado_casas` | se congela (proyecto nuevo desde cero) |
| Mercado ZN (`mercado-data-zn.ts`, `mercado-alquiler-data-zn.ts`) | dark launch |
| `/admin/market`, `/admin/salud`, supervisor | interno |
| ~70 funciones SQL del pipeline n8n (merge, matching, enrichment, discovery) | muertas con n8n |

### Sin riesgo
`docs/analysis/mesa-data.js` (Mesa de Guerra + informe) es data **congelada al 3-ago**, no consulta la
BD en vivo. Al regenerarlo hay que apuntarlo a la base nueva.

## 2. 🔴 Lo que hace que esto NO sea una operación de base de datos

**Los nombres `_shadow` están escritos en tres sistemas que se despliegan por separado:**

1. **El sitio** (Vercel) — desplegado hoy, llamando `buscar_unidades_simple_shadow` y compañía.
2. **El bot de WhatsApp** (`lab-kapso`, otro repo, otro servidor) — con los nombres de vista escritos
   en SQL crudo. **El bot está en producción y recibe mensajes reales.**
3. **Las 5 routines** (máquina local) — 20 archivos con `propiedades_v2_shadow` adentro.

**Si se renombra de un golpe, los tres se rompen al mismo tiempo** y quedan rotos hasta que cada uno
se actualice y se vuelva a desplegar. El sitio se cae aunque el código del repo esté perfecto, porque
lo que corre es el build anterior.

👉 **Por eso el renombrado va con alias, no de un golpe.** Los objetos `_shadow` se mantienen vivos
como puente hasta que los tres sistemas estén actualizados y desplegados. Ver §6.

## 3. Problemas reales encontrados

### 3.1 El admin edita la base que nadie lee 🔴
`usePropertyEditor.ts` lee y escribe **solo** `propiedades_v2` (líneas 180, 859, 904-1013): datos,
candados e historial. Ninguna referencia a shadow. Corregir un precio, un GPS o poner un candado desde
el dashboard **no cambia nada en el sitio público**, y el cron nocturno pisa el dato igual porque los
candados viven en la otra tabla. Rompe la regla #1 ("Manual > Automatic") sin dar ningún error.

### 3.2 Los estudios de mercado: dos problemas, no uno 🔴
- Consultan `propiedades_v2` directo (`db.ts:104,142,176,191,219`) → inventario del 28-jul.
- **Tienen su propia copia de la normalización de precio en JS** (`db.ts:81-90`: si el tag es
  `paralelo`, multiplica por `tc_paralelo/6.96`). **Apuntarlos a la base nueva NO alcanza**: seguirían
  inflando ~47% porque la cuenta la hacen ellos. Hay que sacarles la fórmula y que lean las vistas de
  mercado, que ya normalizan (regla #2: una sola normalización).
- Bueno: **la zona ya es un parámetro** (`queryVenta(zona?)`), no está clavada a Equipetrol → aplicar
  zonas nuevas no es trabajo. Residuo a revisar: `ZONAS_EXCLUIDAS = ['Sin zona','Eq. 3er Anillo']`.

### 3.3 Shortlists y leads: piloto congelado, sin usuarios ✅ NO BLOQUEA
311 de 637 ítems de shortlist, 32 de 62 favoritos y 259 de 283 leads apuntan a ids ausentes en shadow.
**Decisión del founder (10-ago): son datos de prueba de un piloto congelado, sin usuarios ni servicio.
No hay nada que rescatar.** Se vacían cuando el piloto se retome de verdad; hoy no molestan a nadie.
(Sin esa aclaración, el renombrado habría roto la mitad de las shortlists en circulación.)

### 3.4 La tabla nueva no puede dar de alta una propiedad 🔴
`propiedades_v2.id` tiene `DEFAULT nextval('propiedades_v2_id_seq')`. **`propiedades_v2_shadow.id` no
tiene default** — los ids se asignan a mano (rango 8.000.xxx, 414 filas). Cuando shadow sea la tabla
principal, **cualquier alta sin id explícito falla**: admin "nueva propiedad", alta del broker,
cualquier INSERT del sitio. Hay que ligarle una secuencia arrancada por encima de 8.000.999.

### 3.5 Seguridad: `anon` podía escribir las tablas ✅ RESUELTO (mig 317, aplicada 10-ago)
Tenían `anon=arwdDxtm` = **todos los permisos**, con **RLS desactivado**. Con la clave pública del
sitio —que viaja en el navegador de cualquier visitante— se podía insertar, modificar o borrar filas.
No lo abrió nadie: es el *default privilege* del schema `public` (regla #13 del CLAUDE.md).

**Cerrado por la mig 317 el 10-ago.** Verificado después de aplicar: `anon=rm` en la vieja (solo
lectura, que 3 puntos del sitio necesitan), ausente en la nueva, fuera de ambas secuencias. `/`,
`/ventas` y `/alquileres` responden 200 **con datos**. `authenticated` quedó intacto a propósito (es
lo que usa el admin para guardar) → **endurecerlo va junto con el arreglo de §3.1, no antes**.
Pendiente cosmético: a `anon` le quedó el privilegio `MAINTAIN` sobre la vieja.
🔴 **Sigue pendiente el modelo de RLS** (backlog Tier 2, `docs/canonical/SEGURIDAD_SUPABASE.md`).

## 4. Lo que NO hace falta (verificado, no asumido)
- **Trigger de zona en shadow:** de 1.158 activas con GPS, solo **3** tienen la zona desalineada. Las
  routines la calculan al escribir. Hará falta el día que algo edite shadow a mano — o sea, después
  de arreglar §3.1, no antes.
- **Cambiar `precio_normalizado()` ahora:** se pensó para un escenario que ya no existe. Hoy la
  fórmula vieja solo alimenta superficies congeladas o internas.

## 5. Detalles técnicos que no dan error pero cambian resultados
- **Vistas vs funciones al renombrar:** en Postgres las **vistas** quedan pegadas a la tabla vieja (se
  ligan por OID), las **funciones** saltan a la nueva (se ligan por nombre). `v_mercado_casas` seguiría
  leyendo el archivo (conveniente); `snapshot_absorcion_mercado()` pasaría a leer la nueva (no
  deseado). Repasar una por una.
- **Permisos del bot:** `bot_kapso_readonly` tiene GRANT sobre `v_mercado_venta`, `v_mercado_alquiler`
  y sus gemelas `_shadow`. Los permisos siguen al objeto al renombrar, pero un objeto **nuevo** nace
  sin ellos → si se crea una vista canónica nueva, hay que re-otorgar o el bot se queda ciego.
- **Índices:** 14 en cada tabla, distintos entre sí. Los de shadow cubren lo que consulta el feed
  (zona, microzona, status, precio, piso, GPS, proyecto). No hay que portar los de prod.

## 6. Pre-mortem: por qué NO se renombran las dos tablas de una vez

Antes de proponer el plan se buscó qué podría fallar. Aparecieron dos cosas que tumbaron la versión
anterior de este mismo capítulo (un plan de 4 etapas con alias, ya descartado):

🔴 **(a) La fórmula vieja empezaría a leer datos nuevos.** `buscar_unidades_reales` y `buscar_extras`
leen `FROM propiedades_v2` y calculan con `precio_normalizado()` (la que infla ~47%). Hoy son
**inofensivas porque leen una tabla congelada**. Si `propiedades_v2` pasa a ser la base buena, se
despiertan sobre datos vivos. **No da error: da un número creíble y falso.**
🔑 Lo que hoy separa a las dos fórmulas **es el nombre de la tabla, no otra cosa.**

> ✅ **CORRECCIÓN (14-ago-2026) — el riesgo se achicó a casi nada, y dos de los tres consumidores
> que este párrafo nombraba estaban MAL.** Se verificó consumidor por consumidor, leyendo el código:
>
> | Lo que decía | Lo verificado el 14-ago |
> |---|---|
> | La **creación de shortlists** usa `buscar_unidades_reales` | **Falso.** Solo la nombra en un comentario para explicar que su contrato es distinto. Sus snapshots salen de `v_mercado_venta_shadow` con fallback, mudados el 21-jul con el lanzamiento del TC nuevo (`api/broker/shortlists/index.ts:165-182`). |
> | El **CMA del broker** la usa | Cierto, pero **el CMA v1 se apagó el 14-ago** (`api/broker/generate-cma.ts` → 410). Lo reemplaza el ACM (PR #71), que lee `v_mercado_venta_shadow`. Y llevaba 3 días roto sin que nadie lo notara: `buscar_unidades_reales` ya corta con `42P01` y el endpoint se lo tragaba, generando informes con **cero comparables** y cobrando el crédito igual. `broker_cma_uso`: **0 filas en toda su historia.** |
> | `buscar_extras` es un problema | **Ya estaba resuelto:** tiene gemela `buscar_extras_shadow` (SECURITY DEFINER) y el código la prefiere vía `rpcShadowFirst`. |
>
> 👉 **Consecuencia para el TIEMPO 2:** no hay nada que "repuntar al régimen nuevo". Lo que queda
> colgando de `buscar_unidades_reales` es el **funnel premium**, que está dormido por decisión de
> producto (`resultados-v2`, `FilterBarPremium`), y **`/admin/propiedades`**, que ya entra por los
> pasos 2-3 del admin. La condición de entrada 2 pasa de "repuntar dos funciones" a **"apagar una y
> decidir el funnel"**.
> 🔑 **La lección del método, no del dato:** el párrafo de arriba nombraba tres consumidores y dos
> eran falsos. Se escribió leyendo un grep, no el código de cada llamador — el grep encuentra el
> nombre de la función también donde solo está *mencionada en un comentario*.

🔴 **(b) "Las ~70 funciones de n8n están muertas" era falso.** Al menos **6 las usa el sitio vivo**
(`buscar_unidades_reales`, `buscar_extras`, `analisis_mercado_fiduciario`, `calcular_confianza_datos`,
`inferir_datos_proyecto`, `procesar_decision_sin_match`) — admin de propiedades y proyectos, CMA y
shortlists. Desactivarlas en bloque rompía el admin.

🟠 **(c) El renombrado NO arregla los candados.** Verificado: `campos_bloqueados` aparece **0 veces**
en `cargar-deptos-shadow.mjs` y `cargar-alquiler-shadow.mjs` (solo lo mira el audit). Aunque el admin
escriba donde el sitio lee, **el cron de esa noche le pisa la corrección**. El arreglo del admin son
DOS cosas, no una.

🟠 **(d) Choque de ids.** El cargador calcula el próximo id por su cuenta (máx + 1, hoy 8.000.724).
Si además se liga una secuencia, ambos pueden entregar el mismo número la misma noche → clave
duplicada. Arrancar la secuencia MUY por encima (p. ej. 9.000.000) o que el cargador la use.

🟡 **(e)** El admin pasará a listar 2.242 filas menos (esperado). **(f)** El reemplazo masivo en los
74 archivos de scripts puede romper alguno que compare las dos tablas a propósito — revisar antes.

## 7. Plan vigente — en DOS TIEMPOS (surgió de una pregunta del founder, 10-ago)

La clave: **hay tres movimientos posibles, no dos.** (A) renombrar solo la vieja · (B) renombrar las
dos · (C) no tocar nada. El riesgo de §6(a) **solo aparece en B**. En A la fórmula vieja se queda sin
tabla y **falla ruidoso** en vez de mentir en silencio.

**PASO 0 — soltar las routines de la base vieja (⚠️ SIN ESTO, EL TIEMPO 1 CORTA LA CAPTURA).**
Descubierto el 10-ago al verificar, contra mi propia predicción de que "las routines no se enteran":
- 🔴 `discovery-deptos.mjs` y `discovery-alquiler.mjs` leían `propiedades_v2` con un
  `if (error) process.exit(1)` → **abortaban las 4 capturas nocturnas** (Eq + ZN, venta + alquiler).
  El dato era **informativo** desde el 20-jul y nadie consumía `existentes_urls` ni `resumen.prod`.
- 🟠 `verificar-shadow-alquiler.mjs` cruzaba contra prod **sin chequear `error`** → al archivarse la
  tabla habría impreso **"✅ INVENTARIO CERRADO"**: un fallo disfrazado de éxito. Se retiró el bloque
  entero (medía contra una foto congelada: un aviso bajado del portal el 5-ago sigue `es_activa` ahí
  para siempre). Se conservó en comentario su lección: **la identidad de un aviso es la URL, no el id.**
- 🟡 `traerLote()` de los dos cargadores (modo `--prep`, que el cron no usa): ahora explica por qué
  no está disponible en vez de morir con un error de Postgres.
- 🔴 **`reconstruir_serie_precios_reexpresada()` (la tarea MENSUAL de la curva de `/mercado`) lee la
  tabla vieja** — y está bien que lo haga: la serie se arma con 6,5 meses de precios históricos que
  viven ahí. **En el TIEMPO 2 pasaría a leer la base nueva y reconstruiría la curva con muchos menos
  datos, sin fallar.** Hay que repuntarla explícitamente a `propiedades_v2_archivo`.
- ✅ Verificado limpio: los 9 scripts de las routines (audit incluido) y las otras 5 RPC que invocan.
- ✅ Probado con las 4 capturas corridas a mano **antes** de tocar ninguna tabla.

> # ✅ TIEMPO 1 EJECUTADO — 11-ago-2026. Los 4 evals PASAN, cero hallazgos no predichos.
> Veredicto completo con los números lado a lado: [`FOTO_PREVIA_TIEMPO1_2026-08-11.md`](FOTO_PREVIA_TIEMPO1_2026-08-11.md).
> Feeds 354/182 idénticos · bot idéntico · las 6 páginas con el mismo peso byte a byte · las 4
> capturas corrieron · se rompieron exactamente el admin, `buscar_unidades_reales` y `buscar_extras`.
> **Lo que sigue es el trabajo intermedio** (§7, "Entre los dos tiempos"), ahora con una lista
> declarada por el sistema y no estimada leyendo código.

**TIEMPO 1 — `propiedades_v2` → `propiedades_v2_archivo`. Nada más.**

> 📎 **En la MISMA operación va el repunte de la serie de precios** (no antes: `_archivo` todavía no
> existe; no después: en la ventana intermedia la tarea mensual reconstruiría la curva contra la
> tabla equivocada). La función lee las DOS a propósito — la vieja aporta los 6,5 meses de historia,
> shadow lo actual — así que se cambia **una sola línea**, parcheando la definición VIVA (regla #7,
> mismo patrón que las migs 311/316: nunca transcribir la función):
>
> ```sql
> DO $$
> DECLARE def text; buscado text := 'JOIN propiedades_v2 p ON p.id = ph.propiedad_id';
> BEGIN
>   SELECT pg_get_functiondef(p.oid) INTO def
>     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
>    WHERE n.nspname = 'public' AND p.proname = 'reconstruir_serie_precios_reexpresada';
>   -- Aborta si la función cambió: un parche a medias la deja válida y semánticamente rota.
>   IF def IS NULL OR position(buscado IN def) = 0 THEN
>     RAISE EXCEPTION 'El JOIN esperado no está — la función cambió. Abortado sin tocar nada.';
>   END IF;
>   EXECUTE replace(def, buscado, 'JOIN propiedades_v2_archivo p ON p.id = ph.propiedad_id');
> END $$;
> ```
>
> Verificación: correr `node scripts/deptos-equipetrol/reconstruir-serie-precios.mjs` y comparar el
> total de filas de `market_price_reexpresado` contra el de antes del cutover. Si bajó mucho, la
> función está leyendo la tabla chica.
Todo lo que todavía dependa de la base vieja salta con error, junto y el día elegido:
el admin, los estudios, el feed `/ventas/casas`, `/admin/market`, supervisor, y las funciones de
§6(a)/(b). **Eso es el objetivo, no un daño colateral**: el sistema revela sus dependencias en vez de
que alguien las adivine leyendo código (que ya falló: se escaparon el bot, los ids y los candados).
Se hace un día laborable, con tiempo para mirar. Reversible con un `ALTER TABLE ... RENAME` inverso.

**Entre los dos tiempos — arreglar lo que gritó** *(estado al 17-ago-2026)*:
- ✅ ~~apagar o repuntar `buscar_unidades_reales` y `buscar_extras`~~ — **apagadas**: `buscar_extras`
  ya tenía gemela shadow; la otra se quedó sin llamadores (CMA v1 → 410 · funnel premium borrado ·
  autocompletado del admin mudado a la tabla). Se borra en la limpieza del TIEMPO 2.
- ✅ ~~apuntar el admin a la base buena~~ — el **paso 1** lo hizo (listado + editor sobre
  `propiedades_v2_shadow`). ⚠️ Pendiente lo que NO era del admin sino del rename: `useProjectEditor`,
  `/admin/alquileres`, `/admin/market-alquileres` y `/admin/proyectos` siguen leyendo el nombre
  viejo **a propósito** (grupo A de `ADMIN_ANALISIS` §13.2 — el rename los arregla).
- ⬜ conservar las otras 4 funciones vivas.
- ⬜ **hacer que los cargadores respeten `campos_bloqueados`** (§6c) — 🔴 **sigue siendo el pendiente
  real**, y es condición de entrada 4.
- ⬜ apagar el feed de casas · ⬜ dejar los estudios para su reescritura (§3.2).

**TIEMPO 2 — `propiedades_v2_shadow` → `propiedades_v2`** (+ la secuencia de §6d).
Cuando ya nadie usa el nombre viejo, dárselo a la base buena **no tiene riesgo**: no queda ninguna
fórmula vieja viva para confundirse. Mismo destino final que el plan B, en dos pasos seguros.

**Lo que NO entra en ningún tiempo:** cambiar `precio_normalizado()` (va con casas), el trigger de
zona (§4), tocar casas/terrenos/anticrético (proyecto nuevo), y **borrar el archivo — nunca**: ahí
viven los 33 matches de condominio, el crudo histórico y 22k filas de `precios_historial`.

⏸️ **Estado al 10-ago: sin decidir por el founder.** Nada de esto está aplicado.

## 7-bis. TIEMPO 1 — goal, predicción y evals (listo para ejecutar)

### Goal
**Que el sistema declare por sí mismo quién todavía depende de la base vieja, y que ninguna pieza
pueda leerla creyendo que es la buena.**
**NO es el goal** (y no se toca): arreglar el admin, cambiar la fórmula de precios, unificar nombres,
tocar casas. Todo eso viene después, con la lista en la mano.

### Pre-requisitos — ✅ los dos cumplidos el 10-ago
- **Paso 0** (routines sueltas de la base vieja), probado con las 4 capturas a mano + el
  `verificar-shadow-alquiler`. Commit `45b6278`.
- **mig 317** aplicada y verificada (escritura anónima cerrada).

### Predicción — se firma ANTES de ejecutar
Sin esto no hay eval, solo una racionalización a posteriori.

| **SE ROMPE** (pide la tabla por su nombre) | **NO SE ROMPE** (llega por otro camino) |
|---|---|
| Admin de propiedades y de proyectos, `/admin/alquileres`, supervisor/matching | Feeds `/ventas` y `/alquileres` (RPC `_shadow`) |
| `/admin/market`, `/admin/salud` | Home, `/sobre-simon`, `/whatsapp` |
| Estudios de mercado (`estudio-mercado/src/db.ts`) | `/mercado/equipetrol/*` |
| ~~CMA del broker + creación de shortlists~~ (`buscar_unidades_reales`) → **corregido el 14-ago, ver §6a: las shortlists NUNCA la usaron y el CMA v1 quedó apagado** | Bot de WhatsApp (vistas `_shadow`, RPC DEFINER) |
| Las 3 lecturas de `lib/supabase.ts` (2 muertas + `/landing-v2`) | ACM (`acm-pool`, `acm-buscar`) |
| Las ~70 funciones SQL de n8n, **incluidas las 6 que el sitio usa** | **Las 5 routines** (paso 0, ya probado) |
| `reconstruir_serie_precios_reexpresada` → se repunta en la misma operación | **`/ventas/casas`**: su vista queda pegada al archivo por OID |

### 🆕 Ronda 3 de análisis (11-ago, 9 AM) — lo que la predicción NO tenía
Verificado a pedido del founder ("quiero estar seguro de que tenés el análisis completo"). Apareció
en los ángulos que **tocan la tabla desde afuera**, que es donde se me escapa siempre:

- 🔴 **`fn_trigger_tc_actualizado` — trigger sobre `config_global`, NO sobre propiedades.** Al
  actualizar el TC hace `UPDATE propiedades_v2 SET requiere_actualizacion_precio = TRUE`. Sin la
  tabla, **falla el trigger y con él la actualización del tipo de cambio** — la pieza de la que
  cuelga todo el sistema de precios. 🔑 **Es maquinaria MUERTA**: el flag lo leen 6 funciones del
  régimen viejo de recálculo (`recalcular_precios_batch_nocturno` y compañía), apagado desde el
  19-jun (lo reemplazó `precio_normalizado()` en vivo). Hay 796 filas marcadas que nadie procesa.
  👉 **Decisión: DESACTIVAR el trigger en el TIEMPO 1** (`ALTER TABLE config_global DISABLE TRIGGER
  trigger_tc_actualizado;`, reversible con ENABLE). Repuntarlo al archivo sería mantener vivo un
  mecanismo muerto escribiendo en un archivo.
- 🟠 **`v_amenities_proyecto`** (vista MATERIALIZADA) lee la tabla vieja. **Nadie la consulta** en
  todo el código — es huérfana. Riesgo: si algo intenta refrescarla, falla.
- 🟠 **`trg_separar_hitl_por_macrozona`** sobre `matching_sugerencias` (cola del régimen viejo, sin
  escrituras desde que n8n se apagó). Riesgo bajo.
- ✅ **`pg_cron`: 3 jobs activos, NINGUNO toca la tabla** — `advisor-snapshot-diario` (9:15),
  `vigilar-bot-wa` (cada 3 min) y `parte-diario-bot` (1:00). Era el único ángulo que no podía ver yo
  (`claude_readonly` no tiene permiso sobre el schema `cron`); lo verificó el founder.
- ✅ Sin crons de Vercel · ningún otro repo del disco consulta la base (solo `lab-kapso`, ya mapeado).

### 🗺️ Ronda 4 (11-ago) — MAPA DE ÁNGULOS: qué se revisó, no solo qué se encontró
Las rondas 1-3 buscaron **lo que se me ocurría**, y por eso cada una encontró algo nuevo. Esta ronda
usa el **catálogo de Postgres como fuente** (`pg_depend`), que enumera dependencias sin depender de
mi imaginación, más un barrido de código sobre todo el repo.

**Dentro de la base — 12 ángulos, todos cerrados:**

| # | Ángulo | Resultado |
|---|---|---|
| 1 | Vistas normales | **14** (`pg_depend` — coinciden exactamente con las mapeadas a mano) |
| 2 | Vistas materializadas | **2** · `v_amenities_proyecto` lee la vieja y es **huérfana** (0 consumidores) |
| 3 | Funciones (`prosrc`) | ~70 · **6 las usa el sitio vivo** |
| 4 | Triggers SOBRE la tabla | **5** (los 2 de zona, amenities, matching alquiler, sync sin-match) |
| 5 | Triggers sobre OTRAS tablas que la nombran | **2** · 🔴 `trigger_tc_actualizado` (ver ronda 3) |
| 6 | `pg_cron` | **3 jobs**, ninguno la toca ✅ |
| 7 | **Foreign keys hacia la tabla** | **5** 🔴 ver abajo |
| 8 | Reglas (RULES) | ninguna |
| 9 | Políticas RLS | ninguna definida |
| 10 | Publicaciones / realtime | ninguna |
| 11 | Funciones y vistas en OTROS schemas | ninguna |
| 12 | Secuencias, constraints, índices | siguen a la tabla al renombrar (por OID) |

🔴 **Las 5 FK contradicen lo que este mismo documento afirmaba** ("ninguna tabla tiene FK a
`propiedades_v2`"). Esa afirmación salió de `information_schema.constraint_column_usage`, que **no
las mostró**; `pg_constraint` sí. **Lección: para dependencias, el catálogo (`pg_*`), nunca
`information_schema`.** Las 5 (`matching_sugerencias`, `precios_historial`,
`propiedades_v2_historial`, `propiedades_excluidas_export`, `sin_match_exportados`) apuntan a
**tablas muertas**: la escritura más reciente de cualquiera es del **28-jul**. Quedan enganchadas al
archivo, que es donde viven sus filas → **no bloquean el renombrado**. ⚠️ Sí importan para el trabajo
intermedio: cuando el admin arreglado escriba historial de props de la base NUEVA, esa FK va a fallar.

**Fuera de la base — 7 ángulos:**

| # | Ángulo | Resultado |
|---|---|---|
| 13 | Frontend `simon-mvp` | **19 archivos** (12 en `pages`, 5 en `lib`, 2 en `hooks`) |
| 14 | Bot `lab-kapso` | **no nombra la tabla** — solo vistas `_shadow` ✅ |
| 15 | Scripts del repo | **23 archivos** · auditorías 18 · casas-zn 4 · estudios 3 · sonda 1 · llm 1 |
| 16 | Los 4 scripts del híbrido que la nombran | 2 en modo `--prep` (el cron NO lo usa) + 2 manuales ✅ |
| 17 | n8n | 28 workflows la escriben — **apagado desde el 28-jul** |
| 18 | Crons de Vercel | ninguno ✅ |
| 19 | Otros repos del disco | ninguno ✅ |
| 20 | **Worktrees** | **2 activos** con copia del código. No corren solos, pero si se ejecuta un script desde ahí usa la tabla vieja |

**Ningún hallazgo nuevo en esta ronda** más allá de las FK (que resultaron inofensivas para este
paso). Los 3 riesgos reales siguen siendo los de la ronda 3: el trigger del TC, la materializada
huérfana y el trigger de la cola vieja.

### Evals
1. **🔴 Nada de cara al cliente se movió** *(el único que manda)*. Medida: feeds, home, mercado, bot,
   ACM y shortlists devuelven **los mismos conteos** que la foto previa. No alcanza el HTTP 200: se
   cuentan propiedades con precio, como se hizo con la mig 317.
2. **Las routines siguen capturando.** Medida: correr las 4 capturas a mano después del renombrado y
   comparar contra los números de hoy (Eq venta 516/15 · Eq alq 189/5 · ZN venta 475/15 · ZN alq 122/8).
3. **Lo que se rompió coincide con lo predicho.** Es el eval del *entendimiento*, no del cambio:
   - coincide → el mapa era correcto
   - se rompió algo **no** predicho → **es el hallazgo que justifica el ejercicio**, no un fracaso
   - **no** se rompió algo predicho → había menos dependencias de las que creíamos
4. **Nadie llega a la vieja por defecto.** Todo acceso que quede es explícito y con el nombre `_archivo`.

### Criterio de aborto
Solo el **eval 1**. Si cae una superficie de cara al cliente → `ALTER TABLE ... RENAME` inverso en el
momento y se investiga con calma. Los evals 2, 3 y 4 **no** justifican revertir: son información.

### Qué queda al terminar
La lista **verificada** (no leída) de todo lo que depende de la base vieja. Con eso, el trabajo
intermedio deja de ser una estimación y pasa a ser una tarea acotada.

## 7-ter. TIEMPO 2 — goal y condición de entrada (los pasos NO se escriben todavía)

**Goal:** una sola base de propiedades, con el nombre obvio, y **ninguna fórmula vieja viva** que
pueda leerla.

**Por qué no se planifica ahora:** sus pasos dependen de lo que revele el tiempo 1. Escribirlos hoy
sería planificar sobre una hipótesis — el error que este documento corrige (tres planes distintos el
10-ago, cada uno apoyado en información sin verificar).

**Condición de entrada — se arranca solo si se cumplen TODAS:**
1. ~~Cero referencias vivas al nombre `propiedades_v2` fuera de las que apunten explícitamente a `_archivo`.~~
   🔴 **REDACTADA DE MÁS — corregida el 17-ago-2026.** Tal cual estaba escrita, esta condición
   **contradice** el plan del admin (`docs/backlog/ADMIN_ANALISIS_2026-08-11.md` §13.2), que dice
   explícitamente *no tocar* esas referencias. Y el plan tiene razón:
   **el espíritu de la condición es que ninguna FÓRMULA VIEJA DE PRECIO despierte sobre datos
   buenos**, no que el string `propiedades_v2` no aparezca. Medido: de las **14 funciones del admin**
   que hoy leen ese nombre, **una sola calculaba precio** (`buscar_unidades_reales`) — y ya cayó. Las
   otras 13 son de matching y de proyectos: están rotas hoy y **el rename las devuelve a la vida
   bien, que es justamente lo que se busca.**
   👉 **Redacción correcta:** *cero referencias vivas al nombre `propiedades_v2` **que calculen con
   la fórmula vieja de precio** (`precio_normalizado()`) o que escriban sobre la tabla con reglas del
   régimen viejo.* Con ese criterio la condición **se cumple** salvo por lo que enumera §7-ter.b
   (`actualizar_tipo_cambio` y compañía), que es trabajo del propio TIEMPO 2, no de su entrada.
   🔑 Vale como aviso general: una condición de entrada escrita como *"cero apariciones de X"* es
   fácil de verificar y fácil de cumplir mal. La que sirve nombra **el daño**, no el string.
2. ~~`buscar_unidades_reales` y `buscar_extras`: **apagadas o repunteadas al régimen nuevo**~~ (§6a).
   ✅ **CUMPLIDA — 17-ago-2026.** `buscar_extras` ya tenía gemela shadow · las shortlists nunca la
   usaron · el **CMA v1 se apagó** (410) · el **funnel premium se borró** (rutas → `/ventas`) · y el
   último llamador, el autocompletado de asesores de `/admin/propiedades`, **pasó a consultar la
   tabla**. Verificado por grep: **`buscar_unidades_reales` no tiene un solo llamador en `src/`** y
   se puede borrar en la limpieza del TIEMPO 2.
3. Secuencia de id ligada a la tabla nueva y arrancada por encima de 9.000.000 (§6d).
4. Admin apuntado a la base buena **y** cargadores respetando `campos_bloqueados` (§6c).
5. Una semana de routines verdes después del tiempo 1.

### 7-ter.b — Trabajo que el TIEMPO 2 tiene que incluir (~~lista abierta~~ → **cerrada el 17-ago**)

> ✅ **`BARRIDO_RENAME_2026-08-17.md` cerró esta lista.** Se recorrieron las 74 funciones que tocan
> la tabla, las 17 vistas y los 33 triggers, y cada pieza quedó clasificada por lo que le pasa el día
> del rename. Dos cosas que esta sección no tenía y son las que más pesan:
> - 🔴 **7 funciones VIVAS que el rename rompe** — entre ellas `reservar_ids_shadow` (**la captura
>   nocturna**) y `buscar_similares` (**el bot**). Sin cubrirlas, el rename tumba los dos feeds, el
>   bot y la captura de esa noche. Es la lista que tiene que cubrir el atajo.
> - 🔴 **La base viva no tiene ningún trigger**; los 5 quedaron en el archivo. Eso **explica la
>   condición de entrada 4**: la protección de candados vivía en `tr_proteger_amenities_merge`, que
>   `propiedades_v2_shadow` nunca heredó. El rename no los mueve: no hay que hacer nada por ellos,
>   pero tampoco esperar que aparezcan.

No son condición de entrada: no bloquean el arranque. Son cosas que **hoy están dormidas porque la
tabla no existe, y que el rename despierta**. Si el TIEMPO 2 se hace sin tocarlas, el sistema queda
peor que antes del rename, no mejor.

**(a) `actualizar_tipo_cambio()` — borrar o repuntar. Añadido el 14-ago-2026.**
Está en el grupo 2 de `INVENTARIO_66_FUNCIONES_2026-08-11.md`, pero con una particularidad que la
saca del montón: su paso 6 hace `UPDATE propiedades_v2`. **Hoy eso la vuelve inofensiva por accidente**
(falla con `42P01` y nadie la llama; `capturar-tc-binance.mjs` la esquiva a propósito y escribe
`config_global` directo). **Después del rename deja de fallar** y vuelve a marcar propiedades vivas
con `requiere_actualizacion_precio` según las reglas del régimen viejo, sin avisar.
🔑 Es el patrón del grupo 1 disfrazado de grupo 2: *no molesta porque está rota; el TIEMPO 2 la arregla.*

**(b) Los dos triggers de `config_global` — decidir uno por uno. Añadido el 14-ago-2026.**
- `trigger_tc_actualizado` (`fn_trigger_tc_actualizado`): **desactivado** (`tgenabled='D'`) por el
  TIEMPO 1. Al renombrar la tabla **no se reactiva solo**, pero queda como objeto muerto apuntando a
  la base buena. Se borra con las 66. 🔴 **Y si alguien lo reactivara, el TC dejaría de escribirse**
  (aborta el `UPDATE` de `config_global` en la misma transacción). Consecuencia ya visible hoy:
  `auditoria_tipo_cambio` no recibe filas desde el 27-jul — es efecto del trigger apagado, **no un
  síntoma**. El historial vivo del TC es `tc_binance_historial`.
- `trigger_actualizar_precios_cuando_cambia_tc` (`marcar_propiedades_para_actualizacion`): figura
  **ACTIVO** y hoy no hace nada, porque compara `NEW.clave` contra `'TIPO_CAMBIO_PARALELO'` /
  `'TIPO_CAMBIO_OFICIAL'` en MAYÚSCULAS y esas claves se borraron el 19-jun-2026. Escribe sobre
  `propiedades`, el legacy de 2025 — o sea que el rename **no lo toca**. Es una bomba dormida con una
  sola espoleta: que alguien recree una clave en mayúsculas.

👉 **Verificación obligatoria antes y después del rename** (no alcanza con `pg_trigger` a secas —
preguntar si el objeto existe no es preguntar si está encendido):
```sql
SELECT tgname, tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'config_global' AND NOT t.tgisinternal;
```

## 8. Qué implica para el crecimiento (deptos ZN → casas/terrenos → ciudad)
- **Una sola tabla discriminada por tipo y zona** ya es el patrón que funciona. La próxima vertical se
  construye **dentro** de la base principal con su propio spec de lectura, **no en otra tabla
  paralela**. "Shadow" fue un laboratorio con fecha de vencimiento; este documento es la factura de
  haberlo dejado abierto tres semanas de más. Un laboratorio por vertical multiplica ese costo.
- **Se replica por vertical:** el spec del lector, el gate de captura, el matcher contra su catálogo
  (`proyectos_master` edificios / `condominios_master` casas) y la routine nocturna.
- **No se replica:** la tabla, las vistas de mercado ni la normalización de precio.
- **Los catálogos sobreviven a todo:** 454 edificios (281 con alias) y 45 condominios, en tablas
  propias que ningún cutover toca.
- Al escalar a la ciudad, el límite no es el modelo de datos sino el motor: la routine depende de la
  máquina prendida y de la cuota Max. Ver §Automatización de `CUTOVER_DATA_PLAN.md`.

---
Verificado el 10-ago-2026 contra la BD y el repo. Complementa (y en los hechos supersede) a
`CUTOVER_DATA_PLAN.md` §Checklist.
