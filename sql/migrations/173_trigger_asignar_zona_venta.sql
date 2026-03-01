-- Migración 173: Trigger para asignar zona/microzona a propiedades de venta
--
-- Equivalente al trigger_asignar_zona_alquiler pero para ventas.
-- NO extiende el trigger de alquiler (tiene bug: zona_general siempre = 'Equipetrol').
-- Crea trigger separado con lógica limpia.
--
-- Comportamiento:
--   INSERT: siempre deriva zona/microzona desde PostGIS
--   UPDATE: solo si GPS cambió o zona/microzona son NULL
--   Respeta campos_bloqueados
--   No sobreescribe zona si ya tiene valor (merge puede setear desde discovery)
--
-- Interacción con merge:
--   Merge para ventas nunca recibe zona de discovery/enrichment (APIs no la proveen).
--   Si merge escribe zona = NULL, este trigger la llena desde PostGIS.
--   Si zona ya tiene valor (bloqueada o existente), el trigger no la toca.
--
-- Interacción con matching:
--   Matching no toca zona. Sin conflicto.
--
-- Orden de triggers en propiedades_v2:
--   trg_alquiler_matching (BEFORE UPDATE) — solo alquiler
--   trg_asignar_zona_alquiler (BEFORE INSERT/UPDATE) — solo alquiler
--   trg_asignar_zona_venta (BEFORE INSERT/UPDATE) — solo venta ← NUEVO
--   tr_proteger_amenities_merge (BEFORE UPDATE)

CREATE OR REPLACE FUNCTION trigger_asignar_zona_venta()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_microzona TEXT;
BEGIN
    -- Solo ventas
    IF NEW.tipo_operacion != 'venta' THEN
        RETURN NEW;
    END IF;

    -- Necesita GPS
    IF NEW.latitud IS NULL OR NEW.longitud IS NULL THEN
        RETURN NEW;
    END IF;

    -- Respetar candados
    IF campo_esta_bloqueado(NEW.campos_bloqueados, 'zona') THEN
        RETURN NEW;
    END IF;

    -- En UPDATE: solo actuar si GPS cambió o zona/microzona necesitan llenarse
    IF TG_OP = 'UPDATE' THEN
        IF OLD.latitud IS NOT DISTINCT FROM NEW.latitud
           AND OLD.longitud IS NOT DISTINCT FROM NEW.longitud
           AND NEW.zona IS NOT NULL
           AND NEW.microzona IS NOT NULL THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Derivar desde PostGIS
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
    END IF;

    RETURN NEW;
END;
$function$;

-- Trigger: solo en INSERT y cambios de GPS
-- No incluye zona/microzona en UPDATE OF para evitar loops con merge
CREATE TRIGGER trg_asignar_zona_venta
BEFORE INSERT OR UPDATE OF latitud, longitud
ON propiedades_v2
FOR EACH ROW
EXECUTE FUNCTION trigger_asignar_zona_venta();

-- Verificación post-ejecución:
--
-- 1. Confirmar que el trigger existe:
-- SELECT tgname, tgenabled FROM pg_trigger
-- WHERE tgrelid = 'propiedades_v2'::regclass AND tgname LIKE '%zona%';
-- Esperado: trg_asignar_zona_alquiler (O), trg_asignar_zona_venta (O)
--
-- 2. Test funcional (dry run con propiedad existente):
-- SELECT id, zona, microzona, latitud, longitud FROM propiedades_v2
-- WHERE tipo_operacion = 'venta' AND zona IS NOT NULL LIMIT 1;
-- Luego simular un UPDATE de GPS y verificar que zona/microzona se re-asignan.
