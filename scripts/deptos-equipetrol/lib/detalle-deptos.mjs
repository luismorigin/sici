// ============================================================================
// EXTRACTOR DE DETALLE — DEPARTAMENTOS (C21 + Remax)  ·  flujo híbrido, fetch $0
// ----------------------------------------------------------------------------
// Espeja el contrato de datos_json_enrichment de deptos que hoy produce n8n, pero
// SIN Firecrawl: C21 {url}?json=true -> entity; Remax data-page -> props.listing.
// Validado por la sonda de sombra (2-jul): contacto/fotos/desc/precio ≥ n8n, y los
// campos DEPTO (piso/expensas/parqueo/amenidades) vienen ESTRUCTURADOS de la fuente.
//
// Devuelve el contrato depto normalizado. El área NO se saca del detalle (Remax no la
// trae ahí) — viene del DISCOVERY (search API). nombre_edificio + gate = MOAT (LLM).
// ============================================================================
import { fetchRetry } from '../../sonda-suelo/lib/fetcher.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' };
const DEPTO_M2_MIN = 1000, DEPTO_M2_MAX = 4500; // rango $/m² coherente deptos Eq (p05 1498 · p95 3268)

export const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
// dorms: 0 = monoambiente VÁLIDO, por eso no alcanza con `num()` (que descartaría el 0).
// 🔴 Pero `Number(null)` es 0, así que hasta el 22-ago-2026 un portal que NO declaraba
// dormitorios entraba como 0 = MONOAMBIENTE. Caso 8001021: C21 manda `recamaras: null`,
// el aviso se titula "alquiler", la descripción es un punto — y quedó guardado como
// monoambiente de 55 m². El lector marcó `confianza: baja` (no tenía con qué decidir) y
// lo levantó la superficie 4b. Afectaba a los DOS portales (C21 y Remax).
// 🔑 MEDIRLO CON `senales_portal.recamaras` NO SIRVE: ese campo ES la salida del bug.
// Muestra de 14 monoambientes activos de C21, preguntándole al portal HOY:
//   el portal DECLARA 0 ....  0
//   el portal NO DICE ......  8   ← el 0 lo puso esta función
//   el portal dice 1 .......  6   ← y el lector lo bajó a 0 leyendo "monoambiente": bien
// De los 8 sin dato, **7 tenían "monoambiente" en el título o el texto**, así que el lector
// acertaba igual. El daño real es el caso restante: cuando el aviso NO lo aclara y el
// lector recibe un "el portal dice 0" que el portal nunca dijo (3565, 8001021).
// Ahora: null/undefined/'' → null (no sabemos) · '0' → 0 (el portal lo declaró).
// No cambia lo ya guardado: sólo deja de fabricar el dato en las capturas nuevas.
export const numOrZero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Fallback de ÁREA por texto (cuando falta la estructurada del discovery).
// Espeja extraerArea() de n8n: regex sobre la descripción "Superficie: 43,5 m2".
// El slug/título NO traen el área (verificado) → solo la descripción sirve.
export function parseAreaTexto(desc) {
  if (!desc) return null;
  // unidad tolerante a formatos BO: m2, m², mts2, mts², mt2, metros, metros cuadrados
  const U = '(?:m(?:ts?\\.?|etros?)(?:\\s*(?:²|2|cuadrados?))?|m\\s*(?:²|2|cuadrados?))';
  const N = '([\\d]+(?:[.,]\\d+)?)';
  const pats = [
    new RegExp(`(?:superficie|[aá]rea)\\s*(?:de\\s+)?(?:construcci[oó]n|construida|total|[uú]til)?\\s*:?\\s*${N}\\s*${U}`, 'i'),
    new RegExp(`\\bde\\s+${N}\\s*${U}\\b`, 'i'),   // "De 34.83 m2"
    new RegExp(`${N}\\s*${U}`, 'i'),               // genérico: número + unidad
  ];
  for (const re of pats) {
    const m = desc.match(re);
    if (m) { const v = parseFloat(m[1].replace(',', '.')); if (v >= 10 && v <= 1000) return v; }
  }
  return null;
}

export const telNorm = (t) => {
  if (!t) return null;
  let d = String(t).replace(/[^0-9]/g, '');
  if (d.startsWith('591')) d = d.slice(3);
  d = d.replace(/^0+/, '');
  return d.length >= 7 ? `+591${d}` : null;
};
const waDe = (tel) => (tel ? `https://wa.me/${tel.replace('+', '')}` : null);

// Normaliza la fecha de publicación del anuncio a 'YYYY-MM-DD' (columna date).
// Fuente: Remax `listing.date_of_listing` (SÍ está en el detalle). C21 NO la trae en el
// detalle (`?json=true` solo `fechaModificacion`/`fechaFirmaCPS`) → viene de la DISCOVERY
// (`fecha_alta`). Es la fecha REAL del anuncio (días-en-mercado); NUNCA la de scraping.
// La protege el cargador con LEAST (la más antigua gana, nunca se pisa adelante).
export const normFecha = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    let n = Number(v); if (n < 1e12) n *= 1000;           // epoch en segundos → ms
    const d = new Date(n); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;      // ISO
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);  if (m) return `${m[3]}-${m[2]}-${m[1]}`;        // dd/mm/yyyy (BO)
  const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const decodeEnt = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// ---------------------------------------------------------------------------
// CENTURY21 — {url}?json=true -> entity (campos planos) + j.fotos + caracteristicasJSON
// ---------------------------------------------------------------------------
// entity.precio / precioFormat son INCONSISTENTES/corruptos (caso 3519: precio=7557
// basura vs precioVenta=52600 real). Elegir el candidato con $/m² coherente de depto.
function pickPrecioC21(e) {
  const m2 = num(e.m2C) || num(e.m2T) || 0;
  const cand = [Number(e.precioVenta), Number(e.precioVenta) / 6.96, Number(e.precio)].filter((v) => v > 1000);
  if (!cand.length) return null;
  if (!m2) return cand.sort((a, b) => b - a)[0];
  const coh = cand.filter((v) => v / m2 >= DEPTO_M2_MIN && v / m2 <= DEPTO_M2_MAX);
  return (coh.length ? coh : cand).sort((a, b) => b - a)[0];
}

// caracteristicasJSON.campos[] (checkbox name/label/valor) -> amenidades activas (valor===true)
function amenitiesC21(e) {
  let c = e.caracteristicasJSON;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } }
  const campos = c?.campos || [];
  return campos.filter((f) => f && f.valor === true).map((f) => f.label || f.nombre).filter(Boolean);
}

// ---------------------------------------------------------------------------
// NOMBRE DEL EDIFICIO desde `entity.direccionFormat` (22-ago-2026)
// ---------------------------------------------------------------------------
// C21 pone el nombre del edificio en la dirección y hasta hoy lo tirábamos: de 25
// alquileres de Equipetrol sin `nombre_edificio`, **19 traían algo ahí**. Sin
// nombre no hay match, y sin match la duda del lector no la mira ninguna
// superficie del audit (ver superficie 4b y docs/backlog/PLAN_SENALES_HUERFANAS_DEL_LECTOR.md).
//
// Probado: los dos casos que la superficie 4b levantó el 22-ago matchean su ficha
// con el nombre recuperado — "Nano Tec By Smart Studio" → pm 129 (score 0.633) y
// "Eurodesign Leblanc" → pm 112 (score **1.000**). Los edificios ya estaban en el
// catálogo; lo que faltaba era el nombre.
//
// 🔴 EL FILTRO ES LA MITAD DEL TRABAJO, no un detalle. El campo trae mezclado el
// nombre con la zona y con direcciones, y un nombre FALSO produce un match falso,
// que es peor que no tener nombre: medido, `Jazmines Nro 427` devuelve 1 candidato
// en `buscar_proyecto_fuzzy` y los 2 PM "Jazmines" están a 4,7 km.
//   "Edifico Nano Tec By Smart Studio - Zona Equipetrol" → "Nano Tec By Smart Studio"
//   "Equipetrol Calle Leonardo Nava Edificio One Soul"   → "One Soul"
//   "Equipetrol" · "Zona Equipetrol" · "equipetrol sirari"        → null (es la zona)
//   "Jazmines Nro 427 427" · "Equipetrol Calle 7 este s/n"        → null (es dirección)
// Los 20 casos de prueba viven en `probar-nombre-desde-direccion.mjs` (20/20).
//
// ⚠️ Sale como CANDIDATO (`nombre_en_direccion`), sin autoridad sobre el matching:
// el audit lo muestra, el matcher no lo usa. Asciende a `nombre_edificio` recién
// cuando una tanda medida lo respalde.
const ZONA_RE      = /\b(equipetrol|sirari|villa\s*brigida|brigida|zona|nor\s*este|norte|sur|este|oeste|centro|anillo|santa\s*cruz|bolivia)\b/gi;
const MARCADOR_RE  = /\b(edificios?|edifico|condominios?|cond\.?|torres?|residencial(es)?|residencias?)\b/i;
const CORTE_RE     = /\s+\b(departamento|depto|dpto|piso|of\.|oficina|unidad)\b.*$/i;
const DIRECCION_RE = /\b(nro|n°|s\/n|sn|calle|avenida|av\.?|pasaje|barrio|km|entre)\b/i;

export function nombreDesdeDireccion(direccionFormat) {
  if (!direccionFormat) return null;
  let s = String(direccionFormat).split(',')[0].trim();
  if (!s) return null;
  const m = s.match(MARCADOR_RE);
  if (m) s = s.slice(m.index + m[0].length).trim();   // lo que sigue a "Edificio"/"Condominio"
  s = s.split(/\s+[-–]\s+/)[0].trim();                 // corta el sufijo " - Zona Equipetrol"
  s = s.replace(CORTE_RE, '').trim();                  // corta " DEPARTAMENTO 4 PISO 5"
  if (!s) return null;
  if (DIRECCION_RE.test(s)) return null;               // era una dirección, no un nombre
  if (/^\d/.test(s)) return null;
  // Si al sacarle las palabras de zona no queda nada, era la zona y no un edificio.
  const resto = s.replace(ZONA_RE, '').replace(/[^a-záéíóúñ0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (resto.length < 3) return null;
  return s;
}

export async function fetchC21Depto(url) {
  const j = await fetchRetry(`${url}?json=true`, { json: true, headers: UA });
  if (!j) return null;
  const e = j.entity || j.data?.entity || j;
  const nombre = [e.usname, e.apellidoP, e.apellidoM].filter(Boolean).join(' ').trim() || e.asesor?.nombre || null;
  const tel = telNorm(e.whatsapp || e.usuatelMovil || e.asesor?.whatsapp || e.asesor?.celular);
  const fotos = Array.isArray(j.fotos) ? j.fotos : Array.isArray(j.fotosNew) ? j.fotosNew : [];
  const fotosUrls = fotos.map((f) => f?.large || f?.url || f?.original || (typeof f === 'string' ? f : null)).filter(Boolean);
  const amen = amenitiesC21(e);
  const parqueoBool = amen.some((a) => /estacionamiento|parqueo|garage|cochera/i.test(a)) || num(e.estacionamientos) != null;
  return {
    fuente: 'c21',
    // contacto
    agente_nombre: nombre, agente_telefono: tel, url_whatsapp: waDe(tel),
    oficina_nombre: e.nombreOfna || e.oficina?.nombre || null,
    contacto_visible: e.mostrarTelCelularEnInternet !== false,
    // fecha REAL del anuncio (días-en-mercado); NO la de scraping
    fecha_publicacion: normFecha(e.fechaAlta ?? e.fecha_alta ?? e.fechaPublicacion ?? e.created_at),
    // multimedia + texto
    fotos_urls: fotosUrls, cantidad_fotos: fotosUrls.length,
    descripcion: e.descripcion || j.descripcionMeta || '',
    // físicos depto (área va del discovery; acá respaldo estructurado + de texto)
    area_const_m2: num(e.m2C), area_texto: parseAreaTexto(e.descripcion || j.descripcionMeta || ''),
    dormitorios: numOrZero(e.recamaras), banos: num(e.banos),
    piso: e.pisoEnQueSeEncuentra != null && e.pisoEnQueSeEncuentra !== '' ? String(e.pisoEnQueSeEncuentra) : null,
    niveles_edificio: num(e.nivelesConstruidos),
    expensas: num(e.cuotaMantenimiento),
    expensas_incluidas: e.mantenimientoIncluidoEnPrecio === true,
    estacionamientos: num(e.estacionamientos), parqueo_incluido: parqueoBool,
    amenities: amen,
    // precio + TC
    precio_fuente_usd: pickPrecioC21(e), moneda: e.moneda || null,
    tc_portal: null,                       // C21 no expone TC estructurado (precioFormat = precioVenta/6.96 SIEMPRE)
    precio_bob_portal: num(e.precioVenta),  // candidato BOB; el LECTOR computa ratio = precioVenta / precio_del_texto
    // nombre del edificio que C21 esconde en la dirección (ver nombreDesdeDireccion)
    nombre_en_direccion: nombreDesdeDireccion(e.direccionFormat),
    direccion_portal: e.direccionFormat || null,
    _diag: { precio: e.precio, precioVenta: e.precioVenta, precioFormat: e.precioFormat, m2C: e.m2C },
  };
}

// ---------------------------------------------------------------------------
// REMAX — data-page -> props.listing. Amenidades en features[]; TC en prices.exchange_rate_amount
// ---------------------------------------------------------------------------
// El TC NO se clasifica acá: el extractor devuelve la señal CRUDA (tc_portal =
// exchange_rate_amount). La decisión paralelo/oficial/no_especificado la toma
// clasificarTCporRatio() (lib/tc.mjs) contra el paralelo VIVO de Binance.
export async function fetchRemaxDepto(url) {
  const html = await fetchRetry(url, { json: false, headers: UA });
  if (!html) return null;
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  let props;
  try { props = JSON.parse(decodeEnt(m[1])).props; } catch { return null; }
  const l = props?.listing;
  if (!l) return null;
  const li = l.listing_information || {};
  const a = props.agent || l.agents?.[0] || {};
  const tel = telNorm(a.user?.phone_number || a.user?.mobile_phone);
  const fotosUrls = Array.isArray(l.multimedias) ? l.multimedias.map((x) => x?.large_url || x?.link || x?.url).filter(Boolean) : [];
  const feats = Array.isArray(l.features) ? l.features.map((f) => f?.name).filter(Boolean) : [];
  const prices = l.prices || (Array.isArray(l.prices) ? l.prices[0] : null);
  const tc_portal = num(prices?.exchange_rate_amount); // señal cruda; clasifica clasificarTCporRatio()
  const parqueoBool = feats.some((f) => /parqueo|estacionamiento|garage|cochera/i.test(f));
  return {
    fuente: 'remax',
    agente_nombre: a.user?.name_to_show || [a.user?.first_name, a.user?.last_name].filter(Boolean).join(' ') || null,
    agente_telefono: tel, url_whatsapp: waDe(tel),
    oficina_nombre: a.office?.name || null,
    contacto_visible: true,
    // fecha REAL del anuncio (días-en-mercado); NO la de scraping
    fecha_publicacion: normFecha(l.date_of_listing ?? li.date_of_listing ?? l.published_at ?? l.created_at),
    fotos_urls: fotosUrls, cantidad_fotos: fotosUrls.length,
    descripcion: (l.description_website || l.marketing_description || '').trim(),
    area_const_m2: num(li.construction_area_m) || num(li.land_m2), // suele venir null en detalle -> discovery lo cubre
    area_texto: parseAreaTexto(l.description_website || l.marketing_description || ''), // respaldo si falta la estructurada
    dormitorios: numOrZero(li.number_bedrooms), banos: num(li.number_bathrooms),
    piso: null,              // Remax no expone piso estructurado -> MOAT (texto) si se necesita
    niveles_edificio: null,
    expensas: null, expensas_incluidas: false,
    estacionamientos: null, parqueo_incluido: parqueoBool,
    amenities: feats,
    precio_fuente_usd: num(prices?.price_in_dollars) || num(prices?.amount),
    moneda: prices?.currency_id === 1 ? 'BOB' : prices?.currency_id === 2 ? 'USD' : null,
    tc_portal, // exchange_rate_amount crudo (≈paralelo si alto); clasifica lib/tc.mjs
    _diag: { prices },
  };
}

export async function fetchDetalleDepto(fuente, url) {
  return fuente === 'remax' ? fetchRemaxDepto(url) : fetchC21Depto(url);
}
