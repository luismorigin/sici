#!/usr/bin/env node
/**
 * Test del cambio de prompt — discriminación entre nombres similares
 *
 * Reproduce el bug de prop #1791 (Eurodesign Tower mal clasificada como Residences)
 * y compara prompt v4.0 (actual) vs v4.1 (con sección discriminación).
 */

const path = require('path');
const fs = require('fs');

// Load env
const envPath = path.join(__dirname, '..', '..', 'simon-mvp', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (t && !t.startsWith('#') && t.includes('=')) {
    const idx = t.indexOf('=');
    if (!process.env[t.slice(0, idx)]) process.env[t.slice(0, idx)] = t.slice(idx + 1);
  }
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

// Contexto exacto del día del bug (prop #1791)
const REGEX_EDIF_BUG = 'Eurodesign Equipetrol Calle Enrique Finot';
const DESC = `DEPARTAMENTO EN VENTA | TORRE EURODESIGN
Equipetrol | Calle Enrique Finot

Invierta en uno de los proyectos más prometedores y exclusivos de la zona premium de Santa Cruz.

- 1 recámara
- 48.50 m²
- Totalmente equipado
- Diseño moderno y acabados de alta gama
- Espacios diseñados para alquileres ejecutivos o Airbnb premium
- Servicios de primera clase
- Entrega: junio de 2027

Precio: USD 71.780

Tipo de cambio paralelo

La Torre Eurodesign combina una ubicación estratégica, baja densidad y un concepto exclusivo diseñado para quienes buscan vivir o invertir en un espacio con acceso limitado.

Ariel Husbch - Century 21 Azzero
69147715-69172499`;

// Lista COMPLETA de 93 proyectos Eq Centro (idéntica al workflow n8n)
const PROYECTOS_EQ_CENTRO = `- Aqua Tower (ID 37)
- Atrium (ID 42)
- Baruc II (ID 288)
- Bellini Suites Apartments (ID 301)
- CONDADO IV (ID 127)
- Condado Park V (ID 128)
- Condado VI Plaza Italia (ID 34)
- Condominio Altamar (ID 328)
- Condominio Eco Studios (ID 313)
- Condominio equipetrol (ID 134)
- Condominio Las Palmeras (ID 298)
- Condominio Sky Blue (ID 62)
- Condominio SKY LUXIA (ID 109)
- Condominio Sky Park View (ID 108)
- Condominio Stanza (ID 162)
- Condominio Sucumbe (ID 308)
- Condominio Toborochi (ID 309)
- Condominio ZENIT (ID 150)
- Domus Infinity (ID 18)
- Domus Insignia (ID 19)
- Domus Luxury (ID 73)
- Domus Tower (ID 84)
- Edificio Alpha (ID 322)
- Edificio Ariaa (ID 168)
- Edificio Aura Concept (ID 324)
- Edificio Baruc Uno (ID 147)
- Edificio Chronos (ID 114)
- Edificio Condado II (ID 60)
- Edificio Condado III (ID 125)
- Edificio Cristina (ID 317)
- Edificio Element (ID 303)
- Edificio Equipetrol Norte - Calle H (ID 88)
- Edificio Fragata (ID 92)
- Edificio Genz Sirari (ID 300)
- Edificio Gold (ID 89)
- Edificio Klug (ID 61)
- Edificio La Foret (ID 157)
- Edificio Lateris (ID 299)
- Edificio Macororó 11 (ID 218)
- Edificio Macororó 9 (ID 219)
- Edificio Malibú Friendly (ID 295)
- Edificio MURURE (ID 33)
- Edificio San Martin (ID 318)
- Edificio SHADDAI (ID 148)
- Edificio Sirari Deluxe (ID 302)
- Edificio Spazios (ID 13)
- Edificio Suites Los Laureles (ID 151)
- Edificio TORRE OASIS (ID 143)
- Eurodesign Residences (ID 297)
- Eurodesign Soho (ID 275)
- EURODESIGN TOWER (ID 113)
- Haus Equipetrol (ID 282)
- HH Chuubi (ID 49)
- HH Once Equipetrol (ID 12)
- Hotel Toborochi suites (ID 338)
- INMOBA TOWER (ID 131)
- La Boutique (ID 149)
- Luxe Suites (ID 9)
- Luxe Tower (ID 47)
- Macororo 12 (ID 28)
- Madero Residence (ID 278)
- Malibu Inside (ID 67)
- Nano Smart (ID 36)
- Nomad by Smart Studio (ID 63)
- OGA Vertical Homes (ID 161)
- Omnia Eco Lux (ID 304)
- Omnia Lux (ID 287)
- Portobello Green (ID 326)
- Portofino V (ID 75)
- Quartier Equipetrol (ID 26)
- Sky Collection Art Deco (ID 58)
- Sky Collection Equipetrol (ID 104)
- Sky Elite (ID 7)
- Sky Icon (ID 276)
- Sky Level (ID 16)
- Sky Onix (ID 323)
- Sky Plaza Italia (ID 280)
- Sky Tower (ID 48)
- SMART STUDIO EQUIPE 1.0 (ID 265)
- Smart studio Equipe 3.0 (ID 121)
- SÖLO Industrial Apartments (ID 64)
- Sommet Quartier Plaza Italia (ID 102)
- Spazios Edén (ID 3)
- SPERANTO RESIDENZE (ID 283)
- T-VEINTICINCO (ID 255)
- Tamarindo (ID 31)
- TERRAZO (ID 256)
- TORRE ARA (ID 253)
- Torre Real (ID 334)
- Torre Suant Isuto (ID 341)
- Torres Isuto (ID 29)
- Uptown NUU (ID 54)
- Yotau All Suites Hotel (ID 307)`;

function buildPromptBase(version) {
  const discriminacionV41 = version === 'v4.1' ? `

DISCRIMINACIÓN ENTRE NOMBRES SIMILARES (CRÍTICO):
- Si encontrás VARIOS proyectos en la lista con la misma palabra raíz (ej: "Eurodesign Tower", "Eurodesign Residences", "Eurodesign Soho"), DEBES usar la palabra DISCRIMINADORA (Tower/Residences/Soho/Le Blanc/Nordic/Suites) del texto para elegir el correcto.
- "TORRE" en español = "TOWER" en inglés. Match equivalentes.
- Si el texto solo dice la palabra raíz sin discriminador, devolvé null con confianza baja. NUNCA elijas uno por defecto.
- NUNCA hagas match parcial cuando hay ambigüedad entre proyectos similares.

Ejemplos:
- Texto dice "TORRE EURODESIGN" → match con "EURODESIGN TOWER" (Tower=Torre)
- Texto dice "EURODESIGN SOHO" → match con "Eurodesign Soho"
- Texto dice "EURODESIGN" solo → null con confianza baja
- Texto dice "Sky Elite" → "Sky Elite" (NO "Sky Eclipse" ni "Sky Moon")` : '';

  return `Eres un extractor de datos inmobiliarios para Santa Cruz de la Sierra, Bolivia.
Extraes datos de páginas web de propiedades en VENTA.
REGLA ABSOLUTA: NUNCA inventes datos. Si no aparece en el texto, devuelve null.

═══════════════════════════════════════
DATOS PORTAL:
- URL: https://c21.com.bo/propiedad/109190_departamento-en-preventa-torre-eurodesign-equipetrol-calle-enrique-finot
- Fuente: century21
- Precio: $71780 USD (moneda original: BOB)
- Área: 48.5 m²
- Dormitorios (portal): 1

DATOS EXTRACTOR (regex — pueden tener errores):
- Nombre edificio: ${REGEX_EDIF_BUG}
- Estado construcción: preventa
- Tipo cambio: paralelo
- Zona GPS: Equipetrol Centro

PROYECTOS CONOCIDOS EN ZONA Equipetrol Centro:
${PROYECTOS_EQ_CENTRO}

DESCRIPCIÓN:
${DESC}
═══════════════════════════════════════

INSTRUCCIONES POR CAMPO:

NOMBRE_EDIFICIO:
- Buscá el nombre del edificio/condominio/proyecto en título, ubicación y descripción
- Compará contra la lista de PROYECTOS CONOCIDOS de arriba
- Si encontrás match (incluso parcial: "Edif Nomad" → "Nomad by Smart Studio"), usá el nombre oficial de la lista
- Si no hay match pero el texto tiene un nombre claro, devolvelo tal cual
- Si no hay nombre en el texto, devolvé null
- NUNCA devolver: "Venta", "Pre Venta", "Departamento", fragmentos de oraciones${discriminacionV41}

Devuelve SOLO este JSON:
{
  "nombre_edificio": string | null,
  "nombre_edificio_confianza": "alta" | "media" | "baja" | null,
  "razon": string
}`;
}

async function callHaiku(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return {
    parsed: jsonMatch ? JSON.parse(jsonMatch[0]) : null,
    raw: text,
    tokens: data.usage,
  };
}

async function main() {
  console.log('═══ Test discriminación prompt ventas — bug Eurodesign Tower ═══\n');
  console.log(`Input regex (basura del día del bug): "${REGEX_EDIF_BUG}"`);
  console.log(`Esperado: "EURODESIGN TOWER" o null/baja\n`);

  // 3 corridas con cada prompt para detectar variabilidad
  const N_RUNS = 3;
  const results = { v40: [], v41: [] };

  for (const version of ['v4.0', 'v4.1']) {
    console.log(`\n━━━ Prompt ${version} ━━━`);
    const prompt = buildPromptBase(version);
    for (let i = 1; i <= N_RUNS; i++) {
      const r = await callHaiku(prompt);
      console.log(`Run ${i}: ${r.parsed?.nombre_edificio} (conf=${r.parsed?.nombre_edificio_confianza})`);
      console.log(`        razón: ${r.parsed?.razon}`);
      results[version === 'v4.0' ? 'v40' : 'v41'].push(r.parsed);
    }
  }

  console.log('\n═══ RESUMEN ═══');
  console.log(`v4.0 (actual): ${results.v40.map(r => r?.nombre_edificio).join(' | ')}`);
  console.log(`v4.1 (nuevo):  ${results.v41.map(r => r?.nombre_edificio).join(' | ')}`);

  const v40ResidencesCount = results.v40.filter(r => r?.nombre_edificio === 'Eurodesign Residences').length;
  const v40TowerCount = results.v40.filter(r => r?.nombre_edificio === 'EURODESIGN TOWER').length;
  const v41ResidencesCount = results.v41.filter(r => r?.nombre_edificio === 'Eurodesign Residences').length;
  const v41TowerCount = results.v41.filter(r => r?.nombre_edificio === 'EURODESIGN TOWER').length;

  console.log(`\nv4.0: ${v40TowerCount}/${N_RUNS} Tower (correcto), ${v40ResidencesCount}/${N_RUNS} Residences (bug)`);
  console.log(`v4.1: ${v41TowerCount}/${N_RUNS} Tower (correcto), ${v41ResidencesCount}/${N_RUNS} Residences (bug)`);
}

main().catch(e => { console.error(e); process.exit(1); });
