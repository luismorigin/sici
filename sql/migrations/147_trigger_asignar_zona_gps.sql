-- ============================================================================
-- Migración 147: Trigger para asignar zona/microzona a ALQUILERES
-- ============================================================================
-- Problema: Alquileres entran con GPS pero sin zona ni microzona.
--   Ventas ya tienen su propio pipeline (merge + batch 132) que maneja
--   zona con nombres display distintos (Equipetrol Centro, Eq. Oeste, etc.)
--   → NO tocar ventas para no romper el mapeo existente.
-- Fix: Trigger SOLO para alquileres que asigna zona/microzona cuando:
--   1. INSERT con GPS → detectar desde polígonos
--   2. Cambia GPS → re-detectar desde polígonos
--   3. Cambia id_proyecto_master → copiar zona del proyecto + microzona desde GPS
--   4. zona/microzona NULL → rellenar desde GPS
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_asignar_zona_alquiler()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_zona VARCHAR(100);
    v_microzona VARCHAR(100);
    v_gps_cambio BOOLEAN := FALSE;
    v_proyecto_cambio BOOLEAN := FALSE;
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

    -- CASO 3: zona o microzona NULL → rellenar desde GPS
    IF NEW.zona IS NULL OR NEW.microzona IS NULL THEN
        SELECT zg.zona_general, zg.nombre
        INTO v_zona, v_microzona
        FROM zonas_geograficas zg
        WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(NEW.longitud::float, NEW.latitud::float), 4326))
          AND zg.activo = TRUE
        LIMIT 1;

        IF v_zona IS NOT NULL THEN
            IF NEW.zona IS NULL THEN
                NEW.zona := v_zona;
            END IF;
            IF NEW.microzona IS NULL THEN
                NEW.microzona := v_microzona;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_asignar_zona_por_gps ON propiedades_v2;
DROP TRIGGER IF EXISTS trg_asignar_zona_alquiler ON propiedades_v2;

CREATE TRIGGER trg_asignar_zona_alquiler
    BEFORE INSERT OR UPDATE OF latitud, longitud, zona, microzona, id_proyecto_master
    ON propiedades_v2
    FOR EACH ROW
    EXECUTE FUNCTION trigger_asignar_zona_alquiler();

COMMENT ON FUNCTION trigger_asignar_zona_alquiler() IS
'Trigger SOLO para alquileres. Auto-asigna zona y microzona.
- Cambio de proyecto → zona del proyecto + microzona desde polígono GPS
- Cambio de GPS → re-detecta zona y microzona desde polígonos
- zona/microzona NULL → rellena desde polígono GPS
Ventas NO se tocan (tienen su propio pipeline merge + batch 132).';

DO $$
BEGIN
    RAISE NOTICE 'Migración 147: Trigger zona/microzona automático para ALQUILERES';
END $$;
