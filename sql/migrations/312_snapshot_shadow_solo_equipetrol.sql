-- ============================================================================
-- 312 — El snapshot shadow deja de escribir filas de Zona Norte
-- ============================================================================
-- POR QUÉ
-- El 29-jul-2026 el snapshot shadow pasó de 27 filas a 62: aparecieron 35 filas de
-- microzonas de Zona Norte. No las escribió el cron (su discovery filtra a Equipetrol):
-- las trajo la carga manual de ZN a `propiedades_v2_shadow`.
--
-- El `global` NO se contaminó — está blindado a las 6 zonas de Equipetrol dentro de la
-- propia función, y sus activas siguen la curva de siempre (442→443→443→447→450 del 25
-- al 29-jul). El LOOP 3 (alquiler por zona) tampoco: ya filtra `zona_general='Equipetrol'`.
--
-- El que no filtra es el LOOP 2 (venta por zona): itera TODAS las zonas presentes en
-- `v_mercado_venta_shadow`. Mientras shadow fue solo Equipetrol daba igual; con ZN adentro,
-- empieza a escribir una serie de ZN **con cobertura parcial** (hoy 188 de 448 props releídas).
-- Esa serie no miente sobre el mercado: miente sobre el inventario, porque va a "crecer"
-- a medida que releemos, no porque ZN gane propiedades. Es el peor tipo de dato: parece
-- una serie y es un artefacto del avance de la relectura.
--
-- DECISIÓN DEL FOUNDER (29-jul): ZN no entra a la serie hasta terminar de releerla.
--
-- QUÉ HACE
--   1. Parchea el LOOP 2 para que solo recorra zonas de Equipetrol — mismo criterio que
--      el LOOP 3 ya usaba (`zona_general = 'Equipetrol'`).
--   2. Borra las filas de ZN que ya se escribieron (solo las de zona; global intacto).
--
-- CÓMO (y por qué así)
-- No transcribe la función. La lee de la base con `pg_get_functiondef()` (regla crítica #7
-- del proyecto), reemplaza UNA línea y la re-ejecuta. Así no hay forma de introducir un
-- error de copia en 500 líneas, y si alguien cambió la función desde que se escribió esta
-- migración, ABORTA en vez de pisar su trabajo.
--
-- REVERSIÓN: quitar `AND zona_general = 'Equipetrol'` del LOOP 2 y correr
-- `SELECT snapshot_absorcion_mercado_shadow();` — las filas de ZN se regeneran solas,
-- pero solo desde ese día (los días borrados no vuelven; ver nota al pie).
-- ============================================================================

BEGIN;

DO $mig$
DECLARE
  v_def   TEXT;
  v_new   TEXT;
  v_veces INTEGER;
  -- El bucle de VENTA por zona, tal como está hoy en producción (una sola línea del def).
  v_from  TEXT := $q$SELECT DISTINCT zona FROM v_mercado_venta_shadow WHERE zona IS NOT NULL AND zona <> ''$q$;
  -- Mismo criterio que ya usa el LOOP 3 de alquiler.
  v_to    TEXT := $q$SELECT DISTINCT zona FROM v_mercado_venta_shadow WHERE zona IS NOT NULL AND zona <> '' AND zona_general = 'Equipetrol'$q$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'snapshot_absorcion_mercado_shadow';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'No existe public.snapshot_absorcion_mercado_shadow() — nada que parchear.';
  END IF;

  -- ¿Ya está aplicada? (idempotencia: correrla dos veces no debe romper nada)
  IF position(v_to IN v_def) > 0 THEN
    RAISE NOTICE 'El LOOP 2 ya filtra a Equipetrol — no se toca la función.';
  ELSE
    v_veces := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);

    IF v_veces <> 1 THEN
      RAISE EXCEPTION
        'El bucle de venta por zona aparece % veces en la funcion (esperaba exactamente 1). '
        'La funcion cambio desde que se escribio esta migracion: revisar a mano antes de aplicar.',
        v_veces;
    END IF;

    v_new := replace(v_def, v_from, v_to);
    EXECUTE v_new;
    RAISE NOTICE 'LOOP 2 parcheado: el snapshot de venta por zona ahora solo recorre Equipetrol.';
  END IF;
END
$mig$;

-- ── 2. Limpiar las filas de ZN ya escritas ──────────────────────────────────
-- Solo filas POR ZONA de macrozona distinta de Equipetrol. `global` NO se toca (nunca
-- tuvo ZN adentro) y las 6 zonas de Equipetrol tampoco.
DELETE FROM market_absorption_snapshots_shadow
WHERE zona <> 'global'
  AND zona NOT IN ('Equipetrol Centro','Equipetrol Norte','Sirari',
                   'Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo');

-- ── Verificación (mirar ANTES de decidir COMMIT o ROLLBACK) ─────────────────
SELECT fecha,
       COUNT(*) FILTER (WHERE zona = 'global')                    AS filas_global,
       COUNT(*) FILTER (WHERE zona <> 'global')                   AS filas_por_zona,
       SUM(venta_activas) FILTER (WHERE zona = 'global')          AS activas_equipetrol
FROM market_absorption_snapshots_shadow
WHERE fecha >= CURRENT_DATE - 5
GROUP BY fecha
ORDER BY fecha DESC;
-- Esperado: filas_global = 4 todos los días · filas_por_zona = 23 todos los días
--           activas_equipetrol siguiendo su curva (442→443→443→447→450), sin saltos.

COMMIT;

-- ============================================================================
-- CUANDO ZN ESTÉ LISTA (las 448 releídas)
-- ============================================================================
-- Quitar el filtro del LOOP 2 y dejar que la serie de ZN arranque desde CERO ese día.
-- 🔴 NO intentar "recuperar" los días de julio: esas filas reflejaban una zona a medio
-- releer y su inventario creciente era el avance de la relectura, no el mercado.
-- Una serie que arranca limpia el día que la zona está completa vale más que una larga
-- que empieza torcida — es la misma lección de las `filter_version` de la tabla de prod.
-- ============================================================================
