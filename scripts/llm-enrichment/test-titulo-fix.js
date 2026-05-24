#!/usr/bin/env node
/**
 * Test de comportamiento del fix "poblar titulo_anuncio" (caso 1778 / SÖLO).
 *
 * Reproduce el prompt REAL de produccion (Build Prompt v4.0, flujo_enrichment_llm_venta)
 * con los datos reales de la prop 1778 (SÖLO Industrial Apartments, monoambiente de 33.57m²
 * que el portal Remax marca como number_bedrooms=1).
 *
 * Compara 3 escenarios, variando SOLO el titulo del anuncio:
 *   A) SIN titulo (estado actual)           -> esperado dormitorios = 1 (reproduce el bug)
 *   B) CON titulo real "(Monoambiente)"      -> esperado dormitorios = 0 (valida el fix)
 *   C) CON titulo neutro (sin la palabra)    -> esperado dormitorios = 1 (control: aisla la senial)
 *
 * El resto del prompt (descripcion cruda, datos portal, PM list) es identico en los 3.
 * NO toca produccion. Solo lee la API key y llama a Haiku 4.5.
 */

const path = require('path');
const fs = require('fs');

// Load env (misma fuente que test-discriminacion.js)
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

// ---- Datos REALES de la prop 1778 (de la BD + curl al detalle Remax) ----
const PROP = {
  url: 'https://remax.bo/propiedad/venta-departamento-santa-cruz-de-la-sierra-equipetrolnoroeste-120088024-630',
  fuente: 'remax',
  precio_usd: 65000,
  moneda_original: 'USD',
  area_total_m2: 33.57,
  dormitorios: 1,            // <- number_bedrooms del API Remax (Remax no tiene tipo "monoambiente")
  banos: 1,
  estado_construccion: 'no detectado',
  tipo_cambio_detectado: 'no detectado',
  zona: 'Equipetrol Centro',
};
const NOMBRE_EXTRACTOR = 'SÖLO Industrial Apartments';

// Descripcion cruda real (datos_json_enrichment->>'descripcion') — NO menciona "monoambiente" ni dorms
const DESCRIPCION = `SÖLO – Industrial Apartments es un edificio de diseño industrial contemporáneo ubicado en el corazón de Equipetrol, la zona de mayor valorización y demanda inmobiliaria de Santa Cruz.
Su arquitectura moderna, líneas limpias y materiales nobles le otorgan una identidad única dentro del mercado premium. Es un proyecto pensado tanto para vivir como para invertir, combinando estética, funcionalidad y ubicación estratégica.
Ubicación estratégica
Situado en Equipetrol, a pocos pasos de:
Centros empresariales
Restaurantes y cafés de primer nivel
Supermercados y servicios financieros
Principales vías de conexión
Una zona con alta demanda de alquiler ejecutivo y crecimiento sostenido de plusvalía.
Características del edificio
Departamentos de diseño eficiente y funcional
Excelente iluminación natural
Acabados de alta calidad
Concepto arquitectónico moderno e industrial
Edificio consolidado y listo para entrega
Ideal para:
✔ Inversión con renta inmediata
✔ Vivienda urbana en zona premium
✔ Ejecutivos y profesionales que priorizan ubicación
SÖLO no es solo un departamento, es una inversión inteligente en una de las zonas más sólidas y dinámicas del mercado inmobiliario cruceño.
Si desea más información, planos o agendar una visita, contáctenos.`;

// Lista PM reducida (incluye SÖLO; la lista solo afecta nombre_edificio, no dormitorios)
const PM_LIST = `- Domus Tower (ID 84)
- Sky Tower (ID 48)
- SÖLO Industrial Apartments (ID 64)
- Sky Plaza Italia (ID 280)
- Nomad by Smart Studio (ID 63)`;

// Titulos de cada escenario
const TITULOS = {
  'A_sin_titulo': '',                                                  // -> "(no disponible)"
  'B_con_monoambiente': 'DEPARTAMENTO EN VENTA EQUIPETROL (Monoambiente)', // titulo REAL del portal
  'C_neutro': 'DEPARTAMENTO EN VENTA EQUIPETROL',                      // control sin la palabra
};

// Prompt IDENTICO al de produccion (Build Prompt v4.0), recortado al schema relevante de dorms
function buildPrompt(titulo) {
  const ubicacion = '';
  const nombre = NOMBRE_EXTRACTOR;
  const prop = PROP;
  const descripcion = DESCRIPCION;
  const pmList = PM_LIST;
  return `Eres un extractor de datos inmobiliarios para Santa Cruz de la Sierra, Bolivia.
Extraes datos de páginas web de propiedades en VENTA.
REGLA ABSOLUTA: NUNCA inventes datos. Si no aparece en el texto, devuelve null.

═══════════════════════════════════════
TÍTULO DEL ANUNCIO:
${titulo || '(no disponible)'}

UBICACIÓN:
${ubicacion || '(no disponible)'}

DATOS PORTAL (metadata estructurada del portal — confiables):
- URL: ${prop.url || 'desconocida'}
- Fuente: ${prop.fuente || 'desconocida'}
- Precio: $${prop.precio_usd || '?'} USD (moneda original: ${prop.moneda_original || 'desconocida'})
- Área: ${prop.area_total_m2 ? prop.area_total_m2 + ' m²' : 'desconocida'}
- Dormitorios (portal): ${prop.dormitorios ?? 'desconocido'}
- Baños (portal): ${prop.banos ?? 'desconocido'}

DATOS EXTRACTOR (regex — pueden tener errores):
- Nombre edificio: ${nombre}
- Estado construcción: ${prop.estado_construccion || 'no detectado'}
- Tipo cambio: ${prop.tipo_cambio_detectado || 'no detectado'}
- Zona GPS: ${prop.zona || 'desconocida'}

PROYECTOS CONOCIDOS EN ZONA ${prop.zona || '?'}:
${pmList}

DESCRIPCIÓN:
${descripcion}
═══════════════════════════════════════

INSTRUCCIONES POR CAMPO:

PRIORIDAD: Si título/ubicación/descripción CONTRADICE un dato portal o extractor, usar la evidencia del texto. Si no hay contradicción, mantener el dato existente.

DORMITORIOS:
- Buscar en título/descripción: "monoambiente", "studio", "loft" = 0 dormitorios
- "1 dormitorio", "1 dorm", "1 hab" = 1
- Si el portal dice 1 pero el texto dice "monoambiente" o "studio" → usar 0
- Si el portal dice un número y el texto no lo contradice → mantener el del portal
- Rango válido: 0-6

Devuelve SOLO este JSON (sin explicaciones, sin markdown):
{
  "dormitorios": number | null,
  "dormitorios_confianza": "alta" | "media" | "baja" | null,
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
      max_tokens: 400,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text = data.content?.[0]?.text || '';
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { dormitorios: '??', razon: text.slice(0, 80) };
}

async function main() {
  if (!ANTHROPIC_API_KEY) { console.error('FALTA ANTHROPIC_API_KEY'); process.exit(1); }
  console.log('=== Test fix titulo_anuncio — prop 1778 SÖLO (monoambiente, portal dice 1) ===');
  console.log(`Modelo: ${MODEL} | temperature 0 | 3 corridas por escenario\n`);
  const N = 3;
  const resumen = {};
  for (const [esc, titulo] of Object.entries(TITULOS)) {
    console.log(`--- ${esc} | titulo="${titulo || '(no disponible)'}" ---`);
    const prompt = buildPrompt(titulo);
    const dorms = [];
    for (let i = 1; i <= N; i++) {
      const res = await callHaiku(prompt);
      dorms.push(res.dormitorios);
      console.log(`  run${i}: dormitorios=${res.dormitorios} (conf=${res.dormitorios_confianza}) | ${(res.razon||'').slice(0,90)}`);
    }
    resumen[esc] = dorms;
    console.log('');
  }
  console.log('=== RESUMEN (dormitorios por corrida) ===');
  for (const [esc, dorms] of Object.entries(resumen)) {
    console.log(`  ${esc}: [${dorms.join(', ')}]`);
  }
  console.log('\nEsperado: A=[1,1,1] (bug)  B=[0,0,0] (fix)  C=[1,1,1] (control)');
}

main().catch(e => { console.error(e); process.exit(1); });
