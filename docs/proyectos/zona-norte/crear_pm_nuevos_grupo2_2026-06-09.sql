-- =====================================================================
-- CREAR PM NUEVOS Grupo 2: edificios reales de Zona Norte sin pm
-- Fecha: 2026-06-09  |  Auditoría matching ZN (3 subagentes + consolidación)
-- Estado: NO APLICADO — revisar antes de ejecutar en Supabase
--
-- Crea 44 pm nuevos (alta confianza + GPS confiable) y matchea sus props.
-- GPS = centroide de las props del edificio. Microzona derivada por GPS.
--
-- EXCLUIDOS a propósito (otra ronda / requieren geocodificación):
--   * GPS-fallback (coordenada compartida por varios edificios, NO confiable):
--     Atlantis(2313), Panorama(2256), Holiday(2293), Macororó III(2163),
--     Isuto by One(2610), Holiday Smart Studio(2548)
--   * Confianza media (nombre propio pero conf LLM media): Ulupica, Valeria I,
--     Wilma II, Torre Rubí, Torre Salto, Yas Dahi, Majo Beni, Magnolia Park
--   * REVISAR (ambiguos): Condominio Torre Baruc(2562) vs familia Baruc,
--     Condominio Ziri(1996) vs Ziri Zwei pm362, Jerico(2181), Multifamiliar
--     Nicolas(2106) vs Edificio Nicolás
--   * Basura descartada: Excelente Ubicación, Venta Zona, Planta Baja, etc.
--
-- PRE-REQUISITO sugerido: aplicar antes rematch_grupo1 (no es estrictamente
-- necesario; los conjuntos de props no se solapan).
-- =====================================================================

BEGIN;

WITH nuevos(nombre_oficial, prop_ids) AS (VALUES
  ('Edificio Alpha by Luxe',        ARRAY[1980]),
  ('Condominio Berchatti II',       ARRAY[2444]),
  ('Condominio Berchatti Norte 2',  ARRAY[2482]),
  ('Edificio BlueBox',              ARRAY[2584]),
  ('Condominio Community Alemana',  ARRAY[2473,2474]),
  ('Condominio 3 Torres',           ARRAY[2650]),
  ('Condominio Atlas',              ARRAY[2382]),
  ('Condominio Baruc Norte',        ARRAY[2076,2072]),
  ('Condominio Deisy',              ARRAY[2446]),
  ('Condominio Gava',               ARRAY[2250]),
  ('Edificio Catalina',             ARRAY[2127,2138]),
  ('Edificio Orvieto',              ARRAY[2035]),
  ('Edificio Altamura',             ARRAY[2044]),
  ('Edificio El Salvador',          ARRAY[2251]),
  ('Condominio El Remanso 3',       ARRAY[2481]),
  ('Edificio Torre Chiquitana',     ARRAY[2348]),
  ('Condominio Hamacas',            ARRAY[2369]),
  ('Condominio Jacarandá',          ARRAY[2370]),
  ('Condominio La Recoleta',        ARRAY[2001]),
  ('Condominio Las Piñas',          ARRAY[1998]),
  ('Condominio Los Nonis',          ARRAY[2185]),
  ('Condominio Ito',                ARRAY[2523,2046]),
  ('Condominio Macororó 10',        ARRAY[2386]),
  ('Condominio Milán',              ARRAY[2353]),
  ('Condominio Moliere',            ARRAY[2419]),
  ('Edificio Lucitano',             ARRAY[2155]),
  ('Edificio Macororó 19',          ARRAY[2451]),
  ('Edificio Majo Hamacas',         ARRAY[2047]),
  ('Edificio Nicolás',              ARRAY[2606]),
  ('Jardines Del Norte IV',         ARRAY[2471]),
  ('Los Tucanes 2',                 ARRAY[2651]),
  ('Edificio Emma 2',               ARRAY[2157]),
  ('Condominio Palma de Mallorca',  ARRAY[2262]),
  ('Condominio Sevilla Norte 1',    ARRAY[2576]),
  ('Condominio Tamisa 2',           ARRAY[2522]),
  ('Condominio Villa Toscana',      ARRAY[2124,2113]),
  ('Edificio One Isuto',            ARRAY[2630]),
  ('Edificio Sumuque',              ARRAY[2007]),
  ('Edificio San Miguel',           ARRAY[2008]),
  ('Edificio Victor',               ARRAY[2504,2300]),
  ('Rachel Residenza',              ARRAY[2472]),
  ('Stratto Vind',                  ARRAY[2235]),
  ('The Bond',                      ARRAY[2245]),
  ('Trivento III',                  ARRAY[2312,2343])
),
-- GPS centroide por edificio (props ya tienen GPS confiable; sin fallback)
con_gps AS (
  SELECT n.nombre_oficial, n.prop_ids,
         ROUND(AVG(p.latitud)::numeric,7) AS lat, ROUND(AVG(p.longitud)::numeric,7) AS lon
  FROM nuevos n JOIN propiedades_v2 p ON p.id = ANY(n.prop_ids)
  GROUP BY n.nombre_oficial, n.prop_ids
),
-- Insertar pm nuevos (guard anti-duplicado por nombre normalizado)
inserted AS (
  INSERT INTO proyectos_master (nombre_oficial, zona, latitud, longitud, activo, gps_verificado_visual)
  SELECT g.nombre_oficial, get_zona_by_gps(g.lat, g.lon), g.lat, g.lon, true, 'false'
  FROM con_gps g
  WHERE NOT EXISTS (
    SELECT 1 FROM proyectos_master pm
    WHERE normalize_nombre(pm.nombre_oficial) = normalize_nombre(g.nombre_oficial)
  )
  RETURNING id_proyecto_master, nombre_oficial
)
-- Matchear las props al pm recién creado
UPDATE propiedades_v2 p
SET id_proyecto_master = i.id_proyecto_master,
    nombre_edificio = i.nombre_oficial,
    es_para_matching = false,
    metodo_match = 'pm_nuevo',
    confianza_sugerencia_extractor = 95
FROM inserted i
JOIN nuevos n ON n.nombre_oficial = i.nombre_oficial
WHERE p.id = ANY(n.prop_ids);

-- Caso especial: "Edificio One Isuto" (2630) es el MISMO que el pm 262 "ONE ISUTO"
-- (54m). No se crea pm nuevo (lo saltea el guard); se matchea al existente.
UPDATE propiedades_v2 p
SET id_proyecto_master = 262, nombre_edificio = 'ONE ISUTO',
    es_para_matching = false, metodo_match = 'pm_nuevo', confianza_sugerencia_extractor = 90
WHERE p.id = 2630 AND p.id_proyecto_master IS NULL
  AND NOT campo_esta_bloqueado(p.campos_bloqueados,'nombre_edificio');

-- NOTA: NO se crean (normalize_nombre colapsa con familia existente, requieren revisión):
--   * "Condominio Baruc Norte" (2076,2072) vs pm 409 "Torre Baruc Norte" (1132m) — ¿distintos?
--   * "Trivento III" (2312,2343) vs pm 332 "TRIVENTO IV" (2162m) — III≠IV, distintos
-- Quedan sin match a propósito hasta decidir nombre que no colisione.

-- ---------------------------------------------------------------------
-- CONTROL
-- ---------------------------------------------------------------------
SELECT 'props_matcheadas_pm_nuevo' AS metrica, COUNT(*)::text AS valor
FROM propiedades_v2 WHERE metodo_match='pm_nuevo_zn'
UNION ALL
SELECT 'pm_activos_zona_norte',
  (SELECT COUNT(*)::text FROM proyectos_master pm JOIN zonas_geograficas z ON pm.zona=z.nombre
   WHERE z.zona_general='Zona Norte' AND pm.activo=true)
UNION ALL
SELECT 'match_rate_venta_zn_%',
  ROUND(100.0*COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL)/NULLIF(COUNT(*),0),1)::text
FROM propiedades_v2 p
WHERE p.zona IN (SELECT nombre FROM zonas_geograficas WHERE zona_general='Zona Norte')
  AND p.tipo_operacion='venta' AND p.status='completado' AND p.duplicado_de IS NULL;

COMMIT;
-- ROLLBACK;  -- si algo se ve mal
