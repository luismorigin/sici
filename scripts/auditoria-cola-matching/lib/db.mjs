// lib/db.mjs — acceso read-only a la cola de matching.
//
// Trae las sugerencias `pendiente_<macrozona>` con todo lo que el juez necesita:
// prop (GPS, nombre_edificio, título, url, fuente) + pm sugerido (nombre, alias, GPS).
// La distancia prop↔pm se calcula en JS (haversine) para no depender de PostGIS/RPC.
//
// Credenciales: simon-mvp/.env.local (mismo patrón que las otras skills de audit).

import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en simon-mvp/.env.local');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// macrozona → estado de cola.
//  - Equipetrol usa la cola HITL clásica: estado='pendiente' (UI /admin/supervisor/matching,
//    score 55-84; los ≥85 se auto-aprueban). NO lleva sufijo.
//  - Las macrozonas piloto (mig 254/259) usan 'pendiente_<slug>' (zona_norte, urubo, …).
export function estadoDeMacrozona(macrozona) {
  const slug = String(macrozona || 'zona-norte').toLowerCase().replace(/-/g, '_');
  if (slug === 'equipetrol') return 'pendiente';
  return `pendiente_${slug}`;
}

export async function getColaPendiente(supabase, macrozona) {
  const estado = estadoDeMacrozona(macrozona);

  const { data: sugs, error: e1 } = await supabase
    .from('matching_sugerencias')
    .select('id, propiedad_id, proyecto_master_sugerido, metodo_matching, score_confianza, distancia_metros, match_nombre, match_gps')
    .eq('estado', estado)
    .order('propiedad_id', { ascending: true });
  if (e1) throw e1;
  if (!sugs?.length) return { estado, sugerencias: [] };

  const propIds = [...new Set(sugs.map((s) => s.propiedad_id))];
  const pmIds = [...new Set(sugs.map((s) => s.proyecto_master_sugerido).filter(Boolean))];

  const { data: props, error: e2 } = await supabase
    .from('propiedades_v2')
    .select('id, latitud, longitud, tipo_operacion, nombre_edificio, url, fuente, datos_json_discovery, datos_json_enrichment')
    .in('id', propIds);
  if (e2) throw e2;

  const { data: pms, error: e3 } = await supabase
    .from('proyectos_master')
    .select('id_proyecto_master, nombre_oficial, alias_conocidos, latitud, longitud')
    .in('id_proyecto_master', pmIds);
  if (e3) throw e3;

  const propById = new Map(props.map((p) => [p.id, p]));
  const pmById = new Map(pms.map((p) => [p.id_proyecto_master, p]));

  const sugerencias = sugs.map((s) => {
    const p = propById.get(s.propiedad_id) || {};
    const pm = pmById.get(s.proyecto_master_sugerido) || {};
    const dist = haversine(p.latitud, p.longitud, pm.latitud, pm.longitud);
    const enr = p.datos_json_enrichment || {};
    const disc = p.datos_json_discovery || {};
    return {
      sug_id: s.id, // OJO: la PK real en matching_sugerencias es la columna "id" (NO "sug_id"). Al armar el UPDATE de la cola usar `WHERE id IN (...)`.
      prop_id: s.propiedad_id,
      pm_sugerido: s.proyecto_master_sugerido,
      pm_nombre: pm.nombre_oficial || null,
      pm_alias: pm.alias_conocidos || null,
      score: s.score_confianza,
      metodo: s.metodo_matching,
      match_nombre: s.match_nombre,
      match_gps: s.match_gps,
      dist_metros: dist,
      tipo_operacion: p.tipo_operacion || null,
      nombre_edificio: p.nombre_edificio || null,
      titulo: disc.encabezado || null,
      url: p.url || null,
      fuente: p.fuente || null,
      // Pistas de nombre YA en la BD (gratis — el LLM nocturno ya leyó el anuncio).
      // El juez las considera ADEMÁS del anuncio en vivo: a veces el portal muestra
      // hoy menos texto que el que el enrichment capturó (caso 1917 "Torres Sirari").
      pistas_nombre: {
        col: p.nombre_edificio || null,
        enrichment: enr.nombre_edificio || null,
        llm: enr.llm_output?.nombre_edificio || null,
        subtitulo: disc.subtitulo || null,
        slug: slugDeUrl(p.url),
      },
    };
  });

  return { estado, sugerencias };
}

// Extrae el slug del anuncio de la URL (descarta host y prefijos genéricos).
function slugDeUrl(url) {
  if (!url) return null;
  const m = String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^propiedad\//, '');
  return m || null;
}

// Distancia en metros entre dos puntos lat/lon (null si falta alguno).
export function haversine(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v == null || isNaN(Number(v)))) return null;
  const R = 6371000;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
