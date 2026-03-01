-- Migración 171: Revertir propiedades_v2.zona a nombres crudos (= microzona = zonas_geograficas.nombre)
--
-- La migración 131 normalizó zona a nombres display (Equipetrol Centro, Equipetrol Oeste, etc.)
-- pero proyectos_master.zona usa nombres crudos (Equipetrol, Faremafu, etc.).
-- Esto rompió silenciosamente el matching GPS/fuzzy: p.zona = pm.zona siempre fallaba
-- excepto para Sirari (único nombre idéntico en ambos sistemas).
--
-- Fix: zona = microzona (que ya tiene nombres crudos de PostGIS).
-- Para las 8 props con zona pero sin microzona, derivar ambas desde PostGIS.
--
-- Afecta: ~361 propiedades de venta (353 mismatch + 8 sin microzona)
-- NO afecta: 67 donde zona = microzona (Sirari), 232 sin zona (migración 172)
--
-- Verificación pre-ejecución:
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE tipo_operacion = 'venta' AND duplicado_de IS NULL
--   AND zona IS NOT NULL AND microzona IS NOT NULL AND zona != microzona;
-- Esperado: 353

-- PASO 1: Las 353 con microzona existente → zona = microzona
UPDATE propiedades_v2
SET zona = microzona
WHERE tipo_operacion = 'venta'
  AND duplicado_de IS NULL
  AND zona IS NOT NULL
  AND microzona IS NOT NULL
  AND zona != microzona
  AND NOT campo_esta_bloqueado(campos_bloqueados, 'zona');

-- PASO 2: Las 8 con zona='Equipetrol Centro' pero microzona NULL → PostGIS
UPDATE propiedades_v2 p
SET
  microzona = zg.nombre,
  zona = zg.nombre
FROM zonas_geograficas zg
WHERE p.tipo_operacion = 'venta'
  AND p.duplicado_de IS NULL
  AND p.zona IS NOT NULL
  AND p.microzona IS NULL
  AND p.latitud IS NOT NULL
  AND ST_Contains(zg.geom, ST_SetSRID(ST_Point(p.longitud::float, p.latitud::float), 4326))
  AND zg.activo = TRUE
  AND NOT campo_esta_bloqueado(p.campos_bloqueados, 'zona');

-- Verificación post-ejecución:
-- SELECT zona, COUNT(*) FROM propiedades_v2
-- WHERE tipo_operacion = 'venta' AND duplicado_de IS NULL AND zona IS NOT NULL
-- GROUP BY zona ORDER BY COUNT(*) DESC;
-- Esperado: Equipetrol(~207), Sirari(~67), Villa Brigida(~66), Faremafu(~49),
--           Equipetrol Norte/Norte(~25), Equipetrol Norte/Sur(~13), Equipetrol Franja(~1)
--           CERO "Equipetrol Centro", "Equipetrol Oeste", "Villa Brígida"
--
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE tipo_operacion = 'venta' AND duplicado_de IS NULL
--   AND zona IS NOT NULL AND microzona IS NOT NULL AND zona != microzona;
-- Esperado: 0
