-- ============================================================================
-- Migración 266 — Fixes del audit semanal /zona-norte/ventas (23-jun-2026)
-- ============================================================================
-- Origen: primera corrida de /audit-feed-ventas-semanal --macrozona=zona-norte
-- sobre el feed completo (402 deptos). Costo $0, sin Firecrawl.
--
-- Cubre 9 fixes verificados leyendo la descripción del anuncio:
--   A) Doble normalización TC paralelo (precio_usd = oficial en vez de billete)  [check 2.1]
--   B) Área mal extraída (parse de magnitud)                                     [check 4.1]
--   C) Flag TC paralelo sobre precio en Bs (debe ser no_especificado)            [check 2.9b "bs_real"]
--   D) Matching errado en cluster STONE (numerado → candar)                      [check 3.1c]
--
-- EXCLUIDOS (revisar anuncio en vivo, no auto-corregibles):
--   #2013 Condominio ONE — la desc solo da $/m², sin área ni total
--   #2262 Palma de Mallorca — la desc no trae m²; área 127.800 sin referencia
--
-- Todas las correcciones se CANDAN (formato objeto) para que el merge nocturno
-- del pipeline ZN no las repise. El MCP es readonly: aplicar en Supabase UI/psql.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A) Doble normalización TC paralelo: precio_usd debe ser el BILLETE, no el oficial.
--    Síntoma: tc=paralelo + precio_usd = BOB/6.96 (oficial) → precio_normalizado()
--    re-multiplica ×~1.42 e infla el feed. Fix: precio_usd = billete del anuncio.
-- ----------------------------------------------------------------------------

-- #2805 Ziri Zwei — desc: "Precio: 128.800 (T/C Paralelo)". precio_usd 185.057 → 128.800
UPDATE propiedades_v2 SET
  precio_usd = 128800,
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'precio_usd', jsonb_build_object('bloqueado',true,'por','audit_zn_266','fecha','2026-06-23','valor_original',precio_usd))
WHERE id = 2805 AND tipo_cambio_detectado = 'paralelo';

-- #2806 Ziri Zwei (otra unidad, mismo anuncio) — precio_usd 185.057 → 128.800
UPDATE propiedades_v2 SET
  precio_usd = 128800,
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'precio_usd', jsonb_build_object('bloqueado',true,'por','audit_zn_266','fecha','2026-06-23','valor_original',precio_usd))
WHERE id = 2806 AND tipo_cambio_detectado = 'paralelo';

-- #2009 Santa Fe — desc: "PRECIO: $115.000" (BOB 1.039.000/115.000 ≈ 9,03 = paralelo). 156.968 → 115.000
UPDATE propiedades_v2 SET
  precio_usd = 115000,
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'precio_usd', jsonb_build_object('bloqueado',true,'por','audit_zn_266','fecha','2026-06-23','valor_original',precio_usd))
WHERE id = 2009 AND tipo_cambio_detectado = 'paralelo';

-- #2014 Condominio ONE — desc: "100,87 m² | $1.350 USD/m²" → billete 100,87×1350 = 136.175 (BOB/billete ≈ 9,5).
--   Doble fix: precio_usd 185.870 → 136.175 Y área 400 → 100,87.
UPDATE propiedades_v2 SET
  precio_usd = 136175,
  area_total_m2 = 100.87,
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'precio_usd',     jsonb_build_object('bloqueado',true,'por','audit_zn_266','fecha','2026-06-23','valor_original',precio_usd),
    'area_total_m2',  jsonb_build_object('bloqueado',true,'por','audit_zn_266','fecha','2026-06-23','valor_original',area_total_m2))
WHERE id = 2014 AND tipo_cambio_detectado = 'paralelo';

-- ----------------------------------------------------------------------------
-- B) Área mal extraída (parse de magnitud).
-- ----------------------------------------------------------------------------

-- #2845 Stone By Portobello — desc: "Superficie 32,80 m²". área 3.323 → 32,80
UPDATE propiedades_v2 SET
  area_total_m2 = 32.80,
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'area_total_m2', jsonb_build_object('bloqueado',true,'por','audit_zn_266','fecha','2026-06-23','valor_original',area_total_m2))
WHERE id = 2845;

-- ----------------------------------------------------------------------------
-- C) Flag TC paralelo sobre precio en Bs → debe ser no_especificado (se convierte al oficial).
--    #2323 — desc: "Precio de Venta: Bs. 500.000" → oficial 500.000/6.96 = 71.839 (precio_usd ya OK).
--    El flag paralelo lo inflaba ×1.42. (El matching de esta prop se corrige en bloque D.)
-- ----------------------------------------------------------------------------
UPDATE propiedades_v2 SET
  tipo_cambio_detectado = 'no_especificado',
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'tipo_cambio_detectado', jsonb_build_object('bloqueado',true,'por','audit_zn_266','fecha','2026-06-23','valor_original',tipo_cambio_detectado))
WHERE id = 2323 AND tipo_cambio_detectado = 'paralelo';

-- ----------------------------------------------------------------------------
-- D) Matching errado — cluster STONE (numerado → candar id_proyecto_master).
--    #2083/#2084 dicen "STONE 7" (url + desc) pero quedaron en pm 268 (STONE 4).
--    #2323 dice "Stone By Portobello" pero quedó en pm 268 (STONE 4).
-- ----------------------------------------------------------------------------

-- #2083 STONE 7 (url c21 "stone-7-departamento") : pm 268 STONE 4 → pm 418 STONE 7
UPDATE propiedades_v2 SET
  id_proyecto_master = 418,
  metodo_match = 'auditor_zn_266',
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'id_proyecto_master', jsonb_build_object('bloqueado',true,'por','audit_zn_266','fecha','2026-06-23',
      'razon','cluster numerado mal matcheado (STONE 7 ≠ STONE 4)','valor_original',id_proyecto_master))
WHERE id = 2083 AND id_proyecto_master = 268;

-- #2084 STONE 7 (url c21 "stone-7-monoambiente") : pm 268 STONE 4 → pm 418 STONE 7
UPDATE propiedades_v2 SET
  id_proyecto_master = 418,
  metodo_match = 'auditor_zn_266',
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'id_proyecto_master', jsonb_build_object('bloqueado',true,'por','audit_zn_266','fecha','2026-06-23',
      'razon','cluster numerado mal matcheado (STONE 7 ≠ STONE 4)','valor_original',id_proyecto_master))
WHERE id = 2084 AND id_proyecto_master = 268;

-- #2323 Stone By Portobello : pm 268 STONE 4 → pm 422 Condominio Stone By Portobello
UPDATE propiedades_v2 SET
  id_proyecto_master = 422,
  metodo_match = 'auditor_zn_266',
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'id_proyecto_master', jsonb_build_object('bloqueado',true,'por','audit_zn_266','fecha','2026-06-23',
      'razon','cluster STONE mal matcheado (Stone By Portobello ≠ STONE 4)','valor_original',id_proyecto_master))
WHERE id = 2323 AND id_proyecto_master = 268;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN POST-FIX (correr tras el COMMIT)
-- ============================================================================
-- SELECT v.id, v.nombre_edificio, v.precio_usd, v.area_total_m2, v.tipo_cambio_detectado,
--        v.id_proyecto_master,
--        ROUND(precio_normalizado(v.precio_usd, v.tipo_cambio_detectado)/NULLIF(v.area_total_m2,0)) AS m2_feed,
--        campo_esta_bloqueado(p.campos_bloqueados,'precio_usd')          AS lock_precio,
--        campo_esta_bloqueado(p.campos_bloqueados,'area_total_m2')       AS lock_area,
--        campo_esta_bloqueado(p.campos_bloqueados,'id_proyecto_master')  AS lock_pm
-- FROM v_mercado_venta v JOIN propiedades_v2 p ON p.id=v.id
-- WHERE v.id IN (2805,2806,2009,2014,2845,2323,2083,2084)
-- ORDER BY v.id;
-- Esperado: m2_feed en rango ZN (~1.500-2.500), locks en true, Stone reasignado.

-- ============================================================================
-- ROLLBACK (si algo sale mal)
-- ============================================================================
-- BEGIN;
-- UPDATE propiedades_v2 SET precio_usd=185057, campos_bloqueados = campos_bloqueados - 'precio_usd' WHERE id IN (2805,2806);
-- UPDATE propiedades_v2 SET precio_usd=156968, campos_bloqueados = campos_bloqueados - 'precio_usd' WHERE id = 2009;
-- UPDATE propiedades_v2 SET precio_usd=185870, area_total_m2=400, campos_bloqueados = (campos_bloqueados - 'precio_usd') - 'area_total_m2' WHERE id = 2014;
-- UPDATE propiedades_v2 SET area_total_m2=3323, campos_bloqueados = campos_bloqueados - 'area_total_m2' WHERE id = 2845;
-- UPDATE propiedades_v2 SET tipo_cambio_detectado='paralelo', campos_bloqueados = campos_bloqueados - 'tipo_cambio_detectado' WHERE id = 2323;
-- UPDATE propiedades_v2 SET id_proyecto_master=268, campos_bloqueados = campos_bloqueados - 'id_proyecto_master' WHERE id IN (2083,2084,2323);
-- COMMIT;
