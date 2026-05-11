// Audit interno SQL (sin fetch) sobre v_mercado_alquiler.
// Detecta inconsistencias entre BD y descripcion_cruda persistida.

import { config as loadEnv } from 'dotenv';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { getSupabaseClient } from './lib/db.mjs';
import { runChecks } from './lib/internal-checks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_CANDIDATES = [
  resolve(__dirname, '../../simon-mvp/.env.local'),
  resolve(__dirname, '../../../sici/simon-mvp/.env.local'),
  process.env.ENV_FILE,
].filter(Boolean);
const ENV_PATH = ENV_CANDIDATES.find((p) => existsSync(p));
if (ENV_PATH) loadEnv({ path: ENV_PATH });

const SEVERIDAD_ORDEN = { alta: 0, media: 1, baja: 2 };

async function main() {
  console.log('▶ Audit interno alquiler (sin fetch) sobre v_mercado_alquiler...');
  const supabase = getSupabaseClient();

  const { data: vista, error: e1 } = await supabase
    .from('v_mercado_alquiler')
    .select('id, fuente, url, dias_en_mercado, precio_mensual_bob, precio_mensual');
  if (e1) throw e1;

  const ids = vista.map((v) => v.id);
  console.log(`  ${ids.length} props vivas en feed alquiler`);

  const props = [];
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('propiedades_v2')
      .select('id, nombre_edificio, datos_json_enrichment')
      .in('id', chunk);
    if (error) throw error;
    const vById = new Map(vista.map((v) => [v.id, v]));
    for (const p of data) {
      const v = vById.get(p.id);
      props.push({
        id: p.id,
        precio_mensual_bob: parseFloat(v?.precio_mensual_bob) || 0,
        nombre_edificio: p.nombre_edificio,
        descripcion_cruda: p.datos_json_enrichment?.descripcion || '',
      });
    }
  }
  console.log(`  ${props.length} props leídas con datos completos`);

  const propByVista = new Map(vista.map((v) => [v.id, v]));
  const results = [];
  for (const p of props) {
    const issues = runChecks(p);
    if (issues.length > 0) {
      const v = propByVista.get(p.id);
      results.push({
        id: p.id,
        fuente: v?.fuente,
        url: v?.url,
        dias_en_mercado: v?.dias_en_mercado,
        precio_mensual_bob: p.precio_mensual_bob,
        nombre_edificio: p.nombre_edificio,
        precio_mensual_usd: parseFloat(v?.precio_mensual) || 0,
        issues,
      });
    }
  }

  results.sort((a, b) => {
    const sevA = Math.min(...a.issues.map((i) => SEVERIDAD_ORDEN[i.severidad]));
    const sevB = Math.min(...b.issues.map((i) => SEVERIDAD_ORDEN[i.severidad]));
    if (sevA !== sevB) return sevA - sevB;
    return b.issues.length - a.issues.length;
  });

  const runDir = resolve(
    __dirname,
    'reports',
    'internal-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  );
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8');

  const md = renderReport(results, props.length);
  await writeFile(join(runDir, 'summary.md'), md, 'utf8');

  printResumen(results, props.length);
  console.log(`✔ Listo. ${join(runDir, 'summary.md')}`);
}

function renderReport(results, totalProps) {
  const lines = [];
  lines.push(`# Audit interno alquiler — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`**Props auditadas:** ${totalProps}`);
  lines.push(`**Props con issues:** ${results.length} (${((results.length / totalProps) * 100).toFixed(1)}%)`);
  lines.push('');

  const porTipo = {};
  for (const r of results) {
    for (const i of r.issues) {
      porTipo[i.tipo] = (porTipo[i.tipo] || 0) + 1;
    }
  }
  lines.push('## Issues por tipo');
  lines.push('');
  lines.push('| Tipo | Cantidad |');
  lines.push('|---|---:|');
  for (const [t, n] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${t} | ${n} |`);
  }
  lines.push('');

  for (const sev of ['alta', 'media', 'baja']) {
    const filtered = results.filter((r) => r.issues.some((i) => i.severidad === sev));
    if (filtered.length === 0) continue;
    lines.push(`## ${sev === 'alta' ? '🔴' : sev === 'media' ? '🟡' : '🟢'} Severidad ${sev} (${filtered.length} props)`);
    lines.push('');
    lines.push('| ID | Fuente | Edificio | Bs BD | USD | Issues |');
    lines.push('|---:|---|---|---:|---:|---|');
    for (const r of filtered) {
      const issuesStr = r.issues
        .filter((i) => i.severidad === sev)
        .map((i) => `**${i.tipo}**: ${i.msg}`)
        .join('<br>');
      lines.push(
        `| ${r.id} | ${r.fuente} | ${r.nombre_edificio || '-'} | Bs ${r.precio_mensual_bob} | $${Math.round(r.precio_mensual_usd)} | ${issuesStr} |`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function printResumen(results, total) {
  console.log('\n=== Resumen ===');
  console.log(`  Total props auditadas: ${total}`);
  console.log(`  Props con issues: ${results.length}`);
  const altas = results.filter((r) => r.issues.some((i) => i.severidad === 'alta'));
  const medias = results.filter(
    (r) => r.issues.some((i) => i.severidad === 'media') && !r.issues.some((i) => i.severidad === 'alta')
  );
  const bajas = results.filter(
    (r) => !r.issues.some((i) => i.severidad === 'alta') && !r.issues.some((i) => i.severidad === 'media')
  );
  console.log(`  🔴 Severidad alta:  ${altas.length}`);
  console.log(`  🟡 Severidad media: ${medias.length}`);
  console.log(`  🟢 Severidad baja:  ${bajas.length}`);
}

main().catch((err) => {
  console.error('✖ Error:', err);
  process.exit(1);
});
