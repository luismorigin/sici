-- Migración 207: Agregar filtro 150 días a v_mercado_alquiler
-- Problema: la vista no filtra por antigüedad, permitiendo listings de 150+ días
-- que contaminan promedios y estadísticas de mercado.
-- El RPC buscar_unidades_alquiler() ya filtra a 150d — esto alinea la vista.
-- Consistente con v_mercado_venta que filtra a 300d.

CREATE OR REPLACE VIEW v_mercado_alquiler AS
SELECT
  id, url, fuente, codigo_propiedad, tipo_operacion,
  tipo_propiedad_original, estado_construccion,
  precio_usd, precio_usd_original, moneda_original,
  tipo_cambio_usado, tipo_cambio_detectado,
  requiere_actualizacion_precio, es_multiproyecto,
  dormitorios_opciones, precio_min_usd, precio_max_usd,
  area_min_m2, area_max_m2,
  latitud, longitud, area_total_m2,
  dormitorios, banos, estacionamientos,
  id_proyecto_master, id_proyecto_master_sugerido,
  confianza_sugerencia_extractor, metodo_match,
  status, es_activa, es_para_matching,
  razon_inactiva, fecha_inactivacion,
  score_calidad_dato, score_fiduciario,
  datos_json_discovery, datos_json_enrichment, datos_json,
  campos_bloqueados, discrepancias_detectadas, campos_conflicto,
  scraper_version,
  fecha_creacion, fecha_actualizacion, fecha_discovery,
  fecha_enrichment, fecha_merge, fecha_publicacion, fecha_scraping,
  metodo_discovery,
  tipo_cambio_paralelo_usado, precio_usd_actualizado,
  fecha_ultima_actualizacion_precio, depende_de_tc,
  cambios_enrichment, cambios_merge,
  primera_ausencia_at, flags_semanticos,
  nombre_edificio, zona, microzona,
  duplicado_de, baulera, piso,
  plan_pagos_desarrollador, acepta_permuta, solo_tc_paralelo,
  precio_negociable, descuento_contado_pct,
  parqueo_incluido, parqueo_precio_adicional,
  baulera_incluido, baulera_precio_adicional,
  plan_pagos_cuotas, plan_pagos_texto,
  precio_mensual_bob, precio_mensual_usd,
  deposito_meses, amoblado, acepta_mascotas,
  servicios_incluidos, contrato_minimo_meses, monto_expensas_bob,
  ROUND(precio_mensual_bob / 6.96, 2)::numeric(10,2) AS precio_mensual,
  CURRENT_DATE - COALESCE(fecha_publicacion::timestamp without time zone, fecha_creacion)::date AS dias_en_mercado
FROM propiedades_v2 p
WHERE tipo_operacion = 'alquiler'::tipo_operacion_enum
  AND status = ANY (ARRAY['completado'::estado_propiedad, 'actualizado'::estado_propiedad])
  AND duplicado_de IS NULL
  AND area_total_m2 >= 20::numeric
  AND precio_mensual_usd > 0::numeric
  AND CURRENT_DATE - COALESCE(fecha_publicacion::timestamp without time zone, fecha_creacion)::date <= 150;

COMMENT ON VIEW v_mercado_alquiler IS
  'Vista canónica alquiler. Filtros: status completado/actualizado, sin duplicados, area>=20, precio>0, <=150 días. '
  'precio_mensual = ROUND(precio_mensual_bob / 6.96, 2) — derivado de BOB (fuente de verdad). '
  'Usar precio_mensual_bob para display en Bs, precio_mensual para cálculos en USD.';

-- Verificación: no debe haber listings >150 días
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE dias_en_mercado > 150) AS mayores_150d
FROM v_mercado_alquiler;
