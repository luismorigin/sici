// Extractor de descripción cruda por fuente para feed alquiler.
// Réplica EXACTA de la lógica del workflow productivo
// `n8n/workflows/alquiler/flujo_enrichment_llm_alquiler_v2.1.0.json`
// para mantener consistencia entre cruda nueva (pipeline) y cruda backfill.
//
// - C21:    <meta property="og:description"> → descripción literal del listing
// - Remax:  data-page="..." (Inertia) → JSON.props.listing.description_website
// - BI:     <h4>Descripción</h4> ... <div class="block-body">(...)</div>
//
// Cap a 5000 chars (mismo que workflow). Decodificación de entities HTML
// común y normalización de saltos de línea.

const MAX_CRUDA_CHARS = 5000;

export function extraerDescripcion(html, fuente) {
  if (!html) return '';
  if (fuente === 'century21') return extraerDescripcionC21(html);
  if (fuente === 'remax') return extraerDescripcionRemax(html);
  if (fuente === 'bien_inmuebles') return extraerDescripcionBI(html);
  return '';
}

export function extraerTitle(html, fuente) {
  if (!html) return '';
  if (fuente === 'remax') {
    const m = html.match(/data-page="([^"]*?)"/i);
    if (m && m[1]) {
      try {
        const data = JSON.parse(unescapeAttr(m[1]));
        const t = data?.props?.listing?.title || data?.props?.property?.title;
        if (t) return t;
      } catch {}
    }
  }
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return decodeHtml(og[1].trim());
  const tag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return tag ? decodeHtml(tag[1].trim()) : '';
}

// === C21 ===
function extraerDescripcionC21(html) {
  const og = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  if (og && og[1]) {
    const desc = decodeHtml(og[1]).trim();
    if (desc.length >= 20) return desc.slice(0, MAX_CRUDA_CHARS);
  }
  return '';
}

// === Remax ===
function extraerDescripcionRemax(html) {
  const m = html.match(/data-page="([^"]*?)"/i);
  if (!m || !m[1]) return '';
  try {
    const data = JSON.parse(unescapeAttr(m[1]));
    const listing =
      data?.props?.listing || data?.props?.property || data?.listing || null;
    const desc = listing?.description_website || listing?.description || '';
    if (!desc) return '';
    return decodeHtml(desc).trim().slice(0, MAX_CRUDA_CHARS);
  } catch {
    return '';
  }
}

// === BI ===
// Patrón canónico del workflow v2.1.0:
// /property_block_title">Descripci[oó&][^<]*<\/h4>[\s\S]*?<div class="block-body"[^>]*>([\s\S]*?)<\/div>/i
function extraerDescripcionBI(html) {
  const m = html.match(
    /property_block_title["'][^>]*>\s*Descripci[oó&][^<]*<\/h4>[\s\S]*?<div\s+class=["']block-body["'][^>]*>([\s\S]*?)<\/div>/i
  );
  if (m && m[1]) {
    const desc = decodeHtml(stripTags(m[1])).trim();
    if (desc.length >= 20) return desc.slice(0, MAX_CRUDA_CHARS);
  }
  return '';
}

// === helpers ===
function unescapeAttr(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(s) {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
}

function decodeHtml(s) {
  if (!s) return s;
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&oacute;/g, 'ó').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&uacute;/g, 'ú')
    .replace(/&Oacute;/g, 'Ó').replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í').replace(/&Uacute;/g, 'Ú')
    .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&iexcl;/g, '¡').replace(/&iquest;/g, '¿')
    .replace(/&amp;/g, '&');
}
