// Audit matching para feed /alquileres.
// Mismo patrón que venta: si la prop tiene id_proyecto_master, verificar que
// algún alias del proyecto aparece en slug/title/desc del listing.
//
// CAVEAT alquiler: el matching alquiler está en construcción
// (ver docs/backlog/MATCHING_ALQUILER_PLAN.md, target 95%+ en Fase 3).
// Hoy muchas props no tienen id_proyecto_master asignado — eso NO es bug
// del matching de alquiler, es estado conocido. El audit reporta como
// 'no_disponible' cuando no hay nombre_edificio en BD.

// case-insensitive en la palabra clave (Edif/edif, Condominio/condominio, Torre/torre)
// pero case-sensitive en la captura del nombre (debe empezar con mayúscula).
// `\b` final en lookahead evita FP tipo "encontramos" matcheando "en" + "contramos".
const PATRONES_OTRO_EDIFICIO = [
  /(?:^|\s)[Ee]dif(?:icio)?\.?\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.&-]{2,40}?)(?=[\n,.;]|\s+(?:en|sobre|frente|cerca|equipetrol|ubicado|av|calle)\b)/g,
  /(?:^|\s)[Cc]ondominio\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.&-]{2,40}?)(?=[\n,.;]|\s+(?:en|sobre|frente|cerca|equipetrol|ubicado|av|calle)\b)/g,
  /(?:^|\s)[Tt]orre\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.&-]{2,40}?)(?=[\n,.;]|\s+(?:en|sobre|frente|cerca|equipetrol|ubicado|av|calle)\b)/g,
];

export function checkMatching(prop, scraped) {
  const aliasesNorm = (prop.aliases || [])
    .map(normalizeNombre)
    .filter((a) => a && a.length >= 4);

  if (aliasesNorm.length === 0) {
    return checkSinAliases(prop, scraped);
  }

  const slugNorm = normalizeNombre(slugFromUrl(prop.url || ''));
  const titleNorm = normalizeNombre(scraped.title_scraped || '');
  const descNorm = normalizeNombre(prop.descripcion_cruda || '');

  const matches = {
    slug: aliasesNorm.find((a) => slugNorm.includes(a)) || null,
    title: aliasesNorm.find((a) => titleNorm.includes(a)) || null,
    desc: aliasesNorm.find((a) => descNorm.includes(a)) || null,
  };

  const algunMatch = matches.slug || matches.title || matches.desc;

  if (algunMatch) {
    const otroEdif = detectarOtroEdificioEnDesc(prop.descripcion_cruda || '', aliasesNorm);
    if (otroEdif) {
      return {
        check: 'mismatch_real',
        severidad: 'alta',
        msg: `BD asigna "${prop.nombre_edificio}", pero la desc menciona "${otroEdif}" (posible matching errado)`,
        detalle: { aliases_buscados: prop.aliases, encontrado_en: matches, otro_edificio_detectado: otroEdif },
      };
    }
    return {
      check: 'ok',
      severidad: null,
      msg: `Edificio "${prop.nombre_edificio}" aparece en ${Object.keys(matches).filter((k) => matches[k]).join(',')}`,
    };
  }

  const otroEdif = detectarOtroEdificioEnDesc(prop.descripcion_cruda || '', aliasesNorm);
  if (otroEdif) {
    return {
      check: 'mismatch_real',
      severidad: 'alta',
      msg: `BD asigna "${prop.nombre_edificio}" (no aparece en slug/title/desc). Desc menciona "${otroEdif}"`,
      detalle: { aliases_buscados: prop.aliases, otro_edificio_detectado: otroEdif },
    };
  }

  return {
    check: 'no_disponible',
    severidad: 'media',
    msg: `Edificio "${prop.nombre_edificio}" asignado en BD pero no aparece en slug/title/desc del listing`,
    detalle: { aliases_buscados: prop.aliases },
  };
}

function checkSinAliases(prop, scraped) {
  const desc = prop.descripcion_cruda || '';
  const otrosEnDesc = extraerOtrosEdificiosMencionados(desc);
  if (otrosEnDesc.length > 0) {
    return {
      check: 'falta_en_bd',
      severidad: 'baja',
      msg: `BD sin nombre_edificio, pero desc menciona "${otrosEnDesc[0]}" (alquiler — matching aún en construcción, ver MATCHING_ALQUILER_PLAN.md)`,
      detalle: { edificios_en_desc: otrosEnDesc },
    };
  }
  return {
    check: 'ok',
    severidad: null,
    msg: 'Sin nombre_edificio en BD y sin mención clara en descripción',
  };
}

function detectarOtroEdificioEnDesc(desc, aliasesNormBd) {
  const otros = extraerOtrosEdificiosMencionados(desc);
  for (const otro of otros) {
    const otroNorm = normalizeNombre(otro);
    if (otroNorm.length < 4) continue;
    const matchAlguno = aliasesNormBd.some(
      (a) => a === otroNorm || a.includes(otroNorm) || otroNorm.includes(a)
    );
    if (!matchAlguno) return otro;
  }
  return null;
}

function extraerOtrosEdificiosMencionados(desc) {
  const matches = new Set();
  for (const re of PATRONES_OTRO_EDIFICIO) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(desc)) !== null) {
      const candidato = m[1].trim();
      if (candidato.length >= 3 && candidato.length <= 40) {
        matches.add(candidato);
      }
    }
  }
  return [...matches];
}

function slugFromUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/+|\/+$/g, '');
  } catch {
    return url;
  }
}

function normalizeNombre(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(condominio|edificio|edif|torre|residencia|residencial|departamento|depto|dto)\b/g, '')
    .replace(/\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, '')
    .replace(/\s+/g, '')
    .trim();
}
