-- ============================================================================
-- Migración 268 — Fixes del audit semanal /ventas (Equipetrol, 6-jul-2026)
-- ============================================================================
-- Origen: corrida de /audit-feed-ventas-semanal (macrozona=equipetrol, ventana
-- 29-jun→6-jul) + revisión a fondo de Equipetrol Norte LEYENDO las descripciones
-- (no solo el regex del check 2.1 — corrección de método pedida por el founder).
-- Costo $0, sin Firecrawl.
--
-- YA APLICADO en producción (Supabase) el 6-jul. Este archivo es el registro
-- versionado + rollback. El MCP es readonly: las correcciones se aplicaron vía
-- SQL en Supabase UI. Los candados van en formato OBJETO para que el merge
-- nocturno no los repise (campo_esta_bloqueado() ignora strings).
--
-- Cubre:
--   A) precio_usd mal (candado)
--      #3541 Nano Smart      — doble normalización TC paralelo            [check 2.1]
--      #3542 HH Once         — USD del anuncio leído como Bs              [check 2.4]
--      #1856 Macororó 5      — precio_usd inflado vs desc ($67k, no $107k)[lectura desc]
--      #2429 Sky Moon        — precio_usd incluía parqueo+baulera         [lectura desc]
--   B) tipo_operacion mal (candado)
--      #3492 NanoTec         — anticrético colado al feed de venta        [check 2.4-sub]
--   C) Exclusión del feed (sin candado — palanca es_activa)
--      #3490 Sky Eclipse     — precio erróneo en el PORTAL de origen      [check 2.4]
--
-- NOTA es_activa: v_mercado_venta NO filtra es_activa (la prop sigue en la vista
-- cruda), pero buscar_unidades_simple/reales SÍ → queda oculta en el feed real.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A) Correcciones de precio_usd (candadas, formato objeto)
-- ----------------------------------------------------------------------------

-- #3541 Nano Smart — desc: "$us. 52.000 Tc. paralelo del día". precio_usd 71.839
--   (= BOB 500.000/6.96, oficial) → billete 52.000. Con tc=paralelo el feed
--   re-multiplicaba ×1.43 e inflaba a ~$103K/$3.082m². Corregido → ~$2.231/m².
UPDATE propiedades_v2 SET
  precio_usd = 52000,
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'precio_usd', jsonb_build_object('bloqueado',true,'por','audit_semanal_268','fecha','2026-07-06','valor_original',71839))
WHERE id = 3541;

-- #3542 HH Once — desc Y url: "$us 52.600". El extractor lo tomó como Bs →
--   precio_usd 7.557 ($217/m²). Corregido a 52.600 USD directo → $1.510/m².
UPDATE propiedades_v2 SET
  precio_usd = 52600,
  moneda_original = 'USD',
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'precio_usd', jsonb_build_object('bloqueado',true,'por','audit_semanal_268','fecha','2026-07-06','valor_original',7557))
WHERE id = 3542;

-- #1856 Macororó 5 — desc: "VENTA 75.000 (DEPARTAMENTO 67.000 / PARQUEO 8.000)".
--   precio_usd estaba en 107.759 (inflado ~60%) → depto 67.000. tc paralelo→no_especificado
--   (la desc no declara TC). Feed $3.958/m² → $1.718/m². (El regex del 2.1 no lo cazó.)
UPDATE propiedades_v2 SET
  precio_usd = 67000,
  tipo_cambio_detectado = 'no_especificado',
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'precio_usd', jsonb_build_object('bloqueado',true,'por','audit_semanal_268','fecha','2026-07-06','valor_original',107759))
WHERE id = 1856;

-- #2429 Sky Moon — desc: "DEPT 208.000$ · PARQUEO 15.000$ · BAULERA 5.000$ · TOTAL 228.000$".
--   precio_usd guardaba el TOTAL (228.000). El depto solo = 208.000. → $3.205 a $2.923/m².
UPDATE propiedades_v2 SET
  precio_usd = 208000,
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'precio_usd', jsonb_build_object('bloqueado',true,'por','audit_semanal_268','fecha','2026-07-06','valor_original',228000))
WHERE id = 2429;

-- ----------------------------------------------------------------------------
-- B) Reclasificación tipo_operacion (candada)
-- ----------------------------------------------------------------------------

-- #3492 NanoTec by Smart Studio — url "monoambiente-en-anticretico", desc "Anticrético:
--   Bs 260.000". Estaba como venta → salía en /ventas. Reclasificado a anticrético
--   (sale de v_mercado_venta, que filtra tipo_operacion='venta').
UPDATE propiedades_v2 SET
  tipo_operacion = 'anticretico',
  campos_bloqueados = COALESCE(campos_bloqueados,'{}'::jsonb) || jsonb_build_object(
    'tipo_operacion', jsonb_build_object('bloqueado',true,'por','audit_semanal_268','fecha','2026-07-06','valor_original','venta'))
WHERE id = 3492;

-- ----------------------------------------------------------------------------
-- C) Exclusión del feed — precio erróneo en el PORTAL de origen (no es bug nuestro)
-- ----------------------------------------------------------------------------

-- #3490 Sky Eclipse — el anuncio C21 publica "12.069 USD" (Bs 84.000) para un depto
--   de 101 m² 2 dorm, cuando su unidad GEMELA idéntica #3491 está en $165.948
--   ($1.643/m²). El broker cargó mal el precio en origen; no es corregible a un valor
--   confiable. Excluida del feed hasta que corrijan (patrón BUG-004). Reversible.
UPDATE propiedades_v2 SET
  es_activa = false,
  fecha_inactivacion = NOW(),
  razon_inactiva = 'audit 2026-07-06: precio erroneo en portal C21 (Bs 84.000 = $12.069 / $119m2) vs gemela #3491 identica ($165.948 / $1.643m2). Reactivar si broker corrige.'
WHERE id = 3490;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN POST-FIX (correr tras el COMMIT)
-- ============================================================================
-- SELECT v.id, v.nombre_edificio, v.precio_usd, v.moneda_original, v.tipo_operacion,
--        v.es_activa, v.tipo_cambio_detectado,
--        ROUND(precio_normalizado(v.precio_usd, v.tipo_cambio_detectado)/NULLIF(v.area_total_m2,0)) AS m2_feed,
--        campo_esta_bloqueado(p.campos_bloqueados,'precio_usd')     AS lock_precio,
--        campo_esta_bloqueado(p.campos_bloqueados,'tipo_operacion') AS lock_op
-- FROM v_mercado_venta v JOIN propiedades_v2 p ON p.id=v.id
-- WHERE v.id IN (3541,3542,1856,2429,3492,3490) ORDER BY v.id;
-- Esperado: #3541 ~2.231 · #3542 ~1.510 · #1856 ~1.718 · #2429 ~2.923 m2_feed;
--   #3492 fuera de v_mercado_venta (anticretico); #3490 con es_activa=false.

-- ============================================================================
-- ROLLBACK (si algo sale mal)
-- ============================================================================
-- BEGIN;
-- UPDATE propiedades_v2 SET precio_usd=71839,  campos_bloqueados = campos_bloqueados - 'precio_usd' WHERE id=3541;
-- UPDATE propiedades_v2 SET precio_usd=7557, moneda_original='BOB', campos_bloqueados = campos_bloqueados - 'precio_usd' WHERE id=3542;
-- UPDATE propiedades_v2 SET precio_usd=107759, tipo_cambio_detectado='paralelo', campos_bloqueados = campos_bloqueados - 'precio_usd' WHERE id=1856;
-- UPDATE propiedades_v2 SET precio_usd=228000, campos_bloqueados = campos_bloqueados - 'precio_usd' WHERE id=2429;
-- UPDATE propiedades_v2 SET tipo_operacion='venta', campos_bloqueados = campos_bloqueados - 'tipo_operacion' WHERE id=3492;
-- UPDATE propiedades_v2 SET es_activa=true, fecha_inactivacion=NULL, razon_inactiva=NULL WHERE id=3490;
-- COMMIT;
