-- Migración 167: Helper precio_normalizado()
--
-- Normaliza precio_usd para propiedades con tipo_cambio_detectado = 'paralelo'.
-- Fórmula: precio_usd × tc_paralelo_actual / 6.96
-- Para oficial/NULL: devuelve precio_usd sin cambio.
--
-- Uso: precio_normalizado(p.precio_usd, p.tipo_cambio_detectado)
-- Reemplaza: COALESCE(p.precio_usd_actualizado, p.precio_usd)

CREATE OR REPLACE FUNCTION precio_normalizado(
  p_precio_usd NUMERIC,
  p_tipo_cambio_detectado TEXT
) RETURNS NUMERIC
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN p_tipo_cambio_detectado = 'paralelo' THEN
      ROUND(p_precio_usd * (SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo') / 6.96, 2)
    ELSE p_precio_usd
  END;
$$;
