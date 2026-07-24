-- =============================================================================
-- 303 · La inferencia de estado de obra solo escucha avisos VIGENTES
-- =============================================================================
-- BUG (propio, encontrado el 24-jul al preguntarse el founder si los avisos
-- zombis se filtran): `v_estado_obra_inferido_shadow` (mig 302) lee
-- `propiedades_v2_shadow` con `es_activa + status + duplicado_de`, pero SIN el
-- filtro de antigüedad que sí aplica el feed. Resultado: un aviso viejo que
-- NINGÚN usuario ve igual VOTA en el consenso del edificio y puede romperlo.
--
-- Caso real: Stratto Up tenía un aviso de **abril 2024** (840 días) diciendo
-- "preventa". No aparece en el feed ni en la vista de mercado — pero hacía ver
-- al edificio como "en desacuerdo" y bloqueaba la inferencia de sus vecinos.
--
-- Medición al 24-jul: **14 avisos zombis opinando, en 7 edificios**. Impacto en
-- el resultado HOY: **0 edificios cambian** — porque los 3 casos donde molestaba
-- (Maré, Stratto Up, Uptown Drei) se corrigieron a mano ese mismo día. O sea: el
-- bug es real pero hoy inocuo; se arregla para que no vuelva a morder.
--
-- REGLA ELEGIDA: `es_propiedad_vigente()` — la MISMA que usa el feed
-- (`buscar_unidades_simple_shadow`), 300 días para todos. El principio es "solo
-- vota lo que el usuario puede ver".
--
-- ⚠️ De paso queda anotado: hay DOS reglas de antigüedad conviviendo —
--   · `v_mercado_venta_shadow`: 730 días si preventa, 300 el resto
--   · `es_propiedad_vigente()` (feed): 300 para TODOS
-- Un aviso de preventa de 400 días aparece en la vista pero no en el feed. No es
-- grave (el feed es el más estricto), pero conviene unificarlo algún día.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_estado_obra_inferido_shadow AS
WITH activas AS (
  SELECT id, id_proyecto_master, tipo_operacion,
         NULLIF(COALESCE(estado_construccion::text, 'no_especificado'), 'no_especificado') AS est,
         -- v303: ¿el usuario puede ver este aviso? Solo esos opinan.
         public.es_propiedad_vigente(estado_construccion::text, fecha_publicacion, fecha_discovery) AS vigente
  FROM public.propiedades_v2_shadow
  WHERE es_activa AND status IN ('completado','actualizado') AND duplicado_de IS NULL
),
-- Consenso de los avisos de VENTA VIGENTES del mismo edificio que sí declaran
edificio AS (
  SELECT id_proyecto_master,
         COUNT(*) FILTER (WHERE est IS NOT NULL)            AS declaran,
         COUNT(DISTINCT est) FILTER (WHERE est IS NOT NULL) AS estados_distintos,
         MAX(est) FILTER (WHERE est IS NOT NULL)            AS estado_consenso
  FROM activas
  WHERE tipo_operacion = 'venta' AND id_proyecto_master IS NOT NULL
    AND vigente                                              -- v303
  GROUP BY 1
),
-- Alquiler activo Y VIGENTE = edificio habitable ⇒ entregado
con_alquiler AS (
  SELECT DISTINCT id_proyecto_master
  FROM activas
  WHERE tipo_operacion = 'alquiler' AND id_proyecto_master IS NOT NULL
    AND vigente                                              -- v303
),
edif_alquiler AS (SELECT DISTINCT id_proyecto_master FROM con_alquiler)
SELECT
  a.id AS propiedad_id,
  COALESCE(
    a.est,
    CASE WHEN e.declaran > 0 AND e.estados_distintos = 1 THEN e.estado_consenso END,
    CASE WHEN COALESCE(e.declaran,0) = 0 AND ea.id_proyecto_master IS NOT NULL
         THEN 'entrega_inmediata' END
  ) AS estado_efectivo,
  CASE
    WHEN a.est IS NOT NULL THEN 'aviso'
    WHEN e.declaran > 0 AND e.estados_distintos = 1 THEN 'vecinos'
    WHEN COALESCE(e.declaran,0) = 0 AND ea.id_proyecto_master IS NOT NULL THEN 'alquiler'
    ELSE NULL
  END AS estado_origen
FROM activas a
LEFT JOIN edificio e       ON e.id_proyecto_master  = a.id_proyecto_master
LEFT JOIN edif_alquiler ea ON ea.id_proyecto_master = a.id_proyecto_master
WHERE a.tipo_operacion = 'venta';

COMMENT ON VIEW public.v_estado_obra_inferido_shadow IS
  'Estado de obra EFECTIVO por propiedad de venta (shadow) + de dónde salió: '
  'aviso · vecinos (consenso unánime, 96,7%) · alquiler (habitable, 95%) · NULL = sin confirmar. '
  'v303: SOLO opinan los avisos VIGENTES (es_propiedad_vigente, la misma regla del feed) — '
  'un aviso zombi que nadie ve no debe romper el consenso del edificio. Migs 302/303.';

REVOKE ALL   ON public.v_estado_obra_inferido_shadow FROM anon, authenticated;
GRANT SELECT ON public.v_estado_obra_inferido_shadow TO service_role, claude_readonly;

COMMIT;

-- Verificación: el reparto no debería empeorar (hoy da 0 cambios; es preventivo)
--   SELECT COALESCE(estado_origen,'(sin confirmar)'), COUNT(*)
--   FROM public.v_estado_obra_inferido_shadow GROUP BY 1 ORDER BY 2 DESC;
-- =============================================================================
