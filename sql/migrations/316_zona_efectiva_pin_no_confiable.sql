-- =============================================================================
-- 316 · Un pin que el sistema ya declaró basura no debe decidir la zona
-- =============================================================================
-- SÍNTOMA: 22 edificios tienen sus avisos repartidos en más de una `zona` dentro
-- de las vistas de mercado. Un edificio ocupa un punto: no puede estar en dos
-- zonas. Contamina las medianas EN LAS DOS DIRECCIONES a la vez, y las celdas
-- zona×dormitorios tienen muestra chica (de 64, solo 2 llegan a n>=30).
--
-- 🔴 EL FEED NO ESTÁ AFECTADO. `buscar_unidades_simple_shadow` agrupa por
--    `pm.zona` (la ficha del edificio), así que ahí siempre se vio bien. El
--    reparto ocurre solo donde se usa la zona del AVISO: vistas de mercado →
--    medianas, $/m², snapshots de absorción, informes y ACM.
--
-- ── POR QUÉ PASA (medido, no supuesto) ──────────────────────────────────────
-- NO es "el edificio está justo sobre el borde de un polígono". Las props
-- desalineadas están a 1.000–4.335 m de su propio edificio:
--     Barcelona 4.335 m · Zero 3.987 m · Westgate 3.690 m · Sky Luxury 1.185 m
-- Un aviso a 4 km de su edificio no tiene un pin impreciso: tiene el pin por
-- defecto del portal.
--
-- 🔑 Y EL SISTEMA YA SABE CUÁLES SON ESOS PINES. El audit detecta los "pines
--    genéricos" (una coordenada compartida por VARIOS edificios distintos —
--    físicamente imposible) y los excluye de la superficie 5 porque no tiene
--    sentido mandar a leer un aviso cuyo pin es un default. Esa señal estaba
--    calculada y nadie la había conectado con la zona: hoy la zona se deriva de
--    un pin que el propio sistema declaró no confiable.
--
-- ── LA REGLA ────────────────────────────────────────────────────────────────
-- NO es "la ficha del edificio siempre gana". Es más angosto, y a propósito:
--
--     Un pin DEMOSTRABLEMENTE malo no determina la zona.
--
-- "Demostrablemente malo" = pin genérico del portal, o a más de 800 m del
-- edificio (el mismo umbral de la superficie 5, calibrado el 4-ago: de 932
-- matches con GPS, 841 caen a <150 m).
-- Donde el pin es plausible, no se toca nada — aunque la zona no coincida.
--
-- ⚠️ RESPETA `campos_bloqueados.zona` (regla crítica #1). Hoy no cambia ningún
--    resultado: las 22 props con candado YA están alineadas con su ficha. Se
--    programa igual, porque la regla no puede depender de que hoy no colisione.
--    (Esos candados los puso un `auditor_zona` con esta razón escrita en la BD:
--     "shadow no tiene el trigger de zona, así que no se corregía sola" — o sea
--     este problema ya se había diagnosticado y parcheado a mano 22 veces.)
--
-- ── IMPACTO MEDIDO ──────────────────────────────────────────────────────────
--   · 24 propiedades cambian de zona (de 771 en la vista de venta).
--   · Las medianas se mueven <2% en las zonas con muestra real. Las que saltan
--     (6to-8vo Banzer-Alemana +8,3%) son de n<15: es su fragilidad conocida, no
--     un efecto de este cambio.
--   · Quedan 9 edificios repartidos, A PROPÓSITO: su pin es plausible y aun así
--     la zona no coincide con la del edificio. 👉 Ahí lo que puede estar mal es
--     el MATCH, no el pin. Eso lo resuelve un juez leyendo, no una regla.
--
-- 🔴 CORTA LA SERIE DE ABSORCIÓN: los snapshots ya escritos quedan con la zona
--    vieja. Se hace AHORA justamente por eso — la serie shadow tiene 4 días
--    limpios (arrancó el 21-jul y el bug de las bajas la inflaba hasta el
--    3-ago), así que el corte casi no duele. Cada semana que pase, duele más.
--
-- ── POR QUÉ EN LA VISTA Y NO EN LA TABLA ────────────────────────────────────
-- Se evaluó replicar en shadow los triggers de zona que prod sí tiene
-- (`trg_asignar_zona_venta`/`_alquiler`; shadow no tiene ninguno). Se descartó:
--   1. El trigger de VENTA **no toma la zona de la ficha**: la deriva siempre
--      del polígono del pin y solo consulta el edificio para decidir si excluir.
--      Replicarlo no arreglaría esto. (El de ALQUILER sí la toma — asimetría no
--      documentada entre los dos, anotada como deuda aparte.)
--   2. Puede escribir `status = 'excluida_zona'`: en shadow eso significa que un
--      UPDATE del cargador nocturno podría sacar propiedades del feed, en
--      silencio y sin que nadie lo pida.
-- La vista, en cambio: no toca datos, no puede excluir nada, se revierte con un
-- comando, y se auto-mantiene (cuando el audit aprueba un match nuevo, la zona
-- se corrige sola).
-- ⚠️ Deuda declarada: los scripts que leen `propiedades_v2_shadow` directo
--    (audits, queries ad-hoc) siguen viendo la zona del pin.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · La vista de derivación (mismo patrón que v_estado_obra_inferido_shadow:
--     el valor + de dónde salió, para poder declararlo y para poder auditarlo)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_zona_efectiva_shadow AS
WITH pines_genericos AS (
  -- Una coordenada compartida por MÁS DE UN edificio no es una ubicación: es el
  -- pin por defecto del portal. Se detecta por datos, no por lista fija, para
  -- que un pin nuevo del portal quede cazado solo.
  SELECT latitud, longitud
  FROM public.propiedades_v2_shadow
  WHERE es_activa AND latitud IS NOT NULL AND longitud IS NOT NULL
    AND id_proyecto_master IS NOT NULL
  GROUP BY 1, 2
  HAVING COUNT(DISTINCT id_proyecto_master) > 1
)
SELECT
  p.id AS propiedad_id,
  CASE
    WHEN public.campo_esta_bloqueado(p.campos_bloqueados, 'zona') THEN p.zona::text
    WHEN pm.zona IS NOT NULL AND pm.zona::text <> 'Sin zona' AND (
           g.latitud IS NOT NULL
        OR (p.latitud IS NOT NULL AND pm.latitud IS NOT NULL
            AND ST_DistanceSphere(ST_MakePoint(p.longitud::float, p.latitud::float),
                                  ST_MakePoint(pm.longitud::float, pm.latitud::float)) > 800)
         ) THEN pm.zona::text
    ELSE p.zona::text
  END AS zona_efectiva,
  CASE
    WHEN public.campo_esta_bloqueado(p.campos_bloqueados, 'zona') THEN 'candado'
    WHEN pm.zona IS NOT NULL AND pm.zona::text <> 'Sin zona' AND g.latitud IS NOT NULL
         THEN 'edificio_pin_generico'
    WHEN pm.zona IS NOT NULL AND pm.zona::text <> 'Sin zona'
         AND p.latitud IS NOT NULL AND pm.latitud IS NOT NULL
         AND ST_DistanceSphere(ST_MakePoint(p.longitud::float, p.latitud::float),
                               ST_MakePoint(pm.longitud::float, pm.latitud::float)) > 800
         THEN 'edificio_pin_lejano'
    ELSE 'aviso'
  END AS zona_origen
FROM public.propiedades_v2_shadow p
LEFT JOIN public.proyectos_master pm ON pm.id_proyecto_master = p.id_proyecto_master
LEFT JOIN pines_genericos g ON g.latitud = p.latitud AND g.longitud = p.longitud;

COMMENT ON VIEW public.v_zona_efectiva_shadow IS
  'Zona de una propiedad cuando su pin NO es confiable + de dónde salió. '
  'Origen: candado (un humano la fijó, regla #1) · edificio_pin_generico · edificio_pin_lejano (>800 m, '
  'mismo umbral que la superficie 5) · aviso (el pin es plausible, no se toca). '
  'NO es "la ficha siempre gana": solo interviene donde hay EVIDENCIA de que el pin falla. '
  'Un edificio repartido en dos zonas con pines plausibles es sospecha de MATCH malo, no de pin. Mig 316.';

REVOKE ALL   ON public.v_zona_efectiva_shadow FROM anon, authenticated;
GRANT SELECT ON public.v_zona_efectiva_shadow TO service_role, claude_readonly;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · Cablearla a las dos vistas de mercado — PARCHEANDO la definición viva
-- ─────────────────────────────────────────────────────────────────────────────
-- Se parchea con pg_get_viewdef() + replace() en vez de transcribir: cada vista
-- lista ~90 columnas y una transcripción a mano se come una en silencio (mismo
-- criterio que la mig 311). Son 3 cambios quirúrgicos, no una reescritura.
-- 🔑 Cada replace se VERIFICA: si el texto esperado no aparece, la migración
--    ABORTA. Un parche que no aplica y no avisa deja la vista intacta y a todos
--    creyendo que el fix está puesto.

DO $$
DECLARE
  v_vista   TEXT;
  v_def     TEXT;
  v_new     TEXT;
BEGIN
  FOREACH v_vista IN ARRAY ARRAY['v_mercado_venta_shadow', 'v_mercado_alquiler_shadow'] LOOP
    v_def := pg_get_viewdef(('public.' || v_vista)::regclass, true);
    v_new := v_def;

    -- (a) la columna `zona` pasa a ser la efectiva
    IF position('    p.zona,' IN v_new) = 0 THEN
      RAISE EXCEPTION 'ABORTA: no encontré "    p.zona," en %. La vista cambió de forma; revisar a mano.', v_vista;
    END IF;
    -- ⚠️ EL CAST ES OBLIGATORIO: `zona` es `character varying` en la vista y la
    --    expresión devuelve `text`. CREATE OR REPLACE VIEW **rechaza** cambiar el
    --    tipo de una columna existente ("cannot change data type of view column").
    v_new := replace(v_new, '    p.zona,',
                            '    COALESCE(ze.zona_efectiva, p.zona::text)::character varying AS zona,');

    -- (b) el LEFT JOIN que trae la zona efectiva
    IF position('FROM propiedades_v2_shadow p' IN v_new) = 0 THEN
      RAISE EXCEPTION 'ABORTA: no encontré el FROM en %.', v_vista;
    END IF;
    v_new := replace(v_new, 'FROM propiedades_v2_shadow p',
                            'FROM propiedades_v2_shadow p LEFT JOIN public.v_zona_efectiva_shadow ze ON ze.propiedad_id = p.id');

    -- (c) `zona_general` tiene que colgar de la zona EFECTIVA, no del pin —
    --     si no, una prop reasignada queda con la macrozona vieja.
    IF position('zg.nombre::text = p.zona::text' IN v_new) = 0 THEN
      RAISE EXCEPTION 'ABORTA: no encontré el JOIN a zonas_geograficas en %.', v_vista;
    END IF;
    v_new := replace(v_new, 'zg.nombre::text = p.zona::text',
                            'zg.nombre::text = COALESCE(ze.zona_efectiva, p.zona::text)');

    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', v_vista, v_new);
    RAISE NOTICE 'OK: % parcheada', v_vista;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr después del COMMIT)
-- =============================================================================
-- 1) De dónde sale la zona hoy. Esperado: ~24 filas con origen 'edificio_*'
--    entre las props de la vista de venta; el resto 'aviso'.
--   SELECT ze.zona_origen, COUNT(*)
--   FROM public.v_mercado_venta_shadow v
--   JOIN public.v_zona_efectiva_shadow ze ON ze.propiedad_id = v.id
--   GROUP BY 1 ORDER BY 2 DESC;
--
-- 2) 🔴 EL CHEQUEO QUE IMPORTA — edificios todavía repartidos.
--    Esperado: 9, y NINGUNO por pin genérico o lejano. Los que queden son
--    sospecha de MATCH malo → van al audit, no a una regla.
--   SELECT id_proyecto_master, array_agg(DISTINCT zona) AS zonas, COUNT(*) AS avisos
--   FROM public.v_mercado_venta_shadow
--   WHERE id_proyecto_master IS NOT NULL
--   GROUP BY 1 HAVING COUNT(DISTINCT zona) > 1 ORDER BY 3 DESC;
--
-- 3) Control de que no se perdió ni se duplicó ninguna fila.
--    Esperado: 771 en venta (el mismo número que antes del cambio).
--   SELECT COUNT(*) FROM public.v_mercado_venta_shadow;
--   SELECT COUNT(*) FROM public.v_mercado_alquiler_shadow;
--
-- 4) Los candados se respetan. Esperado: 0 filas.
--   SELECT v.id FROM public.v_mercado_venta_shadow v
--   JOIN public.propiedades_v2_shadow p ON p.id = v.id
--   WHERE p.campos_bloqueados ? 'zona' AND v.zona IS DISTINCT FROM p.zona::text;
--
-- =============================================================================
-- REVERSA — deshace el parche dejando la zona del pin
-- =============================================================================
-- DO $$
-- DECLARE v_vista TEXT; v_new TEXT;
-- BEGIN
--   FOREACH v_vista IN ARRAY ARRAY['v_mercado_venta_shadow','v_mercado_alquiler_shadow'] LOOP
--     v_new := pg_get_viewdef(('public.'||v_vista)::regclass, true);
--     v_new := replace(v_new, '    COALESCE(ze.zona_efectiva, p.zona::text)::character varying AS zona,', '    p.zona,');
--     v_new := replace(v_new, 'FROM propiedades_v2_shadow p LEFT JOIN public.v_zona_efectiva_shadow ze ON ze.propiedad_id = p.id',
--                             'FROM propiedades_v2_shadow p');
--     v_new := replace(v_new, 'zg.nombre::text = COALESCE(ze.zona_efectiva, p.zona::text)', 'zg.nombre::text = p.zona::text');
--     EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', v_vista, v_new);
--   END LOOP;
-- END $$;
-- DROP VIEW IF EXISTS public.v_zona_efectiva_shadow;
-- =============================================================================
