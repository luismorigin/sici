-- ============================================================================
-- MIGRACIÓN 059: Fix retroactivo TC Paralelo
-- ============================================================================
-- Fecha: 2026-01-14
-- Problema: Bug en pipeline - tipo_cambio_detectado no se escribía a columna
--           + 13 propiedades USD "al paralelo" con precio incorrecto
-- Referencia: Postmortem bug TC paralelo (sesión Claude 14 Ene 2026)
-- ============================================================================
-- CONTENIDO:
--   - Fix 4: Corrección de 13 propiedades con precio incorrecto
--   - Fix 4b: Poblar columna tipo_cambio_detectado para 464 propiedades
--   - Fix 5: Vista de monitoreo para auditoría
-- ============================================================================

-- ============================================================================
-- PASO 0: TABLA DE AUDITORÍA/ROLLBACK
-- ============================================================================

CREATE TABLE IF NOT EXISTS fix_tc_paralelo_audit_20260114 (
    id SERIAL PRIMARY KEY,
    propiedad_id INTEGER NOT NULL,
    precio_usd_antes NUMERIC(12,2),
    precio_usd_despues NUMERIC(12,2),
    precio_usd_original_antes NUMERIC(12,2),
    tipo_cambio_detectado_antes TEXT,
    tipo_cambio_detectado_despues TEXT,
    grupo TEXT, -- 'fix4_parsing', 'fix4_normalizar', 'fix4b_poblar'
    descripcion_fix TEXT,
    ejecutado_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE fix_tc_paralelo_audit_20260114 IS
'Auditoría y rollback para fix TC paralelo del 14 Ene 2026.
Contiene estado antes/después de 13 propiedades corregidas.';

-- ============================================================================
-- FIX 4: CORRECCIÓN DE 13 PROPIEDADES USD "AL PARALELO"
-- ============================================================================
-- Factor de normalización: TC_paralelo / TC_oficial = 9.718 / 6.96 = 1.3959
-- ============================================================================

-- Paso 4.1: Backup de las 13 propiedades
INSERT INTO fix_tc_paralelo_audit_20260114
    (propiedad_id, precio_usd_antes, precio_usd_original_antes,
     tipo_cambio_detectado_antes, grupo, descripcion_fix)
SELECT
    id,
    precio_usd,
    precio_usd_original,
    tipo_cambio_detectado,
    CASE
        WHEN id IN (30, 419, 465) THEN 'fix4_parsing'
        ELSE 'fix4_normalizar'
    END,
    'Backup antes de fix - ' || CASE
        WHEN id IN (30, 419, 465) THEN 'error parsing + normalizar'
        ELSE 'solo normalizar'
    END
FROM propiedades_v2
WHERE id IN (
    -- Grupo A: Error parsing + normalizar
    30, 419, 465,
    -- Grupo B: Solo normalizar (precio base correcto)
    357, 425,
    -- Grupo C: 8 originales - Solo normalizar
    198, 236, 243, 353, 394, 415, 429, 430
);

-- Paso 4.2: Corregir precio base de IDs con error de parsing
-- ID 30: Anuncio dice $65,000, parseó como 650,000 BOB → $93,390
UPDATE propiedades_v2 SET precio_usd = 65000 WHERE id = 30;

-- ID 419: Anuncio dice $79,000, parseó como 718,900 BOB → $103,290
UPDATE propiedades_v2 SET precio_usd = 79000 WHERE id = 419;

-- ID 465: Anuncio dice $89,000, parseó como 620,330 BOB → $89,128 (casi igual por coincidencia)
UPDATE propiedades_v2 SET precio_usd = 89000 WHERE id = 465;

-- Paso 4.3: Aplicar normalización USD "al paralelo" → USD real
-- Fórmula: precio_normalizado = precio_usd × (TC_paralelo / TC_oficial)
UPDATE propiedades_v2 SET
    precio_usd_original = precio_usd,
    precio_usd = ROUND(precio_usd * (9.718 / 6.96), 2),
    tipo_cambio_detectado = 'paralelo',
    tipo_cambio_usado = 6.96,
    tipo_cambio_paralelo_usado = 9.718,
    depende_de_tc = true,
    requiere_actualizacion_precio = false,
    fecha_actualizacion = NOW()
WHERE id IN (30, 419, 465, 357, 425, 198, 236, 243, 353, 394, 415, 429, 430);

-- Paso 4.4: Actualizar auditoría con precio nuevo
UPDATE fix_tc_paralelo_audit_20260114 a SET
    precio_usd_despues = p.precio_usd,
    tipo_cambio_detectado_despues = p.tipo_cambio_detectado
FROM propiedades_v2 p
WHERE a.propiedad_id = p.id
  AND a.grupo IN ('fix4_parsing', 'fix4_normalizar');

-- ============================================================================
-- FIX 4b: POBLAR COLUMNA tipo_cambio_detectado PARA 464 PROPIEDADES
-- ============================================================================
-- No cambia precios, solo copia tipo_cambio_detectado de enrichment a columna
-- ============================================================================

-- Paso 4b.1: Backup estado actual
INSERT INTO fix_tc_paralelo_audit_20260114
    (propiedad_id, precio_usd_antes, tipo_cambio_detectado_antes,
     grupo, descripcion_fix)
SELECT
    id,
    precio_usd,
    tipo_cambio_detectado,
    'fix4b_poblar',
    'Poblar columna desde enrichment'
FROM propiedades_v2
WHERE tipo_cambio_detectado IS NULL
  AND id NOT IN (30, 419, 465, 357, 425, 198, 236, 243, 353, 394, 415, 429, 430);

-- Paso 4b.2: Poblar columna desde datos_json_enrichment
UPDATE propiedades_v2 SET
    tipo_cambio_detectado = COALESCE(
        datos_json_enrichment->>'tipo_cambio_detectado',
        'no_especificado'
    ),
    tipo_cambio_usado = (datos_json_enrichment->>'tipo_cambio_usado')::NUMERIC(10,4),
    depende_de_tc = CASE
        WHEN COALESCE(datos_json_enrichment->>'tipo_cambio_detectado', 'no_especificado')
             IN ('paralelo', 'oficial')
             AND COALESCE(datos_json_enrichment->>'precio_fue_normalizado', 'false') = 'true'
        THEN true
        ELSE false
    END,
    fecha_actualizacion = NOW()
WHERE tipo_cambio_detectado IS NULL
  AND id NOT IN (30, 419, 465, 357, 425, 198, 236, 243, 353, 394, 415, 429, 430);

-- Paso 4b.3: Actualizar auditoría
UPDATE fix_tc_paralelo_audit_20260114 a SET
    precio_usd_despues = p.precio_usd,
    tipo_cambio_detectado_despues = p.tipo_cambio_detectado
FROM propiedades_v2 p
WHERE a.propiedad_id = p.id
  AND a.grupo = 'fix4b_poblar';

-- ============================================================================
-- FIX 5: VISTA DE MONITOREO PARA AUDITORÍA DIARIA
-- ============================================================================

CREATE OR REPLACE VIEW v_alerta_tc_paralelo_sin_detectar AS
SELECT
    id,
    url,
    precio_usd,
    tipo_cambio_detectado,
    datos_json_enrichment->>'tipo_cambio_detectado' as tc_enrichment,
    SUBSTRING(COALESCE(datos_json_enrichment->>'descripcion', ''), 1, 150) as descripcion_preview,
    'ALERTA: Menciona paralelo en descripción pero tc_detectado != paralelo' as alerta
FROM propiedades_v2
WHERE es_activa = true
  AND COALESCE(datos_json_enrichment->>'descripcion', '') ~*
      '(al\s+paralelo|t/c\.?\s*paralelo|tc\.?\s*paralelo|cambio\s+paralelo|dolares?\s+o\s+(al\s+)?paralelo|tipo\s+de\s+cambio\s+paralelo)'
  AND COALESCE(tipo_cambio_detectado, 'no_especificado') != 'paralelo';

COMMENT ON VIEW v_alerta_tc_paralelo_sin_detectar IS
'Alerta para auditoría diaria: propiedades que mencionan "paralelo" pero no fueron detectadas.
Si COUNT(*) > 0, revisar y corregir. Usado por workflow auditoría n8n.';

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================

DO $$
DECLARE
    v_fix4_count INTEGER;
    v_fix4b_count INTEGER;
    v_null_count INTEGER;
    v_alerta_count INTEGER;
BEGIN
    -- Contar Fix 4
    SELECT COUNT(*) INTO v_fix4_count
    FROM fix_tc_paralelo_audit_20260114
    WHERE grupo IN ('fix4_parsing', 'fix4_normalizar');

    -- Contar Fix 4b
    SELECT COUNT(*) INTO v_fix4b_count
    FROM fix_tc_paralelo_audit_20260114
    WHERE grupo = 'fix4b_poblar';

    -- Verificar que no quedan NULL
    SELECT COUNT(*) INTO v_null_count
    FROM propiedades_v2
    WHERE tipo_cambio_detectado IS NULL AND es_activa = true;

    -- Verificar alertas
    SELECT COUNT(*) INTO v_alerta_count
    FROM v_alerta_tc_paralelo_sin_detectar;

    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRACIÓN 059: Fix TC Paralelo completada';
    RAISE NOTICE '════════════════════════════════════════════════════════════════';
    RAISE NOTICE '📊 Fix 4:  % propiedades corregidas (precio normalizado)', v_fix4_count;
    RAISE NOTICE '📊 Fix 4b: % propiedades actualizadas (columna poblada)', v_fix4b_count;
    RAISE NOTICE '📊 Columnas NULL restantes: %', v_null_count;
    RAISE NOTICE '📊 Alertas pendientes: %', v_alerta_count;
    RAISE NOTICE '════════════════════════════════════════════════════════════════';

    IF v_null_count > 0 THEN
        RAISE WARNING '⚠️  Quedan % propiedades con tipo_cambio_detectado = NULL', v_null_count;
    END IF;

    IF v_alerta_count > 0 THEN
        RAISE WARNING '⚠️  Hay % propiedades en v_alerta_tc_paralelo_sin_detectar', v_alerta_count;
    END IF;
END $$;

-- ============================================================================
-- QUERIES DE VERIFICACIÓN (ejecutar manualmente después)
-- ============================================================================

-- Ver resumen de Fix 4 (13 propiedades con precio corregido)
/*
SELECT
    propiedad_id as id,
    grupo,
    precio_usd_antes as antes,
    precio_usd_despues as despues,
    ROUND((precio_usd_despues - precio_usd_antes) / NULLIF(precio_usd_antes, 0) * 100, 1) as pct_cambio,
    tipo_cambio_detectado_despues as tc_nuevo
FROM fix_tc_paralelo_audit_20260114
WHERE grupo IN ('fix4_parsing', 'fix4_normalizar')
ORDER BY propiedad_id;
*/

-- Ver distribución final de tipo_cambio_detectado
/*
SELECT
    tipo_cambio_detectado,
    depende_de_tc,
    COUNT(*) as total
FROM propiedades_v2
WHERE es_activa = true
GROUP BY 1, 2
ORDER BY total DESC;
*/

-- ============================================================================
-- ROLLBACK (en caso de emergencia)
-- ============================================================================
/*
-- Revertir Fix 4 (13 propiedades)
UPDATE propiedades_v2 p SET
    precio_usd = a.precio_usd_antes,
    precio_usd_original = a.precio_usd_original_antes,
    tipo_cambio_detectado = a.tipo_cambio_detectado_antes,
    tipo_cambio_paralelo_usado = NULL,
    depende_de_tc = false
FROM fix_tc_paralelo_audit_20260114 a
WHERE p.id = a.propiedad_id
  AND a.grupo IN ('fix4_parsing', 'fix4_normalizar');

-- Revertir Fix 4b (464 propiedades)
UPDATE propiedades_v2 p SET
    tipo_cambio_detectado = a.tipo_cambio_detectado_antes
FROM fix_tc_paralelo_audit_20260114 a
WHERE p.id = a.propiedad_id
  AND a.grupo = 'fix4b_poblar';
*/
