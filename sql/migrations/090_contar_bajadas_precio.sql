-- ============================================
-- Migración 090: Función contar_bajadas_precio
-- Fecha: 2026-01-29
-- Propósito: Contar propiedades con bajada de precio entre dos fechas
--            para mostrar en Market Lens "Equipetrol Hoy"
-- ============================================

-- Función RPC para contar bajadas de precio
CREATE OR REPLACE FUNCTION contar_bajadas_precio(
  p_fecha_hoy DATE,
  p_fecha_ayer DATE
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM precios_historial h1
  JOIN precios_historial h2
    ON h1.propiedad_id = h2.propiedad_id
  WHERE h1.fecha = p_fecha_hoy
    AND h2.fecha = p_fecha_ayer
    AND h1.precio_usd < h2.precio_usd
    -- Excluir cambios >50% que suelen ser datos corruptos o conversiones TC
    AND (h2.precio_usd - h1.precio_usd) / h2.precio_usd < 0.5
    -- Solo bajadas significativas (>$100)
    AND (h2.precio_usd - h1.precio_usd) > 100
$$;

-- Dar permisos al rol anon para que el frontend pueda llamarla
GRANT EXECUTE ON FUNCTION contar_bajadas_precio(DATE, DATE) TO anon;

-- Verificación rápida
-- SELECT contar_bajadas_precio('2026-01-29', '2026-01-27');
-- Debería retornar 2 (propiedades 222 y 121)

-- ============================================
-- FIN MIGRACIÓN 090
-- ============================================
