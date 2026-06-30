---
description: Audit mensual del feed /ventas (solo Equipetrol) — drift Firecrawl + inconsistencias internas + matching audit. Genera reporte ejecutivo con análisis humano.
---

# Audit mensual — feed /ventas

> **Alcance seleccionable con `--macrozona` (default `equipetrol`).** EQ y Zona Norte conviven en `v_mercado_venta`/`propiedades_v2` desde que ZN entró a prod; el filtro evita mezclarlos y gastar Firecrawl de más (ticket #15 del backlog ZN). Se aplica en las **3 capas**:
> - `--macrozona equipetrol` (default) → solo las 6 zonas canónicas (`Equipetrol Centro/Norte/Oeste`, `Sirari`, `Villa Brigida`, `Eq. 3er Anillo`).
> - `--macrozona zona-norte` → todo lo que **NO** es Equipetrol (ZN se define por descarte, así no hay que hardcodear sus 14 microzonas).
> - `--macrozona todas` → sin filtro (EQ + ZN juntos).

Auditoría completa del feed cruzando 3 capas:

1. **Capa 1 — Drift Firecrawl**: re-scrapea las props vivas y compara descripción guardada vs portal actual. **Incluye diff de PRECIOS** (ver abajo): además del texto, extrae el precio escrito en la desc vieja vs la del portal hoy y reporta los cambios reales.
2. **Capa 2 — Inconsistencias internas**: detecta desincronizaciones entre `precio_usd`, `tipo_cambio_detectado`, `nombre_edificio` y la descripción
3. **Capa 3 — Audit matching**: verifica que `nombre_edificio` BD aparece en slug/title/desc del listing, usando `proyectos_master.alias_conocidos`

## Argumentos

- (sin argumentos) — corrida normal con Firecrawl sobre **Equipetrol**, costo ~$1.75 (≈364 props)
- `--macrozona <equipetrol|zona-norte|todas>` — alcance del audit (default `equipetrol`). **Ojo costo Firecrawl**: `zona-norte` ≈ $2.10 (≈421 props), `todas` ≈ $3.90 (≈785 props). **NUNCA correr `zona-norte`/`todas` sin OK explícito del usuario** por el gasto.
- `--use-cached <run-dir>` — re-procesa un reporte de Firecrawl previo (gratis, para test)
- `--skip-insert` — no escribe a Supabase (útil si la migración 242 no está aplicada)

## Flujo de ejecución

Cuando el usuario invoca `/audit-feed-ventas-mensual` (con o sin args):

### 1. Ejecutar el orquestador

Correr desde el worktree `sici-auditoria/` (donde vive el script):

```powershell
cd "C:\Users\LUCHO\Desktop\Censo inmobiliario\sici-auditoria\scripts\auditoria-feed-ventas"
node audit-feed-ventas-mensual.mjs $ARGUMENTS
```

Si el usuario pasó argumentos (ej. `--use-cached 2026-05-08-...`), reemplazar `$ARGUMENTS` con esos. Si no, correr sin args (modo normal).

**Importante**: el orquestador puede tardar 5-10 min en modo normal (350 props × Firecrawl). En modo cached es instantáneo.

### 2. Leer los outputs

El orquestador genera 3 archivos en `reports/mensual-<timestamp>/`:

- `combined.json` — detalle completo por prop (las 3 capas combinadas)
- `meta.json` — metadata: stats, runId DB, costo
- `summary.md` — reporte ejecutivo bruto

Leer los 3 archivos.

### 3. Análisis humano (acá está el valor)

**No te quedes con el reporte bruto del script.** Procesalo con contexto del proyecto y filtrá ruido conocido. Reglas de filtrado:

#### Ruido conocido (filtrar/agrupar, no flagear individualmente)

- **Lofty Island contadores** (#43, 46, 49, 52, 511 y similares): broker rota descripción con números/fechas de unidades disponibles. Si el bucket es "cambio_menor" Y los `palabras_agregadas/quitadas` son números o nombres de meses → es ruido típico, agruparlo en una línea: "5 props Lofty Island con drift de contadores rotativos"
- **HTML entities** (`&nbsp;`, `&amp;` en `palabras_quitadas`): cambio cosmético del render del portal, no es drift real
- **Sky Plaza Italia** y proyectos donde `nombre_edificio` BD repite en muchas props pero la descripción es de UN edificio específico (ej: #874 era Eurodesign Soho asignado mal a Sky Plaza Italia): notar como "matching potencialmente errado" pero no alarmar

#### Cambio de precio en portal — diff de precios en Capa 1 (NUEVO, 29-jun) ⭐

La Capa 1 compara el **precio escrito en la desc guardada (vieja)** vs el **precio del portal hoy** (texto scrapeado), y reporta los cambios en la sección "💲 Cambio de precio en portal" del summary, ordenados por magnitud.

**Por qué existe:** el check de precio de la Capa 2 compara `precio_usd` contra la desc **cruda vieja** de BD → si el portal cambió el precio pero la cruda no se re-capturó, no lo ve. La Capa 1 sí trae el portal en vivo, así que el diff de precios caza rebajas/subas reales que la Capa 2 se pierde — incluso en props con texto casi idéntico (bucket `identicas`, donde lo único que cambió es el número).

**Umbral y graduación:** piso de **1%** (solo para descartar artefactos de redondeo/parseo); ≥10% = alta, 3–10% = media, 1–3% = baja. Nada real ≥1% se esconde.

**Complementa, no duplica, al pipeline:** `registrar_discovery` ya detecta cambios en el precio de **cabecera** (campo estructurado del portal) y actualiza/manda a revisión. El diff de precios del audit cubre el hueco restante: cuando el corredor cambia el precio **solo en el texto** de la descripción y la cabecera queda igual (el discovery no lo ve).

**Caveats al leer la sección:**
- **Fantasma Remax**: el extractor de Remax a veces saca un número del texto que NO es el precio (ej. el "67.678" repetido en props de distinta área/dorms). Descartá los que repiten el mismo número en props distintas.
- **Reformulación de TC ≠ rebaja**: a veces el precio "cambia" solo porque el aviso pasó de expresar el monto "al oficial" a "billete/paralelo" (mismo valor económico). Leé el aviso.
- **El precio sale del TEXTO de la desc**, no del precio de cabecera estructurado. Confirmá leyendo antes de aplicar, sobre todo en Remax. Regla de la skill: el script detecta, el humano/agente juzga.

#### Patrones críticos (siempre reportar)

- **TC paralelo NO mapeado**: prop con `tipo_cambio_detectado='no_especificado'` o NULL Y la diferencia de precio entre BD y desc es ~22-43% (ratio ~1.43 = paralelo/oficial). Calcular el impacto real en feed.
  - SQL listo: `UPDATE propiedades_v2 SET tipo_cambio_detectado='paralelo', fecha_actualizacion=NOW() WHERE id=X;`
- **Cambio de precio explícito en desc**: descripción menciona "Nuevo Precio" o el precio bajó significativamente (>10%) y `precio_usd` BD no se actualizó
- **Listings muertos**: `bucket='reescrita'` con `len_scraped=0` (HTML 200 OK pero sin contenido)
  - SQL: `UPDATE propiedades_v2 SET status='inactivo_pending', fecha_actualizacion=NOW() WHERE id IN (...);`
- **Mismatch de matching real**: capa 3 reporta `mismatch_real`. **NO discriminar a ojo** — en clusters numerados lleva a error. (Este mismo doc antes sugería agregar "UPTOWN EQUIPETROL" como alias; validado 17-jun, ese caso —prop 1229— era un **MISMATCH real**: "Uptown Equipetrol" ≠ "Uptown Drei", torres distintas del mismo cluster.) Escalar al **juez LLM** (idéntico al paso 3.1b de `audit-feed-ventas-semanal`): un agente lee `url` + `encabezado` + `descripcion` de cada `mismatch_real` y da veredicto con **número/torre exacto**:
  1. **ALIAS_FALTANTE**: mismo edificio, variante de nombre → agregar a `alias_conocidos` (NO cambiar `nombre_edificio` de la prop).
  2. **MISMATCH real**: el anuncio nombra OTRO edificio → corregir al pm correcto (buscar por `nombre_oficial ILIKE` + GPS≤300m). **Si es CLUSTER numerado** (Macororó/Tamisa/Brickell/Uptown/Sky N…), **candar** `id_proyecto_master` en el mismo UPDATE (formato objeto — ver paso 3.1c de la semanal).
  3. **SIN_NOMBRE / falso positivo del regex**: ignorar.
- **Cambio de modelo comercial**: descripción cambió "incluye parqueo" ↔ "parqueo opcional" o similar
- **Cambio de unidad**: descripción cambió "Piso X" → "Piso Y" (broker reusó el listing para otra unidad — caso #100)

#### Cambios menores reales (revisar pero no urgente)

- Cambio de fecha de entrega (dic 2025 → mar 2026)
- Aparición de "SOLO CONTADO" como condición
- Cambio de números pequeños (m², piso) sin afectar precio

#### Detectores agregados — solo mensual (NUEVO, 17-jun) ⭐

No son por-prop: corren una vez sobre todo el sistema y atacan el bug del **motor**, no síntomas sueltos.

**1. Detector de ATRACTORES de nombre.** Un pm con distintivo ≤3 letras (tras quitar genéricos: ONE/ITO/SKY/ZEN/ARA) colapsa al prefijo "condominio/edificio/torre" en `fuzzy_nombre` y atrae cualquier "Condominio X" (caso CONDOMINIO ONE pm 359 = ~30 sugerencias falsas, el "K1" del matching por nombre):
```sql
SELECT pm.id_proyecto_master, pm.nombre_oficial,
       COUNT(*) FILTER (WHERE ms.metodo_matching='fuzzy_nombre') AS sug_fuzzy
FROM proyectos_master pm
JOIN matching_sugerencias ms ON ms.proyecto_master_sugerido=pm.id_proyecto_master AND ms.estado LIKE 'pendiente%'
WHERE NOT EXISTS (
  SELECT 1 FROM regexp_split_to_table(lower(pm.nombre_oficial),'\s+') w
  WHERE length(w)>=4 AND w NOT IN ('condominio','edificio','torre','residencia','residence','suites','studios','apartments','tower'))
GROUP BY 1,2 HAVING COUNT(*) FILTER (WHERE ms.metodo_matching='fuzzy_nombre') >= 3
ORDER BY sug_fuzzy DESC;
```
Acción: reportar los atractores 🔴. **Fix real** = en `generar_matches_fuzzy` (excluir stopwords + bajar umbral a ≥3 letras) — ticket de motor, ver `BACKLOG.md`.

**2. Auditoría de AUTO-APROBADOS.** Equipetrol auto-aprueba matches de score ≥85 → entran al feed **sin que nadie lea el anuncio**. Ahí se cuelan los mismos falsos positivos de cluster (validado 17-jun: props 997 Macororo 7→8 y 1229 Uptown→Drei, ambas score alto, en el feed público). Tomar una **muestra** de auto-aprobados recientes y pasarla por el **juez LLM** (mismo agente del 3.1b):
```sql
-- ajustar el filtro de "auto-aprobado" al valor real de metodo_match / estado de la sugerencia auto-aprobada
SELECT id FROM propiedades_v2
WHERE id_proyecto_master IS NOT NULL
  AND fecha_actualizacion > NOW() - INTERVAL '35 days'
  AND NOT (campos_bloqueados ? 'id_proyecto_master')
ORDER BY random() LIMIT 30;
```
Medir el **% de MISMATCH** en la muestra. Si es alto, justifica el fix del motor + revisar el umbral de auto-aprobación (score 95 ≠ match correcto, lección 17-jun).

### 4. Reporte ejecutivo final al usuario

Estructura el output al usuario así:

```
# Audit Mensual — <YYYY-MM-DD>

## 🔴 CRÍTICO (X props con acción inmediata sugerida)

### TC paralelo mal mapeado (N props)
Impacto en feed: subestimación total de ~$Y miles
[tabla: ID | Edificio | BD precio | desc precio | impacto en feed]

→ SQL listos:
[bloques SQL con IDs]

### Cambios de precio reales (M props)
[tabla con BD vs portal vs acción sugerida]

### Listings muertos (P props)
[tabla + SQL para inactivo_pending]

### Mismatch de matching reales (Q props)
[tabla con BD asignado vs desc menciona]

## 🟡 ATENCIÓN (Z props para revisar)
[cambios de fecha, modelo comercial, unidad — decisiones humanas]

## 🟢 INFORMATIVO

- Total auditado: <N> de <M> props
- Drift detectado: <X>% (vs <prev>% mes pasado si hay histórico en `audit_descripciones_runs`)
- Listings muertos: <N> (en línea con histórico ~3/mes)
- Costo Firecrawl: $<Y>
- DB run_id: <uuid> (para queries posteriores)
- Lofty Island contadores: <N> props (ruido típico, sin acción)
- HTML entities: <N> props (cosmético, sin acción)

## Detalle completo
`<run_dir>/summary.md` y `<run_dir>/combined.json`
```

### 5. Pregunta al usuario qué accionar

Después del reporte ejecutivo, preguntá concretamente:

- ¿Aplicar los SQL críticos ahora? (TC mismatch + listings muertos suelen ser seguros)
- ¿Querés side-by-side de los cambios de precio reales para decidir?
- ¿Hay algún caso específico que querés que investigue más?

NO apliques mutations sin confirmación del usuario.

## Datos útiles para el análisis

- **TC paralelo actual**: 9.954 (oficial 6.96, ratio 1.43)
- **Total feed actual**: ~342 props vivas en `v_mercado_venta`
- **Casos canónicos** (referencia para reconocer patrones):
  - #317 La Riviera, #428 Las Palmeras: TC paralelo mal mapeado
  - #422 INIZIO: rebaja explícita "Nuevo Precio"
  - #874 Eurodesign Soho: matching errado a Sky Plaza Italia
  - #629/888/1141/1142/1143: listings muertos C21 con HTML 200 vacío

## Querys históricos útiles

Para comparar con audits previos (si la migración 242 está aplicada):

```sql
-- Tendencia mensual
SELECT * FROM audit_descripciones_tendencias;

-- Props con drift recurrente (en >=2 audits)
SELECT prop_id, COUNT(DISTINCT run_id) as veces
FROM audit_descripciones_items
WHERE bucket IN ('cambio_relevante', 'reescrita')
GROUP BY prop_id
HAVING COUNT(DISTINCT run_id) >= 2;
```
