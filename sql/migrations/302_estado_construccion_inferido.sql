-- =============================================================================
-- 302 · Estado de obra INFERIDO — bajar el "sin confirmar" del 52% al ~19%
-- =============================================================================
-- PROBLEMA: 52% del feed de venta (228 de 436) no declara si es preventa o
-- entrega inmediata — el captador simplemente no lo escribió. El usuario que
-- filtra "entrega inmediata" pierde la mitad del inventario real.
--
-- QUÉ NO SE USA — `proyectos_master.estado_construccion`: medido contra los
-- avisos que SÍ declaran, **acierta 78%** (34 contradicciones de 158). Envejece:
-- el edificio se carga en preventa y nadie lo actualiza cuando se entrega.
-- Copiarlo metería ~22% de error en un producto que vende honestidad. Descartado.
--
-- LAS DOS SEÑALES QUE SÍ SIRVEN (validadas con backtest sobre datos reales):
--
--  NIVEL 1 · VECINOS UNÁNIMES — 96,7% de acierto (146/151).
--    Los otros avisos DEL MISMO EDIFICIO que sí declaran. Es un hecho físico: un
--    edificio está construido o no; si 7 captadores distintos dicen "entregado",
--    lo está. Se exige UNANIMIDAD: si hay desacuerdo, no se toca.
--
--  NIVEL 2 · HAY UN ALQUILER ACTIVO EN EL EDIFICIO — 95% contra avisos frescos.
--    No se puede alquilar lo que no está construido. Medido crudo daba 81%, pero
--    al partir por antigüedad del aviso de venta: **95% (38/40) contra avisos
--    ≤90d**, 61-75% contra los viejos ⇒ los desacuerdos son AVISOS VENCIDOS, no
--    fallas de la señal. Solo aplica cuando NO hay vecinos que declaren.
--
-- POR QUÉ EL DESACUERDO ES TIEMPO Y NO TORRES (dato del founder: en Equipetrol
-- casi todos los edificios son de UNA torre): en 4 de los 6 edificios mixtos los
-- "entregado" son sistemáticamente MÁS NUEVOS que los "preventa" — el caso
-- extremo es un aviso de **abril 2024** que sigue diciendo preventa. Son avisos
-- zombis, no etapas distintas. (Los 6 mixtos quedan para revisión humana: el
-- founder conoce el terreno y los resuelve con certeza, no con inferencia.)
--
-- 🔑 SE CALCULA AL LEER, NO SE GUARDA. Mismo principio que el GPS del edificio
-- (mig 294) y los contadores del CRM (mig 296): el crudo se respeta, el dato
-- bueno se arma en la frontera de salida. Consecuencias:
--   · una propiedad nueva que entre esta noche ya sale inferida mañana, sin
--     correr ningún proceso;
--   · el día que el edificio se entrega, TODO el feed se corrige solo (el primer
--     aviso "entregado" o el primer alquiler arrastra al resto);
--   · NUNCA se pisa lo que dijo el anuncio — solo se completa lo que faltaba.
--
-- HONESTIDAD: la vista expone `estado_origen` ('aviso' | 'vecinos' | 'alquiler')
-- para que la ficha pueda DECLARAR que fue deducido y no afirmarlo como certeza.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. La vista de inferencia (propiedad → estado efectivo + de dónde salió)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_estado_obra_inferido_shadow AS
WITH activas AS (
  SELECT id, id_proyecto_master, tipo_operacion,
         NULLIF(COALESCE(estado_construccion::text, 'no_especificado'), 'no_especificado') AS est
  FROM public.propiedades_v2_shadow
  WHERE es_activa AND status IN ('completado','actualizado') AND duplicado_de IS NULL
),
-- Consenso de los avisos de VENTA del mismo edificio que sí declaran
edificio AS (
  SELECT id_proyecto_master,
         COUNT(*) FILTER (WHERE est IS NOT NULL)               AS declaran,
         COUNT(DISTINCT est) FILTER (WHERE est IS NOT NULL)    AS estados_distintos,
         MAX(est) FILTER (WHERE est IS NOT NULL)               AS estado_consenso
  FROM activas
  WHERE tipo_operacion = 'venta' AND id_proyecto_master IS NOT NULL
  GROUP BY 1
),
-- Edificios con al menos un alquiler activo = edificio habitable ⇒ entregado
con_alquiler AS (
  SELECT DISTINCT id_proyecto_master
  FROM activas
  WHERE tipo_operacion = 'alquiler' AND id_proyecto_master IS NOT NULL
)
SELECT
  a.id AS propiedad_id,
  COALESCE(
    a.est,                                                            -- 0 · lo dijo el aviso
    CASE WHEN e.declaran > 0 AND e.estados_distintos = 1
         THEN e.estado_consenso END,                                  -- 1 · vecinos unánimes
    CASE WHEN COALESCE(e.declaran,0) = 0 AND ca.id_proyecto_master IS NOT NULL
         THEN 'entrega_inmediata' END                                 -- 2 · hay alquiler
  ) AS estado_efectivo,
  CASE
    WHEN a.est IS NOT NULL THEN 'aviso'
    WHEN e.declaran > 0 AND e.estados_distintos = 1 THEN 'vecinos'
    WHEN COALESCE(e.declaran,0) = 0 AND ca.id_proyecto_master IS NOT NULL THEN 'alquiler'
    ELSE NULL                                                         -- sin confirmar (honesto)
  END AS estado_origen
FROM activas a
LEFT JOIN edificio e     ON e.id_proyecto_master  = a.id_proyecto_master
LEFT JOIN con_alquiler ca ON ca.id_proyecto_master = a.id_proyecto_master
WHERE a.tipo_operacion = 'venta';

COMMENT ON VIEW public.v_estado_obra_inferido_shadow IS
  'Estado de obra EFECTIVO por propiedad de venta (shadow) + de dónde salió: '
  'aviso (lo declaró) · vecinos (consenso unánime del edificio, 96,7%) · alquiler '
  '(hay alquiler activo ⇒ habitable, 95% vs avisos frescos) · NULL = sin confirmar. '
  'NO usa proyectos_master (78%, envejece). Se calcula al leer. Mig 302.';

REVOKE ALL   ON public.v_estado_obra_inferido_shadow FROM anon, authenticated;
GRANT SELECT ON public.v_estado_obra_inferido_shadow TO service_role, claude_readonly;

-- -----------------------------------------------------------------------------
-- 2. Cablearla al feed: valor devuelto + FILTRO + columna `estado_origen`
-- -----------------------------------------------------------------------------
-- Se parchea la definición VIVA (patrón migs 294/295): el cuerpo NO se transcribe.
-- Los 6 anclajes se verificaron únicos antes de escribir esta migración. Si alguno
-- no aparece, RAISE → la transacción entera revierte y el feed queda intacto.
DO $mig$
DECLARE
  v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'buscar_unidades_simple_shadow';
  IF v_def IS NULL THEN RAISE EXCEPTION 'mig 302: no existe buscar_unidades_simple_shadow()'; END IF;

  v_new := v_def;

  -- (a) firma: nueva columna al FINAL (compatible: supabase-js mapea por nombre)
  v_new := replace(v_new, 'pet_friendly boolean)', 'pet_friendly boolean, estado_origen text)');

  -- (b) el valor devuelto: el aviso manda; si no dijo nada, la inferencia
  v_new := replace(v_new,
    'COALESCE(p.estado_construccion::TEXT, ''no_especificado''),',
    'COALESCE(p.estado_construccion::TEXT, inf.estado_efectivo, ''no_especificado''),');

  -- (c) la columna nueva, después del último valor del SELECT
  v_new := replace(v_new,
    'COALESCE(pm.pet_friendly, false)',
    'COALESCE(pm.pet_friendly, false), inf.estado_origen');

  -- (d) el JOIN a la vista
  v_new := replace(v_new,
    'FROM propiedades_v2_shadow p',
    'FROM propiedades_v2_shadow p
    LEFT JOIN public.v_estado_obra_inferido_shadow inf ON inf.propiedad_id = p.id');

  -- (e) y (f) los FILTROS: sin esto el usuario que filtra "entrega inmediata"
  -- sigue sin ver las 145 inferidas — que es el punto de todo esto.
  v_new := replace(v_new,
    'THEN COALESCE(p.estado_construccion::text, '''') != ''preventa''',
    'THEN COALESCE(p.estado_construccion::text, inf.estado_efectivo, '''') != ''preventa''');
  v_new := replace(v_new,
    'THEN p.estado_construccion::text IN (''preventa'', ''en_construccion'', ''en_planos'')',
    'THEN COALESCE(p.estado_construccion::text, inf.estado_efectivo) IN (''preventa'', ''en_construccion'', ''en_planos'')');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'mig 302: ningún anclaje encontrado — abortar sin cambios';
  END IF;

  -- Cambia la firma (columna nueva) ⇒ CREATE OR REPLACE no alcanza. DROP+CREATE
  -- dentro de la transacción: si el CREATE falla, el ROLLBACK deja todo como estaba.
  DROP FUNCTION IF EXISTS public.buscar_unidades_simple_shadow(jsonb);
  EXECUTE v_new;
  GRANT EXECUTE ON FUNCTION public.buscar_unidades_simple_shadow(jsonb)
    TO anon, authenticated, service_role;
  RAISE NOTICE 'mig 302: feed cableado a la inferencia de estado de obra';
END
$mig$;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación (correr aparte)
-- -----------------------------------------------------------------------------
-- Reparto de la inferencia:
--   SELECT COALESCE(estado_origen,'sin confirmar') AS origen, estado_efectivo, COUNT(*)
--   FROM public.v_estado_obra_inferido_shadow GROUP BY 1,2 ORDER BY 1,3 DESC;
-- El feed ya lo devuelve:
--   SELECT estado_construccion, estado_origen, COUNT(*)
--   FROM buscar_unidades_simple_shadow('{"limite":500}'::jsonb) GROUP BY 1,2 ORDER BY 3 DESC;
-- -----------------------------------------------------------------------------
-- ROLLBACK: re-aplicar la definición previa de la función (queda en el historial
-- de migraciones) y `DROP VIEW public.v_estado_obra_inferido_shadow;`
-- =============================================================================
