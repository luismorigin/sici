-- ============================================================================
-- Migración 071: Sistema de Feedback Beta
-- Fecha: 22 Enero 2026
-- Propósito: Capturar feedback de usuarios beta ANTES de entregar informe premium
-- ============================================================================

-- 1. Columnas de feedback en leads_mvp
ALTER TABLE leads_mvp
  ADD COLUMN IF NOT EXISTS feedback_recomendaria TEXT,
  ADD COLUMN IF NOT EXISTS feedback_alineadas TEXT,
  ADD COLUMN IF NOT EXISTS feedback_honestidad TEXT,
  ADD COLUMN IF NOT EXISTS feedback_mas_util TEXT,
  ADD COLUMN IF NOT EXISTS feedback_mejoras TEXT,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS es_beta_tester BOOLEAN DEFAULT FALSE;

-- 2. Índice para análisis de feedback
CREATE INDEX IF NOT EXISTS idx_leads_mvp_feedback
  ON leads_mvp(feedback_at)
  WHERE feedback_at IS NOT NULL;

-- 3. Función para crear lead con feedback
CREATE OR REPLACE FUNCTION crear_lead_con_feedback(
  p_nombre TEXT,
  p_whatsapp TEXT,
  p_email TEXT DEFAULT NULL,
  p_formulario_raw JSONB DEFAULT '{}',
  p_feedback_recomendaria TEXT DEFAULT NULL,
  p_feedback_alineadas TEXT DEFAULT NULL,
  p_feedback_honestidad TEXT DEFAULT NULL,
  p_feedback_mas_util TEXT DEFAULT NULL,
  p_feedback_mejoras TEXT DEFAULT NULL
)
RETURNS TABLE (
  lead_id INTEGER,
  codigo_ref TEXT
) AS $$
DECLARE
  v_lead_id INTEGER;
  v_codigo TEXT;
BEGIN
  -- Generar código único
  v_codigo := generar_codigo_ref();

  -- Insertar lead con feedback
  INSERT INTO leads_mvp (
    nombre,
    whatsapp,
    email,
    formulario_raw,
    estado,
    codigo_ref,
    feedback_recomendaria,
    feedback_alineadas,
    feedback_honestidad,
    feedback_mas_util,
    feedback_mejoras,
    feedback_at,
    es_beta_tester,
    created_at
  ) VALUES (
    p_nombre,
    p_whatsapp,
    p_email,
    p_formulario_raw,
    'confirmado',
    v_codigo,
    p_feedback_recomendaria,
    p_feedback_alineadas,
    p_feedback_honestidad,
    p_feedback_mas_util,
    p_feedback_mejoras,
    NOW(),
    TRUE,
    NOW()
  )
  RETURNING id INTO v_lead_id;

  RETURN QUERY SELECT v_lead_id, v_codigo;
END;
$$ LANGUAGE plpgsql;

-- 4. Comentarios
COMMENT ON COLUMN leads_mvp.feedback_recomendaria IS 'Respuesta: ¿Le recomendarías Simón a un amigo?';
COMMENT ON COLUMN leads_mvp.feedback_alineadas IS 'Respuesta: ¿Las propiedades estaban alineadas con lo que buscas?';
COMMENT ON COLUMN leads_mvp.feedback_honestidad IS 'Respuesta: ¿Sentiste que Simón te mostró información honesta?';
COMMENT ON COLUMN leads_mvp.feedback_mas_util IS 'Respuesta: ¿Qué te pareció más útil?';
COMMENT ON COLUMN leads_mvp.feedback_mejoras IS 'Respuesta: ¿Qué mejorarías de Simón? (opcional)';
COMMENT ON COLUMN leads_mvp.feedback_at IS 'Timestamp cuando el usuario completó el feedback';
COMMENT ON COLUMN leads_mvp.es_beta_tester IS 'TRUE si el usuario es beta tester (dio feedback por informe gratis)';
COMMENT ON FUNCTION crear_lead_con_feedback IS 'Crea lead beta tester con feedback y genera código REF';

-- ============================================================================
-- Ejemplos de uso:
-- ============================================================================
/*
-- Crear lead con feedback
SELECT * FROM crear_lead_con_feedback(
  'Juan Pérez',                     -- nombre
  '+59176543210',                   -- whatsapp
  'juan@email.com',                 -- email (opcional)
  '{"busqueda": "2 dorms equipetrol"}', -- formulario_raw
  'definitivamente',                -- feedback_recomendaria
  'perfectamente',                  -- feedback_alineadas
  'totalmente',                     -- feedback_honestidad
  'comparacion_precios',            -- feedback_mas_util
  'Más filtros de búsqueda'         -- feedback_mejoras (opcional)
);
-- Retorna: lead_id, codigo_ref
*/
