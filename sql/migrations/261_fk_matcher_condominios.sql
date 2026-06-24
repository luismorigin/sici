-- =============================================================================
-- Migración 261: FK id_condominio_master + matcher areal de condominios (Fase 2)
-- =============================================================================
-- AISLADA / INERTE para producción de deptos. Verificado antes de escribir:
--   · ADD COLUMN bigint nullable = metadata-only (PG 11+), NO reescribe propiedades_v2.
--   · Los 5 triggers de propiedades_v2 son BEFORE/AFTER OF <columnas específicas>
--     (latitud/longitud/zona/id_proyecto_master) → crear la columna NO los dispara.
--   · Las 12 vistas que dependen de propiedades_v2 usan columnas EXPLÍCITAS (0 SELECT *)
--     → la columna nueva no aparece en v_mercado_venta/alquiler ni en ningún feed.
--   · registrar_discovery (escribe venta + casas/terrenos) usa INSERT con lista de
--     columnas → inmune; la columna queda NULL en el pipeline nocturno.
--   · matchear_condominio() es READ-ONLY y no la llama nadie hasta conectarla → cero efecto.
-- El ÚNICO momento con riesgo es DESPUÉS, al EJECUTAR un UPDATE de id_condominio_master
-- (dispara proteger_amenities/alquiler_matching) — ese paso es aparte, sobre casas, aislado.
--
-- Doc: docs/proyectos/zona-norte/DISENO_PIPELINE_CASAS_VIVIENDA.md §5
-- Relacionado: mig 260 (condominios_master). Ref GRANTs: SEGURIDAD_SUPABASE.md (Regla 6).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. COLUMNA FK (nullable, ON DELETE SET NULL). Nace toda-NULL → validación trivial.
-- ---------------------------------------------------------------------------
ALTER TABLE public.propiedades_v2
  ADD COLUMN IF NOT EXISTS id_condominio_master BIGINT
  REFERENCES public.condominios_master(id_condominio_master) ON DELETE SET NULL;

COMMENT ON COLUMN public.propiedades_v2.id_condominio_master IS
  'FK a condominios_master para CASAS en condominio cerrado (Fase 2 casas/vivienda ZN). '
  'NULL = casa individual (calle abierta, estado final válido) o no-casa. '
  'Análogo a id_proyecto_master (deptos) pero matching AREAL (nombre+GPS), no fuzzy de edificio.';

-- Índice parcial (solo casas matcheadas → chico, no pesa sobre deptos)
CREATE INDEX IF NOT EXISTS propiedades_v2_id_condominio_idx
  ON public.propiedades_v2 (id_condominio_master)
  WHERE id_condominio_master IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. HELPER de normalización SUFIJO-AWARE (no reusa normalize_nombre a propósito)
-- ---------------------------------------------------------------------------
-- normalize_nombre() (deptos) BORRA los romanos finales (paso 3) → 'Sevilla Norte I'
-- y 'Sevilla Norte II' colapsan a 'sevillanorte' = COLISIÓN. Para condominios el
-- sufijo ES el discriminante de las familias contiguas (Sevilla ×8, Riviera ×5).
-- Esta versión PRESERVA el ordinal y unifica romano↔arábigo ('II' = '2').
CREATE OR REPLACE FUNCTION public.normalize_condominio(texto TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE v TEXT;
BEGIN
  IF texto IS NULL THEN RETURN NULL; END IF;
  v := lower(texto);
  v := translate(v, 'áéíóúüñ', 'aeiouun');          -- quitar acentos (no hay ext unaccent)
  -- romano final (separado por espacio) → arábigo. Orden: largo→corto para no truncar.
  v := regexp_replace(v, '\s+viii$', ' 8');
  v := regexp_replace(v, '\s+vii$',  ' 7');
  v := regexp_replace(v, '\s+vi$',   ' 6');
  v := regexp_replace(v, '\s+ix$',   ' 9');
  v := regexp_replace(v, '\s+iv$',   ' 4');
  v := regexp_replace(v, '\s+iii$',  ' 3');
  v := regexp_replace(v, '\s+ii$',   ' 2');
  v := regexp_replace(v, '\s+i$',    ' 1');
  v := regexp_replace(v, '\s+v$',    ' 5');
  v := regexp_replace(v, '\s+x$',    ' 10');
  v := regexp_replace(v, 'condominio|conjunto|barrio', '', 'g');  -- prefijos genéricos
  v := regexp_replace(v, '[^a-z0-9]', '', 'g');     -- solo alfanumérico (mantiene dígitos)
  RETURN v;
END;
$$;

COMMENT ON FUNCTION public.normalize_condominio(TEXT) IS
  'Normalización sufijo-aware para matching de condominios: preserva el ordinal '
  '(romano→arábigo) que distingue familias contiguas. NO usar normalize_nombre (borra romanos).';

-- ---------------------------------------------------------------------------
-- 3. MATCHER AREAL (read-only). Nombre-primario + GPS desempate/cobertura.
-- ---------------------------------------------------------------------------
-- Devuelve el MEJOR candidato (o 0 filas si nada confiable). NO escribe nada.
-- El caller (paso de aplicación, futuro) decide por `metodo`/`score` si aplica,
-- revisa en HITL, o descarta. Regla del diseño: sin nombre en cluster denso ≠ match.
CREATE OR REPLACE FUNCTION public.matchear_condominio(
  p_lat NUMERIC,
  p_lon NUMERIC,
  p_nombre TEXT DEFAULT NULL
)
RETURNS TABLE (
  id_condominio_master BIGINT,
  nombre_oficial       TEXT,
  metodo               TEXT,     -- 'nombre+gps' | 'nombre_gps_lejos' | 'nombre_aprox' | 'gps' | 'gps_ambiguo'
  distancia_m          NUMERIC,
  score                NUMERIC,  -- 0..1 (≥0.85 fuerte, 0.5-0.85 revisar, <0.5 HITL)
  n_en_radio           INTEGER   -- cuántos condominios cubren este GPS (>1 = zona contigua)
)
LANGUAGE sql STABLE
AS $$
  WITH p AS (
    SELECT NULLIF(public.normalize_condominio(p_nombre), '') AS pnorm,
           ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326) AS pt
  ),
  cand AS (
    SELECT c.id_condominio_master, c.nombre_oficial, c.radio_metros,
           ST_DistanceSphere(p.pt, ST_SetSRID(ST_MakePoint(c.longitud, c.latitud), 4326)) AS dist,
           CASE
             WHEN p.pnorm IS NULL THEN 0
             WHEN public.normalize_condominio(c.nombre_oficial) = p.pnorm THEN 1.0
             WHEN EXISTS (SELECT 1 FROM unnest(c.alias_conocidos) a
                          WHERE public.normalize_condominio(a) = p.pnorm) THEN 1.0
             ELSE similarity(public.normalize_condominio(c.nombre_oficial), p.pnorm)
           END AS sim_nombre
    FROM public.condominios_master c, p
    WHERE c.activo
  ),
  scored AS (
    SELECT *,
           COUNT(*) FILTER (WHERE dist <= radio_metros) OVER () AS n_radio
    FROM cand
  )
  SELECT id_condominio_master, nombre_oficial,
    CASE
      WHEN sim_nombre >= 0.99 AND dist <= radio_metros * 2 THEN 'nombre+gps'
      WHEN sim_nombre >= 0.99                              THEN 'nombre_gps_lejos'
      WHEN sim_nombre >= 0.55 AND dist <= radio_metros * 2 THEN 'nombre_aprox'
      WHEN n_radio = 1        AND dist <= radio_metros      THEN 'gps'
      ELSE 'gps_ambiguo'
    END AS metodo,
    ROUND(dist::numeric, 1) AS distancia_m,
    CASE
      WHEN sim_nombre >= 0.99 AND dist <= radio_metros     THEN 0.98
      WHEN sim_nombre >= 0.99 AND dist <= radio_metros * 2 THEN 0.90
      WHEN sim_nombre >= 0.99                              THEN 0.70  -- GPS roto, nombre exacto manda
      WHEN sim_nombre >= 0.55 AND dist <= radio_metros * 2 THEN ROUND((0.45 + 0.35 * sim_nombre)::numeric, 2)
      WHEN n_radio = 1        AND dist <= radio_metros      THEN 0.50  -- 1 solo condominio cubre el punto
      WHEN dist <= radio_metros                            THEN 0.30  -- varios contiguos, sin nombre → HITL
      ELSE 0.0
    END AS score,
    n_radio AS n_en_radio
  FROM scored
  -- descarta ruido: ni nombre razonable ni GPS dentro de radio
  WHERE sim_nombre >= 0.55 OR dist <= radio_metros
  ORDER BY
    (sim_nombre >= 0.99) DESC,   -- 1º nombre exacto
    sim_nombre DESC,             -- 2º similitud de nombre
    dist ASC                     -- 3º GPS más cercano desempata
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.matchear_condominio(NUMERIC, NUMERIC, TEXT) IS
  'Matcher areal casa→condominio (Fase 2). Nombre-primario (normalize_condominio + alias + '
  'similarity) con GPS para desempate/cobertura. Read-only: devuelve mejor candidato + metodo/score, '
  'no aplica. metodo gps_ambiguo (varios contiguos sin nombre) = NO auto-aplicar, va a HITL.';

-- ---------------------------------------------------------------------------
-- 4. GRANTS (Regla 13) — funciones read-only/helper
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.normalize_condominio(TEXT)            TO service_role, authenticated, anon, claude_readonly;
GRANT EXECUTE ON FUNCTION public.matchear_condominio(NUMERIC, NUMERIC, TEXT) TO service_role, authenticated, claude_readonly;

COMMIT;

-- =============================================================================
-- ROLLBACK:
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.matchear_condominio(NUMERIC, NUMERIC, TEXT);
--   DROP FUNCTION IF EXISTS public.normalize_condominio(TEXT);
--   DROP INDEX IF EXISTS public.propiedades_v2_id_condominio_idx;
--   ALTER TABLE public.propiedades_v2 DROP COLUMN IF EXISTS id_condominio_master;
--   COMMIT;
-- (Seguro: la columna no la consume ninguna vista/función de producción.)
-- =============================================================================

-- =============================================================================
-- SMOKE TEST (correr tras aplicar, no muta nada):
--   -- a) match por nombre exacto + GPS (Sevilla Norte II, su centroide):
--   SELECT * FROM matchear_condominio(-17.695860, -63.157979, 'Sevilla Norte 2');
--   -- esperado: 'Sevilla Norte II', metodo 'nombre+gps', score 0.98
--   -- b) desambiguación de sufijo (mismo GPS, nombre I): debe dar Norte I, no II:
--   SELECT * FROM matchear_condominio(-17.696061, -63.154427, 'Sevilla Norte 1');
--   -- c) zona contigua SIN nombre (centroide Riviera del Remanso): n_en_radio>1, gps_ambiguo:
--   SELECT * FROM matchear_condominio(-17.706415, -63.184875, NULL);
-- =============================================================================
