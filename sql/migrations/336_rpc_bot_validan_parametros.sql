-- =============================================================================
-- 336 · Las RPC del bot rechazan parámetros inválidos en vez de responder algo
--       plausible
-- =============================================================================
-- POR QUÉ
-- Lo pidió lab-kapso el 20-ago con 20 emulaciones medidas: ninguna de las 2 RPC
-- de consulta falla ante un parámetro mal formado. Todas devuelven algo creíble.
-- Un error ruidoso el bot lo ve y reintenta; una respuesta plausible se la cree y
-- se la cuenta al cliente.
--
-- El caso de fondo es `IF p_operacion = 'venta' THEN ... ELSE alquiler`: cualquier
-- valor que no sea EXACTAMENTE 'venta' cae a alquiler — 'VENTA', 'Venta',
-- 'venta ', 'rent', '' y NULL (`NULL = 'venta'` da NULL, no falso). Un cliente que
-- quiere COMPRAR recibiría alquileres, y el bot leería "4.000" como dólares cuando
-- son 4.000 Bs mensuales: error de categoría y de ~1000x, sin un solo mensaje de
-- error en el camino.
--
-- No es hipotético que el modelo escriba fuera de dominio. En producción
-- (`workflows/simon/workflow.js`) hay UNA tool `buscar` con `p_operacion` escrito
-- por el LLM, y los 4 `body_schema` están VACÍOS ({type:object, required:[],
-- properties:{}}): sin tipos, sin enum. En las emulaciones del 20-ago el bot ya
-- escribió tres parámetros fuera de dominio: `p_amoblado: true` (booleano),
-- `p_orden: "precio_asc"` y `p_operacion: null`.
--
-- QUÉ CAMBIA — y qué NO
-- Un caso correcto devuelve EXACTAMENTE lo mismo que antes: no se toca la firma,
-- ni los filtros, ni la forma del retorno. Lo único que cambia es que lo inválido
-- ahora falla (22023 → HTTP 400) en vez de contestar.
--
-- 🔑 EL MENSAJE DE ERROR ENSEÑA EL DOMINIO — esto es el corazón de la migración,
-- no un detalle de redacción. Un timeout es transitorio y el reintento converge;
-- un parámetro inválido es DETERMINÍSTICO: si el modelo reintenta lo mismo, falla
-- lo mismo, y gasta llamadas hasta rendirse. Un `22P02` mudo haría un loop.
-- `p_amoblado invalido: "true". Valores: si | semi | no | no_declarado` hace que
-- el reintento acierte al segundo intento. Por eso cada RAISE nombra el valor
-- recibido Y la lista completa de válidos.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LAS DOS DECISIONES QUE NO SON TÉCNICAS (tomadas por el founder, 21-ago)
--
-- 1) `amoblado` vacío en la mitad del inventario → SE DECLARA, NO SE COMPLETA.
--    Medido en Equipetrol: 99 'si' · 4 'semi' · 4 'no' · 89 SIN DATO (de 196).
--    Hoy el bot que filtra 'no' dice "hay 4 sin amoblar" cuando los candidatos
--    reales son ~84.
--    Se evaluó INFERIRLO como el estado de obra (mig 302/315) y se DESCARTÓ con
--    backtest — no hay señal limpia:
--      · "equipado" es un falso amigo masivo: de los 89 sin dato, 43 dicen
--        "equipado" (cocina equipada, no muebles) y solo 9 dicen "amoblado".
--        Sin separar los términos el número parecía 51: creíble y falso.
--      · la mención no da la DIRECCIÓN: en el grupo 'no', 3 de 4 dicen "amoblado"
--        …porque dicen "NO amoblado" / "sin amoblar".
--    No hay nada parecido al 96,7% de los vecinos del edificio. Inferir sería
--    inventar. Se declara, como con `estado_origen` y como con `[]` en amenidades:
--    vacío significa "no tenemos el dato", NUNCA "no tiene".
--    → `resumen_mercado` YA lo declara (`por_amoblado` agrupa los NULL como
--      'no especifica'); no hay nada que cambiar ahí.
--    → `buscar_propiedades` gana el valor **`no_declarado`** (aditivo: ningún
--      comportamiento previo cambia) para que el bot pueda pedir ese grupo
--      explícitamente y aclarar que el aviso no lo dice.
--
-- 2) ZONA NORTE QUEDA CERRADA AL BOT.
--    Hoy `zona = p_zona` NO restringe `zona_general`: si al bot le llegara el
--    nombre de una zona de ZN, la RPC se la sirve — 305 ventas + 118 alquileres
--    que están en dark launch/noindex en todo el resto del sitio. Nadie lo usó
--    porque el bot no conoce esos nombres, pero servía sin que se hubiera
--    decidido. Ahora se decidió: solo Equipetrol.
--    🔑 La lista blanca se DERIVA de `zonas_geograficas` (zona_general='Equipetrol'
--    AND activo), no se hardcodea. Abrir ZN el día que se decida es cambiar esa
--    condición, no mantener una lista. Y valida case-insensitive resolviendo al
--    nombre canónico, así 'sirari' entra como 'Sirari' en vez de devolver 0.
--    ⚠️ Son SEIS zonas, no las 5 del prompt del bot: incluye 'Eq. 3er Anillo'
--    (1 venta, 2 alquileres). La lista de 5 es una decisión de presentación del
--    bot; la RPC valida contra SU dominio, que es el de los datos.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 DOS FILTROS QUE **NO** SE IMPLEMENTAN, Y ES LA PARTE IMPORTANTE
-- lab-kapso pidió (con razón) que `p_amoblado` y `p_estado` dejaran de ignorarse:
-- `p_amoblado` no existe en la rama de venta, `p_estado` no existe en la de
-- alquiler. Se midió la cobertura antes de implementarlos:
--
--     p_estado   en ALQUILER  →    0 de 196 tienen el dato (ni declarado ni inferido)
--     p_amoblado en VENTA     →   75 'si' · 5 'no' · 305 SIN DATO (de 385)
--
-- Implementar `p_estado` en alquiler devolvería CERO, siempre. Hoy el filtro se
-- ignora y la RPC contesta 196: molesto pero inofensivo. Implementarlo lo
-- convertiría en el bug que el propio pedido denuncia — un `[]` que el bot lee
-- como "no hay preventa en alquiler". Sería cambiar un filtro mudo por uno que
-- miente.
-- Por eso ambos se RECHAZAN con un error que dice por qué. El mensaje-que-enseña
-- se aplica también a la COMBINACIÓN, no solo al valor suelto.
-- (`p_amoblado` en venta además nunca lo ofrece el bot: su propia tool lo declara
--  "en alquiler". Un p_amoblado en venta es siempre un error del modelo.)
--
-- SE VALIDAN TAMBIÉN `p_dorms` / `p_precio_max` / `p_limit`, que quedaron fuera de
-- la lista final del pedido pero son la misma clase: `p_dorms: -1` devuelve 0 hoy,
-- y "0" se lee como "no hay monoambientes".
--
-- ALCANCE — las 2 funciones son EXCLUSIVAS del bot (grep sobre `sici` y
-- `simon-mvp`: cero llamadores; los únicos son lab-kapso). `buscar_similares` NO
-- se toca: quedó fuera del pedido (es la única que ya declara su error,
-- 'hash_no_encontrado', y sus `p_fav_ids` inválidos degradan a propósito).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ ORDEN DE APLICACIÓN — el bloqueo se LEVANTÓ, pero hay una ventana
--
-- La condición era que lab-kapso confirmara que un HTTP 400 se trata como
-- "reintentá" y no como caída. **Hecho el 20-ago, y era peor de lo que creían:**
-- el prompt no decía UNA palabra sobre errores de herramienta (cero menciones en
-- 20.129 caracteres), así que improvisaba — el 12-ago reintentó la MISMA llamada
-- 3 veces y llamó `handoff_to_human`, dejando la ejecución muerta. Ahora el prompt
-- manda: leer el error, corregir el parámetro, reintentar UNA vez, y si vuelve a
-- fallar seguir la charla sin ese dato.
-- 🔑 Y confirmaron algo que valida el diseño de los mensajes: **Kapso le pasa al
-- modelo el CUERPO del error**, no un genérico (se vio en la traza del 12-ago con
-- el `57014` textual). O sea el texto de estos RAISE le llega y puede corregir.
--
-- 🔴 VENTANA DE INCONSISTENCIA, INEVITABLE, Y DE QUÉ LADO CAER.
-- El 20-ago declararon los `body_schema` de las 4 tools, y sus `description`
-- describen el comportamiento VIEJO — son correctas HOY y quedan FALSAS al minuto
-- de aplicar esto:
--   · p_operacion: "Cualquier otro valor la RPC lo trata como alquiler sin avisar"
--   · p_estado:    "En alquiler la RPC lo ignora entero"      → pasa a FALLAR
--   · p_amoblado:  "en venta la RPC lo ignora entero"         → pasa a FALLAR
--   · p_orden:     "'area_desc'…caen a precio sin avisar"     → pasa a FALLAR
-- No se puede evitar: hasta que esto se aplique, esas frases son la verdad.
-- **Se aplica primero acá y ellos actualizan después**, y es seguro POR su fix:
-- el costo de la ventana es un reintento, no un handoff. Antes del 20-ago este
-- mismo orden habría derivado conversaciones a un humano.
--
-- 🔴 LO ÚNICO QUE SÍ LOS BLOQUEA A ELLOS: el enum de `p_amoblado` está declarado
-- como `["si","semi","no"]` — **no incluye `no_declarado`**. Hasta que lo agreguen,
-- el valor nuevo existe en la RPC y el modelo NO PUEDE emitirlo: la solución al
-- problema (b) —el que ellos mismos priorizaron como el más caro— queda inerte.
-- ⚠️ Y NO pueden agregarlo ANTES de aplicar esto: hoy `p_amoblado='no_declarado'`
-- entra al `amoblado = p_amoblado` y devuelve **0 en silencio**, que es peor que
-- no tenerlo. El orden es: aplicar → agregar el enum.
--
-- Menor, del mismo barrido: su `p_precio_max` declara `minimum: 0` (inclusive) y
-- esta RPC exige > 0. Un `p_precio_max: 0` pasa el schema y falla acá. Conviene
-- que sea exclusivo de su lado.
--
-- RIESGO RESIDUAL A DECLARAR: con el prompt nuevo, un error que el bot no logra
-- corregir en un reintento se vuelve **invisible** — sigue la charla sin ese dato
-- y sin mencionarlo. Eso sube la vara sobre no rechazar de más: si esta validación
-- rechazara algo legítimo, nadie se enteraría. Por eso valida solo dominios
-- cerrados y no inventa reglas de negocio.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CAMBIO OBSERVABLE DECLARADO: hoy `resumen_mercado(null)` devuelve alquiler y el
-- bot lo usó así (le dio el dato correcto por casualidad, porque ese es el
-- default). Con esto pasa a fallar. Es lo que se pidió; queda escrito para que no
-- se descubra en producción.
--
-- ROLLBACK: `sql/migrations/336_ROLLBACK_rpc_bot_validan_parametros.sql`
-- =============================================================================

BEGIN;

-- ── 1/2 · resumen_mercado ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resumen_mercado(
  p_operacion  text,
  p_zona       text    DEFAULT NULL::text,
  p_dorms      integer DEFAULT NULL::integer,
  p_precio_max numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  resultado  jsonb;
  v_op       text;
  v_zona     text;
  v_zonas_ok text;
BEGIN
  -- ── Validación de entrada ────────────────────────────────────────────────
  -- Normaliza Y valida: 'VENTA' / 'venta ' entran; 'rent' / '' / NULL fallan.
  -- El coalesce es imprescindible: sin él, NULL cae al ELSE (alquiler) igual.
  v_op := lower(trim(coalesce(p_operacion, '')));
  IF v_op NOT IN ('venta', 'alquiler') THEN
    RAISE EXCEPTION 'p_operacion invalido: %. Valores: venta | alquiler',
      coalesce('"' || p_operacion || '"', 'null')
      USING ERRCODE = '22023';
  END IF;

  IF p_zona IS NOT NULL AND trim(p_zona) <> '' THEN
    SELECT z.nombre INTO v_zona
      FROM zonas_geograficas z
     WHERE lower(z.nombre) = lower(trim(p_zona))
       AND z.zona_general = 'Equipetrol'
       AND z.activo
     LIMIT 1;
    IF v_zona IS NULL THEN
      SELECT string_agg(DISTINCT z.nombre, ' | ' ORDER BY z.nombre) INTO v_zonas_ok
        FROM zonas_geograficas z
       WHERE z.zona_general = 'Equipetrol' AND z.activo;
      RAISE EXCEPTION 'p_zona invalida: "%". Valores: %', p_zona, v_zonas_ok
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_dorms IS NOT NULL AND (p_dorms < 0 OR p_dorms > 10) THEN
    RAISE EXCEPTION 'p_dorms fuera de rango: %. Valores: 0 (monoambiente) a 10', p_dorms
      USING ERRCODE = '22023';
  END IF;

  IF p_precio_max IS NOT NULL AND p_precio_max <= 0 THEN
    RAISE EXCEPTION 'p_precio_max debe ser mayor a 0 (recibido: %). USD en venta, Bs en alquiler.', p_precio_max
      USING ERRCODE = '22023';
  END IF;

  -- ── Cuerpo (sin cambios respecto de la mig 326, salvo v_op / v_zona) ──────
  IF v_op = 'venta' THEN
    -- `MATERIALIZED` es el fix: obliga a resolver la vista UNA vez (18 ms) en vez
    -- de que el planner la meta en un Nested Loop y la repita 542 veces (4,3 s).
    WITH base AS MATERIALIZED (
      SELECT precio_norm, zona, zona_general, dormitorios,
             COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion
      FROM v_mercado_venta_shadow
      LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id
    ),
    f AS (
      SELECT * FROM base
      WHERE precio_norm >= 20000
        AND ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_norm <= p_precio_max)
    )
    SELECT jsonb_build_object(
      'moneda', 'USD',
      'general', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(precio_norm)::int,
          'hasta',   MAX(precio_norm)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_norm)::int
        ) FROM f
      ),
      'por_zona', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('zona', zona, 'cant', COUNT(*), 'desde', MIN(precio_norm)::int) AS t
          FROM f GROUP BY zona
        ) s
      ),
      'por_estado', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('estado', estado_construccion::text, 'cant', COUNT(*)) AS t
          FROM f GROUP BY estado_construccion
        ) s
      )
    ) INTO resultado;
  ELSE
    -- RAMA DE ALQUILER — mig 326. El boliviano se DERIVA cuando el aviso se publicó
    -- en dólares, con la misma fórmula que `buscar_unidades_alquiler_shadow`.
    -- `por_amoblado` agrupa los NULL como 'no especifica': acá es donde el bot ve
    -- que el faltante existe (89 de 196). NO se completa, se declara.
    WITH par AS (
      SELECT (valor)::numeric AS tc FROM config_global WHERE clave = 'tipo_cambio_paralelo'
    ),
    f AS (
      SELECT COALESCE(precio_mensual_bob, ROUND(precio_mensual * (SELECT tc FROM par), 2)) AS bob,
             zona,
             amoblado
      FROM v_mercado_alquiler_shadow
      WHERE ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
    ),
    g AS (
      SELECT * FROM f
      WHERE bob >= 1000
        AND (p_precio_max IS NULL OR bob <= p_precio_max)
    )
    SELECT jsonb_build_object(
      'moneda', 'Bs',
      'general', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(bob)::int,
          'hasta',   MAX(bob)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bob)::int
        ) FROM g
      ),
      'por_zona', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('zona', zona, 'cant', COUNT(*), 'desde', MIN(bob)::int) AS t
          FROM g GROUP BY zona
        ) s
      ),
      'por_amoblado', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('amoblado', COALESCE(amoblado,'no especifica'), 'cant', COUNT(*)) AS t
          FROM g GROUP BY amoblado
        ) s
      )
    ) INTO resultado;
  END IF;

  RETURN resultado;
END;
$function$;

-- ── 2/2 · buscar_propiedades ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buscar_propiedades(
  p_operacion  text,
  p_zona       text    DEFAULT NULL::text,
  p_dorms      integer DEFAULT NULL::integer,
  p_precio_max numeric DEFAULT NULL::numeric,
  p_estado     text    DEFAULT NULL::text,
  p_amoblado   text    DEFAULT NULL::text,
  p_orden      text    DEFAULT 'precio'::text,
  p_limit      integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  resultado  jsonb;
  v_op       text;
  v_zona     text;
  v_zonas_ok text;
  v_estado   text;
  v_amoblado text;
  v_orden    text;
BEGIN
  -- ── Validación de entrada ────────────────────────────────────────────────
  v_op := lower(trim(coalesce(p_operacion, '')));
  IF v_op NOT IN ('venta', 'alquiler') THEN
    RAISE EXCEPTION 'p_operacion invalido: %. Valores: venta | alquiler',
      coalesce('"' || p_operacion || '"', 'null')
      USING ERRCODE = '22023';
  END IF;

  IF p_zona IS NOT NULL AND trim(p_zona) <> '' THEN
    SELECT z.nombre INTO v_zona
      FROM zonas_geograficas z
     WHERE lower(z.nombre) = lower(trim(p_zona))
       AND z.zona_general = 'Equipetrol'
       AND z.activo
     LIMIT 1;
    IF v_zona IS NULL THEN
      SELECT string_agg(DISTINCT z.nombre, ' | ' ORDER BY z.nombre) INTO v_zonas_ok
        FROM zonas_geograficas z
       WHERE z.zona_general = 'Equipetrol' AND z.activo;
      RAISE EXCEPTION 'p_zona invalida: "%". Valores: %', p_zona, v_zonas_ok
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_dorms IS NOT NULL AND (p_dorms < 0 OR p_dorms > 10) THEN
    RAISE EXCEPTION 'p_dorms fuera de rango: %. Valores: 0 (monoambiente) a 10', p_dorms
      USING ERRCODE = '22023';
  END IF;

  IF p_precio_max IS NOT NULL AND p_precio_max <= 0 THEN
    RAISE EXCEPTION 'p_precio_max debe ser mayor a 0 (recibido: %). USD en venta, Bs en alquiler.', p_precio_max
      USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NOT NULL AND (p_limit < 1 OR p_limit > 50) THEN
    RAISE EXCEPTION 'p_limit fuera de rango: %. Valores: 1 a 50 (por defecto 6)', p_limit
      USING ERRCODE = '22023';
  END IF;

  -- `p_estado` SOLO en venta: en alquiler el dato no existe en 196 de 196, así que
  -- implementarlo devolvería 0 siempre y el bot lo leería como "no hay".
  v_estado := nullif(lower(trim(coalesce(p_estado, ''))), '');
  IF v_estado IS NOT NULL THEN
    IF v_op = 'alquiler' THEN
      RAISE EXCEPTION 'p_estado no aplica a alquiler: el estado de obra no existe en alquiler. Omitilo.'
        USING ERRCODE = '22023';
    END IF;
    IF v_estado NOT IN ('preventa', 'entrega_inmediata') THEN
      RAISE EXCEPTION 'p_estado invalido: "%". Valores: preventa | entrega_inmediata', p_estado
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- `p_amoblado` SOLO en alquiler (en venta falta en 305 de 385 y el bot no lo
  -- ofrece). 'sí' con acento se normaliza; 'true' falla y el mensaje enseña.
  -- 'no_declarado' es NUEVO: pide explícitamente los que el aviso no aclara.
  v_amoblado := nullif(translate(lower(trim(coalesce(p_amoblado, ''))), 'áéíóú', 'aeiou'), '');
  IF v_amoblado IS NOT NULL THEN
    IF v_op = 'venta' THEN
      RAISE EXCEPTION 'p_amoblado no aplica a venta: el dato casi no existe en venta. Omitilo.'
        USING ERRCODE = '22023';
    END IF;
    IF v_amoblado NOT IN ('si', 'semi', 'no', 'no_declarado') THEN
      RAISE EXCEPTION 'p_amoblado invalido: "%". Valores: si | semi | no | no_declarado', p_amoblado
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- El riesgo real no es 'xxx' (nadie lo pide) sino 'area_desc' / 'm2' /
  -- 'superficie': hoy caen en `<> 'area'` y ordenan por PRECIO, en silencio.
  v_orden := nullif(lower(trim(coalesce(p_orden, ''))), '');
  IF v_orden IS NULL THEN
    v_orden := 'precio';
  END IF;
  IF v_orden NOT IN ('precio', 'area') THEN
    RAISE EXCEPTION 'p_orden invalido: "%". Valores: precio (mas barato primero) | area (mas grande primero)', p_orden
      USING ERRCODE = '22023';
  END IF;

  -- ── Cuerpo (sin cambios, salvo las variables validadas) ───────────────────
  IF v_op = 'venta' THEN
    WITH base AS MATERIALIZED (
      SELECT id, nombre_edificio, precio_norm, area_total_m2, banos, estacionamientos,
             COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion,
             url, zona, zona_general, dormitorios
      FROM v_mercado_venta_shadow
      LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id
    )
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO resultado FROM (
      SELECT jsonb_build_object(
        'id', id,
        'edificio', nombre_edificio,
        'precio_usd', precio_norm::int,
        'm2', area_total_m2,
        'banos', banos,
        'parqueo', estacionamientos,
        'estado', estado_construccion::text,
        'url', url,
        'amenidades', amenidades_normalizadas(id)
      ) AS t
      FROM base
      WHERE precio_norm >= 20000
        AND ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_norm <= p_precio_max)
        AND (v_estado IS NULL OR estado_construccion::text = v_estado)
      ORDER BY
        CASE WHEN v_orden = 'area' THEN area_total_m2 END DESC NULLS LAST,
        CASE WHEN v_orden <> 'area' THEN precio_norm END ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  ELSE
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO resultado FROM (
      SELECT jsonb_build_object(
        'id', id,
        'edificio', nombre_edificio,
        'precio_bob', precio_bob_efectivo::int,
        'm2', area_total_m2,
        'banos', banos,
        'parqueo', estacionamientos,
        'amoblado', amoblado,
        'url', url,
        'amenidades', amenidades_normalizadas(id)
      ) AS t
      FROM (
        SELECT *, COALESCE(
                    precio_mensual_bob,
                    ROUND(precio_mensual * (SELECT valor::numeric FROM config_global WHERE clave = 'tipo_cambio_paralelo'), 2)
                  ) AS precio_bob_efectivo
        FROM v_mercado_alquiler_shadow
      ) v_alq
      WHERE precio_bob_efectivo >= 1000
        AND ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_bob_efectivo <= p_precio_max)
        AND (v_amoblado IS NULL
             OR (v_amoblado =  'no_declarado' AND amoblado IS NULL)
             OR (v_amoblado <> 'no_declarado' AND amoblado = v_amoblado))
      ORDER BY
        CASE WHEN v_orden = 'area' THEN area_total_m2 END DESC NULLS LAST,
        CASE WHEN v_orden <> 'area' THEN precio_bob_efectivo END ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  END IF;

  RETURN resultado;
END;
$function$;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN — correr DESPUÉS de aplicar
-- =============================================================================
-- A) Nada de lo que funciona hoy cambió.
--    🔴 NO comparar contra un número escrito acá: **el inventario se mueve todas
--    las noches**. Entre el 20 y el 21-ago la venta pasó de 383 a 385 sin que nadie
--    tocara nada, y una verificación con el número clavado habría "fallado" por la
--    captura, no por la migración. Se compara CONTRA UNO MISMO:
--
--    1. ANTES de aplicar, correr y ANOTAR el resultado:
--       SELECT (resumen_mercado('venta')   ->'general'->>'total')::int AS venta,
--              (resumen_mercado('alquiler')->'general'->>'total')::int AS alquiler,
--              jsonb_array_length(buscar_propiedades('venta'))         AS lista_v,
--              jsonb_array_length(buscar_propiedades('alquiler'))      AS lista_a;
--    2. Aplicar.
--    3. Correr la MISMA query. Los 4 valores deben ser idénticos a los anotados.
--       (Hacerlo en la misma sesión, sin una captura nocturna en el medio.)
--
-- B) Lo que antes mentía, ahora falla. ✅ VERIFICADO EN VIVO el 21-ago-2026 tras
--    aplicar — los 8 dieron ERROR 22023 con el mensaje que se anota al lado:
--   SELECT resumen_mercado(NULL);
--     → p_operacion invalido: null. Valores: venta | alquiler       [antes: 196 en Bs]
--   SELECT resumen_mercado('rent');
--     → p_operacion invalido: "rent". Valores: venta | alquiler     [antes: 196 en Bs]
--   SELECT resumen_mercado('venta','Equipetrol');
--     → p_zona invalida: "Equipetrol". Valores: Eq. 3er Anillo | …  [antes: 0]
--   SELECT resumen_mercado('venta','4to-6to anillo Banzer-Alemana');
--     → p_zona invalida: … (Zona Norte cerrada)        [antes: servía props de ZN]
--   SELECT resumen_mercado('venta', p_dorms => -1);
--     → p_dorms fuera de rango: -1. Valores: 0 (monoambiente) a 10  [antes: 0]
--   SELECT buscar_propiedades('alquiler', p_amoblado => 'true');
--     → p_amoblado invalido: "true". Valores: si | semi | no | no_declarado  [antes: []]
--   SELECT buscar_propiedades('alquiler', p_orden => 'area_desc');
--     → p_orden invalido: "area_desc". Valores: precio … | area …   [antes: ordenaba por precio]
--   SELECT buscar_propiedades('alquiler', p_estado => 'preventa');
--     → p_estado no aplica a alquiler …                [antes: 6 sin filtrar]
--   SELECT buscar_propiedades('venta', p_amoblado => 'si');
--     → p_amoblado no aplica a venta …                 [antes: 6 sin filtrar]
--
-- 🔴 `resumen_mercado('VENTA')` NO va en esta lista — y estuvo acá por error hasta
--    que la verificación en vivo lo desmintió. **No debe fallar: debe NORMALIZARSE.**
--    Ese es el punto de "normalizar Y validar". Va en el bloque C.
--
-- C) Lo que antes MENTÍA o daba 0 por ortografía, ahora entra normalizado.
--    ✅ VERIFICADO EN VIVO el 21-ago-2026:
--   SELECT (resumen_mercado('VENTA')->'general'->>'total')::int;
--     → 385 en USD.  🔑 ANTES DEVOLVÍA 196 EN Bs (alquiler): este es EL bug del
--       pedido, el que le mostraba 4.000 Bs de alquiler a quien quería comprar.
--   SELECT (resumen_mercado('venta ','sirari')->'general'->>'total')::int;  -- 105
--   SELECT (resumen_mercado('Venta','SIRARI')->'general'->>'total')::int;   -- 105
--   SELECT (resumen_mercado('venta','Sirari')->'general'->>'total')::int;   -- 105
--     → los tres iguales: mayúsculas, espacio sobrante y case de la zona se
--       resuelven al nombre canónico en vez de devolver 0.
--   SELECT jsonb_array_length(buscar_propiedades('alquiler', p_amoblado => 'sí', p_limit => 50));
--     → entra con acento (se normaliza a 'si').
--
-- D) El valor nuevo. Se compara contra la vista, no contra un número escrito acá:
--   SELECT jsonb_array_length(buscar_propiedades('alquiler', p_amoblado => 'no_declarado', p_limit => 50))
--          = (SELECT LEAST(50, COUNT(*)) FROM v_mercado_alquiler_shadow
--              WHERE zona_general='Equipetrol' AND amoblado IS NULL
--                AND COALESCE(precio_mensual_bob, ROUND(precio_mensual *
--                    (SELECT valor::numeric FROM config_global WHERE clave='tipo_cambio_paralelo'),2)) >= 1000)
--          AS no_declarado_ok;   -- debe dar true
--   -- y el grupo 'no' no se movió:
--   SELECT jsonb_array_length(buscar_propiedades('alquiler', p_amoblado => 'no', p_limit => 50))
--          = (SELECT COUNT(*) FROM v_mercado_alquiler_shadow
--              WHERE zona_general='Equipetrol' AND amoblado='no') AS no_ok;   -- true
--
-- E) Zona Norte queda cerrada (debe dar ERROR; antes servía propiedades):
--   SELECT resumen_mercado('venta','4to-6to anillo Banzer-Alemana');
-- =============================================================================
