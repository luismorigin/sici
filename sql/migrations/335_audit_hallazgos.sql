-- =============================================================================
-- 335 · `audit_hallazgos` — el audit deja de hablar solo por un log
-- =============================================================================
-- PASO 3 del plan del admin (docs/backlog/ADMIN_ANALISIS_2026-08-11.md §12): la
-- BANDEJA DEL AUDIT. Es la "segunda puerta" del encuadre del founder — entrar por
-- PROBLEMA en vez de por propiedad.
--
-- EL PROBLEMA QUE RESUELVE. Cada noche el audit encuentra casos que necesitan una
-- decisión humana (un aviso sin edificio, un match riesgoso, un lector que dudó) y
-- los escribe en **un log de markdown**. El founder los lee a la mañana y aplica el
-- SQL a mano en Supabase. Eso funciona, pero:
--   · lo que no se aplicó esa mañana **no queda en ningún lado**: la noche siguiente
--     el mismo caso vuelve a aparecer y se vuelve a juzgar, gastando lectores;
--   · no hay forma de saber qué se decidió, cuándo, ni con qué evidencia;
--   · un caso decidido y otro olvidado se ven exactamente igual.
--
-- Esta tabla es lo mínimo para que exista una bandeja: el audit escribe sus
-- hallazgos acá **además** del log (el log se queda — es lo que se lee a la mañana).
--
-- =============================================================================
-- DECISIONES
-- =============================================================================
-- · **UNIQUE (propiedad_id, superficie)** + upsert. El audit corre todas las noches
--   y vuelve a levantar lo mismo mientras no se resuelva: sin esta clave, en una
--   semana habría siete copias del mismo caso. Con ella, se **actualiza** la fila y
--   `visto_veces` cuenta cuántas noches lleva esperando — que es justo la señal de
--   "esto lleva rato acá".
--
-- · **`estado` arranca en 'pendiente'** y solo la bandeja lo mueve. Un hallazgo
--   resuelto NO se borra: queda con quién y cuándo. Es lo que hoy no existe.
--
-- · **`valor_anterior` (JSONB) se llena AL APLICAR**, con lo que había antes. Sin
--   eso, "reversible" es una palabra: con eso, deshacer es leer una fila.
--
-- · **Cerrada a `anon` y `authenticated`.** Se lee y se escribe por API route con la
--   llave de servidor. 🔴 Regla 13, y la lección de hoy mismo: una tabla que el
--   browser no puede leer devuelve su 42501 DENTRO del objeto, la promesa no
--   rechaza, y la pantalla pinta "no hay nada" — que se lee como "no hay hallazgos"
--   en vez de "no tengo permiso". Por eso la bandeja va por endpoint desde el
--   arranque, no como parche después.
--
-- · **Sin FK a `propiedades_v2`.** Deliberado: una FK haría fallar el borrado de una
--   propiedad por tener un hallazgo viejo colgando, y ya pasó algo así (mig del
--   24-jul: una FK a la tabla shadow rompió las shortlists). El id se valida al
--   aplicar, que es cuando importa.
--
-- ALCANCE: superficies 1, 2 y 4 (las de matching). Las tres terminan en la misma
-- acción —asignar o corregir el edificio— y comparten la misma evidencia: la cita
-- del anuncio. El resto de las superficies se suma cuando ésta demuestre servir.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_hallazgos (
  id                BIGSERIAL PRIMARY KEY,

  -- ── de dónde salió ────────────────────────────────────────────────────────
  superficie        SMALLINT    NOT NULL,          -- 1 · 2 · 4 (por ahora)
  propiedad_id      INTEGER     NOT NULL,
  macrozona         TEXT        NOT NULL,
  operacion         TEXT        NOT NULL CHECK (operacion IN ('venta','alquiler')),

  -- ── qué propone ───────────────────────────────────────────────────────────
  -- El veredicto lo da el JUEZ (los subagentes-lectores), no el script. Puede
  -- llegar NULL: el script deja el candidato y el juez lo completa después.
  veredicto         TEXT        CHECK (veredicto IN ('APROBAR','CORREGIR','CONFIRMAR','RECHAZAR','PM_NUEVO','SIN_NOMBRE')),
  pm_actual         INTEGER,                        -- el edificio que tiene hoy
  pm_propuesto      INTEGER,                        -- al que se movería
  nombre_propuesto  TEXT,                           -- para PM_NUEVO
  /** La CITA del anuncio que sostiene la decisión. Es lo que convierte la bandeja
      en algo revisable: sin la cita, aprobar es confiar a ciegas en un score. */
  evidencia         TEXT,
  /** Todo lo que el script ya trajo: candidatos fuzzy con su score, distancia al
      pm, nombre del aviso, hermanos del edificio. La pantalla lo muestra sin tener
      que volver a consultarlo. */
  contexto          JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- ── estado de la revisión ─────────────────────────────────────────────────
  estado            TEXT        NOT NULL DEFAULT 'pendiente'
                                CHECK (estado IN ('pendiente','aplicado','descartado')),
  resuelto_at       TIMESTAMPTZ,
  resuelto_por      TEXT,
  /** Lo que había ANTES de aplicar. Es lo que hace reversible al botón. */
  valor_anterior    JSONB,
  /** Por qué se descartó, cuando se descarta. Un "no" sin motivo se vuelve a
      proponer la noche siguiente y nadie recuerda por qué se había dicho que no. */
  motivo_descarte   TEXT,

  -- ── rastro ────────────────────────────────────────────────────────────────
  primera_vez_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_vez_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  /** Cuántas noches lleva apareciendo sin resolverse. La señal de "esto lleva rato". */
  visto_veces       INTEGER     NOT NULL DEFAULT 1,

  CONSTRAINT audit_hallazgos_unico UNIQUE (propiedad_id, superficie)
);

-- La bandeja pide "los pendientes, los más viejos primero".
CREATE INDEX IF NOT EXISTS idx_audit_hallazgos_pendientes
  ON public.audit_hallazgos (estado, primera_vez_at)
  WHERE estado = 'pendiente';

COMMENT ON TABLE public.audit_hallazgos IS
  'Hallazgos del audit nocturno que necesitan decisión humana (bandeja de /admin/revisar, mig 335). '
  'El audit los escribe ADEMÁS del log de markdown, que sigue siendo lo que se lee a la mañana. '
  'UNIQUE (propiedad_id, superficie) + upsert: el audit vuelve a levantar lo mismo cada noche mientras '
  'no se resuelva, y `visto_veces` cuenta cuántas lleva esperando. '
  'Un hallazgo resuelto NO se borra: queda con quién, cuándo y qué había antes (`valor_anterior`). '
  'Cerrada a anon/authenticated: se consume por API route con service_role.';

-- ── Permisos: REVOKE primero (regla 13) ─────────────────────────────────────
-- Toda tabla nueva en `public` nace con anon/authenticated en ALL por los default
-- privileges del schema, y los GRANT SUMAN, no revocan.
REVOKE ALL ON public.audit_hallazgos FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.audit_hallazgos_id_seq FROM anon, authenticated;

GRANT ALL    ON public.audit_hallazgos          TO service_role;
GRANT USAGE  ON SEQUENCE public.audit_hallazgos_id_seq TO service_role;
GRANT SELECT ON public.audit_hallazgos          TO claude_readonly;

-- ── Verificación ────────────────────────────────────────────────────────────
DO $chk$
DECLARE
  acl TEXT;
BEGIN
  IF to_regclass('public.audit_hallazgos') IS NULL THEN
    RAISE EXCEPTION 'La tabla no se creó. Abortado.';
  END IF;

  -- 🔴 Lo que más importa verificar: que NO quedó abierta al browser. Es el error
  -- de la mig 283→284 (una tabla interna quedó escribible desde el navegador porque
  -- los GRANT suman y nadie revocó primero).
  SELECT relacl::text INTO acl FROM pg_class WHERE relname = 'audit_hallazgos';
  IF acl ~ '(^|,)anon=' OR acl ~ '(^|,)authenticated=' THEN
    RAISE EXCEPTION 'La tabla quedó accesible para anon/authenticated: %. Abortado.', acl;
  END IF;

  IF NOT has_table_privilege('service_role', 'public.audit_hallazgos', 'INSERT') THEN
    RAISE EXCEPTION 'service_role no puede escribir. Abortado.';
  END IF;
  IF NOT has_table_privilege('claude_readonly', 'public.audit_hallazgos', 'SELECT') THEN
    RAISE EXCEPTION 'claude_readonly no puede leer. Abortado.';
  END IF;

  RAISE NOTICE '✅ audit_hallazgos creada · cerrada a anon/authenticated · acl: %', acl;
END
$chk$;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.audit_hallazgos;
-- COMMIT;
