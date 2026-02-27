-- Función: registrar_contacto_broker
-- Última migración: 070
-- Exportado de producción: 27 Feb 2026
-- Dominio: Broker B2B / Registro contacto lead-broker

CREATE OR REPLACE FUNCTION public.registrar_contacto_broker(p_lead_id integer, p_propiedad_id integer, p_broker_nombre text, p_broker_whatsapp text, p_broker_inmobiliaria text DEFAULT NULL::text, p_posicion_top3 integer DEFAULT 1)
 RETURNS TABLE(codigo_ref text, lead_nombre text, lead_whatsapp text, lead_email text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_codigo TEXT;
BEGIN
  v_codigo := generar_codigo_ref();

  UPDATE leads_mvp SET
    codigo_ref = v_codigo,
    contacto_broker_at = NOW(),
    broker_nombre = p_broker_nombre,
    broker_whatsapp = p_broker_whatsapp,
    broker_inmobiliaria = p_broker_inmobiliaria,
    propiedad_contactada = p_propiedad_id,
    posicion_en_top3 = p_posicion_top3,
    estado = CASE WHEN estado = 'confirmado' THEN 'interesado' ELSE estado END,
    updated_at = NOW()
  WHERE id = p_lead_id;

  RETURN QUERY
  SELECT
    v_codigo,
    l.nombre,
    l.whatsapp,
    l.email
  FROM leads_mvp l
  WHERE l.id = p_lead_id;
END;
$function$;
