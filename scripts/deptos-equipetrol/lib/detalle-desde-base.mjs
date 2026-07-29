// ============================================================================
// DETALLE DESDE LA BASE — el "fetch" que no sale a internet
// ----------------------------------------------------------------------------
// Devuelve la MISMA forma que `fetchDetalleDepto`, pero armada con lo que ya está
// guardado en `datos_json_enrichment`. Lo comparten venta y alquiler: una sola
// implementación, no dos gemelas que se desincronizan.
//
// PARA QUÉ: Zona Norte tiene 435 de 445 anuncios de venta (y 99 de 101 de alquiler)
// con su texto ya guardado por el pipeline viejo. Re-leerlos no necesita internet:
// es gratis, no gasta proxy, no expone la IP y funciona aunque el aviso ya se haya
// bajado del portal.
//
// ⚠️ Es RE-LECTURA de lo capturado, NO captura fresca. Si el anuncio cambió en el
// portal, esto no se entera — para eso está /audit-deptos-shadow, que compara
// contra el portal de hoy.
// ============================================================================

const aNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

/**
 * @param {object} p  fila de `propiedades_v2` (necesita `datos_json_enrichment`)
 * @returns {object|null} detalle, o null si no hay texto que leer
 */
export function detalleDesdeBase(p) {
  const e = p.datos_json_enrichment || {};
  const desc = e.descripcion || p.datos_json?.contenido?.descripcion || null;
  if (!desc) return null;   // sin texto no hay nada que leer — el llamador lo reporta y saltea

  return {
    descripcion: desc,
    precio_fuente_usd: aNum(e.precio_usd) ?? aNum(p.precio_usd),

    // 🔴 `precio_bs` NO se pasa — VERIFICADO 28-jul-2026: en las 435 props de Zona Norte que
    // tienen ese campo, el ratio bs/usd es 6.96 EXACTO en las 435. No es el precio en
    // bolivianos del anuncio: es `precio_usd × 6.96` que calculó el pipeline viejo. Pasarlo
    // como "precio BOB del portal" llevaría al lector a taggear `bob`, y la normalización
    // nueva convierte BOB a la tasa de HOY (~11,6) → el precio saldría ~40% por debajo del
    // real, sin un solo error visible. Si el aviso publica en bolivianos, está en el TEXTO.
    precio_bob_portal: null,
    tc_portal: null,

    moneda: e.moneda_original || p.moneda_original || null,
    dormitorios: aNum(e.dormitorios) ?? p.dormitorios ?? null,
    banos: aNum(e.banos) ?? p.banos ?? null,

    // `piso` y `expensas` no están en el enrichment viejo → null honesto. El lector los saca
    // del texto (READER_SPEC v4.2). Inventarlos sería peor que no tenerlos.
    piso: null,
    expensas: null,

    estacionamientos: aNum(e.estacionamientos) ?? p.estacionamientos ?? null,
    area_const_m2: aNum(e.area_total_m2), area_texto: null,
    fecha_publicacion: e.fecha_publicacion || null,
    agente_nombre: e.agente_nombre || null,
    agente_telefono: e.agente_telefono || null,
    oficina_nombre: e.oficina_nombre || null,
    fotos_urls: Array.isArray(e.fotos_urls) ? e.fotos_urls : [],
    cantidad_fotos: aNum(e.cantidad_fotos) ?? 0,
    amenities: Array.isArray(e.amenities) ? e.amenities : [],

    // 🔴 NUNCA se hereda el flag del portal: MIENTE. 13 props decían "parqueo incluido" con el
    // parqueo cotizado aparte (medido 10-jul-2026). Lo decide el lector, desde el texto.
    parqueo_incluido: false,

    _origen: 'base',
  };
}
