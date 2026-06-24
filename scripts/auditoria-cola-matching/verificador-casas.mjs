// VERIFICADOR de casas ZN: chequea que cada URL siga viva; las caidas -> es_activa=false.
// C21: {url}?json=true debe traer entity con id. Remax: data-page no debe redirigir a Home (302->/).
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };

const { data: casas } = await sb.from('propiedades_v2')
  .select('id,url,fuente')
  .eq('tipo_propiedad_original', 'casa').eq('es_activa', true)
  .or('metodo_match.like.carga_piloto_casas%,metodo_match.like.carga_casas%');
console.log(`Verificando ${casas.length} casas activas…`);

const caidas = [];
let viva = 0, err = 0;
for (const c of casas) {
  try {
    if (c.url.includes('c21.com.bo')) {
      const r = await fetch(`${c.url}?json=true`, { headers: UA });
      if (!r.ok) { caidas.push({ ...c, motivo: `http ${r.status}` }); continue; }
      const j = await r.json();
      const e = j.entity || j.data?.entity || j;
      if (!e || !(e.id || e.precio || e.precioVenta)) caidas.push({ ...c, motivo: 'sin entity' });
      else viva++;
    } else { // remax
      const r = await fetch(c.url, { headers: UA, redirect: 'follow' });
      const html = await r.text();
      const m = html.match(/data-page="([^"]+)"/);
      const comp = m ? JSON.parse(m[1].replace(/&quot;/g, '"')).component : null;
      if (!m || comp === 'Home' || /"component":"Home"/.test(html)) caidas.push({ ...c, motivo: 'redirect Home (baja)' });
      else viva++;
    }
  } catch (e2) { caidas.push({ ...c, motivo: `err ${e2.message}` }); err++; }
  await new Promise((res) => setTimeout(res, 200));
}
console.log(`VIVAS: ${viva} | CAIDAS: ${caidas.length} | errores fetch: ${err}`);
caidas.forEach((c) => console.log(`  baja id ${c.id} (${c.fuente}) — ${c.motivo}`));

// Inactivar SOLO las caidas claras (no los errores de red transitorios)
const aBajar = caidas.filter((c) => c.motivo.startsWith('redirect') || c.motivo === 'sin entity' || c.motivo.startsWith('http 4'));
if (aBajar.length) {
  const { error } = await sb.from('propiedades_v2').update({ es_activa: false }).in('id', aBajar.map((c) => c.id));
  console.log(error ? `ERROR baja: ${error.message}` : `Inactivadas: ${aBajar.length}`);
} else console.log('Nada que inactivar.');
