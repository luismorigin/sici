-- =============================================================================
-- 318 · BSUID — empezar a GUARDAR el identificador nuevo de Meta (paso 1 de 2)
-- =============================================================================
-- QUÉ ESTÁ PASANDO: Meta está sacando el número de teléfono del payload de
-- WhatsApp. Quien adopta un **username** (`@nombre`) obtiene privacidad de número
-- y `wa_id` / `from` **desaparecen del payload** — no llegan vacíos, no llegan.
-- En su lugar viaja el **BSUID** (business-scoped user ID), formato
-- `BO.2453994595121663` (ISO-3166 + "." + hasta 128 alfanuméricos).
-- Kapso mide 1,27% de mensajes sin teléfono al 10-ago-2026, contra 0,00% el
-- 28-jul. Sube. Y **no hay recurso**: si llega un webhook que no procesamos, Meta
-- no lo reenvía ni lo corrige.
--
-- 🔴 POR QUÉ ESTA MIGRACIÓN ES SOLO ADITIVA: el problema tiene dos mitades y son
-- independientes. Esta es la URGENTE y no depende de la otra:
--   · paso 1 (mig 318, esta) — GUARDAR el BSUID de cada evento que entra, mientras
--     Meta todavía manda LOS DOS identificadores. Cada día que pasa es mapeo
--     teléfono↔BSUID que se pierde para siempre: cuando un cliente adopte username
--     ya no se puede construir para él. Nada cambia de comportamiento.
--   · paso 2 (mig 319) — que la IDENTIDAD deje de ser el teléfono. Eso sí toca
--     constraints, vistas y la vigilancia del bot, y va aparte.
--
-- ⚠️ EL ÍNDICE DE (portfolio, bsuid) VA **NO ÚNICO** A PROPÓSITO. En el paso 1 el
-- BSUID se escribe "de arriba" sobre contactos que se siguen matcheando por
-- teléfono; si el índice fuera único, una inconsistencia de datos haría fallar el
-- INSERT del webhook → 500 → Kapso reintenta → el mensaje se pierde igual, que es
-- justo lo que estamos tratando de evitar. La unicidad la impone la mig 319, una
-- vez que el matcheo pasa por la función que garantiza el invariante. La consulta
-- de verificación de abajo detecta duplicados ANTES de aplicar la 319.
--
-- 🔑 El BSUID NO es único global: está scopeado al **portfolio comercial**. Hoy
-- Simón tiene uno solo (`2073772363472695`, portfolio "Simón" — ver lab-kapso
-- DECISIONES.md D30), así que en la práctica el par es constante. Pero si algún
-- día se consolida la WABA en *Casapatiobolivia*, **los BSUID de los mismos
-- clientes cambian**. Guardar el portfolio ahora evita mezclar historiales de
-- personas distintas después.
--
-- 🔴 Y NO ES ESTABLE EN EL TIEMPO — verificado en los datos del propio founder
-- (API de Kapso, 11-ago-2026). El número +591 76308808 tiene **tres BSUID
-- distintos**, y las fechas los explican:
--     hasta 22-may   BO.1023162320171284   (phone_number_id 597907523413541, el viejo)
--     23-may→24-jul  BO.2453994595121663   (phone_number_id 998245303375051)
--     desde 28-jul   BO.1490485676452856   (mismo número, otro BSUID)
-- El 28-jul es exactamente el día de la reconexión de coexistencia del incidente
-- D30: **al reconectar la WABA, el BSUID de la misma persona cambió**. Meta avisa
-- de esto con la notificación `user_id_update`, que nadie estaba escuchando.
--
-- Por eso la identidad NO puede ser una sola columna: si el vínculo se guardara
-- solo con el BSUID vigente, un evento con el anterior no encontraría a nadie y
-- crearía un **duplicado imposible de fusionar** — justo lo que el briefing manda
-- evitar. Los BSUID viejos se conservan como **alias** en `simon_contacto_bsuids`,
-- y `simon_contactos.business_scoped_user_id` guarda el vigente (denormalizado,
-- para consultas cómodas y para el índice único del paso 2).
--
-- Briefing completo: lab-kapso/BRIEFING_SICI_BSUID.md (D31, 11-ago-2026).
-- Guía de Meta/Kapso: https://kapso.com/guides/business-scoped-user-ids
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. simon_contactos — los identificadores nuevos, todos opcionales
-- -----------------------------------------------------------------------------
-- TEXT sin límite: la guía pide tolerar al menos 135 caracteres por columna de
-- BSUID (el formato admite hasta 128 alfanuméricos después del prefijo ISO).
ALTER TABLE public.simon_contactos
  ADD COLUMN IF NOT EXISTS business_scoped_user_id        TEXT,
  ADD COLUMN IF NOT EXISTS parent_business_scoped_user_id TEXT,
  ADD COLUMN IF NOT EXISTS username                       TEXT,
  ADD COLUMN IF NOT EXISTS meta_portfolio_id              TEXT,
  ADD COLUMN IF NOT EXISTS phone_number_id                TEXT,
  ADD COLUMN IF NOT EXISTS bsuid_visto_at                 TIMESTAMPTZ;

COMMENT ON COLUMN public.simon_contactos.business_scoped_user_id IS
  'Identificador de usuario scopeado al negocio (BSUID) que Meta está poniendo en '
  'lugar del teléfono. Formato ISO-3166 + "." + alfanuméricos: BO.2453994595121663. '
  'NO es único global — la identidad es el PAR (meta_portfolio_id, este). Mig 318.';
COMMENT ON COLUMN public.simon_contactos.parent_business_scoped_user_id IS
  'Variante ENT del BSUID (US.ENT.xxxx) para cuentas agrupadas en un portfolio '
  'empresarial. Hoy siempre NULL en Simón. Mig 318.';
COMMENT ON COLUMN public.simon_contactos.username IS
  'Username de WhatsApp (@nombre) si la persona adoptó uno. Es JUSTO quien deja de '
  'mandar el teléfono. Mig 318.';
COMMENT ON COLUMN public.simon_contactos.meta_portfolio_id IS
  'Portfolio comercial de Meta al que pertenece el BSUID. Hoy 2073772363472695 '
  '("Simón", lab-kapso D30). No viene en el payload: lo pone el webhook desde la '
  'env var META_PORTFOLIO_ID. Sin esto, dos portfolios mezclarían personas. Mig 318.';
COMMENT ON COLUMN public.simon_contactos.phone_number_id IS
  'phone_number_id de Meta del número del bot que recibió el mensaje. Sí viene en '
  'el payload; se guarda porque es el puente para deducir el portfolio si algún día '
  'hay más de uno. Mig 318.';
COMMENT ON COLUMN public.simon_contactos.bsuid_visto_at IS
  'Cuándo se vio el BSUID de este contacto por última vez. Sirve para medir si el '
  'backfill está capturando algo de verdad (ver v_bsuid_cobertura). Mig 318.';

-- -----------------------------------------------------------------------------
-- 2. simon_mensajes — el BSUID del remitente, mensaje por mensaje
-- -----------------------------------------------------------------------------
-- Denormalizado igual que `telefono`: si el vínculo con el contacto se rehiciera
-- mal, el mensaje sigue diciendo de quién era.
ALTER TABLE public.simon_mensajes
  ADD COLUMN IF NOT EXISTS business_scoped_user_id TEXT;

COMMENT ON COLUMN public.simon_mensajes.business_scoped_user_id IS
  'BSUID de la persona (no del negocio) en este mensaje. Denormalizado a propósito, '
  'igual que telefono. Mig 318.';

-- -----------------------------------------------------------------------------
-- 3. simon_contacto_bsuids — TODOS los BSUID de una persona, no solo el vigente
-- -----------------------------------------------------------------------------
-- Existe porque el BSUID cambia (ver encabezado: 3 valores para el mismo número).
-- Sin esta tabla, el mapeo que se puede reconstruir HOY desde la API de Kapso se
-- guardaría incompleto — un valor por persona en vez de su historia — y un evento
-- que llegue con un identificador viejo crearía un contacto duplicado.
CREATE TABLE IF NOT EXISTS public.simon_contacto_bsuids (
  id                      BIGSERIAL PRIMARY KEY,
  contacto_id             UUID NOT NULL REFERENCES public.simon_contactos(id) ON DELETE CASCADE,
  meta_portfolio_id       TEXT NOT NULL,
  business_scoped_user_id TEXT NOT NULL,
  phone_number_id         TEXT,
  origen                  TEXT NOT NULL DEFAULT 'webhook'
                            CHECK (origen IN ('webhook','backfill_api','user_id_update')),
  primero_visto_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_visto_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 🔑 El par identifica a UNA persona. Es esta restricción la que hace posible
  -- el matcheo BSUID→contacto sin ambigüedad, y la que va a impedir que dos
  -- contactos se queden con el mismo identificador.
  CONSTRAINT simon_contacto_bsuids_par_key UNIQUE (meta_portfolio_id, business_scoped_user_id)
);

COMMENT ON TABLE public.simon_contacto_bsuids IS
  'Todos los BSUID que Meta le dio a una persona a lo largo del tiempo (cambian: al '
  'reconectar la WABA el 28-jul-2026 cambiaron todos). El vigente es el de mayor '
  'ultimo_visto_at, y está denormalizado en simon_contactos. Sirve para reconocer a '
  'alguien que vuelve con un identificador viejo. Mig 318.';
COMMENT ON COLUMN public.simon_contacto_bsuids.origen IS
  'webhook = lo trajo un evento en vivo · backfill_api = reconstruido desde la API de '
  'Kapso (scripts/kapso-bsuid) · user_id_update = Meta avisó del cambio.';

CREATE INDEX IF NOT EXISTS simon_contacto_bsuids_idx_contacto
  ON public.simon_contacto_bsuids (contacto_id, ultimo_visto_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Índices — NO únicos (ver el encabezado: la unicidad llega en la 319)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS simon_contactos_idx_bsuid
  ON public.simon_contactos (meta_portfolio_id, business_scoped_user_id)
  WHERE business_scoped_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS simon_mensajes_idx_bsuid
  ON public.simon_mensajes (business_scoped_user_id)
  WHERE business_scoped_user_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. 🎯 LA VISTA QUE DICE SI EL BACKFILL ESTÁ CAPTURANDO ALGO
-- -----------------------------------------------------------------------------
-- 🔴 Existe por una duda concreta y NO resuelta: está verificado que la **API** de
-- Kapso expone `business_scoped_user_id` en las conversaciones, pero el ejemplo
-- oficial del payload v2 de **webhook** no lo lista — y SICI solo ve el webhook.
-- Si no viniera, el ingest escribiría NULL en cada evento y todo "andaría" sin
-- guardar nada. Esta vista es la que delata ese caso: si pasan los días y
-- `con_bsuid` sigue en 0 mientras entran mensajes, el BSUID no está llegando por
-- ese camino y hay que traerlo de la API (scripts/kapso-bsuid/).
CREATE OR REPLACE VIEW public.v_bsuid_cobertura AS
SELECT
  'contactos'                                        AS que,
  COUNT(*)                                           AS total,
  COUNT(business_scoped_user_id)                     AS con_bsuid,
  COUNT(*) - COUNT(business_scoped_user_id)          AS sin_bsuid,
  COUNT(telefono)                                    AS con_telefono,
  COUNT(*) - COUNT(telefono)                         AS sin_telefono,
  COUNT(username)                                    AS con_username,
  ROUND(100.0 * COUNT(business_scoped_user_id) / NULLIF(COUNT(*), 0), 1) AS pct_con_bsuid,
  MAX(bsuid_visto_at)                                AS ultimo_bsuid_visto
FROM public.simon_contactos
UNION ALL
SELECT
  'mensajes',
  COUNT(*),
  COUNT(business_scoped_user_id),
  COUNT(*) - COUNT(business_scoped_user_id),
  COUNT(telefono),
  COUNT(*) - COUNT(telefono),
  NULL,
  ROUND(100.0 * COUNT(business_scoped_user_id) / NULLIF(COUNT(*), 0), 1),
  MAX(enviado_at) FILTER (WHERE business_scoped_user_id IS NOT NULL)
FROM public.simon_mensajes
UNION ALL
-- Los alias no son un detalle: en los datos de hoy una sola persona tiene 3 BSUID.
-- Si `total` acá no supera a los contactos con BSUID, es que la historia se está
-- perdiendo y solo se guarda el último.
SELECT
  'alias_bsuid',
  COUNT(*),
  COUNT(*),
  0,
  NULL, NULL, NULL,
  NULL,
  MAX(ultimo_visto_at)
FROM public.simon_contacto_bsuids;

COMMENT ON VIEW public.v_bsuid_cobertura IS
  'Cuántos contactos y mensajes tienen ya guardado el BSUID de Meta, y cuántos alias '
  'históricos hay. Es el termómetro del backfill: si entran mensajes y con_bsuid no '
  'sube, el identificador no está llegando por el webhook. PII-free (solo conteos), '
  'pero igual sin anon. Mig 318.';

-- -----------------------------------------------------------------------------
-- 6. GRANTS — Preset D (operacional interna). REVOKE primero (Regla 13).
-- -----------------------------------------------------------------------------
-- Las columnas nuevas heredan la ACL de su tabla (ya revocada en la mig 292), pero
-- la TABLA, su SECUENCIA y la VISTA son objetos NUEVOS: nacen con anon/authenticated
-- en ALL por los default privileges del schema, y los GRANT suman sin revocar.
REVOKE ALL ON public.simon_contacto_bsuids                FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.simon_contacto_bsuids_id_seq FROM anon, authenticated;
REVOKE ALL ON public.v_bsuid_cobertura                    FROM anon, authenticated;

GRANT ALL    ON public.simon_contacto_bsuids TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.simon_contacto_bsuids_id_seq TO service_role;
GRANT SELECT ON public.simon_contacto_bsuids TO claude_readonly;
GRANT SELECT ON public.v_bsuid_cobertura     TO service_role, claude_readonly;

-- RLS deny-all, igual que las tablas hermanas de la mig 292. Es PII: vincula
-- identificadores de Meta con personas.
ALTER TABLE public.simon_contacto_bsuids ENABLE ROW LEVEL SECURITY;
CREATE POLICY simon_contacto_bsuids_claude_read ON public.simon_contacto_bsuids
  FOR SELECT TO claude_readonly USING (true);

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr aparte)
-- =============================================================================
--   -- Nada de esto se ve ni se escribe desde el browser:
--   SELECT has_table_privilege('anon','public.v_bsuid_cobertura','SELECT');      -- false
--   SELECT has_table_privilege('anon','public.simon_contacto_bsuids','SELECT');  -- false
--   SELECT has_table_privilege('anon','public.simon_contacto_bsuids','INSERT');  -- false
--   SELECT relacl::text FROM pg_class WHERE relname='simon_contacto_bsuids';
--
--   -- El termómetro (correr de nuevo dentro de unos días):
--   SELECT * FROM public.v_bsuid_cobertura;
--
--   -- 🔴 GATE DE ENTRADA DE LA MIG 319: esto DEBE dar 0 filas antes de aplicarla,
--   -- porque la 319 crea el índice ÚNICO sobre el par y fallaría con duplicados.
--   SELECT meta_portfolio_id, business_scoped_user_id, COUNT(*), ARRAY_AGG(id)
--   FROM public.simon_contactos
--   WHERE business_scoped_user_id IS NOT NULL
--   GROUP BY 1,2 HAVING COUNT(*) > 1;
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   DROP VIEW IF EXISTS public.v_bsuid_cobertura;
--   ALTER TABLE public.simon_contacto_bsuids RENAME TO _trash_simon_contacto_bsuids;  (Regla 3)
--   DROP INDEX IF EXISTS public.simon_contactos_idx_bsuid;
--   DROP INDEX IF EXISTS public.simon_mensajes_idx_bsuid;
--   ALTER TABLE public.simon_contactos
--     DROP COLUMN IF EXISTS business_scoped_user_id,
--     DROP COLUMN IF EXISTS parent_business_scoped_user_id,
--     DROP COLUMN IF EXISTS username,
--     DROP COLUMN IF EXISTS meta_portfolio_id,
--     DROP COLUMN IF EXISTS phone_number_id,
--     DROP COLUMN IF EXISTS bsuid_visto_at;
--   ALTER TABLE public.simon_mensajes DROP COLUMN IF EXISTS business_scoped_user_id;
--   -- (columnas nuevas sin dependencias: acá el DROP directo es seguro, no aplica
--   --  el patrón _trash_* de la Regla 3, que es para tablas)
-- =============================================================================
