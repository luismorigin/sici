import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'

const SHORT_LABELS: Record<string, string> = {
  'Equipetrol Centro': 'Equipetrol Centro',
  'Equipetrol Norte': 'Equipetrol Norte',
  'Equipetrol Oeste': 'Equipetrol Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'Villa Brígida',
}

function fullName(z: string): string {
  return SHORT_LABELS[z] ?? z
}

/**
 * Computa variables para las 3 tesis desde los resultados de tools.
 * No es narrativa: son hechos numéricos seleccionados por el HTML para que
 * el copy de `narrativa.md` pueda rellenar placeholders.
 */
function computeTesisVars(data: BaselineResult) {
  // Tesis 1: antigüedad por producto — 1D más rápido vs 2D/3D en zonas lentas
  const rot1D = data.rotacion.porZonaDorms.filter(r => r.dorms === 1 && r.n >= 3).sort((a, b) => a.medianaDias - b.medianaDias)
  const rot2D3D = data.rotacion.porZonaDorms.filter(r => (r.dorms === 2 || r.dorms === 3) && r.n >= 3).sort((a, b) => b.medianaDias - a.medianaDias)

  const zonasRapidas = rot1D.slice(0, 2).map(r => fullName(r.zona)).join(' y ')
  const diasMin = rot1D[0]?.medianaDias ?? 0
  const diasMax = rot1D[1]?.medianaDias ?? diasMin

  const zonasLentas = [...new Set(rot2D3D.slice(0, 2).map(r => fullName(r.zona)))].join(' y ')
  const diasLargos = Math.min(...rot2D3D.slice(0, 2).map(r => r.medianaDias))
  const diasExtremo = rot2D3D[0]?.medianaDias ?? 0

  // Tesis 2: mix entrega / preventa. Sirari excepción.
  const byEstado = data.panorama.byEstado
  const pctEntrega = byEstado.find(e => e.estado === 'entrega_inmediata')?.pctTotal ?? 0
  const pctPreventa = byEstado.find(e => e.estado === 'preventa')?.pctTotal ?? 0

  const sirari = data.demanda.mixEstadoPorZona.find(m => m.zona === 'Sirari')
  const sirariTotal = sirari ? sirari.entrega + sirari.preventa + sirari.noEsp : 0
  const sirariPctPreventa = sirariTotal > 0 && sirari ? Math.round((sirari.preventa / sirariTotal) * 100) : 0

  const otrasZonas = data.demanda.mixEstadoPorZona
    .filter(m => m.zona !== 'Sirari')
    .sort((a, b) => b.pctEntrega - a.pctEntrega)
    .slice(0, 2)
  const otrasZonasEntrega = otrasZonas
    .map(m => `${fullName(m.zona)} (${m.pctEntrega}%)`)
    .join(' y ') + ' están dominados por entrega'

  // Tesis 3: $/m² min/max entre submercados
  const zonasM2 = [...data.panorama.byZona].sort((a, b) => a.medianaM2 - b.medianaM2)
  const tesis3ZonaMin = fullName(zonasM2[0].zona)
  const tesis3M2Min = zonasM2[0].medianaM2.toLocaleString()
  const tesis3ZonaMax = fullName(zonasM2[zonasM2.length - 1].zona)
  const tesis3M2Max = zonasM2[zonasM2.length - 1].medianaM2.toLocaleString()
  const tesis3RangoPct = Math.round(((zonasM2[zonasM2.length - 1].medianaM2 - zonasM2[0].medianaM2) / zonasM2[0].medianaM2) * 100)

  return {
    tesis1_zonas_rapidas: zonasRapidas,
    tesis1_dias_min: diasMin,
    tesis1_dias_max: diasMax,
    tesis1_zonas_lentas: zonasLentas,
    tesis1_dias_largos: diasLargos,
    tesis1_dias_extremo: diasExtremo,
    tesis2_pct_entrega: Math.round(pctEntrega),
    tesis2_pct_preventa: Math.round(pctPreventa),
    tesis2_sirari_pct: sirariPctPreventa,
    tesis2_sirari_uds: sirariTotal,
    tesis2_otras_zonas_entrega: otrasZonasEntrega,
    tesis3_m2_min: tesis3M2Min,
    tesis3_zona_min: tesis3ZonaMin,
    tesis3_m2_max: tesis3M2Max,
    tesis3_zona_max: tesis3ZonaMax,
    tesis3_rango_pct: tesis3RangoPct,
  }
}

export function renderTresLecturas(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const vars = {
    zonaLabel: data.config.zonaLabel,
    zonasCount: data.panorama.totalZonas,
    ...computeTesisVars(data),
  }

  return `
<!-- 1. RESUMEN EJECUTIVO -->
<section id="s1">
  <span class="section-num">01 · Resumen ejecutivo</span>
  <h2>Tres lecturas sobre un mercado de submercados</h2>
  <p class="lead">${narrativa.render('s1.lead', vars)}</p>

  <h3>${narrativa.render('s1.tesis_1.title', vars)}</h3>
  <blockquote class="pull-quote">${narrativa.render('s1.tesis_1.quote', vars)}<span class="attrib">Tesis 01</span></blockquote>
  <p>${narrativa.render('s1.tesis_1.body', vars)}</p>

  <h3>${narrativa.render('s1.tesis_2.title', vars)}</h3>
  <blockquote class="pull-quote">${narrativa.render('s1.tesis_2.quote', vars)}<span class="attrib">Tesis 02</span></blockquote>
  <p>${narrativa.render('s1.tesis_2.body', vars)}</p>

  <h3>${narrativa.render('s1.tesis_3.title', vars)}</h3>
  <blockquote class="pull-quote">${narrativa.render('s1.tesis_3.quote', vars)}<span class="attrib">Tesis 03</span></blockquote>
  <p>${narrativa.render('s1.tesis_3.body', vars)}</p>

  <div class="caveat">
    <strong>Lo que esta edición no incluye</strong>
    ${narrativa.render('s1.caveat', vars)}
  </div>
</section>
`
}
