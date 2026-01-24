-- ============================================================================
-- Migración 070: Sistema de Contacto Lead-Broker
-- Fecha: 22 Enero 2026
-- Propósito: Habilitar contacto desde Informe Premium (cualquiera de las 3 props)
-- ============================================================================

-- 1. Nuevas columnas en leads_mvp
ALTER TABLE leads_mvp
  ADD COLUMN IF NOT EXISTS codigo_ref TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS contacto_broker_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS broker_nombre TEXT,
  ADD COLUMN IF NOT EXISTS broker_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS broker_inmobiliaria TEXT,
  ADD COLUMN IF NOT EXISTS propiedad_contactada INTEGER REFERENCES propiedades_v2(id),
  ADD COLUMN IF NOT EXISTS posicion_en_top3 INTEGER;

-- 2. Índice para búsqueda por código REF
CREATE INDEX IF NOT EXISTS idx_leads_mvp_codigo_ref
  ON leads_mvp(codigo_ref)
  WHERE codigo_ref IS NOT NULL;

-- 3. Función para generar código único
CREATE OR REPLACE FUNCTION generar_codigo_ref()
RETURNS TEXT AS $$
DECLARE
  v_codigo TEXT;
  v_exists BOOLEAN;
  v_intentos INTEGER := 0;
BEGIN
  LOOP
    -- Formato: SIM-XXXXX (5 caracteres alfanuméricos)
    v_codigo := 'SIM-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 5));

    -- Verificar unicidad
    SELECT EXISTS(SELECT 1 FROM leads_mvp WHERE codigo_ref = v_codigo) INTO v_exists;

    EXIT WHEN NOT v_exists;

    v_intentos := v_intentos + 1;
    IF v_intentos > 10 THEN
      RAISE EXCEPTION 'No se pudo generar código único después de 10 intentos';
    END IF;
  END LOOP;

  RETURN v_codigo;
END;
$$ LANGUAGE plpgsql;

-- 4. Función para registrar contacto con broker
CREATE OR REPLACE FUNCTION registrar_contacto_broker(
  p_lead_id INTEGER,
  p_propiedad_id INTEGER,
  p_broker_nombre TEXT,
  p_broker_whatsapp TEXT,
  p_broker_inmobiliaria TEXT DEFAULT NULL,
  p_posicion_top3 INTEGER DEFAULT 1
)
RETURNS TABLE (
  codigo_ref TEXT,
  lead_nombre TEXT,
  lead_whatsapp TEXT,
  lead_email TEXT
) AS $$
DECLARE
  v_codigo TEXT;
BEGIN
  -- Generar código único
  v_codigo := generar_codigo_ref();

  -- Actualizar lead
  UPDATE leads_mvp SET
    codigo_ref = v_codigo,
    contacto_broker_at = NOW(),
    broker_nombre = p_broker_nombre,
    broker_whatsapp = p_broker_whatsapp,
    broker_inmobiliaria = p_broker_inmobiliaria,
    propiedad_contactada = p_propiedad_id,
    posicion_en_top3 = p_posicion_top3,
    estado = CASE WHEN estado = 'confirmado' THEN 'interesado' ELSE estado END,
    updated_at = NOW()
  WHERE id = p_lead_id;

  -- Retornar datos para construir mensaje
  RETURN QUERY
  SELECT
    v_codigo,
    l.nombre,
    l.whatsapp,
    l.email
  FROM leads_mvp l
  WHERE l.id = p_lead_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Comentarios
COMMENT ON COLUMN leads_mvp.codigo_ref IS 'Código único de referencia #SIM-XXXXX para tracking';
COMMENT ON COLUMN leads_mvp.contacto_broker_at IS 'Timestamp cuando el lead clickeó contactar broker';
COMMENT ON COLUMN leads_mvp.broker_nombre IS 'Nombre del broker que se intentó contactar';
COMMENT ON COLUMN leads_mvp.broker_whatsapp IS 'WhatsApp del broker';
COMMENT ON COLUMN leads_mvp.broker_inmobiliaria IS 'Inmobiliaria del broker';
COMMENT ON COLUMN leads_mvp.propiedad_contactada IS 'FK a la propiedad por la cual contactó';
COMMENT ON COLUMN leads_mvp.posicion_en_top3 IS '1=Favorita, 2=Segunda opción, 3=Tercera opción';
COMMENT ON FUNCTION generar_codigo_ref IS 'Genera código único SIM-XXXXX para referencia de leads';
COMMENT ON FUNCTION registrar_contacto_broker IS 'Registra intento de contacto y genera código REF';

-- ============================================================================
-- Ejemplos de uso:
-- ============================================================================
/*
-- Registrar contacto desde informe premium
SELECT * FROM registrar_contacto_broker(
  123,                    -- lead_id
  456,                    -- propiedad_id
  'María González',       -- broker_nombre
  '+59176543210',         -- broker_whatsapp
  'Century 21',           -- broker_inmobiliaria
  2                       -- posicion_top3 (segunda opción)
);
-- Retorna: codigo_ref, lead_nombre, lead_whatsapp, lead_email

-- Generar código manualmente
SELECT generar_codigo_ref();
-- Retorna: 'SIM-A3F7K'
*/
