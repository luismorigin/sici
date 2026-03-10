#!/usr/bin/env node
/**
 * LLM Enrichment para Ventas — Script Standalone v1.0
 *
 * Uso:
 *   node scripts/llm-enrichment/enrich-ventas-llm.js [--ids 30,35,43] [--limit 10] [--dry-run]
 *
 * Requiere:
 *   ANTHROPIC_API_KEY en .env.local o variable de entorno
 *   Supabase credentials en simon-mvp/.env.local
 *
 * SEGURIDAD: NUNCA escribe en propiedades_v2. Solo lee de BD y escribe a llm_enrichment_test_results.
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
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1500;
const TEMPERATURE = 0;
const MAX_CONTENT_LENGTH = 3000;

// Parse args
const args = process.argv.slice(2);
const idsArg = args.find(a => a.startsWith('--ids='));
const limitArg = args.find(a => a.startsWith('--limit='));
const dryRun = args.includes('--dry-run');
const specificIds = idsArg ? idsArg.split('=')[1].split(',').map(Number) : null;
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 30;
const versionArg = args.find(a => a.startsWith('--version='));
const VERSION = versionArg ? versionArg.split('=')[1] : 'v1.0';
const ITERATION = VERSION + '-test-' + new Date().toISOString().slice(0, 10);

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
    console.warn(`  ⚠ Error fetching proyectos for zona ${zona}: ${error.message}`);
    return [];
  }
  return data || [];
}

// ═══════════════════════════════════════
// BUILD PROMPT
// ═══════════════════════════════════════

function buildPrompt(prop, proyectos) {
  const enrichment = prop.datos_json_enrichment || {};
  const descripcion = enrichment.descripcion || '';
  const contenido = descripcion.substring(0, MAX_CONTENT_LENGTH);

  if (!contenido || contenido.length < 30) {
    return null; // Skip — no content to analyze
  }

  const pmList = proyectos.map(p => `- ${p.nombre_oficial} (ID ${p.id_proyecto_master})`).join('\n');

  return `Eres un extractor de datos inmobiliarios para Santa Cruz de la Sierra, Bolivia.
Extraes datos de páginas web de propiedades en VENTA.
REGLA ABSOLUTA: NUNCA inventes datos. Si no aparece en el texto, devuelve null.

DATOS YA EXTRAÍDOS (del pipeline regex — pueden tener errores):
- URL: ${prop.url || 'desconocida'}
- Fuente: ${prop.fuente || 'desconocida'}
- Precio: $${prop.precio_usd || '?'} USD (moneda original: ${prop.moneda_original || 'desconocida'})
- Área: ${prop.area_total_m2 ? prop.area_total_m2 + ' m²' : 'desconocida'}
- Dormitorios: ${prop.dormitorios ?? 'desconocido'}
- Baños: ${prop.banos ?? 'desconocido'}
- Nombre edificio (regex): ${prop.nombre_edificio || 'no detectado'}
- Estado construcción (regex): ${prop.estado_construccion || 'no detectado'}
- Zona GPS: ${prop.zona || 'desconocida'}

PROYECTOS CONOCIDOS EN ZONA ${prop.zona || '?'}:
${pmList || '(sin proyectos cargados)'}

TEXTO DE LA PÁGINA:
${contenido}

═══════════════════════════════════════
INSTRUCCIONES POR CAMPO:
═══════════════════════════════════════

NOMBRE_EDIFICIO:
- Buscá el nombre del edificio/condominio/proyecto en el texto
- Compará contra la lista de PROYECTOS CONOCIDOS de arriba
- Si encontrás match (incluso parcial: "Edif Nomad" → "Nomad by Smart Studio"), usá el nombre oficial de la lista
- Si no hay match pero el texto tiene un nombre claro, devolvelo tal cual
- Si no hay nombre en el texto, devolvé null
- NUNCA devolver: "Venta", "Pre Venta", "Departamento", fragmentos de oraciones

ESTADO_CONSTRUCCION:
- "entrega_inmediata": "listo para vivir", "entrega inmediata", amoblado CON piso específico y precio fijo USD
- "preventa": "precios desde", "precios al cambio Bs.7", "entrega [fecha futura]"
- "en_construccion": "en construcción", "obra gruesa", "avance X%"
- "nuevo_a_estrenar": "a estrenar", depto terminado sin amueblar
- "usado": "segunda mano", "de ocasión"
- CUIDADO: "amoblado" o "equipado" SOLOS no implican entrega_inmediata
- CUIDADO: "Precios al cambio Bs.7" = preventa

TIPO_CAMBIO_DETECTADO:
- "paralelo": "TC paralelo", "al paralelo", "pago en dólares", "solo dólares", "tc del día"
- "oficial": "TC 7", "al cambio Bs.7", "TC oficial", "tipo de cambio 7"
- "no_especificado": si no hay mención de TC ni forma de pago. NUNCA devolver null — usar "no_especificado"
- "solo dólares" o "pago en dólares" = PARALELO
- "TC 7" = OFICIAL (6.96 redondeado)

PARQUEO_INCLUIDO:
- true: "incluye parqueo", "con parqueo" sin precio aparte
- false: "Parqueo: $us X" (precio explícito) O no se menciona parqueo en absoluto
- null: SOLO si "parqueo" aparece en áreas comunes sin detalle de inclusión
- DEFAULT: false (si no hay info de parqueo)

BAULERA_INCLUIDA:
- true: "incluye baulera", "con baulera" sin precio aparte
- false: si no se menciona baulera, o precio explícito por baulera
- DEFAULT: false (si no hay info de baulera)

PLAN_PAGOS:
- tiene_plan_pagos: true si cuotas/financiamiento, false si solo contado o no hay info. DEFAULT: false
- plan_pagos_texto: resumen breve de condiciones, null si no hay info
- descuento_contado_pct: porcentaje de descuento por pago contado, null si no se menciona
- acepta_permuta: true si menciona permuta/canje, false si no. DEFAULT: false
- precio_negociable: true si "negociable"/"escucha ofertas", false si no. DEFAULT: false
- solo_tc_paralelo: true SOLO si exige explícitamente "solo dólares"/"solo paralelo". false si no exige. DEFAULT: false

AMENITIES y EQUIPAMIENTO:
- Solo lo que el texto CONFIRME explícitamente
- NUNCA inferir Pet Friendly, Sauna, etc. sin mención explícita

═══════════════════════════════════════

Devuelve SOLO este JSON (sin explicaciones, sin markdown):
{
  "nombre_edificio": string | null,
  "nombre_edificio_confianza": "alta" | "media" | "baja" | null,
  "estado_construccion": "entrega_inmediata" | "preventa" | "en_construccion" | "nuevo_a_estrenar" | "usado" | null,
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

const VALID_ESTADOS = ['entrega_inmediata', 'preventa', 'en_construccion', 'nuevo_a_estrenar', 'usado'];
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
    return { datos: null, errores: ['json_parse_error: ' + e.message], requiere_revision: true };
  }

  // Validate estado_construccion
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
  for (const field of ['nombre_edificio_confianza', 'estado_construccion_confianza', 'tipo_cambio_confianza']) {
    if (datos[field] && !VALID_CONFIANZA.includes(datos[field])) {
      datos[field] = null;
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
// SAVE RESULTS TO LOCAL JSON
// ═══════════════════════════════════════
// No DB table needed — all results stored locally for analysis.

const allTestResults = []; // Accumulated for final JSON dump

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

// Per-property detailed results (raw LLM output + comparisons)
const perPropertyResults = [];

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  LLM Enrichment Ventas — Test Runner');
  console.log('═══════════════════════════════════════');
  console.log(`  Model: ${MODEL}`);
  console.log(`  Iteration: ${ITERATION}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Specific IDs: ${specificIds ? specificIds.join(', ') : 'none (random ' + limit + ')'}`);
  console.log('');

  if (!ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set. Add it to simon-mvp/.env.local or environment.');
    process.exit(1);
  }

  // 1. Fetch properties
  console.log('→ Fetching properties...');
  const props = await fetchProperties();
  console.log(`  Found ${props.length} properties`);

  if (props.length === 0) {
    console.log('No properties to process. Exiting.');
    return;
  }

  // 2. Cache proyectos_master by zona
  const pmCache = {};
  const zonas = [...new Set(props.map(p => p.zona).filter(Boolean))];
  console.log(`→ Fetching proyectos_master for ${zonas.length} zonas...`);
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
      console.log('  ⏭ Skip — no content');
      results.skipped++;
      continue;
    }

    if (dryRun) {
      console.log('  🔍 Dry run — prompt built (' + prompt.length + ' chars)');
      results.skipped++;
      continue;
    }

    // Call LLM
    try {
      console.log('  📡 Calling Anthropic...');
      const start = Date.now();
      const response = await callAnthropic(prompt);
      const elapsed = Date.now() - start;
      results.totalTokens += response.inputTokens + response.outputTokens;
      console.log(`  ✓ Response in ${elapsed}ms (${response.inputTokens}+${response.outputTokens} tokens)`);

      // Parse & validate
      const { datos, errores, requiere_revision } = parseAndValidate(response.text);
      if (!datos) {
        console.log('  ✗ Parse failed:', errores.join(', '));
        results.errors++;
        continue;
      }
      if (errores.length > 0) {
        console.log(`  ⚠ ${errores.length} validation errors: ${errores.join(', ')}`);
      }
      if (requiere_revision) {
        console.log('  🔴 Requires revision (>2 errors)');
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
          console.log(`  ✨ ${c.campo}: NULL → ${c.valor_llm} (${c.confianza_llm || '—'})`);
        } else if (c.veredicto === 'llm_difiere') {
          console.log(`  ⚡ ${c.campo}: ${c.valor_bd} → ${c.valor_llm} (${c.confianza_llm || '—'})`);
        }

        // Aggregate stats
        results.comparisons[c.veredicto]++;
        if (!results.byField[c.campo]) {
          results.byField[c.campo] = { igual: 0, llm_agrega: 0, llm_no_detecta: 0, llm_difiere: 0 };
        }
        results.byField[c.campo][c.veredicto]++;

        // Save to test table
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
      console.log(`  ✗ Error: ${err.message}`);
      results.errors++;
    }
  }

  // 4. Print summary
  console.log('\n═══════════════════════════════════════');
  console.log('  RESUMEN');
  console.log('═══════════════════════════════════════');
  console.log(`  Total: ${results.total}`);
  console.log(`  Processed: ${results.processed}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Errors: ${results.errors}`);
  console.log(`  Total tokens: ${results.totalTokens}`);
  console.log(`  Est. cost: $${(results.totalTokens * 0.0000003).toFixed(4)}`);
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

  // 1. Summary with aggregate stats
  const summaryPath = path.join(outputDir, `test-results-${ITERATION}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`\n  Summary saved to: ${summaryPath}`);

  // 2. Detailed per-comparison rows (equivalent to DB table)
  const detailPath = path.join(outputDir, `test-detail-${ITERATION}.json`);
  fs.writeFileSync(detailPath, JSON.stringify(allTestResults, null, 2));
  console.log(`  Detail rows saved to: ${detailPath} (${allTestResults.length} rows)`);

  // 3. Per-property raw LLM output + comparisons
  const rawPath = path.join(outputDir, `test-raw-${ITERATION}.json`);
  fs.writeFileSync(rawPath, JSON.stringify(perPropertyResults, null, 2));
  console.log(`  Raw LLM output saved to: ${rawPath} (${perPropertyResults.length} props)`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
