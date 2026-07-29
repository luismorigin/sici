// ============================================================================
// REFRESCAR FOTOS — para las props donde NINGUNA foto guardada carga ya
// ============================================================================
// `reparar-portadas.mjs` arregla las que tienen alguna foto viva (reordena). Esto es para
// las otras: el captador reemplazó TODAS las imágenes y las guardadas devuelven 403. No hay
// nada que reordenar — hay que traer las de hoy.
//
// Toca SOLO las fotos (`fotos_urls` y `cantidad_fotos`). No re-lee el aviso ni toca precio,
// área, dorms ni matching: eso es trabajo del ciclo de lectura, y meterlo acá sería pisar
// veredictos de un lector con datos crudos del portal.
//
//   node scripts/deptos-equipetrol/refrescar-fotos.mjs 347,348,3493            # DRY-RUN
//   node scripts/deptos-equipetrol/refrescar-fotos.mjs 347,348,3493 --apply
//   node scripts/deptos-equipetrol/refrescar-fotos.mjs --desde output/portadas-rotas-*.json --apply
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fetchDetalleDepto } from './lib/detalle-deptos.mjs';
import { cerrarProxy } from '../sonda-suelo/lib/fetcher.mjs';

dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const desdeIdx = argv.indexOf('--desde');
let ids = [];
if (desdeIdx >= 0) {
  const doc = JSON.parse(readFileSync(argv[desdeIdx + 1], 'utf8'));
  ids = (doc.rotas || []).filter((r) => r.primera_foto_viva === null || r.primera_foto_viva === undefined).map((r) => r.id);
} else {
  ids = (argv[0] || '').split(',').map((s) => Number(s.trim())).filter(Boolean);
}
if (!ids.length) { console.error('Falta la lista de ids, o --desde <archivo de chequear-portadas>'); process.exit(1); }

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const fotoViva = async (u) => { try { return (await fetch(u, { method: 'HEAD', headers: UA, signal: AbortSignal.timeout(20000) })).status === 200; } catch { return false; } };

console.log(`\n📷 REFRESCAR FOTOS — ${APPLY ? 'APPLY' : 'DRY-RUN'} · ${ids.length} props\n`);
const { data: props, error } = await sb.from('propiedades_v2_shadow').select('id,fuente,url,tipo_operacion,nombre_edificio,datos_json').in('id', ids);
if (error) { console.error('❌', error.message); process.exit(1); }

let ok = 0, sinCambio = 0, fallo = 0;
for (const p of props) {
  const viejas = p.datos_json?.contenido?.fotos_urls || [];
  let det;
  try { det = await fetchDetalleDepto(p.fuente, p.url); }
  catch (e) { console.log(`   ❌ ${p.id} — no se pudo leer el aviso: ${e.message}`); fallo++; continue; }

  const nuevas = det?.fotos_urls || [];
  if (!nuevas.length) {
    console.log(`   ⚠️  ${p.id} [${p.tipo_operacion}] ${p.nombre_edificio || '—'} — el aviso ya NO trae fotos (¿lo bajaron?). Sin tocar.`);
    sinCambio++; continue;
  }
  // No basta con que el portal liste fotos: hay que confirmar que la NUEVA portada carga,
  // si no cambiamos una URL muerta por otra.
  if (!(await fotoViva(nuevas[0]))) {
    console.log(`   ⚠️  ${p.id} — la portada NUEVA tampoco carga. Sin tocar (necesita mirada humana).`);
    sinCambio++; continue;
  }
  const iguales = viejas.length === nuevas.length && viejas.every((u, i) => u === nuevas[i]);
  if (iguales) { console.log(`   ⚠️  ${p.id} — el portal devuelve las MISMAS urls muertas. Sin tocar.`); sinCambio++; continue; }

  console.log(`   ${APPLY ? '✍️ ' : '  '} ${p.id} [${p.tipo_operacion}] ${p.nombre_edificio || '—'}: ${viejas.length} fotos muertas → ${nuevas.length} nuevas`);
  if (APPLY) {
    const dj = { ...p.datos_json, contenido: { ...p.datos_json.contenido, fotos_urls: nuevas, cantidad_fotos: nuevas.length,
      fotos_urls_anteriores: p.datos_json.contenido?.fotos_urls_anteriores ?? viejas, fotos_refrescadas: new Date().toISOString().slice(0, 10) } };
    const { error: e2 } = await sb.from('propiedades_v2_shadow').update({ datos_json: dj, fecha_actualizacion: new Date().toISOString() }).eq('id', p.id);
    if (e2) { console.log(`      ❌ ${e2.message}`); fallo++; continue; }
  }
  ok++;
}
console.log(`\n   ${APPLY ? 'refrescadas' : 'se refrescarían'}: ${ok} · sin cambio: ${sinCambio}${fallo ? ` · fallaron: ${fallo}` : ''}`);
if (!APPLY && ok) console.log(`\n   Para aplicarlo, agregá --apply\n`);
await cerrarProxy();
