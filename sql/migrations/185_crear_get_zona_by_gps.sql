-- ============================================================
-- Migración 185: Crear función get_zona_by_gps(lat, lon)
-- Fecha: 2026-03-09
-- Propósito: Detectar zona desde coordenadas GPS usando PostGIS
-- Usado por: Editor de proyectos master (admin/proyectos/[id])
-- ============================================================

-- Función que recibe lat/lon y retorna el nombre del polígono
-- que contiene ese punto. Si el punto cae fuera de todos los
-- polígonos, retorna 0 rows.
CREATE OR REPLACE FUNCTION get_zona_by_gps(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION
)
RETURNS TABLE(zona TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT zg.nombre::TEXT AS zona
  FROM zonas_geograficas zg
  WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(p_lon, p_lat), 4326))
  LIMIT 1;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION get_zona_by_gps(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION get_zona_by_gps(DOUBLE PRECISION, DOUBLE PRECISION) TO anon;
GRANT EXECUTE ON FUNCTION get_zona_by_gps(DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;

-- Verificación
-- SELECT * FROM get_zona_by_gps(-17.78, -63.19);  -- Debe retornar una zona
-- SELECT * FROM get_zona_by_gps(-17.70, -63.10);  -- Debe retornar 0 rows (fuera de cobertura)
