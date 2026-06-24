// lib/lector.mjs — doble fetcher de anuncios para la auditoría de cola de matching.
//
// Centraliza la extracción del TEXTO REAL del anuncio para que el subagente-juez
// solo razone sobre texto ya limpio (NO dependa de WebFetch, que falla con la SPA
// de Remax — lección 19-jun-2026).
//
//   - C21:   {url}?json=true  → entity.{descripcion, titulo, moneda, ...}
//            (fallback: og:description del HTML normal)
//   - Remax: {url} → HTML con data-page="..." (Inertia JSON)
//            → props.listing.{description_website, marketing_description, title}
//            WebFetch NO sirve (devuelve la shell "Remax Bolivia").
//
// Read-only: solo hace GET a los portales. No toca la BD.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_CHARS = 4000;

// Lee un anuncio y devuelve el texto consolidado listo para el juez.
// { ok, fuente, titulo, descripcion, texto, moneda?, status?, error? }
export async function leerAnuncio({ url, fuente }) {
  if (!url) return { ok: false, error: 'sin_url', titulo: '', descripcion: '', texto: '' };
  const f = (fuente || inferirFuente(url)).toLowerCase();
  try {
    if (f.includes('century') || url.includes('c21.com.bo')) return await leerC21(url);
    if (f.includes('remax') || url.includes('remax.bo')) return await leerRemax(url);
    if (f.includes('bien') || url.includes('bieninmuebles')) return await leerBI(url);
    // Fuente desconocida → intentar genérico (og:description)
    return await leerGenerico(url, f);
  } catch (err) {
    return { ok: false, fuente: f, error: String(err?.message || err), titulo: '', descripcion: '', texto: '' };
  }
}

// Lee en lote con concurrencia acotada (no martillar los portales).
export async function leerLote(items, { concurrency = 5, onProgress } = {}) {
  const out = new Array(items.length);
  let next = 0;
  let inFlight = 0;
  let done = 0;
  return new Promise((resolve) => {
    if (!items.length) return resolve([]);
    const tick = () => {
      while (inFlight < concurrency && next < items.length) {
        const idx = next++;
        inFlight++;
        leerAnuncio(items[idx])
          .then((r) => { out[idx] = { ...items[idx], ...r }; })
          .catch((e) => { out[idx] = { ...items[idx], ok: false, error: String(e), titulo: '', descripcion: '', texto: '' }; })
          .finally(() => {
            inFlight--; done++;
            onProgress?.(done, items.length);
            if (done === items.length) resolve(out);
            else tick();
          });
      }
    };
    tick();
  });
}

// === C21 ===
async function leerC21(url) {
  const jsonUrl = url.includes('?') ? `${url}&json=true` : `${url}?json=true`;
  const r = await rawFetch(jsonUrl);
  if (r.ok && r.body) {
    try {
      const data = JSON.parse(r.body);
      const e = data?.entity || data?.data?.entity || data || {};
      const titulo = clean(e.titulo || e.title || '');
      const descripcion = clean(e.descripcion || e.description || '');
      const moneda = e.moneda || e.currency || null;
      if (descripcion || titulo) {
        return ok('century21', titulo, descripcion, { moneda });
      }
    } catch { /* cae al fallback */ }
  }
  // Fallback: HTML normal, og:description
  const h = await rawFetch(url);
  if (!h.ok) return fail('century21', h);
  const desc = matchOg(h.body, 'og:description');
  const titulo = matchOg(h.body, 'og:title') || matchTitleTag(h.body);
  return ok('century21', clean(titulo), clean(desc));
}

// === Remax ===
async function leerRemax(url) {
  const r = await rawFetch(url);
  if (!r.ok) return fail('remax', r);
  const m = r.body.match(/data-page="([^"]*?)"/i);
  if (!m || !m[1]) {
    // SPA sin data-page (anuncio caído / redirigido)
    return { ok: false, fuente: 'remax', error: 'sin_data_page (SPA vacía o anuncio caído)', titulo: '', descripcion: '', texto: '' };
  }
  try {
    const data = JSON.parse(unescapeAttr(m[1]));
    const listing = data?.props?.listing || data?.props?.property || data?.listing || {};
    const titulo = clean(listing.title || listing.internal_title || '');
    const d1 = listing.description_website || listing.description || '';
    const d2 = listing.marketing_description || '';
    const descripcion = clean([d1, d2].filter(Boolean).join('\n').trim());
    if (!descripcion && !titulo) {
      return { ok: false, fuente: 'remax', error: 'data-page sin descripcion', titulo: '', descripcion: '', texto: '' };
    }
    return ok('remax', titulo, descripcion);
  } catch (e) {
    return { ok: false, fuente: 'remax', error: 'data-page no parseable: ' + String(e), titulo: '', descripcion: '', texto: '' };
  }
}

// === Bien Inmuebles ===
async function leerBI(url) {
  const r = await rawFetch(url);
  if (!r.ok) return fail('bien_inmuebles', r);
  const m = r.body.match(
    /property_block_title["'][^>]*>\s*Descripci[oó&][^<]*<\/h4>[\s\S]*?<div\s+class=["']block-body["'][^>]*>([\s\S]*?)<\/div>/i
  );
  const desc = m && m[1] ? clean(stripTags(m[1])) : clean(matchOg(r.body, 'og:description'));
  const titulo = clean(matchOg(r.body, 'og:title') || matchTitleTag(r.body));
  return ok('bien_inmuebles', titulo, desc);
}

async function leerGenerico(url, fuente) {
  const r = await rawFetch(url);
  if (!r.ok) return fail(fuente, r);
  return ok(fuente, clean(matchOg(r.body, 'og:title') || matchTitleTag(r.body)), clean(matchOg(r.body, 'og:description')));
}

// === fetch crudo con manejo de encoding (C21/Remax a veces sirven latin-1) ===
async function rawFetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*', 'Accept-Language': 'es-BO,es;q=0.9' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}`, body: '' };
    const buf = await res.arrayBuffer();
    let body = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (looksLikeBadEncoding(body)) body = new TextDecoder('windows-1252', { fatal: false }).decode(buf);
    return { ok: true, status: res.status, body };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: String(err?.message || err), body: '' };
  }
}

// === helpers ===
function ok(fuente, titulo, descripcion, extra = {}) {
  const texto = [titulo, descripcion].filter(Boolean).join(' || ').slice(0, MAX_CHARS);
  return { ok: true, fuente, titulo: titulo || '', descripcion: (descripcion || '').slice(0, MAX_CHARS), texto, ...extra };
}
function fail(fuente, r) {
  return { ok: false, fuente, status: r.status, error: r.error || 'fetch_fallido', titulo: '', descripcion: '', texto: '' };
}
function inferirFuente(url) {
  if (url.includes('c21.com.bo')) return 'century21';
  if (url.includes('remax.bo')) return 'remax';
  if (url.includes('bieninmuebles')) return 'bien_inmuebles';
  return 'desconocida';
}
function matchOg(html, prop) {
  if (!html) return '';
  const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
}
function matchTitleTag(html) {
  const m = html?.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1] : '';
}
function unescapeAttr(s) {
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#039;/g, "'");
}
function stripTags(s) {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
}
function clean(s) {
  if (!s) return '';
  return decodeHtml(String(s)).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}
function decodeHtml(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&oacute;/g, 'ó').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ').replace(/&iexcl;/g, '¡').replace(/&iquest;/g, '¿')
    .replace(/&amp;/g, '&');
}
function looksLikeBadEncoding(s) {
  if (!s) return false;
  const repl = (s.match(/�/g) || []).length;
  return repl > 5 && repl / s.length > 0.001;
}
