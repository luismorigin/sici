-- =============================================================================
-- Migración 260: condominios_master (catálogo de condominios cerrados — Zona Norte)
-- =============================================================================
-- Tabla NUEVA y AISLADA. NO toca propiedades_v2 ni proyectos_master.
-- Catálogo de barrios/condominios cerrados de casas (análogo a proyectos_master
-- para edificios de deptos, pero entidad separada: geometría areal + amenidades comunes).
-- Origen: sonda scripts/sonda-suelo/ (jun-2026). 36 condominios ZN curados:
--   26 GPS verificados a mano (Google Maps) · 3 centroide confirmado · 7 verificado web.
-- La FK id_condominio_master en propiedades_v2 y el matcher son FASE 2 (otra migración),
-- tras probar el matching (ojo solapamiento de familias Sevilla/Riviera — ver diseño §5).
-- Doc: docs/proyectos/zona-norte/DISENO_PIPELINE_CASAS_VIVIENDA.md
-- Ref GRANTs: docs/canonical/SEGURIDAD_SUPABASE.md (Regla 6) — Preset A (data pública)
-- =============================================================================

BEGIN;

-- 1. TABLA
CREATE TABLE IF NOT EXISTS public.condominios_master (
  id_condominio_master  BIGSERIAL PRIMARY KEY,
  nombre_oficial        TEXT NOT NULL,
  alias_conocidos       TEXT[]  NOT NULL DEFAULT '{}',
  slug                  TEXT UNIQUE,
  desarrollador         TEXT,
  latitud               NUMERIC(10,7) NOT NULL,
  longitud              NUMERIC(10,7) NOT NULL,
  radio_metros          INTEGER NOT NULL DEFAULT 250,
  poligono              GEOMETRY(Polygon, 4326),     -- NULL por ahora; se refina en Fase 2
  zona                  TEXT,                        -- microzona (se deriva en Fase 2)
  zona_general          TEXT NOT NULL DEFAULT 'Zona Norte',
  amenidades_comunes    JSONB NOT NULL DEFAULT '[]'::jsonb,
  gps_fuente            TEXT,                        -- 'founder_gmaps' | 'centroide' | 'web'
  gps_verificado        BOOLEAN NOT NULL DEFAULT false,
  n_casas_detectadas    INTEGER NOT NULL DEFAULT 0,
  url_referencia        TEXT,
  notas                 TEXT,
  activo                BOOLEAN NOT NULL DEFAULT true,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en        TIMESTAMPTZ
);

COMMENT ON TABLE public.condominios_master IS
  'Catálogo de condominios cerrados (casas) en Zona Norte. Entidad SEPARADA de proyectos_master (edificios). Geometría areal (centroide+radio, polígono futuro) + amenidades comunes heredables. Creada en migración 260. Consumers futuros: matcher casas Fase 2 + feed /ventas/casas.';

CREATE INDEX IF NOT EXISTS condominios_master_geom_idx ON public.condominios_master USING GIST (poligono);
CREATE INDEX IF NOT EXISTS condominios_master_gps_idx  ON public.condominios_master (latitud, longitud);

-- 2. GRANTS — Preset A (data pública, igual que proyectos_master)
GRANT SELECT ON public.condominios_master TO anon;
GRANT SELECT ON public.condominios_master TO authenticated;
GRANT ALL    ON public.condominios_master TO service_role;
GRANT SELECT ON public.condominios_master TO claude_readonly;

-- 3. DATOS — 36 condominios curados (sonda jun-2026)
INSERT INTO public.condominios_master
  (nombre_oficial, slug, desarrollador, latitud, longitud, amenidades_comunes, gps_fuente, gps_verificado, url_referencia)
VALUES
  ('Portales del Norte', 'portales-del-norte', NULL, -17.685713887133215, -63.15270765939941, '["sala de eventos","piscina comun","sauna","gimnasio","acceso controlado"]'::jsonb, 'founder_gmaps', true, NULL),
  ('Alameda Fontana', 'alameda-fontana', NULL, -17.686821190164352, -63.14379393183785, '["cancha polifuncional","piscina comun","parque infantil","areas verdes","áreas sociales"]'::jsonb, 'founder_gmaps', true, NULL),
  ('Sevilla Las Terrazas 2', 'sevilla-las-terrazas-2', 'Sevilla', -17.680745807123348, -63.146039670655455, '["piscina comun","cancha de futbol","cancha de tenis","cancha polifuncional","club house","gimnasio","seguridad 24h","piscina","jacuzzi","sauna","canchas de tenis y fútbol","salón de té/eventos","supermercado interno","churrasquera","parque infantil","áreas verdes"]'::jsonb, 'founder_gmaps', true, NULL),
  ('Sevilla Los Jardines', 'sevilla-los-jardines', 'Sevilla', -17.681427194968208, -63.148823030277796, '["piscina semiolimpica","piscina para niños","canchas de tenis","canchas de futbol","canchas polifuncionales","gimnasio","sauna","jacuzzi","salones de eventos","churrasqueras","parque infantil","areas verdes","supermercado","circuito de jogging","guardería","salon de juegos"]'::jsonb, 'founder_gmaps', true, 'https://bolivia.bienesonline.com/ficha-condominio-alquiler-santa-cruz-de-la-sierra-santa-cruz_COA6456.php'),
  ('Sevilla Pinatar', 'sevilla-pinatar', 'Sevilla', -17.67924973659209, -63.14443339863018, '["piscina adultos","piscina para niños","canchas de tenis","canchas polifuncionales","canchas de futbol sintetico","gimnasio","sauna seco","sauna vapor","salón de eventos","churrasqueras","parque infantil","areas verdes","supermercado","guardería","club house","estacionamiento para visitas"]'::jsonb, 'founder_gmaps', true, 'https://www.ultracasas.com/inmueble/casa-en-alquiler-entre-8vo-y-9no-anillo-santa-cruz-de-la-sierra-578511'),
  ('Sevilla El Bosque', 'sevilla-el-bosque', 'Sevilla', -17.67798817751489, -63.14301373017035, '["piscina recreativa","piscina de competicion","piscina para niños con tobogan","canchas de tenis","canchas de futbol","canchas de basquetbol","canchas de voleibol","canchas sinteticas","gimnasio","sauna seco","sauna vapor","jacuzzi","churrasqueras","salón de eventos","parque infantil","areas verdes / bosque","supermercado","guardería","anfiteatro exterior","cajero automatico"]'::jsonb, 'founder_gmaps', true, 'https://c21.com.bo/en_us/propiedad/77757'),
  ('Sevilla Las Terrazas', 'sevilla-las-terrazas', 'Sevilla', -17.682875610250026, -63.15370371366094, '["piscina adultos","piscina para niños","canchas de tenis","canchas de futbol","canchas de basquetbol","canchas de voleibol","gimnasio","sauna seco","sauna vapor","hidroterapia","churrasqueras cubiertas","salón de eventos","parque infantil","areas verdes","supermercado","guardería"]'::jsonb, 'founder_gmaps', true, 'https://c21.com.bo/propiedad/73275_casa-en-alquiler-en-condominio-sevilla-las-terrazas-1'),
  ('La Fontana Riviera 1', 'la-fontana-riviera-1', 'La Fontana', -17.69619752465895, -63.130760681646954, '["piscina comun","gimnasio","sala de eventos","parque infantil","cancha polifuncional","seguridad 24h","piscinas","cancha de fútbol","cine","parques infantiles","salón de eventos"]'::jsonb, 'founder_gmaps', true, NULL),
  ('La Fontana Riviera 2', 'la-fontana-riviera-2', 'La Fontana', -17.69663402374161, -63.131254106210235, '["piscina con juegos de agua","club house","canchas de futbol sintetico","canchas de futbol natural","canchas polifuncionales","canchas de tenis","sala de cine","calistenia","gimnasio","churrasqueras cubiertas","salones sociales","micromercado","parques infantiles","transporte privado"]'::jsonb, 'founder_gmaps', true, 'https://c21.com.bo/propiedad/80604_casa-en-venta-condominio-la-fontana-riviera-2'),
  ('Sevilla Real', 'sevilla-real', 'Sevilla', -17.69455162077953, -63.14197431730065, '["piscina semiolimpica","piscina para niños","solarium","jacuzzi cubierto","jacuzzi exterior","canchas de tenis","canchas de futbol","canchas de basquetbol","gimnasio de aparatos","gimnasio de aerobics","sauna seco","sauna vapor","churrasqueras cubiertas","salon multiusos","cocina gourmet","parque infantil","areas verdes","salon de juegos","supermercado","restaurante","guardería","circuito de jogging","anfiteatro"]'::jsonb, 'founder_gmaps', true, 'https://www.infocasas.com.bo/proyectos/sevilla-real-condominio-privado'),
  ('Sevilla Norte I', 'sevilla-norte-i', 'Sevilla', -17.696061286071725, -63.15442674446833, '["piscina","canchas de tenis","canchas de futbol","canchas de basquetbol","canchas de voleibol","gimnasio","sauna seco","sauna vapor","churrasqueras","areas verdes"]'::jsonb, 'founder_gmaps', true, 'https://c21.com.bo/propiedad/55217_condominio-sevilla-norte-1-3-dormi-con-dependencia-completa'),
  ('Sevilla Norte II', 'sevilla-norte-ii', 'Sevilla', -17.695860504792204, -63.15797944688464, '["cancha de tenis","cancha de futbol","piscina comun","sauna","gimnasio","sala de eventos","parque infantil","piscina adultos","piscina niños","tenis","cancha de fútbol","cancha polifuncional","jacuzzi","salón de eventos","minimarket","churrasquera","seguridad 24h"]'::jsonb, 'founder_gmaps', true, NULL),
  ('Barcelona', 'barcelona', NULL, -17.69543742921835, -63.15590201920053, '["piscina comun","sauna","gimnasio","sala de eventos","parque infantil","cancha polifuncional","piscina","churrasquera","club house","seguridad 24h"]'::jsonb, 'founder_gmaps', true, NULL),
  ('Barceló Residence Club', 'barcelo-residence-club', NULL, -17.68961018948805, -63.161363059987615, '["piscinas (2)","club house (2)","canchas polifuncionales","canchas de futbol","canchas de voleibol","gimnasio","churrasqueras","salón de eventos","parque infantil","areas verdes / jardines"]'::jsonb, 'founder_gmaps', true, 'https://mapcarta.com/W407714874'),
  ('Versalles', 'versalles', NULL, -17.69923630718445, -63.16895850256825, '["piscina","canchas polifuncionales","sauna seco y vapor","gimnasio","churrasquera","parque infantil","plaza","seguridad 24h"]'::jsonb, 'founder_gmaps', true, NULL),
  ('La Pradera', 'la-pradera', NULL, -17.701193451102245, -63.17783225828186, '["piscina comun","sauna","gimnasio","cancha de futbol","cancha polifuncional","parque infantil","sala de eventos","seguridad 24h","piscina","sauna seco","salón multiusos","churrasqueras","parques infantiles (2)","cancha de fútbol","sala de billar y metegol"]'::jsonb, 'founder_gmaps', true, NULL),
  ('Brisas del Norte I', 'brisas-del-norte-i', NULL, -17.70259095268365, -63.17850018601852, '["piscina","gimnasio","sauna (vapor)","2 canchas polifuncionales","3 churrasqueras","salon de eventos","club house","parque infantil","seguridad 24h"]'::jsonb, 'founder_gmaps', true, 'https://www.infocasas.com.bo/casa-en-venta-en-condominio-brisas-del-norte-i/191911201'),
  ('Colonial Norte', 'colonial-norte', NULL, -17.702132040405235, -63.17426253461941, '["piscina (adultos y ninos)","gimnasio","cancha polifuncional","churrasquera","salon de eventos","parque infantil","seguridad 24h"]'::jsonb, 'founder_gmaps', true, 'https://c21.com.bo/v/resultados/tipo_casa-en-condominio/operacion_venta/en-pais_bolivia/en-municipio_santa-cruz-norte'),
  ('Valle Norte II', 'valle-norte-ii', NULL, -17.70367395247375, -63.16878771148943, '["piscina","club house","áreas verdes","parque infantil","acceso controlado"]'::jsonb, 'founder_gmaps', true, NULL),
  ('Riviera II', 'riviera-ii', NULL, -17.705031918454665, -63.186930516326996, '["piscina (con juegos acuaticos para ninos)","club house","2 canchas de futbol (sintetica y cesped natural)","cancha de tenis","3 parques infantiles","2 salones de eventos (con parrilla y refrigerador)","4 churrasqueras techadas","sala de cine","gimnasio (calistenia al aire libre)","supermercado (Fidalga)","servicio de transporte privado","seguridad 24h"]'::jsonb, 'founder_gmaps', true, 'https://www.infocasas.com.bo/casa-en-alquiler-condominio-la-fontana-riviera-2/190364578'),
  ('Riviera del Remanso I', 'riviera-del-remanso-i', 'Riviera del Remanso', -17.706414720186302, -63.18487513497416, '["piscina (adultos y ninos)","sauna (seco y vapor)","gimnasio","canchas deportivas (tenis, futbol, multicancha)","parque infantil","churrasquera","salon de eventos","areas verdes","seguridad 24h"]'::jsonb, 'founder_gmaps', true, 'https://www.rivieradelremanso.com/'),
  ('Jardines de la Riviera', 'jardines-de-la-riviera', NULL, -17.707668042397987, -63.18665071653461, '["areas verdes","seguridad 24h"]'::jsonb, 'founder_gmaps', true, 'https://www.facebook.com/jardinesdelarivierabolivia/'),
  ('Riviera del Remanso A', 'riviera-del-remanso-a', 'Riviera del Remanso', -17.707696723566272, -63.18467866553561, '["canchas deportivas","zona BBQ","jardin","estacionamiento de visitas","acceso controlado","seguridad 24h"]'::jsonb, 'founder_gmaps', true, 'https://www.buscocasita.com/casa-en-venta-riviera-del-remanso-2_229294.html'),
  ('Riviera del Remanso - Paraíso 1', 'riviera-del-remanso-paraiso-1', 'Riviera del Remanso', -17.70875782961096, -63.18775086872514, '["piscina","salon de eventos","bano de visitas (en area comun)","parque infantil","seguridad 24h"]'::jsonb, 'founder_gmaps', true, 'https://casasenbolivia.com/propiedades-anunciadas/ultimas-2-casas-en-%F0%9D%90%82%F0%9D%90%A8%F0%9D%90%A7%F0%9D%90%9D%F0%9D%90%A8%F0%9D%90%A6%F0%9D%90%A2%F0%9D%90%A7%F0%9D%90%A2%F0%9D%90%A8-%F0%9D%90%91%F0%9D%90%A2%F0%9D%90%AF%F0%9D%90%A2%F0%9D%90%9E/'),
  ('Los Jardines', 'los-jardines', NULL, -17.710370676485613, -63.169240778000756, '["piscina","parque infantil","areas verdes","seguridad 24h"]'::jsonb, 'founder_gmaps', true, NULL),
  ('Florencia', 'florencia', NULL, -17.734816541373334, -63.16475919749163, '["piscina comun","piscina","salón de eventos","sala de juegos","churrasquera","estacionamiento amplio","seguridad 24h","elevadores"]'::jsonb, 'founder_gmaps', true, NULL),
  ('Bosques de la Colina', 'bosques-de-la-colina', NULL, -17.700463, -63.189682, '["club house","piscina comun","sauna","areas verdes","piscina","churrasquera","parque infantil","bicisendas (5 km)","áreas verdes"]'::jsonb, 'centroide', true, NULL),
  ('Paraiso Norte 1', 'paraiso-norte-1', NULL, -17.684315, -63.178615, '["piscina","churrasquera","parque infantil"]'::jsonb, 'centroide', true, NULL),
  ('La Fontana Family Club', 'la-fontana-family-club', 'La Fontana', -17.687905, -63.139767, '["cancha polifuncional","piscina comun","gimnasio","sauna","sala de eventos","areas verdes","piscina semi-olímpica","parque acuático","cancha de tenis","cine (61 butacas)","churrasqueras","salones de eventos","patio gastronómico","supermercado","guardería","consultorio dental","bus privado"]'::jsonb, 'centroide', true, NULL),
  ('Bavaria', 'bavaria', NULL, -17.713225, -63.16507, '["piscina","cancha de futbol","parque infantil","sala de eventos","club house","churrasqueras","parques infantiles","cancha de fútbol","cancha de básquet"]'::jsonb, 'web', false, NULL),
  ('Almería Sumuque', 'almeria-sumuque', NULL, -17.698631, -63.166987, '["piscina comun","cancha polifuncional","parque infantil","club house","piscina","cancha de uso múltiple","salón de eventos","sala de reuniones","seguridad 24h"]'::jsonb, 'web', false, NULL),
  ('Hamburgo Norte', 'hamburgo-norte', NULL, -17.713676, -63.162933, '["piscina comun","parque infantil","seguridad 24h","acceso controlado"]'::jsonb, 'web', false, NULL),
  ('La Hacienda 2', 'la-hacienda-2', NULL, -17.740103, -63.162588, '["piscina climatizada","piscina exterior","tenis","cancha de básquetbol","cancha de fútbol","salón de eventos","sauna","parque infantil","gimnasio","seguridad 24h"]'::jsonb, 'web', false, NULL),
  ('Campo Verde', 'campo-verde', NULL, -17.720973, -63.172546, '["cancha polifuncional","parque infantil","piscina privada (por unidad)","churrasquera","áreas verdes"]'::jsonb, 'web', false, NULL),
  ('Palmeras II', 'palmeras-ii', NULL, -17.697466, -63.176108, '["piscina comun","sala de eventos","gimnasio","areas verdes","piscina (adultos y niños)","club house","churrasquera","parque infantil","zona de mascotas","senderos peatonales"]'::jsonb, 'web', false, NULL),
  ('San Andrés del Norte', 'san-andres-del-norte', NULL, -17.723507, -63.160486, '["churrasquera","seguridad"]'::jsonb, 'web', false, NULL)
;

COMMIT;

-- =============================================================================
-- ROLLBACK (Regla 3 — rename antes de DROP):
--   BEGIN;
--   ALTER TABLE public.condominios_master RENAME TO _trash_condominios_master_260;
--   REVOKE ALL ON public._trash_condominios_master_260 FROM anon, authenticated, claude_readonly;
--   COMMIT;
-- =============================================================================
