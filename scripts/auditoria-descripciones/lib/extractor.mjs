export function extraerDescripcion(html, fuente) {
  if (!html) return '';
  if (fuente === 'century21') return extraerDescripcionC21(html);
  if (fuente === 'remax') return extraerDescripcionRemax(html);
  return '';
}

export function extraerTitle(html, fuente) {
  if (!html) return '';
  const tag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (tag && tag[1]) return decodeHtmlEntities(tag[1].trim());
  if (fuente === 'remax') {
    const m = html.match(/data-page="([^"]*?)"/i);
    if (m && m[1]) {
      try {
        const data = JSON.parse(
          m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        );
        const t = data?.props?.listing?.title || data?.props?.property?.title;
        if (t) return t;
      } catch {}
    }
  }
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  return og ? decodeHtmlEntities(og[1].trim()) : '';
}

function extraerDescripcionC21(html) {
  let m = html.match(
    /<p[^>]*style=["'][^"']*white-space:\s*pre-wrap[^"']*["'][^>]*>([\s\S]*?)<\/p>/i
  );
  if (m && m[1].trim()) return decodeHtmlEntities(stripTags(m[1])).trim();
  m = html.match(/<p[^>]*white-space:\s*pre-wrap[^>]*>([\s\S]*?)<\/p>/i);
  if (m && m[1].trim()) return decodeHtmlEntities(stripTags(m[1])).trim();
  return getMeta(html, 'og:description') || getMeta(html, 'description') || '';
}

function extraerDescripcionRemax(html) {
  const m = html.match(/data-page="([^"]*?)"/i);
  if (!m || !m[1]) return '';
  const jsonString = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  try {
    const data = JSON.parse(jsonString);
    const listing =
      data?.props?.listing || data?.props?.property || data?.listing || null;
    return listing?.description_website || '';
  } catch {
    return '';
  }
}

function getMeta(content, name) {
  const m = content.match(
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i')
  );
  if (m) return m[1].trim();
  const m2 = content.match(
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i')
  );
  return m2 ? m2[1].trim() : null;
}

function stripTags(s) {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ');
}
