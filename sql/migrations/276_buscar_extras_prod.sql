-- 276_buscar_extras_prod.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- buscar_extras: "cola larga" NO canónica para el feed de ventas de PROD.
-- Mirror de buscar_extras_shadow (mig 271) pero leyendo propiedades_v2.
--
-- Alimenta "Lo que la hace especial" en el modal desktop de /ventas:
--   · amenidades_extra    → amenidades de EDIFICIO confirmadas fuera del canónico
--   · equipamiento_otros  → equipamiento de UNIDAD confirmado fuera del canónico
--
-- El split canónico-vs-extra lo produce el reader híbrido (READER_SPEC) y lo
-- escribe en datos_json->'amenities'->{'extra','equipamiento_otros'}. En prod
-- eso llega con el CUTOVER shadow→prod; hasta entonces esta función devuelve []
-- (jsonb ausente → NULL → el front lo trata como []). El feed lo mergea de forma
-- graceful (getStaticProps + /api/ventas): si la función no existe o no hay data,
-- no rompe nada.
--
-- Read-only por diseño (STABLE, solo SELECT). Aplicar desde Supabase UI / psql.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.buscar_extras(p_ids integer[])
RETURNS TABLE(id integer, amenidades_extra text[], equipamiento_otros text[])
LANGUAGE sql
STABLE
AS $function$
  SELECT
    p.id,
    CASE WHEN jsonb_typeof(p.datos_json->'amenities'->'extra') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json->'amenities'->'extra'))
         ELSE NULL END::text[],
    CASE WHEN jsonb_typeof(p.datos_json->'amenities'->'equipamiento_otros') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json->'amenities'->'equipamiento_otros'))
         ELSE NULL END::text[]
  FROM propiedades_v2 p
  WHERE p.id = ANY(p_ids);
$function$;

-- GRANTs explícitos (obligatorio desde el cambio Data API 30-oct).
GRANT EXECUTE ON FUNCTION public.buscar_extras(integer[])
  TO anon, authenticated, service_role, claude_readonly;
