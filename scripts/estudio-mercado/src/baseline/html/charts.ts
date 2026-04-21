import type { BaselineResult } from '../types-baseline.js'

const SHORT_LABELS: Record<string, string> = {
  'Equipetrol Centro': 'Eq. Centro',
  'Equipetrol Norte': 'Eq. Norte',
  'Equipetrol Oeste': 'Eq. Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'V. Brígida',
  'Eq. 3er Anillo': 'Eq. 3er A.',
}

const short = (z: string) => SHORT_LABELS[z] ?? z

/**
 * Chart.js rendering para el único chart que queda (antigüedad del listado por
 * zona × dorms en §5). Los otros 3 charts originales fueron reemplazados por
 * SVG editorial inline: zona-tiles (§4) y dot plot (§6).
 */
export function renderChartsScript(data: BaselineResult): string {
  const zonasOrdenadas = data.panorama.byZona.map(z => z.zona)
  const labelsZonas = zonasOrdenadas.map(z => short(z))

  const rotMap = new Map<string, Map<number, number>>()
  for (const r of data.rotacion.porZonaDorms) {
    const inner = rotMap.get(r.zona) ?? new Map()
    inner.set(r.dorms, r.medianaDias)
    rotMap.set(r.zona, inner)
  }
  const dias1D = zonasOrdenadas.map(z => rotMap.get(z)?.get(1) ?? 0)
  const dias2D = zonasOrdenadas.map(z => rotMap.get(z)?.get(2) ?? 0)
  const dias3D = zonasOrdenadas.map(z => rotMap.get(z)?.get(3) ?? 0)

  return `
<script>
(function () {
  if (typeof Chart === 'undefined') return;

  const SALVIA = '#3A6A48';
  const SALVIA_LIGHT = '#7BA687';
  const SALVIA_PALE = '#C8D9CE';
  const ARENA_DARK = '#DFD8C5';
  const NEGRO = '#141414';
  const GRIS = '#8A8A8A';

  Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
  Chart.defaults.color = NEGRO;
  Chart.defaults.font.size = 12;

  // Antigüedad del listado por zona × dorms (§5)
  const el = document.getElementById('chartDias');
  if (!el) return;

  new Chart(el, {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(labelsZonas)},
      datasets: [
        { label: '1 dorm', data: ${JSON.stringify(dias1D)}, backgroundColor: SALVIA, borderWidth: 0 },
        { label: '2 dorms', data: ${JSON.stringify(dias2D)}, backgroundColor: SALVIA_LIGHT, borderWidth: 0 },
        { label: '3 dorms', data: ${JSON.stringify(dias3D)}, backgroundColor: SALVIA_PALE, borderWidth: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: NEGRO, font: { weight: 600 } } },
        y: {
          beginAtZero: true,
          grid: { color: ARENA_DARK },
          ticks: { color: GRIS, callback: (v) => v + 'd' }
        }
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } },
        tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.y + ' días' } }
      }
    }
  });
})();
</script>
`
}
