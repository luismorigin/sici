// ============================================================================
// AUDIT DE COLA / MATCHING — versión SHADOW (híbrido)  ·  $0, read-only
// ----------------------------------------------------------------------------
// Port alineado de /audit-cola-matching al feed híbrido. El doc AUDITORIAS_POST_CUTOVER.md
// §"/audit-cola-matching — MUDA DE TABLA": la cola `matching_sugerencias` NO existe para el
// híbrido (matchea en el --apply). El VALOR reutilizable no es la cola, es el patrón
//   leer el anuncio → subagente-lector JUEZ → cruce contra proyectos_master+GPS → SQL con candados.
// Cambio quirúrgico: en vez de `getColaPendiente`, leemos las DOS SUPERFICIES de shadow.
//
// Ventaja vs el audit-cola de prod: shadow YA guarda el anuncio que el reader juzgó
// (`datos_json.contenido.descripcion`) → el juez lee de ahí, SIN re-fetch → $0 y sin riesgo de IP.
//
// SUPERFICIES (las que el doc nombra):
//   1) SIN MATCH con nombre  → id_proyecto_master IS NULL AND nombre_edificio IS NOT NULL
//        (metodo sin_match/fuzzy_debil/ambiguo) → candidatos PM_NUEVO / fuzzy débil.
//   2) AUTO-MATCH RIESGOSO   → datos_json.trazabilidad.metodo_match = 'nombre_unico_zona_dif'
//        (confianza 85, nombre único exacto pero ZONA ≠ → falsos positivos: Sky Luxury/Maré/Uptown Drei).
//
// El .mjs es FILTRO, no juez: trae las superficies + candidatos fuzzy + GPS. El VEREDICTO
// (aprobar/corregir/rechazar/pm-nuevo) lo dan subagentes-lectores. El SQL lo aplica el humano
// contra propiedades_v2_shadow (candado IS NULL sup.1 / formato-objeto sup.2).
//
// Uso:
//   node auditar-matching-shadow.mjs                  # ambas operaciones
//   node auditar-matching-shadow.mjs --op venta
//   node auditar-matching-shadow.mjs --op alquiler --limit 40
// Salida: output/audit-matching-shadow-<ts>.json (superficies para el juez) + summary.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectarDuplicados } from '../auditoria-feed-ventas/lib/dup-checks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---- args ----
const argv = process.argv.slice(2);
const opArg = (() => { const i = argv.indexOf('--op'); return i >= 0 ? argv[i + 1] : 'ambos'; })();
const OPS = opArg === 'venta' ? ['venta'] : opArg === 'alquiler' ? ['alquiler'] : ['venta', 'alquiler'];
const LIMIT = (() => { const i = argv.indexOf('--limit'); return i >= 0 ? Number(argv[i + 1]) : null; })();

// Métodos que marcan AUTO-MATCH RIESGOSO (surface 2). El matcher híbrido pone confianza 85 +
// metodo 'nombre_unico_zona_dif' cuando el nombre es único exacto pero la zona no corrobora.
const METODOS_RIESGO = new Set(['nombre_unico_zona_dif']);
const slugDe = (url) => (url ? String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^propiedad\//, '') : null);

function haversine(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v == null || isNaN(Number(v)))) return null;
  const R = 6371000, toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const COLS = 'id,fuente,url,tipo_operacion,latitud,longitud,zona,nombre_edificio,id_proyecto_master,piso,duplicado_de,campos_bloqueados,precio_usd,precio_mensual_usd,precio_mensual_bob,area_total_m2,datos_json';

// 🔒 REGLA CRÍTICA #1 del proyecto: `campos_bloqueados` SIEMPRE se respetan (Manual > Automatic).
// Si un humano ya decidió sobre este campo (ej. "este match es un FP, dejar sin pm"), el audit NO
// debe volver a proponerlo: reaparecería en cada corrida y el juez podría RE-INTRODUCIR el error que
// se sacó. Bug cazado 17-jul: la prop 3505 (FP desmatcheado el 14-jul, candado explícito) volvía a
// Superficie 1 con candidato score 1.0.
const candado = (p, campo) => p?.campos_bloqueados?.[campo]?.bloqueado === true;

async function main() {
  console.log(`\n🔎 AUDIT MATCHING SHADOW — ops: ${OPS.join('+')}${LIMIT ? ` (limit ${LIMIT}/op)` : ''}. READ-ONLY, $0 (sin fetch).\n`);
  let filas = [];
  for (const op of OPS) {
    let q = sb.from('propiedades_v2_shadow').select(COLS).eq('tipo_operacion', op).eq('es_activa', true).order('id', { ascending: true });
    if (LIMIT) q = q.limit(LIMIT);
    const { data, error } = await q;
    if (error) throw error;
    filas.push(...(data || []));
  }
  console.log(`   ${filas.length} filas activas en shadow.\n`);

  const sup1 = [], sup2 = [];
  const pmRiesgoIds = new Set();

  for (const p of filas) {
    const dj = p.datos_json || {};
    const metodo = dj.trazabilidad?.metodo_match || null;
    const base = {
      prop_id: p.id, op: p.tipo_operacion, fuente: p.fuente, url: p.url,
      lat: p.latitud, lon: p.longitud, zona: p.zona, nombre_edificio: p.nombre_edificio,
      titulo: dj.contenido?.titulo || null,
      descripcion_anuncio: dj.contenido?.descripcion || null,
      pistas_nombre: { col: p.nombre_edificio || null, slug: slugDe(p.url) },
    };
    // SUPERFICIE 1 — sin match, con nombre → PM_NUEVO / fuzzy débil
    // (excluye las candadas: un humano ya decidió que van sin pm — no re-proponer)
    if (p.id_proyecto_master == null && p.nombre_edificio && !candado(p, 'id_proyecto_master')) {
      sup1.push({ ...base, metodo: metodo || 'sin_match', candidatos: [] });
    }
    // SUPERFICIE 2 — auto-match riesgoso (nombre único, zona ≠)
    else if (p.id_proyecto_master != null && METODOS_RIESGO.has(metodo) && !candado(p, 'id_proyecto_master')) {
      sup2.push({ ...base, pm_actual: p.id_proyecto_master, metodo, pm_nombre: null, pm_zona: null, dist_metros: null });
      pmRiesgoIds.add(p.id_proyecto_master);
    }
  }

  // Superficie 1: candidatos fuzzy del catálogo (prod, read-only) para que el juez tenga referencia
  for (const s of sup1) {
    const { data } = await sb.rpc('buscar_proyecto_fuzzy', { p_nombre: s.nombre_edificio, p_umbral_minimo: 0.3, p_limite: 5 });
    s.candidatos = (data || []).map((c) => ({ pm: c.id_proyecto, nombre: c.nombre, zona: c.zona, score: Number(c.score), tipo: c.match_tipo }));
  }
  // Superficie 2: traer nombre + GPS del pm actual → dist prop↔pm (¿el match tiene sentido geográfico?)
  if (pmRiesgoIds.size) {
    const { data: pms } = await sb.from('proyectos_master').select('id_proyecto_master,nombre_oficial,zona,latitud,longitud').in('id_proyecto_master', [...pmRiesgoIds]);
    const byId = new Map((pms || []).map((r) => [r.id_proyecto_master, r]));
    for (const s of sup2) {
      const pm = byId.get(s.pm_actual);
      if (pm) { s.pm_nombre = pm.nombre_oficial; s.pm_zona = pm.zona; s.dist_metros = haversine(s.lat, s.lon, pm.latitud, pm.longitud); }
    }
  }

  // ── SUPERFICIE 3 — DUPLICADOS (apart-hoteles / republicaciones) ──
  // El detector del pipeline NO los caza (cada aviso tiene código único). Agrupa por
  // nombre+precio+área y compara descripciones (≥90% = mismo aviso replicado). Reusa
  // `detectarDuplicados` de prod. MEJORA shadow: agrupa por PM cuando existe (más certero
  // que el string del nombre) — el pm ya matcheado deja el dedup servido. $0, ya tenemos la desc.
  const precioDe = (p) => p.tipo_operacion === 'venta'
    ? (Number(p.precio_usd) || 0)
    : (Number(p.precio_mensual_usd) || Number(p.precio_mensual_bob) || 0);
  const realPorId = new Map(filas.map((p) => [p.id, { nombre: p.nombre_edificio, pm: p.id_proyecto_master, precio: precioDe(p), op: p.tipo_operacion }]));
  const sup3 = [];
  for (const op of OPS) {
    // SOLO props que NO traen `duplicado_de` (heredado de prod / verificador). Sin este filtro, el dedup
    // marcaría un sobreviviente ya elegido por prod como duplicado → CICLO A↔B (los dos se ocultan, el
    // edificio desaparece del feed). Bug real cazado 14-jul (Santorini 1740↔1754, Lofty 51↔52). Al ignorar
    // los ya-deduplicados, el cluster se reduce a los survivors NULL y nunca se pisa una cadena existente.
    // + excluye las candadas en `duplicado_de`: un humano ya dictaminó "NO son duplicados" (ej. Luxe
    //   Suites 1090/1091, dos unidades reales de 34,5 y 32,5 m² con el mismo texto). Sin esto el dedup
    //   las re-propone en cada corrida y alguien las termina fusionando mal.
    const props = filas.filter((p) => p.tipo_operacion === op && p.duplicado_de == null && !candado(p, 'duplicado_de')).map((p) => ({
      id: p.id,
      // clave de grupo: pm si existe (robusto ante variantes del nombre), si no el nombre real.
      // GUARDA POR PISO: si el aviso declara piso, lo sufijo a la clave → dos unidades del MISMO
      // edificio/precio/área pero PISO distinto caen en grupos separados y NUNCA se marcan duplicadas
      // (aunque la desc sea ≥90%). Caso Las Dalias 324 piso1 / 325 piso5 = unidades reales, no dup.
      // piso null (sin dato) = comodín: agrupan entre sí (no fuerza separación sin evidencia).
      nombre_edificio: (p.id_proyecto_master ? `pm${p.id_proyecto_master}` : p.nombre_edificio)
        + (p.piso != null ? `#p${p.piso}` : ''),
      precio: precioDe(p),
      area: Number(p.area_total_m2) || 0,
      descripcion: p.datos_json?.contenido?.descripcion || '',
    }));
    for (const c of detectarDuplicados(props)) {
      const r = realPorId.get(c.sobreviviente) || {};
      sup3.push({
        op, edificio: r.nombre || c.nombre_edificio, pm: r.pm ?? null,
        precio: c.precio, area: c.area,
        sobreviviente: c.sobreviviente, duplicados: c.duplicados, n: c.n, ejemplo: c.ejemplo,
      });
    }
  }

  const file = join(OUT, `audit-matching-shadow-${TS}.json`);
  writeFileSync(file, JSON.stringify({
    generado: TS, ops: OPS, total_filas: filas.length,
    resumen: { superficie_1_sin_match_con_nombre: sup1.length, superficie_2_automatch_riesgoso: sup2.length, superficie_3_clusters_duplicados: sup3.length, superficie_3_props_a_deduplicar: sup3.reduce((a, c) => a + c.duplicados.length, 0) },
    superficie_1: sup1, superficie_2: sup2, superficie_3: sup3,
  }, null, 2));

  console.log(`────────── RESUMEN AUDIT MATCHING SHADOW ──────────`);
  console.log(`  Superficie 1 (sin match + con nombre → PM_NUEVO/fuzzy): ${sup1.length}`);
  for (const s of sup1.slice(0, 20)) console.log(`     ${s.prop_id} [${s.op}] "${s.nombre_edificio}"  cands:${s.candidatos.length}${s.candidatos[0] ? ` (mejor ${s.candidatos[0].nombre} ${s.candidatos[0].score})` : ''}`);
  console.log(`  Superficie 2 (auto-match riesgoso nombre_unico_zona_dif): ${sup2.length}`);
  for (const s of sup2.slice(0, 20)) console.log(`     ${s.prop_id} [${s.op}] "${s.nombre_edificio}" → pm ${s.pm_actual} (${s.pm_nombre || '?'}, zona ${s.pm_zona || '?'} vs ${s.zona}) dist ${s.dist_metros ?? '?'}m`);
  const dupProps = sup3.reduce((a, c) => a + c.duplicados.length, 0);
  console.log(`  Superficie 3 (duplicados apart-hotel/republicación): ${sup3.length} clusters · ${dupProps} props a deduplicar`);
  for (const c of sup3.slice(0, 20)) console.log(`     [${c.op}] "${c.edificio}"${c.pm ? ` pm${c.pm}` : ''} $${c.precio} ${c.area}m² → sobrevive ${c.sobreviviente}, duplicados: ${c.duplicados.join(',')} (${c.n} avisos)`);
  console.log(`\n  📦 → ${file}`);
  console.log(`     Siguiente: sup.1/sup.2 → subagentes-lectores (JUEZ). sup.3 → dedup determinístico (revisar y aplicar):`);
  console.log(`       sup.1 → APROBAR(candidato) | PM_NUEVO(nombre_real) | SIN_NOMBRE`);
  console.log(`       sup.2 → CONFIRMAR el pm_actual | CORREGIR(otro pm) | RECHAZAR (nombre no aparece)`);
  console.log(`       sup.3 → UPDATE propiedades_v2_shadow SET duplicado_de=<sobreviviente> WHERE id IN (<duplicados>)`);
  console.log(`     SQL contra propiedades_v2_shadow lo aplica el humano (candado IS NULL / formato-objeto).\n`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
