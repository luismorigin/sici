-- =============================================================================
-- 🔴🔴🔴  ANULADO — NO APLICAR. El fundamento de este UPDATE era FALSO.  🔴🔴🔴
-- =============================================================================
-- Escrito el 22-ago-2026 para sacar la 8001019 por estar "en zona Este". Al correr
-- el barrido de verificacion sobre OTRAS propiedades, el fundamento se cayo:
--
--   El JSON de C21 tiene DOS campos distintos y se leyo el equivocado:
--     municipio    = "Este"        -> DISTRITO MUNICIPAL de la ciudad
--     a2Municipio  = "Equipetrol"  -> el BARRIO
--
--   Medido en props que SABEMOS que estan en Equipetrol:
--     Sky Lumiere (Eq. Norte)  -> municipio "Oeste" · a2Municipio "Equipetrol"
--     Las Begonias (Sirari)    -> municipio "Este"  · a2Municipio "Equipetrol"
--     8001019 (el caso)        -> municipio "Este"  · a2Municipio "Equipetrol"
--
-- El "Este" del titulo es el DISTRITO, no el barrio. El campo de barrio dice
-- Equipetrol, y el GPS tambien (get_zona_by_gps -> Equipetrol Centro, 400 m del
-- centro). NO hay evidencia de que este fuera de cobertura.
--
-- Aplicar esto habria sacado del feed una propiedad LEGITIMA, y los candados sobre
-- `zona` y `es_activa` habrian hecho que nadie la volviera a mirar.
--
-- LO QUE SI QUEDA EN PIE: su precio es atipico — 1.800 Bs por 87 m2 y 3 dorms =
-- 20,6 Bs/m2 contra una mediana de 90,6. Puede ser un error de carga del captador
-- o un depto genuinamente modesto, pero es una pregunta de PRECIO, no de zona.
--
-- Se conserva como registro de que se evaluo y por que NO se hizo.
-- =============================================================================

-- =============================================================================
-- FIX 22-ago-2026 · id 8001019 — fuera de cobertura (zona Este), no es Equipetrol
-- =============================================================================
-- QUÉ PASA
-- Un aviso de la zona **Este** entró al inventario de Equipetrol y quedó fijando
-- el PISO del panorama de alquiler: el bot abre diciendo "de 1.800 a 23.152 Bs"
-- cuando la segunda más barata está en **2.600**. 800 Bs por debajo de cualquier
-- cosa que pueda mostrar después.
--
-- Lo reportó lab-kapso con una conversación real (22-ago 08:43): el bot le dijo a
-- un cliente de presupuesto corto que "los monoambientes arrancan desde 1.800",
-- y esta propiedad **tiene 3 dormitorios y 87 m²**. El cliente no volvió a escribir.
-- (Nota para el prompt de ellos: el piso de monoambientes ya es correcto —
--  `resumen_mercado('alquiler', p_dorms=>0)` devuelve 2.600. El bot tomó el
--  `desde` del panorama GENERAL y se lo atribuyó a los monoambientes.)
--
-- EVIDENCIA — verificada contra el portal, no contra el reporte:
--   entity.direccionFormat = "CONDOMINIO ESTRELLA DEL ESTE DEPARTAMENTO 4 PISO 5,
--                             Este, Santa Cruz, Bolivia"
--   propiedad.title        = "Alquiler de Departamento en Este, Santa Cruz | ID: 119377"
--   precio 1.800 Bs / 87,42 m² = **20,6 Bs/m²** contra una mediana de **90,6**
--
-- 🔑 LA CAUSA NO ES UNA MALA ZONIFICACIÓN: es el PIN.
-- `get_zona_by_gps(-17.76725030, -63.19415400)` devuelve **Equipetrol Centro**, a
-- 400 m del centro de Equipetrol. O sea la zona guardada es COHERENTE con el GPS
-- — el que miente es el GPS que puso C21. Por eso ningún chequeo de "zona vs GPS"
-- lo detecta (medido: solo 5 de 1.135 activas discrepan, y esta no es una de ellas).
--
-- =============================================================================
-- 🔴 POR QUÉ **NO** SE TOCA LA ZONA (y sí `es_activa`)
-- =============================================================================
-- El discovery arma su lista de "nuevas" comparando las URLs del portal contra las
-- de la base **filtradas por la zona de la macrozona**. Con `zona = NULL` esta URL
-- sale del diff, el crawl de esa misma noche la ve como nueva, la escribe con **id
-- nuevo y `es_activa = true`**, y vuelve al feed: el arreglo se deshace solo y sin
-- dejar rastro. **La zona miente, pero es la llave.**
-- Caso de origen: 8000566 "Plaza Libertad" (14-ago) → memoria
-- `project_fuera_de_cobertura_zona_es_la_llave`.
--
-- El feed la excluye por `es_activa`, que es lo que filtran las vistas.
-- Se bloquean `zona` y `es_activa` en `campos_bloqueados` con la razón escrita,
-- para que nadie "limpie" la zona más adelante creyendo que es un error.
-- ⚠️ El candado va en formato OBJETO con `bloqueado: true` — un string NO protege
-- y no avisa (memoria `feedback_candado_formato_objeto`).
--
-- El GPS NO se corrige acá: no sabemos la ubicación real, solo que no es esta.
-- Corregirlo a ojo sería cambiar un dato falso por otro.
-- =============================================================================

BEGIN;

UPDATE propiedades_v2
SET es_activa        = false,
    es_para_matching = false,
    razon_inactiva   = 'fuera de cobertura: aviso de zona Este, no Equipetrol (verificado en portal 22-ago-2026)',
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || jsonb_build_object(
      'zona', jsonb_build_object(
        'bloqueado',      true,
        'por',            'founder',
        'fecha',          '2026-08-22',
        'valor_original', 'Equipetrol Centro',
        'razon',          'NO ANULAR. La zona esta equivocada (el aviso es de zona Este) pero es la LLAVE del diff del discovery: con zona NULL la URL sale del diff y el crawl la recaptura como nueva esa misma noche, con id nuevo y es_activa=true. Se excluye por es_activa.'
      ),
      'es_activa', jsonb_build_object(
        'bloqueado',      true,
        'por',            'founder',
        'fecha',          '2026-08-22',
        'valor_original', true,
        'razon',          'Fuera de la macrozona Equipetrol. Portal: "CONDOMINIO ESTRELLA DEL ESTE ..., Este, Santa Cruz". El pin de C21 la ubico en Equipetrol Centro y de ahi salio la zona. Fijaba el piso del panorama del bot en 1.800 Bs cuando el real es 2.600.'
      )
    ),
    datos_json = jsonb_set(
      COALESCE(datos_json, '{}'::jsonb),
      '{trazabilidad,fuera_de_cobertura}',
      jsonb_build_object(
        'fecha',     '2026-08-22',
        'motivo',    'zona Este segun el portal; el GPS de C21 la ubica en Equipetrol Centro',
        'evidencia', 'entity.direccionFormat = "CONDOMINIO ESTRELLA DEL ESTE DEPARTAMENTO 4 PISO 5, Este, Santa Cruz, Bolivia" | title = "Alquiler de Departamento en Este, Santa Cruz | ID: 119377"',
        'senal',     '1800 Bs / 87,42 m2 = 20,6 Bs/m2 contra mediana 90,6 del inventario de alquiler',
        'reporto',   'lab-kapso'
      ),
      true
    )
WHERE id = 8001019;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN — correr DESPUÉS
-- =============================================================================
-- 1) Sale del feed (debe dar 0 filas):
--   SELECT id FROM v_mercado_alquiler_shadow WHERE id = 8001019;
--
-- 2) El piso del panorama deja de mentir (debe pasar de 1800 a 2600):
--   SELECT (resumen_mercado('alquiler')->'general'->>'desde')::int AS piso,
--          (resumen_mercado('alquiler')->'general'->>'total')::int AS total;
--
-- 3) 🔑 La zona SIGUE escrita (si esto da NULL, el discovery la recaptura esta noche):
--   SELECT id, zona, es_activa, razon_inactiva IS NOT NULL AS tiene_razon,
--          campos_bloqueados->'zona'->>'bloqueado'      AS zona_bloqueada,
--          campos_bloqueados->'es_activa'->>'bloqueado' AS activa_bloqueada
--     FROM propiedades_v2 WHERE id = 8001019;
--   -- esperado: zona='Equipetrol Centro' · es_activa=false · los dos candados en true
--
-- 4) A la mañana siguiente, que NO haya vuelto con id nuevo:
--   SELECT id, zona, es_activa, fecha_creacion FROM propiedades_v2
--    WHERE url = 'https://c21.com.bo/propiedad/119377_amplio-y-economico-departamento-en-alquiler';
--   -- esperado: UNA sola fila, la 8001019, con es_activa=false
-- =============================================================================
