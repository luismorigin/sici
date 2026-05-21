// POC Discovery Zona Norte — AISLADO, solo lectura, NO toca la BD de producción.
// Trae props de C21 + Remax + Bien Inmuebles (venta + alquiler) de Santa Cruz,
// filtra por el polígono de prueba y reporta volumen + calidad de datos.
//
// Uso: node scripts/poc-zona-norte/poc-discovery.mjs
// Requiere Node 18+ (fetch nativo).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOJSON_PATH = join(__dirname, "poligono-prueba.geojson");
const OUT_PATH = join(__dirname, "resultados.json");

// ---------- Geometría ----------
const geo = JSON.parse(readFileSync(GEOJSON_PATH, "utf8"));
const ring = geo.features[0].geometry.coordinates[0]; // [[lon,lat], ...]

function pointInPolygon(lon, lat, poly) {
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

const lats = ring.map((c) => c[1]);
const lons = ring.map((c) => c[0]);
const BBOX = {
  south: Math.min(...lats),
  north: Math.max(...lats),
  west: Math.min(...lons),
  east: Math.max(...lons),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inZone = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && pointInPolygon(lon, lat, ring);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------- C21 ----------
async function fetchC21(operacion) {
  // operacion: 'venta' (operacion_venta) | 'alquiler' (operacion_renta)
  const opSeg = operacion === "venta" ? "operacion_venta" : "operacion_renta";
  const STEP = 0.01;
  const out = [];
  let requests = 0;
  for (let lat = BBOX.south; lat < BBOX.north; lat += STEP) {
    for (let lon = BBOX.west; lon < BBOX.east; lon += STEP) {
      const south = lat.toFixed(6);
      const west = lon.toFixed(6);
      const north = (lat + STEP).toFixed(6);
      const east = (lon + STEP).toFixed(6);
      const url = `https://c21.com.bo/v/resultados/tipo_departamento-o-penthouse/${opSeg}/layout_mapa/coordenadas_${north},${east},${south},${west},15?json=true`;
      const cookie = `PHPSESSID=sici_poc_${Math.random().toString(36).slice(2, 12)}`;
      try {
        const res = await fetch(url, {
          headers: {
            accept: "application/json, text/plain, */*",
            "accept-language": "es-US,es-419;q=0.9,es;q=0.8,en;q=0.7",
            "user-agent": UA,
            cookie,
          },
        });
        requests++;
        const data = await res.json().catch(() => null);
        let props = [];
        if (Array.isArray(data)) props = data;
        else if (data?.results) props = data.results;
        else if (data?.datas?.results) props = data.datas.results;
        for (const p of props) {
          out.push({
            portal: "c21",
            operacion,
            codigo: String(p.id),
            url: `https://c21.com.bo${p.urlCorrectaPropiedad || "/propiedad/" + p.id}`,
            lat: parseFloat(p.lat),
            lon: parseFloat(p.lon),
            precio: p.precio ?? null,
            moneda: p.moneda || "USD",
            area: p.m2C ?? null,
            dorms: p.recamaras ?? null,
            banos: p.banos ?? null,
            tipo: p.tipoPropiedad ?? null,
            op_portal: p.tipoOperacion ?? null,
          });
        }
      } catch (e) {
        console.error(`  C21 ${operacion} err ${north},${east}: ${e.message}`);
      }
      await sleep(700);
    }
  }
  // dedup por código
  const seen = new Map();
  for (const p of out) if (!seen.has(p.codigo)) seen.set(p.codigo, p);
  console.log(`  C21 ${operacion}: ${requests} requests, ${seen.size} props únicas (todo el bbox)`);
  return [...seen.values()];
}

// ---------- Remax ----------
async function fetchRemaxAll() {
  // Endpoint base SC (sin slug de zona) = todo Santa Cruz, paginado.
  const base =
    "https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra";
  const out = [];
  let page = 1;
  let lastPage = 1;
  do {
    const url = `${base}?page=${page}`;
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": UA },
      });
      const data = await res.json().catch(() => null);
      const props = data?.data || [];
      lastPage =
        data?.meta?.last_page || data?.last_page || (props.length ? page + 1 : page);
      for (const p of props) {
        const op = (p.transaction_type?.name || "").toLowerCase();
        out.push({
          portal: "remax",
          operacion: op.includes("alquil") || op.includes("renta") ? "alquiler" : op.includes("venta") ? "venta" : op,
          codigo: p.MLSID,
          url: `https://remax.bo/propiedad/${p.slug}`,
          lat: parseFloat(p.location?.latitude),
          lon: parseFloat(p.location?.longitude),
          precio: p.price?.price_in_dollars ?? p.price?.amount ?? null,
          moneda: p.price?.currency_id === 1 ? "BOB" : "USD",
          area: p.listing_information?.construction_area_m ?? null,
          dorms: p.listing_information?.number_bedrooms ?? null,
          banos: p.listing_information?.number_bathrooms ?? null,
          tipo: p.listing_information?.subtype_property?.name ?? null,
          op_portal: p.transaction_type?.name ?? null,
          zone_portal: p.location?.zone?.name ?? null,
        });
      }
    } catch (e) {
      console.error(`  Remax page ${page} err: ${e.message}`);
    }
    await sleep(500);
    page++;
  } while (page <= lastPage && page <= 40);
  console.log(`  Remax: ${out.length} props todo SC (páginas hasta ${page - 1})`);
  return out;
}

// ---------- Bien Inmuebles ----------
async function fetchBI(modalidad) {
  // modalidad: 1=venta, 2=alquiler. id_fami=1 => departamento.
  const op = modalidad === 1 ? "venta" : "alquiler";
  const body = `proceso=getCatalogo&search=&modalidad=${modalidad}&id_fami=1&id_orig=0&id_habi=0&id_bano=0&id_gara=0&id_carac=&minprecio=100&maxprecio=10000000&page=1&filas=2000`;
  const out = [];
  try {
    const res = await fetch(
      "https://www.bieninmuebles.com.bo/common/php/procesos.php",
      {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": UA,
        },
        body,
      }
    );
    const text = await res.text();
    let listings = [];
    try {
      let parsed = JSON.parse(text);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      listings = Array.isArray(parsed) ? parsed : parsed?.data || [];
    } catch {
      console.error(`  BI ${op}: no se pudo parsear (${text.slice(0, 80)})`);
    }
    for (const it of listings) {
      const moneda = it.moneda_cata === "2" ? "USD" : "BOB";
      const precio =
        parseFloat(String(it.precio_cata || "0").replace(/,/g, "")) || null;
      out.push({
        portal: "bi",
        operacion: op,
        codigo: it.code_cata || String(it.id_cata),
        url: `https://www.bieninmuebles.com.bo/property.php?id=${it.id_cata}`,
        lat: it.latitud_cata ? parseFloat(it.latitud_cata) : NaN,
        lon: it.longitud_cata ? parseFloat(it.longitud_cata) : NaN,
        precio,
        moneda,
        area: parseFloat(it.supterreno_cata) || null,
        dorms: parseInt(it.habitacion_cata) || null,
        banos: parseInt(it.banio_cata) || null,
        tipo: "departamento",
        op_portal: op,
        barrio_portal: it.nomb_barri ?? null,
      });
    }
  } catch (e) {
    console.error(`  BI ${op} err: ${e.message}`);
  }
  console.log(`  BI ${op}: ${out.length} props todo SC`);
  return out;
}

// ---------- Reporte ----------
function resumen(label, props) {
  const dentro = props.filter((p) => inZone(p.lat, p.lon));
  const conPrecio = dentro.filter((p) => p.precio != null && p.precio > 0).length;
  const conArea = dentro.filter((p) => p.area != null && p.area > 0).length;
  const conDorms = dentro.filter((p) => p.dorms != null).length;
  return {
    label,
    traido: props.length,
    dentro: dentro.length,
    conPrecio,
    conArea,
    conDorms,
    items: dentro,
  };
}

(async () => {
  console.log("=== POC DISCOVERY ZONA NORTE (aislado, no toca BD) ===");
  console.log(
    `Polígono bbox: lat ${BBOX.south.toFixed(4)}→${BBOX.north.toFixed(4)}, lon ${BBOX.west.toFixed(4)}→${BBOX.east.toFixed(4)}\n`
  );

  console.log("Trayendo C21...");
  const c21v = await fetchC21("venta");
  const c21a = await fetchC21("alquiler");
  console.log("Trayendo Remax (todo SC)...");
  const remaxAll = await fetchRemaxAll();
  const remaxV = remaxAll.filter((p) => p.operacion === "venta");
  const remaxA = remaxAll.filter((p) => p.operacion === "alquiler");
  console.log("Trayendo Bien Inmuebles...");
  const biV = await fetchBI(1);
  const biA = await fetchBI(2);

  const bloques = [
    resumen("C21 venta", c21v),
    resumen("C21 alquiler", c21a),
    resumen("Remax venta", remaxV),
    resumen("Remax alquiler", remaxA),
    resumen("BI venta", biV),
    resumen("BI alquiler", biA),
  ];

  console.log("\n=== RESULTADOS (dentro del polígono) ===");
  console.log(
    "portal/op".padEnd(16) +
      "traído".padStart(8) +
      "dentro".padStart(8) +
      "precio".padStart(8) +
      "área".padStart(7) +
      "dorms".padStart(7)
  );
  for (const b of bloques) {
    console.log(
      b.label.padEnd(16) +
        String(b.traido).padStart(8) +
        String(b.dentro).padStart(8) +
        String(b.conPrecio).padStart(8) +
        String(b.conArea).padStart(7) +
        String(b.conDorms).padStart(7)
    );
  }

  const totVenta = bloques.filter((b) => b.label.includes("venta")).reduce((s, b) => s + b.dentro, 0);
  const totAlq = bloques.filter((b) => b.label.includes("alquiler")).reduce((s, b) => s + b.dentro, 0);
  console.log(`\nTOTAL dentro del polígono: ${totVenta + totAlq} (venta ${totVenta} / alquiler ${totAlq})`);

  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generado: new Date().toISOString(),
        bbox: BBOX,
        resumen: bloques.map(({ items, ...r }) => r),
        items: bloques.flatMap((b) => b.items),
      },
      null,
      2
    )
  );
  console.log(`\nDetalle completo guardado en: ${OUT_PATH}`);
})();
