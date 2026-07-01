-- ============================================================================
-- Migración 267 — Permitir modo='fetch' en audit_descripciones_runs (1-jul-2026)
-- ============================================================================
-- Origen: al correr /audit-feed-ventas-mensual-fetch --macrozona=zona-norte, el
-- script no pudo persistir su corrida:
--   ERROR: new row for relation "audit_descripciones_runs" violates check
--          constraint "audit_descripciones_runs_modo_check"
--
-- Causa: la mig 242 definió la columna `modo` con CHECK (modo IN ('normal',
-- 'cached', 'partial')). La skill gemela $0 (fetcher directo C21 ?json / Remax
-- data-page) escribe modo='fetch' para distinguirla en el histórico, pero ese
-- valor no está permitido → el INSERT falla y la corrida no se guarda (el
-- reporte local sí se genera; solo se pierde la persistencia).
--
-- Fix: agregar 'fetch' al CHECK del constraint (recrear el constraint) + actualizar
-- el comentario de la columna. Sin pérdida de datos (solo amplía valores válidos).
-- El MCP es readonly: aplicar en Supabase UI/psql.
-- ============================================================================

BEGIN;

ALTER TABLE audit_descripciones_runs
  DROP CONSTRAINT IF EXISTS audit_descripciones_runs_modo_check;

ALTER TABLE audit_descripciones_runs
  ADD CONSTRAINT audit_descripciones_runs_modo_check
  CHECK (modo IN ('normal', 'cached', 'partial', 'fetch'));

COMMENT ON COLUMN audit_descripciones_runs.modo IS
'normal=corrida con Firecrawl, fetch=fetcher directo $0 (C21 ?json / Remax data-page), cached=re-procesada de un run previo, partial=solo subset de props';

COMMIT;

-- ============================================================================
-- ROLLBACK (revertir al constraint original de la mig 242)
-- ============================================================================
-- BEGIN;
-- ALTER TABLE audit_descripciones_runs
--   DROP CONSTRAINT IF EXISTS audit_descripciones_runs_modo_check;
-- ALTER TABLE audit_descripciones_runs
--   ADD CONSTRAINT audit_descripciones_runs_modo_check
--   CHECK (modo IN ('normal', 'cached', 'partial'));
-- COMMENT ON COLUMN audit_descripciones_runs.modo IS
-- 'normal=corrida con Firecrawl, cached=re-procesada de un run previo, partial=solo subset de props';
-- COMMIT;
