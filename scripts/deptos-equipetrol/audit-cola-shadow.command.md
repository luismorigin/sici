---
description: Audita MATCHING + DUPLICADOS del feed SHADOW del híbrido (venta + alquiler) — tres superficies: sin-match-con-nombre (PM_NUEVO/fuzzy), auto-matches riesgosos (nombre_unico_zona_dif) y duplicados (apart-hotel/republicación, agrupa por pm+precio+área). El .mjs filtra $0 SIN fetch (lee el anuncio ya guardado); el VEREDICTO de matching lo dan subagentes-lectores (juez), el dedup es determinístico. SQL contra propiedades_v2_shadow que aplica el humano. Read-only.
---

# /audit-cola-shadow — Audit de matching del feed SHADOW (híbrido)

> ⏰ **AGENDADO (21-jul-2026): corre SOLO todas las noches a la ~3:10 AM** como routine local
> (`~/.claude/scheduled-tasks/audit-cola-shadow-nocturno/`), **después** de los dos crons de captura
> (ventas ~1:17 · alquiler ~2:11) — audita lo que se cargó esa noche. Avisa por **Slack** con lo que
> quedó para aplicar. En la corrida agendada **NO aplica NADA** (nadie puede dar OK): deja el SQL escrito
> en `output/audit-cola-shadow-log.md`. **Las routines NO están en git** — viven en
> `~/.claude/scheduled-tasks/` de la máquina del founder; si está apagada, corre al siguiente arranque.
>
> **Fuente de verdad** de este comando. Copiar a `.claude/commands/audit-cola-shadow.md`
> (skills gitignored en `.claude/commands/`; el repo guarda el `.command.md`).
>
> **Port alineado de `/audit-cola-matching` al híbrido.** El doc `AUDITORIAS_POST_CUTOVER.md`
> §"/audit-cola-matching — MUDA DE TABLA": la cola `matching_sugerencias` NO existe para el híbrido
> (matchea en el `--apply`). El VALOR reutilizable no es la cola, es el patrón *leer el anuncio →
> subagente-lector JUEZ → cruce contra `proyectos_master`+GPS → SQL con candados*. Solo cambia de
> QUÉ se lee: en vez de la cola, las **dos superficies de shadow**.

## Principio rector (NO romper — heredado de la skill madre)

> **El `.mjs` es un FILTRO, no un juez. El juez es la lectura del anuncio por un subagente-lector LLM.**

Validado 19-jun sobre `pendiente_zona_norte`: el motor acertó 4/25 por nombre exacto; **16 falsos
positivos**, incluido un **score 95** (Galil Parque III, real = Galil Parque I). Aprobar por score mete
basura. El número/torre del cluster manda ("Stone 3"≠"III", "Uptown Drei"≠"Equipetrol"). Memorias:
`project_matching_zn_aprobacion_16jun2026`, `feedback_candado_formato_objeto`.

## Ventaja vs el audit-cola de prod

Shadow **ya guarda el anuncio que el reader juzgó** (`datos_json.contenido.descripcion`) → el juez lee
de ahí, **SIN re-fetch → $0 y sin riesgo de bloqueo de IP**. (Si el anuncio pudo haber cambiado desde la
carga, eso lo cubre el otro comando, `/audit-deptos-shadow`, que sí re-fetchea por drift.)

## Las tres superficies

1. **SIN MATCH con nombre** — `id_proyecto_master IS NULL AND nombre_edificio IS NOT NULL`
   (`metodo` sin_match/fuzzy_debil/ambiguo). Candidatos **PM_NUEVO** (595 Bloque La Salle, 3660 Hamburgo)
   o **fuzzy débil** (1674 Sky Collection). El `.mjs` ya trae los candidatos de `buscar_proyecto_fuzzy`.
2. **AUTO-MATCH RIESGOSO** — `datos_json.trazabilidad.metodo_match = 'nombre_unico_zona_dif'`
   (confianza 85: nombre único exacto pero **zona ≠**). Falsos positivos: Sky Luxury, Maré, Uptown Drei.
   El `.mjs` trae `pm_actual` + `dist_metros` prop↔pm → **priorizá por distancia**: `dist≈0` con mismo
   nombre = casi seguro correcto (solo cruza el borde de zona); `dist` grande (>300m) = revisar en serio.
3. **DUPLICADOS** (apart-hoteles / republicaciones) — el detector del pipeline NO los caza (cada aviso
   tiene código único). Reusa `dup-checks.mjs` de prod. **MEJORA shadow:** agrupa por **pm** cuando existe
   (más certero que el string del nombre — el pm ya matcheado deja el dedup servido), + precio + área, y
   compara descripciones (**≥90% = mismo aviso replicado**; descripciones distintas = unidades legítimas del
   mismo edificio, NO se tocan). **GUARDA POR PISO**: si dos avisos del mismo grupo declaran `piso` distinto,
   van a grupos separados y NUNCA se deduplican (aunque la desc sea ≥90%) — son unidades reales (caso Las Dalias
   324 piso1/325 piso5). Piso `null` = comodín (agrupan entre sí, no se pierden apart-hoteles sin piso declarado).
   $0, sin fetch (la desc ya está guardada). Caso canónico: MAI Suites (7 avisos, piso null).

## Flujo de ejecución (desde `scripts/deptos-equipetrol/`)

### 1. Correr la fase mecánica ($0, sin fetch)
```
node auditar-matching-shadow.mjs                 # ambas operaciones
node auditar-matching-shadow.mjs --op venta
node auditar-matching-shadow.mjs --op alquiler --limit 40
```
Escribe `output/audit-matching-shadow-<ts>.json` con `superficie_1` (+ `candidatos`) y `superficie_2`
(+ `pm_actual`/`pm_nombre`/`pm_zona`/`dist_metros`). Si ambas están en 0 → nada que auditar, reportá.

> **Superficie 3 (duplicados) es DETERMINÍSTICA** — no necesita juez. El `.mjs` ya trae los clusters
> (`sobreviviente` + `duplicados`). Confirmá por lectura los clusters de 2 y los de `área=0` (clave débil);
> los grandes (apart-hotel, ≥5 avisos idénticos) son seguros. SQL directo en el paso 4.

### 2. Lanzar el JUEZ — subagentes-lectores (superficies 1 y 2)
Agrupá cada superficie en lotes de ~6-8 y lanzá **subagentes `general-purpose` en paralelo** (varios en un
mensaje). Cada uno lee `descripcion_anuncio` + `titulo` + `pistas_nombre` (NO fetchea — ya está guardado):

> Sos auditor de matching inmobiliario en Santa Cruz. Leé el `titulo`+`descripcion` del anuncio y
> determiná el edificio EXACTO que nombra (con su **número/torre/romano** — "Macororó 13"≠"15",
> "Stone 3"≠"III", "Uptown Drei"≠"Uptown Equipetrol"). Veredicto por prop:
> - **Superficie 1** → **APROBAR(pm_candidato)** si el anuncio nombra ese edificio exacto y hay candidato
>   con score alto · **PM_NUEVO(nombre_real)** si nombra un edificio claro no cargado · **SIN_NOMBRE** si no.
> - **Superficie 2** → **CONFIRMAR** si el anuncio nombra el `pm_nombre` actual (número incluido) ·
>   **CORREGIR(otro pm)** si nombra OTRO · **RECHAZAR** si el anuncio no nombra ese edificio (FP).
> Atractores (NO confiar en nombre único): "CONDOMINIO ONE", "Sky…", "Brickell". Devolvé tabla:
> `prop_id | superficie | pm sugerido/actual | nombre_real | veredicto | cita textual`.

### 3. Cruzar CORREGIR/PM_NUEVO contra `proyectos_master` (MCP `postgres-sici`, read-only)
Igual que la skill madre: por cada `nombre_real`, `SELECT ... FROM proyectos_master WHERE nombre_oficial
ILIKE ANY(...)` + verificar `dist` prop↔pm-candidato. Nombre + GPS combinados mandan; el GPS roto del
portal NO bloquea un nombre explícito (matchear por nombre igual). PM_NUEVO = `gps_verificado_visual='si'`
solo tras verificación humana (el founder da el GPS en Google Maps). NO inventar GPS.

### 4. Generar el SQL — contra `propiedades_v2_shadow` (NO aplicar; el humano lo corre)
- **Candado `AND id_proyecto_master IS NULL`** en cada UPDATE de superficie 1 (no pisa lo ya correcto).
- Superficie 2 CORREGIR/RECHAZAR: `UPDATE propiedades_v2_shadow SET id_proyecto_master=<nuevo|NULL>` +
  **candado formato-OBJETO** si es cluster numerado (un string NO protege, `feedback_candado_formato_objeto`):
  ```sql
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'id_proyecto_master', jsonb_build_object('bloqueado',true,'por','auditor_cola_shadow',
       'fecha','<YYYY-MM-DD>','razon','cluster numerado','valor_original',id_proyecto_master))
  ```
- `metodo_match` (en `datos_json.trazabilidad`) → dejar traza `auditor_cola_shadow_<fecha>`.
- **Superficie 3 (dedup):** `UPDATE propiedades_v2_shadow SET duplicado_de=<sobreviviente>, fecha_actualizacion=NOW()
  WHERE id IN (<duplicados>)`. La vista filtra `duplicado_de IS NULL` → salen del feed. **Reversible** (`=NULL`).
  Confirmá por lectura los clusters de 2 antes de aplicar; los apart-hotel grandes son directos.
  ⚠️ **El `.mjs` ya ignora props con `duplicado_de` heredado de prod** (si no, marcaría un sobreviviente ya
  elegido → CICLO A↔B → el edificio se oculta entero; bug cazado 14-jul, Santorini/Lofty). No re-introducir
  props ya deduplicadas al cluster.
- Temp tables con VALUES multilínea para listas de IDs. Cerrar con SELECT de verificación; el humano
  hace COMMIT/ROLLBACK. **PM_NUEVO**: si el catálogo es prod (read-only en fase shadow), los alias/PM
  nuevos se REGISTRAN para el cutover — NO se escriben a `proyectos_master` ahora (invariante shadow).

### 5. Reportar + preguntar + **avisar por Slack**
Tabla ejecutiva: `prop | superficie | pm sugerido/actual | veredicto | pm final | evidencia`. Totales por
veredicto. **NUNCA aplicar UPDATEs sin OK.** Ofrecé correr con `ROLLBACK` primero; pedí los GPS de los
PM_NUEVO al founder. Log en `output/audit-cola-shadow-log.md`.

**Y mandá el aviso a Slack:**
```
node notificar-slack.mjs "<resumen>"
```
> ⚠️ **Acá el aviso importa MÁS que en el cron.** El cron escribe a shadow solo (su trabajo queda hecho
> aunque nadie mire); **la salida de este audit es 100% pendientes del humano** — SQL que alguien tiene
> que aplicar. Si corre de noche y nadie lo ve, **la cola crece en silencio y el matching se degrada**.

El mensaje debe decir **qué hay para aplicar y dónde**:
- **🔔 con pendientes** — `🔔 *Audit cola shadow* · N revisados` + `X corregir · Y PM_NUEVO · Z alias` +
  **dónde está el SQL** (`output/audit-cola-shadow-log.md`) + si hay PM_NUEVO, que **faltan los GPS del
  founder** (los bloquea).
- **✅ sin pendientes** — `✅ Audit cola shadow · N revisados · nada que aplicar`. Decirlo **explícitamente**:
  sin esto no se distingue "corrió y está limpio" de "no corrió".

## Reglas (heredadas + propias de shadow)
1. **Score/nombre-único ≠ juez.** El número del cluster y la lectura mandan. `nombre_unico_zona_dif` con
   dist grande = sospechoso; con dist≈0 = casi seguro OK (pero igual lo lee el juez).
2. **Candado `IS NULL` imprescindible** (superficie 1) + **formato-objeto** (superficie 2 clusters).
3. **SIN_NOMBRE → sin match** es correcto (mejor que un FP).
4. **SHADOW, read-only.** El `.mjs` no escribe; el SQL va contra `propiedades_v2_shadow`; a prod solo
   SELECT + RPC. PM/alias nuevos se registran para el cutover, no se escriben a prod.
5. **El juez lee el anuncio GUARDADO** (no re-fetch). El drift lo cubre `/audit-deptos-shadow`.

## Relación con las otras skills
- **`/audit-deptos-shadow`** = drift + cambio de precio en portal (re-fetch). Este = matching (sin fetch).
  Complementarios: corré este PRIMERO (matching sano) y el de drift después.
- **`/audit-cola-matching`** (prod) = la skill madre, sigue viva para macrozonas en n8n.
- Contexto: `AUDITORIAS_POST_CUTOVER.md` + memoria `project_checkpoint_deptos_hibrido`.
