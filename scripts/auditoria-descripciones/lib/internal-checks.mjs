const PATRONES_PRECIO = [
  /\$\s?us[\s.]?\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)/gi,
  /usd?\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)/gi,
  /precio[^.\n]{0,30}?(\d{2,3}(?:[.,]\d{3})+)\s*\$/gi,
  /(\d{2,3}(?:[.,]\d{3})+)\s*\$us/gi,
];

const PATRONES_TC_PARALELO = [
  /\bparalelo\b/i,
  /tc\s*del\s*d[ií]a\b/i,
  /cambio\s+del\s+d[ií]a\b/i,
  /d[oó]lares\s+billete\b/i,
  /pagos?\s+en\s+d[oó]lares\b/i,
];

const PATRONES_TC_OFICIAL = [
  /tc\s+oficial\b/i,
  /tipo\s+de\s+cambio\s+oficial\b/i,
  /\btc\s*[67](?![\d.,])/i,
];

export function runChecks(prop, allEdificios = new Set()) {
  const issues = [];
  const desc = prop.contenido_desc || '';
  const enrichDesc = prop.enrichment_desc || '';

  if (desc) {
    const issuePrecio = checkPrecioVsDesc(desc, prop.precio_usd);
    if (issuePrecio) issues.push(issuePrecio);

    const issueTc = checkTcVsDesc(desc, prop.tipo_cambio_detectado);
    if (issueTc) issues.push(issueTc);

    const issueEdificio = checkEdificioVsDesc(desc, prop.nombre_edificio);
    if (issueEdificio) issues.push(issueEdificio);
  } else {
    issues.push({
      tipo: 'descripcion_vacia',
      severidad: 'media',
      msg: 'datos_json.contenido.descripcion está vacío',
    });
  }

  if (desc && enrichDesc && desc !== enrichDesc) {
    const diffChars = Math.abs(desc.length - enrichDesc.length);
    issues.push({
      tipo: 'desync_contenido_enrichment',
      severidad: diffChars > 100 ? 'media' : 'baja',
      msg: `contenido(${desc.length}) ≠ enrichment(${enrichDesc.length}) — diff ${diffChars} chars`,
    });
  }

  const issueOriginal = checkPrecioOriginalVsActual(prop);
  if (issueOriginal) issues.push(issueOriginal);

  return issues;
}

function checkPrecioVsDesc(desc, precioBd) {
  if (!precioBd) return null;
  const precios = extraerPreciosUsd(desc);
  if (precios.length === 0) return null;
  const precioPrincipal = precios[0];
  const diffPct = Math.abs(precioPrincipal - precioBd) / precioBd;
  if (diffPct > 0.05) {
    return {
      tipo: 'precio_mismatch_desc',
      severidad: diffPct > 0.20 ? 'alta' : 'media',
      msg: `BD=$${precioBd}, desc principal=$${precioPrincipal} (diff ${(diffPct * 100).toFixed(1)}%)`,
      detalle: { precios_en_desc: precios, precio_bd: precioBd },
    };
  }
  return null;
}

function checkTcVsDesc(desc, tcBd) {
  const sugiereParalelo = PATRONES_TC_PARALELO.some((p) => p.test(desc));
  const sugiereOficial = PATRONES_TC_OFICIAL.some((p) => p.test(desc));

  if (sugiereParalelo && tcBd !== 'paralelo') {
    return {
      tipo: 'tc_mismatch_paralelo',
      severidad: 'alta',
      msg: `desc menciona paralelo, BD=${tcBd || 'NULL'} (subestima precio en feed)`,
    };
  }
  if (sugiereOficial && !sugiereParalelo && tcBd === 'paralelo') {
    return {
      tipo: 'tc_mismatch_oficial',
      severidad: 'media',
      msg: `desc menciona TC oficial, BD=paralelo (sobreestima precio en feed)`,
    };
  }
  return null;
}

function checkEdificioVsDesc(desc, edificioBd) {
  if (!edificioBd) return null;
  const edificioNorm = normalizar(edificioBd);
  if (edificioNorm.length < 4) return null;
  const descNorm = normalizar(desc);
  if (descNorm.includes(edificioNorm)) return null;
  const partes = edificioNorm.split(' ').filter((w) => w.length >= 4);
  const algunaPalabraPresente = partes.some((w) => descNorm.includes(w));
  if (!algunaPalabraPresente && partes.length > 0) {
    const matchEdificio = desc.match(/edif(?:icio)?\.?\s+([\wÁÉÍÓÚÑáéíóúñ\s]{3,30}?)(?:[\n,.]|$)/i);
    return {
      tipo: 'edificio_mismatch',
      severidad: 'media',
      msg: `nombre_edificio BD="${edificioBd}", desc no lo menciona${matchEdificio ? ` (desc dice "${matchEdificio[1].trim()}")` : ''}`,
    };
  }
  return null;
}

function checkPrecioOriginalVsActual(prop) {
  const precioActual = prop.precio_usd;
  const precioOriginal = prop.precio_usd_original;
  if (!precioActual || !precioOriginal) return null;
  const diffPct = Math.abs(precioActual - precioOriginal) / precioActual;
  if (diffPct > 0.30) {
    return {
      tipo: 'precio_actual_vs_original',
      severidad: 'baja',
      msg: `precio_usd=$${precioActual}, precio_usd_original (extractor)=$${precioOriginal} (diff ${(diffPct * 100).toFixed(1)}%)`,
    };
  }
  return null;
}

function extraerPreciosUsd(desc) {
  const matches = new Set();
  for (const re of PATRONES_PRECIO) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(desc)) !== null) {
      const num = parseNumeroEsp(m[1]);
      if (num >= 10_000 && num <= 5_000_000) matches.add(num);
    }
  }
  return [...matches].sort((a, b) => b - a);
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

function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
