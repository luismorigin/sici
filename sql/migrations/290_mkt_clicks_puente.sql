-- =============================================================================
-- 290 · mkt_clicks_puente — registro de clicks del endpoint /ir
-- =============================================================================
-- Qué resuelve: hoy publicamos en IG/FB/TikTok y los captions mandan directo a
-- wa.me. Un UTM en wa.me NO registra nada (no es nuestro dominio), así que no se
-- puede saber qué pieza trae gente. El endpoint /ir/:codigo pasa por dominio
-- propio, registra acá y recién después redirige a WhatsApp.
--
-- Por qué una tabla y no solo GA4 (decisión 22-jul-2026, MEDICION_FUNNEL_PLAN.md):
--   1. Un 302 server-side NO ejecuta JavaScript → gtag nunca dispara. Registrar
--      en GA4 desde el server exigiría Measurement Protocol (client_id inventado,
--      sesiones raras). El registro propio es exacto y no depende del browser.
--   2. GA4 no deja hacer JOIN. Acá se cruza con mkt_piezas y con leads_alquiler.
--   3. A 3 contactos/mes, poder mirar los clicks de a uno vale más que un %.
--
-- Los bots (crawlers de FB/WhatsApp que piden el link para armar el preview) NO
-- se registran: el endpoint los detecta por user-agent y redirige sin tocar la BD.
-- Es la misma lección de leads_alquiler.es_bot, aplicada antes de ensuciar el dato.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly). Registrar en
-- docs/migrations/MIGRATION_INDEX.md.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tabla
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mkt_clicks_puente (
  id            BIGSERIAL PRIMARY KEY,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Origen declarado por el link
  codigo        TEXT,        -- 'f03' (forma corta). NULL si vino la forma larga.
  pieza_num     INT,         -- mkt_piezas.num. NULL si el código no resolvió.
  red           TEXT,        -- facebook | instagram | tiktok | meta

  -- UTM que se le atribuyen a la visita (los arma el endpoint desde el código)
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_content   TEXT,

  -- Contexto del click
  valido        BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = código inexistente (link mal armado)
  destino       TEXT,        -- a dónde se lo mandó (para depurar)
  referer       TEXT,
  user_agent    TEXT
);

COMMENT ON TABLE public.mkt_clicks_puente IS
  'Un click en el link puente /ir/:codigo antes de saltar a WhatsApp. Dueño: pages/api/ir. '
  'Consumers: análisis de qué pieza trae gente (JOIN mkt_piezas por pieza_num). '
  'NO guarda IP a propósito. Los bots no se registran (se filtran por user-agent en el endpoint). '
  'Creada en migración 290. Contexto: docs/backlog/MEDICION_FUNNEL_PLAN.md';

COMMENT ON COLUMN public.mkt_clicks_puente.valido IS
  'FALSE = el código no resolvió a ninguna pieza. Se registra igual: un pico de '
  'inválidos significa que hay un caption publicado con el link mal escrito.';

CREATE INDEX IF NOT EXISTS mkt_clicks_puente_idx_creado_en
  ON public.mkt_clicks_puente (creado_en DESC);
CREATE INDEX IF NOT EXISTS mkt_clicks_puente_idx_pieza
  ON public.mkt_clicks_puente (pieza_num, creado_en DESC);

-- -----------------------------------------------------------------------------
-- 2. GRANTS — Preset D (operacional interna: solo el server escribe)
-- -----------------------------------------------------------------------------
-- 🔴 REVOCAR PRIMERO (lección mig 283→284): toda tabla nueva en `public` nace
-- con anon/authenticated en ALL por los DEFAULT PRIVILEGES del schema, y los
-- GRANT suman pero no revocan. Sin esto, cualquiera con la anon key podría
-- escribir clicks falsos desde el browser y arruinar el dato de atribución.
REVOKE ALL ON public.mkt_clicks_puente FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.mkt_clicks_puente_id_seq FROM anon, authenticated;

GRANT ALL    ON public.mkt_clicks_puente          TO service_role;
GRANT USAGE  ON SEQUENCE public.mkt_clicks_puente_id_seq TO service_role;
GRANT SELECT ON public.mkt_clicks_puente          TO claude_readonly;

-- -----------------------------------------------------------------------------
-- 3. Vista de lectura — "qué pieza trajo gente"
-- -----------------------------------------------------------------------------
-- Sin SECURITY DEFINER (Regla: docs/canonical/SEGURIDAD_SUPABASE.md).
CREATE OR REPLACE VIEW public.v_mkt_clicks_por_pieza AS
SELECT
  c.pieza_num,
  p.nombre                                        AS pieza,
  c.red,
  COUNT(*)                                        AS clicks,
  COUNT(*) FILTER (WHERE c.creado_en > NOW() - INTERVAL '7 days')  AS clicks_7d,
  MIN(c.creado_en)                                AS primer_click,
  MAX(c.creado_en)                                AS ultimo_click
FROM public.mkt_clicks_puente c
LEFT JOIN public.mkt_piezas p ON p.num = c.pieza_num
WHERE c.valido
GROUP BY c.pieza_num, p.nombre, c.red;

COMMENT ON VIEW public.v_mkt_clicks_por_pieza IS
  'Clicks al puente agrupados por pieza y red. Solo códigos válidos. '
  'OJO: mide CLICKS, no leads — entre el click y el contacto está WhatsApp, '
  'que se cierra con el webhook de Kapso (paso 4 de MEDICION_FUNNEL_PLAN.md).';

GRANT SELECT ON public.v_mkt_clicks_por_pieza TO service_role, claude_readonly;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación post-aplicación (correr a mano)
-- -----------------------------------------------------------------------------
-- SELECT relacl::text FROM pg_class WHERE relname = 'mkt_clicks_puente';
--   → NO debe aparecer anon ni authenticated.
-- SELECT * FROM public.v_mkt_clicks_por_pieza ORDER BY clicks DESC;
