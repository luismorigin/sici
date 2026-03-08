-- ============================================================
-- Migración 181: Excluir 9 props fuera de zona de cobertura
-- Fecha: 2026-03-08
-- ============================================================

-- PARTE 1: Agregar valor 'excluida_zona' al enum estado_propiedad
-- IMPORTANTE: ejecutar este ALTER TYPE por separado ANTES del resto.
ALTER TYPE estado_propiedad ADD VALUE IF NOT EXISTS 'excluida_zona';

-- ============================================================
-- EJECUTAR DESDE AQUÍ EN UNA SEGUNDA EJECUCIÓN
-- ============================================================

-- PARTE 2: Excluir 9 props cuyo GPS cae fuera de los polígonos de microzonas
UPDATE propiedades_v2
SET status = 'excluida_zona'
WHERE id IN (
  285,   -- sin datos, sin zona, GPS fuera
  580,   -- CUPESI, Av. Ovidio Barbery
  581,   -- sin nombre, Av. Bush, URL dice "alquiler"
  598,   -- Mediterraneo 2, fuera de polígonos
  885,   -- Providence, 3er anillo externo
  886,   -- Maracana Apart Hotel, borde fuera
  1019,  -- Condominio San Andrés, fuera
  1055,  -- Millennial Tower, Av. Bush 1er-2do anillo
  1072   -- Portobello Green (Remax), GPS fuera
);

-- ============================================================
-- Verificación:
-- ============================================================
-- SELECT id, nombre_edificio, status, zona
-- FROM propiedades_v2
-- WHERE id IN (285, 580, 581, 598, 885, 886, 1019, 1055, 1072)
-- ORDER BY id;
-- Esperado: todas con status = 'excluida_zona'
-- ============================================================
