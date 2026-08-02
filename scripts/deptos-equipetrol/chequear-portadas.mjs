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
import { traerTodo } from './lib/traer-todo.mjs';

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
  // 🔴 Antes que la red: ¿esto es siquiera una URL? El portal a veces devuelve un MENSAJE DE
  // ERROR donde va la imagen y se guarda tal cual — 14 props del Condominio K1 (pm 272,
  // tanda del 31-jul) tienen sus 14 fotos como el literal `error_imagen_sin_dimensiones`.
  // `fetch()` sobre eso tira "Failed to parse URL", el catch lo contaba como "sin respuesta"
  // y el resumen lo atribuía a la RED. Consecuencia medida el 2-ago: el reporte dijo
  // "1 portada rota · 3 sin respuesta (¿red?)" cuando en verdad eran 15 tarjetas vacías.
  // Un dato corrupto y un timeout son problemas distintos: el primero no se arregla solo.
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) return 'url inválida';
  // Un 5xx es el CDN teniendo un mal momento, NO una foto muerta: reintentar antes de
  // declararla rota. Sin esto se producen falsos positivos que mandan a "reparar" portadas
  // sanas — pasó el 2-ago con la prop 2044 (Altamura), que dio 502 en el barrido y 200 en los
  // tres chequeos siguientes. Mismo principio que la gracia de 2 días del verificador: una
  // sola señal negativa no alcanza para actuar.
  let ultimo = 'sin respuesta';
  for (let intento = 0; intento < 3; intento++) {
    if (intento) await new Promise((r) => setTimeout(r, 1500 * intento));
    for (const method of ['HEAD', 'GET']) {
      try {
        const r = await fetch(url, { method, headers: UA, signal: AbortSignal.timeout(20000) });
        if (method === 'HEAD' && (r.status === 405 || r.status === 501)) continue;
        ultimo = r.status;
        break;
      } catch (e) { if (method === 'GET') ultimo = 'sin respuesta'; }
    }
    if (ultimo === 200) return 200;
    if (typeof ultimo === 'number' && ultimo < 500) return ultimo;   // 403/404 = definitivo, no reintentar
  }
  return ultimo;
}

async function main() {
  const alcance = ZONAS ? `${ZONAS_HIBRIDO[ZONA_ID].nombre} (${ZONAS.length} zonas)` : 'TODAS las zonas';
  console.log(`\n📷 CHEQUEO DE PORTADAS — alcance: ${alcance}. Read-only.\n`);

  let q = sb.from('propiedades_v2_shadow')
    .select('id,fuente,tipo_operacion,zona,nombre_edificio,url,datos_json')
    .eq('status', 'completado').eq('es_activa', true).is('duplicado_de', null);
  if (ZONAS) q = q.in('zona', ZONAS);
  // 🔴 PAGINADO: sin esto PostgREST cortaba en 1.000 y el barrido decía "revisadas: 1000"
  // sobre 1.155 props reales — 155 sin mirar, y el resumen las daba por sanas. Se descubrió
  // el 2-ago: el chequeo reportaba 3 portadas rotas del Condominio K1 y en la base había 14.
  const data = await traerTodo(q);

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
      // 'url inválida' va con las ROTAS, no con las de red: la tarjeta sale vacía igual y
      // el dato está corrupto en la base, así que necesita acción — no es ruido de conexión.
      (st === 'sin respuesta' ? sinRespuesta : rotas).push(reg);
      console.log(`   🔴 ${p.id} [${p.tipo_operacion}] ${p.nombre_edificio || '—'} — portada HTTP ${st}` +
                  (primeraViva !== null ? ` · la foto #${primeraViva + 1} SÍ carga (de ${fotos.length})` : ` · NINGUNA de sus ${fotos.length} fotos carga`));
    }));
    if (hechas % 80 < LOTE) console.log(`   … ${hechas}/${conFotos.length}`);
  }

  const arreglables = rotas.filter((r) => r.primera_foto_viva !== null);
  const perdidas = rotas.filter((r) => r.primera_foto_viva === null);
  const corruptas = rotas.filter((r) => r.http_portada === 'url inválida');
  console.log(`\n────────── RESULTADO ──────────`);
  console.log(`  revisadas:                 ${conFotos.length}`);
  console.log(`  🔴 portada rota:            ${rotas.length}`);
  console.log(`     · con otra foto viva:    ${arreglables.length}  → se arregla reordenando, sin re-leer`);
  console.log(`     · sin ninguna foto viva: ${perdidas.length}  → hay que re-leer el aviso`);
  if (corruptas.length) {
    console.log(`     · de esas, URL INVÁLIDA: ${corruptas.length}  → el valor guardado NO es una URL (el portal`);
    console.log(`                                    devolvió un mensaje de error). Re-leer NO alcanza si el`);
    console.log(`                                    portal sigue sin servir la imagen: mirar el aviso a mano.`);
    const porEdif = [...corruptas.reduce((m, r) => m.set(r.edif || '—', (m.get(r.edif || '—') || 0) + 1), new Map())];
    console.log(`                                    por edificio: ${porEdif.map(([e, n]) => `${e} ×${n}`).join(' · ')}`);
  }
  if (sinRespuesta.length) console.log(`  ⚠️  sin respuesta (¿red?):   ${sinRespuesta.length}`);
  console.log(`  ⚠️  props sin fotos guardadas: ${sinFotos}`);

  const file = join(OUT, `portadas-rotas-${ZONA_ID}-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify({ generado: new Date().toISOString(), alcance, revisadas: conFotos.length, rotas, sin_respuesta: sinRespuesta }, null, 2));
  console.log(`\n  📦 → ${file}\n`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
