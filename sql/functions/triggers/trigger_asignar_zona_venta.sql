-- Función trigger: trigger_asignar_zona_venta
-- Última migración: 203
-- Exportado de producción: 6 Abr 2026
-- Dominio: Trigger / Auto-asignación zona desde GPS (solo ventas)
-- Dispara: BEFORE INSERT/UPDATE OF latitud, longitud en propiedades_v2
-- Casos: GPS cambió o zona/microzona NULL → asignar desde polígono, excluir si fuera

CREATE OR REPLACE FUNCTION public.trigger_asignar_zona_venta()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_microzona TEXT;
    v_proyecto_tiene_zona BOOLEAN := FALSE;
BEGIN
    IF NEW.tipo_operacion != 'venta' THEN
        RETURN NEW;
    END IF;

    IF NEW.latitud IS NULL OR NEW.longitud IS NULL THEN
        RETURN NEW;
    END IF;

    IF campo_esta_bloqueado(NEW.campos_bloqueados, 'zona') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.latitud IS NOT DISTINCT FROM NEW.latitud
           AND OLD.longitud IS NOT DISTINCT FROM NEW.longitud
           AND NEW.zona IS NOT NULL
           AND NEW.microzona IS NOT NULL THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Helper: ¿el proyecto master tiene zona válida?
    IF NEW.id_proyecto_master IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM proyectos_master pm
            WHERE pm.id_proyecto_master = NEW.id_proyecto_master
              AND pm.zona IS NOT NULL
              AND pm.zona != 'Sin zona'
        ) INTO v_proyecto_tiene_zona;
    END IF;

    SELECT zg.nombre INTO v_microzona
    FROM zonas_geograficas zg
    WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(NEW.longitud::float, NEW.latitud::float), 4326))
      AND zg.activo = TRUE
    LIMIT 1;

    IF v_microzona IS NOT NULL THEN
        IF NEW.microzona IS NULL THEN
            NEW.microzona := v_microzona;
        END IF;
        IF NEW.zona IS NULL THEN
            NEW.zona := v_microzona;
        END IF;
    ELSIF NOT v_proyecto_tiene_zona THEN
        -- GPS fuera de polígonos y sin zona de proyecto → excluir
        NEW.status := 'excluida_zona';
    END IF;

    RETURN NEW;
END;
$function$;
