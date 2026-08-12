-- ============================================================================
-- 325 — `buscar_similares`: el timeout que faltaba + la tabla que ya no existe
-- ============================================================================
-- Fecha: 2026-08-12
--
-- Hermana de la 321. Aquella arregló `resumen_mercado` y `buscar_propiedades`;
-- **esta función quedó afuera y tiene el mismo patrón.** Lo levantó la IA de
-- Kapso al revisar el incidente, y al medirlo resultó peor de lo que reportaba:
--
--     3 corridas seguidas, mismo hash: 2,80 s · 2,17 s · **4,06 s**
--
-- No es "queda menos de un segundo de margen": la tercera **ya cruzó** el corte
-- de ~3 s. Falla intermitentemente hoy, y es el loop de "pedir más alternativas"
-- (lab-kapso D29) — el que corre cuando el cliente pide más opciones.
--
-- ── PROBLEMA 1: el mismo Nested Loop de la 321 ──────────────────────────────
-- El planner estima 1 fila para el scan filtrado (los filtros son funciones y
-- CASE, no puede medir su selectividad), elige Nested Loop, y en cada fila real
-- vuelve a resolver el LEFT JOIN con `v_zona_efectiva_shadow` (mig 316), que
-- recalcula 1.499 filas con GROUP BY y `ST_Distance`.
-- 🔴 **NO es el subselect a `config_global` de `precio_normalizado`.** Esa
-- hipótesis se probó en la 321 y se descartó midiendo: con el TC como número
-- fijo la consulta bajaba 7,5% y el plan quedaba idéntico.
-- Fix: `WITH base AS MATERIALIZED (...)` — la vista se resuelve UNA vez y se
-- filtra sobre el resultado. En la 321 dio 4.328 ms → 18 ms (237×).
--
-- ── PROBLEMA 2 🔴 — la cascada de respaldo lee una tabla ARCHIVADA ──────────
-- Esto no lo reportó nadie; apareció al leer la definición viva. La cascada del
-- perfil de zona (mig 309) tiene tres niveles, y el tercero es:
--
--     SELECT array_agg(DISTINCT zona) INTO v_zonas
--     FROM propiedades_v2 WHERE id = ANY(v_anchor_ids) ...
--
-- `propiedades_v2` **dejó de existir** en el TIEMPO 1 del cutover (11-ago): hoy
-- se llama `propiedades_v2_archivo`. Si esa rama se alcanza, la función entera
-- muere con `42P01 relation does not exist`. Aparece DOS veces (venta y alquiler).
--
-- 🔑 **Y sí se puede alcanzar.** Medido hoy: de las 349 propiedades que aparecen
-- en shortlists, **184 (53%) existen solo en el archivo** — son las de mayo y
-- junio. Con una shortlist de esa época, los tres niveles fallan y el cliente
-- recibe un error en vez de alternativas. Que no haya pasado todavía es porque
-- nadie abrió una shortlist vieja desde el 21-jul.
-- Se repunta a `propiedades_v2_archivo`, que es donde esas props viven de verdad.
--
-- ── VERIFICADO QUE NO DAÑA NADA MÁS ─────────────────────────────────────────
-- · Consumidor: **solo el bot** (`lab-kapso/workflows/simon/workflow.js`). El
--   sitio no la nombra, ninguna función SQL la llama, n8n tampoco.
-- · La lógica NO cambia: mismos filtros, mismo orden, mismo LIMIT, mismo jsonb.
--   Solo cambia CÓMO se consulta la vista y a qué tabla apunta el 3er respaldo.
-- · Se conservan intactos el dedup por `v_all_ids`, la validación fav↔hash y el
--   candado de zona de la mig 309 (sin escape a "cualquier zona").
-- · Firma, tipo de retorno, `SECURITY DEFINER` y `search_path` sin cambios.
-- · El perfil (primer SELECT, filtra por `id = ANY(...)`) **no se materializa**:
--   filtra por clave primaria, ahí el planner acierta. Solo se toca el SELECT de
--   búsqueda, que es el que filtra por rango de precio y área.
--
-- 🔴 Cuerpo exportado con `pg_get_functiondef()` antes de escribir (regla #7).
--
-- NUMERACIÓN: va 325. La 323 y la 324 están tomadas por
-- `worktree-feat+multiproyectos-feed-shadow` (proyectos de preventa, en pausa).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.buscar_similares(
  p_hash text,
  p_fav_ids bigint[] DEFAULT NULL::bigint[],
  p_limit integer DEFAULT 6
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shortlist_id uuid;
  v_tipo         text;
  v_all_ids      bigint[];   -- todos los ids del shortlist (para excluir del resultado)
  v_anchor_ids   bigint[];   -- ids ancla del perfil (fav validadas, o todas)
  v_zonas        text[];
  v_dorms        int[];
  v_precio_min   numeric;  v_precio_max numeric;
  v_m2_min       numeric;  v_m2_max     numeric;
  v_props        jsonb;
BEGIN
  -- 1. Resolver shortlist por hash (ancla de confianza) + tipo_operacion
  SELECT s.id, MIN(i.tipo_operacion)
    INTO v_shortlist_id, v_tipo
  FROM broker_shortlists s
  JOIN broker_shortlist_items i ON i.shortlist_id = s.id
  WHERE s.hash = p_hash
  GROUP BY s.id;

  IF v_shortlist_id IS NULL THEN
    RETURN jsonb_build_object('error', 'hash_no_encontrado', 'propiedades', '[]'::jsonb);
  END IF;

  -- 2. Todos los ids del shortlist (para dedup en el resultado)
  SELECT array_agg(i.propiedad_id) INTO v_all_ids
  FROM broker_shortlist_items i
  WHERE i.shortlist_id = v_shortlist_id;

  -- 3. Anclas del perfil: fav VALIDADAS contra el shortlist; si no hay, todas
  IF p_fav_ids IS NULL OR array_length(p_fav_ids, 1) IS NULL THEN
    v_anchor_ids := v_all_ids;
  ELSE
    SELECT array_agg(i.propiedad_id) INTO v_anchor_ids
    FROM broker_shortlist_items i
    WHERE i.shortlist_id = v_shortlist_id
      AND i.propiedad_id = ANY(p_fav_ids);     -- solo ids que REALMENTE están en el shortlist
    IF v_anchor_ids IS NULL THEN
      v_anchor_ids := v_all_ids;               -- fav inválidos -> degradar a todo el shortlist
    END IF;
  END IF;

  -- 4. Perfil + búsqueda de similares, por tipo de operación
  IF v_tipo = 'venta' THEN
    -- El perfil filtra por clave primaria: el planner acierta, no hace falta CTE.
    SELECT array_agg(DISTINCT zona),
           array_agg(DISTINCT dormitorios),
           MIN(precio_norm),   MAX(precio_norm),
           MIN(area_total_m2), MAX(area_total_m2)
      INTO v_zonas, v_dorms, v_precio_min, v_precio_max, v_m2_min, v_m2_max
    FROM v_mercado_venta_shadow
    WHERE id = ANY(v_anchor_ids);

    -- 🔒 mig 309 — cascada de respaldo del PERFIL DE ZONA (ver header)
    IF v_zonas IS NULL THEN
      SELECT array_agg(DISTINCT zona) INTO v_zonas
      FROM propiedades_v2_shadow WHERE id = ANY(v_anchor_ids) AND zona IS NOT NULL;
    END IF;
    IF v_zonas IS NULL THEN
      -- mig 325: era `propiedades_v2`, archivada en el TIEMPO 1 → 42P01.
      -- 53% de las props de shortlists viven SOLO acá (las de mayo/junio).
      SELECT array_agg(DISTINCT zona) INTO v_zonas
      FROM propiedades_v2_archivo WHERE id = ANY(v_anchor_ids) AND zona IS NOT NULL;
    END IF;
    IF v_zonas IS NULL THEN
      -- Sin perfil de zona no se puede acotar: NO sugerir es la respuesta correcta.
      RETURN jsonb_build_object('tipo_operacion', v_tipo, 'propiedades', '[]'::jsonb);
    END IF;

    -- mig 325: MATERIALIZED — la vista se resuelve UNA vez. Sin esto el planner
    -- estima 1 fila, elige Nested Loop y repite el join de zona de la mig 316
    -- por cada fila real (ver header).
    WITH base AS MATERIALIZED (
      SELECT id, nombre_edificio, precio_norm, area_total_m2, banos,
             estacionamientos, estado_construccion, url, zona, dormitorios
      FROM v_mercado_venta_shadow
    )
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_props FROM (
      SELECT jsonb_build_object(
        'id', id,
        'edificio', nombre_edificio,
        'precio_usd', precio_norm::int,
        'm2', area_total_m2,
        'banos', banos,
        'parqueo', estacionamientos,
        'estado', estado_construccion::text,
        'url', url
      ) AS t
      FROM base
      WHERE precio_norm >= 20000
        AND NOT (id = ANY(v_all_ids))                                      -- dedup: nunca repetir las del shortlist
        AND zona = ANY(v_zonas)                                            -- mig 309: sin escape a "cualquier zona"
        AND (v_dorms IS NULL OR dormitorios = ANY(v_dorms))
        AND (v_precio_min IS NULL OR precio_norm   BETWEEN v_precio_min * 0.85 AND v_precio_max * 1.15)
        AND (v_m2_min     IS NULL OR area_total_m2 BETWEEN v_m2_min     * 0.80 AND v_m2_max     * 1.20)
      ORDER BY precio_norm ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;

  ELSE  -- alquiler
    SELECT array_agg(DISTINCT zona),
           array_agg(DISTINCT dormitorios),
           MIN(precio_mensual_bob), MAX(precio_mensual_bob),
           MIN(area_total_m2),      MAX(area_total_m2)
      INTO v_zonas, v_dorms, v_precio_min, v_precio_max, v_m2_min, v_m2_max
    FROM v_mercado_alquiler_shadow
    WHERE id = ANY(v_anchor_ids);

    -- 🔒 mig 309 — misma cascada que en venta
    IF v_zonas IS NULL THEN
      SELECT array_agg(DISTINCT zona) INTO v_zonas
      FROM propiedades_v2_shadow WHERE id = ANY(v_anchor_ids) AND zona IS NOT NULL;
    END IF;
    IF v_zonas IS NULL THEN
      -- mig 325: era `propiedades_v2` (archivada) — ver la nota en la rama de venta.
      SELECT array_agg(DISTINCT zona) INTO v_zonas
      FROM propiedades_v2_archivo WHERE id = ANY(v_anchor_ids) AND zona IS NOT NULL;
    END IF;
    IF v_zonas IS NULL THEN
      RETURN jsonb_build_object('tipo_operacion', v_tipo, 'propiedades', '[]'::jsonb);
    END IF;

    WITH base AS MATERIALIZED (
      SELECT id, nombre_edificio, precio_mensual_bob, area_total_m2, banos,
             estacionamientos, amoblado, url, zona, dormitorios
      FROM v_mercado_alquiler_shadow
    )
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_props FROM (
      SELECT jsonb_build_object(
        'id', id,
        'edificio', nombre_edificio,
        'precio_bob', precio_mensual_bob::int,
        'm2', area_total_m2,
        'banos', banos,
        'parqueo', estacionamientos,
        'amoblado', amoblado,
        'url', url
      ) AS t
      FROM base
      WHERE precio_mensual_bob >= 1000
        AND NOT (id = ANY(v_all_ids))
        AND zona = ANY(v_zonas)                                            -- mig 309
        AND (v_dorms IS NULL OR dormitorios = ANY(v_dorms))
        AND (v_precio_min IS NULL OR precio_mensual_bob BETWEEN v_precio_min * 0.85 AND v_precio_max * 1.15)
        AND (v_m2_min     IS NULL OR area_total_m2      BETWEEN v_m2_min     * 0.80 AND v_m2_max     * 1.20)
      ORDER BY precio_mensual_bob ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  END IF;

  RETURN jsonb_build_object(
    'tipo_operacion', v_tipo,
    'propiedades',    v_props
  );
END;
$function$;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN (correr aparte)
-- ============================================================================
-- 1. Modo y permisos sin cambios: definer + search_path=public + anon con EXECUTE
SELECT p.proname, p.prosecdef AS es_definer, array_to_string(p.proconfig,',') AS config,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ejecuta
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname = 'buscar_similares';

-- 2. Ya no queda ninguna referencia a la tabla archivada por su nombre viejo
--    Esperado: false
SELECT pg_get_functiondef(p.oid) ~ '\mpropiedades_v2\M' AS todavia_nombra_la_tabla_vieja
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname = 'buscar_similares';

-- 3. El caso que tardaba. Antes: 2,80 s · 2,17 s · 4,06 s (la 3ª pasó el corte).
--    Esperado ahora: muy por debajo de 1 s, y el MISMO resultado.
SELECT buscar_similares('6HNhB9xZQW', NULL, 5);

-- 📌 REFERENCIA medida ANTES de aplicar (12-ago, con la función vieja).
--    Tiene que devolver EXACTAMENTE estas 5, en este orden:
--      #1010  Bamboo             $49.500
--      #3410  Baruc 4            $50.700
--      #1162  Inizio 1           $53.000
--      #2421  Grigia Residenze   $55.000
--      #3583  Domus Insignia     $56.475
--
-- 📌 CRITERIO DE ABORTO: si el conjunto cambia —otros ids, otro orden, otra
--    cantidad— hacer rollback. La velocidad no vale nada si el bot pasa a
--    recomendar otras propiedades.
--
-- ROLLBACK: reaplicar la definición anterior (la que está en
--   lab-kapso/sql/crear-rpc-similares.sql ⚠️ NO es idéntica a la viva: aquella
--   dice `v_mercado_venta` y la viva usa `v_mercado_venta_shadow`). Lo seguro es
--   exportar la definición actual con pg_get_functiondef() ANTES de aplicar esto
--   y guardarla.
-- ============================================================================
