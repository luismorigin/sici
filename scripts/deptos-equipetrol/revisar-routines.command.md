---
description: Parte matutino de las routines nocturnas del híbrido — lee los LOGS de las 5 routines (captura venta+alquiler de Equipetrol y de Zona Norte + audit cola shadow), no la BD. Resume qué se capturó, qué rechazó el gate, multiproyecto, verificador, snapshot y pendientes del audit; y marca lo que necesita acción del founder. $0, read-only.
---

# /revisar-routines — Parte matutino de las routines nocturnas

> **Fuente de verdad** de este comando. Copiar a `.claude/commands/revisar-routines.md`
> (las skills viven gitignored en `.claude/commands/`; el repo guarda el `.command.md`).

## Por qué existe (la lección del 23-jul-2026)

Cuando Lucho pide "revisar las routines / cómo salió lo de anoche", **la fuente de verdad es el LOG
de cada routine, NO la base de datos.** El 23-jul se cazó el anti-patrón: ir directo a
`matching_sugerencias` y mostrar 5 filas `pendiente` que en realidad eran un **batch de n8n/PROD**
(régimen viejo, `propiedades_v2`) — data que **nadie ve** (el feed de Equipetrol lee shadow desde
21-jul). La routine `audit-cola-shadow` es **read-only y NO escribe en `matching_sugerencias`**:
deja su veredicto en un log de archivo. En la BD, shadow y n8n/prod conviven y se mezclan justo ahí.

**Regla de oro de este comando: LOGS primero, BD solo para confirmar cifras puntuales.**
Ver memoria `feedback_routines_leer_log_no_bd`.

Y **son CINCO routines, no solo el audit.** El hallazgo del 23-jul (9 rechazados por gate que
reaparecen cada noche — Santorini Ventura + operación mal tipeada) estaba en el log de **captura**,
no en el del audit. Si solo se mira el audit, se pasa.

## Las 5 routines nocturnas (scheduled-tasks) y su log

| Routine (scheduled-task) | Hora | Log a leer (`scripts/deptos-equipetrol/output/`) |
|---|---|---|
| `cron-deptos-equipetrol` (captura VENTA Eq → shadow) | 01:17 | `cron-deptos-ventas-log.md` |
| `cron-deptos-alquiler-nocturno` (captura ALQUILER Eq → shadow) | 02:11 | `cron-deptos-alquiler-log.md` |
| `cron-deptos-ventas-zn` (captura VENTA **Zona Norte**) | 02:46 | `cron-deptos-ventas-zn-log.md` |
| `cron-deptos-alquiler-zn` (captura ALQUILER **Zona Norte**) | 04:11 | `cron-deptos-alquiler-zn-log.md` |
| `audit-cola-shadow-nocturno` (audit matching + dedup, **las 2 zonas**) | 04:53 | `audit-cola-shadow-log.md` |

> 📌 **Esta tabla es la ÚNICA fuente de horarios.** Los demás `.command.md` declaran su **orden**
> relativo, no la hora — el mismo número repetido en 6 archivos se desincroniza solo (pasó el 31-jul:
> tres de ellos quedaron con horarios tentativos que nunca se usaron). El dato vivo está en
> `scheduled-tasks` (listalas para ver `nextRunAt`/`lastRunAt` reales); esta tabla es el mapa
> routine ↔ log, que es lo que este comando necesita.
> ⚠️ Los horarios llevan un **jitter** de varios minutos que asigna el runtime, así que "01:17" es
> el cron 01:07 + su jitter. No te alarmes si el log dice un minuto distinto.

> 🔴 **Son CINCO desde que ZN entró al híbrido (30-jul-2026), y cada zona tiene su log propio.**
> Leer solo los 3 de Equipetrol deja Zona Norte invisible — exactamente el error que se cazó el 30-jul
> en el audit nocturno (`project_audit_nocturno_no_ve_zona_norte`): lo no mirado se lee como limpio.
> Si las routines de ZN todavía no están agendadas, **decilo en el parte** en vez de omitirlas.

> Corren en cadena (captura → captura → audit). El audit lee lo que se cargó esa noche.
>
> 🔴 **BUSCÁ LA ENTRADA POR SU FECHA, NUNCA POR SU POSICIÓN.** Esta línea decía "leer la sección de
> ARRIBA" y "el log del audit se sobrescribe cada noche": **las dos cosas son falsas**. Todos los logs
> se appendean, y **no todos por el mismo lado** — el 19-ago la entrada del día en
> `cron-deptos-alquiler-log.md` estaba en la **línea 2218**, con la del 18 arriba de todo, y el log del
> audit acumula sus entradas al FINAL. Leer "la de arriba" reporta la noche equivocada, y eso no se
> nota: los números son plausibles.
> 👉 En cada log: `grep -n "^## <AAAA-MM-DD de hoy>"`. **Si un log no tiene entrada de hoy, esa
> routine no corrió** — y eso es lo primero del parte, no un detalle.
> (Si algún día se agenda `cron-casas` como routine nocturna, sumar su log; hoy no está agendada.)

## Pasos

### 1. Confirmar que corrieron — y EN QUÉ ORDEN
Listar `scheduled-tasks` y verificar `lastRunAt` de cada una. Si alguna NO corrió → eso es lo primero
a reportar (routine caída).

🔴 **`lastRunAt` NO alcanza: comparar los HORARIOS que declaran los LOGS entre sí.** El 30-jul-2026 la
routine de ventas mostraba `lastRunAt` 01:17 (a horario) pero su log decía que había arrancado
**06:27 local, 5 h 10 tarde** — y el audit, puntual a las 03:11, corrió **antes que la captura**: las
3 props de esa noche no pasaron por ninguna superficie del audit. El `lastRunAt` no lo delata; el log sí.
👉 Si una captura corrió DESPUÉS del audit, **decilo en el parte y ofrecé re-correr el audit**
(`/audit-cola-shadow`), que es read-only y $0.

### 2. Leer los 5 logs (fuente de verdad)
Leer la entrada más reciente de:
- `output/cron-deptos-ventas-log.md` (Equipetrol venta)
- `output/cron-deptos-alquiler-log.md` (Equipetrol alquiler)
- `output/cron-deptos-ventas-zn-log.md` (**Zona Norte** venta)
- `output/cron-deptos-alquiler-zn-log.md` (**Zona Norte** alquiler)
- `output/audit-cola-shadow-log.md` (audit, las 2 zonas)

De cada log de **captura** extraer: escritos a shadow · **rechazados por gate** (y por qué:
operación mal tipeada / basura estructural / etc.) · **multiproyecto** desviados a
`proyectos_detectados` · verificador (bajas / revividas / disyuntor) · snapshot shadow (5c) OK ·
🔁 **slug reescrito por C21 / deduplicadas** (PR #64, 4-ago-2026).

> 🔁 **Por qué el slug reescrito va en el parte:** C21 reescribe la URL de un aviso cuando el captador
> lo edita (típicamente **baja el precio**). El discovery lo caza por el código y el cargador marca la
> versión vieja como duplicada — o sea, **una fila sale del feed sin que nadie lo haya pedido**. Es una
> mutación silenciosa: si no se reporta, nadie se entera. Buscá en el log de captura
> `🔁 N con SLUG REESCRITO` (discovery) y `🔁 slug reescrito por el portal: N/M viejas marcadas` (apply).
> 🆕 **28-ago-2026 · TAMBIÉN REMAX, y por eso el log ya NO dice "por C21".** El mecanismo estaba
> limitado a C21 por una línea del discovery, y Remax hace lo mismo: cambió el slug de
> `venta-departamento-<cod>` a `venta-departamento-santa-cruz-de-la-sierra-<zona>-<cod>` y los
> avisos re-entraron como NUEVOS. Encontrado a mano el 28-ago: **1728 ($188.000) y 8000799
> ($180.000)**, el mismo depto, descripción con md5 idéntico, **los dos vivos en el feed**.
> 🔑 **Ninguna superficie del audit puede ver esto**: la 3 agrupa por PRECIO (y el precio es justo
> lo que cambió) y la 7 exige >30% de brecha y mismo edificio. La única evidencia es el código.
> Medido sobre las 1.802 filas: el extractor cubre **100% de C21 y 100% de Remax**, da 19 grupos
> con código repetido y **cero falsos positivos**. El código de Remax son DOS partes,
> `<listado>-<unidad>`: los tres Berchatti comparten listado y se distinguen por `-15/-16/-17`,
> que son tres departamentos distintos.
> ⚠️ Si alguna dice **`cambió de zona (X → Y), revisar`**, subilo al parte: es raro y puede ser un error
> de zona en el aviso.
> 📉 **Y es señal de mercado, no solo de higiene**: un slug reescrito = aviso editado, y en 3 de los 5
> casos medidos el 4-ago **el precio había bajado** (Lofty Island −28%, Torre Ara −7%, Vertical Terra −11%).

Del log del **audit** extraer: superficies 1/2/3/4/5/6/7 · veredictos (APROBAR / CONFIRMAR / CORREGIR /
RECHAZAR / DEDUP / PM_NUEVO) · **SQL listo para aplicar** · bloqueos (PM_NUEVO que espera GPS del founder).

> 🏗️ **Superficie 6 — el edificio se contradice sobre su estado de obra** (6-ago-2026). Nació de que el
> founder vio **HH Once** publicado a la vez como *preventa* y como *entrega inmediata* en el mismo feed.
> **Va al parte aunque la regla ya lo haya resuelto**, y por una razón: la mig 315 lo deja en "entregado"
> por presunción (un edificio no vuelve al pozo), y lo que se necesita del founder es **sellarla** con un
> dictado — o corregirla. Sin el sello, el mismo edificio vuelve todas las noches.
> Buscá en el log del audit `Superficie 6` y reportá: cuántos edificios, cuántas props, y **cuáles
> necesitan dictado**. Los `conflicto_cruzado` (todos los avisos dicen preventa pero hay alquiler activo)
> son los que la regla NO toca: esos **sí o sí** esperan una decisión humana.
> ⚠️ Si el log dice *"Superficie 6 sin memoria: la mig 315 no está aplicada"*, **subilo al parte**: el
> audit no puede saltear los ya dictados y la lista se va a repetir entera.
> 💸 **Superficie 7 — el mismo depto a dos precios que no pueden ser los dos ciertos** (8-ago-2026).
> Mismo edificio + misma área + mismo captador, con más de **30%** de diferencia. Salió de Sky Eclipse:
> un aviso a **$84.000 contra $165.948** de sus gemelos estuvo **5 semanas** tirando abajo la mediana de
> Equipetrol Centro. **REPORTA, NO DECIDE** — no dice cuál precio es el bueno. Si aparece, subilo al
> parte con el grupo completo: lo que hay que hacer es **leer los avisos** y decidir cuál está mal.
> 🔑 El dedup NO puede cazar estos casos y no es un bug: **el precio es parte de su clave de grupo**,
> así que dos avisos del mismo depto con precios distintos nunca se comparan.

> 🗺️ **Superficie 10 — la prop y su EDIFICIO en macrozonas distintas** (20-ago-2026). Un edificio no
> está en dos macrozonas: si la prop dice Zona Norte y su pm es de Equipetrol, **uno de los dos está
> mal**, y casi siempre es la prop — su `zona` la escribe el cargador desde el GPS del aviso, que a
> menudo es el pin genérico del portal. No falla, no avisa, y esa prop **alimenta la mediana de una
> microzona donde no está**.
> 🔑 **Reportá la DISTANCIA, no solo el conteo**: en el estreno los 3 casos no eran equivalentes —
> 99 m y 308 m son borde de macrozona (plausible), pero **5.089 m es un error real**. Un parte que diga
> "3 casos" sin la distancia los hace parecer iguales.
> ⚠️ Y no la confundas con la superficie 5: la 5 mide metros y **queda ciega cuando el pin es genérico**
> (ahí la distancia se anula a propósito); la 10 ve igual porque compara macrozonas. Son complementarias.

> 🏷️ **Los alias sugeridos ya vienen filtrados** (20-ago-2026). El cargador los cruza contra el catálogo
> y descarta los `YA_CARGADO` / `REDUNDANTE` / `AMBIGUO` / `MATCH_RIESGOSO`, declarando cada descarte con
> su motivo. Antes llegaban en crudo y **más de la mitad no servía** (30 propuestos en 3 noches, 15
> útiles). 👉 Si el log de captura muestra descartes, **contalos en una línea y no los repitas uno por
> uno** — lo que va al parte son los que quedaron.

📌 Desde el 4-ago **la superficie 3 va a traer MENOS dedups**, y eso es esperado, no una regresión: la
republicación por slug reescrito ahora se resuelve en la captura. Lo que queda ahí son apart-hoteles y
republicaciones con códigos distintos.

### 3. (Opcional) Confirmar en BD — SOLO para verificar cifras
Si hace falta cotejar un número: la tabla viva es **`propiedades_v2`** (el rename del TIEMPO 2, 17-ago)
y la serie es `market_absorption_snapshots_shadow`. 🔴 **`propiedades_v2_shadow` YA NO EXISTE** — se
borró el 20-ago y cualquier query a ese nombre falla, que es lo correcto. Las **vistas** de mercado sí
conservan el sufijo: `v_mercado_venta_shadow` / `v_mercado_alquiler_shadow` (las gemelas sin sufijo
apuntan al archivo congelado del 27-jul y **no dan error: sirven datos viejos**). **Nunca** tomar una fila reciente de `matching_sugerencias`
como resultado de la routine (es n8n/prod). La BD confirma, no reemplaza al log.

## Qué reportar (parte matutino)

> 🎯 **El parte se escribe para que Lucho ACTÚE, no para que se entere.** Las tres reglas de abajo
> salieron de medir tres partes seguidos (18, 19 y 20-ago): en los tres tuvo que pedir a mano lo mismo
> — *"dame el SQL por acá"*, *"qué vale la pena hacer realmente"* — y dos veces corrió un bloque que
> no aplicó nada porque terminaba en `ROLLBACK`.

1. **Estado de las 5 routines**: corrieron sí/no + una línea de resultado cada una. Si alguna de ZN
   todavía no está agendada, decirlo (no omitirla en silencio).
   🆕 **Leé la línea de alcance que ahora imprime el audit** (`✅ Las 4 capturas de hoy dejaron log`
   o `🔴 ALCANCE INCOMPLETO — N de 4 capturas sin log`). Si está incompleta, **su "0 superficies" no
   cubre la noche**: decilo y re-corré el audit, que es read-only y $0.

2. **Lo que necesita tu acción** (arriba de todo):
   - 🔗 **TODO id que aparezca en el parte va con la URL de su anuncio, clickeable.** Un id suelto
     obliga a ir a buscar el aviso a mano, y **casi todo veredicto se toma leyendo el anuncio**:
     "¿es una casa mal tipificada?", "¿el precio bajo es real o es la moneda?", "¿este edificio es
     el de Beni o el de Banzer?". El link es parte del hallazgo, no un adorno.
     Formato: `**8001008** (Baruc Norte) — https://c21.com.bo/propiedad/118870_...`
     Desde el 20-ago el `.mjs` del audit ya la imprime junto al id (`🔗`) en las 6 superficies que
     listan props; si falta, sale de `propiedades_v2.url`.
   - 🔴 **PEGÁ EL SQL EN EL CHAT, no la ruta del archivo.** Decir "está en `output/…sql`" obliga a
     pedirlo. Pasó los 3 días seguidos.
   - 🔴 **Verificá el SQL contra la base ANTES de pasarlo, y entregalo con `COMMIT` puesto.** Las
     plantillas del audit terminan en `ROLLBACK` para que un humano revise — pero si vos ya
     comprobaste que las filas están como el audit las vio, dejar el `ROLLBACK` solo agrega una
     ronda: el 19 y el 20 corrió el bloque, no cambió nada, y hubo que descubrir por qué. Entregalo
     con `COMMIT` y decí **qué tiene que ver en el `SELECT` final** para saber que salió bien.
   - PM_NUEVO bloqueado esperando GPS (con la pista del edificio: dirección y referencias del aviso).
   - Alertas recurrentes (ej. basura que vuelve cada noche → candidato a filtro en discovery).

3. **Salud general**: capturado, rechazado, multiproyecto, verificador, snapshot. Marcar lo que esté
   fuera de lo normal (disyuntor disparado, snapshot no escrito, gate con volumen raro).
   🆕 **Y los TIEMPOS de la cadena**: si un lector del MOAT tardó más de 10 min o un discovery abortó,
   va al parte. El 19 y el 20 los lectores se colgaron 60 y 80 minutos, estiraron la cadena ~2,5 h y
   por eso el audit terminó corriendo antes que la última captura. El síntoma no estaba en ningún
   número de propiedades: estaba en el reloj.

4. 🆕 **Cerrá con un ranking de esfuerzo/impacto, no con una lista plana.**
   🔴 **Ningún pendiente se recomienda sin su número medido.** El 20-ago se recomendó arreglar el prep
   diciendo "se está tirando la fuente más barata que hay"; al medirlo, **recuperaba 2 propiedades**.
   Y un barrido de "19 edificios sin zona" resultó ser **1**: los otros 18 estaban legítimamente fuera
   de cobertura. Medí primero, recomendá después, y decí explícitamente **qué NO vale la pena hacer**.

**$0, read-only. Este comando NO aplica ningún SQL** — solo lee, mide y resume. Lo que haya para
aplicar, lo aplica el humano.
