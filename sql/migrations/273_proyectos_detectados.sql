-- =============================================================================
-- Migración 273 — proyectos_detectados (cola de multiproyectos del híbrido)
-- =============================================================================
-- CONTEXTO: el flujo híbrido de deptos (scripts/deptos-equipetrol/) detecta avisos
-- a nivel PROYECTO (rangos: "desde X m²", "1,2,3 dorms", "$/m²") que NO son una
-- unidad concreta y NO pueden entrar a propiedades_v2 (violan check_multiproperty_
-- completo_v2 al no tener precio/dorms de una unidad). En vez de descartarlos o
-- meterlos en un JSON local (no portable a la nube), se guardan acá con su CRUDA.
--
-- Diseño (charlado con el founder, 10-jul-2026):
--   - Se GUARDA la descripción cruda + el estructurado del portal → activo durable,
--     re-procesable sin volver al portal (principio "guardá el crudo").
--   - `tipologias` queda NULL hasta la SEGUNDA PASADA (despliegue diferido): ahí se
--     extraen dorms/area/precio desde/hasta y, si se decide, se materializan como
--     unidades en el feed.
--   - Portable + contable: SELECT ... GROUP BY zona, estado. Escala a otras zonas.
--
-- Detección (quién cae acá): el cargador aplica el discriminador de 2 niveles —
--   (1) el TEXTO da precio total de una unidad → unidad (va a propiedades_v2_shadow);
--   (2) el texto solo da $/m²/rangos → mirar coherencia del par (precio, área):
--       área realista + $/m² en banda → unidad real (ej Sky Level 88m²/$1500);
--       área absurda / precio = $/m² × área → MULTIPROYECTO → esta tabla (ej Condado VI
--       2731: área "14431" fabricada, precio = 1650 × área).
--
-- GRANTs: Preset D (operacional interna) — service_role ALL + claude_readonly SELECT.
--   NO anon/authenticated: es cola de pipeline, no la ve el browser (Regla 6 / mig template).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CREATE TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proyectos_detectados (
  id               BIGSERIAL PRIMARY KEY,
  detectado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en   TIMESTAMPTZ,

  -- Identidad natural del aviso (mismo criterio que propiedades_v2: url + fuente)
  url              TEXT NOT NULL,
  fuente           TEXT NOT NULL,
  codigo_propiedad TEXT,

  -- El ACTIVO DURABLE: la cruda + el estructurado del portal (para re-procesar)
  descripcion_cruda TEXT,
  datos_json        JSONB,                 -- señales del prep + estructurado (precio_candidato, area, recamaras, n8n…)

  -- Contexto geográfico (escala a otras zonas/macrozonas)
  zona             TEXT,
  macrozona        TEXT,
  latitud          NUMERIC,
  longitud         NUMERIC,

  -- Matcheo a catálogo (soft ref, sin FK — igual que el entorno shadow)
  nombre_proyecto     TEXT,
  id_proyecto_master  INTEGER,

  -- Estado de la cola (para contar/auditar)
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'desplegado', 'descartado')),

  -- Tipologías extraídas en la SEGUNDA PASADA (NULL hasta el despliegue):
  -- [{ "dorms": 2, "area_min": 62.6, "area_max": 94, "precio_min": 103000, "precio_max": 155000, "precio_m2": 1650 }]
  tipologias       JSONB,

  CONSTRAINT proyectos_detectados_url_fuente_uk UNIQUE (url, fuente)
);

COMMENT ON TABLE public.proyectos_detectados IS
  'Cola de avisos a nivel PROYECTO (multiproyectos) detectados por el híbrido de deptos. '
  'Guarda la cruda + estructurado para re-procesar; tipologias se llena en la segunda pasada '
  '(despliegue diferido). NO la ve el feed. Escribe: cargar-deptos-shadow.mjs. Creada en mig 273.';

CREATE INDEX IF NOT EXISTS proyectos_detectados_idx_zona_estado
  ON public.proyectos_detectados (zona, estado);
CREATE INDEX IF NOT EXISTS proyectos_detectados_idx_detectado_en
  ON public.proyectos_detectados (detectado_en DESC);

-- -----------------------------------------------------------------------------
-- 2. GRANTS EXPLÍCITOS — Preset D (operacional interna, Regla 6)
-- -----------------------------------------------------------------------------
GRANT ALL    ON public.proyectos_detectados            TO service_role;
GRANT SELECT ON public.proyectos_detectados            TO claude_readonly;
GRANT USAGE, SELECT ON SEQUENCE public.proyectos_detectados_id_seq TO service_role;

-- -----------------------------------------------------------------------------
-- 6. ROLLBACK (patrón _trash_*, Regla 3)
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.proyectos_detectados RENAME TO _trash_proyectos_detectados;
-- REVOKE ALL ON public.proyectos_detectados FROM claude_readonly;

COMMIT;
