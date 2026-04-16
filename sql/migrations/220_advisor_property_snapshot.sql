-- Migración 220: Advisor Property Snapshot
-- Tabla + función + cron para pre-computar propiedades con posiciones de mercado,
-- rankings por $/m2 y datos de yield. Corre diario a 9:15 AM (post-auditoría).
-- Advisor lee de acá en vez de computar on-the-fly (0.5s vs 5s).
-- También sirve como serie histórica para tracking de precios, absorción y plusvalía.
-- Dependencias: buscar_unidades_reales(jsonb), v_mercado_venta, v_mercado_alquiler.
-- No modifica ni rompe nada existente.

-- ── 1. Tabla de snapshots ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS advisor_property_snapshot (
  -- Snapshot metadata
  snapshot_date       DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Property base (from buscar_unidades_reales)
  property_id         INTEGER NOT NULL,
  nombre_proyecto     TEXT,
  desarrollador       TEXT,
  zona                TEXT,
  microzona           TEXT,
  dormitorios         INTEGER,
  banos               NUMERIC,
  precio_usd          NUMERIC,       -- ya normalizado (precio_normalizado())
  precio_m2           NUMERIC,
  area_m2             NUMERIC,
  estado_construccion TEXT,
  es_precio_outlier   BOOLEAN DEFAULT FALSE,
  dias_en_mercado     INTEGER DEFAULT 0,
  tipo_cambio_detectado TEXT,
  fecha_entrega       TEXT,
  estacionamientos    INTEGER,
  baulera             BOOLEAN,
  fotos_urls          TEXT[],
  fotos_count         INTEGER DEFAULT 0,
  url                 TEXT,
  agente_nombre       TEXT,
  agente_telefono     TEXT,
  agente_oficina      TEXT,
  amenities_confirmados TEXT[],
  amenities_por_verificar TEXT[],
  equipamiento_detectado TEXT[],
  descripcion         TEXT,
  latitud             NUMERIC,
  longitud            NUMERIC,

  -- Building rankings (pre-computed by $/m2, NOT by total price)
  unidades_en_edificio     INTEGER DEFAULT 0,
  posicion_precio_edificio INTEGER DEFAULT 0,
  precio_min_edificio      NUMERIC DEFAULT 0,
  precio_max_edificio      NUMERIC DEFAULT 0,

  -- Typology rankings (same dorms in building, by $/m2)
  unidades_misma_tipologia INTEGER DEFAULT 0,
  posicion_en_tipologia    INTEGER DEFAULT 0,
  precio_min_tipologia     NUMERIC DEFAULT 0,
  precio_max_tipologia     NUMERIC DEFAULT 0,

  -- Market position (segment-aware: preventa vs entrega_inmediata)
  posicion_diferencia_pct     NUMERIC,   -- % vs segment median
  posicion_categoria          TEXT,      -- oportunidad/bajo_promedio/promedio/sobre_promedio/premium
  posicion_precio_m2_ref      NUMERIC,   -- segment median $/m2 used as reference

  -- Yield data (from v_mercado_alquiler)
  yield_alquiler_mediana_bob  NUMERIC,   -- median rent in BOB for zona+dorms
  yield_sample                INTEGER DEFAULT 0,   -- number of rental comps
  yield_zona_fallback         BOOLEAN DEFAULT FALSE, -- true = used zone-wide data

  PRIMARY KEY (snapshot_date, property_id)
);

-- Index for Advisor reads (always reads latest date)
CREATE INDEX IF NOT EXISTS idx_advisor_snapshot_date
  ON advisor_property_snapshot (snapshot_date DESC);

-- Index for historical analysis by property
CREATE INDEX IF NOT EXISTS idx_advisor_snapshot_property
  ON advisor_property_snapshot (property_id, snapshot_date DESC);

-- Index for zone/typology analysis
CREATE INDEX IF NOT EXISTS idx_advisor_snapshot_zona_dorms
  ON advisor_property_snapshot (zona, dormitorios, snapshot_date DESC);


-- ── 2. Función generadora ─────────────────────────────────────────────────────
-- Idempotente: si ya existe snapshot del día, lo reemplaza (DELETE + INSERT).
-- Usa buscar_unidades_reales() como fuente, recalcula rankings por $/m2,
-- medianas de segmento desde v_mercado_venta, y yield desde v_mercado_alquiler.

CREATE OR REPLACE FUNCTION generate_advisor_snapshot()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  row_count INTEGER;
BEGIN
  -- Delete today's snapshot if exists (idempotent)
  DELETE FROM advisor_property_snapshot WHERE snapshot_date = today;

  -- Insert pre-computed properties
  WITH
  -- 1. Get ALL active sale properties (sin filtro de fotos para serie histórica)
  props AS (
    SELECT * FROM buscar_unidades_reales(
      '{"tipo_operacion":"venta","solo_con_fotos":false,"limite":1000}'::jsonb
    )
    WHERE zona IS NOT NULL AND zona != 'Sin zona'
  ),

  -- 2. Segment medians (preventa vs entrega_inmediata) for market position
  --    Usa valores reales del enum estado_construccion_enum
  segment_medians AS (
    SELECT
      v.zona,
      v.dormitorios,
      CASE
        WHEN v.estado_construccion::TEXT IN ('preventa', 'construccion', 'planos')
        THEN 'preventa'
        ELSE 'entrega_inmediata'
      END AS segmento,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_m2) AS mediana_m2,
      COUNT(*) AS cnt
    FROM v_mercado_venta v
    WHERE v.zona IS NOT NULL AND v.zona != 'Sin zona' AND v.precio_m2 > 0
    GROUP BY v.zona, v.dormitorios,
      CASE
        WHEN v.estado_construccion::TEXT IN ('preventa', 'construccion', 'planos')
        THEN 'preventa'
        ELSE 'entrega_inmediata'
      END
  ),

  -- 3. Zone-wide medians (fallback when segment has <3)
  zone_medians AS (
    SELECT
      v.zona,
      v.dormitorios,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_m2) AS mediana_m2
    FROM v_mercado_venta v
    WHERE v.zona IS NOT NULL AND v.zona != 'Sin zona' AND v.precio_m2 > 0
    GROUP BY v.zona, v.dormitorios
  ),

  -- 4. Rental medians by zona+dorms
  rental_by_zona_dorms AS (
    SELECT
      zona,
      dormitorios,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_bob) AS mediana_bob,
      COUNT(*) AS sample
    FROM v_mercado_alquiler
    WHERE zona IS NOT NULL AND precio_mensual_bob > 0
    GROUP BY zona, dormitorios
  ),

  -- 5. Rental medians by zona only (fallback)
  rental_by_zona AS (
    SELECT
      zona,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_bob) AS mediana_bob,
      COUNT(*) AS sample
    FROM v_mercado_alquiler
    WHERE zona IS NOT NULL AND precio_mensual_bob > 0
    GROUP BY zona
  ),

  -- 6. Building rankings by $/m2 (NOT total price — key difference vs RPC)
  edificio_rank AS (
    SELECT
      p.id,
      COUNT(*) OVER (PARTITION BY p.nombre_proyecto) AS unidades_edificio,
      ROW_NUMBER() OVER (PARTITION BY p.nombre_proyecto ORDER BY p.precio_m2 ASC) AS pos_edificio,
      MIN(p.precio_usd) OVER (PARTITION BY p.nombre_proyecto) AS min_edificio,
      MAX(p.precio_usd) OVER (PARTITION BY p.nombre_proyecto) AS max_edificio
    FROM props p
    WHERE p.nombre_proyecto IS NOT NULL AND p.precio_m2 > 0
  ),

  -- 7. Typology rankings (same dorms in building, by $/m2)
  tipologia_rank AS (
    SELECT
      p.id,
      COUNT(*) OVER (PARTITION BY p.nombre_proyecto, p.dormitorios) AS unidades_tipo,
      ROW_NUMBER() OVER (PARTITION BY p.nombre_proyecto, p.dormitorios ORDER BY p.precio_m2 ASC) AS pos_tipo,
      MIN(p.precio_usd) OVER (PARTITION BY p.nombre_proyecto, p.dormitorios) AS min_tipo,
      MAX(p.precio_usd) OVER (PARTITION BY p.nombre_proyecto, p.dormitorios) AS max_tipo
    FROM props p
    WHERE p.nombre_proyecto IS NOT NULL AND p.precio_m2 > 0
  )

  INSERT INTO advisor_property_snapshot
  SELECT
    today AS snapshot_date,

    -- Base property
    p.id,
    p.nombre_proyecto,
    p.desarrollador,
    p.zona,
    p.microzona,
    p.dormitorios,
    p.banos,
    p.precio_usd,
    p.precio_m2,
    p.area_m2,
    p.estado_construccion,
    p.es_precio_outlier,
    p.dias_en_mercado,
    p.tipo_cambio_detectado,
    p.fecha_entrega,
    p.estacionamientos,
    p.baulera,
    p.fotos_urls,
    p.fotos_count,
    p.url,
    p.agente_nombre,
    p.agente_telefono,
    p.agente_oficina,
    p.amenities_confirmados,
    p.amenities_por_verificar,
    p.equipamiento_detectado,
    p.descripcion,
    p.latitud,
    p.longitud,

    -- Building rankings (by $/m2)
    COALESCE(er.unidades_edificio, 0),
    COALESCE(er.pos_edificio, 0),
    COALESCE(er.min_edificio, 0),
    COALESCE(er.max_edificio, 0),

    -- Typology rankings (by $/m2)
    COALESCE(tr.unidades_tipo, 0),
    COALESCE(tr.pos_tipo, 0),
    COALESCE(tr.min_tipo, 0),
    COALESCE(tr.max_tipo, 0),

    -- Market position (segment-aware with zone fallback)
    CASE
      WHEN COALESCE(sm.mediana_m2, zm.mediana_m2) IS NOT NULL
           AND COALESCE(sm.mediana_m2, zm.mediana_m2) > 0
      THEN ROUND((((p.precio_m2 - COALESCE(sm.mediana_m2, zm.mediana_m2))
                   / COALESCE(sm.mediana_m2, zm.mediana_m2)) * 100)::numeric, 1)
      ELSE NULL
    END,

    CASE
      WHEN COALESCE(sm.mediana_m2, zm.mediana_m2) IS NULL
           OR COALESCE(sm.mediana_m2, zm.mediana_m2) = 0 THEN NULL
      WHEN ((p.precio_m2 - COALESCE(sm.mediana_m2, zm.mediana_m2))
            / COALESCE(sm.mediana_m2, zm.mediana_m2)) * 100 <= -20 THEN 'oportunidad'
      WHEN ((p.precio_m2 - COALESCE(sm.mediana_m2, zm.mediana_m2))
            / COALESCE(sm.mediana_m2, zm.mediana_m2)) * 100 <= -10 THEN 'bajo_promedio'
      WHEN ((p.precio_m2 - COALESCE(sm.mediana_m2, zm.mediana_m2))
            / COALESCE(sm.mediana_m2, zm.mediana_m2)) * 100 <= 10 THEN 'promedio'
      WHEN ((p.precio_m2 - COALESCE(sm.mediana_m2, zm.mediana_m2))
            / COALESCE(sm.mediana_m2, zm.mediana_m2)) * 100 <= 20 THEN 'sobre_promedio'
      ELSE 'premium'
    END,

    COALESCE(sm.mediana_m2, zm.mediana_m2),

    -- Yield: prefer zona+dorms (>=3), fallback to zona-wide (>=3)
    CASE
      WHEN rzd.sample >= 3 THEN rzd.mediana_bob
      WHEN rz.sample >= 3 THEN rz.mediana_bob
      ELSE NULL
    END,

    CASE
      WHEN rzd.sample >= 3 THEN rzd.sample
      WHEN rz.sample >= 3 THEN rz.sample
      ELSE 0
    END,

    CASE
      WHEN rzd.sample >= 3 THEN FALSE
      WHEN rz.sample >= 3 THEN TRUE
      ELSE FALSE
    END

  FROM props p
  LEFT JOIN segment_medians sm
    ON sm.zona = p.zona
    AND sm.dormitorios = p.dormitorios
    AND sm.segmento = CASE
      WHEN p.estado_construccion IN ('preventa', 'construccion', 'planos')
      THEN 'preventa' ELSE 'entrega_inmediata'
    END
    AND sm.cnt >= 3
  LEFT JOIN zone_medians zm ON zm.zona = p.zona AND zm.dormitorios = p.dormitorios
  LEFT JOIN rental_by_zona_dorms rzd ON rzd.zona = p.zona AND rzd.dormitorios = p.dormitorios
  LEFT JOIN rental_by_zona rz ON rz.zona = p.zona
  LEFT JOIN edificio_rank er ON er.id = p.id
  LEFT JOIN tipologia_rank tr ON tr.id = p.id;

  GET DIAGNOSTICS row_count = ROW_COUNT;

  RAISE NOTICE 'Advisor snapshot generated: % properties for %', row_count, today;
  RETURN row_count;
END;
$$;


-- ── 3. Permisos ───────────────────────────────────────────────────────────────

GRANT SELECT ON advisor_property_snapshot TO anon, authenticated;
GRANT SELECT ON advisor_property_snapshot TO claude_readonly;
GRANT EXECUTE ON FUNCTION generate_advisor_snapshot() TO authenticated;


-- ── 4. Cron job: 9:15 AM diario (post-auditoría 9:00, post-recálculo TC 7:05)

SELECT cron.schedule(
  'advisor-snapshot-diario',
  '15 9 * * *',
  'SELECT generate_advisor_snapshot()'
);
