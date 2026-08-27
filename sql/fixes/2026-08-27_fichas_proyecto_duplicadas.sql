-- =============================================================================
-- 27-ago-2026 · fichas de proyecto duplicadas — se DESACTIVAN, no se borran
-- ✅ APLICADO. Y de las 9, SIETE YA ESTABAN INACTIVAS: sólo hubo que desactivar
--    pm 32 (Brickell 8) y pm 520 (Torre Sirari). El dato estaba a la vista y no lo
--    crucé: al verificar el fuzzy vi "7 proyectos inactivos" y no me di cuenta de
--    que eran exactamente éstas.
-- =============================================================================
-- QUÉ SON. Buscando "alias intrusos" (el patrón de la mig 342) aparecieron 12 alias
-- que sí son el nombre oficial de otro proyecto — pero ese otro tiene **cero
-- propiedades**. No son alias robados: son 9 fichas duplicadas del mismo edificio,
-- creadas en algún momento y nunca usadas.
--
--   pm 4   "Mare"                  ← el edificio vive en pm 65  Condominio Maré (32 props)
--   pm 20  "Euro Design Le Blanc"  ← pm 112 Eurodesign Le Blanc (3)
--   pm 32  "Brickell 8"            ← pm 560 Brickell 8 Norte (4)
--   pm 44  "Klug"                  ← pm 61  Edificio Klug (4)
--   pm 303 "Edificio Element"      ← pm 74  Element by Elite (7)
--   pm 451 "Edificio Lucitano"     ← pm 381 Cond. Ecosostenible Lusitano (3)
--   pm 484 "Condominio Atlantis"   ← pm 411 ATLANTIS TOWERS (4)
--   pm 520 "Torre Sirari"          ← pm 138 Edificio Sirari (1 prop, inactiva)
--   pm 556 "Edificio Isuto by One" ← pm 262 ONE ISUTO (6)
--
-- 🔴 EL RIESGO NO ES EL QUE PARECE. Hoy no rompen nada: como están vacías, ninguna
-- propiedad las usa. Lo que puede pasar es que `buscar_proyecto_fuzzy()` devuelva la
-- ficha VACÍA en lugar de la que tiene el inventario —compiten por el mismo nombre,
-- y la vacía suele ganar porque su `nombre_oficial` coincide EXACTO con lo que
-- escribe el captador— y una propiedad nueva quede sola en un proyecto fantasma.
--
-- -----------------------------------------------------------------------------
-- POR QUÉ `activo = false` Y NO UN DELETE
--
--   · **8 tablas tienen FK** a `id_proyecto_master`: matching_sugerencias (×2),
--     propiedades, propiedades_broker, proyectos, proyectos_pendientes_enriquecimiento,
--     proyectos_pendientes_google, sin_match_exportados. Un DELETE puede fallar o,
--     peor, arrastrar filas.
--   · **El fuzzy YA filtra por `activo`** (verificado en su definición), así que
--     desactivar alcanza para que deje de proponerlas.
--   · Es **reversible con un UPDATE** y no toca una sola propiedad.
--   · El mecanismo ya se usa: hay 7 proyectos inactivos de antes.
--
-- 🔑 Se conserva la ficha entera: GPS, alias, amenidades y su historia quedan. Sólo
-- deja de competir en el matcher.
-- =============================================================================


-- ── FOTO PREVIA ─────────────────────────────────────────────────────────────
SELECT id_proyecto_master, nombre_oficial, activo, zona,
       (SELECT count(*) FROM propiedades_v2 x WHERE x.id_proyecto_master = pm.id_proyecto_master) AS props_totales,
       (SELECT count(*) FROM propiedades_v2 x WHERE x.id_proyecto_master = pm.id_proyecto_master AND x.es_activa) AS props_activas
FROM proyectos_master pm
WHERE id_proyecto_master IN (4,20,32,44,303,451,484,520,556)
ORDER BY id_proyecto_master;
-- Esperado: las 9 con activo=true y props_activas=0. La 520 tiene 1 prop TOTAL
-- (id 1917, inactiva por aviso_terminado) — por eso entra igual.


-- =============================================================================
-- PASO 1 · RESCATAR lo que la ficha buena no tiene (antes de desactivar)
-- =============================================================================
BEGIN;

-- pm 303 → pm 74 · Element by Elite NO tiene ninguna amenidad y la duplicada tiene 6,
-- todas del vocabulario mayoritario. Ganancia limpia.
UPDATE proyectos_master SET amenidades_edificio = (
    SELECT amenidades_edificio FROM proyectos_master WHERE id_proyecto_master = 303)
WHERE id_proyecto_master = 74
  AND coalesce(jsonb_array_length(amenidades_edificio), 0) = 0;

-- pm 4 → pm 65 · el alias "Mare Equipetrol" no está en Condominio Maré
UPDATE proyectos_master p SET alias_conocidos = array_append(coalesce(alias_conocidos, ARRAY[]::text[]), 'Mare Equipetrol')
WHERE p.id_proyecto_master = 65
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.alias_conocidos,ARRAY[]::text[])) a WHERE lower(btrim(a))='mare equipetrol')
  AND NOT EXISTS (SELECT 1 FROM proyectos_master o WHERE lower(btrim(o.nombre_oficial))='mare equipetrol' AND o.id_proyecto_master<>65);

-- pm 520 → pm 138 · el plural "Torres Sirari" no está en Edificio Sirari
UPDATE proyectos_master p SET alias_conocidos = array_append(coalesce(alias_conocidos, ARRAY[]::text[]), 'Torres Sirari')
WHERE p.id_proyecto_master = 138
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.alias_conocidos,ARRAY[]::text[])) a WHERE lower(btrim(a))='torres sirari')
  AND NOT EXISTS (SELECT 1 FROM proyectos_master o WHERE lower(btrim(o.nombre_oficial))='torres sirari' AND o.id_proyecto_master<>138);

-- ⚠️ pm 20 → pm 112 · NO SE COPIAN LAS AMENIDADES, A PROPÓSITO.
-- La duplicada tiene 15 y la buena 12, pero las 6 que agregaría usan las variantes
-- MINORITARIAS de un vocabulario que no está normalizado: "Cowork" (5 proyectos)
-- contra "Co-working" (43) · "Rooftop" (1) y "Roof garden/Terraza común" (4) contra
-- "Roof garden" (6) · "Sala TV/Cine" (11) contra "Cine" (2). Copiarlas propaga el
-- desorden en vez de sumar información.
-- Las únicas realmente ausentes en la buena son "Recepción" y "Área Social"; si se
-- quieren, se agregan a mano con la grafía mayoritaria. Ver el backlog de
-- normalización de amenidades.

COMMIT;


-- =============================================================================
-- PASO 2 · DESACTIVAR las 9 duplicadas
-- =============================================================================
BEGIN;

UPDATE proyectos_master
   SET activo = false
 WHERE id_proyecto_master IN (4, 20, 32, 44, 303, 451, 484, 520, 556)
   AND activo IS DISTINCT FROM false
   -- Candado: si alguna tuviera propiedades ACTIVAS, no es una ficha vacía y no se
   -- toca. Hoy ninguna las tiene; el filtro va por si esto se corre más tarde.
   AND NOT EXISTS (SELECT 1 FROM propiedades_v2 x
                    WHERE x.id_proyecto_master = proyectos_master.id_proyecto_master
                      AND x.es_activa);

-- 🔴 CONTAR: fueron 2 filas (pm 32 y 520). Las otras 7 ya estaban inactivas, así
--    que sus UPDATE tocan 0 y eso es correcto, no un fallo.
COMMIT;


-- ── VERIFICACIÓN ────────────────────────────────────────────────────────────
-- a) Las 9 inactivas (y los 7 que ya estaban → total 16):
--    SELECT count(*) FROM proyectos_master WHERE activo IS FALSE;
--
-- b) El fuzzy ya no las propone. Antes devolvía la ficha vacía; ahora la buena:
--    SELECT * FROM buscar_proyecto_fuzzy('Klug', 0.3, 5);
--    SELECT * FROM buscar_proyecto_fuzzy('Mare', 0.3, 5);
--    SELECT * FROM buscar_proyecto_fuzzy('Edificio Element', 0.3, 5);
--
-- c) Ninguna propiedad quedó huérfana (debe dar 0):
--    SELECT count(*) FROM propiedades_v2 p
--     WHERE p.id_proyecto_master IN (4,20,32,44,303,451,484,520,556) AND p.es_activa;
--
-- d) Element by Elite ya tiene sus 6 amenidades:
--    SELECT nombre_oficial, amenidades_edificio FROM proyectos_master WHERE id_proyecto_master = 74;


-- ── CÓMO VOLVER ATRÁS ───────────────────────────────────────────────────────
-- UPDATE proyectos_master SET activo = true
--  WHERE id_proyecto_master IN (4,20,32,44,303,451,484,520,556);
-- (los alias y amenidades del paso 1 se pueden dejar: son ganancia, no dependen de esto)


-- =============================================================================
-- RESULTADO — verificado contra el MATCHER, no contra el UPDATE
-- =============================================================================
-- Que el UPDATE se aplique no prueba que el problema se resolvió. Lo que lo prueba
-- es que el fuzzy devuelva el edificio real:
--
--   "Brickell 8"        → 560 Brickell 8 Norte    (1.00)
--   "Torre Sirari"      → 138 Edificio Sirari     (1.00)
--   "Klug"              →  61 Edificio Klug       (1.00)
--   "Mare"              →  65 Condominio Maré     (1.00)
--   "Edificio Element"  →  74 Element by Elite    (1.00)
--
-- Ninguna ficha vacía aparece. Antes, un aviso que dijera "Klug" a secas podía
-- terminar en el pm 44 —cero propiedades— y quedar aislado de su edificio.
-- =============================================================================
