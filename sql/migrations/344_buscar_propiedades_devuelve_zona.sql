-- =============================================================================
-- 344 · El bot listaba departamentos sin saber de qué zona eran
-- =============================================================================
-- Pedido de lab-kapso (27-ago-2026), punto 2 de su reporte de zonas.
--
-- `buscar_propiedades` devolvía por cada propiedad:
--     id · edificio · precio · m2 · baños · parqueo · estado · url · amenidades
--
-- **Sin la zona.** El bot sabe que "Edificio Elite Sirari" cuesta 49.650 USD y no
-- sabe que está en Sirari, salvo que lo deduzca del nombre — que a veces coincide
-- y a veces no ("Edificio Sirari Deluxe" está en Equipetrol Centro).
--
-- Dos consecuencias, y la segunda ya costó:
--
-- · **Para el cliente**: al armar una selección el bot no puede decir "esta en
--   Sirari, esta otra en Villa Brígida". Sólo el nombre del edificio.
--
-- · **Para el control**: el bot no podía verificar que lo que mostraba estuviera
--   dentro de sus 5 zonas de cobertura. Así se le coló una propiedad de
--   `Eq. 3er Anillo` a la selección de un cliente real (José, `atQMWeoyLW`,
--   24-ago). El sistema hacía lo peor de los dos mundos: **no la contaba al
--   informar, pero la mostraba al listar.**
--
-- ⚠️ Ese caso puntual YA no puede repetirse: el fix de zonas del 27-ago dejó
-- `Eq. 3er Anillo` sin propiedades activas (tenía UNA en todo el histórico, y era
-- un hotel). Esto no arregla algo roto — mejora lo que el bot puede DECIR, y le da
-- con qué darse cuenta si algo vuelve a colarse.
--
-- 🔑 EL CAMBIO ES ADITIVO: una clave nueva en el objeto de cada propiedad. Quien no
-- la use, no se entera. No cambia filtros, ni orden, ni qué propiedades salen — los
-- conteos antes y después tienen que ser idénticos, y eso se verifica abajo.
--
-- 🔴 ES UNA DE LAS 3 RPC DEL BOT. Las otras dos son `resumen_mercado` y
-- `buscar_similares`. Confundirlas con las del sitio costó **19 días de bot caído**
-- (migs 315/317 → 320). El cuerpo de acá se copió de `pg_get_functiondef()` de
-- PRODUCCIÓN (regla #7), no de un archivo de migración.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.buscar_propiedades(
  p_operacion text,
  p_zona text DEFAULT NULL::text,
  p_dorms integer DEFAULT NULL::integer,
  p_precio_max numeric DEFAULT NULL::numeric,
  p_estado text DEFAULT NULL::text,
  p_amoblado text DEFAULT NULL::text,
  p_orden text DEFAULT 'precio'::text,
  p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  resultado  jsonb;
  v_op       text;
  v_zona     text;
  v_zonas_ok text;
  v_estado   text;
  v_amo      text;
  v_amo_arr  text[];
  v_orden    text;
BEGIN
  -- ── Validación de entrada ────────────────────────────────────────────────
  v_op := lower(trim(coalesce(p_operacion, '')));
  IF v_op NOT IN ('venta', 'alquiler') THEN
    RAISE EXCEPTION 'p_operacion invalido: %. Valores: venta | alquiler',
      coalesce('"' || p_operacion || '"', 'null')
      USING ERRCODE = '22023';
  END IF;

  IF p_zona IS NOT NULL AND trim(p_zona) <> '' THEN
    SELECT z.nombre INTO v_zona
      FROM zonas_geograficas z
     WHERE lower(z.nombre) = lower(trim(p_zona))
       AND z.zona_general = 'Equipetrol'
       AND z.activo
     LIMIT 1;
    IF v_zona IS NULL THEN
      SELECT string_agg(DISTINCT z.nombre, ' | ' ORDER BY z.nombre) INTO v_zonas_ok
        FROM zonas_geograficas z
       WHERE z.zona_general = 'Equipetrol' AND z.activo;
      RAISE EXCEPTION 'p_zona invalida: "%". Valores: %', p_zona, v_zonas_ok
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_dorms IS NOT NULL AND (p_dorms < 0 OR p_dorms > 10) THEN
    RAISE EXCEPTION 'p_dorms fuera de rango: %. Valores: 0 (monoambiente) a 10', p_dorms
      USING ERRCODE = '22023';
  END IF;

  IF p_precio_max IS NOT NULL AND p_precio_max <= 0 THEN
    RAISE EXCEPTION 'p_precio_max debe ser mayor a 0 (recibido: %). USD en venta, Bs en alquiler.', p_precio_max
      USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NOT NULL AND (p_limit < 1 OR p_limit > 50) THEN
    RAISE EXCEPTION 'p_limit fuera de rango: %. Valores: 1 a 50 (por defecto 6)', p_limit
      USING ERRCODE = '22023';
  END IF;

  v_estado := nullif(lower(trim(coalesce(p_estado, ''))), '');
  IF v_estado IS NOT NULL THEN
    IF v_op = 'alquiler' THEN
      RAISE EXCEPTION 'p_estado no aplica a alquiler: el estado de obra no existe en alquiler. Omitilo.'
        USING ERRCODE = '22023';
    END IF;
    IF v_estado NOT IN ('preventa', 'entrega_inmediata') THEN
      RAISE EXCEPTION 'p_estado invalido: "%". Valores: preventa | entrega_inmediata', p_estado
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- mig 337: uno o varios separados por coma. `'si'` se comporta igual que antes.
  v_amo := nullif(translate(lower(trim(coalesce(p_amoblado, ''))), 'áéíóú', 'aeiou'), '');
  IF v_amo IS NOT NULL THEN
    IF v_op = 'venta' THEN
      RAISE EXCEPTION 'p_amoblado no aplica a venta: el dato casi no existe en venta. Omitilo.'
        USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT trim(e)) INTO v_amo_arr
      FROM unnest(string_to_array(v_amo, ',')) AS e
     WHERE trim(e) <> '';
    IF v_amo_arr IS NULL
       OR EXISTS (SELECT 1 FROM unnest(v_amo_arr) x WHERE x NOT IN ('si','semi','no','no_declarado')) THEN
      RAISE EXCEPTION 'p_amoblado invalido: "%". Valores: si | semi | no | no_declarado, o varios separados por coma (ej: "no,no_declarado")', p_amoblado
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_orden := nullif(lower(trim(coalesce(p_orden, ''))), '');
  IF v_orden IS NULL THEN
    v_orden := 'precio';
  END IF;
  IF v_orden NOT IN ('precio', 'area') THEN
    RAISE EXCEPTION 'p_orden invalido: "%". Valores: precio (mas barato primero) | area (mas grande primero)', p_orden
      USING ERRCODE = '22023';
  END IF;

  -- ── Cuerpo ───────────────────────────────────────────────────────────────
  IF v_op = 'venta' THEN
    WITH base AS MATERIALIZED (
      SELECT id, nombre_edificio, precio_norm, area_total_m2, banos, estacionamientos,
             COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion,
             url, zona, zona_general, dormitorios
      FROM v_mercado_venta_shadow
      LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id
    )
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO resultado FROM (
      SELECT jsonb_build_object(
        'id', id,
        'edificio', nombre_edificio,
        'zona', zona,                     -- ⬅️ mig 344: lo único nuevo
        'precio_usd', precio_norm::int,
        'm2', area_total_m2,
        'banos', banos,
        'parqueo', estacionamientos,
        'estado', estado_construccion::text,
        'url', url,
        'amenidades', amenidades_normalizadas(id)
      ) AS t
      FROM base
      WHERE precio_norm >= 20000
        AND ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_norm <= p_precio_max)
        AND (v_estado IS NULL OR estado_construccion::text = v_estado)
      ORDER BY
        CASE WHEN v_orden = 'area' THEN area_total_m2 END DESC NULLS LAST,
        CASE WHEN v_orden <> 'area' THEN precio_norm END ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  ELSE
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO resultado FROM (
      SELECT jsonb_build_object(
        'id', id,
        'edificio', nombre_edificio,
        'zona', zona,                     -- ⬅️ mig 344: lo único nuevo
        'precio_bob', precio_bob_efectivo::int,
        'm2', area_total_m2,
        'banos', banos,
        'parqueo', estacionamientos,
        'amoblado', amoblado,
        'url', url,
        'amenidades', amenidades_normalizadas(id)
      ) AS t
      FROM (
        SELECT *, COALESCE(
                    precio_mensual_bob,
                    ROUND(precio_mensual * (SELECT valor::numeric FROM config_global WHERE clave = 'tipo_cambio_paralelo'), 2)
                  ) AS precio_bob_efectivo
        FROM v_mercado_alquiler_shadow
      ) v_alq
      WHERE precio_bob_efectivo >= 1000
        AND ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_bob_efectivo <= p_precio_max)
        AND (v_amo_arr IS NULL
             OR (amoblado IS NULL     AND 'no_declarado' = ANY(v_amo_arr))
             OR (amoblado IS NOT NULL AND amoblado       = ANY(v_amo_arr)))
      ORDER BY
        CASE WHEN v_orden = 'area' THEN area_total_m2 END DESC NULLS LAST,
        CASE WHEN v_orden <> 'area' THEN precio_bob_efectivo END ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  END IF;

  RETURN resultado;
END;
$function$;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
-- 1 · La clave existe en las dos operaciones y trae una zona real:
--     SELECT buscar_propiedades('venta',   'Sirari', NULL, NULL) -> 0 ->> 'zona';  -- 'Sirari'
--     SELECT buscar_propiedades('alquiler', NULL,    NULL, NULL) -> 0 ->> 'zona';  -- no null
--
-- 2 · 🔑 NO CAMBIÓ QUÉ SALE — sólo qué se cuenta de cada uno. Los ids y su orden
--     tienen que ser los mismos que antes. Con la foto previa guardada:
--     SELECT jsonb_agg(e->>'id' ORDER BY ord)
--       FROM jsonb_array_elements(buscar_propiedades('venta', NULL, NULL, NULL))
--            WITH ORDINALITY AS a(e, ord);
--
-- 3 · Las 5 zonas de cobertura y nada más (si aparece otra, algo se coló):
--     SELECT DISTINCT e->>'zona'
--       FROM jsonb_array_elements(buscar_propiedades('venta', NULL, NULL, NULL, NULL, NULL, 'precio', 50)) e;
--
-- 🔴 Y PROBARLA CONTRA LA RPC, NO CONTRA LA VISTA. El 13-ago un eval "verificable"
--    dio un resultado equivocado por medir con la vista en vez de con la función.
-- =============================================================================
