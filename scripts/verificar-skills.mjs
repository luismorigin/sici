#!/usr/bin/env node
// ============================================================================
// verificar-skills.mjs — ¿la skill que CORRE dice lo mismo que el repo?
// ============================================================================
// Uso:
//   node scripts/verificar-skills.mjs          # reporta (exit 1 si algo difiere)
//   node scripts/verificar-skills.mjs --fix    # sincroniza las que difieren
//
// POR QUÉ EXISTE
// Las skills viven **gitignored** en `.claude/commands/` y el repo guarda el
// `.command.md` como fuente de verdad. El diseño está bien —la config de la máquina
// no va al repo— pero **la copia es manual, así que se olvida**.
//
// El síntoma es traicionero: el archivo del repo dice lo correcto, así que revisándolo
// todo parece en orden, mientras la skill que efectivamente corre está vieja.
// Pasó el 31-jul-2026: `/audit-cola-shadow` quedó dos días atrás y le faltaban los tres
// arreglos del 30-jul (correr las 2 zonas, NOMBRES_NO_EDIFICIO, el CONFIRMAR que se
// escribe). Correrla a mano auditaba solo Equipetrol — en silencio, que es lo peor.
//
// 🔑 Es el mismo patrón que este proyecto viene cazando: dos fuentes que deberían decir
//    lo mismo y nadie las compara. Esto lo compara en 2 segundos.
//
// NOTA: las routines (`~/.claude/scheduled-tasks/*/SKILL.md`) son OTRA cosa y NO se
// chequean acá — son wrappers con su propio prompt, no copias del `.command.md`.
// ============================================================================

import { readFileSync, readdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = join(ROOT, '.claude', 'commands');
const FIX = process.argv.includes('--fix');

// Excepciones nombre-de-archivo → nombre-de-skill. El resto se resuelve solo:
// primero por el destino que el propio `.command.md` declara en su cabecera
// ("Copiar a `.claude/commands/<x>.md`"), y si no lo declara, por el basename.
const ALIAS = { 'fetch-test': 'probar-fetcher-ventas' };

// ── juntar los .command.md del repo (sin worktrees: viven bajo .claude/) ─────
function buscar(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'output'].includes(e.name)) continue;
      buscar(p, acc);
    } else if (e.name.endsWith('.command.md')) acc.push(p);
  }
  return acc;
}

const fuentes = buscar(join(ROOT, 'scripts'));
if (!fuentes.length) { console.error('No se encontró ningún .command.md en scripts/'); process.exit(1); }

const resultados = [];
const cubiertas = new Set();

for (const src of fuentes.sort()) {
  const nombreArchivo = basename(src).replace(/\.command\.md$/, '');
  // 1) destino declarado por el propio archivo · 2) alias conocido · 3) basename
  const declarado = readFileSync(src, 'utf8').match(/\.claude\/commands\/([a-z0-9-]+)\.md/i)?.[1];
  const skill = declarado || ALIAS[nombreArchivo] || nombreArchivo;
  const dst = join(COMMANDS, `${skill}.md`);
  cubiertas.add(skill);

  if (!existsSync(dst)) { resultados.push({ estado: 'falta', skill, src, dst }); continue; }

  // 🔴 Comparar NORMALIZANDO fin de línea. El repo está en CRLF (Windows) y varias skills
  // instaladas quedaron en LF, así que un `===` crudo marcaba el archivo ENTERO como distinto
  // con el contenido idéntico. Medido el 31-jul-2026: de 4 "desincronizadas", 2 eran esto.
  // Un chequeo que grita en falso deja de mirarse — y el día que la diferencia sea real,
  // tampoco. Se compara el texto; el fin de línea no cambia lo que la skill dice.
  const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  if (norm(src) === norm(dst)) { resultados.push({ estado: 'ok', skill, src, dst }); continue; }

  // Antigüedad: si la instalada es MÁS nueva que la del repo, alguien editó la copia
  // en vez de la fuente — copiar encima le borraría el trabajo. Se avisa, no se pisa.
  const instaladaMasNueva = statSync(dst).mtimeMs > statSync(src).mtimeMs;
  resultados.push({ estado: 'difiere', skill, src, dst, instaladaMasNueva });
}

// skills instaladas sin fuente en el repo (informativo: pueden ser de plugins o globales)
const huerfanas = existsSync(COMMANDS)
  ? readdirSync(COMMANDS).filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, '')).filter((s) => !cubiertas.has(s))
  : [];

// ── reporte ──────────────────────────────────────────────────────────────────
const difieren = resultados.filter((r) => r.estado === 'difiere');
const faltan = resultados.filter((r) => r.estado === 'falta');
const ok = resultados.filter((r) => r.estado === 'ok');

console.log(`\n🔎 SKILLS — repo (.command.md) vs instaladas (.claude/commands/)\n`);
for (const r of resultados) {
  if (r.estado === 'ok') console.log(`  ✅ ${r.skill}`);
  else if (r.estado === 'falta') console.log(`  ⚠️  ${r.skill.padEnd(32)} NO instalada · fuente: ${relative(ROOT, r.src)}`);
  else console.log(`  🔴 ${r.skill.padEnd(32)} DIFIERE${r.instaladaMasNueva ? '  ← ⚠️ la INSTALADA es más nueva (¿editaste la copia?)' : ''}`);
}
if (huerfanas.length) {
  console.log(`\n  ℹ️  instaladas sin .command.md en el repo (plugins/globales, no es error):`);
  console.log(`      ${huerfanas.join(', ')}`);
}

console.log(`\n  ${ok.length} al día · ${difieren.length} desincronizadas · ${faltan.length} sin instalar\n`);

// ── --fix ────────────────────────────────────────────────────────────────────
if (FIX && (difieren.length || faltan.length)) {
  let copiadas = 0, saltadas = 0;
  for (const r of [...difieren, ...faltan]) {
    if (r.instaladaMasNueva) {
      console.log(`  ⏭️  ${r.skill}: SALTADA — la instalada es más nueva. Revisá a mano cuál vale`);
      console.log(`      repo:      ${relative(ROOT, r.src)}`);
      console.log(`      instalada: ${r.dst}`);
      saltadas++; continue;
    }
    copyFileSync(r.src, r.dst); copiadas++;
    console.log(`  ✅ ${r.skill} ← ${relative(ROOT, r.src)}`);
  }
  console.log(`\n  ${copiadas} sincronizada(s)${saltadas ? ` · ${saltadas} saltada(s) por seguridad` : ''}\n`);
  process.exit(saltadas ? 1 : 0);
}

if (difieren.length || faltan.length) {
  console.log(`  → corré  node scripts/verificar-skills.mjs --fix  para sincronizar\n`);
  process.exit(1);
}
process.exit(0);
