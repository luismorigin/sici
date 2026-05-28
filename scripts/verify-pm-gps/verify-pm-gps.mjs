// Verificación gratuita de GPS de proyectos_master vía OpenStreetMap.
// Para cada pm consulta Overpass API (cuántos edificios OSM hay a 30m del centroide).
// Genera: osm-results.json + update.sql + verify-pm-gps.html (mapa Leaflet).
//
// Uso:
//   1. En Supabase UI corre la query de export (ver README) y guarda el JSON
//      como `pm-input.json` en esta carpeta.
//   2. node scripts/verify-pm-gps/verify-pm-gps.mjs
//   3. Pegá el contenido de `update.sql` en Supabase UI.
//   4. Abrí `verify-pm-gps.html` en el navegador para inspección visual.
//
// Sin API key. Costo: $0. ~2 segundos por pm (rate limit cortesía OSM).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = join(__dirname, "pm-input.json");
const RESULTS = join(__dirname, "osm-results.json");
const SQL_OUT = join(__dirname, "update.sql");
const HTML_OUT = join(__dirname, "verify-pm-gps.html");

// Si existe osm-results.json previo, lo cargamos para hacer retry idempotente
// (solo re-consulta pm que fallaron o que no están todavía).
let prevResults = [];
if (existsSync(RESULTS)) {
  try { prevResults = JSON.parse(readFileSync(RESULTS, "utf8")); } catch {}
}
const prevById = new Map(prevResults.map((r) => [r.id_proyecto_master, r]));

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const RADIUS_M = 30;
const RATE_LIMIT_MS = 2000; // 2s entre requests (gentil con Overpass público)
const UA = "SICI-Verify-PM-GPS/1.0 (directorcasapatio@gmail.com)";

// ---------- Helpers ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function countBuildingsAround(lat, lon) {
  const query = `[out:json][timeout:25];
    (
      way[building](around:${RADIUS_M},${lat},${lon});
      node[building](around:${RADIUS_M},${lat},${lon});
      relation[building](around:${RADIUS_M},${lat},${lon});
    );
    out count;`;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();
  const total = parseInt(data.elements?.[0]?.tags?.total ?? "0", 10);
  return Number.isFinite(total) ? total : 0;
}

async function reverseNominatim(lat, lon) {
  const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.display_name ?? null;
}

function sqlEscape(s) {
  if (s === null || s === undefined) return "NULL";
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// ---------- Main ----------

const pms = JSON.parse(readFileSync(INPUT, "utf8"));
console.log(`Verificando ${pms.length} pm contra OpenStreetMap...`);

const results = [];
for (let i = 0; i < pms.length; i++) {
  const pm = pms[i];

  // Skip si ya está verificado exitosamente en una corrida anterior
  const prev = prevById.get(pm.id_proyecto_master);
  if (prev && prev.gps_verificado_osm !== null) {
    results.push(prev);
    process.stdout.write(`[${i + 1}/${pms.length}] ${pm.nombre_oficial}... ya verificado (skip)\n`);
    continue;
  }

  process.stdout.write(`[${i + 1}/${pms.length}] ${pm.nombre_oficial}... `);

  try {
    const buildings = await countBuildingsAround(pm.latitud, pm.longitud);
    await sleep(RATE_LIMIT_MS);
    const address = await reverseNominatim(pm.latitud, pm.longitud);
    await sleep(RATE_LIMIT_MS);

    const verified = buildings >= 1;
    results.push({
      id_proyecto_master: pm.id_proyecto_master,
      nombre_oficial: pm.nombre_oficial,
      latitud: pm.latitud,
      longitud: pm.longitud,
      osm_buildings_around_30m: buildings,
      osm_nominatim_address: address,
      gps_verificado_osm: verified,
      verified_at: new Date().toISOString(),
    });
    console.log(`buildings=${buildings} ${verified ? "✅" : "⚠️"}`);
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    results.push({
      id_proyecto_master: pm.id_proyecto_master,
      nombre_oficial: pm.nombre_oficial,
      latitud: pm.latitud,
      longitud: pm.longitud,
      osm_buildings_around_30m: null,
      osm_nominatim_address: null,
      gps_verificado_osm: null,
      verified_at: null,
      error: err.message,
    });
    await sleep(RATE_LIMIT_MS);
  }
}

writeFileSync(RESULTS, JSON.stringify(results, null, 2));

// ---------- Generar UPDATE SQL ----------

const sqlLines = [
  "-- Actualización de verificación OSM de pm Zona Norte",
  "-- Generado por scripts/verify-pm-gps/verify-pm-gps.mjs",
  `-- Timestamp: ${new Date().toISOString()}`,
  "",
  "BEGIN;",
  "",
];

for (const r of results) {
  if (r.gps_verificado_osm === null) continue; // saltar errores
  sqlLines.push(
    `UPDATE proyectos_master SET ` +
      `gps_verificado_osm = ${r.gps_verificado_osm}, ` +
      `osm_buildings_around_30m = ${r.osm_buildings_around_30m}, ` +
      `osm_nominatim_address = ${sqlEscape(r.osm_nominatim_address)}, ` +
      `osm_verified_at = NOW() ` +
      `WHERE id_proyecto_master = ${r.id_proyecto_master};  -- ${r.nombre_oficial}`,
  );
}

sqlLines.push("");
sqlLines.push("-- Resumen post-UPDATE:");
sqlLines.push(`SELECT gps_verificado_osm, COUNT(*) FROM proyectos_master`);
sqlLines.push(`WHERE zona = 'Zona Norte' GROUP BY 1;`);
sqlLines.push("");
sqlLines.push("COMMIT;");

writeFileSync(SQL_OUT, sqlLines.join("\n"));

// ---------- Generar HTML interactivo de verificación visual ----------

const center = [
  results.reduce((a, r) => a + Number(r.latitud), 0) / results.length,
  results.reduce((a, r) => a + Number(r.longitud), 0) / results.length,
];

// Datos embebidos (self-contained, sin fetch)
const PM_DATA = JSON.stringify(results);

const markers = results
  .map((r) => {
    const color =
      r.gps_verificado_osm === true
        ? "green"
        : r.gps_verificado_osm === false
        ? "orange"
        : "red";
    return `addPin(${JSON.stringify(r)}, '${color}');`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Verificación visual pm Zona Norte</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  #app { display: flex; height: 100vh; }
  #map { flex: 1; }
  #panel { width: 380px; background: #fafafa; border-left: 1px solid #ddd;
    overflow-y: auto; display: flex; flex-direction: column; }
  #panel-header { padding: 12px 16px; background: #fff; border-bottom: 1px solid #ddd; }
  #panel-header h2 { margin: 0 0 6px; font-size: 15px; }
  #stats { font-size: 12px; color: #666; }
  #pm-list { flex: 1; overflow-y: auto; }
  .pm-item { padding: 10px 16px; border-bottom: 1px solid #eee; cursor: pointer; }
  .pm-item:hover { background: #f0f0f0; }
  .pm-item.active { background: #e8f4fd; }
  .pm-name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .pm-meta { font-size: 11px; color: #777; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 3px;
    font-size: 10px; font-weight: 600; margin-right: 4px; }
  .badge-green { background: #d4edda; color: #155724; }
  .badge-orange { background: #fff3cd; color: #856404; }
  .badge-confirmed { background: #28a745; color: white; }
  .badge-sospechoso { background: #dc3545; color: white; }
  .badge-no_identificable { background: #6c757d; color: white; }
  #pm-detail { padding: 16px; background: #fff; border-top: 1px solid #ddd; }
  #pm-detail h3 { margin: 0 0 12px; font-size: 14px; }
  .info-row { font-size: 12px; margin-bottom: 6px; color: #555; }
  .info-row b { color: #222; }
  .btn-row { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
  .btn { display: inline-block; padding: 6px 10px; border-radius: 4px;
    font-size: 12px; text-decoration: none; cursor: pointer; border: 1px solid #ccc;
    background: #fff; color: #222; }
  .btn:hover { background: #f5f5f5; }
  .btn-primary { background: #4285f4; color: #fff; border-color: #4285f4; }
  .btn-primary:hover { background: #357ae8; }
  .verdict-row { display: flex; gap: 6px; margin-top: 14px; padding-top: 12px;
    border-top: 1px dashed #ddd; }
  .verdict-btn { flex: 1; padding: 8px; border: 2px solid transparent;
    border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; }
  .verdict-btn.confirmed { background: #d4edda; color: #155724; }
  .verdict-btn.confirmed.active { border-color: #28a745; background: #28a745; color: #fff; }
  .verdict-btn.sospechoso { background: #fff3cd; color: #856404; }
  .verdict-btn.sospechoso.active { border-color: #dc3545; background: #dc3545; color: #fff; }
  .verdict-btn.no_identificable { background: #f0f0f0; color: #555; }
  .verdict-btn.no_identificable.active { border-color: #6c757d; background: #6c757d; color: #fff; }
  #notes { width: 100%; min-height: 60px; margin-top: 10px; padding: 6px;
    border: 1px solid #ccc; border-radius: 4px; font-size: 12px; font-family: inherit; }
  .legend { position: absolute; top: 10px; right: 400px; background: white;
    padding: 10px; z-index: 1000; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    border-radius: 4px; font-size: 12px; }
  .legend .dot { display: inline-block; width: 10px; height: 10px;
    border-radius: 50%; margin-right: 6px; }
  #export-btn { margin: 12px 16px; padding: 10px; background: #28a745; color: #fff;
    border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
  #export-btn:hover { background: #218838; }
  #filter-row { padding: 8px 16px; background: #fff; border-bottom: 1px solid #ddd;
    display: flex; gap: 6px; font-size: 12px; }
  #filter-row button { padding: 4px 8px; border: 1px solid #ccc; background: #fff;
    border-radius: 3px; cursor: pointer; font-size: 11px; }
  #filter-row button.active { background: #4285f4; color: #fff; border-color: #4285f4; }
</style>
</head>
<body>
<div id="app">
  <div id="map"></div>
  <div id="panel">
    <div id="panel-header">
      <h2>Verificación visual pm Zona Norte</h2>
      <div id="stats">Cargando…</div>
    </div>
    <div id="filter-row">
      <button data-filter="all" class="active">Todos</button>
      <button data-filter="pending">Sin revisar</button>
      <button data-filter="confirmed">Confirmados</button>
      <button data-filter="sospechoso">Sospechosos</button>
    </div>
    <div id="pm-list"></div>
    <div id="pm-detail">Click en un pm de la lista o un pin del mapa para empezar.</div>
    <button id="export-btn">📋 Exportar update.sql con mis decisiones</button>
  </div>
</div>
<div class="legend">
  <b>Mapa</b><br/>
  <span class="dot" style="background:green"></span> Overpass: ≥1 edificio a 30m<br/>
  <span class="dot" style="background:orange"></span> Overpass: sin edificio<br/>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const PM_DATA = ${PM_DATA};
  const STORAGE_KEY = 'pm-zn-verificacion-v1';

  // Cargar decisiones guardadas
  let decisions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  function saveDecisions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
  }

  const map = L.map('map').setView([${center[0]}, ${center[1]}], 14);

  // Capa base OSM + opción satelital
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19
  });
  const satLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri/ArcGIS', maxZoom: 19 }
  );
  osmLayer.addTo(map);
  L.control.layers({ 'OpenStreetMap': osmLayer, 'Satélite (Esri)': satLayer }).addTo(map);

  const markersById = {};

  function addPin(pm, color) {
    const m = L.circleMarker([pm.latitud, pm.longitud], {
      radius: 9, color: color, fillOpacity: 0.7, weight: 2
    }).addTo(map);
    m.on('click', () => showDetail(pm.id_proyecto_master));
    markersById[pm.id_proyecto_master] = m;
  }

  ${markers}

  // ---------- UI: lista de pm en panel ----------

  const pmList = document.getElementById('pm-list');
  let currentFilter = 'all';

  function renderList() {
    const html = PM_DATA
      .filter((pm) => {
        const d = decisions[pm.id_proyecto_master]?.verdict;
        if (currentFilter === 'all') return true;
        if (currentFilter === 'pending') return !d;
        return d === currentFilter;
      })
      .map((pm) => {
        const d = decisions[pm.id_proyecto_master];
        const verdictBadge = d?.verdict
          ? \`<span class="badge badge-\${d.verdict}">\${d.verdict}</span>\`
          : '';
        const osmBadge = pm.gps_verificado_osm
          ? '<span class="badge badge-green">OSM✓</span>'
          : '<span class="badge badge-orange">OSM?</span>';
        return \`<div class="pm-item" data-id="\${pm.id_proyecto_master}">
          <div class="pm-name">\${pm.nombre_oficial}</div>
          <div class="pm-meta">
            \${osmBadge}\${verdictBadge}
            ID \${pm.id_proyecto_master} · \${pm.osm_buildings_around_30m ?? 0} edif. OSM
          </div>
        </div>\`;
      })
      .join('');
    pmList.innerHTML = html;
    pmList.querySelectorAll('.pm-item').forEach((el) => {
      el.addEventListener('click', () => showDetail(parseInt(el.dataset.id)));
    });
    updateStats();
  }

  function updateStats() {
    const total = PM_DATA.length;
    const confirmed = Object.values(decisions).filter(d => d.verdict === 'confirmed').length;
    const sospechoso = Object.values(decisions).filter(d => d.verdict === 'sospechoso').length;
    const noident = Object.values(decisions).filter(d => d.verdict === 'no_identificable').length;
    const pending = total - confirmed - sospechoso - noident;
    document.getElementById('stats').innerHTML =
      \`Total: \${total} · ✅ \${confirmed} · ⚠️ \${sospechoso} · ❓ \${noident} · Sin revisar: \${pending}\`;
  }

  // ---------- UI: detalle de un pm ----------

  function showDetail(id) {
    const pm = PM_DATA.find(p => p.id_proyecto_master === id);
    if (!pm) return;

    // Highlight en lista
    document.querySelectorAll('.pm-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.id) === id);
    });

    // Center map en el pin
    map.setView([pm.latitud, pm.longitud], 18);
    markersById[id]?.openPopup();

    const d = decisions[id] || {};
    const lat = pm.latitud, lon = pm.longitud;
    const nombreEnc = encodeURIComponent(pm.nombre_oficial + ', Santa Cruz, Bolivia');

    // /place/LAT,LON pone PIN rojo. Sin /place el mapa solo se centra (sin pin visible).
    const gmapsUrl = \`https://www.google.com/maps/place/\${lat},\${lon}/@\${lat},\${lon},19z/data=!3m1!1e3\`;
    const gmapsPinUrl = \`https://www.google.com/maps/place/\${lat},\${lon}/@\${lat},\${lon},19z\`;
    const streetViewUrl = \`https://www.google.com/maps?q=&layer=c&cbll=\${lat},\${lon}\`;
    const searchUrl = \`https://www.google.com/maps/search/\${nombreEnc}\`;
    const osmUrl = \`https://www.openstreetmap.org/?mlat=\${lat}&mlon=\${lon}&zoom=19\`;
    const mapillaryUrl = \`https://www.mapillary.com/app/?lat=\${lat}&lng=\${lon}&z=19\`;

    document.getElementById('pm-detail').innerHTML = \`
      <h3>\${pm.nombre_oficial}</h3>
      <div class="info-row"><b>ID:</b> \${pm.id_proyecto_master}</div>
      <div class="info-row"><b>GPS:</b> \${lat}, \${lon}</div>
      <div class="info-row"><b>Overpass:</b> \${pm.osm_buildings_around_30m ?? 'N/A'} edificios a 30m</div>
      <div class="info-row"><b>OSM addr:</b> \${pm.osm_nominatim_address ?? '—'}</div>

      <div class="btn-row">
        <a href="\${gmapsUrl}" target="_blank" class="btn btn-primary">🗺️ Maps satelital</a>
        <a href="\${gmapsPinUrl}" target="_blank" class="btn">📍 Maps pin</a>
        <a href="\${streetViewUrl}" target="_blank" class="btn">📷 Street View</a>
      </div>
      <div class="btn-row">
        <a href="\${searchUrl}" target="_blank" class="btn btn-primary">🔍 Buscar "\${pm.nombre_oficial}" en Maps</a>
      </div>
      <div class="btn-row">
        <a href="\${osmUrl}" target="_blank" class="btn">🌐 OSM</a>
        <a href="\${mapillaryUrl}" target="_blank" class="btn">📸 Mapillary</a>
      </div>

      <div class="verdict-row">
        <button class="verdict-btn confirmed \${d.verdict === 'confirmed' ? 'active' : ''}"
                data-verdict="confirmed">✅ Confirmado</button>
        <button class="verdict-btn sospechoso \${d.verdict === 'sospechoso' ? 'active' : ''}"
                data-verdict="sospechoso">⚠️ Sospechoso</button>
        <button class="verdict-btn no_identificable \${d.verdict === 'no_identificable' ? 'active' : ''}"
                data-verdict="no_identificable">❓ No identificable</button>
      </div>
      <textarea id="notes" placeholder="Notas opcionales (qué viste en Maps, qué edificio aparece, etc.)">\${d.notes || ''}</textarea>
    \`;

    // Bind verdict buttons
    document.querySelectorAll('.verdict-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const verdict = btn.dataset.verdict;
        const currentVerdict = decisions[id]?.verdict;
        if (currentVerdict === verdict) {
          // Toggle off
          delete decisions[id];
        } else {
          decisions[id] = {
            verdict,
            notes: document.getElementById('notes').value,
            ts: new Date().toISOString()
          };
        }
        saveDecisions();
        renderList();
        showDetail(id); // re-render
      });
    });

    // Save notes on blur
    document.getElementById('notes').addEventListener('blur', (e) => {
      if (decisions[id]) {
        decisions[id].notes = e.target.value;
        saveDecisions();
      }
    });
  }

  // ---------- Filtros ----------

  document.querySelectorAll('#filter-row button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filter-row button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderList();
    });
  });

  // ---------- Exportar SQL ----------

  document.getElementById('export-btn').addEventListener('click', () => {
    const lines = [
      '-- Decisiones de verificación visual pm Zona Norte',
      '-- Generado desde verify-pm-gps.html · ' + new Date().toISOString(),
      '',
      'ALTER TABLE proyectos_master',
      '  ADD COLUMN IF NOT EXISTS gps_verificado_visual TEXT,',
      '  ADD COLUMN IF NOT EXISTS gps_verificacion_notas TEXT,',
      '  ADD COLUMN IF NOT EXISTS gps_verificado_visual_at TIMESTAMPTZ;',
      '',
      'BEGIN;',
      '',
    ];
    let n = 0;
    for (const [id, d] of Object.entries(decisions)) {
      const notes = (d.notes || '').replace(/'/g, "''");
      const pm = PM_DATA.find(p => p.id_proyecto_master === parseInt(id));
      lines.push(
        \`UPDATE proyectos_master SET \` +
        \`gps_verificado_visual = '\${d.verdict}', \` +
        \`gps_verificacion_notas = '\${notes}', \` +
        \`gps_verificado_visual_at = NOW() \` +
        \`WHERE id_proyecto_master = \${id};  -- \${pm?.nombre_oficial || ''}\`
      );
      n++;
    }
    lines.push('');
    lines.push(\`-- Total decisiones: \${n}\`);
    lines.push('');
    lines.push('-- Resumen post-UPDATE:');
    lines.push("SELECT gps_verificado_visual, COUNT(*) FROM proyectos_master");
    lines.push("WHERE zona = 'Zona Norte' GROUP BY 1;");
    lines.push('');
    lines.push('COMMIT;');

    const sql = lines.join('\\n');
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'update-verificacion-visual.sql';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---------- Init ----------

  renderList();
</script>
</body>
</html>`;

writeFileSync(HTML_OUT, html);

// ---------- Reporte ----------

const verified = results.filter((r) => r.gps_verificado_osm === true).length;
const notVerified = results.filter((r) => r.gps_verificado_osm === false).length;
const errors = results.filter((r) => r.gps_verificado_osm === null).length;

console.log("");
console.log("=== Resumen ===");
console.log(`Total pm verificados: ${results.length}`);
console.log(`✅ Con edificio OSM a 30m: ${verified}`);
console.log(`⚠️  Sin edificio OSM a 30m (revisar manual): ${notVerified}`);
console.log(`❌ Errores: ${errors}`);
console.log("");
console.log(`Outputs:`);
console.log(`  - ${RESULTS}`);
console.log(`  - ${SQL_OUT}`);
console.log(`  - ${HTML_OUT}`);
console.log("");
console.log("Próximos pasos:");
console.log("  1. Abrí verify-pm-gps.html en el navegador para inspección visual.");
console.log("  2. Pegá update.sql en Supabase UI.");
