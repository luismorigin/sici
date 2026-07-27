-- =============================================================================
-- 306 — GRANT faltante: `v_estado_obra_inferido_shadow` para anon/authenticated
-- =============================================================================
-- 🔴 ESTO NO ES UNA MEJORA: ES UN BUG DE PRODUCCIÓN ACTIVO DESDE LA MIG 302.
--
-- SÍNTOMA: la PRIMERA PINTURA de `/ventas` sirve datos de PRODUCCIÓN (régimen TC
-- VIEJO) en vez de shadow. Medido el 27-jul-2026 sobre el lote real del SSG:
-- **6 de 23 propiedades con precio distinto, prod 67,3% más caro en promedio.**
-- Recién al hidratar, el fetch a `/api/ventas` (server-side, service_role) trae
-- los precios correctos y reemplaza la lista.
--
-- CAUSA: `getStaticProps` de `/ventas` usa el cliente **anon** y llama a
-- `rpcShadowFirst` (`simon-mvp/src/lib/rpc-shadow.ts`), que prueba la RPC
-- `_shadow` y **ante cualquier error cae a prod EN SILENCIO** (diseño
-- cutover-safe: cuando shadow→prod la RPC `_shadow` deja de existir y nada se
-- rompe). Desde la mig 302:
--
--   buscar_unidades_simple_shadow   -> ERROR: permission denied for view
--                                      v_estado_obra_inferido_shadow
--   buscar_unidades_alquiler_shadow -> OK (no toca esa vista)
--
-- La vista es el ÚNICO objeto de la cadena sin SELECT para `anon`. Verificado:
-- `propiedades_v2_shadow`, `proyectos_master`, `v_mercado_venta_shadow` y
-- `v_mercado_alquiler_shadow` **sí** lo tienen. La 302 la creó sin el GRANT y el
-- fallback tapó el error durante 3 días.
--
-- POR QUÉ ES SEGURO: la vista deriva de `propiedades_v2_shadow` y expone el
-- estado de obra inferido — exactamente lo que el feed público YA muestra en la
-- card ("Preventa" / "Entrega inmediata"). Mismo nivel de exposición que
-- `v_mercado_venta_shadow`, que anon ya lee. No hay PII ni datos internos.
--
-- 🔑 LECCIÓN (para el `_template.sql`): el template insiste —con razón— en
-- REVOCAR lo que sobra en tablas nuevas. Este caso es el REVERSO: **faltó
-- GRANT sobre un objeto nuevo del que dependía una RPC pública existente**. Al
-- crear una vista que una RPC consume, verificar `has_table_privilege('anon', …)`
-- sobre **la vista**, no solo sobre la tabla base. Y un fallback silencioso
-- convierte un error de permisos en un cambio de fuente de datos invisible.
-- =============================================================================

BEGIN;

GRANT SELECT ON public.v_estado_obra_inferido_shadow TO anon, authenticated;

COMMENT ON VIEW public.v_estado_obra_inferido_shadow IS
  'Estado de obra inferido (vecinos del edificio + alquiler activo). La consume '
  'buscar_unidades_simple_shadow, que se llama con la clave ANON desde el SSG de /ventas '
  '→ necesita SELECT para anon/authenticated o el feed cae a prod en silencio (mig 306). '
  'Creada en la mig 302, acotada a avisos vigentes en la 303.';

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr después de aplicar)
-- =============================================================================
--   SELECT has_table_privilege('anon','public.v_estado_obra_inferido_shadow','SELECT');  -- true
--
--   -- Y la prueba de verdad: que la RPC responda con la clave anon.
--   -- Debe devolver ids 8000xxx (shadow), no ids bajos (prod):
--   SELECT id FROM buscar_unidades_simple_shadow(
--     '{"limite":5,"orden":"recientes","zonas_permitidas":["Equipetrol Centro"]}'::jsonb);
--
-- ROLLBACK: REVOKE SELECT ON public.v_estado_obra_inferido_shadow FROM anon, authenticated;
--   (⚠️ revertir devuelve el feed a servir prod en la primera pintura.)
-- =============================================================================
