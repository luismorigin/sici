-- ============================================================================
-- 348 · El feed ocultaba 28 avisos por no saber su superficie
--
-- EL BUG, en una línea: el filtro canónico dice `area_total_m2 >= 20` —pensado
-- para dejar afuera bauleras y parqueos— y en SQL `NULL >= 20` no da FALSO, da
-- DESCONOCIDO. La fila se cae sin que nada lo declare. "No sé cuánto mide" se
-- trataba igual que "mide 3 m²".
--
-- MEDIDO EL 31-ago-2026, no asumido:
--   · 28 avisos activos sin área: 12 venta + 16 alquiler.
--   · NO se puede recuperar el dato: no lo trae el estructurado del portal NI el
--     texto. 0 de 28 mencionan metros en la descripción. (Remax es casi todos:
--     20,5% de su alquiler no informa área, contra 0,2% de Century21.)
--   · O sea que no es un problema de extracción: es qué hacer con lo que no se sabe.
--
-- 🔑 SE PUBLICAN, DECLARANDO EL FALTANTE. Un depto real con precio, dormitorios,
--    zona y fotos sirve aunque no sepamos su superficie; ocultarlo pierde un aviso
--    vivo. Lo que NO se hace es inventar el número.
--
-- 🔴 EL ORDEN IMPORTÓ — esto NO era aplicable antes de hoy. Los feeds hacían
--    `parseFloat(p.area_m2) || 0` y luego imprimían el área en 26 lugares SIN
--    proteger: abrir el filtro primero habría publicado "0 m²", incluido el
--    mensaje de WhatsApp AL CAPTADOR. Los 26 se blindaron con `areaTxt`/`areaCon`
--    (`lib/format-utils.ts`) ANTES de esta migración.
--    El bot nunca tuvo el problema: sus RPC pasan el área sin COALESCE.
--
-- 🟢 No distorsiona estadísticas: el `precio_m2` de estas filas es NULL, así que
--    quedan fuera de toda mediana de $/m² por su cuenta. Suman al inventario, que
--    es lo correcto — existen.
--
-- 🔑 CÓMO ESTÁ HECHA (regla #7): no reescribe las vistas desde un archivo local
--    —acumulan filtros que no están documentados en ningún lado— sino que LEE la
--    definición viva con pg_get_viewdef, le cambia esa única condición y la vuelve
--    a crear. Si el texto no aparece, ABORTA en vez de dejar la vista a medias.
-- ============================================================================

BEGIN;

DO $mig$
DECLARE
  v      text;
  nuevo  text;
  viejo  text;
  vista  text;
BEGIN
  FOREACH vista IN ARRAY ARRAY['v_mercado_venta_shadow','v_mercado_alquiler_shadow'] LOOP
    v := pg_get_viewdef(vista::regclass, true);

    viejo := 'p.area_total_m2 >= 20::numeric';
    nuevo := '(p.area_total_m2 >= 20::numeric OR p.area_total_m2 IS NULL)';

    IF position(viejo IN v) = 0 THEN
      RAISE EXCEPTION 'ABORTO en %: no encontré el filtro "%". La vista cambió — revisar a mano con pg_get_viewdef antes de insistir.', vista, viejo;
    END IF;
    IF position(nuevo IN v) > 0 THEN
      RAISE NOTICE '% ya estaba corregida, se omite', vista;
      CONTINUE;
    END IF;

    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', vista, replace(v, viejo, nuevo));
    RAISE NOTICE '% actualizada', vista;
  END LOOP;
END
$mig$;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN — correr después y esperar exactamente esto
-- ============================================================================
-- SELECT (SELECT count(*) FROM v_mercado_venta_shadow    WHERE area_total_m2 IS NULL) AS venta_sin_area,      -- 12
--        (SELECT count(*) FROM v_mercado_alquiler_shadow WHERE area_total_m2 IS NULL) AS alquiler_sin_area,   -- 16
--        (SELECT count(*) FROM v_mercado_venta_shadow)    AS venta_total,                                     -- 762 -> 774
--        (SELECT count(*) FROM v_mercado_alquiler_shadow) AS alquiler_total;                                  -- 314 -> 330
--
-- 🔴 Y LA PRUEBA QUE MANDA, en pantalla: esas cards tienen que mostrar el resto
--    de los datos SIN un "0 m²" y sin un separador colgando (" ·  · ").
--
-- ROLLBACK: volver a correr este mismo bloque intercambiando `viejo` y `nuevo`.
-- ============================================================================
