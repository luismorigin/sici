-- Agregar 6 condominios nuevos a condominios_master — 20-jun-2026
-- GPS verificado por el founder (Google Maps). Cerrado + amenidades por verificación web (3 agentes).
-- Pendientes (NO incluidos): El Valle (founder no confirma), Leonardo/Cantabria/Moliere (sin evidencia web, a confirmar).
-- id_condominio_master es serial → NO se especifica (la secuencia asigna 40-45).
BEGIN;

INSERT INTO condominios_master
  (nombre_oficial, alias_conocidos, slug, latitud, longitud, radio_metros,
   zona_general, amenidades_comunes, gps_fuente, gps_verificado, activo, notas)
VALUES
 ('Eivissa', ARRAY['Condominio Eivissa']::text[], 'eivissa',
   -17.714793656437482, -63.174316559578315, 250, 'Zona Norte',
   jsonb_build_array('piscina','piscina para niños','jacuzzi','sauna seco','sauna a vapor',
     'gimnasio','salón de eventos','churrasquera','juegos infantiles','áreas verdes',
     'seguridad 24h','parqueo de visitas'),
   'founder_gmaps', true, true, 'web alta confianza 20-jun; ~22 casas + torre deptos'),

 ('Ciudad Jardín', ARRAY['Condominio Ciudad Jardin']::text[], 'ciudad-jardin',
   -17.731180665505256, -63.17193540741571, 250, 'Zona Norte',
   jsonb_build_array('piscina','churrasquera','parque infantil','gimnasio','club house',
     'salón de eventos','cancha polifuncional','cancha de fútbol','áreas verdes','seguridad 24h'),
   'founder_gmaps', true, true, 'web alta confianza 20-jun; Av. Banzer 6to anillo frente UCEBOL'),

 ('Millenium', ARRAY['Milenium']::text[], 'millenium',
   -17.722271899150012, -63.17246475201148, 250, 'Zona Norte',
   jsonb_build_array('piscina','churrasquera','cancha deportiva','parque infantil',
     'áreas verdes','seguridad 24h'),
   'founder_gmaps', true, true, 'web alta confianza 20-jun; Av. Banzer 7mo anillo'),

 ('Los Mangos', ARRAY['Club Privado Los Mangos']::text[], 'los-mangos',
   -17.72094851186603, -63.1665308605909, 250, 'Zona Norte',
   jsonb_build_array('seguridad 24h','acceso controlado','juegos infantiles'),
   'founder_gmaps', true, true, 'web alta confianza 20-jun; cerrado, amenidades comunes a completar'),

 ('La Arboleda', ARRAY[]::text[], 'la-arboleda',
   -17.71203180909994, -63.16860261933756, 250, 'Zona Norte',
   jsonb_build_array('acceso controlado','churrasquera'),
   'founder_gmaps', true, true, 'web 20-jun cerrado; amenidades comunes no confirmadas (churrasquera privada)'),

 ('La Hacienda III', ARRAY['La Hacienda 3','Hacienda III']::text[], 'la-hacienda-iii',
   -17.723960422535903, -63.167618513963966, 250, 'Zona Norte',
   jsonb_build_array('acceso controlado','seguridad'),
   'founder_gmaps', true, true, 'founder confirma cerrada 20-jun; distinta de La Hacienda 2; amenidades a completar');

-- Verificación
SELECT id_condominio_master AS id, nombre_oficial, zona_general, gps_verificado,
   jsonb_array_length(amenidades_comunes) AS n_amenidades
FROM condominios_master
WHERE nombre_oficial IN ('Eivissa','Ciudad Jardín','Millenium','Los Mangos','La Arboleda','La Hacienda III')
ORDER BY id_condominio_master;

SELECT COUNT(*) AS total_condominios FROM condominios_master;  -- esperado: 45

ROLLBACK;  -- cambiar a COMMIT para aplicar
