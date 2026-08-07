-- =============================================================================
-- 315 · Estado de obra: el aviso caducado se calla, "entregado" no se deshace,
--       y lo que el founder VERIFICÓ manda sobre todo lo demás
-- =============================================================================
-- ORIGEN: el founder encontró HH Once mostrándose a la vez como "preventa" y
-- como "entrega inmediata" en el mismo feed (6-ago-2026). Al medir Equipetrol
-- aparecieron 8 edificios así en shadow (4 en Equipetrol, 4 en Zona Norte).
--
-- 🔴 EL DAÑO NO ES DE COBERTURA, ES DE CREDIBILIDAD. Solo 7 props quedaban
--    "sin confirmar" por estos conflictos. Lo grave es que el MISMO edificio
--    aparece con dos etiquetas contradictorias en la misma pantalla: eso no se
--    lee como "faltan datos", se lee como que el sitio no sabe lo que dice.
--
-- ── LAS TRES CAUSAS (medidas, no supuestas) ─────────────────────────────────
--
-- A) UN AVISO CADUCADO NUNCA DEJABA DE HABLAR POR SÍ MISMO.
--    La mig 303 sacó a los avisos zombis del CONSENSO del edificio, pero el
--    COALESCE arrancaba con `a.est` sin mirar `a.vigente` → la propiedad seguía
--    publicando su propia etiqueta vencida. Medición al 6-ago en Equipetrol:
--    15 avisos así (9 "preventa" y 6 "entrega_inmediata"), de 306 a **850 días**.
--    Caso: Stratto Up id 571, "preventa" publicado en abril de 2024.
--
-- B) EN CONFLICTO, EL EDIFICIO SE QUEDABA MUDO — Y APAGABA LA MEJOR SEÑAL.
--    Con `estados_distintos > 1` el consenso era NULL y los vecinos perdían la
--    inferencia. Peor: la rama de alquiler exigía `declaran = 0`, así que un
--    edificio con 5 alquileres activos (Stratto Up) no podía usar la señal
--    validada al 95%.
--
-- C) LOS DOS ESTADOS SE TRATABAN COMO SIMÉTRICOS, Y NO LO SON.
--    🔑 Un edificio pasa de preventa a entregado y NUNCA vuelve.
--       · "entrega_inmediata" es evidencia POSITIVA: alguien fue y lo vio parado.
--       · "preventa" es el estado POR DEFECTO de un aviso que nadie actualizó.
--    Por eso NO se resuelve por mayoría: en HH Once la mayoría dice preventa
--    (4 avisos vigentes contra 2) y **la mayoría está equivocada** — la entrega
--    fue en marzo de 2026 y esos 4 son catálogo de la desarrolladora
--    ("modelo 1D-A", "modelo M-D CT") publicado en febrero, antes de entregar.
--
-- ── LO QUE HACE ESTA MIGRACIÓN ──────────────────────────────────────────────
--  1. Campos de VERIFICACIÓN HUMANA en `proyectos_master` (ver diseño abajo).
--  2. Reescribe `v_estado_obra_inferido_shadow` con 5 niveles de evidencia.
--
-- ── IMPACTO MEDIDO (simulado contra los datos del 6-ago, global Eq + ZN) ─────
--    · 30 props: preventa      → entrega_inmediata   (16 en Equipetrol)
--    · 20 props: sin confirmar → entrega_inmediata   ( 7 en Equipetrol)
--    ·  3 props: pierden estado → sin confirmar      ( 0 en Equipetrol)
--      Las 3 son de Zona Norte y es el precio CORRECTO del arreglo A: su único
--      dato era un aviso vencido (677 d, 526 d, 325 d). Mejor "sin confirmar"
--      que una afirmación que ya no se sostiene.
--    · Los 8 edificios en conflicto quedan resueltos hacia "entregado":
--      Macororó 16/17 · Lofty Island · Community Alto Norte · Essenzia ·
--      HH Once · Domus Tower · Portobello Green · STONE 4.
--
-- ⚠️ RIESGO ASUMIDO Y DECLARADO: la regla asimétrica se dispara con UN solo
--    aviso vigente de "entrega_inmediata". Un aviso mal clasificado marcaría un
--    edificio en pozo como entregado. Se acota así:
--      · el aviso tiene que estar VIGENTE (arreglo A),
--      · el origen se declara aparte (`conflicto_resuelto`), no se disfraza de
--        consenso limpio, así el frontend puede mostrarlo con reserva,
--      · el audit nocturno los reporta para que un humano los selle.
--    Hoy los 3 casos que se apoyan en un solo aviso tienen respaldo
--    independiente: Lofty Island (fecha_entrega jun-2026 ya vencida),
--    Community Alto Norte y Domus Tower (alquileres activos).
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · VERIFICACIÓN HUMANA — lo que el founder ve con sus ojos tiene dónde vivir
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔑 POR QUÉ NO SE REUSA `proyectos_master.estado_construccion`: ese campo
--    acierta 78% y el motivo es que SE PUDRE. Guarda un estado sin decir de
--    cuándo es, así que el que lo lee no sabe si sigue valiendo.
--
-- 🔑 EL DISEÑO: se guarda LA FECHA DE LA OBSERVACIÓN, no el estado a secas.
--    "al 6-ago-2026 este edificio ya estaba entregado" es verdad PARA SIEMPRE
--    (un edificio no vuelve al pozo). Y no hace falta averiguar cuándo se
--    entregó: alcanza con una fecha en la que ya lo estaba — un dato que el
--    founder tiene sin investigar nada.
--
-- ⚠️ LA ASIMETRÍA TAMBIÉN VIVE ACÁ: 'entregado' no caduca nunca; 'en_pozo' SÍ
--    caduca (365 d), porque un "lo vi en obra" de hace dos años no dice nada
--    del edificio de hoy. Está implementado en la vista, no es solo un comentario.
--
-- Mismo patrón que `gps_verificado_visual` (97 edificios ya cargados así):
-- el dato + quién lo dijo + cuándo + cómo lo supo.

ALTER TABLE public.proyectos_master
  ADD COLUMN IF NOT EXISTS entrega_verificada       TEXT,
  ADD COLUMN IF NOT EXISTS entrega_verificada_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entrega_verificada_por   TEXT,
  ADD COLUMN IF NOT EXISTS entrega_verificada_notas TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proyectos_master_entrega_verificada_chk') THEN
    ALTER TABLE public.proyectos_master
      ADD CONSTRAINT proyectos_master_entrega_verificada_chk
      CHECK (entrega_verificada IS NULL OR entrega_verificada IN ('entregado','en_pozo'));
  END IF;
END $$;

COMMENT ON COLUMN public.proyectos_master.entrega_verificada IS
  'Observación HUMANA del estado de obra: entregado | en_pozo | NULL (nadie miró). '
  'Semántica: "al entrega_verificada_at, el edificio estaba así". ASIMÉTRICO A PROPÓSITO: '
  '"entregado" no caduca nunca (un edificio no vuelve al pozo); "en_pozo" caduca a los 365 días. '
  'Gana sobre cualquier aviso. NO confundir con estado_construccion (se pudre, acierta 78%).';
COMMENT ON COLUMN public.proyectos_master.entrega_verificada_at IS
  'Fecha de la OBSERVACIÓN, no de la entrega. No hace falta saber cuándo se entregó: '
  'alcanza una fecha en la que ya lo estaba.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · LA VISTA — 5 niveles de evidencia, del más fuerte al más débil
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_estado_obra_inferido_shadow AS
WITH activas AS (
  SELECT id, id_proyecto_master, tipo_operacion,
         NULLIF(COALESCE(estado_construccion::text, 'no_especificado'), 'no_especificado') AS est,
         -- v303: ¿el usuario puede ver este aviso? Solo esos opinan.
         public.es_propiedad_vigente(estado_construccion::text, fecha_publicacion, fecha_discovery) AS vigente
  FROM public.propiedades_v2_shadow
  WHERE es_activa AND status IN ('completado','actualizado') AND duplicado_de IS NULL
),
edificio AS (
  SELECT id_proyecto_master,
         COUNT(*) FILTER (WHERE est IS NOT NULL)                 AS declaran,
         COUNT(DISTINCT est) FILTER (WHERE est IS NOT NULL)      AS estados_distintos,
         MAX(est) FILTER (WHERE est IS NOT NULL)                 AS estado_consenso,
         -- v315: ¿algún aviso VIGENTE dice que el edificio ya está parado?
         COUNT(*) FILTER (WHERE est = 'entrega_inmediata')       AS n_entregado
  FROM activas
  WHERE tipo_operacion = 'venta' AND id_proyecto_master IS NOT NULL AND vigente
  GROUP BY 1
),
-- Alquiler activo Y VIGENTE = edificio habitable ⇒ entregado (95% de acierto)
edif_alquiler AS (
  SELECT DISTINCT id_proyecto_master
  FROM activas
  WHERE tipo_operacion = 'alquiler' AND id_proyecto_master IS NOT NULL AND vigente
),
-- v315: observación humana. 'entregado' no caduca; 'en_pozo' vale 365 días.
verificado AS (
  SELECT id_proyecto_master,
         CASE WHEN entrega_verificada = 'entregado' THEN 'entrega_inmediata'
              WHEN entrega_verificada = 'en_pozo'
                   AND entrega_verificada_at >= NOW() - INTERVAL '365 days' THEN 'preventa'
         END AS estado_verificado
  FROM public.proyectos_master
  WHERE entrega_verificada IS NOT NULL AND entrega_verificada_at IS NOT NULL
)
SELECT
  a.id AS propiedad_id,
  COALESCE(
    -- 1 · lo vio un humano. No es una deducción.
    vf.estado_verificado,
    -- 2 · v315 · ASIMETRÍA: si el edificio está en conflicto y ALGÚN aviso vigente
    --     dice "entregado", gana entregado. Un edificio no vuelve al pozo, y
    --     "preventa" es el default del aviso que nadie tocó.
    CASE WHEN e.estados_distintos > 1 AND e.n_entregado > 0 THEN 'entrega_inmediata' END,
    -- 3 · v315 · lo que dice SU aviso — solo si sigue VIGENTE (antes: siempre)
    CASE WHEN a.vigente THEN a.est END,
    -- 4 · consenso unánime de los vecinos del edificio (96,7%)
    CASE WHEN e.declaran > 0 AND e.estados_distintos = 1 THEN e.estado_consenso END,
    -- 5 · v315 · hay alquiler activo ⇒ habitable (antes exigía `declaran = 0`;
    --     el orden del COALESCE ya lo protege, la condición extra solo lo apagaba)
    CASE WHEN ea.id_proyecto_master IS NOT NULL THEN 'entrega_inmediata' END
  ) AS estado_efectivo,
  CASE
    WHEN vf.estado_verificado IS NOT NULL                              THEN 'verificado'
    WHEN e.estados_distintos > 1 AND e.n_entregado > 0                 THEN 'conflicto_resuelto'
    WHEN a.vigente AND a.est IS NOT NULL                               THEN 'aviso'
    WHEN e.declaran > 0 AND e.estados_distintos = 1                    THEN 'vecinos'
    WHEN ea.id_proyecto_master IS NOT NULL                             THEN 'alquiler'
    ELSE NULL
  END AS estado_origen
FROM activas a
LEFT JOIN edificio e       ON e.id_proyecto_master  = a.id_proyecto_master
LEFT JOIN edif_alquiler ea ON ea.id_proyecto_master = a.id_proyecto_master
LEFT JOIN verificado vf    ON vf.id_proyecto_master = a.id_proyecto_master
WHERE a.tipo_operacion = 'venta';

COMMENT ON VIEW public.v_estado_obra_inferido_shadow IS
  'Estado de obra EFECTIVO por propiedad de venta (shadow) + de dónde salió. '
  'Cascada v315, del más fuerte al más débil: verificado (humano, afirmable sin reservas) · '
  'conflicto_resuelto (el edificio se contradice y algún aviso vigente dice entregado — '
  'ASIMETRÍA: un edificio no vuelve al pozo) · aviso (el suyo, solo si VIGENTE) · '
  'vecinos (consenso unánime, 96,7%) · alquiler (habitable, 95%) · NULL = sin confirmar. '
  'v315 arregla: (A) el aviso caducado ya no declara por sí mismo, (B) el conflicto ya no deja '
  'mudo al edificio, (C) los dos estados dejan de tratarse como simétricos. Migs 302/303/315.';

REVOKE ALL   ON public.v_estado_obra_inferido_shadow FROM anon, authenticated;
GRANT SELECT ON public.v_estado_obra_inferido_shadow TO service_role, claude_readonly;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr después del COMMIT)
-- =============================================================================
-- 1) Reparto por origen. Esperado: aparecen 'conflicto_resuelto' (~50 props
--    global) y baja 'sin confirmar'. 'verificado' sale 0 hasta que se dicte algo.
--   SELECT COALESCE(estado_origen,'(sin confirmar)') AS origen, estado_efectivo, COUNT(*)
--   FROM public.v_estado_obra_inferido_shadow GROUP BY 1,2 ORDER BY 3 DESC;
--
-- 2) 🔴 EL CHEQUEO QUE IMPORTA — ningún edificio debe mostrar DOS estados a la vez.
--    Esperado: 0 filas. Si sale algo, la cascada tiene un agujero.
--   SELECT s.id_proyecto_master, pm.nombre_oficial,
--          COUNT(DISTINCT v.estado_efectivo) AS estados_distintos,
--          array_agg(DISTINCT v.estado_efectivo) AS cuales
--   FROM public.v_estado_obra_inferido_shadow v
--   JOIN public.propiedades_v2_shadow s ON s.id = v.propiedad_id
--   JOIN public.proyectos_master pm ON pm.id_proyecto_master = s.id_proyecto_master
--   WHERE v.estado_efectivo IS NOT NULL
--   GROUP BY 1,2 HAVING COUNT(DISTINCT v.estado_efectivo) > 1;
--
-- 3) HH Once (pm 12) — el caso que originó todo. Esperado: 7 props, todas
--    'entrega_inmediata', origen 'conflicto_resuelto'.
--   SELECT v.propiedad_id, v.estado_efectivo, v.estado_origen
--   FROM public.v_estado_obra_inferido_shadow v
--   JOIN public.propiedades_v2_shadow s ON s.id = v.propiedad_id
--   WHERE s.id_proyecto_master = 12;
-- =============================================================================
