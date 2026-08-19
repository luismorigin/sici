-- =============================================================================
-- 330 · `buscar_propiedades` devuelve las amenidades de cada propiedad
-- =============================================================================
-- PEDIDO de lab-kapso (19-ago-2026), acotado a propósito: **solo un campo más en
-- la salida**. Sin parámetro de filtro, sin tocar la firma de entrada, sin cambiar
-- nada de lo que ya funciona.
--
-- POR QUÉ: 11 de 143 conversaciones (8%) piden amenidades y el bot responde
-- "no puedo filtrar por piscina". El bloqueo no es el filtro: **el bot no puede
-- hablar de lo que no recibe**. Hoy el retorno es
--   banos · edificio · estado · id · m2 · parqueo · precio_usd · url
-- Con este campo, la respuesta pasa a ser "de estas 6, cuatro confirman piscina"
-- sin filtrar nada.
--
-- =============================================================================
-- LA DECISIÓN QUE PIDIERON: qué amenidades devolver
-- =============================================================================
-- Ofrecían dos caminos —las 6 filtrables, o la lista completa—. **Es un tercero**,
-- y la razón está en la calidad de cada fuente (medido, no estimado):
--
--   `datos_json->'amenities'->'lista'` (la PROPIEDAD)  → 10 valores distintos,
--      vocabulario canónico, curado. Cobertura 79%.
--   `proyectos_master.amenidades_edificio` (el EDIFICIO) → **~78 valores, TEXTO
--      LIBRE SIN NORMALIZAR**. Cobertura 61%.
--
-- 🔴 La del edificio trae `piscina`/`Piscina`, `gimnasio`/`Gimnasio`, **siete
--    formas de "lavandería"** (`Lavanderia`, `Lavandería`, `lavanderia`,
--    `Lavanderia comun`, `Lavanderia Comun`, `Lavandería Común`, `Lavandería:`),
--    más `looby`, `Car Wash:`, `Salon de\n eventos`, `salon_juegos`,
--    `recepcion_24h`, `Alexa integrado`. **Si viaja cruda, el bot le dice al
--    cliente que el edificio "tiene looby".**
--
-- 👉 Se devuelve el **vocabulario canónico normalizado**, alimentado por las DOS
--    fuentes. Ni las 6 filtrables (dejaba afuera seguridad y ascensor, que el
--    cliente pregunta) ni las 19 crudas (ruido y variantes).
--    Medido: **88,7% de las 2.582 menciones del edificio mapean al canónico**.
--    La cola larga (293 menciones, 24 variantes: Cine, Billar, Padel, Alexa…) se
--    descarta por ahora — es la de peor calidad. Anotado como pendiente.
--
-- ⚠️ DEUDA DECLARADA: el vocabulario canónico vive en
--    `simon-mvp/src/config/amenidades-mercado.ts`, que el proyecto trata como
--    fuente de verdad ÚNICA ("los feeds NO deben hardcodear"). Esta función lo
--    duplica en SQL porque el bot no puede leer TypeScript. Si se agrega una
--    amenidad allá, hay que reflejarla acá. No hay forma de evitarlo hoy; queda
--    dicho para que no se descubra tarde.
--
-- ALCANCE: solo la rama de VENTA, que es donde midieron la demanda. La rama de
-- alquiler NO se toca (si la quieren, es una línea más).
--
-- IMPLEMENTACIÓN: una función escalar, no un JOIN. Meter `propiedades_v2` y
-- `proyectos_master` en el CTE volvía ambiguos `id`, `url`, `zona` y `dormitorios`
-- —que el CTE usa SIN calificar— y obligaba a reescribir la consulta entera.
-- Así el cambio es UNA línea en el `jsonb_build_object`.
--
-- FORMATO: sigue a las migs 327/328/329.
-- ⚠️ El bot está con campaña paga corriendo. Rollback al pie.
-- =============================================================================

BEGIN;

-- ── 1. El normalizador ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.amenidades_normalizadas(p_propiedad_id integer)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH crudas AS (
    -- fuente 1: la propiedad (canónica, la escribe el reader del híbrido)
    SELECT jsonb_array_elements_text(COALESCE(p.datos_json->'amenities'->'lista', '[]'::jsonb)) AS a
      FROM propiedades_v2 p WHERE p.id = p_propiedad_id
    UNION ALL
    -- fuente 2: el edificio (texto libre, hay que normalizarla)
    SELECT jsonb_array_elements_text(COALESCE(pm.amenidades_edificio, '[]'::jsonb))
      FROM propiedades_v2 p
      JOIN proyectos_master pm ON pm.id_proyecto_master = p.id_proyecto_master
     WHERE p.id = p_propiedad_id
  ),
  norm AS (
    SELECT lower(translate(a, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) AS a FROM crudas
  ),
  canon AS (
    SELECT CASE
      WHEN a ~ 'piscina'                                   THEN 'Piscina'
      WHEN a ~ 'gimnasio|gym'                              THEN 'Gimnasio'
      WHEN a ~ 'sauna|jacuzzi|spa'                         THEN 'Sauna/Jacuzzi'
      WHEN a ~ 'churrasq|parrill'                          THEN 'Churrasquera'
      WHEN a ~ 'cowork|co-work|sala de negocios'           THEN 'Co-working'
      WHEN a ~ 'salon de|salon_|eventos|multiuso'          THEN 'Salón de Eventos'
      WHEN a ~ 'seguridad|camaras'                         THEN 'Seguridad 24/7'
      WHEN a ~ 'ascensor'                                  THEN 'Ascensor'
      WHEN a ~ 'terraza|balcon|roof'                       THEN 'Terraza/Balcón'
      WHEN a ~ 'recepcion|lobby|looby'                     THEN 'Recepción'
      WHEN a ~ 'lavand|lavadora'                           THEN 'Lavadero'
      WHEN a ~ 'area social|area verde|jardin'             THEN 'Área Social'
      WHEN a ~ 'parque infantil|parques infantiles|area de juegos' THEN 'Parque Infantil'
      WHEN a ~ 'pet '                                      THEN 'Pet Friendly'
      WHEN a ~ 'estacionamiento|parqueo'                   THEN 'Estacionamiento para Visitas'
      ELSE NULL   -- cola larga sin normalizar: se descarta (11% de las menciones)
    END AS c
    FROM norm
  )
  SELECT COALESCE(array_agg(DISTINCT c ORDER BY c), ARRAY[]::text[])
    FROM canon WHERE c IS NOT NULL;
$fn$;

COMMENT ON FUNCTION public.amenidades_normalizadas(integer) IS
  'Amenidades de una propiedad, en vocabulario canónico, combinando las dos fuentes: '
  'datos_json->amenities->lista (curada) + proyectos_master.amenidades_edificio (texto libre). '
  'Consumidor: buscar_propiedades (bot WhatsApp). Migración 330. '
  '⚠️ El vocabulario canónico vive en simon-mvp/src/config/amenidades-mercado.ts — '
  'si se agrega una amenidad allá, reflejarla acá.';

GRANT EXECUTE ON FUNCTION public.amenidades_normalizadas(integer)
  TO anon, authenticated, service_role, claude_readonly;

-- ── 2. `buscar_propiedades` la devuelve (solo rama VENTA) ───────────────────
DO $mig$
DECLARE
  def_actual TEXT;
  def_nueva  TEXT;
  -- ancla ÚNICA de la rama de venta: la de alquiler no tiene `estado_construccion`
  ancla TEXT := E'        \'estado\', estado_construccion::text,\r\n        \'url\', url\r\n';
  reemplazo TEXT := E'        \'estado\', estado_construccion::text,\r\n        \'url\', url,\r\n        \'amenidades\', amenidades_normalizadas(id)\r\n';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def_actual
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'buscar_propiedades';

  IF def_actual IS NULL THEN
    RAISE EXCEPTION 'No existe buscar_propiedades. Abortado.';
  END IF;
  IF def_actual ~ 'amenidades_normalizadas' THEN
    RAISE EXCEPTION 'buscar_propiedades ya devuelve amenidades. Abortado (nada que hacer).';
  END IF;

  def_nueva := replace(def_actual, ancla, reemplazo);
  IF def_nueva = def_actual THEN
    RAISE EXCEPTION 'No se encontró el ancla de la rama de venta. Abortado.';
  END IF;

  EXECUTE def_nueva;
  RAISE NOTICE 'buscar_propiedades → devuelve amenidades (rama venta)';
END
$mig$;

-- ── 3. Verificación ─────────────────────────────────────────────────────────
DO $chk$
DECLARE
  r          jsonb;
  n_con_amen INT;
  t0         timestamptz;
  ms         numeric;
BEGIN
  -- el campo llega, y con contenido
  r := buscar_propiedades('venta', NULL, NULL, NULL, NULL, NULL, 'precio', 6);
  IF jsonb_array_length(r) <> 6 THEN
    RAISE EXCEPTION 'buscar_propiedades devolvió % propiedades, se esperaban 6. Abortado.', jsonb_array_length(r);
  END IF;
  IF NOT (r->0 ? 'amenidades') THEN
    RAISE EXCEPTION 'La primera propiedad no trae el campo amenidades. Abortado.';
  END IF;

  SELECT COUNT(*) INTO n_con_amen
    FROM jsonb_array_elements(r) e
   WHERE jsonb_array_length(e->'amenidades') > 0;
  IF n_con_amen = 0 THEN
    RAISE EXCEPTION 'Ninguna de las 6 trae amenidades — el normalizador no está funcionando. Abortado.';
  END IF;

  -- lo que ya funcionaba NO puede haber cambiado
  IF NOT (r->0 ? 'precio_usd' AND r->0 ? 'estado' AND r->0 ? 'url' AND r->0 ? 'parqueo') THEN
    RAISE EXCEPTION 'Se perdió un campo del retorno original. Abortado.';
  END IF;
  IF jsonb_array_length(buscar_propiedades('alquiler', NULL, NULL, NULL, NULL, NULL, 'precio', 6)) <> 6 THEN
    RAISE EXCEPTION 'La rama de alquiler dejó de responder. Abortado.';
  END IF;

  -- 🔴 GUARDA DE TIEMPO. Estas RPC ya tuvieron timeouts (migs 321/325) y la función
  -- se evalúa por fila: si el planner la corriera antes del LIMIT, el bot vuelve a
  -- colgarse. Se mide de verdad, no se supone.
  t0 := clock_timestamp();
  PERFORM buscar_propiedades('venta', NULL, NULL, NULL, NULL, NULL, 'precio', 6);
  ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000;
  IF ms > 1500 THEN
    RAISE EXCEPTION 'buscar_propiedades tardó % ms (antes ~400). Demasiado — abortado.', round(ms);
  END IF;
  RAISE NOTICE '   tiempo de respuesta: % ms', round(ms);

  RAISE NOTICE '✅ amenidades en el retorno · % de 6 con contenido · el resto del retorno intacto', n_con_amen;
END
$chk$;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DO $rb$
-- DECLARE d TEXT;
-- BEGIN
--   SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='buscar_propiedades';
--   EXECUTE replace(d, E',\r\n        \'amenidades\', amenidades_normalizadas(id)', '');
-- END $rb$;
-- DROP FUNCTION IF EXISTS public.amenidades_normalizadas(integer);
-- COMMIT;
