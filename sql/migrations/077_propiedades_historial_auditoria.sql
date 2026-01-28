-- ============================================================================
-- MIGRACIÓN 077: Sistema de Auditoría para Propiedades v2
-- Fecha: 2026-01-28
-- Propósito: Registrar todos los cambios manuales a propiedades_v2
-- ============================================================================

-- Tabla de historial de cambios
CREATE TABLE IF NOT EXISTS propiedades_v2_historial (
  id SERIAL PRIMARY KEY,
  propiedad_id INTEGER NOT NULL REFERENCES propiedades_v2(id) ON DELETE CASCADE,

  -- Quién y cuándo
  usuario_tipo TEXT NOT NULL,          -- 'admin' | 'broker' | 'sistema'
  usuario_id TEXT,                     -- UUID del usuario o 'sistema'
  usuario_nombre TEXT,                 -- Nombre para mostrar
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Qué cambió
  campo TEXT NOT NULL,                 -- 'dormitorios' | 'amenities' | etc
  valor_anterior JSONB,                -- Valor antes del cambio
  valor_nuevo JSONB,                   -- Valor después del cambio

  -- Contexto
  motivo TEXT,                         -- Opcional: razón del cambio
  ip_address TEXT                      -- Opcional: para auditoría
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_historial_propiedad
  ON propiedades_v2_historial(propiedad_id);

CREATE INDEX IF NOT EXISTS idx_historial_fecha
  ON propiedades_v2_historial(fecha DESC);

CREATE INDEX IF NOT EXISTS idx_historial_usuario
  ON propiedades_v2_historial(usuario_tipo, usuario_id);

CREATE INDEX IF NOT EXISTS idx_historial_campo
  ON propiedades_v2_historial(campo);

-- Comentarios para documentación
COMMENT ON TABLE propiedades_v2_historial IS
  'Auditoría de todos los cambios manuales a propiedades_v2';

COMMENT ON COLUMN propiedades_v2_historial.usuario_tipo IS
  'Tipo de usuario: admin, broker, sistema';

COMMENT ON COLUMN propiedades_v2_historial.valor_anterior IS
  'Valor del campo antes del cambio (JSONB para soportar cualquier tipo)';

COMMENT ON COLUMN propiedades_v2_historial.valor_nuevo IS
  'Valor del campo después del cambio (JSONB para soportar cualquier tipo)';

-- ============================================================================
-- VISTAS ÚTILES
-- ============================================================================

-- Vista: Cambios recientes (últimas 24 horas)
CREATE OR REPLACE VIEW v_cambios_recientes AS
SELECT
  h.id,
  h.propiedad_id,
  p.nombre_edificio as proyecto,
  p.zona,
  h.campo,
  h.valor_anterior,
  h.valor_nuevo,
  h.usuario_nombre,
  h.usuario_tipo,
  h.motivo,
  h.fecha
FROM propiedades_v2_historial h
JOIN propiedades_v2 p ON h.propiedad_id = p.id
WHERE h.fecha > NOW() - INTERVAL '24 hours'
ORDER BY h.fecha DESC;

-- Vista: Propiedades editadas manualmente (con candados de admin)
CREATE OR REPLACE VIEW v_propiedades_editadas_admin AS
SELECT
  id,
  nombre_edificio as proyecto,
  zona,
  campos_bloqueados,
  (
    SELECT COUNT(*)
    FROM propiedades_v2_historial h
    WHERE h.propiedad_id = propiedades_v2.id
    AND h.usuario_tipo = 'admin'
  ) as total_ediciones_admin
FROM propiedades_v2
WHERE campos_bloqueados IS NOT NULL
  AND campos_bloqueados::text != '{}'
  AND campos_bloqueados::text != 'null'
ORDER BY fecha_actualizacion DESC;

-- ============================================================================
-- FUNCIÓN: Registrar cambio en historial
-- ============================================================================

CREATE OR REPLACE FUNCTION registrar_cambio_propiedad(
  p_propiedad_id INTEGER,
  p_usuario_tipo TEXT,
  p_usuario_id TEXT,
  p_usuario_nombre TEXT,
  p_campo TEXT,
  p_valor_anterior JSONB,
  p_valor_nuevo JSONB,
  p_motivo TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_id INTEGER;
BEGIN
  INSERT INTO propiedades_v2_historial (
    propiedad_id,
    usuario_tipo,
    usuario_id,
    usuario_nombre,
    campo,
    valor_anterior,
    valor_nuevo,
    motivo
  ) VALUES (
    p_propiedad_id,
    p_usuario_tipo,
    p_usuario_id,
    p_usuario_nombre,
    p_campo,
    p_valor_anterior,
    p_valor_nuevo,
    p_motivo
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCIÓN: Obtener historial de una propiedad
-- ============================================================================

CREATE OR REPLACE FUNCTION obtener_historial_propiedad(p_propiedad_id INTEGER)
RETURNS TABLE (
  id INTEGER,
  campo TEXT,
  valor_anterior JSONB,
  valor_nuevo JSONB,
  usuario_nombre TEXT,
  usuario_tipo TEXT,
  motivo TEXT,
  fecha TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.id,
    h.campo,
    h.valor_anterior,
    h.valor_nuevo,
    h.usuario_nombre,
    h.usuario_tipo,
    h.motivo,
    h.fecha
  FROM propiedades_v2_historial h
  WHERE h.propiedad_id = p_propiedad_id
  ORDER BY h.fecha DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

DO $$
BEGIN
  -- Verificar que la tabla existe
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'propiedades_v2_historial') THEN
    RAISE NOTICE '✅ Tabla propiedades_v2_historial creada correctamente';
  ELSE
    RAISE EXCEPTION '❌ Error: Tabla propiedades_v2_historial no existe';
  END IF;

  -- Verificar índices
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_historial_propiedad') THEN
    RAISE NOTICE '✅ Índices creados correctamente';
  END IF;

  -- Verificar funciones
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_cambio_propiedad') THEN
    RAISE NOTICE '✅ Función registrar_cambio_propiedad creada';
  END IF;

  RAISE NOTICE '✅ Migración 077 completada - Sistema de auditoría listo';
END $$;
