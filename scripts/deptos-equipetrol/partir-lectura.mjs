// Parte un material-alq-*.json en chunks LIVIANOS de lectura (sin _apply/fotos) para
// los subagentes-lectores. Cada subagente lee un chunk, aplica READER_SPEC_ALQUILER.md,
// y devuelve [{id, ...veredicto}]. Reutilizable para el barrido completo.
// Uso: node partir-lectura.mjs <material-alq-*.json> [tamano_chunk=10]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
const size = Number(process.argv[3]) || 10;
if (!file) { console.error('Uso: node partir-lectura.mjs <material.json> [tamano_chunk]'); process.exit(1); }

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
  const f = join(OUT, `lectura-chunk-${i + 1}.json`);
  writeFileSync(f, JSON.stringify({ chunk: i + 1, total_chunks: chunks.length, entradas: c }, null, 2));
  console.log(`chunk ${i + 1}: ${c.length} props → ${f}`);
});
console.log(`\n${chunks.length} chunks de ~${size}. material origen: ${file}`);
