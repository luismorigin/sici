-- =====================================================
-- Migración 021: Refactor flujo leads MVP
-- =====================================================
-- Fecha: 2026-01-07
-- Cambios:
--   - Nuevos estados para tracking de progreso
--   - Columnas para progreso parcial
--   - RPCs para el nuevo flujo
-- =====================================================

-- 1. Actualizar constraint de estados
ALTER TABLE leads_mvp
DROP CONSTRAINT IF EXISTS leads_mvp_estado_check;

ALTER TABLE leads_mvp
ADD CONSTRAINT leads_mvp_estado_check
CHECK (estado IN (
  -- Nuevos estados del flujo
  'iniciado',            -- Contacto capturado, form no empezado
  'en_progreso',         -- Form parcialmente completado
  'formulario_completo', -- Form terminado, pendiente confirmación
  'confirmado',          -- Resumen confirmado, viendo resultados
  'interesado',          -- Seleccionó una propiedad
  -- Estados legacy (compatibilidad)
  'nuevo',               -- Form complete + contact (flujo anterior)
  'contactado',          -- Agente hizo contacto
  'calificado',          -- Lead calificado
  'descartado',          -- Lead descartado
  'convertido'           -- Convertido a venta
));

-- 2. Nuevas columnas para tracking de progreso
ALTER TABLE leads_mvp
ADD COLUMN IF NOT EXISTS seccion_actual TEXT,
ADD COLUMN IF NOT EXISTS progreso_secciones JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS confirmado_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS propiedad_seleccionada_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS slack_notificado BOOLEAN DEFAULT FALSE;

-- 3. Índice para encontrar leads abandonados
CREATE INDEX IF NOT EXISTS idx_leads_mvp_estado_progreso
ON leads_mvp(estado, created_at)
WHERE estado IN ('iniciado', 'en_progreso');

-- =====================================================
-- FUNCIONES RPC
-- =====================================================

-- 4. Crear lead inicial (al capturar contacto)
CREATE OR REPLACE FUNCTION crear_lead_inicial(
  p_nombre TEXT,
  p_whatsapp TEXT,
  p_dispositivo TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id INTEGER;
BEGIN
  INSERT INTO leads_mvp (
    nombre,
    whatsapp,
    estado,
    dispositivo,
    formulario_raw
  ) VALUES (
    p_nombre,
    p_whatsapp,
    'iniciado',
    p_dispositivo,
    '{}'::jsonb
  )
  RETURNING id INTO v_lead_id;

  RETURN v_lead_id;
END;
$$;

-- 5. Actualizar progreso por sección
CREATE OR REPLACE FUNCTION actualizar_progreso_seccion(
  p_lead_id INTEGER,
  p_seccion TEXT,
  p_respuestas JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE leads_mvp
  SET
    estado = 'en_progreso',
    seccion_actual = p_seccion,
    progreso_secciones = COALESCE(progreso_secciones, '{}'::jsonb) ||
                         jsonb_build_object(p_seccion, p_respuestas),
    formulario_raw = COALESCE(formulario_raw, '{}'::jsonb) || p_respuestas,
    updated_at = NOW()
  WHERE id = p_lead_id;

  RETURN jsonb_build_object('success', true, 'seccion', p_seccion);
END;
$$;

-- 6. Finalizar formulario completo
CREATE OR REPLACE FUNCTION finalizar_formulario(
  p_lead_id INTEGER,
  p_formulario JSONB,
  p_tiempo_segundos INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE leads_mvp
  SET
    estado = 'formulario_completo',
    formulario_raw = p_formulario,
    tiempo_formulario_segundos = p_tiempo_segundos,
    updated_at = NOW()
  WHERE id = p_lead_id;

  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

-- 7. Confirmar resumen y guardar guía fiduciaria
CREATE OR REPLACE FUNCTION confirmar_y_generar_guia(
  p_lead_id INTEGER,
  p_perfil_fiduciario JSONB,
  p_guia_fiduciaria JSONB,
  p_alertas JSONB,
  p_mbf_ready JSONB,
  p_propiedades_mostradas INTEGER[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE leads_mvp
  SET
    estado = 'confirmado',
    confirmado_at = NOW(),
    perfil_fiduciario = p_perfil_fiduciario,
    guia_fiduciaria = p_guia_fiduciaria,
    alertas = p_alertas,
    mbf_ready = p_mbf_ready,
    propiedades_mostradas = p_propiedades_mostradas,
    updated_at = NOW()
  WHERE id = p_lead_id;

  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

-- 8. Registrar interés en propiedad específica
CREATE OR REPLACE FUNCTION registrar_interes_propiedad(
  p_lead_id INTEGER,
  p_propiedad_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
BEGIN
  UPDATE leads_mvp
  SET
    estado = 'interesado',
    propiedad_interes = p_propiedad_id,
    propiedad_seleccionada_at = NOW(),
    updated_at = NOW()
  WHERE id = p_lead_id
  RETURNING nombre, whatsapp INTO v_lead;

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'propiedad_id', p_propiedad_id,
    'nombre', v_lead.nombre,
    'whatsapp', v_lead.whatsapp
  );
END;
$$;

-- 9. Marcar lead como notificado en Slack
CREATE OR REPLACE FUNCTION marcar_slack_notificado(
  p_lead_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE leads_mvp
  SET slack_notificado = TRUE
  WHERE id = p_lead_id;

  RETURN TRUE;
END;
$$;

-- =====================================================
-- PERMISOS
-- =====================================================

-- Dar permisos al rol anon para las nuevas funciones
GRANT EXECUTE ON FUNCTION crear_lead_inicial TO anon;
GRANT EXECUTE ON FUNCTION actualizar_progreso_seccion TO anon;
GRANT EXECUTE ON FUNCTION finalizar_formulario TO anon;
GRANT EXECUTE ON FUNCTION confirmar_y_generar_guia TO anon;
GRANT EXECUTE ON FUNCTION registrar_interes_propiedad TO anon;
GRANT EXECUTE ON FUNCTION marcar_slack_notificado TO anon;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
-- SELECT
--   routine_name
-- FROM information_schema.routines
-- WHERE routine_name IN (
--   'crear_lead_inicial',
--   'actualizar_progreso_seccion',
--   'finalizar_formulario',
--   'confirmar_y_generar_guia',
--   'registrar_interes_propiedad',
--   'marcar_slack_notificado'
-- );
