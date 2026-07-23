-- ============================================================================
-- Migración 294 — GPS del EDIFICIO en el feed shadow (venta + alquiler)
-- ============================================================================
-- Problema: el feed mostraba cada propiedad en el GPS CRUDO del portal, que a
-- veces está errado (ej.: 3 avisos de "Maré" caían a ~800 m del edificio real y
-- aparecían sueltos en el mapa). Como toda prop matcheada ya se cruza con su
-- `proyectos_master` (que tiene GPS verificado por Google/manual), lo correcto
-- es mostrarla en el GPS del EDIFICIO cuando está matcheada, y caer al GPS de la
-- prop solo si NO tiene edificio (alquiler con LEFT JOIN puede traer props sin
-- match; venta es INNER + pm.activo, así que siempre usa el del edificio).
--
-- Principio del proyecto: crudo adentro, dato bueno en la frontera de salida.
-- NO toca datos crudos (p.latitud / p.longitud quedan intactos) — solo cambia lo
-- que la RPC DEVUELVE para el mapa. Arregla las props de hoy y todas las futuras.
--
-- Implementación robusta: parchea la definición VIVA de cada función leyéndola de
-- la base (el cuerpo NO se transcribe → cero riesgo de typo). El patrón
-- `p.latitud,` / `p.longitud,` aparece exactamente 1 vez en cada función (el
-- SELECT del GPS) — verificado antes de escribir esta migración.
--
-- Reversible: volver a CREATE OR REPLACE con `p.latitud, p.longitud` desnudos
-- (o re-ejecutar pg_get_functiondef de una versión previa).
-- ============================================================================

DO $mig$
DECLARE
  v_fn   text;
  v_def  text;
  v_new  text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['buscar_unidades_simple_shadow',
                              'buscar_unidades_alquiler_shadow'] LOOP

    SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc WHERE proname = v_fn;
    IF v_def IS NULL THEN
      RAISE EXCEPTION 'mig 294: no existe la función %()', v_fn;
    END IF;

    v_new := replace(v_def, 'p.latitud,',  'COALESCE(pm.latitud, p.latitud),');
    v_new := replace(v_new, 'p.longitud,', 'COALESCE(pm.longitud, p.longitud),');

    IF v_new = v_def THEN
      RAISE EXCEPTION 'mig 294: patrón GPS no encontrado en %() — abortar sin cambios', v_fn;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE 'mig 294: %() → GPS del edificio (COALESCE) aplicado', v_fn;
  END LOOP;
END
$mig$;

-- Verificación (opcional, correr aparte): las props deben devolver el GPS del pm.
-- SELECT id, latitud, longitud FROM buscar_unidades_simple_shadow('{"proyecto":"mare"}'::jsonb);
