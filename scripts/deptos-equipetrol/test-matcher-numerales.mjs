// Prueba del fix de numerales del matcher (29-jul-2026). Read-only, ~10s.
//   node scripts/deptos-equipetrol/test-matcher-numerales.mjs
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { matchearPorNombre, numeralesDe, numeralCompatible } from './lib/matcher.mjs';

dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, fail = 0;
const check = (cond, txt) => { if (cond) { ok++; console.log('  ✅ ' + txt); } else { fail++; console.log('  🔴 ' + txt); } };

console.log('\n=== 1. Extracción de cifras (romano y arábigo son lo mismo) ===');
const eq = (a, b) => [...a].sort().join(',') === [...b].sort().join(',');
check(eq(numeralesDe('Portofino IV'), [4]), '"Portofino IV" → {4}');
check(eq(numeralesDe('CONDOMINIO PORTOFINO 4'), [4]), '"CONDOMINIO PORTOFINO 4" → {4}');
check(eq(numeralesDe('Limco II'), [2]), '"Limco II" → {2}');
check(eq(numeralesDe('Macororo 16/17'), [16, 17]), '"Macororo 16/17" → {16,17} (los dos)');
check(eq(numeralesDe('Sky Icon'), []), '"Sky Icon" → {} (sin numeral)');
check(eq(numeralesDe('Ziri Zwei'), []), '"Ziri Zwei" → {} — "zwei" es alemán, NO se interpreta');

console.log('\n=== 2. Compatibilidad ===');
check(numeralCompatible('Portofino 4', 'CONDOMINIO PORTOFINO IV'), '🔑 "Portofino 4" ↔ "PORTOFINO IV" — el arreglo');
check(numeralCompatible('Limco 2', 'EDIFICIO LIMCO II'), '"Limco 2" ↔ "LIMCO II"');
check(!numeralCompatible('Portofino IV', 'Portofino V'), '🔑 "Portofino IV" ✗ "Portofino V" — el falso positivo');
check(!numeralCompatible('Galil Parque II', 'GALIL PARQUE III'), '"Galil Parque II" ✗ "III"');
check(!numeralCompatible('Macororo 14', 'Macororo 15'), '"Macororo 14" ✗ "15"');
check(!numeralCompatible('CONDOMINIO ONE 1', 'CONDOMINIO ONE'), '🔑 "ONE 1" ✗ "ONE" a secas (caso 2019)');
check(numeralCompatible('Sky Icon', 'Sky Icon'), 'sin numeral de los dos lados → compatible');
check(numeralCompatible('Orange Residence', 'ORANGE RESIDENCE'), 'sin numeral, distinta caja → compatible');

console.log('\n=== 3. Contra la BASE real — los que estaban MAL ===');
for (const [nombre, zona, noDebeSer] of [
  ['Portofino IV', '3er-4to anillo La Salle-Banzer', 75],   // 75 = Portofino V
  ['Galil Parque II', '3er-4to anillo La Salle-Banzer', 358], // 358 = GALIL PARQUE III
]) {
  const r = await matchearPorNombre(sb, { nombre, zona });
  check(r.pm !== noDebeSer, `"${nombre}" NO cae en el pm ${noDebeSer} (dio: pm ${r.pm ?? 'null'} · ${r.metodo})`);
}

console.log('\n=== 4. Contra la BASE real — los que deben SEGUIR andando (no-regresión) ===');
for (const [nombre, zona, esperado, desc] of [
  ['Portofino 4', '3er-4to anillo La Salle-Banzer', 270, 'arábigo → el pm romano (ANTES fallaba)'],
  ['Sky Icon', '2do-3er anillo Banzer-Alemana', 276, 'sin numeral, nombre único'],
  ['Magnum Residencias Equipetrol', 'Equipetrol Norte', 499, 'Equipetrol, nombre largo sin numeral'],
  ['Orange Residence', '2do-3er anillo Banzer-Alemana', 376, 'sin numeral'],
  ['Macororo 15', '2do-3er anillo Banzer-Alemana', 361, 'arábigo que ya andaba'],
]) {
  const r = await matchearPorNombre(sb, { nombre, zona });
  check(r.pm === esperado, `"${nombre}" → pm ${esperado} (${desc}) · dio pm ${r.pm ?? 'null'} [${r.metodo}]`);
}

console.log(`\n${fail === 0 ? '✅ TODO OK' : '🔴 ' + fail + ' FALLAS'} — ${ok} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
