---
description: Parte matutino de las routines nocturnas del híbrido — lee los LOGS de las 3 routines (captura venta + captura alquiler + audit cola shadow), no la BD. Resume qué se capturó, qué rechazó el gate, multiproyecto, verificador, snapshot y pendientes del audit; y marca lo que necesita acción del founder. $0, read-only.
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

Y **son TRES routines, no solo el audit.** El hallazgo del 23-jul (9 rechazados por gate que
reaparecen cada noche — Santorini Ventura + operación mal tipeada) estaba en el log de **captura**,
no en el del audit. Si solo se mira el audit, se pasa.

## Las 3 routines nocturnas (scheduled-tasks) y su log

| Routine (scheduled-task) | Hora | Log a leer (`scripts/deptos-equipetrol/output/`) |
|---|---|---|
| `cron-deptos-equipetrol` (captura VENTA → shadow) | 01:17 | `cron-deptos-ventas-log.md` |
| `cron-deptos-alquiler-nocturno` (captura ALQUILER → shadow) | 02:11 | `cron-deptos-alquiler-log.md` |
| `audit-cola-shadow-nocturno` (audit matching + dedup) | 03:10 | `audit-cola-shadow-log.md` |

> Corren en cadena (captura → captura → audit). El audit lee lo que se cargó esa noche.
> Los logs de captura **se van appendeando** (varias corridas por archivo) → leer la sección de
> ARRIBA (la más reciente / la fecha de anoche). El log del audit se sobrescribe cada noche.
> (Si algún día se agenda `cron-casas` como routine nocturna, sumar su log; hoy no está agendada.)

## Pasos

### 1. Confirmar que las 3 corrieron
Listar `scheduled-tasks` y verificar `lastRunAt` de las 3 (que sea de esta madrugada).
Si alguna NO corrió → eso es lo primero a reportar (routine caída).

### 2. Leer los 3 logs (fuente de verdad)
Leer la entrada más reciente de:
- `output/cron-deptos-ventas-log.md`
- `output/cron-deptos-alquiler-log.md`
- `output/audit-cola-shadow-log.md`

De cada log de **captura** extraer: escritos a shadow · **rechazados por gate** (y por qué:
operación mal tipeada / basura estructural / etc.) · **multiproyecto** desviados a
`proyectos_detectados` · verificador (bajas / revividas / disyuntor) · snapshot shadow (5c) OK.

Del log del **audit** extraer: superficies 1/2/3 · veredictos (APROBAR / CONFIRMAR / CORREGIR /
RECHAZAR / DEDUP / PM_NUEVO) · **SQL listo para aplicar** · bloqueos (PM_NUEVO que espera GPS del founder).

### 3. (Opcional) Confirmar en BD — SOLO para verificar cifras
Si hace falta cotejar un número, usar las tablas **shadow**: `propiedades_v2_shadow`,
`market_absorption_snapshots_shadow`. **Nunca** tomar una fila reciente de `matching_sugerencias`
como resultado de la routine (es n8n/prod). La BD confirma, no reemplaza al log.

## Qué reportar (parte matutino)

1. **Estado de las 3 routines**: corrieron sí/no + una línea de resultado cada una.
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
