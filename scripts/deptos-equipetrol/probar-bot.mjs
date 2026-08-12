// ============================================================================
// ¿EL BOT PUEDE CONSULTAR EL MERCADO? — prueba diaria, $0, read-only
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE: el bot estuvo caído **19 días** (24-jul → 12-ago-2026) y se
// descubrió porque el founder preguntó, no porque el sistema avisara. La alarma
// que ya existe (`vigilar_bot_whatsapp`, mig 305) detecta que el bot **contestó
// mal**; nadie detectaba que **no puede consultar**. Si nadie le escribe, el
// silencio es idéntico a que todo ande.
//
// 🔑 USA LA CLAVE ANON A PROPÓSITO — es la decisión de diseño que hace que esto
// sirva. El bot llama con la clave pública (Kapso carga SUPABASE_ANON_KEY), y las
// dos causas del incidente fueron de PERMISOS de ese rol:
//   · mig 315 — recreó `v_estado_obra_inferido_shadow` sin GRANT para anon
//   · mig 317 — REVOKE sobre `propiedades_v2_shadow`
// Con `service_role` las cinco pruebas pasarían en verde con el bot muerto.
// **Probar con la llave equivocada es peor que no probar: da falsa tranquilidad.**
//
// QUÉ MIRA, y por qué cada caso:
//   1. resumen_mercado venta SIN presupuesto ... andaba durante el incidente
//   2. resumen_mercado venta CON presupuesto ... 🔴 el que rompía (timeout, mig 321)
//   3. resumen_mercado alquiler ............... la rama que nadie había probado
//   4. buscar_propiedades venta con presupuesto 🔴 el otro que rompía
//   5. buscar_similares ....................... estaba al filo (4,06 s → mig 325)
//
// Falla si: HTTP ≠ 200 · la RPC devuelve error · **responde 200 pero sin datos**
// (el modo de falla favorito de este sistema) · o tarda más de LIMITE_S.
// Avisa (sin fallar) si tarda más de UMBRAL_S: es el margen que se está comiendo.
//
// Uso:  node probar-bot.mjs            → informa y sale 0/1
//       node probar-bot.mjs --slack    → además avisa por Slack SI algo falla
// ============================================================================
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');

// Supabase corta cerca de los 3 s. UMBRAL avisa antes de que duela; LIMITE falla.
const UMBRAL_S = 2.0;
const LIMITE_S = 3.0;
const SLACK = process.argv.includes('--slack');

function leerEnv(archivo) {
  try {
    return Object.fromEntries(
      readFileSync(archivo, 'utf8').split('\n')
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]),
    );
  } catch { return {}; }
}

const env = { ...leerEnv(path.join(RAIZ, 'simon-mvp', '.env.local')), ...process.env };
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
// 🔴 ANON, no service_role. Ver el encabezado: con la llave de servidor esta
// prueba habría pasado en verde los 19 días que el bot estuvo caído.
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL_SB || !KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

// `hash_no_encontrado` NO es una falla: la función respondió bien, la shortlist
// de prueba puede haberse borrado. Lo que importa es que la RPC conteste.
const HASH_PRUEBA = env.BOT_TEST_HASH || '6HNhB9xZQW';

const CASOS = [
  { nombre: 'venta sin presupuesto',   rpc: 'resumen_mercado',     body: { p_operacion: 'venta' },                         datos: (j) => j?.general?.total },
  { nombre: 'venta CON presupuesto',   rpc: 'resumen_mercado',     body: { p_operacion: 'venta', p_precio_max: 120000 },   datos: (j) => j?.general?.total },
  { nombre: 'alquiler con presupuesto', rpc: 'resumen_mercado',    body: { p_operacion: 'alquiler', p_precio_max: 5000 },  datos: (j) => j?.general?.total },
  { nombre: 'buscar venta con ppto',   rpc: 'buscar_propiedades',  body: { p_operacion: 'venta', p_precio_max: 120000, p_limit: 5 }, datos: (j) => (Array.isArray(j) ? j.length : 0) },
  { nombre: 'similares (loop D29)',    rpc: 'buscar_similares',    body: { p_hash: HASH_PRUEBA, p_fav_ids: [], p_limit: 5 },
    datos: (j) => (j?.error === 'hash_no_encontrado' ? -1 : (j?.propiedades?.length ?? 0)) },
];

async function probar(c) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${URL_SB}/rest/v1/rpc/${c.rpc}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(c.body),
      signal: AbortSignal.timeout(20000),
    });
    const seg = (Date.now() - t0) / 1000;
    if (!r.ok) {
      const t = await r.text();
      return { ...c, ok: false, seg, motivo: `HTTP ${r.status} — ${t.slice(0, 120)}` };
    }
    const j = await r.json();
    if (j?.code || (j?.message && !j.propiedades && !j.general)) {
      return { ...c, ok: false, seg, motivo: `la RPC devolvió error: ${j.message || j.code}` };
    }
    const filas = c.datos(j);
    // -1 = shortlist de prueba inexistente: la función respondió, es válido.
    if (filas === 0) return { ...c, ok: false, seg, motivo: 'respondió 200 pero SIN datos' };
    if (seg > LIMITE_S) return { ...c, ok: false, seg, filas, motivo: `tardó ${seg.toFixed(2)}s (límite ${LIMITE_S}s)` };
    return { ...c, ok: true, seg, filas, lento: seg > UMBRAL_S };
  } catch (e) {
    return { ...c, ok: false, seg: (Date.now() - t0) / 1000, motivo: `no respondió: ${e.message}` };
  }
}

const res = [];
for (const c of CASOS) res.push(await probar(c));   // en serie: es una prueba, no una carrera

console.log('🤖 ¿El bot puede consultar el mercado? · clave anon (la que usa Kapso)\n');
for (const r of res) {
  const icono = r.ok ? (r.lento ? '🟡' : '✅') : '❌';
  const dato = r.filas === -1 ? 'la shortlist de prueba no existe (pero la RPC respondió)' : `${r.filas} resultado(s)`;
  const detalle = r.ok ? `${r.seg.toFixed(2).padStart(5)}s · ${dato}` : r.motivo;
  console.log(`  ${icono} ${r.nombre.padEnd(28)} ${detalle}`);
}

const fallan = res.filter((r) => !r.ok);
const lentos = res.filter((r) => r.ok && r.lento);

console.log('');
if (fallan.length) {
  console.log(`🔴 ${fallan.length} de ${res.length} FALLAN — el bot no puede consultar.`);
} else if (lentos.length) {
  console.log(`🟡 Todo responde, pero ${lentos.length} por encima de ${UMBRAL_S}s: se está comiendo el margen.`);
} else {
  console.log(`✅ Las ${res.length} consultas del bot responden bien.`);
}

if (SLACK && (fallan.length || lentos.length)) {
  const lineas = [
    fallan.length ? `🔴 BOT: ${fallan.length}/${res.length} consultas FALLAN` : `🟡 BOT: ${lentos.length} consulta(s) lenta(s)`,
    ...fallan.map((r) => `• ${r.nombre}: ${r.motivo}`),
    ...lentos.map((r) => `• ${r.nombre}: ${r.seg.toFixed(2)}s (umbral ${UMBRAL_S}s)`),
    fallan.length ? 'El bot está derivando a un asesor. Revisar permisos de anon y tiempos de las RPC.' : '',
  ].filter(Boolean).join('\n');
  try {
    execFileSync('node', [path.join(AQUI, 'notificar-slack.mjs'), lineas], { stdio: 'inherit' });
  } catch { console.warn('  (no se pudo avisar por Slack — el aviso no hace fallar la prueba)'); }
}

process.exit(fallan.length ? 1 : 0);
