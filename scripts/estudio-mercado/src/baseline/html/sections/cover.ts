import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'
import { renderSimonLogo } from '../brand.js'

export function renderCover(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const vars = {
    zonaLabel: data.config.zonaLabel,
    zonasCount: data.panorama.totalZonas,
    fechaCorte: data.config.fechaCorte,
    edicion: data.config.edicion,
    totalVenta: data.panorama.totalVenta,
    totalAlquiler: data.panorama.totalAlquiler,
  }

  return `
<!-- COVER -->
<section class="cover" style="border-top:none;padding-top:24px;">
  <div class="top">
    <div class="cover-brand">${renderSimonLogo({ variant: 'trans', size: 40 })}</div>
    <div class="kicker">${narrativa.render('hero.eyebrow', vars)}</div>
    <h1>${narrativa.render('hero.title', vars)}</h1>
    <p class="subtitle">${narrativa.render('hero.subtitle', vars)}</p>
  </div>
  <div class="foot">
    <span>${narrativa.render('hero.foot', vars)}</span>
    <span>${narrativa.render('hero.foot_right', vars)}</span>
  </div>
</section>
`
}
