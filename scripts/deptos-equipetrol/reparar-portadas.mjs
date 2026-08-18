// ============================================================================
// REPARAR PORTADAS — mueve al frente la primera foto que SÍ carga
// ============================================================================
// La card del feed se pinta con `fotos_urls[0]`. Cuando el captador reemplaza las imágenes,
// el CDN de C21 devuelve 403 en las viejas y la tarjeta sale VACÍA aunque el aviso siga vivo
// y las demás fotos funcionen (Uptown Drei 8000274: 17 fotos, murió la primera, las 16
// restantes intactas).
//
// El frontend no puede resolverlo solo: en varias superficies la foto se pinta como
// `backgroundImage` de un div, y ahí NO existe evento de error que permita caer a la
// siguiente. Por eso se arregla en el dato.
//
// Qué hace: toma la salida de `chequear-portadas.mjs` y, en las props que tienen alguna foto
// viva, REORDENA `fotos_urls` para que esa quede primera. NO borra nada — las rotas se
// mueven al final, así que si el CDN las revive vuelven solas. Guarda el orden original en
// `datos_json.contenido.fotos_urls_orden_original` para poder deshacerlo.
//
//   node scripts/deptos-equipetrol/reparar-portadas.mjs output/portadas-rotas-<zona>-<fecha>.json
//   node scripts/deptos-equipetrol/reparar-portadas.mjs <archivo> --apply     # sin esto: DRY-RUN
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';

dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file) { console.error('Falta el archivo de chequear-portadas.mjs'); process.exit(1); }

const doc = JSON.parse(readFileSync(file, 'utf8'));
const arreglables = (doc.rotas || []).filter((r) => r.primera_foto_viva !== null && r.primera_foto_viva !== undefined);
const perdidas = (doc.rotas || []).filter((r) => r.primera_foto_viva === null || r.primera_foto_viva === undefined);

console.log(`\n📷 REPARAR PORTADAS — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`   ${doc.rotas?.length || 0} con portada rota · ${arreglables.length} reparables reordenando · ${perdidas.length} sin ninguna foto viva\n`);

let ok = 0, err = 0;
for (const r of arreglables) {
  const { data: p, error: e1 } = await sb.from('propiedades_v2').select('id,datos_json').eq('id', r.id).single();
  if (e1) { console.log(`   ⚠️  ${r.id}: ${e1.message}`); err++; continue; }
  const fotos = p.datos_json?.contenido?.fotos_urls;
  if (!Array.isArray(fotos) || !fotos.length) { console.log(`   ⚠️  ${r.id}: sin fotos`); err++; continue; }

  const k = r.primera_foto_viva;
  if (k <= 0 || k >= fotos.length) { console.log(`   ⚠️  ${r.id}: índice ${k} fuera de rango`); err++; continue; }

  // La viva al frente; el resto conserva su orden relativo (las rotas quedan detrás, no se borran).
  const nuevo = [fotos[k], ...fotos.filter((_, i) => i !== k)];
  const dj = { ...p.datos_json, contenido: { ...p.datos_json.contenido, fotos_urls: nuevo,
    // solo se guarda la PRIMERA vez, para no pisar el original en una segunda corrida
    fotos_urls_orden_original: p.datos_json.contenido.fotos_urls_orden_original ?? fotos,
    portada_reparada: new Date().toISOString().slice(0, 10) } };

  console.log(`   ${APPLY ? '✍️ ' : '  '} ${r.id} [${r.op}] ${r.edif || '—'}: portada HTTP ${r.http_portada} → sube la foto #${k + 1} de ${fotos.length}`);
  if (APPLY) {
    const { error: e2 } = await sb.from('propiedades_v2').update({ datos_json: dj, fecha_actualizacion: new Date().toISOString() }).eq('id', r.id);
    if (e2) { console.log(`      ❌ ${e2.message}`); err++; continue; }
  }
  ok++;
}

console.log(`\n   ${APPLY ? 'reparadas' : 'se repararían'}: ${ok}${err ? ` · con problemas: ${err}` : ''}`);
if (perdidas.length) {
  console.log(`\n   🔴 ${perdidas.length} sin NINGUNA foto viva — hay que re-leer el aviso (o darlas de baja si murió):`);
  for (const r of perdidas) console.log(`      ${r.id} [${r.op}] ${r.edif || '—'} · ${r.total_fotos} fotos, todas rotas · ${r.url_aviso}`);
}
if (!APPLY && ok) console.log(`\n   Para aplicarlo:  node scripts/deptos-equipetrol/reparar-portadas.mjs ${file} --apply\n`);
