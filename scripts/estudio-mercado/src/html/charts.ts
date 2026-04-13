import type { ZonaStat, CompetidorInfo, DemandaTipologiaItem } from '../types.js'

// Simon brand tokens
const CARAMELO = '#3A6A48'      // s-salvia
const CARAMELO_DARK = '#3A6A48' // s-salvia
const ARENA = '#D8D0BC'         // s-arenaMid
const PIEDRA = '#3A3530'        // s-tinta
const CARBON = '#141414'        // s-negro

// Nombres cortos para charts (evita corte en eje Y)
const ZONA_SHORT: Record<string, string> = {
  'Equipetrol Centro': 'Eq. Centro',
  'Equipetrol Norte': 'Eq. Norte',
  'Equipetrol Oeste': 'Eq. Oeste',
  'Villa Brigida': 'V. Brigida',
  'Eq. 3er Anillo': 'Eq. 3er Anillo',
}

function shortZona(zona: string): string {
  return ZONA_SHORT[zona] ?? zona
}

export function barChartZonas(data: ZonaStat[], canvasId: string, medianaGlobal?: number): string {
  const labels = data.map(z => shortZona(z.zona))
  const values = data.map(z => z.medianaM2)

  return `
<script>
(function() {
  const ctx = document.getElementById('${canvasId}');
  if (!ctx) return;
  const medianLine = ${medianaGlobal ? medianaGlobal : 0};
  const medianPlugin = {
    id: 'medianLine',
    afterDraw: function(chart) {
      if (!medianLine) return;
      const xScale = chart.scales.x;
      const ctx2 = chart.ctx;
      const x = xScale.getPixelForValue(medianLine);
      ctx2.save();
      ctx2.beginPath();
      ctx2.setLineDash([6, 4]);
      ctx2.strokeStyle = '${CARAMELO_DARK}';
      ctx2.lineWidth = 2;
      ctx2.moveTo(x, chart.chartArea.top);
      ctx2.lineTo(x, chart.chartArea.bottom);
      ctx2.stroke();
      ctx2.setLineDash([]);
      ctx2.fillStyle = '${CARAMELO_DARK}';
      ctx2.font = "500 12px 'DM Sans'";
      ctx2.textAlign = 'center';
      ctx2.fillText('Mediana $' + medianLine.toLocaleString(), x, chart.chartArea.top - 8);
      ctx2.restore();
    }
  };
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(labels)},
      datasets: [{
        data: ${JSON.stringify(values)},
        backgroundColor: ${JSON.stringify(data.map((_, i) => i === 0 ? CARAMELO : ARENA))},
        borderWidth: 0,
        barThickness: 32
      }]
    },
    plugins: [medianPlugin],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { callback: v => '$' + v.toLocaleString(), color: '${PIEDRA}', font: { family: 'DM Sans', size: 12 } },
          grid: { color: '${ARENA}' }
        },
        y: {
          afterFit: function(axis) { axis.width = 120; },
          ticks: { color: '${CARBON}', font: { family: 'DM Sans', size: 13, weight: 500 } },
          grid: { display: false }
        }
      }
    }
  });
})();
</script>`
}

export function barChartDorms(data: DemandaTipologiaItem[], canvasId: string, highlightDorms?: number[]): string {
  const labels = data.map(d => d.dorms === 0 ? 'Mono' : d.dorms + 'D')
  const values = data.map(d => d.uds)
  const colors = data.map(d => (highlightDorms ?? []).includes(d.dorms) ? CARAMELO : ARENA)

  return `
<script>
(function() {
  const ctx = document.getElementById('${canvasId}');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(labels)},
      datasets: [{
        data: ${JSON.stringify(values)},
        backgroundColor: ${JSON.stringify(colors)},
        borderWidth: 0,
        barThickness: 48
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: '${CARBON}', font: { family: 'DM Sans', size: 13, weight: 500 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: '${PIEDRA}', font: { family: 'DM Sans', size: 12 } },
          grid: { color: '${ARENA}' }
        }
      }
    }
  });
})();
</script>`
}

export function scatterCompetidores(data: CompetidorInfo[], projectName: string, canvasId: string): string {
  const points = data.map(c => ({
    x: c.medianaDias,
    y: c.medianaM2,
    label: c.proyecto,
    uds: c.uds,
    r: Math.max(6, Math.min(20, c.uds * 3)),
    isProject: c.proyecto === projectName,
  }))

  return `
<script>
(function() {
  const ctx = document.getElementById('${canvasId}');
  if (!ctx) return;
  const points = ${JSON.stringify(points)};
  new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: [{
        data: points.map(p => ({ x: p.x, y: p.y, r: p.r })),
        backgroundColor: points.map(p => p.isProject ? '${CARAMELO}' : '${ARENA}'),
        borderColor: points.map(p => p.isProject ? '${CARAMELO_DARK}' : '${PIEDRA}'),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const p = points[ctx.dataIndex];
              return [p.label, p.uds + ' unidades', '$' + p.y.toLocaleString() + '/m\\u00B2', p.x + ' dias med.'];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Dias en mercado (mediana)', color: '${PIEDRA}', font: { family: 'DM Sans', size: 12 } },
          ticks: { color: '${PIEDRA}', font: { family: 'DM Sans', size: 11 } },
          grid: { color: '${ARENA}' }
        },
        y: {
          title: { display: true, text: '$/m\\u00B2', color: '${PIEDRA}', font: { family: 'DM Sans', size: 12 } },
          ticks: { callback: v => '$' + v.toLocaleString(), color: '${PIEDRA}', font: { family: 'DM Sans', size: 11 } },
          grid: { color: '${ARENA}' }
        }
      }
    }
  });
})();
</script>`
}
