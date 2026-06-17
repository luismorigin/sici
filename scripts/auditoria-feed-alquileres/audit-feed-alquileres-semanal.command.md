---
description: Audit semanal del feed /alquileres sin scraping — capas 2+3+4 sobre props nuevas/rango. Costo $0, solo SQL. Reporte ejecutivo con SQL listo. Sin persistencia. v1.5: scope por macrozona (`--macrozona`, default equipetrol = feed público) + candado formato objeto; v1.4: precio/área cruda↔BD por LECTURA + anexo cola barata.
---

# Audit semanal — feed /alquileres

Variante liviana del audit mensual. Cubre props nuevas en una ventana temporal usando solo SQL via MCP `postgres-sici`. **No hace scraping** (ni curl ni Firecrawl) — por eso no detecta drift contra el portal en vivo ni listings muertos, pero captura el ~70% del valor del mensual a costo $0 y en segundos.

Cuándo usarlo: lunes a la mañana (o cualquier día) para limpiar la deuda de props nuevas mientras están frescas. Complementa al `/audit-feed-alquileres-mensual` que cubre todo el feed + drift fetcher curl.

## Principio clave (v1.4): lectura > regex

Los checks nuevos de v1.4 (2.9 precio, 4.4 área, anexo cola barata) **NO usan regex para decidir**. La query SQL solo **trae** el dato de BD + la cruda completa; el **agente lee la cruda y compara con juicio**. Esto es lo que mata los falsos positivos que hundieron al viejo check 2.1 (un regex ciego que marcaba toda mención de "Bs"). El agente distingue por contexto "alquiler 3.100 Bs" de "garantía 3.150 Bs" de "expensas 463 Bs" — algo que un regex no puede. **"Solo SQL" significa que la query es SQL puro; NO significa que la detección deba ser SQL.** La inteligencia vive en la lectura, no en el patrón.

Regla de oro anti-FP: si no podés identificar con confianza el dato en la cruda, **no marques error** — dejá la prop fuera del reporte o como 🟢. El silencio es mejor que un falso positivo. La ambigüedad real (varios precios, USD sin TC claro) se reporta como 🟡 "revisar" mostrando el fragmento, nunca como 🔴.

## Versión actual: v1.6 — 17-jun-2026

v1.6 **extiende el principio "lectura > regex" (que ya regía en precio/área) al MATCHING** — paridad con ventas v1.7:
- **Check 3.1b — Juez LLM**: los flaggeados por el query 3.1 dejan de discriminarse a ojo; se escalan a un agente que lee el anuncio y da veredicto con número/torre exacto (OK/ALIAS_FALTANTE/MISMATCH/SIN_NOMBRE). En alquiler es **más** decisivo que en ventas porque `nombre_edificio` suele ser NULL.
- **Check 3.1c — Acción + candado automático de cluster** (Macororó/Tamisa/Brickell/Uptown/Sky N…): corregir Y candar `id_proyecto_master` (formato objeto) porque el matching se re-equivoca en clusters si la prop vuelve a sin-match.
- **Check 3.5 — Genéricos sin match** (NUEVO): el feed de alquiler muestra props sin match con el genérico de `nombreAlquiler` ("Monoambiente · microzona"), que **esconde** matches perdidos. El agente lee esas props y recupera las que sí nombran un edificio.
Lección sesión 17-jun (auditoría cola matching ZN): el agente-lector cazó ~58 falsos positivos del motor que token/GPS no veían. Ver `../auditoria-feed-ventas/BACKLOG.md` → "PLAN — Upgrade auditoría de matching". Memoria: `project_matching_zn_aprobacion_16jun2026`.

## v1.5 — 8-jun-2026

v1.5 (paridad con el audit de ventas v1.6):
- **Scope por macrozona** (arg `--macrozona`, default `equipetrol`): `v_mercado_alquiler` mezcla Equipetrol + Zona Norte, pero el feed público `/alquileres` filtra a Equipetrol. El audit ahora coincide. Filtro `v.zona_general`. (No lleva filtro de tipo: en alquiler no hay casas/terrenos en el feed.)
- **Formato canónico del candado** (sección "aplicar correcciones"): el merge de alquiler (`merge_alquiler`, `registrar_*_alquiler`) usa el MISMO helper `_is_campo_bloqueado` que ventas → candar a mano con un string NO protege; usar `jsonb_build_object` + verificación post-fix. Verificado en las funciones de producción del pipeline alquiler.

## v1.4 — 25-may-2026

v1.4 cierra el hueco de precio mal extraído que el semanal no veía:
- **Check 2.9** (NUEVO): precio cruda↔BD por lectura del agente (reemplaza conceptualmente al viejo 2.1 eliminado, sin sus FP).
- **Check 4.4** (NUEVO): área cruda↔BD por lectura del agente.
- **Anexo A** (NUEVO): barrido de la cola barata de TODO el feed (fuera de ventana), donde se concentran los bugs de conversión de moneda. Excluye props con precio ya candado → la lista se agota en vez de repetirse.

v1.3 agregó el check 2.8 (dormitorios=0 que contradice la cruda) — alineado con la skill de ventas. v1.1/v1.2 ver "Lecciones de calibración".

## v1.2 — post-retest 13 may 2026

Calibraciones acumuladas tras 2 tests sobre las mismas 37 props del 6-13 may (ver "Lecciones de calibración" al final):

**v1.1 (6 calibraciones iniciales)**:
1. **Eliminado check 2.1 "precio Bs en desc ≠ BD"** — sin extracción JS post-SQL daba 100% falsos positivos. El mensual lo cubre con flag `precio_aparecio`.
2. **2.3 amoblado** — removido `equipad` del regex (matcheaba "cocina equipada").
3. **2.4 mascotas** — validación doble (positivo Y NO negativo, sin lookbehind).
4. **3.1 matching** — tokenizar nombre_oficial.
5. **3.2 GPS** — bandas: ≤30m 🟢, 30-100m 🟡, >100m 🔴.
6. **3.3 prefijo ambiguo** — bajado a 🟢 agrupado.

**v1.2 (2 calibraciones residuales)**:
7. **2.3 amoblado** — removido `con muebles` del regex (matcheaba "cocina equipada con muebles altos y bajos" → muebles de cocina, no del depto).
8. **3.1 matching** — agregada comparación contra `desc_lower` y `url_lower` con espacios eliminados (resuelve "Nano Tec"/"NanoTec", "Le Blanc"/"LeBlanc" automáticamente sin alias manuales).

## Pre-requisito — cruda persistida

La mayoría de los checks comparan campos estructurados vs `datos_json_enrichment->>'descripcion'`. Esa cruda se persiste desde la migración 243 + workflow v2.1.0 (9 may 2026). Props enriquecidas antes de esa fecha requieren `npm run backfill`.

**Antes de cualquier capa**, correr query de cobertura:

```sql
SELECT
  COUNT(*) FILTER (WHERE p.datos_json_enrichment->>'descripcion' IS NOT NULL AND LENGTH(p.datos_json_enrichment->>'descripcion') > 0) AS con_cruda,
  COUNT(*) FILTER (WHERE p.datos_json_enrichment->>'descripcion' IS NULL OR LENGTH(p.datos_json_enrichment->>'descripcion') = 0) AS sin_cruda,
  COUNT(*) AS total
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro temporal>;
```

Si `con_cruda / total < 0.70`, abortar y sugerir `cd scripts/auditoria-feed-alquileres && npm run backfill`. Si es ≥0.70, continuar y marcar las `sin_cruda` como 🟢 informativo al final.

## Argumentos

| Arg | Default | Ejemplo |
|---|---|---|
| (sin args) | últimos 7 días | `/audit-feed-alquileres-semanal` |
| `--dias=N` | 7 | `--dias=14` |
| `--desde=YYYY-MM-DD` | NOW − dias | `--desde=2026-05-01` |
| `--hasta=YYYY-MM-DD` | NOW | `--hasta=2026-05-12` |
| `--ids=N,M,...` | (todos del rango) | `--ids=1834,1850` |
| `--solo-criticos` | false | filtra capa 4 (anomalías menores) |
| `--incluir-recientes` | false | NO excluye props editadas en últimos 30 min |
| `--cola=N` | 15 | top-N baratas en Anexo A; `--cola=0` lo desactiva |
| `--macrozona=` | `equipetrol` | `--macrozona=zona-norte` · `--macrozona=todas` |

**Reglas de combinación**:
- `--desde` + `--hasta` ganan sobre `--dias`
- `--ids` overrides todo (audit puntual de props específicas, ignora rango temporal)
- Por default se excluyen props con `fecha_actualizacion >= NOW() - 30 min` (race condition guard contra admin panel)
- **`--macrozona` mapea a `v.zona_general`** (default `equipetrol`, coincide con el feed público `/alquileres` que filtra `zonas_permitidas: ZONAS_EQUIPETROL_DB`):

| `--macrozona=` | Filtro | Cubre |
|---|---|---|
| `equipetrol` (default) | `AND v.zona_general = 'Equipetrol'` | lo que muestra el feed público `/alquileres` |
| `zona-norte` | `AND v.zona_general = 'Zona Norte'` | prototipo Zona Norte (dark launch) |
| `todas` | (sin filtro de zona) | ambas — NO recomendado (mezcla scope) |

> **⚠️ Por qué `equipetrol` por default:** `v_mercado_alquiler` mezcla ambas macrozonas (≈137 Equipetrol + ≈104 Zona Norte), pero el feed público `/alquileres` filtra a Equipetrol (`buscarUnidadesAlquiler({zonas_permitidas: ZONAS_EQUIPETROL_DB})` en `alquileres.tsx`). El audit debe coincidir con el feed. `zona_general` es columna de `v_mercado_alquiler` (mig 257). **NO aplica filtro de tipo** (a diferencia de ventas): en alquiler no hay casas/terrenos en el feed (`casa_terreno=0`, pipeline 221 es solo venta).

## Flujo de ejecución

Cuando el usuario invoca `/audit-feed-alquileres-semanal` (con o sin args):

### 0. Cobertura cruda (gate)

Correr query de cobertura del pre-requisito. Si <70%, abortar con mensaje. Si ≥70%, seguir.

### 1. Parsear args y construir filtro WHERE base

```sql
-- Filtro temporal base
WHERE p.fecha_creacion BETWEEN '<desde>' AND '<hasta> 23:59:59'

-- Filtro de race condition (excluir editadas en últimos 30 min, salvo --incluir-recientes)
AND (p.fecha_actualizacion IS NULL OR p.fecha_actualizacion < NOW() - INTERVAL '30 minutes')

-- Filtro de MACROZONA (obligatorio salvo --macrozona=todas). Alinea con el feed público /alquileres.
-- equipetrol (default) → 'Equipetrol' | zona-norte → 'Zona Norte' | todas → omitir esta línea
AND v.zona_general = '<Equipetrol | Zona Norte>'

-- Solo props vivas del feed
-- (v_mercado_alquiler ya filtra status + ≤150 días + curaduría)
```

> El `<filtro args>` (con la línea de `v.zona_general`) se inyecta en TODAS las queries de capas 2/3/4 y el conteo base (todas hacen `v_mercado_alquiler v JOIN propiedades_v2 p`). El **Anexo A (cola barata)**, que barre fuera de ventana, también debe llevar el filtro de macrozona.

### 2. Conteo base + distribución por día/fuente

```sql
SELECT
  DATE(p.fecha_creacion) AS dia,
  p.fuente,
  COUNT(*) AS nuevas
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
GROUP BY 1,2
ORDER BY 1 DESC, 2;
```

Volumen esperado: ~22-30 props/semana (C21 ~16, Remax ~6, BI ~0-1).

### 3. Capa 2 — Inconsistencias internas (8 checks)

#### 2.1 Cambio explícito de precio en desc 🔴

Detección: descripción menciona "REBAJA", "Nuevo Precio", "Oferta", "Antes:", "Antes Bs", "Bajó", "Descuento", "Negociable" + (idealmente) precio mencionado difiere >5% de `precio_mensual_bob`.

```sql
SELECT v.id, v.nombre_edificio, v.precio_mensual_bob,
       LEFT(p.datos_json_enrichment->>'descripcion', 400) AS desc
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND p.datos_json_enrichment->>'descripcion' ~* '(nuevo precio|rebaja|oferta|antes:|antes bs|bajó|descuento)'
  AND NOT (p.campos_bloqueados ? 'precio_mensual_bob')
ORDER BY v.id;
```

**Notas**:
- "Negociable" sola NO se incluye en regex (es palabra común en alquiler, genera ruido). Incluirla solo si se combina con "Antes:" o precio numérico distinto.
- Comparación numérica del precio es manual (post-SQL). Si el agente puede leer el snippet y extraer el número, hacer comparison; si no, dejar como "candidato" para revisión humana.

#### 2.2 Precio absurdo (Bs/m²/mes fuera de rango) 🔴

Benchmarks por zona (deptos, 13 May 2026):

| Zona | p10 | mediana | p90 |
|---|---|---|---|
| Eq. Centro | 65.6 | 83.0 | 109.4 |
| Eq. Norte | 76.5 | 103.4 | 128.4 |
| Sirari | 57.7 | 90.5 | 112.2 |
| Eq. Oeste | 77.9 | 83.3 | 105.3 |
| V. Brigida | 53.7 | 73.3 | 103.1 |

**Cortes globales**:
- 🔴 Crítico: `Bs/m²/mes < 40` o `> 200`
- 🟡 Atención: `< 50` o `> 150` (depende zona)

```sql
SELECT v.id, v.fuente, v.zona, v.nombre_edificio, v.precio_mensual_bob, v.area_total_m2,
       ROUND(v.precio_mensual_bob / NULLIF(v.area_total_m2, 0), 1) AS bs_m2_mes
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND v.tipo_propiedad_original = 'departamento'
  AND v.area_total_m2 > 0
  AND v.precio_mensual_bob > 0
  AND NOT (p.campos_bloqueados ? 'precio_mensual_bob')
  AND NOT (p.campos_bloqueados ? 'area_total_m2')
  AND (
    v.precio_mensual_bob / v.area_total_m2 < 40
    OR v.precio_mensual_bob / v.area_total_m2 > 200
  )
ORDER BY bs_m2_mes;
```

**Nota**: el campo `flags_semanticos` en BD ya marca "Precio/m² muy bajo (<500 USD)" pero ese umbral viene de la lógica de ventas — **ignorar ese flag para alquiler** (genera 22% falsos positivos). Esta capa 2.2 es la calibración correcta.

#### 2.3 `amoblado` BD vs desc 🔴 (RECALIBRADO v1.2)

`amoblado` es text con valores `'si'`, `'no'`, `'semi'`.

**Lógica anterior** (v1.0): incluía `equipad` en regex de positivos. FP 4/4 — "cocina equipada" estándar en deptos NO amoblados.

**Lógica v1.1**: removido `equipad`. Bajó FP a 1/1 — pero quedó "con muebles" que matchea "cocina con muebles altos y bajos" (1823 Aguaí en retest).

**Lógica v1.2**: removido también `con muebles`. Dejar solo `(amoblad|incluye muebles|furnished)` — señales inequívocas que aplican al depto, no a la cocina.

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.amoblado,
       LEFT(p.datos_json_enrichment->>'descripcion', 500) AS desc
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND NOT (p.campos_bloqueados ? 'amoblado')
  AND (
    -- BD dice 'no' pero desc menciona amoblado/incluye muebles/furnished
    (v.amoblado = 'no'
      AND p.datos_json_enrichment->>'descripcion' ~* '(amoblad|incluye muebles|furnished)')
    OR
    -- BD dice 'si' pero desc dice "sin muebles"/"vacío"/"sin amoblar"
    (v.amoblado = 'si'
      AND p.datos_json_enrichment->>'descripcion' ~* '(sin amoblar|sin muebles|vací[oa]|unfurnished|no amoblad)')
  )
ORDER BY v.id;
```

**Atención al impacto**: amoblado cambia el precio +30-50%, así que el mismatch tiene consecuencia comercial directa (no es solo dato sucio).

#### 2.4 `acepta_mascotas` BD vs desc 🟡 (RECALIBRADO v1.1)

**Lógica anterior** (v1.0): regex `aceptan? mascotas` sin lookbehind matcheaba "**No** acepta mascotas" como falso positivo (2/2 en test).

**Lógica nueva** (v1.1): para BD=false + match positivo, agregar condición que NO haya match negativo ("no aceptan", "no se acepta", "sin mascotas", "no .{0,10}mascotas").

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.acepta_mascotas,
       LEFT(p.datos_json_enrichment->>'descripcion', 500) AS desc
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND NOT (p.campos_bloqueados ? 'acepta_mascotas')
  AND (
    -- BD dice true pero desc dice "no aceptan mascotas"
    (v.acepta_mascotas = true
      AND p.datos_json_enrichment->>'descripcion' ~* '(no.{0,5}(se )?aceptan? mascotas|no.{0,10}mascotas|sin mascotas|pet[s]?[\- ]free|no pets)')
    OR
    -- BD dice false pero desc dice "pet friendly/admiten/bienvenidas" Y NO dice "no aceptan/sin mascotas"
    (v.acepta_mascotas = false
      AND p.datos_json_enrichment->>'descripcion' ~* '(pet[s]?[\- ]friendly|admiten? mascotas|mascotas.{0,10}(permitid|bienvenid))'
      AND p.datos_json_enrichment->>'descripcion' !~* '(no.{0,10}mascotas|sin mascotas|no se aceptan|no.{0,5}aceptan? mascotas|no pets)')
  )
ORDER BY v.id;
```

#### 2.5 `monto_expensas_bob` BD vs desc 🟡

Detección: la desc menciona un monto de expensas que difiere del campo BD.

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.monto_expensas_bob,
       LEFT(p.datos_json_enrichment->>'descripcion', 500) AS desc
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND NOT (p.campos_bloqueados ? 'monto_expensas_bob')
  AND p.datos_json_enrichment->>'descripcion' ~* 'expensas?[^\.]{0,40}(bs\.?|bolivianos)\s*[\d\.,]+'
ORDER BY v.id;
```

Para cada candidato: extraer monto regex `expensas?[^\.]{0,40}(?:bs\.?|bolivianos)\s*([\d\.,]+)`, comparar con `monto_expensas_bob`. Si diff >10% (o BD=NULL y desc menciona), flagear 🟡.

#### 2.6 `nombre_edificio` sospechoso 🟡

Heredado de ventas. Filtros: >50 chars, contiene `\n`, basura típica, casa/terreno con nombre.

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.tipo_propiedad_original, v.id_proyecto_master,
       LENGTH(v.nombre_edificio) AS len
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND NOT (p.campos_bloqueados ? 'nombre_edificio')
  AND v.nombre_edificio IS NOT NULL
  AND (
    LENGTH(v.nombre_edificio) > 50
    OR v.nombre_edificio ~ E'\\n'
    OR v.nombre_edificio ~* '^(planta|edificio de|de edificio|en venta|venta|alquiler|monoambiente|departamento)$'
    OR (v.tipo_propiedad_original IN ('casa','terreno') AND v.nombre_edificio IS NOT NULL)
  );
```

#### 2.7 `flags_semanticos` con falso positivo de precio_m2 🟢 informativo

```sql
SELECT v.id, v.nombre_edificio,
       flag->>'razon' AS razon, flag->>'valor' AS valor
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id,
     jsonb_array_elements(v.flags_semanticos) AS flag
WHERE <filtro args>
  AND flag->>'razon' ILIKE '%precio/m²%'
  AND flag->>'campo' = 'precio_m2';
```

**Acción**: agruparlos en una sola línea informativa. NO accionar individualmente. El flag está mal calibrado para alquiler (usa umbral $500/m² de venta). Backlog: separar el flag de venta vs alquiler en merge.

#### 2.8 Dormitorios=0 contradice la cruda 🔴 (NUEVO v1.3)

Detección: `dormitorios = 0` (catalogada monoambiente) pero la cruda NO dice "monoambiente" y SÍ menciona "N dormitorio(s)". El portal o el LLM pueden haber bajado a 0 un depto real de 1+ dorm.

```sql
SELECT v.id, v.fuente, v.dormitorios AS col_d, v.area_total_m2 AS area,
       LEFT(regexp_replace(p.datos_json_enrichment->>'descripcion', E'[\r\n]+',' ','g'), 160) AS desc_inicio
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND v.dormitorios = 0
  AND NOT (p.campos_bloqueados ? 'dormitorios')
  AND p.datos_json_enrichment->>'descripcion' IS NOT NULL
  AND p.datos_json_enrichment->>'descripcion' !~* 'mono ?-?ambiente'
  AND p.datos_json_enrichment->>'descripcion' ~* '([0-9]+|un|dos|tres) ?dormitorio'
ORDER BY v.area_total_m2 DESC;
```

Análisis humano por caso: leer la cruda. Si dice claramente "N dormitorio(s)" para **la unidad** (no el rango del proyecto) → corregir `dormitorios = N` + candar (`por='audit_dormitorios'`). Si es rango de proyecto → dejar, no concluyente. **Solo esta dirección** (el caso directo "cruda dice monoambiente + dorms≥1" lo cubre el guardrail mono del merge alquiler, mig 214/247). Ver memoria `audit_overrides_llm_dorms.md`.

#### 2.9 Precio cruda ↔ BD por LECTURA 🔴 (NUEVO v1.4 — reemplaza al viejo 2.1)

**Por qué este check es distinto al 2.1 eliminado.** El 2.1 viejo era un regex SQL que solo verificaba la *presencia* de "Bs" → 100% FP. Este check **no usa regex para decidir**: la query trae el precio de BD + la cruda completa, y **el agente lee y compara con juicio** (ver "Principio clave"). Cierra el hueco real: precios mal extraídos cuyo Bs/m² queda *plausible* y por eso el check 2.2 no los ve (ej. #1835 el 25-may: 2.158 Bs en BD vs 3.100 Bs en la cruda, ratio 56.8 = "normal").

Query (solo trae datos, NO decide):

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.zona,
       v.precio_mensual_bob AS bob_bd, v.area_total_m2 AS area_bd,
       p.datos_json_enrichment->>'descripcion' AS desc_full
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND v.precio_mensual_bob > 0
  AND NOT (p.campos_bloqueados ? 'precio_mensual_bob')
  AND p.datos_json_enrichment->>'descripcion' IS NOT NULL
  AND LENGTH(p.datos_json_enrichment->>'descripcion') > 0
ORDER BY v.id;
```

**Cómo leer cada prop** (criterio, no regex):
1. Identificar en la cruda el monto del **alquiler mensual** — NO garantía, comisión, expensas, depósito ni "mes adelantado". Señales: "precio de alquiler", "canon mensual", "alquiler:", "💰", "Bs X (incluye expensas)".
2. Si la cruda cotiza en **USD** ("316 $us", "$us 400"): es ambiguo en alquiler (oficial vs paralelo). Como referencia, USD×6.96 = Bs oficial. Si `bob_bd` ≈ USD×6.96 → OK. Si `bob_bd` ≈ USD×~9.5 → posible TC paralelo aplicado → 🟡 revisar (NO 🔴). El alquiler usa `precio_mensual_bob` como fuente de verdad; un USD-paralelo guardado en Bs no es necesariamente un error.
3. Comparar el monto de alquiler de la cruda vs `bob_bd`:
   - diff ≤5% → OK, no reportar.
   - diff >5% **y** el monto de la cruda es **inequívoco** (un solo precio claro de alquiler) → 🔴 con SQL de corrección + candado.
   - cruda **ambigua** (varios montos posibles, USD sin TC claro, "nuevo precio" contradictorio) → 🟡 revisar.
4. **Siempre** mostrar en el reporte: `bob_bd`, el monto leído de la cruda, y **el fragmento textual exacto** de donde lo sacaste (para que el humano verifique tu lectura). Nunca pidas confianza ciega.

**Regla anti-FP**: si no podés identificar con confianza el precio de alquiler en la cruda, NO marques error — omití la prop o márcala 🟢 "cruda sin precio claro".

SQL de corrección (plantilla):
```sql
UPDATE propiedades_v2
SET precio_mensual_bob = <correcto>,
    campos_bloqueados = campos_bloqueados || jsonb_build_object(
      'precio_mensual_bob', jsonb_build_object(
        'por','audit_semanal','fecha', now()::text, 'bloqueado', true,
        'valor_original', <bob_bd>, 'razon','<motivo>'))
WHERE id = <id>;
```

### 4. Capa 3 — Matching audit (4 checks)

#### 3.1 Matching potencialmente errado 🔴 (RECALIBRADO v1.2)

**Lógica v1.0**: buscaba cadena completa del nombre_oficial. FP 4/6 por variantes ("LeBlanc"/"Le Blanc", "Nomad" parcial, "Nano Tec"/"NanoTec").

**Lógica v1.1**: tokenizar nombre_oficial → buscar **primera palabra distintiva** (no "Edificio/Condominio/Torre/etc") con boundaries `(^|[^a-z])token([^a-z]|$)`. Bajó FP a 3/3 — pero "nano tec" (con espacio) seguía sin matchear con token "nanotec".

**Lógica v1.2**: agregar comparación contra versión **sin espacios** de `desc_lower` y `url_lower` (`regexp_replace(..., '\s', '', 'g')`). Resuelve "nano tec"/"NanoTec", "le blanc"/"LeBlanc" automáticamente sin alias manuales.

```sql
WITH props AS (
  SELECT v.id, v.fuente, v.nombre_edificio, v.id_proyecto_master,
         pm.nombre_oficial, pm.alias_conocidos,
         LOWER(p.url) AS url_lower,
         LOWER(translate(
           COALESCE(p.datos_json_enrichment->>'descripcion',''),
           '𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡',
           'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
         )) AS desc_lower,
         -- Token distintivo: primera palabra NO genérica
         LOWER(
           (SELECT t FROM unnest(string_to_array(pm.nombre_oficial, ' ')) AS t
            WHERE LOWER(t) NOT IN ('edificio','condominio','torre','residencial','cond','el','la','los','las','de','del')
            LIMIT 1)
         ) AS token_distintivo
  FROM v_mercado_alquiler v
  JOIN propiedades_v2 p ON p.id = v.id
  LEFT JOIN proyectos_master pm ON pm.id_proyecto_master = v.id_proyecto_master
  WHERE <filtro args>
    AND v.id_proyecto_master IS NOT NULL
    AND pm.nombre_oficial IS NOT NULL
    AND NOT (p.campos_bloqueados ? 'id_proyecto_master')
)
SELECT id, fuente, nombre_edificio, nombre_oficial, token_distintivo,
       LEFT(desc_lower, 200) AS desc_inicio, url_lower
FROM props
WHERE token_distintivo IS NOT NULL
  AND NOT (
    -- Token distintivo aparece en url o desc (con boundaries)
    url_lower ~ ('(^|[^a-z])' || token_distintivo || '([^a-z]|$)')
    OR desc_lower ~ ('(^|[^a-z])' || token_distintivo || '([^a-z]|$)')
    -- v1.2: O aparece en versión SIN ESPACIOS, sin boundaries (resuelve "nano tec"→"nanotec")
    -- Sin boundaries porque al quitar espacios las palabras quedan pegadas (ej: "nanotecbysmart") y boundary fallaría
    -- Riesgo de FP es bajo: tokens distintivos son típicamente 5+ chars y únicos
    OR (LENGTH(token_distintivo) >= 5 AND regexp_replace(url_lower, '\s', '', 'g') LIKE '%' || token_distintivo || '%')
    OR (LENGTH(token_distintivo) >= 5 AND regexp_replace(desc_lower, '\s', '', 'g') LIKE '%' || token_distintivo || '%')
    -- O alguno de los alias completos aparece
    OR (SELECT BOOL_OR(
          desc_lower LIKE '%' || LOWER(a) || '%'
          OR url_lower LIKE '%' || LOWER(REPLACE(a,' ','-')) || '%'
        ) FROM unnest(COALESCE(alias_conocidos, ARRAY[]::text[])) AS a)
  )
ORDER BY id;
```

El query es solo el **FILTRO barato**. NO discriminar a ojo (FP/FN en clusters numerados — lección 17-jun). En alquiler el regex tiene **menos señal aún** que en ventas (`nombre_edificio` suele ser NULL → el matching se apoya en GPS), así que el **juez LLM es todavía más decisivo**:

##### 3.1b — Juez LLM (lectura del anuncio) ⭐ v1.6

Si el query 3.1 devuelve >0 flaggeados, **lanzar UN agente `general-purpose`** que lea el texto real de cada prop y dé veredicto. Query para traer los textos:

```sql
SELECT v.id AS prop, pm.nombre_oficial AS pm_bd, p.latitud, p.longitud,
       left(lower(COALESCE(p.url,'')||' || '||COALESCE(p.datos_json_discovery->>'encabezado','')
            ||' || '||COALESCE(p.datos_json_enrichment->>'descripcion','')), 700) AS texto
FROM v_mercado_alquiler v JOIN propiedades_v2 p ON p.id=v.id
JOIN proyectos_master pm ON pm.id_proyecto_master=v.id_proyecto_master
WHERE v.id IN (<ids flaggeados por 3.1>);
```

El agente, por prop: identifica el edificio que NOMBRA el anuncio (nombre **+ número/torre exacto** — ojo clusters: Macororó 15≠19, Jazmines T2≠T3) y lo compara con `pm_bd`. Veredicto:
- **OK** — el anuncio nombra ese edificio (mismo nombre Y número).
- **ALIAS_FALTANTE** 🟡 — mismo edificio, variante de nombre → agregar a `alias_conocidos`.
- **MISMATCH** 🔴 — otro edificio → si existe como pm (buscar `nombre_oficial ILIKE` + GPS≤300m), indicar el pm correcto; si no, PM_NUEVO.
- **SIN_NOMBRE** 🟢 — el anuncio no nombra edificio → informativo.

Salida: tabla `prop | pm_bd | veredicto | edificio_del_anuncio | pm_correcto (si MISMATCH) | nota`. **Costo:** créditos solo en los flaggeados.

##### 3.1c — Acción + candado automático de cluster

- **MISMATCH con `pm_correcto`** → corregir (`id_proyecto_master = pm_correcto`, `metodo_match = 'auditor_3.1b_<fecha>'`).
- **⛓️ Candado AUTOMÁTICO si es CLUSTER numerado** (Macororó/Tamisa/Brickell/Portofino/Jazmines/Uptown/Sky/Stone N) — el matching se re-equivoca ahí si la prop vuelve a sin-match. Formato **objeto** canónico:
  ```sql
  UPDATE propiedades_v2 SET id_proyecto_master=<pm>, metodo_match='auditor_3.1b_<fecha>',
    campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
      'id_proyecto_master', jsonb_build_object('bloqueado',true,'por','auditor_3.1b','fecha','<fecha>',
        'razon','cluster numerado mal matcheado','valor_original',id_proyecto_master))
  WHERE id=<prop>;
  ```
- **MISMATCH no-cluster** → corregir sin candado. **MISMATCH "blando"** (pm placeholder) → revisión manual. **ALIAS_FALTANTE** → cargar alias + `REFRESH MATERIALIZED VIEW mv_nombre_proyecto_lookup`. **OK/SIN_NOMBRE** → sin acción.

**Particularidad alquiler**: el matching es históricamente más bajo que ventas (~80% vs ~87%). Las props **sin** `id_proyecto_master` no aparecen acá (este check filtra `IS NOT NULL`) — esas se cubren en el **check 3.5 (genéricos)**.

#### 3.5 Genéricos sin match — ¿se perdió un edificio? 🟡 (NUEVO v1.6)

En alquiler el feed usa LEFT JOIN: las props sin match **igual se muestran**, con el genérico del helper `nombreAlquiler` ("Monoambiente / Depto N dorm · microzona"). Eso **esconde** dos casos: (a) el anuncio realmente no nombra edificio (genérico legítimo), o (b) el anuncio **sí** nombra uno pero se perdió el match (match perdido oculto). Check:

```sql
SELECT v.id AS prop, v.zona,
       left(lower(COALESCE(p.url,'')||' || '||COALESCE(p.datos_json_discovery->>'encabezado','')
            ||' || '||COALESCE(p.datos_json_enrichment->>'descripcion','')), 700) AS texto
FROM v_mercado_alquiler v JOIN propiedades_v2 p ON p.id=v.id
WHERE v.id_proyecto_master IS NULL AND <filtro args>;
```

Escalar al **mismo agente LLM**: por prop, ¿el anuncio nombra un edificio? → **PM_EXISTENTE** (existe en proyectos_master por nombre+GPS → matchear), **PM_NUEVO** (nombre claro, no existe → crear), **SIN_NOMBRE** (genérico legítimo → dejar). Recupera los matches que el genérico ocultaba.

#### 3.2 GPS fuera de radio del pm — bandas de severidad (RECALIBRADO v1.1)

**Lógica anterior** (v1.0): flagueaba TODO exceso como 🔴, mezclando casos cosméticos con matching errado real. 4/5 borderline en test.

**Lógica nueva** (v1.1): bandas explícitas.

| Exceso (dist_m − radio_metros) | Severidad |
|---|---|
| ≤ 30m | 🟢 informativo (no reportar individualmente) |
| 30-100m | 🟡 ATENCIÓN (probable broker mal cargó GPS o pm con radio sub-dimensionado) |
| > 100m | 🔴 CRÍTICO (matching probablemente errado o pm con GPS errado) |

```sql
WITH gps_dist AS (
  SELECT v.id, v.fuente, v.nombre_edificio, v.id_proyecto_master,
         pm.nombre_oficial,
         ROUND(ST_Distance(
           ST_GeogFromText('POINT('||p.longitud||' '||p.latitud||')'),
           ST_GeogFromText('POINT('||pm.longitud||' '||pm.latitud||')')
         )::numeric, 1) AS dist_m,
         pm.radio_metros
  FROM v_mercado_alquiler v
  JOIN propiedades_v2 p ON p.id = v.id
  LEFT JOIN proyectos_master pm ON pm.id_proyecto_master = v.id_proyecto_master
  WHERE <filtro args>
    AND v.id_proyecto_master IS NOT NULL
    AND p.latitud IS NOT NULL AND pm.latitud IS NOT NULL
    AND NOT (p.campos_bloqueados ? 'id_proyecto_master')
)
SELECT *,
       (dist_m - radio_metros) AS exceso_m,
       CASE
         WHEN dist_m - radio_metros > 100 THEN 'CRITICO'
         WHEN dist_m - radio_metros > 30 THEN 'ATENCION'
         ELSE 'INFO'
       END AS severidad
FROM gps_dist
WHERE dist_m > radio_metros + 30  -- ignorar 🟢 (exceso ≤30m)
ORDER BY exceso_m DESC;
```

Para cada 🔴, discriminar 3 sub-casos antes de proponer acción:

**A. GPS del listing mal cargado por el broker** (más común)
- Síntoma: 1 prop con GPS distinto + las demás props vivas/históricas del mismo pm coinciden con el pm
- **Acción**: NO TOCAR NADA. El matching nominal está OK. El GPS del listing es cosmético.

**B. GPS del pm realmente errado** (raro)
- Síntoma: TODAS o casi todas las props del pm tienen GPS consistente entre sí pero DISTINTO del pm
- **Acción**: actualizar `proyectos_master.latitud/longitud` al GPS común

**C. Matching realmente errado**
- Síntoma: la prop apunta a OTRO pm — verificable con desc/url del listing
- **Acción**: reasignar `id_proyecto_master` + bloquear

**Cómo discriminar**: query histórica de GPS de TODAS las props del mismo pm:

```sql
SELECT id, status, latitud, longitud, fecha_creacion::date
FROM propiedades_v2
WHERE id_proyecto_master = <pm_id>
ORDER BY status, fecha_creacion DESC;
```

**Bien Inmuebles caveat**: BI tuvo bug histórico de GPS errado (3 km al norte) en prop 1385 / Ed. Europeo. Si aparece prop BI con GPS off pero nombre matchea → probablemente Caso A persistente. Verificar `campos_bloqueados ? 'latitud'`.

#### 3.3 Prefijo distintivo ambiguo 🟢 informativo (RECALIBRADO v1.1)

**Lógica anterior** (v1.0): flagueaba como 🟡 todas las props cuyo pm pertenecía a una familia (Sky, Eurodesign, etc.). **12/37 ruido en test** — el check por sí solo no es accionable.

**Lógica nueva** (v1.1): bajar a 🟢 informativo por default. **Solo escalar a 🟡** si se puede verificar (manual o regex) que la desc menciona OTRO miembro de la familia distinto al asignado.

```sql
WITH prefijos_distintivos AS (
  SELECT unnest(ARRAY[
    'eurodesign','sky','domus','luxe','santorini','spazios','hh',
    'uptown','smart','onix','nano','condado','portobello','portofino',
    'macororó','macororo','sirari','torre','spazi','sommet','baruc'
  ]) AS prefijo
)
SELECT v.id, v.nombre_edificio, v.id_proyecto_master AS pm_actual,
       pm.nombre_oficial,
       (SELECT array_agg(pm2.nombre_oficial) FROM proyectos_master pm2, prefijos_distintivos pd
        WHERE pm2.id_proyecto_master != v.id_proyecto_master
          AND pm2.activo = true
          AND LOWER(pm2.nombre_oficial) LIKE pd.prefijo || ' %'
          AND LOWER(pm.nombre_oficial) LIKE pd.prefijo || ' %'
       ) AS otros_mismo_prefijo
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
LEFT JOIN proyectos_master pm ON pm.id_proyecto_master = v.id_proyecto_master
WHERE <filtro args>
  AND v.id_proyecto_master IS NOT NULL
  AND pm.nombre_oficial IS NOT NULL
  AND NOT (p.campos_bloqueados ? 'id_proyecto_master')
  AND EXISTS (
    SELECT 1 FROM prefijos_distintivos pd
    WHERE LOWER(pm.nombre_oficial) LIKE pd.prefijo || ' %'
  );
```

**Reporte**: agrupar todos en una línea 🟢: "N props pertenecen a familias de prefijos (Sky:X, Eurodesign:Y, Baruc:Z). Verificación cruzada con desc no automatizada en v1.1 — revisar manualmente solo si check 3.1 también los flagea."

#### 3.4 nombre_edificio en alias de otro pm 🟡

```sql
SELECT v.id, v.nombre_edificio, v.id_proyecto_master AS pm_actual,
       pm2.id_proyecto_master AS pm_alternativo,
       pm2.nombre_oficial AS pm_alt_nombre
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
CROSS JOIN proyectos_master pm2
WHERE <filtro args>
  AND v.id_proyecto_master IS NOT NULL
  AND v.id_proyecto_master != pm2.id_proyecto_master
  AND pm2.activo = true
  AND pm2.alias_conocidos IS NOT NULL
  AND v.nombre_edificio = ANY(pm2.alias_conocidos)
  AND NOT (p.campos_bloqueados ? 'id_proyecto_master');
```

### 5. Capa 4 — Anomalías de extracción (3 checks)

Saltar si `--solo-criticos`.

#### 4.1 Área absurda 🔴

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.area_total_m2,
       LEFT(p.datos_json_enrichment->>'descripcion', 200) AS desc_inicio
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND v.tipo_propiedad_original = 'departamento'
  AND (v.area_total_m2 > 800 OR v.area_total_m2 < 20)
  AND NOT (p.campos_bloqueados ? 'area_total_m2')
ORDER BY v.area_total_m2 DESC;
```

**Calibración alquiler**: deptos en alquiler raramente <20m² (legal mínimo Bolivia ~25m²). Cota superior 800m² más permisiva que venta (penthouse grande plausible).

#### 4.2 Descripción muy corta o NULL 🟡

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.id_proyecto_master,
       COALESCE(LENGTH(p.datos_json_enrichment->>'descripcion'), 0) AS len_desc
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND COALESCE(LENGTH(p.datos_json_enrichment->>'descripcion'), 0) < 100
ORDER BY len_desc;
```

Diferenciar: 0 = sin cruda (pre-backfill, ya cubierto en paso 0) vs <100 = enrichment con desc real corta (raro, posible bug del extractor).

#### 4.3 Drift recurrente histórico 🟡 (exclusivo alquiler)

Props que aparecieron en audits mensuales anteriores con `bucket IN ('cambio_relevante', 'reescrita')` ≥2 veces en los últimos 60 días → broker volátil o listing inestable.

```sql
SELECT i.prop_id,
       COUNT(DISTINCT i.run_id) AS veces_drift,
       ARRAY_AGG(DISTINCT i.bucket) AS buckets,
       MAX(r.run_at)::date AS ultimo_run
FROM audit_descripciones_items i
JOIN audit_descripciones_runs r ON r.id = i.run_id
WHERE i.tipo_operacion = 'alquiler'
  AND i.bucket IN ('cambio_relevante', 'reescrita')
  AND r.run_at >= NOW() - INTERVAL '60 days'
  AND i.prop_id IN (
    -- Solo props del rango temporal de esta corrida
    SELECT v.id FROM v_mercado_alquiler v
    JOIN propiedades_v2 p ON p.id = v.id
    WHERE <filtro args>
  )
GROUP BY i.prop_id
HAVING COUNT(DISTINCT i.run_id) >= 2
ORDER BY veces_drift DESC;
```

**Acción**: marcar como 🟡 "listing inestable". Considerar revisar manualmente o flagear el broker.

**Notas de schema**: `audit_descripciones_runs.run_at` (timestamp with time zone), NO `created_at`.

#### 4.4 Área cruda ↔ BD por LECTURA 🟡 (NUEVO v1.4)

Mismo principio de lectura que el 2.9, pero para superficie. **Reusar los datos que ya trajo el 2.9** (`area_bd` + `desc_full` ya están en esa query — no hace falta otra). El agente lee la cruda y busca el área en m². Cierra el hueco donde el extractor toma un m² distinto al de la cruda (ej. #1808 el 25-may: 37 m² en BD vs 42 m² en la cruda) — ni el semanal ni el mensual lo veían (solo detectan área *absurda*, no *discrepante*).

**Cómo leer**:
1. Buscar en la cruda "superficie", "m²", "metros", "X m2" referido a **la unidad**.
2. Si la cruda da un área clara y difiere de `area_bd` >10% → 🟡 (el área cambia precio/m² y comparables).
3. Cuidado con ambigüedad: algunas crudas dan área de terreno + construida, o de varias tipologías. Si no es claro cuál es la unidad → 🟡 revisar, no 🔴.
4. **Siempre** mostrar `area_bd` vs área leída + el fragmento textual.

**Anti-FP**: redondeos (38 vs 37.92) NO se reportan. Solo diferencias >10% con área inequívoca en la cruda.

### 5.5 Anexo A — Barrido cola barata (fuera de ventana) 🔴 (NUEVO v1.4)

Saltar si `--cola=0`. **No respeta el filtro temporal** de la ventana — ese es su propósito. Sí respeta el race-condition guard (excluir editadas <30min) salvo `--incluir-recientes`.

**Por qué.** Los bugs de precio (USD metido en el campo BOB, conversión de moneda mal) producen **siempre** números bajos. La cola barata del feed es un imán de ese bug. Este anexo mira las props más baratas de **todo el feed** (no solo la ventana), porque ahí el error se concentra. Validado el 25-may-2026: los 3 errores de precio reales del día (#1835, #1898, #1240) eran **todos** de la cola barata, y 2 eran props viejas que la ventana nunca habría tocado.

**Mecánica anti-repetición.** Excluye props con `precio_mensual_bob` ya candado. Así: las que revisás y candás —corregidas O confirmadas-OK— salen de la lista, y la próxima corrida muestra las siguientes baratas sin verificar. La lista **se agota** en vez de repetirse semana a semana.

Query (top-N baratas sin candar, con cruda):

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.zona, v.dormitorios AS dorm,
       v.area_total_m2 AS area_bd, v.amoblado,
       v.precio_mensual_bob AS bob_bd,
       ROUND(v.precio_mensual_bob / NULLIF(v.area_total_m2,0),1) AS bs_m2,
       p.datos_json_enrichment->>'descripcion' AS desc_full
FROM v_mercado_alquiler v
JOIN propiedades_v2 p ON p.id = v.id
WHERE NOT (p.campos_bloqueados ? 'precio_mensual_bob')
  AND v.precio_mensual_bob > 0
  AND (p.fecha_actualizacion IS NULL OR p.fecha_actualizacion < NOW() - INTERVAL '30 minutes')
ORDER BY v.precio_mensual_bob ASC
LIMIT 15;  -- o --cola=N
```

**Análisis**: aplicar a cada una la lógica de lectura de los checks **2.9** (precio) y **4.4** (área). Son ≤15 props → leelas todas. En el reporte:
- Las que tienen mismatch de precio → 🔴 (SQL de corrección + candado).
- Las que tienen mismatch de área o ambigüedad → 🟡.
- Las que coinciden → agruparlas en 1 línea "N baratas verificadas OK".

**Dedup**: si una prop ya apareció en el check 2.9 (cae dentro de la ventana), no la repitas — reportala una sola vez.

**Cierre sugerido**: para las baratas verificadas correctas, ofrecé candar el precio (`por='audit_cola_barata'`) para que salgan del barrido futuro. Para las corregidas, el SQL de corrección ya las canda.

### 6. Aplicar reglas de filtrado de ruido

Antes de armar el reporte:

- **flags_semanticos precio_m2**: agrupar todos en 1 línea informativa (mal calibrado para alquiler).
- **HTML entities** en desc: ignorar diferencias textuales `&nbsp;`, `&amp;`, `&quot;`, `&#39;`.
- **Sin cruda**: agrupar las props sin cruda (paso 0) en 1 línea + sugerir backfill si N>5.
- **Caracteres unicode estilizados** (𝘊, 𝘢, etc.): cubierto por normalización en 3.1.
- **GPS exceso ≤30m**: ya filtrado en query 3.2 (banda 🟢).
- **Prefijo distintivo ambiguo**: agrupado en 1 línea 🟢 (no individual).

### 7. Estructurar el reporte ejecutivo

```
# Audit Semanal — feed /alquileres — YYYY-MM-DD
# Ventana: <desde> → <hasta> (N días, M props auditadas, K excluidas por race condition, S sin cruda)

## 🔴 CRÍTICO (X props con acción inmediata sugerida)

### Cambio de precio explícito (N props)
| ID | Edificio | Bs BD | Bs desc | diff % |

### Precio cruda ↔ BD por lectura (N props)  ← check 2.9 (v1.4)
| ID | Edificio | Bs BD | Bs leído cruda | diff % | fragmento textual |

### Precio absurdo (N props)
| ID | Edificio | zona | Bs/mes | área | Bs/m²/mes |

### Amoblado mismatch (N props)
| ID | Edificio | amoblado BD | desc dice | impacto comercial |

### Matching potencialmente errado (N props)
Sub-clasificado: alias faltante / edificio distinto / falso positivo residual
| ID | nombre_edificio | pm asignado | token distintivo | hallazgo |

### GPS fuera de radio >100m (N props)
Discriminar: GPS pm errado / GPS listing errado / matching realmente mal
| ID | pm | dist_m | exceso | hipótesis |

### Área absurda (N props)
| ID | Edificio | área BD | área en desc |

### Dormitorios=0 vs cruda (N props)
| ID | Edificio | área | cruda dice | acción |

### Precio cruda↔BD ambiguo / USD-paralelo (N props)  ← check 2.9 (v1.4)
| ID | Edificio | Bs BD | cruda dice | por qué ambiguo |

## 🟡 ATENCIÓN (Z props para revisar manualmente)

- Mascotas mismatch: [tabla]
- Expensas mismatch: [tabla]
- Área cruda ↔ BD >10% (check 4.4, v1.4): [tabla con área BD | área cruda | fragmento]
- nombre_edificio sospechoso: [tabla]
- GPS exceso 30-100m: [tabla]
- nombre coincide con alias de otro pm: [tabla]
- Descripciones muy cortas: [tabla]
- Drift recurrente histórico (≥2 cambios 60d): [tabla]

## 🔵 ANEXO A — Cola barata (fuera de ventana, v1.4)

- Baratas auditadas (top-N sin candar): <N>
- 🔴 Precio mal extraído: [tabla con SQL]
- 🟡 Área/ambiguo: [tabla]
- ✅ Verificadas OK (candables para que salgan del barrido futuro): <N> [IDs]

## 🟢 INFORMATIVO

- Total auditado: <M> props
- Excluidas por race condition (editadas <30min): <K> props
- Sin cruda en BD (sugerir backfill si >5): <S> props
- Distribución por día/fuente: [tabla]
- flags_semanticos precio_m2 (falso positivo conocido, NO accionar): <N> props
- Prefijo distintivo ambiguo (informativo, no accionable solo): <N> props (familias: ...)
- GPS exceso ≤30m (cosmético): <N> props
- Capa 1 (drift portal + listings muertos) NO ejecutada — usar `/audit-feed-alquileres-mensual`
```

### 8. Pregunta al usuario qué accionar

**NUNCA aplicar UPDATEs sin confirmación del usuario.** El MCP `postgres-sici` es readonly. Los SQL los aplica el humano desde Supabase UI o psql.

Después del reporte:
- ¿Aplicar SQL críticos? (precio absurdo, área absurda son seguros)
- ¿Querés que abra alguna prop en navegador?
- ¿Hay aliases que querés agregar a algún pm?

#### ⚠️ FORMATO CANÓNICO DEL CANDADO (igual que ventas — verificado en el pipeline alquiler 8-jun-2026)

El merge de alquiler (`merge_alquiler`) y los `registrar_*_alquiler` usan el helper **`_is_campo_bloqueado`** (compartido con ventas), que **solo reconoce el candado si el valor es un objeto** `{"bloqueado": true, ...}` o un boolean. Un **string** (ej. `{"precio_mensual_bob":"audit_cola_barata"}`) **NO protege**: el merge nocturno lo ignora y repisa el campo. Los *checks* de este audit usan `?` (existencia de key) que es más laxo → trampa: parece candado pero el pipeline no lo respeta.

**Plantilla obligatoria** (objeto, replica el panel admin) — aplica a `precio_mensual_bob`, `dormitorios`, `area_total_m2`, etc.:
```sql
UPDATE propiedades_v2 SET <campo> = <valor>,
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) ||
    jsonb_build_object('<campo>', jsonb_build_object(
      'bloqueado', true, 'por', 'audit_<motivo>', 'fecha', '<YYYY-MM-DD>', 'valor_original', <viejo>))
WHERE id = <id>;
```
Donde el flujo arriba dice candar (`por='audit_dormitorios'`, `por='audit_cola_barata'`), usar SIEMPRE este formato objeto, NUNCA un string. Verificación post-fix: `SELECT campo_esta_bloqueado(campos_bloqueados,'<campo>') FROM propiedades_v2 WHERE id IN (...)` debe dar `true`. **Alternativa más segura: corregir desde el panel admin** (escribe el objeto solo).

## Datos útiles para el análisis

- **TC oficial**: 6.96 (USD = BOB / 6.96)
- **Total feed actual**: ~149 props vivas en `v_mercado_alquiler` (filtro ≤150d)
- **Distribución por fuente**: ~111 C21, ~29 Remax, ~1 BI
- **Volumen semanal típico**: 22-30 props nuevas (C21 ~16, Remax ~6, BI ~0-1)
- **Vida mediana en mercado**: C21 34d, Remax 73d
- **Casos canónicos detectados en test inicial (6-13 may 2026)**:
  - **GPS muy fuera de radio (CASO C / A confirmado)**: #1832 Garden — pm 101 Garden Equipetrol, prop a 1195m del pm (corregido manualmente 13 may por el user)
  - **Alias faltantes detectados**: "Plaza Italia" (pm 275 Eurodesign Soho), "Eurodesign LeBlanc" sin espacio (pm 112)
  - **Bug enrichment aislado**: #1807 (1 sola prop sin cruda post-9-may)
  - **Falso positivo conocido del flag precio_m2**: 8 props (umbral $500/m² aplicado a alquiler — backlog: separar venta vs alquiler)

## Diferencias con `/audit-feed-alquileres-mensual`

| Aspecto | Mensual | Semanal v1.4 |
|---|---|---|
| Frecuencia | 1 vez/mes | 1 vez/semana o ad-hoc |
| Costo | $0 (curl) | $0 (solo SQL) |
| Tiempo | ~30-60s para 141 props | <30s (lectura de crudas suma algo) |
| Capa 1 (drift portal) | ✅ Sí (curl) | ❌ No |
| Listings muertos (HTTP/HTML) | ✅ Sí | ❌ No |
| Comparación precio cruda vs BD | ✅ Sí (regex JS, todo el feed) | ✅ Sí (lectura del agente, ventana + cola barata) — check 2.9 v1.4 |
| Comparación área cruda vs BD | ❌ No (hueco compartido) | ✅ Sí (lectura del agente) — check 4.4 v1.4 |
| Cola barata (fuera de ventana) | (cubre todo el feed) | ✅ Anexo A v1.4 (top-N sin candar) |
| Capa 2 (internas) | 🟡 4 flags semánticos | ✅ 9 checks |
| Capa 3 (matching) | ✅ 1 check | ✅ 4 checks (con tokenización + bandas GPS) |
| Capa 4 (anomalías) | ❌ No directamente | ✅ 4 checks |
| Race condition guard | ❌ No | ✅ Sí (30 min) |
| Drift recurrente histórico | (genera la data) | ✅ Usa los runs anteriores |
| Persistencia | `audit_descripciones_runs` con `tipo_operacion='alquiler'` | ❌ No persiste |

## Lecciones de calibración (changelog)

### v1.4 — 2026-05-25 (cerrar hueco de precio mal extraído)

Surge de una sesión donde el user encontró a mano precios mal extraídos que el semanal no marcaba (#1835: 2.158 Bs en BD vs 3.100 Bs en la cruda). Diagnóstico de los dos huecos:

1. **Ventana temporal**: el semanal solo mira props nuevas → no ve inventario viejo. 8/10 de las props más baratas con error eran viejas.
2. **Sin comparación de precio-número**: el único check de precio era el 2.2 (Bs/m² absurdo). Un precio mal pero con ratio plausible (#1835 = 56.8 Bs/m²) se escapa.

**El error de diseño que se corrige**: se había interpretado "solo SQL" como "la detección debe ser SQL", y por eso el viejo 2.1 se eliminó sin reemplazo (el regex SQL daba 100% FP). La corrección: **el SQL solo trae los datos; el agente lee la cruda y compara con juicio**. Eso da la robustez del regex JS del mensual sin sus límites, y 0 FP en el test del 25-may (las 10 baratas).

Cambios:
- **Check 2.9** (precio cruda↔BD por lectura) — reemplaza conceptualmente al 2.1.
- **Check 4.4** (área cruda↔BD por lectura) — cierra hueco compartido con el mensual.
- **Anexo A** (cola barata fuera de ventana, excluye candadas → se agota).
- Arg `--cola=N` (default 15).

Casos del 25-may que estos checks ahora cazan: #1835 (precio, lo cazaría 2.9 y Anexo A), #1808 (área 37 vs 42, lo caza 4.4), #1240 (USD-paralelo → 🟡 revisar, no FP).

### v1.3 — 2026-05-24

Agregado check 2.8 (dormitorios=0 vs cruda), alineado con `/audit-feed-ventas-semanal` v1.2. Surge de la auditoría del bug "discovery pisa overrides LLM" (memoria `audit_overrides_llm_dorms.md`). Solo se chequea la dirección inversa (1-dorm real catalogado como 0); el caso directo lo cubre el guardrail mono del merge alquiler (mig 214/247). El barrido de cierre del 24 may dio 0 monoambientes mal catalogados en alquiler.

### v1.2 — 2026-05-13 (post-retest sobre las mismas 37 props con v1.1 aplicado)

Tras aplicar v1.1, re-test mostró 2 FP residuales que se solucionan con calibraciones quirúrgicas:

| Falso positivo residual v1.1 | Causa | Fix v1.2 |
|---|---|---|
| **Check 2.3 amoblado** — 1/1 FP (1823 Aguaí: BD=no, desc dice "Cocina equipada **con muebles** altos y bajos") | Regex `con muebles` matchea muebles de cocina (frase estándar en deptos no amoblados) | Remover `con muebles` del regex. Dejar solo `(amoblad\|incluye muebles\|furnished)` |
| **Check 3.1 matching** — 1/3 FP (1739 NanoTec: desc dice "nano tec" con espacio, token "nanotec" sin boundaries no matchea) | Boundary regex exige cadena contigua, no admite espacios en variantes ortográficas | Agregar 2do match contra `regexp_replace(desc/url, '\s', '', 'g')` (versión sin espacios). Resuelve automáticamente "Nano Tec"/"NanoTec", "Le Blanc"/"LeBlanc" sin necesidad de alias manuales |

**Tasa de FP esperada post-v1.2**: <5% (los FP residuales pasan a ser solo desc realmente incompletas del broker, no errores del check).

### v1.1 — 2026-05-13 (post-test 7 días sobre 37 props)

**Tasa de falsos positivos del v1.0**: 22/37 (59%). Calibraciones aplicadas:

| Falso positivo | Causa | Fix v1.1 |
|---|---|---|
| **Check 2.1 precio Bs** — 13/13 props flaguadas, todas coincidían con BD | El regex solo verificaba mención "Bs.", no extraía ni comparaba el número | **Check eliminado**. El mensual ya lo cubre con flag `precio_aparecio`. Para semanal sin JS post-SQL no hay forma de hacerlo bien |
| **Check 2.4 amoblado** — 4/4 deptos NO amoblados flaguados como "BD=no pero desc dice equipado" | Regex `equipad` matcheaba "cocina equipada" (estándar en deptos no amoblados) | Quitar `equipad` del regex de positivos. Solo dejar `amoblad\|con muebles\|incluye muebles\|furnished` |
| **Check 2.5 mascotas** — 2/2 BD=false correcto flaguado como mismatch | Regex `aceptan? mascotas` sin lookbehind matcheaba "**No** acepta mascotas" | PostgreSQL POSIX no soporta lookbehind. Solución: agregar condición negativa `AND desc !~* '(no.{0,10}mascotas\|sin mascotas\|no se aceptan\|no.{0,5}aceptan? mascotas\|no pets)'` |
| **Check 3.1 matching** — 4/6 falsos positivos por variantes ortográficas | Buscaba cadena completa del nombre_oficial. Falla con "LeBlanc"/"Le Blanc", "Nano Tec"/"NanoTec", nombres compuestos parciales | Tokenizar nombre_oficial → primera palabra distintiva (no "Edificio/Condominio/Torre/etc"). Buscar token con boundaries `(^\|[^a-z])token([^a-z]\|$)` |
| **Check 3.2 GPS** — 4/5 borderline reportados como 🔴 cuando eran cosméticos | Sin bandas de severidad implementadas | Bandas explícitas: ≤30m exceso 🟢 (no reportar), 30-100m 🟡, >100m 🔴 |
| **Check 3.3 prefijo ambiguo** — 12/37 (32%) ruido | El check por sí solo identifica familias correctamente, pero no es accionable sin verificación cruzada de desc | Bajar a 🟢 informativo agrupado. Verificación cruzada (desc menciona otra familia) queda como mejora v1.2 |

**Hallazgos accionables reales sobre 37 props auditadas**:
- 1 GPS críticamente fuera (1832 Garden, corregido manualmente)
- 2 aliases sugeridos (Plaza Italia, Eurodesign LeBlanc)
- 1 bug aislado de enrichment (1807, queda como deuda)

Tasa de señal real post-calibración: ~10% (4/37).

### v1.0 — 2026-05-13

Versión inicial. Clonada de `/audit-feed-ventas-semanal` v1.1 con adaptaciones para alquiler. Test de 7 días reveló los falsos positivos documentados arriba.
