// Detector de DUPLICADOS en el feed (apart-hoteles + re-publicaciones).
// El detector de duplicados del pipeline NO los caza porque cada aviso tiene
// codigo_propiedad único. Acá agrupamos por nombre+precio+área y, dentro de cada
// grupo, comparamos DESCRIPCIONES: sim >=90% = duplicado real (mismo aviso
// replicado); descripciones distintas = unidades legítimas del mismo edificio.
// Read-only: devuelve clusters para que el humano decida y arme el SQL duplicado_de.
import { compararDescripciones } from './similarity.mjs';

const SIM_DUP = 90; // umbral de similitud de descripción para considerar duplicado

// props: [{ id, nombre_edificio, precio, area, descripcion }]
// Devuelve clusters: [{ key, sobreviviente, duplicados:[ids], n, ejemplo }]
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
    const ordenados = [...items].sort((a, b) => a.id - b.id);
    const usados = new Set();
    for (let i = 0; i < ordenados.length; i++) {
      const base = ordenados[i];
      if (usados.has(base.id)) continue;
      const dups = [];
      for (let j = i + 1; j < ordenados.length; j++) {
        const otro = ordenados[j];
        if (usados.has(otro.id)) continue;
        const sim = compararDescripciones(base.descripcion || '', otro.descripcion || '').similitud_pct;
        // sim alta = mismo aviso. Si ambas crudas vacías, caen por nombre+precio+área igual.
        const ambasVacias = !(base.descripcion || '').trim() && !(otro.descripcion || '').trim();
        if (sim >= SIM_DUP || ambasVacias) {
          dups.push(otro.id);
          usados.add(otro.id);
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
