-- =============================================================================
-- Migración 264 — FIX TC parte 2: "sin TC declarado" en deptos C21 Equipetrol
-- =============================================================================
-- DATA FIX (no toca schema). Continúa la migración 263. Resuelve las props de la
-- firma TC (century21 + moneda_original=BOB + tipo_cambio_detectado='paralelo'
-- + precio_usd≈BOB/6.96) que NO declaran TC en el texto, usando la SEÑAL DEL
-- PORTAL (criterio avalado por el founder 23-jun): a qué TC convirtió C21 el
-- precio a bolivianos revela la intención del vendedor.
--
--   BOB / monto_del_anuncio ≈ 7  → vendedor cotiza al OFICIAL  → no inflar
--   BOB / monto_del_anuncio ≈ 10 → vendedor cotiza al PARALELO → equivalente oficial
--
-- Validado: las 69 de la mig 263 (que SÍ decían "oficial") tenían ratio ≈7, y
-- los 10 de la parte (B) de abajo tienen ratio ≈10. Clasificación por 4
-- agentes-lectores sobre las descripciones + verificación prop por prop.
-- Memoria: project_bug_tc_flag_paralelo_historico.
--
-- Aplicar vía Supabase UI o psql (NO desde MCP). Registrar en MIGRATION_INDEX.md.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- (A) 58 deptos: precio en USD SIN TC declarado, que el portal convirtió a Bs al
--     OFICIAL (BOB/monto≈7 → precio_usd ya correcto) o sin precio en el texto.
--     → 'no_especificado' (no inflar). precio_usd NO se toca.
--     = 26 con precio en $us sin TC (precio_usd_ok) + 32 sin precio en descripción.
-- -----------------------------------------------------------------------------
UPDATE public.propiedades_v2
SET tipo_cambio_detectado = 'no_especificado',
    depende_de_tc = false
WHERE id IN (
  -- 26 con precio en USD sin TC declarado
   182, 184, 185, 200, 366, 368, 836,1315,1373,1374,
  1375,1376,1418,1553,1597,1826,1839,1840,1876,1884,
  1885,1886,1896,1897,2637,2715,
  -- 32 sin precio en la descripción (precio_usd del campo estructurado del portal)
   172, 183, 187, 324, 325, 460, 522, 976,1005,1096,
  1274,1290,1325,1370,1372,1387,1433,1599,1674,1678,
  1763,1764,1779,1782,1802,1825,1875,1927,1937,2434,
  2669,2696
)
AND tipo_cambio_detectado = 'paralelo'   -- guard idempotente
AND fuente = 'century21';

-- -----------------------------------------------------------------------------
-- (B) 10 deptos: el portal convirtió a Bs al PARALELO (BOB/monto≈10) → el vendedor
--     cotiza al paralelo, PERO precio_usd quedó inflado (=BOB/6.96 en vez del
--     billete). Corregir precio_usd al MONTO DEL ANUNCIO (verificado en el texto);
--     el flag 'paralelo' se mantiene → precio_normalizado() da el equiv. oficial OK.
--     (#1736 EXCLUIDO: su precio_usd mezcla depto+parqueos, revisar a mano.)
-- -----------------------------------------------------------------------------
UPDATE public.propiedades_v2
SET precio_usd = CASE id
      WHEN 1598 THEN 118748.53  -- "Precio: $us. 118748.53"
      WHEN 1724 THEN  84000     -- "precio 84000$us tc negociable"
      WHEN 1887 THEN 350000     -- "Precio de venta: 350.000" (Los Tajibos)
      WHEN 1908 THEN 135000     -- "Precio: 135.000" (Sky Tower)
      WHEN 1923 THEN  65000     -- "Precio: 65.000 $us" (Grigia Residenze)
      WHEN 1950 THEN 105000     -- "Precio : 105.000" (Spazios)
      WHEN 2487 THEN  99500     -- "PRECIO :99.500 USD" (Golden Tower)
      WHEN 2671 THEN 280000     -- "Precio: USD 280.000" (2 dorm 154m²)
      WHEN 2672 THEN 374000     -- "Precio: USD 374.000" (3 dorm 214m²)
      WHEN 2674 THEN  61290     -- "Precio: $us. 61.290" (parqueo $12.500 aparte)
    END,
    tipo_cambio_detectado = 'paralelo',
    depende_de_tc = true
WHERE id IN (1598,1724,1887,1908,1923,1950,2487,2671,2672,2674)
AND fuente = 'century21';

COMMIT;

-- -----------------------------------------------------------------------------
-- PENDIENTE (NO en esta migración):
--   • #1736 (Platinum II): precio_usd mezcla depto $170.000 + 2 parqueos $15.000
--     → decidir si el feed muestra solo depto o depto+parqueos.
--   • #1387: precio_usd=10.273 sospechosamente bajo (dato corrupto) → revisar.
--   • 3 props "paralelo" legítimo (#622,2656,2819 "TC del día") → correctas, se dejan.
--   • 244 deptos de Zona Norte con la misma firma → migración aparte.
-- -----------------------------------------------------------------------------
-- ROLLBACK:
--   (A) UPDATE ... SET tipo_cambio_detectado='paralelo', depende_de_tc=true
--       WHERE id IN (<los 58 ids>);
--   (B) restaurar precio_usd previo (inflado) de los 10 — valores originales:
--       1598→160720, 1724→108621, 1887→502874, 1908→193966, 1923→93391,
--       1950→150862, 2487→142960, 2671→402299, 2672→537356, 2674→88966.
-- =============================================================================
