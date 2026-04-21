import type { TCBaseline } from './db-baseline.js'

// --- Config ---

export interface BaselineConfig {
  reportName: string               // "Equipetrol — Baseline de Inventario y Precios"
  edicion: string                  // "01 · Abril 2026"
  fechaCorte: string               // "20 de abril de 2026"
  fechaCorteISO: string            // "2026-04-20"
  zonasIncluidas: string[]         // nombres canónicos BD
  zonaLabel: string                // "Equipetrol" — usado en copy agregado
  outputFilename: string           // "equipetrol-baseline-abril-2026.html"
  narrativaFile: string            // nombre del archivo .md en baseline/narrativa/ (sin extensión)
  ficha: {
    universoObservable: string
    fuenteDatos: string
    proximaEdicion: string
  }
}

// --- Tool: panorama-multizona (§3 macro + §4 tabla maestra) ---

export interface PanoramaZonaStat {
  zona: string
  inventario: number
  medianaM2: number
  medianaTicket: number
  medianaDias1D: number            // antigüedad del listado, 1D
  avgArea: number
}

export interface PanoramaEstadoObra {
  estado: string                   // "entrega_inmediata", "preventa", "nuevo", "no_especificado"
  label: string                    // "Entrega inmediata"
  uds: number
  pctTotal: number
}

export interface PanoramaFuente {
  fuente: string                   // "century21", "remax"
  label: string                    // "Century21"
  uds: number
  pctTotal: number
}

export interface PanoramaMultizonaResult {
  totalVenta: number
  totalAlquiler: number
  totalZonas: number
  medianaM2Global: number
  medianaTicketGlobal: number
  byZona: PanoramaZonaStat[]       // ordenado por inventario desc
  byEstado: PanoramaEstadoObra[]
  byFuente: PanoramaFuente[]
  inventarioEstancado: number      // listings excluidos por filtro antigüedad
  inventarioEstancadoPct: number
}

// --- Tool: demanda-multizona (§5 tipología + tamaño + mix estado) ---

export interface InventarioZonaDorms {
  zona: string
  porDorms: Record<number, number> // { 0: 19, 1: 54, 2: 34, 3: 11 }
  total: number
}

export interface TamanoZonaDorms {
  zona: string
  medianaM2PorDorms: Record<number, number>  // dorms → m² mediano
}

export interface MixEstadoZona {
  zona: string
  entrega: number                  // incluye nuevo_a_estrenar (consolidado en db-baseline)
  preventa: number
  noEsp: number                    // estado_construccion null o 'no_especificado'
  pctEntrega: number
}

export interface DemandaMultizonaResult {
  inventarioPorZonaDorms: InventarioZonaDorms[]
  tamanoPorZonaDorms: TamanoZonaDorms[]
  mixEstadoPorZona: MixEstadoZona[]
  totalPorDorms: Record<number, number>
  totalGeneral: number
}

// --- Tool: precios-zona-dorms (§6 precios detallados) ---

export interface PrecioSegmento {
  zona: string
  dorms: number
  n: number
  mediana: number
  p25: number
  p75: number
  medianaM2: number
  muestraMarginal: boolean         // true si n < 20
}

export interface PreciosZonaDormsResult {
  segmentos: PrecioSegmento[]      // ordenado por zona inv desc, luego dorms asc
  rangosChart: Array<{             // solo n >= 20, para el chart P25-P75
    label: string                  // "Eq. Centro · 1D"
    p25: number
    med: number
    p75: number
  }>
}

// --- Tool: top-proyectos (§7 concentración) ---

export interface TopProyecto {
  nombreProyecto: string
  zona: string
  desarrolladora: string | null    // null si no hay proyecto_master asociado o sin desarrolladora declarada
  faseDominante: string            // "Entrega", "Preventa", "Mixto", "No esp."
  unidades: number
}

export interface DesarrolladoraConcentrada {
  desarrolladora: string
  proyectos: string[]
  unidadesTotal: number
  submercados: string[]
}

export interface TopProyectosResult {
  minUnidades: number              // umbral (5)
  top: TopProyecto[]
  concentracion: DesarrolladoraConcentrada[]
  totalTopUnidades: number
  pctTopSobreTotal: number
}

// --- Tool: rotacion-multizona (§4 chart inventario + §5 chart dias zona×dorms) ---

export interface RotacionZonaDorms {
  zona: string
  dorms: number
  n: number
  medianaDias: number
  p25Dias: number
  p75Dias: number
}

export interface InventarioSplitZona {
  zona: string
  entrega: number
  preventa: number
  nuevoONoEsp: number
}

export interface RotacionMultizonaResult {
  porZonaDorms: RotacionZonaDorms[]
  splitInventario: InventarioSplitZona[]
}

// --- Tool: alquiler-multizona (§8) ---

export interface AlquilerZonaStat {
  zona: string
  n: number
  medianaRenta: number
  avgRenta: number
  muestraMarginal: boolean
}

export interface AlquilerDormsAmoblado {
  dorms: number
  categoria: 'amoblado' | 'no_amoblado' | 'sin_declarar' | 'semi'
  label: string
  n: number
  medianaRenta: number
}

export interface AlquilerCompAmoblado {
  categoria: string
  label: string
  n: number
  pct: number
}

export interface AlquilerMultizonaResult {
  total: number
  porZona: AlquilerZonaStat[]
  porDormsAmoblado: AlquilerDormsAmoblado[]
  composicionAmoblado: AlquilerCompAmoblado[]
}

// --- Resultado final ---

export interface BaselineResult {
  config: BaselineConfig
  tc: TCBaseline
  panorama: PanoramaMultizonaResult
  demanda: DemandaMultizonaResult
  precios: PreciosZonaDormsResult
  proyectos: TopProyectosResult
  rotacion: RotacionMultizonaResult
  alquiler: AlquilerMultizonaResult
}
