---
description: Audit semanal del feed /ventas sin Firecrawl — capas 2+3+4 sobre props nuevas/rango. Costo $0. Reporte ejecutivo con SQL listo. Sin persistencia. v1.3: detector TC reescrito (solo doble normalización paralelo, no más falsos positivos en no_especificado).
---

# Audit semanal — feed /ventas

Variante liviana del audit mensual. Cubre props nuevas en una ventana temporal usando solo SQL via MCP `postgres-sici`. **No usa Firecrawl** — por eso no detecta drift contra el portal en vivo, pero captura el 80% del valor del mensual a costo $0.

Cuándo usarlo: lunes a la mañana (o cualquier día) para limpiar la deuda de props nuevas mientras están frescas. Complementa al `/audit-feed-ventas-mensual` que cubre todo el feed + drift Firecrawl.

## Versión actual: v1.4 — 25-may-2026

v1.4 agrega un guard contra falso positivo: "0 props nuevas de una fuente" en el conteo base **NO** significa "discovery caído" (el conteo solo mira props nuevas que entran al feed). Para saber si el discovery corrió, mirar `fecha_discovery`, no este conteo. Ver nota en el paso 2.

## v1.3 — 25-may-2026

v1.3 **reescribe el detector de TC** tras un falso positivo grave: los viejos checks 2.1 (TC paralelo no mapeado) y 2.2 (no_especificado→oficial) hacían comparar `precio_usd` contra el USD de la desc y flaguear el gap ~1.43× como "inflación" — pero ese gap es **correcto** en `no_especificado` (es oficial vs billete). Se marcaron Condado/Sky Tower/terreno como inflados cuando estaban bien. Ahora hay **un solo check de TC** (2.1) que detecta exclusivamente la **doble normalización** real (`tc=paralelo` + `precio_usd`=oficial en vez de billete, ratio 1.2–1.6), con el modelo TC escrito arriba como reglas de oro. El 2.2 se eliminó (cosmético + ruidoso). Ver `MODELO TC` en Capa 2 y memoria `precio_paralelo_vs_oficial_billete.md`.

## Versión previa: v1.2 — 24-may-2026

v1.2 agrega el check 2.8 (dormitorios=0 que contradice la cruda) — único hueco que el merge no cubre solo. Resto sin cambios respecto a v1.1.

## v1.1 — post-test 12-may-2026

Calibraciones aplicadas tras el primer test (ver sección "Lecciones de calibración" al final):
1. **TC se evalúa con `tipo_precio` calculado** (moneda_original + tipo_cambio_detectado), no solo tc
2. **Check 3.1 ignora candados de admin** — si pm/edificio están bloqueados, no flaguea
3. **Filtro temporal de race condition** — excluye props con `fecha_actualizacion < 30 min` (recién editadas en admin)
4. **Prefijo ambiguo solo distintivos** — no flaguea prefijos genéricos ("Edificio", "Condominio")
5. **Normalización unicode** — tolera caracteres estilizados (𝘊 = C, etc.) en check de nombre en desc
6. **Nuevo check**: TC `no_especificado` que debería ser `oficial` (moneda=BOB con ratio 6.96 confirmado)

## Argumentos

| Arg | Default | Ejemplo |
|---|---|---|
| (sin args) | últimos 7 días | `/audit-feed-ventas-semanal` |
| `--dias=N` | 7 | `--dias=14` |
| `--desde=YYYY-MM-DD` | NOW − dias | `--desde=2026-05-01` |
| `--hasta=YYYY-MM-DD` | NOW | `--hasta=2026-05-12` |
| `--ids=N,M,...` | (todos del rango) | `--ids=1791,1820` |
| `--solo-criticos` | false | filtra capa 4 (anomalías menores) |
| `--incluir-recientes` | false | NO excluye props editadas en últimos 30 min |

**Reglas de combinación**:
- `--desde` + `--hasta` ganan sobre `--dias`
- `--ids` overrides todo (audit puntual de props específicas, ignora rango temporal)
- Por default se excluyen props con `fecha_actualizacion >= NOW() - 30 min` (race condition guard)

## Flujo de ejecución

Cuando el usuario invoca `/audit-feed-ventas-semanal` (con o sin args):

> **🔒 AISLAMIENTO MACROZONA (mig 257) — aplica a TODOS los checks.** Esta skill audita **SOLO Equipetrol**. Desde que entró Zona Norte en producción, `v_mercado_venta` trae EQ+ZN mezclados. En cada check filtrá la macrozona:
> - Si el check usa `v_mercado_venta v` → agregá `AND v.zona_general = 'Equipetrol'`.
> - Si el check va contra `propiedades_v2 p` directo (sin la vista) → agregá `AND macrozona_de(p.zona) = 'Equipetrol'`.
>
> Sin esto, los checks flaguean ~399 props de Zona Norte que NO son del scope.

### 1. Parsear args y construir filtro WHERE base

```sql
-- Filtro temporal base
WHERE p.fecha_creacion BETWEEN '<desde>' AND '<hasta> 23:59:59'

-- Aislamiento macrozona (mig 257): SOLO Equipetrol (ver nota arriba)
AND v.zona_general = 'Equipetrol'

-- Filtro de race condition (excluir editadas en últimos 30 min, salvo --incluir-recientes)
AND (p.fecha_actualizacion IS NULL OR p.fecha_actualizacion < NOW() - INTERVAL '30 minutes')
```

### 2. Conteo base + distribución por día/fuente

```sql
SELECT 
  DATE(p.fecha_creacion) AS dia,
  p.fuente,
  COUNT(*) AS nuevas
FROM v_mercado_venta v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
GROUP BY 1,2
ORDER BY 1 DESC, 2;
```

> **⚠️ NO confundir "0 props nuevas de una fuente" con "discovery caído"** (falso positivo del 25-may-2026). Este conteo solo cuenta props **nuevas que entran al feed** (`JOIN v_mercado_venta` + `fecha_creacion` en ventana). Una fuente puede haber corrido perfecto y dar 0 acá: discovery casi siempre **re-encuentra** props existentes (no crea filas) y las nuevas pueden quedar filtradas (sin zona, excluidas, duplicadas, <20m²). Remax venta es bajo volumen y normalmente aporta pocas o cero nuevas/semana. **Para saber si el discovery corrió, mirar `fecha_discovery` (regla 11: se pisa con NOW() cada noche), NO este conteo:**
> ```sql
> SELECT fuente, COUNT(*) FILTER (WHERE fecha_discovery::date >= CURRENT_DATE - 7) AS tocadas_7d,
>        MAX(fecha_discovery) AS ultima
> FROM propiedades_v2 WHERE tipo_operacion='venta' GROUP BY fuente;
> ```
> Si `ultima` es de hoy/ayer → corrió. Solo alarmar si una fuente NO tiene discovery reciente.

### 3. Capa 2 — Inconsistencias internas (7 checks)

#### ⚠️ MODELO TC — leer antes de cualquier check de precio (evita el falso positivo del 25-may-2026)

En Bolivia conviven dos "dólares": **oficial** (TC 6.96) y **paralelo/billete** (~10.2, lo que se paga en dólares físicos). Una propiedad tiene UN precio en Bs, expresado en dos monedas-dólar. El sistema almacena así (verificado en `precio_normalizado()` + viewdef de `v_mercado_venta`):

| `tipo_cambio_detectado` | qué guarda `precio_usd` | qué hace `precio_normalizado()` |
|---|---|---|
| `paralelo` | el **billete** (el USD escrito en la desc) | `precio_usd × tc_paralelo / 6.96` → lo sube al comparable oficial |
| `oficial` / `no_especificado` / NULL | el **valor oficial** ya (Bs/6.96) | devuelve `precio_usd` directo (ya es el comparable) |

**REGLAS DE ORO de la auditoría (no romperlas):**
1. **El gap ~1.43× entre `precio_usd` y el USD de la descripción es ESPERADO y CORRECTO en `no_especificado`/`oficial`** (es oficial vs billete, no inflación). **NUNCA flaguearlo.** Esto rompió el audit del 25-may: se marcó Condado/Sky Tower/terreno como "inflados 43%" cuando estaban bien, y la "corrección" los habría roto.
2. El feed muestra el **comparable** (`precio_norm`), no el billete. Que muestre $342K cuando la desc dice $238K billete es correcto en `no_especificado`.
3. El **único** bug precio-TC que se audita es la **doble normalización** (check 2.1). Nada más se flaguea por TC.

#### 2.1 Doble normalización TC paralelo (`precio_usd` = oficial en vez de billete) 🔴

**Único check de TC.** Solo aplica a `tc=paralelo`. Firma confiable: `ratio = precio_usd / (USD escrito en la desc)`. Correcto → ratio ≈ 1.0. Bug → ratio ≈ 1.2–1.6 (`precio_usd` quedó en oficial; la función lo vuelve a multiplicar → feed inflado ~30-46%). El SQL **clasifica solo** — sin paso de "análisis humano difuso" que invite a sobre-flaguear:

```sql
WITH par AS (
  SELECT v.id, v.fuente, v.nombre_edificio, v.precio_usd, v.area_total_m2,
         p.datos_json_enrichment->>'descripcion' AS d
  FROM v_mercado_venta v JOIN propiedades_v2 p ON p.id = v.id
  WHERE <filtro args>
    AND v.tipo_cambio_detectado = 'paralelo'
    AND NOT (p.campos_bloqueados ? 'precio_usd')
),
ext AS (
  SELECT *, COALESCE(
      (regexp_match(d, '(?:\$us|usd|\$)\s*([0-9][0-9.,]{4,})', 'i'))[1],
      (regexp_match(d, '([0-9][0-9.,]{4,})\s*(?:\$us|usd|d[oó]lares|\$)', 'i'))[1],
      (regexp_match(d, 'precio[^0-9]{0,14}([0-9][0-9.,]{4,})', 'i'))[1]
    ) AS desc_raw
  FROM par
), calc AS (
  SELECT id, fuente, nombre_edificio, precio_usd, area_total_m2, desc_raw,
    NULLIF(regexp_replace(desc_raw,'[.,]','','g'),'')::numeric AS billete_desc
  FROM ext
)
SELECT id, fuente, nombre_edificio, precio_usd, billete_desc,
  ROUND(precio_usd / NULLIF(billete_desc,0), 3) AS ratio,
  CASE
    WHEN billete_desc IS NULL THEN 'sin USD en desc — no verificable (skip)'
    WHEN precio_usd/billete_desc BETWEEN 0.90 AND 1.10 THEN 'OK (precio_usd = billete)'
    WHEN precio_usd/billete_desc BETWEEN 1.15 AND 1.60 THEN '🔴 BUG doble norm — corregir precio_usd = billete_desc + candar'
    WHEN precio_usd/billete_desc < 0.5 THEN 'revisar con check 2.4 (posible parse magnitud) o regex agarró un BOB'
    ELSE 'ratio raro — regex agarró mal número (skip, NO flaguear)'
  END AS diagnostico
FROM calc
WHERE billete_desc IS NOT NULL
ORDER BY ratio DESC NULLS LAST;
```

Flaguear 🔴 **solo** las filas `diagnostico = '🔴 BUG...'`. Fix: `precio_usd = billete_correcto` + candar `precio_usd`. **No tocar las `OK` ni las `skip`.**

##### ⚠️ VERIFICACIÓN POR LECTURA OBLIGATORIA (no "1-2" — TODAS las que vas a corregir)

El `billete_desc` lo saca un **regex que toma el PRIMER monto USD de la desc**, y eso falla cuando el aviso tiene **varios precios**. Antes de proponer cualquier corrección, **leé la desc completa de CADA prop a tocar** (`SELECT datos_json_enrichment->>'descripcion'`) y confirmá que el monto es el del **departamento solo**, NO:
- **Parqueo / garaje / cochera / baulera** con su propio precio (caso #2142: "CON PARQUEO 105.000" / "SÓLO DPTO **95.000**" → el correcto es 95.000, el regex tomó 105.000).
- Garantía, comisión, expensas, IMT, o el precio de otra tipología/unidad del proyecto.

**Regla multi-precio:** si la desc contiene `parqueo|garaje|cochera|baulera` con monto, o hay **2+ montos USD**, NO confíes en el `billete_desc` del regex:
1. Tomá el monto rotulado como `precio departamento|sólo dpto|depto|departamento` (el del depto sin extras).
2. Si no se puede desambiguar con seguridad → reportá 🟡 "múltiples precios — verificar a mano", NO des un número.

Recién con la lectura confirmada armá el `UPDATE ... SET precio_usd = <billete del depto>` + candado. **Nunca dar valores en masa directo del regex.**

#### 2.2 (ELIMINADO) — `no_especificado` → `oficial` NO se audita

Era cosmético (ambos resuelven a "USD Oficial" con el mismo `precio_norm`) y generaba ruido masivo + el falso positivo del 25-may. **No flaguear props `no_especificado`/`oficial` por TC.** Si alguna vez se quiere limpiar el label, es un backfill aparte, fuera del audit.

#### 2.3 Cambio de precio explícito en desc 🔴

Detección: descripción menciona "Nuevo Precio", "REBAJA", "Oferta", "Antes:", "Antes $", "Bajó", "Descuento" + el precio mencionado difiere >10% de `precio_usd` BD.

```sql
SELECT v.id, v.nombre_edificio, v.precio_usd,
       p.datos_json_enrichment->>'descripcion' AS desc
FROM v_mercado_venta v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND p.datos_json_enrichment->>'descripcion' ~* '(nuevo precio|rebaja|oferta|antes:|antes \$|bajó|descuento)'
ORDER BY v.id;
```

Para cada uno: leer desc, comparar precio mencionado vs BD. Si diff >10%, flagear.

#### 2.4 Precio absurdo 🔴

Detección: `precio_usd / area_total_m2` fuera de [$500, $8000] en departamentos.

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.precio_usd, v.area_total_m2,
       ROUND(v.precio_usd / v.area_total_m2, 0) AS precio_m2
FROM v_mercado_venta v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND v.tipo_propiedad_original = 'departamento'
  AND (v.precio_usd / v.area_total_m2 < 500 OR v.precio_usd / v.area_total_m2 > 8000)
ORDER BY precio_m2;
```

**Nota**: el admin ya muestra alerta "$/m² alto" cuando >$3,000. Esta capa **complementa** marcando casos bug del extractor (típicamente <$500/m² o >$10,000/m²).

#### 2.5 nombre_edificio en casa/terreno 🟡

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.tipo_propiedad_original
FROM v_mercado_venta v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND v.tipo_propiedad_original IN ('casa','terreno')
  AND v.nombre_edificio IS NOT NULL
  AND NOT (p.campos_bloqueados ? 'nombre_edificio')
ORDER BY v.id;
```

**Importante**: excluir props con `nombre_edificio` ya bloqueado (admin lo revisó). Las casas/terrenos no tienen edificio.

#### 2.6 nombre_edificio sospechoso 🟡

Detección: `LENGTH(nombre_edificio) > 50`, contiene `\n` (CHR(10)), o coincide con basura típica. **Excluir si está bloqueado.**

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.id_proyecto_master,
       LENGTH(v.nombre_edificio) AS len
FROM v_mercado_venta v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND NOT (p.campos_bloqueados ? 'nombre_edificio')
  AND (
    LENGTH(v.nombre_edificio) > 50
    OR v.nombre_edificio ~ E'\\n'
    OR v.nombre_edificio ~* '^(planta|edificio de|de edificio|en venta|venta|alquiler|monoambiente)$'
  );
```

**Nota**: si `id_proyecto_master` está OK, el feed muestra el nombre del pm — no es bug visible. Reportar como 🟡 (limpieza interna, no urgente).

#### 2.7 Inconsistencia booleanos vs desc 🟡

Detección: campos `parqueo_incluido`, `baulera_incluido`, `solo_tc_paralelo`, `acepta_permuta` cuyo valor BD contradice la descripción. **Excluir si bloqueados.**

Para cada uno verificar:
- `parqueo_incluido = true` pero desc dice "Parqueo: $X" o "Parqueo aparte" o "Parqueo opcional"
- `baulera_incluido = true` pero desc dice "Baulera: $X"
- `plan_pagos_desarrollador = true` pero desc dice "solo contado", "al contado", "exclusivo contado"

#### 2.8 Dormitorios=0 contradice la cruda 🔴 (NUEVO v1.2)

Detección: `dormitorios = 0` (catalogada monoambiente) pero la cruda NO dice "monoambiente" y SÍ menciona "N dormitorio(s)". El portal o el LLM pueden haber bajado a 0 un depto real de 1+ dorm (alucinación por "studio"/"smart studio", o number_bedrooms=0 del portal). Caso real detectado: #1537 (Cond Hamburgo 65m², cruda "1 DORMITORIO", estaba en 0).

```sql
SELECT v.id, v.fuente, v.dormitorios AS col_d, v.area_total_m2 AS area,
       LEFT(regexp_replace(p.datos_json_enrichment->>'descripcion', E'[\r\n]+',' ','g'), 160) AS desc_inicio
FROM v_mercado_venta v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND v.dormitorios = 0
  AND NOT (p.campos_bloqueados ? 'dormitorios')
  AND p.datos_json_enrichment->>'descripcion' IS NOT NULL
  AND p.datos_json_enrichment->>'descripcion' !~* 'mono ?-?ambiente'
  AND p.datos_json_enrichment->>'descripcion' ~* '([0-9]+|un|dos|tres) ?dormitorio'
ORDER BY v.area_total_m2 DESC;
```

Análisis humano por caso: leer la cruda. Si dice claramente "N dormitorio(s)" para **la unidad** (no el rango del proyecto, ej "departamentos de 1 y 2 dormitorios") → corregir `dormitorios = N` + candar (`por='audit_dormitorios'`). Si es rango de proyecto sin especificar la unidad → dejar, no concluyente.

**Por qué solo esta dirección**: el caso inverso (cruda dice "monoambiente" pero dorms≥1) NO se chequea — el "LLM-gana sobre discovery" del merge ya lo resuelve y genera falsos positivos de proyectos multi-tipología (Rhodium, Lofty Island). Ver memoria `audit_overrides_llm_dorms.md`.

### 4. Capa 3 — Matching audit (4 checks recalibrados)

#### 3.1 Matching potencialmente errado 🔴 (RECALIBRADO)

**Lógica anterior** (v1.0): flagueaba si nombre_edificio NO aparecía en url/desc. **Falso positivo en 11 de 26 props** durante el test.

**Lógica nueva** (v1.1): solo flaguear cuando:
- `id_proyecto_master IS NOT NULL` Y
- `id_proyecto_master` NO está bloqueado por admin Y
- `nombre_oficial` del pm + sus `alias_conocidos` NO aparecen en url/desc (con normalización unicode)

```sql
WITH props AS (
  SELECT v.id, v.fuente, v.nombre_edificio, v.id_proyecto_master,
         pm.nombre_oficial, pm.alias_conocidos,
         LOWER(p.url) AS url_lower,
         -- Normalizar texto unicode estilizado a ASCII
         LOWER(translate(
           COALESCE(p.datos_json_enrichment->>'descripcion',''),
           '𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡',
           'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
         )) AS desc_lower
  FROM v_mercado_venta v
  JOIN propiedades_v2 p ON p.id = v.id
  LEFT JOIN proyectos_master pm ON pm.id_proyecto_master = v.id_proyecto_master
  WHERE <filtro args>
    AND v.id_proyecto_master IS NOT NULL
    AND pm.nombre_oficial IS NOT NULL
    AND NOT (p.campos_bloqueados ? 'id_proyecto_master')
)
SELECT id, fuente, nombre_edificio, nombre_oficial,
       LEFT(desc_lower, 200) AS desc_inicio, url_lower
FROM props
WHERE NOT (
  url_lower LIKE '%' || LOWER(REPLACE(nombre_oficial,' ','-')) || '%'
  OR desc_lower LIKE '%' || LOWER(nombre_oficial) || '%'
  OR (alias_conocidos IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(alias_conocidos) AS a 
      WHERE desc_lower LIKE '%' || LOWER(a) || '%'
         OR url_lower LIKE '%' || LOWER(REPLACE(a,' ','-')) || '%'
  ))
)
ORDER BY id;
```

Para cada hallazgo, discriminar entre:
1. **Alias faltante** (más común): la desc usa una variante del nombre. Acción: agregar a `proyectos_master.alias_conocidos`.
2. **Edificio realmente distinto**: la desc menciona otro proyecto. Acción: verificar manualmente.
3. **Falso positivo**: revisar caracteres unicode raros que escaparon de la normalización.

#### 3.2 GPS fuera de radio del pm 🔴

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.id_proyecto_master,
       pm.nombre_oficial,
       ROUND(ST_Distance(
         ST_GeogFromText('POINT('||p.longitud||' '||p.latitud||')'),
         ST_GeogFromText('POINT('||pm.longitud||' '||pm.latitud||')')
       )::numeric, 1) AS dist_m,
       pm.radio_metros
FROM v_mercado_venta v
JOIN propiedades_v2 p ON p.id = v.id
LEFT JOIN proyectos_master pm ON pm.id_proyecto_master = v.id_proyecto_master
WHERE <filtro args>
  AND v.id_proyecto_master IS NOT NULL
  AND p.latitud IS NOT NULL AND pm.latitud IS NOT NULL
  AND NOT (p.campos_bloqueados ? 'id_proyecto_master')
  AND ST_Distance(
        ST_GeogFromText('POINT('||p.longitud||' '||p.latitud||')'),
        ST_GeogFromText('POINT('||pm.longitud||' '||pm.latitud||')')
      ) > pm.radio_metros
ORDER BY dist_m DESC;
```

Discriminar entre 3 sub-casos antes de proponer acción:

**A. GPS del listing mal cargado por el broker** (más común — caso #1713 Mirage, #1733 Santorini Suites)
- Síntoma: 1 prop con GPS distinto + las demás props vivas del mismo pm coinciden con el pm
- **Acción**: **NO TOCAR NADA**. El matching nominal ya está OK. El GPS del listing es cosmético — en el feed se usa el pm.GPS para ubicar.
- Severidad real: 🟢 (informativo)

**B. GPS del pm realmente errado** (raro)
- Síntoma: TODAS o casi todas las props del pm tienen GPS consistente entre sí pero DISTINTO del pm
- **Acción**: actualizar `proyectos_master.latitud/longitud` al GPS común de las props
- Severidad real: 🟡

**C. Matching realmente errado** (caso A1 Eurodesign Tower)
- Síntoma: el nombre del listing apunta a OTRO pm (verificable con desc/url), no al asignado
- **Acción**: reasignar `id_proyecto_master` + bloquear
- Severidad real: 🔴

**Cómo discriminar**: query histórica de GPS de TODAS las props (activas + inactivas) del mismo pm:

```sql
SELECT id, status, latitud, longitud, fecha_creacion::date
FROM propiedades_v2
WHERE id_proyecto_master = <pm_id>
ORDER BY status, fecha_creacion DESC;
```

- Si los GPS de props inactivas históricas coinciden con el pm → A (broker error en la prop nueva)
- Si los GPS de props inactivas históricas también difieren del pm → B (pm mal cargado)
- Si la desc menciona otro nombre → C

**Tolerancia borderline**: marcar como 🟡 si `dist_m > radio_metros` pero `dist_m < radio_metros + 30m` (capaz solo imprecisión).

#### 3.3 Prefijo ambiguo 🟡 (RECALIBRADO)

**Lógica anterior** (v1.0): flagueaba TODOS los prefijos comunes incluyendo "Edificio" (59 pm) y "Condominio" (51 pm) → mucho ruido.

**Lógica nueva** (v1.1): solo prefijos **distintivos** donde la palabra raíz es marca/concepto, no descriptor genérico.

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
FROM v_mercado_venta v
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

Filtrar luego: solo flagear si `array_length(otros_mismo_prefijo, 1) >= 1`.

#### 3.4 nombre_edificio en alias de otro pm 🟡

```sql
SELECT v.id, v.nombre_edificio, v.id_proyecto_master AS pm_actual,
       pm2.id_proyecto_master AS pm_alternativo,
       pm2.nombre_oficial AS pm_alt_nombre
FROM v_mercado_venta v
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

Solo flagear como 🟡 ATENCIÓN. Puede ser coincidencia legítima (varios proyectos con nombre similar).

### 5. Capa 4 — Anomalías de extracción (3 checks, recalibrados)

Saltar si `--solo-criticos`.

#### 4.1 Área absurda 🔴

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.area_total_m2,
       LEFT(p.datos_json_enrichment->>'descripcion', 200) AS desc_inicio
FROM v_mercado_venta v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND v.tipo_propiedad_original = 'departamento'
  AND (v.area_total_m2 > 1000 OR v.area_total_m2 < 15)
  AND NOT (p.campos_bloqueados ? 'area_total_m2')
ORDER BY v.area_total_m2 DESC;
```

#### 4.2 Descripción muy corta 🟡

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.id_proyecto_master,
       LENGTH(p.datos_json_enrichment->>'descripcion') AS len_desc
FROM v_mercado_venta v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND LENGTH(p.datos_json_enrichment->>'descripcion') < 100
ORDER BY len_desc;
```

#### 4.3 tipo_cambio_detectado = NULL con moneda BOB 🟡 (RECALIBRADO)

**Antes** (v1.0): flagueaba todos los NULL. **Falso positivo** cuando moneda=USD (admin muestra "USD Oficial" automáticamente).

**Ahora** (v1.1): solo flagear si `moneda_original = 'BOB'` y NULL → ahí sí es ambiguo (debería ser oficial probablemente).

```sql
SELECT v.id, v.fuente, v.nombre_edificio, v.precio_usd, v.moneda_original,
       LEFT(p.datos_json_enrichment->>'descripcion', 200) AS desc_inicio
FROM v_mercado_venta v
JOIN propiedades_v2 p ON p.id = v.id
WHERE <filtro args>
  AND v.tipo_cambio_detectado IS NULL
  AND v.moneda_original = 'BOB'
  AND NOT (p.campos_bloqueados ? 'tipo_cambio_detectado');
```

### 6. Aplicar reglas de filtrado de ruido

Antes de armar el reporte, marcar como **ruido conocido**:

**Lofty Island contadores**: si `nombre_edificio ILIKE '%Lofty%'` y el único hallazgo es drift de contadores → agrupar en 1 línea.

**HTML entities**: ignorar diferencias textuales que solo contengan `&nbsp;`, `&amp;`, `&quot;`, `&#39;`.

**Sky Plaza Italia matching**: si la prop está asignada a `pm Sky Plaza Italia` pero la desc menciona otro proyecto → flagear en 🟡 ATENCIÓN, no en 🔴 CRÍTICO.

**Caracteres unicode estilizados** (𝘊, 𝘢, etc.): ya cubierto por normalización en check 3.1, pero si igual escapa, ignorar.

### 7. Estructurar el reporte ejecutivo

```
# Audit Semanal — feed /ventas — YYYY-MM-DD
# Ventana: <desde> → <hasta> (N días, M props auditadas, K excluidas por race condition)

## 🔴 CRÍTICO (X props con acción inmediata sugerida)

### Doble normalización TC paralelo (N props)
Solo `tc=paralelo` con ratio `precio_usd/billete_desc` ≈ 1.2–1.6 (precio_usd quedó en oficial). NO incluir no_especificado.
| ID | Edificio | precio_usd (oficial) | billete desc | ratio | corregir a |

### Cambio de precio explícito (N props)
| ID | Edificio | precio BD | desc dice | diff% |

### Precio absurdo (N props)
| ID | Edificio | precio | área | $/m² |

### Matching potencialmente errado (N props)
Sub-clasificado: alias faltante / edificio distinto / GPS broker mal cargado
| ID | nombre_edificio | pm asignado | hallazgo en desc | acción |

### GPS fuera de radio (N props)
Discriminar: GPS pm errado / GPS listing errado / matching realmente mal
| ID | pm | dist_m | radio | hipótesis |

### Área absurda (N props)
| ID | Edificio | área BD | área en desc |

### Dormitorios=0 vs cruda (N props)
| ID | Edificio | área | cruda dice | acción |

## 🟡 ATENCIÓN (Z props para revisar manualmente)

- TC `no_especificado` con BOB que probablemente es oficial: [tabla]
- nombre_edificio en casa/terreno (limpiar): [tabla]
- nombre_edificio sospechoso (limpieza interna, no urgente): [tabla]
- Inconsistencias parqueo/baulera/contado vs desc: [tabla]
- Prefijo distintivo ambiguo: [tabla]
- nombre coincide con alias de otro pm: [tabla]
- Sky Plaza Italia matching dudoso (caso conocido): [tabla]
- Descripciones muy cortas: [tabla]
- TC NULL con moneda BOB: [tabla]

## 🟢 INFORMATIVO

- Total auditado: <M> props
- Excluidas por race condition (editadas <30min): <K> props
- Distribución por día: [tabla]
- Lofty Island contadores: <N> (ruido típico)
- Aliases potencialmente faltantes detectados: [lista]
- Capa 1 (drift portal) NO ejecutada — usar `/audit-feed-ventas-mensual` para detectarlo
```

### 8. Pregunta al usuario qué accionar

**NUNCA aplicar UPDATEs sin confirmación del usuario.** El MCP `postgres-sici` es readonly por diseño; los SQL los aplica el humano desde Supabase UI o psql.

Después del reporte:
- ¿Aplicar SQL críticos? (TC mismatch, precio absurdo, área absurda son seguros)
- ¿Querés que abra alguna prop en navegador?
- ¿Hay aliases que querés agregar a algún pm?

## Datos útiles para el análisis

- **TC paralelo**: leer vivo de `config_global` (`SELECT valor FROM config_global WHERE clave='tipo_cambio_paralelo'`). Ratio bug ≈ paralelo/6.96 (~1.43-1.46, varía con el TC del día).
- **Total feed / volumen semanal**: ver conteo base del paso 2 (no hardcodear).
- **Casos canónicos**:
  - **Doble normalización paralelo (check 2.1)**: #1948 IFE (precio_usd 229.885 = oficial, billete desc $160K), #1949 Element (76.698 vs $53.650). Corregidos 25-may. Correctas de contraste (ratio 1.0, NO tocar): #317 La Riviera ($350K billete), #1573 Sirari ($1.5M billete). **#1939 You Smart (precio_usd=223) NO es este bug — es parse de magnitud (223 vs 223.000), lo agarra check 2.4.**
  - **Cambio de precio explícito**: #1702 Nano Smart ($66K→$55K)
  - **GPS del listing mal cargado por broker** (no requiere acción): #1713 Cond Mirage (broker C21 puso GPS errado, pm tenía el correcto), #1733 Santorini Suites (broker puso GPS mal en 1 de 18 listings)
  - **GPS del pm errado** (requiere actualizar pm): caso teórico no detectado aún en práctica
  - **Matching errado por GPS — pm realmente distinto**: 7 Eurodesign Tower asignadas a Residences (A1)
  - **Área absurda**: #1788 Aguaí (237,960 m² real 237.96)
  - **Precio absurdo**: #1827 Eurodesign Le Blanc ($18,678 real $130K)
  - **nombre_edificio basura**: #1824 "Solo\npiso", #1820 "De Edificio Habitacional", #1819 "PLANTA BAJA", #1688 "Venta", #1700 "Sky Blue Calle"
  - **Sky Plaza Italia matching dudoso**: #874 era Eurodesign Soho asignado mal

## Diferencias con `/audit-feed-ventas-mensual`

| Aspecto | Mensual | Semanal v1.1 |
|---|---|---|
| Frecuencia | 1 vez/mes | 1 vez/semana o ad-hoc |
| Costo | $1.75 (Firecrawl) | $0 |
| Capa 1 (drift portal) | ✅ Sí | ❌ No |
| Capa 2 (internas) | ✅ 7 checks (importa los de la semanal, §3.5) | ✅ 7 checks recalibrados |
| Capa 3 (matching) | ✅ 4 checks (importa los de la semanal) | ✅ 4 checks |
| Capa 4 (anomalías) | ✅ 3 checks (importa los de la semanal) | ✅ 3 checks |
| Race condition guard | ❌ No | ✅ Sí (30 min) |
| Ventana | Todo el feed | Configurable |
| Persistencia | `audit_descripciones_runs` | ❌ No persiste |
| Detección de listings muertos | ✅ Sí | ❌ Requiere Firecrawl |

## Lecciones de calibración (changelog)

### v1.3 — 2026-05-25 (post-falso-positivo TC)

**El falso positivo más caro hasta ahora.** Corriendo el audit del 25-may, los checks 2.1/2.2 marcaron ~6 props `no_especificado` (Condado VI #1896/#1897, Sky Tower #1908, terreno #1914, Grigia #1923, Spazios #1950) como "precio_usd inflado 43%" y propusieron bajarlas al USD de la desc. **Eso era incorrecto y las habría roto:** en `no_especificado`/`oficial`, `precio_usd` guarda el valor oficial (Bs/6.96) que ES el comparable, y la desc cita el billete (~1.43× menos) — el gap es esperado, no inflación.

**Causa del FP:** los checks 2.1 (red ancha: toda BOB que menciona "paralelo") y 2.2 (toda no_especificado) terminaban en un paso de "análisis humano" que invitaba a comparar `precio_usd` vs el USD de la desc y concluir "inflado", sin distinguir oficial-vs-billete.

**Fix v1.3:**
1. Borrados los viejos 2.1 y 2.2.
2. Nuevo **2.1 único**: detecta solo la **doble normalización** real (`tc=paralelo` + `precio_usd`=oficial en vez de billete, ratio `precio_usd/billete_desc` ≈ 1.2–1.6). SQL autoclasificante (sin paso humano difuso). Bug real confirmado: #1948/#1949.
3. Agregado bloque **MODELO TC + REGLAS DE ORO** al inicio de Capa 2: el gap oficial↔billete NUNCA se flaguea en no_especificado.
4. Capa 2 pasa de 8 a 7 checks.

Memoria relacionada: `precio_paralelo_vs_oficial_billete.md`. Causa raíz del bug (extractor guarda Bs/6.96 + LLM taggea paralelo) documentada en `TIPO_CAMBIO_SICI.md` §7.3 (fix de fuente pendiente).

### v1.2 — 2026-05-24

Agregado check 2.8 (dormitorios=0 vs cruda). Surge de la auditoría del bug "discovery pisa overrides LLM" (memoria `audit_overrides_llm_dorms.md`): el merge ya resuelve los monoambientes nuevos vía "LLM-gana sobre discovery", pero el caso inverso (un 1-dorm real catalogado como 0 por el portal o por alucinación del LLM) no tiene cobertura estructural. Solo se chequea esta dirección; el caso directo (cruda dice monoambiente + dorms≥1) se descartó por generar falsos positivos de proyectos multi-tipología.

### v1.1 — 2026-05-13 (post-test 14d-7d sobre 26 props)

**Falsos positivos detectados** y cómo se solucionaron:

| Falso positivo | Causa | Fix v1.1 |
|---|---|---|
| #1661 S15 Park "TC mal detectado" (tc=NULL) | El admin muestra "USD Oficial" cuando moneda=USD y tc=NULL/no_especificado | Check 2.1 usa `tipo_precio_display` combinado, no `tipo_cambio_detectado` solo |
| #1719 You Smart Studios "TC=NULL" | Mismo caso, moneda=BOB pero admin permite cambiar manualmente a "USD Oficial" | Check 4.3 solo flaguea si NO bloqueado |
| #1668 Sky→Europeo, #1702 Nano Smart precio | Race condition: editados por user mientras corría el audit | Excluir `fecha_actualizacion < NOW() - 30 min` por default |
| #1671 La Riviera "nombre no en desc" | Texto unicode estilizado (𝘊𝘰𝘯𝘥. vs Cond.) | Check 3.1 normaliza unicode antes de comparar |
| #1700 Sky Blue Calle "nombre no en desc" | Campo raw "Sky Blue Calle" pero alias "Sky Blue" sí matchea — el query no buscaba bien | Check 3.1 itera correctamente sobre alias_conocidos |
| 16 props con prefijo ambiguo "Edificio"/"Condominio" | Prefijos demasiado genéricos | Check 3.3 solo prefijos distintivos (lista whitelist) |
| #1688 "Venta", #1700 "Sky Blue Calle" reportados como crítico cuando pm está OK | El feed muestra el pm, no el campo raw | Checks 2.5/2.6 excluyen si campo bloqueado, y baja severidad si pm está OK |

**Nuevo check agregado**: 2.2 detecta `no_especificado` con BOB que probablemente sea oficial (no afecta display pero limpia data).

### v1.0 — 2026-05-12

Versión inicial. 11 checks distribuidos en 3 capas. Test sobre rango 14d-7d reveló 11 falsos positivos.
