// ============================================================================
// DISCOVERY DEPTOS — ORQUESTADOR · FASE DRY-RUN (read-only) · MULTI-ZONA
// ----------------------------------------------------------------------------
// El front-end de discovery que le FALTABA al híbrido: sale a los portales él
// mismo (NO hereda la discovery de n8n). Contenido a: tipo=departamento ×
// operacion=venta × las microzonas de UNA zona. NO toca casas/terrenos (el
// c21Listado filtra por tipo), NO escribe a la BD.
//
// 🎛️ ZONA (28-jul-2026): la zona salió del código a `lib/zonas-hibrido.mjs`.
//    DEFAULT = equipetrol → sin flags se comporta EXACTAMENTE como antes.
//
// Etapas (todas READ-ONLY):
//   1. Discovery  → c21Listado + remaxListadoSC (tipo=departamento), red ancha de la zona
//   2. Zona fina  → get_zona_by_gps por hit → SOLO las microzonas de la zona (canónico, no bbox)
//   3. Diff vs SHADOW → nuevas / desaparecidas (SELECT-only), **acotado a la zona**
//   4. Salida     → consola + output/discovery-deptos[-<zona>]-<ts>.json
//
// Etapas PENDIENTES (siguiente fase): detalle de las nuevas → MOAT (lector) →
//   matching → UPSERT a propiedades_v2_shadow (--apply, service_role) + verificador
//   sobre las desaparecidas. Reusa lib/detalle-deptos.mjs + READER_SPEC + matcher.
//
// Uso:
//   node discovery-deptos.mjs                    -> Equipetrol (default), dry-run
//   node discovery-deptos.mjs --zona=zona-norte  -> Zona Norte, dry-run
//   node discovery-deptos.mjs --force            -> saltea el cooldown anti-bloqueo
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { c21Listado, remaxListadoSC } from '../sonda-suelo/lib/portales.mjs';
import { enZona } from '../sonda-suelo/lib/zonas.mjs';
import { circuit, trafico } from '../sonda-suelo/lib/fetcher.mjs';
import { ZONAS_HIBRIDO, resolverZona } from './lib/zonas-hibrido.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ZONA = resolverZona();                   // default equipetrol → sin flags, todo igual que antes
const ZONA_KEY = ZONA.bboxKey;                 // red ancha (bbox de la zona)
const TIPO = 'departamento';
const ZONAS_EQ = new Set(ZONA.zonas);          // filtro FINO (get_zona_by_gps), no el bbox
const FORCE = process.argv.includes('--force');
const log = (m) => console.log(m);

// COOLDOWN anti-stacking (igual que casas): re-crawlear seguido desde tu IP puede bloquearla.
// Por ZONA: que ZN haya crawleado hace 5 min no debe frenar a Equipetrol (son barridos distintos).
// El prefijo de Equipetrol es prefijo de los demás ('discovery-deptos-' ⊂ 'discovery-deptos-zn-')
// → hay que excluir explícitamente los de las otras zonas, o Equipetrol se auto-bloquearía con ellos.
const PREFIJO = `discovery-deptos${ZONA.sufijoArchivo}-`;
const PREFIJOS_AJENOS = Object.values(ZONAS_HIBRIDO)
  .filter((z) => z.id !== ZONA.id && z.sufijoArchivo)
  .map((z) => `discovery-deptos${z.sufijoArchivo}-`);
const esDeEstaZona = (f) => f.startsWith(PREFIJO) && !PREFIJOS_AJENOS.some((p) => f.startsWith(p));

const COOLDOWN_MIN = 20;
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
try {
  const last = readdirSync(OUT).filter(esDeEstaZona).sort().pop();
  if (last && !FORCE) {
    const ageMin = (Date.now() - statSync(join(OUT, last)).mtimeMs) / 60000;
    if (ageMin < COOLDOWN_MIN) {
      console.log(`\n⏳ Última corrida hace ${ageMin.toFixed(0)} min (< ${COOLDOWN_MIN}). Re-crawlear tan seguido puede bloquear tu IP. Esperá o usá --force.\n`);
      process.exit(0);
    }
  }
} catch { /* primera corrida */ }

// Clasifica una lista de puntos por get_zona_by_gps (en paralelo por chunks para no saturar).
async function clasificarZonas(items) {
  const CHUNK = 20;
  const res = new Map();
  for (let i = 0; i < items.length; i += CHUNK) {
    const slice = items.slice(i, i + CHUNK);
    const out = await Promise.all(slice.map(async (p) => {
      const { data, error } = await sb.rpc('get_zona_by_gps', { p_lat: p.lat, p_lon: p.lon });
      // get_zona_by_gps devuelve una FILA vía PostgREST: [{ zona: '...' }] (no un string).
      return [p.url, error ? null : (Array.isArray(data) ? data[0]?.zona : data?.zona ?? data) ?? null];
    }));
    for (const [url, zona] of out) res.set(url, zona);
  }
  return res;
}

// ============================== MAIN ==============================
log(`\n🏢 DISCOVERY DEPTOS ${ZONA.nombre.toUpperCase()} — DRY-RUN (read-only) · tipo=${TIPO} · ${ZONA.zonas.length} microzonas\n`);

// ---------- 1. DISCOVERY ----------
log(`1) Discovery (C21 + Remax, red ancha ${ZONA.nombre})…`);
const listings = [];
for (const p of await c21Listado(ZONA_KEY, TIPO, { log, step: 0.005, saltarVacios: ZONA.usaPoligono })) if (p.url && enZona(p.lat, p.lon, ZONA_KEY)) listings.push({ ...p, fuente: 'century21' });
for (const p of await remaxListadoSC(TIPO, { log })) if (p.url && enZona(p.lat, p.lon, ZONA_KEY)) listings.push({ ...p, fuente: 'remax' });
const byUrl = new Map();
for (const p of listings) if (!byUrl.has(p.url)) byUrl.set(p.url, p);
const portalBbox = [...byUrl.values()];
log(`   → ${portalBbox.length} deptos únicos por URL dentro del bbox (${listings.length} listings crudos)\n`);

if (circuit.tripped) {
  // CLASIFICAR antes de avisar (ítem 2c-bis del CUTOVER_DATA_PLAN): un fallo puede ser (a) el portal
  // CAÍDO, (b) nuestra IP/proxy bloqueada, o (c) la red propia. Decir "IP bloqueada" a secas fue
  // ENGAÑOSO el 20-jul (C21 estaba caído: DNS ENOTFOUND global, no era la IP). Un lookup DNS lo
  // distingue gratis: si el dominio no resuelve, el portal está caído y no hay nada que reintentar.
  // Si el corte fue por RELOJ, el DNS no viene al caso: los portales no tienen nada que ver.
  // Preguntarlo igual daría "ambos resuelven DNS → probable bloqueo de IP", que es exactamente
  // la conclusión equivocada (y manda a investigar el proxy en vez de la ventana horaria).
  let diag;
  if (circuit.porReloj) {
    diag = `la corrida pasó del límite de tiempo (${circuit.motivo}). Causa típica: la máquina se ` +
      `suspendió a mitad del crawl (Modern Standby corta la red) y el reloj siguió corriendo. ` +
      `NO es el portal ni la IP: revisar que la ventana nocturna esté despierta.`;
  } else {
    const dns = await import('node:dns');
    const resuelve = async (h) => { try { await dns.promises.lookup(h); return true; } catch { return false; } };
    const [c21Ok, remaxOk] = await Promise.all([resuelve('c21.com.bo'), resuelve('remax.bo')]);
    diag = !c21Ok && !remaxOk ? 'NINGUNO de los dos portales resuelve DNS → caídos o problema de red propia'
      : !c21Ok ? 'C21 NO resuelve DNS → C21 caído (no es bloqueo de IP)'
      : !remaxOk ? 'Remax NO resuelve DNS → Remax caído (no es bloqueo de IP)'
      : 'ambos portales resuelven DNS → probable bloqueo de IP/proxy o rate-limit';
  }

  console.error(`🛑 Discovery INCOMPLETO: ${circuit.motivo}.`);
  console.error(`   Diagnóstico: ${diag}`);
  console.error(`   Aborto para NO escribir un diff parcial (metería falsas "desaparecidas"). Reintentá más tarde.\n`);

  // Aviso AUTOMÁTICO: si el cron muere acá nunca llega al paso 7, así que el aviso tiene que salir
  // desde el script — es justo el caso donde más se necesita y más fácil se pierde.
  const { notificarSlack } = await import('./notificar-slack.mjs');
  await notificarSlack(
    `🛑 *Cron deptos-VENTA ABORTADO* (discovery)\n` +
    `Motivo: ${circuit.motivo}.\n` +
    `Diagnóstico: ${diag}\n` +
    `*NO se escribió nada* — se aborta a propósito para no meter bajas falsas.\n` +
    `Se reintenta en la próxima corrida; el inventario no se pierde (el discovery es shadow-relativo).`
  );
  process.exit(1);
}

// ---------- 2. ZONA FINA (canónico, no bbox) ----------
log(`2) Filtro de zona fina (get_zona_by_gps ∈ ${ZONA.zonas.length} microzonas)…`);
const zonaDe = await clasificarZonas(portalBbox);
const portal = portalBbox.filter((p) => ZONAS_EQ.has(zonaDe.get(p.url)));
log(`   → ${portal.length} deptos en las ${ZONA.zonas.length} microzonas (${portalBbox.length - portal.length} descartados: fuera de ${ZONA.nombre} / sin zona)\n`);

// ---------- 3. DIFF (SELECT-only) — SHADOW-AWARE ----------
// El híbrido vive en SHADOW, no en prod. Por eso: (a) las NUEVAS excluyen lo ya cargado en
// shadow (sin esto se reprocesan cada corrida); (b) las DESAPARECIDAS se miden contra SHADOW,
// no contra prod (prod acumula stale + otras operaciones → 91% era ruido, medido 13-jul).
log('3) Diff SHADOW-AWARE (shadow filtra ya-cargadas y mide desaparecidas)…');
// 🔌 DESENGANCHADO DE PROD (10-ago-2026). Acá se leía `propiedades_v2` para informar cuánto del
// portal coincidía con el inventario viejo. Era **puramente informativo** desde el 20-jul (prod
// dejó de clasificar nuevas/existentes; ver el comentario de `nuevas` abajo) y nadie consumía ni
// `existentes_urls` ni `resumen.prod` del JSON de salida — verificado en todo el repo.
// Se retira porque el `if (error) process.exit(1)` de esa lectura **abortaba la captura entera**:
// el día que `propiedades_v2` se renombre a archivo, las 4 routines nocturnas dejaban de capturar
// y nos enterábamos por el log de la mañana. Una atadura a una tabla congelada desde el 28-jul
// que podía frenar el pipeline vivo.
// SHADOW (venta): lo que el híbrido YA cargó (existentes migradas + nuevas con id 8M)
// 🔒 FILTRADO POR ZONA (28-jul-2026). Antes se leía TODO shadow sin filtrar, porque shadow
// era ~100% Equipetrol y daba igual. Con una segunda zona adentro eso se vuelve destructivo:
// las `desaparecidas` se calculan contra lo que ESTE crawl vio, así que correr el discovery de
// ZN marcaría TODA Equipetrol como desaparecida (no está en el portal de ZN) y el verificador
// la daría de baja. El filtro es lo que hace que dos zonas puedan convivir en la misma tabla.
// Verificado antes de aplicarlo: shadow venta = 534 filas, las 534 dentro de las 6 zonas de
// Equipetrol, 0 con zona NULL → para Equipetrol NO cambia ningún número.
const shadowTodas = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('propiedades_v2')
    .select('id, url, es_activa, zona').eq('tipo_operacion', 'venta').range(from, from + 999);
  if (error) { console.error('   ERROR leyendo shadow:', error.message); process.exit(1); }
  shadowTodas.push(...data);
  if (data.length < 1000) break;
}
const shadowRows = shadowTodas.filter((r) => ZONAS_EQ.has(r.zona));
// Ruidoso a propósito: una prop sin zona queda fuera del diff y NUNCA se daría de baja.
// Es exactamente el tipo de agujero que se tapa solo en silencio si no se dice.
const sinZona = shadowTodas.filter((r) => !r.zona).length;
if (sinZona) log(`   ⚠️  ${sinZona} props en shadow SIN zona → fuera del diff (no se verifican). Revisar.`);
// MULTIPROYECTO YA CLASIFICADOS: los avisos-proyecto (brochures) NO van a shadow — van a
// `proyectos_detectados` (mig 273). Sin excluirlos acá reaparecen como "nuevas" TODAS las noches,
// para siempre, y el conteo crece solo (medido 20-jul: 38 de 40 "nuevas" eran esto → el reporte
// mentía 20×). El CARGADOR ya los excluía (cargar-deptos-shadow.mjs, --nuevas); el discovery no.
const { data: proyRows, error: errProy } = await sb.from('proyectos_detectados')
  .select('url').eq('macrozona', ZONA.macrozona);
if (errProy) { console.error('   ERROR leyendo proyectos_detectados:', errProy.message); process.exit(1); }
const proyUrls = new Set((proyRows || []).map((r) => r.url));

const shadowUrls = new Set(shadowRows.map((r) => r.url));
const portalUrls = new Set(portal.map((p) => p.url));
// NUEVAS = en el portal y NO en shadow (ni multiproyecto ya clasificado). SHADOW-RELATIVO: prod NO
// participa de la clasificación. El portal es la fuente de verdad; el híbrido captura todo lo que el
// portal muestra y shadow no tiene todavía — sin depender del inventario viejo de n8n. Antes se excluía
// `!dbUrls` (en prod) → los ~18 que estaban en prod pero no en shadow quedaban huérfanos, esperando al
// `--prep`. Al sacar esa exclusión, entran por `--nuevas` y el drenado desde prod se retira. (20-jul)
const nuevas = portal.filter((p) => !shadowUrls.has(p.url) && !proyUrls.has(p.url));

// ── SLUG REESCRITO POR C21 (4-ago-2026) ──────────────────────────────────────
// C21 arma la URL como /propiedad/<codigo>_<slug>. El CÓDIGO es el aviso; el slug es
// decorado y C21 lo REESCRIBE cuando el captador edita el aviso (baja el precio, corrige
// la tipología, cambia el nombre del edificio). Para nosotros cambia la URL → la prop
// entra como NUEVA y el mismo departamento queda dos veces en el feed, con dos precios.
//
// 🔴 NO se filtran: hay que CAPTURARLAS. El precio nuevo es el vigente — saltearlas
// dejaría el precio viejo para siempre (caso Lofty Island: teníamos $118.770 cuando ya
// valía $85.000). Se marcan con `reemplaza_a` y el cargador deduplica al aplicar.
//
// Medido antes de implementar: 8 grupos con código repetido en shadow, 8/8 eran el mismo
// aviso (3 confirmados por el juez del audit, 5 verificados por HTTP el 4-ago: la URL vieja
// da error y la nueva 200). Cero falsos positivos — el código es el id del aviso en C21.
// 🆕 28-ago-2026 · TAMBIÉN REMAX. Hasta hoy esto era C21-only por una línea
// (`if (nv.fuente !== 'century21') continue`), y Remax hace exactamente lo mismo:
// cambió el slug de `venta-departamento-<cod>` a `venta-departamento-santa-cruz-de-la-
// sierra-<zona>-<cod>` y los avisos re-entraron como NUEVOS. Resultado: el mismo depto
// dos veces en el feed, con dos precios (1728 $188.000 y 8000799 $180.000, descripción
// con md5 idéntico, los dos vivos hasta que se encontró a mano el 28-ago).
//
// 🔴 Ninguna superficie del audit puede ver esto: la 3 agrupa por PRECIO (y el precio es
// justo lo que cambió) y la 7 exige >30% de brecha y mismo edificio. La única evidencia
// es el código de la URL.
//
// MEDIDO antes de implementar, sobre las 505 URLs de Remax en base: **las 505 parsean**
// (100%), dan 503 códigos distintos y **exactamente 2 grupos** con el mismo código y URL
// distinta — Mare y el par de arriba, los dos el mismo aviso. **Cero falsos positivos.**
//
// 🔑 EL CÓDIGO DE REMAX SON DOS PARTES, `<listado>-<unidad>`, y las dos importan: los tres
// Berchatti comparten el listado `1200346220` y se distinguen por `-15`/`-16`/`-17`, que
// son TRES DEPARTAMENTOS DISTINTOS. Tomar solo el listado los fusionaría. La medición lo
// comprueba: con las dos partes, Berchatti no aparece entre las colisiones.
//
// La fuente se deduce del HOST, no del campo `fuente`: así los dos patrones no pueden
// pisarse entre sí y el índice nunca cruza un código de C21 con uno de Remax.
const codigoAviso = (url) => {
  const u = String(url || '');
  if (/c21\.com\.bo/i.test(u)) {
    const m = u.match(/\/propiedad\/(\d+)[_-]/);
    return m ? `c21:${m[1]}` : null;
  }
  if (/remax\.bo/i.test(u)) {
    const m = u.match(/-(\d{6,})-(\d+)\/?$/);
    return m ? `remax:${m[1]}-${m[2]}` : null;
  }
  return null;
};
// Se indexa contra shadow COMPLETO (no el filtrado por zona): el código es único en todo
// C21, así que un aviso que además cambió de zona sigue siendo el mismo aviso. Si eso pasa
// se avisa abajo, porque es raro y conviene mirarlo.
const porCodigoAviso = new Map();
for (const r of shadowTodas) {
  const c = codigoAviso(r.url);
  if (c && !porCodigoAviso.has(c)) porCodigoAviso.set(c, r);
}
let reescritos = 0;
for (const nv of nuevas) {
  // Ya NO se filtra por fuente: si la URL trae un código reconocible, sirve. Una fuente
  // sin patrón devuelve null y se saltea sola — agregar un portal nuevo es agregar su
  // patrón a `codigoAviso`, no tocar este bucle.
  const c = codigoAviso(nv.url);
  if (!c) continue;
  const vieja = porCodigoAviso.get(c);
  if (!vieja || vieja.url === nv.url) continue;
  // `codigo` es el genérico; `codigo_c21` se sigue emitiendo para no romper un material
  // viejo que se re-aplique (el cargador lee uno u otro).
  nv.reemplaza_a = { id: vieja.id, url: vieja.url, codigo: c, codigo_c21: c, zona_vieja: vieja.zona ?? null };
  reescritos++;
}
if (reescritos) {
  log(`   🔁 ${reescritos} con SLUG REESCRITO por el portal (mismo código, URL nueva) → se capturan y reemplazan a la vieja:`);
  for (const nv of nuevas.filter((n) => n.reemplaza_a)) {
    const cruzaZona = nv.reemplaza_a.zona_vieja && nv.reemplaza_a.zona_vieja !== zonaDe.get(nv.url);
    log(`      cod ${nv.reemplaza_a.codigo ?? nv.reemplaza_a.codigo_c21}: id ${nv.reemplaza_a.id} → nueva URL${cruzaZona ? `  ⚠️ cambió de zona (${nv.reemplaza_a.zona_vieja} → ${zonaDe.get(nv.url)}), revisar` : ''}`);
  }
}
// DESAPARECIDAS = activas en SHADOW no vistas en el portal (lo del híbrido; NO la stale de prod)
const desaparecidas = shadowRows.filter((r) => r.es_activa && !portalUrls.has(r.url));
const shadowActivas = shadowRows.filter((r) => r.es_activa).length;
log(`   → shadow venta: ${shadowRows.length} (${shadowActivas} activas) · multiproyecto ya clasificados: ${proyUrls.size}`);
log(`   → NUEVAS (portal, NO en shadow ni multiproyecto → se capturan): ${nuevas.length}`);
log(`   → desaparecidas (activas en SHADOW, no vistas → verificar): ${desaparecidas.length}\n`);

// ---------- 4. SALIDA ----------
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = join(OUT, `${PREFIJO}${ts}.json`);
writeFileSync(outPath, JSON.stringify({
  generado: new Date().toISOString(), modo: 'DRY-RUN', tipo: TIPO,
  // La zona viaja DENTRO del archivo, no solo en el nombre: el consumidor (cargador,
  // verificador) puede chequear que está leyendo lo que cree. Misma lección que el
  // `"operacion": "venta"` de los chunks de lectura tras el pisado del 28-jul.
  zona: ZONA.id, zona_nombre: ZONA.nombre, microzonas: ZONA.zonas,
  resumen: {
    portal_bbox: portalBbox.length, portal_zona: portal.length,
    shadow: shadowRows.length, shadow_activas: shadowActivas,
    nuevas: nuevas.length, desaparecidas: desaparecidas.length,
    slug_reescrito_c21: reescritos,
    por_fuente: {
      c21: portal.filter((p) => p.fuente === 'century21').length,
      remax: portal.filter((p) => p.fuente === 'remax').length,
    },
  },
  nuevas: nuevas.map((p) => ({ url: p.url, fuente: p.fuente, lat: p.lat, lon: p.lon, zona: zonaDe.get(p.url), precio_usd: p.precio_usd, dorms: p.dorms, fecha_alta: p.fecha_alta ?? null, ...(p.reemplaza_a ? { reemplaza_a: p.reemplaza_a } : {}) })),
  desaparecidas: desaparecidas.map((r) => ({ id: r.id, url: r.url, zona: r.zona })),
}, null, 2), 'utf8');

log('='.repeat(64));
log(`  DRY-RUN listo. NO se escribió nada a la BD.  ·  zona: ${ZONA.nombre}`);
log(`  Portal: ${portal.length} (${ZONA.zonas.length} microzonas) · shadow venta activas (${ZONA.nombre}): ${shadowActivas}`);
log(`  Nuevas (no están en shadow): ${nuevas.length}${reescritos ? ` (${reescritos} son slug reescrito por C21 → reemplazan a una existente)` : ''} · Desaparecidas del híbrido a verificar: ${desaparecidas.length}`);
log(`  💾 ${outPath}`);
log(`  📊 Tráfico: ${trafico.resumen()}${process.env.PROXY_URL ? ' (por proxy — se descuenta de los GB)' : ' (IP directa, $0)'}\n`);
