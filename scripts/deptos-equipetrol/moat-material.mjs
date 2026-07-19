// Prepara el MATERIAL DE LECTURA para el MOAT (agente-lector = Claude Code, no API).
// Fetchea $0 la descripción + diagnóstico de precio de una lista de ids, para que el
// lector dictamine: precio real, TC (paralelo/oficial/no_especificado, regla "TC 7"=oficial),
// dorms corregidos, nombre_edificio, y gate (aceptar/rechazar). Semilla del command futuro.
import { fetchC21Depto } from './lib/detalle-deptos.mjs';
import { writeFileSync } from 'node:fs';

// {id, fuente, url, n8n_*} de la muestra (divergencias de precio + misses de dorms + nombre)
const CASOS = [
  { id: 3519, url: 'https://c21.com.bo/propiedad/105826_departamento-en-venta-a-estrenar-en-equipetrol-us-52-245-edificio-hh-once', area: 34.83, n8n: { precio: 7506, tc: 'no_especificado', dorm: 1, edif: 'HH Once Equipetrol' } },
  { id: 3490, url: 'https://c21.com.bo/propiedad/114607_departamento-2-dormitorios-en-sky-eclipse-parqueo', area: 101, n8n: { precio: 12069, tc: 'no_especificado', dorm: 2, edif: 'Sky Eclipse' } },
  { id: 3491, url: 'https://c21.com.bo/propiedad/114608_departamento-2-dormitorios-en-sky-eclipse-parqueo', area: 101, n8n: { precio: 165948, tc: 'no_especificado', dorm: 2, edif: 'Sky Eclipse' } },
  { id: 3455, url: 'https://c21.com.bo/propiedad/109221_departamento-en-venta-edificio-montebelluna', area: 85, n8n: { precio: 135000, tc: 'paralelo', dorm: 2, edif: 'Edificio MonteBelluna' } },
  { id: 2674, url: 'https://c21.com.bo/propiedad/104413_en-venta-monoambiente-a-estrenar-en-equipetrol', area: 39, n8n: { precio: 61290, tc: 'paralelo', dorm: 1, edif: null } },
  { id: 3456, url: 'https://c21.com.bo/propiedad/114113_venta-departamento-en-corazon-de-equipetrol', area: 48.24, n8n: { precio: 75000, tc: 'no_especificado', dorm: 1, edif: 'Klug' } },
  { id: 1718, url: 'https://c21.com.bo/propiedad/108251_departamento-de-1-dormitorio-en-venta', area: 50, n8n: { precio: 102586, tc: 'oficial', dorm: 1, edif: null } },
];

const out = [];
for (const c of CASOS) {
  const h = await fetchC21Depto(c.url);
  const rec = {
    id: c.id, area: c.area, n8n: c.n8n,
    hibrido_precio_pick: h?.precio_fuente_usd, moneda: h?.moneda,
    diag_precio: h?._diag,
    dorms_entity: h?.dormitorios, piso: h?.piso,
    descripcion: h?.descripcion,
  };
  out.push(rec);
  console.log(`\n${'='.repeat(78)}\nID ${c.id} · área ${c.area}m² · n8n[precio=$${c.n8n.precio} tc=${c.n8n.tc} dorm=${c.n8n.dorm} edif=${c.n8n.edif}]`);
  console.log(`híbrido pick=$${h?.precio_fuente_usd} (${h?.moneda}) · diag ${JSON.stringify(h?._diag)} · recamaras_entity=${h?.dormitorios} · piso=${h?.piso}`);
  console.log(`DESCRIPCIÓN:\n${h?.descripcion}`);
  await new Promise((r) => setTimeout(r, 400));
}
writeFileSync(new URL('./output/moat-material.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(`\n\n💾 output/moat-material.json`);
