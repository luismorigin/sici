-- =====================================================
-- MIGRACIÓN 075: Sistema de verificación y pre-registro de brokers
-- Fecha: 2026-01-24
-- Descripción:
--   - Agrega campos para verificación manual
--   - Agrega campos para pre-registro desde scraping
--   - Carga 164 agentes scrapeados como pre-registrados
--   - Función para match automático por teléfono
-- =====================================================

-- 1. Agregar campos de verificación y tipo de cuenta
ALTER TABLE brokers
ADD COLUMN IF NOT EXISTS estado_verificacion TEXT DEFAULT 'pendiente'
  CHECK (estado_verificacion IN ('pendiente', 'verificado', 'rechazado', 'pre_registrado')),
ADD COLUMN IF NOT EXISTS tipo_cuenta TEXT DEFAULT 'broker'
  CHECK (tipo_cuenta IN ('broker', 'desarrolladora')),
ADD COLUMN IF NOT EXISTS inmobiliaria TEXT,
ADD COLUMN IF NOT EXISTS fuente_registro TEXT DEFAULT 'manual'
  CHECK (fuente_registro IN ('manual', 'scraping', 'invitacion')),
ADD COLUMN IF NOT EXISTS telefono_normalizado TEXT,
ADD COLUMN IF NOT EXISTS fecha_verificacion TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verificado_por TEXT,
ADD COLUMN IF NOT EXISTS notas_verificacion TEXT;

-- 2. Índice para búsqueda por teléfono normalizado
CREATE INDEX IF NOT EXISTS idx_brokers_telefono_norm ON brokers(telefono_normalizado);

-- 3. Función para normalizar teléfono (quitar +591, espacios, guiones)
CREATE OR REPLACE FUNCTION normalizar_telefono(tel TEXT)
RETURNS TEXT AS $$
BEGIN
  IF tel IS NULL THEN RETURN NULL; END IF;
  -- Quitar +591, +, espacios, guiones, paréntesis
  RETURN regexp_replace(
    regexp_replace(tel, '^\+591', ''),
    '[^0-9]', '', 'g'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Trigger para auto-normalizar teléfono al insertar/actualizar
CREATE OR REPLACE FUNCTION trigger_normalizar_telefono()
RETURNS TRIGGER AS $$
BEGIN
  NEW.telefono_normalizado := normalizar_telefono(NEW.telefono);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brokers_normalizar_tel ON brokers;
CREATE TRIGGER trg_brokers_normalizar_tel
  BEFORE INSERT OR UPDATE OF telefono ON brokers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_normalizar_telefono();

-- 5. Actualizar teléfonos existentes
UPDATE brokers SET telefono_normalizado = normalizar_telefono(telefono);

-- 6. Quitar constraint de formato de teléfono que no permite +591
ALTER TABLE brokers DROP CONSTRAINT IF EXISTS brokers_telefono_format;

-- 7. Función para buscar broker pre-registrado por teléfono
CREATE OR REPLACE FUNCTION buscar_broker_por_telefono(tel_input TEXT)
RETURNS TABLE (
  id UUID,
  nombre TEXT,
  telefono TEXT,
  inmobiliaria TEXT,
  estado_verificacion TEXT,
  propiedades_count BIGINT
) AS $$
DECLARE
  tel_norm TEXT;
BEGIN
  tel_norm := normalizar_telefono(tel_input);

  RETURN QUERY
  SELECT
    b.id,
    b.nombre,
    b.telefono,
    b.inmobiliaria,
    b.estado_verificacion,
    (SELECT COUNT(*) FROM propiedades_v2 p
     WHERE normalizar_telefono(p.datos_json->'agente'->>'telefono') = tel_norm
    ) as propiedades_count
  FROM brokers b
  WHERE b.telefono_normalizado = tel_norm;
END;
$$ LANGUAGE plpgsql;

-- 8. Función para vincular propiedades a broker por teléfono
CREATE OR REPLACE FUNCTION vincular_propiedades_broker(broker_id_input UUID)
RETURNS INTEGER AS $$
DECLARE
  tel_norm TEXT;
  count_vinculadas INTEGER := 0;
BEGIN
  -- Obtener teléfono normalizado del broker
  SELECT telefono_normalizado INTO tel_norm
  FROM brokers WHERE id = broker_id_input;

  IF tel_norm IS NULL THEN
    RETURN 0;
  END IF;

  -- Contar propiedades que coinciden
  SELECT COUNT(*) INTO count_vinculadas
  FROM propiedades_v2
  WHERE normalizar_telefono(datos_json->'agente'->>'telefono') = tel_norm;

  -- Actualizar contador en broker
  UPDATE brokers
  SET total_propiedades = count_vinculadas
  WHERE id = broker_id_input;

  RETURN count_vinculadas;
END;
$$ LANGUAGE plpgsql;

-- 9. Insertar brokers pre-registrados desde datos scrapeados
-- (Solo si no existen ya por teléfono)
INSERT INTO brokers (
  nombre,
  telefono,
  telefono_normalizado,
  inmobiliaria,
  empresa,
  email,
  estado_verificacion,
  fuente_registro,
  activo
)
SELECT DISTINCT ON (normalizar_telefono(datos_json->'agente'->>'telefono'))
  datos_json->'agente'->>'nombre' as nombre,
  datos_json->'agente'->>'telefono' as telefono,
  normalizar_telefono(datos_json->'agente'->>'telefono') as telefono_normalizado,
  datos_json->'agente'->>'oficina_nombre' as inmobiliaria,
  CASE
    WHEN fuente = 'century21' THEN 'Century21'
    WHEN fuente = 'remax' THEN 'RE/MAX'
    ELSE fuente
  END as empresa,
  -- Email temporal único para cumplir constraint
  LOWER(REPLACE(REPLACE(datos_json->'agente'->>'nombre', ' ', '.'), '''', ''))
    || '.' || normalizar_telefono(datos_json->'agente'->>'telefono')
    || '@pendiente.simon.bo' as email,
  'pre_registrado' as estado_verificacion,
  'scraping' as fuente_registro,
  true as activo
FROM propiedades_v2
WHERE datos_json->'agente'->>'nombre' IS NOT NULL
  AND datos_json->'agente'->>'telefono' IS NOT NULL
  AND normalizar_telefono(datos_json->'agente'->>'telefono') NOT IN (
    SELECT telefono_normalizado FROM brokers WHERE telefono_normalizado IS NOT NULL
  )
ORDER BY normalizar_telefono(datos_json->'agente'->>'telefono'),
         (SELECT COUNT(*) FROM propiedades_v2 p2
          WHERE p2.datos_json->'agente'->>'telefono' = propiedades_v2.datos_json->'agente'->>'telefono') DESC;

-- 10. Actualizar contadores de propiedades para brokers pre-registrados
UPDATE brokers b
SET total_propiedades = (
  SELECT COUNT(*)
  FROM propiedades_v2 p
  WHERE normalizar_telefono(p.datos_json->'agente'->>'telefono') = b.telefono_normalizado
)
WHERE b.fuente_registro = 'scraping';

-- 11. Crear vista para panel de admin de verificación
CREATE OR REPLACE VIEW v_brokers_pendientes_verificacion AS
SELECT
  b.id,
  b.nombre,
  b.telefono,
  b.email,
  b.inmobiliaria,
  b.empresa,
  b.estado_verificacion,
  b.fuente_registro,
  b.fecha_registro,
  b.total_propiedades,
  CASE
    WHEN b.fuente_registro = 'scraping' THEN 'Pre-registrado (scraping)'
    ELSE 'Registro manual'
  END as origen
FROM brokers b
WHERE b.estado_verificacion IN ('pendiente', 'pre_registrado')
ORDER BY b.total_propiedades DESC, b.fecha_registro DESC;

-- 12. Función para verificar broker (para admin)
CREATE OR REPLACE FUNCTION verificar_broker(
  broker_id_input UUID,
  accion TEXT, -- 'aprobar' o 'rechazar'
  admin_nombre TEXT DEFAULT 'admin',
  notas TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  nuevo_estado TEXT;
BEGIN
  IF accion = 'aprobar' THEN
    nuevo_estado := 'verificado';
  ELSIF accion = 'rechazar' THEN
    nuevo_estado := 'rechazado';
  ELSE
    RETURN 'Acción no válida. Use: aprobar o rechazar';
  END IF;

  UPDATE brokers
  SET
    estado_verificacion = nuevo_estado,
    fecha_verificacion = NOW(),
    verificado_por = admin_nombre,
    notas_verificacion = notas
  WHERE id = broker_id_input;

  -- Si se aprueba, vincular propiedades
  IF accion = 'aprobar' THEN
    PERFORM vincular_propiedades_broker(broker_id_input);
  END IF;

  RETURN 'Broker ' || accion || ' exitosamente';
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON COLUMN brokers.estado_verificacion IS 'pendiente=espera verificación, verificado=aprobado, rechazado=no aprobado, pre_registrado=cargado desde scraping';
COMMENT ON COLUMN brokers.fuente_registro IS 'manual=se registró solo, scraping=pre-cargado de C21/Remax, invitacion=invitado por otro broker';
COMMENT ON FUNCTION buscar_broker_por_telefono IS 'Busca broker por teléfono normalizado, retorna info y cantidad de propiedades';
COMMENT ON FUNCTION verificar_broker IS 'Función para admin: aprobar o rechazar un broker pendiente';
