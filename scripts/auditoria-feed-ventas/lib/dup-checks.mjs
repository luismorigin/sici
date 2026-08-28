// Detector de DUPLICADOS en el feed (apart-hoteles + re-publicaciones).
// El detector de duplicados del pipeline NO los caza porque cada aviso tiene
// codigo_propiedad único. Acá agrupamos por nombre+precio+área y, dentro de cada
// grupo, comparamos DESCRIPCIONES: sim >=90% = duplicado real (mismo aviso
// replicado); descripciones distintas = unidades legítimas del mismo edificio.
// Read-only: devuelve clusters para que el humano decida y arme el SQL duplicado_de.
import { compararDescripciones } from './similarity.mjs';

const SIM_DUP = 90; // umbral de similitud de descripción para considerar duplicado

// CLAVE FUERTE (2-ago-2026) — cuando el propio grupo ya prueba que es la misma unidad,
// la descripción deja de mandar. Caso: Macororó 18, avisos C21 115006 y 115010 — mismo
// edificio, **mismo PISO declarado (13)**, misma superficie (42,5 m²), mismo precio
// ($75.000) y misma `fecha_publicacion`. Es el mismo departamento publicado dos veces,
// pero el captador escribió DOS TEXTOS distintos (475 y 455 caracteres) → la similitud
// no llega a 90 y se escapaba.
//
// 🔑 Lo que habilita la regla es el PISO DECLARADO, no la coincidencia de precio/área.
// Dos unidades del mismo modelo comparten precio y superficie por construcción (K1,
// Sky Equinox), y ahí el detector debe callarse. Pero si los DOS avisos declaran el
// mismo piso del mismo edificio con la misma superficie, ya no son dos unidades: es una.
// Por eso `clave_fuerte` la setea el caller SOLO cuando el aviso trae `piso` explícito;
// con piso null (comodín) el comportamiento no cambia y sigue mandando la descripción.
//
// props: [{ id, nombre_edificio, precio, area, descripcion, clave_fuerte?, ausente? }]
//   · `clave_fuerte`: true si la clave del grupo incluye una señal que identifica la
//     UNIDAD (hoy: el piso declarado). Opcional — los callers que no la pasan mantienen
//     el comportamiento previo, byte por byte.
//   · `ausente`: true si el aviso YA NO ESTÁ en el portal (`primera_ausencia_at` seteado).
//     Solo decide QUIÉN SOBREVIVE dentro de un cluster ya formado — no agrupa ni desagrupa
//     nada. Opcional, con la misma promesa: sin el campo, el orden es el de antes.
//
// 🔴 SOBREVIVIENTE (28-ago-2026) — antes era SIEMPRE el id más bajo, o sea el aviso MÁS
// VIEJO. En una republicación el viejo es justamente el que se está muriendo: el 28-ago el
// audit propuso tres dedups y en los TRES el sobreviviente estaba invertido (Uptown Drei
// 187←8001130, Altamura 2044←8001144, Mare 8000098←8000800; los dos primeros con
// `primera_ausencia_at` seteado ESE MISMO DÍA por el verificador).
// 🔑 El síntoma es traicionero: aplicar la propuesta tal cual **saca del feed el aviso VIVO
// y deja publicado el muerto**. En Uptown el departamento desaparecía entero, porque el
// viejo ya estaba fuera del feed por antigüedad, y ningún número lo delataba.
// ⚠️ Esto NO cubre el otro efecto: quedarse con el nuevo RESETEA la antigüedad (es para lo
// que el portal recrea el aviso). Al aplicar hay que arrastrar `fecha_publicacion` del viejo
// al sobreviviente y bloquearla. Ver docs/backlog/CALIDAD_DATOS_BACKLOG.md.
// Devuelve clusters: [{ key, sobreviviente, duplicados:[ids], n, ejemplo, por_clave_fuerte }]
export function detectarDuplicados(props) {
  // 1) agrupar por nombre normalizado + precio + área (candidatos)
  const grupos = new Map();
  for (const p of props) {
    if (!p.nombre_edificio) continue;
    const key = [
      normNombre(p.nombre_edificio),
      Math.round(p.precio || 0),
      Math.round((p.area || 0) * 10) / 10,
    ].join('|');
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(p);
  }

  // 2) dentro de cada grupo con >=2, clusterizar por descripción similar
  const clusters = [];
  for (const [key, items] of grupos) {
    if (items.length < 2) continue;
    // Los ausentes del portal van al FINAL: dentro de un cluster, el sobreviviente es el
    // primero de esta lista. Con `ausente` indefinido en todas, la resta da 0 y el orden
    // colapsa al de antes (id ascendente) — byte por byte.
    const ordenados = [...items].sort((a, b) =>
      ((a.ausente === true) - (b.ausente === true)) || (a.id - b.id));
    const usados = new Set();
    for (let i = 0; i < ordenados.length; i++) {
      const base = ordenados[i];
      if (usados.has(base.id)) continue;
      const dups = [];
      let porClaveFuerte = false;
      for (let j = i + 1; j < ordenados.length; j++) {
        const otro = ordenados[j];
        if (usados.has(otro.id)) continue;
        const sim = compararDescripciones(base.descripcion || '', otro.descripcion || '').similitud_pct;
        // sim alta = mismo aviso. Si ambas crudas vacías, caen por nombre+precio+área igual.
        const ambasVacias = !(base.descripcion || '').trim() && !(otro.descripcion || '').trim();
        // clave fuerte: los DOS declaran la misma unidad (piso explícito) → el texto no salva.
        const claveFuerte = base.clave_fuerte === true && otro.clave_fuerte === true;
        if (sim >= SIM_DUP || ambasVacias || claveFuerte) {
          dups.push(otro.id);
          usados.add(otro.id);
          if (claveFuerte && sim < SIM_DUP && !ambasVacias) porClaveFuerte = true;
        }
      }
      if (dups.length > 0) {
        usados.add(base.id);
        clusters.push({
          key,
          nombre_edificio: base.nombre_edificio,
          precio: base.precio,
          area: base.area,
          sobreviviente: base.id,
          duplicados: dups,
          n: dups.length + 1,
          ejemplo: (base.descripcion || '').replace(/\s+/g, ' ').slice(0, 100),
          // true = entró por clave fuerte con textos DISTINTOS. Se declara para que el
          // humano sepa que acá el criterio no fue la descripción, sino piso+área+precio.
          por_clave_fuerte: porClaveFuerte,
        });
      }
    }
  }
  return clusters.sort((a, b) => b.n - a.n);
}

function normNombre(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(edificio|edif|condominio|torre|residencia|residencial)\b/g, '')
    .replace(/\s+/g, '')
    .trim();
}
