-- =============================================================================
-- 341 · El seguimiento deja de despertar al agente y manda el mensaje él mismo
-- =============================================================================
-- 🔴 POR QUÉ SE ABANDONA EL `resume` — y no es una preferencia, es que no funciona.
-- lab-kapso corrió el experimento escalonado el 26-ago y encontró la variable real:
-- **no es la inactividad de la conversación, es la EDAD DE LA EJECUCIÓN** (desde su
-- `started_at`). Pasado cierto punto el agente se despierta, mira y se vuelve a
-- dormir sin redactar:
--
--        1,1 h de vida de la ejecución   → salió
--        5,2 h  (¡con 30 min de quietud!) → nada
--       15,9 h  (Israel)                  → nada
--       18,1 h  (Jenny)                   → nada
--
-- El corte cae entre 1,1 h y 5,2 h. **Ningún ajuste de parámetros salva el enfoque**:
-- este seguimiento sale a las 9 h por diseño, así que su caso normal es siempre el
-- caso que falla. El destinatario es, literalmente, quien se fue y no volvió.
--
-- 🔑 LA SALIDA NO ES UNA PLANTILLA DE META. Las plantillas hacen falta para escribir
-- FUERA de la ventana de 24 h; esto sale a las 9 h, bien adentro. Medido sobre 47
-- personas con historial: **0 tienen la ventana cerrada a las 9 h**, y el máximo
-- entre el último mensaje de la persona y su shortlist es de **2,2 minutos** — la
-- shortlist se arma mientras la persona está hablando. Hasta el borde del guard de
-- 22 h entra con dos horas de sobra.
--
-- Se manda el mensaje directo por el proxy de Kapso sobre la Cloud API, que no toca
-- ninguna ejecución: no hay sesión que despertar, así que el problema desaparece en
-- vez de mitigarse.
--
-- -----------------------------------------------------------------------------
-- QUÉ CAMBIA ACÁ: la función devuelve el TELÉFONO y el PRIMER NOMBRE
--
-- La mig 338 los omitía a propósito y conviene decir por qué eso NO se está
-- relajando. Lo que la 338 impedía es que el DISPARADOR le mandara al endpoint la
-- lista de a quién escribirle: con eso, quien consiguiera el token podía inyectar
-- destinatarios arbitrarios y hacer que el bot le escriba a cualquiera con nuestro
-- número. **Eso sigue igual**: el body del disparo va vacío y el endpoint consulta
-- esta función con su propia llave de servidor.
--
-- Lo que cambió es la necesidad: para inyectar una marca alcanzaba el
-- `conversation_id`; para MANDAR un mensaje hace falta el número. El dato no viaja
-- por ningún body — lo lee el endpoint de la base, que es donde ya vivía.
--
-- 🔑 PRIMER NOMBRE, no el nombre completo. `cliente_nombre` guarda lo que la persona
-- escribió, y ahí adentro hay "Israel Torres", "Ivana Salazar" y hasta "Carlos
-- Alvarez 71655553". "Hola Israel Torres" suena a carta del banco. Se corta en el
-- primer espacio; si no hay nombre usable, devuelve NULL y el endpoint saluda sin
-- nombre en vez de escribir "Hola , ".
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.shortlists_para_seguimiento();

CREATE OR REPLACE FUNCTION public.shortlists_para_seguimiento()
RETURNS TABLE(hash text, conversation_id text, telefono text,
              primer_nombre text, horas_desde numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ult AS (
    SELECT DISTINCT ON (telefono)
           telefono, kapso_conversation_id, direccion
      FROM simon_mensajes
     WHERE kapso_conversation_id IS NOT NULL
     ORDER BY telefono, enviado_at DESC
  ),
  candidatas AS (
    SELECT s.hash,
           s.cliente_telefono,
           u.kapso_conversation_id,
           -- Primer token del nombre, y sólo si parece un nombre: se descartan los
           -- que son puro número (hay quien escribe "Carlos Alvarez 71655553").
           NULLIF(regexp_replace(split_part(btrim(coalesce(s.cliente_nombre, '')), ' ', 1),
                                 '[^[:alpha:]áéíóúÁÉÍÓÚñÑüÜ]', '', 'g'), '') AS primer_nombre,
           s.created_at,
           round((EXTRACT(epoch FROM (now() - s.created_at)) / 3600)::numeric, 1) AS horas
      FROM broker_shortlists s
      JOIN ult u
        ON replace(u.telefono, '+', '') = replace(s.cliente_telefono, '+', '')
     WHERE s.broker_slug = 'simon-asistente'
       AND s.seguimiento_enviado_at IS NULL
       AND s.created_at <= now() - interval '9 hours'
       AND s.created_at >= now() - interval '22 hours'
       -- Sigue exigiendo que lo último de la conversación sea del BOT: si la persona
       -- escribió y quedó sin responder, el problema es otro y no lo arregla esto.
       AND u.direccion = 'out'
       AND (s.seguimiento_intentado_at IS NULL
            OR s.seguimiento_intentado_at < now() - interval '1 hour')
  )
  SELECT DISTINCT ON (cliente_telefono)
         hash, kapso_conversation_id, cliente_telefono, primer_nombre, horas
    FROM candidatas
   ORDER BY cliente_telefono, created_at DESC;
$function$;

COMMENT ON FUNCTION public.shortlists_para_seguimiento() IS
  'A quién le toca seguimiento. Una fila por PERSONA (la shortlist más reciente). '
  'Devuelve teléfono y primer nombre porque el endpoint manda el mensaje él mismo '
  '(mig 341) — el resume quedó descartado: el agente no redacta si su ejecución '
  'tiene más de unas horas de vida. El disparador sigue sin mandar destinatarios: '
  'el body va vacío y el endpoint consulta esta función con su llave de servidor.';

REVOKE ALL ON FUNCTION public.shortlists_para_seguimiento() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shortlists_para_seguimiento() TO service_role;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
-- 1 · La firma nueva (debe listar telefono y primer_nombre):
--     SELECT pg_get_function_result(oid) FROM pg_proc
--      WHERE proname = 'shortlists_para_seguimiento';
--
-- 2 · Que el primer nombre salga limpio. Sobre los nombres que hay hoy en la tabla,
--     "Israel Torres" → Israel · "Carlos Alvarez 71655553" → Carlos ·
--     "Ana (test alquiler)" → Ana · un nombre vacío → NULL:
--     SELECT cliente_nombre,
--            NULLIF(regexp_replace(split_part(btrim(coalesce(cliente_nombre,'')),' ',1),
--                   '[^[:alpha:]áéíóúÁÉÍÓÚñÑüÜ]','','g'), '') AS primer_nombre
--       FROM broker_shortlists WHERE broker_slug='simon-asistente'
--      ORDER BY created_at DESC LIMIT 15;
--
-- 3 · Nadie más que service_role la ejecuta:
--     SELECT proacl FROM pg_proc WHERE proname='shortlists_para_seguimiento';
--
-- 🔴 EL ENDPOINT ACOMPAÑA: la firma cambió (dos columnas nuevas) y el envío pasa a
--    ser un POST a api.kapso.ai. Con el cron apagado el orden no importa, pero no se
--    reenciende hasta que las dos partes estén.
-- =============================================================================
