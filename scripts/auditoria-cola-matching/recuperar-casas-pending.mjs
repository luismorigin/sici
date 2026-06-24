// Recupera las casas ZN que el discovery casas/terrenos (Equipetrol-only, sin filtro
// de zona) marco espuriamente como inactivo_pending. La marca fue un bug, no una
// baja real (las URLs siguen vivas). Devuelve status='completado' + es_activa=true.
// Requiere el fix en n8n (filtro zona Equipetrol en discovery casas/terrenos) para
// que NO vuelvan a caer la proxima corrida nocturna.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const MARCADORES = ['carga_piloto_casas_19jun', 'carga_piloto_casas_20jun', 'carga_casas_escala_20jun', 'carga_casas_nuevas_20jun'];

const { count: antes } = await sb.from('propiedades_v2').select('id', { count: 'exact', head: true })
  .in('metodo_match', MARCADORES).eq('status', 'inactivo_pending');
console.log(`Pending antes: ${antes}`);

const { data, error } = await sb.from('propiedades_v2')
  .update({ status: 'completado', es_activa: true, primera_ausencia_at: null, razon_inactiva: null, fecha_actualizacion: new Date().toISOString() })
  .in('metodo_match', MARCADORES).eq('status', 'inactivo_pending')
  .select('id');
if (error) { console.error('ERROR:', error.message); process.exit(1); }

const { count: activas } = await sb.from('propiedades_v2').select('id', { count: 'exact', head: true })
  .in('metodo_match', MARCADORES).eq('status', 'completado').eq('es_activa', true);
const { count: pendQuedan } = await sb.from('propiedades_v2').select('id', { count: 'exact', head: true })
  .in('metodo_match', MARCADORES).eq('status', 'inactivo_pending');
console.log(`Recuperadas: ${data.length}`);
console.log(`VERIFICACION -> casas completado+activa: ${activas} | pending restantes: ${pendQuedan}`);
