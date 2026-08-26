-- =============================================================================
-- 340 · ROLLBACK — volver a marcar "enviado" por el 2xx
-- =============================================================================
-- ⚠️ VOLVER ATRÁS REPONE EL BUG QUE QUEMÓ A DOS PERSONAS. La versión anterior
-- marca `seguimiento_enviado_at` cuando Kapso acepta el `resume`, sin ninguna
-- evidencia de que el mensaje haya salido — y esa marca impide el reenvío para
-- siempre. No hay motivo previsible para usar esto.
--
-- 🔑 SI LO QUE HACE FALTA ES FRENAR, no se toca ninguna función:
--
--     SELECT cron.unschedule('seguimiento-shortlists');
--
-- Y si el problema fuera que los reintentos molestan, la salida sana es subir el
-- tope de 1 h dentro de `shortlists_para_seguimiento()`, no volver a declarar
-- envíos que no ocurrieron.
--
-- 🔴 EL ENDPOINT ACOMPAÑA. La versión nueva llama a `marcar_intento_seguimiento`;
-- aplicar este rollback sin revertir también el deploy deja al endpoint llamando
-- a una función que dejó de existir.
-- =============================================================================

BEGIN;

-- Reponer la función vieja tal como la dejó la mig 338
CREATE OR REPLACE FUNCTION public.marcar_seguimiento_shortlist(
  p_hash text, p_enviado boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tel text;
  v_n   integer;
BEGIN
  SELECT cliente_telefono INTO v_tel FROM broker_shortlists WHERE hash = p_hash;
  IF v_tel IS NULL THEN
    RAISE EXCEPTION 'hash inexistente: %', p_hash USING ERRCODE = '22023';
  END IF;

  UPDATE broker_shortlists
     SET seguimiento_intentado_at = now(),
         seguimiento_enviado_at = CASE WHEN p_enviado THEN now() ELSE seguimiento_enviado_at END
   WHERE broker_slug = 'simon-asistente'
     AND seguimiento_enviado_at IS NULL
     AND replace(cliente_telefono, '+', '') = replace(v_tel, '+', '');

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.marcar_seguimiento_shortlist(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_seguimiento_shortlist(text, boolean) TO service_role;

DROP FUNCTION IF EXISTS public.marcar_intento_seguimiento(text);
DROP FUNCTION IF EXISTS public.confirmar_seguimientos_enviados(integer);

COMMIT;

-- `disparar_seguimiento_shortlists` queda con la llamada a confirmar, que ya no
-- existe: reaplicar la mig 339 para devolverla a su forma anterior.
