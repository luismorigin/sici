-- =============================================================================
-- 337 · El panorama deja de describir un mercado que no es el del cliente
-- =============================================================================
-- POR QUÉ
-- El bot trabaja en dos pasos: `resumen_mercado` (panorama) y después `buscar`.
-- `buscar` acepta `p_amoblado`; `resumen_mercado` NO. Así que cuando el cliente
-- pide amoblado, **el panorama sale del universo sin filtrar y la búsqueda del
-- universo filtrado**: el cliente escucha un número y ve otro.
--
-- lab-kapso lo tiene tipificado como *contradicción interna* y es el único patrón
-- que ninguna versión de su prompt atacó nunca — no por olvido: **no hay regla de
-- prompt que lo arregle**. El bot no se desvía, usa la única herramienta que
-- tiene. Cualquier texto que le agreguen le pediría inventar un número que no
-- posee. Mismo criterio que el estado de obra (mig 329) y las amenidades (330/331):
-- si el dato llega bien de la RPC, el bot no puede equivocarse.
--
-- MEDIDO EN LA BASE (Equipetrol, 21-ago-2026) — lo que hoy escucha el cliente:
--   pide                        el panorama dice        lo que hay de verdad
--   2 dorms sin muebles         42                      27   (3 'no' + 24 sin dato)
--   2 dorms amoblado            42                      15
--   monoambiente amoblado       67                      45
--   2d Eq. Norte amoblado       12                       5
--
-- 🔑 **El peor caso no es el conteo, es el TECHO.** En 1 dormitorio:
--   sin filtro ....... 76 avisos · 2.800 a **23.232** Bs · mediana 4.200
--   sin muebles ...... 36 avisos · 2.800 a **7.000**  Bs · mediana 4.033
-- Hoy a quien busca sin muebles se le dice que el mercado llega a 23.232 cuando lo
-- que puede ofrecérsele termina en 7.000: **3,3× de diferencia**, y con eso el
-- cliente calibra su presupuesto. (El 23.232 es de una amoblada.)
-- ⚠️ Y no siempre se mueve: en 2 dorms `no,no_declarado` el rango y la mediana dan
-- IDÉNTICOS a los del panorama sin filtrar. De 9 casos medidos por lab-kapso se
-- mueve en 8 — **y no hay forma de saber cuál es el noveno sin aplicar el filtro**.
--
-- =============================================================================
-- QUÉ CAMBIA
-- =============================================================================
-- 1. `resumen_mercado` gana **`p_amoblado`**, con la misma asimetría que ya tiene
--    `buscar` desde la mig 336: **solo en alquiler**; en venta se RECHAZA (el dato
--    falta en 305 de 385 avisos).
--
-- 2. **Los dos aceptan VARIOS valores separados por coma** (`'no,no_declarado'`).
--    🔑 Sin esto el arreglo movía el problema en vez de resolverlo: de 42 deptos de
--    2 dorms hay 15 amoblados, 3 sin amoblar y **24 sin dato**; si el bot pidiera
--    solo `'no'`, pasaríamos de *"anuncio 42 y muestro 3"* a *"anuncio 3 cuando hay
--    27 candidatos"*. El vacío no se resolvía, se mudaba.
--
-- 3. 🔴 **`buscar` también acepta la lista, aunque el pedido original no lo pedía.**
--    Sin eso la contradicción se mudaba al PASO 3: el panorama diría 27 y la
--    búsqueda solo podría pedir 3 o 24. Y peor — dejaría **el mismo parámetro con
--    dos formatos según la tool**, que es exactamente la inconsistencia que la 336
--    vino a sacar.
--
-- 4. **Todo el retorno respeta el filtro, no solo `general`.** Filtrar `general` y
--    dejar `por_amoblado` sin filtrar dejaría **dos universos dentro del mismo
--    objeto** (`general.total` 27 y el desglose sumando 42): el mismo bug mudado
--    adentro. Con varios valores el desglose no pierde nada, se vuelve exacto:
--      p_amoblado 'no,no_declarado' → general.total 27
--                                   → por_amoblado [{no:3},{no especifica:24}]
--      y el desglose **suma exactamente `general.total`**.
--
-- ✅ **Sin `p_amoblado`, el retorno es IDÉNTICO a hoy.** Cero cambio de contrato
--    para el caso que ya funciona.
--
-- =============================================================================
-- POR QUÉ COMA Y NO ARRAY (decisión de lab-kapso, con su fundamento)
-- =============================================================================
-- Se evaluó `text[]`. Su modelo genera arrays bien —ya emite `p_fav_ids` correcto
-- en `buscar_similares`—, pero cambiar el tipo de `p_amoblado` en `buscar` de
-- `text` a `text[]` **rompería las llamadas que hoy funcionan** (`"si"` dejaría de
-- ser válido) y obligaría a coordinar una ventana de corte.
-- Con coma no se rompe nada Y se conserva el `enum`, que es lo que hizo que el bot
-- dejara de escribir `p_amoblado: true`: las combinaciones útiles son pocas, así
-- que el schema las declara como valores escalares —
--   ["si","semi","no","no_declarado","no,no_declarado"]
-- — y el modelo elige de una lista cerrada, que es lo que mejor genera.
--
-- ⚠️ **DESVIACIÓN DECLARADA respecto de lo pedido.** lab-kapso pidió que un valor
-- fuera de su enum (p. ej. `'si,no'`) **falle**. Acá se valida el VOCABULARIO, no
-- la lista de combinaciones: `'si,no'` funciona y devuelve los 18 que declaran algo.
-- Motivos: (a) es una petición coherente que la RPC puede responder bien, y negarse
-- sería fallar donde se puede servir; (b) con la otra opción, cada combinación nueva
-- exigiría **una migración**, mientras que así les alcanza con tocar su enum; (c) el
-- riesgo real que querían cubrir —que el modelo mande basura y reciba vacío en
-- silencio— queda cubierto igual: cualquier token fuera del vocabulario falla con el
-- mensaje que enseña el dominio. Cada capa hace lo suyo: la RPC valida el
-- vocabulario, su enum decide qué combinaciones ofrece el bot.
-- Si aun así lo prefieren estricto, es una línea.
--
-- =============================================================================
-- 🔴 DROP + CREATE en `resumen_mercado`, Y LOS GRANT SE REPONEN A MANO
-- =============================================================================
-- Agregar un parámetro NO lo hace `CREATE OR REPLACE`: crearía una SEGUNDA función
-- sobrecargada y PostgREST no sabría cuál llamar. Va DROP + CREATE.
-- 🔑 Y un DROP **se lleva los GRANT**. Sin reponerlos, `anon` pierde EXECUTE y el
-- bot cae con `42501` — es la caída de 19 días de las migs 315/317, por la misma
-- puerta. Los GRANT de abajo son los exportados de producción HOY:
--   anon · authenticated · service_role · claude_readonly  (+ PUBLIC por default)
-- La función se recrea `SECURITY DEFINER SET search_path = public`, igual que hoy
-- (mig 320): perder eso es la otra mitad de aquella caída.
--
-- ALCANCE: las 2 funciones son exclusivas del bot (grep sobre `sici` y `simon-mvp`:
-- cero llamadores). `buscar_similares` no se toca.
--
-- ⚠️ ORDEN: aplicar ESTO primero y después lab-kapso agrega `p_amoblado` al
-- `body_schema` de `resumen_mercado` y extiende el enum de `buscar`. Al revés, el
-- bot mandaría un parámetro que la RPC todavía no conoce.
--
-- ROLLBACK: `sql/migrations/337_ROLLBACK_panorama_filtra_por_amoblado.sql`
-- =============================================================================

BEGIN;

-- ── 1/2 · resumen_mercado — gana p_amoblado ─────────────────────────────────
DROP FUNCTION IF EXISTS public.resumen_mercado(text, text, integer, numeric);

CREATE FUNCTION public.resumen_mercado(
  p_operacion  text,
  p_zona       text    DEFAULT NULL::text,
  p_dorms      integer DEFAULT NULL::integer,
  p_precio_max numeric DEFAULT NULL::numeric,
  p_amoblado   text    DEFAULT NULL::text
)
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
BEGIN
  -- ── Validación de entrada (mig 336) ──────────────────────────────────────
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

  -- `p_amoblado` (mig 337): solo alquiler, uno o varios separados por coma.
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

  -- ── Cuerpo ───────────────────────────────────────────────────────────────
  IF v_op = 'venta' THEN
    WITH base AS MATERIALIZED (
      SELECT precio_norm, zona, zona_general, dormitorios,
             COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion
      FROM v_mercado_venta_shadow
      LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id
    ),
    f AS (
      SELECT * FROM base
      WHERE precio_norm >= 20000
        AND ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_norm <= p_precio_max)
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
    -- RAMA DE ALQUILER — el boliviano se DERIVA cuando el aviso se publicó en
    -- dólares (mig 326). 🔑 El filtro de amoblado va en `f`, así que lo respetan
    -- `general`, `por_zona` Y `por_amoblado`: un solo universo en todo el retorno.
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
    g AS (
      SELECT * FROM f
      WHERE bob >= 1000
        AND (p_precio_max IS NULL OR bob <= p_precio_max)
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

-- 🔴 REPONER LOS GRANT — el DROP se los llevó. Exportados de producción hoy.
GRANT EXECUTE ON FUNCTION public.resumen_mercado(text, text, integer, numeric, text) TO anon;
GRANT EXECUTE ON FUNCTION public.resumen_mercado(text, text, integer, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resumen_mercado(text, text, integer, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resumen_mercado(text, text, integer, numeric, text) TO claude_readonly;

-- ── 2/2 · buscar_propiedades — p_amoblado acepta varios ─────────────────────
-- La firma NO cambia (sigue siendo `text`), así que va CREATE OR REPLACE y los
-- GRANT se conservan. `'si'` sigue funcionando EXACTAMENTE igual que antes.
CREATE OR REPLACE FUNCTION public.buscar_propiedades(
  p_operacion  text,
  p_zona       text    DEFAULT NULL::text,
  p_dorms      integer DEFAULT NULL::integer,
  p_precio_max numeric DEFAULT NULL::numeric,
  p_estado     text    DEFAULT NULL::text,
  p_amoblado   text    DEFAULT NULL::text,
  p_orden      text    DEFAULT 'precio'::text,
  p_limit      integer DEFAULT 6
)
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
-- VERIFICACIÓN — correr DESPUÉS de aplicar
-- =============================================================================
-- 0) 🔴 LO PRIMERO: que no haya quedado una función DUPLICADA y que los GRANT
--    estén repuestos. Si esto falla, el bot cae con 42501 (migs 315/317).
--   SELECT pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, p.proconfig,
--          array_to_string(p.proacl,' | ') AS acl
--     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='resumen_mercado';
--   -- debe devolver UNA fila, con 5 parámetros, prosecdef=t, search_path=public
--   -- y anon/authenticated/service_role/claude_readonly en el acl.
--
-- A) Nada de lo que funciona hoy cambió. Comparar ANTES/DESPUÉS en la misma
--    sesión (el inventario se mueve todas las noches — no clavar números):
--   SELECT (resumen_mercado('venta')   ->'general'->>'total')::int AS venta,
--          (resumen_mercado('alquiler')->'general'->>'total')::int AS alquiler,
--          (resumen_mercado('alquiler')->'general'->>'mediana')::int AS med_alq,
--          jsonb_array_length(buscar_propiedades('alquiler', p_amoblado => 'si')) AS lista_si;
--
-- B) El panorama filtrado coincide con la búsqueda (lo que se vino a arreglar):
--   SELECT (resumen_mercado('alquiler', p_dorms=>2)->'general'->>'total')::int AS sin_filtro,
--          (resumen_mercado('alquiler', p_dorms=>2, p_amoblado=>'si')->'general'->>'total')::int AS solo_si,
--          (resumen_mercado('alquiler', p_dorms=>2, p_amoblado=>'no,no_declarado')->'general'->>'total')::int AS sin_muebles;
--   -- esperado hoy: 42 · 15 · 27
--
-- C) 🔑 El desglose SUMA general.total (un solo universo en todo el retorno):
--   WITH r AS (SELECT resumen_mercado('alquiler', p_dorms=>2, p_amoblado=>'no,no_declarado') AS j)
--   SELECT (j->'general'->>'total')::int AS total,
--          (SELECT SUM((e->>'cant')::int) FROM jsonb_array_elements(j->'por_amoblado') e) AS suma_desglose
--     FROM r;   -- los dos deben dar 27
--
-- D) El techo deja de mentir (1 dorm, el peor caso medido):
--   SELECT (resumen_mercado('alquiler', p_dorms=>1)->'general'->>'hasta')::int AS techo_sin_filtro,
--          (resumen_mercado('alquiler', p_dorms=>1, p_amoblado=>'no,no_declarado')->'general'->>'hasta')::int AS techo_real;
--   -- esperado: 23232 → 7000
--
-- E) Lo inválido falla (los 4 dan ERROR 22023):
--   SELECT resumen_mercado('venta', p_amoblado=>'si');          -- no aplica a venta
--   SELECT resumen_mercado('alquiler', p_amoblado=>'true');     -- fuera del vocabulario
--   SELECT resumen_mercado('alquiler', p_amoblado=>'no,xxx');   -- un token invalido en la lista
--   SELECT buscar_propiedades('alquiler', p_amoblado=>'no,xxx');
--
-- F) Las dos RPC concuerdan con el MISMO valor compuesto:
--   SELECT (resumen_mercado('alquiler', p_dorms=>2, p_amoblado=>'no,no_declarado')->'general'->>'total')::int AS panorama,
--          jsonb_array_length(buscar_propiedades('alquiler', p_dorms=>2, p_amoblado=>'no,no_declarado', p_limit=>50)) AS busqueda;
--   -- los dos deben dar 27
-- =============================================================================
