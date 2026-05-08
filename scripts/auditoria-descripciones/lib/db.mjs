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

export async function getPropsViejasFromFeed(supabase, limit, offset = 0, excludeIds = [], onlyIds = []) {
  let q = supabase
    .from('v_mercado_venta')
    .select('id, fuente, url, dias_en_mercado, zona, precio_norm')
    .order('dias_en_mercado', { ascending: false })
    .order('id', { ascending: true });
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
