import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'
import { renderTemplate } from '../../narrativa/loader.js'
import { renderSimonLogo } from '../brand.js'

interface FichaItem { label: string; valor: string }

export function renderFicha(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const vars = {
    zonaLabel: data.config.zonaLabel,
    edicion: data.config.edicion,
    fechaCorte: data.config.fechaCorte,
    universoObservable: data.config.ficha.universoObservable,
    totalVenta: data.panorama.totalVenta,
    totalAlquiler: data.panorama.totalAlquiler,
    fuenteDatos: data.config.ficha.fuenteDatos,
    proximaEdicion: data.config.ficha.proximaEdicion,
  }

  const fichaRaw = narrativa.get('s10.ficha')
  const ficha: FichaItem[] = JSON.parse(fichaRaw)
  const fichaRows = ficha
    .map(item => `    <tr><th>${item.label}</th><td>${renderTemplate(item.valor, vars)}</td></tr>`)
    .join('\n')

  return `
<!-- FICHA EDITORIAL -->
<section id="s10">
  <span class="section-num">Ficha editorial</span>
  <h2>Ficha editorial</h2>
  <table>
${fichaRows}
  </table>

  <footer>
    <div class="footer-brand">
      ${renderSimonLogo({ variant: 'trans', size: 36 })}
      <div class="firma">${narrativa.render('footer.firma', vars)}</div>
    </div>
    <p>${narrativa.render('footer.body', vars)}</p>
    <p class="muted" style="margin-top:12px;">${narrativa.render('footer.disclaimer', vars)}</p>
  </footer>
</section>
`
}
