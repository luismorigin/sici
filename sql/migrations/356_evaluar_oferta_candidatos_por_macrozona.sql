-- =============================================================================
-- 356 — evaluar_oferta: los candidatos por NOMBRE se limitan a la macrozona
-- =============================================================================
-- Hallazgo del chequeo de la mig 355 (5-oct-2026): "Portofino V" con p_macrozona='Zona Norte'
-- ofrecia como candidatos edificios de Villa Brigida (Equipetrol) y uno "Sin zona". No
-- adivinaba (declaraba ambiguo), pero la pregunta al usuario traia opciones que no venian
-- al caso. Ahora la busqueda por nombre exige zona_general = macrozona evaluada, igual que
-- ya hacia la busqueda por GPS.
--
-- Efectos a conocer:
--   · un edificio del catalogo con zona 'Sin zona' (fuera de cobertura) ya NO aparece por
--     nombre: sale 'no_encontrado' y el mensaje nombra la macrozona.
--   · si el nombre existe SOLO en otra macrozona, tambien sale 'no_encontrado' (y, con GPS,
--     se busca por cercania). Es lo correcto: comparar contra un edificio de otro mercado
--     daria un nivel vacio.
--
-- Cambio: CREATE OR REPLACE, SIN cambio de firma -> conserva GRANTs, REVOKEs y COMMENT.
-- Verificado antes de escribir: el cuerpo en produccion era identico al de la 355
-- (md5 ff9e7651... de 26754 caracteres), regla #7 de CLAUDE.md.
-- Se aplica a mano (Supabase UI / psql).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.evaluar_oferta(
  p_dormitorios         integer,
  p_area_m2             numeric,
  p_precio              numeric,
  p_moneda              text,                 -- 'usd' | 'usd_oficial' | 'bs'  (OBLIGATORIO)
  p_lat                 double precision DEFAULT NULL,  -- pin del usuario (ej. -17.7440)
  p_lon                 double precision DEFAULT NULL,  -- pin del usuario (ej. -63.1822)
  p_macrozona           text    DEFAULT NULL, -- opcional si hay GPS (se deduce)
  p_zona                text    DEFAULT NULL, -- opcional si hay GPS (se deduce)
  p_edificio            text    DEFAULT NULL, -- nombre: solo sirve para RESOLVER el edificio
  p_id_proyecto_master  integer DEFAULT NULL, -- uso interno del agente tras confirmar un candidato
  p_estado              text    DEFAULT NULL  -- 'entrega_inmediata' | 'preventa'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_macro     text;
  v_zona      text;
  v_moneda    text;
  v_estado    text;
  v_tc_par    numeric;
  v_tc_of     numeric;
  v_precio    numeric;          -- precio COMPARABLE en USD (el mismo criterio que el mercado)
  v_precio_bi numeric;          -- equivalente billete (solo si p_moneda='usd_oficial')
  v_m2        numeric;
  v_m2_bi     numeric;

  v_min_v     numeric;
  v_min_a     numeric;
  v_lo        numeric;
  v_hi        numeric;
  v_ratio     numeric;
  v_rb        numeric;
  v_rr_min    numeric;
  v_rr_max    numeric;
  v_ra        numeric;

  v_pm        integer;
  v_pm_nombre text;
  v_pm_macro  text;
  v_pm_origen text;             -- 'id' | 'nombre' | 'nombre+gps' | 'gps'
  v_pm_dist   numeric;          -- metros entre el punto y el edificio (si hay GPS)
  v_n_cand    integer;
  v_cand      jsonb;
  v_gps_zona  text;
  v_gps_macro text;
  v_gps_cands jsonb;
  v_d1        numeric;
  v_d2        numeric;
  v_punto     geometry;

  v_niveles   jsonb;
  v_elegido   jsonb;
  v_a_niveles jsonb;
  v_a_elegido jsonb;

  v_posicion  text;
  v_pos_bi    text;
  v_r_lo      numeric;
  v_r_mid     numeric;
  v_r_hi      numeric;
  v_etiqueta  text;

  v_supuestos jsonb := '[]'::jsonb;
  v_alertas   jsonb := '[]'::jsonb;
  v_nosabemos jsonb := '[]'::jsonb;
  v_datos_al  date;
BEGIN
  ---------------------------------------------------------------------------
  -- Validación (patrón mig 336): fuera de dominio = 22023 con los valores válidos
  ---------------------------------------------------------------------------
  -- UBICACION. Un SELECT ... INTO devuelve NULL si el punto no cae en ningun poligono
  -- (a diferencia de get_zona_by_gps() usada en un SELECT normal, que borra la fila).
  IF p_lat IS NOT NULL OR p_lon IS NOT NULL THEN
    IF p_lat IS NULL OR p_lon IS NULL THEN
      RAISE EXCEPTION 'p_lat y p_lon van juntos (recibido lat=%, lon=%)', coalesce(p_lat::text, 'null'), coalesce(p_lon::text, 'null')
        USING ERRCODE = '22023';
    END IF;
    IF NOT (p_lat BETWEEN -23 AND -9 AND p_lon BETWEEN -70 AND -57) THEN
      RAISE EXCEPTION 'coordenadas fuera de Bolivia: lat=%, lon=%. Por si estan invertidas: Santa Cruz es lat ~ -17.7, lon ~ -63.2', p_lat, p_lon
        USING ERRCODE = '22023';
    END IF;
    v_punto := ST_SetSRID(ST_Point(p_lon, p_lat), 4326);
    SELECT z.nombre, z.zona_general INTO v_gps_zona, v_gps_macro
      FROM zonas_geograficas z
     WHERE z.activo AND ST_Contains(z.geom, v_punto)
     LIMIT 1;
  END IF;

  IF p_macrozona IS NOT NULL AND trim(p_macrozona) <> '' THEN
    SELECT z.zona_general INTO v_macro
      FROM zonas_geograficas z
     WHERE z.activo AND lower(z.zona_general) = lower(trim(p_macrozona))
     LIMIT 1;
    IF v_macro IS NULL THEN
      RAISE EXCEPTION 'p_macrozona invalida: "%". Valores: %', p_macrozona,
        (SELECT string_agg(DISTINCT z.zona_general, ' | ' ORDER BY z.zona_general) FROM zonas_geograficas z WHERE z.activo)
        USING ERRCODE = '22023';
    END IF;
    IF v_gps_macro IS NOT NULL AND v_gps_macro <> v_macro THEN
      RAISE EXCEPTION 'el punto GPS cae en % pero se pidio %. Revisar el pin o la macrozona.', v_gps_macro, v_macro
        USING ERRCODE = '22023';
    END IF;
    IF p_lat IS NOT NULL AND v_gps_macro IS NULL THEN
      v_alertas := v_alertas || to_jsonb('gps_fuera_de_cobertura: el punto no cae en ningun poligono de zona; se usa la macrozona pedida y no se deduce la zona.'::text);
    END IF;
  ELSIF v_gps_macro IS NOT NULL THEN
    v_macro := v_gps_macro;
    v_supuestos := v_supuestos || to_jsonb(format('Macrozona deducida del GPS: %s.', v_macro));
  ELSE
    RAISE EXCEPTION '%', CASE WHEN p_lat IS NOT NULL
      THEN 'el punto GPS esta fuera de la cobertura (Equipetrol / Zona Norte). Pasar p_macrozona si igual se quiere evaluar contra una macrozona.'
      ELSE 'falta la ubicacion: pasar p_lat y p_lon (el pin de Google Maps del usuario) o p_macrozona.' END
      USING ERRCODE = '22023';
  END IF;

  IF p_dormitorios IS NULL OR p_dormitorios < 0 OR p_dormitorios > 10 THEN
    RAISE EXCEPTION 'p_dormitorios fuera de rango: %. Valores: 0 (monoambiente) a 10', coalesce(p_dormitorios::text, 'null')
      USING ERRCODE = '22023';
  END IF;
  IF p_area_m2 IS NULL OR p_area_m2 < 10 OR p_area_m2 > 2000 THEN
    RAISE EXCEPTION 'p_area_m2 fuera de rango: %. Valores: 10 a 2000 (m2)', coalesce(p_area_m2::text, 'null')
      USING ERRCODE = '22023';
  END IF;
  IF p_precio IS NULL OR p_precio <= 0 THEN
    RAISE EXCEPTION 'p_precio debe ser mayor a 0 (recibido: %)', coalesce(p_precio::text, 'null')
      USING ERRCODE = '22023';
  END IF;

  -- La moneda NO tiene default: es la decision de Lucho (se pregunta siempre).
  v_moneda := lower(trim(coalesce(p_moneda, '')));
  IF v_moneda NOT IN ('usd', 'usd_oficial', 'bs') THEN
    RAISE EXCEPTION 'p_moneda invalida: %. Valores: usd (dolares, como los publica el mercado) | usd_oficial (dolares al tipo de cambio oficial) | bs (bolivianos). Es obligatoria: preguntarla al usuario.',
      coalesce('"' || p_moneda || '"', 'null')
      USING ERRCODE = '22023';
  END IF;

  v_estado := nullif(lower(trim(coalesce(p_estado, ''))), '');
  IF v_estado IS NOT NULL AND v_estado NOT IN ('entrega_inmediata', 'preventa') THEN
    RAISE EXCEPTION 'p_estado invalido: "%". Valores: entrega_inmediata | preventa (o NULL si no se sabe)', p_estado
      USING ERRCODE = '22023';
  END IF;

  IF p_zona IS NOT NULL AND trim(p_zona) <> '' THEN
    SELECT z.nombre INTO v_zona
      FROM zonas_geograficas z
     WHERE z.activo AND z.zona_general = v_macro AND lower(z.nombre) = lower(trim(p_zona))
     LIMIT 1;
    IF v_zona IS NULL THEN
      RAISE EXCEPTION 'p_zona invalida: "%" para %. Valores: %', p_zona, v_macro,
        (SELECT string_agg(DISTINCT z.nombre, ' | ' ORDER BY z.nombre) FROM zonas_geograficas z WHERE z.activo AND z.zona_general = v_macro)
        USING ERRCODE = '22023';
    END IF;
  ELSIF v_gps_zona IS NOT NULL AND v_gps_macro = v_macro THEN
    v_zona := v_gps_zona;
    v_supuestos := v_supuestos || to_jsonb(format('Zona deducida del GPS: %s.', v_zona));
  END IF;

  ---------------------------------------------------------------------------
  -- Criterio (tabla) y tipo de cambio
  ---------------------------------------------------------------------------
  SELECT max(valor) FILTER (WHERE clave = 'min_comparables_venta'),
         max(valor) FILTER (WHERE clave = 'min_comparables_alquiler'),
         max(valor) FILTER (WHERE clave = 'banda_inferior_pct'),
         max(valor) FILTER (WHERE clave = 'banda_superior_pct'),
         max(valor) FILTER (WHERE clave = 'alerta_m2_ratio'),
         max(valor) FILTER (WHERE clave = 'rend_bajo_max'),
         max(valor) FILTER (WHERE clave = 'rend_razonable_min'),
         max(valor) FILTER (WHERE clave = 'rend_razonable_max'),
         max(valor) FILTER (WHERE clave = 'rend_alarma_min')
    INTO v_min_v, v_min_a, v_lo, v_hi, v_ratio, v_rb, v_rr_min, v_rr_max, v_ra
    FROM criterio_agente;
  IF v_min_v IS NULL OR v_min_a IS NULL OR v_lo IS NULL OR v_hi IS NULL OR v_ratio IS NULL
     OR v_rb IS NULL OR v_rr_min IS NULL OR v_rr_max IS NULL OR v_ra IS NULL THEN
    RAISE EXCEPTION 'criterio_agente incompleto: faltan umbrales. No se evalua con criterio inventado.'
      USING ERRCODE = '22023';
  END IF;

  SELECT max(valor::numeric) FILTER (WHERE clave = 'tipo_cambio_paralelo'),
         max(valor::numeric) FILTER (WHERE clave = 'tipo_cambio_oficial')
    INTO v_tc_par, v_tc_of
    FROM config_global
   WHERE clave IN ('tipo_cambio_paralelo', 'tipo_cambio_oficial');
  IF v_tc_par IS NULL OR v_tc_par <= 0 OR v_tc_of IS NULL OR v_tc_of <= 0 THEN
    RAISE EXCEPTION 'config_global sin tipo_cambio_paralelo/oficial validos' USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- Precio comparable. El mercado (regimen TC nuevo) publica el USD que dice el aviso
  -- y solo convierte los avisos en Bs, a la tasa paralela viva. Se trata igual a la oferta.
  ---------------------------------------------------------------------------
  IF v_moneda = 'usd' THEN
    v_precio := p_precio;
    v_supuestos := v_supuestos || to_jsonb('Precio en dolares, tomado tal cual (igual que los avisos del mercado).'::text);
  ELSIF v_moneda = 'bs' THEN
    v_precio := round(p_precio / v_tc_par, 2);
    v_supuestos := v_supuestos || to_jsonb(format('Precio en bolivianos convertido a USD con el TC paralelo vivo (%s), igual que el mercado.', v_tc_par));
  ELSE
    -- 'usd_oficial': el mercado NO descuenta estos avisos (mig 311): se compara el numero
    -- publicado y el equivalente billete se informa como sensibilidad, no como el precio.
    v_precio    := p_precio;
    v_precio_bi := round(p_precio * v_tc_of / v_tc_par, 2);
    v_supuestos := v_supuestos || to_jsonb(format('Precio en dolares al TC oficial: se compara el numero publicado (como hace el mercado) y se informa el equivalente en dolares billete (%s) como sensibilidad.', v_precio_bi));
    v_alertas   := v_alertas   || to_jsonb('duda_moneda: el equivalente billete es un precio distinto; confirmar con el vendedor en que moneda se paga.'::text);
  END IF;
  v_m2    := round(v_precio / p_area_m2, 2);
  v_m2_bi := CASE WHEN v_precio_bi IS NOT NULL THEN round(v_precio_bi / p_area_m2, 2) END;

  ---------------------------------------------------------------------------
  -- Resolver el edificio. El usuario aporta GPS y/o nombre; el id lo maneja el agente.
  -- Precedencia: (A) id explicito (uso interno) > (B) nombre, con el GPS para desempatar
  -- homonimos > (C) GPS solo, que unicamente decide si es inequivoco (ver arriba).
  -- Con cualquier duda: candidatos con nombre y distancia, no se adivina.
  ---------------------------------------------------------------------------
  -- Candidatos por cercania (solo si hay GPS), mismos edificios de la macrozona
  IF p_lat IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('id_proyecto_master', s.id, 'nombre', s.nombre,
                                        'zona', s.zona, 'distancia_m', s.dist) ORDER BY s.dist, s.id)
      INTO v_gps_cands
      FROM (
        SELECT m.id_proyecto_master AS id, m.nombre_oficial AS nombre, m.zona,
               round(ST_DistanceSphere(ST_SetSRID(ST_Point(m.longitud::float8, m.latitud::float8), 4326), v_punto)::numeric) AS dist
          FROM proyectos_master m
          JOIN zonas_geograficas z ON z.nombre = m.zona AND z.activo AND z.zona_general = v_macro
         WHERE m.activo AND m.latitud IS NOT NULL AND m.longitud IS NOT NULL
           AND ST_DistanceSphere(ST_SetSRID(ST_Point(m.longitud::float8, m.latitud::float8), 4326), v_punto) <= 150
         ORDER BY dist, id
         LIMIT 5
      ) s;
  END IF;

  IF p_id_proyecto_master IS NOT NULL THEN
    -- (A)
    SELECT pm.id_proyecto_master, pm.nombre_oficial INTO v_pm, v_pm_nombre
      FROM proyectos_master pm
     WHERE pm.id_proyecto_master = p_id_proyecto_master AND pm.activo;
    IF v_pm IS NULL THEN
      RAISE EXCEPTION 'p_id_proyecto_master % no existe o esta inactivo', p_id_proyecto_master USING ERRCODE = '22023';
    END IF;
    v_pm_origen := 'id';

  ELSIF p_edificio IS NOT NULL AND length(normalize_nombre(p_edificio)) >= 3 THEN
    -- (B) por nombre; con GPS, cada candidato trae su distancia y se ordena por ella
    SELECT jsonb_agg(jsonb_build_object('id_proyecto_master', s.id, 'nombre', s.nombre,
                                        'zona', s.zona, 'distancia_m', s.dist) ORDER BY s.dist NULLS LAST, s.id)
      INTO v_cand
      FROM (
        SELECT m.id_proyecto_master AS id, m.nombre_oficial AS nombre, m.zona,
               CASE WHEN p_lat IS NOT NULL AND m.latitud IS NOT NULL AND m.longitud IS NOT NULL
                    THEN round(ST_DistanceSphere(ST_SetSRID(ST_Point(m.longitud::float8, m.latitud::float8), 4326), v_punto)::numeric)
               END AS dist
          FROM proyectos_master m
          JOIN zonas_geograficas z ON z.nombre = m.zona AND z.activo AND z.zona_general = v_macro
         WHERE m.activo
           AND (normalize_nombre(m.nombre_oficial) = normalize_nombre(p_edificio)
                OR EXISTS (SELECT 1 FROM unnest(coalesce(m.alias_conocidos, ARRAY[]::text[])) a
                            WHERE normalize_nombre(a) = normalize_nombre(p_edificio)))
      ) s;
    v_n_cand := coalesce(jsonb_array_length(v_cand), 0);

    IF v_n_cand = 1 THEN
      v_pm := (v_cand->0->>'id_proyecto_master')::int;
      v_pm_nombre := v_cand->0->>'nombre';
      v_pm_origen := 'nombre';
    ELSIF v_n_cand > 1 THEN
      -- homonimos: el GPS elige solo si el mas cercano esta a <=300 m y el segundo, al menos al doble
      v_d1 := (v_cand->0->>'distancia_m')::numeric;
      v_d2 := (v_cand->1->>'distancia_m')::numeric;
      IF p_lat IS NOT NULL AND v_d1 IS NOT NULL AND v_d1 <= 300 AND (v_d2 IS NULL OR v_d2 >= 2 * v_d1) THEN
        v_pm := (v_cand->0->>'id_proyecto_master')::int;
        v_pm_nombre := v_cand->0->>'nombre';
        v_pm_origen := 'nombre+gps';
      ELSE
        v_alertas := v_alertas || to_jsonb(format('edificio_ambiguo: "%s" coincide con %s edificios y no se puede elegir con seguridad. NO se adivina: preguntar al usuario cual es, por NOMBRE (ver edificio.pregunta_para_el_usuario).', p_edificio, v_n_cand));
      END IF;
    ELSE
      v_cand := NULL;
      v_alertas := v_alertas || to_jsonb(format('edificio_no_encontrado: "%s" no esta en el catalogo de %s (nombre ni alias).%s', p_edificio, v_macro,
                     CASE WHEN p_lat IS NOT NULL THEN ' Se busca por cercania al punto GPS.' ELSE ' Se compara por zona/macrozona.' END));
    END IF;
  END IF;

  -- (C) GPS solo (o el nombre no aparecio en el catalogo): decide unicamente si es inequivoco
  IF v_pm IS NULL AND v_cand IS NULL AND v_gps_cands IS NOT NULL THEN
    v_d1 := (v_gps_cands->0->>'distancia_m')::numeric;
    v_d2 := (v_gps_cands->1->>'distancia_m')::numeric;
    -- inequivoco = el mas cercano a <=40 m y el segundo, al menos 40 m mas lejos (o no hay segundo)
    IF v_d1 <= 40 AND (v_d2 IS NULL OR v_d2 - v_d1 >= 40) THEN
      v_pm := (v_gps_cands->0->>'id_proyecto_master')::int;
      v_pm_nombre := v_gps_cands->0->>'nombre';
      v_pm_origen := 'gps';
      v_alertas := v_alertas || to_jsonb(format('edificio_inferido_por_gps: "%s" es el edificio del catalogo mas cercano al punto (a %s m) y el siguiente esta bastante mas lejos. Decirle al usuario cual se tomo y confirmar antes de darlo por cierto.', v_pm_nombre, v_gps_cands->0->>'distancia_m'));
    ELSE
      v_cand := v_gps_cands;
      v_alertas := v_alertas || to_jsonb(format('edificio_por_confirmar: hay %s edificios del catalogo a menos de 150 m del punto y el GPS solo no alcanza para elegir (el pin suele caer en la calle). Preguntar al usuario cual es, por NOMBRE (ver edificio.pregunta_para_el_usuario).', jsonb_array_length(v_gps_cands)));
    END IF;
  END IF;

  IF v_pm IS NOT NULL THEN
    IF p_lat IS NOT NULL THEN
      SELECT round(ST_DistanceSphere(ST_SetSRID(ST_Point(m.longitud::float8, m.latitud::float8), 4326), v_punto)::numeric)
        INTO v_pm_dist
        FROM proyectos_master m WHERE m.id_proyecto_master = v_pm AND m.latitud IS NOT NULL;
      IF v_pm_dist IS NOT NULL AND v_pm_dist > 300 THEN
        v_alertas := v_alertas || to_jsonb(format('edificio_lejos_del_punto: "%s" esta a %s m del punto GPS. Confirmar que es el edificio correcto (o que el pin es el del aviso).', v_pm_nombre, v_pm_dist));
      END IF;
    END IF;
    SELECT z.zona_general INTO v_pm_macro
      FROM proyectos_master pm JOIN zonas_geograficas z ON z.nombre = pm.zona AND z.activo
     WHERE pm.id_proyecto_master = v_pm
     LIMIT 1;
    IF v_pm_macro IS DISTINCT FROM v_macro THEN
      v_alertas := v_alertas || to_jsonb(format('edificio_en_otra_macrozona: el edificio esta en %s y se pidio %s; su nivel de comparacion saldra vacio.', coalesce(v_pm_macro, 'zona desconocida'), v_macro));
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- VENTA: cascada de comparables, del mas estricto al mas amplio
  ---------------------------------------------------------------------------
  WITH base AS MATERIALIZED (
    SELECT v.precio_m2, v.dias_en_mercado, v.zona, v.id_proyecto_master,
           COALESCE(v.estado_construccion::text, inf.estado_efectivo) AS est
      FROM v_mercado_venta_shadow v
      LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = v.id
     WHERE v.zona_general = v_macro
       AND v.dormitorios = p_dormitorios
       AND v.area_total_m2 >= 20
       AND v.precio_m2 IS NOT NULL
  ),
  lv AS (
    SELECT 1 AS ord, 'edificio'::text AS nivel, precio_m2, dias_en_mercado FROM base
     WHERE v_pm IS NOT NULL AND id_proyecto_master = v_pm
    UNION ALL
    SELECT 2, 'zona', precio_m2, dias_en_mercado FROM base
     WHERE v_zona IS NOT NULL AND zona = v_zona AND (v_estado IS NULL OR est = v_estado)
    UNION ALL
    SELECT 3, 'macrozona_mismo_estado', precio_m2, dias_en_mercado FROM base
     WHERE v_estado IS NOT NULL AND est = v_estado
    UNION ALL
    SELECT 4, 'macrozona', precio_m2, dias_en_mercado FROM base
  )
  SELECT jsonb_agg(jsonb_build_object(
           'orden', ord, 'nivel', nivel, 'n', n,
           'banda_inf', banda_inf, 'mediana', mediana, 'banda_sup', banda_sup,
           'percentil_oferta', pct, 'percentil_oferta_billete', pct_bi,
           'mediana_dias_en_mercado', dias) ORDER BY ord)
    INTO v_niveles
    FROM (
      SELECT ord, nivel, count(*) AS n,
             round(percentile_cont(v_lo / 100.0) WITHIN GROUP (ORDER BY precio_m2)::numeric)  AS banda_inf,
             round(percentile_cont(0.5)          WITHIN GROUP (ORDER BY precio_m2)::numeric)  AS mediana,
             round(percentile_cont(v_hi / 100.0) WITHIN GROUP (ORDER BY precio_m2)::numeric)  AS banda_sup,
             round(100.0 * count(*) FILTER (WHERE precio_m2 <= v_m2)    / count(*)) AS pct,
             CASE WHEN v_m2_bi IS NOT NULL
                  THEN round(100.0 * count(*) FILTER (WHERE precio_m2 <= v_m2_bi) / count(*)) END AS pct_bi,
             round(percentile_cont(0.5) WITHIN GROUP (ORDER BY dias_en_mercado)::numeric)      AS dias
        FROM lv GROUP BY ord, nivel
    ) s;

  -- Primer nivel (el mas estricto) con comparables suficientes
  SELECT e INTO v_elegido
    FROM jsonb_array_elements(coalesce(v_niveles, '[]'::jsonb)) e
   WHERE (e->>'n')::int >= v_min_v
   ORDER BY (e->>'orden')::int
   LIMIT 1;

  IF v_elegido IS NOT NULL THEN
    v_posicion := CASE
      WHEN v_m2 < (v_elegido->>'banda_inf')::numeric THEN 'por_debajo'
      WHEN v_m2 > (v_elegido->>'banda_sup')::numeric THEN 'por_encima'
      ELSE 'dentro' END;
    IF v_m2_bi IS NOT NULL THEN
      v_pos_bi := CASE
        WHEN v_m2_bi < (v_elegido->>'banda_inf')::numeric THEN 'por_debajo'
        WHEN v_m2_bi > (v_elegido->>'banda_sup')::numeric THEN 'por_encima'
        ELSE 'dentro' END;
    END IF;
    IF v_m2 < v_ratio * (v_elegido->>'mediana')::numeric THEN
      v_alertas := v_alertas || to_jsonb(format('m2_muy_por_debajo_de_la_mediana: el $/m2 de la oferta (%s) es menos de %s%% de la mediana (%s). Antes de llamarlo oportunidad: revisar moneda, metros reales y estado.', v_m2, round(v_ratio * 100), v_elegido->>'mediana'));
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- ALQUILER (para rendimiento): zona -> macrozona. precio_mensual ya esta en USD (Bs / TC paralelo)
  ---------------------------------------------------------------------------
  WITH base AS MATERIALIZED (
    SELECT a.precio_mensual, a.zona
      FROM v_mercado_alquiler_shadow a
     WHERE a.zona_general = v_macro
       AND a.dormitorios = p_dormitorios
       AND a.precio_mensual IS NOT NULL
  ),
  lv AS (
    SELECT 1 AS ord, 'zona'::text AS nivel, precio_mensual FROM base WHERE v_zona IS NOT NULL AND zona = v_zona
    UNION ALL
    SELECT 2, 'macrozona', precio_mensual FROM base
  )
  SELECT jsonb_agg(jsonb_build_object(
           'orden', ord, 'nivel', nivel, 'n', n,
           'alquiler_usd_mes_banda_inf', banda_inf, 'alquiler_usd_mes_mediana', mediana,
           'alquiler_usd_mes_banda_sup', banda_sup) ORDER BY ord)
    INTO v_a_niveles
    FROM (
      SELECT ord, nivel, count(*) AS n,
             round(percentile_cont(v_lo / 100.0) WITHIN GROUP (ORDER BY precio_mensual)::numeric) AS banda_inf,
             round(percentile_cont(0.5)          WITHIN GROUP (ORDER BY precio_mensual)::numeric) AS mediana,
             round(percentile_cont(v_hi / 100.0) WITHIN GROUP (ORDER BY precio_mensual)::numeric) AS banda_sup
        FROM lv GROUP BY ord, nivel
    ) s;

  SELECT e INTO v_a_elegido
    FROM jsonb_array_elements(coalesce(v_a_niveles, '[]'::jsonb)) e
   WHERE (e->>'n')::int >= v_min_a
   ORDER BY (e->>'orden')::int
   LIMIT 1;

  IF v_a_elegido IS NOT NULL THEN
    v_r_lo  := round(((v_a_elegido->>'alquiler_usd_mes_banda_inf')::numeric * 12 / v_precio * 100), 1);
    v_r_mid := round(((v_a_elegido->>'alquiler_usd_mes_mediana')::numeric   * 12 / v_precio * 100), 1);
    v_r_hi  := round(((v_a_elegido->>'alquiler_usd_mes_banda_sup')::numeric * 12 / v_precio * 100), 1);
    v_etiqueta := CASE
      WHEN v_r_mid <  v_rb     THEN 'bajo'
      WHEN v_r_mid <  v_rr_min THEN 'algo_bajo'
      WHEN v_r_mid <= v_rr_max THEN 'razonable'
      WHEN v_r_mid <= v_ra     THEN 'algo_alto'
      ELSE 'alarma' END;
    IF v_etiqueta = 'alarma' THEN
      v_alertas := v_alertas || to_jsonb(format('rendimiento_en_alarma: %s%% bruto supera el umbral de %s%%. Suele indicar moneda o metros mal leidos, o un alquiler publicado que no se cobra; no es una ganga hasta confirmarlo.', v_r_mid, v_ra));
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- Lo que NO se sabe (siempre explicito: vacio != cero)
  ---------------------------------------------------------------------------
  v_nosabemos := v_nosabemos
    || to_jsonb('expensas: la base no las tiene; el rendimiento es BRUTO y no las resta. Pedirlas al usuario.'::text)
    || to_jsonb('precio de cierre: solo hay precios publicados (lo que se pide, no lo que se paga).'::text)
    || to_jsonb('alquiler cobrado: solo hay alquiler publicado; no se conocen vacancia ni morosidad.'::text)
    || to_jsonb('alquiler amoblado/sin amoblar no se distingue en este calculo.'::text)
    || to_jsonb('papeles (folio real, gravamenes, deudas): fuera de la base; verificar aparte.'::text);
  IF v_estado IS NULL THEN
    v_nosabemos := v_nosabemos || to_jsonb('estado de obra no informado: la comparacion mezcla preventa y entrega inmediata.'::text);
  END IF;
  IF v_zona IS NULL THEN
    v_nosabemos := v_nosabemos || to_jsonb('zona no informada: se compara contra toda la macrozona.'::text);
  END IF;
  IF v_pm IS NULL THEN
    v_nosabemos := v_nosabemos || to_jsonb(CASE
      WHEN p_lat IS NOT NULL AND v_gps_cands IS NULL AND v_cand IS NULL
        THEN 'no hay edificio del catalogo a menos de 150 m del punto: no hay comparacion contra el propio edificio (puede faltar en el catalogo).'
      ELSE 'edificio no resuelto: no hay comparacion contra el propio edificio.' END);
  ELSIF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_niveles, '[]'::jsonb)) e WHERE e->>'nivel' = 'edificio') THEN
    v_nosabemos := v_nosabemos || to_jsonb('el edificio no tiene avisos activos con esos dormitorios: no hay comparacion contra el propio edificio.'::text);
  END IF;
  IF v_elegido IS NULL THEN
    v_nosabemos := v_nosabemos || to_jsonb(format('no se alcanza el minimo de %s comparables en ningun nivel: no se emite posicion.', v_min_v::int));
  END IF;
  IF v_a_elegido IS NULL THEN
    v_nosabemos := v_nosabemos || to_jsonb(format('menos de %s alquileres comparables: no se calcula rendimiento.', v_min_a::int));
  END IF;

  SELECT max(v.fecha_actualizacion)::date INTO v_datos_al
    FROM v_mercado_venta_shadow v WHERE v.zona_general = v_macro;

  ---------------------------------------------------------------------------
  -- Resultado: SOLO hechos y cifras. El veredicto en lenguaje lo redacta el modelo.
  ---------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'entrada', jsonb_build_object(
      'macrozona', v_macro, 'zona', v_zona, 'lat', p_lat, 'lon', p_lon, 'dormitorios', p_dormitorios, 'area_m2', p_area_m2,
      'precio_ingresado', p_precio, 'moneda', v_moneda, 'estado_obra', v_estado),
    'supuestos', v_supuestos,
    'precio_comparable_usd', v_precio,
    'precio_m2_oferta_usd', v_m2,
    'precio_billete_equivalente_usd', v_precio_bi,
    'precio_m2_billete_equivalente_usd', v_m2_bi,
    'edificio', CASE
      WHEN v_pm IS NOT NULL THEN jsonb_build_object('estado', 'resuelto', 'origen', v_pm_origen,
             'id_proyecto_master', v_pm, 'nombre', v_pm_nombre, 'distancia_m', v_pm_dist)
      WHEN v_cand IS NOT NULL THEN jsonb_build_object('estado', 'ambiguo', 'candidatos', v_cand,
             'pregunta_para_el_usuario',
               '¿Cual de estos edificios es? ' || (
                 SELECT string_agg(
                          (e->>'nombre') || CASE WHEN e->>'distancia_m' IS NOT NULL THEN ' (a ' || (e->>'distancia_m') || ' m del punto)' ELSE '' END,
                          ' · ' ORDER BY ord)
                   FROM jsonb_array_elements(v_cand) WITH ORDINALITY AS t(e, ord)))
      WHEN p_edificio IS NOT NULL THEN jsonb_build_object('estado', 'no_encontrado')
      WHEN p_lat IS NOT NULL THEN jsonb_build_object('estado', 'sin_edificio_cerca')
      ELSE jsonb_build_object('estado', 'no_informado') END,
    'venta', jsonb_build_object(
      'niveles', coalesce(v_niveles, '[]'::jsonb),
      'nivel_usado', v_elegido->>'nivel',
      'n', (v_elegido->>'n')::int,
      'posicion', v_posicion,
      'posicion_si_billete', v_pos_bi,
      'percentil_oferta', (v_elegido->>'percentil_oferta')::int,
      'mediana_dias_en_mercado', (v_elegido->>'mediana_dias_en_mercado')::int),
    'alquiler', jsonb_build_object(
      'niveles', coalesce(v_a_niveles, '[]'::jsonb),
      'nivel_usado', v_a_elegido->>'nivel',
      'n', (v_a_elegido->>'n')::int,
      'rendimiento_bruto_pct', CASE WHEN v_a_elegido IS NOT NULL
        THEN jsonb_build_object('bajo', v_r_lo, 'mediano', v_r_mid, 'alto', v_r_hi) END,
      'etiqueta', v_etiqueta),
    'alertas', v_alertas,
    'no_sabemos', v_nosabemos,
    'recibo', jsonb_build_object(
      'funcion', 'evaluar_oferta', 'migracion', 355,
      'vistas', jsonb_build_array('v_mercado_venta_shadow', 'v_mercado_alquiler_shadow', 'v_estado_obra_inferido_shadow'),
      'datos_al', v_datos_al,
      'tc_paralelo', v_tc_par, 'tc_oficial', v_tc_of,
      'criterio', (SELECT jsonb_object_agg(c.clave, jsonb_build_object('valor', c.valor, 'estado', c.estado)) FROM criterio_agente c))
  );
END;
$fn$;

COMMIT;

-- =============================================================================
-- VERIFICACION (correr despues de aplicar)
-- =============================================================================
-- 1) Permisos intactos (misma lista que tras la 355):
--    SELECT proacl::text FROM pg_proc WHERE proname = 'evaluar_oferta';
--    -- {postgres=X/postgres,service_role=X/postgres,claude_readonly=X/postgres}
-- 2) Los candidatos ya son solo de la macrozona (antes eran 6, incluian Villa Brigida y 'Sin zona'):
--    SELECT jsonb_pretty(evaluar_oferta(1, 50, 80000, 'usd', p_macrozona => 'Zona Norte', p_edificio => 'Portofino V')->'edificio');
-- 3) Con GPS sigue resolviendo el homonimo (origen 'nombre+gps'), edificio 75:
--    SELECT evaluar_oferta(1, 50, 80000, 'usd', p_lat => -17.7478, p_lon => -63.1797, p_edificio => 'Portofino V')->'edificio';
--    -- (reemplazar lat/lon por los de proyectos_master id 75 si el punto de ejemplo no cae cerca)
-- 4) Determinismo y sin vistas sin _shadow:
--    SELECT count(DISTINCT md5(evaluar_oferta(0, 32, 30000, 'usd', p_macrozona => 'Zona Norte')::text)) FROM generate_series(1, 10);  -- 1
--    SELECT prosrc ~ 'v_mercado_(venta|alquiler)([^_]|$)' FROM pg_proc WHERE proname = 'evaluar_oferta';  -- false

-- =============================================================================
-- ROLLBACK: volver al cuerpo de la 355 (re-ejecutar el CREATE OR REPLACE de
-- sql/migrations/355_agente_asesor_evaluar_oferta.sql, seccion 2). No hay cambio de datos.
-- =============================================================================
