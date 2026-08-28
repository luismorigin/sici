-- =============================================================================
-- 345 · Vista: los edificios del catálogo que el matcher NO puede distinguir
-- =============================================================================
-- Fecha: 2026-08-28
--
-- POR QUÉ
-- -------
-- `buscar_proyecto_fuzzy()` compara nombres pasados por `normalize_nombre()`, que
-- BORRA el prefijo genérico y los numerales romanos. Dos fichas activas distintas
-- pueden colapsar al mismo texto normalizado — y entonces, para el matcher, son el
-- MISMO edificio. Medido el 27-ago-2026: **11 grupos, 25 fichas activas**.
--
-- Hoy eso no se ve por ningún lado. Los tres casos que aparecieron esta semana se
-- descubrieron DE REBOTE (tirando del hilo de una propiedad mal matcheada), nunca
-- porque algo los buscara. El pm 156 "Condominio Portofino" llevaba nueve meses
-- capturando propiedades ajenas.
--
-- 🔑 LO QUE HACE PELIGROSA A UNA COLISIÓN NO ES QUE EXISTA: ES LA DISTANCIA.
-- Los tres "Condado" están a 50 m entre sí — elegir mal no mueve ni la zona ni la
-- mediana del m². Los dos "Domus Luxury" están a 2.375 m y en macrozonas distintas:
-- ahí, elegir mal manda la propiedad al mercado equivocado. Por eso la vista expone
-- `metros` y `cruza_macrozona`, que son el ranking de daño potencial.
--
-- 🔴 ESTA VISTA NO ARREGLA NADA — REPORTA. Igual que las superficies 5, 6 y 7 del
-- audit. Lo que salva hoy a los homónimos lejanos es el discriminador de DISTANCIA,
-- que actúa DESPUÉS del fuzzy. La vista existe para que se sepa de quién depende eso.
--
-- ⚠️ NO se toca `normalize_nombre()`. Se midió el 27-ago (informe
-- `docs/reports/AUDITORIA_NORMALIZACION_NOMBRES_2026-08-27.md` §6): el arreglo del
-- prefijo no cambia un solo match, y tocar los numerales mueve el matching entero.
--
-- SIN GRANT PARA anon/authenticated: la consume el audit con la llave de servidor.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_colisiones_catalogo AS
WITH act AS (
  SELECT pm.id_proyecto_master AS pm,
         pm.nombre_oficial,
         pm.zona,
         pm.latitud,
         pm.longitud,
         normalize_nombre(pm.nombre_oficial) AS norm,
         -- núcleo = el nombre sin el prefijo genérico, PERO conservando el numeral.
         -- Si dos fichas comparten núcleo, no hay NADA que las separe salvo el GPS.
         btrim(regexp_replace(lower(btrim(pm.nombre_oficial)),
               '^(edificio|condominio|cond\.?|torre|torres|proyecto|residencial|residence)\s+', '')) AS nucleo,
         (SELECT zg.zona_general FROM zonas_geograficas zg
           WHERE lower(btrim(zg.nombre)) = lower(btrim(pm.zona)) LIMIT 1) AS macro,
         (SELECT count(*) FROM propiedades_v2 p
           WHERE p.id_proyecto_master = pm.id_proyecto_master
             AND p.duplicado_de IS NULL
             AND p.es_activa) AS props
  FROM proyectos_master pm
  WHERE pm.activo = true
    AND normalize_nombre(pm.nombre_oficial) <> ''
)
SELECT a.norm                                   AS normalizado,
       a.pm                                     AS pm_a,
       a.nombre_oficial                         AS nombre_a,
       a.zona                                   AS zona_a,
       a.macro                                  AS macrozona_a,
       a.props                                  AS props_a,
       b.pm                                     AS pm_b,
       b.nombre_oficial                         AS nombre_b,
       b.zona                                   AS zona_b,
       b.macro                                  AS macrozona_b,
       b.props                                  AS props_b,
       -- true = NI SIQUIERA el numeral los separa. Es el caso grave: dos fichas que
       -- se llaman literalmente igual. Ej: 73 "Domus Luxury" vs 356 "DOMUS LUXURY".
       (a.nucleo = b.nucleo)                    AS mismo_nucleo,
       (a.macro IS DISTINCT FROM b.macro)       AS cruza_macrozona,
       CASE WHEN a.latitud IS NULL OR b.latitud IS NULL THEN NULL
            ELSE round(ST_DistanceSphere(ST_MakePoint(a.longitud, a.latitud),
                                         ST_MakePoint(b.longitud, b.latitud))::numeric)
       END                                      AS metros
FROM act a
JOIN act b ON a.norm = b.norm AND a.pm < b.pm;

COMMENT ON VIEW public.v_colisiones_catalogo IS
  'Pares de fichas ACTIVAS que colapsan al mismo normalize_nombre() — para el matcher son '
  'el mismo edificio. Un par por fila (pm_a < pm_b). `mismo_nucleo` = ni el numeral los separa. '
  '`metros` y `cruza_macrozona` son el ranking de daño: dos homónimos a 50 m son inofensivos, '
  'a 2 km no. REPORTA, no arregla — lo que hoy los salva es el discriminador de distancia, que '
  'actúa DESPUÉS del fuzzy. Consumida por la superficie 11 de /audit-cola-shadow (mig 345).';

REVOKE ALL ON public.v_colisiones_catalogo FROM anon, authenticated;

-- =============================================================================
-- VERIFICACIÓN — correr DESPUÉS de aplicar
-- =============================================================================
-- SELECT count(*) FROM v_colisiones_catalogo;                     -- esperado: 17 pares
-- SELECT count(*) FROM v_colisiones_catalogo WHERE mismo_nucleo;  -- esperado: 2
-- Los 2 con mismo núcleo deben ser (73,356) "Domus Luxury" y (409,500) "Baruc Norte".
--
-- SELECT normalizado, pm_a, nombre_a, pm_b, nombre_b, metros, cruza_macrozona
--   FROM v_colisiones_catalogo
--  WHERE cruza_macrozona OR metros >= 800
--  ORDER BY cruza_macrozona DESC, metros DESC;                    -- esperado: 8 pares
-- =============================================================================
-- ROLLBACK: DROP VIEW IF EXISTS public.v_colisiones_catalogo;
-- =============================================================================
