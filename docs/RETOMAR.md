# Por dónde retomar — prompts listos

> Escrito el 11-ago-2026 al cerrar el día. Cada bloque es **autosuficiente**: se pega en una sesión
> nueva y arranca sin depender de ninguna conversación anterior.
> 🔴 Los tres piden lo mismo antes de escribir código: **goal en una frase · línea de base MEDIDA ·
> evals con criterio de aborto**. Esa disciplina es la que hizo que el TIEMPO 1 del cutover saliera
> sin sorpresas, y que el paso 1 del admin encontrara 4 errores que nadie había visto.

---

## 0. 🔴 LO PRIMERO DE MAÑANA — la corrida de las 09:00 del seguimiento (26-ago-2026)

**Encendido y probado, pero con UNA corrida real de una sola persona.** Mañana a las 09:00
salen **4 mensajes** (Mario, Pablo, Carlos y Carla): el primer volumen. Es lo único del
backlog que le escribe a clientes reales sin que nadie apriete un botón.

🔴 **NO se revisa con `cron.job_run_details` ni con `net._http_response`.** Esta sección decía
que ahí se leía el resultado y **las dos fuentes fallan** (comprobado la mañana del 27-ago):
· `return_message` de un `SELECT` guarda **`"1 row"`**, no lo que la función devuelve — el texto
  con los reintentos no queda en ningún lado;
· `net._http_response` **se purga a las pocas horas**, así que a la mañana no hay rastro de la
  corrida de anoche. Sirve sólo si se mira dentro de la misma ventana.

**Lo único duradero es el estado en la base.** Esta query responde las tres preguntas de una —
a quién le tocó, si se marcó, y si el mensaje REALMENTE salió:

```sql
SELECT split_part(s.cliente_nombre,' ',1) AS nombre,
       to_char(s.created_at - interval '4 hours','DD/MM HH24:MI') AS shortlist,
       round((EXTRACT(epoch FROM (now()-s.created_at))/3600)::numeric,1) AS horas,
       to_char(s.seguimiento_intentado_at - interval '4 hours','DD/MM HH24:MI:SS') AS intento,
       to_char(s.seguimiento_enviado_at   - interval '4 hours','DD/MM HH24:MI:SS') AS enviado,
       (SELECT to_char(max(m.created_at) - interval '4 hours','DD/MM HH24:MI:SS')
          FROM simon_mensajes m
         WHERE m.telefono = s.cliente_telefono AND m.direccion='out'
           AND m.texto LIKE '%te dejo de nuevo la selección%') AS mensaje_salio,
       to_char(s.created_at - interval '4 hours' + interval '22 hours','DD/MM HH24:MI') AS vence_guard
FROM broker_shortlists s
WHERE s.broker_slug='simon-asistente' AND s.created_at >= now() - interval '30 hours'
ORDER BY s.created_at DESC;
```

| lo que se ve | significa |
|---|---|
| `intento` y `enviado` con hora, `mensaje_salio` con hora | ✅ el circuito anda |
| `intento` sí, `enviado` NULL, `mensaje_salio` NULL | **el mensaje no salió** — se reintenta solo, pero mirar |
| `intento` sí, `mensaje_salio` sí, `enviado` NULL | salió y falta confirmar: pasa en el disparo siguiente |
| todo NULL y `horas` > 9 | no le tocó todavía, o ya venció el guard |

🔑 **La columna que manda es `mensaje_salio`**, porque lee el saliente real. Las otras dos son
marcas nuestras — y todo el desastre del 26-ago fue confiar en una marca. **Frenar es una línea:**
`SELECT cron.unschedule('seguimiento-shortlists');`

### Qué es esto y por qué costó un día entero
Un mensaje, 9 h después de recibir una selección, a quien no volvió. Se encendió a las 13:35,
**quemó a dos personas antes de las 15:00** (Jenny e Israel: marcadas como contactadas sin
haber recibido nada, y el marcado impide el reenvío) y se reconstruyó entero en la tarde.
Tres migraciones, cada una tapando un agujero distinto:

- **339** — pg_net dejaba de escuchar a los 5 s: con 2+ personas la respuesta se perdía
  siempre y no había registro de nada.
- **340** — se marcaba "enviado" porque Kapso devolvía 2xx. Ahora el endpoint **sólo puede
  registrar intentos** y el envío lo declara `confirmar_seguimientos_enviados()`, que exige
  un mensaje SALIENTE y ningún entrante en el medio.
- **341** — el `resume` no despierta al agente. lab-kapso midió que la variable es la **edad
  de la ejecución** (1,1 h → sale · 5,2 h → nada, aun con 30 min de quietud), así que el caso
  normal de esta función era siempre el caso que falla. Ahora el mensaje sale **directo** por
  el proxy de Kapso (`api.kapso.ai/meta/whatsapp/v24.0/...`, misma API key, sin credenciales
  de Meta) y no toca ninguna ejecución.

**Probado punta a punta el 26-ago 20:33** con Ivana, shortlist de 10,0 h — el escenario que
fallaba: HTTP 200 con cuerpo → intento → saliente registrado → confirmado a las 20:34:46 →
0 en cola.

### Lo que NO hay que hacer
🔴 **No cerrar las ejecuciones viejas.** lab-kapso lo recomendó y después se desdijo con datos;
verificado por acá: **29 mensajes entrantes tras 6+ h de silencio, 25 respondidos en menos de
2 minutos** (los 4 restantes son del número del founder). Un entrante despierta cualquier
ejecución — hay una de **287 h**, doce días. Sólo el `resume` falla. Cerrarlas le borraría a
cada persona el nombre y el criterio ya dados, para arreglar algo que por esa vía no pasa.

### Medir si sirve (no antes de unos días)
`node scripts/deptos-equipetrol/medir-seguimiento-shortlists.mjs` — ya excluye las pruebas
(`SEGUIMIENTO_TELEFONOS_TEST` en `.env.local`).
🔑 **El 19% del pedido original NO es la línea de base**: contaba segundas shortlists de la
misma sesión, y el universo tenía 27 pruebas. Medido sobre 47 personas reales, la tasa de
pedir otra selección al día siguiente es **CERO**. No se trata de subir de 19 a 25: es pasar
de cero a algo, y **la primera persona que pida una segunda selección ya es señal**.
⚠️ Con ~4 shortlists/día, distinguir 5% de 10% pide 2-3 meses. No hay veredicto rápido.

### Pendientes
- Jenny e Israel **no se recuperan** (ventana vencida). Dos contactos perdidos.
- Si el volumen crece, revisar el timeout de 30 s de pg_net: ~3 s de arranque + ~1,5 s por persona.
- Backlog aparte: `claude_readonly` tiene EXECUTE en **46 de 49** funciones `SECURITY DEFINER`,
  o sea que el rol "de solo lectura" puede escribir. No lo introdujo esto, se encontró acá.

---

## 0-bis · 🔜 EL DRIFT DE ZONA NORTE (pendiente al 27-ago-2026)

Equipetrol se auditó entero el 27-ago (723 avisos). **Zona Norte queda pendiente: 545
activas** (403 venta + 142 alquiler), ~1 hora de punta a punta.

```bash
node scripts/deptos-equipetrol/auditar-shadow.mjs --op venta --macrozona "zona norte"
node scripts/deptos-equipetrol/auditar-shadow.mjs --op alquiler --macrozona "zona norte"
```

Después, el juez: partir el `material` de cada JSON en chunks de ~10 y lanzar
subagentes-lectores. **Todo el detalle está en `/audit-deptos-shadow`** — no hace falta
contexto de la sesión del 27-ago.

🔑 **Tres cosas que costaron descubrir y ya están en ese comando** (§2, "antes de convertir
los veredictos en SQL"): los jueces proponen **12 columnas que no existen** (`area_m2` es
`area_total_m2`, `baulera_incluida` es `baulera`…), proponen **alias ya registrados**, y
llaman "canónico" al nombre comercial. Verificar contra `information_schema` antes de
escribir el SQL.

⚠️ **Persistir los veredictos APENAS LLEGAN, no al final.** El 27-ago los jueces se cortaron
a mitad por el límite de sesión: 5 de 10 completaron. Los que terminaron sirven igual, pero
si no se guardan al vuelo se pierden con el contexto.

### Qué esperar, según lo que dio Equipetrol
```
drift 3-4%          la base está sana; los avisos casi no cambian
~12% al juez        de 723 fueron 90
lo caro NO es el drift: son los precios desactualizados (24 en venta, bajas de hasta 22%)
```
Y el hallazgo que más rindió fue lateral: **19 fichas con las fotos reemplazadas**, que hacen
que la card salga vacía en el feed. Es lo único que un usuario ve. Se resuelve con
`node reparar-fotos.mjs output/audit-shadow-*.json` — no necesita juez.

---

## 1. ✅ EL ADMIN — LOS TRES PASOS ESTÁN HECHOS (20-ago-2026)

> Esta sección tenía el prompt para arrancar el **paso 2**. Quedó inválida al terminarse, y
> se reemplaza en vez de borrarse: una instrucción que ya no aplica y sigue escrita es
> exactamente lo que hizo perder un mes con la curva de mercado.

| paso | qué era | estado |
|---|---|---|
| **1** | que el admin hable el idioma del feed | ✅ 11-ago (`1323b21`, `4aa0d0e`) |
| **2** | `/admin/market` a las fuentes vivas + retirar lo muerto | ✅ 20-ago |
| **3** | la bandeja del audit | ✅ 20-ago — vive en **`/admin/revisar`** |

**Paso 2** — `market` tenía **4 fuentes y 3 rotas**, ninguna fallando: mostraba 65 props
**11 veces más caras** (las de bolivianos, con el crudo en Bs pintado como dólares), servía la
foto congelada del 27-jul en el análisis por zona, y sus gráficos de absorción decían "no hay
datos" por **falta de permiso**. Se retiró el **supervisor HITL** (6 pantallas, 2.721 líneas)
tras revisar sus 250 pendientes: 241 eran historia muerta y de las 9 vivas, 8 proponían match
por GPS-solo. Detalle: memoria `project_admin_market_reparado`.

**Paso 3** — mig 335 `audit_hallazgos` + `/api/admin/hallazgos` + la pantalla. Probado de
punta a punta: se descarta un hallazgo, corre el audit otra vez y **no lo re-abre**.

### Lo que quedó abierto del admin
- 🔴 **`authenticated` tiene DELETE sobre la tabla viva, sin RLS.** El admin funciona gracias a
  eso, así que no se arregla revocando y ya: necesita su propia migración. **Es lo único de
  todo el backlog que puede causar un daño irreversible.**
- 🔴 **El login del admin se cuelga en local** ("Verificando acceso…") con sesión válida. La
  consulta que necesita responde en 622 ms; el evento que la dispara no llega. Se intentó un
  arreglo (el bypass de dev delega en `INITIAL_SESSION`) y **no era la causa** — revertido.
- **Retirar `/admin/salud`**: sus 3 fuentes están mudas desde el 28-jul, así que muestra un
  sistema sano que nadie está midiendo.
- **Mediados de septiembre**: reactivar el KPI de absorción, cuando `primera_ausencia_at`
  acumule sus 30 días (hoy tiene 2). Comparar contra la serie vieja antes de encenderlo.

## 2. ✅ TIEMPO 2 DEL CUTOVER — EJECUTADO EL 17-ago-2026

> **La tabla viva se llama `propiedades_v2`.** Se cumplió la predicción firmada: no se movió un solo
> número. Verificado en tres capas —base, lectura en producción (incluido el ACM sin caché y una
> shortlist dinámica) y **escritura real con el cargador**— y confirmado end-to-end porque **el bot
> respondió por WhatsApp**. Detalle: `scripts/deptos-equipetrol/TIEMPO2_FOTO_PREVIA_2026-08-17.md`.
>
> ### ✅ Lo inmediato al volver — LOS 3 CUMPLIDOS (18-19 ago)
> 1. ~~`/revisar-routines`~~ → las capturas corrieron normal. **El cutover quedó cerrado.**
> 2. ~~Probarle al bot~~ → informa **182**, la mig 326 quedó verificada.
> 3. ~~La limpieza~~ → **hecha el 18-ago y el atajo BORRADO** (ver abajo). Y el 19-ago la **mig 328**
>    desarmó además las 4 funciones del régimen viejo que quedaron leyendo la base viva.
>
> ### ✅ Dos bugs encontrados el 17-ago, ninguno del cutover — LOS DOS ARREGLADOS
> - ~~El feed ZN muestra 24 de 301~~ → **ARREGLADO el 18-ago.** No era solo el fetch diferido: al
>   parametrizar los feeds por macrozona apareció que **`/api/ventas` devuelve EQUIPETROL cuando no
>   le pasan `zonas_permitidas`** — el feed de ZN llegó a servir props de Eq. Centro en producción,
>   con `tsc` y `build` en verde. El aislamiento se fuerza ahora DENTRO de `fetchFromAPI`.
>   Hoy los 4 feeds comparten un componente por operación (`docs/design/PLAN_ZN_ALINEAR_Y_ESCALAR.md`).
> - ~~El bot informaba 168 alquileres de 182~~ → **ARREGLADO, mig 326.** Los 14 publicados en USD
>   quedaban afuera porque la vista no los convierte a Bs y la RPC del feed sí.
>
> El prompt de abajo queda como **registro de cómo se planificó**.

## 2-bis. El plan tal como se armó (histórico)

```
Retomamos el TIEMPO 2 del cutover: darle el nombre `propiedades_v2` a la tabla
viva, que hoy se sigue llamando propiedades_v2_shadow.

🟢 ESTADO AL 17-ago-2026: **NINGUNA condición de entrada bloquea el TIEMPO 2.**
Se verificaron las 5 una por una, midiendo. No hay requisitos previos pendientes:
lo que queda es el trabajo del propio día.

Leé primero:
0. scripts/deptos-equipetrol/BARRIDO_RENAME_2026-08-17.md — 🔴 EMPEZÁ ACÁ. Cada
   pieza —de la base Y del código— clasificada por lo que le pasa el día del
   rename. Tiene la lista cerrada de las 6 funciones VIVAS que el rename ROMPE,
   los 53 puntos de código, y el veredicto de riesgo de cada arreglo.
1. scripts/deptos-equipetrol/FOTO_PREVIA_ARREGLOS_2026-08-17.md — la línea de
   base MEDIDA (feeds, shortlist real, RPC, bot). Es contra esto que se compara.
2. scripts/deptos-equipetrol/INVENTARIO_CUTOVER_2026-08-10.md — §7-ter tiene el
   goal y las 5 condiciones, cada una con su veredicto del 17-ago.
3. scripts/deptos-equipetrol/FOTO_PREVIA_TIEMPO1_2026-08-11.md — cómo se hizo el
   tiempo 1 y su veredicto.

── LAS 5 CONDICIONES, CERRADAS ──────────────────────────────────────────────
1. "Cero referencias al nombre viejo" → REDACTADA DE MÁS. Su espíritu es que
   ninguna FÓRMULA VIEJA DE PRECIO despierte; de las 14 referencias, UNA sola
   calculaba precio y ya cayó. Las otras 13 son de matching/proyectos: están
   rotas y el rename las arregla, que es lo que se quiere.
2. Funciones de precio apagadas → ✅ CUMPLIDA. `buscar_unidades_reales` no tiene
   un solo llamador en `src/` (CMA v1 apagado · funnel premium borrado ·
   autocompletado del admin mudado a la tabla). Se borra en la limpieza.
3. Secuencia de ids → ✅ CUMPLIDA Y MEDIDA. Son DOS secuencias con rangos
   separados: la del cargador arranca en 8.000.001, el DEFAULT en 9.000.000, el
   id más alto es 8.000.924 → 999.076 de margen, décadas. Cero filas usaron el
   default. Y el rename no toca ninguna de las dos.
4. Admin + candados → ✅ CUMPLIDA. Los dos cargadores respetan
   `campos_bloqueados` desde el 11-ago, y el TEST del 17-ago dio 172/172 candados
   en formato válido, cero corruptos.
5. Semana de routines verdes → se satisface corriendo las 4 capturas A MANO ese
   día (es lo que la condición quería probar, y es el eval 2 del propio plan).
   Los rojos son por la laptop que se duerme, no por el pipeline.

── EL TRABAJO DEL DÍA ───────────────────────────────────────────────────────
- ALTER TABLE ... RENAME (segundos, reversible con el inverso).
- El ATAJO con el nombre viejo (una vista `SELECT *` sobre la tabla renombrada).
  ✅ PROBADO el 17-ago en una tabla de juguete, por la misma vía que usa el
  cargador (API REST) y con un conflicto REAL: el upsert funciona a través de la
  vista y escribe en la tabla base. La predicción contraria era falsa — las
  vistas auto-actualizables propagan la escritura con las constraints de la tabla.
  👉 Con el atajo puesto, la VENTANA DE CAÍDA ES CERO: feeds, bot, shortlists y
  cargadores siguen andando sin tocar una línea de código. Los 53 puntos se
  despliegan con calma, incluso otro día, y recién después se saca el atajo.
- Recrear/repuntar las 6 funciones que nombran `propiedades_v2_shadow`.
- Reemplazar los 53 puntos de código (20 archivos) + desplegar. Verificar con
  grep que queda 0. NO centralizar antes: mueve el riesgo a una noche sin nadie
  mirando (ver el recuadro rojo del barrido).
  ✅ REVISADOS uno por uno el 17-ago: es MECÁNICO, sin casos raros. Tres grupos:
  41 × `from('propiedades_v2_shadow')` (reemplazo directo) · 12 × `from(TABLA_PROPIEDADES)`
  (no se tocan: se cambian las 2 declaraciones de la constante, en
  `usePropertyEditor.ts` y `admin/propiedades/index.tsx`) · 1 `console.log` con el
  patrón del UPDATE, cosmético. Total: **44 ediciones del mismo tipo**.
  Y se verificó que **los audits NO generan archivos .sql**: no hay un solo
  `writeFileSync` con SQL: los `.sql` de `output/` se escriben a mano en cada
  sesión. Así que no hay SQL autogenerado que quede apuntando al nombre viejo.
- Correr las 4 capturas a mano y comparar contra la línea de base.
- Hacerlo A LA MAÑANA: deja ~15 h de colchón antes de que corra el cron.

── ✅ LA LIMPIEZA POSTERIOR — HECHA EL 18-ago-2026 ────────────────────
Los 3 frentes cerrados y el atajo BORRADO: `propiedades_v2_shadow` ya no existe.
6 funciones (mig 327) · 53 puntos de código · 6 skills (+ copiadas a .claude/commands).
Verificado tras el DROP: feed 656/288, bot 386/181, vistas 761/288 — sin moverse —,
los 5 feeds en 200 y el ACM recalculado sin caché. EL CUTOVER ESTÁ CERRADO.
Lo de abajo queda como registro de qué se tocó.

── lo que se hizo ───────────────────────────────────────────────────
Nada de esto bloquea el día del rename: con el atajo puesto todo sigue andando.
Pero el atajo NO se saca hasta que las tres cosas estén hechas, o algo se cae.
Son TRES frentes, y la lista está cerrada:

1. **Las 6 funciones** que nombran `propiedades_v2_shadow`: recrearlas con el
   nombre nuevo. `buscar_unidades_simple_shadow` · `buscar_unidades_alquiler_shadow`
   · `buscar_extras_shadow` · `buscar_similares` (el bot) ·
   `snapshot_absorcion_mercado_shadow` · `reconstruir_serie_precios_reexpresada`.
   EVAL: los 2 feeds, una shortlist real y el bot responden.

2. **Los 53 puntos de código** (20 archivos): 41 literales + 2 declaraciones de
   `TABLA_PROPIEDADES` + 1 `console.log`. Mecánico, revisado uno por uno.
   EVAL: `grep -c` da 0 · tsc 0 · build ok · la línea de base sin moverse.

3. **Las 6 SKILLS** (17 menciones) — el eje que el founder señaló y que el
   barrido no había visto (buscaba .ts/.tsx/.mjs, y son .md):
   `audit-cola-shadow` (5, **2 son SQL**) · `cron-deptos-ventas` (4) ·
   `audit-deptos-shadow` (3, **1 es SQL**) · `cron-deptos-alquiler` (3) ·
   `cron-deptos-ventas-zn` (1) · `revisar-routines` (1).
   ⚠️ SON DOS PASOS: editar en `scripts/deptos-equipetrol/*.command.md` **y copiar**
   a `sici/.claude/commands/` (gitignored). Cambiar solo el repo deja corriendo la
   vieja — el bug del 31-jul.
   EVAL: `node scripts/verificar-skills.mjs` → "15 al día · 0 desincronizadas".

Recién con los tres: DROP de la vista del atajo + volver a correr los evals.

── OTRO TRABAJO, ESE SÍ OPCIONAL ────────────────────────────────────────────
- Arreglo 2: borrar las 6 funciones de precio. Bajó de prioridad cuando se quitó
  el fallback del helper (17-ago) — ya nada las invoca solo. CONDICIÓN: exportar
  `pg_get_functiondef()` de las 6 ANTES de borrar; que exista el .sql en el repo
  NO prueba que sea igual a lo que corre (regla 7).
- Las 25 funciones del n8n muerto que despertarían escribiendo: riesgo dormido
  (nadie las llama), mueren con el retiro de /admin/supervisor.
- Un trigger genérico de candados sobre la tabla viva: hoy la protección vive en
  cada escritor, y cada escritor nuevo nace sin ella. Mejora, no requisito.

── LO QUE APRENDIMOS Y NO HAY QUE REPETIR ───────────────────────────────────
🔑 Un barrido hereda el punto ciego de SU HERRAMIENTA. El catálogo de Postgres no
   ve el repo (faltaron 53 puntos de código); un grep no ve llamadores internos
   al mismo archivo; un patrón sin límite de palabra confunde `precio_normalizado`
   con `precio_normalizado_shadow` y la TABLA con la SECUENCIA que se llama
   parecido. Las tres mordieron el 17-ago. Antes de cerrar un barrido: ¿qué clase
   de objeto NO puede ver el instrumento que estoy usando?
🔑 Un barrido que "se siente completo" es la alarma, no la llegada.
🔑 Una verificación tiene fecha de vencimiento: la §6c decía "verificado: los
   cargadores no respetan candados" y dejó de ser cierta 24 h después, pero se
   siguió citando una semana.
🔑 Las VISTAS sobreviven al rename (se ligan por OID); las FUNCIONES no
   (resuelven el nombre al ejecutarse). Comprobado en el TIEMPO 1.
🔑 La base viva NO tiene triggers: los 5 quedaron pegados al archivo. El rename
   no los mueve, y no hay que replicarlos (el de candados está atado al merge de
   n8n, que ya no corre).

Antes de proponer nada: releé el barrido y decime si algo cambió desde el 17-ago.
```

---

## 3. Lo de Remax sin área (queda abierto)

```
Retomamos el hallazgo de calidad de datos del 11-ago: Remax alquiler tiene 22,9%
de propiedades sin área (1 de cada 4) contra 0,1% de Century21, y sigue pasando
en las capturas recientes.

Contexto en docs/backlog/ADMIN_ANALISIS_2026-08-11.md (sección "Hallazgo de
CALIDAD DE DATOS que destapó el listado").

Lo que ya se sabe:
- El área de Remax viene del DISCOVERY (search API), no del detalle. Lo dice
  scripts/deptos-equipetrol/lib/detalle-deptos.mjs: "El área NO se saca del
  detalle (Remax no la trae ahí)".
- Tampoco está en el texto de la descripción (8 casos revisados).

LA PREGUNTA QUE CIERRA EL TEMA, y que no pude responder: ¿el aviso en remax.bo
muestra la superficie? Si la muestra, es un bug del discovery. Si no, es dato
faltante del captador y no hay nada que arreglar.
⚠️ El fetch directo a remax.bo falla; hay que usar el proxy del pipeline
(PROXY_URL en el .env, como hace fetchRetry).

Importa porque el área es el denominador de la métrica central ($/m²): una prop
sin área no entra en ninguna mediana ni se puede comparar.
```

---

# 🌿 Mapa de ramas — qué hay sin integrar (12-ago-2026)

> Escrito al ordenar las ramas. **Nada de esto está en `main` ni pusheado.** Cada línea existe
> únicamente en la máquina del founder.
> 🔴 **Antes de crear una migración nueva, mirá la tabla de números de abajo.** El 12-ago aparecieron
> **dos migraciones 317 y tres 318**, escritas por sesiones que no se veían entre sí. Ya están
> repartidas; el próximo número libre es el **325**.

> ✅ **ACTUALIZADO AL CIERRE DEL 12-AGO: todo se mergeó, desplegó y pusheó**, menos preventa.
> Main está en GitHub, el working tree limpio, y la base y el repo dicen lo mismo.

| Rama | Qué es | Estado |
|---|---|---|
| `fix/bot-rpc-security-definer` | migs **320+321** | ✅ en main · aplicadas · **bot verificado respondiendo** |
| `fix/ssg-feeds-primera-pintura` (incluye `fix/zona-norte-lee-base-viva`) | los 4 feeds + ZN caído | ✅ en main · **desplegado y verificado en producción** |
| `worktree-fix-bsuid-crm-contactos` | migs **318**+319 · identidad del CRM | ✅ en main y desplegado · **la 318 aplicada + backfill 3/3**. 🔴 **La 319 NO** — ver abajo |
| `worktree-fix+tc-binance-captura` | mig **322** + capturador del TC | ✅ en main · aplicada · **el TC se refresca solo** (paso 0 del cron) |
| `worktree-feat+multiproyectos-feed-shadow` | migs **323+324** · folletos de preventa | ⏸️ **ÚNICA fuera de main, a propósito** — ver abajo |

### 🔢 Los números de migración, repartidos
`318-319` CRM/BSUID (**la 319 sin aplicar**) · `320-321` bot ✅ · `322` TC ✅ · `323-324` preventa
(sin aplicar) · `325` `buscar_similares` ✅. **Próximo libre: 326.**

### 🔴 Lo único pendiente con riesgo: la mig 319
Es la que hace que la identidad del CRM **deje de ser el teléfono**. NO es "cuando quieras":
tiene un **gate de 5 chequeos** en su encabezado, su **rollback es limitado** (volver a `NOT NULL`
solo se puede si todavía no entró ningún contacto sin teléfono) y **toca la alarma del bot**
(`simon_bot_incidentes.telefono` + `vigilar_bot_whatsapp()`). El código actual la tolera sin aplicar:
vuelve al camino por teléfono y lo dice por log. Detalle: memoria `project_crm_identidad_bsuid`.

### ⏸️ Proyectos de preventa — pausado, NO perdido
`worktree-feat+multiproyectos-feed-shadow` · último commit 9-ago · **2.343 líneas en 16 archivos**.

**Qué hace:** los avisos que publican un **proyecto entero** (folletos de preventa) hoy los aparta el
cargador a `proyectos_detectados` y **no se ven en ningún lado**. Esta rama los saca a la luz:
pestaña `/ventas/proyectos`, sheet con los avisos, lector de folletos y una pantalla de admin para
curarlos.

**Por qué no se descarta** (medido el 12-ago): la tabla tiene **225 avisos** acumulados desde el
10-jul, **+8 esta semana** (el último, hoy), **105 ya curados a mano** y **120 esperando**. El
sistema junta material para esto todas las noches y nadie lo mira.

**Por qué está en pausa:** aplicarla es *una jornada de trabajo dedicada* — decisión del founder,
12-ago. No es urgente.

**Ya se hizo lo peligroso:** sus migraciones se renumeraron a **323/324** (commit `88f7d9d`). Traía
una **317 propia que chocaba con la 317 de seguridad ya aplicada** — dos cosas distintas con el mismo
número: quien aplicara "la 317" sin mirar, aplicaba la otra. Esa bomba está desarmada.

**Cuando se retome:** renumeración ✅ hecha · falta revisar las 2.343 líneas (nadie las mira desde el
9-ago, y esta semana se vio lo que pasa al tocar vistas compartidas) · aplicar 323 y 324 · desplegar.

---

## Estado al cierre del 12-ago-2026

| Frente | Estado |
|---|---|
| Bot de WhatsApp | ✅ **responde** — migs 320+321+325, y ya hay **prueba diaria** (paso 6b del cron) |
| Zona Norte | ✅ **volvió** — 365 en venta, 103 en alquiler |
| Primera pintura de los 4 feeds | ✅ el HTML trae propiedades (24/8/24/8, antes 0) |
| CRM / BSUID | 🟡 paso 1 hecho y desplegado · **la 319 pendiente, con gate** |
| Tipo de cambio | ✅ al día (11,528) y **se refresca solo** cada noche |
| Ramas y worktrees | ✅ ordenados — 6 ramas viejas borradas, 115 MB liberados, **dos 317 y tres 318** repartidas |
| CLAUDE.md | ✅ corregido: decía 4 cosas que ya eran falsas (reglas #3 y #10 incluidas) |
| Proyectos de preventa | ⏸️ en pausa, registrado arriba |
| Prueba diaria del bot | ✅ hecha — ⚠️ corre **1 vez al día**; si se rompe a las 10 AM, se sabe a la 1 AM |

🔑 **La lección del día**: aparecieron **tres diagnósticos seguros y equivocados** — dos externos y
uno mío. Los tres tenían el síntoma bien y el mecanismo mal, y los tres se resolvieron igual:
**midiendo antes de aplicar**. El caso testigo: "resolver el TC una sola vez" habría dado 7,5% de
mejora sobre un problema que necesitaba 237×.

---

## Estado al 11-ago-2026, para ubicarse

| Frente | Estado |
|---|---|
| Seguridad (anon escribía las tablas) | ✅ cerrado — migs 317 + los 3 REVOKE de catálogos |
| Cutover TIEMPO 1 (archivar la vieja) | ✅ ejecutado, 4 evals en verde, 0 hallazgos no predichos |
| Candados (regla #1) | ✅ los cargadores los respetan al re-procesar |
| Admin PASO 1 (hablar el idioma del feed) | ✅ en main, 6 evals en verde |
| Admin PASOS 2 y 3 | ⬜ pendientes — ver arriba |
| Cutover TIEMPO 2 | 🟢 **desbloqueado (17-ago)** — las 5 condiciones cerradas o descartadas. Queda solo el trabajo del día: rename + atajo + 6 funciones + 53 puntos de código + capturas a mano |
| Arreglo del fallback ciego (`rpcShadowFirst`) | ✅ **17-ago, en prod** — ante una falla devuelve el error en vez de caer a la RPC vieja, que después del rename habría servido precios ~47% inflados sin avisar |
| CMA v1 · funnel premium | ✅ **apagados el 14-ago** — el CMA generaba informes sin comparables y cobraba el crédito; el funnel llevaba meses dormido |
| Remax sin área | ⬜ abierto, con la pregunta ya formulada |
| Topes de los feeds | ✅ subidos antes de que cortaran |

🔑 **La lección más reutilizable del día**: apareció **cinco veces** el mismo error —tratar "no
sabemos" como un número— en cinco lugares que nadie relacionaba. Y los tres hallazgos que evitaron
daño salieron de que el founder repreguntara, no de mi análisis. Ver la memoria
`feedback_verificado_no_es_exhaustivo`.
