---
description: Auditoría del feed SHADOW del híbrido (venta + alquiler) — re-lee el anuncio HOY vs lo guardado (drift + cambio de precio en portal + matching), y manda los sospechosos a subagentes-lectores (juez). $0, read-only. Cierra el punto ciego del híbrido (lee el anuncio una sola vez).
---

# /audit-deptos-shadow — Auditoría del feed SHADOW (venta + alquiler)

> **Fuente de verdad** de este comando. Copiar a `.claude/commands/audit-deptos-shadow.md`
> (las skills viven gitignored en `.claude/commands/`; el repo guarda el `.command.md`).
>
> **Qué es:** re-lee el anuncio de cada prop del **feed shadow** y lo compara contra lo que el
> híbrido guardó, para cazar lo que el pipeline no ve. **$0, 100% read-only** (no muta nada).
> El VEREDICTO de los sospechosos lo dan **subagentes-lectores** (patrón `/audit-cola-matching` +
> `/cron-deptos-*`), NUNCA el script. Gemelo conceptual: `/cron-deptos-ventas` (captura) — esto
> **audita** lo ya cargado.

## Por qué existe (el punto ciego del híbrido)

El híbrido lee la descripción **una sola vez** (el reader = el MOAT) y el cargador excluye lo ya
cargado → **nunca re-mira**. Pero el anunciante deja la **misma URL y el mismo precio de cabecera**
y edita **solo la descripción**: baja el precio en el texto, pone "REBAJA", cambia
`disponible→reservado/vendido`, cambia condiciones. El discovery nocturno no ve nada → el veredicto
del reader queda **congelado y viejo** en el feed. n8n cubría esto por fuerza bruta (re-enrichment
nocturno, caro); el híbrido no tiene ese mecanismo → esta skill **es** ese mecanismo (el drift decide
QUÉ re-leer, así solo se paga el reader en las pocas que cambiaron). Diseño:
`AUDITORIAS_POST_CUTOVER.md` §Gap del híbrido.

**No reusa `/audit-feed-ventas-mensual-fetch`** porque esa está atada a **prod** (`v_mercado_venta` +
`datos_json_enrichment`) y al **TC viejo** (`9.954`/`1.43` hardcodeado, tags viejos). Correrla contra
shadow leería NULL y "todo pasa" sin revisar nada (ruptura silenciosa #1). Esta skill lee la columna
correcta (`datos_json.contenido.descripcion`) y **no clasifica TC en el script** — el juez re-clasifica
con `READER_SPEC` (que sí conoce `oficial_viejo`/`bob`).

## Alcance / gate

- Es **pre-cutover** y valida shadow **vs el ANUNCIO**, no vs prod ([[project_gate_cutover_deptos_no_es_comparar_prod]]).
- Read-only: el SQL de corrección se **sugiere**, lo aplica el humano (contra `propiedades_v2_shadow`).
- La detección determinística de **cambio de precio** necesita `datos_json.senales_portal` (baseline
  del portal al cargar). Filas viejas cargadas antes de que existiera ese campo → sin baseline: igual
  van al juez por drift/matching, y el juez ve `anuncio_hoy` + la decisión shadow (números a la vista).

## Pasos (desde `scripts/deptos-equipetrol/`)

### 1. Correr el auditor determinístico (fetch $0, read-only)
```
node auditar-shadow.mjs --op venta            # todo el shadow de venta
node auditar-shadow.mjs --op alquiler --limit 40
node auditar-shadow.mjs --op venta --ids 3519,3540   # ids puntuales
```
Para cada fila shadow: re-fetchea el anuncio (`fetchDetalleDepto`), calcula **drift** de descripción
(`similarity.mjs`: bucket + flags semánticos), **cambio de precio en portal** (crudo de hoy vs el
`senales_portal` guardado, umbral 1% graduado), y **matching-lite** (¿el `nombre_edificio` aún aparece
en el anuncio?). Escribe `output/audit-shadow-<op>-<ts>.json` con el array `material` = solo los
**sospechosos** (drift fuerte / cambio de precio / matching / flag semántico) con `veredicto_audit: null`.
- Circuit breaker (🛑) → IP bloqueada, **no insistas**, reintentá en horas. Pausa+jitter entre requests.
- El resumen impreso ya te da el panorama: buckets de drift, cambios de precio, matching sospechoso,
  sin-match-con-nombre, y **posibles bajas** (fetch falló → cruzar con `verificador-deptos/alquiler.mjs`).

### 2. MOAT — el juez (subagentes-lectores en paralelo)
Leé el `output/audit-shadow-<op>-<ts>.json`. Dividí el array `material` en chunks de ~10 y lanzá
**N subagentes en paralelo**. Cada subagente:
- Lee su chunk + **`READER_SPEC.md`** (venta) / **`READER_SPEC_ALQUILER.md`** (alquiler).
- Para cada entrada, re-lee `anuncio_hoy.descripcion` + `anuncio_hoy.senales` y lo contrasta con la
  decisión actual en `shadow` (precio/TC/dorms/nombre/estado/condiciones).
- Llena `veredicto_audit`:
  ```json
  { "sigue_valido": true|false,
    "correccion": { "precio_usd": 70000, "tipo_cambio_detectado": "paralelo", "estado_construccion": "...", "nombre_edificio": "...", "dormitorios": 1 },
    "nota": "por qué (cita el texto del anuncio de hoy)" }
  ```
  `sigue_valido:true` → nada que hacer. `false` → `correccion` trae SOLO los campos que cambian.
- **`motivos`** de cada entrada te dice qué disparó la revisión (drift / precio / nombre_no_aparece).

### 3. Reportar + SQL sugerido (read-only)
Con los `veredicto_audit` mergeados, armá el reporte ejecutivo:
- **🔴 Correcciones confirmadas** (precio/TC/estado cambió en el anuncio) → `UPDATE propiedades_v2_shadow
  SET ... , fecha_actualizacion=NOW() WHERE id=X;` (+ refrescar `datos_json.contenido.descripcion` con la
  de hoy, para que no reaparezca en cada corrida — mismo patrón §4.5 de la mensual).
- **💀 Posibles bajas** (fetch falló) → cruzá con el verificador; NO das de baja acá (el verificador es la
  autoridad, con 2 señales + gracia 2d).
- **🏷️ Matching sospechoso** (nombre no aparece / sin-match-con-nombre) → juez decide ALIAS vs MISMATCH vs
  PM_NUEVO (mismo criterio que `/audit-cola-matching`); candar `id_proyecto_master` si es cluster numerado.
- **Preguntá al usuario** antes de aplicar cualquier `UPDATE`. NUNCA mutar sin OK.

Registrá una línea en `output/audit-shadow-log.md` (fecha + op + números).

## Reglas
- **SHADOW, read-only.** El `.mjs` no escribe nada. El SQL de corrección va contra `propiedades_v2_shadow`
  y lo aplica el humano. Cero escritura a prod.
- **El juez manda, no el script.** El `.mjs` detecta (drift/precio/matching); el VEREDICTO lo dan los
  subagentes-lectores con `READER_SPEC`. El script nunca decide precio/TC/estado.
- **No clasifica TC** (esquiva el `9.954` hardcodeado): emite el crudo del portal, el juez re-clasifica.
- **Lee la columna correcta** (`datos_json.contenido.descripcion`), no `datos_json_enrichment` (que en el
  híbrido está vacío → leerlo daría verde falso).
- **Anti-bloqueo IP** (`fetcher.mjs`): pausa+jitter + circuit breaker (5 fallos). 🛑 → esperá.

## Pendientes / futuro
- **Loop de re-lectura automática:** hoy el drift señala QUÉ re-leer y el juez lo hace en sesión. El
  camino al cutover es que las correcciones confirmadas se apliquen por API (`reader-api.mjs`).
- **Persistencia histórica:** hoy solo escribe el JSON de la corrida. Al cutover se puede enganchar a
  `audit_descripciones_*` (mig 242/267) para tendencia de drift, como la mensual de prod.
- **Bajas:** este audit solo las FLAGEA; la baja la confirma `verificador-deptos/alquiler.mjs` (2 señales).
- Contexto: `AUDITORIAS_POST_CUTOVER.md` (mapa de alineación al cutover) + memoria `project_checkpoint_deptos_hibrido`.
