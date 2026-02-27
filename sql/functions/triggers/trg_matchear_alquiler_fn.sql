-- Función trigger: trg_matchear_alquiler_fn
-- Última migración: 166
-- Exportado de producción: 27 Feb 2026
-- Dominio: Trigger / Auto-matching alquiler
-- Dispara: BEFORE UPDATE en propiedades_v2 (solo alquileres)
-- Condición: nombre_edificio cambió O status cambió a completado

CREATE OR REPLACE FUNCTION public.trg_matchear_alquiler_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  DECLARE
      v_result JSONB;
  BEGIN
      IF NEW.tipo_operacion != 'alquiler' THEN
          RETURN NEW;
      END IF;

      IF NEW.id_proyecto_master IS NOT NULL THEN
          RETURN NEW;
      END IF;

      IF NOT (
          (OLD.nombre_edificio IS DISTINCT FROM NEW.nombre_edificio AND NEW.nombre_edificio IS NOT NULL)
          OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completado')
      ) THEN
          RETURN NEW;
      END IF;

      v_result := matchear_alquiler(NEW.id);

      IF (v_result->>'success')::boolean AND (v_result->>'auto_approve')::boolean THEN
          NEW.id_proyecto_master := (v_result->>'id_proyecto')::integer;
          NEW.metodo_match := 'alquiler_' || (v_result->>'method');
          NEW.confianza_sugerencia_extractor := (v_result->>'confidence')::numeric;

          IF COALESCE((v_result->>'add_alias')::boolean, false)
             AND v_result->>'alias_to_add' IS NOT NULL THEN
              UPDATE proyectos_master
              SET alias_conocidos = array_append(
                  COALESCE(alias_conocidos, ARRAY[]::TEXT[]),
                  v_result->>'alias_to_add'
              ),
              updated_at = NOW()
              WHERE id_proyecto_master = (v_result->>'id_proyecto')::integer
                AND NOT (v_result->>'alias_to_add') = ANY(COALESCE(alias_conocidos, ARRAY[]::TEXT[]));
          END IF;
      ELSIF (v_result->>'success')::boolean THEN
          INSERT INTO matching_sugerencias (
              propiedad_id, proyecto_master_sugerido, metodo_matching,
              score_confianza, match_nombre, match_gps, razon_match,
              estado, created_at
          ) VALUES (
              NEW.id,
              CASE WHEN v_result ? 'id_proyecto'
                   THEN (v_result->>'id_proyecto')::integer
                   ELSE NULL END,
              'alquiler_' || (v_result->>'method'),
              ROUND((v_result->>'confidence')::numeric)::integer,
              (v_result->>'tier')::numeric <= 2,
              (v_result->>'tier')::numeric = 3,
              format('Auto-match alquiler: %s', v_result->>'method'),
              'pendiente',
              NOW()
          )
          ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching)
          DO NOTHING;
      END IF;

      RETURN NEW;
  END;
  $function$;
