-- Migración 237: Tabla y RPC de prospección de brokers
--
-- Sistema interno del founder para gestionar el outreach a brokers
-- captadores de Equipetrol. Listado en /admin/prospection con
-- 3 mensajes secuenciales, tracking de envíos y tier-ing por volumen.
--
-- Tiers (basados en propiedades activas de venta):
--   Tier 1: 1-5 propiedades  → ICP ideal (más volumen disponible)
--   Tier 2: 6-10 propiedades → segunda ola tras testimonios
--   Tier 3: 11+ propiedades  → top performers, última ola
--
-- Distribución actual al momento de la migración:
--   Tier 1: 169 brokers (95%)
--   Tier 2:   6 brokers
--   Tier 3:   2 brokers
--
-- "Publicación reciente" = ≤90 días en mercado. Filtro secundario para
-- ordenar dentro de cada tier (los más activos primero).

BEGIN;

-- ============================================================
-- TABLA: broker_prospection
-- ============================================================
CREATE TABLE IF NOT EXISTS broker_prospection (
  telefono              TEXT PRIMARY KEY,
  nombre                TEXT NOT NULL,
  agencia               TEXT,
  tier                  SMALLINT NOT NULL CHECK (tier IN (1, 2, 3)),
  props_activas         INTEGER NOT NULL,
  props_recientes_90d   INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'msg1_sent', 'msg2_sent', 'msg3_sent')),
  fecha_msg1            TIMESTAMPTZ,
  fecha_msg2            TIMESTAMPTZ,
  fecha_msg3            TIMESTAMPTZ,
  notas                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS deny-all — solo service_role accede via API admin
ALTER TABLE broker_prospection ENABLE ROW LEVEL SECURITY;

-- Índices para los filtros del panel
CREATE INDEX IF NOT EXISTS idx_broker_prospection_tier_status
  ON broker_prospection (tier, status);
CREATE INDEX IF NOT EXISTS idx_broker_prospection_props_activas
  ON broker_prospection (props_activas DESC);
CREATE INDEX IF NOT EXISTS idx_broker_prospection_recientes
  ON broker_prospection (props_recientes_90d DESC);

-- Trigger para mantener updated_at fresco en updates manuales
CREATE OR REPLACE FUNCTION trg_broker_prospection_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS broker_prospection_touch_updated_at ON broker_prospection;
CREATE TRIGGER broker_prospection_touch_updated_at
  BEFORE UPDATE ON broker_prospection
  FOR EACH ROW
  EXECUTE FUNCTION trg_broker_prospection_touch_updated_at();

-- ============================================================
-- RPC: populate_broker_prospection
-- ============================================================
-- Refresca la tabla desde v_mercado_venta + buscar_unidades_simple,
-- agrupando por agente_telefono normalizado. Hace UPSERT preservando
-- status / fecha_msg1/2/3 / notas existentes (solo actualiza datos
-- derivados: nombre, agencia, tier, conteos).
--
-- El user llama a esta RPC desde el botón "Refrescar lista" del panel.
-- Idempotente: correr 2 veces seguidas no hace daño.
CREATE OR REPLACE FUNCTION populate_broker_prospection()
RETURNS TABLE(inserted INT, updated INT, total INT) AS $$
DECLARE
  v_before INT;
  v_after  INT;
  v_total  INT;
BEGIN
  SELECT COUNT(*) INTO v_before FROM broker_prospection;

  INSERT INTO broker_prospection (
    telefono, nombre, agencia, tier, props_activas, props_recientes_90d
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
    props_recientes_90d
  FROM (
    SELECT
      REGEXP_REPLACE(agente_telefono, '\D', '', 'g') AS telefono_norm,
      MAX(agente_nombre) AS nombre,
      MAX(fuente)        AS agencia,
      COUNT(*)           AS props_activas,
      COUNT(*) FILTER (WHERE dias_en_mercado <= 90) AS props_recientes_90d
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
  WHERE LENGTH(telefono_norm) >= 8  -- descarta números corruptos
  ON CONFLICT (telefono) DO UPDATE SET
    nombre              = EXCLUDED.nombre,
    agencia             = EXCLUDED.agencia,
    tier                = EXCLUDED.tier,
    props_activas       = EXCLUDED.props_activas,
    props_recientes_90d = EXCLUDED.props_recientes_90d,
    updated_at          = NOW();
    -- intencional: NO toca status, fecha_msg1/2/3, notas

  GET DIAGNOSTICS v_total = ROW_COUNT;

  SELECT COUNT(*) INTO v_after FROM broker_prospection;

  inserted := v_after - v_before;
  updated  := v_total - inserted;
  total    := v_total;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permite que la API admin (service_role) ejecute la RPC
GRANT EXECUTE ON FUNCTION populate_broker_prospection() TO service_role;

COMMIT;

-- ============================================================
-- Verificación post-migración:
-- ============================================================
-- 1. Refrescar la tabla con datos iniciales:
--      SELECT * FROM populate_broker_prospection();
--    Esperado: inserted ≈ 177, updated = 0, total = 177
--
-- 2. Verificar distribución por tier:
--      SELECT tier, COUNT(*) AS brokers, SUM(props_activas) AS props_total
--      FROM broker_prospection
--      GROUP BY tier ORDER BY tier;
--    Esperado: T1=169, T2=6, T3=2 (al momento de la migración)
--
-- 3. Top brokers por volumen:
--      SELECT nombre, agencia, tier, props_activas, props_recientes_90d
--      FROM broker_prospection
--      ORDER BY tier, props_recientes_90d DESC
--      LIMIT 20;
