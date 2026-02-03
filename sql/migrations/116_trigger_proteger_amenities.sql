-- ============================================================================
-- MIGRACIÓN 116: Trigger para proteger amenities del merge
-- ============================================================================
-- Fecha: 3 Febrero 2026
-- ENFOQUE SEGURO: No modifica la función merge_discovery_enrichment
-- En su lugar, crea un trigger BEFORE UPDATE que restaura amenities
-- si la propiedad tiene candados de 'amenities' o 'equipamiento'
-- ============================================================================
-- VENTAJAS:
-- - NO modifica la función merge (cero riesgo al pipeline)
-- - Fácil de desactivar: DROP TRIGGER tr_proteger_amenities_merge ON propiedades_v2;
-- - Si falla, solo afecta amenities, no el pipeline completo
-- ============================================================================

-- Función del trigger
CREATE OR REPLACE FUNCTION proteger_amenities_candados()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo actuar cuando el merge está corriendo (status cambia de actualizado a completado)
    -- Y hay candados de amenities o equipamiento
    IF OLD.status = 'actualizado'
       AND NEW.status = 'completado'
       AND (
           _is_campo_bloqueado(NEW.campos_bloqueados, 'amenities')
           OR _is_campo_bloqueado(NEW.campos_bloqueados, 'equipamiento')
       )
    THEN
        -- Restaurar la sección amenities del valor anterior (antes del merge)
        IF OLD.datos_json->'amenities' IS NOT NULL THEN
            NEW.datos_json = jsonb_set(
                NEW.datos_json,
                '{amenities}',
                OLD.datos_json->'amenities'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION proteger_amenities_candados() IS
'Trigger que protege datos_json->amenities cuando hay candados. No modifica el merge.';

-- Crear el trigger
DROP TRIGGER IF EXISTS tr_proteger_amenities_merge ON propiedades_v2;
CREATE TRIGGER tr_proteger_amenities_merge
    BEFORE UPDATE ON propiedades_v2
    FOR EACH ROW
    EXECUTE FUNCTION proteger_amenities_candados();

-- Verificación
SELECT 'Trigger creado exitosamente' as resultado,
       COUNT(*) as props_protegidas
FROM propiedades_v2
WHERE (campos_bloqueados ? 'amenities' OR campos_bloqueados ? 'equipamiento')
  AND es_activa = true;

-- ============================================================================
-- ROLLBACK (si algo sale mal):
-- DROP TRIGGER IF EXISTS tr_proteger_amenities_merge ON propiedades_v2;
-- DROP FUNCTION IF EXISTS proteger_amenities_candados();
-- ============================================================================
