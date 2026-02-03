-- =====================================================
-- MIGRACIÓN 102: Sistema de Créditos CMA
-- Fecha: 1 Febrero 2026
-- Propósito: Otorgar créditos CMA por propiedades perfectas
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- LÓGICA: Por cada 5 propiedades con score_calidad = 100,
-- el broker recibe 1 crédito CMA gratis.
--
-- El trigger se activa cuando score_calidad cambia a 100.
-- =====================================================

-- Función para otorgar crédito CMA por calidad
CREATE OR REPLACE FUNCTION otorgar_credito_cma_por_calidad()
RETURNS TRIGGER AS $$
DECLARE
  v_count_perfectas INTEGER;
  v_creditos_actuales INTEGER;
BEGIN
  -- Solo si score cambió a 100 (y no era 100 antes)
  IF NEW.score_calidad = 100 AND (OLD.score_calidad IS NULL OR OLD.score_calidad < 100) THEN

    -- Contar propiedades perfectas del broker (incluyendo la nueva)
    SELECT COUNT(*) INTO v_count_perfectas
    FROM propiedades_broker
    WHERE broker_id = NEW.broker_id
      AND score_calidad = 100
      AND activo = true;

    -- Cada 5 perfectas = 1 crédito adicional
    IF v_count_perfectas > 0 AND v_count_perfectas % 5 = 0 THEN
      -- Obtener créditos actuales
      SELECT COALESCE(cma_creditos, 0) INTO v_creditos_actuales
      FROM brokers
      WHERE id = NEW.broker_id;

      -- Incrementar créditos
      UPDATE brokers
      SET cma_creditos = v_creditos_actuales + 1,
          updated_at = NOW()
      WHERE id = NEW.broker_id;

      -- Log para auditoría
      RAISE NOTICE 'Broker % recibió 1 crédito CMA (total propiedades perfectas: %)',
                   NEW.broker_id, v_count_perfectas;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION otorgar_credito_cma_por_calidad IS
'Trigger function: otorga 1 crédito CMA por cada 5 propiedades con score 100';

-- Crear trigger (drop si existe primero)
DROP TRIGGER IF EXISTS tr_credito_cma_calidad ON propiedades_broker;

CREATE TRIGGER tr_credito_cma_calidad
AFTER UPDATE OF score_calidad ON propiedades_broker
FOR EACH ROW
EXECUTE FUNCTION otorgar_credito_cma_por_calidad();

COMMENT ON TRIGGER tr_credito_cma_calidad ON propiedades_broker IS
'Otorga créditos CMA automáticamente por propiedades perfectas (score 100)';

-- =====================================================
-- Agregar columna pdf_url a broker_cma_uso si no existe
-- =====================================================

ALTER TABLE broker_cma_uso
ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT NULL;

COMMENT ON COLUMN broker_cma_uso.pdf_url IS 'URL del PDF CMA generado en Storage';

-- =====================================================
-- Función RPC para generar CMA (usada por API)
-- =====================================================

CREATE OR REPLACE FUNCTION consumir_credito_cma(
  p_broker_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_creditos INTEGER;
BEGIN
  -- Obtener créditos actuales
  SELECT COALESCE(cma_creditos, 0) INTO v_creditos
  FROM brokers
  WHERE id = p_broker_id;

  IF v_creditos IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Broker no encontrado');
  END IF;

  IF v_creditos <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sin créditos disponibles', 'creditos', 0);
  END IF;

  -- Decrementar crédito
  UPDATE brokers
  SET cma_creditos = cma_creditos - 1,
      updated_at = NOW()
  WHERE id = p_broker_id;

  RETURN jsonb_build_object(
    'success', true,
    'creditos_restantes', v_creditos - 1
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION consumir_credito_cma IS
'Decrementa 1 crédito CMA del broker. Retorna error si no hay créditos.';

-- =====================================================
-- TESTS
-- =====================================================

-- Test 1: Verificar trigger existe
SELECT 'Test 1: Verificar trigger' as test;
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname = 'tr_credito_cma_calidad';

-- Test 2: Verificar función existe
SELECT 'Test 2: Verificar funciones' as test;
SELECT proname
FROM pg_proc
WHERE proname IN ('otorgar_credito_cma_por_calidad', 'consumir_credito_cma');

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

SELECT 'Migración 102 - Sistema Créditos CMA' as status;

SELECT 'Trigger tr_credito_cma_calidad' as componente,
  CASE WHEN EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'tr_credito_cma_calidad')
       THEN 'OK' ELSE 'FALTA' END as estado
UNION ALL
SELECT 'Función otorgar_credito_cma_por_calidad',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'otorgar_credito_cma_por_calidad')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Función consumir_credito_cma',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'consumir_credito_cma')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Columna pdf_url en broker_cma_uso',
  CASE WHEN EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'broker_cma_uso' AND column_name = 'pdf_url'
  ) THEN 'OK' ELSE 'FALTA' END;
