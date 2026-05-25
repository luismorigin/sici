// Audit interno SQL para feed /alquileres.
// Diferencias clave vs venta:
// - SIN TC paralelo (alquiler usa precio_mensual_bob como fuente de verdad,
//   precio_mensual_usd derivado por TC oficial /6.96)
// - SIN check de "tipo_cambio_detectado" (no aplica a alquiler)
// - Check precio: comparar precio_mensual_bob BD vs precio que aparece en desc
// - Check área (v1.4): comparar area_total_m2 BD vs área que aparece en desc
//   (cierra hueco compartido con el semanal: extractor toma m² distinto al de la cruda)
// - Check edificio: igual que venta (busca otros edificios mencionados)
// - Check desync contenido↔enrichment: igual que venta

const PATRONES_PRECIO_BS = [
  /(?:bs|bolivianos?)\.?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,5})/gi,
  /(\d{1,3}(?:[.,]\d{3})+|\d{4,5})\s*(?:bs|bolivianos?)\b/gi,
  /💰[^.\n]{0,40}?(\d{1,3}(?:[.,]\d{3})+|\d{4,5})/gi,
];

const PATRONES_PRECIO_USD = [
  /(?:\$\s?us?\.?|usd?)\s*(\d{2,5})/gi,
  /(\d{2,5})\s*\$\s?us\b/gi,
];

// Área: exigir "m2"/"m²" o "superficie ... m" para evitar capturar distancias
// ("a 200 metros del anillo") o pisos. Rango válido depto: 15-800 m².
// NOTA: sin \b tras el (2|²) — "²" no es carácter de palabra, así que \b fallaba
// justo con el superíndice "m²" (el formato más común en las crudas).
const PATRONES_AREA = [
  /(\d{2,4}(?:[.,]\d{1,2})?)\s*m\s?(?:2|²)/gi,
  /(?:superficie|área|area)\s*:?\s*(?:de\s+)?(\d{2,4}(?:[.,]\d{1,2})?)\s*m/gi,
];

// case-insensitive en la palabra clave (Edif/edif, Condominio/condominio, Torre/torre)
// pero case-sensitive en la captura del nombre (debe empezar con mayúscula).
// `\b` final en lookahead evita FP tipo "encontramos" matcheando "en" + "contramos".
const PATRONES_OTRO_EDIFICIO = [
  /(?:^|\s)[Ee]dif(?:icio)?\.?\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.&-]{2,40}?)(?=[\n,.;]|\s+(?:en|sobre|frente|cerca|equipetrol|ubicado)\b)/g,
  /(?:^|\s)[Cc]ondominio\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.&-]{2,40}?)(?=[\n,.;]|\s+(?:en|sobre|frente|cerca|equipetrol|ubicado)\b)/g,
  /(?:^|\s)[Tt]orre\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.&-]{2,40}?)(?=[\n,.;]|\s+(?:en|sobre|frente|cerca|equipetrol|ubicado)\b)/g,
];

const TC_OFICIAL = 6.96;

export function runChecks(prop) {
  const issues = [];
  const desc = prop.descripcion_cruda || '';

  if (!desc) {
    issues.push({
      tipo: 'descripcion_cruda_vacia',
      severidad: 'baja',
      msg: 'datos_json_enrichment.descripcion vacía — backfill pendiente o enrichment falló',
    });
    return issues;
  }

  const issuePrecio = checkPrecioMensualVsDesc(desc, prop.precio_mensual_bob);
  if (issuePrecio) issues.push(issuePrecio);

  const issueArea = checkAreaVsDesc(desc, prop.area_total_m2);
  if (issueArea) issues.push(issueArea);

  const issueEdificio = checkOtroEdificioMencionado(desc, prop.nombre_edificio);
  if (issueEdificio) issues.push(issueEdificio);

  return issues;
}

function checkPrecioMensualVsDesc(desc, precioBobBd) {
  if (!precioBobBd || precioBobBd <= 0) return null;
  const preciosBs = extraerPreciosBs(desc);
  const preciosUsd = extraerPreciosUsd(desc);

  // Convertir USD a BOB (TC oficial) para comparar en moneda común.
  const preciosNorm = [
    ...preciosBs,
    ...preciosUsd.map((u) => Math.round(u * TC_OFICIAL)),
  ];
  if (preciosNorm.length === 0) return null;

  // Tomar el precio principal: el más cercano al BD (heurística defensiva,
  // los listings de alquiler suelen mencionar varios precios — expensas, depósito).
  const candidato = preciosNorm.reduce((best, p) =>
    Math.abs(p - precioBobBd) < Math.abs(best - precioBobBd) ? p : best
  );
  const diffPct = Math.abs(candidato - precioBobBd) / precioBobBd;

  if (diffPct < 0.05) return null;

  return {
    tipo: 'precio_mensual_mismatch_desc',
    severidad: diffPct > 0.20 ? 'alta' : 'media',
    msg: `BD=Bs ${precioBobBd}, desc principal=Bs ${candidato} (diff ${(diffPct * 100).toFixed(1)}%)`,
    detalle: { precio_bd_bob: precioBobBd, precio_desc_principal_bob: candidato, todos_precios_norm: preciosNorm },
  };
}

function checkAreaVsDesc(desc, areaBd) {
  const area = parseFloat(areaBd) || 0;
  if (area <= 0) return null;
  const areas = extraerAreas(desc);
  if (areas.length === 0) return null;

  // Heurística defensiva (igual que precio): tomar el área más cercana al BD.
  // Las crudas a veces mencionan varias (balcón, terraza, total) — el más cercano
  // evita FP. Solo flagea si AUN el más cercano difiere del BD.
  const candidato = areas.reduce((best, a) =>
    Math.abs(a - area) < Math.abs(best - area) ? a : best
  );
  const diffPct = Math.abs(candidato - area) / area;

  if (diffPct < 0.10) return null; // tolera redondeos (38 vs 37.92)

  return {
    tipo: 'area_mismatch_desc',
    severidad: diffPct > 0.25 ? 'media' : 'baja',
    msg: `BD=${area}m², desc principal=${candidato}m² (diff ${(diffPct * 100).toFixed(1)}%)`,
    detalle: { area_bd: area, area_desc_principal: candidato, todas_areas: areas },
  };
}

function extraerAreas(desc) {
  const matches = new Set();
  for (const re of PATRONES_AREA) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(desc)) !== null) {
      const num = parseNumeroEsp(m[1]);
      if (num >= 15 && num <= 800) matches.add(num);
    }
  }
  return [...matches];
}

function checkOtroEdificioMencionado(desc, edificioBd) {
  if (!edificioBd) return null;
  const edificioBdNorm = normalizar(edificioBd);
  if (edificioBdNorm.length < 4) return null;

  const otrosNombres = extraerOtrosEdificiosMencionados(desc);
  if (otrosNombres.length === 0) return null;

  for (const otro of otrosNombres) {
    const otroNorm = normalizar(otro);
    if (otroNorm.length < 4) continue;
    if (otroNorm === edificioBdNorm) continue;
    if (otroNorm.includes(edificioBdNorm) || edificioBdNorm.includes(otroNorm)) continue;
    return {
      tipo: 'edificio_mismatch_real',
      severidad: 'alta',
      msg: `nombre_edificio BD="${edificioBd}", desc menciona "${otro}" (posible matching errado)`,
      detalle: { edificio_bd: edificioBd, edificio_en_desc: otro },
    };
  }
  return null;
}

function extraerPreciosBs(desc) {
  const matches = new Set();
  for (const re of PATRONES_PRECIO_BS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(desc)) !== null) {
      const num = parseNumeroEsp(m[1]);
      if (num >= 1000 && num <= 100_000) matches.add(num);
    }
  }
  return [...matches];
}

function extraerPreciosUsd(desc) {
  const matches = new Set();
  for (const re of PATRONES_PRECIO_USD) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(desc)) !== null) {
      const num = parseInt(m[1].replace(/[.,]/g, ''), 10);
      if (num >= 100 && num <= 15_000) matches.add(num);
    }
  }
  return [...matches];
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

function parseNumeroEsp(s) {
  const clean = s.replace(/\s/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(clean)) {
    return parseInt(clean.replace(/[.,]/g, ''), 10);
  }
  if (/^\d+([.,]\d{1,2})$/.test(clean)) {
    return Math.round(parseFloat(clean.replace(',', '.')));
  }
  return parseInt(clean.replace(/[.,]/g, ''), 10);
}

// Alineado con normalizeNombre() de matching-checks.mjs: quita espacios internos
// para que "Nano Tec" y "NanoTec" se comparen como iguales.
function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(edificio|edif|condominio|torre|residencia|residencial)\b/g, '')
    .replace(/\s+/g, '')
    .trim();
}
