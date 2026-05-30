-- ============================================================================
-- Cleanup matching ZN — familia Portobello / Stone / Praga
-- Fecha: 30-may-2026 · Director verificó GPS y nombres en terreno
-- Aplicar desde Supabase SQL editor (mutations = patrón humano).
-- Transaccional: si algo falla, no se aplica nada.
--
-- Qué hace:
--   1. Crea 3 pm nuevos con GPS verificado (zona derivada por get_zona_by_gps).
--   2. Saca los falsos de pm 269 (Portobello Isuto) y pm 268 (STONE 4).
--   3. Reasigna 7 props a sus pm reales + canda nombre_edificio.
--   4. Canda además id_proyecto_master en las de GPS de agente desplazado
--      (2307 @843m, 2387 @2571m) para que ningún recálculo las robe por GPS.
--
-- Casos (verificados por el director):
--   Portobello 6   -17.74812443968697, -63.156076172218825 → 2107, 2108 (venta, eran pm 269)
--   Stone By Porto -17.73650418946031, -63.174389754506365 → 2323 (venta, era pm 268 STONE 4),
--                                                              2228 (alq), 2307 (alq, era pm 269),
--                                                              2387 (alq)
--   Edificio Praga -17.751050127017226, -63.15522349026002 → 2332 (venta, sin nombre)
-- ============================================================================

DO $$
DECLARE
  v_p6    INTEGER;
  v_stone INTEGER;
  v_praga INTEGER;
  v_now   TIMESTAMPTZ := NOW();
BEGIN
  -- ---- 1. Crear pm nuevos -------------------------------------------------
  INSERT INTO proyectos_master
    (nombre_oficial, zona, latitud, longitud, activo, alias_conocidos,
     gps_verificado_visual, gps_verificacion_notas, gps_verificado_visual_at)
  VALUES
    ('Portobello 6',
     COALESCE((SELECT zona FROM get_zona_by_gps(-17.74812443968697, -63.156076172218825) LIMIT 1),
              '4to-6to anillo Alemana-Mutualista'),
     -17.74812443968697, -63.156076172218825, true,
     ARRAY['Portobello 6','PORTOBELLO 6','portobello-6','Condominio Portobello 6'],
     'confirmed',
     'GPS verificado director 30-may-2026. Props 2107/2108 a 7-14m. Eran falsos de pm 269 (slug c21 portobello-6).',
     v_now)
  RETURNING id_proyecto_master INTO v_p6;

  INSERT INTO proyectos_master
    (nombre_oficial, zona, latitud, longitud, activo, alias_conocidos,
     gps_verificado_visual, gps_verificacion_notas, gps_verificado_visual_at)
  VALUES
    ('Condominio Stone By Portobello',
     COALESCE((SELECT zona FROM get_zona_by_gps(-17.73650418946031, -63.174389754506365) LIMIT 1),
              '4to-6to anillo Radial 26-Banzer'),
     -17.73650418946031, -63.174389754506365, true,
     ARRAY['Stone By Portobello','Condominio Stone By Portobello','Stone Portobello','STONE BY PORTOBELLO','stone-portobello'],
     'confirmed',
     'GPS verificado director 30-may-2026. 2323@28m (era pm 268 STONE 4), 2228@113m. 2307/2387 GPS de agente desplazado confirmados por descripcion del aviso.',
     v_now)
  RETURNING id_proyecto_master INTO v_stone;

  INSERT INTO proyectos_master
    (nombre_oficial, zona, latitud, longitud, activo, alias_conocidos,
     gps_verificado_visual, gps_verificacion_notas, gps_verificado_visual_at)
  VALUES
    ('Edificio Praga',
     COALESCE((SELECT zona FROM get_zona_by_gps(-17.751050127017226, -63.15522349026002) LIMIT 1),
              '4to-6to anillo Alemana-Mutualista'),
     -17.751050127017226, -63.15522349026002, true,
     ARRAY['Edificio Praga','Praga','EDIFICIO PRAGA','Condominio Praga'],
     'confirmed',
     'GPS verificado director 30-may-2026. Prop 2332 (sin nombre en BD) a 7m.',
     v_now)
  RETURNING id_proyecto_master INTO v_praga;

  -- ---- 2. Portobello 6: 2107, 2108 (sacar de pm 269) ----------------------
  UPDATE propiedades_v2 SET
    id_proyecto_master = v_p6,
    nombre_edificio    = 'Portobello 6',
    metodo_match       = 'manual_director_30may',
    campos_bloqueados  = jsonb_set(COALESCE(campos_bloqueados, '{}'::jsonb), '{nombre_edificio}',
      jsonb_build_object('bloqueado', true, 'por', 'admin_manual', 'fecha', v_now,
        'razon', 'Slug c21 portobello-6. Era falso de pm 269 Portobello Isuto. GPS verificado director.'))
  WHERE id IN (2107, 2108);

  -- ---- 3. Stone By Portobello: 2323 (de pm 268), 2228, 2307 (de pm 269), 2387 ----
  -- 2323 + 2228: GPS bueno → solo candado de nombre
  UPDATE propiedades_v2 SET
    id_proyecto_master = v_stone,
    nombre_edificio    = 'Condominio Stone By Portobello',
    metodo_match       = 'manual_director_30may',
    campos_bloqueados  = jsonb_set(COALESCE(campos_bloqueados, '{}'::jsonb), '{nombre_edificio}',
      jsonb_build_object('bloqueado', true, 'por', 'admin_manual', 'fecha', v_now,
        'razon', 'Stone By Portobello verificado director (GPS -17.73650,-63.17439).'))
  WHERE id IN (2323, 2228);

  -- 2307 + 2387: GPS de agente desplazado → candar nombre Y id_proyecto_master
  UPDATE propiedades_v2 SET
    id_proyecto_master = v_stone,
    nombre_edificio    = 'Condominio Stone By Portobello',
    metodo_match       = 'manual_director_30may',
    campos_bloqueados  = jsonb_set(jsonb_set(COALESCE(campos_bloqueados, '{}'::jsonb), '{nombre_edificio}',
        jsonb_build_object('bloqueado', true, 'por', 'admin_manual', 'fecha', v_now,
          'razon', 'Stone By Portobello (descripcion del aviso). GPS de agente desplazado, NO confiable.')),
      '{id_proyecto_master}',
      jsonb_build_object('bloqueado', true, 'por', 'admin_manual', 'fecha', v_now,
        'razon', 'GPS desplazado por el agente; candado para que el matching por GPS no lo robe.'))
  WHERE id IN (2307, 2387);

  -- ---- 4. Edificio Praga: 2332 ------------------------------------------
  UPDATE propiedades_v2 SET
    id_proyecto_master = v_praga,
    nombre_edificio    = 'Edificio Praga',
    metodo_match       = 'manual_director_30may',
    campos_bloqueados  = jsonb_set(COALESCE(campos_bloqueados, '{}'::jsonb), '{nombre_edificio}',
      jsonb_build_object('bloqueado', true, 'por', 'admin_manual', 'fecha', v_now,
        'razon', 'Edificio Praga verificado director (listing sin nombre, GPS a 7m).'))
  WHERE id IN (2332);

  RAISE NOTICE 'pm creados: Portobello 6=%, Stone By Portobello=%, Edificio Praga=%', v_p6, v_stone, v_praga;
END $$;

-- ============================================================================
-- POST-CHECK (correr aparte después de aplicar):
-- ============================================================================
-- SELECT p.id, p.tipo_operacion, p.nombre_edificio, pm.nombre_oficial, pm.zona,
--        (p.campos_bloqueados ? 'nombre_edificio') AS nombre_candado,
--        (p.campos_bloqueados ? 'id_proyecto_master') AS pm_candado
-- FROM propiedades_v2 p JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
-- WHERE p.id IN (2107,2108,2323,2228,2307,2387,2332)
-- ORDER BY pm.nombre_oficial, p.id;
--
-- Verificar que pm 269 (Portobello Isuto) quedó solo con los Isuto reales:
-- SELECT id, nombre_edificio, status FROM propiedades_v2 WHERE id_proyecto_master = 269;
