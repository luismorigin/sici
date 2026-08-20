// ---------------------------------------------------------------------------
// filtrar-alias.mjs — el cargador filtra sus propios alias ANTES de proponerlos
// ---------------------------------------------------------------------------
// Por qué existe (medido 18/19/20-ago-2026): de 30 alias propuestos en tres noches,
// solo 15 servían. El resto ya estaba cargado o repetía el nombre oficial, y cada
// mañana había que cruzarlos a mano contra el catálogo antes de aplicarlos.
//
// Y uno era peor que ruido: el 20-ago el cargador propuso `pm 223 ← "Edificio Ónix"`
// derivado de un auto-match que ÉL MISMO había marcado como riesgoso (el aviso 8000978
// matcheó a 960 m del edificio equivocado). O sea: el error de la noche pidiendo quedar
// grabado en el catálogo, donde afectaría a todos los avisos futuros.
//
// 🔑 Este filtro NO decide por el humano: descarta lo que es demostrablemente inútil
// (ya cargado / redundante) y MARCA lo dudoso. Todo lo descartado se DECLARA en el log
// con su motivo — un filtro silencioso sería peor que no filtrar.
// ---------------------------------------------------------------------------

const PREFIJOS_GENERICOS = /^(edificio|condominio|cond\.?|torre|proyecto|residencial|residence[s]?)\s+/i;

/** lower + sin acentos + sin prefijo genérico + espacios colapsados */
export function nucleo(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(PREFIJOS_GENERICOS, '')
    .replace(/\s+/g, ' ');
}

/** igualdad laxa: mismo texto ignorando acentos, mayúsculas y espacios de más */
const igual = (a, b) => nucleo(a) === nucleo(b);

/**
 * @param {object} sb  cliente supabase
 * @param {Array<{pm:number, alias:string, edif:string, metodo?:string}>} sugeridos
 * @returns {{aplicables:Array, descartados:Array<{pm,alias,motivo,detalle}>}}
 */
export async function filtrarAliasSugeridos(sb, sugeridos) {
  if (!sugeridos?.length) return { aplicables: [], descartados: [] };

  // El catálogo entero de una: son ~600 filas y evita una consulta por alias.
  const { data: catalogo, error } = await sb
    .from('proyectos_master')
    .select('id_proyecto_master, nombre_oficial, alias_conocidos, activo');
  if (error) {
    // Sin catálogo NO se filtra: proponer de más es recuperable, descartar a ciegas no.
    console.log(`   ⚠️  No se pudo leer el catálogo para filtrar alias (${error.message}) — los propongo todos.`);
    return { aplicables: sugeridos, descartados: [] };
  }

  const porPm = new Map(catalogo.map((p) => [p.id_proyecto_master, p]));

  // Índice de núcleos para detectar ambigüedad: cuántos pm ACTIVOS distintos empiezan
  // por el mismo núcleo. "onix" es el núcleo de pm 223 (Condominio Onix) y también el
  // comienzo de pm 45 (Onix Art By EliTe) → un alias "Edificio Ónix" es ambiguo.
  const activos = catalogo.filter((p) => p.activo !== false);
  const pmsQueEmpiezanPor = (n) => {
    if (!n) return [];
    const out = new Set();
    for (const p of activos) {
      const cands = [p.nombre_oficial, ...(p.alias_conocidos || [])];
      if (cands.some((c) => { const k = nucleo(c); return k === n || k.startsWith(n + ' '); })) {
        out.add(p.id_proyecto_master);
      }
    }
    return [...out];
  };

  const aplicables = [], descartados = [];
  const vistos = new Set();   // dedup (pm, alias): la misma grafía viene una vez por propiedad

  for (const s of sugeridos) {
    const clave = `${s.pm}|${nucleo(s.alias)}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const pm = porPm.get(s.pm);
    if (!pm) { aplicables.push(s); continue; }   // pm desconocido: que lo mire el humano

    // 1) El match que lo originó era riesgoso → el alias hereda el error.
    if (s.metodo && s.metodo === 'nombre_unico_zona_dif') {
      descartados.push({ ...s, motivo: 'MATCH_RIESGOSO',
        detalle: `el auto-match que lo origino es "${s.metodo}" (nombre unico, zona distinta): si el match esta mal, el alias lo vuelve permanente` });
      continue;
    }
    // 2) Ya está cargado.
    if ((pm.alias_conocidos || []).some((a) => igual(a, s.alias))) {
      descartados.push({ ...s, motivo: 'YA_CARGADO', detalle: `"${s.alias}" ya esta en los alias de pm ${s.pm}` });
      continue;
    }
    // 3) Es el nombre oficial con otra grafía.
    if (igual(pm.nombre_oficial, s.alias)) {
      descartados.push({ ...s, motivo: 'REDUNDANTE', detalle: `es el nombre_oficial ("${pm.nombre_oficial}") con otra capitalizacion o prefijo` });
      continue;
    }
    // 4) Ambiguo: el núcleo lo comparten varios edificios del catálogo.
    const colisiones = pmsQueEmpiezanPor(nucleo(s.alias)).filter((id) => id !== s.pm);
    if (colisiones.length) {
      descartados.push({ ...s, motivo: 'AMBIGUO',
        detalle: `el nucleo "${nucleo(s.alias)}" tambien es de pm ${colisiones.join(', pm ')} — el alias haria caer todo aviso generico del mismo lado, en silencio` });
      continue;
    }
    aplicables.push(s);
  }
  return { aplicables, descartados };
}

/** Imprime lo descartado. Se llama SIEMPRE: un descarte invisible se lee como "no había nada". */
export function declararDescartes(descartados) {
  if (!descartados.length) return;
  console.log(`   🔎 ${descartados.length} alias NO propuestos (revisados contra el catálogo):`);
  for (const d of descartados) console.log(`      · pm ${d.pm} ← "${d.alias}"  [${d.motivo}] ${d.detalle}`);
}
