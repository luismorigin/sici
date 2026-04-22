import type { BaselineResult } from '../../types-baseline.js'
import type { NarrativaRenderer } from '../../narrativa/loader.js'
import { renderTemplate } from '../../narrativa/loader.js'

interface NoItem { titulo: string; cuerpo: string }
interface AgendaItem { edicion: string; fecha: string; incorpora: string }

export function renderLimites(data: BaselineResult, narrativa: NarrativaRenderer): string {
  const vars = { zonaLabel: data.config.zonaLabel }

  const noItemsRaw = narrativa.get('s9.no_presentamos')
  const noItems: NoItem[] = JSON.parse(noItemsRaw)
  const noItemsHTML = noItems.map(item => `    <div class="item">
      <strong>${item.titulo}</strong>
      ${renderTemplate(item.cuerpo, vars)}
    </div>`).join('\n')

  const agendaRaw = narrativa.get('s9.agenda')
  const agenda: AgendaItem[] = JSON.parse(agendaRaw)
  const agendaHTML = agenda.map(item => `    <tr><td>${item.edicion}</td><td>${item.fecha}</td><td>${item.incorpora}</td></tr>`).join('\n')

  return `
<!-- 8. LO QUE NO AFIRMA + AGENDA -->
<section id="s9">
  <span class="section-num">08 · Límites</span>
  <h2>Lo que este reporte NO afirma</h2>
  <p class="lead">${narrativa.render('s9.lead', vars)}</p>

  <div class="rojo-list">
${noItemsHTML}
  </div>

  <details class="details-table">
    <summary>Ver agenda de próximas ediciones</summary>
    <table>
      <tr><th>Edición</th><th>Fecha estimada</th><th>Incorpora</th></tr>
${agendaHTML}
    </table>
    <p class="muted">${narrativa.render('s9.agenda_nota', vars)}</p>
  </details>
</section>
`
}
