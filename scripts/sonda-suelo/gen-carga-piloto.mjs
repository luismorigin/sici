// Genera el SQL de carga del lote piloto de casas (40) a propiedades_v2.
// Merge: lote-piloto-casas.json (lat/lon/fuente) + los 4 lote-piloto-enriquecido-N.json (contacto + MOAT).
// Reglas de precio = contrato de deptos (verificado 20-jun):
//   precio_usd = billete USD; si moneda BOB -> bob/6.96 (oficial). tipo_cambio_detectado del texto.
//   depende_de_tc = (tc === 'paralelo'). precio_normalizado() ajusta en la vista.
// Excluye el anticretico (idx 1). Todas id_condominio_master=NULL (matcher dio 0; individuales validas).
import fs from 'node:fs';

const DIR = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo';
const lote = JSON.parse(fs.readFileSync(`${DIR}/lote-piloto-casas.json`, 'utf8'));
const enr = [0, 1, 2, 3].flatMap((n) =>
  JSON.parse(fs.readFileSync(`${DIR}/lote-piloto-enriquecido-${n}.json`, 'utf8'))
);
const loteByIdx = new Map(lote.map((c) => [c.idx, c]));

const EXCLUIR = new Set([1]); // anticretico
const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? 'NULL' : Number(v));
const bool = (v) => (v == null ? 'NULL' : v ? 'true' : 'false');

const rows = [];
const reporte = [];
for (const e of enr) {
  if (EXCLUIR.has(e.idx)) { reporte.push(`EXCLUIDA idx ${e.idx} (anticretico)`); continue; }
  const l = loteByIdx.get(e.idx);
  if (!l) { reporte.push(`SIN lote idx ${e.idx}`); continue; }

  // Precio
  const moneda = e.precio_moneda || l.moneda || 'USD';
  let precio_usd;
  if (moneda === 'BOB') precio_usd = Math.round((Number(e.precio_valor) / 6.96) * 100) / 100;
  else precio_usd = Math.round(Number(e.precio_valor) * 100) / 100;
  let tc = e.tc_detectado || 'no_especificado';
  if (moneda === 'BOB' && tc === 'paralelo') tc = 'no_especificado'; // Bs no es billete paralelo
  const depende = tc === 'paralelo';

  const amen = Array.isArray(e.amenidades) && e.amenidades.length
    ? `jsonb_build_array(${e.amenidades.map(q).join(',')})`
    : `'[]'::jsonb`;

  // jsonb con UNA clave por linea (lineas cortas: el editor de Supabase parte lineas largas y rompe NULL)
  const ejson = `jsonb_build_object(
      'agente_nombre', ${q(e.agente_nombre)},
      'agente_telefono', ${q(e.agente_telefono)},
      'url_whatsapp', ${q(e.url_whatsapp)},
      'oficina_nombre', ${q(e.oficina_nombre)},
      'contacto_visible', ${bool(e.contacto_visible)},
      'es_cerrado', ${bool(e.es_cerrado)},
      'estado_construccion', ${q(e.estado_construccion)},
      'nombre_condominio_detectado', ${q(e.nombre_condominio)},
      'amenidades', ${amen},
      'fuente_enrichment', 'piloto_lector_20jun'
    )`;

  const area_const = e.area_construida_m2 != null ? e.area_construida_m2 : l.area_const_m2;
  rows.push(`(${q(l.url)},
   ${q(l.fuente)}, 'venta', 'casa',
   ${num(l.lat)}, ${num(l.lon)},
   ${num(area_const)}, ${num(e.area_terreno_m2)},
   ${num(e.dormitorios)}, ${num(e.banos)},
   ${precio_usd}, ${q(moneda)}, ${q(tc)}, ${depende},
   'completado', true, NULL, 'carga_piloto_casas_20jun',
   ${ejson})`);
  reporte.push(`idx ${e.idx}: ${precio_usd} USD (${moneda}/${tc}) tel=${e.agente_telefono ? 'si' : 'NO'}`);
}

const sql = `-- Carga lote piloto casas ZN (39 = 40 menos anticretico) — 20-jun-2026
-- Contrato precio = deptos (verificado). datos_json_enrichment con contacto + MOAT. Todas individuales.
BEGIN;
INSERT INTO propiedades_v2
 (url, fuente, tipo_operacion, tipo_propiedad_original, latitud, longitud,
  area_total_m2, area_terreno_m2, dormitorios, banos,
  precio_usd, moneda_original, tipo_cambio_detectado, depende_de_tc, status, es_activa,
  id_condominio_master, metodo_match, datos_json_enrichment)
VALUES
${rows.join(',\n')};

-- Verificacion
SELECT COUNT(*) AS cargadas,
  COUNT(*) FILTER (WHERE datos_json_enrichment->>'agente_telefono' IS NOT NULL) AS con_contacto,
  COUNT(*) FILTER (WHERE id IN (SELECT id FROM v_mercado_venta)) AS contaminan_feed_OJO
FROM propiedades_v2 WHERE metodo_match='carga_piloto_casas_20jun';
ROLLBACK;  -- cambiar a COMMIT para aplicar
`;
fs.writeFileSync(`${DIR}/carga-casas-piloto-20jun.sql`, sql, 'utf8');
console.log(reporte.join('\n'));
console.log(`\n${rows.length} filas escritas en carga-casas-piloto-20jun.sql`);
