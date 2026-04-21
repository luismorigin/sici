import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'
import { renderSimonLogo } from '../brand.js'

export function renderCtaProducto(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const vars = {
    zonaLabel: data.config.zonaLabel,
    edicionSlug: data.config.outputFilename.replace('.html', ''),
  }

  return `
<!-- CTA producto — funnel a estudios privados -->
<aside class="cta-producto">
  <div class="cta-brand">${renderSimonLogo({ variant: 'negro', size: 44 })}</div>
  <div class="kicker">${narrativa.render('cta.kicker', vars)}</div>
  <h3>${narrativa.render('cta.title', vars)}</h3>
  <p>${narrativa.render('cta.body', vars)}</p>
  <a href="${narrativa.render('cta.button_href', vars)}" class="cta-button">${narrativa.render('cta.button', vars)} →</a>
  <span class="cta-meta">${narrativa.render('cta.meta', vars)}</span>
</aside>
`
}
