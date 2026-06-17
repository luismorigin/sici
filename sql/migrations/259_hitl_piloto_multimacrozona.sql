-- =============================================================================
-- Migración 259 — HITL piloto multi-macrozona (aislado de Equipetrol)
-- =============================================================================
-- Provee la capa de datos para una UI de aprobación de matches de macrozonas
-- en piloto (hoy Zona Norte; mañana Urubó/Polanco sin código nuevo), cuyas
-- sugerencias viven en estado 'pendiente_<macrozona>' (trigger
-- trg_separar_hitl_por_macrozona, mig 254) y NO aparecen en el HITL de
-- Equipetrol (que filtra estado='pendiente').
--
-- AISLAMIENTO TOTAL DE EQUIPETROL:
--   - Funciones NUEVAS (no toca obtener_pendientes_para_sheets ni
--     aplicar_matches_revisados de Equipetrol).
--   - La aprobación hace UPDATE DIRECTO (id_proyecto_master + metodo_match) y
--     NO pisa nombre_edificio → NO dispara el loop K1 (a diferencia de
--     aplicar_matches_aprobados). Ver memoria project_bug_loop_matching_k1.
--   - No hay path que modifique props de Equipetrol.
--
-- Rollback: ver sección final.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Lista de macrozonas en piloto con sugerencias pendientes (para el selector)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_macrozonas_piloto()
RETURNS TABLE(macrozona text, pendientes bigint, score_alto bigint)
LANGUAGE sql STABLE
AS $$
  SELECT
    substring(estado from 'pendiente_(.*)') AS macrozona,
    COUNT(*) AS pendientes,
    COUNT(*) FILTER (WHERE score_confianza >= 85) AS score_alto
  FROM matching_sugerencias
  WHERE estado LIKE 'pendiente\_%'   -- excluye 'pendiente' (Equipetrol, sin guion bajo)
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

COMMENT ON FUNCTION public.obtener_macrozonas_piloto() IS
  'Macrozonas en piloto con conteo de sugerencias pendientes. Lee matching_sugerencias. Consumer: /admin/supervisor/matching-piloto. Migración 259.';

-- -----------------------------------------------------------------------------
-- 2. Sugerencias pendientes de una macrozona (mismo contrato que el HITL Eq,
--    PERO sin el filtro de score 55-84: en piloto no hay auto-aprobación, se
--    revisa TODO, incluidas las de score alto)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_pendientes_piloto(p_macrozona text)
RETURNS TABLE(
  id_sugerencia integer, propiedad_id integer, url_propiedad text,
  nombre_edificio text, proyecto_sugerido text, proyecto_id integer,
  metodo text, confianza integer, distancia_metros integer,
  latitud numeric, longitud numeric, fuente text
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ms.id,
    ms.propiedad_id::INTEGER,
    p.url::TEXT,
    COALESCE(
      NULLIF(TRIM(p.nombre_edificio), ''),
      TRIM(p.datos_json_enrichment->>'nombre_edificio'),
      'SIN NOMBRE'
    )::TEXT,
    pm.nombre_oficial::TEXT,
    ms.proyecto_master_sugerido,
    ms.metodo_matching::TEXT,
    ms.score_confianza::INTEGER,
    ms.distancia_metros::INTEGER,
    p.latitud, p.longitud, p.fuente::TEXT
  FROM matching_sugerencias ms
  JOIN propiedades_v2 p   ON p.id = ms.propiedad_id
  JOIN proyectos_master pm ON pm.id_proyecto_master = ms.proyecto_master_sugerido
  WHERE ms.estado = 'pendiente_' || p_macrozona
  ORDER BY ms.score_confianza DESC, ms.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.obtener_pendientes_piloto(text) IS
  'Sugerencias pendientes de una macrozona piloto (estado pendiente_<macrozona>), sin filtro de score. Consumer: /admin/supervisor/matching-piloto. Migración 259.';

-- -----------------------------------------------------------------------------
-- 3. Aprobar / rechazar una sugerencia piloto
--    Aprobar = UPDATE DIRECTO (NO pisa nombre_edificio, NO llama a
--    aplicar_matches_aprobados) → evita el bug del loop K1 y no toca Equipetrol.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_match_piloto(
  p_id_sugerencia integer,
  p_aprobar boolean
)
RETURNS TABLE(ok boolean, propiedad_id integer, proyecto_id integer, mensaje text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_prop INTEGER; v_pm INTEGER; v_estado TEXT; v_metodo TEXT; v_score INTEGER;
BEGIN
  SELECT ms.propiedad_id, ms.proyecto_master_sugerido, ms.estado,
         ms.metodo_matching, ms.score_confianza
    INTO v_prop, v_pm, v_estado, v_metodo, v_score
  FROM matching_sugerencias ms
  WHERE ms.id = p_id_sugerencia;

  IF v_prop IS NULL THEN
    RETURN QUERY SELECT false, NULL::int, NULL::int, 'Sugerencia inexistente'; RETURN;
  END IF;

  -- Solo opera sobre estados de piloto (pendiente_<macrozona>); nunca sobre
  -- 'pendiente' (Equipetrol) ni estados ya resueltos.
  IF v_estado NOT LIKE 'pendiente\_%' THEN
    RETURN QUERY SELECT false, v_prop, v_pm,
      ('Sugerencia no esta pendiente de piloto (estado: ' || v_estado || ')'); RETURN;
  END IF;

  IF p_aprobar THEN
    IF campo_esta_bloqueado(
         (SELECT campos_bloqueados FROM propiedades_v2 WHERE id = v_prop),
         'id_proyecto_master') THEN
      RETURN QUERY SELECT false, v_prop, v_pm, 'id_proyecto_master candado'; RETURN;
    END IF;

    UPDATE propiedades_v2
      SET id_proyecto_master = v_pm,
          metodo_match = 'piloto_ui_' || v_metodo,
          confianza_sugerencia_extractor = v_score
      WHERE id = v_prop
        AND id_proyecto_master IS NULL;   -- candado: no pisar un match existente

    UPDATE matching_sugerencias
      SET estado = 'aprobado', revisado_por = 'humano_piloto', fecha_revision = NOW()
      WHERE id = p_id_sugerencia;

    RETURN QUERY SELECT true, v_prop, v_pm, 'Aprobado';
  ELSE
    UPDATE matching_sugerencias
      SET estado = 'rechazado', revisado_por = 'humano_piloto', fecha_revision = NOW()
      WHERE id = p_id_sugerencia;

    RETURN QUERY SELECT true, v_prop, v_pm, 'Rechazado';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.aplicar_match_piloto(integer, boolean) IS
  'Aprueba (UPDATE directo, sin pisar nombre_edificio → sin loop K1) o rechaza una sugerencia de macrozona piloto. NO toca funciones ni props de Equipetrol. Consumer: /admin/supervisor/matching-piloto. Migración 259.';

-- -----------------------------------------------------------------------------
-- 4. GRANTS (mismo patrón que el HITL de Equipetrol: lo llama el admin
--    autenticado desde el browser)
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.obtener_macrozonas_piloto()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_pendientes_piloto(text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_match_piloto(integer, boolean) TO authenticated, service_role;
-- Lectura para inspección desde el MCP readonly (las de SELECT):
GRANT EXECUTE ON FUNCTION public.obtener_macrozonas_piloto()     TO claude_readonly;
GRANT EXECUTE ON FUNCTION public.obtener_pendientes_piloto(text) TO claude_readonly;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.aplicar_match_piloto(integer, boolean);
-- DROP FUNCTION IF EXISTS public.obtener_pendientes_piloto(text);
-- DROP FUNCTION IF EXISTS public.obtener_macrozonas_piloto();
-- (Ninguna toca objetos de Equipetrol; el rollback es autocontenido.)
