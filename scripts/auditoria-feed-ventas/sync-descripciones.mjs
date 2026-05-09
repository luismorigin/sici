import { config as loadEnv } from 'dotenv';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabaseClient } from './lib/db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_CANDIDATES = [
  resolve(__dirname, '../../simon-mvp/.env.local'),
  resolve(__dirname, '../../../sici/simon-mvp/.env.local'),
  process.env.ENV_FILE,
].filter(Boolean);
const ENV_PATH = ENV_CANDIDATES.find((p) => existsSync(p));
if (ENV_PATH) loadEnv({ path: ENV_PATH });

const args = parseArgs(process.argv.slice(2));
const RUN_DIR = args.run || latestRunDir();
const TARGET_IDS = (args.ids || '').split(',').filter(Boolean).map(Number);
const SOURCE = args.source || 'scraped';
const DRY_RUN = !args.apply;

if (!RUN_DIR || TARGET_IDS.length === 0) {
  console.error('Uso: node sync-descripciones.mjs --ids 100,317,422 [--source scraped|admin] [--apply]');
  process.exit(1);
}

async function main() {
  console.log(`▶ Sincronizando descripciones (ambos campos)`);
  console.log(`  Run dir: ${RUN_DIR}`);
  console.log(`  IDs: ${TARGET_IDS.join(', ')}`);
  console.log(`  Source: ${SOURCE} (${SOURCE === 'admin' ? 'usa contenido.descripcion actual' : 'usa scraped del raw/'})`);
  console.log(`  Modo: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

  const supabase = getSupabaseClient();
  const rawDir = join(RUN_DIR, 'raw');
  const files = readdirSync(rawDir);

  for (const id of TARGET_IDS) {
    const { data: row, error: e1 } = await supabase
      .from('propiedades_v2')
      .select('datos_json, datos_json_enrichment')
      .eq('id', id)
      .single();
    if (e1) {
      console.log(`  #${id} → error leyendo: ${e1.message}`);
      continue;
    }

    let nuevaDesc;
    if (SOURCE === 'admin') {
      nuevaDesc = row.datos_json?.contenido?.descripcion || '';
      if (!nuevaDesc) {
        console.log(`  #${id} → contenido.descripcion vacío, salteo`);
        continue;
      }
    } else {
      const file = files.find((f) => f.startsWith(`${id}-`));
      if (!file) {
        console.log(`  #${id} → no encontrado en raw/`);
        continue;
      }
      const raw = JSON.parse(readFileSync(join(rawDir, file), 'utf8'));
      nuevaDesc = raw.descripcion_scraped || '';
      if (!nuevaDesc) {
        console.log(`  #${id} → descripcion_scraped vacía, salteo`);
        continue;
      }
    }

    const lenContenidoActual = (row.datos_json?.contenido?.descripcion || '').length;
    const lenEnrichmentActual = (row.datos_json_enrichment?.descripcion || '').length;

    console.log(
      `  #${id} → nueva ${nuevaDesc.length} chars (contenido: ${lenContenidoActual}, enrichment: ${lenEnrichmentActual})`
    );

    if (DRY_RUN) {
      console.log(`         preview: ${nuevaDesc.slice(0, 100)}...`);
      continue;
    }

    const newDatosJson = {
      ...row.datos_json,
      contenido: {
        ...(row.datos_json?.contenido || {}),
        descripcion: nuevaDesc,
      },
    };
    const newEnrichment = {
      ...row.datos_json_enrichment,
      descripcion: nuevaDesc,
    };

    const { error: e2 } = await supabase
      .from('propiedades_v2')
      .update({
        datos_json: newDatosJson,
        datos_json_enrichment: newEnrichment,
        fecha_actualizacion: new Date().toISOString(),
      })
      .eq('id', id);
    if (e2) {
      console.log(`  #${id} → ✖ error: ${e2.message}`);
    } else {
      console.log(`  #${id} → ✔ ambos campos sincronizados`);
    }
  }
}

function latestRunDir() {
  const reportsDir = resolve(__dirname, 'reports');
  if (!existsSync(reportsDir)) return null;
  const dirs = readdirSync(reportsDir).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d));
  if (dirs.length === 0) return null;
  return join(reportsDir, dirs.sort().pop());
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

main().catch((err) => {
  console.error('✖ Error:', err);
  process.exit(1);
});
