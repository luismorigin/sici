-- Migración 256: agregar contacto_directo a simon_brokers
--
-- Contexto: las shortlists del bot de WhatsApp de Simón (broker
-- `simon-asistente`) se renderizan en /b/[hash] en publicShareMode, así que
-- TODOS los CTA de contacto caen en el teléfono del bot (el broker dueño del
-- shortlist). Este flag permite, SOLO para ese broker, que los botones de
-- contacto por propiedad abran el WhatsApp del CAPTADOR de cada propiedad
-- (venta → agente_telefono; alquiler → agente_whatsapp), tal como el feed.
-- Materializa el modelo B2C de desintermediación (Simón conecta, no se
-- interpone). Ver docs/broker/CONTACTO_DIRECTO_B2C_PLAN.md.
--
-- Decisiones:
--  1. BOOLEAN NOT NULL DEFAULT FALSE — aditivo, no rompe brokers existentes.
--     Garantía de no-regresión: para todo broker de pago (flag false) las
--     condiciones de contacto quedan algebraicamente inalteradas (§5 del plan).
--  2. ALTER sobre tabla EXISTENTE → NO requiere GRANT nuevo (los grants de
--     simon_brokers ya cubren todas sus columnas). No aplica Regla 6.
--  3. El UPDATE de activación va SEPARADO del ADD COLUMN (abajo, comentado).
--     Secuencia de rollout (BD compartida prod/preview, §14 del plan):
--       (a) aplicar SOLO el ADD COLUMN ahora → columna INERTE, ningún código
--           en prod la lee todavía → cero efecto en prod.
--       (b) implementar el código en el branch + QA en preview Vercel.
--       (c) recién al mergear a main, correr el UPDATE para activar el flag.
--     Por eso el UPDATE está comentado: NO ejecutarlo en el paso (a).
--
-- Precondición: 231 aplicada (simon_brokers existe).
-- Rollback: ALTER TABLE public.simon_brokers DROP COLUMN contacto_directo;
--           (o desactivar sin re-deploy: UPDATE ... SET contacto_directo=false)

ALTER TABLE public.simon_brokers
  ADD COLUMN contacto_directo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.simon_brokers.contacto_directo IS
  'B2C: si true, las shortlists de este broker en /b/[hash] contactan al
   CAPTADOR de cada propiedad (agente_telefono venta / agente_whatsapp
   alquiler) en vez del broker dueño, reusando el comportamiento del feed.
   Solo activo en simon-asistente (el bot). Default false = comportamiento
   B2B intacto (lead va al broker). Migración 256.';

-- =============================================================================
-- ACTIVACIÓN (paso c del rollout — NO correr junto con el ADD COLUMN)
-- =============================================================================
-- Ejecutar SOLO al mergear el código a main (ver decisión 3 arriba).
--
--   UPDATE public.simon_brokers
--   SET contacto_directo = true
--   WHERE slug = 'simon-asistente';
--
-- Rollback de la activación (sin re-deploy):
--   UPDATE public.simon_brokers
--   SET contacto_directo = false
--   WHERE slug = 'simon-asistente';

-- =============================================================================
-- Verificación post-aplicación (del ADD COLUMN)
-- =============================================================================
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'simon_brokers' AND column_name = 'contacto_directo';
--   -- data_type='boolean', is_nullable='NO', column_default='false'
--
--   SELECT slug, contacto_directo FROM simon_brokers ORDER BY slug;
--   -- todos en false inmediatamente post-ADD COLUMN (antes del UPDATE)
