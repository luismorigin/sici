// === CONSTRUIR PROMPT PARA HAIKU v2.0.0 ===
// Cambios vs v1.3.0:
// - Inyecta PROYECTOS CONOCIDOS por zona (viene de la query SQL)
// - Instrucciones NOMBRE_EDIFICIO con match contra lista PM
// - Instrucciones DORMITORIOS con regla monoambiente=0
// - Agrega nombre_edificio_confianza y dormitorios_confianza al JSON
// - Lógica Remax/C21/BI IDÉNTICA a v1.3.0
const prop = $('Loop Propiedades').first().json;
const scrape = $('Firecrawl Scrape').first().json;

let contenido = '';
let metodo = 'markdown';

// [148] Agente extraído directamente (Remax data-page)
let agente_directo = null;
// [158] Fotos extraídas directamente (Remax data-page)
let fotos_extraidas = null;

if (prop.fuente === 'remax') {
  // === REMAX: parsear data-page del HTML ===
  const html = scrape?.data?.rawHtml || scrape?.rawHtml || '';
  let titulo = '';
  let descripcion = '';

  if (html && html.length > 500) {
    try {
      const match = html.match(/data-page="([^"]*?)"/i);
      if (match && match[1]) {
        const jsonString = match[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        const data = JSON.parse(jsonString);
        const listing = data.props?.listing || data.props?.property || null;
        if (listing) {
          titulo = listing.title || '';
          descripcion = listing.description_website || listing.description || '';
          metodo = 'data-page';
        }
        // [148] Extraer agente del data-page
        const agent = listing?.agent || data.props?.agent || null;
        if (agent) {
          agente_directo = {
            nombre: agent.user?.name_to_show || agent.name || null,
            telefono: agent.user?.phone_number || agent.user?.mobile_phone || agent.user?.phone || null,
            oficina: agent.office?.name || null
          };
        }
        // [158] Extraer fotos del data-page
        const multimedias = listing?.multimedias || listing?.photos || listing?.images || [];
        if (Array.isArray(multimedias) && multimedias.length > 0) {
          const urls = multimedias
            .map(m => m.large_url || m.url || m.link || m.extra_large_url || null)
            .filter(u => u && typeof u === 'string' && u.startsWith('http'));
          const unicas = [...new Set(urls)];
          if (unicas.length > 0) {
            fotos_extraidas = unicas;
          }
        }
      }
    } catch (e) {
      console.log('Error parseando data-page: ' + e.message);
    }
  }

  if (!descripcion || descripcion.length < 20) {
    const md = scrape?.data?.markdown || scrape?.markdown || '';
    if (md && md.length >= 50) {
      contenido = md.substring(0, 3000);
      metodo = 'markdown_fallback';
    } else {
      return [{ json: { skip: true, error: 'Remax: no data-page ni markdown', prop_id: prop.prop_id } }];
    }
  } else {
    contenido = (titulo ? 'TÍTULO: ' + titulo + '\n\n' : '') + 'DESCRIPCIÓN:\n' + descripcion.substring(0, 3000);
  }
} else if (prop.fuente === 'bien_inmuebles') {
  // === BIEN INMUEBLES: extraer fotos + agente del HTML, usar markdown para LLM ===
  const html = scrape?.data?.rawHtml || scrape?.rawHtml || '';
  if (html && html.length > 200) {
    const fotoMatches = html.match(/uploads\/catalogo\/pics\/[^"'\s)]+/g) || [];
    const fotosUnicas = [...new Set(fotoMatches)].map(f => 'https://www.bieninmuebles.com.bo/admin/' + f);
    if (fotosUnicas.length > 0) {
      const nomb_img = prop.nomb_img || '';
      if (nomb_img) {
        const mainUrl = 'https://www.bieninmuebles.com.bo/admin/uploads/catalogo/pics/' + nomb_img;
        fotosUnicas.sort((a, b) => (a === mainUrl ? -1 : b === mainUrl ? 1 : 0));
      }
      fotos_extraidas = fotosUnicas;
      console.log(`Bien Inmuebles: ${fotosUnicas.length} fotos extraídas`);
    }

    const agenteSection = html.match(/agent-sides_2[\s\S]*?<\/ul>\s*<\/div>\s*<\/div>/i);
    if (agenteSection) {
      const seccion = agenteSection[0];
      const nombreMatch = seccion.match(/<h4>([^<]+)<\/h4>/i);
      const telMatch = seccion.match(/[67]\d{7}/);
      if (telMatch) {
        const telefono = '+591' + telMatch[0];
        let nombre = nombreMatch ? nombreMatch[1].trim() : null;
        if (!nombre) {
          nombre = prop.amigo_clie || null;
          if (nombre) nombre = nombre.trim().replace(/([a-z])([A-Z])/g, '$1 $2');
        }
        agente_directo = { nombre, telefono, oficina: 'Bien Inmuebles' };
        console.log(`Bien Inmuebles agente: ${nombre} ${telefono}`);
      }
    }
  }
  const markdown = scrape?.data?.markdown || scrape?.markdown || '';
  if (!markdown || markdown.length < 50) {
    if (fotos_extraidas) {
      contenido = 'Sin descripción disponible';
      metodo = 'fotos_only';
    } else {
      return [{ json: { skip: true, error: 'Bien Inmuebles: sin contenido ni fotos', prop_id: prop.prop_id } }];
    }
  } else {
    contenido = markdown.substring(0, 3000);
  }
} else {
  // === C21: usar markdown como siempre ===
  const markdown = scrape?.data?.markdown || scrape?.markdown || '';
  if (!markdown || markdown.length < 50) {
    return [{ json: { skip: true, error: 'Firecrawl no devolvió contenido', prop_id: prop.prop_id } }];
  }
  contenido = markdown.substring(0, 3000);
}

// === v2.0: Leer campos nuevos de la query SQL ===
const nombre_regex = prop.nombre_edificio_regex || 'desconocido';
const proyectos_zona = prop.proyectos_zona || '';

const prompt = `Eres un extractor de datos inmobiliarios para Santa Cruz de la Sierra, Bolivia.
Extraes datos de paginas web de propiedades en ALQUILER.
REGLA ABSOLUTA: NUNCA inventes datos. Si no aparece en el texto, devuelve null.

DATOS YA CONOCIDOS (del discovery):
- URL: ${prop.url}
- Fuente: ${prop.fuente}
- Precio discovery: ${prop.precio_mensual_bob ? 'Bs ' + prop.precio_mensual_bob : 'desconocido'}
- Area: ${prop.area_total_m2 ? prop.area_total_m2 + ' m2' : 'desconocida'}
- Dormitorios (portal): ${prop.dormitorios || 'desconocido'}
- Banos (portal): ${prop.banos || 'desconocido'}
- Zona GPS: ${prop.zona || 'desconocida'}

DATOS EXTRACTOR (regex — pueden tener errores):
- Nombre edificio: ${nombre_regex}

PROYECTOS CONOCIDOS EN ZONA ${prop.zona || 'desconocida'}:
${proyectos_zona}

TEXTO DE LA PAGINA:
${contenido}

INSTRUCCIONES POR CAMPO:

PRIORIDAD: Si el texto CONTRADICE un dato del portal, usar la evidencia del texto. Si no hay contradiccion, mantener el dato existente.

NOMBRE_EDIFICIO:
- Busca el nombre del edificio/condominio/proyecto en el texto Y en el dato del extractor
- Compara contra la lista de PROYECTOS CONOCIDOS de arriba
- PASO 1: Si el extractor ya tiene un nombre, limpia prefijos genericos ("Edificio", "Condominio", "Eco Sostenible") y busca match en la lista
- PASO 2: Si encontras match en la lista (incluso parcial: "Elite by Sky Properties" -> "Sky Elite"), usa el nombre oficial de la lista
- PASO 3: Si NO hay match en la lista pero el extractor o el texto tiene un nombre claro de edificio, MANTENELO tal cual (confianza media)
- PASO 4: Solo devolve null si no hay NINGUN nombre de edificio ni en extractor ni en texto
- NUNCA devolver: "Alquiler", "Departamento", direcciones, "Venta", tipo de operacion
- Confianza alta: nombre exacto en lista, o nombre claro en texto que coincide con extractor
- Confianza media: nombre del extractor o texto que NO esta en la lista pero es un nombre real de edificio
- Confianza baja: muy dudoso, solo fragmento parcial

DORMITORIOS:
- "monoambiente", "studio", "loft", "mono" = 0 dormitorios
- "1 dormitorio", "1 dorm", "1 hab" = 1
- Si el portal dice 1 pero el texto dice "monoambiente" o "studio" -> usar 0
- Si no hay dato de portal y la descripcion dice "monoambiente" -> 0 (NO null)
- Si el portal dice un numero y el texto no lo contradice -> mantener el del portal
- Rango valido: 0-6

BANOS:
- "medio bano" o "toilette" cuenta como 0.5
- Si el portal dice un numero y el texto no lo contradice -> mantener el del portal
- Rango valido: 0-6

Devuelve SOLO este JSON (sin explicaciones, sin markdown):
{
  "precio_mensual_bob": number | null,
  "precio_mensual_usd": number | null,
  "expensas_bs": number | null,
  "deposito_meses": number | null,
  "contrato_minimo_meses": number | null,
  "area_total_m2": number | null,
  "dormitorios": number | null,
  "dormitorios_confianza": "alta" | "media" | "baja" | null,
  "banos": number | null,
  "estacionamientos": number | null,
  "baulera": boolean | null,
  "piso": number | null,
  "amoblado": "si" | "no" | "semi" | null,
  "acepta_mascotas": boolean | null,
  "servicios_incluidos": string[] | null,
  "nombre_edificio": string | null,
  "nombre_edificio_confianza": "alta" | "media" | "baja" | null,
  "descripcion_limpia": string | null,
  "amenities_confirmados": string[] | null,
  "equipamiento_detectado": string[] | null,
  "agente_nombre": string | null,
  "agente_telefono": string | null,
  "agente_oficina": string | null
}`;

return [{
  json: {
    prop_id: prop.prop_id,
    prop_url: prop.url,
    fuente: prop.fuente,
    metodo_extraccion: metodo,
    agente_directo: agente_directo,
    fotos_extraidas: fotos_extraidas,
    prompt: prompt,
    contenido_length: contenido.length
  }
}];
