-- Función: procesar_accion_excluida
-- Última migración: 023
-- Exportado de producción: 27 Feb 2026
-- Dominio: HITL / Supervisión Excluidas
-- Acciones: CORREGIR, ACTIVAR, EXCLUIR, ELIMINAR

CREATE OR REPLACE FUNCTION public.procesar_accion_excluida(p_propiedad_id integer, p_accion character varying, p_dorms_correcto integer DEFAULT NULL::integer, p_precio_correcto numeric DEFAULT NULL::numeric, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
  DECLARE
      v_resultado JSONB;
  BEGIN
      CASE p_accion
          WHEN 'CORREGIR' THEN
              UPDATE propiedades_v2
              SET dormitorios = COALESCE(p_dorms_correcto, dormitorios),
                  precio_usd = COALESCE(p_precio_correcto, precio_usd),
                  es_para_matching = TRUE,  -- ACTIVAR después de corregir
                  fecha_actualizacion = NOW()
              WHERE id = p_propiedad_id;

              v_resultado := jsonb_build_object('success', true, 'accion', 'CORREGIR', 'mensaje', 'Datos corregidos y activado');

          WHEN 'ACTIVAR' THEN
              UPDATE propiedades_v2
              SET es_para_matching = TRUE, fecha_actualizacion = NOW()
              WHERE id = p_propiedad_id;

              v_resultado := jsonb_build_object('success', true, 'accion', 'ACTIVAR', 'mensaje', 'Propiedad activada');

          WHEN 'EXCLUIR' THEN
              UPDATE propiedades_v2
              SET es_para_matching = FALSE,
                  campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"es_para_matching": "excluido_hitl"}'::jsonb,
                  fecha_actualizacion = NOW()
              WHERE id = p_propiedad_id;

              v_resultado := jsonb_build_object('success', true, 'accion', 'EXCLUIR', 'mensaje', 'Propiedad excluida permanente');

          WHEN 'ELIMINAR' THEN
              DELETE FROM propiedades_v2 WHERE id = p_propiedad_id;
              v_resultado := jsonb_build_object('success', true, 'accion', 'ELIMINAR', 'mensaje', 'Propiedad eliminada');

          ELSE
              v_resultado := jsonb_build_object('success', false, 'error', 'Acción no reconocida');
      END CASE;

      UPDATE propiedades_excluidas_export
      SET estado = 'procesado', fecha_procesado = NOW(), accion = p_accion, notas = p_notas
      WHERE propiedad_id = p_propiedad_id AND estado = 'pendiente';

      RETURN v_resultado;
  END;
  $function$;
