-- =============================================================================
-- 332 · El bot deja de esconder los alquileres publicados en dólares
-- =============================================================================
-- EL SÍNTOMA: **el bot se contradice consigo mismo.** Su resumen dice que hay
-- **186** alquileres en Equipetrol y su lista devuelve **172**.
--
-- POR QUÉ. 14 avisos publican el alquiler en DÓLARES (~$718/mes) y no traen
-- `precio_mensual_bob`. En alquiler el Bs es la fuente de verdad y el USD se deriva
-- — estos van al revés. `buscar_propiedades` filtra `WHERE precio_mensual_bob >= 1000`,
-- así que con Bs nulo **quedan fuera del filtro y no salen nunca**.
--
-- 🔑 NO ES UN PROBLEMA DE DATOS: el dato está completo y **la web los muestra sin
-- problema** (los 14 aparecen en `/alquileres`). Es que el bot y la web leen distinto.
-- Equivalen a Bs 4.059–23.192, así que **los 14 pasarían el filtro** si se derivara.
--
-- ES EL MISMO BUG QUE LA MIG 326, EN SU FUNCIÓN GEMELA. La 326 arregló
-- `resumen_mercado` (informaba 168 de 182) con un COALESCE que deriva Bs desde USD;
-- `buscar_propiedades` quedó afuera. Mismo patrón que la 325, que recogió lo que la
-- 321 había dejado. **Cuando se arregla una función, buscar sus hermanas.**
--
-- CÓMO. `precio_mensual_bob` se usa en CUATRO lugares de la rama de alquiler —el JSON,
-- el filtro de mínimo, el de `p_precio_max` y el ORDER BY—. Arreglar uno solo dejaría
-- al aviso entrando pero saliendo sin precio o mal ordenado. Se resuelve el precio
-- UNA vez en un subselect y los 4 usos pasan a leerlo de ahí.
--
-- La rama de VENTA no se toca (no usa `precio_mensual_bob`).
--
-- ⚠️ El bot está con campaña paga corriendo. Rollback al pie.
-- FORMATO: sigue a las migs 326/329/330/331.
-- =============================================================================

BEGIN;

DO $mig$
DECLARE
  def_actual TEXT;
  def_nueva  TEXT;
  n_usos     INT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def_actual
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'buscar_propiedades';

  IF def_actual IS NULL THEN
    RAISE EXCEPTION 'No existe buscar_propiedades. Abortado.';
  END IF;
  IF def_actual ~ 'precio_bob_efectivo' THEN
    RAISE EXCEPTION 'Ya está aplicada. Abortado (nada que hacer).';
  END IF;

  -- tienen que ser exactamente 4 usos: si son otros, la función cambió y hay que mirar
  SELECT COUNT(*) INTO n_usos FROM regexp_matches(def_actual, 'precio_mensual_bob', 'g');
  IF n_usos <> 4 THEN
    RAISE EXCEPTION 'Se esperaban 4 usos de precio_mensual_bob y hay %. Abortado.', n_usos;
  END IF;

  -- 1) los 4 usos pasan a leer el precio ya resuelto
  def_nueva := replace(def_actual, 'precio_mensual_bob', 'precio_bob_efectivo');

  -- 2) se resuelve UNA vez: el Bs del aviso, o el derivado del USD al TC del día
  --    (mismo criterio que la mig 326 en `resumen_mercado`)
  def_nueva := replace(def_nueva,
    'FROM v_mercado_alquiler_shadow',
    'FROM (SELECT *, COALESCE(precio_mensual_bob, ROUND(precio_mensual * (SELECT valor::numeric FROM config_global WHERE clave = ''tipo_cambio_paralelo''), 2)) AS precio_bob_efectivo FROM v_mercado_alquiler_shadow) v_alq');

  IF def_nueva !~ 'precio_bob_efectivo' OR def_nueva = def_actual THEN
    RAISE EXCEPTION 'La sustitución no se aplicó. Abortado.';
  END IF;

  EXECUTE def_nueva;
  RAISE NOTICE 'buscar_propiedades → la rama de alquiler deriva el Bs desde el USD';
END
$mig$;

-- ── Verificación ────────────────────────────────────────────────────────────
DO $chk$
DECLARE
  n_lista INT; n_resumen INT; n_feed INT; rv jsonb; t0 timestamptz; ms numeric;
BEGIN
  -- el numero que importa: la lista tiene que coincidir con el resumen
  SELECT jsonb_array_length(buscar_propiedades('alquiler',NULL,NULL,NULL,NULL,NULL,'precio',900)) INTO n_lista;
  SELECT (resumen_mercado('alquiler')->'general'->>'total')::int INTO n_resumen;
  SELECT COUNT(*) INTO n_feed FROM v_mercado_alquiler_shadow WHERE zona_general='Equipetrol';

  IF n_lista <> n_resumen THEN
    RAISE EXCEPTION 'La lista devuelve % y el resumen dice % — siguen sin coincidir. Abortado.', n_lista, n_resumen;
  END IF;
  IF n_lista < n_feed - 5 THEN
    RAISE EXCEPTION 'La lista devuelve % de % en el feed. Muy pocos. Abortado.', n_lista, n_feed;
  END IF;

  -- ninguno puede salir sin precio
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(
               buscar_propiedades('alquiler',NULL,NULL,NULL,NULL,NULL,'precio',900)) e
              WHERE (e->>'precio_bob') IS NULL OR (e->>'precio_bob')::numeric <= 0) THEN
    RAISE EXCEPTION 'Hay alquileres saliendo sin precio. Abortado.';
  END IF;

  -- la rama de VENTA intacta
  rv := buscar_propiedades('venta',NULL,NULL,NULL,NULL,NULL,'precio',6);
  IF jsonb_array_length(rv) <> 6 OR NOT (rv->0 ? 'estado') OR NOT (rv->0 ? 'amenidades') THEN
    RAISE EXCEPTION 'La rama de venta se movió. Abortado.';
  END IF;

  t0 := clock_timestamp();
  PERFORM buscar_propiedades('alquiler',NULL,NULL,NULL,NULL,NULL,'precio',6);
  ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000;
  IF ms > 1500 THEN
    RAISE EXCEPTION 'Alquiler tardó % ms. Abortado.', round(ms);
  END IF;

  RAISE NOTICE '✅ lista % = resumen % · ninguno sin precio · venta intacta · % ms', n_lista, n_resumen, round(ms);
END
$chk$;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DO $rb$
-- DECLARE d TEXT;
-- BEGIN
--   SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='buscar_propiedades';
--   d := replace(d, 'FROM (SELECT *, COALESCE(precio_mensual_bob, ROUND(precio_mensual * (SELECT valor::numeric FROM config_global WHERE clave = ''tipo_cambio_paralelo''), 2)) AS precio_bob_efectivo FROM v_mercado_alquiler_shadow) v_alq', 'FROM v_mercado_alquiler_shadow');
--   d := replace(d, 'precio_bob_efectivo', 'precio_mensual_bob');
--   EXECUTE d;
-- END $rb$;
-- COMMIT;
