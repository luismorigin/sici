-- =============================================================================
-- 333 · El parte diario cuenta los avisos de LADO OFERTA
-- =============================================================================
-- La otra mitad del pedido de lab-kapso (20-ago-2026). El aviso a Slack ya está
-- en el webhook; esto es lo que hace que **se sepa si sigue vivo**.
--
-- EL PROBLEMA QUE RESUELVE. El detector del webhook reconoce la respuesta del bot
-- por CÓMO ESTÁ REDACTADA, y esa redacción la decide el prompt — que cambia. Los
-- 3 casos reales de agosto usaban otra redacción que el patrón actual NO matchea:
-- se reescribió el 19-ago. Si vuelve a cambiar, el aviso **deja de sonar en
-- silencio**, y con una incidencia de ~1 caso cada 3 días **el silencio se ve
-- igual que "no hubo agentes"**.
--
-- Es el mismo modo de falla que el criterio de comparación del badge de TC
-- (mig 227): su lista de tags envejeció, dejó de marcar a nadie y **no falló** —
-- nadie se enteró durante meses.
--
-- 🔑 Esta función YA aplica el principio en otras dos partes, y esto lo extiende:
--   · "Cero actividad hoy → revisar el webhook, el vigilante no puede detectar esto"
--   · "Las pruebas propias se DECLARAN aparte en vez de desaparecer"
-- La idea es siempre la misma: **poder distinguir "no pasó" de "está roto"**.
--
-- QUÉ AGREGA: una línea con las detecciones de los últimos 7 días. Si hay cero
-- **y hubo conversaciones**, lo dice — porque ahí es donde conviene mirar el patrón.
-- Si no hubo conversaciones, no dice nada: el cero está explicado.
--
-- El patrón replica el de `simon-mvp/src/pages/api/kapso/webhook.ts`
-- (`esRespuestaLadoOferta`). ⚠️ Si se toca uno, tocar el otro.
--
-- FORMATO: sigue a las migs 327-332 (recrear desde el catálogo, regla 7).
-- =============================================================================

BEGIN;

DO $mig$
DECLARE
  def_actual TEXT;
  def_nueva  TEXT;
  ancla      TEXT := '  v_texto := v_texto || E''\nhttps://simonbo.com/admin/contactos'';';
  bloque     TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def_actual
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'parte_diario_bot';

  IF def_actual IS NULL THEN
    RAISE EXCEPTION 'No existe parte_diario_bot. Abortado.';
  END IF;
  IF def_actual ~ 'v_oferta' THEN
    RAISE EXCEPTION 'Ya está aplicada. Abortado (nada que hacer).';
  END IF;

  bloque :=
'  -- Lado oferta (mig 333): cuantos agentes/propietarios detectó el webhook en 7 días.
  -- Se declara el CERO a propósito cuando hubo conversaciones: el detector depende
  -- de cómo redacta el prompt, y si el prompt cambia deja de avisar sin fallar.
  DECLARE v_oferta INTEGER;
  BEGIN
    SELECT COUNT(DISTINCT contacto_id) INTO v_oferta
      FROM public.simon_mensajes
     WHERE direccion = ''out''
       AND enviado_at >= NOW() - INTERVAL ''7 days''
       AND texto ~* ''no es un portal|no publicamos|no hay forma de publicar|portal donde se publica|no lo manejo por ac''
       AND texto ~* ''captador|que la capta|que captan|corredores que captan|capta la propiedad'';

    IF v_oferta > 0 THEN
      v_texto := v_texto || format(E''\n• :office: Lado oferta (7d): *%s* agente(s)/propietario(s)'', v_oferta);
    ELSIF v_conv > 0 THEN
      v_texto := v_texto ||
        E''\n• :office: Lado oferta (7d): 0. Con conversaciones andando, conviene revisar que ''
        || ''el detector siga reconociendo la respuesta del bot (depende de la redacción del prompt).'';
    END IF;
  END;

' || ancla;

  def_nueva := replace(def_actual, ancla, bloque);
  IF def_nueva = def_actual THEN
    RAISE EXCEPTION 'No se encontró el ancla en parte_diario_bot. Abortado.';
  END IF;

  EXECUTE def_nueva;
  RAISE NOTICE 'parte_diario_bot → cuenta los avisos de lado oferta';
END
$mig$;

-- ── Verificación: la función tiene que seguir corriendo y devolviendo el parte ──
DO $chk$
DECLARE t TEXT;
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE proname='parte_diario_bot') !~ 'v_oferta' THEN
    RAISE EXCEPTION 'No quedó el bloque nuevo. Abortado.';
  END IF;

  -- 🔴 Se EJECUTA, no solo se compila: es la que manda el parte a Slack todos los
  -- días a la 1:00 por pg_cron. Si rompe, nos enteramos mañana y tarde.
  t := public.parte_diario_bot();
  IF t IS NULL OR length(t) < 50 THEN
    RAISE EXCEPTION 'parte_diario_bot devolvió un parte vacío o muy corto. Abortado.';
  END IF;
  IF t !~ 'Parte diario del bot' THEN
    RAISE EXCEPTION 'El parte perdió su encabezado. Abortado.';
  END IF;

  RAISE NOTICE '✅ parte_diario_bot corre y devuelve % caracteres', length(t);
END
$chk$;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DO $rb$
-- DECLARE d TEXT; i INT; j INT;
-- BEGIN
--   SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='parte_diario_bot';
--   i := position('  -- Lado oferta (mig 333)' in d);
--   j := position('  v_texto := v_texto || E''\nhttps://simonbo.com/admin/contactos'';' in d);
--   EXECUTE substr(d, 1, i - 1) || substr(d, j);
-- END $rb$;
-- COMMIT;
