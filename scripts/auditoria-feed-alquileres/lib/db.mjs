import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY en simon-mvp/.env.local'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// v_mercado_alquiler:
// - precio_mensual_bob (BOB, fuente de verdad para display)
// - precio_mensual (USD = precio_mensual_bob / 6.96, derivado, para comparativas)
// - dias_en_mercado, zona, fuente, url, id
export async function getPropsViejasFromFeed(supabase, limit, offset = 0, excludeIds = [], onlyIds = [], zonaFilter = null) {
  let q = supabase
    .from('v_mercado_alquiler')
    .select('id, fuente, url, dias_en_mercado, zona, precio_mensual_bob, precio_mensual')
    .order('dias_en_mercado', { ascending: false })
    .order('id', { ascending: true });
  if (zonaFilter && zonaFilter.modo === 'in' && zonaFilter.zonas?.length) {
    q = q.in('zona', zonaFilter.zonas);
  } else if (zonaFilter && zonaFilter.modo === 'notin' && zonaFilter.zonas?.length) {
    q = q.not('zona', 'in', `(${zonaFilter.zonas.map((z) => `"${z}"`).join(',')})`);
  }
  if (onlyIds.length > 0) {
    q = q.in('id', onlyIds);
  } else if (excludeIds.length > 0) {
    q = q.not('id', 'in', `(${excludeIds.join(',')})`);
  }
  const { data, error } =
    onlyIds.length > 0 ? await q : await q.range(offset, offset + limit - 1);
  if (error) throw error;

  const ids = data.map((d) => d.id);
  const { data: descs, error: e2 } = await supabase
    .from('propiedades_v2')
    .select('id, datos_json_enrichment')
    .in('id', ids);
  if (e2) throw e2;

  const byId = new Map(
    (descs || []).map((r) => [r.id, r.datos_json_enrichment?.descripcion || ''])
  );
  return data.map((row) => ({
    ...row,
    descripcion_bd: byId.get(row.id) || '',
  }));
}

// Para el backfill: trae props del feed alquiler SIN cruda persistida.
// Devuelve también la URL y la fuente. NO joinea v_mercado_alquiler porque queremos
// también las que están en feed pero pueden faltar metadata.
export async function getPropsAlquilerSinCruda(supabase) {
  const { data: vista, error: e1 } = await supabase
    .from('v_mercado_alquiler')
    .select('id, fuente, url');
  if (e1) throw e1;

  const ids = vista.map((v) => v.id);
  if (ids.length === 0) return [];

  const sinCruda = [];
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('propiedades_v2')
      .select('id, fuente, url, datos_json_enrichment')
      .in('id', chunk);
    if (error) throw error;
    for (const p of data) {
      const cruda = p.datos_json_enrichment?.descripcion;
      if (!cruda || cruda.length === 0) {
        sinCruda.push({ id: p.id, fuente: p.fuente, url: p.url });
      }
    }
  }
  return sinCruda;
}

// Persiste descripcion cruda en datos_json_enrichment.descripcion (root).
// Sin pasar por LLM. Idempotente: solo escribe si la cruda es no-vacía.
export async function persistirDescripcionCruda(supabase, propId, descripcionCruda) {
  if (!descripcionCruda || descripcionCruda.length === 0) {
    return { ok: false, skipped: true, reason: 'cruda_vacia' };
  }
  const { data: current, error: eRead } = await supabase
    .from('propiedades_v2')
    .select('datos_json_enrichment')
    .eq('id', propId)
    .single();
  if (eRead) return { ok: false, error: eRead.message };

  const merged = { ...(current?.datos_json_enrichment || {}), descripcion: descripcionCruda };
  const { error: eUpd } = await supabase
    .from('propiedades_v2')
    .update({ datos_json_enrichment: merged })
    .eq('id', propId);
  if (eUpd) return { ok: false, error: eUpd.message };
  return { ok: true, len: descripcionCruda.length };
}
