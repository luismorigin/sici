-- =============================================================================
-- Migración 278 — pet_friendly a nivel EDIFICIO (proyectos_master), derivado
-- -----------------------------------------------------------------------------
-- Decisión de producto (founder): la política de mascotas del EDIFICIO es
-- relevante también para la COMPRA (reglamento de copropiedad), y merece ser un
-- CHIP propio, no una amenidad más enterrada en la lista.
--
-- Diseño: `pet_friendly` es un atributo del EDIFICIO (una política por edificio,
-- compartida venta+alquiler), guardado en proyectos_master. Se DERIVA de las
-- unidades: true si CUALQUIER unidad shadow del edificio da señal positiva —
--   (a) acepta_mascotas = true  (alquiler, preferencia del dueño → si un dueño
--       alquila con mascotas, el edificio las permite; el reglamento manda), o
--   (b) amenidad "Pet Friendly" en la lista (venta o alquiler).
-- Solo señal POSITIVA: un `false` de un dueño NO implica que el edificio prohíba.
--
-- Cobertura: 22 edificios marcados; venta pasa de 6 → ~91 props con chip (23%).
--
-- Recompute idempotente (re-corrible en el cron): setea true/false SOLO para los
-- edificios que tienen unidades en shadow (no toca el resto del catálogo).
-- Columna ADITIVA y nullable → prod (n8n/feed real) la ignora, cero impacto.
--
-- ⚠️ Aplicar vía Supabase UI o psql. Rollback = DROP COLUMN. Siguiente paso:
--   exponer pm.pet_friendly en las RPCs shadow + sacar "Pet Friendly" de
--   amenities_lista en la salida (migs 279/280).
-- =============================================================================

ALTER TABLE public.proyectos_master
  ADD COLUMN IF NOT EXISTS pet_friendly boolean;

COMMENT ON COLUMN public.proyectos_master.pet_friendly IS
  'Política de mascotas del EDIFICIO (derivada de las unidades: acepta_mascotas=true '
  'o amenidad "Pet Friendly", solo señal positiva). Chip de producto venta+alquiler. Mig 278.';

-- Derivación (recompute para edificios con unidades en shadow)
UPDATE public.proyectos_master pm
SET pet_friendly = EXISTS (
    SELECT 1 FROM public.propiedades_v2_shadow p
    WHERE p.id_proyecto_master = pm.id_proyecto_master
      AND p.es_activa = true
      AND (
        p.acepta_mascotas = true
        OR (p.datos_json->'amenities'->'lista') ? 'Pet Friendly'
      )
  )
WHERE pm.id_proyecto_master IN (
    SELECT DISTINCT id_proyecto_master
    FROM public.propiedades_v2_shadow
    WHERE es_activa = true AND id_proyecto_master IS NOT NULL
  );

-- =============================================================================
-- VERIFICACIÓN (tras aplicar):
--   SELECT COUNT(*) FILTER (WHERE pet_friendly) AS si,
--          COUNT(*) FILTER (WHERE pet_friendly = false) AS no
--   FROM public.proyectos_master;   -- esperado: si=22
-- =============================================================================
-- ROLLBACK:
--   ALTER TABLE public.proyectos_master DROP COLUMN IF EXISTS pet_friendly;
-- =============================================================================
