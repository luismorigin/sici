-- =============================================================================
-- 296 · CRM B2C capa 3 — vista de resumen de contactos (+ helper de teléfono)
-- =============================================================================
-- Las tablas (`simon_contactos`, `simon_mensajes`) y el ingest por webhook YA
-- existen y funcionan (mig 292 + /api/kapso/webhook, verificado en vivo 24-jul).
-- Lo que falta es la capa 3 del plan: PODER VERLO. Esta vista alimenta la UI
-- admin /admin/contactos.
--
-- Principio del plan (CRM_CLIENTES_B2C_PLAN.md §5 capa 1): los contadores
-- (total_mensajes, ultimo_contacto, total_shortlists) NO se guardan en la tabla
-- — se DERIVAN acá. En `simon_contactos` solo vive el estado editado a mano.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Limpieza: índice duplicado creado por error el 24-jul
-- -----------------------------------------------------------------------------
-- `simon_mensajes_idx_timeline` (mig 292) ya cubre (contacto_id, enviado_at DESC).
DROP INDEX IF EXISTS public.simon_mensajes_idx_contacto_fecha;

-- -----------------------------------------------------------------------------
-- 1. Helper: normalizar teléfono boliviano en SQL (espejo de lib/phone.ts)
-- -----------------------------------------------------------------------------
-- El TS manda; esto lo replica para poder CRUZAR en SQL contra datos viejos.
-- `broker_shortlists.cliente_telefono` guardó el mismo número en 3 formatos
-- (+59176…, 76…, 59176…) porque el create solo hacía .trim() — ya corregido en
-- el endpoint, pero las filas viejas siguen sucias y hay que normalizar al leer.
CREATE OR REPLACE FUNCTION public.normalizar_telefono_bo(p_tel TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  WITH limpio AS (
    SELECT regexp_replace(COALESCE(p_tel, ''), '[\s\-\(\)]', '', 'g') AS t
  )
  SELECT CASE
    WHEN t ~ '^\+591[67][0-9]{7}$' THEN t
    WHEN t ~ '^591[67][0-9]{7}$'   THEN '+' || t
    WHEN t ~ '^[67][0-9]{7}$'      THEN '+591' || t
    ELSE NULL
  END
  FROM limpio;
$$;

COMMENT ON FUNCTION public.normalizar_telefono_bo(TEXT) IS
  'Normaliza celular boliviano a +591[67]NNNNNNN. Espejo SQL de simon-mvp/src/lib/phone.ts '
  '(el TS manda). NULL si no es válido. Sirve para cruzar el teléfono sucio de '
  'broker_shortlists con la identidad de simon_contactos. Mig 296.';

-- -----------------------------------------------------------------------------
-- 2. Vista de resumen: una fila por contacto, con sus contadores derivados
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_simon_contactos_resumen AS
WITH msg AS (
  SELECT
    contacto_id,
    COUNT(*)                                            AS total_mensajes,
    COUNT(*) FILTER (WHERE direccion = 'in')            AS mensajes_in,
    COUNT(*) FILTER (WHERE direccion = 'out')           AS mensajes_out,
    MIN(enviado_at)                                     AS primer_mensaje_at,
    MAX(enviado_at)                                     AS ultimo_mensaje_at
  FROM public.simon_mensajes
  GROUP BY contacto_id
),
ultimo_in AS (
  SELECT DISTINCT ON (contacto_id) contacto_id, texto
  FROM public.simon_mensajes
  WHERE direccion = 'in'
  ORDER BY contacto_id, enviado_at DESC
),
-- Shortlists del BOT cruzadas por teléfono normalizado. Scope a simon-asistente:
-- el mismo número puede aparecer bajo brokers B2B y esos NO son de este CRM
-- (CRM_CLIENTES_B2C_PLAN.md §2.1/§2.3).
sl AS (
  SELECT
    public.normalizar_telefono_bo(cliente_telefono) AS tel,
    COUNT(*)        AS total_shortlists,
    MAX(created_at) AS ultima_shortlist_at
  FROM public.broker_shortlists
  WHERE broker_slug = 'simon-asistente'
    AND public.normalizar_telefono_bo(cliente_telefono) IS NOT NULL
  GROUP BY 1
)
SELECT
  c.id,
  c.telefono,
  c.nombre,
  c.estado,
  c.notas,
  c.created_at,
  COALESCE(m.total_mensajes, 0)   AS total_mensajes,
  COALESCE(m.mensajes_in, 0)      AS mensajes_in,
  COALESCE(m.mensajes_out, 0)     AS mensajes_out,
  m.primer_mensaje_at,
  m.ultimo_mensaje_at,
  ui.texto                        AS ultimo_texto_in,
  COALESCE(sl.total_shortlists, 0) AS total_shortlists,
  sl.ultima_shortlist_at,
  -- Días desde el último mensaje (para ordenar por "más fresco")
  (CURRENT_DATE - m.ultimo_mensaje_at::date)::int AS dias_sin_actividad
FROM public.simon_contactos c
LEFT JOIN msg        m  ON m.contacto_id  = c.id
LEFT JOIN ultimo_in  ui ON ui.contacto_id = c.id
LEFT JOIN sl            ON sl.tel         = c.telefono;

COMMENT ON VIEW public.v_simon_contactos_resumen IS
  'CRM B2C: una fila por contacto del bot con contadores DERIVADOS (mensajes in/out, '
  'primer/último contacto, shortlists cruzadas por teléfono normalizado y scopeadas a '
  'simon-asistente). Consumer: /admin/contactos vía /api/admin/contactos. Mig 296.';

-- -----------------------------------------------------------------------------
-- 3. Permisos — PII: nada de anon/authenticated (Regla 6 + lección 290→291)
-- -----------------------------------------------------------------------------
REVOKE ALL   ON public.v_simon_contactos_resumen FROM anon, authenticated;
GRANT SELECT ON public.v_simon_contactos_resumen TO service_role, claude_readonly;

REVOKE ALL      ON FUNCTION public.normalizar_telefono_bo(TEXT) FROM anon, authenticated;
GRANT  EXECUTE  ON FUNCTION public.normalizar_telefono_bo(TEXT) TO service_role, claude_readonly;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación (correr aparte)
-- -----------------------------------------------------------------------------
-- SELECT has_table_privilege('anon','public.v_simon_contactos_resumen','SELECT');  -- false
-- SELECT telefono, total_mensajes, ultimo_texto_in FROM public.v_simon_contactos_resumen;
-- SELECT public.normalizar_telefono_bo('76308808');  -- +59176308808
-- -----------------------------------------------------------------------------
-- ROLLBACK: DROP VIEW public.v_simon_contactos_resumen;
--           DROP FUNCTION public.normalizar_telefono_bo(TEXT);
-- =============================================================================
