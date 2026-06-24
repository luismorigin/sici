#!/usr/bin/env node
// audit-cola-matching.mjs — FASE MECÁNICA de la auditoría de cola de matching.
//
// Hace SOLO lo determinista y barato:
//   1. trae la cola `pendiente_<macrozona>` (db.mjs)
//   2. fetchea el anuncio real de cada prop (lector.mjs — C21 ?json / Remax data-page)
//   3. pre-clasifica con token/GPS/atractor (atractores.mjs) para ORDENAR la cola
//   4. escribe un paquete JSON con el texto listo para el juez
//
// NO decide ningún match. El veredicto (APROBAR/CORREGIR/RECHAZAR/PM_NUEVO/SIN_NOMBRE)
// lo dan los subagentes-lectores que lanza Claude siguiendo el .command.md, leyendo
// `descripcion`/`titulo` de este JSON. Read-only: no escribe en la BD.
//
// Uso:  node audit-cola-matching.mjs --macrozona=zona-norte [--out=ruta.json] [--limit=N]

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { getSupabaseClient, getColaPendiente, estadoDeMacrozona } from './lib/db.mjs';
import { leerLote } from './lib/lector.mjs';
import { preclasificar } from './lib/atractores.mjs';

// Cargar .env.local del frontend (mismo patrón que las otras skills).
loadEnv({ path: resolve(process.cwd(), '../../simon-mvp/.env.local') });
loadEnv({ path: resolve(process.cwd(), 'simon-mvp/.env.local') }); // fallback si se corre desde la raíz

function parseArgs() {
  const a = { macrozona: 'zona-norte', out: null, limit: null };
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    if (m[1] === 'macrozona') a.macrozona = m[2];
    else if (m[1] === 'out') a.out = m[2];
    else if (m[1] === 'limit') a.limit = parseInt(m[2], 10);
  }
  return a;
}

async function main() {
  const args = parseArgs();
  const estado = estadoDeMacrozona(args.macrozona);
  console.error(`[cola] macrozona=${args.macrozona} → estado='${estado}'`);

  const supabase = getSupabaseClient();
  let { sugerencias } = await getColaPendiente(supabase, args.macrozona);
  if (args.limit) sugerencias = sugerencias.slice(0, args.limit);

  if (!sugerencias.length) {
    console.error(`[cola] 0 sugerencias en '${estado}'. Nada que auditar. ✅`);
    emit(args, { estado, total: 0, sugerencias: [] });
    return;
  }
  console.error(`[cola] ${sugerencias.length} sugerencias (${new Set(sugerencias.map((s) => s.prop_id)).size} props únicas). Fetcheando anuncios…`);

  // Una lectura por PROP única (varias sugerencias comparten prop/url).
  const propsUnicas = [...new Map(sugerencias.map((s) => [s.prop_id, { prop_id: s.prop_id, url: s.url, fuente: s.fuente }])).values()];
  const leidos = await leerLote(propsUnicas, {
    concurrency: 5,
    onProgress: (d, t) => { if (d % 5 === 0 || d === t) console.error(`  …leídos ${d}/${t}`); },
  });
  const textoPorProp = new Map(leidos.map((r) => [r.prop_id, r]));

  // Enriquecer cada sugerencia con texto + pre-clasificación.
  const enriquecidas = sugerencias.map((s) => {
    const lec = textoPorProp.get(s.prop_id) || {};
    // Mejor nombre disponible en la BD (col → llm del enrichment → enrichment crudo).
    const mejorNombre = s.pistas_nombre?.col || s.pistas_nombre?.llm || s.pistas_nombre?.enrichment || null;
    const pre = preclasificar({
      nombreEdificio: mejorNombre,
      tituloDiscovery: s.titulo,
      pmNombre: s.pm_nombre,
      score: s.score,
      distMetros: s.dist_metros,
    });
    return {
      ...s,
      anuncio_ok: !!lec.ok,
      anuncio_error: lec.ok ? null : (lec.error || 'no_leido'),
      titulo_anuncio: lec.titulo || null,
      descripcion_anuncio: lec.descripcion || null,
      moneda_c21: lec.moneda || null,
      preclasificacion: pre.nivel,
      flags: pre.flags,
    };
  });

  // Resumen para la consola (lo accionable lo arma Claude con el JSON).
  const porNivel = {};
  for (const e of enriquecidas) porNivel[e.preclasificacion] = (porNivel[e.preclasificacion] || 0) + 1;
  const inaccesibles = enriquecidas.filter((e) => !e.anuncio_ok).length;
  console.error(`[cola] pre-clasificación: ${JSON.stringify(porNivel)} | anuncios no leídos: ${inaccesibles}`);

  emit(args, {
    estado,
    total: enriquecidas.length,
    props_unicas: propsUnicas.length,
    resumen_preclasificacion: porNivel,
    anuncios_no_leidos: inaccesibles,
    sugerencias: enriquecidas,
  });
}

function emit(args, payload) {
  const out = args.out || resolve(process.cwd(), `cola-${args.macrozona}.json`);
  writeFileSync(out, JSON.stringify(payload, null, 2), 'utf-8');
  console.error(`[cola] paquete escrito en: ${out}`);
  console.log(out); // stdout = ruta (para que Claude la capture)
}

main().catch((err) => {
  console.error('[cola] ERROR:', err?.message || err);
  process.exit(1);
});
