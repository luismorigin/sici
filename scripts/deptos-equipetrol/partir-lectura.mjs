// Parte un material-*.json en chunks LIVIANOS de lectura (sin _apply/fotos) para
// los subagentes-lectores. Cada subagente lee un chunk, aplica el READER_SPEC de su
// operación, y devuelve [{id, ...veredicto}]. Reutilizable para el barrido completo.
// Uso: node partir-lectura.mjs <material-*.json> [tamano_chunk=10]
//
// 🔴 NOMBRES NAMESPACEADOS POR OPERACIÓN — no volver a `lectura-chunk-N.json`.
// El 28-jul-2026 venta y alquiler corrieron EN PARALELO (las 3 routines disparan juntas
// cuando la máquina estuvo dormida) y compartían estos nombres de trabajo: el que escribía
// segundo PISABA al primero. Evidencia: un lector de venta vio cambiar el contenido de su
// propio chunk entre dos lecturas (ids 8000278-280 → 8000291-293, con schema de ALQUILER).
// El daño es SILENCIOSO: `inyectar-veredictos.mjs` matchea por id, así que no mezcla data
// ajena — simplemente PIERDE veredictos, y la prop se cae del apply sin que nadie lo note.
// La operación se deriva del nombre del material (no hace falta un flag nuevo).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
const size = Number(process.argv[3]) || 10;
if (!file) { console.error('Uso: node partir-lectura.mjs <material.json> [tamano_chunk]'); process.exit(1); }

// `material-alq-<ts>.json` → alquiler · `material-nuevas-<ts>.json` (u otro) → venta.
const op = /material-alq/i.test(basename(file)) ? 'alquiler' : 'venta';
// Fecha local (no UTC): el log y los nombres tienen que coincidir con el día que ve el humano.
const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const doc = JSON.parse(readFileSync(file, 'utf8'));
// Solo lo que el LECTOR necesita (descripción + señales + candidatos). Sin _apply/fotos (peso).
const livianas = doc.entradas.map((e) => ({
  id: e.id, fuente: e.fuente, zona: e.zona, slug: e.slug,
  titulo: e.titulo, subtitulo: e.subtitulo, descripcion: e.descripcion,
  senales: e.senales, nombre_guess: e.nombre_guess, match_candidatos: e.match_candidatos,
}));

const OUT = join(__dirname, 'output');
const chunks = [];
for (let i = 0; i < livianas.length; i += size) chunks.push(livianas.slice(i, i + size));
chunks.forEach((c, i) => {
  const f = join(OUT, `lectura-${op}-${hoy}-c${i + 1}.json`);
  // `op` va DENTRO del archivo además del nombre: si un lector recibe el chunk equivocado
  // (o alguien lo renombra), puede detectarlo antes de aplicar el spec que no corresponde.
  writeFileSync(f, JSON.stringify({ operacion: op, chunk: i + 1, total_chunks: chunks.length, entradas: c }, null, 2));
  console.log(`chunk ${i + 1}: ${c.length} props → ${f}`);
});
console.log(`\n${chunks.length} chunks de ~${size} · operación: ${op.toUpperCase()}. material origen: ${file}`);
console.log(`Los lectores escriben:  output/veredictos-${op}-${hoy}-c<N>.json`);
