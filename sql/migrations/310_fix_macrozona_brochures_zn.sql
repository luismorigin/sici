-- =============================================================================
-- 310 · Corregir la macrozona de 2 brochures de Zona Norte
-- =============================================================================
-- QUÉ PASÓ (28-jul-2026, primera carga de ZN al entorno shadow)
-- Al migrar `cargar-deptos-shadow.mjs` a la perilla de zona se cambiaron las
-- LECTURAS de `macrozona` pero quedó la ESCRITURA con 'equipetrol' fijo. Los dos
-- avisos-proyecto de la primera tanda de ZN (Barcelona 04-05 "Miro Tower", zona
-- 4to-6to anillo Radial 26-Banzer) entraron a `proyectos_detectados` etiquetados
-- como Equipetrol.
--
-- POR QUÉ IMPORTA (no es cosmético)
-- `proyectos_detectados` existe para que los brochures ya clasificados NO vuelvan
-- a contarse como "nuevas" en cada discovery. Cada discovery los busca por SU
-- macrozona. Con la etiqueta equivocada:
--   · el discovery de Zona Norte no los encuentra → los reporta como nuevas
--     TODAS las noches, para siempre (exactamente el bug que la tabla evita), y
--   · la cola de Equipetrol queda con 2 registros que no le corresponden.
--
-- El código ya está corregido (la escritura usa ZONA.macrozona). Esto repara las
-- 2 filas que alcanzaron a escribirse con el valor viejo.
--
-- IDEMPOTENTE: si ya se corrigió, el WHERE no encuentra nada y no hace daño.
-- =============================================================================

BEGIN;

UPDATE proyectos_detectados
SET macrozona = 'zona-norte'
WHERE id IN (104, 105)
  AND macrozona = 'equipetrol'          -- candado: solo si sigue con el valor malo
  AND zona = '4to-6to anillo Radial 26-Banzer';   -- candado: y solo si la zona es de ZN

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (read-only, correr después)
-- =============================================================================
-- Esperado: 2 filas en 'zona-norte', ninguna fila de ZN etiquetada 'equipetrol'.
--
--   SELECT macrozona, zona, nombre_proyecto FROM proyectos_detectados
--   WHERE id IN (104, 105);
--
--   -- Control general: ninguna zona de ZN debería estar bajo macrozona equipetrol
--   SELECT macrozona, COUNT(*) FROM proyectos_detectados
--   WHERE zona ILIKE '%anillo%' GROUP BY 1;
-- =============================================================================

-- ROLLBACK (si hiciera falta volver atrás):
--   UPDATE proyectos_detectados SET macrozona = 'equipetrol' WHERE id IN (104, 105);
