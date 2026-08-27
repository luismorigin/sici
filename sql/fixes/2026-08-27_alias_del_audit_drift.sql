-- =============================================================================
-- 27-ago-2026 · Alias que el audit de drift encontró, y por qué son sólo 5
-- =============================================================================
-- El audit marcó 34 casos de "matching sospechoso" (el nombre guardado no aparece
-- en el texto del aviso). Los jueces los revisaron uno por uno: **ninguno era un
-- match equivocado.** Todos eran variantes de escritura del captador.
--
-- De los 8 alias que salieron de ahí, 3 YA ESTABAN registrados:
--     "SKY Eclypse"        → pm 30  Sky Eclipse
--     "Torre Platinium I"  → pm 71  Edificio PLATINUM
--     "Torre Platinium II" → pm 25  Platinum II
--
-- ⚠️ Y 3 de los 8 apuntaban a un nombre que NO es el oficial. Los jueces llaman
-- "canónico" al nombre comercial, que no siempre es el de `proyectos_master`:
--     "Sky Design" es en realidad  → "Edif. SKY DESIGN - SKY Properties" (pm 142)
--     "Platinum 1"                 → "Edificio PLATINUM" (pm 71)
--     "Platinum 2"                 → "Platinum II" (pm 25)
-- Agregarlos por nombre sin resolver el pm habría fallado o, peor, creado la ficha
-- equivocada.
--
-- -----------------------------------------------------------------------------
-- 🔴 EL CANDADO DEL INTRUSO VA EN EL PROPIO UPDATE
--
-- La mig 342 destapó el patrón: un proyecto con el **nombre oficial de otro** como
-- alias. Cuando dos edificios distintos empatan en 1.0, el desempate decide por
-- criterios que nada tienen que ver con cuál es. Los dos casos que esa migración
-- nombró (Uptown NUU en el pm 35, Santorini Suites en el pm 221) **ya están
-- corregidos** — verificado hoy.
--
-- Para que esto no los reponga, cada UPDATE exige las dos condiciones:
--   1. que el alias no esté ya en la lista (idempotente: se puede correr dos veces)
--   2. que el alias NO sea el nombre oficial de ningún otro proyecto
-- Si alguna falla, ese UPDATE toca 0 filas en silencio y los demás siguen.
-- =============================================================================

BEGIN;

-- "SKY DESING" · typo del captador en el título del aviso (caso 2732)
UPDATE proyectos_master p SET alias_conocidos = array_append(coalesce(alias_conocidos, ARRAY[]::text[]), 'SKY DESING')
WHERE p.id_proyecto_master = 142
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.alias_conocidos,ARRAY[]::text[])) a WHERE lower(btrim(a))='sky desing')
  AND NOT EXISTS (SELECT 1 FROM proyectos_master o WHERE lower(btrim(o.nombre_oficial))='sky desing' AND o.id_proyecto_master<>142);

-- "CONDOMINIO NANO-TEC" · con guion, como lo escribe el captador (casos 2589, 3729)
UPDATE proyectos_master p SET alias_conocidos = array_append(coalesce(alias_conocidos, ARRAY[]::text[]), 'CONDOMINIO NANO-TEC')
WHERE p.id_proyecto_master = 129
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.alias_conocidos,ARRAY[]::text[])) a WHERE lower(btrim(a))='condominio nano-tec')
  AND NOT EXISTS (SELECT 1 FROM proyectos_master o WHERE lower(btrim(o.nombre_oficial))='condominio nano-tec' AND o.id_proyecto_master<>129);

-- "Edificio Eurodesign" · variante corta (caso 3718)
UPDATE proyectos_master p SET alias_conocidos = array_append(coalesce(alias_conocidos, ARRAY[]::text[]), 'Edificio Eurodesign')
WHERE p.id_proyecto_master = 297
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.alias_conocidos,ARRAY[]::text[])) a WHERE lower(btrim(a))='edificio eurodesign')
  AND NOT EXISTS (SELECT 1 FROM proyectos_master o WHERE lower(btrim(o.nombre_oficial))='edificio eurodesign' AND o.id_proyecto_master<>297);

-- "Euro Nordic" · separado en dos palabras (caso 3572)
UPDATE proyectos_master p SET alias_conocidos = array_append(coalesce(alias_conocidos, ARRAY[]::text[]), 'Euro Nordic')
WHERE p.id_proyecto_master = 336
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.alias_conocidos,ARRAY[]::text[])) a WHERE lower(btrim(a))='euro nordic')
  AND NOT EXISTS (SELECT 1 FROM proyectos_master o WHERE lower(btrim(o.nombre_oficial))='euro nordic' AND o.id_proyecto_master<>336);

-- "Ónix" · con tilde y sin el sufijo comercial (caso 8000689)
UPDATE proyectos_master p SET alias_conocidos = array_append(coalesce(alias_conocidos, ARRAY[]::text[]), 'Ónix')
WHERE p.id_proyecto_master = 45
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.alias_conocidos,ARRAY[]::text[])) a WHERE lower(btrim(a))='ónix')
  AND NOT EXISTS (SELECT 1 FROM proyectos_master o WHERE lower(btrim(o.nombre_oficial))='ónix' AND o.id_proyecto_master<>45);

-- 🔴 CONTAR ANTES DEL COMMIT: deben ser 5 filas. Si son menos, algún alias ya
--    estaba o el candado lo frenó — mirar cuál antes de seguir.
COMMIT;


-- ── VERIFICACIÓN ────────────────────────────────────────────────────────────
-- SELECT id_proyecto_master, nombre_oficial, alias_conocidos
--   FROM proyectos_master WHERE id_proyecto_master IN (142,129,297,336,45)
--  ORDER BY id_proyecto_master;
--
-- Y que no haya aparecido ningún intruso nuevo (debe seguir dando las mismas 12
-- filas de fichas duplicadas vacías, ninguna más):
--   SELECT p.id_proyecto_master, p.nombre_oficial, a.alias, o.nombre_oficial
--     FROM proyectos_master p
--     CROSS JOIN LATERAL unnest(coalesce(p.alias_conocidos, ARRAY[]::text[])) AS a(alias)
--     JOIN proyectos_master o ON lower(btrim(o.nombre_oficial)) = lower(btrim(a.alias))
--                            AND o.id_proyecto_master <> p.id_proyecto_master;


-- =============================================================================
-- 🔴 HALLAZGO APARTE — 12 FICHAS DE PROYECTO DUPLICADAS Y VACÍAS
-- =============================================================================
-- Buscando intrusos apareció otra cosa: 12 alias que SÍ son el nombre oficial de
-- otro proyecto, pero **ese otro proyecto tiene CERO propiedades**. No son alias
-- robados: son fichas duplicadas que quedaron vacías.
--
--   pm 65  Condominio Maré (32 props)      ← alias "MARE"  · existe pm 4  "Mare" (0)
--   pm 74  Element by Elite (7)            ← "Edificio Element" · pm 303 (0)
--   pm 262 ONE ISUTO (6)                   ← "Edificio Isuto by One" · pm 556 (0)
--   pm 61  Edificio Klug (4)               ← "Klug" y "KLUG" · pm 44 (0)
--   pm 411 ATLANTIS TOWERS (4)             ← "Condominio Atlantis" · pm 484 (0)
--   pm 560 Brickell 8 Norte (4)            ← "BRICKELL 8" y "Brickell 8" · pm 32 (0)
--   pm 112 Eurodesign Le Blanc (3)         ← 2 variantes · pm 20 (0)
--   pm 381 Cond. Ecosostenible Lusitano(3) ← "Edificio Lucitano" · pm 451 (0)
--   pm 138 Edificio Sirari (0)             ← "TORRE SIRARI" · pm 520 (0)
--
-- ⚠️ NO se tocan acá. El riesgo es real pero no es el que parece: como las fichas
-- vacías no tienen props, hoy no rompen nada. Lo que puede pasar es que el fuzzy
-- devuelva la ficha VACÍA en vez de la que tiene el inventario, y una propiedad
-- nueva se matchee al duplicado — quedando sola en un proyecto fantasma.
--
-- Resolverlo es fusionar fichas, que toca `id_proyecto_master` de propiedades
-- vivas. Es una tarea propia, con su foto previa. Va al backlog.
-- =============================================================================
