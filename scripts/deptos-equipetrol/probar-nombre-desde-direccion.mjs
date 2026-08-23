// Prueba de nombreDesdeDireccion() contra los direccionFormat REALES medidos el 22-ago-2026.
// Uso: node scripts/deptos-equipetrol/probar-nombre-desde-direccion.mjs
// Importa la funcion del lib para probar lo que CORRE, no una copia.
import { nombreDesdeDireccion } from './lib/detalle-deptos.mjs';

const casos = [
 ['CONDOMINIO ESTRELLA DEL ESTE DEPARTAMENTO 4 PISO 5', 'ESTRELLA DEL ESTE'],
 ['Edifico Nano Tec By Smart Studio - Zona Equipetrol', 'Nano Tec By Smart Studio'],
 ['condominio Eurodesign Leblanc', 'Eurodesign Leblanc'],
 ['Equipetrol Calle Leonardo Nava Edificio One Soul', 'One Soul'],
 ['equipetrol condominio speranto', 'speranto'],
 ['Macororo V', 'Macororo V'],
 ['Macororo 12', 'Macororo 12'],
 ['STRATTO UP', 'STRATTO UP'],
 ['Sky Madero - Sky Properties', 'Sky Madero'],
 ['Condominio Solo 206', 'Solo 206'],
 ['BARUC DOS - Av. San Martin', 'BARUC DOS'],
 ['CONDOMINIO ATRIUM', 'ATRIUM'],
 ['CONDOMINIO SKY LUMIERE', 'SKY LUMIERE'],
 // los que DEBEN descartarse
 ['Equipetrol', null], ['Zona Equipetrol', null], ['equipetrol sirari', null],
 ['Jazmines Nro 427 427', null], ['Equipetrol Calle 7 este s/n', null],
 ['Nor este Calle 9A Equipetrol sn', null], ['CALLE LAS BEGONIAS S/N', null],
];
let ok=0, mal=0;
for (const [inp, esp] of casos) {
  const got = nombreDesdeDireccion(inp);
  const bien = (got||'').toLowerCase() === (esp||'').toLowerCase();
  if (bien) ok++; else mal++;
  console.log(`${bien?'  ok':'FALLA'}  "${inp}"\n         → ${JSON.stringify(got)}${bien?'':`   esperado ${JSON.stringify(esp)}`}`);
}
console.log(`\n${ok} ok · ${mal} fallan`);
