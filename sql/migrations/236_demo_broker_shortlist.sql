-- Migración 236: Broker demo + shortlist demo para prospección
--
-- Contexto: sistema de demos públicos sin login para prospect de brokers
-- (Sprint 1 — Demo Cliente). Crea una row real en simon_brokers con
-- slug='demo' y una shortlist real con hash='demo'. La página /b/demo
-- bypasea gates de status/expiración/views (ver lib/demo-mode.ts y
-- pages/b/[hash].tsx) y muestra esta selección como "muestra de cómo
-- recibirían tus clientes una shortlist tuya".
--
-- Por qué row real (en lugar de mockear en código):
--  1. Reusa toda la infra de /b/[hash], /api/public/shortlist-hearts y
--     getStaticPaths de /broker/[slug] sin código especial fuera del guard.
--  2. La shortlist demo aparece igual que cualquier otra en SQL ad-hoc
--     (debugging y queries de mercado quedan iguales).
--  3. Sprint 2 (Demo Broker) reusa el row /broker/demo automáticamente.
--
-- Idempotente: re-ejecutar la migración no rompe nada — usa UPSERTs y
-- DELETE+INSERT para los items.
--
-- Selección de las 8 propiedades curadas:
--   Diversificación por zona (Centro/Norte/Sirari/Brigida — 2 c/u),
--   tipologías 2-4 dorms, rango $143k–$538k, fotos ≥18 c/u, ≤120 días en
--   mercado al momento de la migración. Si una sale del mercado, /b/demo
--   se ve con 7 items (mapRow filter en pages/b/[hash].tsx); reemplazar
--   manualmente cuando suceda.

BEGIN;

-- 1. Broker demo (placeholder visible al broker prospect).
--    Nombre "[Tu Nombre]" es literal — los corchetes son la pista visual
--    de que en producción aparecería el nombre real del broker.
--    Telefono = founder WhatsApp para que cualquier click llegue a Luis.
INSERT INTO simon_brokers (slug, nombre, telefono, foto_url, inmobiliaria, status, notas)
VALUES (
  'demo',
  '[Tu Nombre]',
  '+59176308808',
  NULL,
  'Tu Inmobiliaria',
  'activo',
  'Broker placeholder para sistema de demos (/b/demo y /broker/demo). NO eliminar — slug y telefono usados en lib/demo-config.ts.'
)
ON CONFLICT (slug) DO UPDATE SET
  nombre        = EXCLUDED.nombre,
  telefono      = EXCLUDED.telefono,
  foto_url      = EXCLUDED.foto_url,
  inmobiliaria  = EXCLUDED.inmobiliaria,
  status        = 'activo',
  notas         = EXCLUDED.notas,
  updated_at    = NOW();

-- 2. Shortlist demo. expires_at lejano y max_views absurdamente alto son
--    defensa-en-profundidad — el SSR salta los gates igual cuando hash='demo'
--    (ver lib/demo-mode.ts), pero si alguien deshabilita el guard por error,
--    el cap nominal sigue siendo no-restrictivo.
INSERT INTO broker_shortlists (
  broker_slug, hash, cliente_nombre, cliente_telefono, mensaje_whatsapp,
  is_published, expires_at, max_views, status
)
VALUES (
  'demo',
  'demo',
  'Cliente Demo',
  '+59176308808',
  NULL,
  TRUE,
  '2099-12-31 23:59:59+00',
  999999,
  'active'
)
ON CONFLICT (hash) DO UPDATE SET
  broker_slug      = 'demo',
  cliente_nombre   = EXCLUDED.cliente_nombre,
  cliente_telefono = EXCLUDED.cliente_telefono,
  is_published     = TRUE,
  archived_at      = NULL,
  expires_at       = EXCLUDED.expires_at,
  max_views        = EXCLUDED.max_views,
  status           = 'active',
  updated_at       = NOW();

-- 3. Items: limpiar previos y reinsertar los 8 curados.
--    DELETE+INSERT (en lugar de UPSERT) porque permite cambiar la composición
--    de la shortlist sin tener que listar IDs viejos para borrar.
DELETE FROM broker_shortlist_items
WHERE shortlist_id = (SELECT id FROM broker_shortlists WHERE hash = 'demo');

INSERT INTO broker_shortlist_items (
  shortlist_id, propiedad_id, tipo_operacion, orden, comentario_broker
)
SELECT
  (SELECT id FROM broker_shortlists WHERE hash = 'demo'),
  v.propiedad_id, 'venta', v.orden, v.comentario
FROM (VALUES
  -- Equipetrol Centro
  (1339, 1, 'Edificio premium en el corazón de Equipetrol Centro'),
  (595,  2, 'Departamento amplio para familia, 4 dorms calle H'),
  -- Equipetrol Norte
  (503,  3, 'Sky Moon — vista despejada, zona financiera'),
  (1554, 4, 'Sky Lumiere — equilibrio precio/m² en Norte'),
  -- Sirari
  (1273, 5, 'Impera Tower — entry-level Sirari premium'),
  (491,  6, 'Legendary by EliTe — desarrollo nuevo'),
  -- Villa Brigida
  (1208, 7, 'Stone 2 — opción accesible Villa Brígida'),
  (430,  8, 'Condominio Luciana — m² competitivos')
) AS v(propiedad_id, orden, comentario);

COMMIT;

-- Verificación post-migración:
--   SELECT b.slug, s.hash, s.status, COUNT(i.*) AS items
--   FROM simon_brokers b
--   JOIN broker_shortlists s ON s.broker_slug = b.slug
--   LEFT JOIN broker_shortlist_items i ON i.shortlist_id = s.id
--   WHERE b.slug = 'demo'
--   GROUP BY b.slug, s.hash, s.status;
-- Esperado: 1 row, slug='demo', hash='demo', status='active', items=8.
