// ═══════════════════════════════════════════════════════════════════════════
// banda-m2.mjs — la banda de $/m² de la zona, MEDIDA cada noche, y los
// comparables del edificio para que el lector desempate solo.
// ═══════════════════════════════════════════════════════════════════════════
//
// QUÉ RESUELVE (28-sep-2026) — dos agujeros del mismo criterio:
//
// 1. **La banda era una constante escrita a mano.** Se calibró el 28-jul y nadie
//    la volvió a tocar: al medirla el 28-sep estaba **25% por encima** de la
//    realidad (ZN decía 1.500-1.900 en el spec y 1.280-1.900 en el código; la
//    mediana real era 1.246). Una banda vieja no falla: desempata mal el tipo de
//    cambio, en silencio, y publica precios inflados. Es la misma clase de tarea
//    manual que dejó la curva de mercado un mes congelada.
//
// 2. **El paso de desempate "mirá las hermanas del edificio" no se podía ejecutar.**
//    El material le daba al lector los NOMBRES de los edificios candidatos pero no
//    sus precios, así que todo lo dudoso caía a "confianza baja" → a un humano.
//    Medido: eso mandaba ~1 aviso por noche a revisión manual; con los comparables
//    adentro, el 81% se resuelve solo.
//
// 🔑 POR QUÉ LA BANDA ES p25–p75 Y NO p50–p90: las dos lecturas posibles de un
//    precio C21 sin monto en el texto (USD directo vs bolivianos) difieren SIEMPRE
//    por el mismo factor (6,96 / paralelo ≈ 0,575). Una banda corrida hacia arriba
//    —como p50–p90, que es la mitad de ARRIBA de la distribución— empuja el
//    desempate hacia la lectura más cara de forma sistemática. Detalle y backtest:
//    READER_SPEC.md §banda de $/m².
//
// ⚠️ EL RIESGO DE MEDIRLA SOLA, Y SU FRENO: la banda se calcula sobre precios que
//    ella misma ayudó a clasificar. Si un día se corre, los precios mal leídos
//    mueven la banda y la banda mueve más precios — un lazo que se realimenta. Por
//    eso NO se aplica cualquier valor: si la medición se aleja más de `TOLERANCIA`
//    de la banda de referencia del código, **se conserva la del código y se avisa**.
//    Automático en lo normal, frenado cuando algo raro pasa.

import { traerTodo } from './traer-todo.mjs';

export const TOLERANCIA = 0.15;   // 15% de desvío permitido antes de frenar
export const MIN_FILAS  = 40;     // con menos filas la medición no es confiable

function percentil(ordenados, p) {
  if (!ordenados.length) return null;
  const i = (ordenados.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? ordenados[lo] : ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (i - lo);
}

/**
 * Mide la banda de $/m² de una zona sobre el feed vivo y la contrasta con la del
 * código. Devuelve SIEMPRE una banda usable (nunca null) + por qué es esa.
 *
 * @param {object} sb        cliente supabase
 * @param {string[]} zonas   las zonas de la macrozona (ZONA.zonas)
 * @param {{min:number,max:number}} referencia  la banda del código (ZONA.m2Tipico)
 */
export async function medirBanda(sb, zonas, referencia) {
  let filas = [];
  try {
    filas = await traerTodo(
      sb.from('v_mercado_venta_shadow').select('precio_m2').in('zona', zonas).not('precio_m2', 'is', null),
    );
  } catch (e) {
    return { ...referencia, fuente: 'codigo', n: 0, aviso: `⚠️ no se pudo medir (${e.message}) — se usa la banda del código` };
  }

  const vals = filas.map((f) => Number(f.precio_m2)).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (vals.length < MIN_FILAS) {
    return { ...referencia, fuente: 'codigo', n: vals.length, aviso: `⚠️ solo ${vals.length} filas (<${MIN_FILAS}) — se usa la banda del código` };
  }

  const min = Math.round(percentil(vals, 0.25));
  const max = Math.round(percentil(vals, 0.75));
  const mediana = Math.round(percentil(vals, 0.50));

  // 🔴 EL FRENO. Un desvío grande puede ser el mercado… o el lazo de realimentación
  // empezando. No se decide solo: se conserva la referencia y se grita.
  const desvio = Math.max(Math.abs(min - referencia.min) / referencia.min, Math.abs(max - referencia.max) / referencia.max);
  if (desvio > TOLERANCIA) {
    return {
      ...referencia, fuente: 'codigo', n: vals.length, mediana, medido: { min, max },
      aviso: `🔴 la banda medida (${min}-${max}) se aleja ${(desvio * 100).toFixed(0)}% de la del código (${referencia.min}-${referencia.max}) — NO se aplica sola. Revisar y actualizar lib/zonas-hibrido.mjs a mano.`,
    };
  }

  return { min, max, fuente: 'medida', n: vals.length, mediana, aviso: null };
}

/**
 * El $/m² de CADA edificio de la zona, por NOMBRE. Es la forma que sirve en la ruta
 * nocturna (`--prep-nuevas`), donde el material NO trae candidatos a propósito: el
 * lector nombra el edificio leyendo el aviso y recién ahí puede buscarlo acá.
 *
 * 🔑 Sin esto el paso 2 del spec ("mirá las hermanas del edificio") es inejecutable en
 * la ruta que más se usa, y todo lo dudoso termina en un humano.
 * Pesa poco: ~130-145 edificios por macrozona.
 *
 * @returns {Array<{edificio:string, m2:number, n:number}>}
 */
export async function edificiosPorNombre(sb, zonas, tasaParalelo) {
  const tasa = Number(tasaParalelo) > 0 ? Number(tasaParalelo) : null;
  let filas = [];
  try {
    // 🔴 Sólo los 6 campos necesarios: pedir `datos_json` entero hizo que la API contestara
    // 522 por tamaño (28-sep). El `->>` en el select baja el payload ~50×.
    filas = await traerTodo(
      sb.from('propiedades_v2').select(
        'id_proyecto_master, area_total_m2,'
        + ' descripcion:datos_json->contenido->>descripcion,'
        + ' pc:datos_json->senales_portal->>precio_candidato,'
        + ' pb:datos_json->senales_portal->>precio_bob_portal')
        .eq('tipo_operacion', 'venta').eq('es_activa', true).is('duplicado_de', null)
        .in('zona', zonas).not('id_proyecto_master', 'is', null),
    );
  } catch { return []; }
  if (!filas.length || !tasa) return [];

  // 🔑 LAS COMPARABLES SON LAS HERMANAS **INEQUÍVOCAS**: sólo las que declaran su moneda en
  // el TEXTO, valuadas por lo que declaran. Medido el 28-sep: usando la mediana del edificio
  // tal como está en el feed, el desempate acertaba 16 de 24 en ZN — si las otras unidades
  // están mal clasificadas, la mediana hereda el error y lo propaga (es el mismo lazo que
  // tenía la banda). Con hermanas inequívocas: 23 de 26. Menos edificios califican y más
  // casos van al humano, pero **el que decide, acierta**.
  const porPm = new Map();
  for (const f of filas) {
    const pm = Number(f.id_proyecto_master);
    const area = Number(f.area_total_m2), pc = Number(f.pc), pb = Number(f.pb);
    if (!Number.isFinite(pm) || !(area > 0)) continue;
    const d = f.descripcion || '';
    const soloBs = /(bs\.?|bolivianos)\s*[0-9]{3}[ .,]?[0-9]{3}/i.test(d) && !/(\$us|usd|dolar)/i.test(d);
    const soloUsd = /(\$us|usd|dolar)\.?\s*[0-9]{2}[ .,]?[0-9]{3}/i.test(d) && !/(bs\.?|bolivianos)\s*[0-9]{3}[ .,]?[0-9]{3}/i.test(d);
    let m2 = null;
    if (soloBs && Number.isFinite(pb)) m2 = (pb / tasa) / area;
    else if (soloUsd && Number.isFinite(pc)) m2 = pc / area;
    if (!(m2 > 0)) continue;
    if (!porPm.has(pm)) porPm.set(pm, []);
    porPm.get(pm).push(m2);
  }

  // Además, el $/m² del edificio TAL COMO ESTÁ EN EL FEED. Es evidencia DÉBIL (puede venir
  // contaminado) y por eso viaja marcado: sirve de contexto, NO para decidir la moneda.
  // Medido: decidiendo con esto, ZN acertaba 16/24; decidiendo sólo con `declarado`, 23/26.
  let feed = [];
  try {
    feed = await traerTodo(
      sb.from('v_mercado_venta_shadow').select('id_proyecto_master, precio_m2')
        .in('zona', zonas).not('precio_m2', 'is', null).not('id_proyecto_master', 'is', null),
    );
  } catch { feed = []; }
  const porPmFeed = new Map();
  for (const f of feed) {
    const pm = Number(f.id_proyecto_master);
    if (!porPmFeed.has(pm)) porPmFeed.set(pm, []);
    porPmFeed.get(pm).push(Number(f.precio_m2));
  }

  let nombres = [];
  try {
    nombres = await traerTodo(
      sb.from('proyectos_master').select('id_proyecto_master, nombre_oficial')
        .in('id_proyecto_master', [...new Set([...porPm.keys(), ...porPmFeed.keys()])]),
    );
  } catch { return []; }
  const nombreDe = new Map(nombres.map((r) => [Number(r.id_proyecto_master), r.nombre_oficial]));

  const out = [];
  const vistos = new Set();
  for (const [pm, vals] of porPm) {
    const ord = vals.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const nombre = nombreDe.get(pm);
    // n>=2: con una sola hermana el "edificio" es una anécdota, no una referencia.
    if (ord.length >= 2 && nombre) { out.push({ edificio: nombre, m2: Math.round(percentil(ord, 0.5)), n: ord.length, base: 'declarado' }); vistos.add(pm); }
  }
  for (const [pm, vals] of porPmFeed) {
    if (vistos.has(pm)) continue;
    const nombre = nombreDe.get(pm);
    const ord = vals.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    if (ord.length && nombre) out.push({ edificio: nombre, m2: Math.round(percentil(ord, 0.5)), n: ord.length, base: 'feed' });
  }
  return out.sort((a, b) => a.edificio.localeCompare(b.edificio));
}

/**
 * Para cada edificio candidato, el $/m² que ya tienen sus unidades cargadas.
 * Es lo que le permite al lector desempatar sin llamar a un humano: un edificio
 * cotiza parejo, así que la lectura correcta es la que se parece a sus hermanas.
 *
 * @returns {Map<number, {mediana_m2:number, n:number}>}
 */
export async function comparablesPorPm(sb, pmIds) {
  const ids = [...new Set((pmIds || []).filter((x) => Number.isFinite(Number(x))).map(Number))];
  if (!ids.length) return new Map();

  let filas = [];
  try {
    filas = await traerTodo(
      sb.from('v_mercado_venta_shadow').select('id_proyecto_master, precio_m2')
        .in('id_proyecto_master', ids).not('precio_m2', 'is', null),
    );
  } catch {
    return new Map();   // sin comparables el lector cae al paso 3 (declarar la duda), no inventa
  }

  const porPm = new Map();
  for (const f of filas) {
    const pm = Number(f.id_proyecto_master);
    if (!porPm.has(pm)) porPm.set(pm, []);
    porPm.get(pm).push(Number(f.precio_m2));
  }
  const out = new Map();
  for (const [pm, vals] of porPm) {
    const ord = vals.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    if (ord.length) out.set(pm, { mediana_m2: Math.round(percentil(ord, 0.5)), n: ord.length });
  }
  return out;
}
