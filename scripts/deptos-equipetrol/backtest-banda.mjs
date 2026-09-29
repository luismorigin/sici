#!/usr/bin/env node
// ============================================================================
// BACKTEST DE LA BANDA DE $/m² — ¿la regla que desempata bob-vs-USD acierta?
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE (28-sep-2026): la banda se cambió dos veces a ojo y las dos
// veces salió mal. La primera quedó 25% alta y llevaba meses inflando precios.
// La segunda (la "corrección") arreglaba una punta y rompía la otra — sólo se
// vio midiendo. Este script es el que no deja repetirlo.
//
// 🔑 LA VERDAD ES INDEPENDIENTE DE LA REGLA: se etiqueta cada aviso por lo que
//    dice su TEXTO (si sólo habla en Bs → BOB; si sólo en dólares → USD), que es
//    evidencia que ninguna banda tocó. El primer backtest usó el tag guardado
//    —que lo había puesto la banda vieja— y la regla vieja se calificó a sí
//    misma: "ganaba" 73 a 18 cuando en realidad perdía 10 a 1.
//
// QUÉ SIMULA: exactamente la cascada del READER_SPEC §banda de $/m²:
//   1. banda de la zona (sólo CONFIRMA USD)  →  2. hermanas del mismo edificio
//   →  3. humano (declarar la duda)
//
// Uso:  node backtest-banda.mjs            (las dos macrozonas)
//       node backtest-banda.mjs --zona=zona-norte
// $0, READ-ONLY.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { ZONAS_HIBRIDO } from './lib/zonas-hibrido.mjs';
import { medirBanda } from './lib/banda-m2.mjs';
import { traerTodo } from './lib/traer-todo.mjs';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TASA = 12.094;              // paralelo del día del backtest
const MARGEN_HERMANAS = 1.5;      // una lectura gana sólo si está 1,5× más cerca que la otra
const MIN_HERMANAS = 2;           // hermanas INEQUÍVOCAS (texto declarado); con 1 no alcanza

const zonaArg = process.argv.find((a) => a.startsWith('--zona='))?.split('=')[1];
const zonas = zonaArg ? [ZONAS_HIBRIDO[zonaArg]] : Object.values(ZONAS_HIBRIDO);

// Etiqueta por el TEXTO: la única verdad que no depende de la banda.
const SOLO_BS  = /(bs\.?|bolivianos)\s*[0-9]{3}[ .,]?[0-9]{3}/i;
const SOLO_USD = /(\$us|usd|dolar)\.?\s*[0-9]{2}[ .,]?[0-9]{3}/i;
const MENCIONA_USD = /(\$us|usd|dolar)/i;
function etiquetar(desc) {
  if (!desc) return null;
  if (SOLO_BS.test(desc) && !MENCIONA_USD.test(desc)) return 'BOB';
  if (SOLO_USD.test(desc) && !SOLO_BS.test(desc)) return 'USD';
  return null;   // el texto no es concluyente → fuera del backtest
}

for (const ZONA of zonas) {
  const banda = await medirBanda(sb, ZONA.zonas, ZONA.m2Tipico);

  // 🔴 Se piden SÓLO los 3 campos que hacen falta, no `datos_json` entero: la primera
  // versión traía el JSON completo de cada aviso y la API contestó 522 (Cloudflare) por
  // tamaño. Sacar la descripción con `->>` en el select baja el payload ~50×.
  const props = await traerTodo(
    sb.from('propiedades_v2').select(
      'id, id_proyecto_master, area_total_m2,'
      + ' descripcion:datos_json->contenido->>descripcion,'
      + ' pc:datos_json->senales_portal->>precio_candidato,'
      + ' pb:datos_json->senales_portal->>precio_bob_portal')
      .eq('fuente', 'century21').eq('tipo_operacion', 'venta').eq('es_activa', true).in('zona', ZONA.zonas),
  );

  // 🔴 EL COMPARABLE SON LAS HERMANAS **INEQUÍVOCAS**, NO TODO EL EDIFICIO (28-sep-2026).
  // Primera versión: mediana del edificio tomada del feed. Resultado medido: en ZN acertaba
  // 16 de 24. La causa es el lazo que la banda ya tenía — si las otras unidades del edificio
  // están mal clasificadas, la mediana del edificio hereda el error y lo propaga (casos 2056
  // y 2057: USD reales, comparados contra un edificio "de $1.000/m²" que estaba mal leído).
  // Ahora la referencia son SÓLO las hermanas cuyo TEXTO declara la moneda, valuadas por lo
  // que declaran. Menos edificios califican → más casos al humano, pero el que decide, acierta.
  const porPm = new Map();
  for (const p2 of props) {
    const pm = Number(p2.id_proyecto_master);
    const area2 = Number(p2.area_total_m2), pc2 = Number(p2.pc), pb2 = Number(p2.pb);
    if (!Number.isFinite(pm) || !(area2 > 0) || !Number.isFinite(pc2) || !Number.isFinite(pb2)) continue;
    const v2 = etiquetar(p2.descripcion);
    if (!v2) continue;                                  // sin texto concluyente NO es comparable
    const m2 = v2 === 'BOB' ? (pb2 / TASA) / area2 : pc2 / area2;
    if (!(m2 > 0)) continue;
    if (!porPm.has(pm)) porPm.set(pm, []);
    porPm.get(pm).push({ id: p2.id, m2 });
  }
  const medianaEdificio = (pm, excluirId) => {
    const v = (porPm.get(Number(pm)) || []).filter((x) => x.id !== excluirId).map((x) => x.m2).sort((a, b) => a - b);
    if (v.length < MIN_HERMANAS) return null;
    return v[Math.floor((v.length - 1) / 2)];
  };

  const R = { banda: { n: 0, ok: 0 }, hermanas: { n: 0, ok: 0 }, humano: { n: 0 } };
  const fallos = [];

  for (const p of props) {
    const area = Number(p.area_total_m2);
    const pc = Number(p.pc), pb = Number(p.pb);
    if (!(area > 0) || !Number.isFinite(pc) || !Number.isFinite(pb)) continue;
    const verdad = etiquetar(p.descripcion);
    if (!verdad) continue;

    const u = pc / area, b = (pb / TASA) / area;
    const enBanda = (x) => x >= banda.min && x <= banda.max;

    let decide = null, paso = null;
    if (enBanda(u) && !enBanda(b)) { decide = 'USD'; paso = 'banda'; }
    else {
      const m2e = medianaEdificio(p.id_proyecto_master, p.id);
      if (m2e) {
        const dU = Math.abs(Math.log(u / m2e)), dB = Math.abs(Math.log(b / m2e));
        if (dU * MARGEN_HERMANAS < dB) { decide = 'USD'; paso = 'hermanas'; }
        else if (dB * MARGEN_HERMANAS < dU) { decide = 'BOB'; paso = 'hermanas'; }
      }
      if (!decide) paso = 'humano';
    }

    if (paso === 'humano') { R.humano.n++; continue; }
    R[paso].n++;
    if (decide === verdad) R[paso].ok++;
    else fallos.push({ id: p.id, verdad, decide, paso, usd_m2: Math.round(u), bob_m2: Math.round(b) });
  }

  const tot = R.banda.n + R.hermanas.n + R.humano.n;
  const decididos = R.banda.n + R.hermanas.n;
  const aciertos = R.banda.ok + R.hermanas.ok;
  console.log(`\n═══ ${ZONA.nombre} — banda ${banda.min}-${banda.max} (${banda.fuente}, n=${banda.n})`);
  console.log(`   casos etiquetados por el TEXTO: ${tot}`);
  console.log(`   1. banda:    ${String(R.banda.n).padStart(3)} casos · ${R.banda.ok} bien · ${R.banda.n - R.banda.ok} mal`);
  console.log(`   2. hermanas: ${String(R.hermanas.n).padStart(3)} casos · ${R.hermanas.ok} bien · ${R.hermanas.n - R.hermanas.ok} mal`);
  console.log(`   3. humano:   ${String(R.humano.n).padStart(3)} casos (declara la duda, no se cuentan como error)`);
  console.log(`   ⇒ de lo que decide sola: ${aciertos}/${decididos} (${decididos ? ((aciertos / decididos) * 100).toFixed(1) : '—'}%) · a revisión humana: ${((R.humano.n / tot) * 100).toFixed(0)}%`);
  if (fallos.length) {
    console.log(`   🔴 los ${fallos.length} errores:`);
    for (const f of fallos.slice(0, 12)) console.log(`      ${f.id} era ${f.verdad}, dijo ${f.decide} (${f.paso}) · usd_m2 ${f.usd_m2} · bob_m2 ${f.bob_m2}`);
  }
}
console.log('');
