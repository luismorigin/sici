-- =============================================================================
-- 331 · `buscar_propiedades` devuelve amenidades también en ALQUILER
-- =============================================================================
-- La mig 330 lo hizo solo en la rama de venta, porque el pedido de lab-kapso
-- medía la demanda ahí. **No hubo razón técnica** — y al preguntarse por qué no
-- alquiler, los datos dicen que está incluso mejor:
--
--                        venta      alquiler
--   cobertura .......... 90,8%      **93,0%**  (173 de 186)
--   promedio amenidades   6,8        6,2
--   con piscina ......... 346        162
--
-- `amenidades_normalizadas(id)` NO depende de la operación: lee la propiedad por
-- su id. Ya funciona para alquiler; solo faltaba que la rama la devolviera.
--
-- ANCLA: `'amoblado', amoblado,` + `'url', url` — única de la rama de alquiler y
-- distinta de la de venta (que ancla en `estado_construccion`). No hay forma de
-- tocar la equivocada.
--
-- RIESGO: el mismo que la 330, ya medido (33 ms) y ya verificado en producción.
-- Es aditivo: un campo más, ninguno se pierde, la firma no cambia. El prompt del
-- bot lo ignora hasta que lab-kapso lo use.
-- ⚠️ El bot está con campaña paga corriendo.
--
-- OJO: en alquiler `amoblado` YA es un campo propio que el bot usa. Las amenidades
-- van aparte y no lo pisan.
--
-- FORMATO: sigue a las migs 327/328/329/330. Rollback al pie.
-- =============================================================================

BEGIN;

DO $mig$
DECLARE
  def_actual TEXT;
  def_nueva  TEXT;
  ancla     TEXT := E'        \'amoblado\', amoblado,\r\n        \'url\', url\r\n';
  reemplazo TEXT := E'        \'amoblado\', amoblado,\r\n        \'url\', url,\r\n        \'amenidades\', amenidades_normalizadas(id)\r\n';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def_actual
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'buscar_propiedades';

  IF def_actual IS NULL THEN
    RAISE EXCEPTION 'No existe buscar_propiedades. Abortado.';
  END IF;

  -- La 330 tiene que estar aplicada: la venta ya debe traer amenidades
  IF def_actual !~ 'amenidades_normalizadas' THEN
    RAISE EXCEPTION 'La mig 330 no está aplicada (venta no devuelve amenidades). Abortado.';
  END IF;

  def_nueva := replace(def_actual, ancla, reemplazo);
  IF def_nueva = def_actual THEN
    RAISE EXCEPTION 'No se encontró el ancla de la rama de alquiler. Abortado.';
  END IF;

  EXECUTE def_nueva;
  RAISE NOTICE 'buscar_propiedades → devuelve amenidades también en alquiler';
END
$mig$;

-- ── Verificación ────────────────────────────────────────────────────────────
DO $chk$
DECLARE
  ra jsonb; rv jsonb; n_con INT; t0 timestamptz; ms numeric;
BEGIN
  ra := buscar_propiedades('alquiler', NULL, NULL, NULL, NULL, NULL, 'precio', 6);
  IF jsonb_array_length(ra) <> 6 THEN
    RAISE EXCEPTION 'Alquiler devolvió % propiedades, se esperaban 6. Abortado.', jsonb_array_length(ra);
  END IF;
  IF NOT (ra->0 ? 'amenidades') THEN
    RAISE EXCEPTION 'Alquiler no trae el campo amenidades. Abortado.';
  END IF;

  SELECT COUNT(*) INTO n_con FROM jsonb_array_elements(ra) e WHERE jsonb_array_length(e->'amenidades') > 0;
  IF n_con = 0 THEN
    RAISE EXCEPTION 'Ninguna de las 6 de alquiler trae amenidades. Abortado.';
  END IF;

  -- lo propio del alquiler NO puede haberse movido
  IF NOT (ra->0 ? 'precio_bob' AND ra->0 ? 'amoblado' AND ra->0 ? 'url' AND ra->0 ? 'parqueo') THEN
    RAISE EXCEPTION 'Se perdió un campo del retorno de alquiler. Abortado.';
  END IF;

  -- y la rama de VENTA tiene que seguir exactamente igual que tras la 330
  rv := buscar_propiedades('venta', NULL, NULL, NULL, NULL, NULL, 'precio', 6);
  IF jsonb_array_length(rv) <> 6 OR NOT (rv->0 ? 'amenidades') OR NOT (rv->0 ? 'estado') THEN
    RAISE EXCEPTION 'La rama de venta se movió. Abortado.';
  END IF;

  t0 := clock_timestamp();
  PERFORM buscar_propiedades('alquiler', NULL, NULL, NULL, NULL, NULL, 'precio', 6);
  ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000;
  IF ms > 1500 THEN
    RAISE EXCEPTION 'Alquiler tardó % ms. Demasiado — abortado.', round(ms);
  END IF;

  RAISE NOTICE '✅ alquiler con amenidades (% de 6) · venta intacta · % ms', n_con, round(ms);
END
$chk$;

COMMIT;

-- =============================================================================
-- ROLLBACK — saca SOLO la de alquiler, deja la de venta (mig 330)
-- =============================================================================
-- BEGIN;
-- DO $rb$
-- DECLARE d TEXT;
-- BEGIN
--   SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='buscar_propiedades';
--   EXECUTE replace(d,
--     E'        \'amoblado\', amoblado,\r\n        \'url\', url,\r\n        \'amenidades\', amenidades_normalizadas(id)\r\n',
--     E'        \'amoblado\', amoblado,\r\n        \'url\', url\r\n');
-- END $rb$;
-- COMMIT;
