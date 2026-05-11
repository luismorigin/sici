import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BUCKET_LABELS = {
  reescrita: { emoji: '🔴', label: 'Reescrita (< 70%)' },
  cambio_relevante: { emoji: '🟡', label: 'Cambio relevante (70-90%)' },
  cambio_menor: { emoji: '🟢', label: 'Cambio menor (90-99%)' },
  identicas: { emoji: '⚪', label: 'Idénticas (≥ 99%)' },
};

export async function generarReporte(resultados, runDir) {
  await mkdir(runDir, { recursive: true });
  await mkdir(join(runDir, 'raw'), { recursive: true });

  await writeFile(
    join(runDir, 'results.json'),
    JSON.stringify(resultados, null, 2),
    'utf8'
  );

  for (const r of resultados) {
    if (!r.scrape_status || r.scrape_status === 'ok') {
      await writeFile(
        join(runDir, 'raw', `${r.id}-${r.fuente}.json`),
        JSON.stringify(
          {
            id: r.id,
            fuente: r.fuente,
            url: r.url,
            title_scraped: r.title_scraped || '',
            descripcion_bd: r.descripcion_bd,
            descripcion_scraped: r.descripcion_scraped,
            similitud_pct: r.similitud_pct,
            flags_semanticos: r.flags_semanticos,
          },
          null,
          2
        ),
        'utf8'
      );
    }
  }

  const md = renderSummary(resultados, runDir);
  await writeFile(join(runDir, 'summary.md'), md, 'utf8');
}

function renderSummary(resultados, runDir) {
  const ok = resultados.filter((r) => r.scrape_status === 'ok');
  const fallaron = resultados.filter((r) => r.scrape_status !== 'ok');
  const sinCruda = ok.filter((r) => r.len_bd === 0);

  const buckets = {
    reescrita: [],
    cambio_relevante: [],
    cambio_menor: [],
    identicas: [],
  };
  for (const r of ok) buckets[r.bucket].push(r);

  const conFlags = ok.filter((r) => r.tiene_flag_semantico);

  const lines = [];
  lines.push(`# Auditoría de descripciones alquiler — ${runDir.split(/[\\/]/).pop()}`);
  lines.push('');
  lines.push(`**Total props procesadas:** ${resultados.length}`);
  lines.push(`**Scraped OK:** ${ok.length} · **Fallaron:** ${fallaron.length} · **Sin cruda en BD:** ${sinCruda.length}`);
  lines.push('');
  if (sinCruda.length > 0) {
    lines.push(`> ⚠️ ${sinCruda.length} props sin cruda en BD — correr backfill (\`npm run backfill\`) o esperar pipeline natural.`);
    lines.push('');
  }
  lines.push('## Distribución por bucket de similitud');
  lines.push('');
  lines.push('| Bucket | Cantidad | % del OK |');
  lines.push('|---|---:|---:|');
  for (const [k, info] of Object.entries(BUCKET_LABELS)) {
    const n = buckets[k].length;
    const pct = ok.length ? ((n / ok.length) * 100).toFixed(1) : '0.0';
    lines.push(`| ${info.emoji} ${info.label} | ${n} | ${pct}% |`);
  }
  lines.push('');

  if (conFlags.length > 0) {
    lines.push('## 🚨 Cambios semánticos detectados');
    lines.push('');
    lines.push(
      '_Lista de props donde aparecieron/desaparecieron palabras críticas (amoblado / expensas / mascotas / precio)._'
    );
    lines.push('');
    lines.push('| ID | Fuente | Sim % | Flags | URL |');
    lines.push('|---:|---|---:|---|---|');
    for (const r of conFlags.sort((a, b) => a.similitud_pct - b.similitud_pct)) {
      const flags = Object.keys(r.flags_semanticos).join(', ');
      lines.push(`| ${r.id} | ${r.fuente} | ${r.similitud_pct} | ${flags} | ${shortUrl(r.url)} |`);
    }
    lines.push('');
  }

  for (const k of ['reescrita', 'cambio_relevante', 'cambio_menor']) {
    const arr = buckets[k];
    if (arr.length === 0) continue;
    const info = BUCKET_LABELS[k];
    lines.push(`## ${info.emoji} ${info.label}`);
    lines.push('');
    lines.push('| ID | Fuente | Sim % | Días mercado | Len BD → Scraped | Palabras + / - |');
    lines.push('|---:|---|---:|---:|---|---:|');
    for (const r of arr.sort((a, b) => a.similitud_pct - b.similitud_pct)) {
      lines.push(
        `| ${r.id} | ${r.fuente} | ${r.similitud_pct} | ${r.dias_en_mercado ?? '-'} | ${r.len_bd} → ${r.len_scraped} | +${r.palabras_agregadas.length} / -${r.palabras_quitadas.length} |`
      );
    }
    lines.push('');
  }

  if (fallaron.length > 0) {
    lines.push('## ❌ Scrape fallidos');
    lines.push('');
    lines.push('| ID | Fuente | URL | Error |');
    lines.push('|---:|---|---|---|');
    for (const r of fallaron) {
      lines.push(`| ${r.id} | ${r.fuente} | ${shortUrl(r.url)} | ${r.error || '-'} |`);
    }
    lines.push('');
  }

  const top = [...ok]
    .filter((r) => r.bucket !== 'identicas' && r.len_bd > 0)
    .sort((a, b) => a.similitud_pct - b.similitud_pct)
    .slice(0, 10);
  if (top.length > 0) {
    lines.push('## Top 10 con más cambio — side-by-side');
    lines.push('');
    for (const r of top) {
      lines.push(`### #${r.id} · ${r.fuente} · ${r.similitud_pct}% similitud`);
      lines.push('');
      lines.push(`**URL:** ${r.url}`);
      if (r.tiene_flag_semantico) {
        lines.push(`**Flags:** ${Object.keys(r.flags_semanticos).join(', ')}`);
      }
      lines.push('');
      lines.push('**BD:**');
      lines.push('```');
      lines.push(truncate(r.descripcion_bd, 800));
      lines.push('```');
      lines.push('');
      lines.push('**Scraped (ahora):**');
      lines.push('```');
      lines.push(truncate(r.descripcion_scraped, 800));
      lines.push('```');
      lines.push('');
      if (r.palabras_agregadas.length || r.palabras_quitadas.length) {
        lines.push(
          `**Diff palabras:** + [${r.palabras_agregadas.slice(0, 15).join(', ')}] · − [${r.palabras_quitadas.slice(0, 15).join(', ')}]`
        );
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function shortUrl(u) {
  if (!u) return '-';
  return u.length > 70 ? u.slice(0, 67) + '...' : u;
}

function truncate(s, n) {
  if (!s) return '(vacío)';
  return s.length > n ? s.slice(0, n) + '...[truncado]' : s;
}
