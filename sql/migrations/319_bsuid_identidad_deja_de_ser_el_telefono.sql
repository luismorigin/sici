-- =============================================================================
-- 319 · BSUID — la identidad deja de ser el teléfono (paso 2 de 2)
-- =============================================================================
-- La mig 318 empezó a GUARDAR el identificador nuevo de Meta. Esta cambia la
-- IDENTIDAD: un contacto puede no tener teléfono nunca, y se lo reconoce por el
-- par (portfolio, BSUID).
--
-- 🔴 GATE DE ENTRADA — verificar ANTES de aplicar (los 5 deben dar lo que dicen):
--
--   1) La mig 318 está aplicada:
--      SELECT COUNT(*) FROM information_schema.columns
--       WHERE table_name='simon_contactos' AND column_name='business_scoped_user_id';   -- 1
--
--   2) Ningún BSUID quedó repartido entre dos contactos (rompería el índice único):
--      SELECT meta_portfolio_id, business_scoped_user_id, COUNT(*)
--        FROM public.simon_contactos WHERE business_scoped_user_id IS NOT NULL
--       GROUP BY 1,2 HAVING COUNT(*) > 1;                                        -- 0 filas
--
--   3) Ni entre dos contactos en la tabla de alias:
--      SELECT business_scoped_user_id, COUNT(DISTINCT contacto_id)
--        FROM public.simon_contacto_bsuids
--       GROUP BY 1 HAVING COUNT(DISTINCT contacto_id) > 1;                       -- 0 filas
--
--   4) Los nombres de las constraints a soltar son los esperados:
--      SELECT conname FROM pg_constraint WHERE conrelid='public.simon_contactos'::regclass;
--      -- deben estar simon_contactos_telefono_key y simon_contactos_telefono_check
--
--   5) El backfill ya corrió (si no, se pierde mapeo que hoy todavía se puede
--      reconstruir):  SELECT * FROM public.v_bsuid_cobertura;
--
-- QUÉ ROMPE SI NO SE HACE: quien adopte un username deja de mandar teléfono, el
-- webhook descarta su mensaje, el contacto no aparece nunca en /admin/contactos —
-- pero el bot igual le arma la shortlist (para eso usa el teléfono que la persona
-- ESCRIBE en el chat, no el del remitente). Shortlists huérfanas y contactos
-- perdidos, sin ningún error. Ver lab-kapso/BRIEFING_SICI_BSUID.md (D31).
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. simon_contactos — el teléfono pasa de identidad a dato
-- -----------------------------------------------------------------------------
ALTER TABLE public.simon_contactos
  ALTER COLUMN telefono DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS simon_contactos_telefono_key,     -- el UNIQUE de la mig 292
  DROP CONSTRAINT IF EXISTS simon_contactos_telefono_check;   -- el CHECK ~'^\+591…'

-- El formato se sigue exigiendo, pero solo cuando hay teléfono: un CHECK sobre
-- NULL da NULL (que Postgres acepta), pero se escribe explícito para que se lea.
ALTER TABLE public.simon_contactos
  ADD CONSTRAINT simon_contactos_telefono_check
  CHECK (telefono IS NULL OR telefono ~ '^\+591[67][0-9]{7}$');

-- Sigue siendo único CUANDO EXISTE — dos personas no comparten número — pero ya
-- no es la identidad: ahora es un índice parcial y no una constraint.
CREATE UNIQUE INDEX IF NOT EXISTS simon_contactos_telefono_uniq
  ON public.simon_contactos (telefono) WHERE telefono IS NOT NULL;

-- 🔑 LA IDENTIDAD NUEVA: el PAR. Un BSUID solo es único dentro de su portfolio.
-- La 318 lo dejó como índice común a propósito (ver su encabezado); acá se vuelve
-- único, porque a partir de ahora el matcheo pasa por simon_resolver_contacto(),
-- que garantiza el invariante.
DROP INDEX IF EXISTS public.simon_contactos_idx_bsuid;
CREATE UNIQUE INDEX IF NOT EXISTS simon_contactos_portfolio_bsuid_uniq
  ON public.simon_contactos (meta_portfolio_id, business_scoped_user_id)
  WHERE business_scoped_user_id IS NOT NULL;

COMMENT ON COLUMN public.simon_contactos.telefono IS
  'Teléfono normalizado +591…, o NULL: desde que Meta da privacidad de número (BSUID) '
  'puede no llegar NUNCA. Único cuando existe, pero YA NO ES LA IDENTIDAD — esa es el '
  'par (meta_portfolio_id, business_scoped_user_id). Mig 319.';

COMMENT ON TABLE public.simon_contactos IS
  'Persona que escribió al bot de WhatsApp. Identidad = el par (meta_portfolio_id, '
  'business_scoped_user_id) con el teléfono como respaldo — Meta lo está sacando del '
  'payload. Resolver SIEMPRE con simon_resolver_contacto(): matchear por teléfono '
  'primero genera duplicados que después no se pueden fusionar. Solo `estado` y `notas` '
  'son estado editado a mano; los contadores se derivan. Migs 292 → 318 → 319.';

-- -----------------------------------------------------------------------------
-- 2. simon_mensajes — un mensaje sin teléfono es un mensaje válido
-- -----------------------------------------------------------------------------
ALTER TABLE public.simon_mensajes ALTER COLUMN telefono DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. 🔴 LA VIGILANCIA DEL BOT — lo que el briefing no vio
-- -----------------------------------------------------------------------------
-- `simon_bot_incidentes.telefono` es NOT NULL (mig 305). Con mensajes sin teléfono,
-- vigilar_bot_whatsapp() explotaría justo al registrar el incidente de un contacto
-- nuevo — o sea: la alarma que avisa que el bot está mudo se caería exactamente con
-- el caso que estamos habilitando, y en silencio (corre por pg_cron).
ALTER TABLE public.simon_bot_incidentes ALTER COLUMN telefono DROP NOT NULL;

-- Y el aviso de Slack imprime ese teléfono. Sin número mostraría un hueco, cuando
-- lo que hace falta es saber A QUIÉN hay que contestarle. Se parchea la definición
-- VIVA (regla 7: nunca transcribir de un archivo local) y se ABORTA si el texto
-- esperado no está — un reemplazo que no encuentra su ancla no falla, deja la
-- función igual y hace creer que se arregló.
DO $patch$
DECLARE
  v_src   TEXT;
  v_ancla TEXT := '      SELECT id, tipo, telefono, mensaje_texto, mensaje_at' || E'\n'
                || '      FROM public.simon_bot_incidentes' || E'\n';
  v_nuevo TEXT := '      SELECT i.id, i.tipo,' || E'\n'
                || '             COALESCE(i.telefono, ''@'' || c.username, c.business_scoped_user_id,'
                || ' ''(contacto sin número)'') AS telefono,' || E'\n'
                || '             i.mensaje_texto, i.mensaje_at' || E'\n'
                || '      FROM public.simon_bot_incidentes i' || E'\n'
                || '      LEFT JOIN public.simon_contactos c ON c.id = i.contacto_id' || E'\n';
BEGIN
  SELECT replace(pg_get_functiondef(oid), E'\r\n', E'\n')
    INTO v_src
    FROM pg_proc WHERE proname = 'vigilar_bot_whatsapp';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'No existe vigilar_bot_whatsapp() — revisar la mig 305 antes de seguir';
  END IF;
  IF position(v_ancla in v_src) = 0 THEN
    RAISE EXCEPTION 'El SELECT del aviso cambió: parchear a mano en vez de a ciegas';
  END IF;

  EXECUTE replace(v_src, v_ancla, v_nuevo);
END
$patch$;

-- -----------------------------------------------------------------------------
-- 4. 🎯 simon_resolver_contacto — el ÚNICO lugar donde se decide quién es quién
-- -----------------------------------------------------------------------------
-- Existe por dos motivos concretos:
--
--   (a) No se puede hacer con un upsert desde el cliente. `ON CONFLICT (cols)` sobre
--       un índice único PARCIAL necesita repetir el mismo WHERE, y PostgREST/
--       supabase-js solo saben mandar la lista de columnas → el upsert que propone
--       el briefing devolvería "no unique or exclusion constraint matching".
--
--   (b) 🔴 El ORDEN de matcheo es la regla que no se puede romper: BSUID primero,
--       teléfono después. Al revés, cuando el cliente adopte username se crea un
--       DUPLICADO que después no se puede fusionar. Escrito una sola vez acá, no
--       repartido por el TypeScript.
--
-- Devuelve el id del contacto. Idempotente: llamarla dos veces con lo mismo no
-- cambia nada la segunda.
CREATE OR REPLACE FUNCTION public.simon_resolver_contacto(
  p_portfolio       TEXT,
  p_bsuid           TEXT DEFAULT NULL,
  p_parent_bsuid    TEXT DEFAULT NULL,
  p_username        TEXT DEFAULT NULL,
  p_telefono        TEXT DEFAULT NULL,
  p_phone_number_id TEXT DEFAULT NULL,
  p_nombre          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
-- SIN SECURITY DEFINER: la llama el webhook con service_role, que ya bypassea RLS.
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_bsuid IS NULL AND p_telefono IS NULL THEN
    RAISE EXCEPTION 'simon_resolver_contacto: hace falta al menos BSUID o teléfono';
  END IF;
  IF p_portfolio IS NULL THEN
    RAISE EXCEPTION 'simon_resolver_contacto: el BSUID sin su portfolio no identifica a nadie';
  END IF;

  -- Serializa a los que compiten por la MISMA identidad. Sin esto, dos eventos del
  -- mismo cliente llegando a la vez crean dos contactos: los dos miran, los dos no
  -- encuentran, los dos insertan. Es por transacción y no bloquea a nadie más.
  PERFORM pg_advisory_xact_lock(hashtext(p_portfolio || '|' || COALESCE(p_bsuid, p_telefono)));

  -- ── 1. Por BSUID (incluye los VIEJOS: la tabla de alias es la que reconoce a
  --       quien vuelve con un identificador anterior, en vez de duplicarlo).
  IF p_bsuid IS NOT NULL THEN
    SELECT contacto_id INTO v_id FROM public.simon_contacto_bsuids
     WHERE meta_portfolio_id = p_portfolio AND business_scoped_user_id = p_bsuid;
  END IF;

  IF v_id IS NULL AND p_parent_bsuid IS NOT NULL THEN
    SELECT contacto_id INTO v_id FROM public.simon_contacto_bsuids
     WHERE meta_portfolio_id = p_portfolio AND business_scoped_user_id = p_parent_bsuid;
  END IF;

  -- ── 2. Recién ahora, por teléfono.
  IF v_id IS NULL AND p_telefono IS NOT NULL THEN
    SELECT id INTO v_id FROM public.simon_contactos WHERE telefono = p_telefono;
  END IF;

  -- ── 3. Nadie: es una persona nueva.
  IF v_id IS NULL THEN
    INSERT INTO public.simon_contactos
      (telefono, nombre, business_scoped_user_id, parent_business_scoped_user_id,
       username, meta_portfolio_id, phone_number_id, bsuid_visto_at)
    VALUES
      (p_telefono, p_nombre, p_bsuid, p_parent_bsuid,
       p_username, CASE WHEN p_bsuid IS NOT NULL THEN p_portfolio END, p_phone_number_id,
       CASE WHEN p_bsuid IS NOT NULL THEN NOW() END)
    RETURNING id INTO v_id;
  ELSE
    -- ── 4. Ya existía: se COMPLETA, nunca se pisa con vacío.
    -- 🔑 El teléfono solo se escribe si faltaba. Si el guardado es otro, gana el
    -- guardado y la diferencia queda visible para auditar: cambiar la identidad de
    -- una persona en silencio es peor que quedarse con el dato viejo.
    UPDATE public.simon_contactos SET
      telefono                       = COALESCE(telefono, p_telefono),
      nombre                         = COALESCE(NULLIF(TRIM(p_nombre), ''), nombre),
      username                       = COALESCE(p_username, username),
      business_scoped_user_id        = COALESCE(p_bsuid, business_scoped_user_id),
      parent_business_scoped_user_id = COALESCE(p_parent_bsuid, parent_business_scoped_user_id),
      meta_portfolio_id              = CASE WHEN p_bsuid IS NOT NULL THEN p_portfolio
                                            ELSE meta_portfolio_id END,
      phone_number_id                = COALESCE(p_phone_number_id, phone_number_id),
      bsuid_visto_at                 = CASE WHEN p_bsuid IS NOT NULL THEN NOW()
                                            ELSE bsuid_visto_at END,
      updated_at                     = NOW()
    WHERE id = v_id;
  END IF;

  -- ── 5. El identificador queda registrado en la historia.
  -- `contacto_id` NO se toca en el conflicto: si ese BSUID ya pertenece a otra
  -- persona, se deja como está para que lo mire un humano.
  IF p_bsuid IS NOT NULL THEN
    INSERT INTO public.simon_contacto_bsuids
      (contacto_id, meta_portfolio_id, business_scoped_user_id, phone_number_id, origen)
    VALUES (v_id, p_portfolio, p_bsuid, p_phone_number_id, 'webhook')
    ON CONFLICT (meta_portfolio_id, business_scoped_user_id) DO UPDATE
      SET ultimo_visto_at = NOW(),
          phone_number_id = COALESCE(simon_contacto_bsuids.phone_number_id, EXCLUDED.phone_number_id);
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.simon_resolver_contacto(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) IS
  'Devuelve el contacto de una persona, creándolo si hace falta. ORDEN OBLIGATORIO: '
  'BSUID (actual y viejos) → teléfono → crear. Al revés se generan duplicados que no '
  'se pueden fusionar. Único punto de escritura de identidad; la consume '
  '/api/kapso/webhook. Idempotente y a prueba de concurrencia (advisory lock). Mig 319.';

REVOKE ALL     ON FUNCTION public.simon_resolver_contacto(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.simon_resolver_contacto(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 5. simon_migrar_bsuid — cuando Meta avisa que el identificador cambió
-- -----------------------------------------------------------------------------
-- Meta notifica el cambio (`user_id_update`) mandando el anterior y el nuevo.
-- 🔴 NUNCA inserta un contacto: fusiona sobre el que ya existe. Si insertara,
-- partiría en dos el historial de la misma persona.
-- Idempotente porque Meta reentrega webhooks: si el nuevo ya está registrado, la
-- segunda llamada no cambia nada.
--
-- Que esto haga falta NO es teoría: el número del founder ya cambió de BSUID tres
-- veces, la última el 28-jul-2026 al reconectar la WABA (lab-kapso D30).
CREATE OR REPLACE FUNCTION public.simon_migrar_bsuid(
  p_portfolio TEXT,
  p_anterior  TEXT,
  p_nuevo     TEXT,
  p_telefono  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_portfolio IS NULL OR p_nuevo IS NULL THEN
    RAISE EXCEPTION 'simon_migrar_bsuid: hacen falta el portfolio y el BSUID nuevo';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_portfolio || '|' || p_nuevo));

  -- El nuevo primero: si ya se procesó, esto es una reentrega y termina sin tocar nada.
  SELECT contacto_id INTO v_id FROM public.simon_contacto_bsuids
   WHERE meta_portfolio_id = p_portfolio AND business_scoped_user_id = p_nuevo;

  IF v_id IS NULL AND p_anterior IS NOT NULL THEN
    SELECT contacto_id INTO v_id FROM public.simon_contacto_bsuids
     WHERE meta_portfolio_id = p_portfolio AND business_scoped_user_id = p_anterior;
  END IF;

  IF v_id IS NULL AND p_telefono IS NOT NULL THEN
    SELECT id INTO v_id FROM public.simon_contactos WHERE telefono = p_telefono;
  END IF;

  -- Sin contacto al que fusionar no se inventa uno: se devuelve NULL y el que
  -- llamó decide (el webhook lo guarda como evento sin procesar).
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.simon_contacto_bsuids
    (contacto_id, meta_portfolio_id, business_scoped_user_id, origen)
  VALUES (v_id, p_portfolio, p_nuevo, 'user_id_update')
  ON CONFLICT (meta_portfolio_id, business_scoped_user_id) DO UPDATE
    SET ultimo_visto_at = NOW();

  UPDATE public.simon_contactos
     SET business_scoped_user_id = p_nuevo,
         meta_portfolio_id       = p_portfolio,
         bsuid_visto_at          = NOW(),
         updated_at              = NOW()
   WHERE id = v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.simon_migrar_bsuid(TEXT,TEXT,TEXT,TEXT) IS
  'Meta avisó que el BSUID de alguien cambió: registra el nuevo como alias del MISMO '
  'contacto y lo marca vigente. Nunca inserta un contacto (partiría el historial). '
  'Devuelve NULL si no encuentra a quién fusionar. Idempotente. Mig 319.';

REVOKE ALL     ON FUNCTION public.simon_migrar_bsuid(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.simon_migrar_bsuid(TEXT,TEXT,TEXT,TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. simon_eventos_sin_procesar — que nada se pierda en silencio
-- -----------------------------------------------------------------------------
-- 🔴 Meta es explícito: si llega un webhook que no podés procesar, NO hay replay ni
-- corrección. Hoy un evento que el ingest no entiende devuelve 200 y desaparece.
-- Guardarlo crudo cuesta una fila y es la diferencia entre "lo podemos reprocesar
-- cuando entendamos el formato" y "no lo vamos a recuperar nunca".
CREATE TABLE IF NOT EXISTS public.simon_eventos_sin_procesar (
  id            BIGSERIAL PRIMARY KEY,
  recibido_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  motivo        TEXT NOT NULL,
  evento        TEXT,
  payload       JSONB NOT NULL,
  procesado_at  TIMESTAMPTZ
);

COMMENT ON TABLE public.simon_eventos_sin_procesar IS
  'Eventos del webhook de Kapso que el ingest no supo procesar, guardados crudos. '
  'Existe porque Meta no reenvía: sin esto se pierden para siempre. Revisar con '
  'SELECT motivo, COUNT(*) ... WHERE procesado_at IS NULL. Mig 319.';

CREATE INDEX IF NOT EXISTS simon_eventos_sin_procesar_idx_pendientes
  ON public.simon_eventos_sin_procesar (recibido_at DESC) WHERE procesado_at IS NULL;

REVOKE ALL ON public.simon_eventos_sin_procesar                FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.simon_eventos_sin_procesar_id_seq FROM anon, authenticated;
GRANT ALL    ON public.simon_eventos_sin_procesar TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.simon_eventos_sin_procesar_id_seq TO service_role;
GRANT SELECT ON public.simon_eventos_sin_procesar TO claude_readonly;

ALTER TABLE public.simon_eventos_sin_procesar ENABLE ROW LEVEL SECURITY;
CREATE POLICY simon_eventos_sin_procesar_claude_read ON public.simon_eventos_sin_procesar
  FOR SELECT TO claude_readonly USING (true);

-- -----------------------------------------------------------------------------
-- 7. La vista del CRM — que un contacto sin teléfono no quede invisible
-- -----------------------------------------------------------------------------
-- Los cruces con shortlists, favoritos y nombre son POR TELÉFONO. Con NULL no
-- matchean y tampoco fallan: la persona aparecería sin nombre, con 0 selecciones y
-- 0 favoritos — presente en la tabla y vacía en la pantalla. No se puede arreglar
-- del todo acá (la shortlist guarda el teléfono que la persona ESCRIBIÓ, y esa es
-- su única llave), pero sí se puede DECLARAR: `identificador` siempre dice algo, y
-- `sin_telefono` avisa por qué los contadores vienen en cero.
CREATE OR REPLACE VIEW public.v_simon_contactos_resumen AS
WITH msg AS (
  SELECT contacto_id,
    COUNT(*) AS total_mensajes,
    COUNT(*) FILTER (WHERE direccion = 'in')  AS mensajes_in,
    COUNT(*) FILTER (WHERE direccion = 'out') AS mensajes_out,
    MIN(enviado_at) AS primer_mensaje_at,
    MAX(enviado_at) AS ultimo_mensaje_at
  FROM public.simon_mensajes GROUP BY contacto_id
),
ultimo_in AS (
  SELECT DISTINCT ON (contacto_id) contacto_id, texto
  FROM public.simon_mensajes WHERE direccion = 'in'
  ORDER BY contacto_id, enviado_at DESC
),
sl AS (
  SELECT public.normalizar_telefono_bo(cliente_telefono) AS tel,
    COUNT(*) AS total_shortlists, MAX(created_at) AS ultima_shortlist_at
  FROM public.broker_shortlists
  WHERE broker_slug = 'simon-asistente'
    AND public.normalizar_telefono_bo(cliente_telefono) IS NOT NULL
  GROUP BY 1
),
nombre_sl AS (
  SELECT DISTINCT ON (public.normalizar_telefono_bo(cliente_telefono))
         public.normalizar_telefono_bo(cliente_telefono) AS tel,
         NULLIF(TRIM(cliente_nombre), '') AS nombre
  FROM public.broker_shortlists
  WHERE broker_slug = 'simon-asistente'
    AND public.normalizar_telefono_bo(cliente_telefono) IS NOT NULL
    AND NULLIF(TRIM(cliente_nombre), '') IS NOT NULL
  ORDER BY 1, created_at DESC
),
hearts AS (
  SELECT public.normalizar_telefono_bo(s.cliente_telefono) AS tel,
         COUNT(*) AS total_favoritos,
         MAX(h.created_at) AS ultimo_favorito_at
  FROM public.broker_shortlist_hearts h
  JOIN public.broker_shortlists s ON s.id = h.shortlist_id
  WHERE s.broker_slug = 'simon-asistente'
    AND public.normalizar_telefono_bo(s.cliente_telefono) IS NOT NULL
  GROUP BY 1
),
wa AS (
  SELECT contacto_id, COUNT(*) AS total_wa_clicks, MAX(created_at) AS ultimo_wa_click_at
  FROM public.wa_clicks
  WHERE contacto_id IS NOT NULL AND NOT es_bot AND NOT es_test
  GROUP BY 1
),
-- v319: cuántos identificadores tuvo esta persona (>1 = Meta se lo cambió)
alias_bsuid AS (
  SELECT contacto_id, COUNT(*) AS total_bsuids
  FROM public.simon_contacto_bsuids GROUP BY 1
)
SELECT c.id, c.telefono,
  COALESCE(NULLIF(TRIM(c.nombre), ''), nombre_sl.nombre) AS nombre,
  c.estado, c.notas, c.created_at,
  COALESCE(m.total_mensajes, 0) AS total_mensajes,
  COALESCE(m.mensajes_in, 0)    AS mensajes_in,
  COALESCE(m.mensajes_out, 0)   AS mensajes_out,
  m.primer_mensaje_at, m.ultimo_mensaje_at,
  ui.texto AS ultimo_texto_in,
  COALESCE(sl.total_shortlists, 0) AS total_shortlists,
  sl.ultima_shortlist_at,
  (CURRENT_DATE - m.ultimo_mensaje_at::date)::int AS dias_sin_actividad,
  COALESCE(wa.total_wa_clicks, 0) AS total_wa_clicks,
  wa.ultimo_wa_click_at,
  COALESCE(hearts.total_favoritos, 0) AS total_favoritos,
  hearts.ultimo_favorito_at,
  -- v319: identidad nueva
  c.username,
  c.business_scoped_user_id,
  COALESCE(alias_bsuid.total_bsuids, 0) AS total_bsuids,
  (c.telefono IS NULL) AS sin_telefono,
  -- Con qué se lo nombra en pantalla. Nunca vacío.
  COALESCE(c.telefono, '@' || c.username, c.business_scoped_user_id, 'sin identificar')
    AS identificador
FROM public.simon_contactos c
LEFT JOIN msg m ON m.contacto_id = c.id
LEFT JOIN ultimo_in ui ON ui.contacto_id = c.id
LEFT JOIN sl ON sl.tel = c.telefono
LEFT JOIN nombre_sl ON nombre_sl.tel = c.telefono
LEFT JOIN hearts ON hearts.tel = c.telefono
LEFT JOIN wa ON wa.contacto_id = c.id
LEFT JOIN alias_bsuid ON alias_bsuid.contacto_id = c.id;

COMMENT ON VIEW public.v_simon_contactos_resumen IS
  'CRM B2C: una fila por contacto del bot con contadores DERIVADOS. Desde la mig 319 '
  'expone también la identidad nueva (username, BSUID, cuántos tuvo) y `identificador`, '
  'que nunca viene vacío. ⚠️ Shortlists/favoritos/nombre cruzan POR TELÉFONO: un '
  'contacto con sin_telefono=true los muestra en cero porque no hay llave, no porque no '
  'existan. Consumer: /admin/contactos. Migs 296 → 299 → 300 → 301 → 319.';

REVOKE ALL   ON public.v_simon_contactos_resumen FROM anon, authenticated;
GRANT SELECT ON public.v_simon_contactos_resumen TO service_role, claude_readonly;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr aparte)
-- =============================================================================
--   -- El teléfono ya no es obligatorio ni identidad:
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_name='simon_contactos' AND column_name='telefono';        -- YES
--   SELECT conname FROM pg_constraint WHERE conrelid='public.simon_contactos'::regclass;
--   -- (no debe estar simon_contactos_telefono_key)
--
--   -- Un contacto solo-BSUID entra, y el segundo evento NO duplica:
--   SELECT public.simon_resolver_contacto('2073772363472695','BO.9999999999999999',
--          NULL,'pruebita',NULL,NULL,'Prueba BSUID');   -- devuelve un uuid
--   SELECT public.simon_resolver_contacto('2073772363472695','BO.9999999999999999',
--          NULL,NULL,NULL,NULL,NULL);                    -- devuelve EL MISMO uuid
--   -- limpiar:
--   -- DELETE FROM public.simon_contactos WHERE business_scoped_user_id='BO.9999999999999999';
--
--   -- La vigilancia sigue en pie y ahora sabe mostrar a quien no tiene número:
--   SELECT prosrc LIKE '%contacto sin número%' FROM pg_proc WHERE proname='vigilar_bot_whatsapp';
--
--   -- Nada nuevo visible desde el browser:
--   SELECT has_table_privilege('anon','public.simon_eventos_sin_procesar','SELECT');  -- false
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.simon_resolver_contacto(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);
--   DROP FUNCTION IF EXISTS public.simon_migrar_bsuid(TEXT,TEXT,TEXT,TEXT);
--   ALTER TABLE public.simon_eventos_sin_procesar RENAME TO _trash_simon_eventos_sin_procesar;
--   DROP INDEX IF EXISTS public.simon_contactos_portfolio_bsuid_uniq;
--   DROP INDEX IF EXISTS public.simon_contactos_telefono_uniq;
--   ALTER TABLE public.simon_contactos DROP CONSTRAINT simon_contactos_telefono_check;
--   -- ⚠️ Volver a NOT NULL/UNIQUE solo si NO entró ningún contacto sin teléfono:
--   --    SELECT COUNT(*) FROM public.simon_contactos WHERE telefono IS NULL;  -- debe dar 0
--   ALTER TABLE public.simon_contactos
--     ADD CONSTRAINT simon_contactos_telefono_check CHECK (telefono ~ '^\+591[67][0-9]{7}$'),
--     ADD CONSTRAINT simon_contactos_telefono_key UNIQUE (telefono),
--     ALTER COLUMN telefono SET NOT NULL;
--   -- y re-aplicar la mig 301 (vista) + la 305 (vigilancia).
--   COMMIT;
-- =============================================================================
