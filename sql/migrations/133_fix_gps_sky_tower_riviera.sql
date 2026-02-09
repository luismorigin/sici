-- Migración 133: Fix GPS Sky Tower + asignar zona La Riviera
-- Sky Tower (ID 480): GPS incorrecto, corregir al del proyecto (Google Maps verificado)
-- La Riviera (ID 317): a 2m del borde de Sirari, asignar manualmente

-- Fix 1: Corregir GPS de Sky Tower propiedad 480
UPDATE propiedades_v2
SET latitud = '-17.7713106', longitud = '-63.1910865'
WHERE id = 480;

-- Fix 2: Asignar microzona a Sky Tower (ahora con GPS correcto, verificar polígono)
-- El GPS corregido cae en Equipetrol (polígono principal)
UPDATE propiedades_v2
SET microzona = subq.nombre
FROM (
  SELECT zg.nombre
  FROM zonas_geograficas zg
  WHERE zg.nombre != 'Equipetrol Franja'
    AND ST_Contains(zg.geom::geometry, ST_SetSRID(ST_MakePoint(-63.1910865, -17.7713106), 4326))
  LIMIT 1
) subq
WHERE id = 480;

-- Fix 3: La Riviera (ID 317) — a 2 metros de Sirari, asignar manualmente
UPDATE propiedades_v2
SET microzona = 'Sirari', zona = 'Sirari'
WHERE id = 317;

-- Fix 4: Asignar zona display a Sky Tower basado en microzona
UPDATE propiedades_v2 SET zona = 'Equipetrol Centro'
WHERE id = 480 AND microzona = 'Equipetrol';

UPDATE propiedades_v2 SET zona = 'Equipetrol Oeste'
WHERE id = 480 AND microzona = 'Faremafu';

UPDATE propiedades_v2 SET zona = 'Equipetrol Norte'
WHERE id = 480 AND microzona IN ('Equipetrol Norte/Norte', 'Equipetrol Norte/Sur');
