-- Migración 132: Asignar microzona y zona a propiedades que caen dentro de polígonos pero nunca fueron asignadas
-- 52 propiedades tienen GPS dentro de un polígono de zonas_geograficas pero microzona IS NULL
-- Excluye "Equipetrol Franja" (zona comercial, no residencial)

-- Paso 1: Asignar microzona desde PostGIS
UPDATE propiedades_v2 p
SET microzona = zg.nombre
FROM zonas_geograficas zg
WHERE p.status = 'completado'
  AND p.tipo_operacion = 'venta'
  AND p.area_total_m2 >= 20
  AND p.duplicado_de IS NULL
  AND p.tipo_propiedad_original NOT IN ('parqueo','baulera')
  AND p.microzona IS NULL
  AND p.latitud IS NOT NULL
  AND p.longitud IS NOT NULL
  AND zg.nombre != 'Equipetrol Franja'
  AND ST_Contains(zg.geom::geometry, ST_SetSRID(ST_MakePoint(p.longitud::float, p.latitud::float), 4326));

-- Paso 2: Asignar zona display desde microzona (mismo mapeo que migración 131)
UPDATE propiedades_v2 SET zona = 'Equipetrol Centro'
WHERE microzona = 'Equipetrol' AND zona IS DISTINCT FROM 'Equipetrol Centro';

UPDATE propiedades_v2 SET zona = 'Sirari'
WHERE microzona = 'Sirari' AND zona IS DISTINCT FROM 'Sirari';

UPDATE propiedades_v2 SET zona = 'Equipetrol Oeste'
WHERE microzona = 'Faremafu' AND zona IS DISTINCT FROM 'Equipetrol Oeste';

UPDATE propiedades_v2 SET zona = 'Equipetrol Norte'
WHERE microzona IN ('Equipetrol Norte/Norte', 'Equipetrol Norte/Sur') AND zona IS DISTINCT FROM 'Equipetrol Norte';

UPDATE propiedades_v2 SET zona = 'Villa Brígida'
WHERE microzona = 'Villa Brigida' AND zona IS DISTINCT FROM 'Villa Brígida';
