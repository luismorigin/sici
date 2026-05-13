import type { BaselineConfig } from '../types-baseline.js'

const config: BaselineConfig = {
  reportName: 'Equipetrol — Baseline de Inventario y Precios',
  edicion: 'Mayo 2026',
  fechaCorte: '13 de mayo de 2026',
  fechaCorteISO: '2026-05-13',
  zonasIncluidas: [
    'Equipetrol Centro',
    'Sirari',
    'Villa Brigida',
    'Equipetrol Oeste',
    'Equipetrol Norte',
  ],
  zonaLabel: 'Equipetrol',
  outputFilename: 'equipetrol-mayo-2026.html',
  narrativaFile: 'equipetrol-mayo-2026',
  ficha: {
    universoObservable: 'Departamentos publicados en Century21 y Remax con GPS dentro de Equipetrol',
    fuenteDatos: 'SICI — Sistema Inteligente de Captura Inmobiliaria',
    proximaEdicion: 'Julio 2026',
  },
}

export default config
