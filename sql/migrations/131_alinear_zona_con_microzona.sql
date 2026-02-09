-- Migración 131: Alinear columna zona con microzona (fuente de verdad por GPS)
-- La columna microzona fue asignada por PostGIS y está 100% validada contra zonas_geograficas.
-- La columna zona tenía valores inconsistentes del pipeline original.
--
-- Mapeo canónico (FilterBarPremium):
--   microzona "Equipetrol"           → zona "Equipetrol Centro"
--   microzona "Sirari"               → zona "Sirari"
--   microzona "Faremafu"             → zona "Equipetrol Oeste"
--   microzona "Equipetrol Norte/Norte" → zona "Equipetrol Norte"
--   microzona "Equipetrol Norte/Sur"   → zona "Equipetrol Norte"
--   microzona "Villa Brigida"        → zona "Villa Brígida"

-- Corregir zona basándose en microzona
UPDATE propiedades_v2 SET zona = 'Equipetrol Centro' WHERE microzona = 'Equipetrol' AND zona IS DISTINCT FROM 'Equipetrol Centro';
UPDATE propiedades_v2 SET zona = 'Sirari' WHERE microzona = 'Sirari' AND zona IS DISTINCT FROM 'Sirari';
UPDATE propiedades_v2 SET zona = 'Equipetrol Oeste' WHERE microzona = 'Faremafu' AND zona IS DISTINCT FROM 'Equipetrol Oeste';
UPDATE propiedades_v2 SET zona = 'Equipetrol Norte' WHERE microzona IN ('Equipetrol Norte/Norte', 'Equipetrol Norte/Sur') AND zona IS DISTINCT FROM 'Equipetrol Norte';
UPDATE propiedades_v2 SET zona = 'Villa Brígida' WHERE microzona = 'Villa Brigida' AND zona IS DISTINCT FROM 'Villa Brígida';

-- Verificación
SELECT microzona, zona, COUNT(*) as total
FROM propiedades_v2
WHERE microzona IS NOT NULL
GROUP BY microzona, zona
ORDER BY microzona, zona;
