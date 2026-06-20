---
description: Audita la cola de matching (matching_sugerencias pendiente_<macrozona>) ANTES de aprobar, leyendo el anuncio real. El .mjs filtra y fetchea; el VEREDICTO de los dudosos lo dan subagentes-lectores (juez LLM), NUNCA el script. Genera SQL (aprobar/corregir/rechazar/pm-nuevo) para que el humano lo aplique. Read-only. Multi-macrozona.
---

# Audit de cola de matching — `/audit-cola-matching`

Audita las sugerencias atascadas en `matching_sugerencias.estado='pendiente_<macrozona>'` (la cola HITL del piloto multi-macrozona, mig 254/259) **antes** de aprobarlas. Distinto de las skills `/audit-feed-*`: aquellas auditan el **feed** (props ya matcheadas, buscan falsos positivos); ésta audita la **cola** (props sin match, decide el match correcto).

## Principio rector (NO romper)

> **El `.mjs` es un FILTRO, no un juez. El juez es la lectura del anuncio por un subagente-lector LLM.**

El script `audit-cola-matching.mjs` hace solo lo mecánico y barato: trae la cola, fetchea el anuncio real (C21 `?json=true` / Remax `data-page` — robusto, NO usa WebFetch que falla con la SPA de Remax) y pre-clasifica con token/GPS/atractor para **ordenar** la cola. **No decide ningún match.** El veredicto lo das vos (Claude) lanzando subagentes que LEEN el `descripcion_anuncio`/`titulo_anuncio` ya extraído. Si esto se degradara a "el script clasifica y escupe SQL", se vuelve el bug del score-como-juez que esta skill existe para evitar (auditando ZN jun-2026, leer el anuncio cazó 16 FP del motor que el score 90-95 nunca habría detectado).

## Por qué importa (evidencia)

Validado ad-hoc 19-jun-2026 sobre `pendiente_zona_norte` (33 sug / 25 props): el motor acertó **4/25** por nombre exacto; **16 falsos positivos**, incluido un **score 95** (Galil Parque III, real = Galil Parque I) y el atractor **CONDOMINIO ONE** (real = Brickell II). Aprobar por score habría metido basura. Memoria: `project_matching_zn_aprobacion_16jun2026`.

## Argumentos

| Arg | Default | Ejemplo |
|---|---|---|
| `--macrozona=` | `zona-norte` | `--macrozona=urubo` (mapea a `pendiente_urubo`) |
| `--limit=N` | (toda la cola) | `--limit=10` (smoke test) |
| `--out=` | `cola-<macrozona>.json` | `--out=/tmp/cola.json` |

`--macrozona` → estado de cola: `zona-norte`→`pendiente_zona_norte`, `urubo`→`pendiente_urubo`, etc. (Equipetrol NO usa esta cola — su HITL es `estado='pendiente'` con UI propia; para Eq el equivalente es auditar los auto-aprobados score≥85, en `/audit-feed-ventas-mensual`.)

## Flujo de ejecución

### 1. Correr la fase mecánica (fetch + pre-filtro)

```bash
cd scripts/auditoria-cola-matching && npm install --silent   # primera vez
node audit-cola-matching.mjs --macrozona=zona-norte
```

Escribe `cola-zona-norte.json` y emite su ruta por stdout. Si la cola está vacía → terminó, reportá "cola en 0, nada que auditar". Lee el JSON: cada sugerencia trae `prop_id, pm_sugerido, pm_nombre, score, dist_metros, nombre_edificio, titulo_anuncio, descripcion_anuncio, preclasificacion, flags, anuncio_ok`.

### 2. Lanzar el JUEZ — subagentes-lectores (el corazón de la skill)

Agrupá las sugerencias **con `anuncio_ok=true`** en lotes de ~6-8 y lanzá **subagentes `general-purpose` en paralelo** (varios en un solo mensaje). A cada subagente pasale, por sugerencia: `prop_id`, `pm_nombre` (sugerido), `score`, `dist_metros`, `flags`, el **`titulo_anuncio` + `descripcion_anuncio` ya extraídos** (NO le pidas que fetchee — ya está hecho), y **`pistas_nombre`** (`col`, `llm`, `enrichment`, `subtitulo`, `slug` — el nombre que el LLM nocturno o el discovery ya capturaron, **a veces más que el anuncio en vivo**: caso 1917, el portal mostraba desc corta pero `pistas_nombre.llm`="Torres Sirari"). El juez cruza el anuncio en vivo CON las pistas: si el anuncio no nombra pero una pista sí da un nombre creíble, ese nombre vale (verificar contra pm + GPS). Si `anuncio_ok=false` pero hay `pistas_nombre`, igual se puede juzgar por la pista.

Instrucción para cada subagente (juez):

> Sos auditor de matching inmobiliario en Santa Cruz. Para cada propiedad, leé el `titulo`+`descripcion` del anuncio y determiná el edificio EXACTO que nombra (con su **número/torre/romano** — clusters: "Macororó 13/14"≠"15", "Tamisa 2"≠"III", "Galil Parque I"≠"III", "Brickell 2"≠"4"). Compará con `pm_nombre` (lo que sugirió el motor). Veredicto por prop:
> - **APROBAR** — el anuncio nombra ese edificio exacto (nombre Y número) = pm_sugerido.
> - **CORREGIR** — nombra OTRO edificio existente; dá el `nombre_real` leído (cita textual breve).
> - **PM_NUEVO** — nombra un edificio claro que probablemente no esté cargado; dá el `nombre_real`.
> - **SIN_NOMBRE** — el anuncio NO menciona nombre propio (solo zona/calle/"depto en venta") → sin match.
> Atractores conocidos (NO confiar en score alto): "CONDOMINIO ONE", "Sky Aqualina", "Brickell". Devolvé tabla: `prop_id | pm_sugerido | nombre_real (o —) | veredicto | cita`.

### 3. Cruzar CORREGIR/PM_NUEVO contra `proyectos_master` (vía MCP `postgres-sici`)

Para cada `nombre_real` de un CORREGIR/PM_NUEVO, buscá el pm real y desempatá con GPS (el lector solo da el nombre; vos resolvés el id):

```sql
SELECT id_proyecto_master, nombre_oficial, alias_conocidos, latitud, longitud
FROM proyectos_master
WHERE nombre_oficial ILIKE ANY (ARRAY['%<nombre_real>%', ...]);
```

Y verificá la distancia prop↔pm-candidato (confirma o refuta el nombre):

```sql
SELECT p.id, round(ST_DistanceSphere(ST_MakePoint(p.longitud,p.latitud),
       ST_MakePoint(pm.longitud,pm.latitud))::numeric,0) AS dist_m
FROM propiedades_v2 p, proyectos_master pm
WHERE p.id = <prop_id> AND pm.id_proyecto_master = <pm_candidato>;
```

- Si existe pm con nombre+GPS coherente → **CORREGIR** a ese id.
- Si NO existe → **PM_NUEVO**: el GPS lo confirma/da el founder en Google Maps (regla: pm nuevo = `gps_verificado_visual='si'` solo tras verificación humana). NO inventar GPS.
- **GPS roto del portal**: si el nombre es explícito pero el GPS de la prop está lejísimos (caso 2148 Vertical 60 a 4km), matchear **por nombre** igual (el match no depende del GPS); anotar el GPS roto.
- **Rescate por GPS**: si el lector marcó CORREGIR/SIN_NOMBRE por dudar de un sufijo pero la prop está a ≤30m de un pm cuyo alias cubre el nombre → es ese pm (caso Vilareal). Lectura + GPS combinados mandan.

### 4. Anuncios no leídos (`anuncio_ok=false`)

- Remax `sin_data_page` o C21 HTTP 404 → anuncio caído → **rechazar** la sugerencia (no matchear a ciegas).
- Reintentables (timeout) → reportar para una segunda corrida; no decidir.

### 5. Generar el SQL (NO aplicar — el MCP es read-only)

Ensamblar UN bloque transaccional siguiendo estas reglas (todas obligatorias):

- **NUNCA `aplicar_matches_aprobados`** (bug loop K1, memoria `project_bug_loop_matching_k1`). UPDATE directo.
- **Candado `AND id_proyecto_master IS NULL`** en cada UPDATE de match → no pisa matches ya correctos (en ZN, 5/25 ya estaban bien y el motor sugería el pm equivocado encima).
- `metodo_match='auditor_cola_<fecha>'` (o `_pm_nuevo` / `_nombre`) → el matching nocturno respeta los `auditor_*`.
- **Temp tables con VALUES multilínea** para listas de IDs (NO una línea larga — se trunca al copiar a Supabase).
- Marcar la cola: sugerencias correctas → `estado='aprobado'`; equivocadas/sin-nombre/muertas → `estado='rechazado'` con motivo en `notas`. **⚠️ La PK de `matching_sugerencias` es la columna `id` — el JSON la expone renombrada como `sug_id` (`db.mjs`). Al filtrar usar SIEMPRE `WHERE id IN (<los sug_id del JSON>)`, NUNCA `WHERE sug_id IN (...)` (esa columna no existe → `ERROR: column "sug_id" does not exist`). Pasa en cualquier macrozona. Ej:** `UPDATE matching_sugerencias SET estado='aprobado' WHERE id IN (5081, 5082);`
- pm nuevos: INSERT con CTE `RETURNING` + UPDATE de la prop; GPS verificado por el founder; `zona` = la macrozona (NO el default 'Equipetrol'). **Tras INSERT de pm: `REFRESH MATERIALIZED VIEW mv_nombre_proyecto_lookup`** (fuera de la transacción).
- Cerrar con SELECT de verificación (matches aplicados + conteo de la cola) y dejar que el humano haga COMMIT/ROLLBACK.

Plantilla de candado para clusters numerados (formato OBJETO — un string NO protege, ver memoria `feedback_candado_formato_objeto`):

```sql
campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
  'id_proyecto_master', jsonb_build_object('bloqueado', true, 'por', 'auditor_cola',
     'fecha', '<YYYY-MM-DD>', 'razon', 'cluster numerado', 'valor_original', id_proyecto_master))
```

### 6. Reportar + preguntar al usuario

Tabla ejecutiva: `prop | pm sugerido | veredicto | pm final | evidencia`. Totales por veredicto. **NUNCA aplicar UPDATEs sin confirmación.** Presentá el SQL, ofrecé correr con `ROLLBACK` primero, y pedí al founder los GPS de los PM_NUEVO antes de cerrarlos.

## Reglas heredadas de la sesión que validó el método (19-jun-2026)

1. **Score ≠ juez.** Un score 95 fue FP (Galil Parque III). El número del cluster manda.
2. **Lectura + GPS combinados > cualquiera solo.** El GPS rescata sufijos que el lector duda; la lectura caza los FP de score alto que el GPS no ve.
3. **Candado `IS NULL` imprescindible.** Protege los matches manuales previos.
4. **SIN_NOMBRE → sin match** es correcto (mejor que un FP).
5. **Remax exige `data-page`** (el lector ya lo hace); WebFetch sobre remax.bo devuelve la shell vacía.

## Arquitectura (qué es código y qué es agente)

| Pieza | Tipo | Responsabilidad |
|---|---|---|
| `lib/db.mjs` | código | trae la cola + GPS + haversine |
| `lib/lector.mjs` | código | fetch C21 `?json=true` / Remax `data-page`, extrae texto |
| `lib/atractores.mjs` | código | pre-clasifica (atractor/cluster/sin-nombre) — solo ORDENA |
| `audit-cola-matching.mjs` | código | orquesta 1-3, emite JSON. **No decide.** |
| **subagentes-lectores** | **LLM (juez)** | **leen el anuncio y DECIDEN el veredicto** |
| Claude (esta skill) | LLM (orquestador) | lanza el juez, cruza contra pm, arma el SQL, pregunta al user |

`lib/lector.mjs` y `lib/atractores.mjs` son reutilizables por las skills `/audit-feed-*` (mismo doble fetcher).
