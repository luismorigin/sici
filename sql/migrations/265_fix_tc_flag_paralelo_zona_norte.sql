-- =============================================================================
-- Migración 265 — FIX TC: flag 'paralelo' mal puesto en deptos C21 ZONA NORTE
-- =============================================================================
-- DATA FIX (no toca schema). Misma firma y bug que las migraciones 263/264 (que
-- cubrieron Equipetrol), ahora sobre las 14 microzonas de ZONA NORTE. Deptos C21
-- con `precio_usd` correcto pero `tipo_cambio_detectado='paralelo'` mal puesto →
-- `precio_normalizado()` los infla ×1.43 en el feed (/zona-norte/ventas, hoy en
-- noindex). Mismo origen: detector "Extractor Century21 v16.5" sin rama 'oficial'
-- hasta ~16-jun-2026 + pipeline que no re-procesa props completadas.
--
-- Clasificación: firma SQL (BOB/precio_usd≈6.96-7.0) + 5 agentes-lectores sobre
-- las 131 ambiguas (señal del portal: BOB/monto≈7=oficial, ≈10=paralelo).
-- Verificado: las 128 oficiales tienen ratio BOB/precio_usd≈7 + evidencia textual.
-- Memoria: project_bug_tc_flag_paralelo_historico.
--
-- Universo de la firma en ZN: 245 deptos → 128 oficial + 101 no-inflar + 2 inflados
--   + 10 paralelo legítimo (se dejan) + 4 excluidos (revisar a mano, ver abajo).
--
-- Aplicar vía Supabase UI o psql (NO desde MCP). Registrar en MIGRATION_INDEX.md.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- (A) 128 deptos con TC OFICIAL/TC7 declarado → 'oficial'. precio_usd ya correcto.
--     104 por regex + 24 destapados por agentes-lectores (TC 6.96 / T/C 7 / etc.)
-- -----------------------------------------------------------------------------
UPDATE public.propiedades_v2
SET tipo_cambio_detectado = 'oficial', depende_de_tc = false
WHERE id IN (
  -- 104 por regex
  1165,1166,1167,1168,1169,1170,1172,1173,1174,1175,1176,1177,1179,1234,1245,1293,
  1975,1977,1982,1991,1993,1994,2005,2006,2008,2020,2021,2022,2023,2024,2025,2026,
  2027,2040,2046,2052,2053,2056,2057,2058,2059,2061,2064,2070,2073,2075,2076,2083,
  2084,2086,2089,2090,2091,2092,2093,2094,2095,2096,2097,2100,2107,2108,2116,2117,
  2118,2119,2121,2122,2128,2153,2154,2157,2166,2167,2168,2169,2171,2172,2173,2179,
  2187,2188,2194,2195,2197,2202,2217,2218,2222,2409,2411,2437,2472,2480,2482,2606,
  2610,2702,2717,2718,2721,2722,2751,2785,
  -- 24 por agentes-lectores
  588,589,591,592,593,594,843,1013,1015,1997,2019,2032,2034,2049,2051,2055,2111,
  2115,2130,2186,2215,2481,2585,2735
)
AND tipo_cambio_detectado = 'paralelo'
AND fuente = 'century21';

-- -----------------------------------------------------------------------------
-- (B) 101 deptos: precio en USD sin TC (portal al oficial, BOB/monto≈7), precio
--     en bolivianos reales, o sin precio en el texto → 'no_especificado' (no inflar).
-- -----------------------------------------------------------------------------
UPDATE public.propiedades_v2
SET tipo_cambio_detectado = 'no_especificado', depende_de_tc = false
WHERE id IN (
  590,1076,1154,1171,1971,1974,1976,1980,1988,1992,1999,2000,2001,2002,2004,2007,
  2010,2011,2017,2033,2047,2054,2060,2071,2101,2102,2103,2104,2106,2110,2112,2114,
  2126,2129,2131,2132,2133,2134,2135,2136,2137,2139,2143,2150,2156,2162,2163,2164,
  2170,2174,2175,2176,2177,2178,2180,2185,2191,2192,2198,2199,2200,2201,2203,2204,
  2205,2206,2207,2208,2209,2210,2211,2212,2213,2221,2223,2432,2436,2450,2452,2453,
  2454,2455,2456,2457,2468,2470,2471,2586,2600,2601,2602,2603,2604,2605,2611,2640,
  2681,2682,2683,2700,2719
)
AND tipo_cambio_detectado = 'paralelo'
AND fuente = 'century21';

-- -----------------------------------------------------------------------------
-- (C) 2 deptos que el portal convirtió al PARALELO (BOB/monto≈10) → precio_usd
--     inflado. Corregir al monto del anuncio; flag 'paralelo' se mantiene.
-- -----------------------------------------------------------------------------
UPDATE public.propiedades_v2
SET precio_usd = CASE id
      WHEN 2012 THEN 70000   -- "70.000 $us en dólares o Tc 11"
      WHEN 2703 THEN 51000   -- "Precio 51.000 dólares" (Stone By Portobello — el que destapó el bug)
    END,
    tipo_cambio_detectado = 'paralelo',
    depende_de_tc = true
WHERE id IN (2012,2703)
AND fuente = 'century21';

COMMIT;

-- -----------------------------------------------------------------------------
-- EXCLUIDOS (revisar a mano, NO en esta migración):
--   • #2701 — ALQUILER mal clasificado como venta ("Canon de alquiler: Bs.6.500",
--     precio_usd=934). Bug de tipo_operacion, no TC → reclasificar a alquiler.
--   • #2123 — precio_usd=72 (dato corrupto).
--   • #2013, #2014 — precio por m² ($1.350/m²); precio_usd no es un total claro.
--   • 10 paralelo legítimo ("TC del día"/etc.): 1989,1990,2072,2127,2141,2146,
--     2473,2736,2805,2806 → correctas, se dejan.
-- -----------------------------------------------------------------------------
-- ROLLBACK:
--   (A)+(B) UPDATE ... SET tipo_cambio_detectado='paralelo', depende_de_tc=true
--           WHERE id IN (<los 229 ids de A y B>);
--   (C) precio_usd previos: 2012→110632, 2703→74713 (+ ya eran paralelo/depende=true).
-- =============================================================================
