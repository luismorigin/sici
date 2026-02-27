-- Función trigger: trigger_asignar_zona_alquiler
-- Última migración: 147b
-- Exportado de producción: 27 Feb 2026
-- Dominio: Trigger / Auto-asignación zona desde GPS (solo alquileres)
-- Dispara: BEFORE INSERT/UPDATE en propiedades_v2
-- Casos: GPS cambió, proyecto cambió, zona/microzona NULL

CREATE OR REPLACE FUNCTION public.trigger_asignar_zona_alquiler()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_zona VARCHAR(100);
    v_microzona VARCHAR(100);
    v_gps_cambio BOOLEAN := FALSE;
    v_proyecto_cambio BOOLEAN := FALSE;
BEGIN
    IF NEW.tipo_operacion != 'alquiler' THEN
        RETURN NEW;
    END IF;

    IF NEW.latitud IS NULL OR NEW.longitud IS NULL THEN
        RETURN NEW;
    END IF;

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

    -- CASO 1: Cambió el proyecto -> zona del proyecto + microzona desde polígono
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

    -- CASO 2: GPS cambió -> re-detectar ambas desde polígonos
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

    -- CASO 3: zona o microzona NULL -> rellenar desde GPS
    IF NEW.zona IS NULL OR NEW.microzona IS NULL THEN
        SELECT zg.zona_general, zg.nombre
        INTO v_zona, v_microzona
        FROM zonas_geograficas zg
        WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(NEW.longitud::float, NEW.latitud::float), 4326))
          AND zg.activo = TRUE
        LIMIT 1;

        IF v_zona IS NOT NULL THEN
            IF NEW.zona IS NULL THEN NEW.zona := v_zona; END IF;
            IF NEW.microzona IS NULL THEN NEW.microzona := v_microzona; END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
