-- ============================================================================
-- MIGRACIÓN 085: Campos Admin para proyectos_master
-- ============================================================================
-- Fecha: 2026-01-28
-- Propósito: Agregar campos de estado de construcción, fecha de entrega,
--            amenidades del edificio, cantidad de pisos y total de unidades
--            a la tabla proyectos_master para el admin de proyectos.
-- ============================================================================

-- 1. Agregar nuevas columnas a proyectos_master
ALTER TABLE proyectos_master
ADD COLUMN IF NOT EXISTS estado_construccion VARCHAR(50) DEFAULT 'no_especificado',
ADD COLUMN IF NOT EXISTS fecha_entrega DATE,
ADD COLUMN IF NOT EXISTS amenidades_edificio JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS cantidad_pisos INTEGER,
ADD COLUMN IF NOT EXISTS total_unidades INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Comentarios descriptivos
COMMENT ON COLUMN proyectos_master.estado_construccion IS
  'Estado: entrega_inmediata, en_construccion, preventa, en_planos, usado, no_especificado';

COMMENT ON COLUMN proyectos_master.fecha_entrega IS
  'Fecha de entrega estimada (para preventa/construcción) o fecha cuando se entregó';

COMMENT ON COLUMN proyectos_master.amenidades_edificio IS
  'Array JSON de amenidades del edificio: ["Piscina", "Gimnasio", "Seguridad 24/7"]';

COMMENT ON COLUMN proyectos_master.cantidad_pisos IS
  'Número total de pisos del edificio';

COMMENT ON COLUMN proyectos_master.total_unidades IS
  'Número total de unidades/departamentos en el edificio';

COMMENT ON COLUMN proyectos_master.updated_at IS
  'Fecha de última actualización desde el admin';

-- 3. Crear índice para búsqueda por estado de construcción
CREATE INDEX IF NOT EXISTS idx_proyectos_master_estado_construccion
ON proyectos_master(estado_construccion)
WHERE activo = true;

-- 4. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_proyectos_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_proyectos_master_updated_at ON proyectos_master;
CREATE TRIGGER trigger_proyectos_master_updated_at
  BEFORE UPDATE ON proyectos_master
  FOR EACH ROW
  EXECUTE FUNCTION update_proyectos_master_updated_at();

-- 5. Vista para estadísticas de proyectos (admin dashboard)
CREATE OR REPLACE VIEW v_proyectos_admin_stats AS
SELECT
  COUNT(*) FILTER (WHERE activo) as total_activos,
  COUNT(*) FILTER (WHERE activo AND estado_construccion = 'preventa') as en_preventa,
  COUNT(*) FILTER (WHERE activo AND estado_construccion = 'en_construccion') as en_construccion,
  COUNT(*) FILTER (WHERE activo AND estado_construccion = 'entrega_inmediata') as entrega_inmediata,
  COUNT(*) FILTER (WHERE activo AND desarrollador IS NULL) as sin_desarrollador,
  COUNT(*) FILTER (WHERE activo AND latitud IS NOT NULL AND longitud IS NOT NULL) as con_gps,
  COUNT(*) FILTER (WHERE activo AND jsonb_array_length(COALESCE(amenidades_edificio, '[]'::jsonb)) > 0) as con_amenidades
FROM proyectos_master;

COMMENT ON VIEW v_proyectos_admin_stats IS 'Estadísticas para el dashboard admin de proyectos';

-- 6. Función RPC para propagar características a propiedades vinculadas
CREATE OR REPLACE FUNCTION propagar_proyecto_a_propiedades(
  p_id_proyecto INTEGER,
  p_propagar_estado BOOLEAN DEFAULT FALSE,
  p_propagar_fecha BOOLEAN DEFAULT FALSE,
  p_propagar_amenidades BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
  v_proyecto RECORD;
  v_afectadas INTEGER := 0;
  v_estado_count INTEGER := 0;
  v_fecha_count INTEGER := 0;
  v_amenidades_count INTEGER := 0;
BEGIN
  -- Obtener datos del proyecto
  SELECT
    estado_construccion,
    fecha_entrega,
    amenidades_edificio
  INTO v_proyecto
  FROM proyectos_master
  WHERE id_proyecto_master = p_id_proyecto;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Proyecto no encontrado', 'success', false);
  END IF;

  -- Propagar estado de construcción (respetando candados)
  IF p_propagar_estado AND v_proyecto.estado_construccion IS NOT NULL THEN
    UPDATE propiedades_v2
    SET estado_construccion = v_proyecto.estado_construccion
    WHERE id_proyecto_master = p_id_proyecto
      AND (campos_bloqueados->>'estado_construccion')::boolean IS NOT TRUE
      AND (estado_construccion IS NULL OR estado_construccion = 'no_especificado' OR estado_construccion != v_proyecto.estado_construccion);

    GET DIAGNOSTICS v_estado_count = ROW_COUNT;
    v_afectadas := v_afectadas + v_estado_count;
  END IF;

  -- Propagar fecha de entrega (respetando candados)
  IF p_propagar_fecha AND v_proyecto.fecha_entrega IS NOT NULL THEN
    UPDATE propiedades_v2
    SET datos_json = jsonb_set(
      COALESCE(datos_json, '{}'::jsonb),
      '{fecha_entrega}',
      to_jsonb(to_char(v_proyecto.fecha_entrega, 'YYYY-MM'))
    )
    WHERE id_proyecto_master = p_id_proyecto
      AND (campos_bloqueados->>'fecha_entrega')::boolean IS NOT TRUE;

    GET DIAGNOSTICS v_fecha_count = ROW_COUNT;
    v_afectadas := v_afectadas + v_fecha_count;
  END IF;

  -- Propagar amenidades del edificio (agregar sin sobrescribir, respetando candados)
  IF p_propagar_amenidades AND jsonb_array_length(COALESCE(v_proyecto.amenidades_edificio, '[]'::jsonb)) > 0 THEN
    UPDATE propiedades_v2
    SET datos_json = jsonb_set(
      COALESCE(datos_json, '{}'::jsonb),
      '{amenities,lista}',
      (
        SELECT jsonb_agg(DISTINCT value ORDER BY value)
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(datos_json->'amenities'->'lista', '[]'::jsonb)) as value
          UNION
          SELECT jsonb_array_elements_text(v_proyecto.amenidades_edificio) as value
        ) combined
      )
    )
    WHERE id_proyecto_master = p_id_proyecto
      AND (campos_bloqueados->>'amenities')::boolean IS NOT TRUE;

    GET DIAGNOSTICS v_amenidades_count = ROW_COUNT;
    v_afectadas := v_afectadas + v_amenidades_count;
  END IF;

  RETURN json_build_object(
    'success', true,
    'proyecto_id', p_id_proyecto,
    'propiedades_afectadas', v_afectadas,
    'detalle', json_build_object(
      'estado_propagado', v_estado_count,
      'fecha_propagada', v_fecha_count,
      'amenidades_propagadas', v_amenidades_count
    )
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION propagar_proyecto_a_propiedades IS
  'Propaga estado, fecha de entrega y amenidades del proyecto a sus propiedades vinculadas (respeta candados)';

-- 7. Verificación
DO $$
DECLARE
  v_columnas_ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proyectos_master'
    AND column_name = 'estado_construccion'
  ) INTO v_columnas_ok;

  IF v_columnas_ok THEN
    RAISE NOTICE '✅ Migración 085 completada: columnas admin agregadas a proyectos_master';
  ELSE
    RAISE EXCEPTION '❌ Error: columnas no fueron creadas';
  END IF;
END $$;
