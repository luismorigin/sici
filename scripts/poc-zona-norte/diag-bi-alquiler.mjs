// Diagnóstico captura Bien Inmuebles (alquiler): por qué el spike solo halló 2 en ZN.
// Hipótesis: BI manda GPS parcial → props sin lat/lon no se pueden ubicar en ZN.
// AISLADO, solo lectura, no toca BD. Costo $0.
// Uso: node scripts/poc-zona-norte/diag-bi-alquiler.mjs

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchBI({ idFami, label }) {
  const fami = idFami ? `&id_fami=${idFami}` : "&id_fami=0";
  const body = `proceso=getCatalogo&search=&modalidad=2&id_orig=0${fami}&id_habi=0&id_bano=0&id_gara=0&id_carac=&minprecio=0&maxprecio=100000000&page=1&filas=5000`;
  const res = await fetch("https://www.bieninmuebles.com.bo/common/php/procesos.php", {
    method: "POST",
    headers: { "X-Requested-With": "XMLHttpRequest", "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
    body,
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); if (typeof parsed === "string") parsed = JSON.parse(parsed); }
  catch { console.log(`  [${label}] no parseó. Primeros 200 chars:`, text.slice(0, 200)); return []; }
  const list = Array.isArray(parsed) ? parsed : parsed?.data || [];

  const hasGps = (it) => it.latitud_cata && it.longitud_cata && Number.isFinite(parseFloat(it.latitud_cata)) && parseFloat(it.latitud_cata) !== 0;
  const conGps = list.filter(hasGps);
  const sinGps = list.filter((it) => !hasGps(it));

  console.log(`\n[${label}] modalidad=2 (alquiler) → TOTAL ${list.length}  |  con GPS ${conGps.length}  |  SIN GPS ${sinGps.length}`);

  // distribución por barrio (todas) — para detectar barrios de ZN que se pierden por falta de GPS
  const barrios = {};
  for (const it of list) {
    const b = (it.nomb_barri || "(null)").trim();
    barrios[b] = barrios[b] || { total: 0, sinGps: 0 };
    barrios[b].total++;
    if (!hasGps(it)) barrios[b].sinGps++;
  }
  console.log(`  Barrios (top 25 por total):`);
  for (const [b, c] of Object.entries(barrios).sort((a, b2) => b2[1].total - a[1].total).slice(0, 25)) {
    console.log(`    ${b.padEnd(28)} ${String(c.total).padStart(3)}  (sin GPS: ${c.sinGps})`);
  }

  // tipos de propiedad si el campo existe
  const tipos = {};
  for (const it of list) { const t = it.nomb_fami || it.id_fami || "(?)"; tipos[t] = (tipos[t] || 0) + 1; }
  console.log(`  Tipos (nomb_fami):`, Object.entries(tipos).map(([t, n]) => `${t}:${n}`).join(", "));

  // muestra de 5 sin GPS
  if (sinGps.length) {
    console.log(`  Muestra SIN GPS (5):`);
    for (const it of sinGps.slice(0, 5)) {
      console.log(`    id ${it.id_cata} | ${it.nomb_barri || "?"} | ${it.nomb_fami || "?"} | precio ${it.precio_cata} | lat=${it.latitud_cata} lon=${it.longitud_cata}`);
    }
  }
  return list;
}

(async () => {
  console.log("=== DIAGNÓSTICO BI ALQUILER — captura y GPS ===");
  await fetchBI({ idFami: 1, label: "id_fami=1 (departamentos, lo que usa el spike)" });
  await new Promise((r) => setTimeout(r, 800));
  await fetchBI({ idFami: 0, label: "id_fami=0 (TODOS los tipos)" });
  console.log("\nLECTURA: si hay muchos 'SIN GPS' en barrios del norte/Banzer, el spike por-GPS los pierde →");
  console.log("para BI hay que ubicar por barrio (nomb_barri), no solo por GPS. Igual que el discovery BI real, que filtra por barrio.");
})();
