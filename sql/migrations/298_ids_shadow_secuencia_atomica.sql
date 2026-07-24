-- =============================================================================
-- 298 — IDs de shadow desde una SECUENCIA ATÓMICA (fin de las colisiones de id)
-- =============================================================================
-- PROBLEMA (incidente del 24-jul-2026)
-- Los dos cargadores del híbrido reservaban ids leyendo el máximo de la tabla:
--     SELECT id FROM propiedades_v2_shadow WHERE id >= 8000000 ORDER BY id DESC LIMIT 1
--     idSeq = max ; ... ; const id = ++idSeq
-- Eso es seguro SOLO si las capturas corren una después de otra. Esa noche las 3
-- routines dispararon JUNTAS (la máquina estuvo apagada durante la ventana 01:17–03:10
-- y el scheduler las lanzó todas al arrancar, 04:19). Venta y alquiler leyeron el MISMO
-- máximo (8000197), las dos numeraron desde 8000198, y la que escribió última PISÓ las
-- filas de la otra: alquiler declaró 5 escritos y sobrevivieron 3 (8000201 y 8000203
-- quedaron como venta, conservando el `precio_mensual_bob` del alquiler que pisaron).
--
-- Ya había un antecedente: el comentario del código documenta el mismo bug en su versión
-- SECUENCIAL (17-jul, 29 colisiones, `8_000_000 + i` reiniciaba la numeración). Aquel fix
-- —arrancar desde el máximo— cerró el caso de corridas sucesivas pero NO el de corridas
-- simultáneas, porque leer-y-después-escribir nunca es atómico.
--
-- SOLUCIÓN
-- `nextval()` sobre una secuencia es atómico por construcción: dos procesos concurrentes
-- NUNCA reciben el mismo número, corran 2 o 20. No baja la probabilidad de choque, la
-- elimina. Los cargadores piden su bloque con `reservar_ids_shadow(n)` en el paso de prep.
--
-- ⚠️ NO RENUMERA NADA. Los ids 8000xxx ya son públicos (el bot y las shortlists de brokers
-- los referencian desde las migs 296/297) → la secuencia arranca por ENCIMA del máximo
-- actual y jamás toca una fila existente.
--
-- INVARIANTE QUE ESTA MIGRACIÓN INSTALA
-- Todo id nuevo del rango 8M debe salir de `reservar_ids_shadow()`. Si algún script vuelve
-- a insertar con un id calculado a mano, la secuencia deja de ser la única fuente y la
-- garantía se rompe (la función NO se re-sincroniza sola: hacerlo sería otra vez una
-- lectura-seguida-de-escritura, justo el patrón que este cambio elimina).
--
-- Consumidores: scripts/deptos-equipetrol/reservar-ids-shadow.mjs (usado por
--   cargar-deptos-shadow.mjs y cargar-alquiler-shadow.mjs).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. SECUENCIA
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.propiedades_v2_shadow_id_reservado_seq
  AS BIGINT
  START WITH 8000001
  MINVALUE 8000001
  NO MAXVALUE
  CACHE 1;

COMMENT ON SEQUENCE public.propiedades_v2_shadow_id_reservado_seq IS
  'Fuente ÚNICA de ids nuevos (rango 8M) para propiedades_v2_shadow. Reemplaza el patrón '
  'MAX(id)+1, que colisionaba cuando las capturas de venta y alquiler corrían en paralelo '
  '(incidente 24-jul-2026). Se consume vía reservar_ids_shadow(). Migración 298.';

-- Posicionar por ENCIMA del máximo ya usado (no renumera nada existente).
DO $$
DECLARE v_max BIGINT;
BEGIN
  SELECT COALESCE(MAX(id), 8000000) INTO v_max
  FROM public.propiedades_v2_shadow WHERE id >= 8000000;
  -- is_called = true → el próximo nextval() devuelve v_max + 1
  PERFORM setval('public.propiedades_v2_shadow_id_reservado_seq', GREATEST(v_max, 8000000), true);
  RAISE NOTICE 'Secuencia posicionada en % (próximo id: %)', v_max, v_max + 1;
END $$;

-- -----------------------------------------------------------------------------
-- 2. FUNCIÓN DE RESERVA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reservar_ids_shadow(p_cantidad INTEGER)
RETURNS SETOF BIGINT
LANGUAGE plpgsql
-- SIN SECURITY DEFINER → corre como el caller (service_role desde los scripts).
AS $$
BEGIN
  IF p_cantidad IS NULL OR p_cantidad < 1 THEN
    RAISE EXCEPTION 'reservar_ids_shadow: p_cantidad debe ser >= 1 (recibido: %)', p_cantidad;
  END IF;
  -- Techo de cordura: un discovery normal trae 6-45 nuevas. Un pedido de 500+ es un bug
  -- del caller, y quemaría ids en silencio.
  IF p_cantidad > 500 THEN
    RAISE EXCEPTION 'reservar_ids_shadow: p_cantidad = % supera el techo de 500', p_cantidad;
  END IF;

  RETURN QUERY
  SELECT nextval('public.propiedades_v2_shadow_id_reservado_seq')
  FROM generate_series(1, p_cantidad);
END;
$$;

COMMENT ON FUNCTION public.reservar_ids_shadow(INTEGER) IS
  'Reserva N ids nuevos para propiedades_v2_shadow de forma ATÓMICA (nextval). Devuelve los '
  'ids ya apartados: dos procesos concurrentes nunca reciben el mismo. La consumen los '
  'cargadores del híbrido en el paso de prep. Los ids no consumidos (fetch fallido) quedan '
  'como huecos, que son inofensivos. Migración 298.';

-- -----------------------------------------------------------------------------
-- 3. 🔑 GRANTS — Preset E (solo pipeline). Regla 6 de SEGURIDAD_SUPABASE.md
-- -----------------------------------------------------------------------------
-- 🔴 REVOCAR PRIMERO (lección migs 283→284 y 290→291): los objetos nuevos en `public`
-- nacen con permisos heredados —las FUNCIONES además nacen con EXECUTE para PUBLIC— y los
-- GRANT de abajo SUMAN, no quitan. Sin esto, cualquiera con la anon key podría quemar ids
-- desde el browser.
REVOKE ALL ON FUNCTION public.reservar_ids_shadow(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_ids_shadow(INTEGER) FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.propiedades_v2_shadow_id_reservado_seq FROM anon, authenticated;

-- service_role es el único que reserva (es el rol de los scripts del cron).
GRANT EXECUTE           ON FUNCTION public.reservar_ids_shadow(INTEGER) TO service_role;
GRANT USAGE, SELECT     ON SEQUENCE public.propiedades_v2_shadow_id_reservado_seq TO service_role;
-- claude_readonly puede MIRAR en qué número va, no avanzarla (USAGE la avanzaría).
GRANT SELECT            ON SEQUENCE public.propiedades_v2_shadow_id_reservado_seq TO claude_readonly;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr después de aplicar)
-- =============================================================================
-- 1) La secuencia quedó por encima del máximo real:
--    SELECT last_value AS secuencia,
--           (SELECT MAX(id) FROM propiedades_v2_shadow WHERE id >= 8000000) AS max_tabla
--    FROM propiedades_v2_shadow_id_reservado_seq;   -- secuencia >= max_tabla
--
-- 2) anon NO puede ejecutar la función (debe dar FALSE):
--    SELECT has_function_privilege('anon', 'public.reservar_ids_shadow(integer)', 'EXECUTE');
--
-- 3) anon NO puede tocar la secuencia (ambos deben dar FALSE):
--    SELECT has_sequence_privilege('anon', 'public.propiedades_v2_shadow_id_reservado_seq', 'USAGE'),
--           has_sequence_privilege('anon', 'public.propiedades_v2_shadow_id_reservado_seq', 'SELECT');
--
-- OJO: no correr `SELECT reservar_ids_shadow(1)` para "probar" — consume un id de verdad.
-- Un hueco es inofensivo, pero conviene saber que pasó.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Los cargadores volverían a MAX(id)+1 (y con él vuelve el riesgo de colisión):
--   DROP FUNCTION IF EXISTS public.reservar_ids_shadow(INTEGER);
--   ALTER SEQUENCE public.propiedades_v2_shadow_id_reservado_seq RENAME TO _trash_298_id_reservado_seq;
-- (Regla 3: rename antes que DROP para la secuencia.)
