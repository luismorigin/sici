// Análisis completo de 11 preguntas para contenido TikTok/Reels - Simón Alquileres
// Ejecutar: node scripts/analisis_alquileres_11q.js

const https = require('https');

const SUPABASE_URL = 'https://chaosoiyoeyjuwtwckix.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoYW9zb2l5b2V5anV3dHdja2l4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODkxMzkxMiwiZXhwIjoyMDc0NDg5OTEyfQ.aPE0xYCfvUdzweK4Tse0L3z9EW-ivKmyRXAGcI7KjLk';

function fetchSupabase(table, params = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}?${params}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Accept': 'application/json'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Parse error: ${data.substring(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

// Utility functions
const pct = (n, total) => total > 0 ? (100 * n / total).toFixed(1) : '0.0';
const round = (n) => Math.round(n);
const avg = (arr) => arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0;
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b) => a-b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid-1] + s[mid]) / 2;
};
const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b) => a-b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
};
const stddev = (arr) => {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1));
};

async function main() {
  console.log('='.repeat(80));
  console.log('ANÁLISIS COMPLETO - ALQUILERES EQUIPETROL');
  console.log('Fecha: ' + new Date().toISOString().split('T')[0]);
  console.log('='.repeat(80));

  // Fetch data
  console.log('\nCargando datos...');
  const activos = await fetchSupabase('v_mercado_alquiler', 'select=*&limit=1000');
  const todos = await fetchSupabase('propiedades_v2', 'tipo_operacion=eq.alquiler&select=id,status,fuente,precio_mensual_bob,zona,nombre_edificio,fecha_creacion,fecha_publicacion,fecha_discovery,dormitorios,amoblado,acepta_mascotas,estacionamientos&limit=1000');

  if (!Array.isArray(activos)) { console.error('ERROR activos:', JSON.stringify(activos).substring(0,300)); return; }
  if (!Array.isArray(todos)) { console.error('ERROR todos:', JSON.stringify(todos).substring(0,300)); return; }

  console.log(`Activos en v_mercado_alquiler: ${activos.length}`);
  console.log(`Total en propiedades_v2 (alquiler): ${todos.length}`);

  // ============================================================
  // PREGUNTA 1: Campos con datos reales vs NULL
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 1: CAMPOS CON DATOS REALES vs NULL/SIN INFORMAR');
  console.log('='.repeat(80));

  const total = activos.length;
  const fields = [
    { name: 'acepta_mascotas', label: 'Mascotas' },
    { name: 'estacionamientos', label: 'Parqueo' },
    { name: 'monto_expensas_bob', label: 'Expensas' },
    { name: 'area_total_m2', label: 'Superficie' },
    { name: 'amoblado', label: 'Amoblado' },
    { name: 'piso', label: 'Piso' },
    { name: 'deposito_meses', label: 'Depósito' },
    { name: 'contrato_minimo_meses', label: 'Contrato mín.' },
    { name: 'servicios_incluidos', label: 'Servicios incl.' },
    { name: 'dormitorios', label: 'Dormitorios' },
    { name: 'banos', label: 'Baños' },
    { name: 'nombre_edificio', label: 'Edificio' },
    { name: 'zona', label: 'Zona' },
    { name: 'id_proyecto_master', label: 'Proyecto master' },
    { name: 'fotos_urls', label: 'Fotos' },
  ];

  console.log('\n%-20s %8s %8s %8s'.replace(/%(\d*)s/g, (m, n) => ''),
    'Campo', 'Informan', 'NULL', '% Info');
  console.log('-'.repeat(60));

  for (const f of fields) {
    let informed = activos.filter(r => {
      const v = r[f.name];
      if (v === null || v === undefined) return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === 'string' && v.trim() === '') return false;
      return true;
    }).length;
    const nulls = total - informed;
    console.log(`  ${f.label.padEnd(20)} ${String(informed).padStart(6)} ${String(nulls).padStart(6)} ${pct(informed, total).padStart(7)}%`);
  }

  // Detalle mascotas
  const mascotaSi = activos.filter(r => r.acepta_mascotas === true).length;
  const mascotaNo = activos.filter(r => r.acepta_mascotas === false).length;
  const mascotaNull = activos.filter(r => r.acepta_mascotas === null).length;
  console.log(`\n  DETALLE MASCOTAS: Sí=${mascotaSi}, No=${mascotaNo}, No informa=${mascotaNull}`);
  console.log(`  → "${mascotaNull} de ${total} deptos NO INFORMAN si aceptan mascotas (${pct(mascotaNull, total)}%)"`);

  // Detalle amoblado
  const amobSi = activos.filter(r => r.amoblado === 'si').length;
  const amobNo = activos.filter(r => r.amoblado === 'no').length;
  const amobSemi = activos.filter(r => r.amoblado === 'semi').length;
  const amobNull = activos.filter(r => !r.amoblado).length;
  console.log(`\n  DETALLE AMOBLADO: Sí=${amobSi}, No=${amobNo}, Semi=${amobSemi}, No informa=${amobNull}`);

  // ============================================================
  // PREGUNTA 2: Tiempo de publicación
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 2: TIEMPO DE PUBLICACIÓN');
  console.log('='.repeat(80));

  const diasRangos = [
    { label: '0-7 días', min: 0, max: 7 },
    { label: '8-15 días', min: 8, max: 15 },
    { label: '16-30 días', min: 16, max: 30 },
    { label: '31-60 días', min: 31, max: 60 },
    { label: '61-90 días', min: 61, max: 90 },
    { label: '91-120 días', min: 91, max: 120 },
    { label: '120+ días', min: 121, max: 9999 },
  ];

  console.log('\n  DISTRIBUCIÓN DE DÍAS EN MERCADO:');
  console.log(`  ${'Rango'.padEnd(15)} ${'Cant'.padStart(5)} ${'%'.padStart(6)} ${'Precio prom Bs'.padStart(16)}`);
  console.log('  ' + '-'.repeat(45));

  for (const r of diasRangos) {
    const props = activos.filter(p => p.dias_en_mercado >= r.min && p.dias_en_mercado <= r.max);
    const precios = props.map(p => p.precio_mensual_bob).filter(Boolean);
    console.log(`  ${r.label.padEnd(15)} ${String(props.length).padStart(5)} ${pct(props.length, total).padStart(5)}% ${precios.length ? ('Bs ' + round(avg(precios))).padStart(14) : 'N/A'.padStart(14)}`);
  }

  // Correlación precio vs días
  console.log('\n  CORRELACIÓN PRECIO vs DÍAS (¿los baratos se van más rápido?):');
  const precioRangos = [
    { label: '< Bs 3,000', min: 0, max: 2999 },
    { label: 'Bs 3,000-3,999', min: 3000, max: 3999 },
    { label: 'Bs 4,000-4,999', min: 4000, max: 4999 },
    { label: 'Bs 5,000-5,999', min: 5000, max: 5999 },
    { label: 'Bs 6,000-7,999', min: 6000, max: 7999 },
    { label: 'Bs 8,000+', min: 8000, max: 999999 },
  ];

  console.log(`  ${'Rango precio'.padEnd(18)} ${'Cant'.padStart(5)} ${'Días prom'.padStart(10)} ${'Días mediana'.padStart(13)}`);
  console.log('  ' + '-'.repeat(50));

  for (const r of precioRangos) {
    const props = activos.filter(p => p.precio_mensual_bob >= r.min && p.precio_mensual_bob <= r.max);
    const dias = props.map(p => p.dias_en_mercado).filter(d => d != null);
    if (props.length > 0) {
      console.log(`  ${r.label.padEnd(18)} ${String(props.length).padStart(5)} ${String(round(avg(dias))).padStart(10)} ${String(round(median(dias))).padStart(13)}`);
    }
  }

  // Zombis (>60 días) por zona
  console.log('\n  DEPTOS ZOMBIS (>60 días en mercado) por zona:');
  const zombis = activos.filter(p => p.dias_en_mercado > 60);
  const zombisByZona = {};
  zombis.forEach(p => {
    const z = p.zona || 'Sin zona';
    if (!zombisByZona[z]) zombisByZona[z] = [];
    zombisByZona[z].push(p);
  });

  console.log(`  Total zombis: ${zombis.length} de ${total} (${pct(zombis.length, total)}%)`);
  for (const [zona, props] of Object.entries(zombisByZona).sort((a,b) => b[1].length - a[1].length)) {
    const precios = props.map(p => p.precio_mensual_bob).filter(Boolean);
    const edificios = [...new Set(props.map(p => p.nombre_edificio).filter(Boolean))];
    console.log(`  ${zona}: ${props.length} deptos, precio prom Bs ${round(avg(precios))}, edificios: ${edificios.slice(0,5).join(', ') || 'N/A'}`);
  }

  // ============================================================
  // PREGUNTA 3: Republicaciones y cambios
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 3: REPUBLICACIONES Y ROTACIÓN');
  console.log('='.repeat(80));

  const byStatus = {};
  const byFuenteStatus = {};
  todos.forEach(r => {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const key = `${r.fuente}|${r.status}`;
    byFuenteStatus[key] = (byFuenteStatus[key] || 0) + 1;
  });

  console.log('\n  ESTADO DE TODAS LAS PROPIEDADES DE ALQUILER:');
  for (const [status, count] of Object.entries(byStatus).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(25)} ${String(count).padStart(5)} (${pct(count, todos.length)}%)`);
  }

  console.log('\n  POR FUENTE Y ESTADO:');
  const fuentes = [...new Set(todos.map(r => r.fuente))].sort();
  for (const f of fuentes) {
    const rows = todos.filter(r => r.fuente === f);
    const statuses = {};
    rows.forEach(r => { statuses[r.status] = (statuses[r.status] || 0) + 1; });
    console.log(`  ${f}: ${Object.entries(statuses).map(([s,c]) => `${s}=${c}`).join(', ')}`);
  }

  // Tasa de rotación
  const inactivos = todos.filter(r => r.status === 'inactivo_confirmed' || r.status === 'inactivo_pending');
  const completados = todos.filter(r => r.status === 'completado' || r.status === 'actualizado');
  console.log(`\n  TASA DE ROTACIÓN: ${inactivos.length} salieron del mercado vs ${completados.length} activos`);
  console.log(`  → Ratio inactivos/total: ${pct(inactivos.length, todos.length)}%`);

  // ============================================================
  // PREGUNTA 4: Dispersión de precio por zona
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 4: DISPERSIÓN DE PRECIO DENTRO DE CADA ZONA');
  console.log('='.repeat(80));

  const zonas = [...new Set(activos.map(r => r.zona).filter(Boolean))].sort();

  console.log(`\n  ${'Zona'.padEnd(20)} ${'N'.padStart(4)} ${'Min'.padStart(7)} ${'P10'.padStart(7)} ${'P25'.padStart(7)} ${'Med'.padStart(7)} ${'P75'.padStart(7)} ${'P90'.padStart(7)} ${'Max'.padStart(7)} ${'CV%'.padStart(6)}`);
  console.log('  ' + '-'.repeat(85));

  for (const zona of zonas) {
    const precios = activos.filter(r => r.zona === zona).map(r => r.precio_mensual_bob).filter(Boolean);
    if (precios.length === 0) continue;
    const cv = avg(precios) > 0 ? (stddev(precios) / avg(precios) * 100).toFixed(1) : '0';
    console.log(`  ${zona.padEnd(20)} ${String(precios.length).padStart(4)} ${String(round(Math.min(...precios))).padStart(7)} ${String(round(percentile(precios, 10))).padStart(7)} ${String(round(percentile(precios, 25))).padStart(7)} ${String(round(median(precios))).padStart(7)} ${String(round(percentile(precios, 75))).padStart(7)} ${String(round(percentile(precios, 90))).padStart(7)} ${String(round(Math.max(...precios))).padStart(7)} ${cv.padStart(6)}`);
  }

  // Overlap entre zonas
  console.log('\n  OVERLAP: Deptos en zonas "caras" que cuestan lo mismo que en zonas "baratas":');
  const zonaPairs = [];
  for (const z1 of zonas) {
    for (const z2 of zonas) {
      if (z1 >= z2) continue;
      const p1 = activos.filter(r => r.zona === z1).map(r => r.precio_mensual_bob).filter(Boolean);
      const p2 = activos.filter(r => r.zona === z2).map(r => r.precio_mensual_bob).filter(Boolean);
      if (p1.length === 0 || p2.length === 0) continue;
      const overlap_low = Math.max(Math.min(...p1), Math.min(...p2));
      const overlap_high = Math.min(Math.max(...p1), Math.max(...p2));
      if (overlap_low <= overlap_high) {
        const count1 = p1.filter(p => p >= overlap_low && p <= overlap_high).length;
        const count2 = p2.filter(p => p >= overlap_low && p <= overlap_high).length;
        if (count1 > 0 && count2 > 0) {
          zonaPairs.push({ z1, z2, overlap_low: round(overlap_low), overlap_high: round(overlap_high), count: count1 + count2 });
        }
      }
    }
  }
  zonaPairs.sort((a,b) => b.count - a.count);
  for (const p of zonaPairs.slice(0, 8)) {
    console.log(`  ${p.z1} ↔ ${p.z2}: ${p.count} deptos se solapan en Bs ${p.overlap_low}-${p.overlap_high}`);
  }

  // ============================================================
  // PREGUNTA 5: Edificios con muchas unidades
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 5: EDIFICIOS CON MÚLTIPLES UNIDADES EN ALQUILER');
  console.log('='.repeat(80));

  const byEdificio = {};
  activos.filter(r => r.nombre_edificio).forEach(r => {
    const key = r.nombre_edificio;
    if (!byEdificio[key]) byEdificio[key] = [];
    byEdificio[key].push(r);
  });

  const multiEdificios = Object.entries(byEdificio)
    .filter(([_, props]) => props.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`\n  Edificios con 2+ unidades en alquiler: ${multiEdificios.length}`);
  console.log(`  ${'Edificio'.padEnd(30)} ${'Zona'.padEnd(20)} ${'Un'.padStart(3)} ${'Min Bs'.padStart(8)} ${'Max Bs'.padStart(8)} ${'Rango'.padStart(8)} ${'Dorms'.padStart(10)}`);
  console.log('  ' + '-'.repeat(90));

  for (const [nombre, props] of multiEdificios) {
    const precios = props.map(p => p.precio_mensual_bob).filter(Boolean);
    const dorms = [...new Set(props.map(p => p.dormitorios).filter(d => d != null))].sort().join(',');
    const zona = props[0].zona || 'N/A';
    console.log(`  ${nombre.substring(0,29).padEnd(30)} ${zona.padEnd(20)} ${String(props.length).padStart(3)} ${precios.length ? String(round(Math.min(...precios))).padStart(8) : 'N/A'.padStart(8)} ${precios.length ? String(round(Math.max(...precios))).padStart(8) : 'N/A'.padStart(8)} ${precios.length >= 2 ? String(round(Math.max(...precios) - Math.min(...precios))).padStart(8) : '0'.padStart(8)} ${dorms.padStart(10)}`);
  }

  // También por id_proyecto_master
  const byProyecto = {};
  activos.filter(r => r.id_proyecto_master).forEach(r => {
    const key = r.id_proyecto_master;
    if (!byProyecto[key]) byProyecto[key] = [];
    byProyecto[key].push(r);
  });

  const multiProyectos = Object.entries(byProyecto)
    .filter(([_, props]) => props.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`\n  Proyectos master con 2+ unidades: ${multiProyectos.length}`);

  // ============================================================
  // PREGUNTA 6: Diferencias por portal/fuente
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 6: DIFERENCIAS DE PRECIO POR PORTAL');
  console.log('='.repeat(80));

  const fuentesActivas = [...new Set(activos.map(r => r.fuente))].sort();
  console.log('\n  RESUMEN POR PORTAL:');
  console.log(`  ${'Portal'.padEnd(20)} ${'Cant'.padStart(5)} ${'Promedio'.padStart(10)} ${'Mediana'.padStart(10)} ${'Min'.padStart(8)} ${'Max'.padStart(8)}`);
  console.log('  ' + '-'.repeat(65));

  for (const f of fuentesActivas) {
    const precios = activos.filter(r => r.fuente === f).map(r => r.precio_mensual_bob).filter(Boolean);
    console.log(`  ${f.padEnd(20)} ${String(precios.length).padStart(5)} ${('Bs ' + round(avg(precios))).padStart(10)} ${('Bs ' + round(median(precios))).padStart(10)} ${('Bs ' + round(Math.min(...precios))).padStart(8)} ${('Bs ' + round(Math.max(...precios))).padStart(8)}`);
  }

  // Comparación controlada por zona+dorms
  console.log('\n  COMPARACIÓN CONTROLADA (zona + dorms con 2+ props por portal):');
  for (const zona of zonas) {
    for (const dorm of [0, 1, 2, 3]) {
      const byFuente = {};
      activos.filter(r => r.zona === zona && r.dormitorios === dorm).forEach(r => {
        if (!byFuente[r.fuente]) byFuente[r.fuente] = [];
        byFuente[r.fuente].push(r.precio_mensual_bob);
      });
      const fuentesConDatos = Object.entries(byFuente).filter(([_, p]) => p.length >= 2);
      if (fuentesConDatos.length >= 2) {
        console.log(`\n  ${zona} - ${dorm} dorm:`);
        for (const [f, precios] of fuentesConDatos) {
          console.log(`    ${f}: n=${precios.length}, prom=Bs ${round(avg(precios))}, med=Bs ${round(median(precios))}`);
        }
      }
    }
  }

  // ============================================================
  // PREGUNTA 7: Amoblado vs precio
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 7: RELACIÓN AMOBLADO vs PRECIO (controlada)');
  console.log('='.repeat(80));

  console.log('\n  RESUMEN GLOBAL:');
  const amobladoGrupos = ['si', 'no', 'semi', null];
  for (const a of amobladoGrupos) {
    const label = a || 'no_informa';
    const precios = activos.filter(r => r.amoblado === a).map(r => r.precio_mensual_bob).filter(Boolean);
    if (precios.length > 0) {
      console.log(`  ${label.padEnd(15)} n=${String(precios.length).padStart(3)}, prom=Bs ${round(avg(precios))}, med=Bs ${round(median(precios))}`);
    }
  }

  console.log('\n  DESGLOSE POR ZONA + DORMITORIOS:');
  for (const zona of zonas) {
    for (const dorm of [0, 1, 2, 3]) {
      const results = {};
      for (const a of amobladoGrupos) {
        const precios = activos.filter(r => r.zona === zona && r.dormitorios === dorm && r.amoblado === a)
          .map(r => r.precio_mensual_bob).filter(Boolean);
        if (precios.length > 0) {
          results[a || 'null'] = { n: precios.length, avg: round(avg(precios)), med: round(median(precios)) };
        }
      }
      if (Object.keys(results).length >= 2) {
        console.log(`\n  ${zona} - ${dorm} dorm:`);
        for (const [a, stats] of Object.entries(results)) {
          console.log(`    ${(a === 'null' ? 'no_informa' : a).padEnd(12)} n=${stats.n}, prom=Bs ${stats.avg}, med=Bs ${stats.med}`);
        }
        // Detectar anomalía: amoblado más barato que sin amoblar
        if (results['si'] && results['no'] && results['si'].med < results['no'].med) {
          console.log(`    ⚠ ANOMALÍA: Amoblado (Bs ${results['si'].med}) MÁS BARATO que sin amoblar (Bs ${results['no'].med})`);
        }
      }
    }
  }

  // ============================================================
  // PREGUNTA 8: Gaps de precio
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 8: GAPS DE PRECIO (rangos sin oferta)');
  console.log('='.repeat(80));

  const allPrecios = activos.map(r => r.precio_mensual_bob).filter(Boolean).sort((a,b) => a-b);
  const minP = Math.floor(Math.min(...allPrecios) / 500) * 500;
  const maxP = Math.ceil(Math.max(...allPrecios) / 500) * 500;

  console.log('\n  DISTRIBUCIÓN POR RANGOS DE Bs 500:');
  console.log(`  ${'Rango'.padEnd(22)} ${'Cant'.padStart(5)} ${'Barra'.padStart(2)}`);
  console.log('  ' + '-'.repeat(50));

  const gaps = [];
  for (let r = minP; r <= maxP; r += 500) {
    const count = allPrecios.filter(p => p >= r && p < r + 500).length;
    const bar = '█'.repeat(Math.max(1, Math.round(count / 2)));
    console.log(`  ${('Bs ' + r.toLocaleString() + '-' + (r+499).toLocaleString()).padEnd(22)} ${String(count).padStart(5)} ${count === 0 ? '🔴 GAP' : bar}`);
    if (count === 0) gaps.push(`Bs ${r.toLocaleString()}-${(r+499).toLocaleString()}`);
  }

  if (gaps.length) {
    console.log(`\n  🔴 GAPS DETECTADOS (rangos de Bs 500 sin ninguna oferta):`);
    gaps.forEach(g => console.log(`  → ${g}`));
  } else {
    console.log(`\n  Sin gaps completos en rangos de Bs 500`);
  }

  // Gaps más finos (Bs 250)
  console.log('\n  GAPS FINOS (rangos de Bs 250 sin oferta, solo hasta Bs 10,000):');
  const fineGaps = [];
  for (let r = minP; r <= Math.min(maxP, 10000); r += 250) {
    const count = allPrecios.filter(p => p >= r && p < r + 250).length;
    if (count === 0) fineGaps.push(`Bs ${r.toLocaleString()}-${(r+249).toLocaleString()}`);
  }
  if (fineGaps.length) fineGaps.forEach(g => console.log(`  → ${g}`));
  else console.log('  Sin gaps de Bs 250');

  // ============================================================
  // PREGUNTA 9: Concentración por broker/inmobiliaria
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 9: CONCENTRACIÓN POR PORTAL E INMOBILIARIA');
  console.log('='.repeat(80));

  // Por fuente (portal)
  console.log('\n  CONCENTRACIÓN POR PORTAL:');
  for (const f of fuentesActivas) {
    const props = activos.filter(r => r.fuente === f);
    console.log(`  ${f}: ${props.length} listings (${pct(props.length, total)}%)`);
  }

  // Por zona y fuente
  console.log('\n  DOMINANCIA POR ZONA:');
  for (const zona of zonas) {
    const zoneProps = activos.filter(r => r.zona === zona);
    if (zoneProps.length === 0) continue;
    console.log(`\n  ${zona} (${zoneProps.length} total):`);
    const fuenteCounts = {};
    zoneProps.forEach(r => { fuenteCounts[r.fuente] = (fuenteCounts[r.fuente] || 0) + 1; });
    for (const [f, c] of Object.entries(fuenteCounts).sort((a,b) => b[1] - a[1])) {
      console.log(`    ${f}: ${c} (${pct(c, zoneProps.length)}%)`);
    }
  }

  // Intentar extraer broker/agente de datos_json si disponible
  // (datos_json no está en el select, lo haremos con la data que tenemos)

  // ============================================================
  // PREGUNTA 10: Combinaciones de filtros que dejan 0
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 10: COMBINACIONES DE FILTROS QUE TE DEJAN EN 0');
  console.log('='.repeat(80));

  const combos = [
    { label: '2 dorms + mascota + < Bs 5,000', filter: r => r.dormitorios === 2 && r.acepta_mascotas === true && r.precio_mensual_bob < 5000 },
    { label: '2 dorms + mascota + < Bs 6,000', filter: r => r.dormitorios === 2 && r.acepta_mascotas === true && r.precio_mensual_bob < 6000 },
    { label: '1 dorm + parqueo + < Bs 4,000', filter: r => r.dormitorios === 1 && r.estacionamientos >= 1 && r.precio_mensual_bob < 4000 },
    { label: '1 dorm + parqueo + < Bs 5,000', filter: r => r.dormitorios === 1 && r.estacionamientos >= 1 && r.precio_mensual_bob < 5000 },
    { label: '2 dorms + amoblado + < Bs 4,500', filter: r => r.dormitorios === 2 && r.amoblado === 'si' && r.precio_mensual_bob < 4500 },
    { label: '2 dorms + amoblado + < Bs 6,000', filter: r => r.dormitorios === 2 && r.amoblado === 'si' && r.precio_mensual_bob < 6000 },
    { label: '3+ dorms + mascota', filter: r => r.dormitorios >= 3 && r.acepta_mascotas === true },
    { label: '1 dorm + mascota + amoblado', filter: r => r.dormitorios === 1 && r.acepta_mascotas === true && r.amoblado === 'si' },
    { label: 'Studio + < Bs 3,000', filter: r => r.dormitorios === 0 && r.precio_mensual_bob < 3000 },
    { label: 'Studio + mascota', filter: r => r.dormitorios === 0 && r.acepta_mascotas === true },
    { label: '2 dorms + parqueo + < Bs 4,000', filter: r => r.dormitorios === 2 && r.estacionamientos >= 1 && r.precio_mensual_bob < 4000 },
    { label: '3+ dorms + < Bs 5,000', filter: r => r.dormitorios >= 3 && r.precio_mensual_bob < 5000 },
    { label: 'Cualquiera + mascota + < Bs 3,500', filter: r => r.acepta_mascotas === true && r.precio_mensual_bob < 3500 },
    { label: '2 dorms + mascota + parqueo', filter: r => r.dormitorios === 2 && r.acepta_mascotas === true && r.estacionamientos >= 1 },
    { label: 'Equipetrol Norte + 1 dorm + < Bs 3,500', filter: r => r.zona === 'Equipetrol Norte' && r.dormitorios === 1 && r.precio_mensual_bob < 3500 },
    { label: 'Sirari + 2 dorms + < Bs 5,000', filter: r => r.zona === 'Sirari' && r.dormitorios === 2 && r.precio_mensual_bob < 5000 },
  ];

  console.log(`\n  ${'Combinación'.padEnd(45)} ${'Resultado'.padStart(10)}`);
  console.log('  ' + '-'.repeat(58));

  for (const c of combos) {
    const count = activos.filter(c.filter).length;
    const emoji = count === 0 ? '🔴 0' : count <= 3 ? `🟡 ${count}` : `🟢 ${count}`;
    console.log(`  ${c.label.padEnd(45)} ${emoji.padStart(10)}`);
  }

  // ============================================================
  // PREGUNTA 11: Datos históricos y tendencias
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('PREGUNTA 11: DATOS HISTÓRICOS Y TENDENCIAS');
  console.log('='.repeat(80));

  // Stock activo vs inactivo
  const activoCount = todos.filter(r => r.status === 'completado' || r.status === 'actualizado').length;
  const inactivoCount = todos.filter(r => r.status === 'inactivo_confirmed' || r.status === 'inactivo_pending').length;

  console.log(`\n  STOCK ACTUAL:`);
  console.log(`  Activas: ${activoCount}`);
  console.log(`  Inactivas (salieron del mercado): ${inactivoCount}`);
  console.log(`  Total registradas: ${todos.length}`);
  console.log(`  Tasa de salida: ${pct(inactivoCount, todos.length)}% del total histórico ya no está`);

  // Props nuevas vs antiguas
  const now = new Date();
  const d30ago = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const nuevas30d = activos.filter(r => {
    const fecha = r.fecha_publicacion || r.fecha_creacion;
    return fecha && new Date(fecha) >= d30ago;
  });

  console.log(`\n  NUEVAS EN ÚLTIMOS 30 DÍAS: ${nuevas30d.length}`);
  if (nuevas30d.length > 0) {
    const byFuente30 = {};
    nuevas30d.forEach(r => { byFuente30[r.fuente] = (byFuente30[r.fuente] || 0) + 1; });
    for (const [f, c] of Object.entries(byFuente30).sort((a,b) => b[1] - a[1])) {
      console.log(`    ${f}: ${c} nuevas`);
    }
  }

  // Evolución por semana (usando fecha_creacion)
  console.log('\n  EVOLUCIÓN DEL STOCK POR SEMANA (fecha creación):');
  const byWeek = {};
  todos.forEach(r => {
    const fecha = r.fecha_publicacion || r.fecha_creacion;
    if (!fecha) return;
    const d = new Date(fecha);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().split('T')[0];
    if (!byWeek[key]) byWeek[key] = { nuevas: 0, fuentes: {} };
    byWeek[key].nuevas++;
    byWeek[key].fuentes[r.fuente] = (byWeek[key].fuentes[r.fuente] || 0) + 1;
  });

  const sortedWeeks = Object.entries(byWeek).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 12);
  for (const [week, data] of sortedWeeks) {
    const fuenteStr = Object.entries(data.fuentes).map(([f,c]) => `${f}:${c}`).join(', ');
    console.log(`  ${week}: ${data.nuevas} nuevas (${fuenteStr})`);
  }

  // Capacidad histórica
  console.log('\n  CAPACIDAD HISTÓRICA DE SICI PARA ALQUILERES:');
  console.log('  - Tenemos propiedades activas + inactivas (con fecha de inactivación)');
  console.log('  - Podemos calcular rotación: cuántas entran y salen por semana');
  console.log('  - NO hay snapshots de precio diario (no podemos decir "subió X% este mes")');
  console.log('  - SÍ podemos decir: "X propiedades nuevas aparecieron, Y desaparecieron"');
  console.log('  - Para tendencias de precio, necesitaríamos snapshot_absorcion o similar');

  // ============================================================
  // SCHEMA RESUMEN
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('SCHEMA: VISTAS Y TABLAS DISPONIBLES PARA ALQUILERES');
  console.log('='.repeat(80));

  console.log(`
  VISTA PRINCIPAL: v_mercado_alquiler
  - Fuente: propiedades_v2 WHERE tipo_operacion = 'alquiler'
  - Filtros pre-aplicados: status IN (completado, actualizado), duplicado_de IS NULL, area >= 20m², precio > 0
  - Campo calculado: dias_en_mercado = CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery)
  - Columnas: ${activos.length > 0 ? Object.keys(activos[0]).length : '84+'} columnas

  COLUMNAS CLAVE PARA ALQUILERES:
  - precio_mensual_bob / precio_mensual_usd — precio mensual (TC fijo 6.96)
  - amoblado — 'si' / 'no' / 'semi' / null
  - acepta_mascotas — true / false / null
  - estacionamientos — int / null
  - monto_expensas_bob — numeric / null
  - deposito_meses — numeric / null
  - contrato_minimo_meses — int / null
  - servicios_incluidos — jsonb array ['agua','luz','internet','gas']
  - dias_en_mercado — int calculado
  - zona — 'Equipetrol Centro', 'Equipetrol Norte', 'Equipetrol Oeste', 'Sirari', 'Villa Brigida'
  - fuente — 'century21', 'remax', 'bien_inmuebles'
  - dormitorios, banos, area_total_m2, piso, nombre_edificio
  - id_proyecto_master — link a proyectos_master
  - fotos_urls — jsonb array

  RPC FUNCTION: buscar_unidades_alquiler(p_filtros JSONB)
  - Retorna 34 campos incluyendo agente_nombre, agente_telefono, agente_whatsapp
  - Filtros: zona, dormitorios, precio min/max, amoblado, mascotas, parqueo, etc.
  - Límite: 150 días en mercado

  TABLA BASE: propiedades_v2
  - Compartida con ventas, discriminada por tipo_operacion
  - Status: nueva, completado, actualizado, inactivo_pending, inactivo_confirmed, excluido_operacion
  `);

  console.log('\n' + '='.repeat(80));
  console.log('FIN DEL ANÁLISIS');
  console.log('='.repeat(80));
}

main().catch(console.error);
