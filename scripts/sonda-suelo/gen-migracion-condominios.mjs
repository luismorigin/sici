// Genera la migración 260 (CREATE TABLE condominios_master + GRANTs + INSERT 36). AISLADA: no toca propiedades_v2.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, 'catalogo-condominios-zn-FINAL.json'), 'utf8')).catalogo;

const s = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const jb = (arr) => `'${JSON.stringify(arr || []).replace(/'/g, "''")}'::jsonb`;
const slug = (n) => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dev = (n) => /^sevilla/i.test(n) ? 'Sevilla' : /^la fontana/i.test(n) ? 'La Fontana' : /riviera del remanso/i.test(n) ? 'Riviera del Remanso' : null;
const fuente = (f) => f === 'founder_gmaps' ? 'founder_gmaps' : f === 'centroide_confirmado_founder' ? 'centroide' : 'web';
const verif = (f) => f === 'founder_gmaps' || f === 'centroide_confirmado_founder';

const rows = data.map(c => {
  const lat = c.gps.lat, lon = c.gps.lon;
  return `  (${s(c.nombre)}, ${s(slug(c.nombre))}, ${s(dev(c.nombre))}, ${lat}, ${lon}, ${jb(c.amenidades)}, ${s(fuente(c.fuente_gps))}, ${verif(c.fuente_gps)}, ${s(c.url || null)})`;
}).join(',\n');

const sql = `-- =============================================================================
-- Migración 260: condominios_master (catálogo de condominios cerrados — Zona Norte)
-- =============================================================================
-- Tabla NUEVA y AISLADA. NO toca propiedades_v2 ni proyectos_master.
-- Catálogo de barrios/condominios cerrados de casas (análogo a proyectos_master
-- para edificios de deptos, pero entidad separada: geometría areal + amenidades comunes).
-- Origen: sonda scripts/sonda-suelo/ (jun-2026). 36 condominios ZN curados:
--   26 GPS verificados a mano (Google Maps) · 3 centroide confirmado · 7 verificado web.
-- La FK id_condominio_master en propiedades_v2 y el matcher son FASE 2 (otra migración),
-- tras probar el matching (ojo solapamiento de familias Sevilla/Riviera — ver diseño §5).
-- Doc: docs/proyectos/zona-norte/DISENO_PIPELINE_CASAS_VIVIENDA.md
-- Ref GRANTs: docs/canonical/SEGURIDAD_SUPABASE.md (Regla 6) — Preset A (data pública)
-- =============================================================================

BEGIN;

-- 1. TABLA
CREATE TABLE IF NOT EXISTS public.condominios_master (
  id_condominio_master  BIGSERIAL PRIMARY KEY,
  nombre_oficial        TEXT NOT NULL,
  alias_conocidos       TEXT[]  NOT NULL DEFAULT '{}',
  slug                  TEXT UNIQUE,
  desarrollador         TEXT,
  latitud               NUMERIC(10,7) NOT NULL,
  longitud              NUMERIC(10,7) NOT NULL,
  radio_metros          INTEGER NOT NULL DEFAULT 250,
  poligono              GEOMETRY(Polygon, 4326),     -- NULL por ahora; se refina en Fase 2
  zona                  TEXT,                        -- microzona (se deriva en Fase 2)
  zona_general          TEXT NOT NULL DEFAULT 'Zona Norte',
  amenidades_comunes    JSONB NOT NULL DEFAULT '[]'::jsonb,
  gps_fuente            TEXT,                        -- 'founder_gmaps' | 'centroide' | 'web'
  gps_verificado        BOOLEAN NOT NULL DEFAULT false,
  n_casas_detectadas    INTEGER NOT NULL DEFAULT 0,
  url_referencia        TEXT,
  notas                 TEXT,
  activo                BOOLEAN NOT NULL DEFAULT true,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en        TIMESTAMPTZ
);

COMMENT ON TABLE public.condominios_master IS
  'Catálogo de condominios cerrados (casas) en Zona Norte. Entidad SEPARADA de proyectos_master (edificios). Geometría areal (centroide+radio, polígono futuro) + amenidades comunes heredables. Creada en migración 260. Consumers futuros: matcher casas Fase 2 + feed /ventas/casas.';

CREATE INDEX IF NOT EXISTS condominios_master_geom_idx ON public.condominios_master USING GIST (poligono);
CREATE INDEX IF NOT EXISTS condominios_master_gps_idx  ON public.condominios_master (latitud, longitud);

-- 2. GRANTS — Preset A (data pública, igual que proyectos_master)
GRANT SELECT ON public.condominios_master TO anon;
GRANT SELECT ON public.condominios_master TO authenticated;
GRANT ALL    ON public.condominios_master TO service_role;
GRANT SELECT ON public.condominios_master TO claude_readonly;

-- 3. DATOS — 36 condominios curados (sonda jun-2026)
INSERT INTO public.condominios_master
  (nombre_oficial, slug, desarrollador, latitud, longitud, amenidades_comunes, gps_fuente, gps_verificado, url_referencia)
VALUES
${rows}
;

COMMIT;

-- =============================================================================
-- ROLLBACK (Regla 3 — rename antes de DROP):
--   BEGIN;
--   ALTER TABLE public.condominios_master RENAME TO _trash_condominios_master_260;
--   REVOKE ALL ON public._trash_condominios_master_260 FROM anon, authenticated, claude_readonly;
--   COMMIT;
-- =============================================================================
`;

const out = join(__dirname, '..', '..', 'sql', 'migrations', '260_condominios_master.sql');
writeFileSync(out, sql);
console.log(`✅ Migración generada: sql/migrations/260_condominios_master.sql`);
console.log(`   ${data.length} condominios · tabla aislada · sin ALTER a propiedades_v2`);
