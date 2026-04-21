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
 * Inyecta los 4 charts de Chart.js como <script>. Toma la data directamente
 * del BaselineResult, no re-computa.
 */
export function renderChartsScript(data: BaselineResult): string {
  // Chart 1: inventario split por estado (orden = panorama byZona = inventario desc)
  const zonasOrdenadas = data.panorama.byZona.map(z => z.zona)
  const splitMap = new Map(data.rotacion.splitInventario.map(s => [s.zona, s]))
  const labelsZonas = zonasOrdenadas.map(z => short(z))
  const entregaData = zonasOrdenadas.map(z => splitMap.get(z)?.entrega ?? 0)
  const preventaData = zonasOrdenadas.map(z => splitMap.get(z)?.preventa ?? 0)
  const nuevoData = zonasOrdenadas.map(z => splitMap.get(z)?.nuevoONoEsp ?? 0)

  // Chart 2: $/m² por zona (ordenado por medianaM2 desc para visual)
  const m2Sorted = [...data.panorama.byZona].sort((a, b) => b.medianaM2 - a.medianaM2)
  const m2Labels = m2Sorted.map(z => short(z.zona))
  const m2Data = m2Sorted.map(z => z.medianaM2)
  const m2Min = Math.floor(Math.min(...m2Data) / 100) * 100 - 100

  // Chart 3: antigüedad por zona × dorms (1D, 2D, 3D)
  const rotMap = new Map<string, Map<number, number>>()
  for (const r of data.rotacion.porZonaDorms) {
    const inner = rotMap.get(r.zona) ?? new Map()
    inner.set(r.dorms, r.medianaDias)
    rotMap.set(r.zona, inner)
  }
  const dias1D = zonasOrdenadas.map(z => rotMap.get(z)?.get(1) ?? 0)
  const dias2D = zonasOrdenadas.map(z => rotMap.get(z)?.get(2) ?? 0)
  const dias3D = zonasOrdenadas.map(z => rotMap.get(z)?.get(3) ?? 0)

  // Chart 4: rango P25-P75 + mediana (solo n >= 20)
  const segments = data.precios.rangosChart

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

  const zonas = ${JSON.stringify(labelsZonas)};

  // 1. Inventario con split por estado
  new Chart(document.getElementById('chartInventario'), {
    type: 'bar',
    data: {
      labels: zonas,
      datasets: [
        { label: 'Entrega inmediata', data: ${JSON.stringify(entregaData)}, backgroundColor: SALVIA, borderWidth: 0 },
        { label: 'Preventa', data: ${JSON.stringify(preventaData)}, backgroundColor: SALVIA_LIGHT, borderWidth: 0 },
        { label: 'No especificado', data: ${JSON.stringify(nuevoData)}, backgroundColor: SALVIA_PALE, borderWidth: 0 }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: ARENA_DARK }, ticks: { color: GRIS } },
        y: { stacked: true, grid: { display: false }, ticks: { color: NEGRO, font: { weight: 600 } } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } },
        tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.x + ' unidades' } }
      }
    }
  });

  // 2. $/m² por submercado
  new Chart(document.getElementById('chartM2'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(m2Labels)},
      datasets: [{
        data: ${JSON.stringify(m2Data)},
        backgroundColor: SALVIA,
        borderWidth: 0
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: false,
          min: ${m2Min},
          grid: { color: ARENA_DARK },
          ticks: { color: GRIS, callback: (v) => '$' + v.toLocaleString() }
        },
        y: { grid: { display: false }, ticks: { color: NEGRO, font: { weight: 600 } } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => 'USD ' + ctx.parsed.x.toLocaleString() + ' / m²' } }
      }
    }
  });

  // 3. Días en mercado por zona × dorms
  new Chart(document.getElementById('chartDias'), {
    type: 'bar',
    data: {
      labels: zonas,
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

  // 4. Rango P25-P75 con mediana por segmento (solo n >= 20)
  const segmentos = ${JSON.stringify(segments)};

  new Chart(document.getElementById('chartPrecios'), {
    type: 'bar',
    data: {
      labels: segmentos.map(s => s.label),
      datasets: [
        {
          label: 'Rango P25 — P75',
          data: segmentos.map(s => [s.p25, s.p75]),
          backgroundColor: SALVIA_PALE,
          borderColor: SALVIA_LIGHT,
          borderWidth: 1,
          borderSkipped: false,
          barPercentage: 0.6
        },
        {
          label: 'Mediana',
          type: 'scatter',
          data: segmentos.map((s, i) => ({ x: s.med, y: i })),
          backgroundColor: NEGRO,
          borderColor: NEGRO,
          pointRadius: 6,
          pointStyle: 'rectRot',
          pointBorderWidth: 0
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: false,
          min: 50000,
          grid: { color: ARENA_DARK },
          ticks: { color: GRIS, callback: (v) => '$' + (v / 1000) + 'K' }
        },
        y: {
          type: 'category',
          grid: { display: false },
          ticks: { color: NEGRO, font: { weight: 600 } }
        }
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label === 'Mediana') return 'Mediana: USD ' + ctx.parsed.x.toLocaleString();
              const v = ctx.parsed;
              return 'P25–P75: USD ' + v._custom.min.toLocaleString() + ' — USD ' + v._custom.max.toLocaleString();
            }
          }
        }
      }
    }
  });
})();
</script>
`
}
