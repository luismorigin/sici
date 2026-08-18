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
> Los logs de captura **se van appendeando** (varias corridas por archivo) → leer la sección de
> ARRIBA (la más reciente / la fecha de anoche). El log del audit se sobrescribe cada noche.
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
> `🔁 N con SLUG REESCRITO` (discovery) y `🔁 slug reescrito por C21: N/M viejas marcadas` (apply).
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

📌 Desde el 4-ago **la superficie 3 va a traer MENOS dedups**, y eso es esperado, no una regresión: la
republicación por slug reescrito ahora se resuelve en la captura. Lo que queda ahí son apart-hoteles y
republicaciones con códigos distintos.

### 3. (Opcional) Confirmar en BD — SOLO para verificar cifras
Si hace falta cotejar un número, usar las tablas **shadow**: `propiedades_v2`,
`market_absorption_snapshots_shadow`. **Nunca** tomar una fila reciente de `matching_sugerencias`
como resultado de la routine (es n8n/prod). La BD confirma, no reemplaza al log.

## Qué reportar (parte matutino)

1. **Estado de las 5 routines**: corrieron sí/no + una línea de resultado cada una. Si alguna de ZN todavía no está agendada, decirlo (no omitirla en silencio).
2. **Lo que necesita tu acción** (arriba de todo):
   - SQL del audit listo para aplicar (cuántos UPDATEs, qué hacen).
   - PM_NUEVO bloqueado esperando GPS del founder (con la pista del edificio).
   - Alertas recurrentes (ej. basura Santorini Ventura que vuelve cada noche → candidato a filtro
     en discovery; ver deuda del gate por URL vs id efímero).
3. **Salud general**: capturado, rechazado, multiproyecto, verificador, snapshot. Marcar cualquier
   cosa fuera de lo normal (disyuntor del verificador disparado, snapshot no escrito, gate con
   volumen raro).

**$0, read-only. Este comando NO aplica ningún SQL** — solo lee y resume. Lo que haya para aplicar,
lo aplica el humano.
