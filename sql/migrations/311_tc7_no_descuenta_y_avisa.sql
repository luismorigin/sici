-- =============================================================================
-- 311 · "TC 7" deja de descontar el precio — y pasa a avisar
-- =============================================================================
-- DECISIÓN DEL FOUNDER (28-jul-2026), criterio fiduciario:
--   «pueden ser anuncios que quedaron a tipo 7, pero no podemos hacer nada.
--    Lo correcto es mantener lo que dice el anuncio. Podríamos poner un badge
--    de "confirmar tipo de cambio" en esos casos, pero es lo que hay.»
--
-- QUÉ HACÍA HASTA HOY
-- `precio_normalizado_shadow` interpretaba que un aviso con "TC 7"/"6.96" tenía
-- su precio en dólares CALCULADO al rate viejo, y lo descontaba ×6,96/TC_actual
-- (~40% menos). La intención era llegar al "dólar real"; el efecto es que
-- publicamos un precio que el vendedor nunca dijo.
--
-- LA EVIDENCIA QUE LO DESMIENTE (medida 28-jul, no es opinión)
-- Test del MISMO EDIFICIO: 15 edificios de Equipetrol tienen a la vez unidades
-- con "TC 7" y unidades sin él. Si el descuento fuera correcto, después de
-- aplicarlo ambas deberían valer parecido.
--        unidades "TC 7" en crudo ......... $1.905/m²
--        sus vecinas del mismo edificio ... $1.837/m²   → +3,7%, iguales
--        unidades "TC 7" descontadas ...... $1.139/m²   → −38% vs sus vecinas
-- Además, descontando, 47 de las 54 quedan por debajo del percentil 5 del
-- mercado. No hay lectura de mercado que explique que casi todas las unidades
-- que mencionan "TC 7" sean más baratas que el 95% de Equipetrol.
-- Lectura simple: cuando un aviso dice «$82.500 (TC 7)» no está diciendo "este
-- precio salió del rate viejo", está diciendo "si me pagás en bolivianos te lo
-- convierto a 7". El precio en dólares es real.
--
-- QUÉ HACE ESTA MIGRACIÓN
--   A) `oficial_viejo` deja de descontar → se publica el precio del anuncio.
--   B) El badge "Confirmar tipo de cambio" (mig 227) pasa a encenderse para
--      `oficial_viejo`. Es la contraparte honesta de (A): mostramos lo que dice
--      el aviso Y declaramos que ahí hay una ambigüedad que no resolvimos.
--      El frontend ya está listo — la card lo pinta y el comparador se abstiene
--      de comparar precios cuando una propiedad lo tiene.
--
-- 🔴 ESTO CAMBIA PRECIOS EN PRODUCCIÓN. El feed público de Equipetrol lee
-- shadow desde el 21-jul. Impacto medido:
--        Equipetrol venta ..... 54 props · +40% c/u · $2.084.757 en total
--        Equipetrol alquiler ... 1 prop
--        Zona Norte ............ 7 props (ya cargadas)
-- Son propiedades que HOY se muestran ~40% por debajo de lo que piden.
--
-- ⚠️ Los snapshots de mercado que corran desde mañana van a reflejar el precio
-- nuevo. Los ya guardados NO cambian (son valores congelados) → hay un escalón
-- en la serie, del mismo tipo que los que ya se declaran por versión de filtro.
--
-- ⚠️ Toca doctrina: `TC_NUEVO_DECISION.md` describe el descuento como correcto.
-- Ese documento hay que actualizarlo junto con esta migración.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- A) El precio: `oficial_viejo` se publica tal cual lo dice el anuncio
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.precio_normalizado_shadow(p_precio_usd numeric, p_tipo_cambio_detectado text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    -- 'bob': el crudo está en BOLIVIANOS → USD real = BOB / tasa_paralelo (LIVE, una vez). Crudo real, sin freezing.
    WHEN p_tipo_cambio_detectado = 'bob' THEN
      ROUND(p_precio_usd / (SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo'), 2)
    -- 'oficial_viejo' (mig 311): YA NO DESCUENTA. El aviso menciona el rate viejo, pero
    -- eso no prueba que el precio en dólares haya salido de ahí — la medición del mismo
    -- edificio dice que vale igual que sus vecinas sin descontar. Publicamos lo que dice
    -- el anuncio y encendemos el badge de "confirmar tipo de cambio" (parte B).
    -- (Antes: ROUND(p_precio_usd * 6.96 / tasa_paralelo, 2) — ver rollback al pie.)
    -- default (paralelo/oficial-nuevo/no_especificado/oficial_viejo): USD real directo
    ELSE p_precio_usd
  END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B) El badge: `oficial_viejo` enciende "Confirmar tipo de cambio"
-- ─────────────────────────────────────────────────────────────────────────────
-- Se parte de la definición VIVA de la RPC (Regla Crítica 7: nunca confiar en
-- una copia local) y se le inserta una rama al CASE del badge. Cambio quirúrgico:
-- no se transcriben los 14.000 caracteres de la función, así que no hay riesgo de
-- perder algo en la copia. Si el texto a reemplazar no aparece, ABORTA.
DO $mig311$
DECLARE
  v_def  text;
  v_nueva text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'buscar_unidades_simple_shadow';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'mig 311: no existe buscar_unidades_simple_shadow';
  END IF;

  v_nueva := replace(
    v_def,
    'WHEN p.tipo_cambio_detectado = ''no_especificado''',
    'WHEN p.tipo_cambio_detectado = ''oficial_viejo'' THEN true   -- mig 311: el aviso ancla a un TC viejo → declarar la duda' || chr(10) ||
    '        WHEN p.tipo_cambio_detectado = ''no_especificado'''
  );

  IF v_nueva = v_def THEN
    RAISE EXCEPTION 'mig 311: no se encontró el CASE del badge — la RPC cambió de forma, revisar a mano';
  END IF;

  EXECUTE v_nueva;
  RAISE NOTICE 'mig 311: badge tc_sospechoso extendido a oficial_viejo';
END
$mig311$;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (read-only, correr después)
-- =============================================================================
-- 1) El precio ya no se descuenta (debe dar TRUE):
--      SELECT precio_normalizado_shadow(82500, 'oficial_viejo') = 82500;
--
-- 2) Las otras reglas siguen intactas (bob divide, el resto pasa directo):
--      SELECT precio_normalizado_shadow(570000,'bob') AS bob_convertido,
--             precio_normalizado_shadow(82500,'paralelo') AS paralelo_directo;
--
-- 3) El badge se enciende en las que mencionan TC viejo:
--      SELECT COUNT(*) FILTER (WHERE tc_sospechoso) AS con_badge, COUNT(*) AS total
--      FROM buscar_unidades_simple_shadow('{"limite":500,"solo_con_fotos":false}'::jsonb);
--    Esperado: al menos las 54 de oficial_viejo, más las que ya lo tenían por precio bajo.
--
-- 4) Contraste con la medición que motivó el cambio — las "TC 7" deberían quedar
--    ahora al nivel de sus vecinas del mismo edificio (~$1.900/m², no ~$1.140).
-- =============================================================================

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- A) Volver a descontar:
--    CREATE OR REPLACE FUNCTION public.precio_normalizado_shadow(p_precio_usd numeric, p_tipo_cambio_detectado text)
--     RETURNS numeric LANGUAGE sql STABLE AS $f$
--      SELECT CASE
--        WHEN p_tipo_cambio_detectado = 'bob' THEN
--          ROUND(p_precio_usd / (SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo'), 2)
--        WHEN p_tipo_cambio_detectado = 'oficial_viejo' THEN
--          ROUND(p_precio_usd * 6.96 / (SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo'), 2)
--        ELSE p_precio_usd
--      END;
--    $f$;
--
-- B) Quitar el badge: mismo DO block, invirtiendo el replace (sacar la línea
--    'WHEN p.tipo_cambio_detectado = ''oficial_viejo'' THEN true').
-- =============================================================================
