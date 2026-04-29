-- Migración 238: Agregar antigüedad de publicaciones a broker_prospection
--
-- Contexto: en /admin/prospection necesitamos saber qué tan recientes son
-- las publicaciones de cada broker para priorizar el outreach. Brokers
-- con publicaciones muy nuevas están activos hoy y son leads más calientes;
-- brokers con publicaciones viejas pueden estar estancados.
--
-- Agrega 2 columnas:
--   dias_pub_min: días en mercado de la propiedad MÁS RECIENTE del broker
--   dias_pub_max: días en mercado de la propiedad MÁS ANTIGUA del broker
--
-- El nuevo orden del panel es:
--   tier ASC, props_activas ASC, dias_pub_min ASC
-- (T1 primero → menor inventario → publicación más reciente arriba)

BEGIN;

ALTER TABLE broker_prospection
  ADD COLUMN IF NOT EXISTS dias_pub_min INTEGER,
  ADD COLUMN IF NOT EXISTS dias_pub_max INTEGER;

CREATE INDEX IF NOT EXISTS idx_broker_prospection_dias_min
  ON broker_prospection (dias_pub_min ASC NULLS LAST);

-- Reemplazar la RPC con la versión que también calcula min/max días
CREATE OR REPLACE FUNCTION populate_broker_prospection()
RETURNS TABLE(inserted INT, updated INT, total INT) AS $$
DECLARE
  v_before INT;
  v_after  INT;
  v_total  INT;
BEGIN
  SELECT COUNT(*) INTO v_before FROM broker_prospection;

  INSERT INTO broker_prospection (
    telefono, nombre, agencia, tier, props_activas, props_recientes_90d,
    dias_pub_min, dias_pub_max
  )
  SELECT
    telefono_norm,
    nombre,
    agencia,
    CASE
      WHEN props_activas BETWEEN 1 AND 5  THEN 1
      WHEN props_activas BETWEEN 6 AND 10 THEN 2
      ELSE 3
    END AS tier,
    props_activas,
    props_recientes_90d,
    dias_pub_min,
    dias_pub_max
  FROM (
    SELECT
      REGEXP_REPLACE(agente_telefono, '\D', '', 'g') AS telefono_norm,
      MAX(agente_nombre) AS nombre,
      MAX(fuente)        AS agencia,
      COUNT(*)           AS props_activas,
      COUNT(*) FILTER (WHERE dias_en_mercado <= 90) AS props_recientes_90d,
      MIN(dias_en_mercado)::INT AS dias_pub_min,
      MAX(dias_en_mercado)::INT AS dias_pub_max
    FROM (
      SELECT *
      FROM buscar_unidades_simple('{"limite":5000,"solo_con_fotos":false}'::jsonb)
    ) p
    WHERE agente_telefono IS NOT NULL
      AND zona IN (
        'Equipetrol Centro',
        'Equipetrol Norte',
        'Sirari',
        'Villa Brigida',
        'Equipetrol Oeste',
        'Eq. 3er Anillo'
      )
    GROUP BY 1
  ) brokers
  WHERE LENGTH(telefono_norm) >= 8
  ON CONFLICT (telefono) DO UPDATE SET
    nombre              = EXCLUDED.nombre,
    agencia             = EXCLUDED.agencia,
    tier                = EXCLUDED.tier,
    props_activas       = EXCLUDED.props_activas,
    props_recientes_90d = EXCLUDED.props_recientes_90d,
    dias_pub_min        = EXCLUDED.dias_pub_min,
    dias_pub_max        = EXCLUDED.dias_pub_max,
    updated_at          = NOW();

  GET DIAGNOSTICS v_total = ROW_COUNT;
  SELECT COUNT(*) INTO v_after FROM broker_prospection;

  inserted := v_after - v_before;
  updated  := v_total - inserted;
  total    := v_total;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION populate_broker_prospection() TO service_role;

COMMIT;

-- Verificación post-migración:
--
-- 1. Refrescar para popular las nuevas columnas:
--      SELECT * FROM populate_broker_prospection();
--    Esperado: inserted=0, updated=177 (los 177 ya existentes ahora tienen
--    dias_pub_min/max calculados).
--
-- 2. Top 10 brokers más activos (publicación más reciente):
--      SELECT nombre, agencia, tier, props_activas, dias_pub_min, dias_pub_max
--      FROM broker_prospection
--      ORDER BY tier, props_activas, dias_pub_min
--      LIMIT 10;
