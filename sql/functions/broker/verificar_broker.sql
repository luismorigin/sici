-- Función: verificar_broker
-- Última migración: 075
-- Exportado de producción: 27 Feb 2026
-- Dominio: Broker B2B / Verificación admin

CREATE OR REPLACE FUNCTION public.verificar_broker(broker_id_input uuid, accion text, admin_nombre text DEFAULT 'admin'::text, notas text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
  BEGIN
    IF accion = 'aprobar' THEN
      UPDATE brokers SET
        estado_verificacion = 'verificado',
        fecha_verificacion = NOW(),
        verificado_por = admin_nombre,
        notas_verificacion = notas
      WHERE id = broker_id_input;
    ELSIF accion = 'rechazar' THEN
      UPDATE brokers SET
        estado_verificacion = 'rechazado',
        fecha_verificacion = NOW(),
        verificado_por = admin_nombre,
        notas_verificacion = notas
      WHERE id = broker_id_input;
    ELSE
      RETURN 'Acción no válida';
    END IF;
    RETURN 'OK';
  END;
  $function$;
