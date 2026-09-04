-- ============================================================================
-- 350 · resumen_mercado devuelve los ESCALONES de precio
--
-- PEDIDO: lab-kapso, 4-sep-2026. Mismo patron que el estado de obra inferido y
-- las amenidades: sacar del prompt un calculo que el modelo viene errando y
-- ponerlo en la RPC, donde no puede equivocarse.
--
-- EL CASO (conversacion real del 3-sep, Villa Brigida, 1 dorm):
--   cliente: "2500bs maximo"
--   Simon:   "el mercado arranca en 2.800... Con ese precio hay 12 opciones"  <- FALSO
-- A 2.800 exactas hay UNA. El bot prometio doce donde habia una, el cliente
-- acepto estirar, y al armar la seleccion tuvo que desdecirse. Sin seleccion.
--
-- 🔑 LA CAUSA NO ES EL PROMPT, ES LA FORMA DEL DATO. Con un techo por debajo del
--    piso la RPC devolvia TODO vacio (total:0, desde:null, hasta:null), asi que
--    el bot tenia que llamar de nuevo SIN filtro de precio, y de ahi salia el
--    total del segmento: justo el numero que despues presentaba mal.
--    Reproducido antes de tocar nada:
--      resumen_mercado('alquiler','Villa Brigida',1,2500,NULL)
--      -> general en null, por_zona [], por_amoblado []. Confirmado el reporte.
--    Van 3 versiones del prompt parchando lo mismo (v29, v32 y ahora): eso es
--    señal de que el calculo esta en el lugar equivocado, no de mala redaccion.
--
-- QUE SE AGREGA — dos claves nuevas; ninguna existente cambia de forma.
--
-- 1) `escalones` — el precio al que se alcanzan 1, 3, 5 y 10 opciones.
--    Se calcula SOBRE EL SEGMENTO, ignorando p_precio_max A PROPOSITO: es la
--    respuesta a "cuanto tengo que estirar", que solo tiene sentido mirando lo
--    que esta POR ENCIMA del techo del cliente.
--    🔑 `cant` es el conteo REAL a ese precio, no la posicion pedida. Con empates
--       (Villa Brigida tiene 3 avisos a 4.200) devolver la posicion SUBCONTARIA.
--       Se deduplica por precio.
--    Medido: [{1,2800},{3,3700},{5,3850},{10,4200}] -> el bot dice "a 2.800 hay
--    una; estirando a 3.700 son 3" sin restar ni interpretar nada.
--
-- 2) `segmento` — total/desde/hasta/mediana del segmento SIN el filtro de precio.
--    🔴 Es la mitad del arreglo que lab-kapso marco en rojo: hoy, con un techo
--       bajo, no hay forma de saber desde cuanto arranca. Va en clave PROPIA y NO
--       pisando `general.desde`: `general` es "lo que entra en tu presupuesto" (y
--       sigue dando 0 cuando no entra nada, que es la verdad); `segmento` es "el
--       slice completo". Asi el bot no puede confundir uno con otro.
--    Con p_precio_max NULL, `segmento` == `general`. La forma NO cambia segun los
--    parametros: un solo contrato.
--
-- NO se filtran outliers, no se toca ninguna clave existente, no cambia la firma.
-- Los filtros de zona/dormitorios/amoblado SI aplican a `segmento` y `escalones`:
-- lo unico que se ignora es el techo de precio.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resumen_mercado(
  p_operacion text,
  p_zona text DEFAULT NULL::text,
  p_dorms integer DEFAULT NULL::integer,
  p_precio_max numeric DEFAULT NULL::numeric,
  p_amoblado text DEFAULT NULL::text)
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
  v_amo      text;
  v_amo_arr  text[];
  -- Los escalones que se reportan. El 1 es el PISO del segmento: es el que
  -- faltaba cuando el techo del cliente no alcanza y todo lo demas viene vacio.
  v_pasos    int[] := ARRAY[1, 3, 5, 10];
BEGIN
  -- Validacion de entrada (mig 336)
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

  -- p_amoblado (mig 337): solo alquiler, uno o varios separados por coma.
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

  -- Cuerpo
  IF v_op = 'venta' THEN
    WITH base AS MATERIALIZED (
      SELECT precio_norm, zona, zona_general, dormitorios,
             COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion
      FROM v_mercado_venta_shadow
      LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id
    ),
    -- seg = el segmento SIN el techo de precio. Alimenta `segmento` y `escalones`.
    seg AS (
      SELECT * FROM base
      WHERE precio_norm >= 20000
        AND ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
    ),
    -- f = lo que entra en el presupuesto. Alimenta general / por_zona / por_estado.
    f AS (
      SELECT * FROM seg
      WHERE (p_precio_max IS NULL OR precio_norm <= p_precio_max)
    ),
    ord AS (SELECT precio_norm AS p, row_number() OVER (ORDER BY precio_norm) AS pos FROM seg),
    esc AS (
      SELECT DISTINCT ON (o.precio) o.precio,
             (SELECT COUNT(*) FROM seg s WHERE s.precio_norm <= o.precio) AS cant
        FROM (SELECT (SELECT p FROM ord WHERE pos = t) AS precio
                FROM unnest(v_pasos) AS t
               WHERE t <= (SELECT COUNT(*) FROM seg)) o
       WHERE o.precio IS NOT NULL
       ORDER BY o.precio
    )
    SELECT jsonb_build_object(
      'moneda', 'USD',
      'general', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(precio_norm)::int,
          'hasta',   MAX(precio_norm)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_norm)::int
        ) FROM f
      ),
      'segmento', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(precio_norm)::int,
          'hasta',   MAX(precio_norm)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_norm)::int
        ) FROM seg
      ),
      'escalones', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('cant', cant, 'precio', precio::int) ORDER BY precio), '[]'::jsonb)
        FROM esc
      ),
      'por_zona', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('zona', zona, 'cant', COUNT(*), 'desde', MIN(precio_norm)::int) AS t
          FROM f GROUP BY zona
        ) s
      ),
      'por_estado', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('estado', estado_construccion::text, 'cant', COUNT(*)) AS t
          FROM f GROUP BY estado_construccion
        ) s
      )
    ) INTO resultado;
  ELSE
    -- RAMA DE ALQUILER — el boliviano se DERIVA cuando el aviso se publico en
    -- dolares (mig 326). El filtro de amoblado va en f, asi que lo respetan
    -- general, por_zona Y por_amoblado: un solo universo en todo el retorno.
    WITH par AS (
      SELECT (valor)::numeric AS tc FROM config_global WHERE clave = 'tipo_cambio_paralelo'
    ),
    f AS (
      SELECT COALESCE(precio_mensual_bob, ROUND(precio_mensual * (SELECT tc FROM par), 2)) AS bob,
             zona,
             amoblado
      FROM v_mercado_alquiler_shadow
      WHERE ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (v_amo_arr IS NULL
             OR (amoblado IS NULL     AND 'no_declarado' = ANY(v_amo_arr))
             OR (amoblado IS NOT NULL AND amoblado       = ANY(v_amo_arr)))
    ),
    -- seg = el segmento SIN el techo de precio. Alimenta `segmento` y `escalones`.
    seg AS (
      SELECT * FROM f WHERE bob >= 1000
    ),
    -- g = lo que entra en el presupuesto.
    g AS (
      SELECT * FROM seg
      WHERE (p_precio_max IS NULL OR bob <= p_precio_max)
    ),
    ord AS (SELECT bob AS p, row_number() OVER (ORDER BY bob) AS pos FROM seg),
    esc AS (
      SELECT DISTINCT ON (o.precio) o.precio,
             (SELECT COUNT(*) FROM seg s WHERE s.bob <= o.precio) AS cant
        FROM (SELECT (SELECT p FROM ord WHERE pos = t) AS precio
                FROM unnest(v_pasos) AS t
               WHERE t <= (SELECT COUNT(*) FROM seg)) o
       WHERE o.precio IS NOT NULL
       ORDER BY o.precio
    )
    SELECT jsonb_build_object(
      'moneda', 'Bs',
      'general', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(bob)::int,
          'hasta',   MAX(bob)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bob)::int
        ) FROM g
      ),
      'segmento', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(bob)::int,
          'hasta',   MAX(bob)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bob)::int
        ) FROM seg
      ),
      'escalones', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('cant', cant, 'precio', precio::int) ORDER BY precio), '[]'::jsonb)
        FROM esc
      ),
      'por_zona', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('zona', zona, 'cant', COUNT(*), 'desde', MIN(bob)::int) AS t
          FROM g GROUP BY zona
        ) s
      ),
      'por_amoblado', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('amoblado', COALESCE(amoblado,'no especifica'), 'cant', COUNT(*)) AS t
          FROM g GROUP BY amoblado
        ) s
      )
    ) INTO resultado;
  END IF;

  RETURN resultado;
END;
$function$;

-- ============================================================================
-- VERIFICACION — el caso que lo destapo, y que nada viejo se movio
-- ============================================================================
-- 1) El caso: techo por debajo del piso, que antes devolvia todo null.
--    SELECT resumen_mercado('alquiler','Villa Brigida',1,2500,NULL);
--    esperado: general.total  = 0        (sigue siendo la verdad)
--              segmento.total = 21, segmento.desde = 2800
--              escalones = [{1,2800},{3,3700},{5,3850},{10,4200}]
--
-- 2) Sin techo: `segmento` tiene que ser IGUAL a `general`.
--    SELECT resumen_mercado('alquiler','Villa Brigida',1,NULL,NULL);
--
-- 3) Que las claves viejas no se movieron: comparar general / por_zona /
--    por_amoblado / por_estado / moneda contra la foto previa.
--
-- 4) Venta, que comparte el cambio:
--    SELECT resumen_mercado('venta',NULL,2,NULL,NULL);
--
-- 5) Las validaciones de las migs 336/337 siguen vivas:
--    SELECT resumen_mercado('x',NULL,NULL,NULL,NULL);        -> 22023
--    SELECT resumen_mercado('venta',NULL,NULL,NULL,'si');    -> 22023
--
-- ROLLBACK: reponer la definicion previa (esta en la mig 337).
-- ============================================================================
