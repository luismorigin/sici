// Test prompt v2.0 alquiler against Haiku API
// Usage: node scripts/test_prompt_v2.mjs <API_KEY>
const API_KEY = process.argv[2];
if (!API_KEY) { console.log('Usage: node test_prompt_v2.mjs <API_KEY>'); process.exit(1); }

const testCases = [
  {
    id: 105, fuente: "remax", precio_bob: "Bs 3000", area: "35 m2", dorms: "1", banos: "1", zona: "Sirari",
    nombre_regex: "Eco Sostenible Onix Art by Elite",
    proyectos: "Brickell 8, Condominio MARE, CONDOMINIO OMNIA PRIME, EDIFICIO ELITE SIRARI, Element by Elite, Infinity by Elite, Legendary by EliTe, Onix Art By EliTe, Sky Palmetto, Stone 5",
    contenido: "Monoambiente a estrenar en alquiler en Equipetrol, zona Sirari. Incluye area de living-comedor integrado, cocina americana equipada con cocina encimera y microondas, habitacion con ropero empotrado, bano moderno con box de bano y cajoneria baja, balcon con vista agradable."
  },
  {
    id: 1089, fuente: "century21", precio_bob: "Bs 3200", area: "40.54 m2", dorms: "desconocido", banos: "1", zona: "Equipetrol Centro",
    nombre_regex: "Phantom by Elite",
    proyectos: "Sky Elite, Domus Insignia, Nomad by Smart Studio, Eurodesign Soho, Luxe Suites, Torres Isuto, T-VEINTICINCO, Edificio Malibu Friendly, Nano Smart, Sky Plaza Italia",
    contenido: "Monoambiente amoblado con balcon en Equipetrol. Incluye cama, sofa/cama, refrigerador, cocina equipada, microondas, TV, balcon y area de servicio. Disponible 1 de abril."
  },
  {
    id: 1156, fuente: "century21", precio_bob: "Bs 4300", area: "36 m2", dorms: "desconocido", banos: "1", zona: "Equipetrol Centro",
    nombre_regex: "EDIFICIO ELITE BY SKY PROPERTIES",
    proyectos: "Sky Elite, Domus Insignia, Nomad by Smart Studio, Eurodesign Soho, Luxe Suites, Torres Isuto, T-VEINTICINCO, Edificio Malibu Friendly, Nano Smart, Sky Plaza Italia",
    contenido: "Departamento 323 en tercer piso del Edificio Elite by Sky Properties, ubicado en Equipetrol, Santa Cruz. Cuenta con pileta, jacuzzi, sauna, cocina equipada, vigilancia, lavadora, area social, servicio de seguridad, aire acondicionado, cuarto de juegos, internet, amueblado, vestidor, tv cable y elevador."
  },
  {
    id: 1191, fuente: "century21", precio_bob: "Bs 4300", area: "36 m2", dorms: "desconocido", banos: "1", zona: "Equipetrol Centro",
    nombre_regex: "EDIFICIO ELITE BY SKY PROPERTIES",
    proyectos: "Sky Elite, Domus Insignia, Nomad by Smart Studio, Eurodesign Soho, Luxe Suites, Torres Isuto, T-VEINTICINCO, Edificio Malibu Friendly, Nano Smart, Sky Plaza Italia",
    contenido: "Monoambiente de lujo amoblado con balcon, aire acondicionado, cocina equipada con microonda y horno empotrado, termotanque, bano con ducha y box, espejos y luminarias LED."
  },
  {
    id: 1124, fuente: "century21", precio_bob: "Bs 2700", area: "27 m2", dorms: "desconocido", banos: "desconocido", zona: "Equipetrol Centro",
    nombre_regex: null,
    proyectos: "Sky Elite, Domus Insignia, Nomad by Smart Studio, Eurodesign Soho, Luxe Suites, Torres Isuto, T-VEINTICINCO, Edificio Malibu Friendly, Nano Smart, Sky Plaza Italia",
    contenido: "Monoambiente equipado en alquiler. Incluye heladera, lavadora y cocina encimera."
  }
];

function buildPrompt(tc) {
  return `Eres un extractor de datos inmobiliarios para Santa Cruz de la Sierra, Bolivia.
Extraes datos de paginas web de propiedades en ALQUILER.
REGLA ABSOLUTA: NUNCA inventes datos. Si no aparece en el texto, devuelve null.

DATOS YA CONOCIDOS (del discovery):
- Fuente: ${tc.fuente}
- Precio discovery: ${tc.precio_bob}/mes
- Area: ${tc.area}
- Dormitorios (portal): ${tc.dorms}
- Banos (portal): ${tc.banos}
- Zona GPS: ${tc.zona}

DATOS EXTRACTOR (regex — pueden tener errores):
- Nombre edificio: ${tc.nombre_regex || 'desconocido'}

PROYECTOS CONOCIDOS EN ZONA ${tc.zona}:
${tc.proyectos}

TEXTO DE LA PAGINA:
${tc.contenido}

INSTRUCCIONES POR CAMPO:

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
- Si el portal dice 1 pero el texto dice "monoambiente" -> usar 0
- Si no hay dato de portal y la descripcion dice "monoambiente" -> 0 (NO null)
- Rango valido: 0-6

Devuelve SOLO este JSON (sin explicaciones, sin markdown):
{
  "nombre_edificio": string | null,
  "nombre_edificio_confianza": "alta" | "media" | "baja" | null,
  "dormitorios": number | null,
  "dormitorios_confianza": "alta" | "media" | "baja" | null,
  "precio_mensual_bob": number | null,
  "precio_mensual_usd": number | null,
  "area_total_m2": number | null,
  "banos": number | null,
  "amoblado": "si" | "no" | "semi" | null,
  "descripcion_limpia": string | null,
  "amenities_confirmados": string[] | null,
  "equipamiento_detectado": string[] | null
}`;
}

async function callHaiku(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.content[0].text;
}

async function main() {
  console.log('Testing prompt v2.0 alquiler against Haiku...\n');
  for (const tc of testCases) {
    const prompt = buildPrompt(tc);
    console.log(`=== ID ${tc.id}: "${tc.nombre_regex || '(null)'}" | zona: ${tc.zona} ===`);
    console.log(`  v1.3 actual: nombre="${tc.nombre_regex}", dorms=${tc.dorms}`);
    try {
      const result = await callHaiku(prompt);
      const match = result.match(/\{[\s\S]*\}/);
      const json = JSON.parse(match ? match[0] : result);
      console.log(`  v2.0 haiku:  nombre="${json.nombre_edificio}" (${json.nombre_edificio_confianza}), dorms=${json.dormitorios} (${json.dormitorios_confianza})`);
      console.log(`               amoblado=${json.amoblado}, banos=${json.banos}`);

      // Compare
      const nombre_changed = json.nombre_edificio !== tc.nombre_regex;
      const dorms_changed = String(json.dormitorios) !== String(tc.dorms);
      if (nombre_changed) console.log(`  >> NOMBRE CHANGED: "${tc.nombre_regex}" -> "${json.nombre_edificio}"`);
      if (dorms_changed) console.log(`  >> DORMS CHANGED: ${tc.dorms} -> ${json.dormitorios}`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
    console.log('');
    await new Promise(r => setTimeout(r, 1500));
  }
}

main();
