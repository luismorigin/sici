// ============================================================================
// CHEQUEAR PORTADAS — ¿cuántas tarjetas del feed salen sin foto?  ($0, read-only)
// ============================================================================
// La card del feed se pinta con la PRIMERA foto guardada. Si esa URL murió (el captador
// reemplazó las imágenes y el CDN de C21 devuelve 403 AccessDenied), la tarjeta sale vacía
// aunque el aviso siga vivo y las demás fotos funcionen. Caso Rhodium (28-jul) y Uptown
// Drei 8000274 (29-jul, reportado por el founder mirando el feed).
//
// El detector de `auditar-shadow.mjs` ya cubre esto, pero solo corre sobre la muestra del
// audit de drift y es manual. Esto barre TODO el feed de una, sin depender de eso.
//
//   node scripts/deptos-equipetrol/chequear-portadas.mjs                 # Equipetrol (default)
//   node scripts/deptos-equipetrol/chequear-portadas.mjs --zona=zona-norte
//   node scripts/deptos-equipetrol/chequear-portadas.mjs --zona=todas
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZONAS_HIBRIDO } from './lib/zonas-hibrido.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const ZONA_ID = (argv.find((x) => x.startsWith('--zona=')) || '--zona=equipetrol').slice('--zona='.length);
if (ZONA_ID !== 'todas' && !ZONAS_HIBRIDO[ZONA_ID]) {
  console.error(`\n🛑 Zona desconocida: "${ZONA_ID}". Válidas: ${Object.keys(ZONAS_HIBRIDO).join(', ')}, todas\n`);
  process.exit(2);
}
const ZONAS = ZONA_ID === 'todas' ? null : ZONAS_HIBRIDO[ZONA_ID].zonas;
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };

// HEAD alcanza para el status y no baja el cuerpo. Si el CDN no soporta HEAD (405/501),
// se reintenta con GET: un 403 mal leído como "viva" es peor que un request de más.
async function estadoFoto(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, headers: UA, signal: AbortSignal.timeout(20000) });
      if (method === 'HEAD' && (r.status === 405 || r.status === 501)) continue;
      return r.status;
    } catch (e) { if (method === 'GET') return 'sin respuesta'; }
  }
  return 'sin respuesta';
}

async function main() {
  const alcance = ZONAS ? `${ZONAS_HIBRIDO[ZONA_ID].nombre} (${ZONAS.length} zonas)` : 'TODAS las zonas';
  console.log(`\n📷 CHEQUEO DE PORTADAS — alcance: ${alcance}. Read-only.\n`);

  let q = sb.from('propiedades_v2_shadow')
    .select('id,fuente,tipo_operacion,zona,nombre_edificio,url,datos_json')
    .eq('status', 'completado').eq('es_activa', true).is('duplicado_de', null);
  if (ZONAS) q = q.in('zona', ZONAS);
  const { data, error } = await q;
  if (error) throw error;

  const conFotos = (data || []).filter((p) => Array.isArray(p.datos_json?.contenido?.fotos_urls) && p.datos_json.contenido.fotos_urls.length);
  const sinFotos = (data || []).length - conFotos.length;
  console.log(`   ${data.length} props activas · ${conFotos.length} con fotos guardadas · ${sinFotos} SIN ninguna foto\n`);

  const rotas = [], sinRespuesta = [];
  let hechas = 0;
  const LOTE = 8;   // el CDN de C21 tolera bien; sin esto son ~12 min en serie
  for (let i = 0; i < conFotos.length; i += LOTE) {
    await Promise.all(conFotos.slice(i, i + LOTE).map(async (p) => {
      const fotos = p.datos_json.contenido.fotos_urls;
      const st = await estadoFoto(fotos[0]);
      hechas++;
      if (st === 200) return;
      // La portada no carga → ¿hay alguna otra que sí? Eso decide si se puede arreglar solo
      // reordenando o si hay que re-leer el aviso entero.
      let primeraViva = null;
      for (let k = 1; k < fotos.length && primeraViva === null; k++) {
        if (await estadoFoto(fotos[k]) === 200) primeraViva = k;
      }
      const reg = { id: p.id, op: p.tipo_operacion, fuente: p.fuente, zona: p.zona,
                    edif: p.nombre_edificio, http_portada: st, total_fotos: fotos.length,
                    primera_foto_viva: primeraViva, url_aviso: p.url };
      (st === 'sin respuesta' ? sinRespuesta : rotas).push(reg);
      console.log(`   🔴 ${p.id} [${p.tipo_operacion}] ${p.nombre_edificio || '—'} — portada HTTP ${st}` +
                  (primeraViva !== null ? ` · la foto #${primeraViva + 1} SÍ carga (de ${fotos.length})` : ` · NINGUNA de sus ${fotos.length} fotos carga`));
    }));
    if (hechas % 80 < LOTE) console.log(`   … ${hechas}/${conFotos.length}`);
  }

  const arreglables = rotas.filter((r) => r.primera_foto_viva !== null);
  const perdidas = rotas.filter((r) => r.primera_foto_viva === null);
  console.log(`\n────────── RESULTADO ──────────`);
  console.log(`  revisadas:                 ${conFotos.length}`);
  console.log(`  🔴 portada rota:            ${rotas.length}`);
  console.log(`     · con otra foto viva:    ${arreglables.length}  → se arregla reordenando, sin re-leer`);
  console.log(`     · sin ninguna foto viva: ${perdidas.length}  → hay que re-leer el aviso`);
  if (sinRespuesta.length) console.log(`  ⚠️  sin respuesta (¿red?):   ${sinRespuesta.length}`);
  console.log(`  ⚠️  props sin fotos guardadas: ${sinFotos}`);

  const file = join(OUT, `portadas-rotas-${ZONA_ID}-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify({ generado: new Date().toISOString(), alcance, revisadas: conFotos.length, rotas, sin_respuesta: sinRespuesta }, null, 2));
  console.log(`\n  📦 → ${file}\n`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
