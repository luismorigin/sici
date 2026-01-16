-- ============================================================================
-- TEST: Sistema de Scoring MOAT Fiduciario
-- ============================================================================
-- Archivo: sql/tests/test_scoring_moat.sql
-- Fecha: 14 Enero 2026
-- Autor: Claude Code
--
-- PROPOSITO:
-- Validar el funcionamiento del sistema de scoring MOAT que rankea propiedades
-- según las preferencias del usuario (innegociables, deseables, trade-offs).
--
-- PREREQUISITOS:
-- - Función buscar_unidades_reales() v2.14+ ejecutada
-- - Función calcular_posicion_mercado() ejecutada
-- - Datos de prueba en propiedades_v2 y proyectos_master
--
-- COMO EJECUTAR:
-- 1. Copiar todo el contenido de este archivo
-- 2. Pegar en Supabase SQL Editor
-- 3. Ejecutar (F5 o click en "Run")
-- 4. Revisar resultados de cada test
--
-- ARQUITECTURA DEL SCORING (Frontend TypeScript):
--
-- SCORE TOTAL = INNEGOCIABLES + OPORTUNIDAD + TRADE_OFFS + DESEABLES
-- Maximo teorico: 175 puntos
--
-- Componentes:
-- - INNEGOCIABLES (0-100): Amenidades obligatorias
--   * Confirmado = 100% puntos, Por verificar = 50%, No tiene = 0%
-- - OPORTUNIDAD (0-40): Posicion vs mercado (se invierte segun slider)
-- - TRADE_OFFS (0-20): Bonus por area grande o muchas amenidades
-- - DESEABLES (0-15): Amenidades "nice to have" (5 pts c/u, max 3)
--
-- ============================================================================

-- ============================================================================
-- TEST 1: Propiedades con mas amenidades confirmadas
-- Verifica que el sistema detecta correctamente las amenidades
-- ============================================================================
SELECT '=== TEST 1: Top 10 propiedades por cantidad de amenidades ===' as test;

SELECT
  id,
  proyecto,
  zona,
  dormitorios,
  precio_usd,
  precio_m2,
  area_m2,
  COALESCE(array_length(amenities_confirmados, 1), 0) as cant_amenities,
  amenities_confirmados[1:5] as top5_amenities
FROM buscar_unidades_reales('{"limite": 50}'::jsonb)
ORDER BY COALESCE(array_length(amenities_confirmados, 1), 0) DESC
LIMIT 10;

-- RESULTADO ESPERADO:
-- Stone 3, PORTOBELLO 5, BARUC IV con 10-11 amenidades
-- NO debe aparecer zona "Sin zona"


-- ============================================================================
-- TEST 2: Distribucion de categorias de mercado
-- Verifica que calcular_posicion_mercado clasifica correctamente
-- ============================================================================
SELECT '=== TEST 2: Distribucion de categorias de mercado ===' as test;

SELECT
  posicion_mercado->>'categoria' as categoria,
  COUNT(*) as cantidad,
  ROUND(AVG(precio_m2)) as precio_m2_promedio,
  ROUND(AVG((posicion_mercado->>'diferencia_pct')::numeric), 1) as dif_pct_promedio,
  MIN((posicion_mercado->>'diferencia_pct')::numeric) as dif_min,
  MAX((posicion_mercado->>'diferencia_pct')::numeric) as dif_max
FROM buscar_unidades_reales('{"limite": 300}'::jsonb)
GROUP BY posicion_mercado->>'categoria'
ORDER BY dif_pct_promedio;

-- RESULTADO ESPERADO:
-- oportunidad: ~40 props, dif_pct ~ -30%
-- bajo_promedio: ~40 props, dif_pct ~ -15%
-- promedio: ~40 props, dif_pct ~ 0%
-- sobre_promedio: ~25 props, dif_pct ~ +15%
-- premium: ~40 props, dif_pct ~ +35%


-- ============================================================================
-- TEST 3: Busqueda tipica de usuario (2D, $140k, con fotos)
-- Simula busqueda real
-- ============================================================================
SELECT '=== TEST 3: Busqueda usuario 2D $140k con fotos ===' as test;

SELECT
  id,
  proyecto,
  zona,
  precio_usd,
  precio_m2,
  area_m2,
  (posicion_mercado->>'diferencia_pct')::numeric as dif_pct,
  posicion_mercado->>'categoria' as categoria,
  'Piscina' = ANY(amenities_confirmados) as piscina,
  'Gimnasio' = ANY(amenities_confirmados) as gimnasio,
  COALESCE(array_length(amenities_confirmados, 1), 0) as cant_amenities
FROM buscar_unidades_reales('{
  "dormitorios": 2,
  "precio_max": 140000,
  "solo_con_fotos": true
}'::jsonb)
ORDER BY precio_usd ASC
LIMIT 15;

-- RESULTADO ESPERADO:
-- 10-15 propiedades con variedad de categorias y amenidades


-- ============================================================================
-- TEST 4: Simulacion scoring MODO NEUTRAL (slider=3)
-- Usuario con innegociable=Piscina, deseable=Gimnasio
-- ============================================================================
SELECT '=== TEST 4: Scoring MODO NEUTRAL (slider=3) ===' as test;

WITH datos AS (
  SELECT
    id, proyecto, zona, precio_usd, precio_m2, area_m2,
    (posicion_mercado->>'diferencia_pct')::numeric as dif_pct,
    'Piscina' = ANY(amenities_confirmados) as piscina,
    'Gimnasio' = ANY(amenities_confirmados) as gimnasio,
    COALESCE(array_length(amenities_confirmados, 1), 0) as cant_amenities
  FROM buscar_unidades_reales('{"dormitorios": 2, "precio_max": 140000, "solo_con_fotos": true}'::jsonb)
)
SELECT
  id, proyecto, zona, precio_usd, precio_m2, dif_pct,
  piscina, gimnasio, cant_amenities,

  -- INNEGOCIABLES: Piscina
  CASE WHEN piscina THEN 100 ELSE 0 END as "1_INNEG",

  -- OPORTUNIDAD (slider NEUTRAL=3)
  CASE
    WHEN dif_pct <= -20 THEN 35
    WHEN dif_pct <= -10 THEN 30
    WHEN dif_pct <= 10 THEN 25
    WHEN dif_pct <= 20 THEN 15
    ELSE 10
  END as "2_OPORT",

  -- TRADE-OFF ubicacion_vs_metros: area > 88m2 (mediana 2D)
  CASE WHEN area_m2 > 88 THEN 10 ELSE 0 END as "3a_METROS",

  -- TRADE-OFF calidad: amenidades >= 5
  CASE WHEN cant_amenities >= 5 THEN 10 ELSE 0 END as "3b_CALIDAD",

  -- DESEABLES: Gimnasio (5 pts)
  CASE WHEN gimnasio THEN 5 ELSE 0 END as "4_DESEABLE",

  -- TOTAL
  CASE WHEN piscina THEN 100 ELSE 0 END +
  CASE WHEN dif_pct <= -20 THEN 35 WHEN dif_pct <= -10 THEN 30 WHEN dif_pct <= 10 THEN 25 WHEN dif_pct <= 20 THEN 15 ELSE 10 END +
  CASE WHEN area_m2 > 88 THEN 10 ELSE 0 END +
  CASE WHEN cant_amenities >= 5 THEN 10 ELSE 0 END +
  CASE WHEN gimnasio THEN 5 ELSE 0 END as "TOTAL"

FROM datos
ORDER BY "TOTAL" DESC, precio_usd ASC;

-- RESULTADO ESPERADO:
-- TOP 3: OMNIA PRIME (~155), BLUE BOX (~150), Condominio Cruz (~150)
-- Props sin piscina deben estar al fondo (<60 pts)


-- ============================================================================
-- TEST 5: Simulacion scoring MODO PRECIO (slider=5)
-- Verifica que oportunidades suben cuando usuario prioriza precio
-- ============================================================================
SELECT '=== TEST 5: Scoring MODO PRECIO (slider=5) ===' as test;

WITH datos AS (
  SELECT
    id, proyecto, precio_usd,
    (posicion_mercado->>'diferencia_pct')::numeric as dif_pct,
    'Piscina' = ANY(amenities_confirmados) as piscina,
    'Gimnasio' = ANY(amenities_confirmados) as gimnasio,
    COALESCE(array_length(amenities_confirmados, 1), 0) as cant_amenities
  FROM buscar_unidades_reales('{"dormitorios": 2, "precio_max": 140000, "solo_con_fotos": true}'::jsonb)
)
SELECT
  id, proyecto, precio_usd, dif_pct, piscina,

  CASE WHEN piscina THEN 100 ELSE 0 END as "INNEG",

  -- OPORTUNIDAD slider PRECIO (4-5): barato = mas puntos
  CASE
    WHEN dif_pct <= -20 THEN 40
    WHEN dif_pct <= -10 THEN 30
    WHEN dif_pct <= 5 THEN 20
    WHEN dif_pct <= 15 THEN 10
    ELSE 0
  END as "OPORT_PRECIO",

  CASE WHEN gimnasio THEN 5 ELSE 0 END as "DESEABLE",

  -- TOTAL MODO PRECIO
  CASE WHEN piscina THEN 100 ELSE 0 END +
  CASE WHEN dif_pct <= -20 THEN 40 WHEN dif_pct <= -10 THEN 30 WHEN dif_pct <= 5 THEN 20 WHEN dif_pct <= 15 THEN 10 ELSE 0 END +
  CASE WHEN gimnasio THEN 5 ELSE 0 END as "TOTAL_PRECIO"

FROM datos
ORDER BY "TOTAL_PRECIO" DESC, precio_usd ASC
LIMIT 10;

-- RESULTADO ESPERADO:
-- TOP: BLUE BOX, Dunas, Uptown NUU (las mas baratas con piscina)


-- ============================================================================
-- TEST 6: Simulacion scoring MODO CALIDAD (slider=1)
-- Verifica que premium suben cuando usuario prioriza calidad
-- ============================================================================
SELECT '=== TEST 6: Scoring MODO CALIDAD (slider=1) ===' as test;

WITH datos AS (
  SELECT
    id, proyecto, precio_usd,
    (posicion_mercado->>'diferencia_pct')::numeric as dif_pct,
    'Piscina' = ANY(amenities_confirmados) as piscina,
    'Gimnasio' = ANY(amenities_confirmados) as gimnasio,
    COALESCE(array_length(amenities_confirmados, 1), 0) as cant_amenities
  FROM buscar_unidades_reales('{"dormitorios": 2, "precio_max": 140000, "solo_con_fotos": true}'::jsonb)
)
SELECT
  id, proyecto, precio_usd, dif_pct, piscina, cant_amenities,

  CASE WHEN piscina THEN 100 ELSE 0 END as "INNEG",

  -- OPORTUNIDAD slider CALIDAD (1-2): caro/premium = mas puntos
  CASE
    WHEN dif_pct >= 15 THEN 40
    WHEN dif_pct >= 5 THEN 30
    WHEN dif_pct >= -10 THEN 20
    WHEN dif_pct >= -20 THEN 10
    ELSE 0
  END as "OPORT_CALIDAD",

  -- Trade-off CALIDAD: +10 si amenidades >= 5
  CASE WHEN cant_amenities >= 5 THEN 10 ELSE 0 END as "TRADEOFF_CAL",

  CASE WHEN gimnasio THEN 5 ELSE 0 END as "DESEABLE",

  -- TOTAL MODO CALIDAD
  CASE WHEN piscina THEN 100 ELSE 0 END +
  CASE WHEN dif_pct >= 15 THEN 40 WHEN dif_pct >= 5 THEN 30 WHEN dif_pct >= -10 THEN 20 WHEN dif_pct >= -20 THEN 10 ELSE 0 END +
  CASE WHEN cant_amenities >= 5 THEN 10 ELSE 0 END +
  CASE WHEN gimnasio THEN 5 ELSE 0 END as "TOTAL_CALIDAD"

FROM datos
ORDER BY "TOTAL_CALIDAD" DESC, precio_usd DESC
LIMIT 10;

-- RESULTADO ESPERADO:
-- TOP: Stone 3 (+22%), Avanti (+9.6%), NanoTec (+8.3%)
-- OMNIA PRIME y BLUE BOX deben BAJAR (muy baratas = 0 pts en modo calidad)


-- ============================================================================
-- TEST 7: Verificar filtro innegociable PISCINA
-- ============================================================================
SELECT '=== TEST 7: Propiedades con/sin PISCINA ===' as test;

SELECT
  'Piscina' = ANY(amenities_confirmados) as piscina_confirmada,
  'Piscina' = ANY(amenities_por_verificar) as piscina_por_verificar,
  COUNT(*) as cantidad
FROM buscar_unidades_reales('{"dormitorios": 2, "precio_max": 150000, "limite": 50}'::jsonb)
GROUP BY 1, 2
ORDER BY 1 DESC NULLS LAST, 2 DESC NULLS LAST;

-- RESULTADO ESPERADO:
-- piscina_confirmada=true: mayoria de props
-- piscina_por_verificar=true: algunas
-- ambas false: pocas


-- ============================================================================
-- TEST 8: Verificar que NO aparecen propiedades "Sin zona"
-- ============================================================================
SELECT '=== TEST 8: Verificar filtro Sin zona ===' as test;

SELECT
  zona,
  COUNT(*) as cantidad
FROM buscar_unidades_reales('{"limite": 300}'::jsonb)
WHERE zona = 'Sin zona' OR zona IS NULL
GROUP BY zona;

-- RESULTADO ESPERADO:
-- 0 filas (no debe haber ninguna "Sin zona")


-- ============================================================================
-- TEST 9: Verificar trade-off area vs mediana
-- Mediana 2D = 88m2
-- ============================================================================
SELECT '=== TEST 9: Trade-off area vs mediana 2D (88m2) ===' as test;

SELECT
  id, proyecto, area_m2,
  area_m2 > 88 as supera_mediana,
  CASE WHEN area_m2 > 88 THEN '+10 pts' ELSE '0 pts' END as bonus_metros
FROM buscar_unidades_reales('{"dormitorios": 2, "precio_max": 150000, "limite": 20}'::jsonb)
ORDER BY area_m2 DESC;

-- RESULTADO ESPERADO:
-- OMNIA PRIME (114m2), Cruz (91m2), SMART STUDIO (91m2) superan mediana


-- ============================================================================
-- RESUMEN
-- ============================================================================
SELECT '=== TESTS COMPLETADOS ===' as resultado;
SELECT 'Revisar resultados arriba. Todos deben cumplir RESULTADO ESPERADO.' as instruccion;
