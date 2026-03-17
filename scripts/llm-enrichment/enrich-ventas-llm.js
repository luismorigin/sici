#!/usr/bin/env node
/**
 * LLM Enrichment para Ventas — Script Standalone v2.0
 *
 * Uso:
 *   node scripts/llm-enrichment/enrich-ventas-llm.js [--ids 30,35,43] [--limit 10] [--dry-run]
 *   node scripts/llm-enrichment/enrich-ventas-llm.js --model sonnet --limit 50
 *   node scripts/llm-enrichment/enrich-ventas-llm.js --save-to-db --limit 30
 *
 * Flags:
 *   --ids=30,35       Procesar IDs específicos
 *   --limit=N         Número de propiedades (default: 30)
 *   --dry-run         Solo construir prompts, no llamar API
 *   --print-prompt    Con --dry-run, imprime el prompt completo en consola
 *   --model=haiku     Modelo: haiku (default) o sonnet
 *   --save-to-db      Guardar resultado en BD vía registrar_enrichment_venta_llm()
 *   --version=v4.0    Etiqueta de versión (default: v4.0)
 *
 * Requiere:
 *   ANTHROPIC_API_KEY en .env.local o variable de entorno
 *   Supabase credentials en simon-mvp/.env.local
 */

const path = require('path');
const fs = require('fs');

// Load env from simon-mvp/.env.local
const envPath = path.join(__dirname, '..', '..', 'simon-mvp', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx);
      const value = trimmed.slice(idx + 1);
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

// Use supabase from simon-mvp node_modules
const supabasePath = path.join(__dirname, '..', '..', 'simon-mvp', 'node_modules', '@supabase', 'supabase-js');
const { createClient } = require(supabasePath);

// ═══════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
};

const MAX_TOKENS = 1500;
const TEMPERATURE = 0;
const MAX_CONTENT_LENGTH = 3000;

// Parse args
const args = process.argv.slice(2);
const idsArg = args.find(a => a.startsWith('--ids='));
const limitArg = args.find(a => a.startsWith('--limit='));
const modelArg = args.find(a => a.startsWith('--model='));
const versionArg = args.find(a => a.startsWith('--version='));
const dryRun = args.includes('--dry-run');
const printPrompt = args.includes('--print-prompt');
const shouldSaveToDb = args.includes('--save-to-db');
const specificIds = idsArg ? idsArg.split('=')[1].split(',').map(Number) : null;
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 30;
const modelKey = modelArg ? modelArg.split('=')[1] : 'haiku';
const MODEL = MODELS[modelKey] || MODELS.haiku;
const VERSION = versionArg ? versionArg.split('=')[1] : 'v4.0';
const ITERATION = VERSION + '-' + modelKey + '-' + new Date().toISOString().slice(0, 10);

// ═══════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════
// ANTHROPIC API
// ═══════════════════════════════════════

async function callAnthropic(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return {
    text: data.content?.[0]?.text || '',
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

// ═══════════════════════════════════════
// FETCH PROPERTIES
// ═══════════════════════════════════════

async function fetchProperties() {
  let query = supabase
    .from('propiedades_v2')
    .select(`
      id, url, fuente, zona, nombre_edificio, estado_construccion,
      precio_usd, tipo_cambio_detectado, depende_de_tc, moneda_original,
      parqueo_incluido, area_total_m2, dormitorios, banos, estacionamientos,
      id_proyecto_master, piso, baulera,
      plan_pagos_desarrollador, descuento_contado_pct, acepta_permuta,
      precio_negociable, solo_tc_paralelo, parqueo_precio_adicional,
      baulera_incluido, baulera_precio_adicional,
      datos_json_enrichment
    `)
    .eq('tipo_operacion', 'venta')
    .in('status', ['completado', 'actualizado']);

  if (specificIds) {
    query = query.in('id', specificIds);
  } else {
    query = query.gte('area_total_m2', 20).limit(limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data || [];
}

async function fetchProyectosMaster(zona) {
  if (!zona) return [];
  const { data, error } = await supabase
    .from('proyectos_master')
    .select('id_proyecto_master, nombre_oficial')
    .eq('zona', zona)
    .eq('activo', true);
  if (error) {
    console.warn(`  Warning: Error fetching proyectos for zona ${zona}: ${error.message}`);
    return [];
  }
  return data || [];
}

// ═══════════════════════════════════════
// BUILD PROMPT v4.0
// ═══════════════════════════════════════

const NOMBRE_BASURA = ['venta', 'pre venta', 'preventa', 'departamento', 'en venta', ''];

function buildPrompt(prop, proyectos) {
  const enrichment = prop.datos_json_enrichment || {};
  const descripcion = enrichment.descripcion || '';
  const contenido = descripcion.substring(0, MAX_CONTENT_LENGTH);

  if (!contenido || contenido.length < 30) {
    return null; // Skip — no content to analyze
  }

  const pmList = proyectos.map(p => `- ${p.nombre_oficial} (ID ${p.id_proyecto_master})`).join('\n');

  const nombreEdificioRaw = prop.nombre_edificio || '';
  const nombreEdificio = NOMBRE_BASURA.includes(nombreEdificioRaw.toLowerCase().trim())
    ? 'no detectado'
    : nombreEdificioRaw;

  // Extract titulo_anuncio and ubicacion_detalle from enrichment data if available
  const tituloAnuncio = enrichment.titulo_anuncio || enrichment.titulo || '';
  const ubicacionDetalle = enrichment.ubicacion_detalle || enrichment.ubicacion || '';

  return `Eres un extractor de datos inmobiliarios para Santa Cruz de la Sierra, Bolivia.
Extraes datos de páginas web de propiedades en VENTA.
REGLA ABSOLUTA: NUNCA inventes datos. Si no aparece en el texto, devuelve null.

═══════════════════════════════════════
TÍTULO DEL ANUNCIO:
${tituloAnuncio || '(no disponible)'}

UBICACIÓN:
${ubicacionDetalle || '(no disponible)'}

DATOS PORTAL (metadata estructurada del portal — confiables):
- URL: ${prop.url || 'desconocida'}
- Fuente: ${prop.fuente || 'desconocida'}
- Precio: $${prop.precio_usd || '?'} USD (moneda original: ${prop.moneda_original || 'desconocida'})
- Área: ${prop.area_total_m2 ? prop.area_total_m2 + ' m²' : 'desconocida'}
- Dormitorios (portal): ${prop.dormitorios ?? 'desconocido'}
- Baños (portal): ${prop.banos ?? 'desconocido'}

DATOS EXTRACTOR (regex — pueden tener errores):
- Nombre edificio: ${nombreEdificio}
- Estado construcción: ${prop.estado_construccion || 'no detectado'}
- Tipo cambio: ${prop.tipo_cambio_detectado || 'no detectado'}
- Zona GPS: ${prop.zona || 'desconocida'}

PROYECTOS CONOCIDOS EN ZONA ${prop.zona || '?'}:
${pmList || '(sin proyectos cargados)'}

DESCRIPCIÓN:
${contenido}
═══════════════════════════════════════

INSTRUCCIONES POR CAMPO:
═══════════════════════════════════════

PRIORIDAD: Si título/ubicación/descripción CONTRADICE un dato portal o extractor, usar la evidencia del texto. Si no hay contradicción, mantener el dato existente.

NOMBRE_EDIFICIO:
- Buscá el nombre del edificio/condominio/proyecto en título, ubicación y descripción
- Compará contra la lista de PROYECTOS CONOCIDOS de arriba
- Si encontrás match (incluso parcial: "Edif Nomad" → "Nomad by Smart Studio"), usá el nombre oficial de la lista
- Si no hay match pero el texto tiene un nombre claro, devolvelo tal cual
- Si no hay nombre en el texto, devolvé null
- NUNCA devolver: "Venta", "Pre Venta", "Departamento", fragmentos de oraciones

DORMITORIOS:
- Buscar en título/descripción: "monoambiente", "studio", "loft" = 0 dormitorios
- "1 dormitorio", "1 dorm", "1 hab" = 1
- Si el portal dice 1 pero el texto dice "monoambiente" o "studio" → usar 0
- Si el portal dice un número y el texto no lo contradice → mantener el del portal
- Rango válido: 0-6

BAÑOS:
- Buscar en título/descripción cantidad de baños
- "medio baño" o "toilette" cuenta como 0.5
- Si el portal dice un número y el texto no lo contradice → mantener el del portal
- Rango válido: 0-6

ESTADO_CONSTRUCCION:
- Solo 2 valores válidos:
  - "preventa": "precios desde", "entrega [fecha futura]", "en construcción", "obra gruesa", "avance X%", fecha de entrega futura
  - "entrega_inmediata": "listo para vivir", "entrega inmediata", "listo para ocupar", "a estrenar", inmueble terminado
- Si no hay evidencia clara → null
- CUIDADO: "amoblado" o "equipado" SOLOS no implican entrega_inmediata

TIPO_CAMBIO_DETECTADO:
- "paralelo": "TC paralelo", "al paralelo", "dólares o paralelo", "solo dólares", "tc del día", "pago en dólares", "blue", "dólar blue", "al blue", "USDT", "cripto"
- "oficial": "TC 7", "al cambio Bs.7", "TC oficial", "tipo de cambio 7", precio listado SOLO en Bs/bolivianos sin mención de USD
- "no_especificado": si no hay mención de TC ni forma de pago. NUNCA devolver null — usar "no_especificado"
- CLAVE: "solo dólares", "pago en dólares", "blue", "dólar blue", "USDT", "cripto" = PARALELO
- CLAVE: "TC 7" o "cambio 6.96" = OFICIAL
- CLAVE: Precio en "Bs" o "bolivianos" sin mención de dólares = OFICIAL (tasa BCB fija)
- CLAVE: "$us X" sin más contexto = "no_especificado" (moneda sola no indica TC)

PARQUEO_INCLUIDO:
- true: "incluye parqueo", "con parqueo" sin precio aparte
- false: "Parqueo: $us X" (precio explícito) O no se menciona parqueo en absoluto
- null: SOLO si "parqueo" aparece en áreas comunes sin detalle de inclusión
- DEFAULT: false (si no hay info de parqueo)

BAULERA_INCLUIDA:
- true: "incluye baulera", "con baulera" sin precio aparte
- false: si no se menciona baulera, o precio explícito por baulera
- DEFAULT: false (si no hay info de baulera)

ES_MULTIPROYECTO:
- true: el anuncio NO tiene precio + área + dormitorios definidos en DATOS PORTAL simultáneamente, Y la descripción habla del proyecto en general sin identificar una unidad específica
- false: si DATOS PORTAL tiene precio, área Y dormitorios definidos → siempre false, aunque la descripción mencione otras tipologías del mismo proyecto
- DEFAULT: false
- CLAVE: "departamentos de 1 y 2 dormitorios" en descripción con metadata completa = false (es una unidad específica con texto genérico del proyecto)
- CLAVE: solo marcar true cuando faltan 2 o más de estos 3 datos en metadata: precio, área, dormitorios

PLAN_PAGOS:
- tiene_plan_pagos: true si cuotas/financiamiento, false si solo contado o no hay info. DEFAULT: false
- plan_pagos_texto: resumen breve de condiciones, null si no hay info
- descuento_contado_pct: porcentaje de descuento por pago contado, null si no se menciona
- acepta_permuta: true si menciona permuta/canje, false si no. DEFAULT: false
- precio_negociable: true si "negociable"/"escucha ofertas", false si no. DEFAULT: false
- solo_tc_paralelo: true si la descripción menciona dólares o TC paralelo como forma de pago, en cualquier combinación. DEFAULT: false
- true: "pago en dólares", "solo dólares", "TC paralelo", "dólares o paralelo", "dólares y/o paralelo", "$us X (dolares)", "(TC paralelo)"
- false: solo si acepta explícitamente bolivianos o TC oficial como alternativa. Ej: "dólares o bolivianos", "se acepta Bs", "al cambio oficial"
- CLAVE: cualquier mención de dólares/paralelo SIN mención de bolivianos/oficial = true
- CLAVE: si no hay info de forma de pago = false (default)

AMENITIES y EQUIPAMIENTO:
- Solo lo que el texto CONFIRME explícitamente
- NUNCA inferir Pet Friendly, Sauna, etc. sin mención explícita

═══════════════════════════════════════

Devuelve SOLO este JSON (sin explicaciones, sin markdown):
{
  "nombre_edificio": string | null,
  "nombre_edificio_confianza": "alta" | "media" | "baja" | null,
  "dormitorios": number | null,
  "dormitorios_confianza": "alta" | "media" | "baja" | null,
  "banos": number | null,
  "estado_construccion": "entrega_inmediata" | "preventa" | null,
  "estado_construccion_confianza": "alta" | "media" | "baja" | null,
  "fecha_entrega_estimada": string | null,
  "es_multiproyecto": boolean | null,
  "tipo_cambio_detectado": "paralelo" | "oficial" | "no_especificado",
  "tipo_cambio_confianza": "alta" | "media" | "baja" | null,
  "piso": number | null,
  "parqueo_incluido": boolean | null,
  "parqueo_precio_adicional_usd": number | null,
  "baulera_incluida": boolean | null,
  "baulera_precio_adicional_usd": number | null,
  "plan_pagos": {
    "tiene_plan_pagos": boolean | null,
    "plan_pagos_texto": string | null,
    "descuento_contado_pct": number | null,
    "acepta_permuta": boolean | null,
    "precio_negociable": boolean | null,
    "solo_tc_paralelo": boolean | null
  },
  "descripcion_limpia": string,
  "amenities_confirmados": string[],
  "equipamiento_detectado": string[]
}`;
}

// ═══════════════════════════════════════
// PARSE & VALIDATE
// ═══════════════════════════════════════

const VALID_ESTADOS = ['entrega_inmediata', 'preventa'];
const VALID_TC = ['paralelo', 'oficial', 'no_especificado'];
const VALID_CONFIANZA = ['alta', 'media', 'baja'];

function parseAndValidate(text) {
  const errores = [];

  // Extract JSON
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  } else {
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) jsonStr = braceMatch[0];
  }

  let datos;
  try {
    datos = JSON.parse(jsonStr);
  } catch (e) {
    return { datos: null, errores: ['json_parse_error: ' + e.message], requiere_revision: true, parseError: true };
  }

  // Validate estado_construccion (v4.0: only 2 valid values)
  if (datos.estado_construccion && !VALID_ESTADOS.includes(datos.estado_construccion)) {
    errores.push(`estado_construccion_invalido: ${datos.estado_construccion}`);
    datos.estado_construccion = null;
  }

  // Validate tipo_cambio_detectado
  if (datos.tipo_cambio_detectado && !VALID_TC.includes(datos.tipo_cambio_detectado)) {
    errores.push(`tipo_cambio_invalido: ${datos.tipo_cambio_detectado}`);
    datos.tipo_cambio_detectado = null;
  }

  // Validate confianza fields
  for (const field of ['nombre_edificio_confianza', 'estado_construccion_confianza', 'tipo_cambio_confianza', 'dormitorios_confianza']) {
    if (datos[field] && !VALID_CONFIANZA.includes(datos[field])) {
      datos[field] = null;
    }
  }

  // Validate dormitorios (v4.0: new field)
  if (datos.dormitorios !== null && datos.dormitorios !== undefined) {
    if (datos.dormitorios < 0 || datos.dormitorios > 6) {
      errores.push(`dormitorios_fuera_rango: ${datos.dormitorios}`);
      datos.dormitorios = null;
    }
  }

  // Validate banos (v4.0: new field)
  if (datos.banos !== null && datos.banos !== undefined) {
    if (datos.banos < 0 || datos.banos > 6) {
      errores.push(`banos_fuera_rango: ${datos.banos}`);
      datos.banos = null;
    }
  }

  // Validate piso
  if (datos.piso !== null && datos.piso !== undefined) {
    if (datos.piso < -2 || datos.piso > 40) {
      errores.push(`piso_fuera_rango: ${datos.piso}`);
      datos.piso = null;
    }
  }

  // Validate parqueo_precio_adicional_usd
  if (datos.parqueo_precio_adicional_usd !== null && datos.parqueo_precio_adicional_usd !== undefined) {
    if (datos.parqueo_precio_adicional_usd < 0 || datos.parqueo_precio_adicional_usd > 50000) {
      errores.push(`parqueo_precio_fuera_rango: ${datos.parqueo_precio_adicional_usd}`);
      datos.parqueo_precio_adicional_usd = null;
    }
  }

  // Validate baulera_precio_adicional_usd
  if (datos.baulera_precio_adicional_usd !== null && datos.baulera_precio_adicional_usd !== undefined) {
    if (datos.baulera_precio_adicional_usd < 0 || datos.baulera_precio_adicional_usd > 20000) {
      errores.push(`baulera_precio_fuera_rango: ${datos.baulera_precio_adicional_usd}`);
      datos.baulera_precio_adicional_usd = null;
    }
  }

  // Validate plan_pagos.descuento_contado_pct
  if (datos.plan_pagos?.descuento_contado_pct !== null && datos.plan_pagos?.descuento_contado_pct !== undefined) {
    if (datos.plan_pagos.descuento_contado_pct < 0 || datos.plan_pagos.descuento_contado_pct > 30) {
      errores.push(`descuento_fuera_rango: ${datos.plan_pagos.descuento_contado_pct}`);
      datos.plan_pagos.descuento_contado_pct = null;
    }
  }

  // Ensure arrays
  if (!Array.isArray(datos.amenities_confirmados)) datos.amenities_confirmados = [];
  if (!Array.isArray(datos.equipamiento_detectado)) datos.equipamiento_detectado = [];

  const requiere_revision = errores.length > 2;

  return { datos, errores, requiere_revision };
}

// ═══════════════════════════════════════
// COMPARE LLM vs BD
// ═══════════════════════════════════════

function compareLlmVsBd(prop, llmData) {
  const comparisons = [];

  const fields = [
    { campo: 'nombre_edificio', bd: prop.nombre_edificio, llm: llmData.nombre_edificio, confianza: llmData.nombre_edificio_confianza },
    { campo: 'dormitorios', bd: prop.dormitorios, llm: llmData.dormitorios, confianza: llmData.dormitorios_confianza },
    { campo: 'banos', bd: prop.banos, llm: llmData.banos, confianza: null },
    { campo: 'estado_construccion', bd: prop.estado_construccion, llm: llmData.estado_construccion, confianza: llmData.estado_construccion_confianza },
    { campo: 'tipo_cambio_detectado', bd: prop.tipo_cambio_detectado, llm: llmData.tipo_cambio_detectado, confianza: llmData.tipo_cambio_confianza },
    { campo: 'piso', bd: prop.piso, llm: llmData.piso, confianza: null },
    { campo: 'parqueo_incluido', bd: prop.parqueo_incluido, llm: llmData.parqueo_incluido, confianza: null },
    { campo: 'parqueo_precio_adicional', bd: prop.parqueo_precio_adicional, llm: llmData.parqueo_precio_adicional_usd, confianza: null },
    { campo: 'baulera', bd: prop.baulera, llm: llmData.baulera_incluida, confianza: null },
    { campo: 'baulera_precio_adicional', bd: prop.baulera_precio_adicional, llm: llmData.baulera_precio_adicional_usd, confianza: null },
    { campo: 'plan_pagos_desarrollador', bd: prop.plan_pagos_desarrollador, llm: llmData.plan_pagos?.tiene_plan_pagos, confianza: null },
    { campo: 'descuento_contado_pct', bd: prop.descuento_contado_pct, llm: llmData.plan_pagos?.descuento_contado_pct, confianza: null },
    { campo: 'acepta_permuta', bd: prop.acepta_permuta, llm: llmData.plan_pagos?.acepta_permuta, confianza: null },
    { campo: 'precio_negociable', bd: prop.precio_negociable, llm: llmData.plan_pagos?.precio_negociable, confianza: null },
    { campo: 'solo_tc_paralelo', bd: prop.solo_tc_paralelo, llm: llmData.plan_pagos?.solo_tc_paralelo, confianza: null },
    { campo: 'fecha_entrega_estimada', bd: null, llm: llmData.fecha_entrega_estimada, confianza: null },
    { campo: 'es_multiproyecto', bd: null, llm: llmData.es_multiproyecto, confianza: null },
  ];

  for (const f of fields) {
    const bdStr = f.bd === null || f.bd === undefined ? 'NULL' : String(f.bd);
    const llmStr = f.llm === null || f.llm === undefined ? 'NULL' : String(f.llm);

    let veredicto;
    if (bdStr === llmStr) {
      veredicto = 'igual';
    } else if (bdStr === 'NULL' && llmStr !== 'NULL') {
      veredicto = 'llm_agrega'; // LLM fills a gap
    } else if (bdStr !== 'NULL' && llmStr === 'NULL') {
      veredicto = 'llm_no_detecta'; // LLM misses something BD has
    } else {
      veredicto = 'llm_difiere'; // Different values
    }

    comparisons.push({
      campo: f.campo,
      valor_bd: bdStr,
      valor_llm: llmStr,
      confianza_llm: f.confianza || null,
      veredicto,
    });
  }

  return comparisons;
}

// ═══════════════════════════════════════
// SAVE TO DB (--save-to-db flag)
// ═══════════════════════════════════════

async function saveToDb(propId, datos, tokensUsados, requiereRevision, errores) {
  const { data, error } = await supabase.rpc('registrar_enrichment_venta_llm', {
    p_id: propId,
    p_datos_llm: datos,
    p_modelo_usado: MODEL,
    p_tokens_usados: tokensUsados,
    p_requiere_revision: requiereRevision,
    p_errores_validacion: errores.length > 0 ? errores : null,
  });

  if (error) {
    console.log(`  DB Error: ${error.message}`);
    return false;
  }

  const result = data;
  if (result?.success) {
    console.log(`  DB: saved (mode=${result.modo})`);
    return true;
  } else {
    console.log(`  DB: failed — ${result?.error || 'unknown'}`);
    return false;
  }
}

// ═══════════════════════════════════════
// SAVE RESULTS TO LOCAL JSON
// ═══════════════════════════════════════

const allTestResults = [];
const perPropertyResults = [];

function recordTestResult(propId, campo, valorBd, valorLlm, confianzaLlm, portal, veredicto) {
  allTestResults.push({
    id_propiedad: propId,
    campo,
    valor_actual_bd: valorBd,
    valor_llm: valorLlm,
    confianza_llm: confianzaLlm,
    portal,
    iteracion: ITERATION,
    veredicto,
    timestamp: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  LLM Enrichment Ventas — Test Runner v2.0');
  console.log('═══════════════════════════════════════');
  console.log(`  Model: ${MODEL} (${modelKey})`);
  console.log(`  Prompt: v4.0`);
  console.log(`  Iteration: ${ITERATION}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Save to DB: ${shouldSaveToDb}`);
  console.log(`  Specific IDs: ${specificIds ? specificIds.join(', ') : 'none (random ' + limit + ')'}`);
  console.log('');

  if (!ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set. Add it to simon-mvp/.env.local or environment.');
    process.exit(1);
  }

  // 1. Fetch properties
  console.log('-> Fetching properties...');
  const props = await fetchProperties();
  console.log(`  Found ${props.length} properties`);

  if (props.length === 0) {
    console.log('No properties to process. Exiting.');
    return;
  }

  // 2. Cache proyectos_master by zona
  const pmCache = {};
  const zonas = [...new Set(props.map(p => p.zona).filter(Boolean))];
  console.log(`-> Fetching proyectos_master for ${zonas.length} zonas...`);
  for (const zona of zonas) {
    pmCache[zona] = await fetchProyectosMaster(zona);
    console.log(`  ${zona}: ${pmCache[zona].length} proyectos`);
  }

  // 3. Process each property
  const results = {
    total: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    savedToDb: 0,
    totalTokens: 0,
    comparisons: { igual: 0, llm_agrega: 0, llm_no_detecta: 0, llm_difiere: 0 },
    byField: {},
  };

  for (const prop of props) {
    results.total++;
    const proyectos = pmCache[prop.zona] || [];

    console.log(`\n[${results.total}/${props.length}] ID ${prop.id} | ${prop.fuente} | ${prop.zona || 'sin zona'}`);

    // Build prompt
    const prompt = buildPrompt(prop, proyectos);
    if (!prompt) {
      console.log('  Skip — no content');
      results.skipped++;
      continue;
    }

    if (dryRun) {
      if (printPrompt) {
        console.log('\n--- PROMPT START ---');
        console.log(prompt);
        console.log('--- PROMPT END ---\n');
      } else {
        console.log('  Dry run — prompt built (' + prompt.length + ' chars)');
      }
      results.skipped++;
      continue;
    }

    // Call LLM
    try {
      console.log('  Calling Anthropic...');
      const start = Date.now();
      const response = await callAnthropic(prompt);
      const elapsed = Date.now() - start;
      const totalTokens = response.inputTokens + response.outputTokens;
      results.totalTokens += totalTokens;
      console.log(`  Response in ${elapsed}ms (${response.inputTokens}+${response.outputTokens} tokens)`);

      // Parse & validate
      const { datos, errores, requiere_revision } = parseAndValidate(response.text);
      if (!datos) {
        console.log('  Parse failed:', errores.join(', '));
        if (shouldSaveToDb) {
          await saveToDb(prop.id, null, totalTokens, true, errores);
        }
        results.errors++;
        continue;
      }
      if (errores.length > 0) {
        console.log(`  ${errores.length} validation errors: ${errores.join(', ')}`);
      }
      if (requiere_revision) {
        console.log('  Requires revision (>2 errors)');
      }

      // Save to DB if flag is set
      if (shouldSaveToDb) {
        const saved = await saveToDb(prop.id, datos, totalTokens, requiere_revision, errores);
        if (saved) results.savedToDb++;
      }

      // Compare LLM vs BD
      const comparisons = compareLlmVsBd(prop, datos);

      // Store per-property detail
      perPropertyResults.push({
        id: prop.id,
        fuente: prop.fuente,
        zona: prop.zona,
        url: prop.url,
        llm_raw: datos,
        errores_validacion: errores,
        requiere_revision,
        tokens: { input: response.inputTokens, output: response.outputTokens },
        elapsed_ms: elapsed,
        comparisons,
      });

      // Log key findings
      for (const c of comparisons) {
        if (c.veredicto === 'llm_agrega') {
          console.log(`  + ${c.campo}: NULL -> ${c.valor_llm} (${c.confianza_llm || '-'})`);
        } else if (c.veredicto === 'llm_difiere') {
          console.log(`  ~ ${c.campo}: ${c.valor_bd} -> ${c.valor_llm} (${c.confianza_llm || '-'})`);
        }

        // Aggregate stats
        results.comparisons[c.veredicto]++;
        if (!results.byField[c.campo]) {
          results.byField[c.campo] = { igual: 0, llm_agrega: 0, llm_no_detecta: 0, llm_difiere: 0 };
        }
        results.byField[c.campo][c.veredicto]++;

        // Save to test results
        recordTestResult(
          prop.id, c.campo, c.valor_bd, c.valor_llm,
          c.confianza_llm, prop.fuente, c.veredicto
        );
      }

      // Save descripcion_limpia and arrays too
      if (datos.descripcion_limpia) {
        recordTestResult(prop.id, 'descripcion_limpia', 'NULL', datos.descripcion_limpia, null, prop.fuente, 'llm_agrega');
      }
      if (datos.amenities_confirmados?.length > 0) {
        const enrichAmenities = (prop.datos_json_enrichment?.amenities || []).join(', ');
        recordTestResult(prop.id, 'amenities', enrichAmenities || 'NULL', datos.amenities_confirmados.join(', '), null, prop.fuente, enrichAmenities ? 'llm_difiere' : 'llm_agrega');
      }
      if (datos.equipamiento_detectado?.length > 0) {
        const enrichEquip = (prop.datos_json_enrichment?.equipamiento || []).join(', ');
        recordTestResult(prop.id, 'equipamiento', enrichEquip || 'NULL', datos.equipamiento_detectado.join(', '), null, prop.fuente, enrichEquip ? 'llm_difiere' : 'llm_agrega');
      }

      results.processed++;

      // Rate limit — 2s between calls
      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      console.log(`  Error: ${err.message}`);
      results.errors++;
    }
  }

  // 4. Print summary
  console.log('\n═══════════════════════════════════════');
  console.log('  RESUMEN');
  console.log('═══════════════════════════════════════');
  console.log(`  Model: ${MODEL} (${modelKey})`);
  console.log(`  Total: ${results.total}`);
  console.log(`  Processed: ${results.processed}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Errors: ${results.errors}`);
  if (shouldSaveToDb) {
    console.log(`  Saved to DB: ${results.savedToDb}`);
  }
  console.log(`  Total tokens: ${results.totalTokens}`);

  // Cost calculation based on model
  let costPerInputToken, costPerOutputToken;
  if (modelKey === 'sonnet') {
    costPerInputToken = 3 / 1_000_000;   // $3/MTok
    costPerOutputToken = 15 / 1_000_000;  // $15/MTok
  } else {
    costPerInputToken = 0.80 / 1_000_000;  // $0.80/MTok
    costPerOutputToken = 4 / 1_000_000;    // $4/MTok
  }
  const totalInputTokens = perPropertyResults.reduce((s, p) => s + p.tokens.input, 0);
  const totalOutputTokens = perPropertyResults.reduce((s, p) => s + p.tokens.output, 0);
  const estCost = totalInputTokens * costPerInputToken + totalOutputTokens * costPerOutputToken;
  console.log(`  Est. cost: $${estCost.toFixed(4)}`);

  console.log('');
  console.log('  Comparisons:');
  console.log(`    Igual: ${results.comparisons.igual}`);
  console.log(`    LLM agrega (fills gap): ${results.comparisons.llm_agrega}`);
  console.log(`    LLM no detecta: ${results.comparisons.llm_no_detecta}`);
  console.log(`    LLM difiere: ${results.comparisons.llm_difiere}`);
  console.log('');
  console.log('  By Field:');
  for (const [field, stats] of Object.entries(results.byField)) {
    const total = stats.igual + stats.llm_agrega + stats.llm_no_detecta + stats.llm_difiere;
    const mejora = stats.llm_agrega + stats.llm_difiere;
    console.log(`    ${field.padEnd(30)} igual=${stats.igual} agrega=${stats.llm_agrega} no_detecta=${stats.llm_no_detecta} difiere=${stats.llm_difiere} | impacto=${((mejora/total)*100).toFixed(0)}%`);
  }

  // Save all outputs
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const summaryPath = path.join(outputDir, `test-results-${ITERATION}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`\n  Summary saved to: ${summaryPath}`);

  const detailPath = path.join(outputDir, `test-detail-${ITERATION}.json`);
  fs.writeFileSync(detailPath, JSON.stringify(allTestResults, null, 2));
  console.log(`  Detail rows saved to: ${detailPath} (${allTestResults.length} rows)`);

  const rawPath = path.join(outputDir, `test-raw-${ITERATION}.json`);
  fs.writeFileSync(rawPath, JSON.stringify(perPropertyResults, null, 2));
  console.log(`  Raw LLM output saved to: ${rawPath} (${perPropertyResults.length} props)`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
