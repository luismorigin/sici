#!/usr/bin/env node
// ============================================================================
// ¿El seguimiento de shortlists sirvió?  (migs 338/339, encendido 26-ago-2026)
// ----------------------------------------------------------------------------
//   node scripts/deptos-equipetrol/medir-seguimiento-shortlists.mjs
//
// 🔴 EL 19% DEL PEDIDO ORIGINAL NO ES LA LÍNEA DE BASE DE ESTO.
// El pedido de lab-kapso decía "solo el 19% pide una segunda shortlist (9 de 48)".
// Medido el 26-ago sobre 55 personas, ese número cuenta CUALQUIER segunda
// shortlist — incluidas las que el bot armó minutos después dentro de la MISMA
// conversación. Eso no es "el cliente volvió a pedir": es la misma sesión.
//
//        sin mirar cuándo   10/55   18,2%   <- el numero del pedido
//        pasada 1 hora       5/55    9,1%
//        pasadas 6 horas     4/55    7,3%
//        pasado un dia       3/55    5,5%   <- el fenomeno que el seguimiento ataca
//
// Medir el éxito contra el 19% haría concluir que fracasó aunque funcione: nunca
// va a superar una base que incluye eventos que no son el fenómeno. Por eso este
// script imprime LAS CUATRO definiciones y no elige por vos.
//
// 🔑 CON ESTE VOLUMEN NO HAY VEREDICTO RÁPIDO. A ~4 shortlists/día, la diferencia
// entre 5% y 10% sobre n=50 no se distingue del ruido. Este script no va a poder
// decir "funcionó" en dos semanas. Lo que sí sirve desde el primer día es lo
// cualitativo: QUÉ contesta la gente, que se imprime al final.
//
// ----------------------------------------------------------------------------
// DOS TRAMPAS QUE YA MORDIERON (26-ago, primera corrida de este script)
//
// a) ARTEFACTOS DE PRUEBA. `marcar_seguimiento_shortlist()` marca TODAS las
//    hermanas del mismo teléfono — por diseño, para que nadie reciba dos mensajes.
//    Efecto lateral: al probar con el número del founder quedaron marcadas 13
//    shortlists suyas, algunas de MAYO. El script contaba 4 personas "con
//    seguimiento" cuando las reales eran 2. Se detectan solas: una persona real
//    recibe el mensaje entre 9 y 22 h después de SU shortlist, así que una marca
//    mucho más vieja que eso sólo puede venir del marcado de hermanas.
//
// b) LA VENTANA, corregida DOS veces — y la segunda la delató la evidencia.
//    · v1 medía "volvió a escribir" desde la PRIMERA shortlist en la línea de base
//      (43,1%) y desde el SEGUIMIENTO en el otro grupo (25%). No se comparan: el
//      primero incluye toda la conversación natural que sigue a recibir una
//      selección.
//    · v2 midió +9h..+57h desde la última shortlist para ambos. Comparable, pero
//      MAL: el seguimiento no llega a las +9 h exactas, llega en la primera corrida
//      en franja, que puede ser a las +15 h. Todo lo que la persona escribió en el
//      medio se le atribuía al mensaje. Se cayó solo — el porcentaje decía "1 de 2
//      volvió a escribir" y los textos de abajo mostraban a las dos sin responder.
//    · v3 (esta): 48 h DESDE EL MOMENTO DEL MENSAJE. Real para quien lo recibió;
//      para la línea de base, el momento en que le habría llegado (shortlist +9 h).
//    🔑 Que el script imprima los textos al lado de los porcentajes es lo que hizo
//    visible el error. Un número solo no se habría contradicho con nada.
//
// ⚠️ LO QUE ESTE SCRIPT NO PUEDE VER SOLO: al founder probando con una shortlist
// FRESCA. Ese caso es indistinguible de un cliente real y ninguna heurística lo
// resuelve sin adivinar. Va por configuración: poné en simon-mvp/.env.local
//
//     SEGUIMIENTO_TELEFONOS_TEST=76308808
//
// Van los 8 dígitos del número, SIN el 591 y sin el +: se compara por los últimos
// 8, así que una sola entrada captura las tres formas en que el mismo teléfono
// quedó guardado. Varios números se separan con coma.
//
// Sin esa variable el script corre igual y avisa que no está excluyendo a nadie.
// No se hardcodean teléfonos acá: es dato personal y el repo es compartido.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(raiz, 'simon-mvp', '.env.local') });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
                        process.env.SUPABASE_SERVICE_ROLE_KEY,
                        { auth: { persistSession: false } });

const H = 3600e3;
// 🔑 Se compara por los ÚLTIMOS 8 DÍGITOS, que en Bolivia son el número real sin
// prefijo. El mismo teléfono aparece en la tabla en varias formas —con `+591`, con
// `591`, y a secas— y cada una es una fila distinta del GROUP BY: el founder tenía
// TRES. Comparar el string completo obligaría a enumerar las variantes y acertarle
// al formato; con los últimos 8 alcanza con poner el número una vez.
const clave = (t) => String(t || '').replace(/\D/g, '').slice(-8);
const TEST = new Set((process.env.SEGUIMIENTO_TELEFONOS_TEST || '')
  .split(',').map(clave).filter((x) => x.length === 8));
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '—');

const { data: sls, error } = await sb.from('broker_shortlists')
  .select('cliente_telefono,cliente_nombre,created_at,seguimiento_enviado_at')
  .eq('broker_slug', 'simon-asistente')
  .not('cliente_telefono', 'is', null)
  .order('created_at');
if (error) { console.error('no se pudo leer broker_shortlists:', error.message); process.exit(1); }

const porTel = new Map();
for (const s of sls) {
  const k = s.cliente_telefono;
  if (!porTel.has(k)) porTel.set(k, []);
  porTel.get(k).push(s);
}

const filas = [];
for (const [tel, lista] of porTel) {
  const p1 = new Date(lista[0].created_at);
  // La MÁS RECIENTE es la que toma la función SQL (DISTINCT ON ... ORDER BY DESC).
  const ultima = new Date(lista[lista.length - 1].created_at);
  const otra = (h) => lista.some((s) => new Date(s.created_at) > new Date(p1.getTime() + h * H));

  const marca = lista.find((s) => s.seguimiento_enviado_at)?.seguimiento_enviado_at ?? null;
  const artefacto = marca !== null && (new Date(marca) - ultima) > 24 * H;
  const esTest = TEST.has(clave(tel));

  filas.push({
    tel, nombre: lista[0].cliente_nombre, p1, ultima, n: lista.length,
    artefacto, esTest,
    seguimiento: artefacto ? null : marca,
    o0: lista.length >= 2, o1: otra(1), o6: otra(6), o24: otra(24),
  });
}

// ¿Volvió a escribirle al bot DESPUÉS de que el mensaje llegó — o habría llegado?
//
// 🔴 LA VENTANA ARRANCA EN EL MENSAJE, NO EN LA SHORTLIST. La versión anterior
// medía desde la shortlist +9 h para los dos grupos, buscando que fueran
// comparables. Pero el seguimiento no llega a las +9 h exactas: llega en la
// primera corrida en franja, que puede ser a las +15 h. Todo lo que la persona
// escribió en el medio se contaba como si fuera respuesta al mensaje. Se notó
// porque el porcentaje decía "1 de 2 volvió a escribir" y los textos de abajo
// mostraban a las dos sin responder: el número se contradecía con la evidencia.
//
// Ahora ambos grupos miden 48 h DESDE EL MOMENTO DEL MENSAJE. Para quien lo
// recibió, ese momento es el real. Para la línea de base es el momento en que le
// habría llegado (la shortlist +9 h, el mínimo de la función). Sigue siendo
// comparable, y ya no le atribuye al seguimiento nada anterior a él.
for (const f of filas) {
  const desde = f.seguimiento ? new Date(f.seguimiento).getTime()
                              : f.ultima.getTime() + 9 * H;
  const { count } = await sb.from('simon_mensajes')
    .select('id', { count: 'exact', head: true })
    .eq('telefono', f.tel).eq('direccion', 'in')
    .gt('created_at', new Date(desde).toISOString())
    .lt('created_at', new Date(desde + 48 * H).toISOString());
  f.escribio = (count ?? 0) > 0;
}

const vivos  = filas.filter((f) => !f.esTest);
const conSeg = vivos.filter((f) => f.seguimiento);
const sinSeg = vivos.filter((f) => !f.seguimiento);
const artef  = filas.filter((f) => f.artefacto && !f.esTest);
const tests  = filas.filter((f) => f.esTest);

const linea = (etiqueta, cuantos, total, nota) =>
  '   ' + etiqueta.padEnd(30) + String(cuantos).padStart(3) + '   ' +
  pct(cuantos, total).padStart(6) + (nota ? '   ' + nota : '');

function bloque(titulo, g) {
  if (!g.length) { console.log('\n' + titulo + ': todavía nadie\n'); return; }
  console.log('\n' + titulo + ' — ' + g.length + ' persona(s)');
  console.log(linea('pidió otra, sin mirar cuándo', g.filter((f) => f.o0).length, g.length, '<- definición del pedido (infla)'));
  console.log(linea('pidió otra pasada 1 hora',     g.filter((f) => f.o1).length, g.length));
  console.log(linea('pidió otra pasadas 6 horas',   g.filter((f) => f.o6).length, g.length));
  console.log(linea('pidió otra pasado un día',     g.filter((f) => f.o24).length, g.length, '<- el fenómeno real'));
  console.log(linea('volvió a escribir (48h)',  g.filter((f) => f.escribio).length, g.length));
}

console.log('='.repeat(78));
console.log('SEGUIMIENTO DE SHORTLISTS — medición');
console.log('Cron encendido 26-ago-2026 13:35 Bolivia · ' + sls.length + ' shortlists · ' + filas.length + ' personas');
console.log('='.repeat(78));

if (!TEST.size) {
  console.log('\n⚠️  SEGUIMIENTO_TELEFONOS_TEST no está configurada: no se excluye a nadie.');
  console.log('    Las pruebas del founder van a aparecer mezcladas con clientes reales.');
} else {
  console.log('\n🧪 ' + tests.length + ' persona(s) excluida(s) por SEGUIMIENTO_TELEFONOS_TEST.');
}

if (artef.length) {
  console.log('\n🧪 ' + artef.length + ' persona(s) fuera del grupo CON seguimiento: figuran marcadas,');
  console.log('   pero su última shortlist es mucho más vieja que la ventana de 22 h. Son');
  console.log('   hermanas marcadas en pruebas, no mensajes que alguien haya recibido.');
  for (const a of artef) console.log('      · ' + (a.nombre || '(sin nombre)') + ' — ' + a.n + ' shortlist(s)');
}

bloque('SIN seguimiento (línea de base)', sinSeg);
bloque('CON seguimiento (desde que se encendió)', conSeg);

if (conSeg.length && conSeg.length < 30) {
  console.log('\n⚠️  ' + conSeg.length + ' persona(s) con seguimiento: MUY POCO para comparar porcentajes.');
  console.log('    A ~4 shortlists/día hacen falta ~2-3 meses para distinguir señal de ruido.');
  console.log('    Hasta entonces, leer los textos de abajo — no los porcentajes de arriba.');
}

if (conSeg.length) {
  console.log('\n' + '='.repeat(78));
  console.log('QUÉ CONTESTARON (lo único legible con este volumen)');
  console.log('='.repeat(78));
  for (const f of conSeg) {
    const { data: msgs } = await sb.from('simon_mensajes')
      .select('direccion,texto,created_at').eq('telefono', f.tel)
      .gte('created_at', f.seguimiento).order('created_at').limit(6);
    const cuando = new Date(f.seguimiento).toISOString().slice(5, 16).replace('T', ' ');
    console.log('\n▸ ' + (f.nombre || '(sin nombre)') + ' · seguimiento ' + cuando + ' UTC');
    if (!msgs || !msgs.length) { console.log('   (todavía sin respuesta)'); continue; }
    for (const m of msgs) {
      const quien = m.direccion === 'out' ? 'Simón' : '  →  ';
      console.log('   ' + quien + '  ' + String(m.texto || '').replace(/\s+/g, ' ').slice(0, 140));
    }
  }
}
console.log('');
