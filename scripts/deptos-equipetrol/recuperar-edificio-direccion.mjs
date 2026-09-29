// ════════════════════════════════════════════════════════════════════════════
// RECUPERAR EL EDIFICIO desde `direccionFormat` del portal — read-only, $0.
//
// QUÉ RESUELVE: 99 props del feed están sin edificio porque el aviso NO lo nombra
// en la descripción (verificado sobre 10 muestras: el lector acertó al decir
// `sin_nombre`). Pero C21 expone la dirección del captador en `entity.direccionFormat`
// y ahí el nombre aparece seguido — medido sobre 20: 40% lo trae.
//
// 🔴 NO ESCRIBE NADA. Deja un JSON con los candidatos clasificados; el SQL lo arma
// el humano y los dudosos los juzga un lector, como manda la skill.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fetchC21Depto, nombreDesdeDireccion } from './lib/detalle-deptos.mjs';
import { matchearPorNombre } from './lib/matcher.mjs';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const AUDIT = `${ROOT}/scripts/deptos-equipetrol/output/audit-matching-shadow-2026-09-29T12-59-16.json`;
const OUT   = `${ROOT}/scripts/deptos-equipetrol/output/recuperar-edificio-direccion-2026-09-29.json`;

// 🔑 EXTRACTOR EXTENDIDO — marcado aparte, NO reemplaza al canónico.
// El canónico mira sólo el PRIMER segmento de la dirección (`split(',')[0]`). Medido el
// 29-sep: se le escapan nombres que están en el 2º ("Tercer anillo entre Beni y Banzer,
// **Torres Evolution**, Norte") y los que llevan "s/n" pegado ("**Edificio Ares** s/n").
// Acá se prueban TODOS los segmentos y se declara de cuál salió, para que el humano vea
// cuáles vienen de la regla probada (20/20 casos) y cuáles de la extensión sin validar.
function nombreExtendido(direccionFormat) {
  if (!direccionFormat) return null;
  const partes = String(direccionFormat).split(',');
  for (let i = 0; i < partes.length; i++) {
    let seg = partes[i].trim();
    if (!seg) continue;
    // ruido geográfico fijo que C21 agrega al final
    if (/^(norte|sur|este|oeste|equipetrol|santa cruz|bolivia|[0-9-]+)$/i.test(seg)) continue;
    // "Edificio Ares s/n" → sacar el s/n final y reintentar
    const limpio = seg.replace(/\s+s\/?n\.?$/i, '').trim();
    const n = nombreDesdeDireccion(limpio);
    if (n) return { nombre: n, segmento: i, desde_limpieza_sn: limpio !== seg };
  }
  return null;
}

const d = JSON.parse(readFileSync(AUDIT, 'utf8'));
const cola = d.superficie_4b || [];
const c21 = cola.filter((x) => /c21\.com\.bo/.test(x.url || ''));
console.log(`cola 4b: ${cola.length} · C21 a procesar: ${c21.length} · Remax (sin este campo): ${cola.length - c21.length}\n`);

const res = { generado: new Date().toISOString(), fuente_audit: AUDIT, total_c21: c21.length,
              auto: [], ambiguo: [], pm_nuevo: [], sin_nombre: [], error: [] };

let i = 0;
for (const p of c21) {
  i++;
  let h;
  try { h = await fetchC21Depto(p.url); }
  catch (e) { res.error.push({ ...base(p), error: String(e.message).slice(0, 120) }); console.log(`❌ ${p.prop_id} ${String(e.message).slice(0,60)}`); continue; }

  const dir = h.direccion_portal || null;
  const canon = h.nombre_en_direccion || null;          // la regla probada (20/20)
  const ext = canon ? null : nombreExtendido(dir);      // sólo si la canónica no encontró
  const nombre = canon || ext?.nombre || null;
  const origen = canon ? 'canonico' : (ext ? `extendido(seg ${ext.segmento}${ext.desde_limpieza_sn ? ', s/n' : ''})` : null);

  if (!nombre) { res.sin_nombre.push({ ...base(p), direccion_portal: dir }); continue; }

  let m;
  try { m = await matchearPorNombre(sb, { nombre, zona: p.zona, lat: p.lat, lon: p.lon }); }
  catch (e) { res.error.push({ ...base(p), nombre, error: 'matcher: ' + String(e.message).slice(0,90) }); continue; }

  const fila = { ...base(p), nombre_en_direccion: nombre, origen_extraccion: origen, direccion_portal: dir,
                 pm: m.pm, confianza: m.confianza, metodo: m.metodo, motivo: m.motivo,
                 candidatos: (m.candidatos || []).slice(0, 3) };

  if (m.auto && m.pm) { res.auto.push(fila); console.log(`✅ ${p.prop_id} "${nombre}" → pm ${m.pm} (${m.metodo}, ${m.confianza})`); }
  else if (m.metodo === 'sin_match') { res.pm_nuevo.push(fila); console.log(`🆕 ${p.prop_id} "${nombre}" → NO está en el catálogo`); }
  else { res.ambiguo.push(fila); console.log(`❓ ${p.prop_id} "${nombre}" → ${m.metodo} (${m.motivo || ''})`.slice(0, 150)); }

  if (i % 20 === 0) console.log(`   … ${i}/${c21.length}`);
}

function base(p) { return { prop_id: p.prop_id, op: p.op, zona: p.zona, url: p.url, lat: p.lat, lon: p.lon }; }

writeFileSync(OUT + '.tmp', JSON.stringify(res, null, 2));
renameSync(OUT + '.tmp', OUT);

console.log(`\n═══════════════════ RESULTADO sobre ${c21.length} props de C21 ═══════════════════`);
console.log(`  ✅ auto-match (nombre exacto + zona)  : ${res.auto.length}`);
console.log(`  ❓ ambiguo/fuzzy débil → juez lector  : ${res.ambiguo.length}`);
console.log(`  🆕 nombre NO en el catálogo (PM_NUEVO): ${res.pm_nuevo.length}`);
console.log(`  ·  la dirección tampoco trae nombre   : ${res.sin_nombre.length}`);
console.log(`  ❌ error                              : ${res.error.length}`);
const recuperables = res.auto.length + res.ambiguo.length + res.pm_nuevo.length;
console.log(`\n  → ${recuperables} de ${c21.length} (${(100*recuperables/c21.length).toFixed(0)}%) tienen nombre de edificio en la dirección`);
console.log(`  📦 ${OUT}`);
