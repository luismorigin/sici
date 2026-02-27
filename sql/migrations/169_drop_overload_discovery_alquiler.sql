-- ============================================================================
-- Migración 169: Dropear overload huérfano de registrar_discovery_alquiler()
-- ============================================================================
-- Existen 2 overloads en producción:
--
--   Overload 1 (mig 136, VARCHAR): p_estacionamientos INTEGER, retorna (id, accion, mensaje)
--     → USADO por los 3 workflows n8n (C21, Remax, Bien Inmuebles)
--
--   Overload 2 (origen desconocido, TEXT): p_estacionamientos TEXT, retorna (id, status, message)
--     → NO usado por nadie. Orden de params diferente. Columnas retorno en inglés.
--
-- Esta migración elimina el Overload 2 huérfano.
-- ============================================================================

DROP FUNCTION IF EXISTS registrar_discovery_alquiler(
  p_url text,
  p_fuente text,
  p_codigo_propiedad text,
  p_tipo_propiedad_original text,
  p_precio_mensual_bob numeric,
  p_precio_mensual_usd numeric,
  p_moneda_original text,
  p_area_total_m2 numeric,
  p_dormitorios integer,
  p_banos numeric,
  p_estacionamientos text,
  p_latitud numeric,
  p_longitud numeric,
  p_zona text,
  p_datos_json_discovery jsonb,
  p_metodo_discovery text,
  p_fecha_publicacion date
);
