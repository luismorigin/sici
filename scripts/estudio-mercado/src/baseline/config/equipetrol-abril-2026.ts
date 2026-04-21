import type { BaselineConfig } from '../types-baseline.js'

const config: BaselineConfig = {
  reportName: 'Equipetrol — Baseline de Inventario y Precios',
  edicion: '01 · Abril 2026',
  fechaCorte: '20 de abril de 2026',
  fechaCorteISO: '2026-04-20',
  zonasIncluidas: [
    'Equipetrol Centro',
    'Sirari',
    'Villa Brigida',
    'Equipetrol Oeste',
    'Equipetrol Norte',
  ],
  zonaLabel: 'Equipetrol',
  outputFilename: 'equipetrol-baseline-abril-2026.html',
  narrativaFile: 'equipetrol',
  ficha: {
    universoObservable: 'Departamentos publicados en Century21 y Remax con GPS dentro de Equipetrol',
    fuenteDatos: 'SICI — Sistema Inteligente de Captura Inmobiliaria',
    proximaEdicion: 'Julio 2026',
  },
}

export default config
