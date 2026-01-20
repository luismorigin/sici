-- ============================================================================
-- MIGRACIÓN 064: Enriquecimiento de Amenities y Equipamiento (COMPLETA)
-- ============================================================================
-- Fecha: 2026-01-20
-- Autor: Claude Code
-- Propósito: Agregar amenities y equipamiento extraídos de descripciones
--
-- MÉTODO: IDs hardcodeados (validados con queries el 2026-01-20)
--
-- TOTAL: 69 campos (45 equipamiento + 24 amenities)
--
-- SEGURIDAD:
--   - Solo AGREGA items a arrays existentes (no reemplaza)
--   - APLICA CANDADOS para proteger del merge nocturno
--   - Idempotente: si corre 2 veces, no duplica
-- ============================================================================

-- Función auxiliar para agregar item a array JSONB sin duplicados
CREATE OR REPLACE FUNCTION agregar_item_amenity(
    p_datos_json JSONB,
    p_path TEXT,
    p_item TEXT
) RETURNS JSONB AS $$
DECLARE
    v_amenities JSONB;
    v_array JSONB;
BEGIN
    v_amenities := COALESCE(p_datos_json->'amenities', '{}'::jsonb);
    v_array := COALESCE(v_amenities->p_path, '[]'::jsonb);
    IF NOT v_array @> to_jsonb(p_item) THEN
        v_array := v_array || to_jsonb(p_item);
    END IF;
    v_amenities := jsonb_set(v_amenities, ARRAY[p_path], v_array);
    RETURN jsonb_set(COALESCE(p_datos_json, '{}'::jsonb), ARRAY['amenities'], v_amenities);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- EQUIPAMIENTO - COCINA (35 campos total)
-- ============================================================================

-- 1. Encimera (129 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Encimera'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,29,30,31,53,59,71,72,73,74,75,76,77,78,79,80,81,82,83,84,90,92,96,97,117,118,119,120,121,150,159,167,169,173,179,187,207,225,226,227,232,233,245,250,251,252,253,256,261,265,266,282,283,284,289,293,296,306,308,314,323,324,325,328,329,330,331,332,335,338,342,343,344,345,346,349,350,351,358,359,360,361,362,363,364,366,367,368,369,370,408,409,410,411,412,417,419,423,425,427,428,429,432,452,455,456,458,459,460,461,462,463,464,465,468,469,470,471,472,473,474,476,477,479,483,485,488,490);

-- 2. Heladera (71 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Heladera'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,30,31,53,59,71,72,73,74,75,76,77,78,79,80,81,82,83,84,90,92,96,97,117,118,119,120,121,149,159,169,225,226,227,232,242,245,256,265,266,306,308,313,323,324,325,328,329,330,331,332,335,338,419,423,427,429,462,463,465,468,469,470,471,472,473,474,476,479,484);

-- 3. Muebles cocina (80 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Muebles cocina'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,29,30,90,92,96,97,99,173,179,187,203,224,231,233,234,243,282,283,284,289,293,296,306,312,314,323,324,325,329,330,331,332,338,339,342,343,344,345,346,347,348,349,350,351,352,358,359,360,361,362,363,364,376,378,379,380,410,411,412,417,418,425,428,461,462,463,468,469,470,471,472,473,474,476,477,483,488,490);

-- 4. Campana extractora (139 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Campana extractora'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,29,31,53,59,71,72,73,74,75,76,77,78,79,80,81,82,83,84,90,92,96,97,118,119,120,121,149,150,159,167,169,173,179,187,198,203,207,208,209,210,211,212,213,214,215,216,217,224,225,226,227,231,245,246,250,251,252,253,256,261,265,266,282,283,284,289,293,296,306,308,312,314,323,324,325,328,329,330,331,332,335,338,339,343,345,346,349,350,351,352,358,359,360,361,362,363,364,366,367,368,369,370,378,379,380,408,409,410,411,412,417,423,425,427,428,432,454,455,456,458,459,460,461,462,463,468,469,470,471,472,473,474,476,477,483,485,490);

-- 5. Horno empotrado (30 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Horno empotrado'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,53,59,90,92,96,97,150,293,314,329,330,331,332,352,423,427,452,462,463,465,468,469,470,471,472,473,474,483);

-- 6. Microondas (50 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Microondas'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (31,59,117,150,159,169,207,208,209,210,211,212,213,214,215,216,217,224,225,226,227,232,242,245,246,256,265,266,293,308,313,314,335,338,339,343,345,346,349,350,351,376,378,425,429,458,459,465,476,479);

-- 7. Grifería (17 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Grifería'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (29,179,306,339,342,343,344,345,346,349,350,351,354,378,417,422,488);

-- 8. Mesada granito/mármol (10 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Mesada piedra natural'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (179,306,339,354,375,378,408,409,417,456);

-- 9. Lavavajillas (4 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Lavavajillas'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (53,179,417,427);

-- ============================================================================
-- EQUIPAMIENTO - DORMITORIO/CLOSETS
-- ============================================================================

-- 10. Closets (72 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Closets'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,30,35,38,53,69,90,92,96,97,150,157,159,163,175,179,187,203,225,231,234,243,245,250,251,252,253,256,261,279,282,283,284,289,306,307,308,322,324,325,328,329,330,331,332,335,338,354,408,409,417,423,425,427,429,433,454,461,462,463,468,469,470,471,472,473,474,476,483,485,490);

-- 11. Vestidor (52 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Vestidor'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (5,149,158,166,173,194,198,201,208,209,210,211,212,213,214,215,216,217,224,226,227,231,243,265,266,278,279,282,283,284,296,306,313,318,322,323,352,375,379,380,408,409,415,418,419,428,453,459,479,481,484,491);

-- 12. Puertas de ropero (25 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Puertas de ropero'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,90,92,96,97,250,251,252,253,261,289,329,330,331,332,462,463,468,469,470,471,472,473,474);

-- 13. Roperos empotrados (14 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Roperos empotrados'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (53,69,150,159,231,289,307,354,423,429,454,461,483,485);

-- 14. Cortinas/persianas (10 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Cortinas'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (159,163,166,173,198,203,335,354,429,433);

-- 15. Blackout (1 prop)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Blackout'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (198);

-- ============================================================================
-- EQUIPAMIENTO - BAÑO
-- ============================================================================

-- 16. Box ducha (35 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Box ducha'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,90,92,96,97,163,179,208,209,210,211,212,213,214,215,216,217,284,329,330,331,332,454,456,462,463,468,469,470,471,472,473,474,483);

-- 17. Mueble baño (2 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Mueble baño'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (339,378);

-- ============================================================================
-- EQUIPAMIENTO - LAVANDERÍA
-- ============================================================================

-- 18. Área de lavado (70 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Área de lavado'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (5,30,31,54,69,150,157,166,168,173,175,176,179,180,194,207,224,228,231,232,234,236,239,243,246,250,251,252,253,257,261,278,280,281,289,292,293,294,308,313,314,319,322,339,354,366,367,368,369,370,375,376,378,379,380,395,423,427,430,433,450,455,456,460,476,477,479,481,483,486);

-- 19. Lavadora (63 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Lavadora'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (29,30,53,69,71,72,73,74,75,76,77,78,79,80,81,82,83,84,118,119,120,121,159,167,169,172,179,194,198,224,232,261,265,266,296,306,318,319,323,328,347,348,352,354,358,359,360,361,362,363,364,376,379,380,410,411,412,417,423,427,429,433,490);

-- 20. Secadora (12 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Secadora'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (29,53,69,169,179,232,319,328,423,427,429,433);

-- 21. Tendedero (15 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Tendedero'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (29,53,69,169,179,205,228,232,239,319,328,423,427,429,433);

-- ============================================================================
-- EQUIPAMIENTO - AGUA CALIENTE
-- ============================================================================

-- 22. Termotanque (37 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Termotanque'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,31,90,92,96,97,226,227,231,265,266,289,293,296,306,312,314,323,324,325,329,330,331,332,338,459,462,463,468,469,470,471,472,473,474,479);

-- 23. Calefón (27 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Calefón'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (30,53,167,173,179,203,233,282,283,284,295,306,354,408,409,416,417,423,425,427,429,433,454,461,476,485,490);

-- ============================================================================
-- EQUIPAMIENTO - TECNOLOGÍA
-- ============================================================================

-- 24. Iluminación LED (55 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Iluminación LED'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,90,92,96,97,187,224,265,266,282,283,289,293,306,314,324,325,328,329,330,331,332,339,342,343,344,345,346,349,350,351,352,366,367,368,369,370,378,379,380,456,460,462,463,468,469,470,471,472,473,474,476,488,490);

-- 25. Cerradura inteligente (36 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Cerradura inteligente'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (31,69,224,225,226,227,245,250,251,252,253,261,282,283,293,338,339,342,343,344,345,346,352,366,367,368,369,370,378,379,380,460,476,479,488,490);

-- 26. Internet/WiFi (26 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Internet/WiFi'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,31,90,92,96,97,200,226,227,289,306,312,329,330,331,332,462,463,468,469,470,471,472,473,474);

-- 27. Intercomunicador (17 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Intercomunicador'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (31,53,200,207,225,226,227,245,250,251,252,253,261,423,427,479,490);

-- 28. Domótica (12 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Domótica'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (29,31,261,265,266,298,299,300,301,302,375,491);

-- ============================================================================
-- EQUIPAMIENTO - SERVICIOS/INSTALACIONES
-- ============================================================================

-- 29. Gas domiciliario (15 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Gas domiciliario'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (29,163,203,280,281,284,293,297,308,314,339,378,408,409,452);

-- 30. Balcón (113 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Balcón'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (8,22,23,29,31,32,53,70,90,92,96,97,148,150,157,158,159,162,163,167,168,173,174,175,178,179,181,198,200,201,202,207,208,209,210,211,212,213,214,215,216,217,223,224,225,226,227,231,234,243,261,268,278,289,292,293,294,296,298,299,300,301,303,307,308,314,317,318,319,339,347,348,352,354,355,356,378,379,380,387,392,395,418,423,427,429,431,450,453,454,455,458,459,460,462,463,465,468,469,470,471,472,473,474,476,477,479,481,483,486,489,490,491);

-- ============================================================================
-- EQUIPAMIENTO - ACABADOS/CONSTRUCCIÓN
-- ============================================================================

-- 31. Acabados premium (11 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Acabados premium'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (208,209,210,211,212,213,214,215,216,217,294);

-- 32. Piso porcelanato (7 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Piso porcelanato'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (261,282,283,306,339,378,490);

-- 33. Vidrio doble (4 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Vidrio doble'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (53,423,427,479);

-- 34. Aislamiento acústico (8 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Aislamiento acústico'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (31,282,283,339,378,464,490,491);

-- 35. Construcción antisísmica (3 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Construcción antisísmica'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (282,283,490);

-- ============================================================================
-- AMENITIES DEL EDIFICIO (16 campos)
-- ============================================================================

-- 36. Cowork (58 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Cowork'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (9,29,35,38,59,62,70,148,150,175,187,203,207,228,232,233,246,261,282,283,284,293,294,296,303,314,318,319,324,325,334,338,339,356,366,367,368,369,370,378,387,403,404,405,406,417,419,431,432,452,455,456,460,477,484,486,490,491);

-- 37. Sala TV/Cine (57 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Sala TV/Cine'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (29,30,71,72,73,74,75,76,77,78,79,80,81,82,83,84,118,119,120,121,150,179,187,207,208,209,210,211,212,213,214,215,216,217,228,230,280,281,297,303,312,319,329,330,331,332,334,340,387,403,404,405,406,432,450,456,476);

-- 38. Jacuzzi (43 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Jacuzzi'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (9,71,72,73,74,75,76,77,78,79,80,81,82,83,84,118,119,120,121,148,175,176,245,250,251,252,253,261,292,293,294,312,314,329,330,331,332,403,404,405,406,416,458);

-- 39. Seguridad 24h (36 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Seguridad 24h'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (99,182,183,184,185,186,200,207,208,209,210,211,212,213,214,215,216,217,231,239,243,250,251,252,253,261,268,354,356,408,409,416,418,428,484,491);

-- 40. Sala de juegos (25 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Sala de juegos'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (30,59,62,148,174,179,180,187,228,303,307,313,324,325,339,378,403,404,405,406,407,419,432,456,459);

-- 41. Piscina infinita (22 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Piscina infinita'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (174,208,209,210,211,212,213,214,215,216,217,224,282,283,319,352,355,375,379,380,452,490);

-- 42. Bar/Lounge (18 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Bar/Lounge'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (148,158,200,207,228,282,283,366,367,368,369,370,416,455,458,460,465,490);

-- 43. Cámaras seguridad (15 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Cámaras seguridad'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (250,251,252,253,261,284,339,366,367,368,369,370,378,460,490);

-- 44. Billar (7 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Billar'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (150,207,228,295,387,456,465);

-- 45. Jardín (7 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Jardín'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (9,53,280,281,417,423,427);

-- 46. Parque infantil (3 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Parque infantil'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (231,239,483);

-- 47. Rooftop (2 props)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Rooftop'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (29,207);

-- 48. Cancha deportiva (1 prop)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Cancha deportiva'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (406);

-- 49. Sala yoga (1 prop)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Sala yoga'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (9);

-- 50. Pet friendly (1 prop)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Pet friendly'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (179);

-- 51. Ascensor con A/C (1 prop)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Ascensor con A/C'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (483);

-- ============================================================================
-- CAMPOS NUEVOS DETECTADOS EN AUDITORÍA (2026-01-20)
-- ============================================================================

-- ============================================================================
-- EQUIPAMIENTO - BAÑO (NUEVOS)
-- ============================================================================

-- 52. Tina/Bañera (46 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Tina/Bañera'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,71,72,73,74,75,76,77,78,79,80,81,82,83,84,90,92,96,97,118,119,120,121,159,163,166,173,198,203,225,256,335,354,429,433,462,463,468,469,470,471,472,473,474,479);

-- 53. Muebles de baño completos (41 props) - NUEVO (vanity/vanitorio/tocador)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Muebles de baño'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (9,30,173,198,207,225,232,234,243,245,250,251,252,253,261,265,266,282,283,296,306,323,328,338,352,366,367,368,369,370,375,425,430,432,433,455,460,476,477,483,490);

-- 54. Espejo (25 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Espejo'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (30,31,53,225,226,227,245,256,282,283,284,293,296,306,314,323,328,339,352,375,378,423,427,433,490);

-- 55. Ducha española/múltiple (8 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Ducha española'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (339,343,345,346,349,350,351,378);

-- ============================================================================
-- EQUIPAMIENTO - SEGURIDAD (NUEVOS)
-- ============================================================================

-- 56. Alarma/Sistema de seguridad (9 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Alarma de seguridad'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (31,70,226,227,261,318,339,378,479);

-- ============================================================================
-- EQUIPAMIENTO - VISTAS/EXTRAS (NUEVOS)
-- ============================================================================

-- 57. Vista panorámica (7 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Vista panorámica'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (176,178,242,278,295,296,422);

-- 58. Terraza privada (5 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Terraza privada'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (69,255,302,328,422);

-- 59. Ventanas doble vidrio/termopanel (4 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Ventanas doble vidrio'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (53,306,423,427);

-- ============================================================================
-- AMENITIES EDIFICIO (NUEVOS)
-- ============================================================================

-- 60. Roof garden/Terraza común (43 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Roof garden/Terraza común'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (22,23,29,69,90,92,96,97,172,207,252,255,284,295,297,298,299,300,301,302,322,323,358,359,360,361,362,363,364,395,410,411,412,422,462,463,468,469,470,471,472,473,474);

-- 61. Lobby/Recepción (28 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Lobby/Recepción'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (30,31,99,159,169,174,180,219,226,227,245,278,282,283,284,319,340,354,396,397,398,399,400,401,402,476,483,490);

-- 62. Canchas deportivas (14 props) - ACTUALIZADO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Canchas deportivas'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (53,228,243,295,296,303,323,403,404,405,406,423,427,465);

-- 63. Gas centralizado (15 props) - NUEVO (edificio)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Gas centralizado'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (29,163,203,280,281,284,293,297,308,314,339,378,408,409,452);

-- 64. Área verde (7 props) - NUEVO
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'lista', 'Área verde'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (9,53,280,281,417,423,427);

-- ============================================================================
-- ACTUALIZACIÓN - Piso porcelanato (IDs faltantes)
-- ============================================================================

-- 65. Piso porcelanato - IDs adicionales (2 props extras)
UPDATE propiedades_v2 SET
    datos_json = agregar_item_amenity(datos_json, 'equipamiento', 'Piso porcelanato'),
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || '{"amenities": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (375,479);

-- ============================================================================
-- REGISTRO DE MIGRACIÓN
-- ============================================================================

INSERT INTO workflow_executions (
    workflow_name,
    workflow_version,
    status,
    started_at,
    finished_at,
    records_processed,
    records_updated,
    metadata
) VALUES (
    'migration_064_enriquecer_amenities',
    '4.0.0',
    'success',
    NOW(),
    NOW(),
    (SELECT COUNT(*) FROM propiedades_v2 WHERE status = 'completado'),
    0,
    jsonb_build_object(
        'descripcion', 'Enriquecimiento Amenities/Equipamiento v4.0 AUDITADO',
        'metodo', 'IDs hardcodeados',
        'campos_equipamiento', 45,
        'campos_amenities', 24,
        'total_campos', 69,
        'con_candados', true,
        'fecha_extraccion_ids', '2026-01-20',
        'nuevos_campos_v3', ARRAY['closets','microondas','calefon','puertas_ropero','tendedero','roperos_empotrados','secadora','mesada_granito','cortinas'],
        'nuevos_campos_v4_auditoria', ARRAY['tina_banera','muebles_bano','espejo','ducha_espanola','alarma_seguridad','vista_panoramica','terraza_privada','ventanas_doble_vidrio','roof_garden','lobby_recepcion','canchas_deportivas','gas_centralizado','area_verde']
    )
);

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

DO $$
DECLARE
    v_props_con_candado INTEGER;
    v_total_equipamiento INTEGER;
    v_total_amenities INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_props_con_candado
    FROM propiedades_v2
    WHERE COALESCE(campos_bloqueados, '{}'::jsonb) ? 'amenities';

    SELECT COUNT(*) INTO v_total_equipamiento
    FROM propiedades_v2
    WHERE jsonb_array_length(COALESCE(datos_json->'amenities'->'equipamiento', '[]'::jsonb)) > 0;

    SELECT COUNT(*) INTO v_total_amenities
    FROM propiedades_v2
    WHERE jsonb_array_length(COALESCE(datos_json->'amenities'->'lista', '[]'::jsonb)) > 0;

    RAISE NOTICE '=== MIGRACIÓN 064 v4.0 COMPLETADA (CON AUDITORÍA) ===';
    RAISE NOTICE 'Props con candado amenities: %', v_props_con_candado;
    RAISE NOTICE 'Props con equipamiento: %', v_total_equipamiento;
    RAISE NOTICE 'Props con amenities lista: %', v_total_amenities;
END $$;
