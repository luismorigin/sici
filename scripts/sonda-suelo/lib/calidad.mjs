// Detectores de atributos en el texto del anuncio + flags de moneda. Sin LLM.
export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const RE = {
  frente: /\d{1,3}([.,]\d+)?\s*[x×]\s*\d{1,3}([.,]\d+)?|frente\D{0,12}\d|metros?\s+de\s+frente|de\s+frente/,
  uso: /ideal para construir|uso de suelo|zonifica|construible|patron de asentamiento|edificable|apto para|uso comercial|uso mixto/,
  esquina: /esquina/,
  demolible: /demol|a demoler|precio de terreno|casa vieja|casa antigua|para construir/,
  servicios: /agua|luz|alcantarillado|servicios basicos|energia electrica|cordon|pavimento|gas natural/,
  usd: /\$us|us\$|us\s*\$|d[o]lares|dolares|\busd\b/,
  bob: /\bbs\.?\b|bolivianos/,
  tc: /\btc\s*\d|tipo de cambio|paralelo/,
};

// Atributos que valora un COMPRADOR de vivienda final (heurística texto + estructurado).
const REV = {
  condominio: /condominio|barrio cerrado|urbanizacion cerrada|conjunto cerrado|zona cerrada|seguridad 24|guardia|porton electrico|acceso controlado|circuito cerrado|camaras/,
  piscina: /piscina|alberca/,
  jardin: /jardin|patio|area verde|areas verdes|parque/,
  quincho: /quincho|churrasquera|parrill|asador|parrillero/,
  dependencia: /dependencia|cuarto de servicio|habitacion de servicio|bano de servicio|cuarto de empleada/,
  estrenar: /a estrenar|estreno|nueva a|casa nueva|sin estrenar|en construccion|preventa/,
  remodelada: /remodelad|refaccionad|renovad/,
  amoblado: /amoblad|equipad|semiamoblad/,
  serviciosTop: /gas natural|gas domiciliario|fibra optica|internet|panel solar/,
  cerca: /colegio|escuela|universidad|supermercado|cerca de|a pasos|sobre avenida|sobre la av/,
  niveles2: /dos plantas|dos niveles|2 plantas|2 niveles|planta alta|segundo piso|dos pisos/,
};

export function calidadVivienda(detalle, listadoProp) {
  const t = norm(detalle?.descripcion);
  const tieneTexto = t.length > 20;
  // estructurado: del listado (dorms/banos/garage) y del detalle (fotos, jardin)
  return {
    descRecuperada: !!detalle && tieneTexto,
    dorms: Number.isFinite(listadoProp?.dorms),
    banos: Number.isFinite(listadoProp?.banos),
    garage: Number.isFinite(listadoProp?.garage) || (tieneTexto && /garaje|garage|cochera|parqueo/.test(t)),
    area_const: Number.isFinite(listadoProp?.area_const_m2),
    fotos_n: Number.isFinite(detalle?.fotos) ? detalle.fotos : null,
    fotos_ok: Number.isFinite(detalle?.fotos) && detalle.fotos >= 5,
    condominio: tieneTexto && REV.condominio.test(t),
    piscina: tieneTexto && REV.piscina.test(t),
    jardin: !!(detalle?.jardin_m2) || (tieneTexto && REV.jardin.test(t)),
    quincho: tieneTexto && REV.quincho.test(t),
    dependencia: tieneTexto && REV.dependencia.test(t),
    estrenar: tieneTexto && REV.estrenar.test(t),
    remodelada: tieneTexto && REV.remodelada.test(t),
    amoblado: tieneTexto && REV.amoblado.test(t),
    serviciosTop: tieneTexto && REV.serviciosTop.test(t),
    cerca: tieneTexto && REV.cerca.test(t),
    niveles2: tieneTexto && REV.niveles2.test(t),
  };
}

// Combina señal estructurada (detalle) + texto.
export function calidadDeDetalle(detalle, fuente) {
  const t = norm(detalle?.descripcion);
  const tieneTexto = t.length > 20;
  return {
    descRecuperada: !!detalle && tieneTexto,
    descLen: detalle?.descripcion?.length || 0,
    frente: !!(detalle?.metrosFrente) || (tieneTexto && RE.frente.test(t)),
    frente_estructurado: !!(detalle?.metrosFrente),
    uso: tieneTexto && RE.uso.test(t),
    esquina: detalle?.tipoTerreno === 'esquina' || (tieneTexto && RE.esquina.test(t)),
    demolible: tieneTexto && RE.demolible.test(t),
    servicios: tieneTexto && RE.servicios.test(t),
    txtUSD: tieneTexto && RE.usd.test(t),
    txtBOB: tieneTexto && RE.bob.test(t),
    txtTC: tieneTexto && RE.tc.test(t),
  };
}
