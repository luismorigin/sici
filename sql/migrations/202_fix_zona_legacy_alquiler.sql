-- =====================================================================
-- Migración 202: Fix zona legacy en alquileres
-- Fecha: 2026-03-27
--
-- PROBLEMA: discovery/enrichment setea zona = 'Equipetrol' (legacy).
-- El trigger trg_asignar_zona_alquiler solo re-deriva zona cuando es
-- NULL (CASO 3), así que 'Equipetrol' se queda. 17 props afectadas.
--
-- SOLUCIÓN:
--   1. Reescribir CASO 3 del trigger para detectar zonas no canónicas
--      consultando dinámicamente zonas_geograficas (no hardcodeado).
--   2. Backfill las 17+3 props existentes con zona legacy/null/Sin zona.
--
-- IMPACTO: Solo tipo_operacion = 'alquiler'. Ventas no se toca.
-- =====================================================================

-- =====================================================================
-- 1. Trigger actualizado
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trigger_asignar_zona_alquiler()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_zona VARCHAR(100);
    v_microzona VARCHAR(100);
    v_gps_cambio BOOLEAN := FALSE;
    v_proyecto_cambio BOOLEAN := FALSE;
    v_zona_es_canonica BOOLEAN := FALSE;
BEGIN
    -- SOLO alquileres
    IF NEW.tipo_operacion != 'alquiler' THEN
        RETURN NEW;
    END IF;

    -- Solo actuar si tiene GPS
    IF NEW.latitud IS NULL OR NEW.longitud IS NULL THEN
        RETURN NEW;
    END IF;

    -- Detectar qué cambió
    IF TG_OP = 'INSERT' THEN
        v_gps_cambio := TRUE;
    ELSE
        v_gps_cambio := (
            OLD.latitud IS DISTINCT FROM NEW.latitud OR
            OLD.longitud IS DISTINCT FROM NEW.longitud
        );
        v_proyecto_cambio := (
            OLD.id_proyecto_master IS DISTINCT FROM NEW.id_proyecto_master
            AND NEW.id_proyecto_master IS NOT NULL
        );
    END IF;

    -- CASO 1: Cambió el proyecto → zona del proyecto + microzona desde polígono
    IF v_proyecto_cambio THEN
        SELECT pm.zona INTO v_zona
        FROM proyectos_master pm
        WHERE pm.id_proyecto_master = NEW.id_proyecto_master;

        IF v_zona IS NOT NULL AND v_zona != 'Sin zona' THEN
            NEW.zona := v_zona;
        END IF;

        SELECT zg.nombre INTO v_microzona
        FROM zonas_geograficas zg
        WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(NEW.longitud::float, NEW.latitud::float), 4326))
          AND zg.activo = TRUE
        LIMIT 1;

        IF v_microzona IS NOT NULL THEN
            NEW.microzona := v_microzona;
        END IF;

        RETURN NEW;
    END IF;

    -- CASO 2: GPS cambió → re-detectar ambas desde polígonos
    IF v_gps_cambio THEN
        SELECT zg.zona_general, zg.nombre
        INTO v_zona, v_microzona
        FROM zonas_geograficas zg
        WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(NEW.longitud::float, NEW.latitud::float), 4326))
          AND zg.activo = TRUE
        LIMIT 1;

        IF v_zona IS NOT NULL THEN
            NEW.zona := v_zona;
            NEW.microzona := v_microzona;
        END IF;

        RETURN NEW;
    END IF;

    -- CASO 3 (v2): zona NULL, no canónica, o microzona NULL → re-derivar desde GPS
    -- Verificar si la zona actual es canónica (existe en zonas_geograficas.nombre)
    IF NEW.zona IS NOT NULL AND NEW.zona != 'Sin zona' THEN
        SELECT EXISTS (
            SELECT 1 FROM zonas_geograficas zg
            WHERE zg.activo = TRUE AND zg.nombre = NEW.zona
        ) INTO v_zona_es_canonica;
    END IF;

    IF NEW.zona IS NULL OR NOT v_zona_es_canonica OR NEW.microzona IS NULL THEN
        SELECT zg.zona_general, zg.nombre
        INTO v_zona, v_microzona
        FROM zonas_geograficas zg
        WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(NEW.longitud::float, NEW.latitud::float), 4326))
          AND zg.activo = TRUE
        LIMIT 1;

        IF v_zona IS NOT NULL THEN
            IF NEW.zona IS NULL OR NOT v_zona_es_canonica THEN
                NEW.zona := v_zona;
            END IF;
            IF NEW.microzona IS NULL THEN
                NEW.microzona := v_microzona;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- =====================================================================
-- 2. Backfill: corregir props existentes con zona legacy/null
-- =====================================================================
UPDATE propiedades_v2 p
SET zona = zg.nombre
FROM zonas_geograficas zg
WHERE p.tipo_operacion = 'alquiler'
  AND p.status IN ('completado', 'actualizado')
  AND p.latitud IS NOT NULL
  AND p.longitud IS NOT NULL
  AND (
      p.zona = 'Equipetrol'
      OR p.zona IS NULL
      OR p.zona NOT IN (
          SELECT nombre FROM zonas_geograficas WHERE activo = TRUE
          UNION SELECT 'Sin zona'
      )
  )
  AND zg.activo = TRUE
  AND ST_Contains(zg.geom, ST_SetSRID(ST_Point(p.longitud::float, p.latitud::float), 4326));
