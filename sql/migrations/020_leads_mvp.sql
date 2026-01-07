-- =====================================================
-- MIGRACIÓN 020: Tabla leads_mvp
-- Fecha: 7 Enero 2026
-- Propósito: Capturar leads del MVP Simón
-- Spec: docs/planning/SICI_MVP_SPEC.md
-- =====================================================

-- Tabla principal de leads
CREATE TABLE IF NOT EXISTS leads_mvp (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Contacto
  nombre TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT,

  -- Formulario completo (raw JSON)
  formulario_raw JSONB NOT NULL,

  -- Outputs de Simón (generados por Claude API)
  perfil_fiduciario JSONB,
  guia_fiduciaria JSONB,
  alertas JSONB,

  -- Filtros generados para búsqueda
  mbf_ready JSONB,

  -- Resultados mostrados
  propiedades_mostradas INTEGER[],
  propiedad_interes INTEGER,
  razon_interes TEXT,

  -- Seguimiento
  estado TEXT DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'contactado', 'calificado', 'descartado', 'convertido')),
  notas TEXT,
  contactado_at TIMESTAMP WITH TIME ZONE,
  contactado_por TEXT,

  -- Métricas UX
  tiempo_formulario_segundos INTEGER,
  seccion_abandono TEXT,
  dispositivo TEXT,

  -- Metadata
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_leads_mvp_estado ON leads_mvp(estado);
CREATE INDEX IF NOT EXISTS idx_leads_mvp_created ON leads_mvp(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_mvp_whatsapp ON leads_mvp(whatsapp);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_leads_mvp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_leads_mvp_updated_at ON leads_mvp;
CREATE TRIGGER trigger_leads_mvp_updated_at
  BEFORE UPDATE ON leads_mvp
  FOR EACH ROW
  EXECUTE FUNCTION update_leads_mvp_updated_at();

-- Función para registrar nuevo lead
CREATE OR REPLACE FUNCTION registrar_lead_mvp(
  p_nombre TEXT,
  p_whatsapp TEXT,
  p_formulario JSONB,
  p_perfil_fiduciario JSONB DEFAULT NULL,
  p_guia_fiduciaria JSONB DEFAULT NULL,
  p_alertas JSONB DEFAULT NULL,
  p_mbf_ready JSONB DEFAULT NULL,
  p_propiedades_mostradas INTEGER[] DEFAULT NULL,
  p_propiedad_interes INTEGER DEFAULT NULL,
  p_tiempo_segundos INTEGER DEFAULT NULL,
  p_dispositivo TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_lead_id INTEGER;
BEGIN
  INSERT INTO leads_mvp (
    nombre,
    whatsapp,
    formulario_raw,
    perfil_fiduciario,
    guia_fiduciaria,
    alertas,
    mbf_ready,
    propiedades_mostradas,
    propiedad_interes,
    tiempo_formulario_segundos,
    dispositivo
  ) VALUES (
    p_nombre,
    p_whatsapp,
    p_formulario,
    p_perfil_fiduciario,
    p_guia_fiduciaria,
    p_alertas,
    p_mbf_ready,
    p_propiedades_mostradas,
    p_propiedad_interes,
    p_tiempo_segundos,
    p_dispositivo
  )
  RETURNING id INTO v_lead_id;

  RETURN v_lead_id;
END;
$$ LANGUAGE plpgsql;

-- Función para actualizar estado del lead
CREATE OR REPLACE FUNCTION actualizar_estado_lead(
  p_lead_id INTEGER,
  p_estado TEXT,
  p_notas TEXT DEFAULT NULL,
  p_contactado_por TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE leads_mvp
  SET
    estado = p_estado,
    notas = COALESCE(p_notas, notas),
    contactado_at = CASE WHEN p_estado IN ('contactado', 'calificado', 'convertido') THEN NOW() ELSE contactado_at END,
    contactado_por = COALESCE(p_contactado_por, contactado_por)
  WHERE id = p_lead_id
  RETURNING jsonb_build_object(
    'id', id,
    'estado', estado,
    'contactado_at', contactado_at
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Vista para dashboard de leads
CREATE OR REPLACE VIEW v_leads_dashboard AS
SELECT
  l.id,
  l.nombre,
  l.whatsapp,
  l.estado,
  l.created_at,
  l.contactado_at,
  EXTRACT(EPOCH FROM (COALESCE(l.contactado_at, NOW()) - l.created_at)) / 3600 as horas_sin_contactar,
  l.propiedad_interes,
  pm.nombre_oficial as proyecto_interes,
  jsonb_array_length(COALESCE(l.alertas, '[]'::jsonb)) as cantidad_alertas,
  l.tiempo_formulario_segundos / 60.0 as minutos_formulario
FROM leads_mvp l
LEFT JOIN propiedades_v2 p ON p.id = l.propiedad_interes
LEFT JOIN proyectos_master pm ON pm.id_proyecto_master = p.id_proyecto_master
ORDER BY
  CASE l.estado
    WHEN 'nuevo' THEN 1
    WHEN 'contactado' THEN 2
    WHEN 'calificado' THEN 3
    ELSE 4
  END,
  l.created_at DESC;

-- Verificación
SELECT 'Tabla leads_mvp creada' as status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads_mvp');
