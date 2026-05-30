// Spike Fase 0a (#7.1) — Inventario de ALQUILER en Zona Norte por portal.
// AISLADO, solo lectura, NO toca la BD. Fetch directo a las APIs de los portales
// (mismo método que poc-discovery.mjs, costo $0). Cuenta props de alquiler de
// C21 + Remax + Bien Inmuebles dentro del polígono ZN DEFINITIVO (14 microzonas).
//
// Objetivo: decidir qué portales clonar para discovery alquiler ZN con DATOS de
// ZN (no extrapolando desde Equipetrol).
//
// Uso: node scripts/poc-zona-norte/spike-alquiler-zn.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOJSON_PATH = join(
  __dirname,
  "..",
  "..",
  "docs",
  "proyectos",
  "zona-norte",
  "microzonas-propuesta",
  "microzonas-zn-final-recortado.geojson"
);
const OUT_PATH = join(__dirname, "resultados-alquiler-zn.json");

// ---------- Geometría (14 microzonas) ----------
const geo = JSON.parse(readFileSync(GEOJSON_PATH, "utf8").replace(/^﻿/, ""));
const MICROZONAS = geo.features.map((f) => ({
  nombre: f.properties?.nombre || "(sin nombre)",
  ring: f.geometry.coordinates[0], // [[lon,lat], ...]
}));
// bbox por microzona (para acotar el grid de C21) + bbox global
for (const m of MICROZONAS) {
  const lats = m.ring.map((c) => c[1]);
  const lons = m.ring.map((c) => c[0]);
  m.bbox = { s: Math.min(...lats), n: Math.max(...lats), w: Math.min(...lons), e: Math.max(...lons) };
}
const BBOX = {
  south: Math.min(...MICROZONAS.map((m) => m.bbox.s)),
  north: Math.max(...MICROZONAS.map((m) => m.bbox.n)),
  west: Math.min(...MICROZONAS.map((m) => m.bbox.w)),
  east: Math.max(...MICROZONAS.map((m) => m.bbox.e)),
};

function pointInRing(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
// devuelve el nombre de la microzona donde cae el punto, o null
function zoneOf(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const m of MICROZONAS) {
    if (lat < m.bbox.s || lat > m.bbox.n || lon < m.bbox.w || lon > m.bbox.e) continue;
    if (pointInRing(lon, lat, m.ring)) return m.nombre;
  }
  return null;
}
// ¿una celda del grid (sLat..nLat, wLon..eLon) solapa el bbox de alguna microzona?
function celdaUtil(sLat, nLat, wLon, eLon) {
  for (const m of MICROZONAS) {
    if (sLat <= m.bbox.n && nLat >= m.bbox.s && wLon <= m.bbox.e && eLon >= m.bbox.w) return true;
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------- C21 alquiler (grid, solo celdas que solapan microzonas) ----------
async function fetchC21Alquiler() {
  const STEP = 0.01;
  const out = [];
  let requests = 0, celdas = 0, skipped = 0;
  for (let lat = BBOX.south; lat < BBOX.north; lat += STEP) {
    for (let lon = BBOX.west; lon < BBOX.east; lon += STEP) {
      const south = lat, west = lon, north = lat + STEP, east = lon + STEP;
      if (!celdaUtil(south, north, west, east)) { skipped++; continue; }
      celdas++;
      const url = `https://c21.com.bo/v/resultados/tipo_departamento-o-penthouse/operacion_renta/layout_mapa/coordenadas_${north.toFixed(6)},${east.toFixed(6)},${south.toFixed(6)},${west.toFixed(6)},15?json=true`;
      const cookie = `PHPSESSID=sici_spike_${Math.random().toString(36).slice(2, 12)}`;
      try {
        const res = await fetch(url, {
          headers: { accept: "application/json, text/plain, */*", "user-agent": UA, cookie },
        });
        requests++;
        const data = await res.json().catch(() => null);
        let props = [];
        if (Array.isArray(data)) props = data;
        else if (data?.results) props = data.results;
        else if (data?.datas?.results) props = data.datas.results;
        for (const p of props) {
          out.push({
            portal: "c21", codigo: String(p.id),
            url: `https://c21.com.bo${p.urlCorrectaPropiedad || "/propiedad/" + p.id}`,
            lat: parseFloat(p.lat), lon: parseFloat(p.lon),
            precio: p.precio ?? null, moneda: p.moneda || "USD",
            area: p.m2C ?? null, dorms: p.recamaras ?? null,
          });
        }
      } catch (e) {
        console.error(`  C21 err ${north.toFixed(3)},${east.toFixed(3)}: ${e.message}`);
      }
      await sleep(700);
    }
  }
  const seen = new Map();
  for (const p of out) if (!seen.has(p.codigo)) seen.set(p.codigo, p);
  console.log(`  C21 alquiler: ${celdas} celdas útiles (${skipped} saltadas), ${requests} requests, ${seen.size} props únicas`);
  return [...seen.values()];
}

// ---------- Remax (todo SC, filtra alquiler) ----------
async function fetchRemaxAlquiler() {
  const base = "https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra";
  const out = [];
  let page = 1, lastPage = 1;
  do {
    try {
      const res = await fetch(`${base}?page=${page}`, {
        headers: { accept: "application/json", "user-agent": UA },
      });
      const data = await res.json().catch(() => null);
      const props = data?.data || [];
      lastPage = data?.meta?.last_page || data?.last_page || (props.length ? page + 1 : page);
      for (const p of props) {
        const op = (p.transaction_type?.name || "").toLowerCase();
        const esAlq = op.includes("alquil") || op.includes("renta") || op.includes("anti");
        if (!esAlq) continue;
        out.push({
          portal: "remax", codigo: p.MLSID,
          url: `https://remax.bo/propiedad/${p.slug}`,
          lat: parseFloat(p.location?.latitude), lon: parseFloat(p.location?.longitude),
          precio: p.price?.price_in_dollars ?? p.price?.amount ?? null,
          moneda: p.price?.currency_id === 1 ? "BOB" : "USD",
          area: p.listing_information?.construction_area_m ?? null,
          dorms: p.listing_information?.number_bedrooms ?? null,
          zone_portal: p.location?.zone?.name ?? null,
        });
      }
    } catch (e) {
      console.error(`  Remax page ${page} err: ${e.message}`);
    }
    await sleep(500);
    page++;
  } while (page <= lastPage && page <= 60);
  console.log(`  Remax alquiler: ${out.length} props alquiler en todo SC (páginas hasta ${page - 1})`);
  return out;
}

// ---------- Bien Inmuebles (modalidad 2 = alquiler) ----------
async function fetchBIAlquiler() {
  const body = `proceso=getCatalogo&search=&modalidad=2&id_fami=1&id_orig=0&id_habi=0&id_bano=0&id_gara=0&id_carac=&minprecio=100&maxprecio=10000000&page=1&filas=2000`;
  const out = [];
  try {
    const res = await fetch("https://www.bieninmuebles.com.bo/common/php/procesos.php", {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest", "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
      body,
    });
    const text = await res.text();
    let listings = [];
    try {
      let parsed = JSON.parse(text);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      listings = Array.isArray(parsed) ? parsed : parsed?.data || [];
    } catch {
      console.error(`  BI: no se pudo parsear (${text.slice(0, 80)})`);
    }
    for (const it of listings) {
      out.push({
        portal: "bi", codigo: it.code_cata || String(it.id_cata),
        url: `https://www.bieninmuebles.com.bo/property.php?id=${it.id_cata}`,
        lat: it.latitud_cata ? parseFloat(it.latitud_cata) : NaN,
        lon: it.longitud_cata ? parseFloat(it.longitud_cata) : NaN,
        precio: parseFloat(String(it.precio_cata || "0").replace(/,/g, "")) || null,
        moneda: it.moneda_cata === "2" ? "USD" : "BOB",
        area: parseFloat(it.supterreno_cata) || null,
        dorms: parseInt(it.habitacion_cata) || null,
        barrio_portal: it.nomb_barri ?? null,
      });
    }
  } catch (e) {
    console.error(`  BI err: ${e.message}`);
  }
  console.log(`  BI alquiler: ${out.length} props alquiler en todo SC`);
  return out;
}

// ---------- Reporte ----------
function analizar(label, props) {
  const dentro = props
    .map((p) => ({ ...p, microzona: zoneOf(p.lat, p.lon) }))
    .filter((p) => p.microzona);
  return {
    label,
    traido: props.length,
    dentro_zn: dentro.length,
    con_gps: props.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).length,
    con_precio: dentro.filter((p) => p.precio != null && p.precio > 0).length,
    con_area: dentro.filter((p) => p.area != null && p.area > 0).length,
    con_dorms: dentro.filter((p) => p.dorms != null).length,
    items: dentro,
  };
}

(async () => {
  console.log("=== SPIKE FASE 0a — INVENTARIO ALQUILER ZONA NORTE POR PORTAL ===");
  console.log(`Polígono: 14 microzonas. bbox lat ${BBOX.south.toFixed(4)}→${BBOX.north.toFixed(4)}, lon ${BBOX.west.toFixed(4)}→${BBOX.east.toFixed(4)}\n`);

  console.log("Trayendo C21 alquiler (grid)...");
  const c21 = await fetchC21Alquiler();
  console.log("Trayendo Remax alquiler (todo SC)...");
  const remax = await fetchRemaxAlquiler();
  console.log("Trayendo Bien Inmuebles alquiler...");
  const bi = await fetchBIAlquiler();

  const bloques = [analizar("C21", c21), analizar("Remax", remax), analizar("BI", bi)];

  console.log("\n=== INVENTARIO ALQUILER DENTRO DE ZONA NORTE ===");
  console.log("portal".padEnd(8) + "traído".padStart(8) + "EN ZN".padStart(8) + "precio".padStart(8) + "área".padStart(7) + "dorms".padStart(7));
  for (const b of bloques) {
    console.log(
      b.label.padEnd(8) + String(b.traido).padStart(8) + String(b.dentro_zn).padStart(8) +
      String(b.con_precio).padStart(8) + String(b.con_area).padStart(7) + String(b.con_dorms).padStart(7)
    );
  }
  const total = bloques.reduce((s, b) => s + b.dentro_zn, 0);
  console.log(`\nTOTAL alquiler en ZN: ${total}  (C21 ${bloques[0].dentro_zn} / Remax ${bloques[1].dentro_zn} / BI ${bloques[2].dentro_zn})`);

  // Desglose por microzona
  console.log("\n=== POR MICROZONA (alquiler) ===");
  const porMz = {};
  for (const b of bloques) for (const it of b.items) {
    porMz[it.microzona] = porMz[it.microzona] || { c21: 0, remax: 0, bi: 0 };
    porMz[it.microzona][b.label.toLowerCase()]++;
  }
  for (const [mz, c] of Object.entries(porMz).sort((a, b) => (b[1].c21 + b[1].remax + b[1].bi) - (a[1].c21 + a[1].remax + a[1].bi))) {
    console.log(`  ${mz.padEnd(38)} total ${String(c.c21 + c.remax + c.bi).padStart(3)}  (C21 ${c.c21} / Remax ${c.remax} / BI ${c.bi})`);
  }

  writeFileSync(OUT_PATH, JSON.stringify({
    generado_utc: "(stamp al guardar)",
    bbox: BBOX,
    resumen: bloques.map(({ items, ...r }) => r),
    items: bloques.flatMap((b) => b.items),
  }, null, 2));
  console.log(`\nDetalle guardado en: ${OUT_PATH}`);
  console.log("\nLECTURA: el portal con más 'EN ZN' es el prioritario para clonar primero.");
})();
