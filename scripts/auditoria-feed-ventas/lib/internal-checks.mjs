const PATRONES_PRECIO_PRINCIPAL = [
  /precio[^.\n]{0,30}?\$\s?us?\.?\s?(\d{1,3}(?:[.,]\d{3})+)/gi,
  /precio[^.\n]{0,30}?(\d{1,3}(?:[.,]\d{3})+)\s*\$\s?us/gi,
  /precio[^.\n]{0,30}?usd?\s?(\d{1,3}(?:[.,]\d{3})+)/gi,
  /💰[^.\n]{0,30}?(\d{1,3}(?:[.,]\d{3})+)/gi,
  /(?:^|\n)\s*\$\s?us?\.?\s?(\d{2,3}(?:[.,]\d{3})+)/gim,
];

const PATRONES_OTRO_EDIFICIO = [
  /(?:^|\s)edif(?:icio)?\.?\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.&-]{2,40}?)(?=[\n,.;]|\s+(?:en|sobre|frente|cerca|equipetrol|ubicado))/g,
  /(?:^|\s)condominio\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.&-]{2,40}?)(?=[\n,.;]|\s+(?:en|sobre|frente|cerca|equipetrol|ubicado))/g,
  /(?:^|\s)torre\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.&-]{2,40}?)(?=[\n,.;]|\s+(?:en|sobre|frente|cerca|equipetrol|ubicado))/g,
];

const PATRONES_TC_PARALELO = [
  /\bparalelo\b/i, /tc\s*del\s*d[ií]a\b/i, /cambio\s+del\s+d[ií]a\b/i,
  /d[oó]lares\s+billete\b/i, /pagos?\s+en\s+d[oó]lares\b/i, /\bal\s+paralelo\b/i,
];

const PATRONES_TC_OFICIAL = [
  /\btc\s+oficial\b/i, /tipo\s+de\s+cambio\s+oficial\b/i, /\btc\.?\s*[67](?![\d.,])/i,
];

const TC_PARALELO = 9.954;
const TC_OFICIAL = 6.96;
const RATIO_PARALELO_VS_OFICIAL = TC_PARALELO / TC_OFICIAL;

export function runChecks(prop) {
  const issues = [];
  const desc = prop.contenido_desc || '';
  const enrichDesc = prop.enrichment_desc || '';

  if (!desc) {
    issues.push({
      tipo: 'descripcion_vacia',
      severidad: 'media',
      msg: 'datos_json.contenido.descripcion está vacío',
    });
    return issues;
  }

  const issuePrecio = checkPrecioVsDesc(desc, prop.precio_usd, prop.tipo_cambio_detectado);
  if (issuePrecio) issues.push(issuePrecio);

  const issueTc = checkTcVsDesc(desc, prop.tipo_cambio_detectado);
  if (issueTc) issues.push(issueTc);

  const issueEdificio = checkOtroEdificioMencionado(desc, prop.nombre_edificio);
  if (issueEdificio) issues.push(issueEdificio);

  if (enrichDesc && desc !== enrichDesc) {
    const diffChars = Math.abs(desc.length - enrichDesc.length);
    if (diffChars > 30) {
      issues.push({
        tipo: 'desync_contenido_enrichment',
        severidad: diffChars > 100 ? 'media' : 'baja',
        msg: `contenido(${desc.length}) ≠ enrichment(${enrichDesc.length}) — diff ${diffChars} chars`,
      });
    }
  }

  return issues;
}

function checkPrecioVsDesc(desc, precioBd, tcDetectado) {
  if (!precioBd) return null;
  const precios = extraerPreciosCercanosKeyword(desc);
  if (precios.length === 0) return null;

  const candidato = precios[0];
  const diffPct = Math.abs(candidato - precioBd) / precioBd;

  if (diffPct < 0.05) return null;

  if (tcDetectado === 'paralelo') {
    const ratioVsBd = candidato / precioBd;
    if (ratioVsBd > 1 / RATIO_PARALELO_VS_OFICIAL - 0.05 &&
        ratioVsBd < 1 / RATIO_PARALELO_VS_OFICIAL + 0.05) {
      return null;
    }
  }

  return {
    tipo: 'precio_mismatch_desc',
    severidad: diffPct > 0.20 ? 'alta' : 'media',
    msg: `BD=$${precioBd}${tcDetectado ? ` (${tcDetectado})` : ''}, desc principal=$${candidato} (diff ${(diffPct * 100).toFixed(1)}%)`,
    detalle: { precio_bd: precioBd, precio_desc_principal: candidato, todos_precios: precios },
  };
}

function checkTcVsDesc(desc, tcBd) {
  const sugiereParalelo = PATRONES_TC_PARALELO.some((p) => p.test(desc));
  const sugiereOficial = PATRONES_TC_OFICIAL.some((p) => p.test(desc));

  if (sugiereParalelo && tcBd !== 'paralelo') {
    return {
      tipo: 'tc_mismatch_paralelo',
      severidad: 'alta',
      msg: `desc menciona paralelo, BD=${tcBd || 'NULL'} (subestima precio en feed por factor ~1.43x)`,
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

function extraerPreciosCercanosKeyword(desc) {
  const matches = new Set();
  for (const re of PATRONES_PRECIO_PRINCIPAL) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(desc)) !== null) {
      const num = parseNumeroEsp(m[1]);
      if (num >= 20_000 && num <= 5_000_000) matches.add(num);
    }
  }
  return [...matches].sort((a, b) => b - a);
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

function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(edificio|edif|condominio|torre|residencia|residencial)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
