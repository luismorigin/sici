-- =============================================================================
-- Migración 270 (SHADOW) — helper buscar_extras_shadow
-- -----------------------------------------------------------------------------
-- Devuelve los campos NUEVOS del lector extendido que la RPC principal
-- (buscar_unidades_simple_shadow) todavía no expone: amenidades_extra,
-- equipamiento_otros, amoblado, equipado. Aditivo y chiquito → NO reescribe la
-- RPC de 150 líneas. El front llama la RPC principal + este helper y mergea por id.
--
-- Aislamiento shadow: service_role + claude_readonly, SIN anon/authenticated.
-- ⚠️ Aplicar vía Supabase UI o psql (NO desde MCP). Rollback al final.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.buscar_extras_shadow(p_ids integer[])
 RETURNS TABLE(id integer, amenidades_extra text[], equipamiento_otros text[], amoblado boolean, equipado boolean)
 LANGUAGE sql STABLE
AS $function$
  SELECT
    p.id,
    CASE WHEN jsonb_typeof(p.datos_json->'amenities'->'extra') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json->'amenities'->'extra'))
         ELSE NULL END::text[],
    CASE WHEN jsonb_typeof(p.datos_json->'amenities'->'equipamiento_otros') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json->'amenities'->'equipamiento_otros'))
         ELSE NULL END::text[],
    (p.datos_json->>'amoblado')::boolean,
    (p.datos_json->>'equipado')::boolean
  FROM propiedades_v2_shadow p
  WHERE p.id = ANY(p_ids);
$function$;

COMMENT ON FUNCTION public.buscar_extras_shadow(integer[]) IS
  'Helper shadow (mig 270): campos nuevos del lector (amenidades_extra, '
  'equipamiento_otros, amoblado, equipado) por id. El front lo mergea con '
  'buscar_unidades_simple_shadow. Aditivo, aislado.';

REVOKE ALL ON FUNCTION public.buscar_extras_shadow(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_extras_shadow(integer[]) TO service_role, claude_readonly;

COMMIT;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.buscar_extras_shadow(integer[]);
