// ============================================================================
// Clasificador de USO de inmueble para casas en ALQUILER: residencial | mixto | comercial
// ----------------------------------------------------------------------------
// Señal primaria = dormitorios en el TEXTO de la descripción (el campo estructurado
// `recamaras` viene NULL en casas C21). Capa 1 (regex) clasifica lo CLARO y marca
// `a_agente` los ambiguos (mixto, sin señal, posible depto) para que la capa 2
// (agente-lector / juez LLM) los resuelva LEYENDO — nunca el regex decide los dudosos.
// Reusable por el futuro cron de alquiler de casas ZN.
// ============================================================================

// Conteo de dormitorios SIN inflar con suites: cuenta dormitorio/habitación/recámara.
// Las suites NO se suman (son un subconjunto: "5 dormitorios (3 suites)" = 5, no 8).
// Si no hay dorms contados pero sí "(N suites)", usa las suites como fallback.
// Conservador: prefiere subestimar antes que inflar.
export function dormsDelTexto(desc) {
  if (!desc) return { n: 0, presencia: false };
  let n = 0, m;
  const reDorm = /(\d+)\s*(?:dormitorios?|habitaci[oó]n(?:es)?|rec[aá]maras?)/gi;
  while ((m = reDorm.exec(desc)) !== null) n += Number(m[1]) || 0;
  if (n === 0) { const s = desc.match(/(\d+)\s*suites?/i); if (s) n = Number(s[1]) || 0; }
  const presencia = n > 0 || /dormitorio|habitaci[oó]n|suite|rec[aá]mara|monoambiente|mono\s?ambiente/i.test(desc);
  return { n, presencia };
}

// Señal COMERCIAL: lista de usos empresariales / promoción a negocio.
const RE_USO_COMERCIAL = /oficina|cl[ií]nica|consultorio|coworking|log[ií]stic|gal[pó]on|local comercial|centro m[eé]dico|instituci[oó]n educativa|academia|gastron[oó]mic|uso comercial|para empresas?|para negocio|todo tipo de negocio|proyecto comercial|administrativ|visibilidad de marca|alto tr[aá]fico|adecuaciones seg[uú]n/i;

// Señal de DEPTO colado (C21 a veces mete deptos en tipo_casa). NO excluye: marca para el agente.
// "casa CON departamento independiente" es casa real → solo dispara cuando el título/slug
// ARRANCA en departamento (no una mención en medio del texto).
const RE_DEPTO_INICIO = /^\s*(?:departamento|depto|dpto)\b/i;

// titulo: opcional (ej. slug de la URL). Si no se pasa, se evalúa el inicio de la descripción.
export function clasificarUso({ descripcion, titulo = '' } = {}) {
  const desc = descripcion || '';
  const { n, presencia } = dormsDelTexto(desc);
  const comercial = RE_USO_COMERCIAL.test(desc);
  const posibleDepto = RE_DEPTO_INICIO.test(titulo) || RE_DEPTO_INICIO.test(desc);

  let clase, motivo, a_agente = false;
  if (presencia && comercial) { clase = 'mixto'; motivo = `vivienda (${n || '≥1'} dorm) PERO promocionada uso comercial`; a_agente = true; }
  else if (presencia && !comercial) { clase = 'residencial'; motivo = `${n || '≥1'} dorm en texto, sin pitch comercial`; }
  else if (!presencia && comercial) { clase = 'comercial'; motivo = '0 dorm en texto + usos empresariales'; }
  else { clase = 'revisar'; motivo = 'sin dorms en texto y sin pitch comercial → ambiguo'; a_agente = true; }

  if (posibleDepto) { motivo += ' · ⚠️ título arranca en DEPARTAMENTO (¿es casa?)'; a_agente = true; }
  return { clase, motivo, dorms_texto: n, posible_depto: posibleDepto, a_agente };
}
