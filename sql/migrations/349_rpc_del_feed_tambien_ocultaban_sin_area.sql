-- ============================================================================
-- 349 · La 348 arregló las vistas y el usuario no vio NINGÚN cambio
--
-- 🔴 EL ERROR, que vale más que el arreglo: la 348 abrió el filtro de área en
--    `v_mercado_venta_shadow` y `v_mercado_alquiler_shadow`, se verificó contra
--    esas vistas (762→774 y 314→330, los seis chequeos en verde) y **el feed
--    siguió mostrando exactamente lo mismo**.
--
--    Porque el feed NO LEE LAS VISTAS. Lee dos RPC:
--      · /api/ventas     → buscar_unidades_simple_shadow
--      · /api/alquileres → buscar_unidades_alquiler_shadow
--    y las DOS tienen su propio `p.area_total_m2 >= 20` adentro. La de alquiler
--    ni siquiera pasa por la vista. Medido después de la 348: siguen devolviendo
--    661 y 314, con CERO avisos sin área.
--
-- 🔑 La regla del proyecto dice "verificar contra la vista, no contra la tabla".
--    Acá se cumplió esa regla y ALCANZÓ IGUAL: la vista tampoco era la superficie.
--    La superficie es lo que responde el endpoint que pinta la pantalla.
--    👉 Antes de dar por cerrado un cambio de filtro: preguntar QUÉ FUNCIÓN sirve
--       la pantalla, y medir ESA. Un conteo correcto sobre el objeto equivocado se
--       lee igual que un arreglo que funcionó.
--
-- QUÉ SE TOCA Y QUÉ NO — hay 10 funciones con ese filtro y sólo 2 son el feed:
--   ✅ buscar_unidades_simple_shadow    (feed /ventas)
--   ✅ buscar_unidades_alquiler_shadow  (feed /alquileres)
--   ⛔ snapshot_absorcion_mercado_shadow — A PROPÓSITO. Sumar 28 avisos al
--      inventario metería un escalón de ~2,5% en la serie de mercado sin que el
--      mercado se haya movido, y esa serie ya arrastra un corte declarado (3-ago).
--      Consecuencia asumida: el conteo del feed y el del snapshot difieren en 28.
--   ⛔ buscar_unidades_reales — la usa `simon-advisor`, que es OTRO repo con deploy
--      propio (ver CLAUDE.md). No se toca sin coordinar.
--   ⛔ inferir_datos_proyecto · calcular_confianza_datos — no son el feed: ahí el
--      filtro define qué props alimentan una inferencia. Otro problema.
--   ⛔ buscar_unidades_alquiler (prod, régimen viejo) · reconstruir_serie_precios_
--      reexpresada (backfill congelado) · _trash_* (muertas).
--
-- Misma técnica que la 348: lee la definición VIVA con pg_get_functiondef, cambia
-- esa única condición y la vuelve a crear. Aborta si no la encuentra.
-- ============================================================================

BEGIN;

DO $mig$
DECLARE
  def   text;
  fn    text;
  viejo CONSTANT text := 'p.area_total_m2 >= 20';
  nuevo CONSTANT text := '(p.area_total_m2 >= 20 OR p.area_total_m2 IS NULL)';
  oid_f oid;
BEGIN
  FOREACH fn IN ARRAY ARRAY['buscar_unidades_simple_shadow','buscar_unidades_alquiler_shadow'] LOOP
    SELECT p.oid INTO oid_f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn;
    IF oid_f IS NULL THEN RAISE EXCEPTION 'ABORTO: no existe %', fn; END IF;

    def := pg_get_functiondef(oid_f);

    IF position(nuevo IN def) > 0 THEN
      RAISE NOTICE '% ya estaba corregida, se omite', fn; CONTINUE;
    END IF;
    IF position(viejo IN def) = 0 THEN
      RAISE EXCEPTION 'ABORTO en %: no encontré "%". Revisar a mano con pg_get_functiondef.', fn, viejo;
    END IF;

    EXECUTE replace(def, viejo, nuevo);
    RAISE NOTICE '% actualizada', fn;
  END LOOP;
END
$mig$;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN — 🔴 contra la RPC, que es lo que pinta la pantalla
-- ============================================================================
-- SELECT 'ventas' AS feed, count(*) AS devuelve,
--        count(*) FILTER (WHERE (r->>'area_m2') IS NULL OR (r->>'area_m2')::numeric = 0) AS sin_area
--   FROM (SELECT to_jsonb(x) r FROM buscar_unidades_simple_shadow('{"limite":5000}'::jsonb) x) s
-- UNION ALL
-- SELECT 'alquiler', count(*),
--        count(*) FILTER (WHERE (r->>'area_m2') IS NULL OR (r->>'area_m2')::numeric = 0)
--   FROM (SELECT to_jsonb(x) r FROM buscar_unidades_alquiler_shadow('{"limite":5000}'::jsonb) x) s;
--
--   esperado:  ventas 661 -> 673 (12 sin área)  ·  alquiler 314 -> 330 (16 sin área)
--
-- Y EN PANTALLA: esas cards muestran precio, dormitorios y zona SIN un "0 m²"
-- y sin separador colgando. En Equipetrol alquiler son 6 y se ven por nombre:
-- Omnia Prime · Legendary by EliTe · Siria 2 · Portobello Green · Domus Tower.
--
-- ROLLBACK: correr el mismo bloque con `viejo` y `nuevo` intercambiados.
-- ============================================================================
