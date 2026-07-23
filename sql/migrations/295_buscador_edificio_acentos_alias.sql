-- ============================================================================
-- Migración 295 — Buscador de edificios: acento-insensible + busca en alias
-- ============================================================================
-- Problema: el filtro "EDIFICIO" del feed usa `nombre_oficial ILIKE '%q%'`, que
-- ignora mayúsculas pero NO acentos → escribir "mare" NO encuentra "Condominio
-- Maré" (pm 65). Y solo mira el nombre oficial, no los alias (aunque "MARE" está
-- cargado como alias de ambos "Mare").
--
-- Fix: comparar sin acentos (helper `sin_acentos`, translate → sin dependencia de
-- la extensión unaccent, que no está instalada) y buscar también en
-- `alias_conocidos`. En alquiler se aplica igual a `nombre_edificio`.
--
-- Robusto: parchea la definición VIVA de cada función (no se transcribe el cuerpo).
-- Los anchors del filtro aparecen exactamente 1 vez por función — verificado.
-- Reversible: re-aplicar la versión previa de las funciones.
-- ============================================================================

-- 1) Helper: minúsculas + sin acentos (áéíóúüñ y mayúsculas). IMMUTABLE.
CREATE OR REPLACE FUNCTION public.sin_acentos(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(COALESCE(t, ''),
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'));
$$;

GRANT EXECUTE ON FUNCTION public.sin_acentos(text) TO anon, authenticated, service_role;

-- 2) Parchear el filtro 'proyecto' en las 2 RPCs del feed shadow.
DO $mig$
DECLARE
  v_fn text; v_def text; v_new text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['buscar_unidades_simple_shadow',
                              'buscar_unidades_alquiler_shadow'] LOOP

    SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc WHERE proname = v_fn;
    IF v_def IS NULL THEN
      RAISE EXCEPTION 'mig 295: no existe la función %()', v_fn;
    END IF;

    -- nombre_oficial: sin acentos + también en alias_conocidos
    v_new := replace(v_def,
      $old$pm.nombre_oficial ILIKE '%' || (p_filtros->>'proyecto') || '%'$old$,
      $new$(sin_acentos(pm.nombre_oficial) LIKE '%' || sin_acentos(p_filtros->>'proyecto') || '%'
        OR EXISTS (SELECT 1 FROM unnest(COALESCE(pm.alias_conocidos, ARRAY[]::text[])) al
                   WHERE sin_acentos(al) LIKE '%' || sin_acentos(p_filtros->>'proyecto') || '%'))$new$);

    -- nombre_edificio (solo alquiler): sin acentos
    v_new := replace(v_new,
      $old$p.nombre_edificio ILIKE '%' || (p_filtros->>'proyecto') || '%'$old$,
      $new$sin_acentos(p.nombre_edificio) LIKE '%' || sin_acentos(p_filtros->>'proyecto') || '%'$new$);

    IF v_new = v_def THEN
      RAISE EXCEPTION 'mig 295: filtro proyecto no encontrado en %() — abortar', v_fn;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE 'mig 295: %() → buscador acento-insensible + alias', v_fn;
  END LOOP;
END
$mig$;
