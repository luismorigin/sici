-- =============================================================================
-- 293 · v_atribucion_contactos también atribuye por CÓDIGO
-- =============================================================================
-- Complementa el fix del endpoint /ir (mismo commit).
--
-- Qué pasó: en producción, la primera lectura de una instancia FRÍA de Vercel se
-- pasaba del timeout (cold start + TLS + viaje a Supabase en sa-east-1) y el
-- nombre de la pieza no llegaba a tiempo → el texto precargado salía vacío y el
-- origen se perdía entero. Con ~230 usuarios/mes la función está fría casi
-- siempre, así que le pasaba a la MAYORÍA de los clicks reales.
--
-- El endpoint ahora (a) espera más (el cache lo paga una sola vez por instancia)
-- y (b) si aun así no tiene el nombre, manda el CÓDIGO en el texto:
--     "Hola Simón, vengo de tu publicación (f03) y quiero saber más."
-- Esta vista tiene que reconocer esa segunda forma, o esos contactos quedarían
-- sin atribuir justo cuando el fallback hizo su trabajo.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_atribucion_contactos AS
WITH primer_mensaje AS (
  SELECT DISTINCT ON (m.contacto_id)
         m.contacto_id, m.telefono, m.texto, m.enviado_at
  FROM public.simon_mensajes m
  WHERE m.direccion = 'in'
  ORDER BY m.contacto_id, m.enviado_at
),
-- Segunda forma: "(f03)" → pieza 3. La letra es la red (f/i/t/m) y no importa
-- para identificar la pieza; el número sí.
con_codigo AS (
  SELECT pm.*,
         NULLIF(regexp_replace(
           COALESCE(substring(pm.texto FROM '\(([fitm][0-9]{1,3})\)'), ''),
           '^[fitm]', ''), '')::int AS num_del_codigo
  FROM primer_mensaje pm
)
SELECT
  cc.contacto_id,
  cc.enviado_at                                   AS primer_contacto_at,
  COALESCE(p_nombre.num, p_codigo.num)            AS pieza_num,
  COALESCE(p_nombre.nombre, p_codigo.nombre)      AS pieza,
  (COALESCE(p_nombre.num, p_codigo.num) IS NOT NULL) AS atribuido,
  cc.texto                                        AS primer_mensaje,
  -- ⚠️ `via` va AL FINAL a propósito: CREATE OR REPLACE VIEW solo permite
  -- AGREGAR columnas al final — meterla en el medio Postgres lo interpreta como
  -- renombrar la que estaba en esa posición y aborta con 42P16. Mismo principio
  -- que la mig 276 ("append no rompe el orden posicional").
  --
  -- De dónde salió la atribución: sirve para saber cuánto está actuando el
  -- fallback (si `codigo` sube mucho, algo anda lento en el endpoint).
  CASE
    WHEN p_nombre.num IS NOT NULL THEN 'nombre'
    WHEN p_codigo.num IS NOT NULL THEN 'codigo'
    ELSE NULL
  END                                             AS via
FROM con_codigo cc
LEFT JOIN public.mkt_piezas p_nombre
  ON cc.texto ILIKE '%"' || p_nombre.nombre || '"%'
LEFT JOIN public.mkt_piezas p_codigo
  ON p_codigo.num = cc.num_del_codigo;

COMMENT ON VIEW public.v_atribucion_contactos IS
  'Qué publicación generó cada conversación, cruzando el texto precargado por /ir '
  '(mig 290) con mkt_piezas. Atribuye por NOMBRE de la pieza o, si el endpoint no '
  'alcanzó a resolverlo, por el CÓDIGO que manda como fallback (columna `via`). '
  '`atribuido=false` = escribió sin pasar por el link o borró el texto. Atribución '
  'por texto: sirve para comparar piezas entre sí, NO como conteo absoluto. '
  'Ver docs/backlog/MEDICION_FUNNEL_PLAN.md §Paso 4.';

-- 🔴 El REVOKE se repite: CREATE OR REPLACE VIEW no conserva los permisos si la
-- vista se recrea, y los default privileges del schema vuelven a aplicar.
REVOKE ALL   ON public.v_atribucion_contactos FROM anon, authenticated;
GRANT SELECT ON public.v_atribucion_contactos TO service_role, claude_readonly;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------
-- SELECT has_table_privilege('anon','public.v_atribucion_contactos','SELECT'); -- false
-- SELECT via, COUNT(*) FROM public.v_atribucion_contactos GROUP BY 1;
