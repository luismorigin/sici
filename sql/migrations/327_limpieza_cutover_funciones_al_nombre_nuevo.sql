-- 327 — Limpieza del cutover: las 6 funciones pasan al nombre nuevo
-- ============================================================================
-- 18-ago-2026. Parte de la LIMPIEZA POSTERIOR al TIEMPO 2 (ver docs/RETOMAR.md).
--
-- El TIEMPO 2 (17-ago) renombró la tabla viva a `propiedades_v2` y dejó un ATAJO:
-- una VISTA llamada `propiedades_v2_shadow` sobre la misma tabla, para que nada se
-- cayera mientras se hacía la limpieza. Estas 6 funciones son el frente SQL de esa
-- limpieza: nombran el nombre viejo por texto y hoy funcionan sólo gracias al atajo.
--
--   buscar_unidades_simple_shadow      (1 mención) — el feed de ventas
--   buscar_unidades_alquiler_shadow    (1)         — el feed de alquileres
--   buscar_extras_shadow               (1)         — extras de ambos feeds
--   buscar_similares                   (2)         — 🔴 una de las 3 RPC del BOT
--   snapshot_absorcion_mercado_shadow  (9)         — el snapshot del cron (paso 5c)
--   reconstruir_serie_precios_reexpresada (1)      — la serie histórica de /mercado
--
-- 🔑 POR QUÉ SE HACE CON regexp_replace SOBRE pg_get_functiondef Y NO A MANO:
-- son 74 KB de definiciones. Reescribirlas a mano es la vía más probable de romper
-- algo. Se toma la definición VIVA del catálogo (regla 7: el archivo del repo no
-- prueba lo que corre), se reemplaza sólo el nombre, y se vuelve a crear.
--
-- 🔴 EL PATRÓN LLEVA LÍMITE DE PALABRA A PROPÓSITO: `\mpropiedades_v2_shadow\M`.
-- Sin el `\M` también matchearía `propiedades_v2_shadow_id_reservado_seq` —la
-- secuencia que usa el cargador— y rompería la reserva de ids. Es exactamente el
-- error que se cometió el 17-ago clasificando `reservar_ids_shadow` como rota.
-- Y `propiedades_v2_archivo` no matchea nunca, así que `buscar_similares` y
-- `reconstruir_serie_precios_reexpresada` conservan intacta su lectura del archivo
-- (ahí viven los 6,5 meses de historia).
--
-- ⚠️ Esto NO saca el atajo. La vista `propiedades_v2_shadow` sigue viva hasta que
-- termine también la limpieza del código y las skills. Sacarla es el paso final.
-- ============================================================================

-- ── PASO 0 — BACKUP. Guardar este resultado en un archivo ANTES de seguir ────
--   SELECT p.proname, pg_get_functiondef(p.oid)
--   FROM pg_proc p
--   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
--     AND pg_get_functiondef(p.oid) ~ '\mpropiedades_v2_shadow\M'
--   ORDER BY 1;

-- ── PASO 1 — VER QUÉ SE VA A TOCAR (debe listar exactamente esas 6) ─────────
--   SELECT p.proname, regexp_count(pg_get_functiondef(p.oid), '\mpropiedades_v2_shadow\M') AS menciones
--   FROM pg_proc p
--   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
--     AND pg_get_functiondef(p.oid) ~ '\mpropiedades_v2_shadow\M'
--   ORDER BY 1;

-- ── PASO 2 — EL CAMBIO ──────────────────────────────────────────────────────
DO $limpieza327$
DECLARE
  r        record;
  def_nueva text;
  n         int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ '\mpropiedades_v2_shadow\M'
    ORDER BY p.proname
  LOOP
    def_nueva := regexp_replace(
      pg_get_functiondef(r.oid),
      '\mpropiedades_v2_shadow\M',
      'propiedades_v2',
      'g'
    );
    EXECUTE def_nueva;
    n := n + 1;
    RAISE NOTICE 'recreada: %', r.proname;
  END LOOP;

  IF n <> 6 THEN
    RAISE EXCEPTION 'Se esperaban 6 funciones y se recrearon %. Abortado (nada se guarda).', n;
  END IF;
  RAISE NOTICE 'OK — % funciones al nombre nuevo', n;
END
$limpieza327$;

-- ── PASO 3 — VERIFICACIÓN (los números tienen que dar IGUAL que antes) ──────
--   SELECT 'quedan nombrando el atajo' AS chequeo,
--          COUNT(*)::text AS n
--   FROM pg_proc p
--   WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'
--     AND pg_get_functiondef(p.oid) ~ '\mpropiedades_v2_shadow\M'          -- debe dar 0
--   UNION ALL
--   SELECT 'feed venta (esperado 652)',   (SELECT COUNT(*)::text FROM buscar_unidades_simple_shadow('{"limite":5000}'::jsonb))
--   UNION ALL
--   SELECT 'feed alquiler (esperado 288)',(SELECT COUNT(*)::text FROM buscar_unidades_alquiler_shadow('{"limite":5000}'::jsonb))
--   UNION ALL
--   SELECT 'bot resumen (esperado 182)',  (resumen_mercado('alquiler')->'general'->>'total')
--   UNION ALL
--   SELECT 'archivo intacto en las 2 que lo leen',
--          (SELECT COUNT(*)::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
--             AND p.proname IN ('buscar_similares','reconstruir_serie_precios_reexpresada')
--             AND pg_get_functiondef(p.oid) ~ 'propiedades_v2_archivo');   -- debe dar 2

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Correr el archivo guardado en el PASO 0 (son CREATE OR REPLACE completos).
-- Mientras el atajo exista, ambas versiones funcionan igual: revertir es opcional
-- salvo que algo dé distinto en el paso 3.
