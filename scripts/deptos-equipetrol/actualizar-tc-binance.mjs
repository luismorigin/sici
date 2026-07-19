// ============================================================================
// ACTUALIZAR TC PARALELO desde Binance P2P — reemplaza el flujo n8n tc_dinamico_binance
// ----------------------------------------------------------------------------
// Espeja lo que hace n8n: POST a la API pública P2P de Binance (USDT/BOB, SELL),
// toma la MEDIANA de los primeros 5 anuncios, y actualiza config_global.tipo_cambio_paralelo.
// NO usa Firecrawl ni scrapea portales (Binance es una API pública robusta).
//
// Dry-run por default: baja + calcula + compara con el valor actual. NO escribe.
//   node actualizar-tc-binance.mjs           -> dry-run (muestra la mediana, no escribe)
//   node actualizar-tc-binance.mjs --apply   -> UPDATE config_global (service_role)
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');

const mediana = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function bajarBinance() {
  const r = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    body: JSON.stringify({ asset: 'USDT', fiat: 'BOB', tradeType: 'SELL', page: 1, rows: 20, publisherType: null, payTypes: [] }),
  });
  if (!r.ok) throw new Error(`Binance HTTP ${r.status}`);
  const j = await r.json();
  const ads = (j?.data || []).map((d) => parseFloat(d?.adv?.price)).filter((x) => Number.isFinite(x) && x > 0);
  return ads;
}

const ads = await bajarBinance();
if (ads.length < 3) { console.error(`⚠️ Binance devolvió solo ${ads.length} anuncios — no confiable, abortar.`); process.exit(1); }
const primeros5 = ads.slice(0, 5);
const tc = Math.round(mediana(primeros5) * 100) / 100;

const { data: actual } = await sb.from('config_global').select('valor,fecha_actualizacion,actualizado_por').eq('clave', 'tipo_cambio_paralelo').single();
const vActual = Number(actual?.valor);

console.log(`\n💱 TC PARALELO desde Binance P2P (USDT/BOB, SELL)`);
console.log(`   anuncios bajados: ${ads.length} · primeros 5: ${primeros5.join(', ')}`);
console.log(`   MEDIANA (nuevo TC): ${tc}`);
console.log(`   config_global actual: ${vActual} (${actual?.actualizado_por}, ${actual?.fecha_actualizacion?.slice(0, 16)})`);
console.log(`   diferencia: ${(((tc - vActual) / vActual) * 100).toFixed(2)}%`);

if (!APPLY) {
  console.log(`\n🔒 DRY-RUN — NO escribí nada. Para aplicar: --apply\n`);
} else {
  const { error } = await sb.from('config_global').update({ valor: String(tc), actualizado_por: 'binance_p2p_hibrido', fecha_actualizacion: new Date().toISOString() }).eq('clave', 'tipo_cambio_paralelo');
  if (error) { console.error('❌ Error al escribir:', error.message); process.exit(1); }
  console.log(`\n✅ config_global.tipo_cambio_paralelo actualizado: ${vActual} → ${tc}\n`);
}
