-- =============================================================================
-- 23-ago-2026 · id 8001019 — corregir la RAZÓN de la baja (la baja está bien)
-- =============================================================================
-- La propiedad está correctamente fuera del feed, pero la razón escrita es FALSA
-- y eso es peligroso: dentro de tres meses alguien la lee, la verifica, descubre
-- que "Este" era el distrito municipal y no el barrio, y revierte una baja que
-- está bien puesta.
--
-- HOY dice:  "fuera de cobertura: aviso de zona Este, no Equipetrol"
--            → El "Este" del título de C21 es el DISTRITO de la ciudad, no el
--              barrio. Sky Lumiere (Eq. Norte) y Las Begonias (Sirari) dicen lo
--              mismo y están en Equipetrol. Ese campo no prueba nada.
--
-- EL MOTIVO REAL, verificado por el founder ubicando el condominio:
--   Condominio Estrella del Este I  : -17.760662, -63.070132
--   pin que trajo C21               : -17.767250, -63.194154
--   distancia                       : **13,17 km**
--   get_zona_by_gps sobre las coordenadas reales → NULL = fuera de cobertura
--
-- 🔑 Lo que la delató NO fue ningún campo del portal: fue ubicar el edificio.
-- El pin decía Equipetrol Centro (400 m del centro) y el campo de barrio decía
-- "Equipetrol". Las dos señales del portal apuntaban al lugar equivocado.
--
-- NO se toca `zona` (sigue siendo la llave del diff del discovery) ni `es_activa`
-- ni los candados: sólo el texto de la razón y el rastro en datos_json.
-- =============================================================================

BEGIN;

UPDATE propiedades_v2
SET razon_inactiva = 'fuera de cobertura: el condominio esta a 13,17 km (GPS del portal errado)',
    campos_bloqueados = jsonb_set(
      campos_bloqueados,
      '{es_activa,razon}',
      to_jsonb('Fuera de la macrozona Equipetrol. El founder ubico el Condominio Estrella del Este I/II a -17.760662,-63.070132: a 13,17 km del pin que trajo C21, y get_zona_by_gps sobre las coordenadas reales devuelve NULL (fuera de cobertura). El pin del portal la ubicaba en Equipetrol Centro. Fijaba el piso del panorama del bot en 1.800 Bs cuando el real es 2.600.'::text),
      true
    ),
    datos_json = jsonb_set(
      datos_json,
      '{trazabilidad,fuera_de_cobertura}',
      jsonb_build_object(
        'fecha',     '2026-08-22',
        'motivo',    'el condominio esta a 13,17 km del pin; get_zona_by_gps sobre las coordenadas reales = NULL',
        'evidencia', 'Condominio Estrella del Este I -17.760662,-63.070132 (ubicado por el founder) vs pin del portal -17.767250,-63.194154',
        'ojo',       'La razon anterior decia "zona Este" y era FALSA: el "Este" del titulo de C21 es el DISTRITO municipal, no el barrio. Sky Lumiere (Eq. Norte) y Las Begonias (Sirari) dicen lo mismo y SI estan en Equipetrol.',
        'reporto',   'lab-kapso'
      ),
      true
    )
WHERE id = 8001019;

COMMIT;

-- ── VERIFICACIÓN ────────────────────────────────────────────────────────────
--   SELECT id, zona, es_activa, razon_inactiva,
--          campos_bloqueados->'zona'->>'bloqueado'      AS zona_bloq,
--          campos_bloqueados->'es_activa'->>'bloqueado' AS activa_bloq,
--          datos_json->'trazabilidad'->'fuera_de_cobertura'->>'motivo' AS motivo
--     FROM propiedades_v2 WHERE id = 8001019;
--   -- esperado: zona='Equipetrol Centro' (intacta) · es_activa=false
--   --           los dos candados en true · la razón hablando de los 13,17 km
