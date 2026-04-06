-- =====================================================================
-- Migración 203: Excluir propiedades fuera de polígonos de zona
-- Fecha: 2026-04-06
--
-- PROBLEMA: propiedades con GPS fuera de todos los polígonos de
-- zonas_geograficas quedan con status='completado' y aparecen en feeds.
-- Afecta alquiler (sin filtro) y potencialmente venta.
--
-- SOLUCIÓN:
--   1. Trigger alquiler: CASO 2 y CASO 3 marcan excluida_zona si GPS
--      fuera de polígonos Y no tiene zona válida de proyecto master.
--   2. Trigger venta: misma lógica.
--   3. Backfill: excluir props existentes completadas fuera de polígonos
--      sin zona válida de ninguna fuente.
--
-- EXCEPCIÓN: props con id_proyecto_master que tiene zona válida NO se
-- excluyen (son props en el borde del polígono, zona del proyecto es
-- correcta).
--
-- IMPACTO ESTIMADO: ~16 props (13 venta + 3 alquiler con zona NULL).
-- =====================================================================

-- =====================================================================
-- 1. Trigger alquiler — agregar exclusión por fuera de zona
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
    v_proyecto_tiene_zona BOOLEAN := FALSE;
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

    -- Helper: ¿el proyecto master tiene zona válida?
    IF NEW.id_proyecto_master IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM proyectos_master pm
            WHERE pm.id_proyecto_master = NEW.id_proyecto_master
              AND pm.zona IS NOT NULL
              AND pm.zona != 'Sin zona'
        ) INTO v_proyecto_tiene_zona;
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
        ELSIF NOT v_proyecto_tiene_zona THEN
            -- GPS fuera de polígonos y sin zona de proyecto → excluir
            NEW.status := 'excluida_zona';
        END IF;

        RETURN NEW;
    END IF;

    -- CASO 3 (v2): zona NULL, no canónica, o microzona NULL → re-derivar desde GPS
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
        ELSIF NOT v_proyecto_tiene_zona THEN
            -- GPS fuera de polígonos y sin zona de proyecto → excluir
            NEW.status := 'excluida_zona';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- =====================================================================
-- 2. Trigger venta — agregar exclusión por fuera de zona
-- =====================================================================
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

-- =====================================================================
-- 3. Backfill: excluir props existentes fuera de polígonos sin zona
--    válida de ninguna fuente
-- =====================================================================
UPDATE propiedades_v2 p
SET status = 'excluida_zona'
WHERE p.status IN ('completado', 'actualizado')
  AND p.latitud IS NOT NULL
  AND p.longitud IS NOT NULL
  -- Sin zona válida
  AND (p.zona IS NULL OR p.zona = 'Sin zona')
  -- Sin proyecto con zona válida
  AND NOT EXISTS (
      SELECT 1 FROM proyectos_master pm
      WHERE pm.id_proyecto_master = p.id_proyecto_master
        AND pm.zona IS NOT NULL
        AND pm.zona != 'Sin zona'
  )
  -- GPS fuera de todos los polígonos
  AND NOT EXISTS (
      SELECT 1 FROM zonas_geograficas zg
      WHERE zg.activo = TRUE
        AND ST_Contains(zg.geom, ST_SetSRID(ST_Point(p.longitud::float, p.latitud::float), 4326))
  );
