// Canonicalización de amenidades + equipamiento (compartido venta + alquiler).
// Colapsa variantes/acentos/plurales a la clave canónica y re-buckea (canónico vs cola).
// Determinístico → los buckets quedan limpios sin depender de cómo escriba el LLM.
// v1 (13-jul-2026): + Microondas + TV/Smart TV al canónico de equipamiento (decisión founder).

// ── Vocabulario canónico ──
export const AMEN_CANON = new Set([
  'Piscina', 'Churrasquera', 'Sauna/Jacuzzi', 'Gimnasio', 'Estacionamiento para Visitas',
  'Pet Friendly', 'Salón de Eventos', 'Co-working', 'Parque Infantil', 'Jardín',
]);
export const EQ_CANON = new Set([
  'Cocina equipada', 'Heladera', 'Lavadora', 'Secadora', 'Termotanque/Calefón', 'Aire acondicionado',
  'Microondas', 'TV/Smart TV',                                   // ← v1: agregados (electrodomésticos que el inquilino busca)
  'Roperos/Closets', 'Vestidor', 'Balcón', 'Terraza propia', 'Cuarto de servicio', 'Box de baño',
  'Chapa digital', 'Domótica', 'Video portero',
]);

// normalizar para comparar: minúsculas, sin acentos, sin plural simple, trim
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/s\b/g, '').replace(/\s+/g, ' ').trim();

// ── Mapa de variantes → canónico (clave = norm(variante)) ──
const V = {};
const add = (canon, ...vars) => { for (const v of vars) V[norm(v)] = canon; V[norm(canon)] = canon; };
// amenidades
add('Co-working', 'coworking', 'cowork', 'co work', 'espacio cowork', 'sala de coworking');
add('Churrasquera', 'churrasqueras', 'parrilla', 'parrillas', 'quincho', 'asador', 'barbacoa');
add('Sauna/Jacuzzi', 'sauna', 'jacuzzi', 'sauna seco', 'sauna humedo', 'hidromasaje');
add('Salón de Eventos', 'salon de eventos', 'salon eventos', 'salon de fiestas', 'salon multiuso', 'salon de uso multiple', 'sum');
add('Piscina', 'pileta', 'pool', 'piscina climatizada', 'piscina 360');
add('Gimnasio', 'gym', 'gimnasio equipado');
add('Estacionamiento para Visitas', 'parqueo de visitas', 'estacionamiento visitas', 'parqueo visitas');
add('Parque Infantil', 'juegos infantiles', 'area de juegos infantiles', 'playground');
add('Pet Friendly', 'pet friendly', 'pet zone');
add('Jardín', 'jardin', 'jardines', 'area verde');
// equipamiento — electrodomésticos
add('Cocina equipada', 'cocina equipada', 'cocina integrada', 'cocina encimera', 'encimera', 'horno', 'horno electrico', 'horno empotrado', 'campana extractora', 'extractor', 'extractora', 'extractor de cocina', 'hornalla', 'meson', 'menaje de cocina', 'vajilla', 'cocina amoblada', 'cocina americana');
add('Heladera', 'refrigerador', 'refrigeradora', 'frigobar', 'nevera');
add('Lavadora', 'lavarropa', 'lavarropas');
add('Secadora', 'secarropa');
add('Termotanque/Calefón', 'termotanque', 'calefon', 'calefon a gas', 'calentador de agua', 'boiler');
add('Aire acondicionado', 'ac', 'aire acond', 'aire inverter', 'split', 'aires acondicionados');
add('Microondas', 'microondas', 'micro ondas', 'horno microondas');
add('TV/Smart TV', 'tv', 'television', 'televisor', 'smart tv', 'smart-tv', 'tele');
// equipamiento — almacenamiento/espacios/seguridad
add('Roperos/Closets', 'ropero', 'roperos', 'closet', 'closets', 'ropero empotrado', 'placard', 'placares');
add('Vestidor', 'vestidor', 'walk in closet');
add('Balcón', 'balcon', 'balcones');
add('Terraza propia', 'terraza propia', 'terraza privada');
add('Cuarto de servicio', 'cuarto de servicio', 'dormitorio de servicio', 'baño de servicio');
add('Box de baño', 'box de bano', 'box de ducha', 'box');
add('Chapa digital', 'chapa digital', 'cerradura digital', 'cerradura inteligente');
add('Domótica', 'domotica', 'casa inteligente', 'smart home');
add('Video portero', 'video portero', 'portero visor', 'videoportero');

// muebles sueltos → NO son equipamiento (se sacan; el flag amoblado los cubre)
const MUEBLE = new Set(['sofa cama', 'sofa', 'cama', 'mesa', 'silla', 'escritorio', 'tocador', 'velador', 'comoda', 'juego de living', 'sofa-cama']);

// devuelve la clave canónica de un ítem, o null si no mapea a ninguna
const canonAmen = (x) => { const c = V[norm(x)]; return c && AMEN_CANON.has(c) ? c : null; };
const canonEq = (x) => { const c = V[norm(x)]; return c && EQ_CANON.has(c) ? c : null; };
const esMueble = (x) => MUEBLE.has(norm(x));

// ── Re-bucketing: toma los 4 baldes crudos y devuelve los 4 canonicalizados ──
// amen (lista de diferenciadores), amenExtra (cola edificio), eq (equip unidad), eqOtros (cola unidad)
export function reBucket({ amen = [], amenExtra = [], eq = [], eqOtros = [] }) {
  const A = new Set(), AX = new Set(), E = new Set(), EO = new Set();
  // amenidades (de lista + extra): canónica → A, sino → AX
  for (const x of [...amen, ...amenExtra]) { if (!x) continue; const c = canonAmen(x); if (c) A.add(c); else AX.add(x); }
  // equipamiento (de canónico + otros): mueble → descartar; canónica → E; sino → EO
  for (const x of [...eq, ...eqOtros]) { if (!x) continue; if (esMueble(x)) continue; const c = canonEq(x); if (c) E.add(c); else EO.add(x); }
  return { amen: [...A], amenExtra: [...AX], eq: [...E], eqOtros: [...EO] };
}
